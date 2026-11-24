using { pr } from '../db/schema';


@impl : './requisition.js'
service RequisitionService @(requires: 'authenticated-user') {

  @restrict: [{ grant: 'READ', to:  ['Requester','Manager','Finance','Procurement','Admin'] }]
  @readonly
  entity Materials as projection on pr.Material;

    @restrict: [
    { grant: 'CREATE', to: 'Requester' },
    { grant: ['READ','UPDATE','DELETE'], to: 'Requester', where: 'requester = $user' },
    { grant: 'READ', to: ['Manager','Finance','Procurement','Admin','WorkflowCallback'] },
    { grant: ['submitForApproval','cancel'], to: 'Requester', where: 'requester = $user' },
    { grant: ['approve','reject','returnForCorrection'], to: ['Manager','Finance'] },
    { grant: ['release','retryHandoff'], to: 'Procurement' },
    { grant: ['submitForApproval','approve','reject','returnForCorrection'], to: 'WorkflowCallback' }
  ]
  @cds.redirection.target
  entity Requisitions as projection on pr.PurchaseRequisition
  actions {
    action submitForApproval()                    returns Requisitions;
    action approve(comment : String)              returns Requisitions;
    action reject(comment : String)               returns Requisitions;
    action returnForCorrection(comment : String)  returns Requisitions;
    action cancel(reason : String)                returns Requisitions;
    action release()                              returns Requisitions;
    action retryHandoff()                         returns Requisitions;
  };

  @restrict: [
    { grant: 'CREATE', to: 'Requester' },
    { grant: ['READ','UPDATE','DELETE'], to: 'Requester', where: 'requisition.requester = $user' },
    { grant: 'READ', to: ['Manager','Finance','Procurement','Admin'] }
  ]
  entity RequisitionItems as projection on pr.RequisitionItem;

  @restrict: [
    { grant: 'CREATE', to: 'Requester' },
    { grant: ['READ','UPDATE','DELETE'], to: 'Requester', where: 'requisition.requester = $user' },
    { grant: 'READ', to: ['Manager','Finance','Procurement','Admin'] }
  ]
  entity Attachments as projection on pr.Attachment;

  @restrict: [
    { grant: 'READ', to: 'Requester', where: 'requisition.requester = $user' },
    { grant: 'READ', to: ['Manager','Finance','Procurement','Admin'] }
  ]
  entity ApprovalDecisions as projection on pr.ApprovalDecision;

  @restrict: [
    { grant: 'READ', to: 'Requester', where: 'requisition.requester = $user' },
    { grant: 'READ', to: ['Manager','Finance','Procurement','Admin'] }
  ]
  @cds.redirection.target
  entity ApprovalTasks as projection on pr.ApprovalTask;

  @restrict: [
    { grant: 'READ', to: 'Requester', where: 'requisition.requester = $user' },
    { grant: 'READ', to: ['Procurement','Admin'] }
  ]
  entity ERPReferences as projection on pr.ERPReference;

  @restrict: [{ grant: 'READ', to: ['Requester','Manager','Finance','Procurement','Admin'] }]
  entity CostCentres as projection on pr.CostCentre;

  @restrict: [{ grant: 'READ', to: ['Requester','Manager','Finance','Procurement','Admin'] }]
  entity PurchaseCategories as projection on pr.PurchaseCategory;

  @restrict: [{ grant: 'READ', to: ['Manager','Finance'] }]
  entity MyTasks as projection on pr.ApprovalTask {
    *,
    requisition.reqNumber   as reqNumber,
    requisition.title       as title,
    requisition.requester   as requester,
    requisition.totalAmount as totalAmount,
    requisition.currency    as currency
  } where assignedTo = $user
      and state = 'Open'
      and stepNo = requisition.currentStep;

  
  
    @restrict: [
    { grant: 'READ', to: ['Manager','Finance'] },
    { grant: ['approve','reject','returnForCorrection'], to: ['Manager','Finance'] }
  ]
  @readonly
  entity ApprovalInbox as projection on pr.ApprovalTask {
    *,
    requisition.reqNumber        as reqNumber,
    requisition.title            as title,
    requisition.justification    as justification,
    requisition.requester        as requester,
    requisition.costCentre       as costCentre,
    requisition.category         as category,
    requisition.projectRef       as projectRef,
    requisition.deliveryLocation as deliveryLocation,
    requisition.currency         as currency,
    requisition.netAmount        as netAmount,
    requisition.taxAmount        as taxAmount,
    requisition.totalAmount      as totalAmount,
    requisition.status           as status,
    requisition.currentStep      as currentStep,
    requisition.createdAt        as createdAt,
    case when state = 'Open'
          and stepNo = requisition.currentStep
          and requisition.status = 'InApproval'
         then true else false end as isActionable : Boolean,
    case state
      when 'Done' then 3
      when 'Open' then 2
      else 0
    end as taskCriticality : Integer
  } where assignedTo = $user and state <> 'Cancelled'
  actions {
    action approve(comment : String)             returns ApprovalInbox;
    action reject(comment : String)              returns ApprovalInbox;
    action returnForCorrection(comment : String) returns ApprovalInbox;
  };

  @restrict: [
    { grant: 'READ', to: ['Procurement','Admin'] },
    { grant: ['releaseToErp','retryErpHandoff'], to: 'Procurement' }
    ]
  entity ProcurementQueue as projection on pr.PurchaseRequisition {
    key ID,
    reqNumber,
    title,
    requester,
    totalAmount,
    currency,
    status,
    erpReference.poNumber          as poNumber,
    erpReference.publicationStatus as publicationStatus,
    erpReference.attempts          as attempts,
    erpReference.lastError         as lastError
  } where status in ('Approved', 'Published', 'Failed')
  actions {
    action releaseToErp()     returns ProcurementQueue;
    action retryErpHandoff()  returns ProcurementQueue;
  };
}


@impl : './admin.js'
service AdminService @(requires: 'Admin') {
  entity CostCentres        as projection on pr.CostCentre;
  entity PurchaseCategories as projection on pr.PurchaseCategory;
  entity ApprovalMatrix     as projection on pr.ApprovalMatrix;
  entity Materials as projection on pr.Material;
}