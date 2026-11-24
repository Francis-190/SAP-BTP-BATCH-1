using { cuid, managed, Currency } from '@sap/cds/common';
namespace pr;

type RequisitionStatus : String(15) enum {
    Draft;
    InApproval;
    Returned;
    Approved;
    Rejected;
    Cancelled;
    Published;
    Failed;
}

type ItemType : String(10) enum {
    Material;
    Service;
}

type ApproverRole : String(10) enum {
    Manager;
    Finance;
}

type TaskState : String(10) enum {
    Open;
    Done;
    Skipped;
    Cancelled;
}

type DecisionType : String(10) enum {
    Approved;
    Rejected;
    Returned;
}

type PublicationStatus : String(10) enum {
    Pending;
    Published;
    Failed;
}

type Amount : Decimal(15, 2);

entity CostCentre : managed {
    key code              : String(10);
        name              : String(100) @mandatory ;
        orgUnit           : String(20)  @mandatory; 
        managerId         : String(100); 
        financeApproverId : String(100); 
        currency          : Currency;
        budgetAmount      : Amount default 0; 
        committedAmount   : Amount default 0; 
        availableBudget   : Amount = budgetAmount - committedAmount;
        active            : Boolean default true;
}

entity PurchaseCategory : managed {
    key code           : String(10);
        name           : String(100) @mandatory;
        defaultTaxRate : Decimal(5, 2) default 0; 
}

entity ApprovalMatrix : cuid, managed {
    orgUnit      : String(20); 
    category     : Association to PurchaseCategory; 
    currency     : Currency;
    minAmount    : Amount       @mandatory;
    maxAmount    : Amount; 
    stepNo       : Integer      @mandatory;
    approverRole : ApproverRole @mandatory;
    active       : Boolean default true;
}

@assert.unique: {reqNumber: [reqNumber]}
entity PurchaseRequisition : cuid, managed {
    reqNumber          : String(20); 
    title              : String(120)                     @mandatory;
    justification      : String(1000);
    requester          : String(100)                     @cds.on.insert: $user;
    costCentre         : Association to CostCentre       @mandatory;
    category           : Association to PurchaseCategory @mandatory;
    projectRef         : String(40);
    deliveryLocation   : String(100);
    currency           : Currency                        @mandatory;
    netAmount          : Amount default 0;
    taxAmount          : Amount default 0;
    totalAmount        : Amount default 0;
    status             : RequisitionStatus default 'Draft';
    currentStep        : Integer default 0;
    cancellationReason : String(500);
    items              : Composition of many RequisitionItem
                             on items.requisition = $self;
    decisions          : Composition of many ApprovalDecision
                             on decisions.requisition = $self;
    tasks              : Composition of many ApprovalTask
                             on tasks.requisition = $self;
    attachments        : Composition of many Attachment
                             on attachments.requisition = $self;
    erpReference       : Composition of one ERPReference
                             on erpReference.requisition = $self;
}

entity RequisitionItem : cuid {
    requisition      : Association to PurchaseRequisition;
    itemNo           : Integer;
    itemType         : ItemType default 'Material';
    material         : String(40);
    description      : String(200)    @mandatory;
    quantity         : Decimal(13, 3) @mandatory;
    uom              : String(3) default 'EA';
    unitPrice        : Amount         @mandatory @title: 'Estimated Unit Price'    @Core.Computed;
    taxRate          : Decimal(5, 2); 
    netAmount        : Amount default 0; 
    taxAmount        : Amount default 0;
    grossAmount      : Amount default 0;
    needByDate       : Date           @mandatory;
    deliveryLocation : String(100);
}

entity ApprovalTask : cuid {
    requisition : Association to PurchaseRequisition;
    stepNo      : Integer;
    role        : ApproverRole;
    assignedTo  : String(100);
    state       : TaskState default 'Open';
    actedAt     : Timestamp;
}

entity ApprovalDecision : cuid {
    requisition : Association to PurchaseRequisition;
    stepNo      : Integer;
    role        : ApproverRole;
    decision    : DecisionType;
    comment     : String(1000);
    decidedBy   : String(100);
    decidedAt   : Timestamp;
}

entity Attachment : cuid, managed {
    requisition : Association to PurchaseRequisition;
    fileName    : String(255);
    mediaType   : String(100) @Core.IsMediaType;
    size        : Integer;
    content     : LargeBinary
                             
}

entity ERPReference : cuid, managed {
    requisition       : Association to PurchaseRequisition;
    poNumber          : String(20);
    publicationStatus : PublicationStatus default 'Pending';
    idempotencyKey    : UUID; 
    attempts          : Integer default 0;
    lastError         : String(500);
    lastAttemptAt     : Timestamp;
    publishedAt       : Timestamp;
}

entity Material : managed {
    key code        : String(40);
        description : String(200) @mandatory;
        itemType    : ItemType default 'Material';
        uom         : String(3) default 'EA';
        unitPrice   : Amount @mandatory;
        currency    : Currency;
        active      : Boolean default true;
}