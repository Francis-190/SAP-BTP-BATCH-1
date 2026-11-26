
using { interplant as db } from '../db/schema';

service InventoryService {

    // Master Data

    @restrict: [
        { grant: 'READ', to: ['WarehouseOperator', 'StoreManager', 'InventoryController', 'ReadOnlyPlanner'] },
        { grant: ['CREATE', 'UPDATE', 'DELETE'], to: 'InventoryController' }
    ]
    entity UnitsOfMeasure as projection on db.UnitsOfMeasure;


    @restrict: [
        { grant: 'READ', to: ['WarehouseOperator', 'StoreManager', 'InventoryController', 'ReadOnlyPlanner'] },
        { grant: ['CREATE', 'UPDATE', 'DELETE'], to: 'InventoryController' }
    ]
    entity Materials as projection on db.Materials;


    // Plants

    @restrict: [
        {
            grant: 'READ',
            to: 'WarehouseOperator',
            where: (
                exists warehouseAssignments[
                    userId = $user and isActive = true
                ]
            )
        },
        {
            grant: 'READ',
            to: ['StoreManager', 'InventoryController', 'ReadOnlyPlanner']
        },
        {
            grant: ['CREATE', 'UPDATE', 'DELETE'],
            to: 'InventoryController'
        }
    ]
    entity Plants as projection on db.Plants;


    // Storage Locations

    @restrict: [
        {
            grant: 'READ',
            to: 'WarehouseOperator',
            where: (
                exists plant.warehouseAssignments[
                    userId = $user and isActive = true
                ]
            )
        },
        {
            grant: 'READ',
            to: ['StoreManager', 'InventoryController', 'ReadOnlyPlanner']
        },
        {
            grant: ['CREATE', 'UPDATE', 'DELETE'],
            to: 'InventoryController'
        }
    ]
    entity StorageLocations as projection on db.StorageLocations;


    // Storage Bins

    @restrict: [
        {
            grant: 'READ',
            to: 'WarehouseOperator',
            where: (
                exists storageLocation.plant.warehouseAssignments[
                    userId = $user and isActive = true
                ]
            )
        },
        {
            grant: 'READ',
            to: ['StoreManager', 'InventoryController', 'ReadOnlyPlanner']
        },
        {
            grant: ['CREATE', 'UPDATE', 'DELETE'],
            to: 'InventoryController'
        }
    ]
    entity StorageBins as projection on db.StorageBins;


    @restrict: [
        { grant: 'READ', to: ['WarehouseOperator', 'StoreManager', 'InventoryController', 'ReadOnlyPlanner'] },
        { grant: ['CREATE', 'UPDATE', 'DELETE'], to: 'InventoryController' }
    ]
    entity MovementReasons as projection on db.MovementReasons;


    // Stock Information - Read Only

    @readonly
    @restrict: [
        {
            grant: 'READ',
            to: 'WarehouseOperator',
            where: (
                exists plant.warehouseAssignments[
                    userId = $user and isActive = true
                ]
            )
        },
        {
            grant: 'READ',
            to: ['StoreManager', 'InventoryController', 'ReadOnlyPlanner']
        }
    ]
    entity StockBalances as projection on db.StockBalances;


    @readonly
    @restrict: [
        {
            grant: 'READ',
            to: 'WarehouseOperator',
            where: (
                exists plant.warehouseAssignments[
                    userId = $user and isActive = true
                ]
            )
        },
        {
            grant: 'READ',
            to: ['StoreManager', 'InventoryController', 'ReadOnlyPlanner']
        }
    ]
    entity StockMovements as projection on db.StockMovements;


    @readonly
    @restrict: [
        {
            grant: 'READ',
            to: 'WarehouseOperator',
            where: (
                exists plant.warehouseAssignments[
                    userId = $user and isActive = true
                ]
            )
        },
        {
            grant: 'READ',
            to: ['StoreManager', 'InventoryController', 'ReadOnlyPlanner']
        }
    ]
    entity Reservations as projection on db.Reservations;


    // Stock Query Functions

    @requires: ['WarehouseOperator', 'StoreManager', 'InventoryController', 'ReadOnlyPlanner']
    @restrict: [
        { to: ['WarehouseOperator', 'StoreManager', 'InventoryController', 'ReadOnlyPlanner'] }
    ]
    function getAvailableQuantity(
        materialID        : UUID,
        plantID           : UUID,
        storageLocationID : UUID,
        storageBinID      : UUID,
        batchNumber       : String(40)
    ) returns Decimal(15,3);


    @requires: ['WarehouseOperator', 'StoreManager', 'InventoryController', 'ReadOnlyPlanner', 'JOBSCHEDULER']
    @restrict: [
        { to: ['WarehouseOperator', 'StoreManager', 'InventoryController', 'ReadOnlyPlanner', 'JOBSCHEDULER'] }
    ]
    function getLowStock() returns many StockBalances;


    // Reservation Release

    @requires: 'InventoryController'
    @restrict: [
        { to: 'InventoryController' }
    ]
    action releaseReservation(
        reservationID  : UUID,
        quantity        : Decimal(15,3),
        performedBy     : String(100),
        idempotencyKey  : UUID
    ) returns Reservations;


    // Movement Reversal

    @requires: 'InventoryController'
    @restrict: [
        { to: 'InventoryController' }
    ]
    action reverseMovement(
        movementID      : UUID,
        performedBy     : String(100),
        reason          : String(255),
        idempotencyKey  : UUID
    ) returns StockMovements;


    // Stock Adjustment

    @requires: 'InventoryController'
    @restrict: [
        { to: 'InventoryController' }
    ]
    action adjustStock(
        stockBalanceID   : UUID,
        stockCategory    : String(20),
        adjustmentType   : String(20),
        quantity         : Decimal(15,3),
        movementReasonID : UUID,
        performedBy      : String(100),
        referenceNumber  : String(100),
        idempotencyKey   : UUID
    ) returns StockMovements;


    // Low Stock Notification

    @requires: ['InventoryController', 'JOBSCHEDULER']
@restrict: [
    { to: ['InventoryController', 'JOBSCHEDULER'] }
]
action notifyLowStock() returns Integer;

}
