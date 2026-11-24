
using { travel.expense as db } from '../db/schema';

// All operations require an authenticated user.
// Individual entities, actions and functions have additional role checks.
@requires: 'authenticated-user'
@path: '/travel-expense'
service TravelExpenseService {

    // ==================================================
    // 1. EMPLOYEE ENTITY
    // ==================================================

    // All roles can read employee information.
    // Only Finance Administrator can create, update or delete employees.
    @restrict: [
        {
            grant: 'READ',
            to: ['Employee', 'Manager', 'FinanceReviewer', 'FinanceAdministrator']
        },
        {
            grant: ['CREATE', 'UPDATE', 'DELETE'],
            to: 'FinanceAdministrator'
        }
    ]
    entity Employees as projection on db.Employee;


    // ==================================================
    // 2. MASTER DATA ENTITIES
    // ==================================================

    // Currency master
    @restrict: [
        {
            grant: 'READ',
            to: ['Employee', 'Manager', 'FinanceReviewer', 'FinanceAdministrator']
        },
        {
            grant: ['CREATE', 'UPDATE', 'DELETE'],
            to: 'FinanceAdministrator'
        }
    ]
    entity Currencies as projection on db.Currency;


    // Exchange rate master
    @restrict: [
        {
            grant: 'READ',
            to: ['Employee', 'Manager', 'FinanceReviewer', 'FinanceAdministrator']
        },
        {
            grant: ['CREATE', 'UPDATE', 'DELETE'],
            to: 'FinanceAdministrator'
        }
    ]
    entity ExchangeRates as projection on db.ExchangeRate;


    // Expense category master
    @restrict: [
        {
            grant: 'READ',
            to: ['Employee', 'Manager', 'FinanceReviewer', 'FinanceAdministrator']
        },
        {
            grant: ['CREATE', 'UPDATE', 'DELETE'],
            to: 'FinanceAdministrator'
        }
    ]
    entity ExpenseCategories as projection on db.ExpenseCategory;


    // Policy limit master
    @restrict: [
        {
            grant: 'READ',
            to: ['Employee', 'Manager', 'FinanceReviewer', 'FinanceAdministrator']
        },
        {
            grant: ['CREATE', 'UPDATE', 'DELETE'],
            to: 'FinanceAdministrator'
        }
    ]
    entity PolicyLimits as projection on db.PolicyLimit;


    // ==================================================
    // 3. TRAVEL REQUEST ENTITY
    // ==================================================

    // Employee:
    //   Create, read, update and delete travel requests.
    //
    // Manager:
    //   Read and update travel requests.
    //
    // Finance roles:
    //   Read travel requests.
    @restrict: [
        {
            grant: 'READ',
            to: ['Employee', 'Manager', 'FinanceReviewer', 'FinanceAdministrator']
        },
        {
            grant: ['CREATE', 'UPDATE', 'DELETE'],
            to: 'Employee'
        },
        {
            grant: 'UPDATE',
            to: 'Manager'
        }
    ]
    entity TravelRequests as projection on db.TravelRequest;


    // ==================================================
    // 4. EXPENSE CLAIM ENTITY
    // ==================================================

    // Employee:
    //   Create, read, update and delete claims.
    //
    // Manager:
    //   Read and update claims.
    //
    // Finance Reviewer:
    //   Read claims.
    //
    // Finance Administrator:
    //   Read claims.
    @restrict: [
        {
            grant: 'READ',
            to: ['Employee', 'Manager', 'FinanceReviewer', 'FinanceAdministrator']
        },
        {
            grant: ['CREATE', 'UPDATE', 'DELETE'],
            to: 'Employee'
        },
        {
            grant: 'UPDATE',
            to: ['Manager']
        }
    ]
    entity ExpenseClaims as projection on db.ExpenseClaim;


    // ==================================================
    // 5. EXPENSE ITEM ENTITY
    // ==================================================

    // Employee can maintain their expense items.
    // Finance Reviewer can update expense items during review.
    @restrict: [
        {
            grant: 'READ',
            to: ['Employee', 'Manager', 'FinanceReviewer', 'FinanceAdministrator']
        },
        {
            grant: ['CREATE', 'UPDATE', 'DELETE'],
            to: 'Employee'
        }
    ]
    entity ExpenseItems as projection on db.ExpenseItem;


    // ==================================================
    // 6. RECEIPT DOCUMENT ENTITY
    // ==================================================

    // Employee can upload and maintain receipt records.
    // Finance Reviewer can update receipt verification details.
    @restrict: [
        {
            grant: 'READ',
            to: ['Employee', 'Manager', 'FinanceReviewer', 'FinanceAdministrator']
        },
        {
            grant: ['CREATE', 'UPDATE', 'DELETE'],
            to: 'Employee'
        },
        {
            grant: 'UPDATE',
            to: 'FinanceReviewer'
        }
    ]
    entity ReceiptDocuments as projection on db.ReceiptDocument;


    // ==================================================
    // 7. READ-ONLY ENTITIES
    // ==================================================

    // Approval history
    @readonly
    @restrict: [
        {
            grant: 'READ',
            to: ['Employee', 'Manager', 'FinanceReviewer', 'FinanceAdministrator']
        }
    ]
    entity ApprovalDecisions as projection on db.ApprovalDecision;


    // Exchange rate snapshots
    @readonly
    @restrict: [
        {
            grant: 'READ',
            to: ['Employee', 'Manager', 'FinanceReviewer', 'FinanceAdministrator']
        }
    ]
    entity ExchangeRateSnapshots as projection on db.ExchangeRateSnapshot;


    // ERP reimbursement references
    @readonly
    @restrict: [
        {
            grant: 'READ',
            to: ['Employee', 'Manager', 'FinanceReviewer', 'FinanceAdministrator']
        }
    ]
    entity ReimbursementReferences as projection on db.ReimbursementReference;


    // Claim status history
    @readonly
    @restrict: [
        {
            grant: 'READ',
            to: ['Employee', 'Manager', 'FinanceReviewer', 'FinanceAdministrator']
        }
    ]
    entity ClaimStatusHistories as projection on db.ClaimStatusHistory;


    // ==================================================
    // 8. EMPLOYEE ACTIONS
    // ==================================================

    // Employee submits a travel request.
    @requires: 'Employee'
    action submitTravelRequest(requestID: UUID)
        returns TravelRequests;


    // Employee submits an expense claim.
    @requires: 'Employee'
    action submitClaim(claimID: UUID)
        returns ExpenseClaims;


    // ==================================================
    // 9. MANAGER ACTIONS
    // ==================================================

    // Manager approves a travel request.
    @requires: 'Manager'
    action approveTravelRequest(requestID: UUID)
        returns TravelRequests;


    // Manager rejects a travel request.
    @requires: 'Manager'
    action rejectTravelRequest(
        requestID: UUID,
        reason: String
    ) returns TravelRequests;


    // ==================================================
    // 10. MANAGER AND FINANCE REVIEWER ACTIONS
    // ==================================================

    // Either Manager or Finance Reviewer can approve a claim.
    @requires: ['Manager', 'FinanceReviewer']
    action approveClaim(
        claimID: UUID,
        comments: String
    ) returns ExpenseClaims;


    // Either Manager or Finance Reviewer can reject a claim.
    @requires: ['Manager', 'FinanceReviewer']
    action rejectClaim(
        claimID: UUID,
        reason: String
    ) returns ExpenseClaims;


    // Either Manager or Finance Reviewer can return a claim.
    @requires: ['Manager', 'FinanceReviewer']
    action returnClaim(
        claimID: UUID,
        reason: String
    ) returns ExpenseClaims;


    // ==================================================
    // 11. FINANCE ADMINISTRATOR ACTIONS
    // ==================================================

    // Override a policy limit.
    @requires: 'FinanceAdministrator'
    action overridePolicyLimit(
        claimID: UUID,
        expenseItemID: UUID,
        reason: String
    ) returns ExpenseItems;


    // Export an approved claim to ERP.
    @requires: 'FinanceAdministrator'
    action exportClaimToERP(claimID: UUID)
        returns ReimbursementReferences;


    // Retry a failed ERP export.
    @requires: 'FinanceAdministrator'
    action retryERPExport(claimID: UUID)
        returns ReimbursementReferences;


    // Mark an exported claim as reimbursed.
    @requires: 'FinanceAdministrator'
    action markReimbursed(
        claimID: UUID,
        paymentReference: String,
        reimbursedAmount: Decimal(15,2)
    ) returns ExpenseClaims;


    // ==================================================
    // 12. EMPLOYEE FUNCTION
    // ==================================================

    // Retrieve claims belonging to the logged-in employee.
    @requires: 'Employee'
    function getMyClaims()
        returns many ExpenseClaims;


    // ==================================================
    // 13. MANAGER FUNCTION
    // ==================================================

    // Retrieve claims pending manager approval.
    @requires: 'Manager'
    function getPendingApprovals()
        returns many ExpenseClaims;

    @requires: 'Manager'
    function getPendingTravelRequests()
    returns many TravelRequests;
    // ==================================================
    // 14. FINANCE REVIEWER FUNCTION
    // ==================================================

    // Retrieve claims pending finance review.
    @requires: 'FinanceReviewer'
    function getPendingFinanceReviews()
        returns many ExpenseClaims;


    // ==================================================
    // 15. COMMON FUNCTIONS
    // ==================================================

    // All authenticated users can retrieve expense categories.
    function getExpenseCategories()
        returns many ExpenseCategories;


    // All authenticated users can retrieve policy limits.
    function getPolicyLimits()
        returns many PolicyLimits;


    // Manager and Finance Reviewer can retrieve approval history.
    @requires: ['Employee', 'Manager', 'FinanceReviewer', 'FinanceAdministrator']
    function getClaimApprovalHistory(claimID: UUID)
        returns many ApprovalDecisions;

    @requires: 'Employee'
    function getMyProfile() returns Employees;

}
