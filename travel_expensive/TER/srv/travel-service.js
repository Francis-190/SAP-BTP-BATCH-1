const cds = require('@sap/cds');
const { randomUUID } = require('crypto');

module.exports = cds.service.impl(function () {

    const {
        Employees,
        Currencies,
        ExchangeRates,
        ExpenseCategories,
        PolicyLimits,
        TravelRequests,
        ExpenseClaims,
        ExpenseItems,
        ReceiptDocuments,
        ApprovalDecisions,
        ExchangeRateSnapshots,
        ReimbursementReferences,
        ClaimStatusHistories
    } = this.entities;

    const { SELECT, INSERT, UPDATE, DELETE } = cds.ql;
    const LOG = cds.log('travel-expense');

    const now = () => new Date();
    const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

    // =========================================================
    // CONFIGURATION
    // =========================================================

    // Role checks are ON by default. For quick local experiments only:
    //   ENFORCE_ROLES=false cds watch
    const ENFORCE_ROLES = process.env.ENFORCE_ROLES !== 'false';

    // Local ERP mock (used only when no "ERP" destination is configured):
    //   ERP_MOCK_FAIL_FIRST_ATTEMPT=true  -> attempt 1 fails, retry succeeds
    const ERP_MOCK_FAIL_FIRST_ATTEMPT =
        process.env.ERP_MOCK_FAIL_FIRST_ATTEMPT === 'true';

    const EDITABLE_STATUSES = ['Draft', 'Returned'];

    const CLAIM_PROTECTED = [
        'status', 'totalClaimed', 'totalEligible', 'totalException',
        'baseCurrency_ID', 'currentApprovalStage', 'submissionDate',
        'submittedAt', 'completedAt', 'rejectionReason'
    ];

    const CLAIM_CHILDREN = [
        'decisions', 'exchangeRates', 'reimbursementReferences', 'statusHistory'
    ];

    const ITEM_PROTECTED = [
        'exchangeRate', 'baseCurrencyAmount', 'eligibleAmount',
        'exceptionAmount', 'policyLimitAmount', 'policyLimitType',
        'policyCodeSnapshot', 'policyCurrency_ID', 'policyValidFrom',
        'policyValidTo', 'policyCapturedAt', 'policyExceeded',
        'overrideApproved', 'overrideReason', 'itemStatus',
        'exchangeRateSnapshot_ID'
    ];

    // =========================================================
    // HELPER FUNCTIONS
    // =========================================================

    const strip = (obj, keys) => keys.forEach(k => delete obj[k]);

    const getEmployee = async (tx, req) => {
        const email = req.user?.attr?.email || req.user?.id;

        if (!email) {
            req.reject(401, 'Unable to identify the logged-in employee.');
        }

        const employee = await tx.run(
            SELECT.one.from(Employees).where({ email })
        );

        if (!employee) {
            req.reject(403, 'No Employee record is mapped to the logged-in user.');
        }

        if (!employee.isActive) {
            req.reject(403, 'The employee account is inactive.');
        }

        return employee;
    };

    const hasRole = (req, role) => !ENFORCE_ROLES || req.user.is(role);

    const requireRole = (req, role) => {
        if (!hasRole(req, role)) {
            req.reject(403, `Role ${role} is required for this operation.`);
        }
    };

    const getClaim = async (tx, req, claimID) => {
        if (!claimID) {
            req.reject(400, 'claimID is required.');
        }

        const claim = await tx.run(
            SELECT.one.from(ExpenseClaims).where({ ID: claimID })
        );

        if (!claim) {
            req.reject(404, 'Expense claim was not found.');
        }

        return claim;
    };

    const getClaimItems = (tx, claimID) =>
        tx.run(SELECT.from(ExpenseItems).where({ claim_ID: claimID }));

    const addStatusHistory = (
        tx, claimID, previousStatus, newStatus, employeeID, actionName, reason
    ) =>
        tx.run(
            INSERT.into(ClaimStatusHistories).entries({
                ID: randomUUID(),
                claim_ID: claimID,
                previousStatus,
                newStatus,
                changedBy_ID: employeeID || null,
                changedAt: now(),
                actionName,
                changeReason: reason || null
            })
        );

    const addDecision = (
        tx, claimID, stage, decision, employeeID, reason, extra = {}
    ) =>
        tx.run(
            INSERT.into(ApprovalDecisions).entries({
                ID: randomUUID(),
                claim_ID: claimID,
                approvalStage: stage,
                approver_ID: employeeID,
                decision,
                reason: reason || null,
                decisionDate: now(),
                ...extra
            })
        );

    const assertClaimOwner = (req, claim, employee) => {
        if (claim.employee_ID !== employee.ID) {
            req.reject(403, 'You can access only your own expense claims.');
        }
    };

    const assertNotOwnClaim = (req, claim, employee) => {
        if (claim.employee_ID === employee.ID) {
            req.reject(403, 'You cannot approve, reject or return your own claim.');
        }
    };

    // Manager stage: only the line manager of the claim owner may act.
    const assertLineManager = async (tx, req, claim, employee) => {
        const owner = await tx.run(
            SELECT.one.from(Employees).where({ ID: claim.employee_ID })
        );
        if (!owner || owner.manager_ID !== employee.ID) {
            req.reject(
                403,
                'Only the line manager of the claim owner can act at the Manager stage.'
            );
        }
    };

    // Resolves which approval stage the caller is acting on and checks authorization.
    const resolveStage = async (tx, req, claim, employee, verb) => {
        if (claim.status === 'Submitted') {
            requireRole(req, 'Manager');
            assertNotOwnClaim(req, claim, employee);
            await assertLineManager(tx, req, claim, employee);
            return 'Manager';
        }
        if (claim.status === 'FinanceReview') {
            requireRole(req, 'FinanceReviewer');
            assertNotOwnClaim(req, claim, employee);
            return 'Finance';
        }
        req.reject(409, `This claim cannot be ${verb} in its current status.`);
    };

    const recalcClaimTotals = async (tx, claimID) => {
        const items = await getClaimItems(tx, claimID);
        const sum = f => round2(items.reduce((s, i) => s + Number(i[f] || 0), 0));
        const totals = {
            totalClaimed: sum('baseCurrencyAmount'),
            totalEligible: sum('eligibleAmount'),
            totalException: sum('exceptionAmount')
        };
        await tx.run(UPDATE(ExpenseClaims).set(totals).where({ ID: claimID }));
        return totals;
    };

    // ---------- policy / currency lookups ----------

    const findPolicy = async (tx, categoryID, currencyID, baseCurrencyID, date) => {
        const policies = await tx.run(
            SELECT.from(PolicyLimits).where({
                category_ID: categoryID,
                isActive: true,
                currency_ID: { in: [...new Set([currencyID, baseCurrencyID])] }
            })
        );

        const valid = policies.filter(p =>
            (!p.validFrom || p.validFrom <= date) &&
            (!p.validTo || p.validTo >= date)
        );

        // Prefer a policy in the item's own currency, else the base-currency policy.
        return (
            valid.find(p => p.currency_ID === currencyID) ||
            valid.find(p => p.currency_ID === baseCurrencyID)
        );
    };

    const findRate = async (tx, fromID, toID, date) => {
        const rows = await tx.run(
            SELECT.from(ExchangeRates)
                .where({
                    fromCurrency_ID: fromID,
                    toCurrency_ID: toID,
                    isActive: true,
                    validFrom: { '<=': date }
                })
                .orderBy({ validFrom: 'desc' })
        );
        return rows.find(r => !r.validTo || r.validTo >= date);
    };

    const unitsFor = (req, policy, item, label) => {
        let units = 1;
        switch (policy.limitType) {
            case 'PER_NIGHT': units = Number(item.numberOfNights); break;
            case 'PER_DAY':   units = Number(item.numberOfDays);   break;
            case 'PER_KM':    units = Number(item.distanceInKM);   break;
            default:          units = 1;                           // PER_TRIP
        }
        if (!Number.isFinite(units) || units <= 0) {
            req.reject(
                400,
                `${label}: a value greater than zero is required for ${policy.limitType} policy.`
            );
        }
        return units;
    };
   
         // =========================================================
    // RECEIPT HELPER: Check whether binary file content exists
    // =========================================================
    async function hasActualFileContent(content) {
        if (!content) {
            return false;
        }

        if (Buffer.isBuffer(content)) {
            return content.length > 0;
        }

        if (content instanceof Uint8Array) {
            return content.byteLength > 0;
        }

        if (typeof content === 'string') {
            return content.length > 0;
        }

        if (
            typeof content.pipe === 'function' ||
            typeof content[Symbol.asyncIterator] === 'function'
        ) {
            let totalBytes = 0;

            for await (const chunk of content) {
                if (Buffer.isBuffer(chunk)) {
                    totalBytes += chunk.length;
                } else if (chunk instanceof Uint8Array) {
                    totalBytes += chunk.byteLength;
                } else if (typeof chunk === 'string') {
                    totalBytes += Buffer.byteLength(chunk);
                }
            }

            return totalBytes > 0;
        }

        return false;
    }
    
    this.on('getMyProfile', async req => {

    requireRole(req, 'Employee');

    const tx = cds.tx(req);
    const employee = await getEmployee(tx, req);

    return employee;

});
// ============================================
// APPROVAL DECISIONS - READ AUTHORIZATION
// ============================================

this.before('READ', ApprovalDecisions, async req => {
    const tx = cds.tx(req);
    const employee = await getEmployee(tx, req);

    if (hasRole(req, 'FinanceAdministrator')) {
        return;
    }

    let claimQuery = SELECT.from(ExpenseClaims).columns('ID');

    if (hasRole(req, 'Manager')) {
        const reports = await tx.run(
            SELECT.from(Employees)
                .columns('ID')
                .where({ manager_ID: employee.ID })
        );

        const allowedEmployeeIDs = [
            employee.ID,
            ...reports.map(report => report.ID)
        ];

        claimQuery.where({
            employee_ID: { in: allowedEmployeeIDs }
        });
    } else if (hasRole(req, 'FinanceReviewer')) {
        claimQuery.where({ status: 'FinanceReview' });
    } else if (hasRole(req, 'Employee')) {
        claimQuery.where({ employee_ID: employee.ID });
    } else {
        req.reject(403, 'You are not authorized to read approval decisions.');
    }

    const allowedClaims = await tx.run(claimQuery);
    const allowedClaimIDs = allowedClaims.map(claim => claim.ID);

    req.query.where({
        claim_ID: { in: allowedClaimIDs }
    });
});


// ============================================
// CLAIM STATUS HISTORY - READ AUTHORIZATION
// ============================================

this.before('READ', ClaimStatusHistories, async req => {
    const tx = cds.tx(req);
    const employee = await getEmployee(tx, req);

    if (hasRole(req, 'FinanceAdministrator')) {
        return;
    }

    let claimQuery = SELECT.from(ExpenseClaims).columns('ID');

    if (hasRole(req, 'Manager')) {
        const reports = await tx.run(
            SELECT.from(Employees)
                .columns('ID')
                .where({ manager_ID: employee.ID })
        );

        const allowedEmployeeIDs = [
            employee.ID,
            ...reports.map(report => report.ID)
        ];

        claimQuery.where({
            employee_ID: { in: allowedEmployeeIDs }
        });
    } else if (hasRole(req, 'FinanceReviewer')) {
        claimQuery.where({ status: 'FinanceReview' });
    } else if (hasRole(req, 'Employee')) {
        claimQuery.where({ employee_ID: employee.ID });
    } else {
        req.reject(403, 'You are not authorized to read claim status history.');
    }

    const allowedClaims = await tx.run(claimQuery);
    const allowedClaimIDs = allowedClaims.map(claim => claim.ID);

    req.query.where({
        claim_ID: { in: allowedClaimIDs }
    });
});


// ============================================
// REIMBURSEMENT REFERENCES - READ AUTHORIZATION
// ============================================

this.before('READ', ReimbursementReferences, async req => {
    const tx = cds.tx(req);
    const employee = await getEmployee(tx, req);

    if (hasRole(req, 'FinanceAdministrator')) {
        return;
    }

    let claimQuery = SELECT.from(ExpenseClaims).columns('ID');

    if (hasRole(req, 'Manager')) {
        const reports = await tx.run(
            SELECT.from(Employees)
                .columns('ID')
                .where({ manager_ID: employee.ID })
        );

        const allowedEmployeeIDs = [
            employee.ID,
            ...reports.map(report => report.ID)
        ];

        claimQuery.where({
            employee_ID: { in: allowedEmployeeIDs }
        });
    } else if (hasRole(req, 'FinanceReviewer')) {
        claimQuery.where({ status: 'FinanceReview' });
    } else if (hasRole(req, 'Employee')) {
        claimQuery.where({ employee_ID: employee.ID });
    } else {
        req.reject(403, 'You are not authorized to read reimbursement references.');
    }

    const allowedClaims = await tx.run(claimQuery);
    const allowedClaimIDs = allowedClaims.map(claim => claim.ID);

    req.query.where({
        claim_ID: { in: allowedClaimIDs }
    });
});


// ============================================
// EXCHANGE RATE SNAPSHOTS - READ AUTHORIZATION
// ============================================

this.before('READ', ExchangeRateSnapshots, async req => {
    const tx = cds.tx(req);
    const employee = await getEmployee(tx, req);

    if (hasRole(req, 'FinanceAdministrator')) {
        return;
    }

    let claimQuery = SELECT.from(ExpenseClaims).columns('ID');

    if (hasRole(req, 'Manager')) {
        const reports = await tx.run(
            SELECT.from(Employees)
                .columns('ID')
                .where({ manager_ID: employee.ID })
        );

        const allowedEmployeeIDs = [
            employee.ID,
            ...reports.map(report => report.ID)
        ];

        claimQuery.where({
            employee_ID: { in: allowedEmployeeIDs }
        });
    } else if (hasRole(req, 'FinanceReviewer')) {
        claimQuery.where({ status: 'FinanceReview' });
    } else if (hasRole(req, 'Employee')) {
        claimQuery.where({ employee_ID: employee.ID });
    } else {
        req.reject(403, 'You are not authorized to read exchange rate snapshots.');
    }

    const allowedClaims = await tx.run(claimQuery);
    const allowedClaimIDs = allowedClaims.map(claim => claim.ID);

    req.query.where({
        claim_ID: { in: allowedClaimIDs }
    });
});



    // =========================================================
    // INPUT PROTECTION (server is the only source of truth)
    // =========================================================

    // Claim must be Draft/Returned and owned by the caller to be edited.
    const assertClaimEditable = (req, claim, employee) => {
        assertClaimOwner(req, claim, employee);
        if (!EDITABLE_STATUSES.includes(claim.status)) {
            req.reject(
                409,
                'Submitted claims cannot be changed unless they are returned to the employee.'
            );
        }
    };

    this.before('CREATE', ExpenseClaims, async req => {
        requireRole(req, 'Employee');
        const tx = cds.tx(req);
        const employee = await getEmployee(tx, req);

        strip(req.data, CLAIM_PROTECTED);
        strip(req.data, CLAIM_CHILDREN);

        req.data.status = 'Draft';
        req.data.employee_ID = employee.ID;

        for (const item of req.data.items || []) {
            strip(item, ITEM_PROTECTED);
            for (const rec of item.receipts || []) {
                delete rec.status;
                delete rec.verificationRemarks;
            }
        }
    });


// =========================================================
// EXPENSE CLAIM - READ AUTHORIZATION
// =========================================================

this.before('READ', ExpenseClaims, async req => {
    const tx = cds.tx(req);
    const employee = await getEmployee(tx, req);

    // Finance Administrator can read all expense claims.
    if (hasRole(req, 'FinanceAdministrator')) {
        return;
    }

    // Manager can read own claims and direct reports' claims.
    if (hasRole(req, 'Manager')) {
        const reports = await tx.run(
            SELECT.from(Employees)
                .columns('ID')
                .where({ manager_ID: employee.ID })
        );

        const allowedEmployeeIDs = [
            employee.ID,
            ...reports.map(report => report.ID)
        ];

        req.query.where({
            employee_ID: { in: allowedEmployeeIDs }
        });
        return;
    }

    // Finance Reviewer can read claims in FinanceReview stage only.
    if (hasRole(req, 'FinanceReviewer')) {
        req.query.where({
            status: 'FinanceReview'
        });
        return;
    }

    // Employee can read only their own claims.
    if (hasRole(req, 'Employee')) {
        req.query.where({
            employee_ID: employee.ID
        });
        return;
    }

    req.reject(403, 'You are not authorized to read expense claims.');
});


    this.before(['UPDATE', 'DELETE'], ExpenseClaims, async req => {
        const tx = cds.tx(req);
        const employee = await getEmployee(tx, req);
        const claim = await getClaim(tx, req, req.data.ID);

        assertClaimEditable(req, claim, employee);

        if (req.event === 'UPDATE') {
            strip(req.data, CLAIM_PROTECTED);
            strip(req.data, CLAIM_CHILDREN);
            delete req.data.items;      // change items through ExpenseItems
            delete req.data.employee_ID;
        }
    });

    // =========================================================
// TRAVEL REQUEST - INPUT PROTECTION
// =========================================================


    // =========================================================
    // TRAVEL REQUEST - READ AUTHORIZATION
    // =========================================================

    
this.before('READ', TravelRequests, async req => {

    const tx = cds.tx(req);

    // Identify the logged-in employee.
    const employee = await getEmployee(tx, req);

    // Finance Administrator can read all travel requests.
    if (hasRole(req, 'FinanceAdministrator')) {
        return;
    }

    // Manager can read their own requests and direct reports' requests.
    if (hasRole(req, 'Manager')) {

        const reports = await tx.run(
            SELECT.from(Employees)
                .columns('ID')
                .where({ manager_ID: employee.ID })
        );

        const allowedEmployeeIDs = [
            employee.ID,
            ...reports.map(report => report.ID)
        ];

        req.query.where({
            employee_ID: { in: allowedEmployeeIDs }
        });

        return;
    }

    // Finance Reviewer can read travel requests
    // associated with claims pending Finance Review.
    if (hasRole(req, 'FinanceReviewer')) {

        const financeReviewClaims = await tx.run(
            SELECT.from(ExpenseClaims)
                .columns('travelRequest_ID')
                .where({ status: 'FinanceReview' })
        );

        const travelRequestIDs = [
            ...new Set(
                financeReviewClaims
                    .map(claim => claim.travelRequest_ID)
                    .filter(Boolean)
            )
        ];

        req.query.where({
            ID: { in: travelRequestIDs }
        });

        return;
    }

    // Employee can read only their own requests.
    if (hasRole(req, 'Employee')) {

        req.query.where({
            employee_ID: employee.ID
        });

        return;
    }

    // Everyone else is denied.
    req.reject(403, 'You are not authorized to read travel requests.');
});


this.before('CREATE', TravelRequests, async req => {

    // Only employees can create travel requests
    requireRole(req, 'Employee');

    const tx = cds.tx(req);

    // Identify the logged-in employee
    const employee = await getEmployee(tx, req);

    // Do not allow the client to control these fields
    delete req.data.employee_ID;
    delete req.data.status;
    delete req.data.submissionDate;
    delete req.data.submittedAt;
    delete req.data.approvalStatus;

    // Set values from the backend
    req.data.employee_ID = employee.ID;
    req.data.status = 'Draft';

});

    this.before('CREATE', ExpenseItems, async req => {
        const tx = cds.tx(req);
        const employee = await getEmployee(tx, req);
        const claim = await getClaim(tx, req, req.data.claim_ID);
        assertClaimEditable(req, claim, employee);
        strip(req.data, ITEM_PROTECTED);
    });

    this.before(['UPDATE', 'DELETE'], ExpenseItems, async req => {
        const tx = cds.tx(req);
        const employee = await getEmployee(tx, req);

        const item = await tx.run(
            SELECT.one.from(ExpenseItems).where({ ID: req.data.ID })
        );
        if (!item) req.reject(404, 'Expense item was not found.');

        const claim = await getClaim(tx, req, item.claim_ID);
        assertClaimEditable(req, claim, employee);

        if (req.event === 'UPDATE') {
            strip(req.data, ITEM_PROTECTED);
            delete req.data.claim_ID;
        }
    });


// =========================================================
// EXPENSE ITEMS - READ AUTHORIZATION
// =========================================================

this.before('READ', ExpenseItems, async req => {
    const tx = cds.tx(req);
    const employee = await getEmployee(tx, req);

    // Finance Administrator can read all expense items.
    if (hasRole(req, 'FinanceAdministrator')) {
        return;
    }

    let claimQuery = SELECT.from(ExpenseClaims)
        .columns('ID');

    // Manager: own claims + direct reports' claims.
    if (hasRole(req, 'Manager')) {
        const reports = await tx.run(
            SELECT.from(Employees)
                .columns('ID')
                .where({ manager_ID: employee.ID })
        );

        const allowedEmployeeIDs = [
            employee.ID,
            ...reports.map(report => report.ID)
        ];

        claimQuery.where({
            employee_ID: { in: allowedEmployeeIDs }
        });
    }

    // Finance Reviewer: claims in FinanceReview stage only.
    else if (hasRole(req, 'FinanceReviewer')) {
        claimQuery.where({
            status: 'FinanceReview'
        });
    }

    // Employee: own claims only.
    else if (hasRole(req, 'Employee')) {
        claimQuery.where({
            employee_ID: employee.ID
        });
    }

    else {
        req.reject(403, 'You are not authorized to read expense items.');
    }

    // Get IDs of claims the current user is allowed to access.
    const allowedClaims = await tx.run(claimQuery);

    const allowedClaimIDs = allowedClaims.map(
        claim => claim.ID
    );

    // Restrict expense items using their parent claim IDs.
    req.query.where({
        claim_ID: { in: allowedClaimIDs }
    });
});


   this.before('CREATE', ReceiptDocuments, async req => {
    const tx = cds.tx(req);
    const employee = await getEmployee(tx, req);

    const item = await tx.run(
        SELECT.one.from(ExpenseItems)
            .where({ ID: req.data.expenseItem_ID })
    );

    if (!item) {
        req.reject(404, 'Expense item was not found.');
    }

    const claim = await getClaim(tx, req, item.claim_ID);

    assertClaimEditable(req, claim, employee);

    // Validate receipt metadata.
    if (!req.data.fileName || !req.data.fileName.trim()) {
        req.reject(400, 'Receipt file name is required.');
    }

    if (!req.data.mimeType) {
        req.reject(400, 'Receipt MIME type is required.');
    }

    // Do not mark Uploaded here.
    // Binary content must be uploaded successfully first.
    req.data.status = 'PendingUpload';

    delete req.data.verificationRemarks;
    delete req.data.content;
});
// =========================================================
// RECEIPT DOCUMENTS - READ AUTHORIZATION
// =========================================================

this.before('READ', ReceiptDocuments, async req => {
    const tx = cds.tx(req);
    const employee = await getEmployee(tx, req);

    // Finance Administrator can read all receipts.
    if (hasRole(req, 'FinanceAdministrator')) {
        return;
    }

    let claimQuery = SELECT.from(ExpenseClaims)
        .columns('ID');

    // Manager: own claims + direct reports' claims.
    if (hasRole(req, 'Manager')) {
        const reports = await tx.run(
            SELECT.from(Employees)
                .columns('ID')
                .where({ manager_ID: employee.ID })
        );

        const allowedEmployeeIDs = [
            employee.ID,
            ...reports.map(report => report.ID)
        ];

        claimQuery.where({
            employee_ID: { in: allowedEmployeeIDs }
        });
    }

    // Finance Reviewer: FinanceReview claims only.
    else if (hasRole(req, 'FinanceReviewer')) {
        claimQuery.where({
            status: 'FinanceReview'
        });
    }

    // Employee: own claims only.
    else if (hasRole(req, 'Employee')) {
        claimQuery.where({
            employee_ID: employee.ID
        });
    }

    else {
        req.reject(403, 'You are not authorized to read receipts.');
    }

    const allowedClaims = await tx.run(claimQuery);

    const allowedClaimIDs = allowedClaims.map(
        claim => claim.ID
    );

    const allowedItems = await tx.run(
        SELECT.from(ExpenseItems)
            .columns('ID')
            .where({
                claim_ID: { in: allowedClaimIDs }
            })
    );

    const allowedItemIDs = allowedItems.map(
        item => item.ID
    );

    req.query.where({
        expenseItem_ID: { in: allowedItemIDs }
    });
});

this.before(['UPDATE', 'DELETE'], ReceiptDocuments, async req => {
    const tx = cds.tx(req);
    const employee = await getEmployee(tx, req);

    const receipt = await tx.run(
        SELECT.one.from(ReceiptDocuments)
            .where({ ID: req.data.ID })
    );

    if (!receipt) {
        return req.reject(404, 'Receipt was not found.');
    }

    const item = await tx.run(
        SELECT.one.from(ExpenseItems)
            .where({ ID: receipt.expenseItem_ID })
    );

    if (!item) {
        return req.reject(404, 'Expense item was not found.');
    }

    const claim = await getClaim(tx, req, item.claim_ID);

    // Finance reviewer can update verification details only.
    if (
        req.event === 'UPDATE' &&
        claim.status === 'FinanceReview' &&
        hasRole(req, 'FinanceReviewer')
    ) {
        assertNotOwnClaim(req, claim, employee);

        const { ID, status, verificationRemarks } = req.data;

        Object.keys(req.data).forEach(key => delete req.data[key]);

        Object.assign(req.data, {
            ID,
            status,
            verificationRemarks
        });

        return;
    }

    // Employee must own the claim and it must be editable.
    assertClaimEditable(req, claim, employee);

    if (req.event === 'UPDATE') {
        // Employees cannot change verification status.
        delete req.data.status;
        delete req.data.verificationRemarks;

        // Employees cannot move a receipt to another expense item.
        delete req.data.expenseItem_ID;
    }
});


// Once the file content arrives, the SERVER marks the receipt as Uploaded.
this.after('UPDATE', ReceiptDocuments, async (_, req) => {
    if (req.data.content === undefined) {
        return;                       // metadata-only update, not a file upload
    }

    await cds.tx(req).run(
        UPDATE(ReceiptDocuments)
            .set({ status: 'Uploaded' })
            .where({ ID: req.data.ID })
    );
});


// =====================================================
// GET PENDING TRAVEL REQUESTS FOR MANAGER
// =====================================================

this.on('getPendingTravelRequests', async req => {
    requireRole(req, 'Manager');

    const tx = cds.tx(req);

    // Get the logged-in manager
    const manager = await getEmployee(tx, req);

    console.log('Logged-in manager:', manager.fullName);
    console.log('Manager ID:', manager.ID);

    // Get employees reporting directly to this manager
    const reports = await tx.run(
        SELECT.from(Employees)
            .columns('ID', 'fullName', 'manager_ID')
            .where({
                manager_ID: manager.ID
            })
    );

    console.log('Direct reports:', reports);

    // No direct reports means no pending travel requests
    if (!reports.length) {
        return [];
    }

    const reportIDs = reports.map(employee => employee.ID);

    // Fetch only Submitted travel requests from direct reports
    const pendingRequests = await tx.run(
        SELECT.from(TravelRequests)
            .where({
                status: 'Submitted',
                employee_ID: { in: reportIDs }
            })
            .orderBy('submissionDate asc')
    );

    console.log('Pending travel requests:', pendingRequests);

    return pendingRequests;
});

    // =========================================================
    // 1. SUBMIT TRAVEL REQUEST
    // =========================================================

    this.on('submitTravelRequest', async req => {

        requireRole(req, 'Employee');

        const tx = cds.tx(req);
        const employee = await getEmployee(tx, req);
        const { requestID } = req.data;

        const travel = await tx.run(
            SELECT.one.from(TravelRequests).where({ ID: requestID })
        );

        if (!travel) req.reject(404, 'Travel request was not found.');

        if (travel.employee_ID !== employee.ID) {
            req.reject(403, 'You can submit only your own travel request.');
        }

        if (travel.status !== 'Draft') {
            req.reject(409, 'Only Draft travel requests can be submitted.');
        }

        if (new Date(travel.endDate) < new Date(travel.startDate)) {
            req.reject(400, 'Travel end date cannot be before start date.');
        }

        await tx.run(
            UPDATE(TravelRequests)
                .set({ status: 'Submitted', submissionDate: now() })
                .where({ ID: requestID })
        );

        return tx.run(SELECT.one.from(TravelRequests).where({ ID: requestID }));
    });

    
    // =========================================================
    // 2. APPROVE TRAVEL REQUEST
    // =========================================================

    this.on('approveTravelRequest', async req => {

        // 1. Only users with Manager role can approve.
        requireRole(req, 'Manager');

        const tx = cds.tx(req);

        // 2. Identify the logged-in manager.
        const manager = await getEmployee(tx, req);

        const { requestID } = req.data;

        // 3. Validate request ID.
        if (!requestID) {
            req.reject(400, 'Travel request ID is required.');
        }

        // 4. Find the travel request.
        const travel = await tx.run(
            SELECT.one.from(TravelRequests)
                .where({ ID: requestID })
        );

        if (!travel) {
            req.reject(404, 'Travel request was not found.');
        }

        // 5. Find the employee who created the request.
        const owner = await tx.run(
            SELECT.one.from(Employees)
                .where({ ID: travel.employee_ID })
        );

        if (!owner) {
            req.reject(404, 'Employee associated with this request was not found.');
        }

        // 6. Verify that the logged-in manager is the employee's line manager.
        if (owner.manager_ID !== manager.ID) {
            req.reject(
                403,
                'Only the employee line manager can approve this travel request.'
            );
        }

        // 7. A manager cannot approve their own travel request.
        if (travel.employee_ID === manager.ID) {
            req.reject(403, 'You cannot approve your own travel request.');
        }

        // 8. Only Submitted requests can be approved.
        if (travel.status !== 'Submitted') {
            req.reject(
                409,
                'Only Submitted travel requests can be approved.'
            );
        }

        // 9. Update approval information.
        await tx.run(
            UPDATE(TravelRequests)
                .set({
                    status: 'Approved',
                    approvedBy_ID: manager.ID,
                    approvedAt: now(),
                    rejectionReason: null
                })
                .where({ ID: requestID })
        );

        // 10. Return the updated travel request.
        return tx.run(
            SELECT.one.from(TravelRequests)
                .where({ ID: requestID })
        );
    });

    
// =========================================================
// REJECT TRAVEL REQUEST
// =========================================================
this.on('rejectTravelRequest', async req => {

    // 1. Only Manager role can reject a travel request.
    requireRole(req, 'Manager');

    const tx = cds.tx(req);

    // 2. Identify the logged-in manager.
    const manager = await getEmployee(tx, req);

    const { requestID, reason } = req.data;

    // 3. Validate mandatory inputs.
    if (!requestID) {
        req.reject(400, 'Travel request ID is required.');
    }

    if (!reason || !reason.trim()) {
        req.reject(400, 'Rejection reason is required.');
    }

    // 4. Find the travel request.
    const travel = await tx.run(
        SELECT.one.from(TravelRequests)
            .where({ ID: requestID })
    );

    if (!travel) {
        req.reject(404, 'Travel request was not found.');
    }

    // 5. Find the employee who created the request.
    const owner = await tx.run(
        SELECT.one.from(Employees)
            .where({ ID: travel.employee_ID })
    );

    if (!owner) {
        req.reject(
            404,
            'Employee associated with this request was not found.'
        );
    }

    // 6. Verify direct reporting relationship.
    if (owner.manager_ID !== manager.ID) {
        req.reject(
            403,
            'Only the employee line manager can reject this travel request.'
        );
    }

    // 7. Prevent managers from rejecting their own requests.
    if (travel.employee_ID === manager.ID) {
        req.reject(
            403,
            'You cannot reject your own travel request.'
        );
    }

    // 8. Only Submitted requests can be rejected.
    if (travel.status !== 'Submitted') {
        req.reject(
            409,
            'Only Submitted travel requests can be rejected.'
        );
    }

    // 9. Update rejection details.
    await tx.run(
        UPDATE(TravelRequests)
            .set({
                status: 'Rejected',
                approvedBy_ID: manager.ID,
                approvedAt: now(),
                rejectionReason: reason.trim()
            })
            .where({ ID: requestID })
    );

    // 10. Return updated travel request.
    return tx.run(
        SELECT.one.from(TravelRequests)
            .where({ ID: requestID })
    );
  });

    // =========================================================
    // 2. SUBMIT EXPENSE CLAIM
    //    All calculations are server-side:
    //    mileage amount, currency conversion, policy cap, totals.
    // =========================================================

   
this.on('submitClaim', async req => {

    requireRole(req, 'Employee');

    const tx = cds.tx(req);
    const employee = await getEmployee(tx, req);
    const { claimID } = req.data;

    const claim = await getClaim(tx, req, claimID);
    assertClaimOwner(req, claim, employee);

    if (!EDITABLE_STATUSES.includes(claim.status)) {
        req.reject(409, 'Only Draft or Returned claims can be submitted.');
    }

    // ----- trip must be approved -----
    const travel = await tx.run(
        SELECT.one.from(TravelRequests).where({
            ID: claim.travelRequest_ID
        })
    );

    if (!travel || !['Approved', 'Completed'].includes(travel.status)) {
        req.reject(
            409,
            'The travel request must be Approved or Completed before claiming expenses.'
        );
    }

    const base = await tx.run(
        SELECT.one.from(Currencies).where({
            isBaseCurrency: true
        })
    );

    if (!base) {
        req.reject(500, 'No base currency is configured.');
    }

    const categories = await tx.run(
        SELECT.from(ExpenseCategories)
    );

    const categoryById = new Map(
        categories.map(c => [c.ID, c])
    );

    const items = await getClaimItems(tx, claimID);

    if (!items.length) {
        req.reject(400, 'Add at least one expense item before submitting.');
    }

    // ----- reset snapshots of an earlier submission (re-submit after Return) -----
    await tx.run(
        UPDATE(ExpenseItems)
            .set({ exchangeRateSnapshot_ID: null })
            .where({ claim_ID: claimID })
    );

    await tx.run(
        DELETE.from(ExchangeRateSnapshots)
            .where({ claim_ID: claimID })
    );

    const seen = new Set();
    const computed = [];

    for (const item of items) {

        const label = `Item "${item.description}"`;
        const category = categoryById.get(item.category_ID);

        if (!category || !category.isActive) {
            req.reject(400, `${label}: expense category is not active.`);
        }

        // ----- claim-period rule -----
        if (
            item.expenseDate < travel.startDate ||
            item.expenseDate > travel.endDate
        ) {
            req.reject(
                400,
                `${label}: expense date ${item.expenseDate} is outside the trip period ` +
                `${travel.startDate} to ${travel.endDate}.`
            );
        }

        let currencyID = item.currency_ID;
        let amount = Number(item.amount);
        let ratePerKM = item.ratePerKM;

        if (category.requiresDistance) {
            if (!(Number(item.distanceInKM) > 0)) {
                req.reject(
                    400,
                    `${label}: distanceInKM is required for mileage.`
                );
            }

            currencyID = base.ID;
        }

        const policy = await findPolicy(
            tx,
            item.category_ID,
            currencyID,
            base.ID,
            item.expenseDate
        );

        if (!policy) {
            req.reject(
                400,
                `${label}: no active policy limit is valid for this category and date.`
            );
        }

        // ----- mileage amount is calculated by the server -----
        if (category.requiresDistance) {
            ratePerKM = Number(policy.maximumAmount);
            amount = round2(
                Number(item.distanceInKM) * ratePerKM
            );
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            req.reject(
                400,
                `${label}: amount must be greater than zero.`
            );
        }

        // ----- currency conversion -----
        let rate = 1;
        let rateRow = null;

        if (currencyID !== base.ID) {
            rateRow = await findRate(
                tx,
                currencyID,
                base.ID,
                item.expenseDate
            );

            if (!rateRow) {
                req.reject(
                    400,
                    `${label}: no exchange rate is available for ${item.expenseDate}.`
                );
            }

            rate = Number(rateRow.rate);
        }

        const baseAmount = round2(amount * rate);

        // ----- policy cap (per night / day / km / trip) -----
        const units = unitsFor(req, policy, item, label);
        const cap = round2(
            Number(policy.maximumAmount) * units
        );

        let eligibleBase;

        if (policy.currency_ID === currencyID) {
            eligibleBase = round2(
                Math.min(amount, cap) * rate
            );
        } else {
            eligibleBase = Math.min(baseAmount, cap);
        }

        eligibleBase = Math.min(eligibleBase, baseAmount);

        const exceptionBase = round2(
            baseAmount - eligibleBase
        );

        const exceeded = exceptionBase > 0;

        if (exceeded && !item.exceptionReason?.trim()) {
            req.reject(
                400,
                `${label}: an exception reason is required because the policy limit is exceeded.`
            );
        }

        // ----- receipt rule: mandatory when amount EXCEEDS the threshold -----
       // ----- receipt rule: mandatory when amount EXCEEDS the threshold -----
const receiptBasis =
    policy.currency_ID === currencyID
        ? amount
        : baseAmount;

// Read receipt metadata and uploaded binary content
const receipts = await tx.run(
    SELECT.from(ReceiptDocuments)
        .columns(
            'ID',
            'fileName',
            'fileHash',
            'receiptNumber',
            'status'
        )
        .where({
            expenseItem_ID: item.ID
        })
);

if (receiptBasis > Number(policy.receiptThreshold)) {

    const hasUploadedReceipt = receipts.some(
        receipt => receipt.status === 'Uploaded'
    );

    if (!hasUploadedReceipt) {
        req.reject(
            400,
            `${label}: upload a receipt because the amount exceeds the receipt threshold.`
        );
    }
}

        // ----- duplicate receipts -----
        for (const r of receipts) {

            let dup = null;

            if (r.fileHash) {
                dup = await tx.run(
                    SELECT.one.from(ReceiptDocuments)
                        .where({
                            fileHash: r.fileHash,
                            ID: { '!=': r.ID }
                        })
                );
            }

            if (!dup && r.receiptNumber) {
                dup = await tx.run(
                    SELECT.one.from(ReceiptDocuments)
                        .where({
                            receiptNumber: r.receiptNumber,
                            ID: { '!=': r.ID }
                        })
                );
            }

            if (dup) {
                req.reject(
                    409,
                    `${label}: duplicate receipt detected (${r.receiptNumber || r.fileName}).`
                );
            }
        }

        // ----- duplicate item inside the same claim -----
        const key = [
            item.category_ID,
            item.expenseDate,
            currencyID,
            amount
        ].join('|');

        if (seen.has(key)) {
            req.reject(
                409,
                `${label}: duplicate expense line inside this claim.`
            );
        }

        seen.add(key);

        computed.push({
            item,
            currencyID,
            amount,
            ratePerKM,
            rate,
            rateRow,
            baseAmount,
            eligibleBase,
            exceptionBase,
            exceeded,
            policy
        });
    }

    // ----- duplicate expense in other claims of the same employee -----
    const otherClaims = await tx.run(
        SELECT.from(ExpenseClaims)
            .columns('ID')
            .where({
                employee_ID: claim.employee_ID,
                ID: { '!=': claimID },
                status: {
                    'not in': ['Draft', 'Rejected']
                }
            })
    );

    if (otherClaims.length) {

        const otherItems = await tx.run(
            SELECT.from(ExpenseItems)
                .where({
                    claim_ID: {
                        in: otherClaims.map(c => c.ID)
                    }
                })
        );

        for (const c of computed) {

            const clash = otherItems.find(o =>
                o.category_ID === c.item.category_ID &&
                o.expenseDate === c.item.expenseDate &&
                o.currency_ID === c.currencyID &&
                Number(o.amount) === c.amount
            );

            if (clash) {
                req.reject(
                    409,
                    `Item "${c.item.description}": the same expense was already claimed in another claim.`
                );
            }
        }
    }

    // ----- write results + snapshots -----
    for (const c of computed) {

        let snapshotID = null;

        if (c.rateRow) {

            snapshotID = randomUUID();

            await tx.run(
                INSERT.into(ExchangeRateSnapshots).entries({
                    ID: snapshotID,
                    claim_ID: claimID,
                    expenseItem_ID: c.item.ID,
                    fromCurrency_ID: c.currencyID,
                    toCurrency_ID: base.ID,
                    exchangeRate: c.rate,
                    effectiveDate: c.item.expenseDate,
                    rateSource: c.rateRow.rateSource,
                    capturedAt: now(),
                    sourceReference: c.rateRow.ID
                })
            );
        }

        await tx.run(
            UPDATE(ExpenseItems)
                .set({
                    amount: c.amount,
                    currency_ID: c.currencyID,
                    ratePerKM: c.ratePerKM,
                    exchangeRate: c.rate,
                    baseCurrencyAmount: c.baseAmount,
                    eligibleAmount: c.eligibleBase,
                    exceptionAmount: c.exceptionBase,
                    policyLimitAmount: c.policy.maximumAmount,
                    policyLimitType: c.policy.limitType,
                    policyCodeSnapshot: c.policy.policyCode,
                    policyCurrency_ID: c.policy.currency_ID,
                    policyValidFrom: c.policy.validFrom,
                    policyValidTo: c.policy.validTo,
                    policyCapturedAt: now(),
                    policyExceeded: c.exceeded,
                    overrideApproved: false,
                    overrideReason: null,
                    itemStatus: c.exceeded
                        ? 'PolicyException'
                        : 'WithinPolicy',
                    exchangeRateSnapshot_ID: snapshotID
                })
                .where({
                    ID: c.item.ID
                })
        );
    }

    const previousStatus = claim.status;

    await tx.run(
        UPDATE(ExpenseClaims)
            .set({
                status: 'Submitted',
                currentApprovalStage: 'Manager',
                baseCurrency_ID: base.ID,
                submissionDate: now(),
                submittedAt: now(),
                completedAt: null,
                rejectionReason: null
            })
            .where({
                ID: claimID
            })
    );

    await recalcClaimTotals(tx, claimID);

    await addStatusHistory(
        tx,
        claimID,
        previousStatus,
        'Submitted',
        employee.ID,
        'submitClaim'
    );

    return tx.run(
        SELECT.one.from(ExpenseClaims)
            .where({
                ID: claimID
            })
    );
});


    // =========================================================
    // 3. APPROVE CLAIM
    //    Manager approval -> ManagerApproved -> FinanceReview
    //    Finance approval -> FinanceApproved
    // =========================================================

    this.on('approveClaim', async req => {

        const tx = cds.tx(req);
        const employee = await getEmployee(tx, req);
        const { claimID, comments } = req.data;

        const claim = await getClaim(tx, req, claimID);

        if (!['Submitted', 'FinanceReview'].includes(claim.status)) {
            req.reject(409, 'This claim is not waiting for an approval decision.');
        }

        const stage = await resolveStage(tx, req, claim, employee, 'approved');

        await addDecision(tx, claimID, stage, 'Approved', employee.ID, comments);

        if (stage === 'Manager') {

            await tx.run(
                UPDATE(ExpenseClaims)
                    .set({ status: 'FinanceReview', currentApprovalStage: 'Finance' })
                    .where({ ID: claimID })
            );

            await addStatusHistory(tx, claimID, 'Submitted', 'ManagerApproved',
                employee.ID, 'approveClaim', comments);
            await addStatusHistory(tx, claimID, 'ManagerApproved', 'FinanceReview',
                null, 'autoRoute');

        } else {

            await tx.run(
                UPDATE(ExpenseClaims)
                    .set({ status: 'FinanceApproved', currentApprovalStage: null })
                    .where({ ID: claimID })
            );

            await addStatusHistory(tx, claimID, 'FinanceReview', 'FinanceApproved',
                employee.ID, 'approveClaim', comments);
        }

        return tx.run(SELECT.one.from(ExpenseClaims).where({ ID: claimID }));
    });

    // =========================================================
    // 4. REJECT CLAIM
    // =========================================================

    this.on('rejectClaim', async req => {

        const tx = cds.tx(req);
        const employee = await getEmployee(tx, req);
        const { claimID, reason } = req.data;

        if (!reason?.trim()) req.reject(400, 'A rejection reason is mandatory.');

        const claim = await getClaim(tx, req, claimID);
        const stage = await resolveStage(tx, req, claim, employee, 'rejected');

        await addDecision(tx, claimID, stage, 'Rejected', employee.ID, reason);

        await tx.run(
            UPDATE(ExpenseClaims)
                .set({
                    status: 'Rejected',
                    currentApprovalStage: null,
                    rejectionReason: reason,
                    completedAt: now()
                })
                .where({ ID: claimID })
        );

        await addStatusHistory(tx, claimID, claim.status, 'Rejected',
            employee.ID, 'rejectClaim', reason);

        return tx.run(SELECT.one.from(ExpenseClaims).where({ ID: claimID }));
    });

    // =========================================================
    // 5. RETURN CLAIM FOR EMPLOYEE CORRECTION
    // =========================================================

    this.on('returnClaim', async req => {

        const tx = cds.tx(req);
        const employee = await getEmployee(tx, req);
        const { claimID, reason } = req.data;

        if (!reason?.trim()) req.reject(400, 'A return reason is mandatory.');

        const claim = await getClaim(tx, req, claimID);
        const stage = await resolveStage(tx, req, claim, employee, 'returned');

        await addDecision(tx, claimID, stage, 'Returned', employee.ID, reason);

        await tx.run(
            UPDATE(ExpenseClaims)
                .set({
                    status: 'Returned',
                    currentApprovalStage: null,
                    rejectionReason: null
                })
                .where({ ID: claimID })
        );

        await addStatusHistory(tx, claimID, claim.status, 'Returned',
            employee.ID, 'returnClaim', reason);

        return tx.run(SELECT.one.from(ExpenseClaims).where({ ID: claimID }));
    });

    // =========================================================
    // 6. POLICY LIMIT OVERRIDE (Finance Reviewer, reason mandatory)
    // =========================================================

    this.on('overridePolicyLimit', async req => {

        requireRole(req, 'FinanceAdministrator');

        const tx = cds.tx(req);
        const employee = await getEmployee(tx, req);
        const { claimID, expenseItemID, reason } = req.data;

        if (!reason?.trim()) {
            req.reject(400, 'A policy override reason is mandatory.');
        }

        const claim = await getClaim(tx, req, claimID);
        assertNotOwnClaim(req, claim, employee);

        if (claim.status !== 'FinanceReview') {
            req.reject(409, 'Policy overrides are allowed during Finance Review only.');
        }

        const item = await tx.run(
            SELECT.one.from(ExpenseItems).where({ ID: expenseItemID, claim_ID: claimID })
        );

        if (!item) req.reject(404, 'Expense item was not found for this claim.');

        if (!item.policyExceeded || item.overrideApproved) {
            req.reject(409, 'This item has no open policy exception to override.');
        }

        const overriddenAmount = Number(item.exceptionAmount || 0);

        await tx.run(
            UPDATE(ExpenseItems)
                .set({
                    overrideApproved: true,
                    overrideReason: reason,
                    eligibleAmount: item.baseCurrencyAmount,
                    exceptionAmount: 0,
                    itemStatus: 'Approved'
                })
                .where({ ID: expenseItemID })
        );

        await recalcClaimTotals(tx, claimID);

        await addDecision(tx, claimID, 'Finance', 'Approved', employee.ID, reason, {
            isPolicyOverride: true,
            overrideAmount: overriddenAmount,
            overrideReason: reason
        });

        await addStatusHistory(tx, claimID, 'FinanceReview', 'FinanceReview',
            employee.ID, 'overridePolicyLimit', reason);

        LOG.info('POLICY OVERRIDE', {
            claimID, expenseItemID, overriddenAmount, by: employee.email, reason
        });

        return tx.run(SELECT.one.from(ExpenseItems).where({ ID: expenseItemID }));
    });

    // =========================================================
    // 7. ERP ADAPTER
    //    Uses destination "ERP" when configured in cds.requires,
    //    otherwise a local mock (development only).
    // =========================================================

    const callERP = async (payload, idempotencyKey, attempt) => {

        if (cds.env.requires?.ERP) {
            const erp = await cds.connect.to('ERP');
            return erp.send({
                method: 'POST',
                path: '/expense-claims',
                data: payload,
                headers: { 'Idempotency-Key': idempotencyKey }
            });
        }

        if (ERP_MOCK_FAIL_FIRST_ATTEMPT && attempt === 1) {
            throw new Error('ERP mock: simulated connection timeout');
        }

        return { reference: `ERP-MOCK-${payload.claimNumber}` };
    };

    const performERPExport = async (req, claimID, allowedStatuses) => {

        const tx = cds.tx(req);
        const employee = await getEmployee(tx, req);
        const claim = await getClaim(tx, req, claimID);

        if (!allowedStatuses.includes(claim.status)) {
            req.reject(409, `Claim status must be ${allowedStatuses.join(' or ')} for this operation.`);
        }

        const existing = await tx.run(
            SELECT.one.from(ReimbursementReferences).where({ claim_ID: claimID })
        );

        const idempotencyKey = existing?.idempotencyKey || `TRAVEL-CLAIM-${claimID}`;
        const attempt = (existing?.exportAttemptCount || 0) + 1;

        await tx.run(
            UPDATE(ExpenseClaims).set({ status: 'ExportPending' }).where({ ID: claimID })
        );
        await addStatusHistory(tx, claimID, claim.status, 'ExportPending',
            employee.ID, 'exportClaimToERP');

        const upsertReference = async data => {
            if (existing) {
                await tx.run(
                    UPDATE(ReimbursementReferences).set(data).where({ ID: existing.ID })
                );
            } else {
                await tx.run(
                    INSERT.into(ReimbursementReferences).entries({
                        ID: randomUUID(),
                        claim_ID: claimID,
                        idempotencyKey,
                        paymentStatus: 'Pending',
                        ...data
                    })
                );
            }
        };

        try {

            const items = await getClaimItems(tx, claimID);

            const response = await callERP({
                claimNumber: claim.claimNumber,
                employee_ID: claim.employee_ID,
                totalEligible: claim.totalEligible,
                baseCurrency_ID: claim.baseCurrency_ID,
                items: items.map(i => ({
                    category_ID: i.category_ID,
                    expenseDate: i.expenseDate,
                    description: i.description,
                    amount: i.amount,
                    currency_ID: i.currency_ID,
                    exchangeRate: i.exchangeRate,
                    baseCurrencyAmount: i.baseCurrencyAmount,
                    eligibleAmount: i.eligibleAmount
                }))
            }, idempotencyKey, attempt);

            const erpReference = response?.reference || response?.erpReference;

            if (!erpReference) {
                throw new Error('ERP response did not contain an ERP reference.');
            }

            await upsertReference({
                erpReference,
                exportStatus: 'Success',
                exportDate: now(),
                exportAttemptCount: attempt,
                lastExportError: null
            });

            await tx.run(
                UPDATE(ExpenseClaims).set({ status: 'Exported' }).where({ ID: claimID })
            );
            await addStatusHistory(tx, claimID, 'ExportPending', 'Exported',
                null, 'exportClaimToERP', erpReference);

        } catch (error) {

            // IMPORTANT: do not req.reject()/req.error() here. That would roll back
            // the transaction and the ExportFailed state would never be saved.
            await upsertReference({
                exportStatus: 'Failed',
                exportDate: now(),
                exportAttemptCount: attempt,
                lastExportError: error.message
            });

            await tx.run(
                UPDATE(ExpenseClaims).set({ status: 'ExportFailed' }).where({ ID: claimID })
            );
            await addStatusHistory(tx, claimID, 'ExportPending', 'ExportFailed',
                null, 'exportClaimToERP', error.message);

            req.warn(502, `ERP export failed: ${error.message}`);
        }

        return tx.run(
            SELECT.one.from(ReimbursementReferences).where({ claim_ID: claimID })
        );
    };

    // 8. EXPORT CLAIM TO ERP
    this.on('exportClaimToERP', async req => {
        requireRole(req, 'FinanceAdministrator');
        return performERPExport(req, req.data.claimID, ['FinanceApproved']);
    });

    // 9. RETRY ERP EXPORT
    this.on('retryERPExport', async req => {
        requireRole(req, 'FinanceAdministrator');
        return performERPExport(req, req.data.claimID, ['ExportFailed']);
    });

    // =========================================================
    // 10. MARK CLAIM AS REIMBURSED
    // =========================================================

    this.on('markReimbursed', async req => {

        requireRole(req, 'FinanceAdministrator');

        const tx = cds.tx(req);
        const employee = await getEmployee(tx, req);
        const { claimID, paymentReference, reimbursedAmount } = req.data;

        if (!paymentReference?.trim()) {
            req.reject(400, 'Payment reference is required.');
        }

        if (!(Number(reimbursedAmount) > 0)) {
            req.reject(400, 'Reimbursed amount must be greater than zero.');
        }

        const claim = await getClaim(tx, req, claimID);

        if (claim.status !== 'Exported') {
            req.reject(409, 'Only exported claims can be marked as reimbursed.');
        }

        if (round2(reimbursedAmount) !== round2(claim.totalEligible)) {
            req.reject(
                400,
                `Reimbursed amount must equal the eligible total (${round2(claim.totalEligible)}).`
            );
        }

        const reference = await tx.run(
            SELECT.one.from(ReimbursementReferences).where({ claim_ID: claimID })
        );

        if (!reference || reference.exportStatus !== 'Success') {
            req.reject(409, 'A successful ERP export is required before reimbursement.');
        }

        await tx.run(
            UPDATE(ReimbursementReferences)
                .set({
                    paymentReference,
                    paymentStatus: 'Paid',
                    paymentDate: now(),
                    reimbursedAmount
                })
                .where({ ID: reference.ID })
        );

        await tx.run(
            UPDATE(ExpenseClaims)
                .set({ status: 'Reimbursed', completedAt: now() })
                .where({ ID: claimID })
        );

        await addStatusHistory(tx, claimID, claim.status, 'Reimbursed',
            employee.ID, 'markReimbursed', paymentReference);

        return tx.run(SELECT.one.from(ExpenseClaims).where({ ID: claimID }));
    });

    // =========================================================
    // 11-16. QUERY FUNCTIONS
    // =========================================================

    this.on('getMyClaims', async req => {

    requireRole(req, 'Employee');

    const tx = cds.tx(req);
    const employee = await getEmployee(tx, req);

    return tx.run(
        SELECT.from(ExpenseClaims)
            .where({ employee_ID: employee.ID })
            .orderBy({ createdAt: 'desc' })
    );
});
    // Manager inbox: only claims of the manager's direct reports
   /* this.on('getPendingApprovals', async req => {
        requireRole(req, 'Manager');

        const tx = cds.tx(req);
        const employee = await getEmployee(tx, req);

        const reports = await tx.run(
            SELECT.from(Employees).columns('ID').where({ manager_ID: employee.ID })
        );
        if (!reports.length) return [];

        return tx.run(
            SELECT.from(ExpenseClaims)
                .where({ status: 'Submitted', employee_ID: { in: reports.map(r => r.ID) } })
                .orderBy({ submittedAt: 'asc' })
        );
    });*/

    this.on('getPendingApprovals', async req => {
    requireRole(req, 'Manager');

    const tx = cds.tx(req);
    const employee = await getEmployee(tx, req);

    console.log("Logged-in employee:", employee);

    const reports = await tx.run(
        SELECT.from(Employees)
            .columns('ID', 'fullName', 'manager_ID')
            .where({ manager_ID: employee.ID })
    );

    console.log("Direct reports:", reports);

    const claims = await tx.run(
        SELECT.from(ExpenseClaims)
            .where({
                status: 'Submitted',
                employee_ID: {
                    in: reports.map(r => r.ID)
                }
            })
    );

    console.log("Pending claims:", claims);

    return claims;
});

    this.on('getPendingFinanceReviews', async req => {
        requireRole(req, 'FinanceReviewer');

        const tx = cds.tx(req);
        const employee = await getEmployee(tx, req);

        return tx.run(
            SELECT.from(ExpenseClaims)
                .where({ status: 'FinanceReview', employee_ID: { '!=': employee.ID } })
                .orderBy({ submittedAt: 'asc' })
        );
    });

    this.on('getExpenseCategories', async req => {
        const tx = cds.tx(req);
        return tx.run(
            SELECT.from(ExpenseCategories).where({ isActive: true }).orderBy('categoryName')
        );
    });

    this.on('getPolicyLimits', async req => {
        const tx = cds.tx(req);
        return tx.run(SELECT.from(PolicyLimits).where({ isActive: true }));
    });

    this.on('getClaimApprovalHistory', async req => {

        const tx = cds.tx(req);
        const employee = await getEmployee(tx, req);
        const claim = await getClaim(tx, req, req.data.claimID);

        const isFinance =
            hasRole(req, 'FinanceReviewer') || hasRole(req, 'FinanceAdministrator');

        let allowed = isFinance || claim.employee_ID === employee.ID;

        if (!allowed && hasRole(req, 'Manager')) {
            const owner = await tx.run(
                SELECT.one.from(Employees).where({ ID: claim.employee_ID })
            );
            allowed = owner?.manager_ID === employee.ID;
        }

        if (!allowed) {
            req.reject(403, 'You are not authorized to view this claim history.');
        }

        return tx.run(
            SELECT.from(ApprovalDecisions)
                .where({ claim_ID: claim.ID })
                .orderBy({ decisionDate: 'asc' })
        );
    });
});