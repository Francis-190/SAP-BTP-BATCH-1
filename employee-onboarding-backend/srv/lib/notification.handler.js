'use strict';

const cds = require('@sap/cds');
const LOG = cds.log('NotificationHandler');

const ANS_SERVICE_NAME = 'onboarding-ans';

let cachedToken    = null;
let tokenExpiresAt = 0;

function getCredentials() {
  // Hybrid/local: .cdsrc-private.json (cds bind) -> cds.env.requires['onboarding-ans'].credentials
  // CF: package.json vcap mapping fills the same path; VCAP_SERVICES is the last fallback
  const requires = cds.env.requires || {};
  let creds = (requires[ANS_SERVICE_NAME] || requires['alert-notification'])?.credentials;

  if (!creds && process.env.VCAP_SERVICES) {
    const list = JSON.parse(process.env.VCAP_SERVICES)['alert-notification'] || [];
    creds = (list.find(s => s.name === ANS_SERVICE_NAME) || list[0])?.credentials;
  }

  if (!creds) {
    LOG.warn('[ANS] Credentials not found, skipping alert.');
    return null;
  }

  const oauthUrl = String(creds.oauth_url || '').replace(/\/+$/, '');

  return {
    url         : String(creds.url || '').replace(/\/+$/, ''),
    clientId    : creds.client_id,
    clientSecret: creds.client_secret,
    tokenUrl    : oauthUrl.includes('/oauth/token') ? oauthUrl : `${oauthUrl}/oauth/token`
  };
}

async function getAccessToken(creds) {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const response = await fetch(creds.tokenUrl, {
    method : 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body   : new URLSearchParams({
      grant_type   : 'client_credentials',
      client_id    : creds.clientId,
      client_secret: creds.clientSecret
    })
  });
  if (!response.ok) throw new Error(`ANS token fetch failed: ${response.status} ${await response.text()}`);

  const data     = await response.json();
  cachedToken    = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 30000;
  return cachedToken;
}

// generic publisher
async function sendAlert({ eventType, severity, category, subject, body, instance, tags }) {
  const creds = getCredentials();
  if (!creds) return;

  const token = await getAccessToken(creds);

  const response = await fetch(`${creds.url}/cf/producer/v1/resource-events`, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body   : JSON.stringify({
      eventType,
      eventTimestamp: Math.floor(Date.now() / 1000),
      severity      : severity || 'INFO',
      category      : category || 'NOTIFICATION',
      subject,
      body,
      resource: {
        resourceName    : 'OnboardingService',
        resourceType    : 'app',
        resourceInstance: instance || 'employee-onboarding'
      },
      tags: tags || {}
    })
  });
  if (!response.ok) throw new Error(`ANS publish failed: ${response.status} ${await response.text()}`);
  LOG.info(`[ANS] ${eventType} published.`);
}

// one summary alert per assigned role
async function sendOverdueTaskAlerts(overdue, runDate) {
  if (!overdue || overdue.length === 0) return;

  const byRole = {};
  for (const t of overdue) {
    const role = t.assignedRole || 'Unassigned';
    (byRole[role] = byRole[role] || []).push(t);
  }

  for (const [role, list] of Object.entries(byRole)) {
    const names = list.slice(0, 10).map(t => `${t.taskName} (due ${t.dueDate})`).join('; ');
    try {
      await sendAlert({
        eventType: 'OnboardingTasksOverdue',
        severity : 'WARNING',
        category : 'ALERT',
        subject  : `${list.length} overdue onboarding task(s) for ${role}`,
        body     : names + (list.length > 10 ? ` ... and ${list.length - 10} more` : ''),
        instance : 'employee-onboarding',
        tags     : { role, count: String(list.length), runDate: String(runDate) }
      });
    } catch (err) {
      LOG.error(`[ANS] Overdue alert failed for role ${role}: ${err.message}`);
    }
  }
}

module.exports = { sendAlert, sendOverdueTaskAlerts };