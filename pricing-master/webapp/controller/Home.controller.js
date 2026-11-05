sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text",
    "sap/m/VBox",
    "../model/formatter",
    "sap/ui/vbm/AnalyticMap",
    "sap/ui/vbm/Region"

], function (Controller, JSONModel, MessageToast, Dialog, Button, Text, VBox, formatter, AnalyticMap, Region) {
    "use strict";

    AnalyticMap.GeoJSONURL = sap.ui.require.toUrl( "pricingmaster/model/india_5_regions.geojson" );

    console.log( "GeoJSON File URL : " + AnalyticMap.GeoJSONURL);

    return Controller.extend("pricingmaster.controller.Home", {

        formatter: formatter,

        onInit: function () {

            var oSummaryData = {
                summary: {
                    totalCount: 0,
                    pendingCount: 0,
                    activeCount: 0,
                    rejectedCount: 0
                }
            };
            var oSummaryModel = new JSONModel(oSummaryData);
            this.getView().setModel(oSummaryModel, "dashboard");
            
            this._loadDashboardMetrics();


            var aRegions = [

                {
                    code: "NORTH",
                    regionName: "Northern Region",
                    description: "Pricing insights for the Northern region",
                    color: "rgba(41,98,255,0.60)",
                    selected: false,

                    totalBasePrice: 3035000,
                    totalDiscount: 185000,
                    taxPercentage: 18,
                    totalFinalPrice: 2850000
                },

                {
                    code: "EAST",
                    regionName: "Eastern Region",
                    description: "Pricing insights for the Eastern region",
                    color: "rgba(0,150,136,0.60)",
                    selected: false,

                    totalBasePrice: 2390000,
                    totalDiscount: 140000,
                    taxPercentage: 18,
                    totalFinalPrice: 2250000
                },

                {
                    code: "WEST",
                    regionName: "Western Region",
                    description: "Pricing insights for the Western region",
                    color: "rgba(255,152,0,0.60)",
                    selected: false,

                    totalBasePrice: 3895000,
                    totalDiscount: 245000,
                    taxPercentage: 18,
                    totalFinalPrice: 3650000
                },

                {
                    code: "CENTRAL",
                    regionName: "Central Region",
                    description: "Pricing insights for the Central region",
                    color: "rgba(123,31,162,0.60)",
                    selected: false,

                    totalBasePrice: 2075000,
                    totalDiscount: 125000,
                    taxPercentage: 18,
                    totalFinalPrice: 1950000
                },

                {
                    code: "SOUTH",
                    regionName: "Southern Region",
                    description: "Pricing insights for the Southern region",
                    color: "rgba(0,121,107,0.60)",
                    selected: false,

                    totalBasePrice: 4510000,
                    totalDiscount: 310000,
                    taxPercentage: 18,
                    totalFinalPrice: 4200000
                }

            ];

            aRegions.forEach(function (oRegion) {

                var iNetPrice = oRegion.totalBasePrice - oRegion.totalDiscount;

                oRegion.totalTax = Math.round( iNetPrice * (oRegion.taxPercentage / 100) );

                oRegion.totalBasePriceFormatted = this._formatCurrency( oRegion.totalBasePrice );

                oRegion.totalDiscountFormatted = this._formatCurrency( oRegion.totalDiscount );

                oRegion.totalTaxFormatted = this._formatCurrency( oRegion.totalTax );

                oRegion.totalFinalPriceFormatted = this._formatCurrency( oRegion.totalFinalPrice );

                oRegion.taxPercentageFormatted = oRegion.taxPercentage + "%";

                // INITIAL APPROVAL VALUES - PROGRESS BAR

                oRegion.approvedCount = 0;
                oRegion.pendingCount = 0;
                oRegion.rejectedCount = 0;
                oRegion.approvalTotal = 0;

                oRegion.approvedWidth = "0%";
                oRegion.pendingWidth = "0%";
                oRegion.rejectedWidth = "0%";

                oRegion.approvedText = "Approved 0%";
                oRegion.pendingText = "Pending 0%";
                oRegion.rejectedText = "Rejected 0%";

                oRegion.approvalTotalText =
                    "0 Pricing Records";

            }.bind(this));


            // =====================================================
            // CREATE ALL REGIONS SUMMARY
            // =====================================================

            var oAllRegions = this._createAllRegionsSummary( aRegions );


            // =====================================================
            // CREATE JSON MODEL
            // =====================================================

            var oRegionModel = new JSONModel({

                regionProperties: aRegions,
                selectedRegion: oAllRegions

            });

            this.getView().setModel( oRegionModel, "regionModel" );

            // var oMapContainer = this.byId( "idVBoxAnalyticMapContainer" );
            
            // var oMap = new AnalyticMap({ 

            //     id: this.createId("idAnalyticMapIndia"), 
            //     width: "100%", height: "500px", 
            //     centerPosition: "79.0882;22.3511", 
            //     zoomlevel: 4, 
            //     disableZoom: true, 
            //     regionClick: this.onRegionClick.bind(this) 
            // });
            
            // oMapContainer.addItem(oMap);        
            
            // this._oIndiaMap = oMap;
            
            // var aMapRegions = [ { code: "NORTH", color: "rgb(41,98,255)", tooltip: "Northern Region" }, { code: "EAST", color: "rgb(0,150,136)", tooltip: "Eastern Region" }, { code: "WEST", color: "rgb(255,152,0)", tooltip: "Western Region" }, { code: "CENTRAL", color: "rgb(123,31,162)", tooltip: "Central Region" }, { code: "SOUTH", color: "rgb(0,121,107)", tooltip: "Southern Region" } ];
            
            // this._populateMapRegions(aRegions);
            
            console.log("Region Model setted in View");
            
            // CHARTS

            this.getView().setModel( new JSONModel({

                        topRegions: [],
                        priceTrend: [],
                        discountDistribution: [],
                        averageDiscount: 0,
                        averageDiscountFormatted: "0.0%"

                    }), "chart" );

              // Load chart data from OData
            this._loadChartData();

            this._loadPriceMasterData();

        },

        _loadPriceMasterData: async function () {

            try {

                var oModel = this.getOwnerComponent().getModel();

                var oListBinding = oModel.bindList(  "/PriceMaster", null, null, null, { $expand: "region" });

                var aContexts = await oListBinding.requestContexts( 0, 1000 );

                   var aPriceMasterData = aContexts.map( function (oContext) {

                            return oContext.getObject();
                        }
                    );

                this._updateRegionApprovalData(aPriceMasterData);

            } catch (oError) {
                console.error("Error loading PriceMaster:", oError);
            }

        },


        _updateRegionApprovalData: function ( aPriceMasterData ) {

            var oCountsByRegion = {

                NORTH: { approved: 0, pending: 0, rejected: 0 },

                EAST: { approved: 0, pending: 0, rejected: 0 },

                WEST: { approved: 0, pending: 0, rejected: 0 },

                CENTRAL:{ approved: 0, pending: 0, rejected: 0 },

                SOUTH: { approved: 0, pending: 0, rejected: 0 }

            };


            // =========================================================
            // LOOP THROUGH PRICE MASTER
            // =========================================================

            aPriceMasterData.forEach( function (oRecord) {

                    var sRegionCode = this._getRegionCode( oRecord );

                    if ( !oCountsByRegion[sRegionCode] ) { return; }


                    var sStatus = String( oRecord.status || oRecord.Status || "" ).trim().toUpperCase();

                    // APPROVED / ACTIVE
                    if ( sStatus === "APPROVED" || sStatus === "ACTIVE" ) {

                        oCountsByRegion[ sRegionCode ].approved++;
                    }

                    // PENDING
                    else if ( sStatus === "PENDING"  ) {

                        oCountsByRegion[ sRegionCode ].pending++;
                    }

                    // REJECTED
                    else if ( sStatus === "REJECTED" ) {

                        oCountsByRegion[ sRegionCode  ].rejected++;
                    }

                }.bind(this)
            );

            // UPDATE EACH REGION

            var oModel = this.getView().getModel( "regionModel" );

            var aRegions = oModel.getProperty( "/regionProperties" );

            aRegions.forEach( function (oRegion) {

                    var oCount = oCountsByRegion[ oRegion.code ];

                    this._applyApprovalValues( oRegion, oCount.approved, oCount.pending, oCount.rejected );

                }.bind(this)
            );

            // UPDATE REGION LIST

            oModel.setProperty( "/regionProperties", aRegions );

            // UPDATE ALL REGION SUMMARY

            var oAllRegions = this._createAllRegionsSummary( aRegions );

            // ADD ALL REGION APPROVAL COUNTS

            var iApproved = 0;
            var iPending = 0;
            var iRejected = 0;

            aRegions.forEach( function (oRegion) {

                    iApproved += oRegion.approvedCount || 0;

                    iPending += oRegion.pendingCount || 0;

                    iRejected += oRegion.rejectedCount || 0;

                }
            );


            this._applyApprovalValues( oAllRegions, iApproved, iPending, iRejected );

            // KEEP CURRENT SELECTION

            var oCurrentSelected = oModel.getProperty( "/selectedRegion" );

            if ( oCurrentSelected && oCurrentSelected.code !== "ALL" ) {

                var oUpdatedSelectedRegion = aRegions.find( function (oRegion) {

                            return ( oRegion.code === oCurrentSelected.code );
                        }
                    );


                if (oUpdatedSelectedRegion) {

                    oModel.setProperty( "/selectedRegion", oUpdatedSelectedRegion );
                }

            } else {

                oModel.setProperty( "/selectedRegion", oAllRegions );
            }

        },

        _applyApprovalValues: function ( oRegion, iApproved, iPending, iRejected ) {

            var iTotal = iApproved + iPending + iRejected;

            var fApproved = iTotal > 0 ? (iApproved / iTotal) * 100 : 0;

            var fPending = iTotal > 0 ? (iPending / iTotal) * 100 : 0;

            var fRejected = iTotal > 0 ? (iRejected / iTotal) * 100 : 0;

            oRegion.approvedCount = iApproved;

            oRegion.pendingCount = iPending;

            oRegion.rejectedCount = iRejected;

            oRegion.approvalTotal = iTotal;

            oRegion.approvedWidth = fApproved.toFixed(2) + "%";

            oRegion.pendingWidth = fPending.toFixed(2) + "%";

            oRegion.rejectedWidth = fRejected.toFixed(2) + "%";

            oRegion.approvedText = "Approved " + fApproved.toFixed(0) + "% (" + iApproved + ")";

            oRegion.pendingText = "Pending " + fPending.toFixed(0) + "% (" + iPending + ")";

            oRegion.rejectedText = "Rejected " + fRejected.toFixed(0) + "% (" + iRejected + ")";

            oRegion.approvalTotalText = iTotal + " Pricing Records";

        },

        _getRegionCode: function (oRecord) {

            var sRegion = "";

            // EXPANDED REGION OBJECT

            if ( oRecord.region && typeof oRecord.region === "object" ) {

                sRegion = oRecord.region.regionCode || 
                          oRecord.region.code || 
                          oRecord.region.regionName ||
                          oRecord.region.name ||
                          oRecord.region.description ||
                          "";            
            }

            sRegion = String( sRegion ).trim().toUpperCase();

            // DIRECT FIVE REGION CODES

            if ( sRegion === "NORTH" || sRegion === "REG-N" ) { return "NORTH"; }

            if ( sRegion === "EAST" || sRegion === "REG-E" ) { return "EAST"; }

            if ( sRegion === "WEST" || sRegion === "REG-W" ) { return "WEST"; }

            if (sRegion === "CENTRAL" || sRegion === "REG-C" ) { return "CENTRAL"; }

            if ( sRegion === "SOUTH" || sRegion === "REG-S" ) { return "SOUTH"; }

            // REGION NAMES
            if ( sRegion.indexOf("NORTH") !== -1 ) { return "NORTH"; }

            if ( sRegion.indexOf("EAST") !== -1 ) { return "EAST"; }

            if ( sRegion.indexOf("WEST") !== -1 ) { return "WEST"; }

            if ( sRegion.indexOf("CENTRAL") !== -1 ) { return "CENTRAL"; }

            if ( sRegion.indexOf("SOUTH") !== -1 ) { return "SOUTH"; }

            console.warn( "Unable to determine region for PriceMaster record:", oRecord );

            return null;

        },

        _loadChartData: async function () {

            try {

                var oDataModel = this.getOwnerComponent().getModel();

                if (!oDataModel) {
                    console.error( "Default OData model not found" );
                    return;
                }


                /*
                    * The chart data is read from the existing
                    * PriceMaster OData entity.
                    *
                    * Region is expanded so region information
                    * can be used for grouping.
                    */

                var oBinding = oDataModel.bindList( "/PriceMaster", null, null, null, { $expand: "region" });

                var aContexts = [];
                var iStart = 0;
                var iPageSize = 200;

                // READ ALL AVAILABLE RECORDS PAGE BY PAGE

                while (true) {

                    var aPage = await oBinding.requestContexts( iStart, iPageSize );

                    if ( !aPage || aPage.length === 0 ) {
                        break;
                    }

                    aContexts = aContexts.concat(aPage);

                    if ( aPage.length < iPageSize ) {
                        break;
                    }

                    iStart += iPageSize;
                }

                var aPriceMasterData = aContexts.map(function (oContext) {

                        return oContext.getObject();
                    });

                console.log( "PriceMaster records:", aPriceMasterData.length );

                if ( aPriceMasterData.length === 0 ) {
                    console.warn( "No PriceMaster data available" );
                    return;
                }

                // CREATE CHART DATA

                var oChartData = this._buildChartData( aPriceMasterData );

                this.getView() .getModel("chart") .setData(oChartData);

                console.log( "Chart data created:", oChartData );

                // APPLY CHART PROPERTIES

                this._configureCharts();

            } catch (oError) {

                console.error( "Error loading chart data:", oError );
            }

        },

        // BUILD ALL THREE CHART DATASETS

        _buildChartData: function ( aPriceMasterData ) {

            var aNormalizedData = [];

            aPriceMasterData.forEach( function (oRecord) {

                    var oNormalized = this._normalizePriceRecord( oRecord );

                    if( oNormalized && oNormalized.region ) {
                        aNormalizedData.push( oNormalized );
                    }
                }.bind(this)
            );

            console.log( "Normalized pricing records:", aNormalizedData );

            return {

                topRegions: this._buildTopRegionsData( aNormalizedData ),

                priceTrend: this._buildPriceTrendData(  aNormalizedData ),

                discountDistribution: this._buildDiscountDistributionData( aNormalizedData ),

                averageDiscount: this._calculateAverageDiscount( aNormalizedData ),

                averageDiscountFormatted: this._formatPercentage( this._calculateAverageDiscount( aNormalizedData ) )};
        },


        // NORMALIZE ODATA RECORD

        _normalizePriceRecord: function ( oRecord ) {

            var sRegion = this._getValue( oRecord,
                    [
                        "region.name",
                        "region.regionName",
                        "region.description",
                        "regionName",
                        "RegionName",
                        "regionCode",
                        "RegionCode",
                        "region"
                    ]
                );


            var fBasePrice = this._getNumber( oRecord,
                    [
                        "basePrice",
                        "BasePrice",
                        "price",
                        "Price",
                        "originalPrice",
                        "OriginalPrice",
                        "unitPrice",
                        "UnitPrice"
                    ]
                );


            var fFinalPrice = this._getNumber( oRecord,
                    [
                        "finalPrice",
                        "FinalPrice",
                        "discountedPrice",
                        "DiscountedPrice",
                        "netPrice",
                        "NetPrice",
                        "finalAmount",
                        "FinalAmount"
                    ]
                );


            var sDate = this._getValue( oRecord,
                    [
                        "validFrom",
                        "ValidFrom",
                        "pricingDate",
                        "PricingDate",
                        "date",
                        "Date",
                        "createdAt",
                        "CreatedAt",
                        "effectiveFrom",
                        "EffectiveFrom"
                    ]
                );


            if ( !sRegion || !isFinite(fBasePrice) ) {
                return null;
            }

                /*
                * If final price is missing,
                * use base price.
                */

            if ( !isFinite(fFinalPrice) ) {
                fFinalPrice = fBasePrice;
            }

                /*
                * Protect against inconsistent
                * backend values.
                */

            fFinalPrice = Math.max( 0, fFinalPrice );

            var fDiscountAmount = Math.max( 0, fBasePrice - fFinalPrice );

            var fDiscountPercentage = fBasePrice > 0 ? (fDiscountAmount / fBasePrice) * 100 : 0;

            return {

                region:String(sRegion),

                basePrice: fBasePrice,

                finalPrice: fFinalPrice,

                discountAmount: fDiscountAmount,

                discountPercentage: fDiscountPercentage,

                date: sDate ? new Date(sDate) : null
            };
        },

        // TOP 5 REGIONS BY REVENUE

        _buildTopRegionsData: function (aData) {

                var mRegions = {};

                aData.forEach( function (oItem) {

                        if ( !mRegions[ oItem.region ] ) {

                            mRegions[ oItem.region ] = 0;
                        }

                        mRegions[ oItem.region ] += oItem.finalPrice;
                    });

                var aRegions = Object.keys( mRegions ).map(function (sRegion) {

                        return {
                            region: sRegion,
                            revenue: mRegions[ sRegion ]
                        };
                    });

                var fTotalRevenue = aRegions.reduce( function ( fTotal, oRegion ) {

                            return ( fTotal + oRegion.revenue );
                        }, 0
                    );

                aRegions.forEach( function (oRegion) {

                        oRegion.revenueShare = fTotalRevenue > 0 ? (oRegion.revenue / fTotalRevenue ) * 100 : 0;
                    }
                );


                return aRegions.sort( function (a, b) {

                            return ( b.revenue - a.revenue );
                        }).slice(0, 5);
            },

        // MONTHLY PRICE TREND

        _buildPriceTrendData: function (aData) {

            var mMonths = {};

            aData.forEach( function (oItem) {

                    if ( !oItem.date || isNaN( oItem.date.getTime()) ) {
                        return;
                    }

                    var sMonth = this._formatMonth( oItem.date );

                    var sKey = oItem.date.getFullYear() + "-" + String( oItem.date.getMonth() + 1 ).padStart(2, "0");

                    if ( !mMonths[sKey] ) {

                        mMonths[sKey] = {

                            key: sKey,
                            month: sMonth,
                            baseTotal: 0,
                            finalTotal: 0,
                            count: 0
                        };

                    }

                    mMonths[sKey].baseTotal += oItem.basePrice;

                    mMonths[sKey].finalTotal += oItem.finalPrice;

                    mMonths[sKey].count++;

                }.bind(this)
            );


            return Object.keys( mMonths ).sort().slice(-6).map( function (sKey) {

                var oMonth = mMonths[sKey];

                return {

                    month: oMonth.month,

                    averagePrice: oMonth.count > 0 ? (oMonth.baseTotal / oMonth.count) : 0,

                    discountedPrice: oMonth.count > 0 ? (oMonth.finalTotal / oMonth.count) : 0
                };
            });
        },


        // DISCOUNT DISTRIBUTION

        _buildDiscountDistributionData: function (aData) {

            var oBuckets = {

                "0-5%": 0,
                "5-10%": 0,
                "10-15%": 0,
                ">15%": 0

            };

            aData.forEach( function (oItem) {

                var fDiscount = oItem.discountPercentage;

                if ( fDiscount < 5 ) {

                    oBuckets["0-5%"]++;

                } else if ( fDiscount < 10 ) {

                    oBuckets["5-10%"]++;

                } else if ( fDiscount < 15 ) {

                    oBuckets["10-15%"]++;

                } else {

                    oBuckets[">15%"]++;
                }
            });


            var iTotal = aData.length;

            return Object.keys( oBuckets ).map( function (sBucket) {

                return {

                    bucket: sBucket,

                    count: oBuckets[sBucket],

                    share: iTotal > 0 ? (oBuckets[ sBucket ] / iTotal) * 100 : 0
                };
            });
        },

        // AVERAGE DISCOUNT

        _calculateAverageDiscount: function (aData) {

                if ( aData.length === 0 ) {
                    return 0;
                }

                var fTotal = aData.reduce( function ( fSum, oItem ) {

                            return ( fSum + oItem.discountPercentage );
                        }, 0 );

                return ( fTotal / aData.length );

            },

        // FIELD VALUE HELPER

        _getValue: function ( oObject, aPaths ) {

            for ( var i = 0; i < aPaths.length; i++ ) {

                var aParts = aPaths[i].split(".");

                var vCurrent = oObject;

                for ( var j = 0; j < aParts.length; j++ ) {

                    if ( vCurrent === null || vCurrent === undefined ) {
                        break;
                    }

                    vCurrent = vCurrent[ aParts[j] ];
                }


                if ( vCurrent !== null && vCurrent !== undefined && vCurrent !== "" ) {
                    return vCurrent;
                }

            }

            return null;
        },

        // NUMBER HELPER

        _getNumber: function (  oObject, aPaths ) {

            var vValue = this._getValue( oObject, aPaths );

            if ( vValue === null || vValue === undefined || vValue === "" ) {
                return NaN;
            }

            if ( typeof vValue === "string" ) {
                vValue = vValue.replace(/,/g, "").replace(/₹/g, "").trim();
            }

            var fNumber = Number(vValue);

            return isFinite(fNumber) ? fNumber : NaN;
        },

        // MONTH FORMAT

        _formatMonth: function ( oDate ) {

            return new Intl.DateTimeFormat( "en-IN",
                {
                    month: "short"
                }
            ).format(oDate);

        },

        // PERCENTAGE FORMAT

        _formatPercentage: function ( fValue ) {

            return ( Number(fValue).toFixed(1) + "%" );
        },

        // CHART CONFIGURATION

        _configureCharts: function () {

            var oTopRegions = this.byId( "idTopRegionsChart" );

            var oPriceTrend = this.byId( "idPriceTrendChart" );

            var oDiscount = this.byId( "idDiscountDistributionChart" );

            if (oTopRegions) {

                oTopRegions.setVizProperties({

                    title: { visible: false },

                    legend: { visible: false },

                    plotArea: {

                        dataLabel: { visible: true },

                        drawingEffect: "glossy",

                        dataPointStyleMode: "update",

                        dataPointStyle: {

                            rules: [
                                {
                                    dataContext: [
                                        {
                                            Region: [ "West", "Western Region" ]
                                        }
                                    ],

                                    properties: { color: "#FF9800" },

                                    displayName: "West"
                                },

                                {
                                    dataContext: [
                                        {
                                            Region: [ "South", "Southern Region" ]
                                        }
                                    ],

                                    properties: { color: "#009688" },

                                    displayName: "South"
                                },

                                {
                                    dataContext: [
                                        {
                                            Region: [ "North", "Northern Region" ]
                                        }
                                    ],

                                    properties: { color: "#2962FF" },

                                    displayName: "North"
                                },

                                {
                                    dataContext: [
                                        {
                                            Region: [ "East", "Eastern Region" ]
                                        }
                                    ],

                                    properties: { color: "#00A896" },

                                    displayName: "East"
                                },

                                {
                                    dataContext: [
                                        {
                                            Region: [ "Central", "Central Region" ]
                                        }
                                    ],

                                    properties: { color: "#7B1FA2" },

                                    displayName: "Central"
                                }

                            ],

                            others: {
                                properties: { color: "#94A3B8" },

                                displayName: "Other"
                            }

                        }

                    },

                    valueAxis: {

                        title: { visible: false }
                    },

                    categoryAxis: {

                        title: { visible: false }
                    }
                });
            }

            // PRICE TREND

            if (oPriceTrend) {

                oPriceTrend.setVizProperties({

                    title: { visible: false },

                    legend: {  visible: true },

                    plotArea: {

                        dataLabel: { visible: false },

                        colorPalette: [ "#2B7CDE", "#F5A623" ]
                    },

                    valueAxis: {

                        title: { visible: false },
                        label: { visible: true }
                    },

                    categoryAxis: {

                        title: { visible: false },
                        label: {  visible: true }
                    }
                });
            }

            // DISCOUNT DONUT

            if (oDiscount) {

                oDiscount.setVizProperties({

                    title: { visible: false },
                    legend: {
                        visible: true,
                        title: { visible: false }
                    },

                    plotArea: {

                        dataLabel: {

                            visible: true,
                            type: "percentage",
                            formatString: "0.0%"
                        },

                        colorPalette: [

                            "#14B8A6",  /* 0-5% */ 

                            "#1677FF",  /* 5-10% */
                            
                            "#F5A623",  /* 10-15% */
                            
                             "#EF5B6B"  /* >15% */

                        ],

                        drawingEffect: "glossy"
                    }
                });
            }
        },

        // _populateMapRegions: function (aRegions) {
        //     var oMap = this.byId("idAnalyticMapIndia");
        //     if (!oMap) { return; }

        //     oMap.destroyRegions();          // clear any stale entries first
        //     aRegions.forEach(function (oRegion) {
        //         oMap.addRegion(new Region({
        //             code: "NORTH",
        //             // color: "{regionModel>color}",
        //             tooltip: "Northern Place"
        //         }));
        //     });
        // },



         // =========================================================
        // REGION CLICK
        // =========================================================

        onRegionClick: function (oEvent) {

            var sRegionCode = oEvent.getParameter("code");

            console.log( "Selected region code:", sRegionCode );

            var oModel = this.getView().getModel( "regionModel" );

            var aRegions = oModel.getProperty( "/regionProperties" );

            var oSelectedRegion = aRegions.find(function (oRegion) {

                    return oRegion.code === sRegionCode;

                });


            if (!oSelectedRegion) {

                console.warn( "Region not found:", sRegionCode );

                return;
            }

            aRegions.forEach(function (oRegion) {

                oRegion.selected = oRegion.code === sRegionCode;

            });


            oModel.setProperty( "/regionProperties", aRegions );

            oModel.setProperty( "/selectedRegion", oSelectedRegion );

            console.log( "Selected region:", oSelectedRegion.regionName );

            console.log( "Approval counts:",
                {
                    approved: oSelectedRegion.approvedCount,

                    pending: oSelectedRegion.pendingCount,

                    rejected: oSelectedRegion.rejectedCount,

                    total: oSelectedRegion.approvalTotal
                });

        },

        _createAllRegionsSummary: function (aRegions) {

            var iTotalBasePrice = 0;
            var iTotalDiscount = 0;
            var iTotalTax = 0;
            var iTotalFinalPrice = 0;


            aRegions.forEach(function (oRegion) {

                iTotalBasePrice += oRegion.totalBasePrice;

                iTotalDiscount += oRegion.totalDiscount;

                iTotalTax += oRegion.totalTax;

                iTotalFinalPrice += oRegion.totalFinalPrice;

            });

            var iNetPrice = iTotalBasePrice - iTotalDiscount;


            var fTaxPercentage = 0;

            if (iNetPrice > 0) {

                fTaxPercentage = (iTotalTax / iNetPrice) * 100;

            }


            return {

                code: "ALL",

                regionName: "All Regions",

                description: "Combined pricing insights across all five regions",

                totalBasePrice: iTotalBasePrice,

                totalDiscount: iTotalDiscount,

                totalTax: iTotalTax,

                taxPercentage: fTaxPercentage,

                totalFinalPrice: iTotalFinalPrice,


                totalBasePriceFormatted: this._formatCurrency( iTotalBasePrice ),

                totalDiscountFormatted: this._formatCurrency( iTotalDiscount ),

                totalTaxFormatted: this._formatCurrency( iTotalTax ),

                totalFinalPriceFormatted: this._formatCurrency( iTotalFinalPrice ),

                taxPercentageFormatted: fTaxPercentage.toFixed(0) + "%",

                approvedCount: 0,

                pendingCount: 0,

                rejectedCount: 0,

                approvalTotal: 0,

                approvedWidth: "0%",

                pendingWidth: "0%",

                rejectedWidth: "0%",

                approvedText: "Approved 0%",

                pendingText: "Pending 0%",

                rejectedText: "Rejected 0%",

                approvalTotalText: "0 Pricing Records"

            };

        },

        _formatCurrency: function (iValue) {

            return new Intl.NumberFormat(
                "en-IN",
                {
                    style: "currency",
                    currency: "INR",
                    maximumFractionDigits: 0
                }
            ).format(iValue);

        },


        _loadDashboardMetrics: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oDashboardModel = this.getView().getModel("dashboard");

            if (!oModel) {
                return;
            }

            // OData V4 Fetching Pattern using List Binding and Contexts
            var oListBinding = oModel.bindList("/PriceMaster");

            oListBinding.requestContexts().then(function (aContexts) {
                var aResults = aContexts.map(function (oContext) {
                    return oContext.getObject();
                });

                var iTotal = aResults.length;
                var iPending = aResults.filter(function (r) { 
                    return r.status === "PENDING" || r.status === "DRAFT" || r.status === "SUBMITTED"; 
                }).length;
                var iActive = aResults.filter(function (r) { 
                    return r.status === "ACTIVE"; 
                }).length;
                var iRejected = aResults.filter(function (r) { 
                    return r.status === "REJECTED" || r.status === "EXPIRED"; 
                }).length;

                oDashboardModel.setProperty("/summary/totalCount", iTotal);
                oDashboardModel.setProperty("/summary/pendingCount", iPending);
                oDashboardModel.setProperty("/summary/activeCount", iActive);
                oDashboardModel.setProperty("/summary/rejectedCount", iRejected);
            }).catch(function (oError) {
                MessageToast.show("Failed to load dashboard metrics.");
            });
        },

        onRefreshDashboard: function () {
            this._loadDashboardMetrics();
            var oTable = this.byId("idTableHomePricings");
            var oBinding = oTable.getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
            MessageToast.show("Dashboard refreshed.");
        },

        onNavigateToMaster: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            if (oRouter) {
                oRouter.navTo("pricingMaster");
            } else {
                MessageToast.show("Navigating to Pricing Master...");
            }
        },

        onTileTotalPress: function () {
            this._navToPricingMaster("TOTAL");
        },

        onTilePendingPress: function () {
            this._navToPricingMaster("PENDING");
        },

        onTileActivePress: function () {
            this._navToPricingMaster("ACTIVE");
        },

        onTileRejectedPress: function () {
            this._navToPricingMaster("REJECTED");
        },

        _navToPricingMaster: function (sFilterStatus) {
            var oRouter = this.getOwnerComponent().getRouter();
            
            oRouter.navTo("pricingMaster", {
                status: sFilterStatus
            }); 
        }


    });
});