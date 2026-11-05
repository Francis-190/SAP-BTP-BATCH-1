sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, JSONModel, Filter, FilterOperator) {
    "use strict";

    // Constants

    // L2_APPROVED removed: it is not part of the DealerStatus enum in the CDS model
    const STATUS_LIST = [
        { key: "ACTIVE",   label: "Active"      },

        { key: "PENDING",   label: "Pending"     },

        { key: "SUBMITTED",  label: "Submitted"   },

        { key: "L1_APPROVED", label: "L1 Approved" },

        { key: "REJECTED",   label: "Rejected"    },

        { key: "BLOCKED",    label: "Blocked"     },

        { key: "INACTIVE",   label: "Inactive"    }
    ];

    // Order of the approval pipeline chart
    const PIPELINE_KEYS = ["PENDING", "SUBMITTED", "L1_APPROVED", "ACTIVE"];

    // Display labels for Products.category (plain String field in the CDS model)
    const CATEGORY_LABELS = {
        TRACTOR: "Tractor",
        SPARE_PART: "Spare Part",
        IMPLEMENT: "Implement"
    };

    return Controller.extend("dealermangement.controller.Home", {

        // Lifecycle

        onInit: function () {
            this.getView().setModel(
                new JSONModel({
                    totalDealers: 0,
                    activeDealers: 0,
                    pendingDealers: 0,
                    rejectedDealers: 0
                }),
                "kpi"
            );

            this.getView().setModel(
                new JSONModel({
                    statusData: [],
                    typeData: [],
                    pipelineData: [],
                    monthlyData: [],
                    priceData: [],
                    topProductData: []
                }),
                "chart"
            );

            this._loadKPIs();
        },

        onAfterRendering: function () {
            this._attachCardPress("kpiCardTotal", this.onGoToDealers);
            this._attachCardPress("kpiCardActive", this.onGoToDealers);
            this._attachCardPress("kpiCardPending", this.onGoToDealers);
            this._attachCardPress("kpiCardRejected", this.onGoToDealers);
        },

        _attachCardPress: function (sId, fnHandler) {
            const oControl = this.byId(sId);
            if (!oControl) return;

            const oDom = oControl.getDomRef();
            if (!oDom || oDom.dataset.pressBound) return;

            oDom.dataset.pressBound = "true";
            oDom.style.cursor = "pointer";
            oDom.setAttribute("tabindex", "0");
            oDom.setAttribute("role", "button");

            oDom.addEventListener("click", fnHandler.bind(this));
            oDom.addEventListener("keydown", function (oKeyEvent) {
                if (oKeyEvent.key === "Enter" || oKeyEvent.key === " ") {
                    oKeyEvent.preventDefault();
                    fnHandler.call(this);
                }
            }.bind(this));
        },

        // Formatters

        formatStatusState: function (sStatus) {
            switch (sStatus) {
                case "ACTIVE":
                    return "Success";
                case "PENDING":
                case "SUBMITTED":
                    return "Warning";
                case "L1_APPROVED":
                    return "Information";
                case "REJECTED":
                case "BLOCKED":
                    return "Error";
                default:
                    return "None";
            }
        },

        // ==============================================================
        // Refresh
        // ==============================================================

        onRefreshKPIs: function () {
            this._loadKPIs();

            const oBinding = this.byId("recentDealersTable").getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
        },

        // ==============================================================
        // Data loading
        // ==============================================================

        _loadKPIs: async function () {
            const oModel = this.getOwnerComponent().getModel();
            const oKPIModel = this.getView().getModel("kpi");
            const oChartModel = this.getView().getModel("chart");

            if (!oModel || !oKPIModel) return;

            this.getView().setBusy(true);

            try {
                const oPendingFilter = new Filter({
                    filters: [
                        new Filter("status", FilterOperator.EQ, "PENDING"),
                        new Filter("status", FilterOperator.EQ, "SUBMITTED"),
                        new Filter("status", FilterOperator.EQ, "L1_APPROVED")
                    ],
                    and: false
                });

                const oRejectedFilter = new Filter({
                    filters: [
                        new Filter("status", FilterOperator.EQ, "REJECTED"),
                        new Filter("status", FilterOperator.EQ, "BLOCKED")
                    ],
                    and: false
                });

                const [iTotal, iActive, iPending, iRejected, aStatusCounts] = await Promise.all([
                    this._getDealerCount(oModel, []),
                    this._getDealerCount(oModel, [new Filter("status", FilterOperator.EQ, "ACTIVE")]),
                    this._getDealerCount(oModel, [oPendingFilter]),
                    this._getDealerCount(oModel, [oRejectedFilter]),
                    Promise.all(
                        STATUS_LIST.map((oStatus) =>
                            this._getDealerCount(oModel, [
                                new Filter("status", FilterOperator.EQ, oStatus.key)
                            ])
                        )
                    )
                ]);

                oKPIModel.setData({
                    totalDealers: iTotal,
                    activeDealers: iActive,
                    pendingDealers: iPending,
                    rejectedDealers: iRejected
                });

                // Chart 1: dealers by status (skip zero counts)
                oChartModel.setProperty(
                    "/statusData",
                    STATUS_LIST
                        .map((oStatus, i) => ({ label: oStatus.label, count:aStatusCounts[i] }))
                        .filter((oItem) => oItem.count > 0)
                );

                // Chart 3: approval pipeline (keeps zero counts so stages always show)
                oChartModel.setProperty(
                    "/pipelineData",
                    PIPELINE_KEYS.map((sKey) => {
                        const iIndex = STATUS_LIST.findIndex((o) => o.key === sKey);
                        return {
                            label: STATUS_LIST[iIndex].label,
                            count: aStatusCounts[iIndex]
                        };
                    })
                );

            } catch (oError) {
                console.error("KPI load error:", oError);
            } finally {
                this.getView().setBusy(false);
            }

            // Independent loads: a failure in one must not break the others
            this._loadDealerStats(oModel, oChartModel);
            this._loadProducts(oModel, oChartModel);
        },

        _getDealerCount: async function (oModel, aFilters) {
            const oBinding = oModel.bindList("/Dealers", null, [], aFilters, { $count: true });
            await oBinding.requestContexts(0, 0);
            const iCount = await oBinding.getHeaderContext().requestProperty("$count");
            return iCount || 0;
        },

        // ----------------------------------------------------------
        // Dealer charts: by month, by type
        // ----------------------------------------------------------
        _loadDealerStats: async function (oModel, oChartModel) {
            try {
                const oBinding = oModel.bindList("/Dealers", null, [], [], {
                    $select: "createdAt,dealerType"
                });
                const aContexts = await oBinding.requestContexts(0, 1000);
                const aDealers = aContexts.map((oContext) => oContext.getObject());

                // ---- by month ----
                const oMonthCounts = {};
                let iNoDate = 0;

                aDealers.forEach((oDealer) => {
                    if (!oDealer.createdAt) {
                        iNoDate++;
                        return;
                    }
                    const oDate = new Date(oDealer.createdAt);
                    const sKey = oDate.getFullYear() + "-" + String(oDate.getMonth() + 1).padStart(2, "0");
                    oMonthCounts[sKey] = (oMonthCounts[sKey] || 0) + 1;
                });

                const aMonthly = Object.keys(oMonthCounts)
                    .sort()
                    .slice(-12)
                    .map((sKey) => {
                        const aParts = sKey.split("-");
                        const oMonth = new Date(Number(aParts[0]), Number(aParts[1]) - 1, 1);
                        return {
                            label: oMonth.toLocaleString("en-US", { month: "short", year: "2-digit" }),
                            count: oMonthCounts[sKey]
                        };
                    });

                if (iNoDate > 0) {
                    aMonthly.push({ label: "No date", count: iNoDate });
                }

                oChartModel.setProperty("/monthlyData", aMonthly);

                // ---- by type ----
                oChartModel.setProperty(
                    "/typeData",
                    this._countBy(aDealers, (oDealer) => oDealer.dealerType || "Unknown")
                );

            } catch (oError) {
                console.error("Dealer stats load error:", oError);
            }
        },

        // ----------------------------------------------------------
        // Product charts: avg price by category, top 5 by price
        // category is a plain String field, so it is read with $select
        // (no $expand: it is not a navigation property)
        // ----------------------------------------------------------
        _loadProducts: async function (oModel, oChartModel) {
            let aContexts = [];

            try {
                const oBinding = oModel.bindList("/Products", null, [], [], {
                    $select: "productCode,productName,category,unitPrice,active"
                });
                aContexts = await oBinding.requestContexts(0, 1000);
            } catch (oError) {
                console.error("Products load error:", oError);
                return;
            }

            const aProducts = aContexts.map((oContext) => oContext.getObject());

            // ---- average unit price by category ----
            const oPriceSums = {};

            aProducts.forEach((oProduct) => {
                const sCategory = this._getCategoryLabel(oProduct);
                const fPrice = parseFloat(oProduct.unitPrice) || 0;

                if (!oPriceSums[sCategory]) {
                    oPriceSums[sCategory] = { total: 0, count: 0 };
                }
                oPriceSums[sCategory].total += fPrice;
                oPriceSums[sCategory].count++;
            });

            oChartModel.setProperty(
                "/priceData",
                Object.keys(oPriceSums).map((sCategory) => ({
                    label: sCategory,
                    count: Math.round(oPriceSums[sCategory].total / oPriceSums[sCategory].count)
                }))
            );

            // ---- top 5 products by price ----
            oChartModel.setProperty(
                "/topProductData",
                aProducts
                    .map((oProduct) => ({
                        label: oProduct.productName || oProduct.productCode || "Unnamed",
                        count: parseFloat(oProduct.unitPrice) || 0
                    }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5)
            );
        },

        // ----------------------------------------------------------
        // Helpers
        // ----------------------------------------------------------
        _countBy: function (aItems, fnLabel) {
            const oCounts = {};

            aItems.forEach((oItem) => {
                const sLabel = String(fnLabel(oItem));
                oCounts[sLabel] = (oCounts[sLabel] || 0) + 1;
            });

            return Object.keys(oCounts).map((sLabel) => ({
                label: sLabel,
                count: oCounts[sLabel]
            }));
        },

        _getCategoryLabel: function (oProduct) {
            return CATEGORY_LABELS[oProduct.category] || oProduct.category || "Uncategorized";
        },

        // ==============================================================
        // Navigation
        // ==============================================================

        onGoToDealers: function () {
            this.getOwnerComponent().getRouter().navTo("RouteDealer");
        },

        onGoToProducts: function () {
            this.getOwnerComponent().getRouter().navTo("RouteProducts");
        }

    });
});