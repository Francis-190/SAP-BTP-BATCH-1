sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, Filter, FilterOperator, JSONModel, MessageBox, MessageToast) {
    "use strict";

    // Every logical action and the values it can have in the database:
    //  - the short names used by the existing seed data (SUBMIT, L1_APPROVE, ...)
    //  - the longer names written by the service handlers (SUBMITTED, L1_APPROVED, ...)
    // Both are treated as the same action, so old and new rows count and filter alike.
    const ACTION_GROUPS = {
        SUBMITTED:   ["SUBMIT", "SUBMITTED"],
        L1_APPROVED: ["L1_APPROVE", "L1_APPROVED"],
        L2_APPROVED: ["ACTIVATE", "L2_APPROVED"],
        REJECTED:    ["REJECT", "REJECTED"],
        BLOCKED:     ["BLOCK", "BLOCKED"]
    };

    const ACTION_LABELS = {
        SUBMITTED: "SUBMITTED",
        L1_APPROVED: "L1 APPROVED",
        L2_APPROVED: "L2 APPROVED",
        REJECTED: "REJECTED",
        BLOCKED: "BLOCKED"
    };

    // raw DB value -> logical action key
    const RAW_TO_KEY = {};
    Object.keys(ACTION_GROUPS).forEach(function (sKey) {
        ACTION_GROUPS[sKey].forEach(function (sRaw) {
            RAW_TO_KEY[sRaw] = sKey;
        });
    });

    return Controller.extend("dealermangement.controller.ApprovalHistory", {

        onInit: function () {
            this.getView().setModel(
                new JSONModel({ total: "0", approved: "0", rejected: "0", blocked: "0" }),
                "kpi"
            );

            this.getOwnerComponent()
                .getRouter()
                .getRoute("ApprovalHistory")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._loadKpis();
        },

        /* ---------------- FILTER HELPERS ---------------- */

        // Filter matching any of the DB values for the given logical action keys
        _actionFilter: function (aKeys) {
            const aFilters = [];

            aKeys.forEach(function (sKey) {
                ACTION_GROUPS[sKey].forEach(function (sRaw) {
                    aFilters.push(new Filter("action", FilterOperator.EQ, sRaw));
                });
            });

            return new Filter({ filters: aFilters, and: false });
        },

        /* ---------------- KPI TILES ---------------- */

        // Counts come from the server ($count), so they are correct even
        // when the table only has the first 20 rows loaded.
        _getCount: async function (aFilters) {
            const oModel = this.getView().getModel();
            const oBinding = oModel.bindList(
                "/OnboardingApprovals",
                null,
                null,
                aFilters || [],
                { $count: true }
            );

            await oBinding.requestContexts(0, 1);
            const iCount = oBinding.getCount();
            oBinding.destroy();
            return iCount;
        },

        _loadKpis: async function () {
            const oKpi = this.getView().getModel("kpi");

            try {
                const aResults = await Promise.all([
                    this._getCount([]),
                    this._getCount([this._actionFilter(["L1_APPROVED", "L2_APPROVED"])]),
                    this._getCount([this._actionFilter(["REJECTED"])]),
                    this._getCount([this._actionFilter(["BLOCKED"])])
                ]);

                oKpi.setData({
                    total: String(aResults[0]),
                    approved: String(aResults[1]),
                    rejected: String(aResults[2]),
                    blocked: String(aResults[3])
                });
            } catch (oError) {
                console.error("KPI load error:", oError);
            }
        },

        /* ---------------- FILTERING ---------------- */

        onSearch: function () {
            this._applyFilters();
        },

        onActionFilterChange: function () {
            this._applyFilters();
        },

        _applyFilters: function () {
            const aFilters = [];
            const sSearch = (this.byId("approvalSearch").getValue() || "").trim();
            const sAction = this.byId("approvalActionFilter").getSelectedKey();

            if (sSearch) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("dealer/dealerName", FilterOperator.Contains, sSearch),
                        new Filter("dealer/dealerCode", FilterOperator.Contains, sSearch)
                    ],
                    and: false
                }));
            }

            if (sAction && sAction !== "ALL" && ACTION_GROUPS[sAction]) {
                aFilters.push(this._actionFilter([sAction]));
            }

            const oBinding = this.byId("approvalTable").getBinding("items");
            if (oBinding) oBinding.filter(aFilters, "Application");
        },

        onClearFilters: function () {
            this.byId("approvalSearch").setValue("");
            this.byId("approvalActionFilter").setSelectedKey("ALL");

            const oBinding = this.byId("approvalTable").getBinding("items");
            if (oBinding) oBinding.filter([], "Application");

            MessageToast.show("Filters cleared");
        },

        onRefresh: async function () {
            try {
                const oBinding = this.byId("approvalTable").getBinding("items");
                if (oBinding) await oBinding.requestRefresh();
                await this._loadKpis();
                MessageToast.show("Approval history refreshed");
            } catch (oError) {
                MessageBox.error("Unable to refresh.\n\n" + (oError.message || ""));
            }
        },

        /* ---------------- NAVIGATION ---------------- */

        // Open the dealer this action belongs to
        onRowPress: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            const sDealerId = oContext && oContext.getProperty("dealer/ID");

            if (!sDealerId) {
                MessageToast.show("Dealer not available for this entry.");
                return;
            }

            this.getOwnerComponent().getRouter().navTo("DealerDetails", {
                dealerId: String(sDealerId)
            });
        },

        /* ---------------- FORMATTERS ---------------- */

        // Shows the same readable label for old (SUBMIT) and new (SUBMITTED) values
        formatActionText: function (sAction) {
            const sKey = RAW_TO_KEY[String(sAction || "").toUpperCase()];
            return sKey ? ACTION_LABELS[sKey] : (sAction || "");
        },

        formatActionState: function (sAction) {
            const sKey = RAW_TO_KEY[String(sAction || "").toUpperCase()];

            switch (sKey) {
                case "L1_APPROVED":
                case "L2_APPROVED":
                    return "Success";
                case "SUBMITTED":
                    return "Information";
                case "REJECTED":
                case "BLOCKED":
                    return "Error";
                default:
                    return "None";
            }
        }

    });
});