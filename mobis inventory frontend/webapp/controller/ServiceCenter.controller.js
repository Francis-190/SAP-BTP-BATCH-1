sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/Text",
    "sap/m/VBox"
], function (
    Controller,
    JSONModel,
    MessageToast,
    MessageBox,
    Dialog,
    Button,
    Label,
    Input,
    Text,
    VBox
) {
    "use strict";

    return Controller.extend("inventorytest.controller.ServiceCenter", {

        onInit: function () {

            this.getView().setModel(
                new JSONModel({
                    allItems: [],
                    items: [],
                    centers: [],
                    centerOptions: [{ key: "", text: "All Service Centers" }],
                    centerFilter: "",
                    statusFilter: ""
                }),
                "svc"
            );

            // Reload the data every time the page is opened,
            // so it always shows the latest issues.
            this.getOwnerComponent()
                .getRouter()
                .getRoute("serviceCenter")
                .attachPatternMatched(this._onRouteMatched, this);
        },


        _onRouteMatched: function () {

            this._loadData();
        },


        // ================================================================
        // DATA LOADING
        // ================================================================

        _loadData: async function () {

            await Promise.all([
                this._loadServiceCenters(),
                this._loadServiceIssues()
            ]);

            this._applyFilter();
        },


        _loadServiceCenters: async function () {

            let oBinding;

            try {

                const oModel = this.getOwnerComponent().getModel();

                oBinding = oModel.bindList(
                    "/ServiceCenters",
                    null,
                    null,
                    null,
                    {
                        "$orderby": "serviceCenterCode"
                    }
                );

                const aContexts = await oBinding.requestContexts(0, 200);

                const aCenters = aContexts.map(function (oContext) {

                    const oData = oContext.getObject();

                    return {
                        ID: oData.ID,
                        name: oData.name || "",
                        serviceCenterCode: oData.serviceCenterCode || "",
                        city: oData.city || "",
                        contactPerson: oData.contactPerson || "",
                        phone: oData.phone || "",
                        isActive: !!oData.isActive
                    };
                });

                const oSvc = this.getView().getModel("svc");

                oSvc.setProperty("/centers", aCenters);

                oSvc.setProperty(
                    "/centerOptions",
                    [{ key: "", text: "All Service Centers" }].concat(
                        aCenters.map(function (oCenter) {
                            return {
                                key: oCenter.ID,
                                text: oCenter.name +
                                    " (" + oCenter.serviceCenterCode + ")"
                            };
                        })
                    )
                );

            } catch (oError) {

                console.error("Error loading service centers:", oError);

            } finally {

                if (oBinding) {
                    oBinding.destroy();
                }
            }
        },


        _loadServiceIssues: async function () {

            let oBinding;

            try {

                const oModel = this.getOwnerComponent().getModel();

                oBinding = oModel.bindList(
                    "/ServicePartIssues",
                    null,
                    null,
                    null,
                    {
                        "$expand": "serviceCenter,part,warehouse",
                        "$orderby": "issueDate desc"
                    }
                );

                const aContexts = await oBinding.requestContexts(0, 500);

                const aItems = aContexts.map(function (oContext) {

                    const oData = oContext.getObject();

                    const oCenter = oData.serviceCenter || {};
                    const oPart = oData.part || {};
                    const oWarehouse = oData.warehouse || {};

                    return {
                        ID: oData.ID,
                        centerID: oData.serviceCenter_ID,
                        serviceCenter: oCenter.name || "",
                        serviceCenterCode: oCenter.serviceCenterCode || "",
                        partNumber: oPart.partNumber || "",
                        description: oPart.description || "",
                        warehouse: oWarehouse.name || "",
                        issuedQuantity: oData.issuedQuantity || 0,
                        consumedQuantity: oData.consumedQuantity || 0,
                        unusedReturnedQuantity: oData.unusedReturnedQuantity || 0,
                        defectiveReturnedQuantity: oData.defectiveReturnedQuantity || 0,
                        status: oData.status || "",
                        dateTime: this._formatDateTime(oData.issueDate)
                    };

                }, this);

                this.getView()
                    .getModel("svc")
                    .setProperty("/allItems", aItems);

            } catch (oError) {

                console.error("Error loading service center issues:", oError);

            } finally {

                if (oBinding) {
                    oBinding.destroy();
                }
            }
        },


        _formatDateTime: function (sDate) {

            if (!sDate) {
                return "";
            }

            try {

                return new Intl.DateTimeFormat(
                    undefined,
                    {
                        year: "numeric",
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                ).format(new Date(sDate));

            } catch (e) {

                return sDate;
            }
        },


        // ================================================================
        // FILTERS
        // ================================================================

        _applyFilter: function () {

            const oSvc = this.getView().getModel("svc");

            const sCenter = oSvc.getProperty("/centerFilter") || "";
            const sStatus = oSvc.getProperty("/statusFilter") || "";

            const aFiltered = (oSvc.getProperty("/allItems") || []).filter(
                function (oItem) {

                    return (!sCenter || oItem.centerID === sCenter) &&
                        (!sStatus || oItem.status === sStatus);
                }
            );

            oSvc.setProperty("/items", aFiltered);
        },


        onFilterChange: function () {

            this._applyFilter();
        },


        onRefresh: function () {

            this._loadData();
        },


        // ================================================================
        // RECONCILE
        // ================================================================

        onReconcilePress: function (oEvent) {

            const oIssue = oEvent.getSource()
                .getBindingContext("svc")
                .getObject();

            const that = this;

            const oConsumed = new Input({
                type: "Number",
                value: "0",
                width: "100%"
            });

            const oUnused = new Input({
                type: "Number",
                value: "0",
                width: "100%"
            });

            const oDefective = new Input({
                type: "Number",
                value: "0",
                width: "100%"
            });

            const oSummary = new Text({
                text: "Accounted: 0 / " + oIssue.issuedQuantity
            });

            function fnTotal() {

                return (Number(oConsumed.getValue()) || 0) +
                    (Number(oUnused.getValue()) || 0) +
                    (Number(oDefective.getValue()) || 0);
            }

            function fnUpdate() {

                oSummary.setText(
                    "Accounted: " + fnTotal() +
                    " / " + oIssue.issuedQuantity
                );
            }

            oConsumed.attachLiveChange(fnUpdate);
            oUnused.attachLiveChange(fnUpdate);
            oDefective.attachLiveChange(fnUpdate);

            const oDialog = new Dialog({

                title: "Reconcile: " + oIssue.partNumber +
                    " (" + oIssue.serviceCenter + ")",

                contentWidth: "26rem",

                content: [
                    new VBox({
                        items: [
                            new Text({
                                text: "Issued quantity: " + oIssue.issuedQuantity
                            }),

                            new Label({
                                text: "Consumed during repair"
                            }),
                            oConsumed,

                            new Label({
                                text: "Unused, returned to warehouse stock"
                            }),
                            oUnused,

                            new Label({
                                text: "Defective, kept for inspection (not added to stock)"
                            }),
                            oDefective,

                            oSummary
                        ]
                    }).addStyleClass("sapUiSmallMargin")
                ],

                beginButton: new Button({

                    text: "Reconcile",
                    type: "Emphasized",

                    press: async function () {

                        const nConsumed = Number(oConsumed.getValue());
                        const nUnused = Number(oUnused.getValue());
                        const nDefective = Number(oDefective.getValue());

                        const aValues = [nConsumed, nUnused, nDefective];

                        if (!aValues.every(function (n) {
                            return Number.isInteger(n) && n >= 0;
                        })) {

                            MessageBox.error(
                                "Quantities must be whole numbers, zero or more."
                            );

                            return;
                        }

                        if (fnTotal() !== oIssue.issuedQuantity) {

                            MessageBox.error(
                                "Quantities must add up to the issued quantity (" +
                                oIssue.issuedQuantity + ")."
                            );

                            return;
                        }

                        oDialog.setBusy(true);

                        try {

                            const oAction = that.getOwnerComponent()
                                .getModel()
                                .bindContext("/reconcileServiceIssue(...)");

                            oAction.setParameter("issueID", oIssue.ID);
                            oAction.setParameter("consumedQuantity", nConsumed);
                            oAction.setParameter("unusedReturnedQuantity", nUnused);
                            oAction.setParameter("defectiveReturnedQuantity", nDefective);

                            await oAction.execute();

                            oDialog.close();

                            MessageToast.show("Service issue reconciled.");

                            await that._loadData();

                        } catch (oError) {

                            console.error("Reconcile error:", oError);

                            oDialog.setBusy(false);

                            MessageBox.error(
                                (oError && oError.message) ||
                                "Failed to reconcile."
                            );
                        }
                    }
                }),

                endButton: new Button({
                    text: "Cancel",
                    press: function () {
                        oDialog.close();
                    }
                }),

                afterClose: function () {
                    oDialog.destroy();
                }
            });

            this.getView().addDependent(oDialog);

            oDialog.open();
        },


        // ================================================================
        // NAVIGATION
        // ================================================================

        onNavBack: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo("dashboard");
        }

    });
});