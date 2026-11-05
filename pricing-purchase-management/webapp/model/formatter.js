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

                case "BLOCKED":
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
			var fValue = parseFloat(vValue);
			if (isNaN(fValue)) {
				fValue = 0;
			}
			var oFormat = sap.ui.core.format.NumberFormat.getFloatInstance({
				minFractionDigits: 2,
				maxFractionDigits: 2,
				groupingEnabled: true
			});
			return oFormat.format(fValue);
		},

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