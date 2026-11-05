/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["purchasemanagement/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
