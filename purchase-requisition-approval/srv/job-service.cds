using { pr } from '../db/schema';

@path: '/rest/jobs'
@protocol: 'rest'
@requires: 'JobScheduler'
service JobService {
  action retryFailedHandoffs() returns {
    processed : Integer; published : Integer; stillFailed : Integer; skipped : Integer;
  };
  action remindPendingApprovals(days : Integer) returns {
    approvers : Integer; requisitions : Integer;
  };
  action cancelStaleDrafts(days : Integer) returns { cancelled : Integer; };
}