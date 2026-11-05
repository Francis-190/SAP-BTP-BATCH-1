sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Sorter",
    "sap/m/MessageBox"
], function (Controller, JSONModel, Sorter, MessageBox) {
    "use strict";

    // Status text -> ObjectStatus state. Unknown statuses fall back to "None".
    const oStatusStates = {
        DRAFT: "Information",
        SUBMITTED: "Warning",
        PENDING: "Warning",
        APPROVED: "Success",
        REJECTED: "Error"
    };

    return Controller.extend("inventorytest.controller.PurchaseRequisitions", {

        onInit: function () {

            this._sStatusFilter = "";

            this.getView().setModel(
                new JSONModel({
                    busy: false,
                    allItems: [],
                    items: [],
                    statusOptions: []
                }),
                "prList"
            );

            // Reload every time the page is opened so a PR raised
            // from the Low Stock list is visible immediately.
            this.getOwnerComponent()
                .getRouter()
                .getRoute("purchaseRequisitions")
                .attachPatternMatched(this._onRouteMatched, this);
        },


        _onRouteMatched: function () {
            this._loadRequisitions();
        },


        onRefresh: function () {
            this._loadRequisitions();
        },


        _loadRequisitions: async function () {

            const oViewModel = this.getView().getModel("prList");
            const oModel = this.getOwnerComponent().getModel();

            oViewModel.setProperty("/busy", true);

            try {

                // Part and location come back as IDs only, so read the
                // lookups once and map ID -> readable name.
                const [aPRs, aParts, aLocations] = await Promise.all([
                    oModel
                        .bindList(
                            "/PurchaseRequisitions",
                            null,
                            [new Sorter("createdAt", true)],
                            [],
                            { $expand: "items" }
                        )
                        .requestContexts(0, 1000),

                    oModel.bindList("/SpareParts").requestContexts(0, 10000),

                    oModel.bindList("/Locations").requestContexts(0, 10000)
                ]);

                const oParts = {};
                aParts.forEach(function (oCtx) {
                    const o = oCtx.getObject();
                    oParts[o.ID] = o;
                });

                const oLocations = {};
                aLocations.forEach(function (oCtx) {
                    const o = oCtx.getObject();
                    oLocations[o.ID] = o;
                });

                // One table line per PR item.
                const aRows = [];

                aPRs.forEach(function (oCtx) {

                    const oPR = oCtx.getObject();
                    const sStatus = oPR.status || "";
                    const aItems = oPR.items && oPR.items.length
                        ? oPR.items
                        : [{}];

                    const oLoc = oLocations[oPR.location_ID];

                    aItems.forEach(function (oItem) {

                        const oPart = oParts[oItem.part_ID];

                        aRows.push({
                            prNumber: oPR.prNumber,
                            status: sStatus,
                            statusState: oStatusStates[sStatus.toUpperCase()] || "None",
                            requestedBy: oPR.requestedBy || "",
                            createdAt: oPR.createdAt ? new Date(oPR.createdAt) : null,
                            locationName: oLoc ? oLoc.name : (oPR.location_ID || ""),
                            partNumber: oPart ? oPart.partNumber : (oItem.part_ID || ""),
                            description: oPart ? (oPart.description || "") : "",
                            requiredQty: oItem.requiredQty
                        });
                    });
                });

                const aStatuses = [
                    ...new Set(aRows.map(function (r) { return r.status; }).filter(Boolean))
                ].sort();

                oViewModel.setProperty("/allItems", aRows);
                oViewModel.setProperty(
                    "/statusOptions",
                    aStatuses.map(function (s) { return { key: s, text: s }; })
                );

                // Keep the dropdown in sync with the retained filter.
                if (this._sStatusFilter && aStatuses.indexOf(this._sStatusFilter) === -1) {
                    this._sStatusFilter = "";
                }
                this.byId("prStatusSelect").setSelectedKey(this._sStatusFilter);

                this._applyFilter();

            } catch (oError) {

                console.error("Failed to load purchase requisitions:", oError);

                MessageBox.error(
                    (oError && oError.message) ||
                    "Failed to load purchase requisitions."
                );

            } finally {

                oViewModel.setProperty("/busy", false);
            }
        },


        onStatusChange: function (oEvent) {

            this._sStatusFilter = oEvent.getSource().getSelectedKey();
            this._applyFilter();
        },


        _applyFilter: function () {

            const oViewModel = this.getView().getModel("prList");
            const sStatus = this._sStatusFilter;
            const aAll = oViewModel.getProperty("/allItems") || [];

            oViewModel.setProperty(
                "/items",
                sStatus
                    ? aAll.filter(function (r) { return r.status === sStatus; })
                    : aAll.slice()
            );
        },


        onNavBack: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo("dashboard");
        }

    });
});
