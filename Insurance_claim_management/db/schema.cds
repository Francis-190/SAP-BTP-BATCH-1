namespace claimsure;

using { cuid } from '@sap/cds/common';


entity Customers : cuid {

    customerNumber : String(30)  @mandatory;

    firstName      : String(100) @mandatory;

    lastName       : String(100) @mandatory;

    email          : String(150)
                                 @assert.format: '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$';

    phone          : String(30)
                                 @assert.format: '^[0-9+() -]{7,15}$';

    address        : String(500);

    status         : String(20) enum {
        Active;
        Inactive;
        Suspended;
        policy
    } default 'Active';

    // Relationships
    policies       : Association to many Policies
                         on policies.customer = $self;

    claims         : Association to many Claims
                         on claims.customer = $self;
}


entity ClaimTypes : cuid {

    code        : String(30)  @mandatory;

    name        : String(100) @mandatory;

    description : String(500);

    category    : String(30) enum {
        Vehicle;
        Health;
        Property;
        Life;
    };

    active      : Boolean default true;

    // Relationships
    policies    : Association to many Policies
                      on policies.claimType = $self;

    claims      : Association to many Claims
                      on claims.claimType = $self;

    slaRules    : Association to many SLARules
                      on slaRules.claimType = $self;
}


entity Employees : cuid {

    employeeNumber : String(30)  @mandatory;

    firstName      : String(100) @mandatory;

    lastName       : String(100) @mandatory;

    email          : String(150) @mandatory
                                 @assert.format: '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$';

    department     : String(100);

    role           : String(30) enum {
        ClaimsAgent;
        Investigator;
        ClaimsManager;
        FinanceOfficer;
        Admin;
    };

    active         : Boolean default true;

    // Relationships
    assignedClaims : Association to many Claims
                         on assignedClaims.assignedAgent = $self;

    investigations : Association to many Investigations
                         on investigations.investigator = $self;

    approvals      : Association to many Approvals
                         on approvals.approver = $self;

    payouts        : Association to many Payouts
                         on payouts.processedBy = $self;

    alerts         : Association to many AlertLog
                         on alerts.recipient = $self;
}


entity Policies : cuid {

    policyNumber  : String(50)                @mandatory;

    customer      : Association to Customers  @mandatory;

    claimType     : Association to ClaimTypes @mandatory;

    coverageLimit : Decimal(15, 2)            @mandatory;

    startDate     : Date;

    endDate       : Date;

    status        : String(20) enum {
        Active;
        Expired;
        Cancelled;
    } default 'Active';

    // One Policy -> Many Claims
    claims        : Association to many Claims
                        on claims.policy = $self;
}


entity Claims : cuid {

    claimNumber     : String(50)  ;

    customer        : Association to Customers  @mandatory;

    policy          : Association to Policies   @mandatory;

    claimType       : Association to ClaimTypes @mandatory;

    incidentDate    : Date;

    description     : String(500);

    claimedAmount   : Decimal(15, 2)            @mandatory;

    status          : String(30) enum {
        Submitted;
        UnderReview;
        PendingApproval;
        Approved;
        Rejected;
        Paid;
    } default 'Submitted';

    // Claims Agent
    assignedAgent   : Association to Employees;

    // One Claim -> Many Documents
    documents       : Composition of many ClaimDocuments
                          on documents.claim = $self;

    // One Claim -> Many Risk Scores
    fraudRiskScores : Association to many FraudRiskScores
                          on fraudRiskScores.claim = $self;

    // One Claim -> Many Investigations
    investigations  : Association to many Investigations
                          on investigations.claim = $self;

    // One Claim -> Many Approvals
    approvals       : Association to many Approvals
                          on approvals.claim = $self;

    // One Claim -> One Payout
    payout          : Association to one Payouts
                          on payout.claim = $self;

    // One Claim -> Many Alerts
    alerts          : Association to many AlertLog
                          on alerts.claim = $self;
}


entity ClaimDocuments : cuid {

    claim        : Association to Claims @mandatory;

    documentType : String(50);

    fileName     : String(255);

    mediaType    : String(100);

    content      : LargeBinary
                                         @Core.MediaType: mediaType;
}


entity FraudRiskScores : cuid {

    claim     : Association to Claims @mandatory;

    riskScore : Decimal(5, 2)         @mandatory;

    riskLevel : String(20) enum {
        Low;
        Medium;
        High;
        Critical;
    };

}


entity Investigations : cuid {

    investigationNumber : String(50)               @mandatory;

    claim               : Association to Claims    @mandatory;

    investigator        : Association to Employees @mandatory;

    status              : String(30) enum {
        Assigned;
        InProgress;
        Completed;
    } default 'Assigned';

    findings            : String(1000);

}


entity Approvals : cuid {

    approvalNumber : String(50);

    claim          : Association to Claims @mandatory;

    approver       : Association to Employees;

    approvalLevel  : String(30) enum {
        ClaimsAgent;
        ClaimsManager;
        FinanceOfficer;
    };

    decision       : String(20) enum {
        Pending;
        Approved;
        Rejected;
    } default 'Pending';

    comments       : String(500);

}


entity Payouts : cuid {

    payoutNumber  : String(50)            @mandatory;

    claim         : Association to Claims @mandatory;

    amount        : Decimal(15, 2)        @mandatory;

    paymentMethod : String(30) enum {
        BankTransfer;
        NEFT;
        RTGS;
        UPI;
    } default 'BankTransfer';

    payoutDate    : Date;

    status        : String(30) enum {
        Pending;
        Processing;
        Processed;
        Failed;
    } default 'Pending';

    processedBy   : Association to Employees;

}


entity SLARules : cuid {

    ruleName        : String(100)               @mandatory;

    claimType       : Association to ClaimTypes @mandatory;

    resolutionHours : Integer                   @mandatory;

}


entity AlertLog : cuid {

    claim     : Association to Claims;

    recipient : Association to Employees;

    alertType : String(40) enum {
        HighFraudRisk;
        InvestigationRequired;
        ApprovalPending;
        SLABreached;
        PayoutSuccess;
        PayoutFailed;
    };

    message   : String(500);

    status    : String(20) enum {
        Created;
        Sent;
        Read;
    } default 'Created';

}
