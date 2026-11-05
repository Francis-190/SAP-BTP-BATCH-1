/*global QUnit*/

sap.ui.define([
	"addinventory/controller/AddInventory.controller"
], function (Controller) {
	"use strict";

	QUnit.module("AddInventory Controller");

	QUnit.test("I should test the AddInventory controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
