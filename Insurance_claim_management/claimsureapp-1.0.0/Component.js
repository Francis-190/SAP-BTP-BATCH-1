
sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "sap/ui/model/json/JSONModel",
    "claimsure/app/model/models"
], function (UIComponent, Device, JSONModel, models) {
    "use strict";

    return UIComponent.extend("claimsure.app.Component", {

        metadata: {
            manifest: "json"
        },

        init: function () {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the app-local (UI state) JSON model
            this.setModel(models.createAppModel(), "app");

            // Global cross-service lookup maps (ID -> display name).
            // Customers/ClaimTypes/Employees live on the "admin" model
            // (MainService), but Claims/Policies live on the default model
            // (InsuranceService) and can only store the raw foreign keys —
            // OData $expand cannot cross service boundaries. Views bind to
            // this model (via multi-part bindings + formatter.idToName) to
            // resolve those IDs to names without needing $expand.
            this.setModel(new JSONModel({
                customers: {},
                claimTypes: {},
                employees: {}
            }), "lookups");

            this._loadLookups();

            // enable routing
            this.getRouter().initialize();
        },

        /**
         * Populates the "lookups" model from the admin (MainService) OData model.
         * Runs once at startup; every view sees the same shared maps and updates
         * automatically once the data arrives (JSONModel bindings refresh).
         */
        _loadLookups: function () {
            var oAdminModel = this.getModel("admin");
            var oLookupsModel = this.getModel("lookups");

            this._fetchMap(oAdminModel, "/Customers", null).then(function (mMap) {
                oLookupsModel.setProperty("/customers", mMap);
            });

            this._fetchMap(oAdminModel, "/ClaimTypes", "name").then(function (mMap) {
                oLookupsModel.setProperty("/claimTypes", mMap);
            });

            this._fetchMap(oAdminModel, "/Employees", null).then(function (mMap) {
                oLookupsModel.setProperty("/employees", mMap);
            });
        },

        // sNameField: property to use directly (e.g. "name"). Pass null for a
        // "First Last" style display built from firstName/lastName.
        _fetchMap: function (oModel, sPath, sNameField) {
            return new Promise(function (resolve) {
                var oBinding = oModel.bindList(sPath, undefined, undefined, undefined, {
                    $select: sNameField ? "ID," + sNameField : "ID,firstName,lastName"
                });

                oBinding.requestContexts(0, 2000).then(function (aContexts) {
                    var mMap = {};
                    aContexts.forEach(function (oCtx) {
                        var oData = oCtx.getObject();
                        mMap[oData.ID] = sNameField
                            ? oData[sNameField]
                            : [oData.firstName, oData.lastName].filter(Boolean).join(" ");
                    });
                    resolve(mMap);
                }).catch(function (oErr) {
                    console.warn("[Component] Could not load lookup " + sPath, oErr);
                    resolve({});
                });
            });
        },

        getContentDensityClass: function () {
            if (!this._sContentDensityClass) {
                this._sContentDensityClass = Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact";
            }
            return this._sContentDensityClass;
        }
    });
});