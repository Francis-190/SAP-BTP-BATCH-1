sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "../model/formatter"
], function (
    Controller,
    Fragment,
    JSONModel,
    Filter,
    FilterOperator,
    MessageToast,
    MessageBox,
    formatter
) {
    "use strict";

    /* =============================================================== */
    /* SVG chart helpers (used by the dashboard sections)              */
    /* Every text placed in an SVG goes through esc(), because the     */
    /* result is injected with sap.ui.core.HTML.                       */
    /* =============================================================== */

    const esc = function (s) {
        return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
        });
    };
    const f1 = function (n) { return Number(n).toFixed(1); };
    const cut = function (s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
    let iUid = 0;
    const uid = function (p) { iUid += 1; return p + iUid; };

    const INK = "#1d2d3e", SOFT = "#6b7a90", GRID = "#e8ecf2";

    /** Catmull-Rom → cubic Bézier path through points */
    const smoothPath = function (pts) {
        let d = "M" + f1(pts[0][0]) + " " + f1(pts[0][1]);
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
            d += " C" + f1(p1[0] + (p2[0] - p0[0]) / 6) + " " + f1(p1[1] + (p2[1] - p0[1]) / 6) + " " +
                 f1(p2[0] - (p3[0] - p1[0]) / 6) + " " + f1(p2[1] - (p3[1] - p1[1]) / 6) + " " + f1(p2[0]) + " " + f1(p2[1]);
        }
        return d;
    };

    const empty = function (sText, iH) {
        return "<svg class=\"chartSvg\" viewBox=\"0 0 400 " + (iH || 120) + "\" aria-hidden=\"true\">" +
            "<text x=\"200\" y=\"" + ((iH || 120) / 2) + "\" text-anchor=\"middle\" font-size=\"13\" fill=\"" + SOFT + "\">" +
            esc(sText) + "</text></svg>";
    };

    const charts = {
        esc: esc,

        /**
         * Smooth area graph with gridlines and axis labels.
         * @param {number[]} aValues
         * @param {object} o { yFmt: fn(number)→string, xLabels: [first, middle, last], color, emptyText }
         */
        area: function (aValues, o) {
            if (!aValues || aValues.length < 2 || !aValues.some(Boolean)) { return empty(o.emptyText, 200); }
            const W = 640, H = 210, L = 58, R = 14, T = 14, B = 28;
            const fMax = Math.max.apply(null, aValues) * 1.1 || 1;
            const x = function (i) { return L + (i / (aValues.length - 1)) * (W - L - R); };
            const y = function (v) { return T + (1 - v / fMax) * (H - T - B); };
            const pts = aValues.map(function (v, i) { return [x(i), y(v)]; });
            const d = smoothPath(pts);
            const g = uid("chArea");
            let s = "<svg class=\"chartSvg\" viewBox=\"0 0 " + W + " " + H + "\" aria-hidden=\"true\">" +
                "<defs><linearGradient id=\"" + g + "\" x1=\"0\" x2=\"0\" y1=\"0\" y2=\"1\">" +
                "<stop offset=\"0\" stop-color=\"" + o.color + "\" stop-opacity=\".32\"/>" +
                "<stop offset=\"1\" stop-color=\"" + o.color + "\" stop-opacity=\"0\"/></linearGradient></defs>";
            [0, 0.5, 1].forEach(function (k) {
                const yy = y(fMax / 1.1 * k);
                s += "<line x1=\"" + L + "\" x2=\"" + (W - R) + "\" y1=\"" + f1(yy) + "\" y2=\"" + f1(yy) + "\" stroke=\"" + GRID + "\"/>" +
                     "<text x=\"" + (L - 8) + "\" y=\"" + f1(yy + 4) + "\" text-anchor=\"end\" font-size=\"11\" fill=\"" + SOFT + "\">" +
                     esc(o.yFmt(fMax / 1.1 * k)) + "</text>";
            });
            s += "<path d=\"" + d + " L" + f1(x(aValues.length - 1)) + " " + (H - B) + " L" + L + " " + (H - B) + " Z\" fill=\"url(#" + g + ")\"/>" +
                 "<path d=\"" + d + "\" fill=\"none\" stroke=\"" + o.color + "\" stroke-width=\"3\" stroke-linecap=\"round\"/>";
            const last = pts[pts.length - 1];
            s += "<circle cx=\"" + f1(last[0]) + "\" cy=\"" + f1(last[1]) + "\" r=\"5\" fill=\"#fff\" stroke=\"" + o.color + "\" stroke-width=\"3\"/>";
            const xl = o.xLabels || [];
            [[L, "start", xl[0]], [(L + W - R) / 2, "middle", xl[1]], [W - R, "end", xl[2]]].forEach(function (a) {
                s += "<text x=\"" + f1(a[0]) + "\" y=\"" + (H - 8) + "\" text-anchor=\"" + a[1] + "\" font-size=\"11\" fill=\"" + SOFT + "\">" + esc(a[2]) + "</text>";
            });
            return s + "</svg>";
        },

        /**
         * Pie chart. aSlices: [{ value, color }]
         */
        pie: function (aSlices, sEmpty) {
            const fTotal = (aSlices || []).reduce(function (t, x) { return t + (Number(x.value) || 0); }, 0);
            if (!fTotal) { return empty(sEmpty, 160); }
            const C = 80, R = 74;
            let a0 = -Math.PI / 2, s = "<svg class=\"chartPie\" viewBox=\"0 0 160 160\" aria-hidden=\"true\">";
            aSlices.forEach(function (sl) {
                const v = Number(sl.value) || 0;
                if (!v) { return; }
                if (v === fTotal) {
                    s += "<circle cx=\"" + C + "\" cy=\"" + C + "\" r=\"" + R + "\" fill=\"" + sl.color + "\"/>";
                    return;
                }
                const a1 = a0 + (v / fTotal) * Math.PI * 2;
                const large = a1 - a0 > Math.PI ? 1 : 0;
                s += "<path d=\"M" + C + " " + C + " L" + f1(C + R * Math.cos(a0)) + " " + f1(C + R * Math.sin(a0)) +
                     " A" + R + " " + R + " 0 " + large + " 1 " + f1(C + R * Math.cos(a1)) + " " + f1(C + R * Math.sin(a1)) +
                     " Z\" fill=\"" + sl.color + "\" stroke=\"#fff\" stroke-width=\"2.5\" stroke-linejoin=\"round\"/>";
                a0 = a1;
            });
            return s + "</svg>";
        },

        /**
         * Donut with a centre figure. aSlices: [{ value, color }]
         */
        donut: function (aSlices, sCenter, sSub) {
            const fTotal = (aSlices || []).reduce(function (t, x) { return t + (Number(x.value) || 0); }, 0);
            const R = 58, Cc = 2 * Math.PI * R;
            let fOff = 0, s = "<svg class=\"chartPie\" viewBox=\"0 0 160 160\" aria-hidden=\"true\">" +
                "<circle cx=\"80\" cy=\"80\" r=\"" + R + "\" fill=\"none\" stroke=\"" + GRID + "\" stroke-width=\"20\"/>";
            if (fTotal) {
                aSlices.forEach(function (sl) {
                    const fLen = ((Number(sl.value) || 0) / fTotal) * Cc;
                    if (fLen > 0) {
                        s += "<circle cx=\"80\" cy=\"80\" r=\"" + R + "\" fill=\"none\" stroke=\"" + sl.color + "\" stroke-width=\"20\"" +
                             " stroke-dasharray=\"" + f1(Math.max(fLen - 2, 0.5)) + " " + f1(Cc) + "\" stroke-dashoffset=\"" + f1(-fOff) + "\"" +
                             " transform=\"rotate(-90 80 80)\"/>";
                    }
                    fOff += fLen;
                });
            }
            return s + "<text x=\"80\" y=\"84\" text-anchor=\"middle\" font-size=\"28\" font-weight=\"700\" fill=\"" + INK + "\">" + esc(sCenter) + "</text>" +
                "<text x=\"80\" y=\"104\" text-anchor=\"middle\" font-size=\"11\" fill=\"" + SOFT + "\">" + esc(sSub) + "</text></svg>";
        },

        /**
         * Horizontal bar graph with labels. aRows: [{ label, value, text }]
         */
        hbars: function (aRows, aColors, sEmpty) {
            if (!aRows || !aRows.length) { return empty(sEmpty, 140); }
            const W = 560, ROW = 38, H = aRows.length * ROW + 6, LBL = 170, BAR0 = 180, BARW = 290;
            const fMax = Math.max.apply(null, aRows.map(function (r) { return Number(r.value) || 0; }).concat([1]));
            let s = "<svg class=\"chartSvg\" viewBox=\"0 0 " + W + " " + H + "\" aria-hidden=\"true\">";
            aRows.forEach(function (r, i) {
                const y = i * ROW + 6, w = Math.max(((Number(r.value) || 0) / fMax) * BARW, 3);
                const c = aColors[i % aColors.length];
                s += "<text x=\"" + LBL + "\" y=\"" + (y + 19) + "\" text-anchor=\"end\" font-size=\"13\" fill=\"" + INK + "\">" + esc(cut(r.label, 24)) + "</text>" +
                     "<rect x=\"" + BAR0 + "\" y=\"" + (y + 5) + "\" width=\"" + BARW + "\" height=\"20\" rx=\"10\" fill=\"" + GRID + "\" opacity=\".6\"/>" +
                     "<rect x=\"" + BAR0 + "\" y=\"" + (y + 5) + "\" width=\"" + f1(w) + "\" height=\"20\" rx=\"10\" fill=\"" + c + "\"/>" +
                     "<text x=\"" + (BAR0 + BARW + 10) + "\" y=\"" + (y + 19) + "\" font-size=\"13\" font-weight=\"700\" fill=\"" + INK + "\">" + esc(r.text) + "</text>";
            });
            return s + "</svg>";
        },

        /**
         * Column graph with value labels. aRows: [{ label, value, text, highlight }]
         * sColor: one colour, or an array (each column gets the next colour)
         * iWidth: drawing width (default 640); use ~340 for narrow cards
         */
        columns: function (aRows, sColor, sHighlight, sEmpty, iWidth) {
            if (!aRows || !aRows.length) { return empty(sEmpty, 200); }
            const W = iWidth || 640, H = 220, T = 24, B = 30, L = 8, R = 8;   // smaller W = larger text in narrow cards
            const fMax = Math.max.apply(null, aRows.map(function (r) { return Number(r.value) || 0; }).concat([1]));
            const slot = (W - L - R) / aRows.length, bw = Math.min(slot * 0.58, 44);
            const aCol = Array.isArray(sColor) ? sColor : [sColor];
            const aIds = aCol.map(function () { return uid("chCol"); });
            let s = "<svg class=\"chartSvg\" viewBox=\"0 0 " + W + " " + H + "\" aria-hidden=\"true\"><defs>" +
                aCol.map(function (c, k) {
                    return "<linearGradient id=\"" + aIds[k] + "\" x1=\"0\" x2=\"0\" y1=\"0\" y2=\"1\">" +
                        "<stop offset=\"0\" stop-color=\"" + c + "\"/><stop offset=\"1\" stop-color=\"" + c + "\" stop-opacity=\".45\"/></linearGradient>";
                }).join("") + "</defs>" +
                "<line x1=\"" + L + "\" x2=\"" + (W - R) + "\" y1=\"" + (H - B) + "\" y2=\"" + (H - B) + "\" stroke=\"" + GRID + "\" stroke-width=\"2\"/>";
            aRows.forEach(function (r, i) {
                const h = Math.max(((Number(r.value) || 0) / fMax) * (H - T - B), 3);
                const x = L + i * slot + (slot - bw) / 2, yTop = H - B - h;
                s += "<rect x=\"" + f1(x) + "\" y=\"" + f1(yTop) + "\" width=\"" + f1(bw) + "\" height=\"" + f1(h) + "\" rx=\"6\" fill=\"" +
                     (r.highlight && sHighlight ? sHighlight : "url(#" + aIds[i % aIds.length] + ")") + "\"/>" +
                     "<text x=\"" + f1(x + bw / 2) + "\" y=\"" + f1(yTop - 6) + "\" text-anchor=\"middle\" font-size=\"" + (W < 500 ? 14 : 11) + "\" font-weight=\"700\" fill=\"" + INK + "\">" + esc(r.text) + "</text>" +
                     "<text x=\"" + f1(x + bw / 2) + "\" y=\"" + (H - 10) + "\" text-anchor=\"middle\" font-size=\"" + (W < 500 ? 13 : 10.5) + "\" fill=\"" + SOFT + "\">" + esc(cut(r.label, 10)) + "</text>";
            });
            return s + "</svg>";
        }
    };

    /* ---------------- Dashboard settings ---------------- */
    const DAY = 864e5;
    const LOW_STOCK_LIMIT = 10;     // available qty at or below this = "Low stock"
    const CAT_COLORS = ["#3b82f6", "#f97316", "#22c55e", "#ec4899", "#a855f7", "#facc15"];
    const BAR_COLORS = ["#3b82f6", "#f97316", "#22c55e", "#ec4899", "#a855f7"];
    const COLUMN_COLORS = ["#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#f97316",
                           "#facc15", "#22c55e", "#14b8a6", "#6366f1", "#f43f5e"];
    const oCompactInr = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

    return Controller.extend("sales.controller.View1", {

        formatter: formatter,

        onInit: function () {

            this.oLocalModel = new JSONModel({

                currentPage: "dashboard",

                products: [],

                sales: [],

                customers: [],

                categories: [],

                warehouses: [],

                inventoryRows: [],

                // Used by the dashboard (stock by warehouse, out-of-stock and low-stock widgets)
                inventorySummary: [],

                dash: {
                    periodText: "",
                    pendingCount: 0,
                    outOfStockCount: 0,
                    lowStockCount: 0,
                    trend: {
                        revenue: { dir: "flat", text: "" },
                        sales: { dir: "flat", text: "" },
                        aov: { dir: "flat", text: "" },
                        rate: { dir: "flat", text: "" }
                    },
                    trendSvg: "",
                    categorySvg: "",
                    categoryLegend: [],
                    topProductsSvg: "",
                    topCustomersSvg: "",
                    warehouseSvg: "",
                    warehouses: [],
                    warehouseCount: 0,
                    totalUnits: 0
                },

                inventoryFilters: {
                    warehouses: []
                },

                analytics: {
                    totalRevenue: 0,
                    totalSalesCount: 0,
                    avgSaleValue: 0,
                    completionRate: 0,
                    salesTrend: [],
                    categoryBreakdown: [],
                    topProducts: [],
                    pendingValue: 0,
                    statusBreakdown: [],
                    topCustomers: []
                },

                // Used by NewSaleDialog.fragment.xml
                newSale: {
                    customerID: "",
                    items: [],
                    total: 0
                },

                // Used by AddProductDialog.fragment.xml
                newProduct: {
                    productCode: "",
                    productName: "",
                    description: "",
                    categoryID: "",
                    unitPrice: "",
                    stockQty: "",
                    warehouseID: ""
                },

                // Used by StockQuantityDialog.fragment.xml
                qtyDialog: {
                    title: "",
                    actionName: "",
                    inventoryID: "",
                    quantity: ""
                }

            });

            this.getView().setModel(this.oLocalModel, "local");

            this.oSelectedProduct = null;
            this.oSelectedSale = null;

            Promise.all([
                this._loadProducts(),
                this._loadSales(),
                this._loadCustomers(),
                this._loadInventorySummary()
            ]).then(() => {
                this._computeAnalytics();
            });

            if (!this.getView().getModel("inventory")) {
                console.error("Inventory OData model is not available. Check manifest.json.");
            }
        },

        /* =========================================================== */
        /* Fragment helper                                             */
        /* =========================================================== */

        _loadDialog: async function (sProperty, sFragmentName) {

            if (!this[sProperty]) {

                this[sProperty] = await Fragment.load({
                    id: this.getView().getId(),
                    name: sFragmentName,
                    controller: this
                });

                this.getView().addDependent(this[sProperty]);
            }

            return this[sProperty];
        },

        /* =========================================================== */
        /* Navigation                                                  */
        /* =========================================================== */

        onSideNavToggle: function () {

            const oToolPage = this.byId("toolPage");

            oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
        },

        onSideNavItemSelect: function (oEvent) {

            const sKey = oEvent.getParameter("item").getKey();

            if (sKey) {
                this.oLocalModel.setProperty("/currentPage", sKey);
            }
        },

        onTabSelect: function (oEvent) {

            const sKey =
                oEvent.getParameter("selectedKey") ||
                oEvent.getParameter("key");

            if (sKey) {
                this.oLocalModel.setProperty("/currentPage", sKey);
            }
        },

        onViewAllSales: function () {
            this.oLocalModel.setProperty("/currentPage", "sales");
        },

        onViewAllAnalytics: function () {
            this.oLocalModel.setProperty("/currentPage", "analytics");
        },

        onDashOpenSales: function () {
            this.oLocalModel.setProperty("/currentPage", "sales");
        },

        onDashOpenInventory: function () {
            this.oLocalModel.setProperty("/currentPage", "inventory");
        },

        onDashOpenCharts: function () {
            this.oLocalModel.setProperty("/currentPage", "charts");
        },

        onDashOpenWarehouses: function () {
            this.oLocalModel.setProperty("/currentPage", "warehouses");
        },

        onRefreshWarehouses: async function () {
            await this._loadInventorySummary();
            MessageToast.show("Warehouses refreshed successfully.");
        },

        /* =========================================================== */
        /* Data loading                                                */
        /* =========================================================== */

        _loadProducts: async function () {

            try {

                const response = await fetch(
                    "/odata/v4/sales-inventory/Products?$expand=category"
                );

                if (!response.ok) {
                    throw new Error(
                        "Products request failed: " +
                        response.status + " " + response.statusText
                    );
                }

                const data = await response.json();

                this.oLocalModel.setProperty("/products", data.value || []);

                const oInventoryTable = this.byId("inventoryTable");

                const oInventoryBinding =
                    oInventoryTable && oInventoryTable.getBinding("items");

                if (oInventoryBinding) {
                    oInventoryBinding.refresh();
                }

            } catch (error) {

                console.error("Product loading error:", error);

                MessageBox.error(
                    "Unable to load Products.\n\n" + this._getErrorMessage(error)
                );
            }
        },

        _loadSales: async function () {

            try {

                const response = await fetch(
                    "/odata/v4/sales-inventory/Sales?$expand=customer,product($expand=category)&$orderby=saleDate asc"
                );

                if (!response.ok) {
                    throw new Error(
                        "Sales request failed: " +
                        response.status + " " + response.statusText
                    );
                }

                const data = await response.json();

                this.oLocalModel.setProperty("/sales", data.value || []);

            } catch (error) {

                console.error("Sales loading error:", error);

                MessageBox.error(
                    "Unable to load Sales.\n\n" + this._getErrorMessage(error)
                );
            }
        },

        _loadCustomers: async function () {

            try {

                const response = await fetch(
                    "/odata/v4/sales-inventory/Customers"
                );

                if (!response.ok) {
                    throw new Error(
                        "Customers request failed: " +
                        response.status + " " + response.statusText
                    );
                }

                const data = await response.json();

                this.oLocalModel.setProperty("/customers", data.value || []);

            } catch (error) {

                console.error("Customer loading error:", error);

                MessageBox.error(
                    "Unable to load Customers.\n\n" + this._getErrorMessage(error)
                );
            }
        },

        _loadCategories: async function () {

            try {

                const response = await fetch(
                    "/odata/v4/sales-inventory/Categories"
                );

                if (!response.ok) {
                    throw new Error(
                        "Categories request failed: " +
                        response.status + " " + response.statusText
                    );
                }

                const data = await response.json();

                this.oLocalModel.setProperty("/categories", data.value || []);

            } catch (error) {

                console.error("Category loading error:", error);

                MessageBox.error(
                    "Unable to load Categories.\n\n" + this._getErrorMessage(error)
                );

                throw error;
            }
        },

        _loadWarehouses: async function () {

            try {

                const response = await fetch(
                    "/odata/v4/inventory/Warehouses"
                );

                if (!response.ok) {
                    throw new Error(
                        "Warehouses request failed: " +
                        response.status + " " + response.statusText
                    );
                }

                const data = await response.json();

                this.oLocalModel.setProperty("/warehouses", data.value || []);

            } catch (error) {

                console.error("Warehouse loading error:", error);

                MessageBox.error(
                    "Unable to load Warehouses.\n\n" + this._getErrorMessage(error)
                );

                throw error;
            }
        },

        /* =========================================================== */
        /* Selection                                                   */
        /* =========================================================== */

        _loadInventorySummary: async function () {

            try {

                const response = await fetch(
                    "/odata/v4/inventory/Inventory?$expand=warehouse&$top=10000"
                );

                if (!response.ok) {
                    throw new Error(
                        "Inventory request failed: " +
                        response.status + " " + response.statusText
                    );
                }

                const data = await response.json();

                this.oLocalModel.setProperty("/inventorySummary", data.value || []);

            } catch (error) {

                // The dashboard still works without it; only the stock widgets stay empty.
                console.error("Inventory summary loading error:", error);

                this.oLocalModel.setProperty("/inventorySummary", []);
            }

            this._buildStockWidgets();
        },

        /* =========================================================== */
        /* Selection                                                   */
        /* =========================================================== */

        onWarehouseRowPress: function (oEvent) {

            const sName = oEvent.getSource().getBindingContext("local").getProperty("name");

            this.oLocalModel.setProperty("/currentPage", "inventory");

            const oSearchField = this.byId("inventoryProductSearch");
            const oStockFilter = this.byId("inventoryStockStatusFilter");
            const oWarehouseSelect = this.byId("inventoryWarehouseFilter");

            if (oSearchField) { oSearchField.setValue(""); }
            if (oStockFilter) { oStockFilter.setSelectedKey(""); }

            if (oWarehouseSelect && oWarehouseSelect.getItemByKey(sName)) {

                // the warehouse exists in the dropdown → reuse the normal filter logic
                oWarehouseSelect.setSelectedKey(sName);
                this._applyInventoryFilters();

            } else {

                // not in the dropdown → filter the table directly
                if (oWarehouseSelect) { oWarehouseSelect.setSelectedKey("All Warehouses"); }

                const oTable = this.byId("inventoryTable");
                const oBinding = oTable && oTable.getBinding("items");

                if (oBinding) {
                    oBinding.filter([new Filter("warehouse/warehouseName", FilterOperator.EQ, sName)]);
                    oTable.setNoDataText("No inventory records available for " + sName + ".");
                }
            }
        },

        /* =========================================================== */
        /* Data loading                                                */
        /* =========================================================== */

        onProductSelectionChange: function (oEvent) {
            this.oSelectedProduct = oEvent.getParameter("listItem");
        },

        onSaleSelectionChange: function (oEvent) {

            this.oSelectedSale = oEvent.getParameter("listItem");

            const bSelected = !!this.oSelectedSale;
            let bCanApprove = false;

            if (bSelected) {

                const oContext =
                    this.oSelectedSale.getBindingContext("local");

                const sStatus =
                    oContext ? oContext.getProperty("status") : "";

                // Only Pending sales can start the BPA approval process.
                bCanApprove = sStatus === "Pending";
            }

            const oApproveButton = this.byId("approveSaleButton");

            if (oApproveButton) {
                oApproveButton.setEnabled(bCanApprove);
            }
        },

        onSalesSearch: function (oEvent) {

            const sQuery = (
                oEvent.getParameter("newValue") ||
                oEvent.getParameter("query") ||
                ""
            ).trim();

            this._applySalesFilters(sQuery);
        },

        onSalesStatusFilterChange: function () {

            const oSearchField = this.byId("salesSearchField");

            const sQuery = oSearchField
                ? (oSearchField.getValue() || "").trim()
                : "";

            this._applySalesFilters(sQuery);
        },

        /* =========================================================== */
        /* Add Product (AddProductDialog.fragment.xml)                */
        /* =========================================================== */

        onAddProduct: async function () {

            try {

                await Promise.all([
                    this._loadCategories(),
                    this._loadWarehouses()
                ]);

                const aCategories =
                    this.oLocalModel.getProperty("/categories") || [];

                const aWarehouses =
                    this.oLocalModel.getProperty("/warehouses") || [];

                if (aCategories.length === 0) {
                    MessageBox.warning("No categories are available.");
                    return;
                }

                if (aWarehouses.length === 0) {
                    MessageBox.warning("No warehouses are available.");
                    return;
                }

                // Ask the backend for the next product-code preview.
                // The backend will generate the final code again during CREATE.
                const sNextProductCode =
                    await this._getNextProductCode();

                this.oLocalModel.setProperty("/newProduct", {
                    productCode: sNextProductCode,
                    productName: "",
                    description: "",
                    categoryID: aCategories[0].ID,
                    unitPrice: "",
                    stockQty: "",
                    warehouseID: aWarehouses[0].ID
                });

                const oDialog = await this._loadDialog(
                    "_oAddProductDialog",
                    "sales.fragment.AddProductDialog"
                );

                oDialog.open();

            } catch (error) {

                console.error("Add Product error:", error);
                MessageBox.error(this._getErrorMessage(error));
            }
        },

        _getNextProductCode: async function () {

            const result = await this._callAction(
                "getNextProductCode",
                {}
            );

            if (!result || result.value === undefined || result.value === null) {
                throw new Error("Unable to generate the next Product Code.");
            }

            return String(result.value);
        },

        onCreateProduct: async function () {

            const oProduct =
                this.oLocalModel.getProperty("/newProduct") || {};

            if (!oProduct.productName || !oProduct.productName.trim()) {
                MessageBox.warning("Please enter Product Name.");
                return;
            }

            if (!oProduct.categoryID) {
                MessageBox.warning("Please select a Category.");
                return;
            }

            const fUnitPrice = Number(oProduct.unitPrice);

            if (
                oProduct.unitPrice === "" ||
                !Number.isFinite(fUnitPrice) ||
                fUnitPrice < 0
            ) {
                MessageBox.warning("Please enter a valid Unit Price.");
                return;
            }

            const iStockQty = Number(oProduct.stockQty);

            if (
                oProduct.stockQty === "" ||
                !Number.isInteger(iStockQty) ||
                iStockQty < 0
            ) {
                MessageBox.warning(
                    "Initial Stock Quantity must be a whole number zero or greater."
                );
                return;
            }

            if (!oProduct.warehouseID) {
                MessageBox.warning("Please select a Warehouse.");
                return;
            }

            try {

                // Do NOT send productCode from the UI.
                // The CAP backend generates the final PRODxxx code.
                const result = await this._callAction(
                    "createProduct",
                    {
                        productName: oProduct.productName.trim(),
                        description: oProduct.description || "",
                        categoryID: oProduct.categoryID,
                        unitPrice: fUnitPrice,
                        stockQty: iStockQty,
                        warehouseID: oProduct.warehouseID
                    }
                );

                await this._loadProducts();

                // Refresh the inventory table so the newly created
                // Inventory record is visible immediately.
                const oInventoryTable = this.byId("inventoryTable");
                const oInventoryBinding =
                    oInventoryTable && oInventoryTable.getBinding("items");

                if (oInventoryBinding) {
                    oInventoryBinding.refresh();
                }

                if (this._oAddProductDialog) {
                    this._oAddProductDialog.close();
                }

                const sCreatedCode =
                    result && result.productCode
                        ? result.productCode
                        : oProduct.productCode;

                MessageToast.show(
                    "Product " + sCreatedCode +
                    " and inventory created successfully."
                );

            } catch (error) {

                console.error("Create Product error:", error);
                MessageBox.error(this._getErrorMessage(error));
            }
        },

        onCloseAddProductDialog: function () {

            if (this._oAddProductDialog) {
                this._oAddProductDialog.close();
            }
        },

        /* =========================================================== */
        /* New Sale (NewSaleDialog.fragment.xml)                       */
        /* =========================================================== */

        onNewSale: async function () {

            try {

                let aCustomers = this.oLocalModel.getProperty("/customers") || [];
                let aProducts = this.oLocalModel.getProperty("/products") || [];

                if (aCustomers.length === 0) {
                    await this._loadCustomers();
                    aCustomers = this.oLocalModel.getProperty("/customers") || [];
                }

                if (aProducts.length === 0) {
                    await this._loadProducts();
                    aProducts = this.oLocalModel.getProperty("/products") || [];
                }

                if (aCustomers.length === 0) {
                    MessageBox.warning("No customers available.");
                    return;
                }

                if (aProducts.length === 0) {
                    MessageBox.warning("No products available.");
                    return;
                }

                // Reset dialog data: first customer + one product row
                this.oLocalModel.setProperty("/newSale", {
                    customerID: aCustomers[0].ID,
                    items: [this._createEmptySaleItem()],
                    total: 0
                });

                this._updateNewSaleTotal();

                const oDialog = await this._loadDialog(
                    "_oNewSaleDialog",
                    "sales.fragment.NewSaleDialog"
                );

                oDialog.open();

            } catch (error) {

                console.error("New Sale error:", error);

                MessageBox.error(this._getErrorMessage(error));
            }
        },

        _createEmptySaleItem: function () {

            const aProducts = this.oLocalModel.getProperty("/products") || [];
            const oFirst = aProducts[0];

            return {
                productID: oFirst ? oFirst.ID : "",
                unitPrice: oFirst ? Number(oFirst.unitPrice || 0) : 0,
                quantity: 1
            };
        },

        formatProductOption: function (sProductName, vUnitPrice, vStockQty) {

            return (
                sProductName +
                " - ₹" +
                Number(vUnitPrice || 0).toFixed(2) +
                " - Stock: " +
                Number(vStockQty || 0)
            );
        },

        onSaleProductChange: function (oEvent) {

            const oContext = oEvent.getSource().getBindingContext("local");
            const oSelectedItem = oEvent.getParameter("selectedItem");

            if (!oContext || !oSelectedItem) {
                return;
            }

            const sProductID = oSelectedItem.getKey();

            const oProduct = (this.oLocalModel.getProperty("/products") || []).find(function (oItem) {
                return oItem.ID === sProductID;
            });

            this.oLocalModel.setProperty(
                oContext.getPath() + "/unitPrice",
                oProduct ? Number(oProduct.unitPrice || 0) : 0
            );

            this._updateNewSaleTotal();
        },

        onSaleQtyChange: function (oEvent) {

            const oContext = oEvent.getSource().getBindingContext("local");

            this.oLocalModel.setProperty(
                oContext.getPath() + "/quantity",
                Number(oEvent.getParameter("value")) || 1
            );

            this._updateNewSaleTotal();
        },

        // Total = sum of (unitPrice x quantity) of all rows
        _updateNewSaleTotal: function () {

            const aItems = this.oLocalModel.getProperty("/newSale/items") || [];

            const fTotal = aItems.reduce(function (fSum, oItem) {
                return fSum + (Number(oItem.unitPrice) || 0) * (Number(oItem.quantity) || 0);
            }, 0);

            this.oLocalModel.setProperty("/newSale/total", Math.round(fTotal * 100) / 100);
        },

        onAddSaleProductRow: function () {

            const aItems = (this.oLocalModel.getProperty("/newSale/items") || []).slice();

            aItems.push(this._createEmptySaleItem());

            this.oLocalModel.setProperty("/newSale/items", aItems);

            this._updateNewSaleTotal();
        },

        onRemoveSaleProductRow: function (oEvent) {

            const aItems = (this.oLocalModel.getProperty("/newSale/items") || []).slice();

            if (aItems.length <= 1) {
                MessageToast.show("At least one product is required.");
                return;
            }

            const sPath = oEvent.getSource().getBindingContext("local").getPath();
            const iIndex = parseInt(sPath.split("/").pop(), 10);

            aItems.splice(iIndex, 1);

            this.oLocalModel.setProperty("/newSale/items", aItems);

            this._updateNewSaleTotal();
        },

        onCreateSale: async function () {

            const aProducts = this.oLocalModel.getProperty("/products") || [];
            const sCustomerID = this.oLocalModel.getProperty("/newSale/customerID");
            const aRows = this.oLocalModel.getProperty("/newSale/items") || [];

            if (!sCustomerID) {
                MessageBox.warning("Please select a customer.");
                return;
            }

            if (aRows.length === 0) {
                MessageBox.warning("Please add at least one product.");
                return;
            }

            const aSaleProducts = [];
            const oProductMap = {};

            for (let i = 0; i < aRows.length; i++) {

                const sProductId = aRows[i].productID;
                const iQuantity = parseInt(aRows[i].quantity, 10);

                if (!sProductId) {
                    MessageBox.warning("Please select a product in row " + (i + 1) + ".");
                    return;
                }

                if (!Number.isInteger(iQuantity) || iQuantity <= 0) {
                    MessageBox.warning(
                        "Quantity must be greater than zero in row " + (i + 1) + "."
                    );
                    return;
                }

                // Prevent duplicate product
                if (Object.prototype.hasOwnProperty.call(oProductMap, sProductId)) {
                    MessageBox.warning("The same product cannot be added more than once.");
                    return;
                }

                const oProduct = aProducts.find(function (oItem) {
                    return oItem.ID === sProductId;
                });

                if (!oProduct) {
                    MessageBox.error("Selected product was not found.");
                    return;
                }

                const iProductStock = Number(oProduct.stockQty || 0);

                if (iProductStock < iQuantity) {
                    MessageBox.warning(
                        "Insufficient stock for " + oProduct.productName + ".\n\n" +
                        "Available stock: " + iProductStock +
                        "\nRequested quantity: " + iQuantity
                    );
                    return;
                }

                oProductMap[sProductId] = true;

                aSaleProducts.push({
                    productID: sProductId,
                    quantity: iQuantity
                });
            }

            try {

                for (let i = 0; i < aSaleProducts.length; i++) {
                    await this._createSale({
                        customerID: sCustomerID,
                        productID: aSaleProducts[i].productID,
                        quantity: aSaleProducts[i].quantity
                    });
                }

                // Reload only once
                await this._loadSales();
                await this._loadProducts();
                this._computeAnalytics();

                this._oNewSaleDialog.close();

                MessageToast.show(
                    aSaleProducts.length +
                    " product sale item(s) created successfully. Status: Pending."
                );

            } catch (error) {

                console.error("Create sale error:", error);

                MessageBox.error(this._getErrorMessage(error));
            }
        },

        onCloseNewSaleDialog: function () {

            if (this._oNewSaleDialog) {
                this._oNewSaleDialog.close();
            }
        },

        _createSale: async function (oSaleData) {

            const response = await fetch(
                "/odata/v4/sales-inventory/Sales",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({
                        customer_ID: oSaleData.customerID,
                        product_ID: oSaleData.productID,
                        quantity: oSaleData.quantity
                    })
                }
            );

            if (!response.ok) {

                let sErrorMessage = "Unable to create sale.";

                try {
                    const oError = await response.json();

                    if (oError && oError.error && oError.error.message) {
                        sErrorMessage = oError.error.message;
                    }
                } catch (e) {
                    // Ignore
                }

                throw new Error(sErrorMessage);
            }

            return await response.json();
        },

        /* =========================================================== */
        /* Approve Sale -> SAP Build Process Automation                */
        /* =========================================================== */

        onApproveSale: async function () {

            const oItem =
                this.oSelectedSale ||
                this.byId("salesTable").getSelectedItem();

            if (!oItem) {
                MessageToast.show("Please select a Pending sale first.");
                return;
            }

            const oContext = oItem.getBindingContext("local");

            if (!oContext) {
                MessageBox.error("Could not read the selected sale.");
                return;
            }

            const sID = oContext.getProperty("ID");
            const sStatus = oContext.getProperty("status");

            if (!sID) {
                MessageBox.error("Sale ID is missing.");
                return;
            }

            if (sStatus !== "Pending") {
                MessageBox.warning(
                    "Only Pending sales can be submitted for approval."
                );
                return;
            }

            try {

                await this._callAction(
                    "submitSaleForApproval",
                    { ID: sID }
                );

                MessageToast.show(
                    "Approval process started successfully."
                );

                await this._loadSales();
                this._computeAnalytics();
                this._clearSaleSelection();

            } catch (error) {

                console.error(
                    "Submit sale for approval error:",
                    error
                );

                MessageBox.error(this._getErrorMessage(error));
            }
        },

        onRefresh: async function () {

            try {

                await Promise.all([
                    this._loadProducts(),
                    this._loadSales()
                ]);

                this._computeAnalytics();
                this._clearProductSelection();
                this._clearSaleSelection();

                MessageToast.show("Products and Sales refreshed successfully.");

            } catch (error) {
                console.error(error);
            }
        },

        _callAction: async function (sAction, oPayload) {

            const response = await fetch(
                "/odata/v4/sales-inventory/" + sAction,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify(oPayload)
                }
            );

            if (!response.ok) {

                let errorMessage = "Action failed: " + response.status;

                try {
                    const errorData = await response.json();

                    if (errorData && errorData.error && errorData.error.message) {
                        errorMessage = errorData.error.message;
                    }
                } catch (e) {
                    // Ignore
                }

                throw new Error(errorMessage);
            }

            const text = await response.text();

            if (!text) {
                return null;
            }

            try {
                return JSON.parse(text);
            } catch (e) {
                return text;
            }
        },

        // Used in the Inventory table: product_ID + local>/products -> product name.
        // The products list is passed in as a binding part, so the name appears
        // automatically as soon as products finish loading.
        getProductName: function (sProductId, aProducts) {

            if (sProductId === undefined || sProductId === null) {
                return "";
            }

            const sId = String(sProductId);

            const oProduct = (aProducts || []).find(function (oP) {
                return oP && oP.ID !== undefined && oP.ID !== null && String(oP.ID) === sId;
            });

            return (oProduct && oProduct.productName) ? oProduct.productName : sId;
        },

        /* =========================================================== */
        /* Analytics                                                   */
        /* =========================================================== */

        _computeAnalytics: function () {

            const aSales = this.oLocalModel.getProperty("/sales") || [];

            if (aSales.length === 0) {

                this.oLocalModel.setProperty("/analytics", {
                    totalRevenue: 0,
                    totalSalesCount: 0,
                    avgSaleValue: 0,
                    completionRate: 0,
                    salesTrend: [],
                    categoryBreakdown: [],
                    topProducts: [],
                    pendingValue: 0,
                    statusBreakdown: [],
                    topCustomers: []
                });

                this._buildDashboard(aSales);
                return;
            }

            const totalRevenue = aSales.reduce(function (sum, s) {
                return sum + (Number(s.totalAmount) || 0);
            }, 0);

            const totalSalesCount = aSales.length;

            const avgSaleValue = totalSalesCount > 0
                ? totalRevenue / totalSalesCount
                : 0;

            const completedCount = aSales.filter(function (s) {
                return s.status === "Completed";
            }).length;

            const completionRate = totalSalesCount > 0
                ? (completedCount / totalSalesCount) * 100
                : 0;

            // Sales trend
            const oTrendMap = {};

            aSales.forEach(function (s) {
                const sDate = s.saleDate ? String(s.saleDate).split("T")[0] : "Unknown";
                oTrendMap[sDate] = (oTrendMap[sDate] || 0) + (Number(s.totalAmount) || 0);
            });

            const salesTrend = Object.keys(oTrendMap)
                .sort()
                .map(function (sDate) {
                    return {
                        label: sDate,
                        value: Math.round(oTrendMap[sDate])
                    };
                });

            // Category breakdown
            const oCategoryMap = {};

            aSales.forEach(function (s) {
                const sCategory =
                    (s.product && s.product.category && s.product.category.categoryName)
                        ? s.product.category.categoryName
                        : "Uncategorized";

                oCategoryMap[sCategory] =
                    (oCategoryMap[sCategory] || 0) + (Number(s.totalAmount) || 0);
            });

            const categoryBreakdown = Object.keys(oCategoryMap)
                .map(function (sCategory) {
                    return {
                        category: sCategory,
                        percent: totalRevenue > 0
                            ? Math.round((oCategoryMap[sCategory] / totalRevenue) * 100)
                            : 0
                    };
                })
                .sort(function (a, b) {
                    return b.percent - a.percent;
                });

            // Top products
            const oProductMap = {};

            aSales.forEach(function (s) {
                const sProductName =
                    (s.product && s.product.productName) ? s.product.productName : "Unknown";

                oProductMap[sProductName] =
                    (oProductMap[sProductName] || 0) + (Number(s.totalAmount) || 0);
            });

            const topProducts = Object.keys(oProductMap)
                .map(function (sName) {
                    return {
                        title: sName,
                        value: Math.round(oProductMap[sName])
                    };
                })
                .sort(function (a, b) {
                    return b.value - a.value;
                })
                .slice(0, 5);

            // Pending value
            const pendingValue = aSales
                .filter(function (s) { return s.status === "Pending"; })
                .reduce(function (sum, s) {
                    return sum + (Number(s.totalAmount) || 0);
                }, 0);

            // Status breakdown
            const oStatusMap = {};

            aSales.forEach(function (s) {
                const k = s.status || "Unknown";
                oStatusMap[k] = (oStatusMap[k] || 0) + 1;
            });

            const statusBreakdown = Object.keys(oStatusMap).map(function (k) {
                return { status: k, count: oStatusMap[k] };
            });

            // Top customers
            const oCustMap = {};

            aSales.forEach(function (s) {
                const n = (s.customer && s.customer.customerName) || "Unknown";
                oCustMap[n] = (oCustMap[n] || 0) + (Number(s.totalAmount) || 0);
            });

            const topCustomers = Object.keys(oCustMap)
                .map(function (n) {
                    return { title: n, value: Math.round(oCustMap[n]) };
                })
                .sort(function (a, b) { return b.value - a.value; })
                .slice(0, 5);

            this.oLocalModel.setProperty("/analytics", {
                totalRevenue: Math.round(totalRevenue),
                totalSalesCount: totalSalesCount,
                avgSaleValue: Math.round(avgSaleValue),
                completionRate: Math.round(completionRate),
                salesTrend: salesTrend,
                categoryBreakdown: categoryBreakdown,
                topProducts: topProducts,
                pendingValue: Math.round(pendingValue),
                statusBreakdown: statusBreakdown,
                topCustomers: topCustomers
            });

            // Build the dashboard SVG charts after analytics data is available.
            // Without this call, the chart model properties remain empty and
            // the <core:HTML> controls on the Charts page render blank cards.
            this._buildDashboard(aSales);
        },

        onRefreshAnalytics: async function () {

            await Promise.all([
                this._loadSales(),
                this._loadProducts(),
                this._loadInventorySummary()
            ]);

            this._computeAnalytics();

            MessageToast.show("Analytics refreshed successfully.");
        },

        _buildDashboard: function (aSales) {

            const oModel = this.oLocalModel;
            aSales = aSales || [];

            // ---------- KPI trends: last 7 days vs previous 7 days
            const oNow = new Date();
            const iEnd = new Date(oNow.getFullYear(), oNow.getMonth(), oNow.getDate()).getTime() + DAY;
            const iMid = iEnd - 7 * DAY;
            const iStart = iEnd - 14 * DAY;

            const fnStats = function (iFrom, iTo) {
                const a = aSales.filter(function (s) {
                    const t = new Date(s.saleDate).getTime();
                    return t >= iFrom && t < iTo;
                });
                const fRev = a.reduce(function (sum, s) { return sum + (Number(s.totalAmount) || 0); }, 0);
                const iDone = a.filter(function (s) { return s.status === "Completed"; }).length;
                return {
                    revenue: fRev,
                    sales: a.length,
                    aov: a.length ? fRev / a.length : 0,
                    rate: a.length ? (iDone / a.length) * 100 : 0
                };
            };

            const oCur = fnStats(iMid, iEnd);
            const oPrev = fnStats(iStart, iMid);

            oModel.setProperty("/dash/trend", {
                revenue: this._trend(oCur.revenue, oPrev.revenue),
                sales: this._trend(oCur.sales, oPrev.sales),
                aov: this._trend(oCur.aov, oPrev.aov),
                rate: this._trend(oCur.rate, oPrev.rate)
            });

            // ---------- hero chip + period text
            oModel.setProperty("/dash/pendingCount", aSales.filter(function (s) {
                return s.status === "Pending";
            }).length);

            const aDated = aSales
                .map(function (s) { return new Date(s.saleDate); })
                .filter(function (d) { return !isNaN(d.getTime()); })
                .sort(function (a, b) { return a - b; });

            oModel.setProperty("/dash/periodText", aDated.length
                ? "All sales from " + this._fmtDate(aDated[0]) + " to " + this._fmtDate(aDated[aDated.length - 1])
                : "No sales yet");

            // ---------- revenue trend: cumulative revenue per day (gaps filled)
            const oDaily = {};
            aSales.forEach(function (s) {
                const sDay = s.saleDate ? String(s.saleDate).split("T")[0] : null;
                if (sDay) {
                    oDaily[sDay] = (oDaily[sDay] || 0) + (Number(s.totalAmount) || 0);
                }
            });

            const aDays = Object.keys(oDaily).sort();
            const aSeries = [];

            if (aDays.length) {
                const iFirst = new Date(aDays[0] + "T00:00:00Z").getTime();
                const iLast = new Date(aDays[aDays.length - 1] + "T00:00:00Z").getTime();
                const bFill = (iLast - iFirst) / DAY <= 400;
                const aKeys = [];

                if (bFill) {
                    for (let t = iFirst; t <= iLast; t += DAY) {
                        aKeys.push(new Date(t).toISOString().slice(0, 10));
                    }
                } else {
                    aKeys.push.apply(aKeys, aDays);
                }

                let fRun = 0;
                aKeys.forEach(function (k) {
                    fRun += oDaily[k] || 0;
                    aSeries.push({ label: k, value: fRun });
                });
            }

            const iMidIdx = Math.floor(aSeries.length / 2);

            oModel.setProperty("/dash/trendSvg", charts.area(
                aSeries.map(function (p) { return p.value; }),
                {
                    color: "#2563eb",
                    yFmt: this._fmtCompactInr,
                    emptyText: "No sales yet",
                    xLabels: [
                        aSeries.length ? this._fmtDayLabel(aSeries[0].label) : "",
                        aSeries.length > 2 ? this._fmtDayLabel(aSeries[iMidIdx].label) : "",
                        aSeries.length ? this._fmtDayLabel(aSeries[aSeries.length - 1].label) : ""
                    ]
                }
            ));

            // ---------- category pie (top 5 + others)
            const oCat = {};
            let fCatTotal = 0;

            aSales.forEach(function (s) {
                const sCat = (s.product && s.product.category && s.product.category.categoryName) || "Uncategorized";
                const v = Number(s.totalAmount) || 0;
                oCat[sCat] = (oCat[sCat] || 0) + v;
                fCatTotal += v;
            });

            const aCatSorted = Object.keys(oCat)
                .map(function (k) { return { label: k, value: oCat[k] }; })
                .sort(function (a, b) { return b.value - a.value; });

            const aSlices = aCatSorted.slice(0, 5);
            const fRest = aCatSorted.slice(5).reduce(function (sum, c) { return sum + c.value; }, 0);

            if (fRest > 0) {
                aSlices.push({ label: "Others", value: fRest });
            }

            const aLegend = aSlices.map(function (c, i) {
                return {
                    label: c.label,
                    value: c.value,
                    color: CAT_COLORS[i % CAT_COLORS.length],
                    pct: fCatTotal ? Math.round((c.value / fCatTotal) * 100) : 0
                };
            });

            oModel.setProperty("/dash/categoryLegend", aLegend);
            oModel.setProperty("/dash/categorySvg", charts.pie(aLegend, "No sales yet"));

            // ---------- top products (horizontal bars)
            const aTop = (oModel.getProperty("/analytics/topProducts") || []).map(function (p) {
                return { label: p.title, value: Number(p.value) || 0, text: this._fmtCompactInr(p.value) };
            }, this);

            oModel.setProperty("/dash/topProductsSvg", charts.hbars(aTop, BAR_COLORS, "No sales yet"));

            // ---------- top customers (horizontal bars)
            const aTopCust = (oModel.getProperty("/analytics/topCustomers") || []).map(function (c) {
                return { label: c.title, value: Number(c.value) || 0, text: this._fmtCompactInr(c.value) };
            }, this);

            oModel.setProperty("/dash/topCustomersSvg", charts.hbars(aTopCust, BAR_COLORS.slice().reverse(), "No sales yet"));
        },

        /** Dashboard chips + Warehouses section (summary, chart, table) */

        _buildStockWidgets: function () {

            const oModel = this.oLocalModel;
            const aRows = oModel.getProperty("/inventorySummary") || [];

            let iOut = 0;
            let iLow = 0;
            const oWh = {};

            aRows.forEach(function (r) {

                const iStock = Number(r.stockQty) || 0;
                const iReserved = Number(r.reservedQty) || 0;
                const iAvailable = iStock - iReserved;
                const w = r.warehouse || {};
                const sKey = w.ID || w.warehouseName || "Unknown";

                if (!oWh[sKey]) {
                    oWh[sKey] = {
                        name: w.warehouseName || "Unknown",
                        code: w.warehouseCode || "",
                        location: w.location || "",
                        records: 0, units: 0, reserved: 0, available: 0, low: 0, out: 0
                    };
                }

                const o = oWh[sKey];
                o.records++;
                o.units += iStock;
                o.reserved += iReserved;
                o.available += iAvailable;

                if (iAvailable <= 0) {
                    iOut++;
                    o.out++;
                } else if (iAvailable <= LOW_STOCK_LIMIT) {
                    iLow++;
                    o.low++;
                }
            });

            // table rows: health = share of products in this warehouse that are fine
            const aWarehouses = Object.keys(oWh).map(function (k) {
                const o = oWh[k];
                const iOk = o.records - o.low - o.out;
                o.healthPct = o.records ? Math.round((iOk / o.records) * 100) : 0;
                o.healthText = iOk + " of " + o.records + " in stock";
                o.healthState = o.out ? "Error" : o.low ? "Warning" : "Success";
                return o;
            }).sort(function (a, b) { return b.units - a.units; });

            oModel.setProperty("/dash/outOfStockCount", iOut);
            oModel.setProperty("/dash/lowStockCount", iLow);
            oModel.setProperty("/dash/warehouses", aWarehouses);
            oModel.setProperty("/dash/warehouseCount", aWarehouses.length);
            oModel.setProperty("/dash/totalUnits", aWarehouses.reduce(function (t, o) { return t + o.units; }, 0));

            oModel.setProperty("/dash/warehouseSvg", charts.columns(
                aWarehouses.map(function (o) {
                    return { label: o.code || o.name, value: o.units, text: String(o.units) };
                }),
                COLUMN_COLORS, null, "No inventory records", 1100));   // wide canvas: full-width card
        },

        /** { dir: up | down | flat, text } – real change vs the previous 7 days */

        _trend: function (fCurrent, fPrevious) {

            if (!fPrevious) {
                return {
                    dir: "flat",
                    text: fCurrent ? "New in the last 7 days" : "No sales in the last 14 days"
                };
            }

            const fChange = ((fCurrent - fPrevious) / Math.abs(fPrevious)) * 100;

            if (Math.abs(fChange) < 0.05) {
                return { dir: "flat", text: "No change" };
            }

            return {
                dir: fChange > 0 ? "up" : "down",
                text: Math.abs(fChange).toFixed(1) + "% vs previous 7 days"
            };
        },

        // "₹22.5L", "₹1.2Cr", "₹76.5K"

        _fmtCompactInr: function (n) {
            return "₹" + oCompactInr.format(Number(n) || 0);
        },

        // "2026-09-08" → "8 Sep"

        _fmtDayLabel: function (sDay) {
            const d = new Date(sDay + "T00:00:00");
            return isNaN(d.getTime()) ? String(sDay || "") : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        },

        // Date → "8 Sep 2026"

        _fmtDate: function (d) {
            return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
        },

        /* =========================================================== */
        /* Inventory actions                                           */
        /* =========================================================== */

        onApplyAnalyticsFilters: function () {

            var oFrom = this.byId("analyticsDateFrom");
            var oTo = this.byId("analyticsDateTo");
            var oStatus = this.byId("analyticsStatusFilter");

            var oFromDate = oFrom ? oFrom.getDateValue() : null;
            var oToDate = oTo ? oTo.getDateValue() : null;
            var sStatus = oStatus ? oStatus.getSelectedKey() : "";

            var aAll = this.oLocalModel.getProperty("/allSales") ||
                this.oLocalModel.getProperty("/sales") || [];

            // Keep a pristine copy the first time we filter
            if (!this.oLocalModel.getProperty("/allSales")) {
                this.oLocalModel.setProperty("/allSales", aAll.slice());
            }

            var aFiltered = aAll.filter(function (s) {

                if (sStatus && s.status !== sStatus) {
                    return false;
                }

                if (oFromDate || oToDate) {

                    var iTime = new Date(s.saleDate).getTime();

                    if (isNaN(iTime)) {
                        return false;
                    }

                    if (oFromDate && iTime < oFromDate.getTime()) {
                        return false;
                    }

                    if (oToDate) {
                        var iEnd = new Date(
                            oToDate.getFullYear(),
                            oToDate.getMonth(),
                            oToDate.getDate(),
                            23, 59, 59, 999
                        ).getTime();

                        if (iTime > iEnd) {
                            return false;
                        }
                    }
                }

                return true;
            });

            this.oLocalModel.setProperty("/sales", aFiltered);
            this._computeAnalytics();

            MessageToast.show(aFiltered.length + " sale(s) match the filters.");
        },

        onClearAnalyticsFilters: function () {

            var oFrom = this.byId("analyticsDateFrom");
            var oTo = this.byId("analyticsDateTo");
            var oStatus = this.byId("analyticsStatusFilter");

            if (oFrom) { oFrom.setValue(""); }
            if (oTo) { oTo.setValue(""); }
            if (oStatus) { oStatus.setSelectedKey(""); }

            var aAll = this.oLocalModel.getProperty("/allSales");

            if (aAll) {
                this.oLocalModel.setProperty("/sales", aAll.slice());
            }

            this._computeAnalytics();

            MessageToast.show("Analytics filters cleared.");
        },

        /* =========================================================== */
        /* Inventory actions                                           */
        /* =========================================================== */

        _getInventoryModel: function () {
            return this.getView().getModel("inventory");
        },

        _showError: function (oError) {
            MessageBox.error(this._getErrorMessage(oError));
        },

        _callInventoryAction: async function (sActionName, mParams) {

            const oModel = this._getInventoryModel();

            if (!oModel) {

                const oError = new Error(
                    "Inventory OData model is not available. Please check manifest.json."
                );

                this._showError(oError);

                throw oError;
            }

            try {

                const oAction = oModel.bindContext("/" + sActionName + "(...)");

                Object.keys(mParams || {}).forEach(function (sKey) {
                    oAction.setParameter(sKey, mParams[sKey]);
                });

                const result = await oAction.execute();

                const oTable = this.byId("inventoryTable");
                const oBinding = oTable && oTable.getBinding("items");

                if (oBinding) {
                    oBinding.refresh();
                }

                await this._loadProducts();

                this._computeAnalytics();

                MessageToast.show(sActionName + " successful");

                return result;

            } catch (oError) {

                console.error("Inventory action error:", oError);

                this._showError(oError);

                throw oError;
            }
        },

        onRefreshInventory: function () {

            const oTable = this.byId("inventoryTable");

            if (!oTable) {
                MessageBox.error("Inventory table not found.");
                return;
            }

            const oBinding = oTable.getBinding("items");

            if (!oBinding) {
                MessageBox.warning("Inventory binding is not available.");
                return;
            }

            oBinding.refresh();

            this._loadProducts();

            MessageToast.show("Inventory refreshed successfully.");
        },

        _getRowContext: function (oEvent) {

            let oControl = oEvent.getSource();

            while (oControl) {

                const oContext = oControl.getBindingContext("inventory");

                if (oContext) {
                    return oContext;
                }

                oControl = oControl.getParent();
            }

            return null;
        },

        /* =========================================================== */
        /* Stock quantity dialog (StockQuantityDialog.fragment.xml)    */
        /* =========================================================== */

        _openQtyDialog: async function (sTitle, sActionName, sInventoryID) {

            if (!sInventoryID) {
                MessageBox.error("Inventory ID is missing. Cannot proceed.");
                return;
            }

            this.oLocalModel.setProperty("/qtyDialog", {
                title: sTitle,
                actionName: sActionName,
                inventoryID: sInventoryID,
                quantity: ""
            });

            const oDialog = await this._loadDialog(
                "_oQtyDialog",
                "sales.fragment.StockQuantityDialog"
            );

            oDialog.open();
        },

        onSubmitQtyDialog: async function () {

            const oData = this.oLocalModel.getProperty("/qtyDialog");
            const iQuantity = parseInt(oData.quantity, 10);

            if (!Number.isInteger(iQuantity) || iQuantity <= 0) {
                MessageBox.warning("Please enter a valid quantity greater than zero.");
                return;
            }

            try {

                await this._callInventoryAction(oData.actionName, {
                    inventoryID: oData.inventoryID,
                    quantity: iQuantity
                });

                this._oQtyDialog.close();

            } catch (error) {
                // Error already shown
            }
        },

        onCloseQtyDialog: function () {

            if (this._oQtyDialog) {
                this._oQtyDialog.close();
            }
        },

        onAdjustStock: function (oEvent) {

            const oContext = this._getRowContext(oEvent);

            if (!oContext) {
                MessageBox.error("Could not find the selected inventory row.");
                return;
            }

            this._openQtyDialog("Adjust Stock", "adjustStock", oContext.getProperty("ID"));
        },

        onReserveStock: function (oEvent) {

            const oContext = this._getRowContext(oEvent);

            if (!oContext) {
                MessageBox.error("Could not find the selected inventory row.");
                return;
            }

            this._openQtyDialog("Reserve Stock", "reserveStock", oContext.getProperty("ID"));
        },

        onReleaseStock: function (oEvent) {

            const oContext = this._getRowContext(oEvent);

            if (!oContext) {
                MessageBox.error("Could not find the selected inventory row.");
                return;
            }

            this._openQtyDialog("Release Stock", "releaseStock", oContext.getProperty("ID"));
        },

        /* =========================================================== */
        /* Helpers                                                     */
        /* =========================================================== */

        _clearProductSelection: function () {

            this.oSelectedProduct = null;

            const oTable = this.byId("productsTable");

            if (oTable) {
                oTable.removeSelections(true);
            }
        },

        _clearSaleSelection: function () {

            this.oSelectedSale = null;

            const oTable = this.byId("salesTable");

            if (oTable) {
                oTable.removeSelections(true);
            }

            const oApproveButton = this.byId("approveSaleButton");

            if (oApproveButton) {
                oApproveButton.setEnabled(false);
            }
        },

        _getErrorMessage: function (error) {

            if (!error) {
                return "Unknown error occurred.";
            }

            if (error.message) {
                return error.message;
            }

            if (error.error && error.error.message) {
                return error.error.message;
            }

            return String(error);
        },

        /* =========================================================== */
        /* Inventory filters                                           */
        /* =========================================================== */

        onInventoryFilterChange: function () {
            // no-op: filters apply only via the Filter button
        },

        onApplyInventoryFilters: function () {
            this._applyInventoryFilters();
        },

        _applyInventoryFilters: function () {

            var oTable = this.byId("inventoryTable");

            if (!oTable) {
                MessageBox.error("Inventory table not found.");
                return;
            }

            var oBinding = oTable.getBinding("items");

            if (!oBinding) {
                MessageBox.warning("Inventory table binding is not available.");
                return;
            }

            var aFilters = [];
            var oSearchField = this.byId("inventoryProductSearch");
            var sSearchQuery = oSearchField ? (oSearchField.getValue() || "").trim() : "";

            if (sSearchQuery) {

                var aProducts = this.oLocalModel.getProperty("/products") || [];
                var sQueryLower = sSearchQuery.toLowerCase();

                var aMatchingIds = aProducts
                    .filter(function (oProduct) {
                        return oProduct.productName &&
                            oProduct.productName.toLowerCase().indexOf(sQueryLower) !== -1;
                    })
                    .map(function (oProduct) {
                        return oProduct.ID;
                    });

                if (aMatchingIds.length > 0) {

                    var aIdFilters = aMatchingIds.map(function (sId) {
                        return new Filter("product_ID", FilterOperator.EQ, sId);
                    });

                    aFilters.push(new Filter({ filters: aIdFilters, and: false }));

                } else {

                    // No product matched the search text — force zero results
                    aFilters.push(new Filter("product_ID", FilterOperator.EQ, "__NO_MATCH__"));
                }
            }

            var oWarehouseSelect = this.byId("inventoryWarehouseFilter");
            var sSelectedWarehouse = oWarehouseSelect ? oWarehouseSelect.getSelectedKey() : "";

            if (sSelectedWarehouse && sSelectedWarehouse !== "All Warehouses") {
                aFilters.push(
                    new Filter("warehouse/warehouseName", FilterOperator.EQ, sSelectedWarehouse)
                );
            }

            var oStockFilter = this.byId("inventoryStockStatusFilter");
            var sStockStatus = oStockFilter ? oStockFilter.getSelectedKey() : "";

            if (sStockStatus === "available") {
                aFilters.push(new Filter("stockQty", FilterOperator.GT, 0));
            } else if (sStockStatus === "Out Of Stock") {
                aFilters.push(new Filter("stockQty", FilterOperator.EQ, 0));
            }

            oTable.setNoDataText(
                this._buildInventoryNoDataText(sSelectedWarehouse, sStockStatus, sSearchQuery)
            );

            // Apply all active filters together (AND across categories)
            oBinding.filter(aFilters);

            MessageToast.show("Filters applied.");
        },

        _buildInventoryNoDataText: function (sWarehouse, sStockStatus, sSearchQuery) {

            var bHasWarehouse = sWarehouse && sWarehouse !== "All Warehouses";
            var sWarehouseLabel = "";

            if (bHasWarehouse) {
                var oWarehouseSelect = this.byId("inventoryWarehouseFilter");
                var oSelectedItem = oWarehouseSelect.getSelectedItem();
                sWarehouseLabel = oSelectedItem ? oSelectedItem.getText() : sWarehouse;
            }

            if (sSearchQuery) {
                return "No products matching \"" + sSearchQuery + "\" were found" +
                    (bHasWarehouse ? " in " + sWarehouseLabel : "") + ".";
            }

            if (sStockStatus === "Out Of Stock") {

                return bHasWarehouse
                    ? "There is no out of stock inventory in " + sWarehouseLabel + "."
                    : "There is no out of stock inventory.";

            } else if (sStockStatus === "available") {

                return bHasWarehouse
                    ? "No available stock found in " + sWarehouseLabel + "."
                    : "No available stock found.";
            }

            return bHasWarehouse
                ? "No inventory records available for " + sWarehouseLabel + "."
                : "No inventory records available.";
        },

        onClearInventoryFilters: function () {

            var oSearchField = this.byId("inventoryProductSearch");
            var oWarehouseSelect = this.byId("inventoryWarehouseFilter");
            var oStockFilter = this.byId("inventoryStockStatusFilter");
            var oTable = this.byId("inventoryTable");

            if (oSearchField) {
                oSearchField.setValue("");
            }

            if (oWarehouseSelect) {
                oWarehouseSelect.setSelectedKey("All Warehouses");
            }

            if (oStockFilter) {
                oStockFilter.setSelectedKey("");
            }

            if (oTable) {
                oTable.setNoDataText("No inventory records available");

                var oBinding = oTable.getBinding("items");

                if (oBinding) {
                    oBinding.filter([]);
                }
            }

            MessageToast.show("Inventory filters cleared.");
        },

        /* =========================================================== */
        /* Sales filters                                               */
        /* =========================================================== */

        onApplySalesFilters: function () {
            this._applySalesFilters();
        },

        _applySalesFilters: function () {

            var oTable = this.byId("salesTable");

            if (!oTable) {
                MessageBox.error("Sales table not found.");
                return;
            }

            var oBinding = oTable.getBinding("items");

            if (!oBinding) {
                MessageBox.warning("Sales table binding is not available.");
                return;
            }

            var aFilters = [];
            var oSearchField = this.byId("salesSearchField");
            var sQuery = oSearchField ? (oSearchField.getValue() || "").trim() : "";

            if (sQuery) {

                var sQueryLower = sQuery.toLowerCase();

                aFilters.push(
                    new Filter({
                        filters: [

                            new Filter({
                                path: "saleNumber",
                                test: function (sVal) {
                                    return sVal && String(sVal).toLowerCase().indexOf(sQueryLower) !== -1;
                                }
                            }),

                            new Filter({
                                path: "customer/customerName",
                                test: function (sVal) {
                                    return sVal && String(sVal).toLowerCase().indexOf(sQueryLower) !== -1;
                                }
                            }),

                            new Filter({
                                path: "product/productName",
                                test: function (sVal) {
                                    return sVal && String(sVal).toLowerCase().indexOf(sQueryLower) !== -1;
                                }
                            })

                        ],
                        and: false
                    })
                );
            }

            var oStatusSelect = this.byId("salesStatusFilter");
            var sStatus = oStatusSelect ? oStatusSelect.getSelectedKey() : "";

            if (sStatus) {
                aFilters.push(new Filter("status", FilterOperator.EQ, sStatus));
            }

            var oDateFrom = this.byId("salesDateFrom");
            var oDateTo = this.byId("salesDateTo");

            var oFromDate = oDateFrom ? oDateFrom.getDateValue() : null;
            var oToDate = oDateTo ? oDateTo.getDateValue() : null;

            if (oFromDate || oToDate) {

                var iFromTime = oFromDate ? new Date(
                    oFromDate.getFullYear(),
                    oFromDate.getMonth(),
                    oFromDate.getDate(),
                    0, 0, 0, 0
                ).getTime() : null;

                var iToTime = oToDate ? new Date(
                    oToDate.getFullYear(),
                    oToDate.getMonth(),
                    oToDate.getDate(),
                    23, 59, 59, 999
                ).getTime() : null;

                aFilters.push(
                    new Filter({
                        path: "saleDate",
                        test: function (sSaleDate) {

                            if (!sSaleDate) {
                                return false;
                            }

                            var iRowTime = new Date(sSaleDate).getTime();

                            if (isNaN(iRowTime)) {
                                return false;
                            }

                            if (iFromTime !== null && iRowTime < iFromTime) {
                                return false;
                            }

                            if (iToTime !== null && iRowTime > iToTime) {
                                return false;
                            }

                            return true;
                        }
                    })
                );
            }

            oTable.setNoDataText(
                this._buildSalesNoDataText(sQuery, sStatus, oFromDate, oToDate)
            );

            // Apply all active filters together (AND across categories)
            oBinding.filter(aFilters);

            MessageToast.show("Filters applied.");
        },

        _buildSalesNoDataText: function (sQuery, sStatus, oFromDate, oToDate) {

            var aParts = [];

            if (sQuery) {
                aParts.push("matching \"" + sQuery + "\"");
            }

            if (sStatus) {
                aParts.push("with status \"" + sStatus + "\"");
            }

            if (oFromDate || oToDate) {
                aParts.push("in the selected date range");
            }

            if (aParts.length === 0) {
                return "No sales available";
            }

            return "No sales found " + aParts.join(" ") + ".";
        },

        onClearSalesFilters: function () {

            var oSearchField = this.byId("salesSearchField");
            var oStatusSelect = this.byId("salesStatusFilter");
            var oDateFrom = this.byId("salesDateFrom");
            var oDateTo = this.byId("salesDateTo");
            var oTable = this.byId("salesTable");

            if (oSearchField) {
                oSearchField.setValue("");
            }

            if (oStatusSelect) {
                oStatusSelect.setSelectedKey("");
            }

            if (oDateFrom) {
                oDateFrom.setValue("");
            }

            if (oDateTo) {
                oDateTo.setValue("");
            }

            if (oTable) {
                oTable.setNoDataText("No sales available");

                var oBinding = oTable.getBinding("items");

                if (oBinding) {
                    oBinding.filter([]);
                }
            }

            MessageToast.show("Sales filters cleared.");
        }
    });

});