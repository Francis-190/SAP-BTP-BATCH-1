const cds = require('@sap/cds');
const C = require('./lib/common');

module.exports = class MasterDataService extends cds.ApplicationService {
  async init() {
    const { Customer, CustomerContact, IssueCategory, SupportQueue } = C.E();
    const { Customers, CustomerContacts, Products, IssueCategories,
            SupportQueues, ServiceAgents, UserRoleAssignments, SLAPolicies } = this.entities;

    // ---------- Customer ----------
    this.before(['CREATE', 'UPDATE'], Customers, req => {
      const d = req.data;
      if ('name' in d && !d.name?.trim())           req.reject(400, 'Customer name cannot be empty');
      if (d.creditLimit != null && d.creditLimit < 0) req.reject(400, 'Credit limit cannot be negative');
      if (d.country && !/^[A-Z]{3}$/.test(d.country)) req.reject(400, 'Country must be a 3-letter code, e.g. IND');
    });

    // ---------- Contact ----------
    this.before(['CREATE', 'UPDATE'], CustomerContacts, async req => {
      const d = req.data;
      if (d.email && !C.isEmail(d.email)) req.reject(400, 'Invalid email format');
      if (req.event === 'CREATE') {
        if (!d.email && !d.phone) req.reject(400, 'Provide at least an email or a phone number');
        const cust = await SELECT.one.from(Customer).where({ ID: d.customer_ID });
        if (!cust)          req.reject(404, 'Customer not found');
        if (!cust.isActive) req.reject(400, 'Customer is inactive');
      }
    });

    // only one primary contact per customer
    this.after(['CREATE', 'UPDATE'], CustomerContacts, async (data, req) => {
      const row = { ...req.data, ...data };
      const c = await SELECT.one.from(CustomerContact).where({ ID: row.ID });
      if (c?.isPrimary)
        await UPDATE(CustomerContact).set({ isPrimary: false }).where({ customer_ID: c.customer_ID, ID: { '!=': c.ID } });
    });

    // ---------- Product ----------
    this.before(['CREATE', 'UPDATE'], Products, req => {
      const d = req.data;
      if (d.unitPrice != null && d.unitPrice < 0)           req.reject(400, 'Unit price cannot be negative');
      if (d.warrantyMonths != null && d.warrantyMonths < 0) req.reject(400, 'Warranty months cannot be negative');
      if (d.currency && !/^[A-Z]{3}$/.test(d.currency))     req.reject(400, 'Currency must be a 3-letter code, e.g. INR');
    });

    // ---------- Category / Queue: unique code ----------
    const uniqueCode = (entity) => async req => {
      const dup = await SELECT.one.from(entity).where({ code: req.data.code });
      if (dup) req.reject(409, `Code '${req.data.code}' already exists`);
    };
    this.before('CREATE', IssueCategories, uniqueCode(IssueCategory));
    this.before('CREATE', SupportQueues,   uniqueCode(SupportQueue));

    // ---------- Agent ----------
    this.before(['CREATE', 'UPDATE'], ServiceAgents, req => {
      if (req.data.email && !C.isEmail(req.data.email)) req.reject(400, 'Invalid email format');
    });

    // ---------- User Role Assignment ----------
    this.before('CREATE', UserRoleAssignments, async req => {
      const { agent_ID, role } = req.data;

      if (!agent_ID || !role)
        req.reject(400, 'Agent ID and role are required');

      const duplicate = await SELECT.one.from('complaint.mgmt.UserRoleAssignment')
        .where({ agent_ID, role });

      if (duplicate)
        req.reject(409, `Role '${role}' is already assigned to this user`);
    });

    // ---------- SLA policy ----------
    this.before(['CREATE', 'UPDATE'], SLAPolicies, req => {
      const d = req.data;
      if (d.firstResponseMins != null && d.firstResponseMins <= 0) req.reject(400, 'First response minutes must be > 0');
      if (d.resolutionMins != null && d.resolutionMins <= 0)       req.reject(400, 'Resolution minutes must be > 0');
      if (d.firstResponseMins != null && d.resolutionMins != null && d.resolutionMins < d.firstResponseMins)
        req.reject(400, 'Resolution time cannot be shorter than first response time');
      if (d.workStart && d.workEnd && d.workStart >= d.workEnd)
        req.reject(400, 'Work start must be before work end');
      if (d.workDays) {
        const ok = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        if (!d.workDays.split(',').every(x => ok.includes(x.trim().toUpperCase())))
          req.reject(400, 'workDays must look like MON,TUE,WED,THU,FRI');
      }
    });

    // ---------- Never delete, deactivate ----------
    this.before('DELETE', [Customers, Products, ServiceAgents], req =>
      req.reject(405, 'Records cannot be deleted. Set isActive = false instead.'));

    return super.init();
  }
};