
const {
    AlertNotificationClient,
    OAuthAuthentication,
    RegionUtils,
    Severity,
    Category
} = require('@sap_oss/alert-notification-client');

function createAlertClient() {

const credentials = JSON.parse(
    process.env.VCAP_SERVICES
)['alert-notification'][0].credentials;

    const authentication = new OAuthAuthentication({
        username: credentials.client_id,
        password: credentials.client_secret,
        oAuthTokenUrl: credentials.oauth_url
    });

    const client = new AlertNotificationClient({
        authentication: authentication,
        region: RegionUtils.US10
    });

    return client;
}





async function sendLowStockAlert(lowStockDetails,plantID) {

    const client = createAlertClient();

    let body = 'LOW STOCK DETAILS\n\n';

    let count = 1;

    for (const item of lowStockDetails) {

        body = body +
`
${count}. ${item.material.description}
   Material Code       : ${item.material.materialCode}
   Batch Number        : ${item.stockBalance.batchNumber}
   Reorder Level       : ${item.material.reorderLevel}
   Unrestricted Stock  : ${item.stockBalance.unrestrictedQty}
   Reserved Stock      : ${item.stockBalance.reservedQty}
   Quality Stock       : ${item.stockBalance.qualityQty}

`;

        count++;
    }

    const event = {
        body: body,
        subject: 'Low Stock Alert',
        eventType: 'LowStockDetected',
        severity: Severity.WARNING,
        category: Category.ALERT,
     tags: { plant: String(plantID) },
        resource: {
            resourceName: 'interplant-stock-control',
            resourceType: 'application',
            resourceInstance: 'inter-plant-stock-transfer-srv'
        }
    };

    const response = await client.sendEvent(event);

    return response;
}



module.exports = {
    createAlertClient,sendLowStockAlert
};
