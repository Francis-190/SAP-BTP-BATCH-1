sap.ui.define([], function () {
    "use strict";


    function firstTruthy(aValues) {

        for (var i = 0; i < aValues.length; i++) {

            if (
                aValues[i] !== undefined &&
                aValues[i] !== null &&
                aValues[i] !== ""
            ) {
                return aValues[i];
            }
        }

        return null;
    }


    return {


        idToName: function (sId, mMap) {

            if (!sId) {
                return "\u2014";
            }


            if (!mMap || !mMap[sId]) {
                return sId;
            }


            var oValue =
                mMap[sId];


            if (typeof oValue === "string") {
                return oValue;
            }


            if (typeof oValue === "object") {

                var sFirstName =
                    oValue.firstName ||
                    oValue.FirstName ||
                    "";


                var sLastName =
                    oValue.lastName ||
                    oValue.LastName ||
                    "";


                var sFullName =
                    (
                        sFirstName +
                        " " +
                        sLastName
                    ).trim();


                if (sFullName) {
                    return sFullName;
                }


                if (oValue.name) {
                    return oValue.name;
                }


                if (oValue.fullName) {
                    return oValue.fullName;
                }


                if (oValue.displayName) {
                    return oValue.displayName;
                }


                if (oValue.employeeNumber) {
                    return oValue.employeeNumber;
                }


                if (oValue.email) {
                    return oValue.email;
                }


                return sId;
            }


            return sId;
        },

        assignAgent: function(oName,oClaim){

            console.log("testing data from claims details", oName);
            console.log("testing data from claims details", oClaim);
            
            var claimData = oClaim;

            console.log(Array[oClaim]);
             
            

        },


        currency: function (value) {

            if (
                value === undefined ||
                value === null ||
                value === ""
            ) {
                return "";
            }


            var fValue =
                Number(value);


            if (isNaN(fValue)) {
                return "";
            }


            return fValue.toFixed(2);
        },
indianCurrency: function (fAmount) {

    if (fAmount === null || fAmount === undefined || fAmount === "") {
        return "";
    }

    // Strip any thousands separators (commas) that the
    // OData Decimal type may have already applied.
    var sCleaned = String(fAmount).replace(/,/g, "");

    var fValue = parseFloat(sCleaned);

    if (isNaN(fValue)) {
        return "";
    }

    var sFormatted = new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(fValue);

    return "\u20B9 " + sFormatted;
},


        shortDate: function (value) {

            if (!value) {
                return "";
            }


            var oDate =
                value instanceof Date
                    ? value
                    : new Date(value);


            if (isNaN(oDate.getTime())) {
                return value;
            }


            return oDate.toLocaleDateString();
        },


        customerDisplay: function (oRow) {

            if (!oRow) {
                return "\u2014";
            }


            var oCustomer =
                oRow.customer ||
                oRow.Customer;


            if (
                oCustomer &&
                (
                    oCustomer.firstName ||
                    oCustomer.lastName
                )
            ) {

                return [
                    oCustomer.firstName,
                    oCustomer.lastName
                ]
                    .filter(Boolean)
                    .join(" ");
            }


            if (
                oCustomer &&
                oCustomer.name
            ) {
                return oCustomer.name;
            }


            var sFlat =
                firstTruthy([
                    oRow.customerName,
                    oRow.CustomerName
                ]);


            if (sFlat) {
                return sFlat;
            }


            var sId =
                firstTruthy([
                    oRow.customerID,
                    oRow.customer_ID,
                    oRow.CustomerID
                ]);


            return sId
                ? ("Customer " + sId)
                : "\u2014";
        },


        claimTypeDisplay: function (oRow) {

            if (!oRow) {
                return "\u2014";
            }


            var oType =
                oRow.claimType ||
                oRow.ClaimType;


            if (
                oType &&
                oType.name
            ) {
                return oType.name;
            }


            var sFlat =
                firstTruthy([
                    oRow.claimTypeName,
                    oRow.ClaimTypeName
                ]);


            if (sFlat) {
                return sFlat;
            }


            var sId =
                firstTruthy([
                    oRow.claimTypeID,
                    oRow.claimType_ID,
                    oRow.ClaimTypeID,
                    oRow.claimTypeCode
                ]);


            return sId
                ? sId
                : "\u2014";
        },


        policyDisplay: function (oRow) {

            if (!oRow) {
                return "\u2014";
            }


            var oPolicy =
                oRow.policy ||
                oRow.Policy;


            if (
                oPolicy &&
                oPolicy.policyNumber
            ) {
                return oPolicy.policyNumber;
            }


            var sFlat =
                firstTruthy([
                    oRow.policyNumber,
                    oRow.PolicyNumber
                ]);


            if (sFlat) {
                return sFlat;
            }


            var sId =
                firstTruthy([
                    oRow.policyID,
                    oRow.policy_ID,
                    oRow.PolicyID
                ]);


            return sId
                ? sId
                : "\u2014";
        },


        statusState: function (status) {

            switch (status) {

                case "Approved":
                case "Paid":
                case "Active":
                    return "Success";


                case "Rejected":
                case "Cancelled":
                    return "Error";


                case "PendingApproval":
                case "UnderReview":
                case "InvestigationRequired":
                    return "Warning";


                case "Draft":
                case "Submitted":
                default:
                    return "None";
            }
        },


        statusIcon: function (status) {

            switch (status) {

                case "Approved":
                case "Paid":
                    return "sap-icon://accept";


                case "Rejected":
                    return "sap-icon://decline";


                case "PendingApproval":
                case "UnderReview":
                    return "sap-icon://pending";


                default:
                    return "sap-icon://document";
            }
        },


        riskState: function (riskLevel) {

            switch (riskLevel) {

                case "High":
                case "Critical":
                    return "Error";


                case "Medium":
                    return "Warning";


                case "Low":
                    return "Success";


                default:
                    return "None";
            }
        },


        canSubmit: function (status) {
            return status === "Draft";
        },


        canApproveReject: function (status) {

            return (
                status === "PendingApproval" ||
                status === "UnderReview"
            );
        },


        canRenew: function (status) {

            return (
                status === "Active" ||
                status === "Expired"
            );
        },


        canCancel: function (status) {
            return status === "Active";
        },


        approvalButtonVisible: function (sStatus) {
            return sStatus === "Submitted";
        }

    };
});
