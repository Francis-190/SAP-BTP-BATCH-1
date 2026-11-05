sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("claimsure.app.controller.BaseController", {

        getRouter: function () {
            return sap.ui.core.UIComponent.getRouterFor(this);
        },

        getModel: function (sName) {
            return this.getView().getModel(sName);
        },

        getResourceBundle: function () {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle();
        },

        navTo: function (sRoute, oParams) {
            this.getRouter().navTo(sRoute, oParams);
        },

        /**
         * Generic toast + error helper for OData action/function call failures.
         */
        showError: function (oError) {
            var sMessage = (oError && oError.message) || "An unexpected error occurred.";
            // CAP errors arrive as JSON in oError.message sometimes - try to unwrap
            try {
                var oParsed = JSON.parse(oError.message);
                if (oParsed && oParsed.error && oParsed.error.message) {
                    sMessage = oParsed.error.message;
                }
            } catch (e) { /* not JSON, use raw message */ }

            sap.m.MessageBox.error(sMessage);
        },

        showSuccess: function (sMessage) {
            sap.m.MessageToast.show(sMessage);
        }
    });
});
