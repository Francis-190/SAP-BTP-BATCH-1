

const axios = require("axios");

// Read Alert Notification credentials from the service binding.
function getAlertNotificationCredentials() {
    const vcap = JSON.parse(process.env.VCAP_SERVICES || "{}");

    console.log(
    "[ANS DEBUG] VCAP_SERVICES groups:",
    Object.keys(vcap)
    );

    const alertService = Object.values(vcap)
        .flat()
        .find(service =>
            service.name === "soadv-alertnotification" ||
            service.label === "alert-notification"
        );

    if (!alertService || !alertService.credentials) {
        throw new Error(
            "Alert Notification service binding was not found."
        );
    }

    const credentials = alertService.credentials;

    if (!credentials.url ||
        !credentials.client_id ||
        !credentials.client_secret) {
        throw new Error(
            "Alert Notification credentials are incomplete."
        );
    }

    return credentials;
}

// Send one custom event to SAP Alert Notification.
async function sendDelayNotification(event) {
    const credentials = getAlertNotificationCredentials();

    // Step 1: Get OAuth access token
    const basicToken = Buffer.from(
        `${credentials.client_id}:${credentials.client_secret}`
    ).toString("base64");

    const tokenResponse = await axios.post(
        credentials.oauth_url,
        null,
        {
            headers: {
                Authorization: `Basic ${basicToken}`
            },
            timeout: 15000
        }
    );

    const accessToken = tokenResponse.data.access_token;

    if (!accessToken) {
        throw new Error("ANS OAuth access token was not received.");
    }

    // Step 2: Send event to Alert Notification
    const producerUrl =
        credentials.url.replace(/\/$/, "") +
        "/cf/producer/v1/resource-events";

    const response = await axios.post(producerUrl, event, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        timeout: 15000
    });

    return response.status;
  }

//..........................................................................................................

const cds = require('@sap/cds');

const {
    SELECT,
    INSERT,
    UPDATE,
    DELETE
} = cds.ql;

const {
    DealerAccount,
    SalesOrder,
    SalesOrderItem,
    Delivery,
    DeliveryItem,
    DeliveryMilestone,
    TrackingSubscription,
    ExceptionNote
} = cds.entities('sap.sodv');


// ==================================================
// COMMON FUNCTIONS
// ==================================================




function getID(req) {
    return req.params?.[0]?.ID;
}

function getUserID(req) {
    return req.user.id;
}

function getDealerNo(req) {
    return req.user.attr?.dealerNo;
}

function getTransaction(req) {
    return cds.tx(req);
}

function generateOrderNumber() {
    return 'SO-' + Date.now().toString().slice(-10);
}

function generateDeliveryNumber() {
    return 'DL-' + Date.now().toString().slice(-10);
}


// Order status sequence.
// Higher number means later status.

const statusSequence = {
    Submitted: 1,
    Confirmed: 2,
    PartiallyAllocated: 3,
    Dispatched: 4,
    InTransit: 5,
    Delivered: 6
};


// Check whether a status is allowed to move forward.

function isNewerStatus(currentStatus, newStatus) {

    if (!newStatus) {
        return false;
    }

    if (!currentStatus) {
        return true;
    }

    return (
        statusSequence[newStatus] >=
        statusSequence[currentStatus]
    );
}


// Convert milestone type into application order status.

function getStatusFromMilestone(milestoneType) {

    const mapping = {
        Dispatched: 'Dispatched',
        InTransit: 'InTransit',
        OutForDelivery: 'InTransit',
        Delivered: 'Delivered'
    };

    return mapping[milestoneType] || null;
}


// ==================================================
// DEALER VALIDATION
// ==================================================

async function getDealer(tx, req) {

    const dealerNo = getDealerNo(req);

    if (!dealerNo) {
        return req.reject(
            403,
            'Dealer number is missing from your XSUAA user attributes.'
        );
    }

    const dealer = await tx.run(
        SELECT.one.from(DealerAccount).where({
            dealerNo: dealerNo,
            status: 'Active'
        })
    );

    if (!dealer) {
        return req.reject(
            403,
            'No active dealer account is assigned to this user.'
        );
    }

    return dealer;
}


// ==================================================
// ALERT FUNCTION
// ==================================================

// This function identifies subscribed users and logs
// the notification event.
//
// Actual email or in-app delivery requires a notification
// provider and its endpoint/configuration.

async function sendAlert(tx, order, alertType, message) {

    const subscriptions = await tx.run(
        SELECT.from(TrackingSubscription).where({
            dealer_ID: order.dealer_ID,
            isActive: true
        })
    );

    for (const subscription of subscriptions) {

        // Skip a subscription for a different order.
        if (
            subscription.salesOrder_ID &&
            subscription.salesOrder_ID !== order.ID
        ) {
            continue;
        }

        const selectedTypes = (
            subscription.milestoneTypes || ''
        )
            .split(',')
            .map(value => value.trim());

        // Empty milestoneTypes means all alert types.
        if (
            selectedTypes[0] &&
            !selectedTypes.includes(alertType)
        ) {
            continue;
        }

        console.log('--------------------------------');
        console.log('TRACKING ALERT');
        console.log('User:', subscription.userId);
        console.log('Channel:', subscription.channel);
        console.log('Order:', order.orderNo);
        console.log('Type:', alertType);
        console.log('Message:', message);
        console.log('--------------------------------');
    }
}


// ==================================================
// ORDER STATUS RECALCULATION
// ==================================================

async function updateOrderStatusFromItems(tx, orderID) {

    const order = await tx.run(
        SELECT.one.from(SalesOrder).where({
            ID: orderID
        })
    );

    if (!order || order.status === 'Delivered') {
        return;
    }

    const items = await tx.run(
        SELECT.from(SalesOrderItem).where({
            salesOrder_ID: orderID
        })
    );

    if (items.length === 0) {
        return;
    }

    const anyConfirmed = items.some(
        item => Number(item.confirmedQty || 0) > 0
    );

    const allFullyConfirmed = items.every(
        item =>
            Number(item.confirmedQty || 0) >=
            Number(item.quantity)
    );

    let newStatus = null;

    if (allFullyConfirmed) {
        newStatus = 'Confirmed';
    } else if (anyConfirmed) {
        newStatus = 'PartiallyAllocated';
    }

    if (
        newStatus &&
        isNewerStatus(order.status, newStatus)
    ) {
        await tx.run(
            UPDATE(SalesOrder)
                .set({ status: newStatus })
                .where({ ID: orderID })
        );
    }
}


// ==================================================
// 1. DEALER SERVICE
// ==================================================

module.exports = cds.service.impl(async function () {



  
// Send the complete delayed sales order to SAP Alert Notification.
async function sendDelayedOrderToANS(order) {

    const event = {
        eventType: 'SOADV.OrderDelayed',
        severity: 'WARNING',
        category: 'ALERT',

        subject: `Sales Order ${order.orderNo} is delayed`,

        // Include the complete order record in the event body.
        body: JSON.stringify({
            message: 'A sales order has been marked as delayed.',
            salesOrder: order
        }, null, 2),

        resource: {
            resourceName: 'SOADV',
            resourceType: 'SalesOrder',
            resourceInstance: order.ID
        },

        tags: {
            salesOrderID: String(order.ID || ''),
            salesOrderNo: String(order.orderNo || ''),
            dealerID: String(order.dealer_ID || ''),
            dealerNo: String(order.dealerNo || ''),
            customer: String(order.customerName || ''),
            status: String(order.status || ''),
            isDelayed: 'true',
            notificationTarget: 'SalesCoordinator'
        }
    };

    const responseStatus = await sendDelayNotification(event);

    console.log(
        `[ANS] Delay alert sent for ${order.orderNo}. HTTP status: ${responseStatus}`
    );

    return responseStatus;
  }



// ==================================================
// JOB SCHEDULER SERVICE
// ==================================================

if (this.name === 'JobService') {

    this.on('runDelayDetection', async req => {

        const tx = cds.tx(req);

        let processed = 0;
        let delayed = 0;
        let errors = 0;

        // Get only orders where isDelayed is TRUE.
        const delayedOrders = await tx.run(
            SELECT.from(SalesOrder).where({
                isDelayed: true
            })
        );

        processed = delayedOrders.length;
        delayed = delayedOrders.length;

        console.log(
            `[JOB] Found ${delayedOrders.length} delayed sales orders.`
        );

        for (const order of delayedOrders) {

            // Skip orders whose alert was already sent.
            if (order.delayAlertSentAt) {
                console.log(
                    `[JOB] Alert already sent for ${order.orderNo}`
                );
                continue;
            }

            try {

                // Send complete sales order details to ANS.
                await sendDelayedOrderToANS(order);

                // Mark as notified only after successful ANS response.
                await tx.run(
                    UPDATE(SalesOrder)
                        .set({
                            delayAlertSentAt: new Date()
                        })
                        .where({
                            ID: order.ID
                        })
                );

            } catch (error) {

                errors++;

                console.error(
                    `[JOB] Alert failed for ${order.orderNo}:`,
                    error.response?.data || error.message
                );
            }
        }

        return {
            success: errors === 0,
            message: errors === 0
                ? 'Delayed orders checked and alerts processed successfully.'
                : 'Some delayed order alerts could not be sent.',
            processed,
            delayed,
            errors
        };
    });
   }


 

    // ==================================================
    // DEALER SERVICE HANDLERS
    // ==================================================

    if (this.name === 'DealerService') {

        // ----------------------------------------------
        // CREATE ORDER
        // ----------------------------------------------

        this.before('CREATE', 'SalesOrders', async req => {

            const tx = getTransaction(req);

            const dealer = await getDealer(tx, req);

            if (!req.data.items || req.data.items.length === 0) {
                return req.reject(
                    400,
                    'Please add at least one order item.'
                );
            }

            // Validate each order item.
            for (const item of req.data.items) {

                if (!item.model) {
                    return req.reject(
                        400,
                        'Product model is required.'
                    );
                }

                if (
                    item.quantity === undefined ||
                    Number(item.quantity) <= 0
                ) {
                    return req.reject(
                        400,
                        'Quantity must be greater than zero.'
                    );
                }

                if (
                    !Number.isFinite(Number(item.quantity))
                ) {
                    return req.reject(
                        400,
                        'Enter a valid order quantity.'
                    );
                }

                // Dealer cannot choose confirmed quantity.
                item.confirmedQty = 0;
                item.itemStatus = 'Submitted';
            }

            // Assign dealer from XSUAA.
            // Ignore any dealer ID sent by the UI.
            req.data.dealer_ID = dealer.ID;

            req.data.orderNo =
                generateOrderNumber();

            req.data.orderDate =
                new Date().toISOString().slice(0, 10);

            req.data.status = 'Submitted';

            req.data.isBlocked = false;
            req.data.isDelayed = false;
        });


        // ----------------------------------------------
        // CREATE TRACKING SUBSCRIPTION
        // ----------------------------------------------

        this.before(
            'CREATE',
            'TrackingSubscriptions',
            async req => {

                const tx = getTransaction(req);

                const dealer = await getDealer(tx, req);

                req.data.dealer_ID = dealer.ID;
                req.data.userId = getUserID(req);

                // Verify that the order belongs to this dealer.
                if (req.data.salesOrder_ID) {

                    const order = await tx.run(
                        SELECT.one.from(SalesOrder).where({
                            ID: req.data.salesOrder_ID,
                            dealer_ID: dealer.ID
                        })
                    );

                    if (!order) {
                        return req.reject(
                            403,
                            'You cannot subscribe to another dealer order.'
                        );
                    }
                }

                req.data.isActive = true;
            }
        );


        // ----------------------------------------------
        // UPDATE OR DELETE SUBSCRIPTION
        // ----------------------------------------------

        this.before(
            ['UPDATE', 'DELETE'],
            'TrackingSubscriptions',
            async req => {

                const tx = getTransaction(req);

                const dealer = await getDealer(tx, req);

                const subscriptionID = getID(req);

                const subscription = await tx.run(
                    SELECT.one.from(TrackingSubscription).where({
                        ID: subscriptionID,
                        dealer_ID: dealer.ID,
                        userId: getUserID(req)
                    })
                );

                if (!subscription) {
                    return req.reject(
                        403,
                        'You cannot change this subscription.'
                    );
                }
            }
        );
    }


    // ==================================================
    // INTERNAL SERVICE HANDLERS
    // ==================================================

    if (this.name === 'InternalService') {


        // ----------------------------------------------
        // ROLES OF THE LOGGED IN USER (used by the UI)
        // ----------------------------------------------

        this.on('me', req => ({
            user:  req.user.id,
            roles: ['Administrator', 'SalesCoordinator', 'WarehouseUser']
                       .filter(role => req.user.is(role))
        }));

        // ----------------------------------------------
        // UPDATE ORDER ITEM CONFIRMATION
        // ----------------------------------------------

        this.before(
            'UPDATE',
            'SalesOrderItems',
            async req => {

                const tx = getTransaction(req);

                if (req.data.confirmedQty !== undefined) {

                    const itemID = getID(req);

                    const item = await tx.run(
                        SELECT.one.from(SalesOrderItem).where({
                            ID: itemID
                        })
                    );

                    if (!item) {
                        return req.reject(
                            404,
                            'Order item not found.'
                        );
                    }

                    const confirmedQty =
                        Number(req.data.confirmedQty);

                    if (
                        !Number.isFinite(confirmedQty) ||
                        confirmedQty < 0
                    ) {
                        return req.reject(
                            400,
                            'Confirmed quantity cannot be negative.'
                        );
                    }

                    if (confirmedQty > Number(item.quantity)) {
                        return req.reject(
                            400,
                            'Confirmed quantity cannot exceed requested quantity.'
                        );
                    }

                    if (confirmedQty === 0) {
                        req.data.itemStatus = 'Submitted';
                    } else if (
                        confirmedQty < Number(item.quantity)
                    ) {
                        req.data.itemStatus = 'PartiallyAllocated';
                    } else {
                        req.data.itemStatus = 'Confirmed';
                    }
                }
            }
        );


        // After updating an item, recalculate order status.
        this.after(
            'UPDATE',
            'SalesOrderItems',
            async (data, req) => {

                const tx = getTransaction(req);

                const itemID = getID(req);

                const item = await tx.run(
                    SELECT.one.from(SalesOrderItem).where({
                        ID: itemID
                    })
                );

                if (item) {
                    await updateOrderStatusFromItems(
                        tx,
                        item.salesOrder_ID
                    );
                }
            }
        );


        // ----------------------------------------------
        // CREATE DELIVERY MANUALLY
        // ----------------------------------------------

        this.on(
            'createDelivery',
            'SalesOrders',
            async req => {

                const tx = getTransaction(req);

                const orderID = getID(req);

                const order = await tx.run(
                    SELECT.one.from(SalesOrder).where({
                        ID: orderID
                    })
                );

                if (!order) {
                    return req.reject(
                        404,
                        'Sales order not found.'
                    );
                }

                const {
                    deliveryNo,
                    trackingNo,
                    carrier,
                    plannedDate
                } = req.data;

                if (!trackingNo) {
                    return req.reject(
                        400,
                        'Tracking number is required.'
                    );
                }

                const deliveryID = cds.utils.uuid();

                const delivery = {
                    ID: deliveryID,

                    salesOrder_ID: orderID,

                    deliveryNo:
                        deliveryNo || generateDeliveryNumber(),

                    trackingNo,

                    carrier,

                    plannedDate,

                    status: 'Dispatched',

                    lastSyncAt: new Date()
                };

                await tx.run(
                    INSERT.into(Delivery).entries(delivery)
                );

                return tx.run(
                    SELECT.one.from(Delivery).where({
                        ID: deliveryID
                    })
                );
            }
        );


        // ----------------------------------------------
        // ADD ITEM TO A DELIVERY
        // ----------------------------------------------

        this.on(
            'addDeliveryItem',
            'Deliveries',
            async req => {

                const tx = getTransaction(req);

                const deliveryID = getID(req);

                const {
                    orderItem,
                    shippedQty
                } = req.data;

                if (!orderItem) {
                    return req.reject(
                        400,
                        'Order item ID is required.'
                    );
                }

                if (
                    shippedQty === undefined ||
                    !Number.isFinite(Number(shippedQty)) ||
                    Number(shippedQty) <= 0
                ) {
                    return req.reject(
                        400,
                        'Enter a valid shipped quantity.'
                    );
                }

                const delivery = await tx.run(
                    SELECT.one.from(Delivery).where({
                        ID: deliveryID
                    })
                );

                if (!delivery) {
                    return req.reject(
                        404,
                        'Delivery not found.'
                    );
                }

                const item = await tx.run(
                    SELECT.one.from(SalesOrderItem).where({
                        ID: orderItem,
                        salesOrder_ID: delivery.salesOrder_ID
                    })
                );

                if (!item) {
                    return req.reject(
                        400,
                        'This order item does not belong to the delivery order.'
                    );
                }

                // Find how much of this item has already
                // been shipped in all deliveries.
                const orderDeliveries = await tx.run(
                    SELECT.from(Delivery).where({
                        salesOrder_ID: delivery.salesOrder_ID
                    })
                );

                let alreadyShipped = 0;

                for (const currentDelivery of orderDeliveries) {

                    const existingItems = await tx.run(
                        SELECT.from(DeliveryItem).where({
                            delivery_ID: currentDelivery.ID,
                            orderItem_ID: orderItem
                        })
                    );

                    for (const existingItem of existingItems) {
                        alreadyShipped += Number(
                            existingItem.shippedQty
                        );
                    }
                }

                const allowedQty = Number(
                    item.confirmedQty > 0
                        ? item.confirmedQty
                        : item.quantity
                );

                if (
                    alreadyShipped + Number(shippedQty) >
                    allowedQty
                ) {
                    return req.reject(
                        400,
                        'Total shipped quantity cannot exceed the confirmed quantity.'
                    );
                }

                const deliveryItemID = cds.utils.uuid();

                await tx.run(
                    INSERT.into(DeliveryItem).entries({
                        ID: deliveryItemID,
                        delivery_ID: deliveryID,
                        orderItem_ID: orderItem,
                        shippedQty: Number(shippedQty)
                    })
                );

                return tx.run(
                    SELECT.one.from(DeliveryItem).where({
                        ID: deliveryItemID
                    })
                );
            }
        );


        // ----------------------------------------------
        // ADD MANUAL DELIVERY MILESTONE
        // ----------------------------------------------

        this.on(
            'addMilestone',
            'Deliveries',
            async req => {

                const tx = getTransaction(req);

                const deliveryID = getID(req);

                const {
                    sourceEventId,
                    milestoneType,
                    eventTime,
                    location,
                    rawStatusCode,
                    notes
                } = req.data;

                if (!sourceEventId) {
                    return req.reject(
                        400,
                        'Source event ID is required.'
                    );
                }

                if (!milestoneType) {
                    return req.reject(
                        400,
                        'Milestone type is required.'
                    );
                }

                const delivery = await tx.run(
                    SELECT.one.from(Delivery).where({
                        ID: deliveryID
                    })
                );

                if (!delivery) {
                    return req.reject(
                        404,
                        'Delivery not found.'
                    );
                }

                // Duplicate prevention.
                const existing = await tx.run(
                    SELECT.one.from(DeliveryMilestone).where({
                        sourceEventId
                    })
                );

                if (existing) {
                    return req.reject(
                        409,
                        'This milestone event has already been recorded.'
                    );
                }

                const milestone = await addMilestone(
                    tx,
                    delivery,
                    {
                        sourceEventId,
                        milestoneType,
                        eventTime: eventTime || new Date(),
                        location,
                        rawStatusCode,
                        notes
                    }
                );

                return milestone;
            }
        );


        // ----------------------------------------------
        // RAISE DELIVERY EXCEPTION
        // ----------------------------------------------

        this.on(
            'raiseDeliveryException',
            'SalesOrders',
            async req => {

                const tx = getTransaction(req);

                const orderID = getID(req);

                const {
                    type,
                    reason,
                    expectedResolutionDate,
                    delivery
                } = req.data;

                if (!reason || !reason.trim()) {
                    return req.reject(
                        400,
                        'Exception reason is required.'
                    );
                }

                if (!['Blocked', 'Delayed'].includes(type)) {
                    return req.reject(
                        400,
                        'Exception type must be Blocked or Delayed.'
                    );
                }

                if (!expectedResolutionDate) {
                    return req.reject(
                        400,
                        'Expected resolution date is required.'
                    );
                }

                const order = await tx.run(
                    SELECT.one.from(SalesOrder).where({
                        ID: orderID
                    })
                );

                if (!order) {
                    return req.reject(
                        404,
                        'Sales order not found.'
                    );
                }

                if (delivery) {

                    const deliveryRecord = await tx.run(
                        SELECT.one.from(Delivery).where({
                            ID: delivery,
                            salesOrder_ID: orderID
                        })
                    );

                    if (!deliveryRecord) {
                        return req.reject(
                            400,
                            'Delivery does not belong to this order.'
                        );
                    }
                }

                const exceptionID = cds.utils.uuid();

                const exception = {
                    ID: exceptionID,

                    salesOrder_ID: orderID,

                    delivery_ID: delivery || null,

                    type,

                    reason,

                    expectedResolutionDate,

                    status: 'Open',

                    raisedBy: getUserID(req),

                    raisedAt: new Date()
                };

                await tx.run(
                    INSERT.into(ExceptionNote).entries(exception)
                );

                // Set the correct flag without changing
                // the shipping status.
                if (type === 'Blocked') {

                    await tx.run(
                        UPDATE(SalesOrder)
                            .set({ isBlocked: true })
                            .where({ ID: orderID })
                    );
                }

                if (type === 'Delayed') {

                    await tx.run(
                        UPDATE(SalesOrder)
                            .set({ isDelayed: true })
                            .where({ ID: orderID })
                    );
                }

                await sendAlert(
                    tx,
                    order,
                    type,
                    reason
                );

                return tx.run(
                    SELECT.one.from(ExceptionNote).where({
                        ID: exceptionID
                    })
                );
            }
        );


        // ----------------------------------------------
        // RESOLVE EXCEPTION
        // ----------------------------------------------

        this.on(
            'resolveException',
            'ExceptionNotes',
            async req => {

                const tx = getTransaction(req);

                const exceptionID = getID(req);

                const {
                    resolutionNote,
                    expectedResolutionDate
                } = req.data;

                if (!resolutionNote || !resolutionNote.trim()) {
                    return req.reject(
                        400,
                        'Resolution note is required.'
                    );
                }

                const exception = await tx.run(
                    SELECT.one.from(ExceptionNote).where({
                        ID: exceptionID
                    })
                );

                if (!exception) {
                    return req.reject(
                        404,
                        'Exception not found.'
                    );
                }

                if (exception.status === 'Resolved') {
                    return req.reject(
                        400,
                        'This exception is already resolved.'
                    );
                }

                await tx.run(
                    UPDATE(ExceptionNote)
                        .set({
                            status: 'Resolved',
                            resolutionNote,
                            expectedResolutionDate:
                                expectedResolutionDate ||
                                exception.expectedResolutionDate,
                            resolvedBy: getUserID(req),
                            resolvedAt: new Date()
                        })
                        .where({ ID: exceptionID })
                );

                // Check whether another open exception of
                // the same type exists for this order.
                const otherOpen = await tx.run(
                    SELECT.from(ExceptionNote).where({
                        salesOrder_ID: exception.salesOrder_ID,
                        type: exception.type,
                        status: 'Open',
                        ID: { '!=': exceptionID }
                    })
                );

                if (otherOpen.length === 0) {

                    const flag = exception.type === 'Blocked'
                        ? 'isBlocked'
                        : 'isDelayed';

                    await tx.run(
                        UPDATE(SalesOrder)
                            .set({ [flag]: false })
                            .where({
                                ID: exception.salesOrder_ID
                            })
                    );
                }

                return tx.run(
                    SELECT.one.from(ExceptionNote).where({
                        ID: exceptionID
                    })
                );
            }
        );


        // ----------------------------------------------
        // CHECK ORDER DELAY
        // ----------------------------------------------

        this.on(
            'checkDelay',
            'SalesOrders',
            async req => {

                const tx = getTransaction(req);

                const orderID = getID(req);

                const order = await tx.run(
                    SELECT.one.from(SalesOrder).where({
                        ID: orderID
                    })
                );

                if (!order) {
                    return req.reject(
                        404,
                        'Sales order not found.'
                    );
                }

                await checkOrderDelay(tx, order);

                return tx.run(
                    SELECT.one.from(SalesOrder).where({
                        ID: orderID
                    })
                );
            }
        );
    }
});


// ==================================================
// 2. MILESTONE BUSINESS LOGIC
// ==================================================

async function addMilestone(tx, delivery, data) {

    const milestoneID = cds.utils.uuid();

    const appStatus = getStatusFromMilestone(
        data.milestoneType
    );

    const milestone = {
        ID: milestoneID,

        sourceEventId: data.sourceEventId,

        delivery_ID: delivery.ID,

        milestoneType: data.milestoneType,

        rawStatusCode: data.rawStatusCode,

        appStatus,

        eventTime: data.eventTime,

        location: data.location,

        source: 'Manual',

        notes: data.notes,

        receivedAt: new Date()
    };

    await tx.run(
        INSERT.into(DeliveryMilestone).entries(milestone)
    );


    const order = await tx.run(
        SELECT.one.from(SalesOrder).where({
            ID: delivery.salesOrder_ID
        })
    );

    if (!order) {
    return milestone;
   }

    // Mark the sales order as delayed when a Delayed milestone is added.
   if (data.milestoneType === 'Delayed') {
    await tx.run(
        UPDATE(SalesOrder)
            .set({ isDelayed: true })
            .where({ ID: order.ID })
    );

    order.isDelayed = true;
  }


    // Update order status only when the new status
    // is later than or equal to the current status.

    if (
        appStatus &&
        isNewerStatus(order.status, appStatus)
    ) {

        await tx.run(
            UPDATE(SalesOrder)
                .set({ status: appStatus })
                .where({ ID: order.ID })
        );
    }


    // Update delivery status.
    const deliveryUpdate = {
        lastSyncAt: new Date()
    };

    if (data.milestoneType === 'Dispatched') {

        if (delivery.status !== 'Delivered') {
            deliveryUpdate.status = 'Dispatched';
        }

        if (!delivery.dispatchedAt) {
            deliveryUpdate.dispatchedAt = data.eventTime;
        }
    }

    if (
        data.milestoneType === 'InTransit' ||
        data.milestoneType === 'OutForDelivery'
    ) {

        if (delivery.status !== 'Delivered') {
            deliveryUpdate.status = 'InTransit';
        }
    }

    if (data.milestoneType === 'Delivered') {

        deliveryUpdate.status = 'Delivered';
        deliveryUpdate.deliveredAt = data.eventTime;
    }

    await tx.run(
        UPDATE(Delivery)
            .set(deliveryUpdate)
            .where({ ID: delivery.ID })
    );


    // Check whether all deliveries have been delivered
    // AND all confirmed quantities have been shipped.

    await checkOrderDelivered(tx, order.ID);


    // Send alerts to subscribers.
    if (data.milestoneType === 'Dispatched') {

        await sendAlert(
            tx,
            order,
            'Dispatch',
            'Your order has been dispatched.'
        );
    }

    if (data.milestoneType === 'Delivered') {

        await sendAlert(
            tx,
            order,
            'Delivery',
            'Your order has been delivered.'
        );
    }

    return milestone;
}


// ==================================================
// 3. CHECK WHETHER THE ORDER IS FULLY DELIVERED
// ==================================================

async function checkOrderDelivered(tx, orderID) {

    const order = await tx.run(
        SELECT.one.from(SalesOrder).where({
            ID: orderID
        })
    );

    if (!order) {
        return;
    }

    const deliveries = await tx.run(
        SELECT.from(Delivery).where({
            salesOrder_ID: orderID
        })
    );

    if (deliveries.length === 0) {
        return;
    }

    const allDelivered = deliveries.every(
        delivery => delivery.status === 'Delivered'
    );

    if (!allDelivered) {
        return;
    }

    const orderItems = await tx.run(
        SELECT.from(SalesOrderItem).where({
            salesOrder_ID: orderID
        })
    );

    for (const orderItem of orderItems) {

        let totalShipped = 0;

        for (const delivery of deliveries) {

            const deliveryItems = await tx.run(
                SELECT.from(DeliveryItem).where({
                    delivery_ID: delivery.ID,
                    orderItem_ID: orderItem.ID
                })
            );

            for (const item of deliveryItems) {
                totalShipped += Number(item.shippedQty);
            }
        }

        const requiredQty = Number(
            orderItem.confirmedQty > 0
                ? orderItem.confirmedQty
                : orderItem.quantity
        );

        if (totalShipped < requiredQty) {
            return;
        }
    }

    await tx.run(
        UPDATE(SalesOrder)
            .set({ status: 'Delivered' })
            .where({ ID: orderID })
    );
}


// ==================================================
// 4. DELAY DETECTION
// ==================================================

async function checkOrderDelay(tx, order) {

    if (order.status === 'Delivered') {
        return;
    }

    const today = new Date().toISOString().slice(0, 10);

    const deliveries = await tx.run(
        SELECT.from(Delivery).where({
            salesOrder_ID: order.ID
        })
    );

    let isDelayed = false;

    // If deliveries exist, check their planned dates.
    if (deliveries.length > 0) {

        for (const delivery of deliveries) {

            if (
                delivery.status !== 'Delivered' &&
                delivery.plannedDate &&
                String(delivery.plannedDate) < today
            ) {
                isDelayed = true;
                break;
            }
        }

    } else {

        // If there is no delivery yet, use the
        // confirmed date or requested date.
        const expectedDate =
            order.confirmedDate || order.requestedDate;

        if (
            expectedDate &&
            String(expectedDate) < today
        ) {
            isDelayed = true;
        }
    }

    if (!isDelayed) {
        return;
    }

    const existingException = await tx.run(
        SELECT.one.from(ExceptionNote).where({
            salesOrder_ID: order.ID,
            type: 'Delayed',
            status: 'Open'
        })
    );

    if (existingException) {
        return;
    }

    await tx.run(
        UPDATE(SalesOrder)
            .set({ isDelayed: true })
            .where({ ID: order.ID })
    );

    await tx.run(
        INSERT.into(ExceptionNote).entries({
            ID: cds.utils.uuid(),

            salesOrder_ID: order.ID,

            type: 'Delayed',

            reason: 'Expected delivery date has passed without delivery.',

            status: 'Open',

            raisedBy: 'SYSTEM',

            raisedAt: new Date()
        })
    );

    await sendAlert(
        tx,
        order,
        'Delay',
        'Your order is delayed. Please check the order details.'
    );
}

