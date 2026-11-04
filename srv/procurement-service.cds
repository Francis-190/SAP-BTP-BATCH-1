using mobis.db as db from '../db/schema';

@(path: '/procurement')
service ProcurementService {
  entity PurchaseRequisitions     as projection on db.PurchaseRequisitions;
  entity PurchaseRequisitionItems as projection on db.PurchaseRequisitionItems;
  entity PurchaseOrders           as projection on db.PurchaseOrders;
  entity PurchaseOrderItems       as projection on db.PurchaseOrderItems;
  entity GoodsReceipts            as projection on db.GoodsReceipts;
  entity GoodsReceiptItems        as projection on db.GoodsReceiptItems;
  entity Suppliers                as projection on db.Suppliers;
  entity AlertNotifications       as projection on db.AlertNotifications;
  entity SupplierParts            as projection on db.SupplierParts;


  action confirmPO(poID: UUID)                                  returns PurchaseOrders;
  action rejectPO(poID: UUID, reason: String)                   returns PurchaseOrders;
  action submitPR(prID: UUID)                                   returns PurchaseRequisitions;
  action sendForApproval(prID: UUID)                            returns PurchaseRequisitions;
  action approvePR(prID: UUID, approver: String)                returns PurchaseRequisitions;
  action rejectPR(prID: UUID, approver: String, reason: String) returns PurchaseRequisitions;
  action resubmitPR(prID: UUID)                                 returns PurchaseRequisitions;
  action closePR(prID: UUID)                                    returns PurchaseRequisitions;
  action runApprovalJob()                                       returns {
    processed : Integer;
    failed    : Integer
  };
  action createPOFromPR(prID: UUID)                             returns array of PurchaseOrders;
  action sendPOToSupplier(poID: UUID)                           returns PurchaseOrders; 
  action supplierConfirmPO(poID: UUID)                          returns PurchaseOrders; 
  action supplierRejectPO(poID: UUID, reason: String)           returns PurchaseOrders;
  action postGoodsReceipt(poID: UUID,
                          locationID: UUID,
                          receivedBy: String,
                          items: array of {
    poItemID    : UUID;
    receivedQty : Integer
  })                                                            returns GoodsReceipts;

  action resolveAlert(alertID: UUID)                            returns AlertNotifications;

  // AI
  type ChatMessage {
    role    : String(10);
    content : LargeString;
  }
  type ChatResult {
    reply         : LargeString;
    actionName    : String(40);
    actionParams  : LargeString;
    actionSummary : String(300);
  }
  action chat(messages: array of ChatMessage)                   returns ChatResult;


}
