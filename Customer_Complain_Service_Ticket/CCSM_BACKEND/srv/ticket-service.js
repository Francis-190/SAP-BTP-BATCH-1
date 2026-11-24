const cds = require('@sap/cds');
const C = require('./lib/common');
const { publishAlert } = require('./lib/alert-notification');

module.exports = class TicketService extends cds.ApplicationService {
  async init() {
    const { ServiceTicket, Customer, CustomerContact, IssueCategory, Product, SalesOrder, SalesOrderItem,
            ServiceAgent, SLAClock, TicketAssignment, Interaction, Opportunity } = C.E();
    const { ServiceTickets, Interactions, TicketAssignments, SLAClocks } = this.entities;

    // ---------- helpers ----------
    const loadTicket = async req => {
      const t = await SELECT.one.from(ServiceTicket).where({ ID: C.getId(req) });
      if (!t) req.reject(404, 'Ticket not found');
      return t;
    };
    const loadAgent = async (req, id, label = 'Agent') => {
      const a = id && await SELECT.one.from(ServiceAgent).where({ ID: id });
      if (!a)          req.reject(404, `${label} not found`);
      if (!a.isActive) req.reject(400, `${label} is inactive`);
      return a;
    };
    const addAssignment = (ticketID, agentID, action) =>
      INSERT.into(TicketAssignment).entries({ ticket_ID: ticketID, agent_ID: agentID, action, assignedAt: C.now() });

    // =====================================================
    //  CREATE TICKET
    // =====================================================
    this.before('CREATE', ServiceTickets, async req => {
      const d = req.data;
      if (!d.title?.trim()) req.reject(400, 'Title is required');

      const customer = await SELECT.one.from(Customer).where({ ID: d.customer_ID });
      if (!customer)          req.reject(404, 'Customer not found');
      if (!customer.isActive) req.reject(400, 'Customer is inactive');

      const contact = await SELECT.one.from(CustomerContact).where({ ID: d.contact_ID });
      if (!contact || contact.customer_ID !== customer.ID)
        req.reject(400, 'Contact does not belong to this customer');

      const category = await SELECT.one.from(IssueCategory).where({ ID: d.category_ID });
      if (!category) req.reject(404, 'Category not found');

      if (d.product_ID && !(await SELECT.one.from(Product).where({ ID: d.product_ID })))
        req.reject(404, 'Product not found');

      if (d.salesOrder_ID) {
        const so = await SELECT.one.from(SalesOrder).where({ ID: d.salesOrder_ID });
        if (!so) req.reject(404, 'Sales order not found');
        if (so.customer_ID !== customer.ID) req.reject(400, 'Sales order belongs to a different customer');
        if (d.product_ID && !(await SELECT.one.from(SalesOrderItem).where({ salesOrder_ID: so.ID, product_ID: d.product_ID })))
          req.reject(400, 'This product is not part of the given sales order');
      }

      // system-controlled values (anything sent by the client is overwritten)
      d.ticketNo = await C.nextNo('T', ServiceTicket);
      d.status   = 'New';
      d.priority = C.PRIORITY[category.defaultSeverity || 'Minor'][customer.tier || 'Standard'];
    });

           // start both SLA clocks
   
this.after('CREATE', ServiceTickets, async (data, req) => {

    const row = { ...req.data, ...data };

    console.log(
        '[SLA] row:',
        row.ID,
        row.customer_ID,
        row.priority
    );

    // =========================================
    // 1. CRITICAL COMPLAINT ALERT
    // =========================================

    try {

        const category = await SELECT.one
            .from('complaint.mgmt.IssueCategory')
            .where({ ID: row.category_ID });

        if (category?.defaultSeverity === 'Critical') {

            await publishAlert({

                eventType: 'COMPLAINT_CRITICAL_CREATED',

                subject:
                    `Critical complaint created: ${row.ticketNo || row.ID}`,

                body:
                    `CRITICAL COMPLAINT ALERT

Ticket Number: ${row.ticketNo || row.ID}
Ticket ID: ${row.ID}
Title: ${row.title}
Priority: ${row.priority}
Customer ID: ${row.customer_ID}
Category: ${category.name}

Please investigate this complaint immediately.`,

                tags: {
                    ticketID: row.ID,
                    ticketNo: row.ticketNo || '',
                    customerID: row.customer_ID || '',
                    priority: row.priority || '',
                    category: category.name,
                    severity: 'Critical'
                }
            });

            console.log(
                '[ALERT] Critical complaint alert sent:',
                row.ID
            );
        }

    } catch (error) {

        console.error(
            '[ALERT] Critical complaint alert failed:',
            error.message
        );

    }

    // =========================================
    // 2. EXISTING SLA CLOCK CREATION LOGIC
    // =========================================

    const customer = await SELECT.one
        .from(Customer)
        .where({ ID: row.customer_ID });

    if (!customer) {
        console.error(
            '[SLA] customer not found for',
            row.customer_ID
        );

        return req.warn(
            'Customer lookup failed, SLA clocks not created'
        );
    }

    const policy = await C.findPolicy(
        row.priority,
        customer.tier
    );

    if (!policy) {
        return req.warn(
            `No active SLA policy for ${row.priority} / ${customer.tier}. SLA clocks not created.`
        );
    }

    await C.createClocks(row.ID, policy);

});

    // =====================================================
    //  PROTECT SYSTEM FIELDS
    // =====================================================
   

this.before('UPDATE', ServiceTickets, async req => {

    const ticketID = C.getId(req);

    // Fetch existing ticket
    const ticket = await SELECT.one
        .from(ServiceTicket)
        .columns('ID', 'status')
        .where({ ID: ticketID });

    if (!ticket) {
        req.reject(404, 'Ticket not found');
    }

    // Prevent editing resolved or closed tickets
    if (['Resolved', 'Closed'].includes(ticket.status)) {
        req.reject(409, 'Resolved or closed tickets cannot be edited.');
    }

    // Protect system-controlled fields
    const locked = [
        'ticketNo',
        'status',
        'priority',
        'resolvedAt',
        'assignedAgent_ID',
        'customer_ID',
        'contact_ID',
        'category_ID'
    ].filter(field => field in req.data);

    if (locked.length) {
        req.reject(
            400,
            `${locked.join(', ')} cannot be changed directly.`
        );
    }

    // Validate title
    if ('title' in req.data && !req.data.title?.trim()) {
        req.reject(400, 'Ticket title is required.');
    }

    // Validate product if supplied
    if ('product_ID' in req.data && req.data.product_ID) {
        const product = await SELECT.one
            .from(Product)
            .where({ ID: req.data.product_ID });

        if (!product) {
            req.reject(404, 'Product not found.');
        }
    }

});


    this.before('DELETE', ServiceTickets, req => req.reject(405, 'Tickets cannot be deleted. Close them instead.'));
    this.before(['CREATE', 'UPDATE', 'DELETE'], [TicketAssignments, SLAClocks], req =>
      req.reject(405, 'Read-only. This data changes automatically through ticket actions.'));

    // =====================================================
    //  ASSIGNMENT ACTIONS
    // =====================================================
    this.on('assign', ServiceTickets, async req => {
      const t = await loadTicket(req);
      C.assertStatus(req, t.status, ['New', 'Reopened'], 'Ticket');
      const agent = await loadAgent(req, req.data.agent);
      if (agent.department !== 'Service') req.reject(400, 'Only a Service agent can be assigned to a ticket');
      await addAssignment(t.ID, agent.ID, 'Assign');
      await UPDATE(ServiceTicket).set({ assignedAgent_ID: agent.ID, status: 'Assigned' }).where({ ID: t.ID });
    });

    this.on('accept', ServiceTickets, async req => {
      const t = await loadTicket(req);
      C.assertStatus(req, t.status, ['Assigned'], 'Ticket');
      await addAssignment(t.ID, t.assignedAgent_ID, 'Accept');
    });

    this.on('reassign', ServiceTickets, async req => {
      const t = await loadTicket(req);
      C.assertStatus(req, t.status, ['Assigned', 'In Progress', 'Waiting for Customer'], 'Ticket');
      if (!req.data.reason?.trim()) req.reject(400, 'Reason is required');
      const agent = await loadAgent(req, req.data.agent);
      if (agent.ID === t.assignedAgent_ID) req.reject(400, 'Ticket is already assigned to this agent');
      await addAssignment(t.ID, agent.ID, 'Reassign');
      await UPDATE(ServiceTicket).set({ assignedAgent_ID: agent.ID }).where({ ID: t.ID });
    });

    this.on('escalate', ServiceTickets, async req => {
      const t = await loadTicket(req);
      C.assertStatus(req, t.status, ['Assigned', 'In Progress', 'Waiting for Customer'], 'Ticket');
      if (!req.data.reason?.trim()) req.reject(400, 'Reason is required');
      const agent = await loadAgent(req, req.data.agent);
      if (!['TeamLead', 'Manager'].includes(agent.role)) req.reject(400, 'Escalation target must be a Team Lead or Manager');
      if (agent.ID === t.assignedAgent_ID) req.reject(400, 'Ticket is already assigned to this person');
      await addAssignment(t.ID, agent.ID, 'Escalate');
      await UPDATE(ServiceTicket).set({ assignedAgent_ID: agent.ID }).where({ ID: t.ID });
    });

    // =====================================================
    //  WORK FLOW ACTIONS
    // =====================================================
    this.on('startWork', ServiceTickets, async req => {
      const t = await loadTicket(req);
      C.assertStatus(req, t.status, ['Assigned', 'Reopened'], 'Ticket');
      await UPDATE(ServiceTicket).set({ status: 'In Progress' }).where({ ID: t.ID });
    });

    this.on('waitForCustomer', ServiceTickets, async req => {
      const t = await loadTicket(req);
      C.assertStatus(req, t.status, ['In Progress'], 'Ticket');
      await UPDATE(ServiceTicket).set({ status: 'Waiting for Customer' }).where({ ID: t.ID });
      await UPDATE(SLAClock).set({ status: 'Paused', pausedAt: C.now() })
        .where({ ticket_ID: t.ID, clockType: 'RESOLUTION', status: 'Running' });
    });

    this.on('customerReplied', ServiceTickets, async req => {
      const t = await loadTicket(req);
      C.assertStatus(req, t.status, ['Waiting for Customer'], 'Ticket');
      await UPDATE(ServiceTicket).set({ status: 'In Progress' }).where({ ID: t.ID });
      const clock = await SELECT.one.from(SLAClock).where({ ticket_ID: t.ID, clockType: 'RESOLUTION', status: 'Paused' });
      if (clock) {
        const mins = Math.ceil((Date.now() - new Date(clock.pausedAt)) / 60000);
        await UPDATE(SLAClock).set({
          status: 'Running', pausedAt: null,
          totalPausedMins: (clock.totalPausedMins || 0) + mins,
          dueAt: new Date(new Date(clock.dueAt).getTime() + mins * 60000).toISOString()   // deadline moves out
        }).where({ ID: clock.ID });
      }
    });

    this.on('resolve', ServiceTickets, async req => {
      const t = await loadTicket(req);
      C.assertStatus(req, t.status, ['In Progress'], 'Ticket');
      const note = req.data.resolutionNote?.trim();
      if (!note) req.reject(400, 'Resolution note is required');
      await UPDATE(ServiceTicket).set({ status: 'Resolved', resolvedAt: C.now() }).where({ ID: t.ID });
      await C.stopClock(t.ID, 'RESOLUTION');
      await C.stopClock(t.ID, 'FIRST_RESPONSE');      // resolving also counts as a response
      await INSERT.into(Interaction).entries({
        ticket_ID: t.ID, type: 'Note', message: `Resolution: ${note}`,
        author_ID: t.assignedAgent_ID, contactedAt: C.now()
      });
    });

    this.on('close', ServiceTickets, async req => {
      const t = await loadTicket(req);
      C.assertStatus(req, t.status, ['Resolved'], 'Ticket');
      await UPDATE(ServiceTicket).set({ status: 'Closed' }).where({ ID: t.ID });
    });

    this.on('reopen', ServiceTickets, async req => {
      const t = await loadTicket(req);
      C.assertStatus(req, t.status, ['Resolved', 'Closed'], 'Ticket');
      if (!t.resolvedAt || Date.now() - new Date(t.resolvedAt) > 7 * 24 * 3600 * 1000)
        req.reject(409, 'Reopen window (7 days after resolution) is over. Please create a new ticket.');
      await UPDATE(ServiceTicket).set({ status: 'Reopened', resolvedAt: null }).where({ ID: t.ID });
      // new resolution clock
      const customer = await SELECT.one.from(Customer).where({ ID: t.customer_ID });
      const policy   = await C.findPolicy(t.priority, customer.tier);
      if (policy) await C.createClocks(t.ID, policy, ['RESOLUTION']);
    });


// =====================================================
// SLA MONITORING + ALERT NOTIFICATION
// =====================================================

this.on('checkSlaBreaches', async (req) => {

    const clocks = await SELECT.from(SLAClock)
        .where({ status: 'Running' });

    let breachedCount = 0;
    let alertCount = 0;

    const now = new Date();

    for (const clock of clocks) {

        // Ignore clocks without a deadline
        if (!clock.dueAt) {
            continue;
        }

        // Check whether SLA deadline has passed
        if (new Date(clock.dueAt) < now) {

            // Update SLA clock status
            await UPDATE(SLAClock)
                .set({
                    status: 'Breached',
                    stoppedAt: C.now()
                })
                .where({
                    ID: clock.ID,
                    status: 'Running'
                });

            breachedCount++;

            // Fetch corresponding ticket
            const ticket = await SELECT.one
                .from(ServiceTicket)
                .where({ ID: clock.ticket_ID });

            if (!ticket) {
                console.error(
                    '[SLA] Ticket not found:',
                    clock.ticket_ID
                );
                continue;
            }

            // Send SLA breach alert
            try {

                await publishAlert({

                    eventType: 'COMPLAINT_SLA_BREACHED',

                    subject:
                        `SLA breached for ticket ${ticket.ticketNo}`,

                    body:
                        `SLA BREACH ALERT

Ticket Number: ${ticket.ticketNo}
Ticket ID: ${ticket.ID}
Title: ${ticket.title}

Clock Type: ${clock.clockType}
SLA Due Date: ${clock.dueAt}
Ticket Priority: ${ticket.priority}
Ticket Status: ${ticket.status}

Please take immediate action.`,

                    severity: 'ERROR',

                    tags: {
                        ticketNo: ticket.ticketNo,
                        ticketID: ticket.ID,
                        clockType: clock.clockType,
                        priority: ticket.priority,
                        dueAt: String(clock.dueAt)
                    }
                });

                alertCount++;

                console.log(
                    '[SLA ALERT] Breach alert sent:',
                    ticket.ticketNo,
                    clock.clockType
                );

            } catch (error) {

                console.error(
                    '[SLA ALERT] Failed:',
                    error.message
                );

            }
        }
    }

    console.log(
        `[SLA] Monitoring completed. ${breachedCount} clocks breached. ${alertCount} alerts sent.`
    );

    return `SLA monitoring completed. ${breachedCount} clocks breached. ${alertCount} alerts sent.`;

});


    // =====================================================
    //  HAND OVER TO SALES
    // =====================================================
    this.on('raiseOpportunity', ServiceTickets, async req => {
      const t = await loadTicket(req);
      C.assertStatus(req, t.status, ['Assigned', 'In Progress', 'Waiting for Customer', 'Resolved'], 'Ticket');
      const owner = await loadAgent(req, req.data.owner, 'Owner');
      if (owner.department !== 'Sales') req.reject(400, 'Opportunity owner must be a Sales user');
      if (req.data.expectedValue != null && req.data.expectedValue < 0) req.reject(400, 'Expected value cannot be negative');
      if (await C.hasOpenOpportunity(t.ID)) req.reject(409, 'This ticket already has an open opportunity');

      const ID = cds.utils.uuid();
      await INSERT.into(Opportunity).entries({
        ID, oppNo: await C.nextNo('OPP', Opportunity), ticket_ID: t.ID,
        owner_ID: owner.ID, stage: 'Prospecting', expectedValue: req.data.expectedValue
      });
      return { opportunityID: ID };
    });

    // =====================================================
    //  WARRANTY CHECK (function)
    // =====================================================
    this.on('checkWarranty', ServiceTickets, async req => {
      const info = await C.warrantyInfo(C.getId(req));
      if (info.error) req.reject(400, info.error);
      return info;
    });

    // =====================================================
    //  INTERACTIONS
    // =====================================================
    this.before('CREATE', Interactions, async req => {
      const d = req.data;
      const t = await SELECT.one.from(ServiceTicket).where({ ID: d.ticket_ID });
      if (!t) req.reject(404, 'Ticket not found');
      if (t.status === 'Closed') req.reject(409, 'Cannot add interactions to a Closed ticket');
      if (!d.message?.trim()) req.reject(400, 'Message is required');
      if (d.author_ID) await loadAgent(req, d.author_ID, 'Author');
      d.contactedAt ??= C.now();
    });

        // first Call/Email written by an agent = first response
    this.after('CREATE', Interactions, async (data, req) => {
      const row = { ...req.data, ...data };
      if (['Call', 'Email'].includes(row.type) && row.author_ID)
        await C.stopClock(row.ticket_ID, 'FIRST_RESPONSE');
    });
    // =====================================================
    //  slaState (virtual field) = calculated on read
    // =====================================================
    this.after('READ', ServiceTickets, async data => {
      const list = (Array.isArray(data) ? data : [data]).filter(t => t?.ID);
      if (!list.length) return;
      const clocks = await SELECT.from(SLAClock).where({ ticket_ID: { in: list.map(t => t.ID) } });
      for (const t of list) t.slaState = C.slaStateOf(clocks.filter(c => c.ticket_ID === t.ID));
    });

    return super.init();
  }
};