/*global QUnit*/

sap.ui.define([
	"purchasemanagement/controller/Purchase.controller"
], function (Controller) {
	"use strict";

	QUnit.module("Purchase Controller");

	QUnit.test("I should test the Purchase controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
