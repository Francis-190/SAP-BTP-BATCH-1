using sap.sodv as db from '../db/schema';


// ==================================================
// 1. DEALER SERVICE
// ==================================================

@path    : '/odata/v4/dealer'
@requires: 'DealerUser'
service DealerService {

    // ----------------------------------------------
    // SALES ORDERS
    // ----------------------------------------------

    @restrict: [{
        grant: [
            'READ',
            'CREATE'
        ],
        to   : 'DealerUser',
        where: 'dealer.dealerNo = $user.dealerNo'
    }]

    entity SalesOrders           as
        projection on db.SalesOrder {
            *,
            dealer.dealerNo as dealerNo,
            dealer.name     as dealerName
        };


    // ----------------------------------------------
    // SALES ORDER ITEMS
    // ----------------------------------------------

    @restrict: [{
        grant: [
            'READ',
            'CREATE'
        ],
        to   : 'DealerUser',
        where: 'salesOrder.dealer.dealerNo = $user.dealerNo'
    }]

    entity SalesOrderItems       as projection on db.SalesOrderItem;


    // ----------------------------------------------
    // DELIVERIES
    // ----------------------------------------------

    @readonly
    @restrict: [{
        grant: 'READ',
        to   : 'DealerUser',
        where: 'salesOrder.dealer.dealerNo = $user.dealerNo'
    }]

    entity Deliveries            as projection on db.Delivery;


    // ----------------------------------------------
    // DELIVERY ITEMS
    // ----------------------------------------------

    @readonly
    @restrict: [{
        grant: 'READ',
        to   : 'DealerUser',
        where: 'delivery.salesOrder.dealer.dealerNo = $user.dealerNo'
    }]

    entity DeliveryItems         as projection on db.DeliveryItem;


    // ----------------------------------------------
    // DELIVERY MILESTONES
    // ----------------------------------------------

    @readonly
    @restrict: [{
        grant: 'READ',
        to   : 'DealerUser',
        where: 'delivery.salesOrder.dealer.dealerNo = $user.dealerNo'
    }]

    entity DeliveryMilestones    as projection on db.DeliveryMilestone;


    // ----------------------------------------------
    // EXCEPTION NOTES
    // ----------------------------------------------

    @readonly
    @restrict: [{
        grant: 'READ',
        to   : 'DealerUser',
        where: 'salesOrder.dealer.dealerNo = $user.dealerNo'
    }]

    entity ExceptionNotes        as
        projection on db.ExceptionNote {
            ID,
            salesOrder,
            delivery,
            type,
            reason,
            expectedResolutionDate,
            resolutionNote,
            status
        };


    // ----------------------------------------------
    // TRACKING SUBSCRIPTIONS
    // ----------------------------------------------

    @restrict: [{
        grant: [
            'READ',
            'CREATE',
            'UPDATE',
            'DELETE'
        ],
        to   : 'DealerUser',
        where: 'dealer.dealerNo = $user.dealerNo and userId = $user'
    }]

    entity TrackingSubscriptions as projection on db.TrackingSubscription;
}


// ==================================================
// 2. INTERNAL SERVICE
// ==================================================

@path    : '/odata/v4/internal'
@requires: [
    'SalesCoordinator',
    'WarehouseUser',
    'Administrator'
]
service InternalService {


    // ----------------------------------------------
    // SALES ORDERS
    // ----------------------------------------------

    @restrict: [
        {
            grant: 'READ',
            to   : [
                'SalesCoordinator',
                'WarehouseUser',
                'Administrator'
            ]
        },
        {
            grant: 'UPDATE',
            to   : 'SalesCoordinator'
        },
        {
            grant: [
                'createDelivery',
                'raiseDeliveryException',
                'checkDelay'
            ],
            to   : [
                'SalesCoordinator',
                'Administrator'
            ]
        },
        {
            grant: 'createDelivery',
            to   : 'WarehouseUser'
        },
        {
            grant: 'raiseDeliveryException',
            to   : 'WarehouseUser'
        }
    ]

    entity SalesOrders           as
        projection on db.SalesOrder {
            *,
            dealer.dealerNo as dealerNo,
            dealer.name     as dealerName
        }
        actions {

            action createDelivery(deliveryNo: String(20),
                                  trackingNo: String(60),
                                  carrier: String(60),
                                  plannedDate: Date)      returns Deliveries;

            action raiseDeliveryException(type: db.ExceptionType,
                                          reason: String(250),
                                          expectedResolutionDate: Date,
                                          delivery: UUID) returns ExceptionNotes;

            action checkDelay()                           returns SalesOrders;
        };


    // ----------------------------------------------
    // SALES ORDER ITEMS
    // ----------------------------------------------

    @restrict: [
        {
            grant: 'READ',
            to   : [
                'SalesCoordinator',
                'WarehouseUser',
                'Administrator'
            ]
        },
        {
            grant: 'UPDATE',
            to   : 'SalesCoordinator'
        }
    ]

    entity SalesOrderItems       as projection on db.SalesOrderItem;


    // ----------------------------------------------
    // DELIVERIES
    // ----------------------------------------------

    @restrict: [
        {
            grant: 'READ',
            to   : [
                'SalesCoordinator',
                'WarehouseUser',
                'Administrator'
            ]
        },
        {
            grant: 'addMilestone',
            to   : [
                'WarehouseUser',
                'Administrator'
            ]
        },
        {
            grant: 'addDeliveryItem',
            to   : [
                'WarehouseUser',
                'Administrator'
            ]
        }
    ]

    entity Deliveries            as projection on db.Delivery
        actions {

            action addMilestone(sourceEventId: String(60),
                                milestoneType: db.MilestoneType,
                                eventTime: Timestamp,
                                location: String(100),
                                rawStatusCode: String(30),
                                notes: String(250))            returns DeliveryMilestones;

            action addDeliveryItem(orderItem: UUID,
                                   shippedQty: Decimal(13, 3)) returns DeliveryItems;
        };


    // ----------------------------------------------
    // DELIVERY ITEMS
    // ----------------------------------------------

    @readonly
    @restrict: [{
        grant: 'READ',
        to   : [
            'SalesCoordinator',
            'WarehouseUser',
            'Administrator'
        ]
    }]

    entity DeliveryItems         as projection on db.DeliveryItem;


    // ----------------------------------------------
    // DELIVERY MILESTONES
    // ----------------------------------------------

    @readonly
    @restrict: [{
        grant: 'READ',
        to   : [
            'SalesCoordinator',
            'WarehouseUser',
            'Administrator'
        ]
    }]

    entity DeliveryMilestones    as projection on db.DeliveryMilestone;


    // ----------------------------------------------
    // EXCEPTION NOTES
    // ----------------------------------------------

    @cds.redirection.target
    @restrict: [
        {
            grant: 'READ',
            to   : [
                'SalesCoordinator',
                'WarehouseUser',
                'Administrator'
            ]
        },
        {
            grant: 'UPDATE',
            to   : 'SalesCoordinator'
        },
        {
            grant: 'resolveException',
            to   : 'SalesCoordinator'
        }
    ]

    entity ExceptionNotes        as projection on db.ExceptionNote
        actions {

            action resolveException(resolutionNote: String(500),
                                    expectedResolutionDate: Date) returns ExceptionNotes;
        };


    // ----------------------------------------------
    // OPEN EXCEPTIONS
    // ----------------------------------------------

    @readonly
    @restrict: [{
        grant: 'READ',
        to   : [
            'SalesCoordinator',
            'WarehouseUser',
            'Administrator'
        ]
    }]

    entity OpenExceptions        as
        select from db.ExceptionNote {
            *,
            salesOrder.orderNo     as orderNo,
            salesOrder.dealer.name as dealerName
        }
        where
            status = 'Open';


    // ----------------------------------------------
    // STATUS MAPPINGS
    // ----------------------------------------------

    @restrict: [{
        grant: '*',
        to   : 'Administrator'
    }]

    entity StatusMappings        as projection on db.StatusMapping;


    // ----------------------------------------------
    // DEALER ACCOUNTS
    // ----------------------------------------------

    @restrict: [
        {
            grant: 'READ',
            to   : [
                'SalesCoordinator',
                'Administrator'
            ]
        },
        {
            grant: [
                'CREATE',
                'UPDATE',
                'DELETE'
            ],
            to   : 'Administrator'
        }
    ]

    entity DealerAccounts        as projection on db.DealerAccount;


    // ----------------------------------------------
    // INTERNAL SUBSCRIPTIONS
    // ----------------------------------------------

    @restrict: [{
        grant: '*',
        to   : 'Administrator'
    }]

    entity TrackingSubscriptions as projection on db.TrackingSubscription;





    @requires: 'authenticated-user'
    function me() returns { user : String; roles : many String; };
}


@path: '/odata/v4/job'
@requires: 'jobscheduler'
service JobService {

    type DelayDetectionResult : {
        success   : Boolean;
        message   : String(255);
        processed : Integer;
        delayed   : Integer;
        errors    : Integer;
    };

    action runDelayDetection() returns DelayDetectionResult;
}