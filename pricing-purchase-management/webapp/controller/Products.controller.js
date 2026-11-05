sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (
    Controller,
    Fragment,
    Filter,
    FilterOperator,
    MessageBox,
    MessageToast
) {
    "use strict";

    return Controller.extend("purchasemanagement.controller.Products", {

        _oCreateDialog: null,
        _oEditDialog: null,
        _oEditContext: null,

        // INIT
        onInit: function () {
            var oTable = this.byId("productsTable");

            if (oTable) {
                oTable.attachUpdateFinished(
                    this._onProductsUpdateFinished,
                    this
                );
            }
        },

        // NAVIGATION
        onNavBack: function () {
            window.history.back();
        },

        // REFRESH
        onRefresh: function () {
            var oTable = this.byId("productsTable");
            var oBinding = oTable && oTable.getBinding("items");

            if (oBinding) {
                oBinding.refresh();
                MessageToast.show("Products refreshed");
            }
        },

        // SEARCH
        onSearch: function (oEvent) {
            var sValue = (
                oEvent.getParameter("newValue") || ""
            ).trim();

            var oTable = this.byId("productsTable");
            var oBinding = oTable && oTable.getBinding("items");

            if (!oBinding) {
                return;
            }

            var aFilters = [];

            if (sValue) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter(
                            "productName",
                            FilterOperator.Contains,
                            sValue
                        ),
                        new Filter(
                            "productCode",
                            FilterOperator.Contains,
                            sValue
                        )
                    ],
                    and: false
                }));
            }

            oBinding.filter(aFilters);
            this._updateProductCount();
        },

        // CATEGORY FILTER
        onCategoryChange: function (oEvent) {
            var sCategory = oEvent.getSource().getSelectedKey();
            var oTable = this.byId("productsTable");
            var oBinding = oTable && oTable.getBinding("items");

            if (!oBinding) {
                return;
            }

            var aFilters = [];

            if (sCategory) {
                aFilters.push(
                    new Filter(
                        "category",
                        FilterOperator.EQ,
                        sCategory
                    )
                );
            }

            oBinding.filter(aFilters);
            this._updateProductCount();
        },

        // SELECTION
        onSelectionChange: function (oEvent) {
            var bSelected = oEvent.getParameter("selected");

            [
                "productsViewButton",
                "productsEditButton",
                "productsDeleteButton"
            ].forEach(function (sId) {
                var oButton = this.byId(sId);

                if (oButton) {
                    oButton.setEnabled(bSelected);
                }
            }, this);
        },

        // PRODUCT COUNT
        _updateProductCount: function () {
            var oTable = this.byId("productsTable");
            var oCountText = this.byId("productsCountText");
            var oBinding = oTable && oTable.getBinding("items");

            if (oBinding && oCountText) {
                oCountText.setText(
                    "Products: " + oBinding.getLength()
                );
            }
        },

        // UPDATE TABLE STOCK TOTALS
        _onProductsUpdateFinished: async function () {
            var oTable = this.byId("productsTable");

            if (!oTable) {
                return;
            }

            var aItems = oTable.getItems();

            for (var i = 0; i < aItems.length; i++) {
                var oItem = aItems[i];
                var oContext = oItem.getBindingContext("purchase");

                if (!oContext) {
                    continue;
                }

                try {
                    var oProduct = await oContext.requestObject();
                    var iTotalStock = 0;

                    if (Array.isArray(oProduct.inventory)) {
                        oProduct.inventory.forEach(function (oInventory) {
                            iTotalStock +=
                                Number(oInventory.availableQuantity) || 0;
                        });
                    }

                    var aCells = oItem.getCells();

                    if (
                        aCells[4] &&
                        typeof aCells[4].setNumber === "function"
                    ) {
                        aCells[4].setNumber(String(iTotalStock));
                    }
                } catch (oError) {
                    console.error("Stock calculation error:", oError);
                }
            }

            this._updateProductCount();
        },

        // OPEN CREATE PRODUCT DIALOG
        onCreateProduct: async function () {
            try {
                if (!this._oCreateDialog) {
                    this._oCreateDialog = await Fragment.load({
                        id: this.getView().getId(),
                        name: "purchasemanagement.fragment.CreateProduct",
                        controller: this
                    });

                    this.getView().addDependent(this._oCreateDialog);
                }

                var sViewId = this.getView().getId();

                var oNameInput = Fragment.byId(sViewId, "cpInpName001");
                var oCategorySelect = Fragment.byId(
                    sViewId,
                    "cpSelCat001"
                );
                var oPriceInput = Fragment.byId(sViewId, "cpInpPrice001");

                if (oNameInput) {
                    oNameInput.setValue("");
                }

                if (oCategorySelect) {
                    oCategorySelect.setSelectedKey("");
                }

                if (oPriceInput) {
                    oPriceInput.setValue("");
                }

                this._oCreateDialog.open();
            } catch (oError) {
                console.error("Create Product Dialog Error:", oError);
                MessageBox.error(
                    "Unable to open Create Product dialog.\n\n" +
                    oError.message
                );
            }
        },

        // CREATE PRODUCT
        // Product code is generated by the CAP backend.
        onCreateProductConfirm: async function () {
            var sViewId = this.getView().getId();

            var oNameInput = Fragment.byId(sViewId, "cpInpName001");
            var oCategorySelect = Fragment.byId(
                sViewId,
                "cpSelCat001"
            );
            var oPriceInput = Fragment.byId(sViewId, "cpInpPrice001");

            if (!oNameInput || !oCategorySelect || !oPriceInput) {
                MessageBox.error(
                    "Create Product controls could not be found."
                );
                return;
            }

            var sProductName = oNameInput.getValue().trim();
            var sCategoryId = oCategorySelect.getSelectedKey();
            var sPrice = oPriceInput.getValue().trim();

            if (!sProductName) {
                MessageBox.warning("Product Name is mandatory.");
                return;
            }

            if (!sCategoryId) {
                MessageBox.warning("Please select a Category.");
                return;
            }

            if (
                !sPrice ||
                !Number.isFinite(Number(sPrice)) ||
                Number(sPrice) < 0
            ) {
                MessageBox.warning("Please enter a valid Unit Price.");
                return;
            }

            try {
                var oModel = this.getView().getModel("purchase");

                if (!oModel) {
                    MessageBox.error("Purchase model is not available.");
                    return;
                }

                var oListBinding = oModel.bindList("/Products");

                var oContext = oListBinding.create({
                    productName: sProductName,
                    category: sCategoryId,
                    unitPrice: Number(sPrice),
                    active: false
                });

                await oContext.created();

                MessageToast.show("Product created successfully.");

                this._oCreateDialog.close();

                oNameInput.setValue("");
                oCategorySelect.setSelectedKey("");
                oPriceInput.setValue("");

                var oTable = this.byId("productsTable");
                var oBinding = oTable && oTable.getBinding("items");

                if (oBinding) {
                    oBinding.refresh();
                }
            } catch (oError) {
                console.error("Create Product Error:", oError);

                MessageBox.error(
                    this._getErrorMessage(
                        oError,
                        "Failed to create product."
                    )
                );
            }
        },

        // CANCEL CREATE
        onCreateProductCancel: function () {
            if (this._oCreateDialog) {
                this._oCreateDialog.close();
            }
        },

        // VIEW PRODUCT
        onViewProduct: async function () {
            var oTable = this.byId("productsTable");
            var oSelectedItem = oTable && oTable.getSelectedItem();

            if (!oSelectedItem) {
                MessageBox.warning("Please select a product.");
                return;
            }

            try {
                var oContext = oSelectedItem.getBindingContext("purchase");

                if (!oContext) {
                    MessageBox.error(
                        "Unable to get product information."
                    );
                    return;
                }

                var oProduct = await oContext.requestObject();
                var iTotalStock = 0;

                if (Array.isArray(oProduct.inventory)) {
                    oProduct.inventory.forEach(function (oInventory) {
                        iTotalStock +=
                            Number(oInventory.availableQuantity) || 0;
                    });
                }

                var sPrice = Number(
                    oProduct.unitPrice || 0
                ).toLocaleString("en-IN");

                MessageBox.information(
                    "Product Code: " +
                    (oProduct.productCode || "-") +
                    "\n\nProduct Name: " +
                    (oProduct.productName || "-") +
                    "\n\nCategory: " +
                    (oProduct.category || "-") +
                    "\n\nUnit Price: ₹" +
                    sPrice +
                    "\n\nStock Quantity: " +
                    iTotalStock +
                    "\n\nStatus: " +
                    (oProduct.active ? "ACTIVE" : "INACTIVE"),
                    {
                        title: "Product Details"
                    }
                );
            } catch (oError) {
                console.error("View Product Error:", oError);
                MessageBox.error("Unable to load product details.");
            }
        },

        // OPEN EDIT PRODUCT
        onEditProduct: async function () {
            var oTable = this.byId("productsTable");
            var oSelectedItem = oTable && oTable.getSelectedItem();

            if (!oSelectedItem) {
                MessageBox.warning("Please select a product.");
                return;
            }

            try {
                var oContext = oSelectedItem.getBindingContext("purchase");

                if (!oContext) {
                    MessageBox.error(
                        "Unable to get product information."
                    );
                    return;
                }

                if (!this._oEditDialog) {
                    this._oEditDialog = await Fragment.load({
                        id: this.getView().getId(),
                        name: "purchasemanagement.fragment.EditProduct",
                        controller: this
                    });

                    this.getView().addDependent(this._oEditDialog);
                }

                this._oEditContext = oContext;

                var oProduct = await oContext.requestObject();
                var sViewId = this.getView().getId();

                var oCodeInput = Fragment.byId(sViewId, "epInpCode001");
                var oNameInput = Fragment.byId(sViewId, "epInpName001");
                var oCategorySelect = Fragment.byId(
                    sViewId,
                    "cpSelCatEdit001"
                );
                var oPriceInput = Fragment.byId(
                    sViewId,
                    "epInpPrice001"
                );

                if (oCodeInput) {
                    oCodeInput.setValue(oProduct.productCode || "");
                }

                if (oNameInput) {
                    oNameInput.setValue(oProduct.productName || "");
                }

                if (oCategorySelect) {
                    oCategorySelect.setSelectedKey(
                        oProduct.category || ""
                    );
                }

                if (oPriceInput) {
                    oPriceInput.setValue(
                        oProduct.unitPrice !== null &&
                        oProduct.unitPrice !== undefined
                            ? String(oProduct.unitPrice)
                            : ""
                    );
                }

                this._oEditDialog.open();
            } catch (oError) {
                console.error("Edit Product Dialog Error:", oError);
                MessageBox.error(
                    "Unable to open Edit Product dialog.\n\n" +
                    oError.message
                );
            }
        },

        // SAVE EDITED PRODUCT
        onEditProductConfirm: async function () {
            if (!this._oEditContext) {
                MessageBox.error("No product selected.");
                return;
            }

            var sViewId = this.getView().getId();

            var oNameInput = Fragment.byId(sViewId, "epInpName001");
            var oCategorySelect = Fragment.byId(
                sViewId,
                "cpSelCatEdit001"
            );
            var oPriceInput = Fragment.byId(sViewId, "epInpPrice001");

            if (!oNameInput || !oCategorySelect || !oPriceInput) {
                MessageBox.error(
                    "Edit Product controls could not be found."
                );
                return;
            }

            var sProductName = oNameInput.getValue().trim();
            var sCategoryId = oCategorySelect.getSelectedKey();
            var sPrice = oPriceInput.getValue().trim();

            if (!sProductName) {
                MessageBox.warning("Product Name is mandatory.");
                return;
            }

            if (!sCategoryId) {
                MessageBox.warning("Please select a Category.");
                return;
            }

            if (
                !sPrice ||
                !Number.isFinite(Number(sPrice)) ||
                Number(sPrice) < 0
            ) {
                MessageBox.warning("Please enter a valid Unit Price.");
                return;
            }

            try {
                this._oEditContext.setProperty(
                    "productName",
                    sProductName
                );

                this._oEditContext.setProperty(
                    "category",
                    sCategoryId
                );

                this._oEditContext.setProperty(
                    "unitPrice",
                    Number(sPrice)
                );

                var oModel = this.getView().getModel("purchase");
                await oModel.submitBatch("$auto");

                MessageToast.show("Product updated successfully.");

                this._oEditDialog.close();

                var oTable = this.byId("productsTable");
                var oBinding = oTable && oTable.getBinding("items");

                if (oBinding) {
                    oBinding.refresh();
                }

                this._oEditContext = null;
            } catch (oError) {
                console.error("Edit Product Error:", oError);

                MessageBox.error(
                    this._getErrorMessage(
                        oError,
                        "Failed to update product."
                    )
                );
            }
        },

        // CANCEL EDIT
        onEditProductCancel: function () {
            if (this._oEditContext) {
                try {
                    this._oEditContext.resetChanges();
                } catch (oError) {
                    console.warn("Reset changes failed:", oError);
                }
            }

            if (this._oEditDialog) {
                this._oEditDialog.close();
            }

            this._oEditContext = null;
        },

        // DELETE PRODUCT
        onDeleteProduct: function () {
            var oTable = this.byId("productsTable");
            var oSelectedItem = oTable && oTable.getSelectedItem();

            if (!oSelectedItem) {
                MessageBox.warning("Please select a product.");
                return;
            }

            var oContext = oSelectedItem.getBindingContext("purchase");

            if (!oContext) {
                MessageBox.error(
                    "Unable to identify selected product."
                );
                return;
            }

            var that = this;

            oContext.requestObject()
                .then(function (oProduct) {
                    MessageBox.confirm(
                        'Are you sure you want to delete "' +
                        (oProduct.productName || "this product") +
                        '"?',
                        {
                            title: "Delete Product",
                            actions: [
                                MessageBox.Action.YES,
                                MessageBox.Action.NO
                            ],
                            emphasizedAction: MessageBox.Action.YES,

                            onClose: async function (sAction) {
                                if (sAction !== MessageBox.Action.YES) {
                                    return;
                                }

                                try {
                                    await oContext.delete();

                                    MessageToast.show(
                                        "Product deleted successfully."
                                    );

                                    var oBinding = oTable.getBinding("items");

                                    if (oBinding) {
                                        oBinding.refresh();
                                    }
                                } catch (oError) {
                                    console.error(
                                        "Delete Product Error:",
                                        oError
                                    );

                                    MessageBox.error(
                                        that._getErrorMessage(
                                            oError,
                                            "Failed to delete product."
                                        )
                                    );
                                }
                            }
                        }
                    );
                })
                .catch(function (oError) {
                    console.error("Product Read Error:", oError);
                    MessageBox.error(
                        "Unable to load product information."
                    );
                });
        },

        // ERROR MESSAGE
        _getErrorMessage: function (oError, sDefaultMessage) {
            if (!oError) {
                return sDefaultMessage;
            }

            if (oError.message && oError.message.trim()) {
                return oError.message;
            }

            if (oError.responseText) {
                try {
                    var oResponse = JSON.parse(oError.responseText);

                    if (
                        oResponse.error &&
                        oResponse.error.message
                    ) {
                        return oResponse.error.message;
                    }
                } catch (oParseError) {
                    console.warn(
                        "Unable to parse error response.",
                        oParseError
                    );
                }
            }

            return sDefaultMessage;
        }

    });
});