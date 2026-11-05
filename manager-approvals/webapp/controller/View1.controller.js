sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/TextArea",
    "sap/m/VBox"
], (Controller, JSONModel, Filter, FilterOperator, MessageBox, MessageToast,
    Dialog, Button, Label, Input, TextArea, VBox) => {
    "use strict";

    return Controller.extend("managerapprovals.controller.View1", {

        onInit() {
            this.getView().setModel(new JSONModel({
                pending: [], history: [], pendingCount: 0, historyCount: 0
            }), "ap");
            this._load();
        },

        // ---------- helpers ----------
        _errorText(e) {
            return (e && (e.error?.message || e.message)) || "Unknown error";
        },

        // default model = /procurement, "inventory" model = /inventory
        _getModel(name) {
            return this.getView().getModel(name) || this.getOwnerComponent().getModel(name);
        },

        async _fetchAll(oModel, path, filters, params) {
            const list = oModel.bindList(path, null, [], filters || [], params);
            const ctxs = await list.requestContexts(0, 2000);
            return ctxs.map((c) => c.getObject());
        },

        _fmtDate(s) {
            return s ? new Date(s).toLocaleString() : "";
        },

        // ---------- load pending PRs (with stock check) and decided PRs ----------
        async _load() {
            const page = this.byId("page");
            page.setBusy(true);
            try {
                const proc = this._getModel();
                const inv = this._getModel("inventory");

                const [pendingPRs, decidedPRs, stock, parts] = await Promise.all([
                    this._fetchAll(proc, "/PurchaseRequisitions",
                        [new Filter("status", FilterOperator.EQ, "PENDING_APPROVAL")],
                        { $expand: "items" }),
                    this._fetchAll(proc, "/PurchaseRequisitions", [new Filter({
                        filters: [
                            new Filter("status", FilterOperator.EQ, "APPROVED"),
                            new Filter("status", FilterOperator.EQ, "REJECTED")
                        ],
                        and: false
                    })]),
                    // if /inventory is unreachable, the PR list still loads and the stock check shows "unavailable"
                    inv ? this._fetchAll(inv, "/Inventory").catch(() => null) : Promise.resolve(null),
                    inv ? this._fetchAll(inv, "/SpareParts").catch(() => null) : Promise.resolve(null)
                ]);

                const stockAvailable = Array.isArray(stock) && Array.isArray(parts);
                if (!stockAvailable) {
                    MessageToast.show("Could not read inventory from /inventory, so the stock check is unavailable.");
                }
                const stockMap = new Map((stock || []).map((s) => [`${s.part_ID}|${s.location_ID}`, s]));
                const partMap = new Map((parts || []).map((p) => [p.ID, p]));

                const pending = pendingPRs.map((pr) => {
                    const items = (pr.items || []).map((i, idx) => {
                        const st = stockMap.get(`${i.part_ID}|${pr.location_ID}`);
                        const part = partMap.get(i.part_ID);
                        const onHand = st ? (st.quantityOnHand ?? 0) : 0;
                        // location override first, then the part default
                        const reorderLevel = st?.reorderLevel ?? part?.reorderLevel ?? 0;
                        const low = stockAvailable && onHand < reorderLevel;
                        return {
                            partNumber: i.part?.partNumber || part?.partNumber || `Item ${idx + 1}`,
                            description: i.part?.description || part?.description || "",
                            estimatedPrice: i.estimatedPrice ?? "",
                            requiredQty: i.requiredQty,
                            onHand: stockAvailable ? onHand : "-",
                            reorderLevel: stockAvailable ? reorderLevel : "-",
                            low,
                            stockText: !stockAvailable ? "Unknown" : (low ? "Low" : "OK"),
                            stockState: !stockAvailable ? "None" : (low ? "Error" : "Success")
                        };
                    });
                    const lowItems = items.filter((x) => x.low).length;
                    const stockLow = lowItems > 0;
                    return {
                        ID: pr.ID,
                        prNumber: pr.prNumber || pr.ID,
                        requestedBy: pr.requestedBy,
                        createdAt: pr.createdAt,
                        items,
                        stockLow,
                        stockText: !stockAvailable ? "Stock unavailable"
                            : (!items.length ? "No items" : (stockLow ? "Stock low" : "Stock fine")),
                        stockState: !stockAvailable || !items.length ? "None" : (stockLow ? "Error" : "Success"),
                        stockInfo: !stockAvailable ? ""
                            : (items.length ? `${lowItems} of ${items.length} item(s) below reorder level` : "This PR has no items")
                    };
                }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

                const history = decidedPRs.map((pr) => ({
                    ID: pr.ID,
                    prNumber: pr.prNumber || pr.ID,
                    requestedBy: pr.requestedBy,
                    status: pr.status,
                    statusState: pr.status === "APPROVED" ? "Success" : "Error",
                    approvedBy: pr.approvedBy || "",
                    approvedAt: pr.approvedAt || "",
                    approvedAtText: this._fmtDate(pr.approvedAt),
                    rejectionReason: pr.rejectionReason || ""
                })).sort((a, b) => String(b.approvedAt).localeCompare(String(a.approvedAt)));

                const m = this.getView().getModel("ap");
                m.setProperty("/pending", pending);
                m.setProperty("/history", history);
                m.setProperty("/pendingCount", pending.length);
                m.setProperty("/historyCount", history.length);

                this.onPendingFilter();
                this.onHistoryFilter();
            } catch (e) {
                MessageBox.error("Could not load data: " + this._errorText(e));
            } finally {
                page.setBusy(false);
            }
        },

        // ---------- filters ----------
        _searchFilter(q, fields) {
            return new Filter({
                filters: fields.map((f) => new Filter(f, FilterOperator.Contains, q)),
                and: false
            });
        },

        onPendingFilter() {
            const binding = this.byId("pendingTable").getBinding("items");
            if (!binding) { return; }
            const filters = [];
            const key = this.byId("stockFilter").getSelectedKey();
            if (key === "LOW") { filters.push(new Filter("stockLow", FilterOperator.EQ, true)); }
            if (key === "OK") { filters.push(new Filter("stockLow", FilterOperator.EQ, false)); }
            const q = (this.byId("pendingSearch").getValue() || "").trim();
            if (q) { filters.push(this._searchFilter(q, ["prNumber", "requestedBy"])); }
            binding.filter(filters);
        },

        onHistoryFilter() {
            const binding = this.byId("historyTable").getBinding("items");
            if (!binding) { return; }
            const filters = [];
            const key = this.byId("historyFilter").getSelectedKey();
            if (key !== "ALL") { filters.push(new Filter("status", FilterOperator.EQ, key)); }
            const q = (this.byId("historySearch").getValue() || "").trim();
            if (q) { filters.push(this._searchFilter(q, ["prNumber", "approvedBy", "requestedBy"])); }
            binding.filter(filters);

            // a rejection reason only exists for rejected PRs
            this.byId("hcReason").setVisible(key !== "APPROVED");
        },

        // ---------- selection ----------
        onSelect(oEvent) {
            const item = oEvent.getParameter("listItem");
            const ctx = item && item.getBindingContext("ap");
            if (!ctx) { return; }
            const panel = this.byId("itemsPanel");
            panel.bindElement({ path: ctx.getPath(), model: "ap" });
            panel.setHeaderText(`Stock check - ${ctx.getProperty("prNumber")}`);
        },

        _resetDetail() {
            this.byId("pendingTable").removeSelections(true);
            const panel = this.byId("itemsPanel");
            panel.unbindElement("ap");
            panel.setHeaderText("Stock check (select a PR above)");
        },

        onRefresh() {
            this._resetDetail();
            this._load();
        },
                // ---------- open the object page ----------
        onOpenPR(oEvent) {
            const row = oEvent.getSource().getBindingContext("ap").getObject();
            this.getOwnerComponent().getRouter().navTo("ObjectPage", { prID: row.ID });
        },

        // ---------- approve / reject ----------
        onApprove(oEvent) {
            const row = oEvent.getSource().getBindingContext("ap").getObject();
            const openDialog = () => this._openInputDialog(`Approve ${row.prNumber}`,
                [{ key: "approver", label: "Approver", required: true }],
                (v) => this._decide("approvePR", row.ID, { approver: v.approver }, "PR approved."));

            if (row.stockText === "Stock fine") {
                MessageBox.confirm("Stock is currently above the reorder level for this PR. Approve anyway?", {
                    title: "Stock is fine",
                    onClose: (action) => { if (action === MessageBox.Action.OK) { openDialog(); } }
                });
            } else {
                openDialog();
            }
        },

        onReject(oEvent) {
            const row = oEvent.getSource().getBindingContext("ap").getObject();
            this._openInputDialog(`Reject ${row.prNumber}`, [
                { key: "approver", label: "Approver", required: true },
                { key: "reason", label: "Rejection reason", required: true, multiline: true }
            ], (v) => this._decide("rejectPR", row.ID,
                { approver: v.approver, reason: v.reason }, "PR rejected."));
        },

        async _decide(actionName, prID, extra, successMsg) {
            const page = this.byId("page");
            page.setBusy(true);
            try {
                const oAction = this._getModel().bindContext(`/${actionName}(...)`);
                oAction.setParameter("prID", prID);
                Object.entries(extra).forEach(([k, v]) => oAction.setParameter(k, v));
                await oAction.execute();

                MessageToast.show(successMsg);
                this._resetDetail();
                await this._load();
            } catch (e) {
                MessageBox.error(this._errorText(e));
            } finally {
                page.setBusy(false);
            }
        },

        // ---------- generic input dialog ----------
        _openInputDialog(title, fields, onConfirm) {
            const inputs = {};
            const box = new VBox().addStyleClass("sapUiSmallMargin");
            fields.forEach((f) => {
                box.addItem(new Label({ text: f.label, required: !!f.required }));
                inputs[f.key] = f.multiline
                    ? new TextArea({ rows: 3, width: "100%" })
                    : new Input({ width: "100%" });
                box.addItem(inputs[f.key]);
            });
            const dlg = new Dialog({
                title,
                contentWidth: "24rem",
                content: [box],
                beginButton: new Button({
                    text: "Confirm", type: "Emphasized",
                    press: () => {
                        const values = {};
                        for (const f of fields) {
                            values[f.key] = (inputs[f.key].getValue() || "").trim();
                            if (f.required && !values[f.key]) {
                                MessageToast.show(`${f.label} is required.`);
                                return;
                            }
                        }
                        dlg.close();
                        onConfirm(values);
                    }
                }),
                endButton: new Button({ text: "Cancel", press: () => dlg.close() }),
                afterClose: () => dlg.destroy()
            });
            this.getView().addDependent(dlg);
            dlg.open();
        }
    });
});