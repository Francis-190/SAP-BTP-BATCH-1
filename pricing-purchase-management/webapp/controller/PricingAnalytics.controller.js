sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    var CATEGORY_PALETTE = ["#2D9CDB", "#27AE60", "#F2C94C", "#9B51E0", "#EB5757", "#56CCF2"];

    return Controller.extend("purchasemanagement.controller.PricingAnalytics", {

        // basePrice, discount, tax, finalPrice are all cds.Decimal fields —
        // CAP sends them as JSON strings in OData V4. Always coerce
        // through this before arithmetic or comparisons.
        _toNumber: function (v) {
            var n = parseFloat(v);
            return isNaN(n) ? 0 : n;
        },

        onInit: function () {
            this._loadKPIs();
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteApp");
        },

        _loadKPIs: function () {
            var oModel = this.getOwnerComponent().getModel("analytics");
            if (!oModel) {
                sap.m.MessageToast.show("Analytics data source is not available.");
                return;
            }

            // PricingTrendAnalytics was dropped — its productName/productCode
            // come back null for records with a broken PriceHistory ->
            // PriceMaster -> Product reference chain. PricingAnalytics is a
            // direct, flat entity with no join chain, and already proven
            // reliable (it backs the KPI tiles and the category donut).
            var oPriceBinding = oModel.bindList("/PricingAnalytics", null, [], [], { $orderby: "validFrom desc" });

            oPriceBinding.requestContexts(0, 1000).then(function (aContexts) {
                var aPriceData = aContexts.map(function (c) { return c.getObject(); });

                var activeCount = 0, discountPctSum = 0, priceIncreases = 0;
                var productSet = {};
                var oCategoryMap = {};
                var oRegionMap = {}; // regionName -> { discountSum, baseSum }

                aPriceData.forEach(function (row) {
                    productSet[row.productId] = true;
                    if (row.priceStatus === "ACTIVE") { activeCount++; }

                    var fBase = this._toNumber(row.basePrice);
                    var fFinal = this._toNumber(row.finalPrice);
                    var fDiscount = this._toNumber(row.discount);
                    if (fBase) {
                        discountPctSum += (fDiscount / fBase) * 100;
                    }
                    if (fFinal - fBase > 0) { priceIncreases++; }

                    var sCategory = row.category || "Uncategorized";
                    oCategoryMap[sCategory] = (oCategoryMap[sCategory] || 0) + 1;

                    var sRegion = row.regionName || "Unspecified";
                    if (!oRegionMap[sRegion]) {
                        oRegionMap[sRegion] = { discountSum: 0, baseSum: 0 };
                    }
                    oRegionMap[sRegion].discountSum += fDiscount;
                    oRegionMap[sRegion].baseSum += fBase;
                }.bind(this));

                var aRecentPriceRecords = aPriceData.slice(0, 6).map(function (row) {
                    return {
                        productName: row.productName,
                        productCode: row.productCode,
                        regionName: row.regionName,
                        basePrice: this._toNumber(row.basePrice),
                        finalPrice: this._toNumber(row.finalPrice),
                        validFrom: row.validFrom,
                        priceStatus: row.priceStatus
                    };
                }.bind(this));

                var oKPIModel = new JSONModel({
                    pricedProducts: Object.keys(productSet).length,
                    avgDiscountPct: aPriceData.length ? (discountPctSum / aPriceData.length) : 0,
                    activePrices: activeCount,
                    priceIncreases: priceIncreases,
                    recentPriceRecords: aRecentPriceRecords,

                    // ---- chart panels ----
                    regionDiscountBarsHtml: this._buildRegionDiscountBarsHtml(oRegionMap),
                    categoryDonutHtml: this._buildCategoryDonutHtml(oCategoryMap)
                });
                this.getView().setModel(oKPIModel, "kpi");
            }.bind(this)).catch(function (oErr) {
                sap.m.MessageToast.show("Failed to load Pricing Analytics: " + oErr.message);
            });
        },

        // ================= Panel 1: avg discount % by region — vertical bars =================
        _buildRegionDiscountBarsHtml: function (oRegionMap) {
            var aRegions = Object.keys(oRegionMap);
            if (!aRegions.length) {
                return '<div class="chartEmptyState">No region data</div>';
            }

            var aBars = aRegions.map(function (sRegion) {
                var o = oRegionMap[sRegion];
                var fPct = o.baseSum ? (o.discountSum / o.baseSum) * 100 : 0;
                return { region: sRegion, pct: fPct };
            });

            var fMax = Math.max.apply(null, aBars.map(function (b) { return b.pct; })) || 1;

            var sCols = aBars.map(function (b) {
                var fHeightPct = (b.pct / fMax) * 100;
                return '' +
                    '<div class="vBarCol">' +
                        '<div class="vBarValue">' + b.pct.toFixed(1) + '%</div>' +
                        '<div class="vBarTrack"><div class="vBarFill" style="height:' + fHeightPct.toFixed(1) + '%"></div></div>' +
                        '<div class="vBarLabel">' + this._esc(b.region) + '</div>' +
                    '</div>';
            }.bind(this)).join("");

            return '<div class="vBarChart">' + sCols + '</div>';
        },

        // ================= Panel 2: category donut =================
        _buildCategoryDonutHtml: function (oCategoryMap) {
            var aCategories = Object.keys(oCategoryMap);
            if (!aCategories.length) {
                return '<div class="chartEmptyState">No category data</div>';
            }
            var iTotal = aCategories.reduce(function (sum, k) { return sum + oCategoryMap[k]; }, 0) || 1;
            var fCursor = 0;
            var aSegments = [];
            var aLegend = [];

            aCategories.forEach(function (sCategory, i) {
                var iCount = oCategoryMap[sCategory];
                var fPct = (iCount / iTotal) * 100;
                var sColor = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
                aSegments.push(sColor + ' ' + fCursor.toFixed(1) + '% ' + (fCursor + fPct).toFixed(1) + '%');
                aLegend.push(
                    '<div class="donutLegendRow">' +
                        '<span class="donutLegendDot" style="background:' + sColor + '"></span>' +
                        '<span class="donutLegendLabel">' + this._esc(sCategory) + '</span>' +
                        '<span class="donutLegendPct">' + fPct.toFixed(0) + '%</span>' +
                    '</div>'
                );
                fCursor += fPct;
            }.bind(this));

            return '' +
                '<div class="donutWrapper">' +
                    '<div class="donutRing" style="background: conic-gradient(' + aSegments.join(", ") + ')">' +
                        '<div class="donutCenter">' +
                            '<div class="donutCenterValue">' + iTotal + '</div>' +
                            '<div class="donutCenterLabel">Products</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="donutLegend">' + aLegend.join("") + '</div>' +
                '</div>';
        },

        _esc: function (s) {
            return String(s == null ? "" : s)
                .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        },

        formatPercent: function (fValue) {
            var n = this._toNumber(fValue);
            return n.toFixed(1) + "%";
        },

        formatNumber: function (fValue) {
            var n = this._toNumber(fValue);
            return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },

        formatPriceStatusState: function (sStatus) {
            switch (sStatus) {
                case "ACTIVE": return "Success";
                case "PENDING": return "Warning";
                case "REJECTED": return "Error";
                default: return "None";
            }
        }
    });
});