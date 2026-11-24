'use strict';

const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const cds = require('@sap/cds');
const LOG = cds.log('OnboardingService');
const { sendOverdueTaskAlerts } = require('./lib/notification.handler');

module.exports = cds.service.impl(async function () {

  const {
    Employees,
    Departments,
    Locations,
    OnboardingCases,
    OnboardingTemplates,
    OnboardingTemplateTasks,
    OnboardingTemplateDocuments,
    OnboardingTasks,
    TaskDependencies,
    TaskStatusHistory,
    TaskTypes,
    DocumentTypes,
    EmployeeDocuments,
    CompanyPolicies,
    PolicyAcknowledgements,
    CompanyAssets,
    AssetAssignments,
    AssetAssignmentHistory
  } = cds.entities('onboarding');

  const WORKFLOW_DEFINITION_ID = 'us10.3f4ffa21trial.employeeonboarding.employeeOnboardingApproval';
  const DESTINATION_NAME       = 'employonboard';
  const EMAIL_TASK_NAME        = 'Create Email and Directory Account';

  const ROLE_SCOPE = {
    HR        : 'HRCoordinator',
    MANAGER   : 'HiringManager',
    IT        : 'ITSupport',
    FACILITIES: 'FacilitiesCoordinator',
    EMPLOYEE  : 'NewEmployee'
  };

  const ROLE_ALIAS = {
    HR: 'HR', HRCOORDINATOR: 'HR',
    MANAGER: 'MANAGER', HIRINGMANAGER: 'MANAGER',
    IT: 'IT', ITSUPPORT: 'IT',
    FACILITIES: 'FACILITIES', FACILITIESCOORDINATOR: 'FACILITIES',
    EMPLOYEE: 'EMPLOYEE', NEWEMPLOYEE: 'EMPLOYEE'
  };
  const canonRole = (r) => {
    const k = String(r || '').toUpperCase().replace(/[^A-Z]/g, '');
    return ROLE_ALIAS[k] || k;
  };

  const nowIso = () => new Date().toISOString();
  const today  = () => nowIso().slice(0, 10);
  const lower  = (s) => String(s || '').toLowerCase();

  const addDays = (date, days) => {
    const d = new Date(date || today());
    d.setUTCDate(d.getUTCDate() + (days || 0));
    return d.toISOString().slice(0, 10);
  };

  const isHR = (req) => req.user.is('HRCoordinator');

  const writeTaskHistory = async (taskId, oldStatus, newStatus, user, remarks) => {
    await INSERT.into(TaskStatusHistory).entries({
      ID       : cds.utils.uuid(),
      task_ID  : taskId,
      oldStatus: oldStatus,
      newStatus: newStatus,
      changedBy: user,
      changedAt: nowIso(),
      remarks  : remarks
    });
  };

  const writeAssignmentHistory = async (assignmentId, oldStatus, newStatus, user, remarks) => {
    await INSERT.into(AssetAssignmentHistory).entries({
      ID           : cds.utils.uuid(),
      assignment_ID: assignmentId,
      oldStatus    : oldStatus,
      newStatus    : newStatus,
      changedBy    : user,
      changedAt    : nowIso(),
      remarks      : remarks
    });
  };


  const nextCaseNumber = async () => {
    const year = new Date().getUTCFullYear();
    const rows = await SELECT.from(OnboardingCases)
      .columns('caseNumber')
      .where({ caseNumber: { like: `ONB-${year}-%` } });
    const max = rows.reduce((m, r) => {
      const n = parseInt(String(r.caseNumber).split('-').pop(), 10);
      return Number.isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `ONB-${year}-${String(max + 1).padStart(5, '0')}`;
  };

  const resolveTemplate = async (employee) => {
    const templates = await SELECT.from(OnboardingTemplates).where({ isActive: true });
    let best = null;
    let bestScore = -1;

    for (const t of templates) {
      let score   = 0;
      let matched = true;
      for (const field of ['employeeType_ID', 'department_ID', 'location_ID']) {
        if (t[field]) {
          if (t[field] === employee[field]) score++;
          else { matched = false; break; }
        }
      }
      if (matched && score > bestScore) { best = t; bestScore = score; }
    }
    return best;
  };

  const checkTaskAccess = async (req, task) => {
    if (isHR(req)) return null;

    const role  = canonRole(task.assignedRole);
    const scope = ROLE_SCOPE[role];
    if (!scope || !req.user.is(scope))
      return [403, `This task is assigned to role ${task.assignedRole}.`];

    if (role === 'EMPLOYEE' || role === 'MANAGER') {
      const c   = await SELECT.one.from(OnboardingCases).columns('employee_ID').where({ ID: task.onboardingCase_ID });
      const emp = c ? await SELECT.one.from(Employees).columns('email', 'reportingManager_ID').where({ ID: c.employee_ID }) : null;
      if (!emp) return [404, 'Employee not found for this task.'];

      if (role === 'EMPLOYEE' && lower(emp.email) !== lower(req.user.id))
        return [403, 'You can only work on your own onboarding tasks.'];

      if (role === 'MANAGER') {
        const mgr = emp.reportingManager_ID
          ? await SELECT.one.from(Employees).columns('email').where({ ID: emp.reportingManager_ID })
          : null;
        if (!mgr || lower(mgr.email) !== lower(req.user.id))
          return [403, 'You are not the reporting manager of this employee.'];
      }
    }
    return null;
  };

  
  const generateTasksFor = async (caseId, user) => {
    const onbCase = await SELECT.one.from(OnboardingCases).where({ ID: caseId });
    if (!onbCase)
      return { error: [404, `Onboarding case ${caseId} not found.`] };
    if (onbCase.status === 'Completed')
      return { error: [409, 'Onboarding case is already completed.'] };
    if (!onbCase.template_ID)
      return { error: [422, 'Onboarding case has no template assigned.'] };

    const existing = await SELECT.one.from(OnboardingTasks).columns('ID').where({ onboardingCase_ID: caseId });
    if (existing)
      return { error: [409, 'Tasks have already been generated for this case.'] };

    const employee = await SELECT.one.from(Employees).where({ ID: onbCase.employee_ID });
    const baseDate = onbCase.startDate || (employee && employee.joiningDate) || today();

    const templateTasks = await SELECT.from(OnboardingTemplateTasks)
      .where({ template_ID: onbCase.template_ID })
      .orderBy({ sequenceNumber: 'asc' });
    if (templateTasks.length === 0)
      return { error: [422, 'The selected template has no tasks defined.'] };

    const typeIds = [...new Set(templateTasks.map(t => t.taskType_ID).filter(Boolean))];
    const types   = typeIds.length > 0
      ? await SELECT.from(TaskTypes).where({ ID: { in: typeIds } })
      : [];
    const typeMap = {};
    for (const t of types) typeMap[t.ID] = t;

    const tasks        = [];
    const dependencies = [];
    const history      = [];
    const lastByRole   = {};

    for (const tt of templateTasks) {
      const type   = typeMap[tt.taskType_ID] || {};
      const role   = canonRole(tt.assignedRole || type.defaultRole) || 'HR';
      const taskId = cds.utils.uuid();

      tasks.push({
        ID               : taskId,
        taskName         : type.taskName || `Task ${tt.sequenceNumber}`,
        description      : type.description,
        assignedRole     : role,
        status           : 'Open',
        priority         : tt.isMandatory === false ? 'Medium' : 'High',
        isMandatory      : tt.isMandatory !== false,
        dueDate          : addDays(baseDate, tt.dueDays),
        onboardingCase_ID: caseId,
        taskType_ID      : tt.taskType_ID
      });

      if (lastByRole[role]) {
        dependencies.push({
          ID               : cds.utils.uuid(),
          task_ID          : taskId,
          dependsOnTask_ID : lastByRole[role],
          onboardingCase_ID: caseId,
          dependencyType   : 'FinishToStart'
        });
      }
      lastByRole[role] = taskId;

      history.push({
        ID       : cds.utils.uuid(),
        task_ID  : taskId,
        oldStatus: null,
        newStatus: 'Open',
        changedBy: user,
        changedAt: nowIso(),
        remarks  : 'Generated from template'
      });
    }

    await INSERT.into(OnboardingTasks).entries(tasks);
    if (dependencies.length > 0) await INSERT.into(TaskDependencies).entries(dependencies);
    await INSERT.into(TaskStatusHistory).entries(history);

    const templateDocs = await SELECT.from(OnboardingTemplateDocuments).where({ template_ID: onbCase.template_ID });
    if (templateDocs.length > 0) {
      const docTypes = await SELECT.from(DocumentTypes)
        .where({ ID: { in: templateDocs.map(d => d.documentType_ID).filter(Boolean) } });
      const docTypeMap = {};
      for (const d of docTypes) docTypeMap[d.ID] = d;

      await INSERT.into(EmployeeDocuments).entries(templateDocs.map(d => ({
        ID                : cds.utils.uuid(),
        documentName      : (docTypeMap[d.documentType_ID] || {}).name,
        documentType_ID   : d.documentType_ID,
        onboardingCase_ID : caseId,
        verificationStatus: 'Pending'
      })));
    }

    const policies = await SELECT.from(CompanyPolicies).where({ isActive: true });
    if (policies.length > 0) {
      await INSERT.into(PolicyAcknowledgements).entries(policies.map(p => ({
        ID               : cds.utils.uuid(),
        employee_ID      : onbCase.employee_ID,
        onboardingCase_ID: caseId,
        policy_ID        : p.ID,
        acknowledged     : false
      })));
    }


    for (const t of tasks) {
      await this.emit('TaskAssigned', {
        taskID      : t.ID,
        taskName    : t.taskName,
        assignedRole: t.assignedRole,
        dueDate     : t.dueDate,
        caseNumber  : onbCase.caseNumber
      });
    }

    LOG.info(`Generated ${tasks.length} tasks for onboarding case ${onbCase.caseNumber}.`);
    return { count: tasks.length };
  };

  
  const buildChecklist = async (caseId) => {
    const onbCase = await SELECT.one.from(OnboardingCases).columns('ID', 'template_ID').where({ ID: caseId });
    if (!onbCase) return null;

    const items = [];

  
    const tasks = await SELECT.from(OnboardingTasks)
      .columns('taskName', 'assignedRole', 'status', 'isMandatory')
      .where({ onboardingCase_ID: caseId, status: { '!=': 'Cancelled' } });
    for (const t of tasks) {
      items.push({
        category   : 'Task',
        item       : t.taskName,
        isMandatory: t.isMandatory !== false,
        isDone     : t.status === 'Completed',
        detail     : `${t.assignedRole} - ${t.status}`
      });
    }

    
    const required = onbCase.template_ID
      ? await SELECT.from(OnboardingTemplateDocuments).where({ template_ID: onbCase.template_ID })
      : [];
    const mandatoryTypes = new Set(
      required.filter(r => r.isMandatory !== false).map(r => r.documentType_ID).filter(Boolean));

    const docs = await SELECT.from(EmployeeDocuments)
      .columns('documentName', 'documentType_ID', 'verificationStatus')
      .where({ onboardingCase_ID: caseId });
    for (const d of docs) {
      items.push({
        category   : 'Document',
        item       : d.documentName || 'Document',
        isMandatory: mandatoryTypes.has(d.documentType_ID),
        isDone     : d.verificationStatus === 'Verified',
        detail     : d.verificationStatus || 'Pending'
      });
    }
    const presentTypes   = new Set(docs.map(d => d.documentType_ID));
    const missingTypeIds = [...mandatoryTypes].filter(id => !presentTypes.has(id));
    if (missingTypeIds.length > 0) {
      const types = await SELECT.from(DocumentTypes).columns('ID', 'name').where({ ID: { in: missingTypeIds } });
      for (const ty of types) {
        items.push({
          category: 'Document', item: ty.name, isMandatory: true, isDone: false, detail: 'Not requested'
        });
      }
    }

   
    const acks = await SELECT.from(PolicyAcknowledgements)
      .columns('policy_ID', 'acknowledged')
      .where({ onboardingCase_ID: caseId });
    const policyIds = acks.map(a => a.policy_ID).filter(Boolean);
    const policies  = policyIds.length > 0
      ? await SELECT.from(CompanyPolicies).columns('ID', 'policyName').where({ ID: { in: policyIds } })
      : [];
    const policyName = Object.fromEntries(policies.map(p => [p.ID, p.policyName]));
    for (const a of acks) {
      items.push({
        category   : 'Policy',
        item       : policyName[a.policy_ID] || 'Policy',
        isMandatory: true,
        isDone     : !!a.acknowledged,
        detail     : a.acknowledged ? 'Acknowledged' : 'Pending'
      });
    }

   
    const assigned = await SELECT.from(AssetAssignments).columns('ID')
      .where({ onboardingCase_ID: caseId, assignmentStatus: 'ASSIGNED' });
    items.push({
      category   : 'Asset',
      item       : 'Assets issued to the employee',
      isMandatory: false,
      isDone     : assigned.length > 0,
      detail     : `${assigned.length} asset(s) assigned`
    });

    return items;
  };

 
  const completeTaskCore = async (req, taskId, { evidence, remarks }) => {
    const task = await SELECT.one.from(OnboardingTasks).where({ ID: taskId });
    if (!task) return { error: [404, `Task ${taskId} not found.`] };

    const accessError = await checkTaskAccess(req, task);
    if (accessError) return { error: accessError };

    const onbCase = await SELECT.one.from(OnboardingCases).columns('status', 'caseNumber')
      .where({ ID: task.onboardingCase_ID });
    if (onbCase && onbCase.status === 'Completed')
      return { error: [409, `Onboarding case ${onbCase.caseNumber} is already completed.`] };

    if (['Completed', 'Cancelled'].includes(task.status))
      return { error: [409, `Task is already ${task.status}.`] };

    const deps = await SELECT.from(TaskDependencies).where({ task_ID: taskId });
    const predecessorIds = deps.map(d => d.dependsOnTask_ID).filter(Boolean);
    if (predecessorIds.length > 0) {
      const predecessors = await SELECT.from(OnboardingTasks).columns('taskName', 'status')
        .where({ ID: { in: predecessorIds } });
      const blocking = predecessors.filter(p => p.status !== 'Completed');
      if (blocking.length > 0)
        return { error: [409, `Task is blocked by: ${blocking.map(p => p.taskName).join(', ')}`] };
    }

    const finalEvidence = evidence || task.evidence;
    if (task.isMandatory && !finalEvidence)
      return { error: [422, 'Evidence is required to complete a mandatory task.'] };

    await UPDATE(OnboardingTasks)
      .set({
        status        : 'Completed',
        completionDate: nowIso(),
        evidence      : finalEvidence,
        remarks       : remarks || task.remarks,
        assignedTo    : task.assignedTo || req.user.id
      })
      .where({ ID: taskId });

    await writeTaskHistory(taskId, task.status, 'Completed', req.user.id, remarks);
    return { task };
  };

 

  this.before(['CREATE', 'UPDATE'], 'Employees', async (req) => {
    const data = req.data;
    const selfId = data.ID ?? req.params[0]?.ID ?? req.params[0];

    if (data.email !== undefined) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
        return req.error(400, 'Invalid e-mail address.');

      const dup = await SELECT.one.from(Employees).columns('ID').where({ email: data.email });
      if (dup && dup.ID !== selfId)
        return req.error(409, `An employee with e-mail ${data.email} already exists.`);
    }

    if (data.reportingManager_ID && data.reportingManager_ID === selfId)
      return req.error(400, 'An employee cannot report to themselves.');

    if (!isHR(req)) {
      const forbidden = Object.keys(data).filter(k =>
        !['ID', 'firstName', 'lastName', 'phone'].includes(k) && !/^(created|modified)(At|By)$/.test(k));
      if (forbidden.length > 0)
        return req.error(403, `You may only change your personal details (not: ${forbidden.join(', ')}).`);
    }
  });



  this.before('CREATE', 'OnboardingCases', async (req) => {
    const data = req.data;

    if (!data.employee_ID)
      return req.error(422, 'Employee is required.');

    const employee = await SELECT.one.from(Employees).where({ ID: data.employee_ID });
    if (!employee)
      return req.error(404, 'Employee not found.');

    const openCase = await SELECT.one.from(OnboardingCases).columns('caseNumber')
      .where({ employee_ID: data.employee_ID, status: { '!=': 'Completed' } });
    if (openCase)
      return req.error(409, `Employee already has an open onboarding case (${openCase.caseNumber}).`);

    if (!data.template_ID) {
      const tpl = await resolveTemplate(employee);
      if (!tpl)
        return req.error(422, 'No active onboarding template matches the employee type, department and location.');
      data.template_ID = tpl.ID;
    }

    data.status      = 'DRAFT';
    data.caseNumber  = data.caseNumber || await nextCaseNumber();
    data.startDate   = data.startDate || employee.joiningDate;
    data.initiatedBy = data.initiatedBy || req.user.id;
 
  });

  this.before('UPDATE', 'OnboardingCases', async (req) => {
    const caseId = req.data.ID ?? req.params[0]?.ID ?? req.params[0];
    if (!caseId) return;

    const onbCase = await SELECT.one.from(OnboardingCases).columns('status', 'caseNumber').where({ ID: caseId });
    if (onbCase && onbCase.status === 'Completed')
      return req.error(409, `Onboarding case ${onbCase.caseNumber} is already completed.`);
  });

  this.on('createOnboardingCase', async (req) => {
    if (!isHR(req))
      return req.error(403, 'Only HR can create onboarding cases.');

    const { employee, template, startDate, initiatedBy } = req.data;
    if (!employee)
      return req.error(422, 'Employee is required.');

    const emp = await SELECT.one.from(Employees).where({ ID: employee });
    if (!emp)
      return req.error(404, `Employee ${employee} not found.`);

    const openCase = await SELECT.one.from(OnboardingCases).columns('caseNumber')
      .where({ employee_ID: employee, status: { '!=': 'Completed' } });
    if (openCase)
      return req.error(409, `Employee already has an open onboarding case (${openCase.caseNumber}).`);

    let tpl;
    if (template) {
      tpl = await SELECT.one.from(OnboardingTemplates).where({ ID: template });
      if (!tpl)
        return req.error(404, 'Template not found.');
      if (!tpl.isActive)
        return req.error(422, 'Template is not active.');
    } else {
      tpl = await resolveTemplate(emp);
      if (!tpl)
        return req.error(422, 'No active onboarding template matches the employee type, department and location.');
    }

    const caseId = cds.utils.uuid();
    await INSERT.into(OnboardingCases).entries({
      ID         : caseId,
      caseNumber : await nextCaseNumber(),
      status     : 'DRAFT',
      startDate  : startDate || emp.joiningDate || today(),
      initiatedBy: initiatedBy || req.user.id,
      employee_ID: employee,
      template_ID: tpl.ID
    });

 
    return await SELECT.one.from(OnboardingCases).where({ ID: caseId });
  });

  this.on('submitOnboarding', 'OnboardingCases', async (req) => {
    const caseId = req.params[0]?.ID ?? req.params[0];

    const onboardingCase = await SELECT.one.from(OnboardingCases).where({ ID: caseId });
    if (!onboardingCase)
      return req.reject(404, 'Onboarding case not found.');
    if (!['DRAFT', 'REJECTED'].includes(onboardingCase.status))
      return req.reject(409, `A case in status ${onboardingCase.status} cannot be submitted.`);

    const emp  = await SELECT.one.from(Employees).where({ ID: onboardingCase.employee_ID });
    const dept = emp?.department_ID
      ? await SELECT.one.from(Departments).columns('name').where({ ID: emp.department_ID })
      : null;
    const loc  = emp?.location_ID
      ? await SELECT.one.from(Locations).columns('name').where({ ID: emp.location_ID })
      : null;

    await UPDATE(OnboardingCases)
      .set({ status: 'SUBMITTED', submittedBy: req.user.id, submittedAt: nowIso() })
      .where({ ID: caseId });

    const payload = {
      definitionId: WORKFLOW_DEFINITION_ID,
      context: {
        caseid:       String(onboardingCase.ID),
        casenumber:   String(onboardingCase.caseNumber || ''),
        employeeid:   String(onboardingCase.employee_ID || ''),
        employeename: `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim(),
        department:   String(dept?.name || ''),
        location:     String(loc?.name || ''),
        startdate:    String(onboardingCase.startDate || ''),
        submittedby:  String(req.user.id || ''),
        reason:       ''
      }
    };

    LOG.info('Starting Onboarding BPA workflow', JSON.stringify(payload));

    try {
      const response = await executeHttpRequest(
        { destinationName: DESTINATION_NAME },
        {
          method : 'post',
          url    : '/workflow/rest/v1/workflow-instances',
          data   : payload,
          headers: { 'Content-Type': 'application/json' }
        },
        { fetchCsrfToken: false }
      );

      await UPDATE(OnboardingCases)
        .set({ workflowInstanceId: response.data?.id })
        .where({ ID: caseId });

    } catch (error) {
      const detail = error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;

      LOG.error('Onboarding BPA workflow failed:', error.message, error.response?.status, detail);

      return req.reject(
        400,
        `Could not start approval workflow (${error.response?.status || 'no response'}): ${detail}`.substring(0, 500)
      );
    }

    return await SELECT.one.from(OnboardingCases).where({ ID: caseId });
  });

  this.on('approveOnboardingCase', 'OnboardingCases', async (req) => {

    const caseId = req.params[0]?.ID ?? req.params[0];

    const onboardingCase = await SELECT.one
        .from(OnboardingCases)
        .where({ ID: caseId });

    if (!onboardingCase)
        return req.reject(404, 'Onboarding case not found.');

    if (onboardingCase.status !== 'SUBMITTED')
        return req.reject(409, 'Only submitted cases can be approved.');

    await UPDATE(OnboardingCases)
        .set({
            status: 'APPROVED',
            approvedBy: req.user.id,
            approvedAt: nowIso()
        })
        .where({ ID: caseId });

    const result = await generateTasksFor(caseId, req.user.id);

    if (result.error)
        return req.reject(...result.error);

    return await SELECT.one
        .from(OnboardingCases)
        .where({ ID: caseId });

});

  this.on('rejectOnboardingCase', 'OnboardingCases', async (req) => {
    const caseId = req.params[0]?.ID ?? req.params[0];
    const { remarks } = req.data;

    const onboardingCase = await SELECT.one.from(OnboardingCases).where({ ID: caseId });
    if (!onboardingCase)
      return req.reject(404, 'Onboarding case not found.');
    if (onboardingCase.status !== 'SUBMITTED')
      return req.reject(409, 'Only submitted cases can be rejected.');

    await UPDATE(OnboardingCases)
      .set({
        status         : 'REJECTED',
        rejectedBy     : req.user.id,
        rejectedAt     : nowIso(),
        rejectionReason: remarks || ''
      })
      .where({ ID: caseId });

    return await SELECT.one.from(OnboardingCases).where({ ID: caseId });
  });

  
  this.on('generateTasks', 'OnboardingCases', async (req) => {
    if (!isHR(req))
      return req.error(403, 'Only HR can generate tasks.');

    const caseId = req.params[0]?.ID ?? req.params[0];

    const onboardingCase = await SELECT.one.from(OnboardingCases).where({ ID: caseId });
    if (!onboardingCase)
      return req.error(404, 'Onboarding case not found.');

    if (onboardingCase.status !== 'APPROVED')
      return req.error(400, 'Onboarding case must be approved by the Hiring Manager before generating tasks.');

    const result = await generateTasksFor(caseId, req.user.id);
    if (result.error)
      return req.error(...result.error);

    return await SELECT.from(OnboardingTasks).where({ onboardingCase_ID: caseId });
  });

  this.on('getCompletionChecklist', 'OnboardingCases', async (req) => {
    const caseId = req.params[0]?.ID ?? req.params[0];
    const items  = await buildChecklist(caseId);
    if (!items) return req.reject(404, 'Onboarding case not found.');
    return items;
  });

  this.on('closeOnboarding', 'OnboardingCases', async (req) => {
    if (!isHR(req))
      return req.error(403, 'Only HR can close an onboarding case.');

    const caseId  = req.params[0]?.ID ?? req.params[0];
    const onbCase = await SELECT.one.from(OnboardingCases).where({ ID: caseId });

    if (!onbCase)
      return req.error(404, `Onboarding case ${caseId} not found.`);
    if (onbCase.status === 'Completed')
      return req.error(409, 'Onboarding case is already completed.');
    if (onbCase.status !== 'In Progress')
      return req.error(409, `Only cases in progress can be closed (current status: ${onbCase.status}).`);

    const checklist = await buildChecklist(caseId);
    const pending   = checklist.filter(i => i.isMandatory && !i.isDone);
    const of        = (category) => pending.filter(i => i.category === category);

    const problems = [];
    if (of('Task').length > 0)
      problems.push(`Open mandatory tasks: ${of('Task').map(i => `${i.item} (${i.detail})`).join(', ')}`);
    if (of('Document').length > 0)
      problems.push(`Mandatory documents not verified: ${of('Document').map(i => i.item).join(', ')}`);
    if (of('Policy').length > 0)
      problems.push(`${of('Policy').length} policy acknowledgement(s) pending`);

    if (problems.length > 0)
      return req.error(409, `Case ${onbCase.caseNumber} cannot be closed. ${problems.join(' | ')}`);

    await UPDATE(OnboardingCases)
      .set({ status: 'Completed', completionDate: nowIso() })
      .where({ ID: caseId });

    LOG.info(`Onboarding case ${onbCase.caseNumber} closed by ${req.user.id}.`);

    return await SELECT.one.from(OnboardingCases).where({ ID: caseId });
  });



  this.before('CREATE', 'OnboardingTasks', async (req) => {
    const data = req.data;
    if (!data.assignedRole)
      return req.error(422, 'assignedRole is required (HR, MANAGER, IT, FACILITIES or EMPLOYEE).');

    data.assignedRole = canonRole(data.assignedRole);
    data.status       = 'Open';
    data.priority     = data.priority || 'Medium';
  });

  this.before('UPDATE', 'OnboardingTasks', async (req) => {
    if (req.data.assignedRole) req.data.assignedRole = canonRole(req.data.assignedRole);
  });

  this.before('CREATE', 'TaskDependencies', async (req) => {
    const { task_ID, dependsOnTask_ID } = req.data;

    if (!task_ID || !dependsOnTask_ID)
      return req.error(422, 'Both task and dependsOnTask are required.');
    if (task_ID === dependsOnTask_ID)
      return req.error(400, 'A task cannot depend on itself.');

    const task      = await SELECT.one.from(OnboardingTasks).columns('ID', 'onboardingCase_ID').where({ ID: task_ID });
    const dependsOn = await SELECT.one.from(OnboardingTasks).columns('ID', 'onboardingCase_ID').where({ ID: dependsOnTask_ID });
    if (!task || !dependsOn)
      return req.error(404, 'Task not found.');
    if (task.onboardingCase_ID !== dependsOn.onboardingCase_ID)
      return req.error(400, 'Dependencies must be between tasks of the same onboarding case.');

    const existing = await SELECT.from(TaskDependencies)
      .columns('task_ID', 'dependsOnTask_ID')
      .where({ onboardingCase_ID: task.onboardingCase_ID });

    const graph = {};
    for (const e of existing) {
      graph[e.task_ID] = graph[e.task_ID] || [];
      graph[e.task_ID].push(e.dependsOnTask_ID);
    }

    const visited = new Set();
    const stack   = [dependsOnTask_ID];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === task_ID)
        return req.error(409, 'This dependency would create a circular chain.');
      if (visited.has(node)) continue;
      visited.add(node);
      (graph[node] || []).forEach(n => stack.push(n));
    }

    req.data.onboardingCase_ID = task.onboardingCase_ID;
    req.data.dependencyType    = req.data.dependencyType || 'FinishToStart';
  });

  this.on('completeTask', 'OnboardingTasks', async (req) => {
    const taskId = req.params[0]?.ID ?? req.params[0];
    const result = await completeTaskCore(req, taskId, req.data);
    if (result.error) return req.error(...result.error);
    return await SELECT.one.from(OnboardingTasks).where({ ID: taskId });
  });

  this.on('returnTask', 'OnboardingTasks', async (req) => {
    const taskId = req.params[0]?.ID ?? req.params[0];
    const { remarks } = req.data;

    const task = await SELECT.one.from(OnboardingTasks).where({ ID: taskId });
    if (!task)
      return req.error(404, `Task ${taskId} not found.`);

    const accessError = await checkTaskAccess(req, task);
    if (accessError) return req.error(...accessError);

    const onbCase = await SELECT.one.from(OnboardingCases).columns('status', 'caseNumber')
      .where({ ID: task.onboardingCase_ID });
    if (onbCase && onbCase.status === 'Completed')
      return req.error(409, `Onboarding case ${onbCase.caseNumber} is already completed.`);

    if (!remarks)
      return req.error(422, 'Remarks are required when returning a task.');
    if (['Returned', 'Cancelled'].includes(task.status))
      return req.error(409, `Task is already ${task.status}.`);

    await UPDATE(OnboardingTasks)
      .set({ status: 'Returned', completionDate: null, remarks: remarks })
      .where({ ID: taskId });

    await writeTaskHistory(taskId, task.status, 'Returned', req.user.id, remarks);

    return await SELECT.one.from(OnboardingTasks).where({ ID: taskId });
  });

 
  this.on('createEmailAccount', 'OnboardingTasks', async (req) => {
    const taskId       = req.params[0]?.ID ?? req.params[0];
    const emailAddress = lower((req.data.emailAddress || '').trim());
    const { remarks }  = req.data;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress))
      return req.error(400, 'Invalid e-mail address.');

    const task = await SELECT.one.from(OnboardingTasks).where({ ID: taskId });
    if (!task) return req.error(404, `Task ${taskId} not found.`);
    if (task.taskName !== EMAIL_TASK_NAME)
      return req.error(400, 'This action is only for the email account task.');

    const onbCase = await SELECT.one.from(OnboardingCases).columns('employee_ID')
      .where({ ID: task.onboardingCase_ID });
    if (!onbCase || !onbCase.employee_ID)
      return req.error(404, 'No employee linked to this task.');
    const employeeId = onbCase.employee_ID;

    // the address must not belong to anyone else (company email or login email)
    const dupCompany = await SELECT.one.from(Employees).columns('ID').where({ companyEmail: emailAddress });
    if (dupCompany && dupCompany.ID !== employeeId)
      return req.error(409, `${emailAddress} is already assigned to another employee.`);
    const dupLogin = await SELECT.one.from(Employees).columns('ID').where({ email: emailAddress });
    if (dupLogin && dupLogin.ID !== employeeId)
      return req.error(409, `${emailAddress} is already used by another employee.`);

    // complete the task first: access, case, dependency and evidence checks all run here
    const result = await completeTaskCore(req, taskId, {
      evidence: `Email created: ${emailAddress}`,
      remarks : remarks || `Email created: ${emailAddress}`
    });
    if (result.error) return req.error(...result.error);

    await UPDATE(Employees).set({
      companyEmail  : emailAddress,
      emailCreatedBy: req.user.id,
      emailCreatedAt: nowIso()
    }).where({ ID: employeeId });

    return await SELECT.one.from(OnboardingTasks).where({ ID: taskId });
  });

  this.on('escalateOverdueTasks', async (req) => {
    const overdue = await SELECT.from(OnboardingTasks)
      .where({ dueDate: { '<': today() }, status: { in: ['Open', 'In Progress', 'Returned'] } });

    for (const task of overdue) {
      await UPDATE(OnboardingTasks)
        .set({ status: 'Overdue', priority: 'High' })
        .where({ ID: task.ID });

      await writeTaskHistory(task.ID, task.status, 'Overdue', req.user.id || 'system', 'Auto-escalated: due date passed');

      await this.emit('TaskOverdue', {
        taskID      : task.ID,
        taskName    : task.taskName,
        assignedRole: task.assignedRole,
        assignedTo  : task.assignedTo,
        dueDate     : task.dueDate
      });
    }
     await sendOverdueTaskAlerts(overdue, today());

    LOG.warn(`Escalated ${overdue.length} overdue task(s).`);
    return overdue.length;
  });


  this.on('submitDocument', 'EmployeeDocuments', async (req) => {
    const docId = req.params[0]?.ID ?? req.params[0];
    const { documentName, documentId, documentUrl } = req.data;

    const doc = await SELECT.one.from(EmployeeDocuments).where({ ID: docId });
    if (!doc)
      return req.error(404, `Document ${docId} not found.`);

    const onbCase = await SELECT.one.from(OnboardingCases).where({ ID: doc.onboardingCase_ID });
    if (!onbCase)
      return req.error(404, 'Onboarding case not found.');
    if (onbCase.status === 'Completed')
      return req.error(409, `Onboarding case ${onbCase.caseNumber} is already completed.`);

    if (!isHR(req)) {
      const emp = await SELECT.one.from(Employees).columns('email').where({ ID: onbCase.employee_ID });
      if (!emp || lower(emp.email) !== lower(req.user.id))
        return req.error(403, 'You can only upload your own documents.');
    }

    if (!documentId && !documentUrl)
      return req.error(422, 'A Document Management reference (documentId or documentUrl) is required.');

    await UPDATE(EmployeeDocuments)
      .set({
        documentName      : documentName || doc.documentName,
        documentId        : documentId,
        documentUrl       : documentUrl,
        uploadDate        : nowIso(),
        verificationStatus: 'Submitted',
        verifiedBy        : null,
        verifiedAt        : null
      })
      .where({ ID: docId });

    return await SELECT.one.from(EmployeeDocuments).where({ ID: docId });
  });

  this.on('verifyDocument', 'EmployeeDocuments', async (req) => {
    if (!isHR(req))
      return req.error(403, 'Only HR can verify documents.');

    const docId = req.params[0]?.ID ?? req.params[0];
    const { approved } = req.data;

    const doc = await SELECT.one.from(EmployeeDocuments).where({ ID: docId });
    if (!doc)
      return req.error(404, `Document ${docId} not found.`);
    if (doc.verificationStatus !== 'Submitted')
      return req.error(409, 'Only submitted documents can be verified.');

    await UPDATE(EmployeeDocuments)
      .set({
        verificationStatus: approved ? 'Verified' : 'Rejected',
        verifiedBy        : req.user.id,
        verifiedAt        : nowIso()
      })
      .where({ ID: docId });

    return await SELECT.one.from(EmployeeDocuments).where({ ID: docId });
  });

  this.on('acknowledgePolicy', 'PolicyAcknowledgements', async (req) => {
    const ackId = req.params[0]?.ID ?? req.params[0];

    const ack = await SELECT.one.from(PolicyAcknowledgements).where({ ID: ackId });
    if (!ack)
      return req.error(404, `Acknowledgement ${ackId} not found.`);

    const emp = await SELECT.one.from(Employees).columns('email').where({ ID: ack.employee_ID });
    if (!emp)
      return req.error(404, 'Employee not found.');

    if (lower(emp.email) !== lower(req.user.id))
      return req.error(403, 'You can only acknowledge policies for yourself.');

    const onbCase = await SELECT.one.from(OnboardingCases)
      .columns('status', 'caseNumber')
      .where({ ID: ack.onboardingCase_ID });
    if (!onbCase)
      return req.error(404, 'Onboarding case not found.');
    if (onbCase.status === 'Completed')
      return req.error(409, `Onboarding case ${onbCase.caseNumber} is already completed.`);

    if (!ack.acknowledged) {
      await UPDATE(PolicyAcknowledgements)
        .set({ acknowledged: true, acknowledgedAt: nowIso() })
        .where({ ID: ackId });
    }

    return await SELECT.one.from(PolicyAcknowledgements).where({ ID: ackId });
  });

  // ======================================================================================
  // Assets
  // ======================================================================================

  this.before('CREATE', 'CompanyAssets', async (req) => {
    const d = req.data;
    if (!d.assetCode || !d.assetName)
      return req.error(422, 'Asset code and asset name are required.');

    d.assetCode = String(d.assetCode).trim();
    d.assetName = String(d.assetName).trim();

    const dup = await SELECT.one.from(CompanyAssets).columns('ID').where({ assetCode: d.assetCode });
    if (dup) return req.error(409, `Asset code ${d.assetCode} already exists.`);

    d.assetStatus = 'Available';
  });

  this.before('UPDATE', 'CompanyAssets', async (req) => {
    if (req.data.assetStatus === undefined) return;
    const assetId = req.data.ID ?? req.params[0]?.ID ?? req.params[0];

    const active = await SELECT.one.from(AssetAssignments).columns('ID')
      .where({ asset_ID: assetId, assignmentStatus: 'ASSIGNED' });

    if (active && req.data.assetStatus !== 'Assigned')
      return req.error(409, 'Asset is currently assigned - return it first.');
    if (!active && req.data.assetStatus === 'Assigned')
      return req.error(409, 'Use the assignAsset action to assign an asset.');
  });

  this.on('assignAsset', async (req) => {
    const { employee, asset, onboardingCase, expectedReturnDate, issueCondition, remarks } = req.data;
    if (!employee || !asset)
      return req.error(422, 'Employee and asset are required.');

    const a = await SELECT.one.from(CompanyAssets).where({ ID: asset });
    if (!a) return req.error(404, 'Asset not found.');
    if (a.assetStatus !== 'Available')
      return req.error(409, `Asset is ${a.assetStatus || 'not available'}.`);

    const emp = await SELECT.one.from(Employees).columns('ID').where({ ID: employee });
    if (!emp) return req.error(404, 'Employee not found.');

    if (onboardingCase) {
      const c = await SELECT.one.from(OnboardingCases).columns('employee_ID').where({ ID: onboardingCase });
      if (!c || c.employee_ID !== employee)
        return req.error(400, 'The onboarding case does not belong to this employee.');
    }
    if (expectedReturnDate && expectedReturnDate < today())
      return req.error(400, 'Expected return date is in the past.');

    const id = cds.utils.uuid();
    await INSERT.into(AssetAssignments).entries({
      ID               : id,
      assignedDate     : today(),
      expectedReturnDate,
      assignmentStatus : 'ASSIGNED',
      assignedBy       : req.user.id,
      issueCondition,
      remarks,
      employee_ID      : employee,
      asset_ID         : asset,
      onboardingCase_ID: onboardingCase
    });
    await UPDATE(CompanyAssets).set({ assetStatus: 'Assigned' }).where({ ID: asset });
    await writeAssignmentHistory(id, null, 'ASSIGNED', req.user.id, remarks || 'Asset assigned');

    return await SELECT.one.from(AssetAssignments).where({ ID: id });
  });

  this.on('returnAsset', 'AssetAssignments', async (req) => {
    if (!req.user.is('ITSupport') && !req.user.is('FacilitiesCoordinator'))
      return req.error(403, 'Not authorized to return assets.');

    const assignmentId = req.params[0]?.ID ?? req.params[0];
    const { returnedTo, assetCondition, remarks } = req.data;

    const assignment = await SELECT.one.from(AssetAssignments).where({ ID: assignmentId });
    if (!assignment)
      return req.error(404, `Assignment ${assignmentId} not found.`);
    if (assignment.assignmentStatus !== 'ASSIGNED')
      return req.error(409, 'Asset has already been returned.');

    await UPDATE(AssetAssignments)
      .set({
        assignmentStatus: 'Returned',
        returnDate      : today(),
        returnedTo      : returnedTo || req.user.id,
        returnCondition : assetCondition,
        remarks         : remarks || assignment.remarks
      })
      .where({ ID: assignmentId });

    const damaged = /damag|broken|repair/i.test(assetCondition || '');
    await UPDATE(CompanyAssets)
      .set({ assetStatus: damaged ? 'Under Repair' : 'Available' })
      .where({ ID: assignment.asset_ID });

    const note = [assetCondition && `Condition: ${assetCondition}`, remarks]
      .filter(Boolean)
      .join(' | ') || 'Asset returned';
    await writeAssignmentHistory(assignmentId, 'ASSIGNED', 'Returned', req.user.id, note);

    return await SELECT.one.from(AssetAssignments).where({ ID: assignmentId });
  });

  // ======================================================================================
  // Calculated fields
  // ======================================================================================

  this.after('READ', 'OnboardingTasks', async (tasks) => {
    const todayDate = today();

    const setFields = (task) => {
      if (!task) return;

      if (task.status !== undefined || task.dueDate !== undefined) {
        task.isOverdue = !!task.dueDate
          && task.dueDate < todayDate
          && !['Completed', 'Cancelled'].includes(task.status);
      }

      if (task.status !== undefined) {
        switch (task.status) {
          case 'Completed': task.statusCriticality = 3; break;
          case 'Returned' : task.statusCriticality = 2; break;
          case 'Overdue'  : task.statusCriticality = 1; break;
          default         : task.statusCriticality = 0;
        }
      }
    };

    if (Array.isArray(tasks)) {
      tasks.forEach(setFields);
    } else if (tasks) {
      setFields(tasks);
    }
  });

  this.after('READ', 'OnboardingCases', async (cases) => {
    const list = (Array.isArray(cases) ? cases : [cases]).filter(c => c && c.ID);
    if (list.length === 0) return;

    const tasks = await SELECT.from(OnboardingTasks)
      .columns('onboardingCase_ID', 'status')
      .where({ onboardingCase_ID: { in: list.map(c => c.ID) } });

    const totals = {};
    for (const t of tasks) {
      if (t.status === 'Cancelled') continue;
      totals[t.onboardingCase_ID] = totals[t.onboardingCase_ID] || { total: 0, done: 0 };
      totals[t.onboardingCase_ID].total++;
      if (t.status === 'Completed') totals[t.onboardingCase_ID].done++;
    }

    for (const c of list) {
      const t = totals[c.ID];
      c.completionPercentage = t && t.total > 0
        ? parseFloat(((t.done / t.total) * 100).toFixed(2))
        : 0;
    }
  });

});