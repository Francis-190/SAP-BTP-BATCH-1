const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {

    const {
        Payouts,
        SLARules,
        AlertLog
    } = this.entities;

    const db = await cds.connect.to('db');

    const {
        Claims,
        Employees
    } = db.entities;


    // Generates the next payout number: PAY001, PAY002, ... PAY010
async function getNextPayoutNumber(tx) {

    const rows = await tx.run(
        SELECT.from(Payouts).columns('payoutNumber')
    );

    let maxNumber = 0;

    rows.forEach(function (row) {
        // matches PAY001, PAY010, PAY1000 and ignores old PAY-<timestamp> values
        const match = /^PAY(\d+)$/.exec(row.payoutNumber || '');

        if (match) {
            const n = parseInt(match[1], 10);
            if (n > maxNumber) {
                maxNumber = n;
            }
        }
    });

    return 'PAY' + String(maxNumber + 1).padStart(3, '0');
}


    // CREATE + PROCESS PAYOUT
    this.on('createPayout', async (req) => {

        const { claimID, amount } = req.data;

        if (!claimID) {
            return req.error(400, 'claimID is required');
        }

        if (
            amount === undefined ||
            amount === null ||
            Number(amount) <= 0
        ) {
            return req.error(
                400,
                'Payout amount must be greater than zero'
            );
        }

        const claim = await SELECT.one
            .from(Claims)
            .where({
                ID: claimID
            });

        if (!claim) {
            return req.error(
                404,
                `Claim ${claimID} not found`
            );
        }

        let payout = await SELECT.one
            .from(Payouts)
            .where({
                claim_ID: claimID
            });

        if (payout) {

            console.log(
                `Existing payout found: ${payout.ID}, status: ${payout.status}`
            );

            if (payout.status === 'Processed') {
                return payout;
            }

            if (payout.status === 'Pending') {
                return payout;
            }

            if (payout.status === 'Processing') {

                await UPDATE(Payouts)
                    .set({
                        status: 'Processed'
                    })
                    .where({
                        ID: payout.ID
                    });

                await UPDATE(Claims)
                    .set({
                        status: 'Paid'
                    })
                    .where({
                        ID: claimID
                    });

                await INSERT.into(AlertLog).entries({

                    ID: cds.utils.uuid(),

                    claim_ID: claimID,

                    alertType: 'PayoutSuccess',

                    message:
                        `Payout ${payout.payoutNumber} processed successfully`,

                    status: 'Created'
                });

                return await SELECT.one
                    .from(Payouts)
                    .where({
                        ID: payout.ID
                    });
            }

            if (payout.status === 'Failed') {
                return payout;
            }
        }

        if (claim.status !== 'Approved') {

            return req.error(
                400,
                `Payout can be created only for an approved claim. Current status: ${claim.status}`
            );
        }

       const payoutID = cds.utils.uuid();

        const payoutNumber = await getNextPayoutNumber(cds.tx(req));

        await INSERT.into(Payouts).entries({

            ID: payoutID,

            payoutNumber: payoutNumber,   // was: `PAY-${Date.now()}`

            claim_ID: claimID,

            amount: Number(amount),

            status: 'Pending'
        });

        payout = await SELECT.one
            .from(Payouts)
            .where({
                ID: payoutID
            });

        console.log(
            `New payout created: ${payout.ID}, status: ${payout.status}`
        );

        return payout;
    });



    // payout approval in BPA.
    this.on('processPayout', async (req) => {

        const { payoutID } = req.data;

        if (!payoutID) {
            return req.error(400, 'payoutID is required');
        }

        const payout = await SELECT.one
            .from(Payouts)
            .where({ ID: payoutID });

        if (!payout) {
            return req.error(404, `Payout ${payoutID} not found`);
        }

        if (payout.status === 'Processed') {
            return payout;
        }

        if (
            payout.status !== 'Pending' &&
            payout.status !== 'Failed' &&
            payout.status !== 'Processing'
        ) {
            return req.error(
                400,
                `Payout cannot be processed. Current status: ${payout.status}`
            );
        }

        const claim = await SELECT.one
            .from(Claims)
            .where({ ID: payout.claim_ID });

        if (!claim) {
            return req.error(404, 'Claim associated with payout not found');
        }

        if (claim.status !== 'Approved') {
            return req.error(
                400,
                `Payout can be processed only for an approved claim. Current claim status: ${claim.status}`
            );
        }

        try {

            if (
                payout.status === 'Pending' ||
                payout.status === 'Failed'
            ) {
                await UPDATE(Payouts)
                    .set({ status: 'Processing' })
                    .where({ ID: payoutID });
            }

            const paymentSuccessful = true;

            if (paymentSuccessful) {

                await UPDATE(Payouts)
                    .set({ status: 'Processed' })
                    .where({ ID: payoutID });

                await UPDATE(Claims)
                    .set({ status: 'Paid' })
                    .where({ ID: payout.claim_ID });

                await INSERT.into(AlertLog).entries({
                    ID: cds.utils.uuid(),
                    claim_ID: payout.claim_ID,
                    alertType: 'PayoutSuccess',
                    message: `Payout ${payout.payoutNumber} processed successfully`,
                    status: 'Created'
                });

                return await SELECT.one
                    .from(Payouts)
                    .where({ ID: payoutID });
            }

            await UPDATE(Payouts)
                .set({ status: 'Failed' })
                .where({ ID: payoutID });

            await INSERT.into(AlertLog).entries({
                ID: cds.utils.uuid(),
                claim_ID: payout.claim_ID,
                alertType: 'PayoutFailed',
                message: `Payout ${payout.payoutNumber} failed`,
                status: 'Created'
            });

            return await SELECT.one
                .from(Payouts)
                .where({ ID: payoutID });

        } catch (error) {

            console.error('Payout processing error:', error);

            await UPDATE(Payouts)
                .set({ status: 'Failed' })
                .where({ ID: payoutID });

            await INSERT.into(AlertLog).entries({
                ID: cds.utils.uuid(),
                claim_ID: payout.claim_ID,
                alertType: 'PayoutFailed',
                message: `Payout ${payout.payoutNumber} failed: ${error.message}`,
                status: 'Created'
            });

            return req.error(
                500,
                `Payout processing failed: ${error.message}`
            );
        }
    });


    this.on('rejectPayout', async (req) => {

        const { payoutID } = req.data;

        if (!payoutID) {
            return req.error(400, 'payoutID is required');
        }

        const payout = await SELECT.one
            .from(Payouts)
            .where({
                ID: payoutID
            });

        if (!payout) {
            return req.error(
                404,
                `Payout ${payoutID} not found`
            );
        }

        if (payout.status === 'Processed') {
            return req.error(
                400,
                'Processed payout cannot be rejected'
            );
        }

        if (payout.status === 'Processing') {
            return req.error(
                400,
                'Payout currently being processed cannot be rejected'
            );
        }

        if (
            payout.status !== 'Pending' &&
            payout.status !== 'Failed'
        ) {
            return req.error(
                400,
                `Payout cannot be rejected. Current status: ${payout.status}`
            );
        }

        await UPDATE(Payouts)
            .set({
                status: 'Failed'
            })
            .where({
                ID: payoutID
            });

        await UPDATE(Claims)
            .set({
                status: 'Rejected'
            })
            .where({
                ID: payout.claim_ID
            });

        await INSERT.into(AlertLog).entries({
            ID: cds.utils.uuid(),
            claim_ID: payout.claim_ID,
            alertType: 'PayoutFailed',
            message: `Payout ${payout.payoutNumber} was rejected`,
            status: 'Created'
        });

        return await SELECT.one
            .from(Payouts)
            .where({
                ID: payoutID
            });
    });

    // CALCULATE SLA STATUS
    this.on('calculateSLAStatus', async (req) => {

        const { claimID } = req.data;

        if (!claimID) {
            return req.error(
                400,
                'claimID is required'
            );
        }

        const claim = await SELECT.one
            .from(Claims)
            .where({
                ID: claimID
            });

        if (!claim) {
            return req.error(
                404,
                `Claim ${claimID} not found`
            );
        }

        const slaRule = await SELECT.one
            .from(SLARules)
            .where({
                claimType_ID: claim.claimType_ID
            });

        if (!slaRule) {
            return req.error(
                404,
                'No SLA rule configured for this claim type'
            );
        }

        if (!claim.incidentDate) {
            return 'WITHIN_SLA';
        }

        const submittedTime =
            new Date(claim.incidentDate);

        const currentTime =
            new Date();

        const elapsedHours =
            (currentTime - submittedTime) /
            (1000 * 60 * 60);

        const resolutionHours =
            Number(slaRule.resolutionHours);

        if (elapsedHours > resolutionHours) {
            return 'SLA_BREACHED';
        }

        const remainingHours =
            resolutionHours - elapsedHours;

        if (remainingHours <= 6) {
            return 'SLA_NEARING_BREACH';
        }

        return 'WITHIN_SLA';

    });


    // CREATE ALERT
    this.on('createAlert', async (req) => {

        const {
            claimID,
            recipientID,
            alertType,
            message
        } = req.data;


        if (claimID) {

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
        }


        if (recipientID) {

            const employee = await SELECT.one
                .from(Employees)
                .where({
                    ID: recipientID
                });

            if (!employee) {
                return req.error(
                    404,
                    'Employee not found'
                );
            }
        }


        if (!alertType) {
            return req.error(
                400,
                'alertType is required'
            );
        }


        const alertID = cds.utils.uuid();


        await INSERT.into(AlertLog).entries({

            ID: alertID,

            claim_ID: claimID || null,

            recipient_ID: recipientID || null,

            alertType: alertType,

            message: message || null,

            status: 'Created'
        });


        return await SELECT.one
            .from(AlertLog)
            .where({
                ID: alertID
            });

    });


    // MARK ALERT AS READ
    this.on('markAsRead', async (req) => {

        const { alertID } = req.data;

        if (!alertID) {
            return req.error(
                400,
                'alertID is required'
            );
        }


        const alert = await SELECT.one
            .from(AlertLog)
            .where({
                ID: alertID
            });


        if (!alert) {
            return req.error(
                404,
                `Alert ${alertID} not found`
            );
        }


        if (alert.status === 'Read') {
            return req.error(
                400,
                'Alert is already marked as Read'
            );
        }


        await UPDATE(AlertLog)
            .set({
                status: 'Read'
            })
            .where({
                ID: alertID
            });


        return await SELECT.one
            .from(AlertLog)
            .where({
                ID: alertID
            });

    });

});