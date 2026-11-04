sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/odata/v4/ODataModel",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], (Controller, JSONModel, Filter, FilterOperator, ODataModel, History, MessageBox, MessageToast) => {
    "use strict";

    const PO_STATES = {
        CREATED: "Information", SENT_TO_SUPPLIER: "Information", CONFIRMED: "Success",
        PARTIALLY_RECEIVED: "Warning", RECEIVED: "Success",
        REJECTED_BY_SUPPLIER: "Error", CLOSED: "None", CANCELLED: "Error"
    };

    return Controller.extend("procurement.controller.PODetail", {

        onInit() {
            this._poID = null;
            this.getView().setModel(new JSONModel({
                po: {}, items: [], grs: [],
                summary: { ordered: 0, received: 0, progress: 0, state: "None" },
                canSend: false
            }), "po");

            this.getOwnerComponent().getRouter()
                .getRoute("PODetail")
                .attachPatternMatched(this._onMatched, this);
        },

        // ---------------- formatter ----------------
        formatPOState(s) {
            return PO_STATES[s] || "None";
        },

        // ---------------- routing ----------------
        _onMatched(oEvent) {
            this._poID = oEvent.getParameter("arguments").poID;
            this._load();
        },

        onNavBack() {
            if (History.getInstance().getPreviousHash() !== undefined) {
                window.history.go(-1);
            } else {
                // change "RouteView1" to the name of your main route in manifest.json
                this.getOwnerComponent().getRouter().navTo("RouteView1", {}, true);
            }
        },

        onRefresh() {
            this._load();
        },

        // ---------------- data ----------------
        _getModel() {
            return this.getView().getModel() || this.getOwnerComponent().getModel();
        },

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

        async _fetch(model, path, filters) {
            const list = model.bindList(path, null, null, filters || []);
            const ctxs = await list.requestContexts(0, 2000);
            return ctxs.map((c) => c.getObject());
        },

        // part and location names come from the InventoryService
        async _loadLookups() {
            const toMap = (arr) => {
                const m = {};
                arr.forEach((x) => { m[x.ID] = x; });
                return m;
            };
            try {
                const inv = this._getInventoryModel();
                const [parts, locs] = await Promise.all([
                    this._fetch(inv, "/SpareParts"),
                    this._fetch(inv, "/Locations")
                ]);
                return { parts: toMap(parts), locations: toMap(locs) };
            } catch (e) {
                return { parts: {}, locations: {} };
            }
        },

        _dateText(s) {
            return s ? new Date(s).toLocaleString() : "";
        },

        async _load() {
            if (!this._poID) { return; }
            const page = this.byId("poPage");
            page.setBusy(true);
            try {
                const model = this._getModel();
                const id = this._poID;
                const eq = (field, value) => [new Filter(field, FilterOperator.EQ, value)];

                const [po] = await this._fetch(model, "/PurchaseOrders", eq("ID", id));
                if (!po) {
                    MessageBox.error("Purchase order not found.");
                    return;
                }

                const [items, grs, suppliers, prs, lk] = await Promise.all([
                    this._fetch(model, "/PurchaseOrderItems", eq("po_ID", id)),
                    this._fetch(model, "/GoodsReceipts", eq("po_ID", id)),
                    po.supplier_ID ? this._fetch(model, "/Suppliers", eq("ID", po.supplier_ID)) : [],
                    po.pr_ID ? this._fetch(model, "/PurchaseRequisitions", eq("ID", po.pr_ID)) : [],
                    this._loadLookups()
                ]);

                const supplier = suppliers[0];
                const pr = prs[0];

                const lineItems = items.map((it) => {
                    const part = lk.parts[it.part_ID] || {};
                    const ordered = it.orderedQty || 0;
                    const received = it.receivedQty || 0;
                    const price = Number(it.unitPrice || 0);
                    return {
                        partNumber: part.partNumber || it.part_ID,
                        description: part.description || "",
                        orderedQty: ordered,
                        receivedQty: received,
                        remainingQty: Math.max(0, ordered - received),
                        unitPrice: price.toFixed(2),
                        lineTotal: (price * ordered).toFixed(2)
                    };
                });

                const ordered = lineItems.reduce((s, i) => s + i.orderedQty, 0);
                const received = lineItems.reduce((s, i) => s + i.receivedQty, 0);
                const progress = ordered ? Math.round((received / ordered) * 100) : 0;

                const grRows = grs
                    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
                    .map((g) => {
                        const l = lk.locations[g.location_ID];
                        return {
                            grNumber: g.grNumber,
                            locationText: l ? `${l.name} (${l.locationCode})` : (g.location_ID || ""),
                            receivedBy: g.receivedBy,
                            createdAtText: this._dateText(g.createdAt)
                        };
                    });

                this.getView().getModel("po").setData({
                    po: {
                        poNumber: po.poNumber,
                        status: po.status,
                        s4POId: po.s4POId,
                        supplierName: supplier ? supplier.name : (po.supplier_ID || "Not assigned"),
                        prNumber: pr ? pr.prNumber : (po.pr_ID || "-"),
                        createdAtText: this._dateText(po.createdAt)
                    },
                    items: lineItems,
                    grs: grRows,
                    summary: {
                        ordered, received, progress,
                        state: progress === 100 ? "Success" : progress > 0 ? "Warning" : "None"
                    },
                    canSend: po.status === "CREATED"
                });
            } catch (e) {
                MessageBox.error("Unable to load purchase order: " + e.message);
            } finally {
                page.setBusy(false);
            }
        },

        // ---------------- actions ----------------
        async onSendToSupplier() {
            try {
                const action = this._getModel().bindContext("/sendPOToSupplier(...)");
                action.setParameter("poID", this._poID);
                await action.execute();
                MessageToast.show("PO sent to supplier.");
                this._load();
            } catch (e) {
                MessageBox.error(e.message);
            }
        }
    });
});