sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    var MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    return Controller.extend("purchasemanagement.controller.MonthlyAnalytics", {

        // CAP serializes cds.Decimal fields as JSON STRINGS in OData V4
        // (monthlyRevenue, monthlyTax, avgOrderValue are all Decimal(15,2)
        // in the CDS view) — using += directly does string concatenation,
        // not addition, and silently produces NaN. Always coerce first.
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

            var oBinding = oModel.bindList("/MonthlyAnalytics", null, [], [], { $orderby: "orderYear,orderMonth" });

            oBinding.requestContexts(0, 1000).then(function (aContexts) {
                var aData = aContexts.map(function (c) { return c.getObject(); });

                var totalRevenue = 0, totalOrders = 0, totalTax = 0, orderValueSum = 0;
                aData.forEach(function (row) {
                    totalRevenue += this._toNumber(row.monthlyRevenue);
                    totalOrders += this._toNumber(row.orderCount);
                    totalTax += this._toNumber(row.monthlyTax);
                    orderValueSum += this._toNumber(row.avgOrderValue);
                }.bind(this));

                var last6 = aData.slice(-6);
                var aMonthlyBreakdown = last6.map(function (row) {
                    return {
                        monthLabel: MONTH_NAMES[(row.orderMonth - 1) % 12] + " " + row.orderYear,
                        orderCount: this._toNumber(row.orderCount),
                        monthlyRevenue: this._toNumber(row.monthlyRevenue),
                        monthlyTax: this._toNumber(row.monthlyTax),
                        avgOrderValue: this._toNumber(row.avgOrderValue)
                    };
                }.bind(this));

                var oKPIModel = new JSONModel({
                    totalRevenue: totalRevenue,
                    totalOrders: totalOrders,
                    totalTax: totalTax,
                    avgOrderValue: aData.length ? (orderValueSum / aData.length) : 0,
                    monthlyBreakdown: aMonthlyBreakdown.slice().reverse(), // newest first in the table

                    // ---- chart panels ----
                    trendAreaSvg: this._buildTrendAreaSvg(aMonthlyBreakdown),
                    orderCountBarsHtml: this._buildOrderCountBarsHtml(aMonthlyBreakdown)
                });
                this.getView().setModel(oKPIModel, "kpi");
            }.bind(this)).catch(function (oErr) {
                sap.m.MessageToast.show("Failed to load Monthly Analytics: " + oErr.message);
            });
        },

        // ================= Panel 1: SVG filled area chart =================
        _buildTrendAreaSvg: function (aMonths) {
            if (!aMonths.length) {
                return '<div class="chartEmptyState">No revenue data</div>';
            }
            var iWidth = 320, iHeight = 150, iPad = 28;
            var aValues = aMonths.map(function (m) { return m.monthlyRevenue; });
            var fMin = Math.min.apply(null, aValues.concat([0]));
            var fMax = Math.max.apply(null, aValues) || 1;
            var fRange = (fMax - fMin) || 1;
            var iStep = (iWidth - 2 * iPad) / (Math.max(aMonths.length - 1, 1));

            var aPoints = aMonths.map(function (m, i) {
                var x = iPad + i * iStep;
                var y = iHeight - iPad - ((m.monthlyRevenue - fMin) / fRange) * (iHeight - 2 * iPad);
                return { x: x, y: y, label: m.monthLabel };
            });

            var sLinePoints = aPoints.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(" ");
            var sAreaPoints = sLinePoints +
                ' ' + aPoints[aPoints.length - 1].x.toFixed(1) + ',' + (iHeight - iPad) +
                ' ' + aPoints[0].x.toFixed(1) + ',' + (iHeight - iPad);

            var sCircles = aPoints.map(function (p) {
                return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.5" fill="#2D9CDB" />';
            }).join("");
            var sLabels = aPoints.map(function (p) {
                return '<text x="' + p.x.toFixed(1) + '" y="' + (iHeight - 8) + '" font-size="9" text-anchor="middle" fill="#666">' +
                    this._esc(p.label) + '</text>';
            }.bind(this)).join("");

            return '' +
                '<svg width="100%" height="' + iHeight + '" viewBox="0 0 ' + iWidth + ' ' + iHeight + '" xmlns="http://www.w3.org/2000/svg">' +
                    '<defs>' +
                        '<linearGradient id="revenueAreaFill" x1="0" y1="0" x2="0" y2="1">' +
                            '<stop offset="0%" stop-color="#2D9CDB" stop-opacity="0.35" />' +
                            '<stop offset="100%" stop-color="#2D9CDB" stop-opacity="0.02" />' +
                        '</linearGradient>' +
                    '</defs>' +
                    '<polygon points="' + sAreaPoints + '" fill="url(#revenueAreaFill)" />' +
                    '<polyline points="' + sLinePoints + '" fill="none" stroke="#2D9CDB" stroke-width="2.2" />' +
                    sCircles +
                    sLabels +
                '</svg>';
        },

        // ================= Panel 2: vertical column bar chart =================
        _buildOrderCountBarsHtml: function (aMonths) {
            if (!aMonths.length) {
                return '<div class="chartEmptyState">No order data</div>';
            }
            var fMax = Math.max.apply(null, aMonths.map(function (m) { return m.orderCount; })) || 1;

            var sCols = aMonths.map(function (m) {
                var fHeightPct = (m.orderCount / fMax) * 100;
                return '' +
                    '<div class="vBarCol">' +
                        '<div class="vBarValue">' + m.orderCount + '</div>' +
                        '<div class="vBarTrack"><div class="vBarFill" style="height:' + fHeightPct.toFixed(1) + '%"></div></div>' +
                        '<div class="vBarLabel">' + this._esc(m.monthLabel) + '</div>' +
                    '</div>';
            }.bind(this)).join("");

            return '<div class="vBarChart">' + sCols + '</div>';
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