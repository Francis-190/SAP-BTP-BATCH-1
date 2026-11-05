sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox"
], (Controller, History, JSONModel, Filter, FilterOperator, MessageBox) => {
    "use strict";

    const STATUS = {
        PENDING_APPROVAL: { text: "Pending approval", state: "Warning" },
        APPROVED: { text: "Approved", state: "Success" },
        REJECTED: { text: "Rejected", state: "Error" },
        DRAFT: { text: "Draft", state: "None" },
        SUBMITTED: { text: "Submitted", state: "None" },
        CLOSED: { text: "Closed", state: "None" }
    };

    const LOC_TYPE = {
        WAREHOUSE: "Warehouse", SERVICE_CENTER: "Service center", DEALER: "Dealer"
    };

    const EQ = FilterOperator.EQ;

    return Controller.extend("managerapprovals.controller.ObjectPage", {

        onInit() {
            this.getView().setModel(new JSONModel({
                pending: true, items: [], purchaseOrders: [],
                hasLocation: false, hasPOs: false
            }), "pr");
            this.getOwnerComponent().getRouter()
                .getRoute("ObjectPage").attachPatternMatched(this._onMatched, this);
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

        // tries each model in turn; never throws, returns [] when nothing could be read
        async _tryRead(models, path, filters, params) {
            for (const m of models.filter(Boolean)) {
                try {
                    return await this._fetchAll(m, path, filters, params);
                } catch (e) {
                    console.warn(`ObjectPage: could not read ${path}`, e);
                }
            }
            return [];
        },

        _fmtDate(s) {
            return s ? new Date(s).toLocaleString() : "";
        },

        _money(n) {
            if (n === null || n === undefined || n === "") { return ""; }
            return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },

        // ---------- load ----------
        _onMatched(oEvent) {
            this._load(oEvent.getParameter("arguments").prID);
        },

        // tries the richest $expand first and falls back until one is accepted by the service
        async _loadPR(proc, prID) {
            const filters = [new Filter("ID", EQ, prID)];
            const expands = [
                "location,items($expand=part,supplier)",
                "items($expand=part,supplier)",
                "location,items",
                "items"
            ];
            let lastError;
            for (const expand of expands) {
                try {
                    const rows = await this._fetchAll(proc, "/PurchaseRequisitions", filters, { $expand: expand });
                    return rows[0];
                } catch (e) {
                    lastError = e;
                    console.warn(`ObjectPage: $expand=${expand} not accepted`, e);
                }
            }
            throw lastError;
        },

        async _load(prID) {
            const view = this.getView();
            view.setBusy(true);
            try {
                const proc = this._getModel();
                const inv = this._getModel("inventory");

                const pr = await this._loadPR(proc, prID);
                if (!pr) {
                    MessageBox.error("This PR could not be found.");
                    this._goToList();
                    return;
                }

                const locID = pr.location_ID;
                const prItems = pr.items || [];
                const partIDs = [...new Set(prItems.filter((i) => !i.part).map((i) => i.part_ID).filter(Boolean))];

                // optional look-ups: whatever cannot be read is simply left out, nothing is shown to the user
                const [parts, locs, suppliers, pos] = await Promise.all([
                    partIDs.length
                        ? this._tryRead([proc, inv], "/SpareParts", [new Filter({
                            filters: partIDs.map((id) => new Filter("ID", EQ, id)), and: false
                        })])
                        : Promise.resolve([]),
                    pr.location ? Promise.resolve([]) : this._tryRead([proc, inv], "/Locations", [new Filter("ID", EQ, locID)]),
                    this._tryRead([proc, inv], "/Suppliers"),
                    this._tryRead([proc], "/PurchaseOrders", [new Filter("pr_ID", EQ, prID)])
                ]);

                const partMap = new Map(parts.map((p) => [p.ID, p]));
                const suppMap = new Map(suppliers.map((s) => [s.ID, s]));
                const loc = pr.location || locs[0];

                // ----- items -----
                const items = prItems.map((i, idx) => {
                    const part = i.part || partMap.get(i.part_ID);
                    const supplier = i.supplier || suppMap.get(i.supplier_ID) || suppMap.get(part?.preferredSupplier_ID);

                    const qty = Number(i.requiredQty) || 0;
                    const price = (i.estimatedPrice === null || i.estimatedPrice === undefined || i.estimatedPrice === "")
                        ? null : Number(i.estimatedPrice);
                    const lineTotal = price === null ? null : price * qty;

                    return {
                        partNumber: part?.partNumber || `Item ${idx + 1}`,
                        description: part?.description || "",
                        category: part?.category ? String(part.category).replace(/_/g, " ") : "",
                        uom: part?.uom || "",
                        requiredQty: qty,
                        estimatedPriceText: this._money(price),
                        lineTotal: lineTotal || 0,
                        lineTotalText: this._money(lineTotal),
                        supplierName: supplier?.name || "Not assigned",
                        supplierInfo: supplier
                            ? `Lead time ${supplier.leadTimeDays ?? "-"} d, rating ${supplier.rating ?? "-"}`
                            : "",
                        supplierIneligible: supplier ? supplier.isEligible === false : false
                    };
                });

                const total = items.reduce((sum, x) => sum + x.lineTotal, 0);

                // ----- purchase orders created from this PR -----
                const purchaseOrders = pos.map((po) => ({
                    poNumber: po.poNumber || "-",
                    supplierName: suppMap.get(po.supplier_ID)?.name || "",
                    status: po.status,
                    createdAtText: this._fmtDate(po.createdAt)
                }));

                const st = STATUS[pr.status] || { text: pr.status, state: "None" };

                view.getModel("pr").setData({
                    prNumber: pr.prNumber || "-",
                    requestedBy: pr.requestedBy || "",
                    createdAtText: this._fmtDate(pr.createdAt),
                    createdBy: pr.createdBy || "",
                    modifiedAtText: this._fmtDate(pr.modifiedAt),

                    // the location is only shown when its name could be read (never the raw id)
                    hasLocation: !!loc?.name,
                    locationName: loc?.name || "",
                    locationCode: loc?.locationCode || "",
                    locationType: LOC_TYPE[loc?.type] || loc?.type || "",
                    locationCity: loc?.city || "",
                    locationRegion: loc?.region || "",

                    statusText: st.text,
                    statusState: st.state,
                    pending: pr.status === "PENDING_APPROVAL",
                    approvedBy: pr.approvedBy || "",
                    approvedAtText: this._fmtDate(pr.approvedAt),
                    rejectionReason: pr.rejectionReason || "",

                    itemCount: items.length,
                    totalText: this._money(total),
                    items,

                    purchaseOrders,
                    hasPOs: purchaseOrders.length > 0
                });
            } catch (e) {
                MessageBox.error("Could not load the PR: " + this._errorText(e));
            } finally {
                view.setBusy(false);
            }
        },

        // ---------- navigation ----------
        _goToList() {
            this.getOwnerComponent().getRouter().navTo("RouteView1", {}, true);
        },

        onNavBack() {
            if (History.getInstance().getPreviousHash() !== undefined) {
                window.history.go(-1);
            } else {
                this._goToList();
            }
        }
    });
});