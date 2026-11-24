const cds = require('@sap/cds');
const C = require('./lib/common');

module.exports = class SalesService extends cds.ApplicationService {
  async init() {
    const { Opportunity, Quote, QuoteItem, ServiceTicket, ServiceAgent, Product,
            SalesOrder, Interaction } = C.E();
    const { Opportunities, Quotes, QuoteItems } = this.entities;

    const ACTIVE_QUOTE = ['Draft', 'Pending Approval', 'Approved', 'Sent'];
    const OPEN_STAGES  = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation'];

    // ---------- helpers ----------
    const loadOpp = async req => {
      const o = await SELECT.one.from(Opportunity).where({ ID: C.getId(req) });
      if (!o) req.reject(404, 'Opportunity not found');
      return o;
    };
    const loadQuote = async req => {
      const q = await SELECT.one.from(Quote).where({ ID: C.getId(req) });
      if (!q) req.reject(404, 'Quote not found');
      return q;
    };
    const activeQuote = oppID => SELECT.one.from(Quote).where({ opportunity_ID: oppID, status: { in: ACTIVE_QUOTE } });

    // =====================================================
    //  OPPORTUNITY
    // =====================================================
    this.before('CREATE', Opportunities, async req => {
      const d = req.data;
      if (!(await SELECT.one.from(ServiceTicket).where({ ID: d.ticket_ID }))) req.reject(404, 'Ticket not found');
      if (await C.hasOpenOpportunity(d.ticket_ID)) req.reject(409, 'This ticket already has an open opportunity');
      if (d.owner_ID) {
        const a = await SELECT.one.from(ServiceAgent).where({ ID: d.owner_ID });
        if (!a || !a.isActive)         req.reject(400, 'Owner not found or inactive');
        if (a.department !== 'Sales')  req.reject(400, 'Owner must be a Sales user');
      }
      if (d.expectedValue != null && d.expectedValue < 0) req.reject(400, 'Expected value cannot be negative');
      d.oppNo = await C.nextNo('OPP', Opportunity);
      d.stage = 'Prospecting';
    });

    this.before('UPDATE', Opportunities, async req => {
      const locked = ['oppNo', 'stage', 'ticket_ID'].filter(f => f in req.data);
      if (locked.length) req.reject(400, `${locked.join(', ')} cannot be changed directly. Use the actions.`);
      const o = await SELECT.one.from(Opportunity).where({ ID: req.data.ID });
      if (!OPEN_STAGES.includes(o.stage)) req.reject(409, `A ${o.stage} opportunity cannot be edited`);
      if (req.data.expectedValue != null && req.data.expectedValue < 0) req.reject(400, 'Expected value cannot be negative');
    });

    this.on('qualify', Opportunities, async req => {
      const o = await loadOpp(req);
      C.assertStatus(req, o.stage, ['Prospecting'], 'Opportunity');
      await UPDATE(Opportunity).set({ stage: 'Qualification' }).where({ ID: o.ID });
    });

    this.on('markLost', Opportunities, async req => {
      const o = await loadOpp(req);
      C.assertStatus(req, o.stage, OPEN_STAGES, 'Opportunity');
      const reason = req.data.reason?.trim();
      if (!reason) req.reject(400, 'Reason is required');
      await UPDATE(Opportunity).set({ stage: 'Closed Lost' }).where({ ID: o.ID });
      await UPDATE(Quote).set({ status: 'Rejected' }).where({ opportunity_ID: o.ID, status: { in: ACTIVE_QUOTE } });
      // reason is kept as a note on the ticket
      await INSERT.into(Interaction).entries({
        ticket_ID: o.ticket_ID, type: 'Note', message: `Opportunity ${o.oppNo} lost: ${reason}`, contactedAt: C.now()
      });
    });

    // =====================================================
    //  QUOTE
    // =====================================================
    this.before('CREATE', Quotes, async req => {
      const d = req.data;
      d.ID ??= cds.utils.uuid();
      const opp = await SELECT.one.from(Opportunity).where({ ID: d.opportunity_ID });
      if (!opp) req.reject(404, 'Opportunity not found');
      if (!OPEN_STAGES.includes(opp.stage)) req.reject(409, `Opportunity is ${opp.stage}`);
      if (await activeQuote(opp.ID)) req.reject(409, 'This opportunity already has an active quote');
      d.validUntil ??= C.addDays(C.today(), 30);
      if (d.validUntil < C.today()) req.reject(400, 'validUntil cannot be in the past');
      for (const i of d.items || []) {
        if (!(Number(i.quantity) > 0))   req.reject(400, 'Item quantity must be greater than 0');
        if (Number(i.unitPrice) < 0)     req.reject(400, 'Item unit price cannot be negative');
      }
      d.quoteNo = await C.nextNo('Q', Quote);
      d.version = 1;
      d.status  = 'Draft';
    });

         this.after('CREATE', Quotes, async (data, req) => {
      const row = { ...req.data, ...data };
      await C.recalcQuote(row.ID);   // covers items sent together with the quote
      await UPDATE(Opportunity).set({ stage: 'Proposal' })
        .where({ ID: row.opportunity_ID, stage: { in: ['Prospecting', 'Qualification'] } });
    });

    this.before('UPDATE', Quotes, async req => {
      const locked = ['quoteNo', 'version', 'status', 'netAmount', 'opportunity_ID'].filter(f => f in req.data);
      if (locked.length) req.reject(400, `${locked.join(', ')} cannot be changed directly. Use the actions.`);
      const q = await SELECT.one.from(Quote).where({ ID: req.data.ID });
      if (q.status !== 'Draft') req.reject(409, 'Only Draft quotes can be edited');
      if (req.data.validUntil && req.data.validUntil < C.today()) req.reject(400, 'validUntil cannot be in the past');
    });

    this.on('submitForApproval', Quotes, async req => {
      const q = await loadQuote(req);
      C.assertStatus(req, q.status, ['Draft'], 'Quote');
      const total = await C.recalcQuote(q.ID);
      if (!(total > 0)) req.reject(400, 'Add at least one item with a price before submitting');
      if (q.validUntil < C.today()) req.reject(400, 'Quote validity date is in the past. Update validUntil first.');
      await UPDATE(Quote).set({ status: 'Pending Approval' }).where({ ID: q.ID });
    });

    this.on('approve', Quotes, async req => {
      const q = await loadQuote(req);
      C.assertStatus(req, q.status, ['Pending Approval'], 'Quote');
      await UPDATE(Quote).set({ status: 'Approved' }).where({ ID: q.ID });
    });

    // Pending Approval -> rejected internally | Sent -> rejected by the customer
    this.on('reject', Quotes, async req => {
      const q = await loadQuote(req);
      C.assertStatus(req, q.status, ['Pending Approval', 'Sent'], 'Quote');
      await UPDATE(Quote).set({ status: 'Rejected' }).where({ ID: q.ID });
    });

    this.on('send', Quotes, async req => {
      const q = await loadQuote(req);
      C.assertStatus(req, q.status, ['Approved'], 'Quote');
      if (q.validUntil < C.today()) req.reject(409, 'Quote has expired. Create a new version.');
      await UPDATE(Quote).set({ status: 'Sent' }).where({ ID: q.ID });
      await UPDATE(Opportunity).set({ stage: 'Negotiation' }).where({ ID: q.opportunity_ID });
    });

    this.on('newVersion', Quotes, async req => {
      const q = await loadQuote(req);
      C.assertStatus(req, q.status, ['Rejected', 'Expired'], 'Quote');
      const opp = await SELECT.one.from(Opportunity).where({ ID: q.opportunity_ID });
      if (!OPEN_STAGES.includes(opp.stage)) req.reject(409, `Opportunity is ${opp.stage}`);
      if (await activeQuote(opp.ID)) req.reject(409, 'This opportunity already has an active quote');

      const { m } = await SELECT.one.from(Quote).columns('max(version) as m').where({ quoteNo: q.quoteNo });
      const newID = cds.utils.uuid();
      await INSERT.into(Quote).entries({
        ID: newID, quoteNo: q.quoteNo, opportunity_ID: q.opportunity_ID,
        version: m + 1, status: 'Draft', validUntil: C.addDays(C.today(), 30), netAmount: 0
      });
      const items = await SELECT.from(QuoteItem).where({ quote_ID: q.ID });
      if (items.length)
        await INSERT.into(QuoteItem).entries(items.map(i => ({
          quote_ID: newID, product_ID: i.product_ID, quantity: i.quantity, unitPrice: i.unitPrice })));
      await C.recalcQuote(newID);
      return { quoteID: newID };
    });

    // Customer accepted -> Quote Accepted, Opportunity Closed Won, Sales Order created
    this.on('accept', Quotes, async req => {
      const q = await loadQuote(req);
      C.assertStatus(req, q.status, ['Sent'], 'Quote');
      if (q.validUntil < C.today()) req.reject(409, 'Quote has expired. Create a new version.');
      if (await SELECT.one.from(SalesOrder).where({ quote_ID: q.ID })) req.reject(409, 'Sales order already exists for this quote');

      const opp    = await SELECT.one.from(Opportunity).where({ ID: q.opportunity_ID });
      const ticket = await SELECT.one.from(ServiceTicket).where({ ID: opp.ticket_ID });

      const orderID = cds.utils.uuid();
      await INSERT.into(SalesOrder).entries({
        ID: orderID, orderNo: await C.nextNo('SO', SalesOrder),
        quote_ID: q.ID, customer_ID: ticket.customer_ID,  deliveryDate: C.addDays(C.today(), 7), status: 'Created'
      });
      await C.copyQuoteItems(orderID, q.ID);
      await UPDATE(Quote).set({ status: 'Accepted' }).where({ ID: q.ID });
      await UPDATE(Opportunity).set({ stage: 'Closed Won' }).where({ ID: opp.ID });
      return { salesOrderID: orderID };
    });

    // =====================================================
    //  QUOTE ITEMS (only while quote is Draft)
    // =====================================================
    const quoteIdOfItem = async id => (await SELECT.one.from(QuoteItem).columns('quote_ID').where({ ID: id }))?.quote_ID;
    const assertQuoteDraft = async (req, quoteID) => {
      const q = await SELECT.one.from(Quote).where({ ID: quoteID });
      if (!q) req.reject(404, 'Quote not found');
      if (q.status !== 'Draft') req.reject(409, `Items can be changed only while the quote is Draft (now '${q.status}')`);
    };

    this.before(['CREATE', 'UPDATE'], QuoteItems, async req => {
      const d = req.data;
      if ('quantity' in d && !(Number(d.quantity) > 0)) req.reject(400, 'Quantity must be greater than 0');
      if ('unitPrice' in d && Number(d.unitPrice) < 0)  req.reject(400, 'Unit price cannot be negative');
      if (d.product_ID && !(await SELECT.one.from(Product).where({ ID: d.product_ID, isActive: true })))
        req.reject(400, 'Product not found or inactive');
      await assertQuoteDraft(req, d.quote_ID || await quoteIdOfItem(d.ID));
    });
    this.before('DELETE', QuoteItems, async req => {
      req._quoteID = await quoteIdOfItem(req.data.ID);
      await assertQuoteDraft(req, req._quoteID);
    });
       this.after(['CREATE', 'UPDATE'], QuoteItems, async (data, req) => {
      const row = { ...req.data, ...data };
      await C.recalcQuote(row.quote_ID || await quoteIdOfItem(row.ID));
    });

    this.after('DELETE', QuoteItems, async (_, req) => { await C.recalcQuote(req._quoteID); });

    return super.init();
  }
};