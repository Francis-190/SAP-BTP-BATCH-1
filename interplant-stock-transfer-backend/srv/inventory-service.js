const cds = require('@sap/cds');
const {
    sendLowStockAlert
} = require('./lib/alert-notification');


module.exports=function(){

const {
    StockBalances,
    Materials,
    Reservations,
    StockMovements,
    MovementReasons
} = this.entities;

const TransferEvents =
    cds.model.definitions['interplant.TransferEvents'];


    this.before('*', (req) => {
    console.log('Authenticated User ID:', req.user.id);
    console.log('Authenticated User Email:', req.user.attr.email);
    console.log('Authenticated User Name:', req.user.attr.user_name);
});

    this.on('getAvailableQuantity',async(req)=>{
        const {materialID,plantID,storageLocationID,storageBinID,batchNumber}=req.data;

        if(!materialID || !plantID || !storageBinID || !storageLocationID || !batchNumber)
        {
            return req.error('All Fields are required');
        }

        const stock=await SELECT.one.from(StockBalances).where({
            material_ID:materialID,
            plant_ID:plantID,
            storageLocation_ID:storageLocationID,
            storageBin_ID:storageBinID,
            batchNumber:batchNumber
        })

            if(!stock)
            {
                return req.info("Stock Id does not exist");
            }
            return Number(stock.unrestrictedQty)-Number(stock.reservedQty);

    })



this.on('getLowStock', async (req) => {
    const query = SELECT.from(StockBalances);

    if (!req.user.is('JOBSCHEDULER')) {
        // check this entity name in schema.cds
       const { WarehouseUserAssignments } = cds.entities('interplant');

        const assignments = await SELECT.from(WarehouseUserAssignments)
            .where({ userId: req.user.id, isActive: true });

        if (!assignments.length) {
            return req.reject(403, 'No active plant assigned to this user');
        }

        query.where({ plant_ID: { in: assignments.map(a => a.plant_ID) } });
    }

    const stock = await query;
    const lowStock = [];

    for (const item of stock) {
        const material = await SELECT.one.from(Materials).where({ ID: item.material_ID });

        if (material && Number(item.unrestrictedQty) <= Number(material.reorderLevel)) {
            lowStock.push(item);
        }
    }
    return lowStock;
});


  









this.before(['UPDATE', 'DELETE'], 'StockMovements', req => {
    req.reject(403, 'Posted stock movements cannot be modified or deleted. Use reverseMovement instead.');
});








this.on('releaseReservation', async (req) => {

    const {
        reservationID,
        quantity,
        performedBy,
        idempotencyKey
    } = req.data;

    const tx = cds.tx(req);

    // 1. Validate input parameters

    if (!reservationID || quantity === undefined ||
        quantity === null || !performedBy ||
        !performedBy.trim() || !idempotencyKey) {
        return req.reject(400,
            'All fields including idempotencyKey are required');
    }

    const releaseQty = Number(quantity);

    if (!Number.isFinite(releaseQty) || releaseQty <= 0) {
        return req.reject(400,
            'Release quantity must be greater than zero');
    }

    // 2. Find and lock reservation

    const reservation = await tx.run(
        SELECT.one.from(Reservations).where({
            ID: reservationID
        }).forUpdate()
    );

    if (!reservation) {
        return req.reject(404, 'Reservation does not exist');
    }

    // 3. Find corresponding transfer item

    const TransferItems =
        cds.model.definitions['TransferService.TransferItems'];

    if (!TransferItems) {
        return req.reject(500,
            'TransferItems entity definition not found');
    }

    const transferItem = await tx.run(
        SELECT.one.from(TransferItems).where({
            ID: reservation.transferItem_ID
        })
    );

    if (!transferItem) {
        return req.reject(404,
            'Corresponding transfer item does not exist');
    }

    if (!transferItem.transfer_ID) {
        return req.reject(400,
            'Transfer item is not linked to a transfer request');
    }

    // 4. Check idempotency key

    const existingEvent = await tx.run(
        SELECT.one.from(TransferEvents).where({
            idempotencyKey: idempotencyKey
        })
    );

    if (existingEvent) {

        if (
            existingEvent.eventType !== 'RESERVATION_RELEASED' ||
            existingEvent.transfer_ID !== transferItem.transfer_ID ||
            existingEvent.itemID !== reservation.transferItem_ID ||
            Number(existingEvent.quantity) !== releaseQty ||
            existingEvent.notes !==
                'Reservation ID: ' + reservationID +
                ', Released quantity: ' + releaseQty
        ) {
            return req.reject(
                409,
                'Idempotency key has already been used for another request'
            );
        }

        return reservation;
    }

    // 5. Validate reservation status

    if (reservation.status !== 'ACTIVE' &&
        reservation.status !== 'PARTIALLY_RELEASED') {
        return req.reject(400,
            'Reservation cannot be released in its current status');
    }

    // 6. Calculate releasable quantity

    const reservedQty = Number(reservation.reservedQty);
    const releasedQty = Number(reservation.releasedQty);
    const consumedQty = Number(reservation.consumedQty);

    const releasableQty =
        reservedQty - releasedQty - consumedQty;

    if (releaseQty > releasableQty) {
        return req.reject(400,
            'Release quantity exceeds releasable quantity');
    }

    // 7. Find and lock corresponding stock balance

    const stock = await tx.run(
        SELECT.one.from(StockBalances).where({
            material_ID: reservation.material_ID,
            plant_ID: reservation.plant_ID,
            storageLocation_ID: reservation.storageLocation_ID,
            storageBin_ID: reservation.storageBin_ID,
            batchNumber: reservation.batchNumber
        }).forUpdate()
    );

    if (!stock) {
        return req.reject(404,
            'Corresponding stock balance does not exist');
    }

    // 8. Validate available reserved stock

    const stockReservedQty = Number(stock.reservedQty);

    if (stockReservedQty < releaseQty) {
        return req.reject(400,
            'Insufficient reserved stock balance');
    }

    // 9. Calculate updated reservation values

    const newReleasedQty = releasedQty + releaseQty;

    let newStatus = 'PARTIALLY_RELEASED';

    if (newReleasedQty + consumedQty >= reservedQty) {
        newStatus = 'RELEASED';
    }

    // 10. Update reservation

    await tx.run(
        UPDATE(Reservations)
            .set({
                releasedQty: newReleasedQty,
                status: newStatus
            })
            .where({
                ID: reservationID
            })
    );

    // 11. Update stock reserved quantity

    await tx.run(
        UPDATE(StockBalances)
            .set({
                reservedQty: stockReservedQty - releaseQty
            })
            .where({
                ID: stock.ID
            })
    );

    // 12. Create idempotency audit event

    await tx.run(
        INSERT.into(TransferEvents).entries({
            transfer_ID: transferItem.transfer_ID,
            idempotencyKey: idempotencyKey,
            itemID: reservation.transferItem_ID,
            quantity: releaseQty,
            eventType: 'RESERVATION_RELEASED',
            performedBy: performedBy,
            notes:
                'Reservation ID: ' + reservationID +
                ', Released quantity: ' + releaseQty
        })
    );

    // 13. Return updated reservation

    const updatedReservation = await tx.run(
        SELECT.one.from(Reservations).where({
            ID: reservationID
        })
    );

    return updatedReservation;

});



this.on('reverseMovement', async (req) => {

    const {
        movementID,
        performedBy,
        reason,
        idempotencyKey
    } = req.data;

    const {
        StockMovements,
        StockBalances,
        Reservations,
        MovementReasons,
        TransferEvents
    } = cds.entities('interplant');

    const tx = cds.tx(req);

    // 1. Validate input

    if (!movementID || !performedBy || !performedBy.trim() ||
        !reason || !reason.trim() || !idempotencyKey) {
        return req.reject(
            400,
            'Movement ID, performedBy, reason and idempotencyKey are required'
        );
    }

    // 2. Find and lock original movement

    const originalMovement = await tx.run(
        SELECT.one.from(StockMovements)
            .where({ ID: movementID })
            .forUpdate()
    );

    if (!originalMovement) {
        return req.reject(404, 'Stock movement not found');
    }

    // 3. Validate movement type

    const validTypes = [
        'RECEIPT',
        'ISSUE',
        'TRANSFER_DISPATCH',
        'TRANSFER_RECEIPT',
        'ADJUSTMENT_IN',
        'ADJUSTMENT_OUT'
    ];

    if (!validTypes.includes(originalMovement.movementType)) {
        return req.reject(400, 'This movement type cannot be reversed');
    }

    // 4. Validate stock category

    const categoryFields = {
        UNRESTRICTED: 'unrestrictedQty',
        RESERVED: 'reservedQty',
        QUALITY: 'qualityQty',
        BLOCKED: 'blockedQty'
    };

    const stockField = categoryFields[originalMovement.stockCategory];

    if (!stockField) {
        return req.reject(400, 'Invalid stock category');
    }

    const reversalQty = Number(originalMovement.quantity);

    if (!Number.isFinite(reversalQty) || reversalQty <= 0) {
        return req.reject(400, 'Invalid movement quantity');
    }

    // 5. Validate reversal reason

    const movementReason = await tx.run(
        SELECT.one.from(MovementReasons)
            .where({
                reasonCode: reason
            })
    );

    if (!movementReason) {
        return req.reject(400, 'Invalid movement reversal reason');
    }

    // 6. Check idempotency key

    const existingEvent = await tx.run(
        SELECT.one.from(TransferEvents)
            .where({
                idempotencyKey: idempotencyKey
            })
    );

    if (existingEvent) {

        if (
            existingEvent.eventType !== 'MOVEMENT_REVERSED' ||
            existingEvent.itemID !== originalMovement.ID ||
            Number(existingEvent.quantity) !== reversalQty ||
            existingEvent.reason_ID !== movementReason.ID ||
            existingEvent.notes !==
                'Original movement ID: ' + movementID +
                ', Reversal reason: ' + reason
        ) {
            return req.reject(
                409,
                'Idempotency key has already been used for another request'
            );
        }

        const existingReversal = await tx.run(
            SELECT.one.from(StockMovements)
                .where({
                    reversalOf_ID: originalMovement.ID
                })
        );

        if (!existingReversal) {
            return req.reject(
                500,
                'Reversal event exists but reversal movement was not found'
            );
        }

        return existingReversal;
    }

    // 7. Check whether movement is already reversed

    const existingReversal = await tx.run(
        SELECT.one.from(StockMovements)
            .where({
                reversalOf_ID: movementID
            })
    );

    if (existingReversal) {
        return req.reject(400, 'Movement has already been reversed');
    }

    // 8. Lock matching reservation before stock balance
    // Applies only to transfer dispatch movements

    let reservation = null;
    let updatedConsumedQty = 0;
    let updatedReservationStatus = '';

    if (originalMovement.movementType === 'TRANSFER_DISPATCH') {

        const matchingReservations = await tx.run(
            SELECT.from(Reservations)
                .where({
                    requirementReference: originalMovement.referenceNumber,
                    material_ID: originalMovement.material_ID,
                    plant_ID: originalMovement.plant_ID,
                    storageLocation_ID: originalMovement.storageLocation_ID,
                    storageBin_ID: originalMovement.storageBin_ID,
                    batchNumber: originalMovement.batchNumber
                })
                .orderBy('ID')
                .forUpdate()
        );

        if (!matchingReservations ||
            matchingReservations.length !== 1) {
            return req.reject(
                400,
                'Matching reservation not found or multiple reservations exist'
            );
        }

        reservation = matchingReservations[0];

        const consumedQty = Number(reservation.consumedQty);
        const releasedQty = Number(reservation.releasedQty);
        const reservedQty = Number(reservation.reservedQty);

        if (consumedQty < reversalQty) {
            return req.reject(
                400,
                'Reversal quantity exceeds consumed reservation quantity'
            );
        }

        updatedConsumedQty = consumedQty - reversalQty;

        if (updatedConsumedQty >= reservedQty) {

            updatedReservationStatus = 'CONSUMED';

        } else if (updatedConsumedQty + releasedQty >= reservedQty) {

            updatedReservationStatus = 'RELEASED';

        } else if (releasedQty > 0) {

            updatedReservationStatus = 'PARTIALLY_RELEASED';

        } else {

            updatedReservationStatus = 'ACTIVE';

        }
    }

    // 9. Find and lock source stock balance

    const stock = await tx.run(
        SELECT.one.from(StockBalances)
            .where({
                material_ID: originalMovement.material_ID,
                plant_ID: originalMovement.plant_ID,
                storageLocation_ID: originalMovement.storageLocation_ID,
                storageBin_ID: originalMovement.storageBin_ID,
                batchNumber: originalMovement.batchNumber
            })
            .forUpdate()
    );

    if (!stock) {
        return req.reject(400, 'Stock balance not found');
    }

    // 10. Determine stock reversal operation

    const incomingTypes = [
        'RECEIPT',
        'TRANSFER_RECEIPT',
        'ADJUSTMENT_IN'
    ];

    const outgoingTypes = [
        'ISSUE',
        'TRANSFER_DISPATCH',
        'ADJUSTMENT_OUT'
    ];

    const currentQty = Number(stock[stockField]);

    let updatedQty;

    if (incomingTypes.includes(originalMovement.movementType)) {

        if (currentQty < reversalQty) {
            return req.reject(
                400,
                'Insufficient stock to reverse this movement'
            );
        }

        updatedQty = currentQty - reversalQty;

    } else if (outgoingTypes.includes(originalMovement.movementType)) {

        updatedQty = currentQty + reversalQty;

    } else {

        return req.reject(400, 'Unsupported reversal operation');

    }

    // 11. Update stock balance

    const stockUpdate = {};

    stockUpdate[stockField] = updatedQty;

    if (originalMovement.movementType === 'TRANSFER_DISPATCH') {
        stockUpdate.reservedQty = {
            '+=': reversalQty
        };
    }

    await tx.run(
        UPDATE(StockBalances)
            .set(stockUpdate)
            .where({
                ID: stock.ID
            })
    );

    // 12. Update reservation quantities

    if (originalMovement.movementType === 'TRANSFER_DISPATCH') {

        await tx.run(
            UPDATE(Reservations)
                .set({
                    consumedQty: updatedConsumedQty,
                    status: updatedReservationStatus
                })
                .where({
                    ID: reservation.ID
                })
        );
    }

    // 13. Create reversal stock movement

    await tx.run(
        INSERT.into(StockMovements).entries({
            material_ID: originalMovement.material_ID,
            plant_ID: originalMovement.plant_ID,
            storageLocation_ID: originalMovement.storageLocation_ID,
            storageBin_ID: originalMovement.storageBin_ID,
            batchNumber: originalMovement.batchNumber,
            movementType: 'REVERSAL',
            stockCategory: originalMovement.stockCategory,
            quantity: reversalQty,
            movementReason_ID: movementReason.ID,
            referenceNumber: originalMovement.referenceNumber,
            reversalOf_ID: originalMovement.ID
        })
    );

    // 14. Create idempotency audit event

    await tx.run(
        INSERT.into(TransferEvents).entries({
            idempotencyKey: idempotencyKey,
            itemID: originalMovement.ID,
            quantity: reversalQty,
            eventType: 'MOVEMENT_REVERSED',
            performedBy: performedBy,
            reason_ID: movementReason.ID,
            notes:
                'Original movement ID: ' + movementID +
                ', Reversal reason: ' + reason
        })
    );

    // 15. Return created reversal movement

    const reversalMovement = await tx.run(
        SELECT.one.from(StockMovements)
            .where({
                reversalOf_ID: originalMovement.ID
            })
    );

    return reversalMovement;
})





this.on('adjustStock', async (req) => {

    console.log('ADJUSTSTOCK HANDLER - UPDATED VERSION');

    const {
        stockBalanceID,
        stockCategory,
        adjustmentType,
        quantity,
        movementReasonID,
        performedBy,
        referenceNumber,
        idempotencyKey
    } = req.data;

    const tx = cds.tx(req);

    if (
        !stockBalanceID ||
        !stockCategory ||
        !adjustmentType ||
        quantity === undefined ||
        quantity === null ||
        !movementReasonID ||
        !performedBy ||
        !performedBy.trim() ||
        !idempotencyKey
    ) {
        return req.reject(400, 'All required fields must be provided');
    }

    const adjustmentQty = Number(quantity);

    if (!Number.isFinite(adjustmentQty) || adjustmentQty <= 0) {
        return req.reject(400, 'Adjustment quantity must be greater than zero');
    }

    const categoryFields = {
        UNRESTRICTED: 'unrestrictedQty',
        QUALITY: 'qualityQty',
        BLOCKED: 'blockedQty'
    };

    const stockField = categoryFields[stockCategory];

    if (!stockField) {
        return req.reject(
            400,
            'Only UNRESTRICTED, QUALITY and BLOCKED stock can be adjusted'
        );
    }

    if (
        adjustmentType !== 'INCREASE' &&
        adjustmentType !== 'DECREASE'
    ) {
        return req.reject(400, 'Adjustment type must be INCREASE or DECREASE');
    }

    const expectedNotes =
        'Stock Balance ID: ' + stockBalanceID +
        ', Category: ' + stockCategory +
        ', Adjustment Type: ' + adjustmentType +
        ', Reason ID: ' + movementReasonID +
        ', Reference Number: ' + (referenceNumber || '');

    const existingEvent = await tx.run(
        SELECT.one.from(TransferEvents)
            .where({ idempotencyKey: idempotencyKey })
    );

    if (existingEvent) {

        const movementIDPrefix = expectedNotes + ', Movement ID: ';

        if (
            existingEvent.eventType !== 'STOCK_ADJUSTED' ||
            existingEvent.itemID !== stockBalanceID ||
            Number(existingEvent.quantity) !== adjustmentQty ||
            existingEvent.reason_ID !== movementReasonID ||
            existingEvent.performedBy !== performedBy ||
            (
                existingEvent.notes !== expectedNotes &&
                existingEvent.notes.indexOf(movementIDPrefix) !== 0
            )
        ) {
            return req.reject(
                409,
                'Idempotency key already used with different adjustment data'
            );
        }

        const existingMovementID =
            existingEvent.notes.indexOf(movementIDPrefix) === 0
                ? existingEvent.notes.substring(movementIDPrefix.length)
                : null;

        if (existingMovementID) {
            const existingMovement = await tx.run(
                SELECT.one.from(StockMovements)
                    .where({ ID: existingMovementID })
            );

            if (!existingMovement) {
                return req.reject(500, 'Original adjustment movement not found');
            }

            return existingMovement;
        }

        // Compatibility with the adjustment event created before this fix.
        const existingStock = await tx.run(
            SELECT.one.from(StockBalances)
                .where({ ID: stockBalanceID })
        );

        if (!existingStock) {
            return req.reject(404, 'Stock balance not found');
        }

        const existingMovement = await tx.run(
            SELECT.one.from(StockMovements)
                .where({
                    material_ID: existingStock.material_ID,
                    plant_ID: existingStock.plant_ID,
                    storageLocation_ID: existingStock.storageLocation_ID,
                    storageBin_ID: existingStock.storageBin_ID,
                    batchNumber: existingStock.batchNumber,
                    movementType: adjustmentType === 'INCREASE'
                        ? 'ADJUSTMENT_IN'
                        : 'ADJUSTMENT_OUT',
                    stockCategory: stockCategory,
                    quantity: adjustmentQty,
                    movementReason_ID: movementReasonID,
                    referenceNumber: referenceNumber
                })
                .orderBy('createdAt desc')
        );

        if (!existingMovement) {
            return req.reject(500, 'Original adjustment movement not found');
        }

        return existingMovement;
    }

    const stock = await tx.run(
        SELECT.one.from(StockBalances)
            .where({ ID: stockBalanceID })
            .forUpdate()
    );

    if (!stock) {
        return req.reject(404, 'Stock balance not found');
    }

    const movementReason = await tx.run(
        SELECT.one.from(MovementReasons)
            .where({ ID: movementReasonID })
    );

    if (!movementReason) {
        return req.reject(400, 'Invalid movement reason');
    }

    const currentQty = Number(stock[stockField]);

    let updatedQty;

    if (adjustmentType === 'INCREASE') {
        updatedQty = currentQty + adjustmentQty;
    } else {
        if (currentQty < adjustmentQty) {
            return req.reject(400, 'Adjustment quantity exceeds current stock');
        }

        updatedQty = currentQty - adjustmentQty;
    }

    const stockUpdate = {};
    stockUpdate[stockField] = updatedQty;

    await tx.run(
        UPDATE(StockBalances)
            .set(stockUpdate)
            .where({ ID: stockBalanceID })
    );

    const movementType = adjustmentType === 'INCREASE'
        ? 'ADJUSTMENT_IN'
        : 'ADJUSTMENT_OUT';

    // Generate the ID before inserting so we can return the exact movement.
    const movementID = require('crypto').randomUUID();

    const movement = {
        ID: movementID,
        material_ID: stock.material_ID,
        plant_ID: stock.plant_ID,
        storageLocation_ID: stock.storageLocation_ID,
        storageBin_ID: stock.storageBin_ID,
        batchNumber: stock.batchNumber,
        movementType: movementType,
        stockCategory: stockCategory,
        quantity: adjustmentQty,
        movementReason_ID: movementReasonID,
        referenceNumber: referenceNumber || null
    };

    await tx.run(
        INSERT.into(StockMovements).entries(movement)
    );

    const eventNotes =
        expectedNotes + ', Movement ID: ' + movementID;

    await tx.run(
        INSERT.into(TransferEvents).entries({
            idempotencyKey: idempotencyKey,
            itemID: stockBalanceID,
            quantity: adjustmentQty,
            eventType: 'STOCK_ADJUSTED',
            performedBy: performedBy,
            reason_ID: movementReasonID,
            notes: eventNotes
        })
    );
   // throw new Error("TEST_ADJUST_ROLLBACK");
    const createdMovement = await tx.run(
        SELECT.one.from(StockMovements)
            .where({ ID: movementID })
    );

    if (!createdMovement) {
        return req.reject(500, 'Adjustment movement could not be retrieved');
    }

    console.log('ADJUSTSTOCK RETURN:', createdMovement);
    console.log('ADJUSTSTOCK EVENT NOTES:', eventNotes);

    return createdMovement;

});

this.on('notifyLowStock', async () => {
    const lowStock = await this.send('getLowStock');
    const byPlant = {};

    for (const item of lowStock) {
        const material = await SELECT.one.from(Materials).where({ ID: item.material_ID });

        if (material) {
            (byPlant[item.plant_ID] ||= []).push({ material, stockBalance: item });
        }
    }

    for (const [plantID, details] of Object.entries(byPlant)) {
        await sendLowStockAlert(details, plantID);
    }

    return lowStock.length;
});









}