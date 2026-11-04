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

    // backend action names (change here if your service names them differently)
    const ACTIONS = { confirm: "confirmPO", reject: "rejectPO" };

    const PO_LABELS = {
        SENT_TO_SUPPLIER: "Awaiting Response", CONFIRMED: "Confirmed",
        PARTIALLY_RECEIVED: "Partially Received", RECEIVED: "Received",
        REJECTED_BY_SUPPLIER: "Rejected", CLOSED: "Closed", CANCELLED: "Cancelled"
    };
    const PO_STATES = {
        SENT_TO_SUPPLIER: "Warning", CONFIRMED: "Success", PARTIALLY_RECEIVED: "Information",
        RECEIVED: "Success", REJECTED_BY_SUPPLIER: "Error", CLOSED: "None", CANCELLED: "Error"
    };
    const PO_COLORS = {
        SENT_TO_SUPPLIER: "#f59e0b", CONFIRMED: "#10b981", PARTIALLY_RECEIVED: "#3b82f6",
        RECEIVED: "#0891b2", REJECTED_BY_SUPPLIER: "#ef4444", CLOSED: "#94a3b8", CANCELLED: "#64748b"
    };
    const OPEN_STATUSES = ["SENT_TO_SUPPLIER", "CONFIRMED", "PARTIALLY_RECEIVED"];

    return Controller.extend("supplierdashboard.controller.View1", {

        onInit() {
            this._poID = null;

            this.getView().setModel(new JSONModel({ canRespond: false }), "ui");
            this.getView().setModel(new JSONModel({ list: [], selectedID: "", name: "" }), "sup");
            this.getView().setModel(new JSONModel({
                awaiting: 0, confirmed: 0, partial: 0, received: 0, rejected: 0, openValue: "0",
                badgeText: "", donutHtml: "",
                openPOs: [], awaitingList: [], recentGRs: []
            }), "dash");
            // lookup tables so the screens show names instead of UUIDs
            this.getView().setModel(new JSONModel({ parts: {}, prs: {} }), "lk");

            this._init();

            // every 30s pick up new POs and status changes
            this._timer = setInterval(() => { this._loadDashboard(); }, 30000);
        },

        onExit() {
            clearInterval(this._timer);
        },

        async _init() {
            await Promise.all([this._loadSuppliers(), this._loadPartLookup()]);
            const sup = this.getView().getModel("sup");
            const list = sup.getProperty("/list");
            if (!list.length) {
                MessageToast.show("No suppliers found.");
                return;
            }
            let saved = null;
            try { saved = localStorage.getItem("selectedSupplier"); } catch (e) { /* ignore */ }
            const pick = list.find((s) => s.ID === saved) || list[0];
            this._selectSupplier(pick.ID);
        },

        // ---------------- formatters ----------------
        formatPOState(s) { return PO_STATES[s] || "None"; },
        formatPOLabel(s) { return PO_LABELS[s] || s || ""; },
        formatDate(s) { return s ? new Date(s).toLocaleString() : ""; },
        formatPartNumber(id, parts) { return (parts && parts[id] && parts[id].partNumber) || id || ""; },
        formatPartDesc(id, parts) { return (parts && parts[id] && parts[id].description) || ""; },
        formatPR(id, prs) { return (prs && prs[id]) || id || ""; },
        formatLineTotal(qty, price) {
            const t = (Number(qty) || 0) * (Number(price) || 0);
            return t.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },

        // ---------------- navigation ----------------
        onNavSelect(oEvent) {
            const key = oEvent.getParameter("item").getKey();
            this.byId("pages").to(this.createId(key));
            if (key === "pgDashboard") { this._loadDashboard(); }
        },

        _navTo(key) {
            this.byId("sideNav").setSelectedKey(key);
            this.byId("pages").to(this.createId(key));
        },

        onToggleSide() {
            const tp = this.byId("toolPage");
            tp.setSideExpanded(!tp.getSideExpanded());
        },

        // bell: jump to POs that need a response
        onGoAwaiting() {
            this.byId("poStatusFilter").setSelectedKey("SENT_TO_SUPPLIER");
            this.byId("poSearch").setValue("");
            this._applyPOFilter();
            this._navTo("pgPO");
        },

        // dashboard list item: open that PO in the PO page
        onReviewPO(oEvent) {
            const ctx = oEvent.getSource().getBindingContext("dash");
            this.byId("poStatusFilter").setSelectedKey("ALL");
            this.byId("poSearch").setValue(ctx.getProperty("poNumber"));
            this._applyPOFilter();
            this._navTo("pgPO");
        },

        // ---------------- models and data ----------------
        _getModel() {
            return this.getView().getModel() || this.getOwnerComponent().getModel();
        },

        // InventoryService model for part names; optional, falls back to IDs
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

        async _fetchAll(path) {
            const list = this._getModel().bindList(path);
            const ctxs = await list.requestContexts(0, 2000);
            return ctxs.map((c) => c.getObject());
        },

        async _fetchFiltered(path, filters) {
            const list = this._getModel().bindList(path, null, null, filters);
            const ctxs = await list.requestContexts(0, 2000);
            return ctxs.map((c) => c.getObject());
        },

        async _loadSuppliers() {
            try {
                const all = await this._fetchAll("/Suppliers");
                all.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
                this.getView().getModel("sup").setProperty("/list",
                    all.map((s) => ({ ID: s.ID, name: s.name || s.supplierName || s.supplierCode || s.ID })));
            } catch (e) {
                MessageBox.error("Could not load suppliers: " + e.message);
            }
        },

        async _loadPartLookup() {
            try {
                const parts = await this._getInventoryModel().bindList("/SpareParts").requestContexts(0, 2000);
                const m = {};
                parts.forEach((c) => { const o = c.getObject(); m[o.ID] = o; });
                this.getView().getModel("lk").setProperty("/parts", m);
            } catch (e) { /* part names unavailable, IDs are shown instead */ }
        },

        // ---------------- supplier selection ----------------
        onSupplierChange(oEvent) {
            const id = oEvent.getSource().getSelectedKey();
            if (id) { this._selectSupplier(id); }
        },

        _selectSupplier(id) {
            const sup = this.getView().getModel("sup");
            const entry = sup.getProperty("/list").find((s) => s.ID === id);
            sup.setProperty("/selectedID", id);
            sup.setProperty("/name", entry ? entry.name : "");
            try { localStorage.setItem("selectedSupplier", id); } catch (e) { /* ignore */ }

            this._resetSelection();
            this._applyPOFilter();
            this._applyGRFilter();
            this._loadDashboard();
        },

        _resetSelection() {
            this._poID = null;
            this.getView().getModel("ui").setProperty("/canRespond", false);
            const t = this.byId("poTable");
            if (t) { t.removeSelections(true); }
            const panel = this.byId("poItemsPanel");
            if (panel) {
                panel.unbindElement();
                panel.setHeaderText("PO Items (select a PO above)");
            }
        },

        // ---------------- filters ----------------
        _supplierID() {
            return this.getView().getModel("sup").getProperty("/selectedID");
        },

        _applyPOFilter() {
            const id = this._supplierID();
            const b = this.byId("poTable").getBinding("items");
            if (!id || !b) { return; }

            // a supplier never sees POs that were not sent to them yet
            const filters = [
                new Filter("supplier_ID", FilterOperator.EQ, id),
                new Filter("status", FilterOperator.NE, "CREATED")
            ];
            const key = this.byId("poStatusFilter").getSelectedKey();
            if (key && key !== "ALL") { filters.push(new Filter("status", FilterOperator.EQ, key)); }
            const q = (this.byId("poSearch").getValue() || "").trim();
            if (q) { filters.push(new Filter("poNumber", FilterOperator.Contains, q)); }

            b.filter(filters);
            if (b.isSuspended()) { b.resume(); }
        },

        _applyGRFilter() {
            const id = this._supplierID();
            const b = this.byId("grTable").getBinding("items");
            if (!id || !b) { return; }
            b.filter([new Filter("po/supplier_ID", FilterOperator.EQ, id)]);
            if (b.isSuspended()) { b.resume(); }
        },

        onPOFilter() {
            this._applyPOFilter();
        },

        // ---------------- dashboard analytics ----------------
        async _loadDashboard() {
            const id = this._supplierID();
            if (!id) { return; }
            try {
                const pos = await this._fetchFiltered("/PurchaseOrders", [
                    new Filter("supplier_ID", FilterOperator.EQ, id),
                    new Filter("status", FilterOperator.NE, "CREATED")
                ]);
                const poIDs = new Set(pos.map((p) => p.ID));
                const poNo = {};
                pos.forEach((p) => { poNo[p.ID] = p.poNumber; });

                const [allItems, allGRs, prs] = await Promise.all([
                    this._fetchAll("/PurchaseOrderItems"),
                    this._fetchAll("/GoodsReceipts"),
                    this._fetchAll("/PurchaseRequisitions")
                ]);
                const items = allItems.filter((i) => poIDs.has(i.po_ID));
                const grs = allGRs.filter((g) => poIDs.has(g.po_ID));

                // PR number lookup for the PO table
                const prMap = {};
                prs.forEach((p) => { prMap[p.ID] = p.prNumber; });
                this.getView().getModel("lk").setProperty("/prs", prMap);

                const d = this.getView().getModel("dash");
                const count = (st) => pos.filter((p) => p.status === st).length;

                d.setProperty("/awaiting", count("SENT_TO_SUPPLIER"));
                d.setProperty("/confirmed", count("CONFIRMED"));
                d.setProperty("/partial", count("PARTIALLY_RECEIVED"));
                d.setProperty("/received", count("RECEIVED"));
                d.setProperty("/rejected", count("REJECTED_BY_SUPPLIER"));
                d.setProperty("/badgeText", count("SENT_TO_SUPPLIER") > 0 ? String(count("SENT_TO_SUPPLIER")) : "");

                // per PO totals
                const totals = {};
                items.forEach((i) => {
                    const t = totals[i.po_ID] || (totals[i.po_ID] = { ordered: 0, received: 0, openValue: 0 });
                    const ord = i.orderedQty || 0;
                    const rec = i.receivedQty || 0;
                    t.ordered += ord;
                    t.received += rec;
                    t.openValue += Math.max(0, ord - rec) * (Number(i.unitPrice) || 0);
                });

                const openPOs = pos.filter((p) => OPEN_STATUSES.includes(p.status));
                const openValue = openPOs.reduce((s, p) => s + ((totals[p.ID] || {}).openValue || 0), 0);
                d.setProperty("/openValue", openValue.toLocaleString(undefined, { maximumFractionDigits: 0 }));

                // delivery progress bars
                d.setProperty("/openPOs", openPOs
                    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
                    .slice(0, 6)
                    .map((p) => {
                        const t = totals[p.ID] || { ordered: 0, received: 0 };
                        return {
                            poNumber: p.poNumber,
                            pct: t.ordered ? (t.received / t.ordered) * 100 : 0,
                            label: `${t.received} / ${t.ordered}`,
                            state: PO_STATES[p.status]
                        };
                    }));

                // lists
                d.setProperty("/awaitingList", pos
                    .filter((p) => p.status === "SENT_TO_SUPPLIER")
                    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
                    .slice(0, 6)
                    .map((p) => ({ ID: p.ID, poNumber: p.poNumber, createdAt: p.createdAt })));

                d.setProperty("/recentGRs", grs
                    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
                    .slice(0, 6)
                    .map((g) => ({
                        grNumber: g.grNumber, poNumber: poNo[g.po_ID],
                        receivedBy: g.receivedBy, createdAt: g.createdAt
                    })));

                d.setProperty("/donutHtml", this._buildDonut(pos));
            } catch (e) {
                MessageToast.show("Could not load dashboard: " + e.message);
            }
        },

        _buildDonut(pos) {
            const total = pos.length;
            if (!total) { return "<div style='padding:2rem;color:#64748b'>No purchase orders yet.</div>"; }
            let acc = 0;
            const stops = [];
            const legend = [];
            Object.keys(PO_COLORS).forEach((k) => {
                const c = pos.filter((p) => p.status === k).length;
                if (!c) { return; }
                const start = acc;
                acc += (c / total) * 100;
                stops.push(`${PO_COLORS[k]} ${start}% ${acc}%`);
                legend.push(`<div class="legendRow"><span class="legendDot" style="background:${PO_COLORS[k]}"></span>${PO_LABELS[k]} · <b>${c}</b></div>`);
            });
            return `<div class="donutWrap">
                <div class="donut" style="background:conic-gradient(${stops.join(",")})">
                    <div class="donutHole">${total}<small>POs</small></div>
                </div>
                <div>${legend.join("")}</div></div>`;
        },

        // ---------------- selection ----------------
        onPOSelect(oEvent) {
            const ctx = oEvent.getParameter("listItem").getBindingContext();
            this._poID = ctx.getProperty("ID");
            this.getView().getModel("ui").setProperty("/canRespond", ctx.getProperty("status") === "SENT_TO_SUPPLIER");
            const panel = this.byId("poItemsPanel");
            panel.bindElement({ path: ctx.getPath() });
            panel.setHeaderText(`PO Items – ${ctx.getProperty("poNumber") || this._poID}`);
        },

        // ---------------- actions plumbing ----------------
        async _callAction(name, params) {
            const oAction = this._getModel().bindContext(`/${name}(...)`);
            Object.entries(params || {}).forEach(([k, v]) => oAction.setParameter(k, v));
            await oAction.execute();
            return oAction.getBoundContext().getObject();
        },

        _refreshAll() {
            ["poTable", "grTable", "poItemsTable"].forEach((id) => {
                try {
                    const b = this.byId(id).getBinding("items");
                    if (b && !b.isSuspended()) { b.refresh(); }
                } catch (e) { /* relative binding without selection */ }
            });
            this._resetSelection();
            this._loadDashboard();
        },

        // ---------------- confirm / reject ----------------
        onConfirmPO() {
            if (!this._poID) { return; }
            MessageBox.confirm("Confirm this purchase order and commit to delivering it?", {
                title: "Confirm PO",
                actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.OK,
                onClose: async (action) => {
                    if (action !== MessageBox.Action.OK) { return; }
                    try {
                        await this._callAction(ACTIONS.confirm, { poID: this._poID });
                        MessageToast.show("PO confirmed. Procurement has been notified.");
                        this._refreshAll();
                    } catch (e) {
                        MessageBox.error(e.message);
                    }
                }
            });
        },

        onRejectPO() {
            if (!this._poID) { return; }
            this.byId("rejectReason").setValue("");
            this.byId("rejectDialog").open();
        },

        async onConfirmReject() {
            const reason = (this.byId("rejectReason").getValue() || "").trim();
            if (!reason) {
                MessageToast.show("Please enter a reason for the rejection.");
                return;
            }
            try {
                await this._callAction(ACTIONS.reject, { poID: this._poID, reason });
                this.byId("rejectDialog").close();
                MessageToast.show("PO rejected. Procurement has been notified.");
                this._refreshAll();
            } catch (e) {
                MessageBox.error(e.message);
            }
        },

        onCancelReject() {
            this.byId("rejectDialog").close();
        },

        // ---------------- refresh ----------------
        onRefreshGRs() {
            const b = this.byId("grTable").getBinding("items");
            if (b && !b.isSuspended()) { b.refresh(); }
        },

        onRefresh() {
            this._loadPartLookup();
            this._refreshAll();
        }
    });
});