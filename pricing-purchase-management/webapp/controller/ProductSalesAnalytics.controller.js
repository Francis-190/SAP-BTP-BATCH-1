sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    // Fixed palette — matches the reference dashboard's colorful style
    var PALETTE = ["#2D9CDB", "#27AE60", "#F2C94C", "#9B51E0", "#EB5757"];

    return Controller.extend("purchasemanagement.controller.ProductSalesAnalytics", {

        // CAP serializes cds.Decimal fields as JSON STRINGS in OData V4
        // (e.g. "12000.50") to avoid floating-point precision loss on money
        // values. Using += directly on a string does string concatenation,
        // not addition, and the corrupted result becomes NaN downstream.
        // Always coerce through this before any arithmetic.
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

            var oBinding = oModel.bindList("/ProductSalesAnalytics", null, [], [], { $orderby: "totalRevenue desc" });

            oBinding.requestContexts(0, 1000).then(function (aContexts) {
                var aData = aContexts.map(function (c) { return c.getObject(); });

                var totalQty = 0, totalRevenue = 0, unitPriceSum = 0;
                aData.forEach(function (row) {
                    totalQty += this._toNumber(row.totalQtySold);
                    totalRevenue += this._toNumber(row.totalRevenue);
                    unitPriceSum += this._toNumber(row.avgUnitPrice);
                }.bind(this));

                var aSorted = aData.slice().sort(function (a, b) {
                    return this._toNumber(b.totalRevenue) - this._toNumber(a.totalRevenue);
                }.bind(this));
                var topProduct = aSorted.length ? aSorted[0] : null;
                var aTop5 = aSorted.slice(0, 5);

                var oKPIModel = new JSONModel({
                    totalQtySold: totalQty,
                    totalRevenue: totalRevenue,
                    avgUnitPrice: aData.length ? (unitPriceSum / aData.length) : 0,
                    topProductName: topProduct ? topProduct.productName : "-",
                    topProducts: aTop5,

                    // ---- chart panels, built as plain HTML/SVG/CSS ----
                    topRevenueBarsHtml: this._buildBarListHtml(aTop5, totalRevenue),
                    revenueShareHtml: this._buildDonutHtml(aTop5, totalRevenue)
                });
                this.getView().setModel(oKPIModel, "kpi");
            }.bind(this)).catch(function (oErr) {
                sap.m.MessageToast.show("Failed to load Product Sales Analytics: " + oErr.message);
            });
        },

        // ================= Panel 1: horizontal colored bar list =================
        _buildBarListHtml: function (aTop5, fTotalRevenue) {
            if (!aTop5.length) {
                return '<div class="chartEmptyState">No product data</div>';
            }
            var fMax = this._toNumber(aTop5[0].totalRevenue) || 1;
            var sRows = aTop5.map(function (row, i) {
                var fRevenue = this._toNumber(row.totalRevenue);
                var fWidthPct = fTotalRevenue ? (fRevenue / fMax) * 100 : 0;
                var fSharePct = fTotalRevenue ? (fRevenue / fTotalRevenue) * 100 : 0;
                var sColor = PALETTE[i % PALETTE.length];
                return '' +
                    '<div class="chartBarRow">' +
                        '<span class="chartBarLabel">' + this._esc(row.productName) + '</span>' +
                        '<div class="chartBarTrack">' +
                            '<div class="chartBarFill" style="width:' + fWidthPct.toFixed(1) + '%;background:' + sColor + '"></div>' +
                        '</div>' +
                        '<span class="chartBarPercent">' + fSharePct.toFixed(0) + '%</span>' +
                    '</div>';
            }.bind(this)).join("");
            return '<div class="chartBarList">' + sRows + '</div>';
        },

        // ================= Panel 2: CSS conic-gradient donut with center total =================
        _buildDonutHtml: function (aTop5, fTotalRevenue) {
            if (!aTop5.length) {
                return '<div class="chartEmptyState">No product data</div>';
            }
            var fSubsetTotal = aTop5.reduce(function (sum, r) { return sum + this._toNumber(r.totalRevenue); }.bind(this), 0) || 1;
            var fCursor = 0;
            var aSegments = [];
            var aLegend = [];

            aTop5.forEach(function (row, i) {
                var fRevenue = this._toNumber(row.totalRevenue);
                var fPct = (fRevenue / fSubsetTotal) * 100;
                var sColor = PALETTE[i % PALETTE.length];
                aSegments.push(sColor + ' ' + fCursor.toFixed(1) + '% ' + (fCursor + fPct).toFixed(1) + '%');
                aLegend.push(
                    '<div class="donutLegendRow">' +
                        '<span class="donutLegendDot" style="background:' + sColor + '"></span>' +
                        '<span class="donutLegendLabel">' + this._esc(row.productName) + '</span>' +
                        '<span class="donutLegendPct">' + fPct.toFixed(0) + '%</span>' +
                    '</div>'
                );
                fCursor += fPct;
            }.bind(this));

            var sGradient = aSegments.join(", ");
            var sCenterValue = this.formatCurrency(fTotalRevenue);

            return '' +
                '<div class="donutWrapper">' +
                    '<div class="donutRing" style="background: conic-gradient(' + sGradient + ')">' +
                        '<div class="donutCenter">' +
                            '<div class="donutCenterValue">' + sCenterValue + '</div>' +
                            '<div class="donutCenterLabel">Total Revenue</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="donutLegend">' + aLegend.join("") + '</div>' +
                '</div>';
        },

        _esc: function (s) {
            return String(s == null ? "" : s)
                .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        },

        formatCurrency: function (fValue) {
            var n = this._toNumber(fValue);
            return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
        }
    });
});