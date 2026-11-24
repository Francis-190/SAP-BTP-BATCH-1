const cds = require('@sap/cds');
const LOG = cds.log('jobs');

const BACKOFF_MIN = [5, 15, 60, 240, 720]; 
const MAX_ATTEMPTS = 5;
const PR = 'pr.PurchaseRequisition';
const TASK = 'pr.ApprovalTask';

module.exports = class JobService extends cds.ApplicationService {
  async init() {

    // retry failed ERP handoffs 
    this.on('retryFailedHandoffs', async () => {
      const db = await cds.connect.to('db');
      const reqSrv = await cds.connect.to('RequisitionService');
      const user = cds.User.privileged;

      const failed = await cds.tx({ user }, tx => tx.run(
        SELECT.from(PR)
          .columns('ID', 'erpReference.attempts as attempts',
                         'erpReference.modifiedAt as lastAttemptAt')
          .where({ status: 'Failed' })
      ));

      const out = { processed: 0, published: 0, stillFailed: 0, skipped: 0 };
      for (const r of failed) {
        const attempts = r.attempts || 1;
        if (attempts >= MAX_ATTEMPTS) { out.skipped++; continue; }
        const waitMs = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] * 60000;
        if (r.lastAttemptAt && Date.now() < new Date(r.lastAttemptAt).getTime() + waitMs) {
          out.skipped++; continue;
        }
        out.processed++;
        try {
          await cds.tx({ user }, () => reqSrv.send({
            event: 'retryHandoff', entity: 'Requisitions', params: [{ ID: r.ID }]
          }));
          out.published++;
        } catch (e) {
          out.stillFailed++; 
          LOG.warn(`retry failed for ${r.ID}: ${e.message}`);
        }
      }
      LOG.info('retryFailedHandoffs', out);
      return out;
    });

    // remind approvers about waiting tasks
    this.on('remindPendingApprovals', async (req) => {
      const days = req.data.days ?? 2;
      const cutoff = new Date(Date.now() - days * 864e5).toISOString();

      const tasks = await cds.tx({ user: cds.User.privileged }, tx => tx.run(
        SELECT.from(TASK)
          .columns('assignedTo', 'requisition.reqNumber as reqNumber')
          .where({
            state: 'Open',
            'requisition.status': 'InApproval',
            and: { 'requisition.modifiedAt': { '<': cutoff } }
          })
      ));
      const byApprover = {};
      for (const t of tasks) (byApprover[t.assignedTo] ??= []).push(t.reqNumber);
      for (const [who, nums] of Object.entries(byApprover)) await notifyApprover(who, nums);
      return { approvers: Object.keys(byApprover).length, requisitions: tasks.length };
    });

    //  cancel stale drafts 
    this.on('cancelStaleDrafts', async (req) => {
      const days = req.data.days ?? 30;
      const cutoff = new Date(Date.now() - days * 864e5).toISOString();
      const n = await cds.tx({ user: cds.User.privileged }, tx => tx.run(
        UPDATE(PR)
          .set({ status: 'Cancelled',
                 cancelReason: `Auto-cancelled: draft inactive for more than ${days} days` })
          .where({ status: 'Draft', modifiedAt: { '<': cutoff } })
      ));
      return { cancelled: n };
    });

    return super.init();
  }
};

async function notifyApprover(user, reqNumbers) {
  LOG.info(`Reminder for ${user}: ${reqNumbers.join(', ')}`);
}