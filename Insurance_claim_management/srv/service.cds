using {claimsure as cl} from '../db/schema';


service Investigation {

    entity FraudRiskScores as projection on cl.FraudRiskScores;
    entity Investigations  as projection on cl.Investigations;
    entity Approvals       as projection on cl.Approvals;


}


service InsuranceService {
    entity Policies       as projection on cl.Policies;
    entity Claims         as projection on cl.Claims;
    entity ClaimDocuments as projection on cl.ClaimDocuments;
    

    //Policies
    action   renewPolicy(policyID: UUID)           returns Policies;
    action   cancelPolicy(policyID: UUID)          returns Policies;

    function getPolicyStatus(policyID: UUID)       returns String;
    function getPolicyClaimsCount(policyID: UUID)  returns Integer;

    //Claims
    action   submitClaim(claimID: UUID)            returns Claims;
    action   moveToPendingApproval(claimID: UUID)  returns Claims;
    action   approveClaim(claimID: UUID)           returns Claims;
    action   rejectClaim(claimID: UUID)            returns Claims;
    action   rejectFraudClaim(claimID: UUID)       returns Claims;


    //job schedalr
    action   processPendingClaims()                returns ProcessPendingClaimsResult;

    // for AI Agent analysis
    action analyzeClaim(claimID: UUID) returns String;


    type PendingClaimResult {
        claimID       : UUID;
        claimNumber   : String;
        claimedAmount : Decimal(15, 2);
        status        : String;
    }

    type ProcessPendingClaimsResult {
        message               : String;
        pendingApprovalsCount : Integer;
        pendingApprovals      : many PendingClaimResult;
        escalatedCount        : Integer;
    }

    function getClaimStatus(claimID: UUID)         returns String;
    function getClaimAmount(claimID: UUID)         returns Decimal(15, 2);
    function getClaimDocumentsCount(claimID: UUID) returns Integer;

    //ClaimDocuments
    action   deleteDocument(documentID: UUID)      returns Boolean;
    function getDocumentInfo(documentID: UUID)     returns String;

}


@impl: 'srv/payout.js'
service PayoutService {

    entity Payouts  as projection on cl.Payouts;
    entity SLARules as projection on cl.SLARules;
    entity AlertLog as projection on cl.AlertLog;


    action   createPayout(claimID: UUID,
                          amount: Decimal(15, 2))  returns Payouts;

    action   processPayout(payoutID: UUID)         returns Payouts;
    action   rejectPayout(payoutID: UUID)          returns Boolean;


    function calculateSLAStatus(claimID: UUID)     returns String;


    action   createAlert(claimID: UUID,
                         recipientID: UUID,
                         alertType: String(40),
                         message: String(500))     returns AlertLog;

    action   markAsRead(alertID: UUID)             returns AlertLog;

}
