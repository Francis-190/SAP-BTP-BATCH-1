const cds = require('@sap/cds');

cds.on('served', () => {
  const { SLAClock, Quote, Invoice } = cds.entities('complaint.mgmt');

  async function runJobs() {
    try {
      const now   = new Date().toISOString();
      const today = now.slice(0, 10);

      // running SLA clocks past their deadline → Breached
      await UPDATE(SLAClock).set({ status: 'Breached' })
        .where({ status: 'Running', stoppedAt: null, dueAt: { '<': now } });

      // quotes past validUntil → Expired
      await UPDATE(Quote).set({ status: 'Expired' })
        .where({ status: { in: ['Draft', 'Pending Approval', 'Approved', 'Sent'] }, validUntil: { '<': today } });

      // unpaid invoices past dueDate → Overdue
      await UPDATE(Invoice).set({ status: 'Overdue' })
        .where({ status: { in: ['Open', 'Partially Paid'] }, dueDate: { '<': today } });
    } catch (e) {
      console.error('[scheduled job] failed:', e.message);
    }
  }

//   setInterval(() => cds.tx(runJobs), 10 * 1000);   // every 10 seconds (test only)
    setInterval(() => cds.tx(runJobs), 5 * 60 * 1000);   // every 5 minutes
});