sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/odata/v4/ODataModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], (Controller, JSONModel, Filter, FilterOperator, ODataModel, MessageBox, MessageToast) => {
    "use strict";

    const PO_STATES = {
        CREATED: "Information", SENT_TO_SUPPLIER: "Information", CONFIRMED: "Success",
        PARTIALLY_RECEIVED: "Warning", RECEIVED: "Success",
        REJECTED_BY_SUPPLIER: "Error", CLOSED: "None", CANCELLED: "Error"
    };

    return Controller.extend("procurement.controller.PRDetail", {

        onInit() {
            this._prID = null;
            this.getView().setModel(new JSONModel({ pr: {}, items: [], pos: [], poCount: "0" }), "prd");
            this.getOwnerComponent().getRouter().getRoute("PRDetail")
                .attachPatternMatched(this._onMatched, this);
        },

        formatPRState(s) {
            return ({
                DRAFT: "None", SUBMITTED: "Information", PENDING_APPROVAL: "Warning",
                APPROVED: "Success", REJECTED: "Error", CLOSED: "Indication05"
            })[s] || "None";
        },
        formatPOState(s) { return PO_STATES[s] || "None"; },

        onNavBack() {
            this.getOwnerComponent().getRouter().navTo("RouteView1");
        },

        onRefresh() {
            this._load(this._prID);
        },

        // opens the PO object page from a row of the Purchase Orders table
        onPODetails(oEvent) {
            const ctx = oEvent.getSource().getBindingContext("prd");
            if (!ctx) { return; }
            this.getOwnerComponent().getRouter().navTo("PODetail", { poID: ctx.getProperty("poID") });
        },

        _onMatched(oEvent) {
            this._prID = oEvent.getParameter("arguments").prID;
            this._load(this._prID);
        },

        // InventoryService model (parts, locations); shared with View1 through the component
        _getInventoryModel() {
            const comp = this.getOwnerComponent();
            let inv = comp.getModel("inventory");
            if (!inv) {
                inv = new ODataModel({
                    serviceUrl: "/inventory/",
                    operationMode: "Server",
                    autoExpandSelect: true
                });
                comp.setModel(inv, "inventory");
            }
            return inv;
        },

        async _load(prID) {
            if (!prID) { return; }
            const oModel = this.getOwnerComponent().getModel();
            const inv = this._getInventoryModel();
            const fmt = (s) => (s ? new Date(s).toLocaleString() : "");
            const money = (n) => (Number(n) || 0).toFixed(2);
            const nice = (s) => String(s || "").replace(/_/g, " ");

            this.getView().setBusy(true);
            try {
                const pr = await oModel.bindContext(`/PurchaseRequisitions(${prID})`, null, {
                    $expand: "items($expand=supplier)"
                }).requestObject();

                const poCtxs = await oModel.bindList("/PurchaseOrders", null, [],
                    [new Filter("pr_ID", FilterOperator.EQ, prID)],
                    { $expand: "supplier,items" }).requestContexts(0, 100);
                const poList = poCtxs.map((c) => c.getObject());

                let partById = new Map();
                let loc = {};
                try {
                    const partCtxs = await inv.bindList("/SpareParts").requestContexts(0, 2000);
                    partById = new Map(partCtxs.map((c) => { const o = c.getObject(); return [o.ID, o]; }));
                    loc = await inv.bindContext(`/Locations(${pr.location_ID})`).requestObject();
                } catch (e) {
                    MessageToast.show("Part and location names unavailable: " + e.message);
                }

                const items = (pr.items || []).map((i) => {
                    const part = partById.get(i.part_ID) || {};
                    const price = parseFloat(i.estimatedPrice) || parseFloat(part.unitPrice) || 0;
                    return {
                        partNumber: part.partNumber || i.part_ID,
                        description: part.description || "",
                        category: nice(part.category),
                        uom: part.uom || "",
                        requiredQty: i.requiredQty,
                        supplierName: i.supplier ? i.supplier.name : "Not assigned",
                        supplierCode: i.supplier ? i.supplier.supplierCode : "",
                        rating: i.supplier && i.supplier.rating != null ? String(i.supplier.rating) : "",
                        leadTime: i.supplier && i.supplier.leadTimeDays != null ? String(i.supplier.leadTimeDays) : "",
                        price: money(price),
                        lineValue: money(price * (i.requiredQty || 0))
                    };
                });

                const pos = poList
                    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
                    .map((p) => {
                        const pi = p.items || [];
                        return {
                            poID: p.ID,
                            poNumber: p.poNumber,
                            supplierName: p.supplier ? p.supplier.name : "",
                            supplierCode: p.supplier ? p.supplier.supplierCode : "",
                            status: p.status,
                            s4POId: p.s4POId || "",
                            itemCount: String(pi.length),
                            totalQty: String(pi.reduce((s, x) => s + (x.orderedQty || 0), 0)),
                            value: money(pi.reduce((s, x) => s + (x.orderedQty || 0) * (parseFloat(x.unitPrice) || 0), 0)),
                            createdAt: fmt(p.createdAt)
                        };
                    });

                this.getView().getModel("prd").setData({
                    pr: {
                        prNumber: pr.prNumber,
                        status: pr.status,
                        requestedBy: pr.requestedBy,
                        approvedBy: pr.approvedBy || "",
                        approvedAt: fmt(pr.approvedAt),
                        rejectionReason: pr.rejectionReason || "",
                        locationName: loc.name || pr.location_ID,
                        locationCode: loc.locationCode || "",
                        locationType: nice(loc.type),
                        locationCity: [loc.city, loc.region].filter(Boolean).join(" / "),
                        itemCount: String(items.length),
                        totalQty: String(items.reduce((s, x) => s + (x.requiredQty || 0), 0)),
                        totalValue: money(items.reduce((s, x) => s + parseFloat(x.lineValue), 0)),
                        createdBy: pr.createdBy,
                        createdAt: fmt(pr.createdAt),
                        modifiedBy: pr.modifiedBy,
                        modifiedAt: fmt(pr.modifiedAt)
                    },
                    items,
                    pos,
                    poCount: String(pos.length)
                });
            } catch (e) {
                MessageBox.error("Could not load the PR details: " + e.message);
            } finally {
                this.getView().setBusy(false);
            }
        }
    });
});