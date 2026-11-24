namespace onboarding;

using { cuid, managed } from '@sap/cds/common';

entity EmployeeTypes : cuid, managed {
    code        : String(30);
    name        : String(80);
    isActive    : Boolean default true;
}


entity Departments : cuid, managed {
    code        : String(30);
    name        : String(80);
    description : String(250);
}

entity Locations : cuid, managed {
    code        : String(30);
    name        : String(100);
    address     : String(300);
    city        : String(80);
    country     : String(80);
}

entity DocumentTypes : cuid, managed {
    code        : String(30);
    name        : String(100);
    description : String(300);
    isActive    : Boolean default true;
}


entity CompanyPolicies : cuid, managed {
    policyCode  : String(30);
    policyName  : String(120);
    version     : String(30);
    description : String(500);
    isActive    : Boolean default true;
}

entity Employees : cuid, managed {
    firstName        : String(50);
    lastName         : String(50);
    email            : String(120);      
    phone            : String(20);

    companyEmail     : String(120);      
    emailCreatedBy   : String(120);    
    emailCreatedAt   : Timestamp;       

    jobRole          : String(100);
    joiningDate      : Date;

    employeeType     : Association to EmployeeTypes;
    department       : Association to Departments;
    location         : Association to Locations;

    reportingManager : Association to Employees;

    onboardingCases  : Association to many OnboardingCases
        on onboardingCases.employee = $self;

    assetAssignments : Association to many AssetAssignments
        on assetAssignments.employee = $self;
}

entity TaskTypes : cuid, managed {
    code            : String(30);
    taskName        : String(100);
    description     : String(500);
    defaultRole     : String(50);
    isActive        : Boolean default true;
}

entity OnboardingTemplates : cuid, managed {
    templateName    : String(100);
    description     : String(500);
    isActive        : Boolean default true;

    employeeType    : Association to EmployeeTypes;
    department      : Association to Departments;
    location        : Association to Locations;

    templateTasks : Composition of many OnboardingTemplateTasks
        on templateTasks.template = $self;

    requiredDocuments : Composition of many OnboardingTemplateDocuments
        on requiredDocuments.template = $self;
}


entity OnboardingTemplateTasks : cuid, managed {
    sequenceNumber  : Integer;
    isMandatory     : Boolean default true;
    dueDays         : Integer;
    assignedRole    : String(50);

    template        : Association to OnboardingTemplates;
    taskType        : Association to TaskTypes;
}


entity OnboardingTemplateDocuments : cuid, managed {
    isMandatory     : Boolean default true;

    template        : Association to OnboardingTemplates;
    documentType    : Association to DocumentTypes;
}

entity OnboardingCases : cuid, managed {
    caseNumber         : String(30);
    status             : String(30);
    startDate          : Date;
    completionDate     : Timestamp;
    initiatedBy        : String(120);

    
    submittedBy        : String(120);
    submittedAt        : Timestamp;
    approvedBy         : String(120);
    approvedAt         : Timestamp;
    rejectedBy         : String(120);
    rejectedAt         : Timestamp;
    rejectionReason    : String(500);
    workflowInstanceId : String(100);

    employee        : Association to Employees;
    template        : Association to OnboardingTemplates;

    tasks : Composition of many OnboardingTasks
        on tasks.onboardingCase = $self;

    dependencies : Composition of many TaskDependencies
        on dependencies.onboardingCase = $self;

    documents : Composition of many EmployeeDocuments
        on documents.onboardingCase = $self;

    acknowledgements : Composition of many PolicyAcknowledgements
        on acknowledgements.onboardingCase = $self;
}

entity OnboardingTasks : cuid, managed {
    taskName        : String(100);
    description     : String(500);

    assignedRole    : String(50);
    assignedTo      : String(120);

    status          : String(30);
    priority        : String(20);

    isMandatory     : Boolean default true;

    dueDate         : Date;
    completionDate  : Timestamp;

    evidence        : LargeString;
    remarks         : String(500);

    onboardingCase  : Association to OnboardingCases;
    taskType        : Association to TaskTypes;

    history : Composition of many TaskStatusHistory
        on history.task = $self;
}


entity TaskDependencies : cuid, managed {
    task            : Association to OnboardingTasks;
    dependsOnTask   : Association to OnboardingTasks;

    onboardingCase  : Association to OnboardingCases;

    dependencyType  : String(30);
}

entity TaskStatusHistory : cuid, managed {
    oldStatus       : String(30);
    newStatus       : String(30);

    changedBy       : String(120);
    changedAt       : Timestamp;

    remarks         : String(500);

    task            : Association to OnboardingTasks;
}


entity EmployeeDocuments : cuid, managed {
    documentName    : String(120);

    documentId      : String(150);
    documentUrl     : String(500);

    uploadDate      : Timestamp;

    verificationStatus : String(30);
    verifiedBy      : String(120);
    verifiedAt      : Timestamp;

    onboardingCase  : Association to OnboardingCases;
    documentType    : Association to DocumentTypes;
}


entity PolicyAcknowledgements : cuid, managed {
    acknowledged    : Boolean default false;
    acknowledgedAt  : Timestamp;

    employee        : Association to Employees;
    onboardingCase  : Association to OnboardingCases;
    policy          : Association to CompanyPolicies;
}


entity CompanyAssets : cuid, managed {
    assetCode       : String(50);
    assetName       : String(100);
    assetType       : String(50);

    serialNumber    : String(100);
    assetStatus     : String(30);

    description     : String(300);

    assignments : Association to many AssetAssignments
        on assignments.asset = $self;
}

entity AssetAssignments : cuid, managed {
    assignedDate       : Date;
    expectedReturnDate : Date;
    returnDate         : Date;

    assignmentStatus   : String(30);     

    assignedBy         : String(120);
    returnedTo         : String(120);

    issueCondition     : String(30);    
    returnCondition    : String(30);   

    remarks            : String(500);

    employee        : Association to Employees;
    asset           : Association to CompanyAssets;
    onboardingCase  : Association to OnboardingCases;

    history : Composition of many AssetAssignmentHistory
        on history.assignment = $self;
}


entity AssetAssignmentHistory : cuid, managed {
    oldStatus       : String(30);
    newStatus       : String(30);

    changedBy       : String(120);
    changedAt       : Timestamp;

    remarks         : String(500);

    assignment      : Association to AssetAssignments;
}

