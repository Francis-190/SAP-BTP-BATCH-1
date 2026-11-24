'use strict';
const cds = require('@sap/cds');
const { SELECT } = cds.ql;
const APPROVER_ROLES = ['Manager', 'Finance'];

const isBlank = v => v == null || String(v).trim() === '';
const isNumber = v => v !== null && v !== '' && Number.isFinite(Number(v));
//Generates the next code like CC1001, CC1002, ...
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

module.exports = cds.service.impl(async function () {

    const { CostCentres, PurchaseCategories, ApprovalMatrix, Materials } = this.entities;
    const {
        PurchaseRequisition, RequisitionItem,
        CostCentre, PurchaseCategory, ApprovalMatrix: Matrix, Material
    } = cds.entities('pr');

    //COST CENTRES
    this.before('CREATE', CostCentres, async (req) => {
        req.data.committedAmount = 0;
        req.data.code = await nextCode('CostCentre', 'code', 'CC', 4, 1000);
    });

    this.before('UPDATE', CostCentres, (req) => {
        delete req.data.committedAmount; 
    });

    this.before(['CREATE', 'UPDATE'], CostCentres, async (req) => {
        const existing = req.event === 'UPDATE'
            ? await SELECT.one.from(CostCentre).where({ code: req.data.code }) : null;
        if (req.event === 'UPDATE' && !existing) return req.reject(404, 'Cost centre not found.');
        const d = { ...existing, ...req.data };

        if (isBlank(d.name)) req.error(400, 'Cost Centre name is mandatory.', 'name');
        if (isBlank(d.orgUnit)) req.error(400, 'Organizational Unit is mandatory.', 'orgUnit');
        if (isBlank(d.currency_code)) req.error(400, 'Currency is mandatory.', 'currency_code');

        if (!isNumber(d.budgetAmount) || Number(d.budgetAmount) < 0)
            req.error(400, 'Budget amount cannot be negative.', 'budgetAmount');

        if (existing) {
            const committed = Number(existing.committedAmount || 0);
            if (isNumber(d.budgetAmount) && Number(d.budgetAmount) < committed)
                req.error(409, `Budget cannot be lower than the already committed amount (${committed.toFixed(2)}).`, 'budgetAmount');
            if (committed > 0 && d.currency_code !== existing.currency_code)
                req.error(409, 'Currency cannot be changed while budget is committed to open requisitions.', 'currency_code');
        }

        if (d.active !== false && (isBlank(d.managerId) || isBlank(d.financeApproverId)))
            req.warn('Manager and Finance approver should be maintained, otherwise requisitions on this cost centre cannot be submitted.');
    });

    this.before('DELETE', CostCentres, async (req) => {
        const used = await SELECT.one.from(PurchaseRequisition).columns('ID')
            .where({ costCentre_code: req.data.code });
        if (used) return req.reject(409, 'Cost centre is used by requisitions; deactivate it instead.');
        const cc = await SELECT.one.from(CostCentre).columns('committedAmount')
            .where({ code: req.data.code });
        if (cc && Number(cc.committedAmount) > 0)
            return req.reject(409, 'Cost centre has committed budget; deactivate it instead.');
    });

    //PURCHASE CATEGORIES
    this.before(['CREATE', 'UPDATE'], PurchaseCategories, async (req) => {
        const existing = req.event === 'UPDATE'
            ? await SELECT.one.from(PurchaseCategory).where({ code: req.data.code }) : null;
        if (req.event === 'UPDATE' && !existing) return req.reject(404, 'Purchase category not found.');
        const d = { ...existing, ...req.data };

        if (isBlank(d.code)) req.error(400, 'Purchase Category code is mandatory.', 'code');
        if (isBlank(d.name)) req.error(400, 'Purchase Category name is mandatory.', 'name');
        if (d.defaultTaxRate != null &&
            (!isNumber(d.defaultTaxRate) || Number(d.defaultTaxRate) < 0 || Number(d.defaultTaxRate) > 100))
            req.error(400, 'Default tax rate must be between 0 and 100.', 'defaultTaxRate');
    });

    this.before('DELETE', PurchaseCategories, async (req) => {
        const code = req.data.code;
        const usedByPR = await SELECT.one.from(PurchaseRequisition).columns('ID')
            .where({ category_code: code });
        if (usedByPR) return req.reject(409, 'Category is used by requisitions and cannot be deleted.');
        const usedByMatrix = await SELECT.one.from(Matrix).columns('ID')
            .where({ category_code: code });
        if (usedByMatrix) return req.reject(409, 'Category is used in the approval matrix; remove those rows first.');
    });

    //APPROVAL MATRIX 
    this.before(['CREATE', 'UPDATE'], ApprovalMatrix, async (req) => {
        const existing = req.event === 'UPDATE'
            ? await SELECT.one.from(Matrix).where({ ID: req.data.ID }) : null;
        if (req.event === 'UPDATE' && !existing) return req.reject(404, 'Approval matrix row not found.');
        const d = { ...existing, ...req.data };

        const min = d.minAmount == null ? 0 : d.minAmount;
        const max = d.maxAmount == null || d.maxAmount === '' ? null : d.maxAmount;

        if (!isNumber(min) || Number(min) < 0)
            req.error(400, 'Minimum amount cannot be negative.', 'minAmount');
        if (max != null && !isNumber(max))
            req.error(400, 'Maximum amount must be a number.', 'maxAmount');
        if (isNumber(min) && max != null && isNumber(max) && Number(max) < Number(min))
            req.error(400, 'Maximum amount cannot be lower than the minimum amount.', 'maxAmount');

        if (!isNumber(d.stepNo) || !Number.isInteger(Number(d.stepNo)) || Number(d.stepNo) < 1)
            req.error(400, 'Step number must be a positive integer.', 'stepNo');

        if (isBlank(d.approverRole))
            req.error(400, 'Approver role is mandatory.', 'approverRole');
        else if (!APPROVER_ROLES.includes(d.approverRole))
            req.error(400, `Approver role must be one of: ${APPROVER_ROLES.join(', ')}.`, 'approverRole');

        if (d.category_code &&
            !(await SELECT.one.from(PurchaseCategory).columns('code').where({ code: d.category_code })))
            req.error(400, `Purchase category ${d.category_code} does not exist.`, 'category_code');

        if (req.errors) return; 
        if (d.active === false) return;
        const siblings = await SELECT.from(Matrix).where({ active: true, stepNo: Number(d.stepNo) });
        const same = (a, b) => (a || null) === (b || null);
        const aMin = Number(min);
        const aMax = max == null ? Infinity : Number(max);
        const clash = siblings.find(s =>
            s.ID !== d.ID &&
            same(s.currency_code, d.currency_code) &&
            same(s.orgUnit, d.orgUnit) &&
            same(s.category_code, d.category_code) &&
            aMin <= (s.maxAmount == null ? Infinity : Number(s.maxAmount)) &&
            Number(s.minAmount) <= aMax);
        if (clash)
            req.error(409, `Step ${d.stepNo} already has an active rule for this scope that overlaps ` +
                `${clash.minAmount}-${clash.maxAmount ?? 'no limit'}. Adjust the amount ranges.`, 'minAmount');
    });

    //MATERIALS
    this.before(['CREATE', 'UPDATE'], Materials, async (req) => {
        const existing = req.event === 'UPDATE'
            ? await SELECT.one.from(Material).where({ code: req.data.code }) : null;
        if (req.event === 'UPDATE' && !existing) return req.reject(404, 'Material not found.');
        const d = { ...existing, ...req.data };

        if (isBlank(d.code)) req.error(400, 'Material code is mandatory.', 'code');
        if (isBlank(d.description)) req.error(400, 'Material description is mandatory.', 'description');
        if (isBlank(d.uom)) req.error(400, 'Unit of measure is mandatory.', 'uom');
        if (!isNumber(d.unitPrice) || Number(d.unitPrice) < 0)
            req.error(400, 'Unit price cannot be negative.', 'unitPrice');
    });

    this.before('DELETE', Materials, async (req) => {
        const used = await SELECT.one.from(RequisitionItem).columns('ID')
            .where({ material: req.data.code });
        if (used) return req.reject(409, 'Material is used on requisition items and cannot be deleted.');
    });
});