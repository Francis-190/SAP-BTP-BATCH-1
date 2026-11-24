using complaint.mgmt as db from '../db/schema';

// ============================================================
//  1. MASTER DATA SERVICE
// ============================================================
@impl: './master-data-service.js'
@path: '/master-data'
service MasterDataService {

  @restrict: [
    { grant: 'READ', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager', 'SalesManager', 'Consultant', 'Finance'] },
    { grant: '*',    to: ['Admin', 'ServiceManager'] }
  ]
  entity Customers as projection on db.Customer;

  @restrict: [
    { grant: 'READ', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager', 'SalesManager', 'Consultant', 'Finance'] },
    { grant: '*',    to: ['Admin', 'ServiceManager'] }
  ]
  entity CustomerContacts as projection on db.CustomerContact;

  @restrict: [
    { grant: 'READ', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager', 'SalesManager', 'Consultant'] },
    { grant: '*',    to: ['Admin', 'ServiceManager', 'SalesManager'] }
  ]
  entity Products as projection on db.Product;

  @restrict: [
    { grant: 'READ', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager', 'Consultant'] },
    { grant: '*',    to: ['Admin', 'ServiceManager'] }
  ]
  entity IssueCategories as projection on db.IssueCategory;

  @restrict: [
    { grant: 'READ', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager', 'Consultant'] },
    { grant: '*',    to: ['Admin', 'ServiceManager', 'TeamLead'] }
  ]
  entity SupportQueues as projection on db.SupportQueue;

  @restrict: [
    { grant: 'READ', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager', 'SalesManager', 'Consultant'] },
    { grant: '*',    to: ['Admin', 'ServiceManager', 'TeamLead'] }
  ]
  entity ServiceAgents as projection on db.ServiceAgent {*,roles};

  @restrict: [
    { grant: 'READ', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager'] },
    { grant: '*',    to: ['Admin', 'ServiceManager'] }
  ]
  entity SLAPolicies as projection on db.SLAPolicy;

  @restrict: [
    { grant: 'READ', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager'] },
    { grant: '*',    to: ['Admin', 'ServiceManager'] }
]
  entity UserRoleAssignments as projection on db.UserRoleAssignment;
}


// ============================================================
//  2. TICKET SERVICE
// ============================================================
@impl: './ticket-service.js'
@path: '/tickets'
service TicketService {

  @restrict: [
    { grant: 'READ',   to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager', 'Consultant'] },
    { grant: 'CREATE', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager'] },
    { grant: 'UPDATE', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager'] },
    { grant: 'DELETE', to: ['Admin', 'ServiceManager'] }
  ]
  entity ServiceTickets as projection on db.ServiceTicket
    actions {
      // assignment
      @restrict: [{ grant: '*', to: ['Admin', 'TeamLead', 'ServiceManager'] }]
      action assign (agent : UUID);

      @restrict: [{ grant: '*', to: ['Admin', 'ServiceAgent', 'TeamLead'] }]
      action accept ();

      @restrict: [{ grant: '*', to: ['Admin', 'TeamLead', 'ServiceManager'] }]
      action reassign (agent : UUID, reason : String(250));

      @restrict: [{ grant: '*', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager'] }]
      action escalate (agent : UUID, reason : String(250));

      // work flow
      @restrict: [{ grant: '*', to: ['Admin', 'ServiceAgent', 'TeamLead'] }]
      action startWork ();

      @restrict: [{ grant: '*', to: ['Admin', 'ServiceAgent', 'TeamLead'] }]
      action waitForCustomer ();

      @restrict: [{ grant: '*', to: ['Admin', 'ServiceAgent', 'TeamLead'] }]
      action customerReplied ();

      @restrict: [{ grant: '*', to: ['Admin', 'ServiceAgent', 'TeamLead'] }]
      action resolve (resolutionNote : String(500));

      @restrict: [{ grant: '*', to: ['Admin', 'TeamLead', 'ServiceManager'] }]
      action close ();

      @restrict: [{ grant: '*', to: ['Admin', 'TeamLead', 'ServiceManager'] }]
      action reopen ();

      // sales hand-over
      @restrict: [{ grant: '*', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager', 'SalesManager'] }]
      action raiseOpportunity (owner : UUID, expectedValue : Decimal(15,2))
        returns { opportunityID : UUID; };

      // warranty check
      @restrict: [{ grant: '*', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager'] }]
      function checkWarranty () returns {
        underWarranty   : Boolean;
        warrantyEndDate : Date;
      };
    };

  // history of calls, emails and notes: add only, never edit or delete
  @restrict: [
    { grant: 'READ',   to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager', 'Consultant'] },
    { grant: 'CREATE', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager'] }
  ]
  entity Interactions as projection on db.Interaction;

   @restrict: [{ grant: '*', to: ['Admin', 'TeamLead', 'ServiceManager'] }]
      action checkSlaBreaches() returns String;

  // written by the handlers, so read-only through the API
  @restrict: [{ grant: 'READ', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager'] }]
  entity TicketAssignments as projection on db.TicketAssignment;

  @restrict: [{ grant: 'READ', to: ['Admin', 'ServiceAgent', 'TeamLead', 'ServiceManager'] }]
  
  entity SLAClocks as projection on db.SLAClock;


}


// ============================================================
//  3. SALES SERVICE
// ============================================================
@impl: './sales-service.js'
@path: '/sales'
service SalesService {

  @restrict: [
    { grant: 'READ',   to: ['Admin', 'SalesManager', 'ServiceManager', 'ServiceAgent', 'TeamLead', 'Consultant'] },
    { grant: 'CREATE', to: ['Admin', 'SalesManager'] },
    { grant: 'UPDATE', to: ['Admin', 'SalesManager'] },
    { grant: 'DELETE', to: ['Admin'] }
  ]
  entity Opportunities as projection on db.Opportunity
    actions {
      @restrict: [{ grant: '*', to: ['Admin', 'SalesManager'] }]
      action qualify ();

      @restrict: [{ grant: '*', to: ['Admin', 'SalesManager'] }]
      action markLost (reason : String(250));
    };

  @restrict: [
    { grant: 'READ',   to: ['Admin', 'SalesManager', 'ServiceManager', 'Consultant', 'Finance'] },
    { grant: 'CREATE', to: ['Admin', 'SalesManager'] },
    { grant: 'UPDATE', to: ['Admin', 'SalesManager'] },
    { grant: 'DELETE', to: ['Admin'] }
  ]
  entity Quotes as projection on db.Quote
    actions {
      @restrict: [{ grant: '*', to: ['Admin', 'SalesManager'] }]
      action submitForApproval ();

      // approval by someone other than the person who submitted
      @restrict: [{ grant: '*', to: ['Admin', 'ServiceManager'] }]
      action approve ();

      @restrict: [{ grant: '*', to: ['Admin', 'SalesManager', 'ServiceManager'] }]
      action reject ();

      @restrict: [{ grant: '*', to: ['Admin', 'SalesManager'] }]
      action send ();

      @restrict: [{ grant: '*', to: ['Admin', 'SalesManager'] }]
      action newVersion () returns { quoteID : UUID; };

      @restrict: [{ grant: '*', to: ['Admin', 'SalesManager'] }]
      action accept () returns { salesOrderID : UUID; };
    };

  @restrict: [
    { grant: 'READ', to: ['Admin', 'SalesManager', 'ServiceManager', 'Consultant', 'Finance'] },
    { grant: '*',    to: ['Admin', 'SalesManager'] }
  ]
  entity QuoteItems as projection on db.QuoteItem;
}


// ============================================================
//  4. ORDER SERVICE
// ============================================================
@impl: './order-service.js'
@path: '/orders'
service OrderService {

  @restrict: [
    { grant: 'READ',   to: ['Admin', 'SalesManager', 'ServiceManager', 'Finance', 'Consultant'] },
    { grant: 'CREATE', to: ['Admin', 'SalesManager'] },
    { grant: 'UPDATE', to: ['Admin', 'SalesManager'] },
    { grant: 'DELETE', to: ['Admin'] }
  ]
  entity SalesOrders as projection on db.SalesOrder
    actions {
      @restrict: [{ grant: '*', to: ['Admin', 'SalesManager'] }]
      action confirm ();

      @restrict: [{ grant: '*', to: ['Admin', 'SalesManager', 'ServiceManager'] }]
      action startFulfil ();

      @restrict: [{ grant: '*', to: ['Admin', 'SalesManager', 'ServiceManager'] }]
      action markDelivered (deliveryDate : Date);

      @restrict: [{ grant: '*', to: ['Admin', 'SalesManager'] }]
      action cancel ();

      @restrict: [{ grant: '*', to: ['Admin', 'SalesManager', 'Finance'] }]
      action createInvoice (dueInDays : Integer) returns { invoiceID : UUID; };
    };

  @restrict: [
    { grant: 'READ', to: ['Admin', 'SalesManager', 'ServiceManager', 'Finance'] },
    { grant: '*',    to: ['Admin', 'SalesManager'] }
  ]
  entity SalesOrderItems as projection on db.SalesOrderItem;

  @restrict: [
    { grant: 'READ',   to: ['Admin', 'ServiceManager', 'ServiceAgent', 'TeamLead', 'SalesManager'] },
    { grant: 'CREATE', to: ['Admin', 'ServiceManager', 'ServiceAgent'] },
    { grant: 'UPDATE', to: ['Admin', 'ServiceManager'] },
    { grant: 'DELETE', to: ['Admin'] }
  ]
  entity ServiceOrders as projection on db.ServiceOrder
    actions {
      @restrict: [{ grant: '*', to: ['Admin', 'ServiceManager', 'ServiceAgent'] }]
      action start ();

      @restrict: [{ grant: '*', to: ['Admin', 'ServiceManager', 'ServiceAgent'] }]
      action complete ();

      @restrict: [{ grant: '*', to: ['Admin', 'ServiceManager'] }]
      action cancel ();
    };
}


// ============================================================
//  5. BILLING SERVICE
// ============================================================
@impl: './billing-service.js'
@path: '/billing'
service BillingService {

  // invoices are created from OrderService.createInvoice, never directly
  @restrict: [
    { grant: 'READ',   to: ['Admin', 'Finance', 'SalesManager'] },
    { grant: 'UPDATE', to: ['Admin', 'Finance'] }
  ]
  entity Invoices as projection on db.Invoice
    actions {
      @restrict: [{ grant: '*', to: ['Admin', 'Finance'] }]
      action cancel ();
    };

  @restrict: [
    { grant: 'READ', to: ['Admin', 'Finance', 'SalesManager'] },
    { grant: '*',    to: ['Admin', 'Finance'] }
  ]
  entity Payments as projection on db.Payment;

  @requires: 'Finance'
  action checkOverdueInvoices() returns String;
}
@impl: './session-service.js'
@path: '/session'
service SessionService {

    type CurrentUser {
        userId      : String(255);
        displayName : String(255);
        email       : String(255);
        role        : String(50);
    }

    function me() returns CurrentUser;
}