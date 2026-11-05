sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox"
], function (Controller, History, JSONModel, MessageBox) {
    "use strict";

    const EMPTY_INSIGHT = {
        categoryName: "",
        // categoryDescription: "",
        categoryCount: 0,
        categoryActiveText: "",
        avgText: "",
        lowestText: "",
        highestText: "",
        rankText: "",
        pctOfMax: 0,
        pctOfMaxText: "",
        pctOfAvg: 0,
        pctOfAvgText: "",
        vsAvgText: "",
        vsAvgState: "None",
        chartData: [],
        related: []
    };

    return Controller.extend("dealermangement.controller.ProductObjectPage", {

        // ==============================================================
        // Lifecycle
        // ==============================================================

        onInit: function () {
            this.getView().setModel(new JSONModel(Object.assign({}, EMPTY_INSIGHT)), "insight");

            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("ProductObjectPage").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            const sProductId = oEvent.getParameter("arguments").productId;

            if (!sProductId) {
                MessageBox.error("Product ID is missing.");
                return;
            }

            this._sProductId = sProductId;

            const oView = this.getView();
            oView.setBusy(true);

            oView.getModel("insight").setData(Object.assign({}, EMPTY_INSIGHT));

            oView.bindElement({
                path: "/Products(" + sProductId + ")",
                
                events: {
                    dataReceived: function () {
                        oView.setBusy(false);
                    }
                }
            });

            this._loadInsights(sProductId);
        },

        // ==============================================================
        // Insights: computed from the products list
        // ==============================================================

        _loadInsights: async function (sProductId) {
            const oModel = this.getOwnerComponent().getModel();
            const oInsightModel = this.getView().getModel("insight");

            if (!oModel) return;

            try {
                const oBinding = oModel.bindList("/Products", null, [], [], {});
                const aContexts = await oBinding.requestContexts(0, 1000);

                // Ignore the result if the user already moved to another product
                if (this._sProductId !== sProductId) return;

                const aProducts = aContexts.map((oContext) => oContext.getObject());
                const oCurrent = aProducts.find((oProduct) => String(oProduct.ID) === String(sProductId));

                if (!oCurrent) return;

                const sKey = this._categoryKey(oCurrent);
                const aSameCategory = aProducts.filter((oProduct) => this._categoryKey(oProduct) === sKey);

                const fPrice = this._price(oCurrent);
                const aPrices = aSameCategory.map((oProduct) => this._price(oProduct));

                const fTotal = aPrices.reduce((fSum, fValue) => fSum + fValue, 0);
                const fAverage = aPrices.length ? fTotal / aPrices.length : 0;
                const fHighest = aPrices.length ? Math.max.apply(null, aPrices) : 0;
                const fLowest = aPrices.length ? Math.min.apply(null, aPrices) : 0;

                // Rank by price, highest first
                const aRanked = aSameCategory
                    .slice()
                    .sort((a, b) => this._price(b) - this._price(a));
                const iRank = aRanked.findIndex((oProduct) => String(oProduct.ID) === String(sProductId)) + 1;

                const sCategoryName = oCurrent.category ;

                // Comparison with the category average
                const fVsAverage = fAverage > 0 ? ((fPrice / fAverage) - 1) * 100 : 0;
                let sVsAvgText = "Equal to the category average";
                let sVsAvgState = "Information";

                if (fVsAverage > 0.5) {
                    sVsAvgText = Math.round(fVsAverage) + "% above the category average";
                    sVsAvgState = "Warning";
                } else if (fVsAverage < -0.5) {
                    sVsAvgText = Math.round(Math.abs(fVsAverage)) + "% below the category average";
                    sVsAvgState = "Success";
                }

                const fPctOfMax = fHighest > 0 ? (fPrice / fHighest) * 100 : 0;
                const fPctOfAvg = fAverage > 0 ? (fPrice / fAverage) * 100 : 0;

                oInsightModel.setData({
                    categoryName: oCurrent.category ,
                    //categoryDescription: oCurrent.category && oCurrent.category.description || "",
                    categoryCount: aSameCategory.length,
                    categoryActiveText: aSameCategory.filter((oProduct) => oProduct.active).length +
                        " of " + aSameCategory.length,
                    avgText: this._formatPrice(fAverage),
                    lowestText: this._formatPrice(fLowest),
                    highestText: this._formatPrice(fHighest),
                    rankText: "#" + iRank + " of " + aSameCategory.length + " in " + sCategoryName,
                    pctOfMax: Math.min(Math.round(fPctOfMax), 100),
                    pctOfMaxText: Math.round(fPctOfMax) + "% of highest",
                    pctOfAvg: Math.min(Math.round(fPctOfAvg), 100),
                    pctOfAvgText: Math.round(fPctOfAvg) + "% of average",
                    vsAvgText: sVsAvgText,
                    vsAvgState: sVsAvgState,
                    chartData: [
                        { label: "This Product", value: Math.round(fPrice) },
                        { label: "Category Average", value: Math.round(fAverage) },
                        { label: "Category Highest", value: Math.round(fHighest) }
                    ],
                    related: aRanked
                        .filter((oProduct) => String(oProduct.ID) !== String(sProductId))
                        .slice(0, 8)
                        .map((oProduct) => ({
                            ID: oProduct.ID,
                            productCode: oProduct.productCode,
                            productName: oProduct.productName,
                            priceNumber: this._price(oProduct).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                            active: !!oProduct.active
                        }))
                });

            } catch (oError) {
                console.error("Product insights load error:", oError);
            } finally {
                if (this._sProductId === sProductId) {
                    this.getView().setBusy(false);
                }
            }
        },

        // ==============================================================
        // Helpers
        // ==============================================================

        _categoryKey: function (oProduct) {
            if (oProduct.category_ID) return String(oProduct.category_ID);

            if (oProduct.category) {
                return String(oProduct.category.ID || oProduct.category.categoryName || "none");
            }

            return "none";
        },

        _price: function (oProduct) {
            return parseFloat(oProduct.unitPrice) || 0;
        },

        _formatPrice: function (fValue) {
            return fValue.toLocaleString("en-IN", { maximumFractionDigits: 0 }) + " INR";
        },

        // ==============================================================
        // Navigation
        // ==============================================================

        onViewRelated: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext("insight");
            if (!oContext) return;

            const sId = oContext.getProperty("ID");
            if (!sId) return;

            this.getOwnerComponent().getRouter().navTo("ProductObjectPage", {
                productId: String(sId)
            });
        },

        onBack: function () {
            const oHistory = History.getInstance();
            const sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("RouteProducts", {}, true);
            }
        }

    });
});