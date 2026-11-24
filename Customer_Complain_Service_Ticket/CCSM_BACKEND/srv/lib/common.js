const cds = require('@sap/cds');

const E = () => cds.entities('complaint.mgmt');   // db entities

// ---------- small helpers ----------
const now       = () => new Date().toISOString();
const today     = () => new Date().toISOString().slice(0, 10);
const addDays   = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n);   return x.toISOString().slice(0, 10); };
const addMonths = (d, n) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
const round2    = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const isEmail   = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const getId     = req => { const p = req.params[req.params.length - 1]; return typeof p === 'object' ? p.ID : p; };

// Rejects the request if the current status is not one of the allowed ones
function assertStatus(req, current, allowed, what) {
  if (!allowed.includes(current))
    req.reject(409, `${what} is '${current}'. Allowed only when status is: ${allowed.join(', ')}`);
}

// Number generator: T-2026-000001 (simple counter, fine for dev/test)
async function nextNo(prefix, entity) {
  const { c } = await SELECT.one.from(entity).columns('count(*) as c');
  return `${prefix}-${new Date().getFullYear()}-${String(c + 1).padStart(6, '0')}`;
}

// ---------- priority = severity x customer tier ----------
const PRIORITY = {
  Critical: { Platinum: 'P1', Gold: 'P1', Silver: 'P2', Standard: 'P2' },
  Major:    { Platinum: 'P2', Gold: 'P2', Silver: 'P3', Standard: 'P3' },
  Minor:    { Platinum: 'P3', Gold: 'P3', Silver: 'P4', Standard: 'P4' }
};

// ---------- SLA ----------
// Adds minutes counting only working hours/days of the policy (server time zone)
function addBusinessMinutes(start, mins, policy) {
  if (!policy.workStart || !policy.workEnd || !policy.workDays)
    return new Date(start.getTime() + mins * 60000);

  const names = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const days  = policy.workDays.split(',').map(d => d.trim().toUpperCase());
  const [sh, sm] = policy.workStart.split(':').map(Number);
  const [eh, em] = policy.workEnd.split(':').map(Number);

  let cur = new Date(start), remaining = mins;
  for (let i = 0; i < 400 && remaining > 0; i++) {
    if (days.includes(names[cur.getDay()])) {
      const dayStart = new Date(cur); dayStart.setHours(sh, sm, 0, 0);
      const dayEnd   = new Date(cur); dayEnd.setHours(eh, em, 0, 0);
      const from = cur > dayStart ? cur : dayStart;
      if (from < dayEnd) {
        const avail = (dayEnd - from) / 60000;
        if (remaining <= avail) return new Date(from.getTime() + remaining * 60000);
        remaining -= avail;
      }
    }
    cur = new Date(cur); cur.setDate(cur.getDate() + 1); cur.setHours(0, 0, 0, 0);
  }
  return cur;
}

const findPolicy = (priority, tier) =>
  SELECT.one.from(E().SLAPolicy).where({ priority, customerTier: tier, isActive: true });

async function createClocks(ticketID, policy, types = ['FIRST_RESPONSE', 'RESOLUTION']) {
  const start = new Date();
  const rows = types.map(t => ({
    ticket_ID: ticketID, clockType: t, status: 'Running',
    startedAt: start.toISOString(),
    dueAt: addBusinessMinutes(start, t === 'FIRST_RESPONSE' ? policy.firstResponseMins : policy.resolutionMins, policy).toISOString()
  }));
  await INSERT.into(E().SLAClock).entries(rows);
}

// Stops a clock: Met if stopped before dueAt, otherwise Breached
async function stopClock(ticketID, clockType) {
  const { SLAClock } = E();
  const clock = await SELECT.one.from(SLAClock).where({ ticket_ID: ticketID, clockType, stoppedAt: null });
  if (!clock) return;
  const late = clock.status === 'Breached' || new Date() > new Date(clock.dueAt);
  await UPDATE(SLAClock).set({ stoppedAt: now(), pausedAt: null, status: late ? 'Breached' : 'Met' }).where({ ID: clock.ID });
}

// On Track / At Risk (75% used) / Breached, calculated from the clocks
function slaStateOf(clocks) {
  let state = 'On Track';
  const t = Date.now();
  for (const c of clocks) {
    if (c.status === 'Breached') return 'Breached';
    if (c.status !== 'Running') continue;
    const start = new Date(c.startedAt).getTime(), due = new Date(c.dueAt).getTime();
    if (t > due) return 'Breached';
    if ((t - start) / (due - start) >= 0.75) state = 'At Risk';
  }
  return state;
}

// ---------- warranty ----------
async function warrantyInfo(ticketID) {
  const { ServiceTicket, SalesOrder, Product } = E();
  const t = await SELECT.one.from(ServiceTicket).where({ ID: ticketID });
  if (!t) return { error: 'Ticket not found' };
  if (!t.product_ID || !t.salesOrder_ID) return { error: 'Ticket needs both product and salesOrder for a warranty check' };
  const so = await SELECT.one.from(SalesOrder).where({ ID: t.salesOrder_ID });
  const p  = await SELECT.one.from(Product).where({ ID: t.product_ID });
  if (!so.deliveryDate) return { error: 'The sales order is not delivered yet' };
  const end = addMonths(so.deliveryDate, p.warrantyMonths || 0);
  return { underWarranty: p.warrantyMonths > 0 && today() <= end, warrantyEndDate: end };
}

// ---------- sales helpers ----------
const hasOpenOpportunity = ticketID =>
  SELECT.one.from(E().Opportunity).where({ ticket_ID: ticketID, stage: { 'not in': ['Closed Won', 'Closed Lost'] } });

async function recalcQuote(quoteID) {
  const { QuoteItem, Quote } = E();
  const items = await SELECT.from(QuoteItem).where({ quote_ID: quoteID });
  const total = round2(items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0));
  await UPDATE(Quote).set({ netAmount: total }).where({ ID: quoteID });
  return total;
}

async function copyQuoteItems(orderID, quoteID) {
  const { QuoteItem, SalesOrderItem } = E();
  const items = await SELECT.from(QuoteItem).where({ quote_ID: quoteID });
  if (items.length)
    await INSERT.into(SalesOrderItem).entries(items.map(i => ({
      salesOrder_ID: orderID, product_ID: i.product_ID, quantity: i.quantity, unitPrice: i.unitPrice
    })));
}

async function orderTotal(orderID) {
  const items = await SELECT.from(E().SalesOrderItem).where({ salesOrder_ID: orderID });
  return round2(items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0));
}

async function sumPayments(invoiceID) {
  const r = await SELECT.one.from(E().Payment).columns('sum(amount) as total').where({ invoice_ID: invoiceID });
  return round2(r?.total || 0);
}

module.exports = {
  E, now, today, addDays, addMonths, round2, isEmail, getId, assertStatus, nextNo, PRIORITY,
  addBusinessMinutes, findPolicy, createClocks, stopClock, slaStateOf,
  warrantyInfo, hasOpenOpportunity, recalcQuote, copyQuoteItems, orderTotal, sumPayments
};