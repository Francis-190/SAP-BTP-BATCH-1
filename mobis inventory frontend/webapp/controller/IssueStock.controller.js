sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (
    Controller,
    JSONModel,
    MessageToast,
    MessageBox
) {
    "use strict";

    return Controller.extend("inventorytest.controller.IssueStock", {

        onInit: function () {

            this.getView().setModel(
                this.getOwnerComponent().getModel()
            );

            this.getView().setModel(
                new JSONModel({
                    items: []
                }),
                "issueParts"
            );

            // Current page of the issues table
            this.getView().setModel(
                new JSONModel({
                    items: []
                }),
                "issues"
            );

            // Pagination state + filter dropdown options
            this.getView().setModel(
                new JSONModel({
                    page: 1,
                    pageSize: 10,
                    total: 0,
                    totalPages: 1,
                    pages: [],
                    scOptions: [{ key: "", text: "All Service Centers" }]
                }),
                "ui"
            );

            this._aSpareParts = [];
            this._aInventory = [];
            this._aAllIssues = [];   // every issue, loaded once
            this._aFiltered = [];    // after filter bar is applied

            this._pSpareParts = this._loadSpareParts();
            this._pInventory = this._loadInventory();

            this._loadAllIssues();
        },


        /* =========================================================
         * ALL STOCK ISSUES  (load -> filter -> paginate)
         * ======================================================= */

        _loadAllIssues: async function () {

            let oBinding;

            try {

                const oModel = this.getView().getModel();

                oBinding = oModel.bindList(
                    "/ServicePartIssues",
                    null,
                    null,
                    null,
                    {
                        "$expand": "serviceCenter,part,warehouse",
                        "$orderby": "issueDate desc"
                    }
                );

                const aContexts = await oBinding.requestContexts(0, 10000);

                this._aAllIssues = aContexts.map(function (oContext) {

                    const oData = oContext.getObject();

                    const oCenter = oData.serviceCenter || {};
                    const oPart = oData.part || {};
                    const oWarehouse = oData.warehouse || {};

                    return {
                        serviceCenterID: oData.serviceCenter_ID || oCenter.ID || "",
                        serviceCenter: oCenter.name || "",
                        serviceCenterCode: oCenter.serviceCenterCode || "",
                        partNumber: oPart.partNumber || "",
                        description: oPart.description || "",
                        warehouseID: oData.warehouse_ID || oWarehouse.ID || "",
                        warehouse: oWarehouse.name || "",
                        quantity: oData.issuedQuantity || 0,
                        reference: oData.remarks || "",
                        status: oData.status || "",
                        rawDate: oData.issueDate ? new Date(oData.issueDate).getTime() : 0,
                        dateTime: this._formatDateTime(oData.issueDate)
                    };

                }, this);

                this._rebuildFilterOptions();
                this._applyFilters(false);

            } catch (oError) {

                console.error("Error loading stock issues:", oError);

            } finally {

                if (oBinding) {
                    oBinding.destroy();
                }
            }
        },


        // Build the Service Center dropdown from the data that is actually loaded
        _rebuildFilterOptions: function () {

            const oUi = this.getView().getModel("ui");

            // remember current selection (re-setting items can reset it)
            const sSC = this.byId("filterServiceCenter").getSelectedKey();

            const mSC = {};

            this._aAllIssues.forEach(function (o) {

                if (o.serviceCenterID) {
                    mSC[o.serviceCenterID] =
                        o.serviceCenter + (o.serviceCenterCode ? " (" + o.serviceCenterCode + ")" : "");
                }
            });

            const aOptions = [{ key: "", text: "All Service Centers" }].concat(
                Object.keys(mSC)
                    .map(function (k) { return { key: k, text: mSC[k] }; })
                    .sort(function (a, b) { return a.text.localeCompare(b.text); })
            );

            oUi.setProperty("/scOptions", aOptions);

            this.byId("filterServiceCenter").setSelectedKey(sSC);
        },


        _applyFilters: function (bResetPage) {

            const oUi = this.getView().getModel("ui");

            const sSC = this.byId("filterServiceCenter").getSelectedKey();

            this._aFiltered = this._aAllIssues.filter(function (o) {

                return !sSC || String(o.serviceCenterID) === String(sSC);
            });

            if (bResetPage !== false) {
                oUi.setProperty("/page", 1);
            }

            this._renderPage();
        },


        _renderPage: function () {

            const oUi = this.getView().getModel("ui");

            const iTotal = this._aFiltered.length;
            const iPageSize = oUi.getProperty("/pageSize");
            const iTotalPages = Math.max(1, Math.ceil(iTotal / iPageSize));

            let iPage = oUi.getProperty("/page");
            iPage = Math.min(Math.max(1, iPage), iTotalPages);

            const iStart = (iPage - 1) * iPageSize;
            const aPage = this._aFiltered.slice(iStart, iStart + iPageSize);

            this.getView()
                .getModel("issues")
                .setProperty("/items", aPage);

            oUi.setProperty("/page", iPage);
            oUi.setProperty("/total", iTotal);
            oUi.setProperty("/totalPages", iTotalPages);
            oUi.setProperty("/pages", this._buildPages(iPage, iTotalPages));
        },


        /* ---------- filter bar handlers ---------- */

        onFilterChange: function () {

            this._applyFilters(true);
        },


        onRefreshIssues: function () {

            this._loadAllIssues();
        },


        /* ---------- pagination handlers ---------- */

        // Numbered pager:  ‹ 1 … 4 [5] 6 … 20 ›
        _buildPages: function (iPage, iTotal) {

            const aBtn = [];

            aBtn.push({
                label: "‹", page: iPage - 1, type: "Transparent",
                enabled: iPage > 1, tooltip: "Previous page"
            });

            let iPrev = 0;

            for (let p = 1; p <= iTotal; p++) {

                if (!(p === 1 || p === iTotal || Math.abs(p - iPage) <= 1)) {
                    continue;
                }

                if (p - iPrev === 2) {
                    // a single skipped page: show it instead of an ellipsis
                    aBtn.push({
                        label: String(iPrev + 1), page: iPrev + 1, type: "Transparent",
                        enabled: true, tooltip: "Page " + (iPrev + 1)
                    });
                } else if (p - iPrev > 2) {
                    aBtn.push({
                        label: "…", page: 0, type: "Transparent",
                        enabled: false, tooltip: ""
                    });
                }

                aBtn.push({
                    label: String(p), page: p,
                    type: p === iPage ? "Emphasized" : "Transparent",
                    enabled: true, tooltip: "Page " + p
                });

                iPrev = p;
            }

            aBtn.push({
                label: "›", page: iPage + 1, type: "Transparent",
                enabled: iPage < iTotal, tooltip: "Next page"
            });

            return aBtn;
        },


        onPageButtonPress: function (oEvent) {

            const oItem = oEvent.getSource().getBindingContext("ui").getObject();

            if (!oItem.page) {
                return;
            }

            this.getView().getModel("ui").setProperty("/page", oItem.page);
            this._renderPage();
        },


        _formatDateTime: function (sDate) {

            if (!sDate) {
                return "";
            }

            try {

                return new Intl.DateTimeFormat(
                    undefined,
                    {
                        year: "numeric",
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                ).format(new Date(sDate));

            } catch (e) {

                return sDate;
            }
        },


        /* =========================================================
         * FORM: parts / inventory / issue stock
         * ======================================================= */

        _loadSpareParts: async function () {

            try {

                const oModel = this.getView().getModel();

                const oBinding = oModel.bindList("/SpareParts");

                const aContexts = await oBinding.requestContexts(
                    0,
                    10000
                );

                this._aSpareParts = aContexts.map(function (oContext) {
                    return oContext.getObject();
                });

            } catch (oError) {

                console.error(
                    "Error loading spare parts:",
                    oError
                );
            }
        },


        _loadInventory: async function () {

            try {

                const oModel = this.getView().getModel();

                const oBinding = oModel.bindList("/Inventory");

                const aContexts = await oBinding.requestContexts(
                    0,
                    10000
                );

                this._aInventory = aContexts.map(function (oContext) {
                    return oContext.getObject();
                });

            } catch (oError) {

                console.error(
                    "Error loading inventory:",
                    oError
                );
            }
        },


        onLocationChange: async function (oEvent) {

            const sLocationID = oEvent.getSource().getSelectedKey();

            const oIssuePartsModel = this.getView().getModel("issueParts");

            if (!sLocationID) {

                oIssuePartsModel.setProperty("/items", []);

                this.byId("issuePartSelect").setSelectedKey("");

                return;
            }

            await Promise.all([
                this._pSpareParts,
                this._pInventory
            ]);

            const aInventoryForLocation = this._aInventory.filter(
                function (oInventory) {
                    return String(oInventory.location_ID) === String(sLocationID);
                }
            );

            const aPartIDs = aInventoryForLocation.map(
                function (oInventory) {
                    return String(oInventory.part_ID);
                }
            );

            const aFilteredParts = this._aSpareParts.filter(
                function (oPart) {
                    return aPartIDs.includes(String(oPart.ID));
                }
            );

            oIssuePartsModel.setProperty("/items", aFilteredParts);

            this.byId("issuePartSelect").setSelectedKey("");
        },


        onIssueStock: async function () {

            const oModel = this.getView().getModel();

            const partID = this.byId("issuePartSelect").getSelectedKey();

            const locationID = this.byId("issueLocSelect").getSelectedKey();

            const quantity = Number(
                this.byId("issueQtyInput").getValue()
            );

            const reference = this.byId("issueRefInput").getValue().trim();

            const serviceCenterID = this.byId(
                "issueServiceCenterSelect"
            ).getSelectedKey();

            if (!locationID) {
                MessageBox.error("Please select a From Warehouse.");
                return;
            }

            if (!partID) {
                MessageBox.error("Please select a Spare Part.");
                return;
            }

            if (!(quantity > 0)) {
                MessageBox.error("Please enter a valid quantity.");
                return;
            }

            if (!serviceCenterID) {
                MessageBox.error("Please select a Service Center.");
                return;
            }

            try {

                const oAction = oModel.bindContext("/issueStock(...)");

                oAction.setParameter("partID", partID);
                oAction.setParameter("locationID", locationID);
                oAction.setParameter("quantity", quantity);
                oAction.setParameter("reference", reference);
                oAction.setParameter("serviceCenterID", serviceCenterID);

                await oAction.execute();

                MessageToast.show("Stock issued successfully.");

                this.byId("issueLocSelect").setSelectedKey("");
                this.byId("issuePartSelect").setSelectedKey("");
                this.byId("issueQtyInput").setValue("");
                this.byId("issueRefInput").setValue("");
                this.byId("issueServiceCenterSelect").setSelectedKey("");

                this.getView()
                    .getModel("issueParts")
                    .setProperty("/items", []);

                await this._loadInventory();
                await this._loadAllIssues();

            } catch (oError) {

                console.error("Issue Stock error:", oError);

                MessageBox.error(
                    (oError && oError.message) ||
                    "Failed to issue stock."
                );
            }
        },


        onGoToServiceCenter: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo("serviceCenter");
        },


        onNavBack: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo("dashboard");
        }

    });
});