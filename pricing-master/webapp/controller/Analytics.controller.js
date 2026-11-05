sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "../model/formatter"
], function (Controller, JSONModel, formatter) {
    "use strict";
 
    return Controller.extend("pricingmaster.controller.Analytics", {
 
        formatter: formatter,
 
        onInit: function () {
            this.getView().setModel(new JSONModel({ kpi: {}, byProduct: [], changesByMonth: [] }), "chart");
            
            console.log("ONINIT LOADING");
            
            // var oODataModel = this.getOwnerComponent().getModel("analytics");

            
    
            this._loadData();
        },
 
        _loadData: function () {
            var oODataModel = this.getOwnerComponent().getModel("analytics");

            console.log(oODataModel);

            var oChartModel = this.getView().getModel("chart");
 
            var oList = oODataModel.bindList("/PricingAnalytics");
console.log(oList);


            oList.requestContexts(0, 1000).then(function (aContexts) {
                var aRows = aContexts.map(function (oContext) { return oContext.getObject(); });
                
                if (!aRows.length) {
                    return;
                }
 console.log(aRows);
 
                var iCount = aRows.length;
                var fTotalBase = 0, fTotalDiscount = 0, fTotalFinal = 0;
                aRows.forEach(function (row) {

                    fTotalBase += parseFloat(row.basePrice) || 0;
                    fTotalDiscount += parseFloat(row.discount) || 0;
                    fTotalFinal += parseFloat(row.finalPrice) || 0;
                                       
                });
 
                var fAvgBase = fTotalBase / iCount;
                var fAvgDiscount = fTotalDiscount / iCount;
                var fAvgFinal = fTotalFinal / iCount;

                var fDiscountRate = fTotalBase > 0 ? (fTotalDiscount / fTotalBase) * 100 : 0;
                var fAvgDiscountRate = fAvgBase > 0 ? (fAvgDiscount / fAvgBase) * 100 : 0;
                // var fAvgFinalRate = fAvgBase > 0 ? (fAvgFinal / fAvgBase) * 100 : 0;
 
                oChartModel.setProperty("/byProduct", aRows.map(function (row) {
                    return {
                        productName:  row.productName || "Unknown Product",
                        productCode:  row.productCode,
                        basePrice: row.basePrice || 0,
                        finalPrice: row.finalPrice || 0
                    };
                }));
 
                var oChangesByMonth = {};

                aRows.forEach(function (row) {

                    if (!row.validFrom) { return; }

                    var oDate = new Date(row.validFrom);
                    var sKey = formatter.monthLabel(oDate.getMonth() + 1, oDate.getFullYear());
                    oChangesByMonth[sKey] = (oChangesByMonth[sKey] || 0) + 1;
                });
                oChartModel.setProperty("/changesByMonth", Object.keys(oChangesByMonth).map(function (key) {
                    return { month: key, changeCount: oChangesByMonth[key] };
                }));
 
                oChartModel.setProperty("/kpi", {

                    avgBasePrice: fAvgBase,
                    avgBasePriceCompareLabel: fDiscountRate.toFixed(1) + "% avg discount applied",
                    avgBasePriceCompareClass: "kpiDeltaNeutral",
 
                    avgDiscount: fAvgDiscount,
                    avgDiscountCompareLabel: fAvgDiscountRate.toFixed(1) + "% of base price",
                    avgDiscountCompareClass: fDiscountRate > 15 ? "kpiDeltaDown" : "kpiDeltaUp",
 
                    avgFinalPrice: fAvgFinal,
                    avgFinalPriceCompareLabel: "Savings " + formatter.currency(fAvgBase - fAvgFinal) + " vs base",
                    avgFinalPriceCompareClass: "kpiDeltaUp",
 
                    totalDiscountGiven: fTotalDiscount,
                    totalDiscountGivenCompareLabel: fDiscountRate.toFixed(1) + "% of total base value",
                    totalDiscountGivenCompareClass: "kpiDeltaNeutral",
 
                    priceChangeCount: iCount,
                    priceChangeCountCompareLabel: "Logged",
                    priceChangeCountCompareClass: "kpiDeltaNeutral"

                });
 
            }).catch(function (oError) {
                // eslint-disable-next-line no-console
                console.error("Failed to load PricingAnalytics", oError);
            });
        },
 
        onAfterRendering: function () {

            var oBaseChart = this.byId("basePriceChart");

            if (oBaseChart) {
                oBaseChart.setVizProperties({
                    plotArea: { colorPalette: ["#5b86e5", "#ff7e5f"] },
                    legend: { visible: true },
                    title: { visible: false }
                });

            }
 
            var oChangesChart = this.byId("priceChangesChart");
            
            if (oChangesChart) {
                oChangesChart.setVizProperties({
                    plotArea: { colorPalette: ["#8e2de2"] },
                    legend: { visible: false },
                    title: { visible: false }
                });
            }
        }
    });
});