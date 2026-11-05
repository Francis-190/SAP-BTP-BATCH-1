const cds = require('@sap/cds')
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const nodemailer = require("nodemailer");
const { analyzeClaim } = require('./openrouter');



// ==========================================
// MAIL CONFIGURATION
// ==========================================

const MAIL_CONFIG = {
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 465),
    secure: process.env.MAIL_SECURE === 'true',

    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD
    },

    from: process.env.MAIL_FROM,

    to: process.env.MAIL_TO
        ? process.env.MAIL_TO.split(",").map(email => email.trim())
        : []
};

module.exports = cds.service.impl(async function () {



    const {
        Policies,
        Claims,
        ClaimDocuments,
    } = this.entities;

    const db = await cds.connect.to('db');

    const {
        FraudRiskScores,
        AlertLog,
        Investigations,
        Approvals,
        Payouts
    } = db.entities;

    this.before('CREATE', 'FraudRiskScores', async (req) => {

        const score = req.data.riskScore;

        if (score < 0 || score > 100) {
            return req.error(
                400,
                'Risk score must be between 0 and 100'
            );
        }

        if (score <= 25) {
            req.data.riskLevel = 'Low';
        }
        else if (score <= 50) {
            req.data.riskLevel = 'Medium';
        }
        else if (score <= 75) {
            req.data.riskLevel = 'High';
        }
        else {
            req.data.riskLevel = 'Critical';
        }
    });



    // Investigations


    this.before('UPDATE', 'Investigations', async (req) => {

        // If investigation is completed,
        // findings should be provided

        if (req.data.status === 'Completed' &&
            !req.data.findings) {

            req.error(
                400,
                'Findings are required when investigation is completed'
            );
        }
    });



    // Approvals


    this.before('UPDATE', 'Approvals', async (req) => {

        // If decision is Approved or Rejected,
        // approver must be available

        if (
            (req.data.decision === 'Approved' ||
                req.data.decision === 'Rejected') &&
            !req.data.approver_ID
        ) {
            req.error(
                400,
                'Approver is required for approval decision'
            );
        }
    });



    this.before(['CREATE', 'UPDATE'], 'Policies', async (req) => {

        const { startDate, endDate, coverageLimit } = req.data;

        if (startDate && endDate && endDate < startDate) {
            return req.error(400, 'End date cannot be before start date');
        }

        if (coverageLimit !== undefined && coverageLimit <= 0) {
            return req.error(400, 'Coverage limit must be greater than zero');
        }
    });

this.before('CREATE', 'Claims', async (req) => {

    const { policy_ID, claimedAmount } = req.data;

    const policy = await SELECT.one
        .from(Policies)
        .where({ ID: policy_ID });

    if (!policy) {
        return req.error(400, 'Policy not found');
    }

    if (policy.status !== 'Active') {
        return req.error(400, 'Claim cannot be created for an inactive policy');
    }

    if (claimedAmount !== undefined && claimedAmount <= 0) {
        return req.error(400, 'Claimed amount must be greater than zero');
    }

    // ---- Auto-generate claim number: CLM001, CLM002, ... ----
    if (!req.data.claimNumber) {
        const rows = await SELECT.from(Claims).columns('claimNumber');

        const maxNumber = rows.reduce((max, row) => {
            const n = parseInt(String(row.claimNumber || '').replace(/\D/g, ''), 10);
            return Number.isNaN(n) ? max : Math.max(max, n);
        }, 0);

        req.data.claimNumber = 'CLM' + String(maxNumber + 1).padStart(3, '0');
    }
});
  this.before('UPDATE', 'Claims', async (req) => {

    if (req.data.claimedAmount !== undefined &&
        req.data.claimedAmount <= 0) {
        return req.error(400, 'Claimed amount must be greater than zero');
    }

    const claim = await SELECT.one.from(Claims)
        .columns('status')
        .where({ ID: req.data.ID });

    if (claim && claim.status !== 'Submitted') {
        return req.error(
            400,
            `Only Submitted claims can be edited. Current status: ${claim.status}`
        );
    }
});
this.before('DELETE', 'Claims', async (req) => {

    const ID = req.data.ID;

    const claim = await SELECT.one.from(Claims)
        .columns('status')
        .where({ ID });

    if (!claim) {
        return req.error(404, 'Claim not found');
    }

    if (claim.status !== 'Submitted') {
        return req.error(
            400,
            `Only Submitted claims can be deleted. Current status: ${claim.status}`
        );
    }

    const hasDependents =
        (await SELECT.one.from(Investigations).where({ claim_ID: ID })) ||
        (await SELECT.one.from(Approvals).where({ claim_ID: ID })) ||
        (await SELECT.one.from(Payouts).where({ claim_ID: ID }));

    if (hasDependents) {
        return req.error(
            400,
            'This claim has investigations, approvals or payouts and cannot be deleted.'
        );
    }

    // Clean up child records that would block the delete
    await DELETE.from(FraudRiskScores).where({ claim_ID: ID });
    await DELETE.from(AlertLog).where({ claim_ID: ID });
    // ClaimDocuments are a composition, so they are deleted automatically
});

    this.before('CREATE', 'ClaimDocuments', async (req) => {

        const { claim_ID, fileName, mediaType } = req.data;

        if (!claim_ID) {
            return req.error(400, 'Claim is required');
        }

        if (!fileName) {
            return req.error(400, 'File name is required');
        }

        if (!mediaType) {
            return req.error(400, 'Media type is required');
        }

        const allowedTypes = [
            'application/pdf',
            'image/jpeg',
            'image/png'
        ];

        if (!allowedTypes.includes(mediaType)) {
            return req.error(
                400,
                'Only PDF, JPEG and PNG documents are allowed'
            );
        }
    });

    this.on('renewPolicy', async (req) => {

        const { policyID } = req.data;

        const policy = await SELECT.one.from(Policies)
            .where({ ID: policyID });

        if (!policy) {
            return req.error(404, 'Policy not found');
        }

        if (policy.status === 'Cancelled') {
            return req.error(400, 'Cancelled policy cannot be renewed');
        }

        await UPDATE(Policies)
            .set({
                status: 'Active'
            })
            .where({ ID: policyID });

        return await SELECT.one.from(Policies)
            .where({ ID: policyID });
    });

    this.on('cancelPolicy', async (req) => {

        const { policyID } = req.data;

        const policy = await SELECT.one.from(Policies)
            .where({ ID: policyID });

        if (!policy) {
            return req.error(404, 'Policy not found');
        }

        if (policy.status === 'Cancelled') {
            return req.error(400, 'Policy is already cancelled');
        }

        await UPDATE(Policies)
            .set({
                status: 'Cancelled'
            })
            .where({ ID: policyID });

        return await SELECT.one.from(Policies)
            .where({ ID: policyID });
    });

    this.on('getPolicyStatus', async (req) => {

        const { policyID } = req.data;

        const policy = await SELECT.one.from(Policies)
            .columns('status')
            .where({ ID: policyID });

        if (!policy) {
            return req.error(404, 'Policy not found');
        }

        return policy.status;
    });

    this.on('getPolicyClaimsCount', async (req) => {

        const { policyID } = req.data;

        const policy = await SELECT.one.from(Policies)
            .where({ ID: policyID });

        if (!policy) {
            return req.error(404, 'Policy not found');
        }

        const result = await SELECT.one
            .from(Claims)
            .columns`count(*) as count`
            .where({ policy_ID: policyID });

        return Number(result.count);
    });

    //BPA STARTS

    this.on("submitClaim", async (req) => {

        const { claimID } = req.data;

        if (!claimID) {
            return req.reject(400, "Claim ID is required");
        }

        const claim = await SELECT.one
            .from(Claims)
            .where({
                ID: claimID
            });

        if (!claim) {
            return req.reject(404, "Claim not found");
        }

        const riskScore = await SELECT.one
            .from(FraudRiskScores)
            .where({
                claim_ID: claimID
            });

        const score = riskScore
            ? Number(riskScore.riskScore)
            : 0;

        const riskLevel = riskScore
            ? riskScore.riskLevel
            : "Low";

        const claimedAmount = Number(claim.claimedAmount);

        console.log("========== SUBMIT CLAIM ==========");
        console.log("Claim ID:", claimID);
        console.log("Claim Amount:", claimedAmount);
        console.log("Risk Score:", score);
        console.log("Risk Level:", riskLevel);

        if (claim.status !== "Submitted") {
            return req.reject(
                400,
                `Only Submitted claims can start the review process. Current status: ${claim.status}`
            );
        }

        const investigationRequired =
            claimedAmount > 100000 ||
            riskLevel === "High" ||
            riskLevel === "Critical" ||
            score > 75;


        const initialStatus = investigationRequired
            ? "UnderReview"
            : "PendingApproval";

        await UPDATE(Claims)
            .set({
                status: initialStatus
            })
            .where({
                ID: claimID
            });

        console.log("Initial claim status:", initialStatus);

        try {

            const response = await executeHttpRequest(
                {
                    destinationName: "ClaimProcess"
                },
                {
                    method: "POST",

                    url: "/workflow/rest/v1/workflow-instances",

                    data: {
                        "definitionId": "us10.f3b9ba19trial.claimsureclaimmanagementv2.claimApprovalProcess",


                        context: {
                            claimid: claim.ID,
                            claimnumber: claim.claimNumber,
                            claimedamount: claimedAmount,
                            description: claim.description || "",
                            riskScore: score,
                            riskLevel: riskLevel
                        }
                    }
                },
                {
                    fetchCsrfToken: false
                }
            );

            console.log(
                "BPA workflow started:",
                response.status
            );

            const updatedClaim = await SELECT.one
                .from(Claims)
                .where({
                    ID: claimID
                });

            return updatedClaim;

        } catch (error) {

            console.error(
                "SBPA ERROR MESSAGE:",
                error.message
            );

            console.error(
                "SBPA ERROR STATUS:",
                error.response?.status
            );

            console.error(
                "SBPA RESPONSE DATA:",
                JSON.stringify(
                    error.response?.data,
                    null,
                    2
                )
            );



            await UPDATE(Claims)
                .set({
                    status: "Submitted"
                })
                .where({
                    ID: claimID
                });

            return req.reject(
                502,
                `Failed to start claim review process: ${error.message}`
            );
        }
    });



    this.on('moveToPendingApproval', async (req) => {

        const { claimID } = req.data;

        const claim = await SELECT.one
            .from(Claims)
            .where({ ID: claimID });

        if (!claim) {
            return req.error(404, 'Claim not found');
        }

        if (claim.status !== 'UnderReview') {
            return req.error(
                400,
                `Claim cannot move to PendingApproval. Current status: ${claim.status}`
            );
        }

        await UPDATE(Claims)
            .set({
                status: 'PendingApproval'
            })
            .where({ ID: claimID });

        return await SELECT.one
            .from(Claims)
            .where({ ID: claimID });
    });
    
    this.on('approveClaim', async (req) => {

        const { claimID } = req.data;

        const claim = await SELECT.one
            .from(Claims)
            .where({
                ID: claimID
            });

        if (!claim) {
            return req.error(
                404,
                'Claim not found'
            );
        }

        // ------------------------------------------------------------
        // Only PendingApproval can be approved
        // ------------------------------------------------------------

        if (claim.status !== 'PendingApproval') {
            return req.error(
                400,
                `Claim cannot be approved. Current status: ${claim.status}`
            );
        }

        await UPDATE(Claims)
            .set({
                status: 'Approved'
            })
            .where({
                ID: claimID
            });

        return await SELECT.one
            .from(Claims)
            .where({
                ID: claimID
            });
    });


    this.on('processPendingClaims', async (req) => {

        console.log(
            " PROCESS PENDING CLAIMS "
        );



        const pendingClaims = await SELECT
            .from(Claims)
            .where({
                status: 'PendingApproval'
            });


        console.log(
            "Pending claims found:",
            pendingClaims.length
        );


        if (pendingClaims.length === 0) {

            console.log(
                "No pending approval claims found."
            );

            return {

                message:
                    "No pending approval claims found.",

                pendingApprovalsCount: 0,

                pendingApprovals: [],

                escalatedCount: 0
            };
        }



        const workbook =
            new ExcelJS.Workbook();


        const worksheet =
            workbook.addWorksheet(
                "Pending Claims"
            );



        worksheet.addRow([

            "Claim Number",

            "Claim ID",

            "Claimed Amount",

            "Status",

            "Incident Date"

        ]);



        for (const claim of pendingClaims) {

            worksheet.addRow([

                claim.claimNumber || "",

                claim.ID || "",

                Number(
                    claim.claimedAmount || 0
                ),

                claim.status || "",

                claim.incidentDate || ""

            ]);

        }

        worksheet.getRow(1).font = {

            bold: true

        };


        worksheet.getColumn(1).width = 20;

        worksheet.getColumn(2).width = 40;

        worksheet.getColumn(3).width = 20;

        worksheet.getColumn(4).width = 25;

        worksheet.getColumn(5).width = 20;


        const exportDirectory = path.join(

            process.cwd(),

            "exports"

        );


        if (!fs.existsSync(exportDirectory)) {

            fs.mkdirSync(

                exportDirectory,

                {
                    recursive: true
                }

            );

        }


        const filePath = path.join(

            exportDirectory,

            "Pending_Claims.xlsx"

        );


        await workbook.xlsx.writeFile(

            filePath

        );


        console.log(

            "Excel generated successfully:",

            filePath

        );

        let claimsRows = "";


        for (const claim of pendingClaims) {

            claimsRows += `

            <tr>

                <td>${claim.claimNumber || ""}</td>

                <td>${claim.claimedAmount || ""}</td>

                <td>${claim.status || ""}</td>

                <td>${claim.incidentDate || ""}</td>

            </tr>

        `;

        }


        const htmlContent = `

        <!DOCTYPE html>

        <html>

        <head>

            <style>

                body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                }

                table {
                    border-collapse: collapse;
                    width: 100%;
                }

                th {
                    background-color: #eeeeee;
                }

                th,
                td {
                    border: 1px solid #cccccc;
                    padding: 10px;
                    text-align: left;
                }

            </style>

        </head>


        <body>

            <h2>
                Pending Claims Approval Report
            </h2>


            <p>

                Hello,

            </p>


            <p>

                There are currently

                <strong>
                    ${pendingClaims.length}
                </strong>

                claims waiting for approval.

            </p>


            <h3>
                Pending Claims Summary
            </h3>


            <table>

                <thead>

                    <tr>

                        <th>
                            Claim Number
                        </th>

                        <th>
                            Claimed Amount
                        </th>

                        <th>
                            Status
                        </th>

                        <th>
                            Incident Date
                        </th>

                    </tr>

                </thead>


                <tbody>

                    ${claimsRows}

                </tbody>

            </table>


            <br>


            <p>

                The complete Pending Claims report
                is attached as an Excel file.

            </p>


            <p>

                Regards,

                <br>

                ClaimSure Insurance System

            </p>


        </body>

        </html>

    `;



        const transporter =
            nodemailer.createTransport({

                host: MAIL_CONFIG.host,

                port: MAIL_CONFIG.port,

                secure: MAIL_CONFIG.secure,

                auth: {

                    user:
                        MAIL_CONFIG.auth.user,

                    pass:
                        MAIL_CONFIG.auth.pass

                }

            });


        try {

            const mailResult = await transporter.sendMail({
                from: MAIL_CONFIG.from,

                to: MAIL_CONFIG.to,

                subject:
                    `Pending Claims Report - ${pendingClaims.length} Claims`,

                html: htmlContent,

                attachments: [
                    {
                        filename: "Pending_Claims.xlsx",
                        path: filePath,
                        contentType:
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    }
                ]
            });


            console.log(
                "Email sent successfully"
            );


            console.log(
                "Message ID:",
                mailResult.messageId
            );


        }
        catch (error) {

            console.error(
                "EMAIL ERROR:",
                error.message
            );

            return req.error(

                500,

                `Excel generated but email sending failed: ${error.message}`

            );

        }


        return {

            message:

                `Pending claims processed successfully. Excel generated and email sent to recipients.`,


            pendingApprovalsCount:

                pendingClaims.length,


            pendingApprovals:

                pendingClaims.map(
                    claim => ({

                        claimID:
                            claim.ID,

                        claimNumber:
                            claim.claimNumber,

                        claimedAmount:
                            claim.claimedAmount,

                        status:
                            claim.status

                    })
                ),


            escalatedCount: 0

        };

    });


    this.on('analyzeClaim', async (req) => {

        const { claimID } = req.data;

        console.log("========== AI CLAIM ANALYSIS ==========");
        console.log("Claim ID:", claimID);

        if (!claimID) {
            return req.error(400, 'Claim ID is required');
        }


        const claim = await SELECT.one
            .from(Claims)
            .where({
                ID: claimID
            });

        if (!claim) {
            return req.error(404, 'Claim not found');
        }

        console.log("Claim:", claim.claimNumber);


        let policy = null;

        if (claim.policy_ID) {

            policy = await SELECT.one
                .from(Policies)
                .where({
                    ID: claim.policy_ID
                });

        }


        const fraudRisk = await SELECT.one
            .from(FraudRiskScores)
            .where({
                claim_ID: claimID
            });


        const fraudScore = fraudRisk
            ? Number(fraudRisk.riskScore)
            : 0;

        const riskLevel = fraudRisk
            ? fraudRisk.riskLevel
            : "Low";


        // ==========================================
        // 4. PREPARE DATA FOR AI
        // ==========================================

        const claimData = {

            claimNumber:
                claim.claimNumber || "N/A",

            claimAmount:
                Number(claim.claimedAmount || 0),

            status:
                claim.status || "N/A",

            incidentDate:
                claim.incidentDate || "N/A",

            description:
                claim.description || "No description provided",

            policyID:
                claim.policy_ID || "N/A",

            policyStatus:
                policy?.status || "Unknown",

            fraudScore:
                fraudScore,

            riskLevel:
                riskLevel

        };


        console.log(
            "Sending claim data to OpenRouter:",
            JSON.stringify(claimData, null, 2)
        );


        // ==========================================
        // 5. CALL OPENROUTER
        // ==========================================

        try {

            const aiResponse =
                await analyzeClaim(claimData);

            //console.log(aiResponse)

            console.log(
                "AI analysis received successfully"
            );


            // ==========================================
            // 6. RETURN AI RESPONSE
            // ==========================================

            return aiResponse;

        }
        catch (error) {

            console.error(
                "OPENROUTER ERROR:",
                error.message
            );

            return req.error(
                502,
                `AI claim analysis failed: ${error.message}`
            );
        }

    });


    this.on('rejectClaim', async (req) => {

        const { claimID } = req.data;

        const claim = await SELECT.one
            .from(Claims)
            .where({
                ID: claimID
            });

        if (!claim) {
            return req.error(
                404,
                'Claim not found'
            );
        }

        // ------------------------------------------------------------
        // Only PendingApproval can be rejected
        // ------------------------------------------------------------

        if (claim.status !== 'PendingApproval') {
            return req.error(
                400,
                `Claim cannot be rejected. Current status: ${claim.status}`
            );
        }

        await UPDATE(Claims)
            .set({
                status: 'Rejected'
            })
            .where({
                ID: claimID
            });

        return await SELECT.one
            .from(Claims)
            .where({
                ID: claimID
            });
    });

    this.on('rejectFraudClaim', async (req) => {

        const { claimID } = req.data;

        console.log("========== rejectFraudClaim ==========");
        console.log("Received claimID:", claimID);

        const claim = await SELECT.one
            .from(Claims)
            .where({ ID: claimID });

        console.log("Claim found:", claim);

        if (!claim) {
            return req.error(404, 'Claim not found');
        }

        if (claim.status !== 'UnderReview') {
            return req.error(
                400,
                `Fraud claim cannot be rejected. Current status: ${claim.status}`
            );
        }

        await UPDATE(Claims)
            .set({ status: 'Rejected' })
            .where({ ID: claimID });

        return await SELECT.one
            .from(Claims)
            .where({ ID: claimID });
    });

    this.on('getClaimStatus', async (req) => {

        const { claimID } = req.data;

        const claim = await SELECT.one.from(Claims)
            .columns('status')
            .where({ ID: claimID });

        if (!claim) {
            return req.error(404, 'Claim not found');
        }

        return claim.status;
    });

    this.on('getClaimAmount', async (req) => {

        const { claimID } = req.data;

        const claim = await SELECT.one.from(Claims)
            .columns('claimedAmount')
            .where({ ID: claimID });

        if (!claim) {
            return req.error(404, 'Claim not found');
        }

        return claim.claimedAmount;
    });

    this.on('getClaimDocumentsCount', async (req) => {

        const { claimID } = req.data;

        const claim = await SELECT.one.from(Claims)
            .where({ ID: claimID });

        if (!claim) {
            return req.error(404, 'Claim not found');
        }

        const result = await SELECT.one
            .from(ClaimDocuments)
            .columns`count(*) as count`
            .where({ claim_ID: claimID });

        return Number(result.count);
    });

    this.on('deleteDocument', async (req) => {

        const { documentID } = req.data;

        const document = await SELECT.one
            .from(ClaimDocuments)
            .where({ ID: documentID });

        if (!document) {
            return req.error(404, 'Document not found');
        }

        await DELETE.from(ClaimDocuments)
            .where({ ID: documentID });

        return true;
    });

    this.on('getDocumentInfo', async (req) => {

        const { documentID } = req.data;

        const document = await SELECT.one
            .from(ClaimDocuments)
            .columns(
                'fileName',
                'documentType',
                'mediaType'
            )
            .where({ ID: documentID });

        if (!document) {
            return req.error(404, 'Document not found');
        }

        return `File: ${document.fileName}, Type: ${document.documentType}, Media Type: ${document.mediaType}`;
    });





}) 