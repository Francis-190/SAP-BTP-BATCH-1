sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/EventBus"
], function (
    Controller,
    JSONModel,
    EventBus
) {
    "use strict";

    const aCategoryPalette = [
        "#2563eb",
        "#f59e0b",
        "#16a34a",
        "#e11d48",
        "#8b5cf6",
        "#14b8a6",
        "#a78bfa",
        "#0891b2",
        "#65a30d",
        "#db2777"
    ];

    return Controller.extend("inventorytest.controller.Dashboard", {

        onInit: function () {

            console.log("Dashboard controller initialized");

            this._oEventBus = EventBus.getInstance();

            this._oEventBus.subscribe(
                "inventorytest",
                "stockIssued",
                this._onStockIssued,
                this
            );

            const oRouter =
                this.getOwnerComponent().getRouter();

            if (oRouter) {

                const oDashboardRoute =
                    oRouter.getRoute("dashboard");

                if (oDashboardRoute) {

                    oDashboardRoute.attachPatternMatched(
                        this._onDashboardRouteMatched,
                        this
                    );
                }
            }

            /* =====================================================
             * KPI MODEL
             * ===================================================== */
            this.getView().setModel(
                new JSONModel({
                    total: 0,
                    lowStock: 0,
                    outOfStock: 0
                }),
                "kpi"
            );

            /* =====================================================
             * KPI TILES MODEL
             * ===================================================== */
            this.getView().setModel(
                new JSONModel({
                    items: []
                }),
                "kpiTiles"
            );

            /* =====================================================
             * LOW STOCK MODEL
             * ===================================================== */
            this.getView().setModel(
                new JSONModel({
                    items: []
                }),
                "lowStockList"
            );

            /* =====================================================
             * WAREHOUSE CHART MODEL
             * ===================================================== */
            this.getView().setModel(
                new JSONModel({
                    items: []
                }),
                "warehouseStock"
            );

            /* =====================================================
             * CATEGORY CHART MODEL
             * ===================================================== */
            this.getView().setModel(
                new JSONModel({
                    items: []
                }),
                "categoryStock"
            );

            /* =====================================================
             * CATEGORY LEGEND MODEL
             * ===================================================== */
            this.getView().setModel(
                new JSONModel({
                    items: []
                }),
                "categoryLegend"
            );

            /* =====================================================
             * CHART TITLE MODEL
             * ===================================================== */
            this.getView().setModel(
                new JSONModel({
                    warehouseTitle: "Stock by Warehouse"
                }),
                "chartTitles"
            );

            /* =====================================================
             * CHART DETAIL MODEL
             * ===================================================== */
            this.getView().setModel(
                new JSONModel({
                    title: "",
                    items: []
                }),
                "chartDetail"
            );

            /* =====================================================
             * RECENT STOCK ISSUES MODEL
             * ===================================================== */
            this.getView().setModel(
                new JSONModel({
                    items: []
                }),
                "recentIssues"
            );

            this._loadDashboard();
        },


        /* =========================================================
         * DASHBOARD ROUTE MATCHED
         * ========================================================= */
        _onDashboardRouteMatched: function () {

            console.log(
                "Dashboard route matched - refreshing dashboard."
            );

            this._loadDashboard();
        },


        /* =========================================================
         * STOCK ISSUED EVENT
         * ========================================================= */
        _onStockIssued: function () {

            console.log(
                "Dashboard received stockIssued event."
            );

            this._loadRecentStockIssues();
        },


        /* =========================================================
         * FORMAT DATE / TIME
         * ========================================================= */
        _formatDateTime: function (vDate) {

            if (!vDate) {
                return "";
            }

            const oDate =
                vDate instanceof Date
                    ? vDate
                    : new Date(vDate);

            if (isNaN(oDate.getTime())) {
                return String(vDate);
            }

            return new Intl.DateTimeFormat(
                undefined,
                {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                }
            ).format(oDate);
        },


        /* =========================================================
         * LOAD RECENT STOCK ISSUES
         * ========================================================= */
        _loadRecentStockIssues: async function () {

            try {

                const oModel =
                    this.getOwnerComponent().getModel();

                if (!oModel) {

                    console.error(
                        "Recent Issues ERROR: OData model is not available."
                    );

                    return;
                }

                console.log(
                    "Loading recent ISSUE movements..."
                );

                const oBinding =
                    oModel.bindList(
                        "/StockMovements",
                        null,
                        [],
                        [],
                        {
                            $filter:
                                "movementType eq 'ISSUE' and status eq 'POSTED'",

                            $expand:
                                "part,fromLocation",

                            $orderby:
                                "createdAt desc"
                        }
                    );

                const aContexts =
                    await oBinding.requestContexts(
                        0,
                        3
                    );

                const aRows =
                    aContexts.map(function (oContext) {
                        return oContext.getObject();
                    });

                console.log(
                    "Recent ISSUE movements:",
                    aRows
                );

                const aIssueItems =
                    aRows.map(function (oRow) {

                        return {

                            id:
                                oRow.ID,

                            partNumber:
                                oRow.part &&
                                oRow.part.partNumber
                                    ? oRow.part.partNumber
                                    : oRow.part_ID || "",

                            description:
                                oRow.part &&
                                oRow.part.description
                                    ? oRow.part.description
                                    : "",

                            locationName:
                                oRow.fromLocation &&
                                oRow.fromLocation.name
                                    ? oRow.fromLocation.name
                                    : oRow.fromLocation_ID || "",

                            locationCode:
                                oRow.fromLocation &&
                                oRow.fromLocation.locationCode
                                    ? oRow.fromLocation.locationCode
                                    : "",

                            quantity:
                                Number(
                                    oRow.quantity || 0
                                ),

                            reference:
                                oRow.reference || "—",

                            movementType:
                                oRow.movementType || "ISSUE",

                            status:
                                oRow.status || "POSTED",

                            dateTime:
                                this._formatDateTime(
                                    oRow.createdAt
                                )
                        };

                    }.bind(this));

                this.getView()
                    .getModel("recentIssues")
                    .setData({
                        items: aIssueItems
                    });

                console.log(
                    "Recent Stock Issues loaded:",
                    aIssueItems.length
                );

            } catch (oError) {

                console.error(
                    "Failed to load recent stock issues:",
                    oError
                );

                this.getView()
                    .getModel("recentIssues")
                    .setData({
                        items: []
                    });
            }
        },


        /* =========================================================
         * MANUAL REFRESH OF RECENT ISSUES
         * ========================================================= */
        onRefreshRecentIssues: function () {

            this._loadRecentStockIssues();
        },


        /* =========================================================
         * LOAD DASHBOARD DATA
         * ========================================================= */
        _loadDashboard: async function () {

            try {

                const oModel =
                    this.getOwnerComponent().getModel();

                console.log(
                    "Dashboard OData model:",
                    oModel
                );

                if (!oModel) {

                    console.error(
                        "Dashboard ERROR: OData model is not available."
                    );

                    return;
                }

                /* =================================================
                 * LOAD INVENTORY
                 * ================================================= */
                const oInvBinding =
                    oModel.bindList(
                        "/Inventory",
                        null,
                        [],
                        [],
                        {
                            $expand: "part,location"
                        }
                    );

                console.log(
                    "Dashboard: Loading Inventory..."
                );

                const aInvContexts =
                    await oInvBinding.requestContexts(
                        0,
                        10000
                    );

                console.log(
                    "Dashboard: Inventory context count =",
                    aInvContexts.length
                );

                const aInvRows =
                    aInvContexts.map(function (oContext) {
                        return oContext.getObject();
                    });

                console.log(
                    "Dashboard Inventory rows:",
                    aInvRows
                );

                this._aInvRows = aInvRows;


                /* =================================================
                 * LOAD RECENT STOCK ISSUES
                 * ================================================= */
                await this._loadRecentStockIssues();


                /* =================================================
                 * LOAD TODAY'S TOTAL MOVEMENTS
                 *
                 * Source:
                 * ApplicationLogs
                 *
                 * Created by:
                 * generateDailyInventorySummary
                 * ================================================= */
                const oLogBinding =
                    oModel.bindList(
                        "/ApplicationLogs",
                        null,
                        [],
                        [],
                        {
                            $filter:
                                "operation eq 'generateDailyInventorySummary' and severity eq 'INFO'",

                            $orderby:
                                "timestamp desc"
                        }
                    );

                const aLogContexts =
                    await oLogBinding.requestContexts(
                        0,
                        1
                    );

                let iTotalMovementsToday = 0;

                if (aLogContexts.length > 0) {

                    const oLog =
                        aLogContexts[0].getObject();

                    try {

                        const oSummary =
                            JSON.parse(
                                oLog.message
                            );

                        iTotalMovementsToday =
                            Number(
                                oSummary.totalMovements || 0
                            );

                    } catch (oError) {

                        console.error(
                            "Failed to parse daily inventory summary:",
                            oError
                        );
                    }
                }

                console.log(
                    "Today's Total Movements:",
                    iTotalMovementsToday
                );


                /* =================================================
                 * COUNTERS
                 * ================================================= */
                let iLowStock = 0;
                let iOutOfStock = 0;

                const aLowStockItems = [];

                const oWarehouseTotals = {};

                const oCategoryCounts = {};


                /* =================================================
                 * PROCESS INVENTORY
                 * ================================================= */
                aInvRows.forEach(function (oRow) {

                    const iQuantity =
                        Number(
                            oRow.quantityOnHand || 0
                        );


                    const iReorderLevel =
                        oRow.reorderLevel !== null &&
                        oRow.reorderLevel !== undefined

                            ? Number(oRow.reorderLevel)

                            : (
                                oRow.part &&
                                oRow.part.reorderLevel !== null &&
                                oRow.part.reorderLevel !== undefined

                                    ? Number(
                                        oRow.part.reorderLevel
                                    )

                                    : 0
                            );


                    /* =================================================
                     * STOCK STATUS
                     * ================================================= */
                    if (iQuantity <= 0) {

                        iOutOfStock++;

                        aLowStockItems.push({

                            partNumber:
                                oRow.part &&
                                oRow.part.partNumber

                                    ? oRow.part.partNumber

                                    : oRow.part_ID,

                            description:
                                oRow.part &&
                                oRow.part.description

                                    ? oRow.part.description

                                    : "",

                            locationName:
                                oRow.location &&
                                oRow.location.name

                                    ? oRow.location.name

                                    : oRow.location_ID,

                            quantityOnHand:
                                iQuantity,

                            reorderLevel:
                                iReorderLevel,

                            status:
                                "Out of Stock"
                        });

                    } else if (
                        iQuantity <= iReorderLevel
                    ) {

                        iLowStock++;

                        aLowStockItems.push({

                            partNumber:
                                oRow.part &&
                                oRow.part.partNumber

                                    ? oRow.part.partNumber

                                    : oRow.part_ID,

                            description:
                                oRow.part &&
                                oRow.part.description

                                    ? oRow.part.description

                                    : "",

                            locationName:
                                oRow.location &&
                                oRow.location.name

                                    ? oRow.location.name

                                    : oRow.location_ID,

                            quantityOnHand:
                                iQuantity,

                            reorderLevel:
                                iReorderLevel,

                            status:
                                "Low Stock"
                        });
                    }


                    /* =================================================
                     * WAREHOUSE TOTALS
                     * ================================================= */
                    const sWarehouseKey =
                        oRow.location

                            ? (
                                oRow.location.name ||
                                oRow.location_ID
                            )

                            : "Unknown";


                    oWarehouseTotals[sWarehouseKey] =
                        (
                            oWarehouseTotals[sWarehouseKey] ||
                            0
                        ) + iQuantity;


                    /* =================================================
                     * CATEGORY COUNTS
                     * ================================================= */
                    const sCategoryKey =
                        oRow.part &&
                        oRow.part.category

                            ? oRow.part.category

                            : "Uncategorized";


                    oCategoryCounts[sCategoryKey] =
                        (
                            oCategoryCounts[sCategoryKey] ||
                            0
                        ) + 1;
                });


                /* =====================================================
                 * UPDATE KPI MODEL
                 * ===================================================== */
                this.getView()
                    .getModel("kpi")
                    .setData({

                        total:
                            aInvRows.length,

                        lowStock:
                            iLowStock,

                        outOfStock:
                            iOutOfStock
                    });


                /* =====================================================
                 * UPDATE LOW STOCK TABLE
                 * ===================================================== */
                this.getView()
                    .getModel("lowStockList")
                    .setData({

                        items:
                            aLowStockItems
                    });


                /* =====================================================
                 * KPI CARD DATA
                 * ===================================================== */
                this.getView()
                    .getModel("kpiTiles")
                    .setData({

                        items: [

                            {
                                key: "all",

                                title:
                                    "Total Records",

                                subtitle:
                                    "Location",

                                value:
                                    aInvRows.length,

                                unit:
                                    "records",

                                icon:
                                    "sap-icon://document-text",

                                cssClass:
                                    "kpiBlue"
                            },

                            {
                                key: "lowStock",

                                title:
                                    "Low Stock",

                                subtitle:
                                    "At or below reorder",

                                value:
                                    iLowStock,

                                unit:
                                    "items",

                                icon:
                                    "sap-icon://alert",

                                cssClass:
                                    "kpiOrange"
                            },

                            {
                                key: "outOfStock",

                                title:
                                    "Out of Stock",

                                subtitle:
                                    "Zero quantity",

                                value:
                                    iOutOfStock,

                                unit:
                                    "items",

                                icon:
                                    "sap-icon://decline",

                                cssClass:
                                    "kpiRed"
                            },

                            {
                                key:
                                    "totalMovementsToday",

                                title:
                                    "Total Movements",

                                subtitle:
                                    "Today's ISSUE + TRANSFER",

                                value:
                                    iTotalMovementsToday,

                                unit:
                                    "movements",

                                icon:
                                    "sap-icon://activity-items",

                                cssClass:
                                    "kpiBlue"
                            }
                        ]
                    });


                /* =====================================================
                 * WAREHOUSE CHART DATA
                 * ===================================================== */
                const aWarehouseItems =
                    Object.keys(oWarehouseTotals)

                        .map(function (sKey) {

                            return {

                                warehouse:
                                    sKey,

                                stock:
                                    oWarehouseTotals[sKey]
                            };
                        })

                        .sort(function (a, b) {

                            return b.stock - a.stock;
                        });


                this.getView()
                    .getModel("warehouseStock")
                    .setData({

                        items:
                            aWarehouseItems
                    });


                /* =====================================================
                 * CATEGORY CHART DATA
                 * ===================================================== */
                const aCategoryItems =
                    Object.keys(oCategoryCounts)

                        .map(function (sKey) {

                            return {

                                category:
                                    sKey,

                                count:
                                    oCategoryCounts[sKey]
                            };
                        })

                        .sort(function (a, b) {

                            return b.count - a.count;
                        });


                this.getView()
                    .getModel("categoryStock")
                    .setData({

                        items:
                            aCategoryItems
                    });


                /* =====================================================
                 * CATEGORY LEGEND
                 * ===================================================== */
                const aLegendItems =
                    aCategoryItems.map(
                        function (oItem, iIndex) {

                            return {

                                category:
                                    oItem.category,

                                count:
                                    oItem.count,

                                colorHex:
                                    aCategoryPalette[
                                        iIndex %
                                        aCategoryPalette.length
                                    ]
                            };
                        }
                    );


                this.getView()
                    .getModel("categoryLegend")
                    .setData({

                        items:
                            aLegendItems
                    });


                /* =====================================================
                 * CONFIGURE CATEGORY DONUT
                 * ===================================================== */
                const oCategoryChart =
                    this.byId(
                        "categoryStockChart"
                    );


                if (oCategoryChart) {

                    oCategoryChart.setVizProperties({

                        plotArea: {

                            colorPalette:
                                aCategoryPalette,

                            dataLabel: {

                                visible:
                                    true
                            }
                        },

                        legend: {

                            visible:
                                false
                        },

                        title: {

                            visible:
                                false
                        }
                    });
                }


                /* =====================================================
                 * CONFIGURE WAREHOUSE CHART
                 * ===================================================== */
                const oWarehouseChart =
                    this.byId(
                        "warehouseStockChart"
                    );


                if (oWarehouseChart) {

                    oWarehouseChart.setVizProperties({

                        plotArea: {

                            colorPalette:
                                ["#60a5fa"]
                        },

                        title: {

                            visible:
                                false
                        }
                    });
                }


                console.log(
                    "Dashboard loaded successfully."
                );

                console.log(
                    "Dashboard KPI:",
                    {
                        total:
                            aInvRows.length,

                        lowStock:
                            iLowStock,

                        outOfStock:
                            iOutOfStock,

                        totalMovementsToday:
                            iTotalMovementsToday
                    }
                );

            } catch (oError) {

                console.error(
                    "Failed to load dashboard data:",
                    oError
                );
            }
        },


        /* =========================================================
         * KPI TILE NAVIGATION
         * ========================================================= */
        onKpiTilePress: function (oEvent) {

            const oContext =
                oEvent
                    .getSource()
                    .getBindingContext("kpiTiles");

            if (!oContext) {

                console.error(
                    "KPI tile binding context not found."
                );

                return;
            }

            const oTileData =
                oContext.getObject();

            /* =====================================================
             * TOTAL MOVEMENTS IS DISPLAY ONLY
             * ===================================================== */
            if (
                oTileData.key ===
                "totalMovementsToday"
            ) {
                return;
            }

            this.getOwnerComponent()
                .getRouter()
                .navTo(
                    "inventory",
                    {
                        filter:
                            oTileData.key
                    }
                );
        },


        /* =========================================================
         * WAREHOUSE CHART SELECT
         * ========================================================= */
        onWarehouseChartSelect: function (oEvent) {

            const aData =
                oEvent.getParameter("data");


            if (
                !aData ||
                !aData.length
            ) {
                return;
            }


            const sWarehouse =
                aData[0].data["Warehouse"];


            this.getView()
                .getModel("chartTitles")
                .setProperty(
                    "/warehouseTitle",
                    "Stock by Warehouse — " +
                    sWarehouse
                );


            this._showChartDrillDown(
                "warehouse",
                sWarehouse,
                oEvent.getSource()
            );
        },


        /* =========================================================
         * WAREHOUSE CHART DESELECT
         * ========================================================= */
        onWarehouseChartDeselect: function () {

            this.getView()
                .getModel("chartTitles")
                .setProperty(
                    "/warehouseTitle",
                    "Stock by Warehouse"
                );
        },


        /* =========================================================
         * CATEGORY CHART SELECT
         * ========================================================= */
        onCategoryChartSelect: function (oEvent) {

            const aData =
                oEvent.getParameter("data");


            if (
                !aData ||
                !aData.length
            ) {
                return;
            }


            const sCategory =
                aData[0].data["Category"];


            this._showChartDrillDown(
                "category",
                sCategory,
                oEvent.getSource()
            );
        },


        /* =========================================================
         * CATEGORY CHART DESELECT
         * ========================================================= */
        onCategoryChartDeselect: function () {
            // Nothing required here.
        },


        /* =========================================================
         * CHART DRILL DOWN
         * ========================================================= */
        _showChartDrillDown: function (
            sType,
            sValue,
            oSourceChart
        ) {

            const aRows =
                this._aInvRows || [];


            let aFiltered = [];
            let sTitle = "";


            if (
                sType === "warehouse"
            ) {

                aFiltered =
                    aRows.filter(
                        function (oRow) {

                            const sRowWarehouse =
                                oRow.location

                                    ? (
                                        oRow.location.name ||
                                        oRow.location_ID
                                    )

                                    : "Unknown";


                            return (
                                sRowWarehouse ===
                                sValue
                            );
                        }
                    );


                sTitle =
                    "Warehouse: " +
                    sValue;


            } else {

                aFiltered =
                    aRows.filter(
                        function (oRow) {

                            const sRowCategory =
                                oRow.part &&
                                oRow.part.category

                                    ? oRow.part.category

                                    : "Uncategorized";


                            return (
                                sRowCategory ===
                                sValue
                            );
                        }
                    );


                sTitle =
                    "Category: " +
                    sValue;
            }


            const aDetailItems =
                aFiltered

                    .map(function (oRow) {

                        return {

                            partNumber:
                                oRow.part
                                    ? oRow.part.partNumber
                                    : oRow.part_ID,

                            locationName:
                                oRow.location
                                    ? oRow.location.name
                                    : oRow.location_ID,

                            quantityOnHand:
                                Number(
                                    oRow.quantityOnHand ||
                                    0
                                )
                        };
                    })

                    .sort(function (a, b) {

                        return (
                            b.quantityOnHand -
                            a.quantityOnHand
                        );
                    });


            this.getView()
                .getModel("chartDetail")
                .setData({

                    title:
                        sTitle,

                    items:
                        aDetailItems
                });


            const oPopover =
                this.byId(
                    "chartDetailPopover"
                );


            if (oPopover) {

                oPopover.openBy(
                    oSourceChart
                );
            }
        },


        /* =========================================================
         * CLOSE DRILL-DOWN
         * ========================================================= */
        onCloseChartDetail: function () {

            const oPopover =
                this.byId(
                    "chartDetailPopover"
                );


            if (oPopover) {

                oPopover.close();
            }
        },


        /* =========================================================
         * EXISTING NAVIGATION
         * ========================================================= */
        onNavInventory: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo(
                    "inventory",
                    {
                        filter:
                            "all"
                    }
                );
        },


        onNavLowStock: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo(
                    "inventory",
                    {
                        filter:
                            "lowStock"
                    }
                );
        },


        onNavOutOfStock: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo(
                    "inventory",
                    {
                        filter:
                            "outOfStock"
                    }
                );
        },


        onNavHealthy: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo(
                    "inventory",
                    {
                        filter:
                            "healthy"
                    }
                );
        },


        onNavIssue: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo(
                    "issue"
                );
        },


        onNavTransfer: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo(
                    "transfer"
                );
        },


        /* =========================================================
         * CLEANUP
         * ========================================================= */
        onExit: function () {

            if (this._oEventBus) {

                this._oEventBus.unsubscribe(
                    "inventorytest",
                    "stockIssued",
                    this._onStockIssued,
                    this
                );
            }

            const oRouter =
                this.getOwnerComponent().getRouter();

            if (oRouter) {

                const oDashboardRoute =
                    oRouter.getRoute("dashboard");

                if (oDashboardRoute) {

                    oDashboardRoute.detachPatternMatched(
                        this._onDashboardRouteMatched,
                        this
                    );
                }
            }
        }

    });
});