sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("dealermangement.controller.ProductDetails", {

        // ==============================================================
        // Lifecycle
        // ==============================================================

        onInit: function () {
            this.getView().setModel(
                new JSONModel({
                    total: 0,
                    active: 0,
                    inactive: 0,
                    categoryCount: 0,
                    categories: [{ key: "ALL", text: "All Categories" }]
                }),
                "pkpi"
            );

            this._loadSummary();
        },

        // ==============================================================
        // Summary tiles + category filter list
        // ==============================================================

        _loadSummary: async function () {
            const oModel = this.getOwnerComponent().getModel();
            const oSummaryModel = this.getView().getModel("pkpi");

            if (!oModel || !oSummaryModel) return;

            try {
                const oBinding = oModel.bindList("/Products", null, [], [], {});
                const aContexts = await oBinding.requestContexts(0, 1000);

                let iActive = 0;
                const oCategories = {};

                aContexts.forEach(function (oContext) {
                    const oProduct = oContext.getObject();

                    if (oProduct.active) iActive++;

                    const sCategory = oProduct.category;
                    if (sCategory) oCategories[sCategory] = true;
                });

                const aCategoryNames = Object.keys(oCategories).sort();

                oSummaryModel.setData({
                    total: aContexts.length,
                    active: iActive,
                    inactive: aContexts.length - iActive,
                    categoryCount: aCategoryNames.length,
                    categories: [{ key: "ALL", text: "All Categories" }].concat(
                        aCategoryNames.map(function (sName) {
                            return { key: sName, text: sName };
                        })
                    )
                });

            } catch (oError) {
                console.error("Product summary load error:", oError);
            }
        },

        // ==============================================================
        // Formatter
        // ==============================================================

        formatCategoryState: function (sCategory) {
            switch (String(sCategory || "").toUpperCase()) {
                case "VEHICLES":
                    return "Information";
                case "ELECTRONICS":
                    return "Warning";
                default:
                    return "None";
            }
        },

        // ==============================================================
        // Refresh
        // ==============================================================

        onRefresh: async function () {
            const oTable = this.byId("productTable");
            if (!oTable) return;
            const oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            try {
                await oBinding.requestRefresh();
                this._loadSummary();
                MessageToast.show("Product data refreshed");
            } catch (oError) {
                console.error("Refresh error:", oError);
                MessageBox.error("Unable to refresh product data.\n\n" + this._getErrorMessage(oError));
            }
        },

        // ==============================================================
        // Search + category filter
        // ==============================================================

        onSearch: function () {
            this._applyFilters();
        },

        onCategoryChange: function () {
            this._applyFilters();
        },

        onClearFilters: function () {
            const oSearch = this.byId("productSearchField");
            const oCategory = this.byId("productCategorySelect");

            if (oSearch) oSearch.setValue("");
            if (oCategory) oCategory.setSelectedKey("ALL");

            this._applyFilters();
        },

        _applyFilters: function () {
            const oTable = this.byId("productTable");
            if (!oTable) return;

            const oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            const oSearch = this.byId("productSearchField");
            const oCategory = this.byId("productCategorySelect");

            const sSearch = oSearch ? (oSearch.getValue() || "").trim() : "";
            const sCategory = oCategory ? oCategory.getSelectedKey() : "ALL";

            const aFilters = [];

            if (sSearch) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("productCode", FilterOperator.Contains, sSearch),
                        new Filter("productName", FilterOperator.Contains, sSearch)
                    ],
                    and: false
                }));
            }

            if (sCategory && sCategory !== "ALL") {
                aFilters.push(new Filter("category", FilterOperator.EQ, sCategory));
            }

            oBinding.filter(aFilters, "Application");
        },

        // ==============================================================
        // Navigation
        // ==============================================================

        onViewProduct: function (oEvent) {
            try {
                const oSource = oEvent.getSource();
                const oContext = oSource.getBindingContext();

                if (!oContext) {
                    MessageBox.error("Product information is not available.");
                    return;
                }

                const sProductId = oContext.getProperty("ID");

                if (!sProductId) {
                    MessageBox.error("Product ID is missing.");
                    return;
                }

                this.getOwnerComponent().getRouter().navTo("ProductObjectPage", {
                    productId: String(sProductId)
                });

            } catch (oError) {
                console.error("Navigation error:", oError);
                MessageBox.error("Unable to open Product Details.\n\n" + this._getErrorMessage(oError));
            }
        },

        // ==============================================================
        // Helpers
        // ==============================================================

        _getErrorMessage: function (oError) {
            if (oError && oError.message) return oError.message;
            if (oError && oError.cause && oError.cause.message) return oError.cause.message;

            if (oError && oError.responseText) {
                try {
                    const oResponse = JSON.parse(oError.responseText);
                    if (oResponse.error && oResponse.error.message) return oResponse.error.message;
                } catch (e) {
                    // Ignore JSON parse error
                }
            }

            return "Operation failed.";
        }

    });
});