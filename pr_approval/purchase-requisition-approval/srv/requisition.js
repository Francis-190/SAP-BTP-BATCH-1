'use strict';
const cds = require('@sap/cds');
const crypto = require('crypto');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const erp = require('./lib/erp-adapter');
const { SELECT, INSERT, UPDATE, DELETE } = cds.ql;
const LOG = cds.log('requisition');
const WORKFLOW_DEFINITION_ID = process.env.BPA_DEFINITION_ID
    || 'us10.4a9c652etrial.purchaserequisitionapproval.purchaseRequisitionApproval';
const DESTINATION_NAME = 'requisitionapproval';
const BPA_USERS = { bob: 'bob@yourcompany.com', carol: 'carol@yourcompany.com' };
const bpaUser = (id) => BPA_USERS[id] || id;
const EDITABLE = ['Draft', 'Returned'];
const COMPUTED_HEADER = ['reqNumber', 'requester', 'status', 'currentStep',
    'netAmount', 'taxAmount', 'totalAmount', 'cancellationReason', 'projectRef'];
const COMPUTED_ITEM = ['itemNo', 'itemType', 'description', 'uom', 'unitPrice',
    'netAmount', 'taxAmount', 'grossAmount'];
const SYSTEM_CHILDREN = ['decisions', 'tasks', 'erpReference'];
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const now = () => new Date().toISOString();

module.exports = cds.service.impl(async function () {
    const { Requisitions, RequisitionItems, Attachments,
        ApprovalDecisions, ApprovalTasks, ERPReferences, ApprovalInbox,
        ProcurementQueue, Materials } = this.entities;
    const { PurchaseRequisition: PR, RequisitionItem: Item, ApprovalTask: Task,
        ApprovalDecision: Decision, ERPReference: ERP, CostCentre,
        PurchaseCategory: Category, ApprovalMatrix: Matrix, Material,
        Attachment } = cds.entities('pr');

    // 1. BEFORE 
    const checkItemData = (req, item, prefix = '') => {
        if (item.quantity !== undefined && item.quantity !== null && !(Number(item.quantity) > 0))
            req.error(400, 'Quantity must be greater than zero.', `${prefix}quantity`);
        if (item.needByDate && String(item.needByDate) < now().slice(0, 10))
            req.error(400, 'Need-by date cannot be in the past.', `${prefix}needByDate`);
        if (item.taxRate != null && (Number(item.taxRate) < 0 || Number(item.taxRate) > 100))
            req.error(400, 'Tax rate must be between 0 and 100.', `${prefix}taxRate`);
    };
    this.before(['CREATE', 'UPDATE'], RequisitionItems, (req) => checkItemData(req, req.data));
    this.before('CREATE', Requisitions, async (req) => {
        const data = req.data;
        COMPUTED_HEADER.forEach(f => delete data[f]);
        SYSTEM_CHILDREN.forEach(f => delete data[f]);
        data.items?.forEach(i => COMPUTED_ITEM.forEach(f => delete i[f]));
        data.items?.forEach((item, index) => { item.itemNo = (index + 1) * 10; });
        data.attachments?.forEach(a => { delete a.requisition_ID; });
        data.items?.forEach((item, i) => checkItemData(req, item, `items[${i}].`));
        const cc = data.costCentre_code
            ? await SELECT.one.from(CostCentre).where({ code: data.costCentre_code }) : null;
        if (data.costCentre_code && !cc)
            return req.reject(400, `Cost centre ${data.costCentre_code} does not exist`);
        if (cc && !cc.active) return req.reject(400, `Cost centre ${cc.code} is not active`);
        if (!data.currency_code && cc?.currency_code) data.currency_code = cc.currency_code;
        if (data.category_code &&
            !(await SELECT.one.from(Category).where({ code: data.category_code })))
            return req.reject(400, `Purchase category ${data.category_code} does not exist`);
        data.status = 'Draft';
        data.currentStep = 0;
        data.requester = req.user.id;
        data.reqNumber = await nextReqNumber();
        data.projectRef = await nextCode('PurchaseRequisition', 'projectRef',
            `PRJ-${new Date().getFullYear()}-`, 4);
        data.netAmount = data.taxAmount = data.totalAmount = 0;
    });

    this.before('UPDATE', Requisitions, async (req) => {
        const data = req.data;
        const h = await assertEditable(data.ID, req);
        COMPUTED_HEADER.forEach(f => delete data[f]);
        SYSTEM_CHILDREN.forEach(f => delete data[f]);
        data.items?.forEach(i => COMPUTED_ITEM.forEach(f => delete i[f]));
        data.items?.forEach((item, i) => checkItemData(req, item, `items[${i}].`));
        if (data.costCentre_code) {
            const cc = await SELECT.one.from(CostCentre)
                .columns('code', 'active', 'currency_code')
                .where({ code: data.costCentre_code });
            if (!cc) req.error(400, `Cost centre ${data.costCentre_code} does not exist.`, 'costCentre_code');
            else if (!cc.active) req.error(400, `Cost centre ${cc.code} is not active.`, 'costCentre_code');
            else if (cc.currency_code) data.currency_code = cc.currency_code;
        }
        if (data.category_code) {
            if (!(await SELECT.one.from(Category).columns('code').where({ code: data.category_code })))
                req.error(400, `Purchase category ${data.category_code} does not exist.`, 'category_code');
            else if (data.category_code !== h.category_code)
                req._categoryChanged = true;
        }
    });

    this.before('DELETE', Requisitions, async (req) => {
        const h = await assertEditable(req.data.ID, req);
        if (h.status !== 'Draft')
            return req.reject(409, 'Only draft requisitions can be deleted; cancel it instead');
    });

    this.before('CREATE', RequisitionItems, async (req) => {
        if (!req.data.requisition_ID) return req.reject(400, 'requisition_ID is required');
        await assertEditable(req.data.requisition_ID, req);
        COMPUTED_ITEM.forEach(f => delete req.data[f]);

        const rows = await SELECT.from(Item).columns('itemNo')
            .where({ requisition_ID: req.data.requisition_ID });
        let highest = 0;
        for (const row of rows) {
            if (Number(row.itemNo) > highest) highest = Number(row.itemNo);
        }
        req.data.itemNo = highest + 10;
    });

    this.before(['UPDATE', 'DELETE'], RequisitionItems, async (req) => {
        const pid = await parentOf(Item, req.data.ID);
        if (!pid) return req.reject(404, 'Item not found');
        await assertEditable(pid, req);
        req._pid = pid;
        COMPUTED_ITEM.forEach(f => delete req.data[f]);
        delete req.data.requisition_ID;
    });

    this.before('CREATE', Attachments, async (req) => {
        if (!req.data.requisition_ID) return req.reject(400, 'requisition_ID is required');
        await assertEditable(req.data.requisition_ID, req);
    });

    this.before(['UPDATE', 'DELETE'], Attachments, async (req) => {
        const pid = await parentOf(Attachment, req.data.ID);
        if (!pid) return req.reject(404, 'Attachment not found');
        await assertEditable(pid, req);
        delete req.data.requisition_ID;
    });

    this.before(['CREATE', 'UPDATE', 'DELETE'],
        [ApprovalDecisions, ApprovalTasks, ApprovalInbox, ProcurementQueue, ERPReferences, Materials],
        (req) => req.reject(403, 'System-managed records are read only'));

    // 2. AUTOMATIC TOTALS CALCULATION

    this.after(['CREATE', 'UPDATE'], Requisitions, async (result, req) => {
        const id = result?.ID || req.data.ID;
        if (req._categoryChanged)
            await UPDATE(Item).set({ taxRate: null }).where({ requisition_ID: id });
        const totals = await recalculate(id);
        if (totals && result) Object.assign(result, totals);
    });

    this.after(['CREATE', 'UPDATE', 'DELETE'], RequisitionItems, async (result, req) => {
        const itemId = result?.ID || req.data.ID;
        const row = req.event !== 'DELETE' && itemId
            ? await SELECT.one.from(Item).where({ ID: itemId }) : null;
        const pid = req._pid || req.data.requisition_ID || row?.requisition_ID;
        if (pid) await recalculate(pid);
        if (req.event === 'DELETE' || !row) return;
        const fresh = await SELECT.one.from(Item).where({ ID: itemId });
        if (fresh && result && typeof result === 'object') {
            for (const f of ['itemNo', 'itemType', 'description', 'uom', 'unitPrice',
                'taxRate', 'netAmount', 'taxAmount', 'grossAmount']) result[f] = fresh[f];
        }
    });

    // 3. SERVICE ACTIONS
    

    this.on('submitForApproval', Requisitions, async (req) => {
        const id = idOf(req);
        let h = await loadHeader(id, req);
        if (h.requester !== req.user.id)
            return req.reject(403, 'Only the requester can submit this requisition');
        if (!EDITABLE.includes(h.status))
            return req.reject(409, `Requisition is ${h.status} and cannot be submitted`);
        await recalculate(id);
        h = await loadHeader(id, req);
        const items = await SELECT.from(Item).where({ requisition_ID: id }).orderBy('itemNo');
        const errors = [];
        if (!h.title) errors.push('Title is required');
        if (!h.costCentre_code) errors.push('Cost centre is required');
        if (!h.category_code) errors.push('Purchase category is required');
        if (!h.currency_code) errors.push('Currency is required');
        if (!items.length) errors.push('Add at least one item line');
        const today = now().slice(0, 10);
        items.forEach((it, i) => {
            const n = it.itemNo ?? i + 1;
            if (!it.material) errors.push(`Item ${n}: choose a material or service`);
            else if (!it.description) errors.push(`Item ${n}: ${it.material} is not in the price list`);
            if (!(Number(it.quantity) > 0)) errors.push(`Item ${n}: quantity must be greater than zero`);
            if (!it.needByDate) errors.push(`Item ${n}: need-by date is required`);
            else if (String(it.needByDate) < today) errors.push(`Item ${n}: need-by date is in the past`);
        });
        if (errors.length) return req.reject(400, errors.join('; '));
        const cc = await SELECT.one.from(CostCentre).where({ code: h.costCentre_code });
        if (!cc || !cc.active)
            return req.reject(400, `Cost centre ${h.costCentre_code} is not available`);
        if (cc.currency_code && cc.currency_code !== h.currency_code)
            return req.reject(400, `Requisition currency ${h.currency_code} differs from cost centre currency ${cc.currency_code}`);
        const total = Number(h.totalAmount);
        const available = r2(Number(cc.budgetAmount) - Number(cc.committedAmount));
        if (total > available)
            return req.reject(409, `Insufficient budget on ${cc.code}: required ${total.toFixed(2)}, available ${available.toFixed(2)}`);
        const route = await buildRoute(h, cc);
        if (!route.length)
            return req.reject(409, 'No approval route is configured for this amount, category and organizational unit');
        const tasks = route.map((m, i) => ({
            ID: crypto.randomUUID(), requisition_ID: id, stepNo: i + 1, role: m.approverRole,
            assignedTo: m.approverRole === 'Manager' ? cc.managerId : cc.financeApproverId,
            state: 'Open'
        }));
        for (const t of tasks) {
            if (!t.assignedTo)
                return req.reject(409, `No ${t.role} approver is maintained for cost centre ${cc.code}`);
            if (t.assignedTo === h.requester)
                return req.reject(409, `The ${t.role} approver for step ${t.stepNo} is the requester. Ask the administrator to assign another approver`);
        }
        const mgr = tasks.find(t => t.role === 'Manager');
        const fin = tasks.find(t => t.role !== 'Manager');
        const payload = {
            definitionId: WORKFLOW_DEFINITION_ID,
            context: {
                reqid: String(id),
                reqnumber: String(h.reqNumber || ''),
                title: String(h.title || ''),
                requester: String(h.requester || ''),
                costcentre: String(cc.code),
                currency: String(h.currency_code || ''),
                totalamount: Number(total),
                managerid: bpaUser(mgr?.assignedTo),
                financeid: fin ? bpaUser(fin.assignedTo) : '',
                needsfinance: !!fin
            }
        };
        let instanceId;
        try {
            LOG.info(`Starting BPA workflow with definition ${payload.definitionId}`);
            const response = await executeHttpRequest(
                { destinationName: DESTINATION_NAME },
                {
                    method: 'post',
                    url: '/workflow/rest/v1/workflow-instances',
                    data: payload,
                    headers: { 'Content-Type': 'application/json' }
                },
                { fetchCsrfToken: false }
            );
            instanceId = response.data?.id;
            LOG.info(`BPA workflow started: ${instanceId}`);
        } catch (error) {
            const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
            LOG.error('BPA workflow failed', error.response?.status, detail, error.cause?.message);
            return req.reject(400,
                `Could not start approval workflow (${error.response?.status || 'no response'}): ${detail}`.substring(0, 500));
        }
        await DELETE.from(Task).where({ requisition_ID: id });
        await INSERT.into(Task).entries(tasks);
        await commitBudget(cc.code, total);
        await UPDATE(PR).set({ status: 'InApproval', currentStep: 1 }).where({ ID: id });
        LOG.info(`${h.reqNumber} submitted by ${req.user.id}; ${tasks.length} approval step(s); workflow ${instanceId}`);
        return reread(id);
    });
    const bpaFinish = (outcome) => async (req) => {
        const id = idOf(req);
        const h = await loadHeader(id, req);
        if (['Approved', 'Rejected'].includes(h.status)) return reread(id);
        if (h.status !== 'InApproval')
            return req.reject(409, `Requisition is ${h.status}; no approval is pending`);
        const comment = (req.data.comment || '').trim();
        const open = await SELECT.from(Task).where({ requisition_ID: id, state: 'Open' });
        await UPDATE(Task)
            .set({ state: outcome === 'Approved' ? 'Done' : 'Cancelled', actedAt: now() })
            .where({ requisition_ID: id, state: 'Open' });
        await INSERT.into(Decision).entries({
            ID: crypto.randomUUID(), requisition_ID: id, stepNo: h.currentStep,
            role: open[open.length - 1]?.role || 'Manager',
            decision: outcome, comment: comment || null,
            decidedBy: req.user.id, decidedAt: now()
        });
        if (outcome === 'Approved') {
            await UPDATE(PR).set({ status: 'Approved' }).where({ ID: id });
        } else {
            await releaseBudget(h.costCentre_code, h.totalAmount);
            await UPDATE(PR).set({ status: 'Rejected', currentStep: 0 }).where({ ID: id });
        }
        LOG.info(`${h.reqNumber} ${outcome} via BPA`);
        return reread(id);
    };

    this.on('approve', Requisitions, bpaFinish('Approved'));
    this.on('reject', Requisitions, bpaFinish('Rejected'));
    this.on('returnForCorrection', Requisitions, (req) => decide(req, 'Returned'))
    const decideViaTask = (decision) => async (req) => {
        const taskId = idOf(req);
        const t = await SELECT.one.from(Task).columns('requisition_ID').where({ ID: taskId });
        if (!t) return req.reject(404, 'Approval task not found');
        await decide(req, decision, t.requisition_ID);
        return this.run(SELECT.one.from(ApprovalInbox).where({ ID: taskId }));
    };

    this.on('approve', ApprovalInbox, decideViaTask('Approved'));
    this.on('reject', ApprovalInbox, decideViaTask('Rejected'));
    this.on('returnForCorrection', ApprovalInbox, decideViaTask('Returned'));

    this.on('cancel', Requisitions, async (req) => {
        const id = idOf(req);
        const h = await loadHeader(id, req);
        const reason = (req.data.reason || '').trim();
        if (!reason) return req.reject(400, 'A cancellation reason is required');
        if (h.requester !== req.user.id)
            return req.reject(403, 'Only the requester can cancel this requisition');
        if (!['Draft', 'Returned', 'InApproval', 'Approved', 'Failed'].includes(h.status))
            return req.reject(409, `A requisition in status ${h.status} cannot be cancelled`);

        if (['InApproval', 'Approved', 'Failed'].includes(h.status))
            await releaseBudget(h.costCentre_code, h.totalAmount);
        await UPDATE(Task).set({ state: 'Cancelled' }).where({ requisition_ID: id, state: 'Open' });
        await UPDATE(PR).set({ status: 'Cancelled', currentStep: 0, cancellationReason: reason })
            .where({ ID: id });

        LOG.info(`${h.reqNumber} cancelled by ${req.user.id}: ${reason}`);
        return reread(id);
    });

    this.on('release', Requisitions, releaseRequisition);
    this.on('retryHandoff', Requisitions, retryRequisition);

    const asQueueRow = (fn) => async (req) => {
        await fn(req);
        return this.run(SELECT.one.from(ProcurementQueue).where({ ID: idOf(req) }));
    };

    this.on('releaseToErp', ProcurementQueue, asQueueRow(releaseRequisition));
    this.on('retryErpHandoff', ProcurementQueue, asQueueRow(retryRequisition));

    // 4. HELPER FUNCTIONS
    function idOf(req) {
        const p = req.params?.[req.params.length - 1];
        return typeof p === 'object' ? p.ID : p;
    }

    async function loadHeader(id, req) {
        const h = await SELECT.one.from(PR).where({ ID: id });
        if (!h) return req.reject(404, 'Requisition not found');
        return h;
    }

    function reread(id) {
        return SELECT.one.from(PR).where({ ID: id });
    }

    async function parentOf(entity, id) {
        return (await SELECT.one.from(entity).columns('requisition_ID').where({ ID: id }))?.requisition_ID;
    }

    async function assertEditable(id, req) {
        const h = await SELECT.one.from(PR).columns('ID', 'status', 'requester', 'category_code').where({ ID: id });
        if (!h) return req.reject(404, 'Requisition not found');
        if (h.requester !== req.user.id)
            return req.reject(403, 'Only the requester can change this requisition');
        if (!EDITABLE.includes(h.status))
            return req.reject(409, `Requisition is ${h.status} and can no longer be changed`);
        return h;
    }

    async function nextCode(entityName, field, prefix, width, start = 0) {
        const entity = cds.entities('pr')[entityName];
        const rows = await SELECT.from(entity).columns(field).where(`${field} like`, prefix + '%');
        const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('^' + esc + '(\\d+)$');
        let max = start;
        for (const r of rows) {
            const m = re.exec(r[field] || '');
            if (m) max = Math.max(max, parseInt(m[1], 10));
        }
        return prefix + String(max + 1).padStart(width, '0');
    }

    async function nextReqNumber() {
        const prefix = `PR-${new Date().getFullYear()}-`;
        const row = await SELECT.one.from(PR)
            .columns('max(reqNumber) as maxNo').where('reqNumber like', prefix + '%');
        const n = row?.maxNo ? parseInt(row.maxNo.slice(prefix.length), 10) + 1 : 1;
        return prefix + String(n).padStart(4, '0');
    }

    async function recalculate(id) {
        const H = PR;
        const I = Item;
        const h = await SELECT.one.from(H).columns('ID', 'category_code').where({ ID: id });
        if (!h) return null;
        const cat = h.category_code
            ? await SELECT.one.from(Category).where({ code: h.category_code }) : null;
        const items = await SELECT.from(I).where({ requisition_ID: id }).orderBy('itemNo');

        let highestNo = 0;
        for (const it of items) {
            if (it.itemNo != null && Number(it.itemNo) > highestNo) highestNo = Number(it.itemNo);
        }

        let net = 0, tax = 0;
        for (const it of items) {
            const m = it.material
                ? await SELECT.one.from(Material).where({ code: it.material }) : null;
            const price = m ? Number(m.unitPrice) : Number(it.unitPrice || 0);
            const rate = it.taxRate != null ? Number(it.taxRate) : Number(cat?.defaultTaxRate ?? 0);
            const itemNet = r2(Number(it.quantity || 0) * price);
            const itemTax = r2(itemNet * rate / 100);

            let itemNo = it.itemNo;
            if (itemNo == null) { highestNo += 10; itemNo = highestNo; }

            const patch = {
                itemNo, taxRate: rate,
                netAmount: itemNet, taxAmount: itemTax, grossAmount: r2(itemNet + itemTax)
            };
            if (m) Object.assign(patch, {
                description: m.description, itemType: m.itemType, uom: m.uom, unitPrice: m.unitPrice
            });
            await UPDATE(I).set(patch).where({ ID: it.ID });
            net += itemNet; tax += itemTax;
        }
        const totals = { netAmount: r2(net), taxAmount: r2(tax), totalAmount: r2(net + tax) };
        await UPDATE(H).set(totals).where({ ID: id });
        return totals;
    }

    async function buildRoute(h, cc) {
        const total = Number(h.totalAmount);
        const rows = await SELECT.from(Matrix).where({ active: true });
        const match = rows.filter(m =>
            (!m.currency_code || m.currency_code === h.currency_code) &&
            (!m.orgUnit || m.orgUnit === cc.orgUnit) &&
            (!m.category_code || m.category_code === h.category_code) &&
            total >= Number(m.minAmount) &&
            (m.maxAmount == null || total <= Number(m.maxAmount)));
        const byStep = new Map();
        for (const m of match) {
            const score = (m.orgUnit ? 1 : 0) + (m.category_code ? 1 : 0);
            const cur = byStep.get(m.stepNo);
            if (!cur || score > cur.score) byStep.set(m.stepNo, { ...m, score });
        }
        return [...byStep.values()].sort((a, b) => a.stepNo - b.stepNo);
    }

    function commitBudget(code, amount) {
        return UPDATE(CostCentre).set({ committedAmount: { '+=': Number(amount) } }).where({ code });
    }

    function releaseBudget(code, amount) {
        return UPDATE(CostCentre).set({ committedAmount: { '-=': Number(amount) } }).where({ code });
    }

    async function decide(req, decision, requisitionId) {
        const id = requisitionId || idOf(req);
        await loadHeader(id, req);
        return req.reject(409, 'Approval is done in SAP Build Process Automation (My Inbox)');
    }

    async function handOff(req, h, ref) {
        const items = await SELECT.from(Item).where({ requisition_ID: h.ID }).orderBy('itemNo');
        const payload = {
            requisitionNumber: h.reqNumber, requester: h.requester, title: h.title,
            costCentre: h.costCentre_code, category: h.category_code, projectRef: h.projectRef,
            deliveryLocation: h.deliveryLocation, currency: h.currency_code,
            netAmount: Number(h.netAmount), taxAmount: Number(h.taxAmount),
            totalAmount: Number(h.totalAmount),
            items: items.map(i => ({
                itemNo: i.itemNo, material: i.material, description: i.description,
                quantity: Number(i.quantity), uom: i.uom, unitPrice: Number(i.unitPrice),
                netAmount: Number(i.netAmount), needByDate: i.needByDate
            }))
        };
        const attempts = Number(ref.attempts || 0) + 1;
        try {
            const poNumber = await erp.createPurchaseOrder(payload, ref.idempotencyKey);
            await UPDATE(ERP).set({
                poNumber, publicationStatus: 'Published', attempts, lastError: null,
                lastAttemptAt: now(), publishedAt: now()
            }).where({ ID: ref.ID });
            await UPDATE(PR).set({ status: 'Published' }).where({ ID: h.ID });
            LOG.info(`${h.reqNumber} published as PO ${poNumber} (attempt ${attempts})`);
        } catch (e) {
            const msg = String(e.message || e).slice(0, 500);
            await UPDATE(ERP).set({
                publicationStatus: 'Failed', attempts, lastError: msg, lastAttemptAt: now()
            }).where({ ID: ref.ID });
            await UPDATE(PR).set({ status: 'Failed' }).where({ ID: h.ID });
            LOG.error(`${h.reqNumber} ERP hand-off failed (attempt ${attempts}): ${msg}`);
            req.warn(`ERP hand-off failed: ${msg}. The requisition is kept and can be retried.`);
        }
        return reread(h.ID);
    }

    async function releaseRequisition(req) {
        const id = idOf(req);
        const h = await loadHeader(id, req);
        if (h.status !== 'Approved')
            return req.reject(409, `Only approved requisitions can be released; this one is ${h.status}`);
        const existing = await SELECT.one.from(ERP).where({ requisition_ID: id });
        if (existing)
            return req.reject(409, 'An ERP hand-off already exists for this requisition; use retry');

        const ref = {
            ID: crypto.randomUUID(), requisition_ID: id, publicationStatus: 'Pending',
            idempotencyKey: crypto.randomUUID(), attempts: 0
        };
        await INSERT.into(ERP).entries(ref);
        return handOff(req, h, ref);
    }

    async function retryRequisition(req) {
        const id = idOf(req);
        const h = await loadHeader(id, req);
        if (h.status !== 'Failed')
            return req.reject(409, 'Only failed hand-offs can be retried');

        let ref = await SELECT.one.from(ERP).where({ requisition_ID: id });
        if (!ref) {
            ref = {
                ID: crypto.randomUUID(), requisition_ID: id, publicationStatus: 'Failed',
                idempotencyKey: crypto.randomUUID(), attempts: 0
            };
            await INSERT.into(ERP).entries(ref);
        }
        if (ref.publicationStatus === 'Published')
            return req.reject(409, `Already published as PO ${ref.poNumber}; nothing to retry`);
        return handOff(req, h, ref);
    }
});