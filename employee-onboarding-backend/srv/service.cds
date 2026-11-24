using { onboarding as db } from '../db/schema';

extend db.OnboardingCases with {
  virtual completionPercentage : Decimal(5,2);
}
extend db.OnboardingTasks with {
  virtual isOverdue          : Boolean;
  virtual statusCriticality  : Integer;
}

@path     : '/odata/v4/onboarding'
@requires : 'authenticated-user'
service OnboardingService {

  
  type ChecklistItem {
    category    : String(20);    
    item        : String(200);
    isMandatory : Boolean;
    isDone      : Boolean;
    detail      : String(200);
  }

 

  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'HRCoordinator' }
  ]
  entity EmployeeTypes as projection on db.EmployeeTypes;

  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'HRCoordinator' }
  ]
  entity Departments as projection on db.Departments;

  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'HRCoordinator' }
  ]
  entity Locations as projection on db.Locations;

  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'HRCoordinator' }
  ]
  entity DocumentTypes as projection on db.DocumentTypes;

  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'HRCoordinator' }
  ]
  entity CompanyPolicies as projection on db.CompanyPolicies;

  @restrict: [
    { grant: 'READ', to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'HRCoordinator' }
  ]
  entity TaskTypes as projection on db.TaskTypes;

  
  @restrict: [
    { grant: 'READ', to: ['HRCoordinator','HiringManager'] },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'HRCoordinator' }
  ]
  entity OnboardingTemplates as projection on db.OnboardingTemplates;

  @restrict: [
    { grant: 'READ', to: ['HRCoordinator','HiringManager'] },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'HRCoordinator' }
  ]
  entity OnboardingTemplateTasks as projection on db.OnboardingTemplateTasks;

  @restrict: [
    { grant: 'READ', to: ['HRCoordinator','HiringManager'] },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'HRCoordinator' }
  ]
  entity OnboardingTemplateDocuments as projection on db.OnboardingTemplateDocuments;

  

  @restrict: [
    { grant: 'READ', to: ['HRCoordinator','ITSupport','FacilitiesCoordinator'] },
    { grant: 'READ', to: 'HiringManager', where: 'reportingManager.email = $user' },
    { grant: 'READ', to: 'NewEmployee',   where: 'email = $user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'HRCoordinator' },
    { grant: 'UPDATE', to: 'NewEmployee', where: 'email = $user' }
  ]
  entity Employees as projection on db.Employees;

 

  @restrict: [
    { grant: 'READ', to: ['HRCoordinator','ITSupport','FacilitiesCoordinator'] },
    { grant: 'READ', to: 'HiringManager', where: 'employee.reportingManager.email = $user' },
    { grant: 'READ', to: 'NewEmployee',   where: 'employee.email = $user' },
    { grant: ['CREATE','UPDATE'], to: 'HRCoordinator' },
    { grant: ['generateTasks','closeOnboarding','submitOnboarding','getCompletionChecklist'], to: 'HRCoordinator' },
    { grant: ['approveOnboardingCase','rejectOnboardingCase'], to: 'WorkflowCallback' }
  ]
  entity OnboardingCases as projection on db.OnboardingCases actions {
    action   submitOnboarding() returns OnboardingCases;
    action   generateTasks() returns many OnboardingTasks;
    action   closeOnboarding(remarks : String(500)) returns OnboardingCases;
    action   approveOnboardingCase(remarks : String(500)) returns OnboardingCases;
    action   rejectOnboardingCase(remarks : String(500)) returns OnboardingCases;
    function getCompletionChecklist() returns many ChecklistItem;
  };

  
  @restrict: [
    { grant: 'READ', to: 'HRCoordinator' },
    { grant: 'READ', to: 'HiringManager',         where: 'assignedRole = ''MANAGER'' and onboardingCase.employee.reportingManager.email = $user' },
    { grant: 'READ', to: 'ITSupport',             where: 'assignedRole = ''IT''' },
    { grant: 'READ', to: 'FacilitiesCoordinator', where: 'assignedRole = ''FACILITIES''' },
    { grant: 'READ', to: 'NewEmployee',           where: 'assignedRole = ''EMPLOYEE'' and onboardingCase.employee.email = $user' },
    { grant: ['CREATE','UPDATE'], to: 'HRCoordinator' },
    { grant: ['completeTask','returnTask'], to: ['HRCoordinator','HiringManager','ITSupport','FacilitiesCoordinator','NewEmployee'] },
    { grant: 'createEmailAccount', to: 'ITSupport' }
  ]
  entity OnboardingTasks as projection on db.OnboardingTasks actions {
    action completeTask(evidence : LargeString, remarks : String(500)) returns OnboardingTasks;
    action returnTask(remarks : String(500))                           returns OnboardingTasks;
    action createEmailAccount(emailAddress : String(120), remarks : String(500)) returns OnboardingTasks;
  };

  @restrict: [
    { grant: 'READ', to: ['HRCoordinator','HiringManager','ITSupport','FacilitiesCoordinator'] },
    { grant: 'READ', to: 'NewEmployee', where: 'onboardingCase.employee.email = $user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'HRCoordinator' }
  ]
  entity TaskDependencies as projection on db.TaskDependencies;

  @restrict: [
    { grant: 'READ', to: ['HRCoordinator','HiringManager','ITSupport','FacilitiesCoordinator'] },
    { grant: 'READ', to: 'NewEmployee', where: 'task.onboardingCase.employee.email = $user' }
  ]
  entity TaskStatusHistory as projection on db.TaskStatusHistory;


  @restrict: [
    { grant: 'READ', to: ['HRCoordinator','DocumentViewer'] },
    { grant: 'READ', to: 'NewEmployee', where: 'onboardingCase.employee.email = $user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'HRCoordinator' },
    { grant: 'submitDocument', to: ['HRCoordinator','NewEmployee'] },
    { grant: 'verifyDocument', to: 'HRCoordinator' }
  ]
  entity EmployeeDocuments as projection on db.EmployeeDocuments actions {
    action submitDocument(documentName : String(120), documentId : String(150), documentUrl : String(500)) returns EmployeeDocuments;
    action verifyDocument(approved : Boolean)                                                             returns EmployeeDocuments;
  };

  @restrict: [
    { grant: ['READ','DELETE'], to: 'HRCoordinator' },
    { grant: 'READ', to: 'NewEmployee', where: 'employee.email = $user' },
    { grant: ['CREATE'], to: 'HRCoordinator' },
    { grant: 'acknowledgePolicy', to: 'NewEmployee' }
  ]
  entity PolicyAcknowledgements as projection on db.PolicyAcknowledgements actions {
    action acknowledgePolicy() returns PolicyAcknowledgements;
  };


  @restrict: [
    { grant: 'READ',             to: ['HRCoordinator','ITSupport','FacilitiesCoordinator'] },
    { grant: ['CREATE','UPDATE'], to: ['ITSupport','FacilitiesCoordinator'] }
  ]
  entity CompanyAssets as projection on db.CompanyAssets;

  
  @restrict: [
    { grant: 'READ', to: ['HRCoordinator','ITSupport','FacilitiesCoordinator'] },
    { grant: 'READ', to: 'NewEmployee', where: 'employee.email = $user' },
    { grant: 'returnAsset', to: ['ITSupport','FacilitiesCoordinator'] }
  ]
  entity AssetAssignments as projection on db.AssetAssignments actions {
    action returnAsset(returnedTo : String(120), assetCondition : String(30), remarks : String(500)) returns AssetAssignments;
  };

  @restrict: [
    { grant: 'READ', to: ['HRCoordinator','ITSupport','FacilitiesCoordinator'] },
    { grant: 'READ', to: 'NewEmployee', where: 'assignment.employee.email = $user' }
  ]
  entity AssetAssignmentHistory as projection on db.AssetAssignmentHistory;

 

  @cds.redirection.target: false
  @restrict: [ { grant: 'READ', to: 'HRCoordinator' } ]
  entity JoinersByDate as select from db.Employees {
    key joiningDate,
        count(*) as joiners : Integer
  } group by joiningDate;

  @requires: 'HRCoordinator'
  action createOnboardingCase(employee : UUID, template : UUID, startDate : Date, initiatedBy : String(120)) returns OnboardingCases;

  @requires: ['ITSupport','FacilitiesCoordinator']
  action assignAsset(employee : UUID, asset : UUID, onboardingCase : UUID, expectedReturnDate : Date, issueCondition : String(30), remarks : String(500)) returns AssetAssignments;

  @requires: ['HRCoordinator','system-user']
  action escalateOverdueTasks() returns Integer;


  event TaskAssigned {
    taskID : UUID; taskName : String; assignedRole : String; dueDate : Date; caseNumber : String;
  }
  event TaskOverdue {
    taskID : UUID; taskName : String; assignedRole : String; assignedTo : String; dueDate : Date;
  }
}

annotate OnboardingService.OnboardingCases with {
  status             @readonly;
  completionDate     @readonly;
  submittedBy        @readonly;
  submittedAt        @readonly;
  approvedBy         @readonly;
  approvedAt         @readonly;
  rejectedBy         @readonly;
  rejectedAt         @readonly;
  rejectionReason    @readonly;
  workflowInstanceId @readonly;
};

annotate OnboardingService.OnboardingTasks with {
  status         @readonly;
  completionDate @readonly;
};

annotate OnboardingService.EmployeeDocuments with {
  verificationStatus @readonly;
  verifiedBy         @readonly;
  verifiedAt         @readonly;
  uploadDate         @readonly;
};

annotate OnboardingService.PolicyAcknowledgements with {
  acknowledged   @readonly;
  acknowledgedAt @readonly;
};

annotate OnboardingService.AssetAssignments with {
  assignedDate     @readonly;
  assignmentStatus @readonly;
  assignedBy       @readonly;
  returnDate       @readonly;
  returnedTo       @readonly;
  issueCondition   @readonly;
  returnCondition  @readonly;
};

annotate OnboardingService.Employees with {
  companyEmail   @readonly;
  emailCreatedBy @readonly;
  emailCreatedAt @readonly;
};