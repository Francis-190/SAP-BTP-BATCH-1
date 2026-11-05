sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    MessageToast,
    MessageBox
) {
    "use strict";

    return Controller.extend("inventorytest.controller.Inspection", {

        onInit: function () {

            this.getView().setModel(
                new JSONModel({
                    items: [],
                    selected: null,
                    qty: "",
                    scOptions: [{ key: "", text: "All Service Centers" }]
                }),
                "insp"
            );

            this._aAllItems = [];   // every kept-for-inspection item, before the filter

            this.getOwnerComponent()
                .getRouter()
                .getRoute("inspection")
                .attachPatternMatched(this._onRouteMatched, this);
        },


        _onRouteMatched: function () {

            this._clearSelection();

            const oFilter = this.byId("inspFilterServiceCenter");
            if (oFilter) {
                oFilter.setSelectedKey("");
            }

            this._loadItems();
        },


        // ================================================================
        // DATA LOADING
        // "Kept for inspection" = defectiveReturnedQuantity > 0 on a
        // service issue (this is what the Reconcile dialog records).
        // ================================================================

        _loadItems: async function () {

            let oBinding;

            try {

                const oModel = this.getOwnerComponent().getModel();

                oBinding = oModel.bindList(
                    "/ServicePartIssues",
                    null,
                    null,
                    [new Filter("defectiveReturnedQuantity", FilterOperator.GT, 0)],
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
                        serviceCenterID: oData.serviceCenter_ID || oCenter.ID || "",
                        partID: oData.part_ID || oPart.ID,
                        warehouseID: oData.warehouse_ID || oWarehouse.ID,
                        serviceCenter: oCenter.name || "",
                        serviceCenterCode: oCenter.serviceCenterCode || "",
                        partNumber: oPart.partNumber || "",
                        description: oPart.description || "",
                        warehouse: oWarehouse.name || "",
                        issuedQuantity: oData.issuedQuantity || 0,
                        consumedQuantity: oData.consumedQuantity || 0,
                        unusedReturnedQuantity: oData.unusedReturnedQuantity || 0,
                        defectiveQuantity: oData.defectiveReturnedQuantity || 0,
                        reference: oData.remarks || "",
                        dateTime: this._formatDateTime(oData.issueDate)
                    };

                }, this);

                this._aAllItems = aItems;

                this._rebuildFilterOptions();
                this._applyFilter();

            } catch (oError) {

                console.error("Error loading inspection items:", oError);

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
        // SERVICE CENTER FILTER
        // ================================================================

        // Build the dropdown from the service centers that have items
        _rebuildFilterOptions: function () {

            const oInsp = this.getView().getModel("insp");
            const oSelect = this.byId("inspFilterServiceCenter");

            const mSC = {};

            this._aAllItems.forEach(function (o) {

                if (o.serviceCenterID) {
                    mSC[o.serviceCenterID] =
                        o.serviceCenter + (o.serviceCenterCode ? " (" + o.serviceCenterCode + ")" : "");
                }
            });

            const sKept = oSelect.getSelectedKey();

            oInsp.setProperty(
                "/scOptions",
                [{ key: "", text: "All Service Centers" }].concat(
                    Object.keys(mSC)
                        .map(function (k) { return { key: k, text: mSC[k] }; })
                        .sort(function (a, b) { return a.text.localeCompare(b.text); })
                )
            );

            // keep the current selection, unless that center has no items left
            oSelect.setSelectedKey(mSC[sKept] ? sKept : "");
        },


        _applyFilter: function () {

            const sSC = this.byId("inspFilterServiceCenter").getSelectedKey();

            this.getView()
                .getModel("insp")
                .setProperty(
                    "/items",
                    this._aAllItems.filter(function (o) {
                        return !sSC || String(o.serviceCenterID) === String(sSC);
                    })
                );
        },


        onFilterChange: function () {

            this._applyFilter();
        },


        onRefresh: function () {

            this._loadItems();
        },


        // ================================================================
        // SELECTION / DETAILS
        // ================================================================

        onItemPress: function (oEvent) {

            const oItem = oEvent.getSource()
                .getBindingContext("insp")
                .getObject();

            const oInsp = this.getView().getModel("insp");

            oInsp.setProperty("/selected", Object.assign({}, oItem));
            oInsp.setProperty("/qty", String(oItem.defectiveQuantity));

            this.byId("inspDialog").open();
        },


        _clearSelection: function () {

            const oInsp = this.getView().getModel("insp");

            oInsp.setProperty("/selected", null);
            oInsp.setProperty("/qty", "");
        },


        onCloseDetails: function () {

            this.byId("inspDialog").close();
        },


        onDialogClosed: function () {

            this._clearSelection();
        },


        // ================================================================
        // RETURN TO WAREHOUSE / CONSUME
        // Both act on the quantity typed in the popup and both take
        // units out of "kept for inspection" (defectiveReturnedQuantity):
        //   returnFromInspection  -> units go back into warehouse stock
        //   consumeFromInspection -> units are written off as consumed
        // ================================================================

        // Returns the entered quantity, or null (after showing an error).
        _getValidQty: function (sVerb) {

            const oInsp = this.getView().getModel("insp");
            const oSelected = oInsp.getProperty("/selected");

            if (!oSelected) {
                return null;
            }

            const nQty = Number(oInsp.getProperty("/qty"));

            if (!Number.isInteger(nQty) || nQty <= 0) {

                MessageBox.error("Please enter a valid whole-number quantity.");
                return null;
            }

            if (nQty > oSelected.defectiveQuantity) {

                MessageBox.error(
                    "You can " + sVerb + " at most " +
                    oSelected.defectiveQuantity + " unit(s)."
                );

                return null;
            }

            return nQty;
        },


        onReturnToWarehouse: function () {

            const oSelected = this.getView().getModel("insp").getProperty("/selected");
            const nQty = this._getValidQty("return");

            if (!nQty) {
                return;
            }

            MessageBox.confirm(
                "Return " + nQty + " unit(s) of " + oSelected.partNumber +
                " to " + oSelected.warehouse + " stock?",
                {
                    title: "Return to Warehouse",
                    actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                    emphasizedAction: MessageBox.Action.OK,
                    onClose: function (sAction) {

                        if (sAction === MessageBox.Action.OK) {

                            this._runAction(
                                "returnFromInspection",
                                oSelected,
                                nQty,
                                nQty + " unit(s) returned to warehouse. Inventory updated.",
                                "Failed to return item to warehouse."
                            );
                        }

                    }.bind(this)
                }
            );
        },


        onConsume: function () {

            const oSelected = this.getView().getModel("insp").getProperty("/selected");
            const nQty = this._getValidQty("consume");

            if (!nQty) {
                return;
            }

            MessageBox.confirm(
                "Mark " + nQty + " unit(s) of " + oSelected.partNumber +
                " as consumed? They will not go back to warehouse stock.",
                {
                    title: "Consume",
                    actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                    emphasizedAction: MessageBox.Action.OK,
                    onClose: function (sAction) {

                        if (sAction === MessageBox.Action.OK) {

                            this._runAction(
                                "consumeFromInspection",
                                oSelected,
                                nQty,
                                nQty + " unit(s) marked as consumed.",
                                "Failed to consume item."
                            );
                        }

                    }.bind(this)
                }
            );
        },


        // Calls a service action (issueID, quantity), then closes the popup
        // and reloads the list.
        _runAction: async function (sAction, oSelected, nQty, sSuccess, sFailure) {

            const oDialog = this.byId("inspDialog");

            oDialog.setBusy(true);

            try {

                const oAction = this.getOwnerComponent()
                    .getModel()
                    .bindContext("/" + sAction + "(...)");

                oAction.setParameter("issueID", oSelected.ID);
                oAction.setParameter("quantity", nQty);

                await oAction.execute();

                MessageToast.show(sSuccess);

                oDialog.close();

                await this._loadItems();

            } catch (oError) {

                console.error(sAction + " error:", oError);

                MessageBox.error(
                    (oError && oError.message) || sFailure
                );

            } finally {

                oDialog.setBusy(false);
            }
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