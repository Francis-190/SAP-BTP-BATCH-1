/*global QUnit*/

sap.ui.define([
	"dealermangement/controller/Dealer.controller"
], function (Controller) {
	"use strict";

	QUnit.module("Dealer Controller");

	QUnit.test("I should test the Dealer controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
