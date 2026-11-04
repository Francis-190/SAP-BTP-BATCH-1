using mobis.db as db from '../db/schema';
 service InventoryService @(path: '/inventory') {
  entity SpareParts as projection on db.SpareParts;
  entity Locations  as projection on db.Locations;
 entity Inventory as projection on db.Inventory
    actions {
        action raisePurchaseRequisition(quantity: Integer) returns String;
    };
 
  @restrict: [
    { grant: 'READ', to: ['WarehouseExecutive','ProcurementOfficer'] }
  ]
  @readonly
  entity StockMovements as projection on db.StockMovements;
 
  @restrict: [
    { grant: 'READ', to: ['WarehouseExecutive','ProcurementOfficer'] }
  ]
  @readonly
  entity AlertNotifications as projection on db.AlertNotifications;
 
entity StockTransferRequests as projection on db.StockTransferRequests  actions {
       action  approveStockTransferRequest() returns String;
       action rejectStockTransferRequest() returns String;
       //action triggerApproval() returns StockTransferRequests;
    }
 
  @restrict: [{ grant: 'issueStock', to: 'WarehouseExecutive' }]
  action issueStock(partID: UUID,locationID : UUID,quantity : Integer,reference : String, serviceCenterID : UUID) returns StockMovements;
 
  @restrict: [{ grant: 'transferStock', to: 'WarehouseExecutive' }]
  action transferStock(partID:UUID,fromLocationID:UUID,toLocationID:UUID,quantity:Integer,reference:String)returns StockMovements;
 
  @restrict: [{ grant: 'getAvailableStock', to: ['WarehouseExecutive','ProcurementOfficer'] }]
  function getAvailableStock(partID: UUID, locationID: UUID) returns Integer;
 
  action generateDailyInventorySummary() returns String;
 
  @readonly
entity PurchaseRequisitions as projection on db.PurchaseRequisitions;
 
  @restrict: [
    { grant: 'READ', to: ['WarehouseExecutive','ProcurementOfficer'] }
  ]
  @readonly
  entity ServicePartIssues as projection on db.ServicePartIssues;
 
  @restrict: [{ grant: 'reconcileServiceIssue', to: 'WarehouseExecutive' }]
  action reconcileServiceIssue(
    issueID                   : UUID,
    consumedQuantity          : Integer,
    unusedReturnedQuantity    : Integer,
    defectiveReturnedQuantity : Integer
  ) returns ServicePartIssues;
 
  @restrict: [
    { grant: 'READ', to: ['WarehouseExecutive','ProcurementOfficer'] },
    { grant: ['CREATE','UPDATE'], to: 'WarehouseExecutive' }
  ]
  entity ServiceCenters as projection on db.ServiceCenters;
 
  @readonly
entity ApplicationLogs as projection on db.ApplicationLogs;
}