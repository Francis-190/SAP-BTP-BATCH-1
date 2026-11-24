namespace complaint.mgmt;

using { cuid, managed } from '@sap/cds/common';

// ============================================================
//  ENUM TYPES
// ============================================================
type CustomerTier : String(10) enum { Platinum; Gold; Silver; Standard; };
type Severity     : String(8)  enum { Critical; Major; Minor; };
type Priority     : String(2)  enum { P1; P2; P3; P4; };
type UserRole : String(20) enum {
  Admin;
  ServiceAgent;
  TeamLead;
  ServiceManager;
  SalesManager;
  Consultant;
  Finance;
};
type Department   : String(10) enum { Sales; Service; };

type TicketStatus : String(20) enum {
  New; Assigned; InProgress = 'In Progress';
  WaitingCustomer = 'Waiting for Customer';
  Resolved; Closed; Reopened;
};
type SlaState        : String(10) enum { OnTrack = 'On Track'; AtRisk = 'At Risk'; Breached; };
type InteractionType : String(15) enum { Call; Email; Note; };
type AssignAction    : String(10) enum { Assign; Accept; Reassign; Escalate; };
type ClockType       : String(15) enum { FIRST_RESPONSE; RESOLUTION; };
type ClockStatus     : String(10) enum { Running; Paused; Met; Breached; };

type ProductType  : String(10) enum { VIRTUAL; PHYSICAL; SERVICE; };
type BillingModel : String(12) enum { ONE_TIME; SUBSCRIPTION; USAGE_BASED; MILESTONE; };

type OppStage : String(15) enum {
  Prospecting; Qualification; Proposal; Negotiation;
  ClosedWon = 'Closed Won'; ClosedLost = 'Closed Lost';
};
type QuoteStatus : String(18) enum {
  Draft; PendingApproval = 'Pending Approval'; Approved; Sent; Accepted; Rejected; Expired;
};
type OrderStatus : String(15) enum {
  Created; Confirmed; InFulfilment = 'In Fulfilment'; Delivered; Invoiced; Closed; Cancelled;
};
type ServiceOrderType : String(16) enum {
  Installation; Onboarding; WarrantyRepair = 'Warranty Repair'; PaidSupport = 'Paid Support'; AMC;
};
type ServiceOrderStatus : String(12) enum { Planned; InProgress = 'In Progress'; Completed; Cancelled; };
type InvoiceStatus : String(15) enum { Open; PartiallyPaid = 'Partially Paid'; Paid; Overdue; Cancelled; };
type PaymentMethod : String(15) enum { BankTransfer = 'Bank Transfer'; Cheque; Card; UPI; };


// ============================================================
//  1. MASTER DATA
// ============================================================
entity Customer : cuid, managed {
  customerNo   : String(20)  @mandatory;
  name         : String(120) @mandatory;
  tier         : CustomerTier default 'Standard';
  country      : String(3);
  address      : String(250);
  creditLimit  : Decimal(15,2);
  isActive     : Boolean default true;
  contacts     : Composition of many CustomerContact on contacts.customer = $self;
}

entity CustomerContact : cuid, managed {
  customer   : Association to Customer @mandatory;
  firstName  : String(60);
  lastName   : String(60);
  email      : String(120);               // used to match incoming emails
  phone      : String(20);                // used to match incoming calls
  isPrimary  : Boolean default false;
}

entity Product : cuid, managed {
  productCode    : String(30)  @mandatory;
  name           : String(120) @mandatory;
  productType    : ProductType  @mandatory;
  billingModel   : BillingModel @mandatory;
  unitPrice      : Decimal(15,2);
  currency       : String(3);
  warrantyMonths : Integer default 0;
  isActive       : Boolean default true;
}

entity IssueCategory : cuid {
  code            : String(20) @mandatory;
  name            : String(80) @mandatory;
  defaultSeverity : Severity;
  defaultQueue    : Association to SupportQueue;
}

entity SupportQueue : cuid {
  code     : String(20) @mandatory;
  name     : String(80) @mandatory;
  teamLead : Association to ServiceAgent;
}

entity ServiceAgent : cuid, managed {
  userId      : String(100);
  name        : String(100) @mandatory;
  email       : String(120);
  department  : Department;
  roles       : Composition of many UserRoleAssignment
                  on roles.agent = $self;
  queue       : Association to SupportQueue;
  isActive    : Boolean default true;
}

entity UserRoleAssignment : cuid {
  agent : Association to ServiceAgent @mandatory;
  role  : UserRole @mandatory;
}

// ============================================================
//  2. SLA CONFIGURATION
// ============================================================
entity SLAPolicy : cuid {
  name              : String(80)   @mandatory;
  priority          : Priority     @mandatory;
  customerTier      : CustomerTier @mandatory;
  firstResponseMins : Integer      @mandatory;
  resolutionMins    : Integer      @mandatory;
  workStart         : Time;
  workEnd           : Time;
  workDays          : String(20);          // e.g. MON,TUE,WED,THU,FRI
  isActive          : Boolean default true;
}


// ============================================================
//  3. TICKET
// ============================================================
entity ServiceTicket : cuid, managed {
  ticketNo      : String(20);                       // T-YYYY-NNNNNN (generated)
  customer      : Association to Customer        @mandatory;
  contact       : Association to CustomerContact @mandatory;
  product       : Association to Product;           // product the complaint is about
  salesOrder    : Association to SalesOrder;        // original purchase (warranty check)
  title         : String(200) @mandatory;
  description   : LargeString;
  category      : Association to IssueCategory @mandatory;
  priority      : Priority;                         // derived from category severity + customer tier
  status        : TicketStatus default 'New';
  assignedAgent : Association to ServiceAgent;
  resolvedAt    : Timestamp;

  virtual slaState : SlaState;                      // calculated from SLAClock

  interactions  : Composition of many Interaction      on interactions.ticket = $self;
  assignments   : Composition of many TicketAssignment on assignments.ticket  = $self;
  slaClocks     : Composition of many SLAClock         on slaClocks.ticket    = $self;
}

entity Interaction : cuid {
  ticket      : Association to ServiceTicket @mandatory;
  type        : InteractionType @mandatory;         // Call / Email / Note
  message     : LargeString;
  author      : Association to ServiceAgent;
  contactedAt : Timestamp;
}

entity TicketAssignment : cuid {
  ticket     : Association to ServiceTicket @mandatory;
  agent      : Association to ServiceAgent  @mandatory;
  action     : AssignAction @mandatory;             // Assign / Accept / Reassign / Escalate
  assignedAt : Timestamp;
}

// Two clocks per ticket: FIRST_RESPONSE and RESOLUTION
entity SLAClock : cuid {
  ticket          : Association to ServiceTicket @mandatory;
  clockType       : ClockType @mandatory;
  status          : ClockStatus default 'Running';
  startedAt       : Timestamp;                      // clock start
  dueAt           : Timestamp;                      // deadline (extended by paused time)
  pausedAt        : Timestamp;                      // set when ticket is 'Waiting for Customer'
  totalPausedMins : Integer default 0;              // total time spent paused
  stoppedAt       : Timestamp;                      // set when first response / resolution happens
}


// ============================================================
//  4. TICKET TO CASH
// ============================================================
entity Opportunity : cuid, managed {
  oppNo         : String(20);
  ticket        : Association to ServiceTicket @mandatory;   // originating complaint
  owner         : Association to ServiceAgent;               // sales person who owns the deal
  stage         : OppStage default 'Prospecting';
  expectedValue : Decimal(15,2);
  quotes        : Composition of many Quote on quotes.opportunity = $self;
}

entity Quote : cuid, managed {
  quoteNo     : String(20);
  opportunity : Association to Opportunity @mandatory;
  version     : Integer default 1;
  status      : QuoteStatus default 'Draft';
  validUntil  : Date;                               // after this date status becomes 'Expired'
  netAmount   : Decimal(15,2);                      // sum of item quantity x unitPrice
  items       : Composition of many QuoteItem on items.quote = $self;
}

entity QuoteItem : cuid {
  quote     : Association to Quote   @mandatory;
  product   : Association to Product @mandatory;
  quantity  : Decimal(13,3) @mandatory;
  unitPrice : Decimal(15,2) @mandatory;
}

entity SalesOrder : cuid, managed {
  orderNo      : String(20);
  quote        : Association to Quote    @mandatory;
  customer     : Association to Customer @mandatory;
  deliveryDate : Date;                              // warranty starts from this date
  status       : OrderStatus default 'Created';
  items        : Composition of many SalesOrderItem on items.salesOrder = $self;
}

entity SalesOrderItem : cuid {
  salesOrder : Association to SalesOrder @mandatory;
  product    : Association to Product    @mandatory;
  quantity   : Decimal(13,3) @mandatory;
  unitPrice  : Decimal(15,2) @mandatory;
}

entity ServiceOrder : cuid, managed {
  serviceOrderNo : String(20);
  ticket         : Association to ServiceTicket @mandatory;
  salesOrder     : Association to SalesOrder;       // set for Installation / Onboarding / Paid Support / AMC
  type           : ServiceOrderType @mandatory;
  status         : ServiceOrderStatus default 'Planned';
}

entity Invoice : cuid, managed {
  invoiceNo   : String(20);
  customer    : Association to Customer   @mandatory;
  salesOrder  : Association to SalesOrder @mandatory;
  invoiceDate : Date;
  dueDate     : Date;                               // unpaid after this date -> 'Overdue'
  netAmount   : Decimal(15,2);
  status      : InvoiceStatus default 'Open';
  payments    : Composition of many Payment on payments.invoice = $self;
}

entity Payment : cuid, managed {
  paymentNo   : String(20);
  invoice     : Association to Invoice @mandatory;
  paymentDate : Date;
  amount      : Decimal(15,2) @mandatory;
  method      : PaymentMethod;
  referenceNo : String(50);
}


// ============================================================
//  UNIQUE BUSINESS KEYS
// ============================================================
annotate Customer      with @assert.unique: { customerNo : [customerNo] };
annotate Product       with @assert.unique: { productCode: [productCode] };
annotate SLAPolicy     with @assert.unique: { policy     : [priority, customerTier] };
annotate ServiceTicket with @assert.unique: { ticketNo   : [ticketNo] };
annotate Opportunity   with @assert.unique: { oppNo      : [oppNo] };
annotate Quote         with @assert.unique: { quoteNo    : [quoteNo, version] };
annotate SalesOrder    with @assert.unique: { orderNo    : [orderNo] };
annotate ServiceOrder  with @assert.unique: { svcNo      : [serviceOrderNo] };
annotate Invoice       with @assert.unique: { invoiceNo  : [invoiceNo] };
annotate Payment       with @assert.unique: { paymentNo  : [paymentNo] };