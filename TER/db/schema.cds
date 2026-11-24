namespace travel.expense;

using { managed } from '@sap/cds/common';

type TravelRequestStatus : String enum {
    Draft;
    Submitted;
    Approved;
    Rejected;
    Completed;
    Cancelled;
}

type ExpenseClaimStatus : String enum {
    Draft;
    Submitted;
    ManagerApproved;
    FinanceReview;
    FinanceApproved;
    Returned;
    Rejected;
    ExportPending;
    ExportFailed;
    Exported;
    Reimbursed;
}

type ApprovalStage : String enum {
    Manager;
    Finance;
}

type ApprovalDecisionType : String enum {
    Approved;
    Rejected;
    Returned;
}

type PaymentStatus : String enum {
    Pending;
    Processing;
    Paid;
    Failed;
}

type ExpenseItemStatus : String enum {
    Pending;
    WithinPolicy;
    PolicyException;
    Approved;
    Rejected;
}

type DocumentStatus : String enum {
    PendingUpload;
    Uploaded;
    Verified;
    Rejected;
}

@assert.unique.employeeNumber: [employeeNumber]
@assert.unique.employeeEmail: [email]
entity Employee : managed {

    key ID              : UUID;
   
    @mandatory
    employeeNumber      : String(30);

    @mandatory
    fullName            : String(120);

    @mandatory
    email               : String(150);

    department          : String(100);

    designation         : String(100);

    isActive            : Boolean default true;

    // Manager relationship
    manager              : Association to Employee;

    directReports        : Association to many Employee
                               on directReports.manager = $self;

    // Employee's business records
    travelRequests       : Association to many TravelRequest
                               on travelRequests.employee = $self;

    expenseClaims        : Association to many ExpenseClaim
                               on expenseClaims.employee = $self;
}

@assert.unique.currencyCode: [currencyCode]
entity Currency : managed {

    key ID              : UUID;

    @mandatory
    currencyCode        : String(3);

    @mandatory
    currencyName        : String(60);

    decimalPlaces       : Integer default 2;

    isBaseCurrency      : Boolean default false;

    isActive            : Boolean default true;

    policyLimits        : Association to many PolicyLimit
                               on policyLimits.currency = $self;
}

@assert.unique.requestNumber: [requestNumber]
entity TravelRequest : managed {

    key ID              : UUID;

    @mandatory
    requestNumber       : String(40);

    @mandatory
    employee            : Association to Employee;

    @mandatory
    destination         : String(150);

    @mandatory
    purpose             : String(500);

    @mandatory
    startDate           : Date;

    @mandatory
    endDate             : Date;

    estimatedBudget     : Decimal(15,2);

    status              : TravelRequestStatus default 'Draft';

    submissionDate      : Timestamp;

    approvedBy           : Association to Employee;

    approvedAt           : Timestamp;

    rejectionReason     : String(500);

    // One trip can have multiple claims
    claims              : Association to many ExpenseClaim
                               on claims.travelRequest = $self;
}

@assert.unique.categoryCode: [categoryCode]
entity ExpenseCategory : managed {

    key ID              : UUID;

    @mandatory
    categoryCode        : String(30);

    @mandatory
    categoryName        : String(100);

    description         : String(500);

    // Examples:
    // FLIGHT, HOTEL, MEALS, TAXI,
    // MILEAGE, PER_DIEM, MISC

    requiresDistance    : Boolean default false;

    requiresDuration    : Boolean default false;

    isActive            : Boolean default true;

    expenseItems        : Association to many ExpenseItem
                               on expenseItems.category = $self;

    policyLimits        : Association to many PolicyLimit
                               on policyLimits.category = $self;
}

entity PolicyLimit : managed {

    key ID              : UUID;

    @mandatory
    policyCode          : String(40);

    @mandatory
    category            : Association to ExpenseCategory;

    @mandatory
    currency            : Association to Currency;

    // PER_DAY, PER_TRIP, PER_KM, PER_NIGHT

    @mandatory
    limitType           : String(30);

    @mandatory
    maximumAmount       : Decimal(15,2);

    @mandatory
    receiptThreshold    : Decimal(15,2);

    // Policy validity
    validFrom           : Date;

    validTo             : Date;

    isActive            : Boolean default true;
}

@assert.unique.claimNumber: [claimNumber]
entity ExpenseClaim : managed {

    key ID              : UUID;

    @mandatory
    claimNumber         : String(40);

    @mandatory
    employee            : Association to Employee;

    @mandatory
    travelRequest       : Association to TravelRequest;

    @mandatory
    status              : ExpenseClaimStatus default 'Draft';

    submissionDate      : Timestamp;

    // Server-calculated amounts
    totalClaimed        : Decimal(15,2);

    totalEligible       : Decimal(15,2);

    totalException      : Decimal(15,2);

    baseCurrency        : Association to Currency;

    // Approval information
    currentApprovalStage : ApprovalStage;

    submittedAt         : Timestamp;

    completedAt         : Timestamp;

    // Employee and reviewer comments
    employeeRemarks     : String(1000);

    rejectionReason     : String(1000);

    // Child entities owned by the claim
    items               : Composition of many ExpenseItem
                               on items.claim = $self;

    decisions           : Composition of many ApprovalDecision
                               on decisions.claim = $self;

    exchangeRates       : Composition of many ExchangeRateSnapshot
                               on exchangeRates.claim = $self;

    reimbursementReferences : Composition of many ReimbursementReference
                               on reimbursementReferences.claim = $self;

    statusHistory       : Composition of many ClaimStatusHistory
                               on statusHistory.claim = $self;
}

entity ExpenseItem : managed {

    key ID              : UUID;

    @mandatory
    claim               : Association to ExpenseClaim;

    @mandatory
    category            : Association to ExpenseCategory;

    @mandatory
    expenseDate         : Date;

    @mandatory
    description         : String(500);

    @mandatory
    amount              : Decimal(15,2);

    @mandatory
    currency            : Association to Currency;

    // Mileage-related information
    distanceInKM        : Decimal(12,3);

    ratePerKM           : Decimal(15,2);

    // Duration-related information
    numberOfDays        : Integer;

    numberOfNights      : Integer;

    // Server-side calculations
    exchangeRate        : Decimal(15,6);

    baseCurrencyAmount  : Decimal(15,2);

    eligibleAmount      : Decimal(15,2);

    exceptionAmount     : Decimal(15,2);

    // Policy snapshot
    policyLimitAmount   : Decimal(15,2);

    policyLimitType     : String(30);

    policyCodeSnapshot  : String(40);

    policyCurrency      : Association to Currency;

    policyValidFrom     : Date;

    policyValidTo       : Date;

    policyCapturedAt    : Timestamp;

    policyExceeded      : Boolean default false;

    exceptionReason     : String(500);

    overrideApproved    : Boolean default false;

    overrideReason      : String(1000);

    itemStatus          : ExpenseItemStatus default 'Pending';

    // Exchange rate snapshot used by this item
    exchangeRateSnapshot : Association to ExchangeRateSnapshot;

    // Receipts belong to an expense item
    receipts            : Composition of many ReceiptDocument
                               on receipts.expenseItem = $self;
}

entity ReceiptDocument : managed {

    key ID              : UUID;

    @mandatory
    expenseItem         : Association to ExpenseItem;

    @mandatory
    fileName            : String(255);

    mimeType            : String(100);

    // Actual uploaded receipt content
    content             : LargeBinary
        @Core.MediaType: mimeType
        @Core.ContentDisposition.Filename: fileName;

    documentReference   : String(255);

    storageDocumentID   : String(255);

    receiptNumber       : String(100);

    fileHash            : String(128);

    receiptAmount       : Decimal(15,2);

    receiptDate         : Date;

    status              : DocumentStatus default 'PendingUpload';

    verificationRemarks : String(500);
}

entity ApprovalDecision : managed {

    key ID              : UUID;

    @mandatory
    claim               : Association to ExpenseClaim;

    @mandatory
    approvalStage       : ApprovalStage;

    @mandatory
    approver            : Association to Employee;

    @mandatory
    decision            : ApprovalDecisionType;

    reason              : String(1000);

    decisionDate        : Timestamp;

    // Policy override information
    isPolicyOverride    : Boolean default false;

    overrideAmount      : Decimal(15,2);

    overrideReason      : String(1000);
}

entity ExchangeRateSnapshot : managed {

    key ID              : UUID;

    @mandatory
    claim               : Association to ExpenseClaim;

    expenseItem         : Association to ExpenseItem;

    @mandatory
    fromCurrency        : Association to Currency;

    @mandatory
    toCurrency          : Association to Currency;

    @mandatory
    exchangeRate        : Decimal(15,6);

    @mandatory
    effectiveDate       : Date;

    rateSource          : String(100);

    capturedAt          : Timestamp;

    sourceReference     : String(255);
}


entity ReimbursementReference : managed {

    key ID              : UUID;

    @mandatory
    claim               : Association to ExpenseClaim;

    // Prevent duplicate ERP export
    idempotencyKey      : String(100);

    erpReference        : String(100);

    exportStatus        : String(30);

    exportDate          : Timestamp;

    exportAttemptCount  : Integer default 0;

    lastExportError     : String(1000);

    // Payment details
    paymentReference    : String(100);

    paymentStatus       : PaymentStatus default 'Pending';

    paymentDate         : Timestamp;

    reimbursedAmount    : Decimal(15,2);

    paymentRemarks      : String(500);
}


entity ClaimStatusHistory : managed {

    key ID              : UUID;

    @mandatory
    claim               : Association to ExpenseClaim;

    previousStatus      : ExpenseClaimStatus;

    @mandatory
    newStatus           : ExpenseClaimStatus;

    changedBy           : Association to Employee;

    @mandatory
    changedAt           : Timestamp;

    changeReason        : String(1000);

    actionName          : String(50);
}

@assert.unique.rate: [fromCurrency, toCurrency, validFrom]
entity ExchangeRate : managed {

    key ID              : UUID;

    @mandatory
    fromCurrency        : Association to Currency;

    @mandatory
    toCurrency          : Association to Currency;

    @mandatory
    rate                : Decimal(15,6);

    @mandatory
    validFrom           : Date;

    validTo             : Date;

    rateSource          : String(100);

    isActive            : Boolean default true;
}