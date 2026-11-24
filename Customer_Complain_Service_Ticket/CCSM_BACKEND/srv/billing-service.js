const cds = require('@sap/cds');
const C = require('./lib/common');
const { publishAlert } = require('./lib/alert-notification');

module.exports = class BillingService extends cds.ApplicationService {
  async init() {
    const { Invoice, Payment, SalesOrder } = C.E();
    const { Invoices, Payments } = this.entities;

    // =====================================================
    //  INVOICE
    // =====================================================
    this.before('CREATE', Invoices, req =>
      req.reject(405, 'Invoices are created from a delivered sales order: OrderService → createInvoice'));

    this.before('UPDATE', Invoices, async req => {
      const locked = ['invoiceNo', 'customer_ID', 'salesOrder_ID', 'netAmount', 'status', 'invoiceDate'].filter(f => f in req.data);
      if (locked.length) req.reject(400, `${locked.join(', ')} cannot be changed`);
      const inv = await SELECT.one.from(Invoice).where({ ID: req.data.ID });
      if (inv.status !== 'Open') req.reject(409, 'Only Open invoices can be edited');
      if (req.data.dueDate && req.data.dueDate < inv.invoiceDate) req.reject(400, 'Due date cannot be before invoice date');
    });
    this.before('DELETE', Invoices, req => req.reject(405, 'Invoices cannot be deleted. Cancel them instead.'));

    this.on('cancel', Invoices, async req => {
      const inv = await SELECT.one.from(Invoice).where({ ID: C.getId(req) });
      if (!inv) req.reject(404, 'Invoice not found');
      C.assertStatus(req, inv.status, ['Open', 'Overdue'], 'Invoice');
      if ((await C.sumPayments(inv.ID)) > 0) req.reject(409, 'Invoice already has payments and cannot be cancelled');
      await UPDATE(Invoice).set({ status: 'Cancelled' }).where({ ID: inv.ID });
      // order goes back to Delivered so it can be invoiced again
      await UPDATE(SalesOrder).set({ status: 'Delivered' }).where({ ID: inv.salesOrder_ID, status: 'Invoiced' });
    });


this.on('checkOverdueInvoices', async (req) => {

    const { Invoices, Payments } = this.entities;

    // Current date in India
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());

    // Fetch all invoices
    const invoices = await SELECT.from(Invoices);

    // Fetch payment records
    const payments = await SELECT.from(Payments)
        .columns('invoice_ID', 'amount');

    // Calculate total payment against each invoice
    const paidAmounts = {};

    for (const payment of payments) {
        const invoiceID = payment.invoice_ID;

        paidAmounts[invoiceID] =
            (paidAmounts[invoiceID] || 0) +
            Number(payment.amount || 0);
    }

    let overdueCount = 0;
    let alertCount = 0;

    for (const invoice of invoices) {

        // Ignore cancelled invoices
        if (invoice.status === 'Cancelled') {
            continue;
        }

        // Ignore invoices without due date or amount
        if (!invoice.dueDate || invoice.netAmount == null) {
            continue;
        }

        const totalPaid = paidAmounts[invoice.ID] || 0;

        const outstanding =
            Number(invoice.netAmount) - totalPaid;

        // Fully paid invoices should not become overdue
        if (outstanding <= 0) {

            if (invoice.status !== 'Paid') {
                await UPDATE(Invoices)
                    .set({ status: 'Paid' })
                    .where({ ID: invoice.ID });
            }

            continue;
        }

        // Check whether invoice is overdue
        if (
            invoice.dueDate < today &&
            invoice.status !== 'Overdue'
        ) {

            // Update invoice status
            await UPDATE(Invoices)
                .set({ status: 'Overdue' })
                .where({ ID: invoice.ID });

            overdueCount++;

            // Send Alert Notification
            try {

                await publishAlert({
                    eventType: 'COMPLAINT_INVOICE_OVERDUE',

                    subject:
                        `Invoice ${invoice.invoiceNo} is overdue`,

                    body:
                        `OVERDUE INVOICE ALERT

Invoice Number: ${invoice.invoiceNo}
Invoice ID: ${invoice.ID}
Customer ID: ${invoice.customer_ID}

Invoice Amount: ${invoice.netAmount}
Total Paid: ${totalPaid}
Outstanding Amount: ${outstanding}

Due Date: ${invoice.dueDate}

Please take necessary action.`,

                    tags: {
                        invoiceNo: invoice.invoiceNo,
                        invoiceID: invoice.ID,
                        customerID: invoice.customer_ID,
                        invoiceAmount: String(invoice.netAmount),
                        totalPaid: String(totalPaid),
                        outstandingAmount: String(outstanding),
                        dueDate: String(invoice.dueDate)
                    }
                });

                alertCount++;

                console.log(
                    `Alert sent for overdue invoice: ${invoice.invoiceNo}`
                );

            } catch (error) {

                console.error(
                    `Failed to send alert for invoice ${invoice.invoiceNo}:`,
                    error.message
                );

            }
        }
    }

    console.log(
        `Overdue invoice monitoring completed.
        ${overdueCount} invoices updated.
        ${alertCount} alerts sent.`
    );

    return `Job completed successfully.
    ${overdueCount} overdue invoices updated.
    ${alertCount} alerts sent.`;

});

    // =====================================================
    //  PAYMENT
    // =====================================================
    this.before('CREATE', Payments, async req => {
      const d = req.data;
      d.ID ??= cds.utils.uuid();
      const inv = await SELECT.one.from(Invoice).where({ ID: d.invoice_ID });
      if (!inv) req.reject(404, 'Invoice not found');
      C.assertStatus(req, inv.status, ['Open', 'Partially Paid', 'Overdue'], 'Invoice');

      if (!(Number(d.amount) > 0)) req.reject(400, 'Amount must be greater than 0');
      const outstanding = C.round2(Number(inv.netAmount) - await C.sumPayments(inv.ID));
      if (C.round2(d.amount) > outstanding) req.reject(400, `Amount exceeds the outstanding balance (${outstanding})`);

      d.paymentDate ??= C.today();
      if (d.paymentDate > C.today()) req.reject(400, 'Payment date cannot be in the future');
      d.paymentNo = await C.nextNo('PAY', Payment);
    });

    // update invoice status after every payment
        this.after('CREATE', Payments, async (data, req) => {
      const row  = { ...req.data, ...data };
      const inv  = await SELECT.one.from(Invoice).where({ ID: row.invoice_ID });
      const paid = await C.sumPayments(inv.ID);
      const fully = paid >= C.round2(inv.netAmount);
      await UPDATE(Invoice).set({ status: fully ? 'Paid' : 'Partially Paid' }).where({ ID: inv.ID });
      if (fully)
        await UPDATE(SalesOrder).set({ status: 'Closed' }).where({ ID: inv.salesOrder_ID, status: 'Invoiced' });
    });

    this.before(['UPDATE', 'DELETE'], Payments, req =>
      req.reject(405, 'Payments cannot be changed or deleted. Record a correction instead.'));

    return super.init();
  }
};