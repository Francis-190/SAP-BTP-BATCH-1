sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Input",
    "sap/m/Label",
    "sap/m/Text",
    "sap/m/VBox",
    "sap/m/MessageBox",
      "sap/ui/layout/form/SimpleForm"
], function (Controller, JSONModel, Dialog, Button, Input, Label, Text, VBox, MessageBox,SimpleForm) {
    "use strict";

    return Controller.extend("inventorytest.controller.InventoryList", {

        onInit: function () {

            this._sCurrentFilter = "all";
            this._sLocationFilter = "";
            this._sPartNumberFilter = "";

            // Auto refresh state
            this._iRefreshTimer = null;
            this._bLoading = false;
            this._sSnapshot = "";
            this._iRefreshSeconds = 30;

            this.getView().setModel(
                new JSONModel({
                    allItems: [],
                    items: [],
                    locations: [],
                    filterParts: [],
                    showRaisePR: false,
                    lastUpdated: ""
                }),
                "inventoryList"
            );

            this.getOwnerComponent()
                .getRouter()
                .getRoute("inventory")
                .attachPatternMatched(
                    this._onRouteMatched,
                    this
                );

            // Stop the timer as soon as another page is opened.
            this.getOwnerComponent()
                .getRouter()
                .attachRouteMatched(
                    this._onAnyRouteMatched,
                    this
                );

            this._loadInventory();
        },


        _loadInventory: async function (bSilent) {

            // Never run two loads at the same time.
            if (this._bLoading) {
                return;
            }

            this._bLoading = true;

            let oInvBinding;

            try {

                const oModel =
                    this.getOwnerComponent().getModel();

                oInvBinding = oModel.bindList(
                    "/Inventory",
                    null,
                    [],
                    [],
                    {
                        $expand: "part,location"
                    }
                );

                const aContexts =
                    await oInvBinding.requestContexts(
                        0,
                        10000
                    );

                const aInventory =
                    aContexts.map(function (oContext) {

                        const oRow =
                            oContext.getObject();

                        const iReorderLevel =
                            oRow.reorderLevel !== null &&
                            oRow.reorderLevel !== undefined
                                ? oRow.reorderLevel
                                : (
                                    oRow.part &&
                                    oRow.part.reorderLevel !== null &&
                                    oRow.part.reorderLevel !== undefined
                                        ? oRow.part.reorderLevel
                                        : 0
                                );

                        let sStatus;
                        let sStatusState;

                        if (oRow.quantityOnHand <= 0) {

                            sStatus = "Out of Stock";
                            sStatusState = "Error";

                        } else if (
                            oRow.quantityOnHand <=
                            iReorderLevel
                        ) {

                            sStatus = "Low Stock";
                            sStatusState = "Warning";

                        } else {

                            sStatus = "Healthy";
                            sStatusState = "Success";
                        }

                        return {

                            ID: oRow.ID,

                            locationID:
                                oRow.location_ID,

                            locationName:
                                oRow.location
                                    ? oRow.location.name
                                    : oRow.location_ID,

                            partID:
                                oRow.part_ID,

                            partNumber:
                                oRow.part
                                    ? oRow.part.partNumber
                                    : oRow.part_ID,

                            description:
                                oRow.part
                                    ? oRow.part.description
                                    : "",

                            quantityOnHand:
                                oRow.quantityOnHand,

                            reorderLevel:
                                iReorderLevel,

                            status:
                                sStatus,

                            statusState:
                                sStatusState
                        };
                    });


                // On a silent (automatic) refresh, do nothing if the
                // data has not changed. This keeps the table, scroll
                // position and "show more" state exactly as they are.
                const sSnapshot =
                    JSON.stringify(aInventory);

                if (
                    bSilent === true &&
                    sSnapshot === this._sSnapshot
                ) {
                    this._setLastUpdated();
                    return;
                }

                this._sSnapshot = sSnapshot;


                const oInventoryListModel =
                    this.getView()
                        .getModel("inventoryList");


                oInventoryListModel.setData({

                    allItems:
                        aInventory,

                    items:
                        aInventory.slice(),

                    locations: [],

                    filterParts: []

                });


                this._applyRouteFilter();

                this._setLastUpdated();

            } catch (oError) {

                console.error(
                    "Failed to load inventory:",
                    oError
                );

            } finally {

                this._bLoading = false;

                if (oInvBinding) {
                    oInvBinding.destroy();
                }
            }
        },


        /* ============================================================
         * STATUS FILTER
         * ============================================================ */

        _getStatusFilteredItems: function (
            aInventory
        ) {

            const sFilter =
                this._sCurrentFilter || "all";

            switch (sFilter) {

                case "lowStock":

                    return aInventory.filter(
                        function (oItem) {

                            return oItem.status ===
                                "Low Stock";
                        }
                    );


                case "outOfStock":

                    return aInventory.filter(
                        function (oItem) {

                            return oItem.status ===
                                "Out of Stock";
                        }
                    );


                case "healthy":

                    return aInventory.filter(
                        function (oItem) {

                            return oItem.status ===
                                "Healthy";
                        }
                    );


                default:

                    return aInventory.slice();
            }
        },


        /* ============================================================
         * LOCATION DROPDOWN
         * ============================================================ */

        _updateLocationFilterItems: function (
            aItems
        ) {

            const oModel =
                this.getView()
                    .getModel("inventoryList");


            const aLocationNames = [
                ...new Set(
                    aItems
                        .map(function (oItem) {

                            return oItem.locationName;

                        })
                        .filter(Boolean)
                )
            ].sort();


            const aLocations =
                aLocationNames.map(
                    function (sLocation) {

                        return {
                            key: sLocation,
                            text: sLocation
                        };

                    }
                );


            oModel.setProperty(
                "/locations",
                aLocations
            );
        },


        /* ============================================================
         * PART NUMBER FILTER DATA
         * ============================================================ */

        _getPartsForLocation: function (
            aInventory,
            sLocation
        ) {

            const sSelectedLocation =
                String(
                    sLocation || ""
                )
                    .trim()
                    .toLowerCase();


            let aItems;


            if (!sSelectedLocation) {

                aItems =
                    aInventory;

            } else {

                aItems =
                    aInventory.filter(
                        function (oItem) {

                            return String(
                                oItem.locationName || ""
                            )
                                .trim()
                                .toLowerCase() ===
                                sSelectedLocation;

                        }
                    );
            }


            const oParts = {};


            aItems.forEach(
                function (oItem) {

                    if (
                        oItem.partNumber &&
                        !oParts[oItem.partNumber]
                    ) {

                        oParts[oItem.partNumber] = {

                            partNumber:
                                oItem.partNumber,

                            description:
                                oItem.description || ""
                        };
                    }
                }
            );


            return Object.values(oParts).sort(
                function (a, b) {

                    return String(
                        a.partNumber
                    ).localeCompare(
                        String(b.partNumber)
                    );
                }
            );
        },


        /* ============================================================
         * UPDATE FILTER DROPDOWNS
         * ============================================================ */

        _updateFilterDropdowns: function () {

            const oModel =
                this.getView()
                    .getModel("inventoryList");


            const aAllItems =
                oModel.getProperty(
                    "/allItems"
                ) || [];


            const aStatusItems =
                this._getStatusFilteredItems(
                    aAllItems
                );


            /* Update Location dropdown */
            this._updateLocationFilterItems(
                aStatusItems
            );


            /* Update Part Number dropdown */
            const aFilterParts =
                this._getPartsForLocation(
                    aStatusItems,
                    this._sLocationFilter
                );


            oModel.setProperty(
                "/filterParts",
                aFilterParts
            );


            /*
             * Keep the Select controls synchronized
             * with the actual filter state.
             *
             * This prevents UI5 from automatically
             * displaying the first dynamic item.
             */

            const oLocationSelect =
                this.byId(
                    "locationFilterSelect"
                );


            const oPartSelect =
                this.byId(
                    "partFilterSelect"
                );


            if (oLocationSelect) {

                oLocationSelect.setSelectedKey(
                    this._sLocationFilter || ""
                );
            }


            if (oPartSelect) {

                oPartSelect.setSelectedKey(
                    this._sPartNumberFilter || ""
                );
            }
        },


        /* ============================================================
         * LOCATION CHANGE
         * ============================================================ */

        onLocationFilterChange: function (
            oEvent
        ) {

            const sLocation =
                oEvent.getSource()
                    .getSelectedKey();


            this._sLocationFilter =
                sLocation;


            /*
             * Reset Part Number whenever
             * Location changes.
             */

            this._sPartNumberFilter =
                "";


            const oPartSelect =
                this.byId(
                    "partFilterSelect"
                );


            if (oPartSelect) {

                oPartSelect.setSelectedKey("");
            }


            const oModel =
                this.getView()
                    .getModel("inventoryList");


            const aAllItems =
                oModel.getProperty(
                    "/allItems"
                ) || [];


            const aStatusItems =
                this._getStatusFilteredItems(
                    aAllItems
                );


            const aFilterParts =
                this._getPartsForLocation(
                    aStatusItems,
                    sLocation
                );


            oModel.setProperty(
                "/filterParts",
                aFilterParts
            );


            /*
             * Make sure Part Number remains empty
             * after its items are rebuilt.
             */

            if (oPartSelect) {

                oPartSelect.setSelectedKey("");
            }
        },


        /* ============================================================
         * ROUTE MATCHED
         * ============================================================ */

        _onRouteMatched: function (
            oEvent
        ) {

            const oArguments =
                oEvent.getParameter(
                    "arguments"
                );


            this._sCurrentFilter =
                oArguments.filter || "all";


            /*
             * Always start with empty manual filters
             * when entering a dashboard status.
             */

            this._sLocationFilter =
                "";

            this._sPartNumberFilter =
                "";


            const oLocationSelect =
                this.byId(
                    "locationFilterSelect"
                );


            const oPartSelect =
                this.byId(
                    "partFilterSelect"
                );


            if (oLocationSelect) {

                oLocationSelect.setSelectedKey("");
            }


            if (oPartSelect) {

                oPartSelect.setSelectedKey("");
            }


            this._applyRouteFilter();

            // Show the latest data and start the automatic refresh.
            this._loadInventory(true);
            this._startAutoRefresh();
        },


        /* ============================================================
         * SEARCH / GO
         * ============================================================ */

        onFilterSearch: function () {

            const oLocationSelect =
                this.byId(
                    "locationFilterSelect"
                );


            const oPartSelect =
                this.byId(
                    "partFilterSelect"
                );


            this._sLocationFilter =
                oLocationSelect
                    ? oLocationSelect.getSelectedKey()
                    : "";


            this._sPartNumberFilter =
                oPartSelect
                    ? oPartSelect.getSelectedKey()
                    : "";


            this._applyRouteFilter();
        },


        /* ============================================================
         * CLEAR FILTERS
         * ============================================================ */

        onFilterClear: function () {

            this._sLocationFilter =
                "";

            this._sPartNumberFilter =
                "";


            const oLocationSelect =
                this.byId(
                    "locationFilterSelect"
                );


            const oPartSelect =
                this.byId(
                    "partFilterSelect"
                );


            if (oLocationSelect) {

                oLocationSelect.setSelectedKey("");
            }


            if (oPartSelect) {

                oPartSelect.setSelectedKey("");
            }


            this._updateFilterDropdowns();


            /*
             * Explicitly keep both controls empty
             * after dropdown refresh.
             */

            if (oLocationSelect) {

                oLocationSelect.setSelectedKey("");
            }


            if (oPartSelect) {

                oPartSelect.setSelectedKey("");
            }


            this._applyRouteFilter();
        },


        /* ============================================================
         * APPLY FILTERS
         * ============================================================ */

        _applyRouteFilter: function () {

            const oModel =
                this.getView()
                    .getModel("inventoryList");


            if (!oModel) {
                return;
            }


            const aAllItems =
                oModel.getProperty(
                    "/allItems"
                ) || [];


            const sFilter =
                this._sCurrentFilter || "all";


            // The Raise PR column is only shown on the Low Stock list.
            oModel.setProperty(
                "/showRaisePR",
                sFilter === "lowStock"  || sFilter === "outOfStock"
            );


            const sLocation =
                String(
                    this._sLocationFilter || ""
                )
                    .trim()
                    .toLowerCase();


            const sPartNumber =
                String(
                    this._sPartNumberFilter || ""
                )
                    .trim()
                    .toLowerCase();


            /*
             * First apply dashboard status.
             */

            let aFilteredItems =
                this._getStatusFilteredItems(
                    aAllItems
                );


            /*
             * Refresh dropdown data.
             */

            this._updateFilterDropdowns();


            /*
             * Location filter.
             */

            if (sLocation) {

                aFilteredItems =
                    aFilteredItems.filter(
                        function (oItem) {

                            return String(
                                oItem.locationName || ""
                            )
                                .trim()
                                .toLowerCase() ===
                                sLocation;

                        }
                    );
            }


            /*
             * Part Number filter.
             */

            if (sPartNumber) {

                aFilteredItems =
                    aFilteredItems.filter(
                        function (oItem) {

                            return String(
                                oItem.partNumber || ""
                            )
                                .trim()
                                .toLowerCase() ===
                                sPartNumber;

                        }
                    );
            }


            /*
             * Update table.
             */

            oModel.setProperty(
                "/items",
                aFilteredItems
            );


            /*
             * Page title.
             */

            const oPage =
                this.byId(
                    "inventoryListPage"
                );


            if (!oPage) {
                return;
            }


            switch (sFilter) {

                case "lowStock":

                    oPage.setTitle(
                        "Inventory List - Low Stock"
                    );

                    break;


                case "outOfStock":

                    oPage.setTitle(
                        "Inventory List - Out of Stock"
                    );

                    break;


                case "healthy":

                    oPage.setTitle(
                        "Inventory List - Healthy"
                    );

                    break;


                default:

                    oPage.setTitle(
                        "Inventory List"
                    );

                    break;
            }
        },


        /* ============================================================
         * RAISE PURCHASE REQUISITION (Low Stock list only)
         * ============================================================ */

        onRaisePRPress: function (oEvent) {

            const oRow =
                oEvent.getSource()
                    .getBindingContext("inventoryList")
                    .getObject();

            this._openRaisePRDialog(oRow);
        },


      _openRaisePRDialog: function (oRow) {

    const iSuggested = Math.max(
        (oRow.reorderLevel || 0) - (oRow.quantityOnHand || 0),
        1
    );

    const oQtyInput = new Input({
        type: "Number",
        width: "100%",
        value: String(iSuggested),
        valueStateText: "Enter a whole number greater than 0.",
        liveChange: function (oEvt) {
            oEvt.getSource().setValueState("None");
        }
    });

    const oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        adjustLabelSpan: false,
        singleContainerFullSize: false,
        labelSpanXL: 4,
        labelSpanL: 4,
        labelSpanM: 4,
        labelSpanS: 12,
        emptySpanXL: 0,
        emptySpanL: 0,
        emptySpanM: 0,
        emptySpanS: 0,
        columnsXL: 1,
        columnsL: 1,
        columnsM: 1,
        content: [
            new Label({ text: "Part Number" }),
            new Text({ text: oRow.partNumber }),

            new Label({ text: "Description" }),
            new Text({ text: oRow.description || "-" }),

            new Label({ text: "Location" }),
            new Text({ text: oRow.locationName }),

            new Label({ text: "On Hand" }),
            new Text({ text: String(oRow.quantityOnHand) }),

            new Label({ text: "Reorder Level" }),
            new Text({ text: String(oRow.reorderLevel) }),

            new Label({
                text: "Quantity to Order",
                labelFor: oQtyInput,
                required: true
            }),
            oQtyInput
        ]
    });

    const oDialog = new Dialog({
        title: "Raise Purchase Requisition",
        contentWidth: "30rem",
        initialFocus: oQtyInput,
        content: [oForm],
        beginButton: new Button({
            text: "Raise PR",
            type: "Emphasized",
            press: function () {
                this._submitRaisePR(oDialog, oQtyInput, oRow);
            }.bind(this)
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


        _submitRaisePR: async function (oDialog, oQtyInput, oRow) {

            const iQuantity = parseInt(oQtyInput.getValue(), 10);

            if (!(iQuantity > 0)) {
                oQtyInput.setValueState("Error");
                return;
            }

            const oModel = this.getOwnerComponent().getModel();

            oDialog.setBusy(true);

            try {

                // raisePurchaseRequisition is bound to Inventory, so the
                // call goes through the Inventory key path.
                const oAction = oModel.bindContext(
                    "/Inventory(part_ID=" + oRow.partID +
                    ",location_ID=" + oRow.locationID +
                    ")/InventoryService.raisePurchaseRequisition(...)"
                );

                oAction.setParameter("quantity", iQuantity);

                await oAction.execute();

                const oResult = oAction.getBoundContext().getObject();
                const sMessage =
                    (oResult && oResult.value) ||
                    "Purchase requisition created.";

                oDialog.close();

                MessageBox.success(sMessage, {
                    actions: ["View requisitions", MessageBox.Action.CLOSE],
                    emphasizedAction: "View requisitions",
                    onClose: function (sAction) {
                        if (sAction === "View requisitions") {
                            this.getOwnerComponent()
                                .getRouter()
                                .navTo("purchaseRequisitions");
                        }
                    }.bind(this)
                });

            } catch (oError) {

                console.error("Raise PR error:", oError);

                oDialog.setBusy(false);

                MessageBox.error(
                    (oError && oError.message) ||
                    "Failed to raise purchase requisition."
                );
            }
        },


        /* ============================================================
         * NAVIGATION BACK
         * ============================================================ */

        /* ============================================================
         * AUTO REFRESH
         * ============================================================ */

        _setLastUpdated: function () {

            const oModel =
                this.getView()
                    .getModel("inventoryList");

            if (oModel) {

                oModel.setProperty(
                    "/lastUpdated",
                    new Date().toLocaleTimeString()
                );
            }
        },


        _startAutoRefresh: function () {

            this._stopAutoRefresh();

            this._iRefreshTimer = setInterval(
                function () {

                    // Do not load data while the browser tab is hidden.
                    if (document.hidden) {
                        return;
                    }

                    this._loadInventory(true);

                }.bind(this),
                this._iRefreshSeconds * 1000
            );
        },


        _stopAutoRefresh: function () {

            if (this._iRefreshTimer) {

                clearInterval(this._iRefreshTimer);

                this._iRefreshTimer = null;
            }
        },


        _onAnyRouteMatched: function (oEvent) {

            if (oEvent.getParameter("name") !== "inventory") {

                this._stopAutoRefresh();
            }
        },


        onRefreshInventory: function () {

            this._loadInventory(false);
        },


        onExit: function () {

            this._stopAutoRefresh();

            this.getOwnerComponent()
                .getRouter()
                .detachRouteMatched(
                    this._onAnyRouteMatched,
                    this
                );
        },


        /* ============================================================
         * NAVIGATION BACK
         * ============================================================ */

        onNavBack: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo("dashboard");

        }

    });
});