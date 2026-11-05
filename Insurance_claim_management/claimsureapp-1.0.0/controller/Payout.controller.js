sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/export/Spreadsheet",
    "sap/ui/export/library"
], function (Controller, JSONModel, MessageToast, MessageBox,Spreadsheet, exportLibrary) {
    "use strict";
    var EdmType = exportLibrary.EdmType;

    return Controller.extend("claimsure.app.controller.Payout", {

        // =========================================================
        // INIT
        // =========================================================

        onInit: function () {

            var oPayoutModel = new JSONModel({

                summary: {
                    totalCount: 0,
                    totalAmount: 0,

                    pending: 0,
                    processing: 0,
                    processed: 0,
                    failed: 0,

                    pendingAmount: 0,
                    processingAmount: 0,
                    processedAmount: 0,
                    failedAmount: 0,

                    pendingPct: 0,
                    processingPct: 0,
                    processedPct: 0,
                    failedPct: 0,

                    averageAmount: 0,
                    highestAmount: 0
                },

                health: {
                    percentage: 0,
                    percentageText: "0%",
                    state: "None",
                    text: "No Data",
                    detail: "No payout transactions available"
                },

                transactions: [],
                filteredTransactions: [],
                claimTypes: [
    {
        key: "ALL",
        text: "All"
    }
],

               filter: {
    status: "ALL",
    search: "",
    paymentMethod: "ALL",
     dateFrom: null,
    dateTo: null,
    claimType: "ALL",
    amountMin: null,
    amountMax: null
},

                selectedPayout: {
                    payoutNumber: "",
                    amount: 0,
                    status: "",
                    statusState: "None",
                    claimDisplay: "",
                    processedByDisplay: ""
                }
            });

            this.getView().setModel(oPayoutModel, "payout");

            this._claimMap = {};
            this._customerMap = {};
            this._employeeMap = {};
            this._claimTypeMap = {};

            this._loadPayouts();
        },

        formatAmountCompact: function (v) {
            return new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 0
            }).format(Number(v) || 0);
        },


        // =========================================================
        // LOAD PAYOUTS + CLAIMS + CUSTOMERS + EMPLOYEES + CLAIM TYPES
        // =========================================================

        _loadPayouts: function () {

            var oPayoutODataModel = this.getOwnerComponent().getModel("payout");
            var oInsuranceODataModel = this.getOwnerComponent().getModel();       // "" -> InsuranceService
            var oAdminODataModel = this.getOwnerComponent().getModel("admin");    // "admin" -> MainService

            if (!oPayoutODataModel) {
                MessageBox.error("Payout OData model is not available.");
                return;
            }

            if (!oInsuranceODataModel) {
                MessageBox.error("Insurance OData model is not available.");
                return;
            }

            if (!oAdminODataModel) {
                MessageBox.error("Admin OData model is not available.");
                return;
            }

            var oPayoutBinding = oPayoutODataModel.bindList("/Payouts");

            var oClaimBinding = oInsuranceODataModel.bindList("/Claims", null, null, null, {
                $select: "ID,claimNumber,customer_ID,claimType_ID"
            });

            var oCustomerBinding = oAdminODataModel.bindList("/Customers", null, null, null, {
                $select: "ID,firstName,lastName"
            });

            var oEmployeeBinding = oAdminODataModel.bindList("/Employees", null, null, null, {
                $select: "ID,firstName,lastName"
            });

            var oClaimTypeBinding = oAdminODataModel.bindList("/ClaimTypes", null, null, null, {
                $select: "ID,name,code"
            });

            Promise.all([

                oPayoutBinding.requestContexts(),

                oClaimBinding.requestContexts().catch(function (e) {
                    console.warn("Claims not available:", e);
                    return [];
                }),

                oCustomerBinding.requestContexts().catch(function (e) {
                    console.warn("Customers not available:", e);
                    return [];
                }),

                oEmployeeBinding.requestContexts().catch(function (e) {
                    console.warn("Employees not available:", e);
                    return [];
                }),

                oClaimTypeBinding.requestContexts().catch(function (e) {
                    console.warn("ClaimTypes not available (tried admin model):", e);
                    return [];
                })

            ]).then(function (aResults) {

                var aPayouts = aResults[0].map(function (c) { return c.getObject(); });
                var aClaims = aResults[1].map(function (c) { return c.getObject(); });
                var aCustomers = aResults[2].map(function (c) { return c.getObject(); });
                var aEmployees = aResults[3].map(function (c) { return c.getObject(); });
                var aClaimTypes = aResults[4].map(function (c) { return c.getObject(); });
                

                console.log("Payouts:", aPayouts.length,
                    "Claims:", aClaims.length,
                    "Customers:", aCustomers.length,
                    "Employees:", aEmployees.length,
                    "ClaimTypes:", aClaimTypes.length);

                this._claimMap = {};
                aClaims.forEach(function (oClaim) {
                    if (oClaim.ID) {
                        this._claimMap[String(oClaim.ID).trim()] = oClaim;
                    }
                }.bind(this));


                this._customerMap = {};
                aCustomers.forEach(function (oCustomer) {
                    if (oCustomer.ID) {
                        this._customerMap[String(oCustomer.ID).trim()] = oCustomer;
                    }
                }.bind(this));

                this._employeeMap = {};
                aEmployees.forEach(function (oEmployee) {
                    if (oEmployee.ID) {
                        this._employeeMap[String(oEmployee.ID).trim()] = oEmployee;
                    }
                }.bind(this));

                this._claimTypeMap = {};
                aClaimTypes.forEach(function (oClaimType) {
                    if (oClaimType.ID) {
                        this._claimTypeMap[String(oClaimType.ID).trim()] = oClaimType;
                    }
                }.bind(this));

                var aClaimTypeItems = [
    {
        key: "ALL",
        text: "All"
    }
];

aClaimTypes.forEach(function (oClaimType) {

    if (oClaimType.ID) {

        aClaimTypeItems.push({
            key: String(oClaimType.ID).trim(),
            text: oClaimType.name || oClaimType.code || "Unknown"
        });

    }

});

this.getView()
    .getModel("payout")
    .setProperty("/claimTypes", aClaimTypeItems);

                this._preparePayoutData(aPayouts);

            }.bind(this)).catch(function (oError) {
                console.error("Error loading Payouts:", oError);
                MessageBox.error("Failed to load payout data.");
            });
        },


        // =========================================================
        // PREPARE DATA
        // =========================================================

        _preparePayoutData: function (aPayouts) {

            var oViewModel = this.getView().getModel("payout");

            var oSummary = {
                totalCount: aPayouts.length,
                totalAmount: 0,

                pending: 0,
                processing: 0,
                processed: 0,
                failed: 0,

                pendingAmount: 0,
                processingAmount: 0,
                processedAmount: 0,
                failedAmount: 0,

                pendingPct: 0,
                processingPct: 0,
                processedPct: 0,
                failedPct: 0,

                averageAmount: 0,
                highestAmount: 0
            };

            aPayouts.forEach(function (oPayout) {

                var nAmount = Number(oPayout.amount || 0);
                var sStatus = oPayout.status || "Pending";

                oSummary.totalAmount += nAmount;

                if (nAmount > oSummary.highestAmount) {
                    oSummary.highestAmount = nAmount;
                }

                switch (sStatus) {

                    case "Pending":
                        oSummary.pending++;
                        oSummary.pendingAmount += nAmount;
                        break;

                    case "Processing":
                        oSummary.processing++;
                        oSummary.processingAmount += nAmount;
                        break;

                    case "Processed":
                        oSummary.processed++;
                        oSummary.processedAmount += nAmount;
                        break;

                    case "Failed":
                        oSummary.failed++;
                        oSummary.failedAmount += nAmount;
                        break;
                }
            });

            if (oSummary.totalCount > 0) {
                oSummary.averageAmount = oSummary.totalAmount / oSummary.totalCount;
            }

            // ---------------------------------------------------
            // DONUT / STATUS PERCENTAGES
            // ---------------------------------------------------

            var nTotalForPct = oSummary.totalCount || 1;

            oSummary.pendingPct = Math.round((oSummary.pending / nTotalForPct) * 100);
            oSummary.processingPct = Math.round((oSummary.processing / nTotalForPct) * 100);
            oSummary.processedPct = Math.round((oSummary.processed / nTotalForPct) * 100);
            oSummary.failedPct = Math.round((oSummary.failed / nTotalForPct) * 100);

            // ---------------------------------------------------
            // HEALTH
            // ---------------------------------------------------

            var oHealth = this._calculateHealth(oSummary);

            // ---------------------------------------------------
            // TRANSACTIONS (table rows)
            // ---------------------------------------------------

            var aTransactions =
                aPayouts.map(function (oPayout) {

                    var oTransaction = Object.assign({}, oPayout);

                    oTransaction.statusState = this.formatStatusState(oPayout.status);

                    // Customer name (Claim -> Customer)
                    oTransaction.claimDisplay = this._getClaimantName(oPayout);

                    // Employee name
                    oTransaction.processedByDisplay = this._getProcessedByDisplay(oPayout);

                    // Claim Number
                    oTransaction.claimNumberDisplay = this._getClaimNumber(oPayout);

                    // Claim Type name
                    oTransaction.claimTypeDisplay = this._getClaimTypeName(oPayout);

                    // Payment Method (falls back gracefully if field doesn't exist yet)
                    oTransaction.paymentMethodDisplay = this._getPaymentMethodDisplay(oPayout);
                    oTransaction.claimTypeId = this._getClaimTypeId(oPayout);

                    // Payout Date (falls back gracefully if no managed/createdAt field yet)
                    oTransaction.payoutDateDisplay = this._getPayoutDateDisplay(oPayout);

                    return oTransaction;

                }.bind(this));

            // ---------------------------------------------------
            // SET MODEL DATA
            // ---------------------------------------------------

            oViewModel.setProperty("/summary", oSummary);
            oViewModel.setProperty("/health", oHealth);
            oViewModel.setProperty("/transactions", aTransactions);

            this._applyFilters();
        },


        // =========================================================
        // PAYOUT -> CLAIM -> CUSTOMER NAME
        // =========================================================

        _getClaimantName: function (oPayout) {

            if (!oPayout) { return ""; }

            var sClaimId = oPayout.claim_ID || oPayout.claimId || oPayout.claim;
            if (!sClaimId) { return ""; }

            sClaimId = String(sClaimId).trim();

            var oClaim = this._claimMap[sClaimId];
            if (!oClaim) { return ""; }

            var sCustomerId = oClaim.customer_ID || oClaim.customerId || oClaim.customer;
            if (!sCustomerId) { return ""; }

            sCustomerId = String(sCustomerId).trim();

            var oCustomer = this._customerMap[sCustomerId];
            if (!oCustomer) { return ""; }

            var sFirstName = oCustomer.firstName || "";
            var sLastName = oCustomer.lastName || "";

            return (sFirstName + " " + sLastName).trim();
        },
        onRefreshPayouts: function () {
    var oView = this.getView();

    oView.setBusy(true);

    // call the same function you use to load payouts in onInit / _onRouteMatched
    Promise.resolve(this._loadPayouts())
        .then(function () {
            sap.m.MessageToast.show("Payouts refreshed");
        })
        .catch(function () {
            sap.m.MessageBox.error("Could not refresh payouts. Please try again.");
        })
        .finally(function () {
            oView.setBusy(false);
        });
},

        // =========================================================
        // PAYOUT -> CLAIM -> CLAIM NUMBER
        // =========================================================

        _getClaimNumber: function (oPayout) {

            if (!oPayout) { return ""; }

            var sClaimId = oPayout.claim_ID || oPayout.claimId || oPayout.claim;
            if (!sClaimId) { return ""; }

            sClaimId = String(sClaimId).trim();

            var oClaim = this._claimMap[sClaimId];
            if (!oClaim) { return ""; }

            return oClaim.claimNumber || "";
        },


        // =========================================================
        // PAYOUT -> CLAIM -> CLAIM TYPE NAME
        // =========================================================

        _getClaimTypeName: function (oPayout) {

            if (!oPayout) { return "—"; }

            var sClaimId = oPayout.claim_ID || oPayout.claimId || oPayout.claim;
            if (!sClaimId) { return "—"; }

            sClaimId = String(sClaimId).trim();

            var oClaim = this._claimMap[sClaimId];
            if (!oClaim) { return "—"; }

            var sClaimTypeId = oClaim.claimType_ID || oClaim.claimTypeId || oClaim.claimType;
            if (!sClaimTypeId) { return "—"; }

            sClaimTypeId = String(sClaimTypeId).trim();

            var oClaimType = this._claimTypeMap[sClaimTypeId];
            if (!oClaimType) { return "—"; }

            return oClaimType.name || oClaimType.code || "—";
        },


        // =========================================================
        // PAYOUT -> EMPLOYEE NAME
        // =========================================================

        _getProcessedByDisplay: function (oPayout) {

            if (!oPayout) { return ""; }

            var sEmployeeId = oPayout.processedBy_ID || oPayout.processedById || oPayout.processedBy;
            if (!sEmployeeId) { return ""; }

            sEmployeeId = String(sEmployeeId).trim();

            var oEmployee = this._employeeMap[sEmployeeId];
            if (!oEmployee) { return ""; }

            var sFirstName = oEmployee.firstName || "";
            var sLastName = oEmployee.lastName || "";

            return (sFirstName + " " + sLastName).trim();
        },


        // =========================================================
        // PAYMENT METHOD (graceful fallback if field not in schema yet)
        // =========================================================

        _getPaymentMethodDisplay: function (oPayout) {

            if (!oPayout || !oPayout.paymentMethod) {
                return "—";
            }

            switch (oPayout.paymentMethod) {
                case "BankTransfer": return "Bank Transfer";
                case "NEFT": return "NEFT";
                case "RTGS": return "RTGS";
                case "UPI": return "UPI";
                default: return oPayout.paymentMethod;
            }
        },
        _getClaimTypeId: function (oPayout) {

    if (!oPayout) { return ""; }

    var sClaimId = oPayout.claim_ID || oPayout.claimId || oPayout.claim;
    if (!sClaimId) { return ""; }

    sClaimId = String(sClaimId).trim();

    var oClaim = this._claimMap[sClaimId];
    if (!oClaim) { return ""; }

    var sClaimTypeId = oClaim.claimType_ID || oClaim.claimTypeId || oClaim.claimType;

    return sClaimTypeId ? String(sClaimTypeId).trim() : "";
},


        // =========================================================
        // PAYOUT DATE (graceful fallback if no managed/createdAt yet)
        // =========================================================
_getPayoutDateDisplay: function (oPayout) {

    if (!oPayout) { return "—"; }

    var sDateValue = oPayout.payoutDate;

    if (!sDateValue) { return "—"; }

    var oDate = new Date(sDateValue);

    if (isNaN(oDate.getTime())) { return "—"; }

    return oDate.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
},

        // =========================================================
        // HEALTH
        // =========================================================

        _calculateHealth: function (oSummary) {

            var nTotal = oSummary.totalCount;

            if (nTotal === 0) {
                return {
                    percentage: 0,
                    percentageText: "0%",
                    state: "None",
                    text: "No Data",
                    detail: "No payout transactions available"
                };
            }

            var nPercentage = Math.round((oSummary.processed / nTotal) * 100);

            if (nPercentage >= 90) {
                return {
                    percentage: nPercentage,
                    percentageText: nPercentage + "%",
                    state: "Success",
                    text: "Healthy",
                    detail: "Settlement processing is operating normally"
                };
            }

            if (nPercentage >= 70) {
                return {
                    percentage: nPercentage,
                    percentageText: nPercentage + "%",
                    state: "Warning",
                    text: "Needs Attention",
                    detail: "Some payouts require operational monitoring"
                };
            }

            return {
                percentage: nPercentage,
                percentageText: nPercentage + "%",
                state: "Error",
                text: "Critical",
                detail: "A significant number of payouts require attention"
            };
        },


        // =========================================================
        // FILTERS
        // =========================================================

_applyFilters: function () {

    var oModel = this.getView().getModel("payout");

    var aTransactions = oModel.getProperty("/transactions") || [];

    var sSearch = (oModel.getProperty("/filter/search") || "").toLowerCase();
    var sStatus = oModel.getProperty("/filter/status") || "ALL";
    var sPaymentMethod = oModel.getProperty("/filter/paymentMethod") || "ALL";
    var sClaimType = oModel.getProperty("/filter/claimType") || "ALL";
    var oDateFrom = oModel.getProperty("/filter/dateFrom");
    var oDateTo = oModel.getProperty("/filter/dateTo");
    var nAmountMin = oModel.getProperty("/filter/amountMin");
    var nAmountMax = oModel.getProperty("/filter/amountMax");

    var nFromTime = null;
    var nToTime = null;

    if (oDateFrom) {
        var oFromStart = new Date(oDateFrom);
        oFromStart.setHours(0, 0, 0, 0);
        nFromTime = oFromStart.getTime();
    }

    if (oDateTo) {
        var oToEnd = new Date(oDateTo);
        oToEnd.setHours(23, 59, 59, 999);
        nToTime = oToEnd.getTime();
    }

    var aFiltered = aTransactions.filter(function (oPayout) {

        var bSearchMatch =
            !sSearch ||
            String(oPayout.payoutNumber || "").toLowerCase().includes(sSearch) ||
            String(oPayout.claimNumberDisplay || "").toLowerCase().includes(sSearch) ||
            String(oPayout.claimDisplay || "").toLowerCase().includes(sSearch);

        var bStatusMatch =
            sStatus === "ALL" || oPayout.status === sStatus;

        var bPaymentMethodMatch =
            sPaymentMethod === "ALL" || oPayout.paymentMethod === sPaymentMethod;

        var bClaimTypeMatch =
            sClaimType === "ALL" || oPayout.claimTypeId === sClaimType;

        // DATE RANGE

        var bDateMatch = true;

        if (nFromTime || nToTime) {

            if (!oPayout.payoutDate) {
                bDateMatch = false;
            } else {

                var nPayoutTime = new Date(oPayout.payoutDate).getTime();

                if (isNaN(nPayoutTime)) {
                    bDateMatch = false;
                } else {

                    if (nFromTime && nPayoutTime < nFromTime) {
                        bDateMatch = false;
                    }

                    if (nToTime && nPayoutTime > nToTime) {
                        bDateMatch = false;
                    }
                }
            }
        }

        // AMOUNT RANGE

        var bAmountMatch = true;
        var nAmount = Number(oPayout.amount || 0);

        if (nAmountMin !== null && nAmountMin !== undefined && !isNaN(nAmountMin)) {
            if (nAmount < nAmountMin) {
                bAmountMatch = false;
            }
        }

        if (nAmountMax !== null && nAmountMax !== undefined && !isNaN(nAmountMax)) {
            if (nAmount > nAmountMax) {
                bAmountMatch = false;
            }
        }

        return bSearchMatch && bStatusMatch && bPaymentMethodMatch &&
               bClaimTypeMatch && bDateMatch && bAmountMatch;
    });

    oModel.setProperty("/filteredTransactions", aFiltered);
},

        onSearch: function (oEvent) {
            var sValue = oEvent.getParameter("newValue") || "";
            this.getView().getModel("payout").setProperty("/filter/search", sValue);
            this._applyFilters();
        },


        onStatusFilter: function (oEvent) {

            // Called both from the Select's change event and the "Apply Filters" button press.
            // When triggered by the button, there's no getParameter("selectedItem"), so guard it.

            if (oEvent && oEvent.getParameter) {
                var oSelectedItem = oEvent.getParameter("selectedItem");
                if (oSelectedItem) {
                    var sKey = oSelectedItem.getKey();
                    this.getView().getModel("payout").setProperty("/filter/status", sKey);
                }
            }

            this._applyFilters();
        },
        onPaymentMethodFilter: function (oEvent) {

    var sKey = "ALL";

    if (oEvent && oEvent.getParameter) {
        var oSelectedItem = oEvent.getParameter("selectedItem");
        if (oSelectedItem) {
            sKey = oSelectedItem.getKey();
        }
    }

    this.getView().getModel("payout").setProperty("/filter/paymentMethod", sKey);
    this._applyFilters();
},


onClearFilters: function () {
    var oModel = this.getView().getModel("payout");

    oModel.setProperty("/filter/status", "ALL");
    oModel.setProperty("/filter/search", "");
    oModel.setProperty("/filter/paymentMethod", "ALL");
    oModel.setProperty("/filter/dateFrom", null);
    oModel.setProperty("/filter/dateTo", null);
    oModel.setProperty("/filter/claimType", "ALL");
    oModel.setProperty("/filter/amountMin", null);
    oModel.setProperty("/filter/amountMax", null);

    var oDateRange = this.byId("payoutDateRange");
    if (oDateRange) {
        oDateRange.setValue("");
    }

    var oMinInput = this.byId("amountMinInput");
    var oMaxInput = this.byId("amountMaxInput");

    if (oMinInput) { oMinInput.setValue(""); }
    if (oMaxInput) { oMaxInput.setValue(""); }

    this._applyFilters();

    MessageToast.show("Filters cleared.");
},


        // =========================================================
        // VIEW PAYOUT
        // =========================================================

        onViewPayout: function (oEvent) {

            var oContext = oEvent.getSource().getBindingContext("payout");

            if (!oContext) {
                MessageBox.error("Unable to load payout details.");
                return;
            }

            var oPayout = oContext.getObject();
            this._openPayoutObject(oPayout);
        },


        _openPayoutObject: function (oPayout) {

            var oModel = this.getView().getModel("payout");
            var oSelectedPayout = Object.assign({}, oPayout);

            oSelectedPayout.statusState = this.formatStatusState(oPayout.status);
            oSelectedPayout.claimDisplay = this._getClaimantName(oPayout);
            oSelectedPayout.processedByDisplay = this._getProcessedByDisplay(oPayout);
            oSelectedPayout.claimNumberDisplay = this._getClaimNumber(oPayout);
            oSelectedPayout.claimTypeDisplay = this._getClaimTypeName(oPayout);
            oSelectedPayout.paymentMethodDisplay = this._getPaymentMethodDisplay(oPayout);
            oSelectedPayout.payoutDateDisplay = this._getPayoutDateDisplay(oPayout);

            oModel.setProperty("/selectedPayout", oSelectedPayout);
            this.byId("payoutDetailsDialog").open();
        },


        // =========================================================
        // REFRESH
        // =========================================================

        onRefresh: function () {
            this._loadPayouts();
            MessageToast.show("Settlement data refreshed.");
        },


        // =========================================================
        // CLOSE DETAILS
        // =========================================================

        onCloseDetails: function () {
            this.byId("payoutDetailsDialog").close();
        },


        // =========================================================
        // LIFECYCLE / STATUS SHORTCUT (kept for compatibility if
        // still referenced elsewhere in the view)
        // =========================================================

        onLifecycleStatusPress: function (oEvent) {

            var oButton = oEvent.getSource();
            var sStatus = "";

            var aCustomData = oButton.getCustomData();

            aCustomData.forEach(function (oData) {
                if (oData.getKey() === "status") {
                    sStatus = oData.getValue();
                }
            });

            if (!sStatus) {
                MessageBox.warning("Settlement status could not be determined.");
                return;
            }

            var oModel = this.getView().getModel("payout");

            oModel.setProperty("/filter/status", sStatus);
            oModel.setProperty("/filter/search", "");

            this._applyFilters();

            var oTable = this.byId("settlementTable");

            if (oTable && oTable.getDomRef()) {
                oTable.getDomRef().scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }

            MessageToast.show(sStatus + " settlements displayed.");
        },


        // =========================================================
        // FORMAT AMOUNT
        // =========================================================

        formatAmount: function (nAmount) {

            nAmount = Number(nAmount || 0);

            return "₹" + nAmount.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        },


        // =========================================================
        // FORMAT STATUS
        // =========================================================

        formatStatusState: function (sStatus) {

            switch (sStatus) {
                case "Pending": return "Warning";
                case "Processing": return "Information";
                case "Processed": return "Success";
                case "Failed": return "Error";
                default: return "None";
            }
        },

        // =========================================================
// DONUT TOOLTIP TEXT
// =========================================================

formatDonutTooltip: function () {

    var oModel = this.getView().getModel("payout");
    var oSummary = oModel.getProperty("/summary");

    if (!oSummary) {
        return "";
    }

    return "Completed: " + oSummary.processed + " (" + oSummary.processedPct + "%)\n" +
           "Pending: " + oSummary.pending + " (" + oSummary.pendingPct + "%)\n" +
           "Processing: " + oSummary.processing + " (" + oSummary.processingPct + "%)\n" +
           "Failed: " + oSummary.failed + " (" + oSummary.failedPct + "%)";
},
        // =========================================================
// EXPORT TO EXCEL
// =========================================================

onExportPayouts: function () {

    var oModel = this.getView().getModel("payout");
    var aData = oModel.getProperty("/filteredTransactions") || [];

    if (aData.length === 0) {
        MessageToast.show("No payout data available to export.");
        return;
    }

    var aColumns = [
        {
            label: "Payout No.",
            property: "payoutNumber",
            type: EdmType.String
        },
        {
            label: "Claim No.",
            property: "claimNumberDisplay",
            type: EdmType.String
        },
        {
            label: "Customer",
            property: "claimDisplay",
            type: EdmType.String
        },
        {
            label: "Claim Type",
            property: "claimTypeDisplay",
            type: EdmType.String
        },
        {
            label: "Payout Amount",
            property: "amount",
            type: EdmType.Currency,
            unitProperty: "currencyCode",
            displayUnit: false
        },
        {
            label: "Payment Method",
            property: "paymentMethodDisplay",
            type: EdmType.String
        },
        {
            label: "Status",
            property: "status",
            type: EdmType.String
        },
        {
            label: "Payout Date",
            property: "payoutDateDisplay",
            type: EdmType.String
        },
        {
            label: "Processed By",
            property: "processedByDisplay",
            type: EdmType.String
        }
    ];

    // EdmType.Currency needs a currencyCode property on each row
    var aExportData = aData.map(function (oRow) {
        return Object.assign({}, oRow, { currencyCode: "INR" });
    });

    var oSettings = {
        workbook: {
            columns: aColumns,
            hierarchyLevel: "Level"
        },
        dataSource: aExportData,
        fileName: "Payout_Register_" + new Date().toISOString().slice(0, 10) + ".xlsx"
    };

    var oSheet = new Spreadsheet(oSettings);

    oSheet.build()
        .then(function () {
            MessageToast.show("Export completed.");
        })
        .catch(function (oError) {
            console.error("Export failed:", oError);
            MessageBox.error("Failed to export payout data.");
        })
        .finally(function () {
            oSheet.destroy();
        });
},
onPayoutDateFilter: function (oEvent) {

    var oDateRangeControl = oEvent.getSource();

    var oFrom = oDateRangeControl.getDateValue();
    var oTo = oDateRangeControl.getSecondDateValue();

    var oModel = this.getView().getModel("payout");

    oModel.setProperty("/filter/dateFrom", oFrom || null);
    oModel.setProperty("/filter/dateTo", oTo || null);

    this._applyFilters();
},

onClaimTypeFilter: function (oEvent) {

    var sKey = "ALL";

    if (oEvent && oEvent.getParameter) {
        var oSelectedItem = oEvent.getParameter("selectedItem");
        if (oSelectedItem) {
            sKey = oSelectedItem.getKey();
        }
    }

    this.getView().getModel("payout").setProperty("/filter/claimType", sKey);
    this._applyFilters();
},

onAmountRangeChange: function () {

    var oModel = this.getView().getModel("payout");

    var oMinInput = this.byId("amountMinInput");
    var oMaxInput = this.byId("amountMaxInput");

    var sMin = oMinInput ? oMinInput.getValue() : "";
    var sMax = oMaxInput ? oMaxInput.getValue() : "";

    var nMin = sMin === "" ? null : Number(sMin);
    var nMax = sMax === "" ? null : Number(sMax);

    if (nMin !== null && isNaN(nMin)) { nMin = null; }
    if (nMax !== null && isNaN(nMax)) { nMax = null; }

    oModel.setProperty("/filter/amountMin", nMin);
    oModel.setProperty("/filter/amountMax", nMax);

    this._applyFilters();
},

    });
});