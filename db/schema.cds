
namespace sap.sodv;

using { cuid } from '@sap/cds/common';

// ================================================
// ENUM TYPES
// ================================================

type DealerStatus : String enum {
    Active;
    Blocked;
    Inactive;
}

type OrderStatus : String enum {
    Submitted;
    Confirmed;
    PartiallyAllocated;
    Dispatched;
    InTransit;
    Delivered;
}

type DeliveryStatus : String enum {
    Dispatched;
    InTransit;
    Delivered;
}

type MilestoneType : String enum {
    Dispatched;
    InTransit;
    OutForDelivery;
    Delayed;
    Delivered;
}

type ExceptionType : String enum {
    Blocked;
    Delayed;
}

type ExceptionStatus : String enum {
    Open;
    Resolved;
}

type EventSource : String enum {
    ERP;
    Logistics;
    Manual;
}

type AlertChannel : String enum {
    Email;
    InApp;
}


// ================================================
// 1. DEALER ACCOUNT
// ================================================

@assert.unique: { dealerNumber: [dealerNo] }
entity DealerAccount : cuid {

    dealerNo       : String(20) not null;
    name           : String(120) not null;
    region         : String(40);
    contactEmail   : String(120);

    status         : DealerStatus default 'Active';

    orders         : Association to many SalesOrder
                         on orders.dealer = $self;

    subscriptions  : Association to many TrackingSubscription
                         on subscriptions.dealer = $self;
}


// ================================================
// 2. SALES ORDER
// ================================================

@assert.unique: { orderNumber: [orderNo] }
entity SalesOrder : cuid {

    orderNo           : String(20) not null;
    sourceOrderId     : String(40);

    dealer            : Association to DealerAccount not null;

    status            : OrderStatus default 'Submitted';

    isBlocked         : Boolean default false;
    isDelayed         : Boolean default false;

    orderDate         : Date;
    deliveryLocation  : String(250);

    requestedDate     : Date;
    confirmedDate     : Date;

    customerReference : String(40);

    delayAlertSentAt : Timestamp;

    lastSyncAt        : Timestamp;

    items             : Composition of many SalesOrderItem
                            on items.salesOrder = $self;

    deliveries        : Association to many Delivery
                            on deliveries.salesOrder = $self;

    exceptions        : Association to many ExceptionNote
                            on exceptions.salesOrder = $self;

    subscriptions     : Association to many TrackingSubscription
                            on subscriptions.salesOrder = $self;
}


// ================================================
// 3. SALES ORDER ITEM
// ================================================

entity SalesOrderItem : cuid {

    salesOrder    : Association to SalesOrder not null;

    lineNo        : Integer not null;

    model         : String(60) not null;
    description   : String(250);

    quantity      : Decimal(13,3) not null;
    confirmedQty  : Decimal(13,3) default 0;

    uom           : String(10);

    requestedDate : Date;
    confirmedDate : Date;

    itemStatus    : OrderStatus default 'Submitted';

    sourceItemId  : String(40);

    deliveryItems : Association to many DeliveryItem
                        on deliveryItems.orderItem = $self;
}


// ================================================
// 4. DELIVERY
// ================================================

@assert.unique: { deliveryNumber: [deliveryNo] }
entity Delivery : cuid {

    salesOrder       : Association to SalesOrder not null;

    deliveryNo       : String(20);
    sourceDeliveryId : String(40);

    trackingNo       : String(60);
    carrier          : String(60);

    status           : DeliveryStatus default 'Dispatched';

    plannedDate      : Date;

    dispatchedAt     : Timestamp;
    deliveredAt      : Timestamp;

    lastSyncAt       : Timestamp;

    items            : Association to many DeliveryItem
                           on items.delivery = $self;

    milestones       : Composition of many DeliveryMilestone
                           on milestones.delivery = $self;
}


// ================================================
// 5. DELIVERY ITEM
// ================================================

entity DeliveryItem : cuid {

    delivery    : Association to Delivery not null;

    orderItem   : Association to SalesOrderItem not null;

    shippedQty  : Decimal(13,3) not null;
}


// ================================================
// 6. DELIVERY MILESTONE
// ================================================

@assert.unique: { sourceEvent: [sourceEventId] }
entity DeliveryMilestone : cuid {

    sourceEventId : String(60) not null;

    delivery      : Association to Delivery not null;

    milestoneType : MilestoneType not null;

    rawStatusCode : String(30);

    appStatus     : OrderStatus;

    eventTime     : Timestamp not null;

    location      : String(100);

    source        : EventSource default 'Manual';

    notes         : String(250);

    receivedAt    : Timestamp;
}


// ================================================
// 7. TRACKING SUBSCRIPTION
// ================================================

entity TrackingSubscription : cuid {

    dealer         : Association to DealerAccount not null;

    userId         : String(100) not null;

    // Optional order association:
    // Empty means all orders for this dealer.

    salesOrder     : Association to SalesOrder;

    milestoneTypes : String(100);

    channel        : AlertChannel default 'InApp';

    isActive       : Boolean default true;
}


// ================================================
// 8. STATUS MAPPING
// ================================================

@assert.unique: { sourceMapping: [sourceSystem, sourceCode] }
entity StatusMapping : cuid {

    sourceSystem : String(30) not null;

    sourceCode   : String(30) not null;

    appStatus    : OrderStatus not null;

    sequenceNo   : Integer not null;

    isActive     : Boolean default true;
}


// ================================================
// 9. EXCEPTION NOTE
// ================================================

entity ExceptionNote : cuid {

    salesOrder : Association to SalesOrder not null;

    delivery   : Association to Delivery;

    type       : ExceptionType not null;

    reason     : String(250) not null;

    expectedResolutionDate : Date;

    resolutionNote : String(500);

    status     : ExceptionStatus default 'Open';

    raisedBy   : String(100);
    resolvedBy : String(100);

    raisedAt   : Timestamp;
    resolvedAt : Timestamp;
}
