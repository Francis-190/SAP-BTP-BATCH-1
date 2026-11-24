
const {
    AlertNotificationClient,
    OAuthAuthentication,
    RegionUtils,
    Severity,
    Category
} = require('@sap_oss/alert-notification-client');

let alertClient;

function createAlertClient() {
    if (alertClient) {
        return alertClient;
    }

    const vcap = JSON.parse(process.env.VCAP_SERVICES || '{}');

    const service = vcap['alert-notification']?.[0];

    if (!service?.credentials) {
        throw new Error(
            'Alert Notification service binding not found in VCAP_SERVICES'
        );
    }

    const credentials = service.credentials;

    const authentication = new OAuthAuthentication({
        username: credentials.client_id,
        password: credentials.client_secret,
        oAuthTokenUrl: credentials.oauth_url
    });

    alertClient = new AlertNotificationClient({
        authentication,
        // Change this to the region where your Alert Notification
        // service is onboarded. Do not leave US10 unless that is correct.
        region: RegionUtils.AP10
    });

    return alertClient;
}

async function publishAlert({
    eventType,
    subject,
    body,
    severity = Severity.WARNING,
    category = Category.ALERT,
    tags = {}
}) {
    try {
        const client = createAlertClient();

        const response = await client.sendEvent({
            eventType,
            subject,
            body,
            severity,
            category,
            resource: {
                resourceName: 'complaint-management',
                resourceType: 'application',
                resourceInstance: 'complaint-management-srv'
            },
            tags
        });

        console.log(`Alert published: ${eventType}`);
        return response;

    } catch (error) {
        console.error('Alert Notification error:', error.message);
        throw error;
    }
}

module.exports = {
    createAlertClient,
    publishAlert
};
