sap.ui.define([], function () {
    "use strict";
 
    return {
 
        formatDate: function (vDate) {
 
            if (!vDate) {
                return "";
            }
 
            var oDate = new Date(vDate);
 
            if (isNaN(oDate.getTime())) {
                return "";
            }
 
            return String(oDate.getDate()).padStart(2, "0") +
                "-" +
                String(oDate.getMonth() + 1).padStart(2, "0") +
                "-" +
                oDate.getFullYear();
        },
 
        statusState: function (sStatus) {
 
            switch (sStatus) {
 
                case "PENDING":
                    return "Warning";

                case "DRAFT":
                    return "Warning";
 
                case "SUBMITTED":
                    return "Information";
 
                case "ACTIVE":
                    return "Success";
 
                case "APPROVED":
                    return "Success";
                
                case "DELIVERED":
                    return "Success";
 
                case "REJECTED":
                    return "Error";

                case "EXPIRED":
                    return "Error";
 
                case "REJECT":
                    return "Error";

                case "INACTIVE":
                    return "Error";
 
                default:
                    return "None";
            }
        },
 
 
        priceState: function (sStatus) {
 
            switch (sStatus) {
 
                case "ACTIVE":
                    return "Success";
 
                case "EXPIRED":
                    return "Error";
 
                default:
                    return "None";
            }
        },
 
 
        toDateString: function (vDate) {
 
            if (!vDate) {
                return null;
            }
 
            var oDate = new Date(vDate);
 
            return oDate.getFullYear() +
                "-" +
                String(
                    oDate.getMonth() + 1
                ).padStart(2, "0") +
                "-" +
                String(
                    oDate.getDate()
                ).padStart(2, "0");
        },
        
        currency: function (vValue) {
            
            var sCleanValue = vValue ? String(vValue).replace(/,/g, '') : "0";
    
            var fValue = parseFloat(sCleanValue);

            if (isNaN(fValue)) {
                fValue = 0;
            }
            var oFormat = sap.ui.core.format.NumberFormat.getFloatInstance({
                minFractionDigits: 2,
                maxFractionDigits: 2,
                groupingEnabled: true
            }, new sap.ui.core.Locale("en-IN"));
            return "₹ " + oFormat.format(fValue);
        },
 
        /**
         * Formats a growth/percentage value with a +/- sign, e.g. 21.9 -> "+21.9 %"
         */
        percent: function (fValue) {
            if (fValue === undefined || fValue === null) {
                return "";
            }
            var sSign = fValue > 0 ? "+" : "";
            return sSign + parseFloat(fValue).toFixed(1) + " %";
        },
 
        /**
         * Maps a growth value to a ValueState / semantic color for NumericContent
         */
        growthState: function (fValue) {
            if (fValue === undefined || fValue === null) {
                return "None";
            }
            return fValue >= 0 ? "Good" : "Error";
        },
 
        /**
         * Maps a growth value to an "up"/"down" indicator for NumericContent
         */
        growthIndicator: function (fValue) {
            return (fValue || 0) >= 0 ? "Up" : "Down";
        },
 
        /**
         * Maps PriceMaster / PO style status strings to sap.m.ObjectStatus states
         */
        statusState: function (sStatus) {
            switch (sStatus) {
                case "ACTIVE":
                case "APPROVED":
                case "DELIVERED":
                    return "Success";
                case "PENDING":
                case "SUBMITTED":
                    return "Warning";
                case "REJECT":
                case "REJECTED":
                case "BLOCKED":
                    return "Error";
                default:
                    return "None";
            }
        },
 
        /**
         * "8" -> "Aug" using analyticsMonth (1-12) + analyticsYear.
         * Strips grouping separators defensively in case a composite binding
         * upstream passed a type-formatted string (e.g. "2,026") instead of
         * the raw numeric value - see useRawValues on the Month column binding.
         */
        monthLabel: function (iMonth, iYear) {
            var aMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            var m = parseInt(String(iMonth).replace(/[^0-9-]/g, ""), 10);
            var y = parseInt(String(iYear).replace(/[^0-9-]/g, ""), 10);
            if (!m) {
                return "";
            }
            return aMonths[m - 1] + " " + y;
        },
        monthlyGrowthIconClass: function (value) {
            return "monthlyKpiIcon " + (value >= 0 ? "monthlyKpiIconGreen" : "monthlyKpiIconRed");
        },
        monthlyGrowthLabel: function (value) {
            if (value === undefined || value === null) return "";
            return (value >= 0 ? "↑ " : "↓ ") + Math.abs(value).toFixed(1) + "% vs last month";
        },
        monthlyGrowthDeltaClass: function (value) {
            return "monthlyKpiDelta " + (value >= 0 ? "monthlyKpiDeltaUp" : "monthlyKpiDeltaDown");
        }
    };
});
 