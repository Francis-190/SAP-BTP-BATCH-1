sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("purchasemanagement.controller.PurchaseOrderAnalytics", {

        // totalValue and avgOrderValue are cds.Decimal(15,2) fields —
        // CAP sends them as JSON strings in OData V4. Always coerce
        // through this before any arithmetic.
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

            var oBinding = oModel.bindList("/PurchaseOrderStatusSummary");

            oBinding.requestContexts(0, 1000).then(function (aContexts) {
                var aData = aContexts.map(function (c) { return c.getObject(); });

                var totalOrders = 0, approved = 0, pending = 0, rejected = 0;
                var aStatusSummary = aData.map(function (row) {
                    var iCount = this._toNumber(row.orderCount);
                    var fValue = this._toNumber(row.totalValue);
                    var fAvg = this._toNumber(row.avgOrderValue);

                    totalOrders += iCount;
                    if (row.status === "APPROVED" || row.status === "DELIVERED") {
                        approved += iCount;
                    } else if (row.status === "PENDING" || row.status === "SUBMITTED") {
                        pending += iCount;
                    } else if (row.status === "REJECT") {
                        rejected += iCount;
                    }

                    return {
                        status: row.status,
                        orderCount: iCount,
                        totalValue: fValue,
                        avgOrderValue: fAvg
                    };
                }.bind(this));

                var oKPIModel = new JSONModel({
                    totalOrders: totalOrders,
                    approvedOrders: approved,
                    pendingOrders: pending,
                    rejectedOrders: rejected,
                    statusSummary: aStatusSummary,
                    _totalForPercent: totalOrders,

                    // ---- chart panel ----
                    statusDonutHtml: this._buildStatusDonutHtml(approved, pending, rejected)
                });
                this.getView().setModel(oKPIModel, "kpi");
            }.bind(this)).catch(function (oErr) {
                sap.m.MessageToast.show("Failed to load Purchase Order Analytics: " + oErr.message);
            });
        },

        // ================= Panel 1: 3-way status donut =================
        _buildStatusDonutHtml: function (iApproved, iPending, iRejected) {
            var iTotal = iApproved + iPending + iRejected;
            if (!iTotal) {
                return '<div class="chartEmptyState">No status data</div>';
            }
            var aParts = [
                { label: "Approved", count: iApproved, color: "#27AE60" },
                { label: "Pending", count: iPending, color: "#F2994A" },
                { label: "Rejected", count: iRejected, color: "#EB5757" }
            ];

            var fCursor = 0;
            var aSegments = [];
            var aLegend = [];

            aParts.forEach(function (part) {
                var fPct = (part.count / iTotal) * 100;
                aSegments.push(part.color + ' ' + fCursor.toFixed(1) + '% ' + (fCursor + fPct).toFixed(1) + '%');
                aLegend.push(
                    '<div class="donutLegendRow">' +
                        '<span class="donutLegendDot" style="background:' + part.color + '"></span>' +
                        '<span class="donutLegendLabel">' + part.label + '</span>' +
                        '<span class="donutLegendPct">' + fPct.toFixed(0) + '%</span>' +
                    '</div>'
                );
                fCursor += fPct;
            });

            return '' +
                '<div class="donutWrapper">' +
                    '<div class="donutRing" style="background: conic-gradient(' + aSegments.join(", ") + ')">' +
                        '<div class="donutCenter">' +
                            '<div class="donutCenterValue">' + iTotal + '</div>' +
                            '<div class="donutCenterLabel">Total Orders</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="donutLegend">' + aLegend.join("") + '</div>' +
                '</div>';
        },

        formatCurrency: function (fValue) {
            var n = this._toNumber(fValue);
            return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
        },

        formatPercentOfTotal: function (iCount) {
            var oKPIModel = this.getView().getModel("kpi");
            if (!oKPIModel) { return 0; }
            var iTotal = oKPIModel.getProperty("/_totalForPercent") || 0;
            if (!iTotal) { return 0; }
            return Math.round((iCount / iTotal) * 100);
        },

        formatStatusState: function (sStatus) {
            switch (sStatus) {
                case "APPROVED":
                case "DELIVERED": return "Success";
                case "PENDING":
                case "SUBMITTED": return "Warning";
                case "REJECT": return "Error";
                default: return "None";
            }
        }
    });
});