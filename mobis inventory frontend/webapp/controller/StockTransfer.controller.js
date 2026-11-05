sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (
    Controller,
    JSONModel,
    MessageToast,
    MessageBox,
    Filter,
    FilterOperator
) {
    "use strict";

    return Controller.extend("inventorytest.controller.StockTransfer", {

        // ---------------------------------------------------------
        // INITIALIZE
        // ---------------------------------------------------------
        onInit: function () {

            this.getView().setModel(
                new JSONModel({
                    items: []
                }),
                "transferParts"
            );

            this._aSpareParts = [];

            this._loadSpareParts();
        },

        // ---------------------------------------------------------
        // LOAD ALL SPARE PARTS
        // ---------------------------------------------------------
        _loadSpareParts: async function () {

            try {

                var oModel =
                    this.getOwnerComponent().getModel();

                var oBinding =
                    oModel.bindList("/SpareParts");

                var aContexts =
                    await oBinding.requestContexts(0, 10000);

                this._aSpareParts =
                    aContexts.map(function (oContext) {
                        return oContext.getObject();
                    });

                this.getView()
                    .getModel("transferParts")
                    .setProperty(
                        "/items",
                        this._aSpareParts
                    );

            } catch (oError) {

                console.error(
                    "Error loading spare parts:",
                    oError
                );

                this._aSpareParts = [];
            }
        },

        // ---------------------------------------------------------
        // LOAD PARTS FOR SELECTED FROM LOCATION
        // ---------------------------------------------------------
        _loadPartsForLocation: async function (sLocationId) {

            var oTransferPartsModel =
                this.getView().getModel("transferParts");

            var oPartSelect =
                this.byId("transferPartSelect");

            try {

                if (!sLocationId) {

                    oTransferPartsModel.setProperty(
                        "/items",
                        this._aSpareParts
                    );

                    oPartSelect.setSelectedKey("");

                    return;
                }

                var oModel =
                    this.getOwnerComponent().getModel();

                var oBinding =
                    oModel.bindList(
                        "/Inventory",
                        null,
                        null,
                        [
                            new Filter(
                                "location_ID",
                                FilterOperator.EQ,
                                sLocationId
                            )
                        ],
                        {
                            "$expand": "part"
                        }
                    );

                var aContexts =
                    await oBinding.requestContexts(
                        0,
                        10000
                    );

                var aInventory =
                    aContexts.map(function (oContext) {
                        return oContext.getObject();
                    });

                console.log(
                    "Selected From Location:",
                    sLocationId
                );

                console.log(
                    "Inventory records:",
                    aInventory
                );

                var aParts = [];

                aInventory.forEach(function (oInventory) {

                    if (
                        oInventory.part &&
                        oInventory.part.ID
                    ) {

                        var bExists =
                            aParts.some(function (oPart) {

                                return String(oPart.ID) ===
                                    String(oInventory.part.ID);

                            });

                        if (!bExists) {

                            aParts.push(
                                oInventory.part
                            );
                        }
                    }
                });

                // Fallback if expanded part is not available
                if (
                    aParts.length === 0 &&
                    aInventory.length > 0
                ) {

                    var aPartIds =
                        aInventory
                            .map(function (oInventory) {
                                return oInventory.part_ID;
                            })
                            .filter(Boolean);

                    aParts =
                        this._aSpareParts.filter(
                            function (oPart) {

                                return aPartIds.some(
                                    function (sPartId) {

                                        return String(sPartId) ===
                                            String(oPart.ID);

                                    }
                                );

                            }
                        );
                }

                console.log(
                    "Parts available at selected location:",
                    aParts
                );

                oTransferPartsModel.setProperty(
                    "/items",
                    aParts
                );

                oPartSelect.setSelectedKey("");

            } catch (oError) {

                console.error(
                    "Error loading parts for location:",
                    oError
                );

                oTransferPartsModel.setProperty(
                    "/items",
                    []
                );

                oPartSelect.setSelectedKey("");

                MessageBox.error(
                    "Unable to load spare parts for the selected warehouse."
                );
            }
        },

        // ---------------------------------------------------------
        // FROM LOCATION CHANGE
        // ---------------------------------------------------------
        onFromLocationChange: function (oEvent) {

            var sLocationId =
                oEvent.getSource().getSelectedKey();

            this._loadPartsForLocation(
                sLocationId
            );
        },

        // ---------------------------------------------------------
        // FILTER SEARCH
        // ---------------------------------------------------------
        onFilterSearch: function () {

            var oTable =
                this.byId("transferTable");

            var oBinding =
                oTable.getBinding("items");

            if (!oBinding) {
                return;
            }

            var aFilters = [];

            var sFromLocation =
                this.byId("transferFromFilter")
                    .getValue()
                    .trim();

            var sToLocation =
                this.byId("transferToFilter")
                    .getValue()
                    .trim();

            var sPartNumber =
                this.byId("transferPartFilter")
                    .getValue()
                    .trim();

            var sStatus =
                this.byId("transferStatusFilter")
                    .getSelectedKey();

            // FROM LOCATION
            if (sFromLocation) {

                aFilters.push(
                    new Filter(
                        "fromLocation/name",
                        FilterOperator.Contains,
                        sFromLocation
                    )
                );
            }

            // TO LOCATION
            if (sToLocation) {

                aFilters.push(
                    new Filter(
                        "toLocation/name",
                        FilterOperator.Contains,
                        sToLocation
                    )
                );
            }

            // PART NUMBER
            if (sPartNumber) {

                aFilters.push(
                    new Filter(
                        "part/partNumber",
                        FilterOperator.Contains,
                        sPartNumber
                    )
                );
            }

            // STATUS
            if (sStatus === "APPROVED") {

                aFilters.push(
                    new Filter({
                        filters: [
                            new Filter(
                                "status",
                                FilterOperator.EQ,
                                "APPROVED"
                            ),
                            new Filter(
                                "status",
                                FilterOperator.EQ,
                                "Approved"
                            )
                        ],
                        and: false
                    })
                );

            } else if (sStatus === "REJECTED") {

                aFilters.push(
                    new Filter({
                        filters: [
                            new Filter(
                                "status",
                                FilterOperator.EQ,
                                "REJECTED"
                            ),
                            new Filter(
                                "status",
                                FilterOperator.EQ,
                                "Rejected"
                            )
                        ],
                        and: false
                    })
                );

            } else if (sStatus === "PENDING") {

                aFilters.push(
                    new Filter({
                        filters: [
                            new Filter(
                                "status",
                                FilterOperator.EQ,
                                "PENDING"
                            ),
                            new Filter(
                                "status",
                                FilterOperator.EQ,
                                "Pending"
                            )
                        ],
                        and: false
                    })
                );
            }

            oBinding.filter(
                aFilters,
                "Application"
            );
        },

        // ---------------------------------------------------------
        // FILTER CLEAR
        // ---------------------------------------------------------
        onFilterClear: function () {

            this.byId("transferFromFilter")
                .setValue("");

            this.byId("transferToFilter")
                .setValue("");

            this.byId("transferPartFilter")
                .setValue("");

            this.byId("transferStatusFilter")
                .setSelectedKey("");

            var oTable =
                this.byId("transferTable");

            var oBinding =
                oTable.getBinding("items");

            if (oBinding) {

                oBinding.filter(
                    [],
                    "Application"
                );
            }
        },

        // ---------------------------------------------------------
        // CREATE TRANSFER
        // ---------------------------------------------------------
        onTransfer: async function () {

            var oView =
                this.getView();

            var oModel =
                this.getOwnerComponent().getModel();

            var sFromLocation =
                this.byId("transferFromSelect")
                    .getSelectedKey();

            var sPart =
                this.byId("transferPartSelect")
                    .getSelectedKey();

            var sToLocation =
                this.byId("transferToSelect")
                    .getSelectedKey();

            var sQuantity =
                this.byId("transferQtyInput")
                    .getValue();

            var iQuantity =
                Number(sQuantity);

            // VALIDATION

            if (!sFromLocation) {

                MessageBox.error(
                    "Please select From Location."
                );

                return;
            }

            if (!sPart) {

                MessageBox.error(
                    "Please select Spare Part."
                );

                return;
            }

            if (!sToLocation) {

                MessageBox.error(
                    "Please select To Location."
                );

                return;
            }

            if (sFromLocation === sToLocation) {

                MessageBox.error(
                    "From Location and To Location cannot be the same."
                );

                return;
            }

            if (!iQuantity || iQuantity <= 0) {

                MessageBox.error(
                    "Please enter a valid quantity."
                );

                return;
            }

            // CREATE STOCK TRANSFER REQUEST

            try {

                var oListBinding =
                    oModel.bindList(
                        "/StockTransferRequests"
                    );

                var oContext =
                    oListBinding.create({

                        part_ID:
                            sPart,

                        fromLocation_ID:
                            sFromLocation,

                        toLocation_ID:
                            sToLocation,

                        quantity:
                            iQuantity,

                        status:
                            "PENDING"

                    });

                await oContext.created();

                MessageToast.show(
                    "Stock transfer request created successfully."
                );

                // CLEAR FORM

                this.byId("transferFromSelect")
                    .setSelectedKey("");

                this.byId("transferPartSelect")
                    .setSelectedKey("");

                this.byId("transferToSelect")
                    .setSelectedKey("");

                this.byId("transferQtyInput")
                    .setValue("");

                // RESTORE ALL PARTS

                this.getView()
                    .getModel("transferParts")
                    .setProperty(
                        "/items",
                        this._aSpareParts
                    );

                // REFRESH TABLE

                var oTable =
                    this.byId("transferTable");

                var oBinding =
                    oTable.getBinding("items");

                if (oBinding) {
                    oBinding.refresh();
                }

            } catch (oError) {

                console.error(
                    "Error creating stock transfer:",
                    oError
                );

                MessageBox.error(
                    "Failed to create stock transfer request."
                );
            }
        },

        // ---------------------------------------------------------
        // NAV BACK
        // ---------------------------------------------------------
        onNavBack: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo("dashboard");
        }

    });
});