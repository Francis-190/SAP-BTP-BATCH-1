const cds = require('@sap/cds');

// action -> PR status it may start from (the real actions re-check this anyway)
const PR_ACTIONS = {
  submitPR: 'DRAFT', sendForApproval: 'SUBMITTED', approvePR: 'PENDING_APPROVAL',
  rejectPR: 'PENDING_APPROVAL', resubmitPR: 'REJECTED', closePR: 'APPROVED', createPOFromPR: 'APPROVED'
};
const PR_WORDS = { draft: 'DRAFT', submitted: 'SUBMITTED', pending: 'PENDING_APPROVAL', approved: 'APPROVED', rejected: 'REJECTED', closed: 'CLOSED' };
const ACTIONS = [
  [/^(?:please\s+)?reject\b/, 'rejectPR', 'Reject'],
  [/^(?:please\s+)?approve\b/, 'approvePR', 'Approve'],
  [/^(?:please\s+)?resubmit\b/, 'resubmitPR', 'Resubmit'],
  [/^(?:please\s+)?submit\b/, 'submitPR', 'Submit'],
  [/^(?:please\s+)?send\b.*\bapproval\b/, 'sendForApproval', 'Send for approval'],
  [/^(?:please\s+)?close\b/, 'closePR', 'Close'],
  [/^(?:please\s+)?create\b.*\bpo\b/, 'createPOFromPR', 'Create PO from']
];

const HELP = `I can help with:
- Overview: "What needs attention today?"
- PRs: "PRs awaiting approval", "approved PRs", "Tell me about PR-3001"
- POs: "open POs", "partially received POs"
- Alerts: "Open high-severity alerts", "all alerts"
- Suppliers: "Spend by supplier", "best supplier"
- Actions (you confirm first): "Approve PR-3001", "Reject PR-3001 reason: price too high", "Submit PR-3001", "Create PO for PR-3001"
- How it works: "Explain the PR flow"`;

const FLOW = `PR flow: DRAFT > SUBMITTED > PENDING_APPROVAL > APPROVED > CLOSED, or REJECTED > resubmit > DRAFT.
- Submit moves a Draft PR to Submitted.
- Send for Approval (or the Approval Job) moves it to Pending Approval.
- The requester cannot approve or reject their own PR.
- A PO can only be created from an APPROVED PR.
- Goods receipt needs a PO in CREATED, SENT or PARTIALLY_RECEIVED.`;

// =====================================================================
//  AI (Groq, OpenAI-compatible API with tool calling)
// =====================================================================
// tried in order; the first one that works answers. AI_MODEL in .env (optional) is tried first.
const AI_MODELS = [...new Set([process.env.AI_MODEL, 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'].filter(Boolean))];

const AI_SYSTEM = `You are the assistant inside a procurement app (purchase requisitions, purchase orders, goods receipts, suppliers, alerts).
- Answer questions about the app's data ONLY from tool results. Never invent PR/PO numbers, statuses, names or figures.
- If a tool returns nothing or an error, say so plainly.
- Amounts are in Indian rupees (INR). Keep answers short; use bullet points for lists.
- You cannot change data directly. To approve, reject, submit, send for approval, resubmit, close a PR or create a PO, call propose_action, then tell the user to click Confirm below. For rejections you need a reason; ask if it is missing.
- For general procurement questions that need no data, answer from your own knowledge.
- Process reference:
${FLOW}`;

const STATUS_PR = ['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CLOSED'];
const STATUS_PO = ['CREATED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'];

const TOOL_DEFS = [
  { name: 'get_overview', description: 'Counts of PRs and POs by status, open alerts by severity, and fulfilment %.',
    input_schema: { type: 'object', properties: {} } },
  { name: 'search_prs', description: 'List the latest purchase requisitions, optionally filtered by status.',
    input_schema: { type: 'object', properties: { status: { type: 'string', enum: STATUS_PR }, limit: { type: 'integer' } } } },
  { name: 'get_pr', description: 'Details of one PR (items, requester, approver, rejection reason, linked POs).',
    input_schema: { type: 'object', properties: { pr_number: { type: 'string', description: 'e.g. PR-3001' } }, required: ['pr_number'] } },
  { name: 'search_pos', description: 'List the latest purchase orders with supplier, quantities and value in INR.',
    input_schema: { type: 'object', properties: { status: { type: 'string', enum: STATUS_PO }, limit: { type: 'integer' } } } },
  { name: 'search_alerts', description: 'List alerts. Open alerts only by default.',
    input_schema: { type: 'object', properties: { severity: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] }, open_only: { type: 'boolean' }, limit: { type: 'integer' } } } },
  { name: 'supplier_report', description: 'Suppliers with rating, lead time, eligibility and total spend in INR.',
    input_schema: { type: 'object', properties: {} } },
  { name: 'propose_action', description: 'Propose a PR action. Executes nothing; the user must click Confirm in the UI.',
    input_schema: { type: 'object', properties: {
      action: { type: 'string', enum: ['submitPR', 'sendForApproval', 'approvePR', 'rejectPR', 'resubmitPR', 'closePR', 'createPOFromPR'] },
      pr_number: { type: 'string' },
      reason: { type: 'string', description: 'Required for rejectPR' },
      summary: { type: 'string', description: 'Short label, e.g. "Approve PR-3001"' } },
      required: ['action', 'pr_number', 'summary'] } }
];

// convert the tool list above into the OpenAI format
const OPENAI_TOOLS = TOOL_DEFS.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.input_schema }
}));

function getApiKey() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  // optional: key supplied through a bound Cloud Foundry user-provided service named "groq-credentials"
  try {
    const vcap = JSON.parse(process.env.VCAP_SERVICES || '{}');
    const bound = (vcap['user-provided'] || []).find((s) => s.name === 'groq-credentials');
    return bound?.credentials?.apiKey;
  } catch (e) {
    return undefined;
  }
}

// Calls Groq, trying each model in AI_MODELS until one works.
async function callGroq(key, messages) {
  let lastErr;
  for (const model of AI_MODELS) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, max_tokens: 2000, temperature: 0.2, tools: OPENAI_TOOLS, messages }),
        signal: AbortSignal.timeout(30000)
      });
      if (res.ok) return await res.json();
      const text = (await res.text()).slice(0, 200);
      lastErr = new Error(`AI API ${res.status} (${model}): ${text}`);
      if (res.status === 401 || res.status === 403) throw lastErr; // bad key: no point trying other models
      console.warn(`Model ${model} failed (${res.status}), trying next...`);
    } catch (e) {
      if (e === lastErr) throw e;
      lastErr = e; // network error or timeout: try the next model
      console.warn(`Model ${model} error: ${e.message}, trying next...`);
    }
  }
  throw lastErr || new Error('No AI model available');
}

async function runAI(history, req, state, tools) {
  const key = getApiKey();
  if (!key) return null; // not configured -> keyword rules will answer

  const chat = (history || [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (chat.length && chat[0].role !== 'user') chat.shift();
  if (!chat.length) return null;

  const messages = [{ role: 'system', content: AI_SYSTEM }, ...chat];

  for (let turn = 0; turn < 6; turn++) {
    const data = await callGroq(key, messages);
    const msg = data.choices?.[0]?.message;
    if (!msg) return null;
    messages.push(msg);

    if (!msg.tool_calls?.length) return (msg.content || '').trim() || null;

    for (const call of msg.tool_calls) {
      let out;
      try {
        const args = JSON.parse(call.function.arguments || '{}');
        const fn = tools[call.function.name];
        out = fn ? await fn(args, state, req) : { error: `Unknown tool ${call.function.name}` };
      } catch (e) {
        out = { error: e.message };
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out).slice(0, 12000) });
    }
  }
  return null;
}

// =====================================================================
//  Service registration
// =====================================================================
module.exports = function registerChat(srv) {
  console.log('>>> chat handler registered for', srv.name);

  const { PurchaseRequisitions, PurchaseRequisitionItems, PurchaseOrders, PurchaseOrderItems,
          AlertNotifications, Suppliers } = srv.entities;
  const { ApplicationLogs } = cds.entities('mobis.db');

  const lim = (n) => Math.min(Math.max(parseInt(n, 10) || 10, 1), 25);
  const group = (rows, key) => rows.reduce((a, r) => ((a[r[key]] = (a[r[key]] || 0) + 1), a), {});
  const poValue = (po) => (po.items || []).reduce((s, i) => s + (i.orderedQty || 0) * (i.unitPrice || 0), 0);
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const bullets = (arr) => arr.map((x) => '• ' + x).join('\n');

  // ---------------- data tools (used by the AI and by the rules) ----------------
  const tools = {
    async get_overview() {
      const prs = await SELECT.from(PurchaseRequisitions).columns('status');
      const pos = await SELECT.from(PurchaseOrders).columns('status');
      const alerts = await SELECT.from(AlertNotifications).columns('severity', 'isResolved');
      const items = await SELECT.from(PurchaseOrderItems).columns('orderedQty', 'receivedQty');
      const ordered = items.reduce((s, i) => s + (i.orderedQty || 0), 0);
      const received = items.reduce((s, i) => s + (i.receivedQty || 0), 0);
      return {
        prsByStatus: group(prs, 'status'), posByStatus: group(pos, 'status'),
        openAlertsBySeverity: group(alerts.filter((a) => !a.isResolved), 'severity'),
        fulfilmentPct: ordered ? Math.round((received / ordered) * 100) : 0
      };
    },
    async search_prs(i) {
      const w = {};
      if (i.status) w.status = i.status;
      const q = SELECT.from(PurchaseRequisitions)
        .columns('prNumber', 'status', 'requestedBy', 'approvedBy', 'rejectionReason', 'createdAt')
        .orderBy('createdAt desc').limit(lim(i.limit));
      if (Object.keys(w).length) q.where(w);
      return await q;
    },
    async get_pr(i) {
      const pr = await SELECT.one.from(PurchaseRequisitions).where({ prNumber: i.pr_number });
      if (!pr) return { error: `PR ${i.pr_number} not found` };
      const items = await SELECT.from(PurchaseRequisitionItems)
        .columns('part_ID', 'requiredQty', 'supplier_ID', 'estimatedPrice').where({ pr_ID: pr.ID });
      const pos = await SELECT.from(PurchaseOrders).columns('poNumber', 'status').where({ pr_ID: pr.ID });
      return { prNumber: pr.prNumber, status: pr.status, requestedBy: pr.requestedBy, approvedBy: pr.approvedBy,
               rejectionReason: pr.rejectionReason, items, purchaseOrders: pos };
    },
    async search_pos(i) {
      const q = SELECT.from(PurchaseOrders)
        .columns((po) => { po.poNumber, po.status, po.supplier((s) => s.name), po.items((x) => { x.orderedQty, x.receivedQty, x.unitPrice }) })
        .orderBy('createdAt desc').limit(lim(i.limit));
      if (i.status) q.where({ status: i.status });
      const rows = await q;
      return rows.map((po) => ({
        poNumber: po.poNumber, status: po.status, supplier: po.supplier?.name,
        orderedQty: (po.items || []).reduce((s, x) => s + (x.orderedQty || 0), 0),
        receivedQty: (po.items || []).reduce((s, x) => s + (x.receivedQty || 0), 0),
        valueINR: Math.round(poValue(po))
      }));
    },
    async search_alerts(i) {
      const w = {};
      if (i.open_only !== false) w.isResolved = false;
      if (i.severity) w.severity = i.severity;
      const q = SELECT.from(AlertNotifications)
        .columns('ID', 'alertType', 'message', 'severity', 'isResolved', 'createdAt')
        .orderBy('createdAt desc').limit(lim(i.limit));
      if (Object.keys(w).length) q.where(w);
      return await q;
    },
    async supplier_report() {
      const suppliers = await SELECT.from(Suppliers).columns('ID', 'name', 'rating', 'leadTimeDays', 'isEligible');
      const pos = await SELECT.from(PurchaseOrders)
        .columns((po) => { po.supplier_ID, po.items((x) => { x.orderedQty, x.unitPrice }) });
      const spend = {};
      pos.forEach((po) => { spend[po.supplier_ID] = (spend[po.supplier_ID] || 0) + poValue(po); });
      return suppliers
        .map((s) => ({ name: s.name, rating: s.rating, leadTimeDays: s.leadTimeDays, eligible: s.isEligible, totalSpendINR: Math.round(spend[s.ID] || 0) }))
        .sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 15);
    },
    // Does NOT execute anything. It validates and remembers a proposal for the UI Confirm card.
    async propose_action(i, state, req) {
      const needs = PR_ACTIONS[i.action];
      if (!needs) return { error: `Unknown action ${i.action}.` };
      const pr = i.pr_number && await SELECT.one.from(PurchaseRequisitions).where({ prNumber: i.pr_number });
      if (!pr) return { error: `I could not find ${i.pr_number}.` };
      if (pr.status !== needs) return { error: `${i.pr_number} is ${pr.status}. ${i.action} needs a PR in ${needs}.` };
      if (i.action === 'rejectPR' && !(i.reason && i.reason.trim())) return { error: 'A rejection reason is required. Ask the user for one.' };
      const params = { prID: pr.ID };
      if (i.action === 'approvePR' || i.action === 'rejectPR') params.approver = req.user.id;
      if (i.action === 'rejectPR') params.reason = i.reason;
      state.proposal = { name: i.action, params, summary: i.summary };
      return { ok: true };
    }
  };

  // ---------------- formatting ----------------
  const fPRs = (rows) => rows.length
    ? bullets(rows.map((p) => `${p.prNumber} · ${p.status} · requested by ${p.requestedBy || '-'}`)) : 'None found.';
  const fAlerts = (rows) => rows.length
    ? bullets(rows.map((a) => `[${a.severity}] ${a.alertType}: ${a.message}`)) : 'None found.';

  // ---------------- keyword rules (fallback when the AI is unavailable) ----------------
  async function answer(text, req, state) {
    const t = text.toLowerCase().trim();
    const prNo = (text.match(/\bPR-\d+\b/i) || [])[0]?.toUpperCase();
    const isPR = /\bprs?\b|requisition/.test(t);
    const isPO = /\bpos?\b|purchase order/.test(t);

    if (/^(hi|hello|hey|help)\b/.test(t) || t === 'what can you do') return HELP;

    // 1) actions (always need a PR number, and always end in a Confirm card)
    for (const [rx, action, label] of ACTIONS) {
      if (!rx.test(t)) continue;
      if (!prNo) return `Which PR? For example: "${label} PR-3001".`;
      let reason;
      if (action === 'rejectPR') {
        reason = (text.match(/(?:reason|because)[:\s]+(.+)$/i) || [])[1];
        if (!reason) return `Please give a reason, e.g. "Reject ${prNo} reason: price too high".`;
      }
      const summary = `${label} ${prNo}` + (reason ? ` (reason: ${reason.trim()})` : '');
      const r = await tools.propose_action({ action, pr_number: prNo, reason: reason && reason.trim(), summary }, state, req);
      return r.error || `Ready: ${summary}. Click Confirm below to proceed, or Dismiss to cancel.`;
    }

    // 2) one specific PR
    if (prNo) {
      const pr = await tools.get_pr({ pr_number: prNo });
      if (pr.error) return pr.error;
      return `${pr.prNumber} is ${pr.status}.\n` + bullets([
        `Requested by: ${pr.requestedBy || '-'}`,
        pr.approvedBy ? `Decided by: ${pr.approvedBy}` : null,
        pr.rejectionReason ? `Rejection reason: ${pr.rejectionReason}` : null,
        `Items: ${pr.items.length}`,
        `Purchase orders: ${pr.purchaseOrders.length ? pr.purchaseOrders.map((p) => `${p.poNumber} (${p.status})`).join(', ') : 'none yet'}`
      ].filter(Boolean));
    }

    // 3) help / explanations
    if (/how (do|to|can)|explain|what does|what is|flow|workflow|process/.test(t)) return FLOW;

    // 4) overview
    if (/attention|today|overview|summary|how are we|dashboard|status of everything/.test(t)) {
      const o = await tools.get_overview();
      const c = (obj, k) => (obj && obj[k]) || 0;
      const awaiting = c(o.prsByStatus, 'SUBMITTED') + c(o.prsByStatus, 'PENDING_APPROVAL');
      return `Here is where things stand:\n` + bullets([
        `${awaiting} PR(s) awaiting approval`,
        `${c(o.prsByStatus, 'APPROVED')} approved PR(s) ready for a PO`,
        `${c(o.posByStatus, 'CREATED') + c(o.posByStatus, 'SENT') + c(o.posByStatus, 'PARTIALLY_RECEIVED')} open PO(s)`,
        `${Object.values(o.openAlertsBySeverity).reduce((a, b) => a + b, 0)} open alert(s) (${c(o.openAlertsBySeverity, 'HIGH')} high)`,
        `Fulfilment: ${o.fulfilmentPct}%`
      ]);
    }

    // 5) alerts
    if (/alert/.test(t)) {
      const severity = /\bhigh\b/.test(t) ? 'HIGH' : /\bmedium\b/.test(t) ? 'MEDIUM' : /\blow\b/.test(t) ? 'LOW' : undefined;
      const all = /\ball\b|resolved/.test(t);
      const rows = await tools.search_alerts({ severity, open_only: !all, limit: 15 });
      return `${all ? 'Alerts' : 'Open alerts'}${severity ? ' (' + severity + ')' : ''}:\n${fAlerts(rows)}\nTo resolve one, use the Resolve button on the Alerts page.`;
    }

    // 6) suppliers / spend
    if (/supplier|vendor|spend/.test(t)) {
      const rows = await tools.supplier_report();
      if (!rows.length) return 'No suppliers found.';
      return 'Suppliers (best rated first):\n' + bullets(rows.slice(0, 8).map((s) =>
        `${s.name} · rating ${s.rating ?? '-'} · lead time ${s.leadTimeDays}d · spend ${inr(s.totalSpendINR)}${s.eligible ? '' : ' · NOT eligible'}`));
    }

    // 7) purchase orders
    if (isPO && !isPR) {
      const status = /partial/.test(t) ? 'PARTIALLY_RECEIVED' : /cancel/.test(t) ? 'CANCELLED'
        : /\bclosed\b/.test(t) ? 'CLOSED' : /\breceived\b/.test(t) ? 'RECEIVED'
        : /\bsent\b/.test(t) ? 'SENT' : /\bcreated\b/.test(t) ? 'CREATED' : undefined;
      let rows = await tools.search_pos({ status, limit: 25 });
      if (!status && /open/.test(t)) rows = rows.filter((p) => !['RECEIVED', 'CLOSED', 'CANCELLED'].includes(p.status));
      if (!rows.length) return 'No purchase orders found.';
      return 'Purchase orders:\n' + bullets(rows.slice(0, 10).map((p) =>
        `${p.poNumber} · ${p.status} · ${p.supplier || '-'} · received ${p.receivedQty}/${p.orderedQty} · ${inr(p.valueINR)}`));
    }

    // 8) purchase requisitions by status
    if (isPR) {
      if (/awaiting|waiting/.test(t)) {
        const a = await tools.search_prs({ status: 'SUBMITTED' });
        const b = await tools.search_prs({ status: 'PENDING_APPROVAL' });
        return `PRs awaiting approval (${a.length + b.length}):\n${fPRs([...a, ...b])}`;
      }
      const word = Object.keys(PR_WORDS).find((w) => new RegExp('\\b' + w).test(t));
      const rows = await tools.search_prs({ status: word && PR_WORDS[word], limit: 15 });
      return `${word ? PR_WORDS[word] : 'Latest'} PRs (${rows.length}):\n${fPRs(rows)}`;
    }

    return `Sorry, I didn't understand that.\n\n${HELP}`;
  }

  // ---------------- the chat action ----------------
  srv.on('chat', async (req) => {
    const msgs = (req.data.messages || []).filter((m) => m.role === 'user' && typeof m.content === 'string');
    const question = msgs.length ? msgs[msgs.length - 1].content.trim().slice(0, 500) : '';
    if (!question) return req.error(400, 'No question received.');

    const state = { proposal: null };
    let reply;
    let usedAI = false;
    try {
      try {
        reply = await runAI(req.data.messages, req, state, tools);
        usedAI = !!reply;
      } catch (e) {
        console.error('AI failed, using rules:', e.message);
      }
      if (!reply) {
        state.proposal = null; // discard any half-finished proposal from a failed AI run
        reply = await answer(question, req, state);
      }
    } catch (e) {
      console.error('chat failed:', e);
      return req.error(500, 'Could not answer that right now.');
    }

    await INSERT.into(ApplicationLogs).entries({
      layer: 'ProcurementService', operation: 'chat', severity: 'INFO',
      message: `${req.user.id}${usedAI ? ' [AI]' : ' [rules]'}: ${question.slice(0, 300)}` + (state.proposal ? ` | proposed ${state.proposal.name}` : '')
    });

    return {
      reply,
      actionName: state.proposal?.name || null,
      actionParams: state.proposal ? JSON.stringify(state.proposal.params) : null,
      actionSummary: state.proposal?.summary || null
    };
  });
};