sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox) {
    "use strict";

    // Used only if there is no policy yet
    var DEFAULT_POLICY_PREFIX = "POL";

    return Controller.extend("claimsure.app.controller.Policies", {

        onInit: function () {
            var oDialogModel = new JSONModel({
                dialogTitle: "",
                mode: "create",
                ID: null,
                policyNumber: "",
                customer_ID: "",
                policy: "",
                policyTypes: [],
                claimType_ID: "",
                coverageLimit: "",
                startDate: "",
                endDate: "",
                status: "Active",
                busy: false
            });
            this.getView().setModel(oDialogModel, "policyDialog");

            // drives Edit/Cancel/Delete enabled state
            var oToolbarModel = new JSONModel({
                editEnabled: false,
                cancelEnabled: false,
                deleteEnabled: false
            });
            this.getView().setModel(oToolbarModel, "toolbar");

            this._loadLookups();

            this.getOwnerComponent().getRouter()
                .getRoute("policies")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        onSelectionChange: function () {
            var oTable = this.byId("policiesTable");
            var aSelected = oTable.getSelectedItems();
            var oToolbarModel = this.getView().getModel("toolbar");

            if (aSelected.length !== 1) {
                oToolbarModel.setData({
                    editEnabled: false,
                    cancelEnabled: false,
                    deleteEnabled: false
                });
                return;
            }

            var oData = aSelected[0].getBindingContext().getObject();

            oToolbarModel.setData({
                editEnabled: this.canEditPolicy(oData.status),
                cancelEnabled: this.canCancelPolicy(oData.status),
                deleteEnabled: true
            });
        },

        _getSelectedContext: function () {
            var oTable = this.byId("policiesTable");
            var aSelected = oTable.getSelectedItems();

            if (aSelected.length !== 1) {
                MessageToast.show("Please select exactly one policy.");
                return null;
            }

            return aSelected[0].getBindingContext();
        },

        _clearSelection: function () {
            var oTable = this.byId("policiesTable");
            oTable.removeSelections(true);
            this.getView().getModel("toolbar").setData({
                editEnabled: false,
                cancelEnabled: false,
                deleteEnabled: false
            });
        },

        _onRouteMatched: function (oEvent) {
            // reload customers / policy types, so new ones created in
            // Administration are available in the dialog
            this._loadLookups();

            var oQuery = oEvent.getParameter("arguments")["?query"] || {};
            var oTable = this.byId("policiesTable");
            if (!oTable) { return; }

            var oBinding = oTable.getBinding("items");
            if (!oBinding) { return; }

            var aFilters = [];
            if (oQuery.status === "Active") {
                aFilters.push(new Filter("status", FilterOperator.EQ, "Active"));
            }

            oBinding.filter(aFilters);
        },

        _loadLookups: function () {
            var oAdminModel = this.getOwnerComponent().getModel("admin");

            if (!oAdminModel) {
                console.error("[Policies] admin model not found");
                MessageBox.error("MainService model 'admin' not found.");
                return;
            }

            // create the lookup model once, afterwards only refill it
            var oLookupModel = this.getView().getModel("lookups");

            if (!oLookupModel) {
                oLookupModel = new JSONModel({
                    customers: [],
                    claimTypes: []
                });
                oLookupModel.setSizeLimit(10000);
                this.getView().setModel(oLookupModel, "lookups");
            }

            var oCustomerBinding = oAdminModel.bindList(
                "/Customers",
                undefined,
                undefined,
                undefined,
                { $select: "ID,firstName,lastName" }
            );

            var oClaimTypeBinding = oAdminModel.bindList(
                "/ClaimTypes",
                undefined,
                undefined,
                undefined,
                { $select: "ID,name,category,active" }
            );

            Promise.all([
                oCustomerBinding.requestContexts(0, 5000),
                oClaimTypeBinding.requestContexts(0, 5000)
            ]).then(function (aResults) {

                var aCustomers = aResults[0].map(function (oContext) {
                    var oData = oContext.getObject();

                    return {
                        ID: oData.ID,
                        name: [oData.firstName, oData.lastName].filter(Boolean).join(" ")
                    };
                });

                var aClaimTypes = aResults[1].map(function (oContext) {
                    var oData = oContext.getObject();

                    return {
                        ID: oData.ID,
                        name: oData.name,
                        category: oData.category,
                        active: oData.active
                    };
                });

                oLookupModel.setData({
                    customers: aCustomers,
                    claimTypes: aClaimTypes
                });

            }).catch(function (oError) {

                console.error("[Policies] Lookup loading failed:", oError);

                MessageBox.error(
                    "Could not load customers and policy types.\n\n" +
                    (oError.message || "Unknown error")
                );
            });
        },

        // =================================================================
        // Formatters
        // =================================================================

        idToName: function (sId, aList) {
            if (!sId || !Array.isArray(aList)) {
                return sId || "";
            }
            var oFound = aList.find(function (oItem) {
                return oItem.ID === sId || oItem.id === sId;
            });
            return oFound ? (oFound.name || oFound.text || sId) : sId;
        },

        // Policy (category: Health / Vehicle / Property / Life / Business)
        // of a policy type ID
        idToCategory: function (sId, aList) {
            if (!sId || !Array.isArray(aList)) {
                return "";
            }
            var oFound = aList.find(function (oItem) {
                return oItem.ID === sId;
            });
            return oFound ? (oFound.category || "") : "";
        },

        // =================================================================
        // Policy -> Policy Type dependency (dialog)
        // Only the policy types of the selected policy (category) are shown.
        // Inactive policy types are hidden, except the one already saved
        // on the policy being edited (sKeepId).
        // =================================================================

        _policyTypesFor: function (sPolicy, sKeepId) {
            var oLookups = this.getView().getModel("lookups");
            var aAll = (oLookups && oLookups.getProperty("/claimTypes")) || [];

            if (!sPolicy) {
                return [];
            }

            return aAll
                .filter(function (oItem) {
                    return oItem.category === sPolicy &&
                        (oItem.active !== false || oItem.ID === sKeepId);
                })
                .sort(function (a, b) {
                    return String(a.name || "").localeCompare(String(b.name || ""));
                });
        },

        onPolicyChange: function (oEvent) {
            var sPolicy = oEvent.getSource().getSelectedKey();
            var oDialogModel = this.getView().getModel("policyDialog");

            // ignore the duplicate "change" event fired for the same selection
            if (sPolicy === this._sLastPolicy) {
                return;
            }
            this._sLastPolicy = sPolicy;

            oDialogModel.setProperty("/policy", sPolicy);
            oDialogModel.setProperty("/claimType_ID", "");
            oDialogModel.setProperty("/policyTypes", this._policyTypesFor(sPolicy));
        },

        formatCurrency: function (vValue) {
            if (vValue === null || vValue === undefined || vValue === "") {
                return "";
            }
            var fValue = parseFloat(vValue);
            if (isNaN(fValue)) {
                return String(vValue);
            }
            return fValue.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        },

        formatShortDate: function (vValue) {
            if (!vValue) {
                return "";
            }
            var oDate = (vValue instanceof Date) ? vValue : new Date(vValue);
            if (isNaN(oDate.getTime())) {
                return String(vValue);
            }
            var dd = String(oDate.getDate()).padStart(2, "0");
            var mm = String(oDate.getMonth() + 1).padStart(2, "0");
            var yyyy = oDate.getFullYear();
            return dd + "/" + mm + "/" + yyyy;
        },

        formatStatusState: function (sStatus) {
            switch (sStatus) {
                case "Active": return "Success";
                case "Pending": return "Warning";
                case "Expired": return "Warning";
                case "Cancelled": return "Error";
                default: return "None";
            }
        },

        canCancelPolicy: function (sStatus) {
            return sStatus === "Active" || sStatus === "Pending";
        },

        canEditPolicy: function (sStatus) {
            return sStatus !== "Cancelled";
        },

        // =================================================================
        // Search
        // =================================================================

        onSearch: function (oEvent) {
            var sQuery = (oEvent.getParameter("newValue") || oEvent.getParameter("query") || "").trim();
            var oBinding = this.byId("policiesTable").getBinding("items");
            var aFilters = sQuery ? [new Filter("policyNumber", FilterOperator.Contains, sQuery)] : [];
            oBinding.filter(aFilters);
        },

        // =================================================================
        // Existing custom actions
        // =================================================================

        _callAction: function (sActionName, sPolicyId, sSuccessMsg) {
            var oModel = this.getOwnerComponent().getModel();
            var oOperation = oModel.bindContext("/" + sActionName + "(...)");
            oOperation.setParameter("policyID", sPolicyId);

            oOperation.execute().then(function () {
                MessageToast.show(sSuccessMsg);
                this.byId("policiesTable").getBinding("items").refresh();
            }.bind(this)).catch(function (oErr) {
                console.error("[Policies] Action " + sActionName + " failed", oErr);
                MessageBox.error(oErr.message || ("Could not " + sActionName + "."));
            });
        },

        onRenewPolicy: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext();
            this._callAction("renewPolicy", oCtx.getProperty("ID"), "Policy renewed");
        },

        onCancelPolicy: function () {
            var oCtx = this._getSelectedContext();
            if (!oCtx) { return; }

            MessageBox.confirm("Cancel this policy?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        this._callAction("cancelPolicy", oCtx.getProperty("ID"), "Policy cancelled");
                    }
                }.bind(this)
            });
        },

        // =================================================================
        // Automatic policy number
        // Reads all existing policy numbers, takes the highest one and
        // returns the next one in the same format: POL030 -> POL031
        // =================================================================

        _getNextPolicyNumber: function () {
            var oModel = this.getOwnerComponent().getModel();

            var oBinding = oModel.bindList(
                "/Policies",
                undefined,
                undefined,
                undefined,
                { $select: "policyNumber" }
            );

            return oBinding.requestContexts(0, 5000).then(function (aContexts) {

                var iMax = 0;
                var sPrefix = DEFAULT_POLICY_PREFIX;
                var iPad = 0;

                aContexts.forEach(function (oContext) {
                    var aMatch = /^(.*?)(\d+)$/.exec(oContext.getProperty("policyNumber") || "");

                    if (!aMatch) {
                        return;
                    }

                    var iNum = parseInt(aMatch[2], 10);

                    if (iNum >= iMax) {
                        iMax = iNum;
                        sPrefix = aMatch[1];
                        iPad = (aMatch[2].length > 1 && aMatch[2].charAt(0) === "0")
                            ? aMatch[2].length
                            : 0;
                    }
                });

                try {
                    oBinding.destroy();
                } catch (e) {
                    // ignore
                }

                var sNumber = String(iMax + 1);

                while (sNumber.length < iPad) {
                    sNumber = "0" + sNumber;
                }

                return sPrefix + sNumber;
            });
        },

        // =================================================================
        // CRUD: Create / Edit
        // =================================================================

        onCreatePolicy: function () {
            this._sLastPolicy = "";
            var oDialogModel = this.getView().getModel("policyDialog");
            oDialogModel.setData({
                dialogTitle: "Create Policy",
                mode: "create",
                ID: null,
                policyNumber: "",
                customer_ID: "",
                policy: "",
                policyTypes: [],
                claimType_ID: "",
                coverageLimit: "",
                startDate: "",
                endDate: "",
                status: "Active",
                busy: false
            });
            this.byId("policyDialog").open();
        },

        onEditPolicy: function () {
            var oCtx = this._getSelectedContext();
            if (!oCtx) { return; }

            var oData = oCtx.getObject();
            var oDialogModel = this.getView().getModel("policyDialog");

            // find the Policy (category) of the saved policy type
            var aAllTypes = this.getView().getModel("lookups").getProperty("/claimTypes") || [];
            var oSavedType = aAllTypes.find(function (oItem) {
                return oItem.ID === oData.claimType_ID;
            });
            var sPolicy = oSavedType ? (oSavedType.category || "") : "";
            this._sLastPolicy = sPolicy;

            oDialogModel.setData({
                dialogTitle: "Edit Policy " + (oData.policyNumber || ""),
                mode: "edit",
                ID: oData.ID,
                policyNumber: oData.policyNumber,
                customer_ID: oData.customer_ID,
                policy: sPolicy,
                policyTypes: this._policyTypesFor(sPolicy, oData.claimType_ID),
                claimType_ID: oData.claimType_ID,
                coverageLimit: oData.coverageLimit,
                startDate: oData.startDate ? new Date(oData.startDate).toISOString().slice(0, 10) : "",
                endDate: oData.endDate ? new Date(oData.endDate).toISOString().slice(0, 10) : "",
                status: oData.status,
                busy: false
            });

            this.byId("policyDialog").open();
        },

        _validateDialog: function (oData) {
            if (!oData.customer_ID) {
                MessageBox.warning("Please select a Customer.");
                return false;
            }
            if (!oData.policy) {
                MessageBox.warning("Please select a Policy first.");
                return false;
            }
            if (!oData.claimType_ID) {
                MessageBox.warning("Please select a Policy Type.");
                return false;
            }
            if (!oData.coverageLimit || !oData.startDate || !oData.endDate || !oData.status) {
                MessageBox.warning("Please fill in all required fields.");
                return false;
            }
            if (isNaN(parseFloat(oData.coverageLimit))) {
                MessageBox.warning("Coverage Limit must be a number.");
                return false;
            }
            if (new Date(oData.endDate) < new Date(oData.startDate)) {
                MessageBox.warning("End Date cannot be before Start Date.");
                return false;
            }
            return true;
        },

        onSavePolicy: function () {
            var oDialogModel = this.getView().getModel("policyDialog");
            var oData = oDialogModel.getData();

            if (!this._validateDialog(oData)) {
                return;
            }

            oDialogModel.setProperty("/busy", true);

            var oModel = this.getOwnerComponent().getModel();

            // policyNumber is NOT part of the form
            var oPayload = {
                customer_ID: oData.customer_ID,
                claimType_ID: oData.claimType_ID,
                coverageLimit: parseFloat(oData.coverageLimit),
                startDate: oData.startDate,
                endDate: oData.endDate,
                status: oData.status
            };

            // ---------------- CREATE ----------------
            if (oData.mode === "create") {

                this._getNextPolicyNumber()
                    .then(function (sPolicyNumber) {

                        var oCreatePayload = Object.assign(
                            { policyNumber: sPolicyNumber },
                            oPayload
                        );

                        var oListBinding = this.byId("policiesTable").getBinding("items");
                        var oContext = oListBinding.create(oCreatePayload);

                        return oContext.created().then(function () {
                            return sPolicyNumber;
                        });
                    }.bind(this))
                    .then(function (sPolicyNumber) {
                        oDialogModel.setProperty("/busy", false);
                        MessageToast.show("Policy " + sPolicyNumber + " created");
                        this.byId("policyDialog").close();
                    }.bind(this))
                    .catch(function (oErr) {
                        oDialogModel.setProperty("/busy", false);
                        console.error("[Policies] Create failed", oErr);
                        MessageBox.error(oErr.message || "Could not create policy.");
                    });

                return;
            }

            // ---------------- EDIT ----------------
            // bind to the existing entity by key and patch it
            var oEditContext = oModel.bindContext("/Policies(" + oData.ID + ")").getBoundContext();

            Object.keys(oPayload).forEach(function (sKey) {
                oEditContext.setProperty(sKey, oPayload[sKey]);
            });

            oModel.submitBatch(oModel.getUpdateGroupId ? oModel.getUpdateGroupId() : "$auto")
                .then(function () {
                    oDialogModel.setProperty("/busy", false);
                    MessageToast.show("Policy updated");
                    this.byId("policyDialog").close();
                    this.byId("policiesTable").getBinding("items").refresh();
                }.bind(this))
                .catch(function (oErr) {
                    oDialogModel.setProperty("/busy", false);
                    console.error("[Policies] Update failed", oErr);
                    MessageBox.error(oErr.message || "Could not update policy.");
                });
        },

        onCancelPolicyDialog: function () {
            this.byId("policyDialog").close();
        },

        onDeletePolicy: function () {
            var oCtx = this._getSelectedContext();
            if (!oCtx) { return; }

            var sPolicyNumber = oCtx.getProperty("policyNumber");

            MessageBox.confirm("Delete policy " + sPolicyNumber + "? This cannot be undone.", {
                title: "Confirm Delete",
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) {
                        return;
                    }
                    oCtx.delete().then(function () {
                        MessageToast.show("Policy deleted");
                        this._clearSelection();
                    }.bind(this)).catch(function (oErr) {
                        console.error("[Policies] Delete failed", oErr);
                        MessageBox.error(oErr.message || "Could not delete policy.");
                    });
                }.bind(this)
            });
        }
    });
});