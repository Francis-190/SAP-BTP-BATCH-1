const cds = require('@sap/cds');
const C = require('./lib/common');

module.exports = class OrderService extends cds.ApplicationService {
  async init() {
    const { SalesOrder, SalesOrderItem, Quote, Opportunity, ServiceTicket, ServiceOrder, Invoice, Product } = C.E();
    const { SalesOrders, SalesOrderItems, ServiceOrders } = this.entities;

    const loadOrder = async req => {
      const o = await SELECT.one.from(SalesOrder).where({ ID: C.getId(req) });
      if (!o) req.reject(404, 'Sales order not found');
      return o;
    };
    const loadSvc = async req => {
      const s = await SELECT.one.from(ServiceOrder).where({ ID: C.getId(req) });
      if (!s) req.reject(404, 'Service order not found');
      return s;
    };

    // =====================================================
    //  SALES ORDER
    // =====================================================
    // (normally created by SalesService quote.accept; direct creation is validated too)
    this.before('CREATE', SalesOrders, async req => {
      const d = req.data;
      d.ID ??= cds.utils.uuid();
      const q = await SELECT.one.from(Quote).where({ ID: d.quote_ID });
      if (!q) req.reject(404, 'Quote not found');
      if (q.status !== 'Accepted') req.reject(409, 'Only an Accepted quote can become a Sales Order');
      if (await SELECT.one.from(SalesOrder).where({ quote_ID: q.ID })) req.reject(409, 'Sales order already exists for this quote');
      const opp    = await SELECT.one.from(Opportunity).where({ ID: q.opportunity_ID });
      const ticket = await SELECT.one.from(ServiceTicket).where({ ID: opp.ticket_ID });
      d.customer_ID = ticket.customer_ID;                 // always derived, never trusted from client
      d.orderNo = await C.nextNo('SO', SalesOrder);
      d.status  = 'Created';
    });
          this.after('CREATE', SalesOrders, async (data, req) => {
      const row = { ...req.data, ...data };
      if (!(await SELECT.one.from(SalesOrderItem).where({ salesOrder_ID: row.ID })))
        await C.copyQuoteItems(row.ID, row.quote_ID);
    });

    this.before('UPDATE', SalesOrders, req => {
      const locked = ['orderNo', 'quote_ID', 'customer_ID', 'status'].filter(f => f in req.data);
      if (locked.length) req.reject(400, `${locked.join(', ')} cannot be changed directly. Use the actions.`);
    });

    this.on('confirm', SalesOrders, async req => {
      const o = await loadOrder(req);
      C.assertStatus(req, o.status, ['Created'], 'Sales order');
      if (!(await SELECT.one.from(SalesOrderItem).where({ salesOrder_ID: o.ID }))) req.reject(400, 'Sales order has no items');
      await UPDATE(SalesOrder).set({ status: 'Confirmed' }).where({ ID: o.ID });
    });

    this.on('startFulfil', SalesOrders, async req => {
      const o = await loadOrder(req);
      C.assertStatus(req, o.status, ['Confirmed'], 'Sales order');
      await UPDATE(SalesOrder).set({ status: 'In Fulfilment' }).where({ ID: o.ID });
    });

    this.on('markDelivered', SalesOrders, async req => {
      const o = await loadOrder(req);
      C.assertStatus(req, o.status, ['In Fulfilment'], 'Sales order');
      const date = req.data.deliveryDate;
      if (!date)             req.reject(400, 'Delivery date is required');
      if (date > C.today())  req.reject(400, 'Delivery date cannot be in the future');
      await UPDATE(SalesOrder).set({ status: 'Delivered', deliveryDate: date }).where({ ID: o.ID });
    });

    this.on('cancel', SalesOrders, async req => {
      const o = await loadOrder(req);
      C.assertStatus(req, o.status, ['Created', 'Confirmed', 'In Fulfilment'], 'Sales order');
      await UPDATE(SalesOrder).set({ status: 'Cancelled' }).where({ ID: o.ID });
    });

    this.on('createInvoice', SalesOrders, async req => {
      const o = await loadOrder(req);
      C.assertStatus(req, o.status, ['Delivered'], 'Sales order');
      const days = req.data.dueInDays ?? 30;
      if (!(days > 0)) req.reject(400, 'dueInDays must be greater than 0');
      if (await SELECT.one.from(Invoice).where({ salesOrder_ID: o.ID, status: { '!=': 'Cancelled' } }))
        req.reject(409, 'An active invoice already exists for this order');
      const total = await C.orderTotal(o.ID);
      if (!(total > 0)) req.reject(400, 'Order total is 0, nothing to invoice');

      const ID = cds.utils.uuid();
      await INSERT.into(Invoice).entries({
        ID, invoiceNo: await C.nextNo('INV', Invoice), customer_ID: o.customer_ID, salesOrder_ID: o.ID,
        invoiceDate: C.today(), dueDate: C.addDays(C.today(), days), netAmount: total, status: 'Open'
      });
      await UPDATE(SalesOrder).set({ status: 'Invoiced' }).where({ ID: o.ID });
      return { invoiceID: ID };
    });

    // ---------- order items: editable only while order is Created ----------
    const orderIdOfItem = async id => (await SELECT.one.from(SalesOrderItem).columns('salesOrder_ID').where({ ID: id }))?.salesOrder_ID;
    const assertOrderCreated = async (req, orderID) => {
      const o = await SELECT.one.from(SalesOrder).where({ ID: orderID });
      if (!o) req.reject(404, 'Sales order not found');
      if (o.status !== 'Created') req.reject(409, `Items can be changed only while the order is Created (now '${o.status}')`);
    };
    this.before(['CREATE', 'UPDATE'], SalesOrderItems, async req => {
      const d = req.data;
      if ('quantity' in d && !(Number(d.quantity) > 0)) req.reject(400, 'Quantity must be greater than 0');
      if ('unitPrice' in d && Number(d.unitPrice) < 0)  req.reject(400, 'Unit price cannot be negative');
      if (d.product_ID && !(await SELECT.one.from(Product).where({ ID: d.product_ID, isActive: true })))
        req.reject(400, 'Product not found or inactive');
      await assertOrderCreated(req, d.salesOrder_ID || await orderIdOfItem(d.ID));
    });
    this.before('DELETE', SalesOrderItems, async req =>
      assertOrderCreated(req, await orderIdOfItem(req.data.ID)));

    // =====================================================
    //  SERVICE ORDER
    // =====================================================
    this.before('CREATE', ServiceOrders, async req => {
      const d = req.data;
      const ticket = await SELECT.one.from(ServiceTicket).where({ ID: d.ticket_ID });
      if (!ticket) req.reject(404, 'Ticket not found');
      if (ticket.status === 'Closed') req.reject(409, 'Ticket is Closed');

      if (d.type === 'Warranty Repair') {
        const w = await C.warrantyInfo(ticket.ID);
        if (w.error) req.reject(400, w.error);
        if (!w.underWarranty) req.reject(409, `Product is not under warranty (ended ${w.warrantyEndDate}). Use Paid Support.`);
      } else {
        if (!d.salesOrder_ID) req.reject(400, `${d.type} needs a sales order`);
        const so = await SELECT.one.from(SalesOrder).where({ ID: d.salesOrder_ID });
        if (!so) req.reject(404, 'Sales order not found');
        if (so.customer_ID !== ticket.customer_ID) req.reject(400, 'Sales order belongs to a different customer');
        if (so.status === 'Cancelled') req.reject(409, 'Sales order is Cancelled');
      }
      d.serviceOrderNo = await C.nextNo('SVC', ServiceOrder);
      d.status = 'Planned';
    });

    this.before('UPDATE', ServiceOrders, req => {
      const locked = ['serviceOrderNo', 'status', 'ticket_ID'].filter(f => f in req.data);
      if (locked.length) req.reject(400, `${locked.join(', ')} cannot be changed directly. Use the actions.`);
    });

    this.on('start', ServiceOrders, async req => {
      const s = await loadSvc(req);
      C.assertStatus(req, s.status, ['Planned'], 'Service order');
      await UPDATE(ServiceOrder).set({ status: 'In Progress' }).where({ ID: s.ID });
    });
    this.on('complete', ServiceOrders, async req => {
      const s = await loadSvc(req);
      C.assertStatus(req, s.status, ['In Progress'], 'Service order');
      await UPDATE(ServiceOrder).set({ status: 'Completed' }).where({ ID: s.ID });
    });
    this.on('cancel', ServiceOrders, async req => {
      const s = await loadSvc(req);
      C.assertStatus(req, s.status, ['Planned', 'In Progress'], 'Service order');
      await UPDATE(ServiceOrder).set({ status: 'Cancelled' }).where({ ID: s.ID });
    });

    return super.init();
  }
};