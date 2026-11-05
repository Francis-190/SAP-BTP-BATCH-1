sap.ui.define([
    "sap/ui/model/json/JSONModel"
], function (JSONModel) {
    "use strict";

    return {
        /**
         * Purely local UI state (selected nav key, busy flags, current user).
         * All business data (Claims, Policies, Customers, Employees, ...)
         * is bound directly from the OData V4 services - never duplicated here.
         */
        createAppModel: function () {
            return new JSONModel({
                selectedNavKey: "dashboard",
                currentUser: {
                    name: "Mona Manager",
                    role: "ClaimsManager"
                },
                busy: false
            });
        }
    };
});
