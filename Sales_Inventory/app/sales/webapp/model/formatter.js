sap.ui.define([
	"sap/ui/base/ManagedObject"
], function (
	ManagedObject
) {
	"use strict";

	var Formatter = ManagedObject.extend("sales.model.formatter", {
	});

	// Static methods go directly on the class, not inside extend({...}),
	// so that "formatter.xxx" resolves without needing an instance.

	Formatter.formatDateTime = function (sDateTime) {

		if (!sDateTime) {
			return "";
		}

		var oDate = new Date(sDateTime);

		if (isNaN(oDate.getTime())) {
			return String(sDateTime);
		}

		return oDate.toLocaleString("en-IN", {
			day: "2-digit",
			month: "short",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			hour12: true
		});
	};

	Formatter.formatDate = function (sDate) {

		if (!sDate) {
			return "";
		}

		var oDate = new Date(sDate);

		if (isNaN(oDate.getTime())) {
			return String(sDate);
		}

		return oDate.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric"
		});
	};

	Formatter.formatCurrency = function (fValue) {

		var nValue = Number(fValue);

		if (isNaN(nValue)) {
			return "";
		}

		return "₹" + nValue.toLocaleString("en-IN", {
			maximumFractionDigits: 0
		});
	};

	Formatter.statusState = function (sStatus) {

		switch (sStatus) {
			case "Completed":
				return "Success";
			case "Pending":
				return "Warning";
			case "In Progress":
				return "Information";
			case "Cancelled":
				return "Error";
			default:
				return "None";
		}
	};

	return Formatter;
});