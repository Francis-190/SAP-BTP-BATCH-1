sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    // Status → color mapping, reused for both the table's ObjectStatus
    // and the stacked bar chart below
    var STATUS_COLORS = {
        APPROVED: "#27AE60",
        DELIVERED: "#27AE60",
        PENDING: "#F2994A",
        SUBMITTED: "#1868bdd2",
        REJECT: "#EB5757"
    };
    var DEFAULT_STATUS_COLOR = "#9AA0A6";

    var RANK_COLORS = ["#F2C94C", "#B0B3B8", "#C97B3F"]; // gold, silver, bronze
    var DEFAULT_RANK_COLOR = "#2D9CDB";

    return Controller.extend("purchasemanagement.controller.DealerAnalytics", {

        // CAP serializes cds.Decimal fields as JSON STRINGS in OData V4
        // to preserve precision — using += directly on them does string
        // concatenation, not addition, and silently produces NaN later.
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

            var oBinding = oModel.bindList("/DealerAnalytics");

            oBinding.requestContexts(0, 1000).then(function (aContexts) {
                var aData = aContexts.map(function (c) { return c.getObject(); });

                var oDealerMap = {};
                var oStatusMap = {};
                var totalOrders = 0;
                var totalRevenue = 0;
                var pendingOrders = 0;

                aData.forEach(function (row) {
                    var fOrders = this._toNumber(row.totalOrders);
                    var fRevenue = this._toNumber(row.totalRevenue);

                    totalOrders += fOrders;
                    totalRevenue += fRevenue;
                    if (row.status === "PENDING") {
                        pendingOrders += fOrders;
                    }

                    // status breakdown, across all dealers combined
                    oStatusMap[row.status] = (oStatusMap[row.status] || 0) + fOrders;

                    // merge rows per dealer (data is grouped by dealer + status)
                    if (!oDealerMap[row.dealerId]) {
                        oDealerMap[row.dealerId] = {
                            dealerId: row.dealerId,
                            dealerCode: row.dealerCode,
                            dealerName: row.dealerName,
                            city: row.city,
                            totalOrders: 0,
                            totalRevenue: 0,
                            status: row.status
                        };
                    }
                    oDealerMap[row.dealerId].totalOrders += fOrders;
                    oDealerMap[row.dealerId].totalRevenue += fRevenue;
                }.bind(this));

                var aTopDealers = Object.keys(oDealerMap)
                    .map(function (k) { return oDealerMap[k]; })
                    .sort(function (a, b) { return b.totalRevenue - a.totalRevenue; })
                    .slice(0, 10);

                var oKPIModel = new JSONModel({
                    totalDealers: Object.keys(oDealerMap).length,
                    totalOrders: totalOrders,
                    totalRevenue: totalRevenue,
                    pendingOrders: pendingOrders,
                    topDealers: aTopDealers,

                    // ---- chart panels, distinct style from Product Sales Analytics ----
                    leaderboardHtml: this._buildLeaderboardHtml(aTopDealers.slice(0, 5)),
                    statusStackedBarHtml: this._buildStatusStackedBarHtml(oStatusMap, totalOrders)
                });
                this.getView().setModel(oKPIModel, "kpi");
            }.bind(this)).catch(function (oErr) {
                sap.m.MessageToast.show("Failed to load Dealer Analytics: " + oErr.message);
            });
        },

        // ================= Panel 1: leaderboard with rank badges + progress bars =================
        _buildLeaderboardHtml: function (aTop5) {
            if (!aTop5.length) {
                return '<div class="chartEmptyState">No dealer data</div>';
            }
            var fMax = aTop5[0].totalRevenue || 1;

            var sRows = aTop5.map(function (dealer, i) {
                var fWidthPct = fMax ? (dealer.totalRevenue / fMax) * 100 : 0;
                var sRankColor = RANK_COLORS[i] || DEFAULT_RANK_COLOR;
                var sInitial = (dealer.dealerName || "?").charAt(0).toUpperCase();

                return '' +
                    '<div class="leaderRow">' +
                        '<div class="leaderRank" style="background:' + sRankColor + '">' + (i + 1) + '</div>' +
                        '<div class="leaderAvatar">' + this._esc(sInitial) + '</div>' +
                        '<div class="leaderInfo">' +
                            '<div class="leaderName">' + this._esc(dealer.dealerName) + '</div>' +
                            '<div class="leaderTrack">' +
                                '<div class="leaderFill" style="width:' + fWidthPct.toFixed(1) + '%"></div>' +
                            '</div>' +
                        '</div>' +
                        '<div class="leaderRevenue">' + this.formatCurrency(dealer.totalRevenue) + '</div>' +
                    '</div>';
            }.bind(this)).join("");

            return '<div class="leaderboardList">' + sRows + '</div>';
        },

        // ================= Panel 2: horizontal stacked percentage bar =================
        _buildStatusStackedBarHtml: function (oStatusMap, fTotalOrders) {
            var aStatuses = Object.keys(oStatusMap);
            if (!aStatuses.length || !fTotalOrders) {
                return '<div class="chartEmptyState">No status data</div>';
            }

            var aSegments = [];
            var aLegend = [];

            aStatuses.forEach(function (sStatus) {
                var fCount = oStatusMap[sStatus];
                var fPct = (fCount / fTotalOrders) * 100;
                var sColor = STATUS_COLORS[sStatus] || DEFAULT_STATUS_COLOR;

                aSegments.push(
                    '<div class="stackedSegment" style="width:' + fPct.toFixed(1) + '%;background:' + sColor + '" title="' + this._esc(sStatus) + ': ' + fPct.toFixed(0) + '%"></div>'
                );
                aLegend.push(
                    '<div class="stackedLegendRow">' +
                        '<span class="stackedLegendDot" style="background:' + sColor + '"></span>' +
                        '<span class="stackedLegendLabel">' + this._esc(sStatus) + '</span>' +
                        '<span class="stackedLegendValue">' + fCount + ' (' + fPct.toFixed(0) + '%)</span>' +
                    '</div>'
                );
            }.bind(this));

            return '' +
                '<div class="stackedBarTrack">' + aSegments.join("") + '</div>' +
                '<div class="stackedLegend">' + aLegend.join("") + '</div>';
        },

        _esc: function (s) {
            return String(s == null ? "" : s)
                .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        },

        formatCurrency: function (fValue) {
            var n = this._toNumber(fValue);
            return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
        },

        formatStatusState: function (sStatus) {
            switch (sStatus) {
                case "APPROVED":
                case "DELIVERED": return "Success";
                case "PENDING": return "Warning";
                case "SUBMITTED": return "Information";
                case "REJECT": return "Error";
                default: return "None";
            }
        }
    });
});