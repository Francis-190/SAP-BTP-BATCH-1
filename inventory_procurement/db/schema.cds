namespace mobis.db;

using {
  cuid,
  managed
} from '@sap/cds/common';

type PartCategory : String enum {
  BRAKE_PADS;
  OIL_FILTER;
  AIR_FILTER;
  FUEL_FILTER;
  SPARK_PLUG;
  WIPER_BLADE;
  HEADLAMP_ASSEMBLY;
  TAILLAMP_ASSEMBLY;
  SENSOR;
  BATTERY_COMPONENT;
  ELECTRONIC_CONTROL_UNIT;
  SUSPENSION_COMPONENT;
  STEERING_COMPONENT;
};

entity SpareParts : cuid, managed {
  partNumber        : String(30)   @mandatory  @assert.unique;
  description       : String(100)  @mandatory;
  category          : PartCategory @mandatory;
  uom               : String(10) default 'EA';
  unitPrice         : Decimal(15, 2);
  reorderLevel      : Integer default 0; // global default reorder level
  safetyStock       : Integer default 0; // buffer never to be issued below
  isActive          : Boolean default true;
  preferredSupplier : Association to Suppliers;
  inventory         : Association to many Inventory
                        on inventory.part = $self;
}

entity Suppliers : cuid, managed {
  supplierCode : String(20)  @mandatory  @assert.unique;
  name         : String(100) @mandatory;
  email        : String(100);
  phone        : String(20);
  rating       : Decimal(2, 1); 
  leadTimeDays : Integer default 7;
  isEligible   : Boolean default true; 
}

entity SupplierParts : cuid, managed {
  supplier     : Association to Suppliers  @mandatory;
  part         : Association to SpareParts @mandatory;
  unitPrice    : Decimal(15, 2);   // agreed price for this supplier
  leadTimeDays : Integer;
  isActive     : Boolean default true;
}
entity Locations : cuid, managed {
  locationCode : String(20)  @mandatory  @assert.unique;
  name         : String(100) @mandatory;

  @mandatory
  type         : String(20) enum {
    WAREHOUSE;
    SERVICE_CENTER;
    DEALER
  };
  city         : String(50);
  region       : String(50);
  isActive     : Boolean default true;
}

entity Inventory : managed {
  key part           : Association to SpareParts;
  key location       : Association to Locations;
      quantityOnHand : Integer default 0;
      reorderLevel   : Integer; 
      lastMovementAt : Timestamp;
}


entity StockMovements : cuid, managed {
  @mandatory
  movementType : String(20) enum {
    ISSUE;
    TRANSFER;
    RECEIPT;
    ADJUSTMENT
  };
  part         : Association to SpareParts @mandatory;
  fromLocation : Association to Locations; 
  toLocation   : Association to Locations; 
  quantity     : Integer                   @mandatory;
  reference    : String(50);
  remarks      : String(200);
  status       : String(20) enum {
    POSTED;
    FAILED;
    REVERSED
  } default 'POSTED';
}

entity PurchaseRequisitions : cuid, managed {
  prNumber        : String(20) @assert.unique;
  location        : Association to Locations @mandatory;
 status          : String(20) enum {
    DRAFT;
    SUBMITTED;
    PENDING_APPROVAL;
    APPROVED;
    REJECTED;
    CLOSED
  } default 'DRAFT';
  requestedBy     : String(100);
  approvedBy      : String(100);
  approvedAt      : Timestamp;
  rejectionReason : String(200);
  items           : Composition of many PurchaseRequisitionItems
                      on items.pr = $self;
}

entity PurchaseRequisitionItems : cuid {
  pr             : Association to PurchaseRequisitions;
  part           : Association to SpareParts @mandatory;
  requiredQty    : Integer                   @mandatory;
  supplier       : Association to Suppliers;
  estimatedPrice : Decimal(15, 2);
}

entity PurchaseOrders : cuid, managed {
  poNumber : String(20);
  supplier : Association to Suppliers @mandatory;
  pr       : Association to PurchaseRequisitions;
  status   : String(20) enum {
    CREATED;
    SENT;
    PARTIALLY_RECEIVED;
    RECEIVED;
    CLOSED;
    CANCELLED
  } default 'CREATED';
  s4POId   : String(20); // correlation ID once mirrored into S/4HANA
  items    : Composition of many PurchaseOrderItems
               on items.po = $self;
}

entity PurchaseOrderItems : cuid {
  po          : Association to PurchaseOrders;
  part        : Association to SpareParts @mandatory;
  orderedQty  : Integer                   @mandatory;
  receivedQty : Integer default 0;
  unitPrice   : Decimal(15, 2);
}

entity GoodsReceipts : cuid, managed {
  grNumber   : String(20);
  po         : Association to PurchaseOrders @mandatory;
  location   : Association to Locations      @mandatory;
  receivedBy : String(100);
  items      : Composition of many GoodsReceiptItems
                 on items.gr = $self;
}

entity GoodsReceiptItems : cuid {
  gr          : Association to GoodsReceipts;
  poItem      : Association to PurchaseOrderItems @mandatory;
  receivedQty : Integer                           @mandatory;
}

entity AlertNotifications : cuid, managed {
  @mandatory
  alertType  : String(30) enum {
    LOW_STOCK;
    GR_FAILURE;
    PR_APPROVAL_PENDING
  };
  part       : Association to SpareParts;
  location   : Association to Locations;
  message    : String(255);
  severity   : String(10) enum {
    LOW;
    MEDIUM;
    HIGH
  } default 'MEDIUM';
  isResolved : Boolean default false;
}

entity ApplicationLogs : cuid {
  timestamp : Timestamp @cds.on.insert: $now;
  layer     : String(30); // e.g. 'InventoryService', 'ProcurementService'
  operation : String(50); // e.g. 'issueStock', 'postGoodsReceipt'
  message   : String(1000);

  @mandatory
  severity  : String(10) enum {
    INFO;
    WARNING;
    ERROR
  };
}


entity StockTransferRequests : cuid, managed {
  part            : Association to one SpareParts;
  fromLocation    : Association to one Locations;
  toLocation      : Association to one Locations;
  quantity        : Integer;
  status          : String(20) default 'PENDING';
  requestedBy     : String(255);
  approvedBy      : String(255);
  approvedAt      : Timestamp;
  rejectionReason : String(500);
  completedAt     : Timestamp;
}


entity ServicePartIssues : cuid, managed {
  serviceCenter             : Association to ServiceCenters @mandatory; 
  warehouse                 : Association to Locations      @mandatory; 
  part                      : Association to SpareParts     @mandatory;
  issuedQuantity            : Integer                       @mandatory;
  consumedQuantity          : Integer default 0;
  unusedReturnedQuantity    : Integer default 0;
  defectiveReturnedQuantity : Integer default 0;
  status                    : String(20) enum {
    ISSUED;
    RECONCILED
  } default 'ISSUED';
  issueDate                 : Timestamp;
  reconciledDate            : Timestamp;
  remarks                   : String(200);
}

entity ServiceCenters : cuid, managed {
  serviceCenterCode : String(20)  @mandatory  @assert.unique;
  name              : String(100) @mandatory;
  city              : String(50);
  region            : String(50);
  contactPerson     : String(100);
  phone             : String(20);
  email             : String(100);
  isActive          : Boolean default true;
}
