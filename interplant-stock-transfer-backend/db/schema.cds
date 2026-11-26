namespace interplant;

using { cuid, managed } from '@sap/cds/common';


entity UnitsOfMeasure : cuid, managed {
    code        : String(10) not null;
    description : String(50) not null;

}  

entity Materials : cuid, managed {
    materialCode : String(30) not null;
    description  : String(100) not null;
    category     : String(50) not null;

    uom : Association to UnitsOfMeasure not null;

    reorderLevel : Decimal(15,3) default 0;
    safetyStock  : Decimal(15,3) default 0;

    isActive : Boolean default true;
}


entity Plants : cuid, managed {
    plantCode   : String(10) not null;
    plantName   : String(100) not null;
    description : String(255);
    warehouseAssignments : Association to many WarehouseUserAssignments
        on warehouseAssignments.plant = $self;
}


entity StorageLocations : cuid, managed {
    locationCode : String(10) not null;
    locationName : String(100) not null;

    plant : Association to Plants not null;
}


entity StorageBins : cuid, managed {
    binCode     : String(20) not null;
    description : String(100);

    storageLocation : Association to StorageLocations not null;
}


entity MovementReasons : cuid, managed {
    reasonCode  : String(30) not null;
    description : String(100) not null;
}


entity StockBalances : cuid, managed {
    material : Association to Materials not null;
    plant    : Association to Plants not null;

    storageLocation : Association to StorageLocations not null;
    storageBin      : Association to StorageBins not null;

    batchNumber : String(40) not null;

    unrestrictedQty : Decimal(15,3) default 0;
    reservedQty     : Decimal(15,3) default 0;
    qualityQty      : Decimal(15,3) default 0;
    blockedQty      : Decimal(15,3) default 0;
}


entity StockMovements : cuid, managed {
    material : Association to Materials not null;
    plant    : Association to Plants not null;

    storageLocation : Association to StorageLocations not null;
    storageBin      : Association to StorageBins not null;

    batchNumber : String(40) not null;

    movementType  : String(30) not null;
    stockCategory : String(30) not null;
    quantity      : Decimal(15,3) not null;

    movementReason : Association to MovementReasons;

    referenceNumber : String(30) not null;

    reversalOf : Association to StockMovements;
}


entity Reservations : cuid, managed {
    material : Association to Materials not null;
    plant    : Association to Plants not null;

    storageLocation : Association to StorageLocations not null;
    storageBin      : Association to StorageBins not null;

    batchNumber : String(40) not null;

    reservedQty : Decimal(15,3) not null;
    releasedQty : Decimal(15,3) default 0;
    consumedQty : Decimal(15,3) default 0;

    status : String(30) not null;

    requirementReference : String(30);

    transferItem : Association to TransferItems;
}

entity TransferRequests : cuid, managed {
    transferNumber : String(30) not null;

    sourcePlant      : Association to Plants not null;
    destinationPlant : Association to Plants not null;

    sourceStorageLocation
        : Association to StorageLocations not null;

    destinationStorageLocation
        : Association to StorageLocations not null;

    status : String(30) not null;

    items : Composition of many TransferItems
        on items.transfer = $self;

    events : Composition of many TransferEvents
        on events.transfer = $self;
}


entity TransferItems : cuid, managed {
    transfer : Association to TransferRequests not null;

    material : Association to Materials not null;

    batchNumber : String(40) not null;

    requestedQty  : Decimal(15,3) not null;
    dispatchedQty : Decimal(15,3) default 0;
    receivedQty   : Decimal(15,3) default 0;
    damagedQty    : Decimal(15,3) default 0;

    discrepancyReason : Association to MovementReasons;
}

@assert.unique.idempotencyKey: [idempotencyKey]
entity TransferEvents : cuid, managed {
    transfer : Association to TransferRequests;

    idempotencyKey : UUID;
    itemID         : UUID;
    quantity       : Decimal(15,3);

    eventType   : String(30) not null;
    performedBy : String(100) not null;

    reason       : Association to MovementReasons;
    expectedDate : Date;

    notes : String(255);
}

@assert.unique.userId: [userId]
entity WarehouseUserAssignments : cuid, managed {
    userId   : String(255) not null;
    plant    : Association to Plants not null;
    isActive : Boolean default true;
}