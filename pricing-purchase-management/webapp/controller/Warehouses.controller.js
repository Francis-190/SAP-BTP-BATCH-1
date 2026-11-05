sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/VBox",
    "sap/m/Input",
    "sap/m/Label",
    "sap/m/Button",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (
    Controller,
    MessageToast,
    MessageBox,
    Dialog,
    VBox,
    Input,
    Label,
    Button,
    Filter,
    FilterOperator
) {
    "use strict";

    return Controller.extend(
        "purchasemanagement.controller.Warehouses",
        {

            // ========================================================
            // INIT
            // ========================================================

            onInit: function () {

                this._oSelectedContext = null;

                var oTable =
                    this.byId("warehousesTable");

                if (oTable) {
                    oTable.attachUpdateFinished(
                        this._updateWarehouseCount,
                        this
                    );
                }
            },


            // ========================================================
            // UPDATE COUNT
            // ========================================================

            _updateWarehouseCount: function () {

                var oTable =
                    this.byId("warehousesTable");

                if (!oTable) {
                    return;
                }

                var iCount =
                    oTable.getItems().length;

                this.byId("warehousesCountValue")
                    .setText(String(iCount));
            },


            // ========================================================
            // SEARCH
            // ========================================================

            onSearch: function (oEvent) {

                var sSearchValue =
                    oEvent.getParameter("newValue") || "";

                this._applyFilters(sSearchValue);
            },


            // ========================================================
            // FILTER CHANGE
            // ========================================================

            onFilterChange: function () {

                var sSearchValue =
                    this.byId("warehousesSearchField")
                        .getValue();

                this._applyFilters(sSearchValue);
            },


            // ========================================================
            // APPLY FILTERS
            // ========================================================

            _applyFilters: function (sSearchValue) {

                var oTable =
                    this.byId("warehousesTable");

                if (!oTable) {
                    return;
                }

                var oBinding =
                    oTable.getBinding("items");

                if (!oBinding) {
                    return;
                }

                var aFilters = [];


                // ----------------------------------------------------
                // SEARCH FILTER
                // ----------------------------------------------------

                if (sSearchValue) {

                    aFilters.push(
                        new Filter({
                            filters: [

                                new Filter(
                                    "warehouseCode",
                                    FilterOperator.Contains,
                                    sSearchValue
                                ),

                                new Filter(
                                    "warehouseName",
                                    FilterOperator.Contains,
                                    sSearchValue
                                ),

                                new Filter(
                                    "city",
                                    FilterOperator.Contains,
                                    sSearchValue
                                )

                            ],
                            and: false
                        })
                    );
                }


                // ----------------------------------------------------
                // STATUS FILTER
                // ----------------------------------------------------

                var sStatus =
                    this.byId("warehousesStatusSelect")
                        .getSelectedKey();

                if (sStatus !== "") {

                    aFilters.push(
                        new Filter(
                            "active",
                            FilterOperator.EQ,
                            sStatus === "true"
                        )
                    );
                }


                oBinding.filter(aFilters);
            },


            // ========================================================
            // SELECTION
            // ========================================================

            onSelectionChange: function (oEvent) {

                var oItem =
                    oEvent.getParameter("listItem");

                if (oItem) {

                    this._oSelectedContext =
                        oItem.getBindingContext("purchase");

                } else {

                    this._oSelectedContext = null;
                }


                var bSelected =
                    !!this._oSelectedContext;


                this._setActionButtonsEnabled(
                    bSelected
                );
            },


            // ========================================================
            // ENABLE / DISABLE BUTTONS
            // ========================================================

            _setActionButtonsEnabled: function (bEnabled) {

                this.byId("warehousesViewButton")
                    .setEnabled(bEnabled);

                this.byId("warehousesEditButton")
                    .setEnabled(bEnabled);

                this.byId("warehousesToggleButton")
                    .setEnabled(bEnabled);

                this.byId("warehousesDeleteButton")
                    .setEnabled(bEnabled);
            },


            // ========================================================
            // CREATE WAREHOUSE
            // ========================================================

            onCreateWarehouse: function () {

                var oNameInput =
                    new Input({
                        width: "100%",
                        placeholder: "Enter warehouse name"
                    });

                var oAddressInput =
                    new Input({
                        width: "100%",
                        placeholder: "Enter address"
                    });

                var oCityInput =
                    new Input({
                        width: "100%",
                        placeholder: "Enter city"
                    });

                var oStateInput =
                    new Input({
                        width: "100%",
                        placeholder: "Enter state"
                    });

                var oCountryInput =
                    new Input({
                        width: "100%",
                        value: "India"
                    });


                var oForm =
                    new VBox({
                        width: "100%",
                        items: [

                            new Label({
                                text: "Warehouse Name",
                                required: true
                            }),

                            oNameInput,

                            new Label({
                                text: "Address",
                                required: true
                            }),

                            oAddressInput,

                            new Label({
                                text: "City",
                                required: true
                            }),

                            oCityInput,

                            new Label({
                                text: "State",
                                required: true
                            }),

                            oStateInput,

                            new Label({
                                text: "Country",
                                required: true
                            }),

                            oCountryInput

                        ]
                    });

                oForm.addStyleClass("sapUiMediumMargin");


                var oDialog =
                    new Dialog({

                        title: "Create Warehouse",

                        contentWidth: "43rem",

                        class: "sapUiSmallPadding",

                        content: [
                            oForm
                        ],

                        beginButton:
                            new Button({

                                text: "Create",

                                type: "Emphasized",

                                press:
                                    async function () {

                                        await this._createWarehouse(
                                            oDialog,
                                            oNameInput,
                                            oAddressInput,
                                            oCityInput,
                                            oStateInput,
                                            oCountryInput
                                        );

                                    }.bind(this)
                            }),

                        endButton:
                            new Button({

                                text: "Cancel",

                                press: function () {

                                    oDialog.close();

                                }
                            }),

                        afterClose: function () {

                            oDialog.destroy();

                        }
                    })


                this.getView()
                    .addDependent(oDialog);

                oDialog.open();
            },


            // ========================================================
            // CREATE WAREHOUSE - BACKEND
            // ========================================================

            _createWarehouse: async function (
                oDialog,
                oNameInput,
                oAddressInput,
                oCityInput,
                oStateInput,
                oCountryInput
            ) {

                var sName =
                    oNameInput.getValue().trim();

                var sAddress =
                    oAddressInput.getValue().trim();

                var sCity =
                    oCityInput.getValue().trim();

                var sState =
                    oStateInput.getValue().trim();

                var sCountry =
                    oCountryInput.getValue().trim();


                // ----------------------------------------------------
                // VALIDATION
                // ----------------------------------------------------

                if (!sName) {

                    MessageBox.warning(
                        "Warehouse Name is required."
                    );

                    return;
                }


                if (!sAddress) {

                    MessageBox.warning(
                        "Address is required."
                    );

                    return;
                }


                if (!sCity) {

                    MessageBox.warning(
                        "City is required."
                    );

                    return;
                }


                if (!sState) {

                    MessageBox.warning(
                        "State is required."
                    );

                    return;
                }


                if (!sCountry) {

                    MessageBox.warning(
                        "Country is required."
                    );

                    return;
                }


                // ----------------------------------------------------
                // GET MODEL
                // ----------------------------------------------------

                var oModel =
                    this.getView()
                        .getModel("purchase");

                if (!oModel) {

                    MessageBox.error(
                        "Purchase model is not available."
                    );

                    return;
                }


                try {

                    // ------------------------------------------------
                    // IMPORTANT
                    //
                    // Service entity:
                    //     warehouse
                    //
                    // OData:
                    //     /odata/v4/purchase-order/warehouse
                    // ------------------------------------------------

                    var oListBinding =
                        oModel.bindList(
                            "/warehouse"
                        );


                    // ------------------------------------------------
                    // CREATE
                    //
                    // DO NOT send warehouseCode.
                    // Backend generates:
                    //
                    // WH-NEL-001
                    // WH-BLR-002
                    // WH-CHN-002
                    // ------------------------------------------------

                    var oContext =
                        oListBinding.create({

                            warehouseName:
                                sName,

                            address:
                                sAddress,

                            city:
                                sCity,

                            state:
                                sState,

                            country:
                                sCountry,

                            active:
                                true

                        });


                    // ------------------------------------------------
                    // WAIT FOR POST
                    // ------------------------------------------------

                    await oContext.created();


                    // ------------------------------------------------
                    // SUCCESS
                    // ------------------------------------------------

                    MessageToast.show(
                        "Warehouse created successfully."
                    );


                    oDialog.close();


                    /*
                     * IMPORTANT:
                     *
                     * DO NOT call:
                     *
                     * oBinding.refresh()
                     *
                     * here.
                     *
                     * That was causing:
                     *
                     * No key predicate known
                     *
                     * for the transient context.
                     */


                } catch (oError) {

                    console.error(
                        "Create Warehouse Error:",
                        oError
                    );


                    MessageBox.error(
                        "Unable to create warehouse.\n\n" +
                        (
                            oError.message ||
                            "Unknown error"
                        )
                    );
                }
            },


            // ========================================================
            // VIEW WAREHOUSE
            // ========================================================

            onViewWarehouse: function () {

                if (!this._oSelectedContext) {
                    return;
                }


                var oWarehouse =
                    this._oSelectedContext.getObject();


                MessageBox.information(

                    "Warehouse Code: " +
                    (
                        oWarehouse.warehouseCode ||
                        "-"
                    ) +

                    "\n\nWarehouse Name: " +
                    (
                        oWarehouse.warehouseName ||
                        "-"
                    ) +

                    "\n\nCity: " +
                    (
                        oWarehouse.city ||
                        "-"
                    ) +

                    "\n\nState: " +
                    (
                        oWarehouse.state ||
                        "-"
                    ) +

                    "\n\nCountry: " +
                    (
                        oWarehouse.country ||
                        "-"
                    ) +

                    "\n\nAddress: " +
                    (
                        oWarehouse.address ||
                        "-"
                    )

                );
            },


            // ========================================================
            // EDIT WAREHOUSE
            // ========================================================

            onEditWarehouse: function () {

                if (!this._oSelectedContext) {
                    return;
                }


                var oWarehouse =
                    this._oSelectedContext.getObject();


                var oNameInput =
                    new Input({
                        width: "100%",
                        value:
                            oWarehouse.warehouseName || ""
                    });


                var oAddressInput =
                    new Input({
                        width: "100%",
                        value:
                            oWarehouse.address || ""
                    });


                var oCityInput =
                    new Input({
                        width: "100%",
                        value:
                            oWarehouse.city || ""
                    });


                var oStateInput =
                    new Input({
                        width: "100%",
                        value:
                            oWarehouse.state || ""
                    });


                var oCountryInput =
                    new Input({
                        width: "100%",
                        value:
                            oWarehouse.country || ""
                    });


                var oForm =
                    new VBox({
                        width: "100%",
                        items: [

                            new Label({
                                text: "Warehouse Code"
                            }),

                            new Input({
                                width: "100%",
                                value:
                                    oWarehouse.warehouseCode || "",
                                editable: false
                            }),

                            new Label({
                                text: "Warehouse Name",
                                required: true
                            }),

                            oNameInput,

                            new Label({
                                text: "Address",
                                required: true
                            }),

                            oAddressInput,

                            new Label({
                                text: "City",
                                required: true
                            }),

                            oCityInput,

                            new Label({
                                text: "State",
                                required: true
                            }),

                            oStateInput,

                            new Label({
                                text: "Country",
                                required: true
                            }),

                            oCountryInput

                        ]
                    });


                var oDialog =
                    new Dialog({

                        title: "Edit Warehouse",

                        contentWidth: "43rem",

                        content: [
                            oForm
                        ],


                        beginButton:
                            new Button({

                                text: "Save",

                                type: "Emphasized",

                                press:
                                    async function () {

                                        var sName =
                                            oNameInput
                                                .getValue()
                                                .trim();

                                        var sAddress =
                                            oAddressInput
                                                .getValue()
                                                .trim();

                                        var sCity =
                                            oCityInput
                                                .getValue()
                                                .trim();

                                        var sState =
                                            oStateInput
                                                .getValue()
                                                .trim();

                                        var sCountry =
                                            oCountryInput
                                                .getValue()
                                                .trim();


                                        if (
                                            !sName ||
                                            !sAddress ||
                                            !sCity ||
                                            !sState ||
                                            !sCountry
                                        ) {

                                            MessageBox.warning(
                                                "All fields are mandatory."
                                            );

                                            return;
                                        }


                                        try {

                                            this._oSelectedContext
                                                .setProperty(
                                                    "warehouseName",
                                                    sName
                                                );

                                            this._oSelectedContext
                                                .setProperty(
                                                    "address",
                                                    sAddress
                                                );

                                            this._oSelectedContext
                                                .setProperty(
                                                    "city",
                                                    sCity
                                                );

                                            this._oSelectedContext
                                                .setProperty(
                                                    "state",
                                                    sState
                                                );

                                            this._oSelectedContext
                                                .setProperty(
                                                    "country",
                                                    sCountry
                                                );


                                            MessageToast.show(
                                                "Warehouse updated successfully."
                                            );


                                            oDialog.close();

                                        } catch (oError) {

                                            console.error(
                                                "Update Warehouse Error:",
                                                oError
                                            );

                                            MessageBox.error(
                                                "Unable to update warehouse."
                                            );
                                        }

                                    }.bind(this)
                            }),


                        endButton:
                            new Button({

                                text: "Cancel",

                                press: function () {

                                    oDialog.close();

                                }
                            }),


                        afterClose: function () {

                            oDialog.destroy();

                        }

                    });


                this.getView()
                    .addDependent(oDialog);

                oDialog.open();
            },


            // ========================================================
            // ACTIVATE / DEACTIVATE
            // ========================================================

            onToggleWarehouse: function () {

                if (!this._oSelectedContext) {
                    return;
                }


                var oWarehouse =
                    this._oSelectedContext.getObject();


                var bNewStatus =
                    !oWarehouse.active;


                var sAction =
                    bNewStatus
                        ? "activate"
                        : "deactivate";


                MessageBox.confirm(

                    "Are you sure you want to " +
                    sAction +
                    " this warehouse?",

                    {

                        onClose:
                            function (sResult) {

                                if (
                                    sResult !==
                                    MessageBox.Action.OK
                                ) {
                                    return;
                                }


                                try {

                                    this._oSelectedContext
                                        .setProperty(
                                            "active",
                                            bNewStatus
                                        );


                                    MessageToast.show(
                                        "Warehouse " +
                                        sAction +
                                        "d successfully."
                                    );


                                } catch (oError) {

                                    console.error(
                                        "Status update error:",
                                        oError
                                    );

                                    MessageBox.error(
                                        "Unable to update warehouse status."
                                    );
                                }

                            }.bind(this)
                    }
                );
            },


            // ========================================================
            // DELETE WAREHOUSE
            // ========================================================

            onDeleteWarehouse: function () {

                if (!this._oSelectedContext) {
                    return;
                }


                var oContext =
                    this._oSelectedContext;

                var oWarehouse =
                    oContext.getObject();


                MessageBox.confirm(

                    "Are you sure you want to delete " +
                    (
                        oWarehouse.warehouseCode ||
                        "this warehouse"
                    ) +
                    "?",

                    {

                        onClose:
                            async function (sResult) {

                                if (
                                    sResult !==
                                    MessageBox.Action.OK
                                ) {
                                    return;
                                }


                                try {

                                    await oContext.delete(
                                        "$auto"
                                    );


                                    MessageToast.show(
                                        "Warehouse deleted successfully."
                                    );


                                    this._oSelectedContext =
                                        null;


                                    this._setActionButtonsEnabled(
                                        false
                                    );


                                } catch (oError) {

                                    console.error(
                                        "Delete Warehouse Error:",
                                        oError
                                    );


                                    MessageBox.error(
                                        "Unable to delete warehouse.\n\n" +
                                        (
                                            oError.message ||
                                            "Unknown error"
                                        )
                                    );
                                }

                            }.bind(this)
                    }
                );
            },


            // ========================================================
            // REFRESH
            // ========================================================

            onRefresh: function () {

                var oTable =
                    this.byId("warehousesTable");

                if (!oTable) {
                    return;
                }


                var oBinding =
                    oTable.getBinding("items");


                if (oBinding) {
                    oBinding.refresh();
                }


                MessageToast.show(
                    "Warehouses refreshed"
                );
            },


            // ========================================================
            // NAVIGATION BACK
            // ========================================================

            onNavBack: function () {

                this.getOwnerComponent()
                    .getRouter()
                    .navTo("Purchase");
            },


            // ========================================================
            // STATUS FORMATTERS
            // ========================================================

            formatStatusText: function () {

                return "ACTIVE";
            },


            formatStatusState: function () {

                return "Success";
            }

        }
    );
});