sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/core/Item",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (
    Controller,
    Fragment,
    Item,
    Filter,
    FilterOperator,
    MessageBox,
    MessageToast
) {

    "use strict";

    return Controller.extend(
        "purchasemanagement.controller.Stock",
        {

            _oAddDialog: null,
            _oEditDialog: null,
            _oEditContext: null,


            // =====================================================
            // INIT
            // =====================================================

            onInit: function () {

                this._loadProducts();
                this._loadWarehouses();

                var oTable = this.byId("stockTable");

                if (oTable) {
                    oTable.attachUpdateFinished(
                        this._onTableUpdateFinished,
                        this
                    );
                }
            },


            // =====================================================
            // LOAD PRODUCTS
            // =====================================================

            _loadProducts: async function () {

                try {

                    var oModel =
                        this.getView().getModel("purchase");

                    if (!oModel) {
                        console.error(
                            "Purchase model not found"
                        );
                        return;
                    }

                    var oSelect =
                        this.byId("productFilter");

                    if (!oSelect) {
                        return;
                    }

                    var oBinding =
                        oModel.bindList("/Products");

                    var aContexts =
                        await oBinding.requestContexts(
                            0,
                            1000
                        );

                    aContexts.forEach(
                        function (oContext) {

                            var oProduct =
                                oContext.getObject();

                            if (
                                oProduct &&
                                oProduct.active === true
                            ) {

                                oSelect.addItem(
                                    new Item({
                                        key: oProduct.ID,
                                        text:
                                            oProduct.productCode +
                                            " - " +
                                            oProduct.productName
                                    })
                                );
                            }

                        }
                    );

                    console.log(
                        "Products loaded:",
                        aContexts.length
                    );

                } catch (oError) {

                    console.error(
                        "Products load error:",
                        oError
                    );
                }
            },


            // =====================================================
            // LOAD WAREHOUSES
            // =====================================================

            _loadWarehouses: async function () {

                try {

                    var oModel =
                        this.getView().getModel("purchase");

                    if (!oModel) {
                        console.error(
                            "Purchase model not found"
                        );
                        return;
                    }

                    var oSelect =
                        this.byId("warehouseFilter");

                    if (!oSelect) {
                        return;
                    }

                    var oBinding =
                        oModel.bindList("/warehouse");

                    var aContexts =
                        await oBinding.requestContexts(
                            0,
                            1000
                        );

                    aContexts.forEach(
                        function (oContext) {

                            var oWarehouse =
                                oContext.getObject();

                            if (
                                oWarehouse &&
                                oWarehouse.active === true
                            ) {

                                oSelect.addItem(
                                    new Item({
                                        key:
                                            oWarehouse.ID,

                                        text:
                                            oWarehouse.warehouseCode +
                                            " - " +
                                            oWarehouse.warehouseName
                                    })
                                );
                            }

                        }
                    );

                    console.log(
                        "Warehouses loaded:",
                        aContexts.length
                    );

                } catch (oError) {

                    console.error(
                        "Warehouses load error:",
                        oError
                    );
                }
            },


            // =====================================================
            // TABLE UPDATE
            // =====================================================

            _onTableUpdateFinished: function () {

                var oTable =
                    this.byId("stockTable");

                if (!oTable) {
                    return;
                }

                var iCount =
                    oTable.getItems().length;

                var oCount =
                    this.byId("stockCount");

                if (oCount) {

                    oCount.setText(
                        "Stock Records: " +
                        iCount
                    );
                }

                this._updateButtons();
            },


            // =====================================================
            // ENABLE / DISABLE BUTTONS
            // =====================================================

            _updateButtons: function () {

                var oTable =
                    this.byId("stockTable");

                if (!oTable) {
                    return;
                }

                var bSelected =
                    !!oTable.getSelectedItem();

                var oViewButton =
                    this.byId("viewStockButton");

                var oEditButton =
                    this.byId("editStockButton");

                var oDeleteButton =
                    this.byId("deleteStockButton");

                if (oViewButton) {
                    oViewButton.setEnabled(
                        bSelected
                    );
                }

                if (oEditButton) {
                    oEditButton.setEnabled(
                        bSelected
                    );
                }

                if (oDeleteButton) {
                    oDeleteButton.setEnabled(
                        bSelected
                    );
                }
            },


            // =====================================================
            // NAV BACK
            // =====================================================

            onNavBack: function () {

                this.getOwnerComponent()
                    .getRouter()
                    .navTo("Purchase");
            },


            // =====================================================
            // REFRESH
            // =====================================================

            onRefresh: function () {

                var oTable =
                    this.byId("stockTable");

                if (!oTable) {
                    return;
                }

                var oBinding =
                    oTable.getBinding("items");

                if (oBinding) {
                    oBinding.refresh();
                }

                this._loadProducts();
                this._loadWarehouses();

                MessageToast.show(
                    "Stock refreshed"
                );
            },


            // =====================================================
            // SEARCH
            // =====================================================

            onSearchStock: function (oEvent) {

                var sValue =
                    oEvent.getParameter("newValue");

                if (
                    sValue === undefined ||
                    sValue === null
                ) {

                    sValue =
                        oEvent.getParameter("query");
                }

                sValue =
                    String(
                        sValue || ""
                    ).trim();

                var oTable =
                    this.byId("stockTable");

                if (!oTable) {
                    return;
                }

                var oBinding =
                    oTable.getBinding("items");

                if (!oBinding) {
                    return;
                }

                if (!sValue) {

                    this._applyFilters();

                    return;
                }

                var aFilters = [

                    new Filter(
                        "product/productCode",
                        FilterOperator.Contains,
                        sValue
                    ),

                    new Filter(
                        "product/productName",
                        FilterOperator.Contains,
                        sValue
                    ),

                    new Filter(
                        "warehouse/warehouseCode",
                        FilterOperator.Contains,
                        sValue
                    ),

                    new Filter(
                        "warehouse/warehouseName",
                        FilterOperator.Contains,
                        sValue
                    )

                ];

                var oSearchFilter =
                    new Filter({
                        filters: aFilters,
                        and: false
                    });

                oBinding.filter(
                    [oSearchFilter],
                    "Application"
                );
            },


            // =====================================================
            // PRODUCT FILTER
            // =====================================================

            onProductFilterChange: function () {

                this._applyFilters();
            },


            // =====================================================
            // WAREHOUSE FILTER
            // =====================================================

            onWarehouseFilterChange: function () {

                this._applyFilters();
            },


            // =====================================================
            // APPLY FILTERS
            // =====================================================

            _applyFilters: function () {

                var oTable =
                    this.byId("stockTable");

                if (!oTable) {
                    return;
                }

                var oBinding =
                    oTable.getBinding("items");

                if (!oBinding) {
                    return;
                }

                var aFilters = [];

                var oProductFilter =
                    this.byId("productFilter");

                var oWarehouseFilter =
                    this.byId("warehouseFilter");

                if (oProductFilter) {

                    var sProductId =
                        oProductFilter.getSelectedKey();

                    if (sProductId) {

                        aFilters.push(
                            new Filter(
                                "product_ID",
                                FilterOperator.EQ,
                                sProductId
                            )
                        );
                    }
                }

                if (oWarehouseFilter) {

                    var sWarehouseId =
                        oWarehouseFilter.getSelectedKey();

                    if (sWarehouseId) {

                        aFilters.push(
                            new Filter(
                                "warehouse_ID",
                                FilterOperator.EQ,
                                sWarehouseId
                            )
                        );
                    }
                }

                oBinding.filter(
                    aFilters,
                    "Application"
                );
            },


            // =====================================================
            // CLEAR FILTERS
            // =====================================================

            onClearFilters: function () {

                var oProductFilter =
                    this.byId("productFilter");

                var oWarehouseFilter =
                    this.byId("warehouseFilter");

                var oSearch =
                    this.byId("stockSearchField");

                if (oProductFilter) {
                    oProductFilter.setSelectedKey("");
                }

                if (oWarehouseFilter) {
                    oWarehouseFilter.setSelectedKey("");
                }

                if (oSearch) {
                    oSearch.setValue("");
                }

                this._applyFilters();
            },


            // =====================================================
            // SELECTION
            // =====================================================

            onSelectionChange: function () {

                this._updateButtons();
            },


            // =====================================================
            // GET SELECTED CONTEXT
            // =====================================================

            _getSelectedContext: function () {

                var oTable =
                    this.byId("stockTable");

                if (!oTable) {
                    return null;
                }

                var oSelectedItem =
                    oTable.getSelectedItem();

                if (!oSelectedItem) {

                    MessageToast.show(
                        "Please select a stock record."
                    );

                    return null;
                }

                return oSelectedItem.getBindingContext(
                    "purchase"
                );
            },


            // =====================================================
            // ADD STOCK
            // =====================================================

            onAddStock: async function () {

                try {

                    if (!this._oAddDialog) {

                        this._oAddDialog =
                            await Fragment.load({

                                id:
                                    this.getView().getId(),

                                name:
                                    "purchasemanagement.fragment.CreateStock",

                                controller:
                                    this
                            });

                        this.getView()
                            .addDependent(
                                this._oAddDialog
                            );
                    }

                    this._clearCreateFields();

                    this._oAddDialog.open();

                } catch (oError) {

                    console.error(
                        "Add Stock dialog error:",
                        oError
                    );

                    MessageBox.error(
                        "Unable to open Add Stock dialog.\n\n" +
                        (
                            oError.message ||
                            ""
                        )
                    );
                }
            },


            // =====================================================
            // CLEAR CREATE FIELDS
            // =====================================================

            _clearCreateFields: function () {

                this.byId(
                    "createStockProductSelect"
                ).setSelectedKey("");

                this.byId(
                    "createStockWarehouseSelect"
                ).setSelectedKey("");

                this.byId(
                    "createStockAvailableInput"
                ).setValue("");

                this.byId(
                    "createStockReservedInput"
                ).setValue("0");

                this.byId(
                    "createStockReorderInput"
                ).setValue("0");

                this.byId(
                    "createStockRemarksInput"
                ).setValue("");
            },


            // =====================================================
            // CREATE STOCK
            // =====================================================

            onCreateStockConfirm: async function () {

                var sProductId =
                    this.byId(
                        "createStockProductSelect"
                    ).getSelectedKey();

                var sWarehouseId =
                    this.byId(
                        "createStockWarehouseSelect"
                    ).getSelectedKey();

                var iAvailable =
                    Number(
                        this.byId(
                            "createStockAvailableInput"
                        ).getValue()
                    );

                var iReserved =
                    Number(
                        this.byId(
                            "createStockReservedInput"
                        ).getValue() || 0
                    );

                var iReorder =
                    Number(
                        this.byId(
                            "createStockReorderInput"
                        ).getValue() || 0
                    );

                var sRemarks =
                    this.byId(
                        "createStockRemarksInput"
                    ).getValue().trim();


                // ---------------------------------------------
                // VALIDATION
                // ---------------------------------------------

                if (!sProductId) {

                    MessageBox.warning(
                        "Please select a product."
                    );

                    return;
                }

                if (!sWarehouseId) {

                    MessageBox.warning(
                        "Please select a warehouse."
                    );

                    return;
                }

                if (
                    isNaN(iAvailable) ||
                    iAvailable < 0
                ) {

                    MessageBox.warning(
                        "Enter a valid available stock."
                    );

                    return;
                }

                if (
                    isNaN(iReserved) ||
                    iReserved < 0
                ) {

                    MessageBox.warning(
                        "Enter a valid reserved quantity."
                    );

                    return;
                }

                if (
                    isNaN(iReorder) ||
                    iReorder < 0
                ) {

                    MessageBox.warning(
                        "Enter a valid reorder level."
                    );

                    return;
                }

                if (iReserved > iAvailable) {

                    MessageBox.warning(
                        "Reserved quantity cannot be greater than available stock."
                    );

                    return;
                }


                try {

                    var oModel =
                        this.getView()
                            .getModel("purchase");

                    if (!oModel) {

                        MessageBox.error(
                            "Purchase model not found."
                        );

                        return;
                    }


                    // ---------------------------------------------
                    // CHECK DUPLICATE
                    // ---------------------------------------------

                    var oCheckBinding =
                        oModel.bindList(
                            "/Inventory",
                            undefined,
                            undefined,
                            [

                                new Filter(
                                    "product_ID",
                                    FilterOperator.EQ,
                                    sProductId
                                ),

                                new Filter(
                                    "warehouse_ID",
                                    FilterOperator.EQ,
                                    sWarehouseId
                                )

                            ]
                        );

                    var aExisting =
                        await oCheckBinding.requestContexts(
                            0,
                            1
                        );

                    if (aExisting.length > 0) {

                        MessageBox.warning(
                            "Stock already exists for this product and warehouse. Please use Edit."
                        );

                        return;
                    }


                    // ---------------------------------------------
                    // CREATE
                    // ---------------------------------------------

                    var oListBinding =
                        oModel.bindList(
                            "/Inventory"
                        );

                    var oContext =
                        oListBinding.create(
                            {

                                product_ID:
                                    sProductId,

                                warehouse_ID:
                                    sWarehouseId,

                                availableQuantity:
                                    iAvailable,

                                reservedQuantity:
                                    iReserved,

                                reorderLevel:
                                    iReorder,

                                status:
                                    iAvailable <= iReorder
                                        ? "LOW_STOCK"
                                        : "AVAILABLE",

                                lastStockUpdate:
                                    new Date().toISOString(),

                                remarks:
                                    sRemarks

                            },
                            true
                        );

                    await oContext.created();

                    this._oAddDialog.close();

                    var oTable =
                        this.byId("stockTable");

                    if (oTable) {

                        var oBinding =
                            oTable.getBinding("items");

                        if (oBinding) {
                            oBinding.refresh();
                        }
                    }

                    MessageToast.show(
                        "Stock added successfully."
                    );

                } catch (oError) {

                    console.error(
                        "Create stock error:",
                        oError
                    );

                    MessageBox.error(
                        oError.message ||
                        "Unable to create stock."
                    );
                }
            },


            // =====================================================
            // CANCEL CREATE
            // =====================================================

            onCreateStockCancel: function () {

                if (this._oAddDialog) {
                    this._oAddDialog.close();
                }
            },


            // =====================================================
            // VIEW STOCK
            // =====================================================

            onViewStock: async function () {

                var oContext =
                    this._getSelectedContext();

                if (!oContext) {
                    return;
                }

                try {

                    var oStock =
                        await oContext.requestObject();

                    var sProduct =
                        oStock.product
                            ? oStock.product.productCode +
                              " - " +
                              oStock.product.productName
                            : "";

                    var sWarehouse =
                        oStock.warehouse
                            ? oStock.warehouse.warehouseCode +
                              " - " +
                              oStock.warehouse.warehouseName
                            : "";

                    var sMessage =

                        "Product: " +
                        sProduct +

                        "\n\nWarehouse: " +
                        sWarehouse +

                        "\n\nAvailable Stock: " +
                        (
                            oStock.availableQuantity || 0
                        ) +

                        "\nReserved: " +
                        (
                            oStock.reservedQuantity || 0
                        ) +

                        "\nReorder Level: " +
                        (
                            oStock.reorderLevel || 0
                        ) +

                        "\nStatus: " +
                        (
                            oStock.status || ""
                        );


                    MessageBox.information(
                        sMessage,
                        {
                            title: "Stock Details"
                        }
                    );

                } catch (oError) {

                    console.error(
                        "View stock error:",
                        oError
                    );

                    MessageBox.error(
                        oError.message ||
                        "Unable to view stock."
                    );
                }
            },


            // =====================================================
            // EDIT STOCK
            // =====================================================

            onEditStock: async function () {

                var oContext =
                    this._getSelectedContext();

                if (!oContext) {
                    return;
                }

                try {

                    if (!this._oEditDialog) {

                        this._oEditDialog =
                            await Fragment.load({

                                id:
                                    this.getView().getId(),

                                name:
                                    "purchasemanagement.fragment.EditStock",

                                controller:
                                    this
                            });

                        this.getView()
                            .addDependent(
                                this._oEditDialog
                            );
                    }


                    this._oEditContext =
                        oContext;


                    var oStock =
                        await oContext.requestObject();


                    this.byId(
                        "editStockProductSelect"
                    ).setSelectedKey(
                        oStock.product_ID
                    );


                    this.byId(
                        "editStockWarehouseSelect"
                    ).setSelectedKey(
                        oStock.warehouse_ID
                    );


                    this.byId(
                        "editStockAvailableInput"
                    ).setValue(
                        String(
                            oStock.availableQuantity || 0
                        )
                    );


                    this.byId(
                        "editStockReservedInput"
                    ).setValue(
                        String(
                            oStock.reservedQuantity || 0
                        )
                    );


                    this.byId(
                        "editStockReorderInput"
                    ).setValue(
                        String(
                            oStock.reorderLevel || 0
                        )
                    );


                    this.byId(
                        "editStockRemarksInput"
                    ).setValue(
                        oStock.remarks || ""
                    );


                    this._oEditDialog.open();

                } catch (oError) {

                    console.error(
                        "Edit Stock dialog error:",
                        oError
                    );

                    MessageBox.error(
                        "Unable to open Edit Stock.\n\n" +
                        (
                            oError.message ||
                            ""
                        )
                    );
                }
            },


            // =====================================================
            // SAVE EDIT
            // =====================================================

            onEditStockConfirm: async function () {

                if (!this._oEditContext) {
                    return;
                }


                var iAvailable =
                    Number(
                        this.byId(
                            "editStockAvailableInput"
                        ).getValue()
                    );


                var iReserved =
                    Number(
                        this.byId(
                            "editStockReservedInput"
                        ).getValue() || 0
                    );


                var iReorder =
                    Number(
                        this.byId(
                            "editStockReorderInput"
                        ).getValue() || 0
                    );


                var sRemarks =
                    this.byId(
                        "editStockRemarksInput"
                    ).getValue().trim();


                // ---------------------------------------------
                // VALIDATION
                // ---------------------------------------------

                if (
                    isNaN(iAvailable) ||
                    iAvailable < 0
                ) {

                    MessageBox.warning(
                        "Enter a valid available stock."
                    );

                    return;
                }


                if (
                    isNaN(iReserved) ||
                    iReserved < 0
                ) {

                    MessageBox.warning(
                        "Enter a valid reserved quantity."
                    );

                    return;
                }


                if (
                    isNaN(iReorder) ||
                    iReorder < 0
                ) {

                    MessageBox.warning(
                        "Enter a valid reorder level."
                    );

                    return;
                }


                if (iReserved > iAvailable) {

                    MessageBox.warning(
                        "Reserved quantity cannot be greater than available stock."
                    );

                    return;
                }


                try {

                    var oContext =
                        this._oEditContext;


                    oContext.setProperty(
                        "availableQuantity",
                        iAvailable
                    );


                    oContext.setProperty(
                        "reservedQuantity",
                        iReserved
                    );


                    oContext.setProperty(
                        "reorderLevel",
                        iReorder
                    );


                    oContext.setProperty(
                        "status",
                        iAvailable <= iReorder
                            ? "LOW_STOCK"
                            : "AVAILABLE"
                    );


                    oContext.setProperty(
                        "lastStockUpdate",
                        new Date().toISOString()
                    );


                    oContext.setProperty(
                        "remarks",
                        sRemarks
                    );


                    await oContext
                        .getModel()
                        .submitBatch("$auto");


                    this._oEditDialog.close();

                    this._oEditContext =
                        null;


                    var oTable =
                        this.byId(
                            "stockTable"
                        );


                    if (oTable) {

                        var oBinding =
                            oTable.getBinding(
                                "items"
                            );

                        if (oBinding) {
                            oBinding.refresh();
                        }
                    }


                    this._updateButtons();


                    MessageToast.show(
                        "Stock updated successfully."
                    );

                } catch (oError) {

                    console.error(
                        "Edit stock error:",
                        oError
                    );

                    MessageBox.error(
                        oError.message ||
                        "Unable to update stock."
                    );
                }
            },


            // =====================================================
            // CANCEL EDIT
            // =====================================================

            onEditStockCancel: function () {

                if (this._oEditContext) {

                    this._oEditContext
                        .resetChanges();
                }

                this._oEditContext =
                    null;

                if (this._oEditDialog) {

                    this._oEditDialog.close();
                }
            },


            // =====================================================
            // DELETE
            // =====================================================

            onDeleteStock: function () {

                var oContext =
                    this._getSelectedContext();

                if (!oContext) {
                    return;
                }


                MessageBox.confirm(
                    "Are you sure you want to delete this stock record?",
                    {

                        title:
                            "Delete Stock",

                        actions: [
                            MessageBox.Action.DELETE,
                            MessageBox.Action.CANCEL
                        ],

                        emphasizedAction:
                            MessageBox.Action.DELETE,

                        onClose:
                            async function (sAction) {

                                if (
                                    sAction !==
                                    MessageBox.Action.DELETE
                                ) {
                                    return;
                                }


                                try {

                                    await oContext.delete();


                                    var oTable =
                                        this.byId(
                                            "stockTable"
                                        );


                                    if (oTable) {

                                        oTable.removeSelections(
                                            true
                                        );
                                    }


                                    this._updateButtons();


                                    MessageToast.show(
                                        "Stock deleted successfully."
                                    );

                                } catch (oError) {

                                    console.error(
                                        "Delete stock error:",
                                        oError
                                    );

                                    MessageBox.error(
                                        oError.message ||
                                        "Unable to delete stock."
                                    );
                                }

                            }.bind(this)
                    }
                );
            }

        }
    );
});