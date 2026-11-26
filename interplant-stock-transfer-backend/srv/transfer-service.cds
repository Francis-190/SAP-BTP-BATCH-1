
using { interplant as db } from '../db/schema';

service TransferService {

    // Transfer Header

    @restrict: [
        {
            grant: 'READ',
            to: 'WarehouseOperator',
            where: (
                exists sourcePlant.warehouseAssignments[
                    userId = $user and isActive = true
                ]
                or
                exists destinationPlant.warehouseAssignments[
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
            to: 'StoreManager'
        }
    ]
    entity TransferRequests as projection on db.TransferRequests;


    // Transfer Items

    @restrict: [
        {
            grant: 'READ',
            to: 'WarehouseOperator',
            where: (
                exists transfer.sourcePlant.warehouseAssignments[
                    userId = $user and isActive = true
                ]
                or
                exists transfer.destinationPlant.warehouseAssignments[
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
            to: 'StoreManager'
        }
    ]
    entity TransferItems as projection on db.TransferItems;


    // Reservations - Required by reserve Action

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


    // Transfer Audit History

    @readonly
    @restrict: [
        {
            grant: 'READ',
            to: 'WarehouseOperator',
            where: (
                exists transfer.sourcePlant.warehouseAssignments[
                    userId = $user and isActive = true
                ]
                or
                exists transfer.destinationPlant.warehouseAssignments[
                    userId = $user and isActive = true
                ]
            )
        },
        {
            grant: 'READ',
            to: ['StoreManager', 'InventoryController', 'ReadOnlyPlanner']
        }
    ]
    entity TransferEvents as projection on db.TransferEvents;


    // Reservation

    @requires: 'WarehouseOperator'
    @restrict: [
        { to: 'WarehouseOperator' }
    ]
    action reserve(
        transferID      : UUID,
        itemID          : UUID,
        performedBy     : String(100),
        idempotencyKey  : UUID
    ) returns many Reservations;


    // Transfer Request Lifecycle

    @requires: 'StoreManager'
    @restrict: [
        { to: 'StoreManager' }
    ]
    action submitTransfer(
        transferID  : UUID,
        performedBy : String(100)
    ) returns TransferRequests;

    @requires: 'StoreManager'
    @restrict: [
        { to: 'StoreManager' }
    ]
    action approveTransfer(
        transferID  : UUID,
        performedBy : String(100)
    ) returns TransferRequests;

    @requires: 'StoreManager'
    @restrict: [
        { to: 'StoreManager' }
    ]
    action rejectTransfer(
        transferID  : UUID,
        performedBy : String(100),
        reason      : String(255)
    ) returns TransferRequests;


    // Picking

    @requires: 'WarehouseOperator'
    @restrict: [
        { to: 'WarehouseOperator' }
    ]
    action startPicking(
        transferID  : UUID,
        performedBy : String(100)
    ) returns TransferRequests;


    // Dispatch

    @requires: 'WarehouseOperator'
    @restrict: [
        { to: 'WarehouseOperator' }
    ]
    action dispatchTransfer(
        transferID      : UUID,
        itemID          : UUID,
        quantity        : Decimal(15,3),
        performedBy     : String(100),
        reason          : String(255),
        expectedDate    : Date,
        idempotencyKey  : UUID
    ) returns TransferRequests;


    // Receipt

    @requires: 'WarehouseOperator'
    @restrict: [
        { to: 'WarehouseOperator' }
    ]
    action receiveTransfer(
        transferID               : UUID,
        itemID                   : UUID,
        goodQty                  : Decimal(15,3),
        damagedQty               : Decimal(15,3),
        destinationStorageBinID  : UUID,
        discrepancyReasonID      : UUID,
        performedBy              : String(100),
        idempotencyKey            : UUID
    ) returns TransferRequests;


    // Transfer Completion

    @requires: 'StoreManager'
    @restrict: [
        { to: 'StoreManager' }
    ]
    action closeTransfer(
        transferID  : UUID,
        performedBy : String(100)
    ) returns TransferRequests;

}
