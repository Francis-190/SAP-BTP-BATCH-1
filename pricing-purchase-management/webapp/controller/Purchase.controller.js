sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ui/vbm/AnalyticMap",
    "sap/m/MessageToast",
    "../model/formatter"

], function ( Controller, JSONModel, MessageBox, AnalyticMap, MessageToast, formatter ) {
    "use strict";

    AnalyticMap.GeoJSONURL = sap.ui.require.toUrl( "purchasemanagement/model/india_5_regions.geojson" );

    console.log( "GeoJSON File URL : " + AnalyticMap.GeoJSONURL);

    return Controller.extend( "purchasemanagement.controller.Purchase", {

            formatter: formatter,

            onInit: function () {

                var oDashboardModel =
                    new JSONModel({
                        totalPOs: 0,
                        pendingPOs: 0,
                        approvedPOs: 0,
                        rejectedPOs: 0,
                        deliveredPOs: 0,
                        totalValue: "0.00"
                    });

                this.getView().setModel( oDashboardModel, "dashboard" );

                // -----------------------------------------------------
                // REGION MODEL
                // -----------------------------------------------------

                this._initializeRegionModel(); 

                // -----------------------------------------------------
                // INDIA MAP
                // -----------------------------------------------------

                this._oIndiaMap = this.byId( "idAnalyticMapIndia" );

                // -----------------------------------------------------
                // EXISTING DASHBOARD DATA
                // -----------------------------------------------------

                this._loadDashboard();

                var oChart = this.byId('idVizFrame');
                console.log("CHART : " + this.getOwnerComponent().getModel("purchase"));

                // oChart.setVizProperties({

                //     plotArea : {
                //         dataLabel : {
                //             visible : true,
                //             type : "value"
                //         }
                //     },

                //     title : {
                //         visible : true,
                //         text: "Region Vs Purchase Value"
                //     },

                //     valueAxis : {
                //         visible : true,
                //         text : "Region"
                //     },
                //     categoryAxis : {
                //         visible : true,
                //         text : "Purchase Value"
                //     }
        
                // })

                // -----------------------------------------------------
                // REGIONAL ANALYTICS
                // -----------------------------------------------------

                this._loadRegionalInsightsData();



                var oChartData = {

                    selectedTitle: "Sales Order Status",
                
                    // Section 1: Donut Chart Arrays
                    PO_STATUS: [
                        { label: "Approved PO", value: 120 },
                        { label: "Submitted PO", value: 45 },
                        { label: "Pending PO", value: 30 },
                        { label: "Rejected PO", value: 12 }
                    ],
                    PRICING: [
                        { label: "Contracted", value: 85 },
                        { label: "Standard", value: 65 },
                        { label: "Spot Rate", value: 20 },
                        { label: "Discounted", value: 37 }
                    ],
                    DEALER: [
                        { label: "Approved", value: 90 },
                        { label: "Submitted", value: 50 },
                        { label: "Pending", value: 40 },
                        { label: "Rejected", value: 27 }
                    ],
                    WAREHOUSE: [
                        { label: "North Hub", value: 110 },
                        { label: "South Depot", value: 75 },
                        { label: "East Facility", value: 15 },
                        { label: "West Storage", value: 7 }
                    ],

                    // Section 2: Products by Category Array
                    ProductCategories: [
                        { group: "Raw Materials", quantity: 1450 },
                        { group: "Machinery", quantity: 820 },
                        { group: "IT Hardware", quantity: 600 },
                        { group: "Stationery", quantity: 350 },
                        { group: "Safety Gear", quantity: 540 }
                    ]
            };

            var oModel = new JSONModel(oChartData);
            this.getView().setModel(oModel, "chartData");

            this._configureVizProperties();

            },

            _configureVizProperties: function () {
            var oVizFrameDonut = this.byId("idVizFrameDonut");
            var oVizFrameProductBar = this.byId("idVizFrameProductBar");

            if (oVizFrameDonut) {
                oVizFrameDonut.setVizProperties({
                    plotArea: {
                        dataLabel: { visible: true, type: "value" },
                        drawingEffect: "glossy",
                        colorPalette: ["#4caf50", "#2196f3", "#ff9800", "#f44336"] // Green, Blue, Orange, Red
                    },
                    title: { visible: false },
                    legend: { visible: true, position: "bottom" }
                });
            }

            if (oVizFrameProductBar) {
                oVizFrameProductBar.setVizProperties({
                    plotArea: {
                        dataLabel: { visible: true },
                        drawingEffect: "glossy",
                        colorPalette: ["#3f51b5"] // Deep Blue
                    },
                    title: { visible: false },
                    legend: { visible: false },
                    categoryAxis: { title: { visible: false } },
                    valueAxis: { title: { visible: false } }
                });
            }
        },

        onDimensionChange: function (oEvent) {
            var sSelectedKey = oEvent.getParameter("selectedItem").getKey();
            var oVizFrame = this.byId("idVizFrameDonut");
            var oModel = this.getView().getModel("chartData");

            var mTitles = {
                "PO_STATUS": "Sales Order Status",
                "PRICING": "Pricing Agreements",
                "DEALER": "Dealer Distribution",
                "WAREHOUSE": "Warehouse Allocation"
            };

            oModel.setProperty("/selectedTitle", mTitles[sSelectedKey]);

            var oDataset = oVizFrame.getDataset();
            oDataset.bindData("chartData>/" + sSelectedKey);
        },

        // // Action Handlers
        // onCreatePO: function () { MessageToast.show("Navigating to Create PO..."); },
        // onPurchaseOrders: function () { MessageToast.show("Loading PO List..."); },
        // onProducts: function () { MessageToast.show("Loading Products..."); },
        // onPriceMaster: function () { MessageToast.show("Loading Price Master..."); },
        // onAnalytics: function () { MessageToast.show("Loading Analytics..."); },

            // =========================================================
            // INITIALIZE REGION MODEL
            // =========================================================

            _initializeRegionModel: function () {

                var aRegions = [
                    {
                        code: "NORTH",
                        regionName: "Northern Region",
                        description: "Pricing and sales insights for the Northern region",
                        color: "rgba(41, 98, 255, 0.60)"
                    },
                    {
                        code: "EAST",
                        regionName: "Eastern Region",
                        description: "Pricing and sales insights for the Eastern region",
                        color: "rgba(0, 150, 136, 0.60)"
                    },
                    {
                        code: "WEST",
                        regionName: "Western Region",
                        description: "Pricing and sales insights for the Western region",
                        color: "rgba(255, 152, 0, 0.60)"
                    },
                    {
                        code: "CENTRAL",
                        regionName: "Central Region",
                        description: "Pricing and sales insights for the Central region",
                        color: "rgba(123, 31, 162, 0.60)"
                    },
                    {
                        code: "SOUTH",
                        regionName: "Southern Region",
                        description: "Pricing and sales insights for the Southern region",
                        color: "rgba(0, 121, 107, 0.60)"
                    }
                ];

                aRegions.forEach( function (oRegion) {
                        this._resetRegionMetrics( oRegion ); //2
                    }.bind(this)
                );

                var oAllRegions = this._createAllRegionsSummary( aRegions ); //3

                var oRegionModel = new JSONModel({

                        regionProperties: aRegions,
                        selectedRegion: oAllRegions
                    });

                this.getView().setModel( oRegionModel, "regionModel" );
            },

            // =========================================================
            // RESET REGION METRICS
            // =========================================================

            _resetRegionMetrics: function ( oRegion ) {

                oRegion.totalPurchaseOrders = 0;
                oRegion.totalFinalPricing = 0;
                oRegion.averageTax = 0;
                oRegion.totalDealers = 0;
                oRegion.totalWarehouses = 0;

                // -----------------------------------------------------
                // PURCHASE ORDERS
                // -----------------------------------------------------

                oRegion.purchaseOrdersApproved = 0;
                oRegion.purchaseOrdersPending = 0;
                oRegion.purchaseOrdersRejected = 0;

                // -----------------------------------------------------
                // FINAL PRICING
                // -----------------------------------------------------

                oRegion.finalPricingApproved = 0;
                oRegion.finalPricingPending = 0;
                oRegion.finalPricingRejected = 0;

                // -----------------------------------------------------
                // DEALERS
                // -----------------------------------------------------

                oRegion.dealersApproved = 0;
                oRegion.dealersPending = 0;
                oRegion.dealersRejected = 0;

                // -----------------------------------------------------
                // WAREHOUSES
                // -----------------------------------------------------

                oRegion.warehousesApproved = 0;
                oRegion.warehousesPending = 0;
                oRegion.warehousesRejected = 0;

                // -----------------------------------------------------
                // TAX
                // -----------------------------------------------------

                oRegion._taxSum = 0;
                oRegion._taxCount = 0;

                // -----------------------------------------------------
                // WIDTHS
                // -----------------------------------------------------

                oRegion.purchaseOrdersApprovedWidth = "0%";
                oRegion.purchaseOrdersPendingWidth = "0%";
                oRegion.purchaseOrdersRejectedWidth = "0%";

                oRegion.finalPricingApprovedWidth = "0%";
                oRegion.finalPricingPendingWidth = "0%";
                oRegion.finalPricingRejectedWidth = "0%";

                oRegion.dealersApprovedWidth = "0%";
                oRegion.dealersPendingWidth = "0%";
                oRegion.dealersRejectedWidth = "0%";

                oRegion.warehousesApprovedWidth = "0%";
                oRegion.warehousesPendingWidth = "0%";
                oRegion.warehousesRejectedWidth = "0%";

            },

            // =========================================================
            // LOAD REGIONAL DATA
            // =========================================================

            _loadRegionalInsightsData: async function () {

                    try {

                        var oModel = this.getOwnerComponent().getModel("purchase");

                        var oPOBinding = oModel.bindList( "/PurchaseOrders", null, null, null, { $expand: "dealer($expand=region)" });

                        var oPricingBinding = oModel.bindList( "/PriceMaster", null, null, null, { $expand: "region" });

                        var oDealerBinding = oModel.bindList(  "/Dealers", null, null, null, { $expand: "region" });

                        // Existing application uses /warehouse
                        var oWarehouseBinding = oModel.bindList( "/warehouse" );

                        var aResults = await Promise.all([

                            oPOBinding.requestContexts( 0, 10000 ),

                            oPricingBinding.requestContexts( 0, 10000 ),

                            oDealerBinding.requestContexts( 0, 10000 ),

                            oWarehouseBinding.requestContexts( 0, 10000 )

                        ]);

                        var aPurchaseOrders = aResults[0].map( function (oContext) {

                                    return oContext.getObject();
                                });

                        var aPricing = aResults[1].map( function (oContext) {

                                    return oContext.getObject();
                                });

                        var aDealers = aResults[2].map( function (oContext) {

                                    return oContext.getObject();
                                });


                        var aWarehouses = aResults[3].map( function (oContext) {

                                    return oContext.getObject();
                                });

                        console.log( "Regional Purchase Orders:", aPurchaseOrders );
                        console.log( "Regional PriceMaster:", aPricing );
                        console.log( "Regional Dealers:", aDealers );
                        console.log( "Regional Warehouses:", aWarehouses );

                        this._buildRegionalAnalytics( aPurchaseOrders, aPricing, aDealers, aWarehouses );

                    } catch (oError) {

                        console.error( "Regional analytics loading failed:", oError );
                    }

                },

            // =========================================================
            // BUILD REGIONAL ANALYTICS
            // =========================================================

            _buildRegionalAnalytics: function ( aPurchaseOrders, aPricing, aDealers, aWarehouses ) {

                var oStats = this._createRegionalStats();

                // =====================================================
                // PURCHASE ORDERS
                // =====================================================

                aPurchaseOrders.forEach( function (oPO) {

                        var sRegionCode = this._getRegionCodeFromRegionObject( oPO.dealer && oPO.dealer.region );

                        if ( !oStats[sRegionCode] ) { return; }

                        oStats[sRegionCode].purchaseOrders.total++;

                        var sBucket = this._getStatusBucket( oPO.status, "PurchaseOrders" );

                        oStats[sRegionCode] .purchaseOrders[ sBucket ]++;
                    }.bind(this)
                );

                // =====================================================
                // FINAL PRICING
                // =====================================================

                aPricing.forEach( function (oPrice) {

                        var sRegionCode = this._getRegionCodeFromRegionObject( oPrice.region );

                        if ( !oStats[sRegionCode] ) { return; }

                        var nFinalPrice = Number( oPrice.finalPrice || 0 );

                        var nTax = Number( oPrice.tax || 0 );

                        oStats[sRegionCode].finalPricing.totalValue +=nFinalPrice;

                        oStats[sRegionCode].finalPricing.taxSum += nTax;

                        oStats[sRegionCode].finalPricing.taxCount++;

                        var sBucket = this._getStatusBucket( oPrice.status, "PriceMaster" );

                        oStats[sRegionCode] .finalPricing[ sBucket + "Value" ] += nFinalPrice;

                    }.bind(this)
                );

                // =====================================================
                // DEALERS
                // =====================================================

                aDealers.forEach( function (oDealer) {

                        var sRegionCode = this._getRegionCodeFromRegionObject( oDealer.region );

                        if ( !oStats[sRegionCode] ) { return; }

                        oStats[sRegionCode].dealers.total++;

                        var sBucket = this._getStatusBucket( oDealer.status, "Dealers" );

                        oStats[sRegionCode] .dealers[ sBucket ]++;

                    }.bind(this)
                );

                // =====================================================
                // WAREHOUSES
                // =====================================================

                aWarehouses.forEach( function (oWarehouse) {

                        var sRegionCode = this._getRegionCodeFromState( oWarehouse.state );

                        if ( !oStats[sRegionCode] ) { return; }

                        oStats[sRegionCode].warehouses.total++;

                        var sBucket = this._getStatusBucket( oWarehouse.status, "Warehouses", oWarehouse );

                        oStats[sRegionCode].warehouses[sBucket]++;

                    }.bind(this)
                );

                // =====================================================
                // APPLY TO MODEL
                // =====================================================

                var oModel = this.getView().getModel( "regionModel" );

                var aRegions = oModel.getProperty( "/regionProperties" );

                aRegions.forEach( function (oRegion) {

                        this._applyRegionalStats( oRegion, oStats[oRegion.code] );

                    }.bind(this)
                );

                // oModel.setProperty( "/regionProperties", aRegions );

                // // =====================================================
                // // ALL REGIONS
                // // =====================================================

                // var oAllRegions = this._createAllRegionsSummary( aRegions );

                // oModel.setProperty( "/selectedRegion", oAllRegions );

                // console.log( "Regional analytics model updated" );

                oModel.setProperty("/regionProperties", aRegions);

                var oCurrentRegion = oModel.getProperty("/selectedRegion");

                var oSelectedCode = oCurrentRegion && oCurrentRegion.code;

                if (oSelectedCode && oSelectedCode !== "ALL") {

                    var oUpdatedRegion = aRegions.find(function (oRegion) {
                        return oRegion.code === oSelectedCode;
                    });

                    if (oUpdatedRegion) {

                        oModel.setProperty( "/selectedRegion", Object.assign({}, oUpdatedRegion) );
                    }

                } else {

                    var oAllRegions = this._createAllRegionsSummary(aRegions);

                    oModel.setProperty( "/selectedRegion", oAllRegions );
                }
            },

            // =========================================================
            // CREATE EMPTY REGIONAL STATS
            // =========================================================

            _createRegionalStats: function () {

                    var oStats = {};

                    [
                        "NORTH",
                        "EAST",
                        "WEST",
                        "CENTRAL",
                        "SOUTH"
                    ].forEach( function (sCode) {

                            oStats[sCode] = {

                                purchaseOrders: {
                                    total: 0,
                                    approved: 0,
                                    pending: 0,
                                    rejected: 0
                                },


                                finalPricing: {
                                    totalValue: 0,
                                    approvedValue: 0,
                                    pendingValue: 0,
                                    rejectedValue: 0,
                                    taxSum: 0,
                                    taxCount: 0
                                },

                                dealers: {
                                    total: 0,
                                    approved: 0,
                                    pending: 0,
                                    rejected: 0
                                },

                                warehouses: {
                                    total: 0,
                                    approved: 0,
                                    pending: 0,
                                    rejected: 0
                                }
                            };
                        });

                    return oStats;
                },

            // =========================================================
            // APPLY REGIONAL STATS
            // =========================================================

            _applyRegionalStats: function ( oRegion, oStats ) {

                    if (!oStats) { return; }

                    // =================================================
                    // BASIC VALUES
                    // =================================================

                    oRegion.totalPurchaseOrders = oStats.purchaseOrders.total;

                    oRegion.totalFinalPricing = oStats .finalPricing .totalValue;

                    oRegion.totalDealers = oStats .dealers .total;

                    oRegion.totalWarehouses = oStats .warehouses .total;

                    // =================================================
                    // AVERAGE TAX
                    // =================================================

                    oRegion.averageTax = oStats.finalPricing.taxCount > 0 ? (oStats .finalPricing .taxSum / oStats.finalPricing.taxCount ) : 0;

                    // =================================================
                    // SALES ORDER STATUS
                    // =================================================

                    oRegion.purchaseOrdersApproved = oStats.purchaseOrders.approved;

                    oRegion.purchaseOrdersPending = oStats.purchaseOrders.pending;

                    oRegion.purchaseOrdersRejected = oStats.purchaseOrders.rejected;

                    // =================================================
                    // PRICING STATUS
                    // =================================================

                    oRegion.finalPricingApproved = oStats.finalPricing.approvedValue;

                    oRegion.finalPricingPending = oStats.finalPricing.pendingValue;

                    oRegion.finalPricingRejected = oStats.finalPricing.rejectedValue;

                    // =================================================
                    // DEALER STATUS
                    // =================================================

                    oRegion.dealersApproved = oStats.dealers.approved;

                    oRegion.dealersPending = oStats.dealers.pending;

                    oRegion.dealersRejected = oStats.dealers.rejected;

                    // =================================================
                    // WAREHOUSE STATUS
                    // =================================================

                    oRegion.warehousesApproved = oStats.warehouses.approved;

                    oRegion.warehousesPending = oStats.warehouses.pending;

                    oRegion.warehousesRejected = oStats.warehouses.rejected;

                    // =================================================
                    // CALCULATE PROGRESS
                    // =================================================

                    var oPOProgress = this._calculateProgress( oRegion.purchaseOrdersApproved,  oRegion.purchaseOrdersPending, oRegion.purchaseOrdersRejected );

                    oRegion.purchaseOrdersApprovedWidth = oPOProgress.approvedWidth;

                    oRegion.purchaseOrdersPendingWidth = oPOProgress.pendingWidth;

                    oRegion.purchaseOrdersRejectedWidth = oPOProgress.rejectedWidth;


                    oRegion.purchaseOrdersApprovedText = oPOProgress.approvedText;

                    oRegion.purchaseOrdersPendingText = oPOProgress.pendingText;

                    oRegion.purchaseOrdersRejectedText = oPOProgress.rejectedText;

                    var oPricingProgress = this._calculateProgress(  oRegion.finalPricingApproved, oRegion.finalPricingPending, oRegion.finalPricingRejected );

                    oRegion.finalPricingApprovedWidth = oPricingProgress.approvedWidth;

                    oRegion.finalPricingPendingWidth = oPricingProgress.pendingWidth;

                    oRegion.finalPricingRejectedWidth = oPricingProgress.rejectedWidth;


                    oRegion.finalPricingApprovedText = oPricingProgress.approvedText;

                    oRegion.finalPricingPendingText = oPricingProgress.pendingText;

                    oRegion.finalPricingRejectedText = oPricingProgress.rejectedText;

                    var oDealerProgress = this._calculateProgress( oRegion.dealersApproved, oRegion.dealersPending, oRegion.dealersRejected );

                    oRegion.dealersApprovedWidth = oDealerProgress.approvedWidth;

                    oRegion.dealersPendingWidth = oDealerProgress.pendingWidth;

                    oRegion.dealersRejectedWidth = oDealerProgress.rejectedWidth;


                    oRegion.dealersApprovedText = oDealerProgress.approvedText;

                    oRegion.dealersPendingText = oDealerProgress.pendingText;

                    oRegion.dealersRejectedText = oDealerProgress.rejectedText;

                    var oWarehouseProgress = this._calculateProgress( oRegion.warehousesApproved, oRegion.warehousesPending, oRegion.warehousesRejected );


                    oRegion.warehousesApprovedWidth = oWarehouseProgress.approvedWidth;

                    oRegion.warehousesPendingWidth = oWarehouseProgress.pendingWidth;

                    oRegion.warehousesRejectedWidth = oWarehouseProgress.rejectedWidth;


                    oRegion.warehousesApprovedText = oWarehouseProgress.approvedText;

                    oRegion.warehousesPendingText = oWarehouseProgress.pendingText;

                    oRegion.warehousesRejectedText = oWarehouseProgress.rejectedText;

                    // =================================================
                    // DISPLAY VALUES
                    // =================================================

                    oRegion.totalPurchaseOrdersText = this._formatNumber( oRegion.totalPurchaseOrders );

                    oRegion.totalFinalPricingText = this._formatCurrency(  oRegion.totalFinalPricing );

                    oRegion.averageTaxText = this._formatCurrency( oRegion.averageTax );

                    oRegion.totalDealersText = this._formatNumber( oRegion.totalDealers );

                    oRegion.totalWarehousesText = this._formatNumber( oRegion.totalWarehouses );

                    oRegion.purchaseOrdersTotalText = oRegion.totalPurchaseOrders + " Orders";

                    oRegion.finalPricingTotalText = this._formatCurrency( oRegion.totalFinalPricing );

                    oRegion.dealersTotalText = oRegion.totalDealers + " Dealers";

                    oRegion.warehousesTotalText = oRegion.totalWarehouses + " Warehouses";
                },

            // =========================================================
            // CALCULATE PROGRESS
            // =========================================================

            _calculateProgress: function ( iApproved, iPending, iRejected ) {

                var iTotal = Number(iApproved || 0) + Number(iPending || 0) + Number(iRejected || 0);

                var fApproved = iTotal > 0 ? ( Number(iApproved || 0) / iTotal ) * 100 : 0;

                var fPending = iTotal > 0 ? ( Number(iPending || 0) / iTotal ) * 100 : 0;

                var fRejected = iTotal > 0 ? ( Number(iRejected || 0) / iTotal ) * 100 : 0;

                return {

                    approvedWidth: fApproved.toFixed(2) + "%",

                    pendingWidth: fPending.toFixed(2) + "%",

                    rejectedWidth: fRejected.toFixed(2) + "%",


                    approvedText: "Approved " + fApproved.toFixed(0) + "%",

                    pendingText: "Pending " + fPending.toFixed(0) + "%",

                    rejectedText: "Rejected " + fRejected.toFixed(0) + "%"

                };
            },

            // =========================================================
            // ALL REGIONS SUMMARY
            // =========================================================

            _createAllRegionsSummary: function ( aRegions ) {

                    var oAll = {

                        code: "ALL",

                        regionName: "All Regions",

                        description: "Combined pricing and sales insights across all five regions",

                        totalPurchaseOrders: 0,

                        totalFinalPricing: 0,

                        averageTax: 0,

                        totalDealers: 0,

                        totalWarehouses: 0

                    };

                    var nTaxTotal = 0;

                    aRegions.forEach( function (oRegion) {

                        oAll.totalPurchaseOrders += Number( oRegion.totalPurchaseOrders || 0 );

                        oAll.totalFinalPricing += Number( oRegion.totalFinalPricing || 0 );

                        oAll.totalDealers += Number( oRegion.totalDealers || 0 );

                        oAll.totalWarehouses += Number( oRegion.totalWarehouses || 0 );

                        nTaxTotal += Number( oRegion._taxSum || 0 );

                        }
                    );

                    var iTaxRecordCount = 0;

                    aRegions.forEach( function (oRegion) {

                            iTaxRecordCount += Number( oRegion._taxCount || 0 );
                        }
                    );

                    oAll.averageTax = iTaxRecordCount > 0 ? (nTaxTotal / iTaxRecordCount ) : 0;

                    // =================================================
                    // STATUS COUNTS
                    // =================================================

                    var iPOApproved = 0;
                    var iPOPending = 0;
                    var iPORejected = 0;

                    var iPricingApproved = 0;
                    var iPricingPending = 0;
                    var iPricingRejected = 0;

                    var iDealerApproved = 0;
                    var iDealerPending = 0;
                    var iDealerRejected = 0;

                    var iWarehouseApproved = 0;
                    var iWarehousePending = 0;
                    var iWarehouseRejected = 0;

                    aRegions.forEach( function (oRegion) {

                            iPOApproved += oRegion.purchaseOrdersApproved || 0;

                            iPOPending += oRegion.purchaseOrdersPending || 0;

                            iPORejected += oRegion.purchaseOrdersRejected || 0;

                            iPricingApproved += oRegion.finalPricingApproved || 0;

                            iPricingPending += oRegion.finalPricingPending || 0;

                            iPricingRejected += oRegion.finalPricingRejected || 0;

                            iDealerApproved += oRegion.dealersApproved || 0;

                            iDealerPending += oRegion.dealersPending || 0;

                            iDealerRejected += oRegion.dealersRejected || 0;

                            iWarehouseApproved += oRegion.warehousesApproved || 0;

                            iWarehousePending += oRegion.warehousesPending || 0;

                            iWarehouseRejected += oRegion.warehousesRejected || 0;
                        });

                    // =================================================
                    // APPLY PROGRESS
                    // =================================================

                    var oPOProgress = this._calculateProgress( iPOApproved, iPOPending, iPORejected );  //4

                    oAll.purchaseOrdersApprovedWidth = oPOProgress.approvedWidth;

                    oAll.purchaseOrdersPendingWidth = oPOProgress.pendingWidth;

                    oAll.purchaseOrdersRejectedWidth = oPOProgress.rejectedWidth;

                    oAll.purchaseOrdersApprovedText = oPOProgress.approvedText;

                    oAll.purchaseOrdersPendingText = oPOProgress.pendingText;

                    oAll.purchaseOrdersRejectedText = oPOProgress.rejectedText;


                    var oPricingProgress = this._calculateProgress( iPricingApproved, iPricingPending, iPricingRejected );

                    oAll.finalPricingApprovedWidth = oPricingProgress.approvedWidth;

                    oAll.finalPricingPendingWidth = oPricingProgress.pendingWidth;

                    oAll.finalPricingRejectedWidth = oPricingProgress.rejectedWidth;

                    oAll.finalPricingApprovedText = oPricingProgress.approvedText;

                    oAll.finalPricingPendingText = oPricingProgress.pendingText;

                    oAll.finalPricingRejectedText = oPricingProgress.rejectedText;


                    var oDealerProgress =  this._calculateProgress( iDealerApproved, iDealerPending, iDealerRejected );

                    oAll.dealersApprovedWidth = oDealerProgress.approvedWidth;

                    oAll.dealersPendingWidth = oDealerProgress.pendingWidth;

                    oAll.dealersRejectedWidth = oDealerProgress.rejectedWidth;

                    oAll.dealersApprovedText = oDealerProgress.approvedText;

                    oAll.dealersPendingText = oDealerProgress.pendingText;

                    oAll.dealersRejectedText = oDealerProgress.rejectedText;


                    var oWarehouseProgress = this._calculateProgress( iWarehouseApproved, iWarehousePending, iWarehouseRejected );

                    oAll.warehousesApprovedWidth = oWarehouseProgress.approvedWidth;

                    oAll.warehousesPendingWidth = oWarehouseProgress.pendingWidth;

                    oAll.warehousesRejectedWidth = oWarehouseProgress.rejectedWidth;

                    oAll.warehousesApprovedText = oWarehouseProgress.approvedText;

                    oAll.warehousesPendingText = oWarehouseProgress.pendingText;

                    oAll.warehousesRejectedText = oWarehouseProgress.rejectedText;

                    // =================================================
                    // DISPLAY VALUES
                    // =================================================

                    oAll.totalPurchaseOrdersText = this._formatNumber( oAll.totalPurchaseOrders );

                    oAll.totalFinalPricingText = this._formatCurrency( oAll.totalFinalPricing );

                    oAll.averageTaxText = this._formatCurrency( oAll.averageTax );

                    oAll.totalDealersText = this._formatNumber( oAll.totalDealers );

                    oAll.totalWarehousesText = this._formatNumber( oAll.totalWarehouses );

                    oAll.purchaseOrdersTotalText = oAll.totalPurchaseOrders + " Orders";

                    oAll.finalPricingTotalText = this._formatCurrency( oAll.totalFinalPricing );

                    oAll.dealersTotalText = oAll.totalDealers + " Dealers";

                    oAll.warehousesTotalText = oAll.totalWarehouses + " Warehouses";

                    return oAll;
                },

            // =========================================================
            // REGION CLICK
            // =========================================================

            onRegionClick: function ( oEvent ) {

                var sRegionCode = oEvent.getParameter( "code" );

                if (!sRegionCode) { return; }

                console.log( "Selected region:", sRegionCode );

                var oModel = this.getView().getModel( "regionModel" );

                var aRegions = oModel.getProperty( "/regionProperties" );

                var oSelectedRegion = aRegions.find( function (oRegion) {

                        return ( oRegion.code === sRegionCode );
                    });
console.log("Selected Region" + oSelectedRegion);

                if (!oSelectedRegion) {

                    console.warn( "Region not found:", sRegionCode );
                    return;
                }

                // aRegions.forEach( function (oRegion) {

                //         oRegion.selected = oRegion.code === sRegionCode;
                //     }
                // );

                // oModel.setProperty( "/regionProperties", aRegions );

                // oModel.setProperty( "/selectedRegion", oSelectedRegion );

                oModel.setProperty( "/selectedRegion", Object.assign({}, oSelectedRegion) );

                console.log( "Regional metrics:", oSelectedRegion);
            },

            // =========================================================
            // REGION CODE FROM REGION OBJECT
            // =========================================================

            _getRegionCodeFromRegionObject: function ( oRegion ) {

                    if (!oRegion) {
                        return null;
                    }

                    var sValue = oRegion.regionCode || oRegion.code || oRegion.regionName || oRegion.name || "";

                    sValue = String(sValue).trim().toUpperCase();

                    if ( sValue === "REG-N" || sValue.indexOf("REG-N") !== -1 ) { return "NORTH"; }

                    if ( sValue === "REG-E" || sValue.indexOf("REG-E") !== -1 ) { return "EAST"; }

                    if ( sValue === "REG-W" || sValue.indexOf("REG-W") !== -1 ) { return "WEST"; }

                    if ( sValue === "REG-C" || sValue.indexOf("REG-C") !== -1 ) { return "CENTRAL"; }

                    if ( sValue === "REG-S" || sValue.indexOf("REG-S") !== -1 ) { return "SOUTH"; }

                    return null;
                },

            // =========================================================
            // REGION CODE FROM WAREHOUSE STATE
            // =========================================================

            _getRegionCodeFromState: function ( sState ) {

                    sState = String( sState || "" ).trim().toUpperCase();

                    if (!sState) { return null; }

                    var aNorthStates = [
                        "JAMMU",
                        "JAMMU AND KASHMIR",
                        "JAMMU & KASHMIR",
                        "KASHMIR",
                        "LADAKH",
                        "HIMACHAL",
                        "HIMACHAL PRADESH",
                        "PUNJAB",
                        "HARYANA",
                        "UTTARAKHAND",
                        "CHANDIGARH",
                        "DELHI",
                        "NCT OF DELHI"
                    ];

                    var aEastStates = [
                        "BIHAR",
                        "JHARKHAND",
                        "ODISHA",
                        "ORISSA",
                        "WEST BENGAL",
                        "SIKKIM",
                        "ARUNACHAL PRADESH",
                        "ASSAM",
                        "MANIPUR",
                        "MEGHALAYA",
                        "MIZORAM",
                        "NAGALAND",
                        "TRIPURA",
                        "ANDAMAN AND NICOBAR ISLANDS",
                        "ANDAMAN & NICOBAR ISLANDS"
                    ];

                    var aWestStates = [
                        "RAJASTHAN",
                        "GUJARAT",
                        "MAHARASHTRA",
                        "GOA",
                        "DADRA AND NAGAR HAVELI",
                        "DAMAN AND DIU",
                        "DADRA & NAGAR HAVELI AND DAMAN & DIU"
                    ];

                    var aCentralStates = [
                        "MADHYA PRADESH",
                        "CHHATTISGARH",
                        "UTTAR PRADESH"
                    ];

                    var aSouthStates = [
                        "ANDHRA PRADESH",
                        "TELANGANA",
                        "KARNATAKA",
                        "TAMIL NADU",
                        "KERALA",
                        "PUDUCHERRY",
                        "PONDICHERRY",
                        "LAKSHADWEEP"
                    ];

                    if ( aNorthStates.indexOf(sState) !== -1 ) { return "NORTH"; }

                    if ( aEastStates.indexOf(sState) !== -1 ) { return "EAST"; }

                    if ( aWestStates.indexOf(sState) !== -1 ) { return "WEST"; }

                    if ( aCentralStates.indexOf(sState) !== -1 ) { return "CENTRAL"; }

                    if ( aSouthStates.indexOf(sState) !== -1 ) { return "SOUTH"; }

                    return null;
                },

            // =========================================================
            // STATUS BUCKET
            // =========================================================

            _getStatusBucket: function ( sStatus, sEntity, oRecord ) {

                    var sValue = String( sStatus || "" ).trim().toUpperCase();

                    // =================================================
                    // PURCHASE ORDERS
                    // =================================================

                    if ( sEntity === "PurchaseOrders" ) {

                        if ( sValue === "APPROVED" || sValue === "DELIVERED" ) { return "approved"; }

                        if ( sValue === "REJECTED" || sValue === "REJECT" ) { return "rejected"; }

                        return "pending";
                    }

                    // =================================================
                    // PRICE MASTER
                    // =================================================

                    if ( sEntity === "PriceMaster" ) {

                        if ( sValue === "ACTIVE" || sValue === "APPROVED" ) { return "approved"; }

                        if ( sValue === "REJECTED" || sValue === "INACTIVE" || sValue === "EXPIRED" ) { return "rejected";  }

                        return "pending";
                    }

                    // =================================================
                    // DEALERS
                    // =================================================

                    if ( sEntity === "Dealers" ) {

                        if ( sValue === "APPROVED" || sValue === "ACTIVE" ) { return "approved"; }

                        if ( sValue === "REJECTED" || sValue === "INACTIVE" || sValue === "BLOCKED" ) { return "rejected"; }

                        return "pending";
                    }

                    // =================================================
                    // WAREHOUSES
                    // =================================================

                    if ( sEntity === "Warehouses" ) {

                        if ( sValue === "APPROVED" || sValue === "ACTIVE" ) { return "approved"; }

                        if ( sValue === "PENDING" ) { return "pending"; }

                        if ( sValue === "REJECTED" || sValue === "INACTIVE" ) { return "rejected"; }

                        // Current warehouse page has active boolean.
                        if ( oRecord && oRecord.active === true ) { return "approved"; }

                        return "rejected";
                    }

                    return "pending";
                },

            // =========================================================
            // NUMBER FORMATTER
            // =========================================================

            _formatNumber: function ( iValue ) {

                    return new Intl.NumberFormat( "en-IN",
                        {
                            maximumFractionDigits: 0
                        }).format( Number(iValue || 0) );
                },

            // =========================================================
            // CURRENCY FORMATTER
            // =========================================================

            _formatCurrency: function ( iValue ) {

                return new Intl.NumberFormat( "en-IN",
                    {
                        style: "currency",
                        currency: "INR",
                        maximumFractionDigits: 0
                    }).format(
                    Number(iValue || 0)
                );

            },

            _loadDashboard: async function () {

                try {

                    var oPurchaseModel = this.getOwnerComponent().getModel("purchase");

                    var oBinding = oPurchaseModel.bindList("/PurchaseOrders");

                    var aContexts = await oBinding.requestContexts( 0, 1000 );

                    var aPurchaseOrders = aContexts.map(function ( oContext ) {

                            return oContext.getObject();
                        });

                    var iTotal = aPurchaseOrders.length;

                    var iPending = aPurchaseOrders.filter( function (oPO) {

                            return ( oPO.status === "PENDING" || oPO.status === "SUBMITTED" );
                        }).length;

                    var iApproved = aPurchaseOrders.filter( function (oPO) {

                                return ( oPO.status === "APPROVED" || oPO.status === "DELIVERED");
                            }).length;

                    var iRejected = aPurchaseOrders.filter( function (oPO) {

                                return oPO.status === "REJECTED" || oPO.status === "REJECT";
                            }).length;

                    var iDelivered = aPurchaseOrders.filter( function (oPO) {

                                return oPO.status === "DELIVERED";
                            }).length;

                    var nTotalValue = aPurchaseOrders.reduce( function ( nTotal, oPO ) {

                            return nTotal + Number( oPO.totalAmount || 0 );
                        }, 0
                    );
console.log(aPurchaseOrders, nTotalValue);

                    this.getView().getModel("dashboard").setData({

                            totalPOs: iTotal,

                            pendingPOs: iPending,

                            approvedPOs: iApproved,

                            rejectedPOs: iRejected,

                            deliveredPOs: iDelivered,

                            totalValue: Math.round(nTotalValue / 100000)
                        });

                } catch (oError) {

                    console.error( "Dashboard loading failed:", oError );
                    MessageBox.error( "Unable to load dashboard data." );
                }
            },

            onPurchaseOrders: function () {

                this.getOwnerComponent().getRouter().navTo("PurchaseOrders");
            },

            onCreatePO: function () {

                this.getOwnerComponent().getRouter().navTo("CreatePurchaseOrder");
            },

            onProducts: function () {

                this.getOwnerComponent().getRouter().navTo("Products");
            },

            onStock: function () {

                this.getOwnerComponent().getRouter().navTo("Stock");
            },

            // onPOPress: function (oEvent) {

            //     var oContext = oEvent.getSource().getBindingContext("purchase");

            //     if (!oContext) { return; }

            //     var oPO = oContext.getObject();

            //     this.getOwnerComponent().getRouter().navTo( "PODetail", { ID: encodeURIComponent( oPO.ID )
            //     });
            // },

        onPriceMaster: function () {
 
            MessageToast.show("Navigating to Pricing Master Dashboard");
            // this.getOwnerComponent().getRouter().navTo("PriceMaster");
 
            this._navigateToWorkZoneApp( "Pricing", "display" );
        },
 
        onDealerOnboarding: function () {
 
            MessageToast.show("Navigating to Dealer Onboarding Dashboard");
 
            this._navigateToWorkZoneApp( "dealer", "display" );
        },
 
        _navigateToWorkZoneApp: function ( sSemanticObject, sAction ) {
       
            // Cross-app navigation requires the Work Zone / FLP shell
            if ( !sap.ushell || !sap.ushell.Container ) {
 
                MessageBox.error( "Please launch the application through SAP Build Work Zone." );
                return;
            }
 
            sap.ushell.Container.getServiceAsync("CrossApplicationNavigation").then(function (oCrossAppNav) {
 
                oCrossAppNav.toExternal({
                    target: {
                        semanticObject: sSemanticObject,
                        action: sAction
                    }
                });
 
            })
            .catch(function (oError) {
 
                console.error( "Cross-application navigation failed:", oError );
 
                MessageBox.error( "Unable to open the requested application. " +
                    "Check the Work Zone target mapping and user permissions."  );
            });
        }
    });
});