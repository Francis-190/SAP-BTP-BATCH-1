sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/odata/v4/ODataModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/TextArea",
    "sap/m/VBox",
    "sap/m/Select",
    "sap/ui/core/Item",
    "sap/m/List",
    "sap/m/DisplayListItem"
], (Controller, JSONModel, Filter, FilterOperator, ODataModel, MessageBox, MessageToast,
    Dialog, Button, Label, Input, TextArea, VBox, Select, Item, List, DisplayListItem) => {
    "use strict";

    const PR_COLORS = {
        DRAFT: "#94a3b8", SUBMITTED: "#3b82f6", PENDING_APPROVAL: "#f59e0b",
        APPROVED: "#10b981", REJECTED: "#ef4444", CLOSED: "#8b5cf6"
    };

    const PO_LABELS = {
        CREATED: "Created", SENT_TO_SUPPLIER: "Sent to Supplier", CONFIRMED: "Confirmed",
        PARTIALLY_RECEIVED: "Partially Received", RECEIVED: "Received",
        REJECTED_BY_SUPPLIER: "Rejected by Supplier", CLOSED: "Closed", CANCELLED: "Cancelled"
    };
    const PO_STATES = {
        CREATED: "Information", SENT_TO_SUPPLIER: "Information", CONFIRMED: "Success",
        PARTIALLY_RECEIVED: "Warning", RECEIVED: "Success",
        REJECTED_BY_SUPPLIER: "Error", CLOSED: "None", CANCELLED: "Error"
    };
    const PF_LANES = [
        { laneId: "lane1", icon: "sap-icon://request", text: "PR Created", position: 0 },
        { laneId: "lane2", icon: "sap-icon://edit", text: "Draft", position: 1 },
        { laneId: "lane3", icon: "sap-icon://paper-plane", text: "Submitted", position: 2 },
        { laneId: "lane4", icon: "sap-icon://pending", text: "Pending Approval", position: 3 },
        { laneId: "lane5", icon: "sap-icon://decision", text: "Decision", position: 4 },
        { laneId: "lane6", icon: "sap-icon://cart", text: "Procurement", position: 5 },
        { laneId: "lane7", icon: "sap-icon://sales-order", text: "PO / Activity", position: 6 },
        { laneId: "lane8", icon: "sap-icon://complete", text: "Closed", position: 7 }
    ];
    const PO_NODE_STATE = {
        CREATED: "Critical", SENT_TO_SUPPLIER: "Critical", CONFIRMED: "Positive",
        PARTIALLY_RECEIVED: "Critical", RECEIVED: "Positive", CLOSED: "Positive",
        REJECTED_BY_SUPPLIER: "Negative", CANCELLED: "Negative"
    };
    const ZOOM_NUM = { One: 1, Two: 2, Three: 3, Four: 4 };

    return Controller.extend("procurement.controller.View1", {

        onInit() {
            this._prID = null;
            this._poID = null;
            this._poPrID = null;

            // alerts the user has already seen (kept across page reloads)
            try {
                this._seenAlerts = new Set(JSON.parse(localStorage.getItem("seenAlerts") || "[]"));
            } catch (e) {
                this._seenAlerts = new Set();
            }
            this._openAlertIDs = [];

            this.getView().setModel(new JSONModel({
                canSubmit: false, canSend: false, canDecide: false, canEdit: false,
                canResubmit: false, canCreatePO: false, canClose: false,
                canReceive: false, canSendPO: false
            }), "ui");

            this.getView().setModel(new JSONModel({
                totalPR: 0, awaiting: 0, approved: 0, openPO: 0, fulfilment: 0,
                openAlerts: 0, highAlerts: 0,
                newAlerts: 0, badgeText: "",
                donutHtml: "", trendHtml: "",
                poDist: [], pendingPRs: [], recentAlerts: []
            }), "dash");

            // lookup tables so the screens show names instead of UUIDs
            this.getView().setModel(new JSONModel({ parts: {}, locations: {}, suppliers: {}, prs: {} }), "lk");
            // goods receipt dialog lines (and the read-only location taken from the PR)
            this.getView().setModel(new JSONModel({ items: [], locationID: "", locationText: "" }), "grItems");

            // AI
            this.getView().setModel(new JSONModel({ messages: [], busy: false, proposal: null, unread: "" }), "chat");
            // process flow model
            this._initProcessFlowModel();

            // known PR ids, used to detect newly added PRs (filled on first dashboard load)
            this._knownPRIDs = null;

            this._getInventoryModel();
            this._loadLookups();
            this._loadDashboard();

            // every 30s: reload dashboard, detect new PRs, refresh the open flow
            this._alertTimer = setInterval(() => {
                this._loadDashboard();
                if (this.byId("sideNav").getSelectedKey() === "pgFlow") {
                    const key = this.byId("pfPrSelect").getSelectedKey();
                    if (key) { this._loadProcessFlow(key, true); }
                }
            }, 30000);
        },

        onExit() {
            clearInterval(this._alertTimer);
        },

        // ---------------- formatters ----------------
        formatPRState(s) {
            return ({
                DRAFT: "None", SUBMITTED: "Information", PENDING_APPROVAL: "Warning",
                APPROVED: "Success", REJECTED: "Error", CLOSED: "Indication05"
            })[s] || "None";
        },
        formatPOState(s) {
            return PO_STATES[s] || "None";
        },
        formatSeverityState(s) {
            return ({ LOW: "Information", MEDIUM: "Warning", HIGH: "Error" })[s] || "None";
        },
        formatDate(s) {
            return s ? new Date(s).toLocaleString() : "";
        },
        formatPartNumber(id, parts) {
            return (parts && parts[id] && parts[id].partNumber) || id || "";
        },
        formatPartDesc(id, parts) {
            return (parts && parts[id] && parts[id].description) || "";
        },
        formatSupplier(id, suppliers) {
            if (!id) { return "Not assigned"; }
            return (suppliers && suppliers[id] && suppliers[id].name) || id;
        },
        formatLocation(id, locations) {
            const l = locations && locations[id];
            return l ? `${l.name} (${l.locationCode})` : (id || "");
        },
        formatPR(id, prs) {
            return (prs && prs[id]) || id || "";
        },

        // ---------------- navigation ----------------
        onNavSelect(oEvent) {
            const key = oEvent.getParameter("item").getKey();
            this.byId("pages").to(this.createId(key));
            if (key === "pgAlerts") { this._markAlertsSeen(); }
            if (key === "pgDashboard") { this._loadDashboard(); }
            if (key === "pgFlow") { this._openFlowPage(); }
        },

        _navTo(key) {
            this.byId("sideNav").setSelectedKey(key);
            this.byId("pages").to(this.createId(key));
        },

        onBackToDashboard() {
            this._navTo("pgDashboard");
            this._loadDashboard();
        },

        onGoAlerts() {
            this._markAlertsSeen();
            this._navTo("pgAlerts");
        },

        onToggleSide() {
            const tp = this.byId("toolPage");
            tp.setSideExpanded(!tp.getSideExpanded());
        },

        // ---------------- bell badge ----------------
        _updateBadge() {
            const d = this.getView().getModel("dash");
            const unseen = this._openAlertIDs.filter((id) => !this._seenAlerts.has(id)).length;
            d.setProperty("/newAlerts", unseen);
            d.setProperty("/badgeText", unseen > 0 ? String(unseen) : "");
        },

        _markAlertsSeen() {
            this._openAlertIDs.forEach((id) => this._seenAlerts.add(id));
            try {
                localStorage.setItem("seenAlerts", JSON.stringify([...this._seenAlerts]));
            } catch (e) { /* storage unavailable, keep in memory only */ }
            this._updateBadge();
        },

        // ---------------- models and lookups ----------------
        _getModel() {
            return this.getView().getModel() || this.getOwnerComponent().getModel();
        },

        // InventoryService model (parts, locations); created once if the manifest doesn't define it
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
            const ctxs = await list.requestContexts(0, 500);
            return ctxs.map((c) => c.getObject());
        },

        // the receiving location is the one given on the PR the PO was created from
        async _getPOLocationID(prID) {
            if (!prID) { return null; }
            const [pr] = await this._fetchFiltered("/PurchaseRequisitions",
                [new Filter("ID", FilterOperator.EQ, prID)]);
            return (pr && pr.location_ID) || null;
        },

        async _loadLookups() {
            const lk = this.getView().getModel("lk");
            const toMap = (arr) => {
                const m = {};
                arr.forEach((x) => { m[x.ID] = x; });
                return m;
            };
            try {
                lk.setProperty("/suppliers", toMap(await this._fetchAll("/Suppliers")));
            } catch (e) { /* the screens fall back to IDs */ }
            try {
                const inv = this._getInventoryModel();
                const [parts, locs] = await Promise.all([
                    inv.bindList("/SpareParts").requestContexts(0, 2000),
                    inv.bindList("/Locations").requestContexts(0, 500)
                ]);
                lk.setProperty("/parts", toMap(parts.map((c) => c.getObject())));
                lk.setProperty("/locations", toMap(locs.map((c) => c.getObject())));
            } catch (e) {
                MessageToast.show("Part and location names unavailable: " + e.message);
            }
        },

        // ---------------- dashboard analytics ----------------
        async _loadDashboard() {
            try {
                const [prs, pos, poItems, alerts] = await Promise.all([
                    this._fetchAll("/PurchaseRequisitions"),
                    this._fetchAll("/PurchaseOrders"),
                    this._fetchAll("/PurchaseOrderItems"),
                    this._fetchAll("/AlertNotifications")
                ]);
                const d = this.getView().getModel("dash");

                // PR number lookup for the PO table
                const prMap = {};
                prs.forEach((p) => { prMap[p.ID] = p.prNumber; });
                this.getView().getModel("lk").setProperty("/prs", prMap);

                // detect newly added PRs
                this._detectNewPRs(prs);

                // KPIs
                const count = (arr, st) => arr.filter((x) => x.status === st).length;
                const openAlerts = alerts.filter((a) => !a.isResolved);
                const ordered = poItems.reduce((s, i) => s + (i.orderedQty || 0), 0);
                const received = poItems.reduce((s, i) => s + (i.receivedQty || 0), 0);

                d.setProperty("/totalPR", prs.length);
                d.setProperty("/awaiting", count(prs, "SUBMITTED") + count(prs, "PENDING_APPROVAL"));
                d.setProperty("/approved", count(prs, "APPROVED"));
                d.setProperty("/openPO", pos.filter((p) =>
                    !["RECEIVED", "CLOSED", "CANCELLED", "REJECTED_BY_SUPPLIER"].includes(p.status)).length);
                d.setProperty("/fulfilment", ordered ? Math.round((received / ordered) * 100) : 0);
                d.setProperty("/openAlerts", openAlerts.length);
                d.setProperty("/highAlerts", openAlerts.filter((a) => a.severity === "HIGH").length);

                // bell badge: only alerts not yet seen
                this._openAlertIDs = openAlerts.map((a) => a.ID);
                if (this.byId("sideNav").getSelectedKey() === "pgAlerts") {
                    // user is already looking at the alerts page, so nothing counts as new
                    this._markAlertsSeen();
                } else {
                    this._updateBadge();
                }

                // PO pipeline
                d.setProperty("/poDist", Object.keys(PO_LABELS).map((k) => {
                    const c = count(pos, k);
                    return { label: PO_LABELS[k], count: String(c), pct: pos.length ? (c / pos.length) * 100 : 0, state: PO_STATES[k] };
                }));

                // lists
                d.setProperty("/pendingPRs", prs.filter((p) => p.status === "PENDING_APPROVAL").slice(0, 6));
                d.setProperty("/recentAlerts", openAlerts
                    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6));

                // charts
                d.setProperty("/donutHtml", this._buildDonut(prs));
                d.setProperty("/trendHtml", this._buildTrend(prs));
            } catch (e) {
                MessageToast.show("Could not load dashboard: " + e.message);
            }
        },


        _buildDonut(prs) {
            const total = prs.length;
            if (!total) { return "<div style='padding:2rem;color:#64748b'>No requisitions yet.</div>"; }
            let acc = 0;
            const stops = [];
            const legend = [];
            Object.keys(PR_COLORS).forEach((k) => {
                const c = prs.filter((p) => p.status === k).length;
                if (!c) { return; }
                const start = acc;
                acc += (c / total) * 100;
                stops.push(`${PR_COLORS[k]} ${start}% ${acc}%`);
                legend.push(`<div class="legendRow"><span class="legendDot" style="background:${PR_COLORS[k]}"></span>${k.replace("_", " ")} · <b>${c}</b></div>`);
            });
            return `<div class="donutWrap">
                <div class="donut" style="background:conic-gradient(${stops.join(",")})">
                    <div class="donutHole">${total}<small>PRs</small></div>
                </div>
                <div>${legend.join("")}</div></div>`;
        },

        _buildTrend(prs) {
            const days = [];
            for (let i = 6; i >= 0; i--) {
                const dt = new Date();
                dt.setHours(0, 0, 0, 0);
                dt.setDate(dt.getDate() - i);
                days.push({ key: dt.toDateString(), label: dt.toLocaleDateString(undefined, { weekday: "short" }), n: 0 });
            }
            prs.forEach((p) => {
                if (!p.createdAt) { return; }
                const k = new Date(p.createdAt).toDateString();
                const day = days.find((x) => x.key === k);
                if (day) { day.n++; }
            });
            const max = Math.max(1, ...days.map((x) => x.n));
            return `<div class="trend">` + days.map((x) => `
                <div class="trendCol">
                    <div class="trendVal">${x.n}</div>
                    <div class="trendBar" style="height:${Math.round((x.n / max) * 120)}px"></div>
                    <div class="trendLbl">${x.label}</div>
                </div>`).join("") + `</div>`;
        },

        // ---------------- filters ----------------
        onPRFilter() {
            const filters = [];
            const key = this.byId("prStatusFilter").getSelectedKey();
            if (key && key !== "ALL") { filters.push(new Filter("status", FilterOperator.EQ, key)); }
            const q = (this.byId("prSearch").getValue() || "").trim();
            if (q) {
                filters.push(new Filter({
                    filters: [
                        new Filter("prNumber", FilterOperator.Contains, q),
                        new Filter("requestedBy", FilterOperator.Contains, q)
                    ],
                    and: false
                }));
            }
            this.byId("prTable").getBinding("items").filter(filters);
        },

        onPOFilter() {
            const q = (this.byId("poSearch").getValue() || "").trim();
            this.byId("poTable").getBinding("items")
                .filter(q ? [new Filter("poNumber", FilterOperator.Contains, q)] : []);
        },

        onAlertFilter() {
            const key = this.byId("alertFilter").getSelectedKey();
            const f = key === "OPEN" ? [new Filter("isResolved", FilterOperator.EQ, false)]
                : key === "RESOLVED" ? [new Filter("isResolved", FilterOperator.EQ, true)] : [];
            this.byId("alertTable").getBinding("items").filter(f);
        },

        // ---------------- helpers ----------------
        _setPRFlags(status) {
            const m = this.getView().getModel("ui");
            m.setProperty("/canSubmit", status === "DRAFT");
            m.setProperty("/canSend", status === "SUBMITTED");
            m.setProperty("/canDecide", status === "PENDING_APPROVAL");
            m.setProperty("/canEdit", status === "DRAFT");
            m.setProperty("/canResubmit", status === "REJECTED");
            m.setProperty("/canCreatePO", status === "APPROVED");
            m.setProperty("/canClose", status === "APPROVED");
        },

        // ================= PROCESS FLOW =================
        _initProcessFlowModel() {
            this.getView().setModel(new JSONModel({
                nodes: [],
                lanes: PF_LANES.map((l) => Object.assign({}, l, { state: [{ state: "Neutral", value: 100 }] })),
                summary: {
                    prNumber: "", status: "", requestedBy: "", createdAt: "", poCount: 0, grCount: 0,
                    fulfilment: 0, progress: 0, progressState: "None",
                    stageInfo: "Select a PR to see where it is in the process.", stageType: "Information"
                },
                highlight: true
            }), "pf");
            this._pfRaw = null;
            this._pfLane = null;
        },

        // detects PRs created since the last check and shows their flow
        _detectNewPRs(prs) {
            if (this._knownPRIDs) {
                const fresh = prs.filter((p) => !this._knownPRIDs.has(p.ID));
                if (fresh.length) {
                    fresh.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
                    const newest = fresh[0];

                    // reload the dropdown list so the new PR appears
                    const cb = this.byId("pfPrSelect");
                    if (cb && cb.getBinding("items")) { cb.getBinding("items").refresh(); }

                    MessageToast.show(`New PR added: ${newest.prNumber || newest.ID}`);

                    // if the user is looking at the flow page, jump to the new PR
                    if (this.byId("sideNav").getSelectedKey() === "pgFlow") {
                        cb.setSelectedKey(newest.ID);
                        this._loadProcessFlow(newest.ID);
                    }
                }
            }
            this._knownPRIDs = new Set(prs.map((p) => p.ID));
        },

        // opens the flow page: select the latest PR if none is selected
        async _openFlowPage() {
            const cb = this.byId("pfPrSelect");
            if (cb.getBinding("items")) { cb.getBinding("items").refresh(); }

            let key = cb.getSelectedKey();
            if (!key) {
                const prs = await this._fetchAll("/PurchaseRequisitions");
                if (!prs.length) { return; }
                prs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
                key = prs[0].ID;
                cb.setSelectedKey(key);
            }
            this._loadProcessFlow(key);
        },

        onProcessFlowPrChange(oEvent) {
            const sPrId = oEvent.getSource().getSelectedKey();
            if (sPrId) {
                this._loadProcessFlow(sPrId);
            }
        },

        onRefreshProcessFlow() {
            const oSelect = this.byId("pfPrSelect");
            const sPrId = oSelect ? oSelect.getSelectedKey() : null;

            if (oSelect && oSelect.getBinding("items")) {
                oSelect.getBinding("items").refresh();
            }
            if (sPrId) {
                this._loadProcessFlow(sPrId);
            }
        },

        onPRComboLiveChange(oEvent) {
            const oComboBox = oEvent.getSource();
            const sTypedValue = oEvent.getParameter("value") || "";
            const oBinding = oComboBox.getBinding("items");

            if (!oBinding) { return; }

            if (!sTypedValue) {
                oBinding.filter([]);
                return;
            }

            oBinding.filter(new Filter({
                filters: [
                    new Filter("prNumber", FilterOperator.Contains, sTypedValue),
                    new Filter("status", FilterOperator.Contains, sTypedValue)
                ],
                and: false
            }));

            if (!oComboBox.isOpen()) {
                oComboBox.open();
            }
        },

        async _loadProcessFlow(sPrId, bSilent) {
            const oPage = this.byId("pgFlow");
            if (!bSilent) { oPage.setBusy(true); }
            try {
                const [oPr] = await this._fetchFiltered("/PurchaseRequisitions",
                    [new Filter("ID", FilterOperator.EQ, sPrId)]);
                if (!oPr) {
                    if (!bSilent) { MessageToast.show("PR not found."); }
                    return;
                }

                // linked POs, their items and goods receipts
                const pos = await this._fetchFiltered("/PurchaseOrders",
                    [new Filter("pr_ID", FilterOperator.EQ, sPrId)]);
                let poItems = [], grs = [];
                if (pos.length) {
                    const anyPO = () => new Filter({
                        filters: pos.map((p) => new Filter("po_ID", FilterOperator.EQ, p.ID)), and: false
                    });
                    [poItems, grs] = await Promise.all([
                        this._fetchFiltered("/PurchaseOrderItems", [anyPO()]),
                        this._fetchFiltered("/GoodsReceipts", [anyPO()])
                    ]);
                }

                if (this._pfPrID !== sPrId) { this._pfLane = null; }
                this._pfPrID = sPrId;
                this._pfRaw = this._buildFlow(oPr, pos, poItems, grs);
                this._renderFlow();
            } catch (e) {
                if (!bSilent) { MessageBox.error("Unable to load process flow: " + e.message); }
            } finally {
                if (!bSilent) { oPage.setBusy(false); }
            }
        },

        // builds nodes + popup details from real data

        _buildFlow(oPr, pos, poItems, grs) {
            const lk = this.getView().getModel("lk");
            const st = oPr.status || "DRAFT";
            const rej = st === "REJECTED";
            const nodes = [], details = {};
            const add = (n, desc, rows) => {
                nodes.push(Object.assign({ texts: [], children: [], highlighted: false, focused: false }, n));
                details[n.nodeId] = [["Description", desc]].concat(rows || []);
            };

            // lane level of the current stage: 1 created, 2 draft, 3 submitted, 4 pending,
            // 5 decision, 6 procurement, 7 PO/activity, 8 closed
            const poDone = pos.length > 0 && pos.every((p) => ["RECEIVED", "CLOSED"].includes(p.status));
            const cur = ({
                DRAFT: 2, SUBMITTED: 3, PENDING_APPROVAL: 4, REJECTED: 5,
                APPROVED: poDone ? 8 : (pos.length ? 7 : 6), CLOSED: 9
            })[st] || 2;

            // earlier = done, current = active (red if rejected), later = planned (grey, "stopped" if rejected)
            const S = (lvl) => lvl < cur ? "Positive"
                : lvl === cur ? (rej ? "Negative" : "Critical")
                    : (rej ? "PlannedNegative" : "Planned");
            const T = (lvl, done, active, todo) => lvl < cur ? done
                : lvl === cur ? active
                    : (rej ? "Not reached" : todo);

            // 1. PR created
            add({
                lane: "lane1", nodeId: "pr", title: oPr.prNumber || "Purchase Requisition",
                texts: ["Requested by " + (oPr.requestedBy || "-"), this.formatDate(oPr.createdAt)],
                state: "Positive", stateText: "Created", children: ["draft"]
            }, "A requester raises a purchase requisition for the spare parts that are needed.",
                [["PR Number", oPr.prNumber], ["Requested by", oPr.requestedBy], ["Created", this.formatDate(oPr.createdAt)]]);

            // 2. Draft
            add({
                lane: "lane2", nodeId: "draft", title: "Draft",
                texts: ["PR saved, still editable"], state: S(2),
                stateText: T(2, "Completed", "In progress", "Pending"), children: ["submitted"]
            }, "The PR is saved but not yet sent. The requester can still change items and quantities before submitting.");

            // 3. Submitted
            add({
                lane: "lane3", nodeId: "submitted", title: "Submitted",
                texts: ["Sent for review"], state: S(3),
                stateText: T(3, "Completed", "Awaiting review", "Pending"), children: ["pending"]
            }, "The requester has submitted the PR. It now waits to be sent into the approval workflow.");

            // 4. Pending approval
            add({
                lane: "lane4", nodeId: "pending", title: "Pending Approval",
                texts: ["Approver is reviewing"], state: S(4),
                stateText: T(4, "Reviewed", "In approval", "Pending"), children: ["decision"]
            }, "The PR is with the approver. The approval job checks status rules and separation of duties, then approves or rejects it.");

            // 5. Decision (Approved or Rejected); the flow continues after it in both cases
            if (rej) {
                add({
                    lane: "lane5", nodeId: "decision", title: "Rejected",
                    texts: [oPr.rejectionReason || "No reason provided", "Resubmit to return to Draft"],
                    state: "Negative", stateText: "Rejected", children: ["procurement"]
                }, "The approver rejected this PR, so the process stops here and the stages after it are not reached. Use Resubmit on the PR page to move it back to Draft, correct it and submit again.",
                    [["Reason", oPr.rejectionReason || "No reason provided"], ["Next step", "Resubmit → Draft"]]);
            } else {
                add({
                    lane: "lane5", nodeId: "decision", title: cur < 5 ? "Decision" : "Approved",
                    texts: [oPr.approvedBy ? "Approved by " + oPr.approvedBy : "Approve or reject"],
                    state: S(5), stateText: cur < 5 ? "Pending" : "Approved",
                    children: ["procurement"]
                }, "The approver's outcome. An approved PR moves on to procurement. A rejected PR stops here with a reason.",
                    [["Approved by", oPr.approvedBy || "-"]]);
            }

            // 6. Procurement
            add({
                lane: "lane6", nodeId: "procurement", title: "Procurement",
                texts: [rej ? "Stopped: PR rejected" : cur < 6 ? "Starts after approval" : "Processing approved PR"],
                state: S(6), stateText: T(6, "Completed", "In progress", "Pending"),
                children: pos.length ? pos.map((p) => "po_" + p.ID) : ["po_pending"]
            }, rej ? "Procurement does not start because the PR was rejected."
                : "Procurement picks up the approved request, confirms an eligible supplier for each item and creates the purchase order(s).");

            // 7. PO / activity (one node per PO)
            if (pos.length) {
                pos.forEach((po) => {
                    const items = poItems.filter((i) => i.po_ID === po.ID);
                    const ordered = items.reduce((s, i) => s + (i.orderedQty || 0), 0);
                    const received = items.reduce((s, i) => s + (i.receivedQty || 0), 0);
                    const supplier = this.formatSupplier(po.supplier_ID, lk.getProperty("/suppliers"));
                    const poGRs = grs.filter((g) => g.po_ID === po.ID);
                    add({
                        lane: "lane7", nodeId: "po_" + po.ID, title: po.poNumber,
                        texts: [supplier, `Received ${received} / ${ordered}`],
                        state: PO_NODE_STATE[po.status] || "Neutral",
                        stateText: PO_LABELS[po.status] || po.status, children: ["closed"]
                    }, "Purchase order sent to the supplier. It is complete once all ordered quantities are received through goods receipts.",
                        [["PO Number", po.poNumber], ["Supplier", supplier], ["Status", PO_LABELS[po.status] || po.status],
                        ["Items", String(items.length)], ["Ordered qty", String(ordered)], ["Received qty", String(received)],
                        ["Goods receipts", poGRs.length ? poGRs.map((g) => g.grNumber).join(", ") : "None yet"]]);
                });
            } else {
                add({
                    lane: "lane7", nodeId: "po_pending", title: "PO / Activity",
                    texts: [rej ? "Stopped: PR rejected" : "Not created yet"],
                    state: rej ? "PlannedNegative" : "Planned", stateText: rej ? "Not reached" : "Pending",
                    children: ["closed"]
                }, rej ? "No purchase order is created because the PR was rejected."
                    : "Purchase order and procurement activity (supplier confirmation, delivery, goods receipt) happen here once procurement starts.");
            }

            // 8. Closed
            add({
                lane: "lane8", nodeId: "closed", title: "Closed",
                texts: [st === "CLOSED" ? "Procurement completed" : rej ? "Stopped: PR rejected"
                    : cur === 8 ? "Ready to close" : "Awaiting closure"],
                state: S(8), stateText: T(8, "Closed", "Ready to close", "Pending"), children: []
            }, rej ? "The PR cannot be closed through procurement because it was rejected."
                : "The PR is closed after the procurement activity is complete. No further changes are expected.");

            const currentId = ({
                2: "draft", 3: "submitted", 4: "pending", 5: "decision", 6: "procurement",
                7: pos.length ? "po_" + pos[0].ID : "po_pending", 8: "closed", 9: "closed"
            })[cur] || "pr";
            return { nodes, details, currentId, st, pos, poItems, grs };
        },
        _renderFlow() {
            const raw = this._pfRaw;
            if (!raw) { return; }
            const m = this.getView().getModel("pf");
            const highlight = m.getProperty("/highlight");
            const reached = ["Positive", "Negative", "Critical"];

            const nodes = raw.nodes.map((n) => Object.assign({}, n, {
                highlighted: this._pfLane ? n.lane === this._pfLane : (highlight && reached.includes(n.state)),
                focused: n.nodeId === raw.currentId
            }));

            // lane header rings
            const toRing = (s) => (s === "Planned" || s === "PlannedNegative") ? "Neutral" : s;
            const lanes = PF_LANES.map((l) => {
                const inLane = nodes.filter((n) => n.lane === l.laneId);
                const acc = {};
                inLane.forEach((n) => { const k = toRing(n.state); acc[k] = (acc[k] || 0) + 1; });
                const keys = Object.keys(acc);
                let state = keys.map((k) => ({ state: k, value: Math.round(acc[k] / inLane.length * 100) }));
                if (!state.length) {
                    state = [{ state: "Neutral", value: 100 }];
                } else {
                    state[state.length - 1].value = 100 - state.slice(0, -1).reduce((s, x) => s + x.value, 0);
                }
                return Object.assign({}, l, { state });
            });

            // summary strip
            const ordered = raw.poItems.reduce((s, i) => s + (i.orderedQty || 0), 0);
            const received = raw.poItems.reduce((s, i) => s + (i.receivedQty || 0), 0);
            const fulfilment = ordered ? Math.round(received / ordered * 100) : 0;
            const base = { DRAFT: 15, SUBMITTED: 30, PENDING_APPROVAL: 45, REJECTED: 45, APPROVED: 60, CLOSED: 100 }[raw.st] || 0;
            const progress = raw.st === "APPROVED" ? Math.round(60 + fulfilment * 0.35) : base;
            const pr = raw.nodes.find((n) => n.nodeId === "pr");

            const info = {
                DRAFT: ["Draft: the PR is saved but not submitted yet.", "Information"],
                SUBMITTED: ["Submitted: waiting to be sent for approval.", "Information"],
                PENDING_APPROVAL: ["Pending approval: the approver is reviewing this PR.", "Warning"],
                APPROVED: ["Approved: procurement is processing the request (PO and delivery).", "Success"],
                REJECTED: ["Rejected: " + ((pr && raw.details.decision && raw.details.decision[1] && raw.details.decision[1][1]) || "no reason provided") + ". Resubmit to return to Draft.", "Error"],
                CLOSED: ["Closed: procurement is complete.", "Success"]
            }[raw.st] || ["", "Information"];

            m.setProperty("/summary", {
                prNumber: pr ? pr.title : "", status: raw.st,
                requestedBy: pr ? pr.texts[0] : "", createdAt: pr ? pr.texts[1] : "",
                poCount: raw.pos.length, grCount: raw.grs.length, fulfilment, progress,
                progressState: raw.st === "REJECTED" ? "Error" : progress === 100 ? "Success" : "Information",
                stageInfo: info[0], stageType: info[1]
            });
            m.setProperty("/lanes", lanes);
            m.setProperty("/nodes", nodes);

            const flow = this.byId("procurementProcessFlow");
            if (flow) { flow.updateModel(); }
        },

        // ---------- zoom, highlight, lane + node clicks ----------
        _refreshZoomText() {
            const lvl = this.byId("procurementProcessFlow").getZoomLevel();
            this.getView().getModel("pf").setProperty("/zoomText", `Zoom: ${ZOOM_NUM[lvl] || 3} / 4`);
        },

        onZoomIn() {
            this.byId("procurementProcessFlow").zoomIn();
            this._refreshZoomText();
        },

        onZoomOut() {
            this.byId("procurementProcessFlow").zoomOut();
            this._refreshZoomText();
        },

        onToggleHighlight() {            // pressed state is two-way bound to /highlight
            this._pfLane = null;
            this._renderFlow();
        },

        onClearLaneFocus() {
            this._pfLane = null;
            this._renderFlow();
        },

        onProcessFlowHeaderPress(oEvent) {
            const p = oEvent.getParameters();
            const laneId = p.getLaneId ? p.getLaneId() : p.laneId;
            if (!laneId) { return; }
            this._pfLane = this._pfLane === laneId ? null : laneId;
            this._renderFlow();
            if (this._pfLane) {
                const lane = PF_LANES.find((l) => l.laneId === laneId);
                const n = (this._pfRaw ? this._pfRaw.nodes : []).filter((x) => x.lane === laneId).length;
                MessageToast.show(`${lane.text}: ${n} item(s). Click the header again to clear.`);
            }
        },

        onProcessFlowNodePress(oEvent) {
            const p = oEvent.getParameters();
            const nodeId = p.getNodeId ? p.getNodeId() : p.nodeId;
            const raw = this._pfRaw;
            if (!raw) { return; }
            const node = raw.nodes.find((n) => n.nodeId === nodeId);
            const rows = raw.details[nodeId] || [];
            if (!node) { return; }

            const list = new List({ showSeparators: "Inner" });
            rows.forEach(([label, value]) =>
                list.addItem(new DisplayListItem({ label, value: String(value ?? "-") })));
            if (!rows.length) { list.setNoDataText("No further details."); }

            const dlg = new Dialog({
                title: `${node.title} · ${node.stateText}`,
                contentWidth: "24rem",
                content: [list],
                endButton: new Button({ text: "Close", press: () => dlg.close() }),
                afterClose: () => dlg.destroy()
            });
            this.getView().addDependent(dlg);
            dlg.open();
        },

        // ---------------- actions plumbing ----------------
        async _callAction(name, params) {
            const oAction = this.getView().getModel().bindContext(`/${name}(...)`);
            Object.entries(params || {}).forEach(([k, v]) => oAction.setParameter(k, v));
            await oAction.execute();
            return oAction.getBoundContext().getObject();
        },

        _refreshAll() {
            ["prTable", "poTable", "alertTable", "grTable", "prItemsTable", "poItemsTable"].forEach((id) => {
                try {
                    const b = this.byId(id).getBinding("items");
                    if (b) { b.refresh(); }
                } catch (e) { /* relative binding without selection */ }
            });
            this.onRefreshProcessFlow();
            this._loadDashboard();
        },

        async _runPRAction(name, extra, successMsg) {
            if (!this._prID) { return; }
            try {
                const pr = await this._callAction(name, Object.assign({ prID: this._prID }, extra));
                if (pr && pr.status) { this._setPRFlags(pr.status); }
                MessageToast.show(successMsg);
                this._refreshAll();
            } catch (e) {
                MessageBox.error(e.message);
            }
        },

        // Generic input dialog (no fragment file needed)
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
        },

        // ---------------- selection ----------------
        onPRSelect(oEvent) {
            const ctx = oEvent.getParameter("listItem").getBindingContext();
            this._prID = ctx.getProperty("ID");
            this._setPRFlags(ctx.getProperty("status"));
            const panel = this.byId("prItemsPanel");
            panel.bindElement({ path: ctx.getPath() });
            panel.setHeaderText(`PR Items – ${ctx.getProperty("prNumber") || this._prID}`);
        },

        onPOSelect(oEvent) {
            const ctx = oEvent.getParameter("listItem").getBindingContext();
            this._poID = ctx.getProperty("ID");
            this._poPrID = ctx.getProperty("pr_ID");
            const poStatus = ctx.getProperty("status");
            const ui = this.getView().getModel("ui");
            ui.setProperty("/canReceive", ["CONFIRMED", "PARTIALLY_RECEIVED"].includes(poStatus));
            ui.setProperty("/canSendPO", poStatus === "CREATED");
            const panel = this.byId("poItemsPanel");
            panel.bindElement({ path: ctx.getPath() });
            panel.setHeaderText(`PO Items – ${ctx.getProperty("poNumber") || this._poID}`);
        },

        // opens the PR object page (separate view, route "PRDetail")
        onPRDetails(oEvent) {
            const ctx = oEvent.getSource().getBindingContext();
            if (!ctx) { return; }
            this.getOwnerComponent().getRouter().navTo("PRDetail", { prID: ctx.getProperty("ID") });
        },
        // opens the PO object page (separate view, route "PODetail")
        onPODetails(oEvent) {
            const ctx = oEvent.getSource().getBindingContext();
            if (!ctx) { return; }
            this.getOwnerComponent().getRouter().navTo("PODetail", { poID: ctx.getProperty("ID") });
        },
        // GR number clicked: open the object page of the PO this receipt belongs to
        // GR number clicked: open the object page of the PO this receipt belongs to
        onGRNumberPress(oEvent) {
            const ctx = oEvent.getSource().getBindingContext();
            if (!ctx) { return; }
            const gr = ctx.getObject() || {};
            const poID = gr.po_ID || (gr.po && gr.po.ID);
            if (!poID) {
                MessageToast.show("This goods receipt has no purchase order.");
                return;
            }
            this.getOwnerComponent().getRouter().navTo("PODetail", { poID });
        },

        // ---------------- PR actions ----------------
        onSubmitPR() { this._runPRAction("submitPR", {}, "PR submitted."); },
        onSendForApproval() { this._runPRAction("sendForApproval", {}, "PR sent for approval."); },
        onResubmitPR() { this._runPRAction("resubmitPR", {}, "PR moved back to Draft."); },
        onClosePR() { this._runPRAction("closePR", {}, "PR closed."); },



        // DRAFT only: change required quantity and estimated price of the selected PR's items
        onEditItems() {
            if (!this._prID) { return; }
            const binding = this.byId("prItemsTable").getBinding("items");
            const ctxs = binding ? binding.getCurrentContexts().filter(Boolean) : [];
            if (!ctxs.length) { MessageToast.show("This PR has no items."); return; }

            const parts = this.getView().getModel("lk").getProperty("/parts") || {};
            const box = new VBox().addStyleClass("sapUiSmallMargin");
            const rows = ctxs.map((ctx) => {
                const p = parts[ctx.getProperty("part_ID")] || {};
                box.addItem(new Label({ text: p.partNumber || ctx.getProperty("part_ID") })
                    .addStyleClass("sapUiSmallMarginTop"));
                const qty = new Input({ type: "Number", width: "100%",
                    description: "Required qty", value: String(ctx.getProperty("requiredQty") ?? "") });
                const price = new Input({ type: "Number", width: "100%",
                    description: "Est. price", value: String(ctx.getProperty("estimatedPrice") ?? "") });
                box.addItem(qty);
                box.addItem(price);
                return { ctx, qty, price };
            });

            const dlg = new Dialog({
                title: "Edit PR Items",
                contentWidth: "24rem",
                content: [box],
                beginButton: new Button({
                    text: "Save", type: "Emphasized",
                    press: async () => {
                        if (rows.some((r) => !(parseInt(r.qty.getValue(), 10) > 0))) {
                            MessageToast.show("Quantity must be greater than 0.");
                            return;
                        }
                        try {
                            for (const r of rows) {
                                await r.ctx.setProperty("requiredQty", parseInt(r.qty.getValue(), 10));
                                const price = parseFloat(r.price.getValue());
                                await r.ctx.setProperty("estimatedPrice", Number.isNaN(price) ? 0 : price);
                            }
                            dlg.close();
                            MessageToast.show("Items updated.");
                            this._refreshAll();
                        } catch (e) {
                            this._getModel().resetChanges("$auto");
                            MessageBox.error("Could not save: " + e.message);
                        }
                    }
                }),
                endButton: new Button({ text: "Cancel", press: () => dlg.close() }),
                afterClose: () => dlg.destroy()
            });
            this.getView().addDependent(dlg);
            dlg.open();
        },

        // same rule as the backend (createPOFromPR): supplier.isEligible must be true
        _isEligibleSupplier(s) {
            return s.isEligible === true;
        },

        // makes sure every item of the selected PR has an eligible supplier; asks the user if not
        // makes sure every item of the selected PR has an eligible supplier that actually supplies that part
        async _ensureSuppliers() {
            const binding = this.byId("prItemsTable").getBinding("items");
            const ctxs = binding ? binding.getCurrentContexts().filter(Boolean) : [];

            const [suppliers, catalog] = await Promise.all([
                this._fetchAll("/Suppliers"),
                this._fetchFiltered("/SupplierParts", [new Filter("isActive", FilterOperator.EQ, true)])
            ]);
            const eligible = suppliers.filter((s) => this._isEligibleSupplier(s));
            const eligibleByID = new Map(eligible.map((s) => [s.ID, s]));

            // part ID -> eligible suppliers that supply this part
            const byPart = new Map();
            catalog.forEach((c) => {
                const s = eligibleByID.get(c.supplier_ID);
                if (!s) { return; }
                if (!byPart.has(c.part_ID)) { byPart.set(c.part_ID, []); }
                byPart.get(c.part_ID).push(s);
            });
            const allowedFor = (partID) => byPart.get(partID) || [];

            // items with no supplier, or with a supplier that cannot supply this part
            const missing = ctxs.filter((c) =>
                !allowedFor(c.getProperty("part_ID")).some((s) => s.ID === c.getProperty("supplier_ID")));
            if (!missing.length) { return true; }

            // parts that no supplier can supply: stop with a clear message
            const parts = this.getView().getModel("lk").getProperty("/parts") || {};
            const noSource = missing.filter((c) => !allowedFor(c.getProperty("part_ID")).length);
            if (noSource.length) {
                const names = noSource.map((c) => {
                    const p = parts[c.getProperty("part_ID")];
                    return p ? p.partNumber : c.getProperty("part_ID");
                }).join(", ");
                MessageBox.error(`No eligible supplier is set up for: ${names}. Add the part to a supplier in the supplier catalog first.`);
                return false;
            }

            return new Promise((resolve) => {
                const box = new VBox().addStyleClass("sapUiSmallMargin");
                box.addItem(new Label({
                    text: "Choose a supplier for each item. Only suppliers that supply the part are listed."
                }));

                const selects = missing.map((ctx) => {
                    const part = parts[ctx.getProperty("part_ID")] || {};
                    box.addItem(new Label({
                        text: `${part.partNumber || ctx.getProperty("part_ID")} · qty ${ctx.getProperty("requiredQty")}`,
                        required: true
                    }).addStyleClass("sapUiSmallMarginTop"));
                    const sel = new Select({ width: "100%", forceSelection: false });
                    sel.addItem(new Item({ key: "", text: "Select supplier" }));
                    allowedFor(ctx.getProperty("part_ID")).forEach((s) => sel.addItem(new Item({
                        key: s.ID, text: s.name || s.supplierCode || s.ID
                    })));
                    box.addItem(sel);
                    return { ctx, sel };
                });

                let done = false;
                const dlg = new Dialog({
                    title: "Assign suppliers",
                    contentWidth: "26rem",
                    content: [box],
                    beginButton: new Button({
                        text: "Save and continue", type: "Emphasized",
                        press: async () => {
                            if (selects.some((x) => !x.sel.getSelectedKey())) {
                                MessageToast.show("Select a supplier for every item.");
                                return;
                            }
                            try {
                                for (const x of selects) {
                                    await x.ctx.setProperty("supplier_ID", x.sel.getSelectedKey());
                                }
                                done = true;
                                dlg.close();
                                resolve(true);
                            } catch (e) {
                                this._getModel().resetChanges("$auto");
                                MessageBox.error("Could not save the supplier: " + e.message);
                            }
                        }
                    }),
                    endButton: new Button({ text: "Cancel", press: () => dlg.close() }),
                    afterClose: () => { dlg.destroy(); if (!done) { resolve(false); } }
                });
                this.getView().addDependent(dlg);
                dlg.open();
            });
        },

        async onCreatePO() {
            if (!this._prID) { return; }
            try {
                const ready = await this._ensureSuppliers();
                if (!ready) { return; }

                const res = await this._callAction("createPOFromPR", { prID: this._prID });
                const count = Array.isArray(res.value) ? res.value.length : 0;
                MessageToast.show(`${count} Purchase Order(s) created.`);
                this._refreshAll();
            } catch (e) {
                this._getModel().resetChanges("$auto");
                MessageBox.error(e.message);
            }
        },

        async onRunApprovalJob() {
            try {
                const res = await this._callAction("runApprovalJob", {});
                MessageBox.success(
                    `Approval job finished.\nProcessed: ${res.processed}\nFailed: ${res.failed}`);
                this._refreshAll();
            } catch (e) {
                MessageBox.error(e.message);
            }
        },

        // ---------------- PO actions ----------------
        async onSendPOToSupplier() {
            if (!this._poID) { return; }
            try {
                await this._callAction("sendPOToSupplier", { poID: this._poID });
                MessageToast.show("PO sent to supplier.");
                this.getView().getModel("ui").setProperty("/canSendPO", false);
                this._refreshAll();
            } catch (e) {
                MessageBox.error(e.message);
            }
        },

        // Post goods receipt from the Purchase Orders page (dialog built in code)
        async onPostGoodsReceipt() {
            if (!this._poID) { return; }
            let poItems;
            try {
                poItems = await this._fetchFiltered("/PurchaseOrderItems",
                    [new Filter("po_ID", FilterOperator.EQ, this._poID)]);
            } catch (e) {
                MessageBox.error(e.message);
                return;
            }
            if (!poItems.length) { MessageBox.warning("This PO has no items."); return; }

            const lk = this.getView().getModel("lk");
            const parts = lk.getProperty("/parts") || {};
            const locs = Object.values(lk.getProperty("/locations") || {});

            const box = new VBox().addStyleClass("sapUiSmallMargin");

            // receiving location: read-only, taken from the PR the PO was created from
            box.addItem(new Label({ text: "Receiving Location" }));
            let fixedLocationID = null;
            try { fixedLocationID = await this._getPOLocationID(this._poPrID); } catch (e) { /* fall back below */ }

            let getLocation;
            if (fixedLocationID) {
                box.addItem(new Input({
                    width: "100%", editable: false,
                    value: this.formatLocation(fixedLocationID, lk.getProperty("/locations"))
                }));
                getLocation = () => fixedLocationID;
            } else {
                // fallback only if the PR has no location
                const sel = new Select({ width: "100%", forceSelection: false });
                sel.addItem(new Item({ key: "", text: "Select location" }));
                locs.forEach((l) => sel.addItem(new Item({ key: l.ID, text: `${l.name} (${l.locationCode})` })));
                box.addItem(sel);
                getLocation = () => sel.getSelectedKey();
            }

            box.addItem(new Label({ text: "Received By", required: true }));
            const byInput = new Input({ width: "100%" });
            box.addItem(byInput);

            const qtyInputs = [];
            poItems.forEach((it) => {
                const remaining = (it.orderedQty || 0) - (it.receivedQty || 0);
                const part = parts[it.part_ID];
                box.addItem(new Label({
                    text: `${part ? part.partNumber : it.part_ID} (ordered ${it.orderedQty}, received ${it.receivedQty || 0})`
                }));
                // read-only: always receives the remaining quantity
                const qty = new Input({ type: "Number", value: String(remaining), width: "100%", editable: false });
                qtyInputs.push({ id: it.ID, input: qty });
                box.addItem(qty);
            });

            const dlg = new Dialog({
                title: "Post Goods Receipt",
                contentWidth: "28rem",
                content: [box],
                beginButton: new Button({
                    text: "Post", type: "Emphasized",
                    press: async () => {
                        const locationID = getLocation();
                        const receivedBy = byInput.getValue().trim();
                        if (!locationID || !receivedBy) {
                            MessageToast.show("Location and Received By are required.");
                            return;
                        }
                        const items = qtyInputs
                            .map((q) => ({ poItemID: q.id, receivedQty: parseInt(q.input.getValue(), 10) }))
                            .filter((l) => l.receivedQty > 0);
                        if (!items.length) {
                            MessageToast.show("Enter a quantity greater than 0 for at least one item.");
                            return;
                        }
                        try {
                            const gr = await this._callAction("postGoodsReceipt",
                                { poID: this._poID, locationID, receivedBy, items });
                            dlg.close();
                            MessageToast.show(`Goods receipt ${gr.grNumber} posted.`);
                            this._refreshAll();
                        } catch (e) {
                            MessageBox.error(e.message);
                        }
                    }
                }),
                endButton: new Button({ text: "Cancel", press: () => dlg.close() }),
                afterClose: () => dlg.destroy()
            });
            this.getView().addDependent(dlg);
            dlg.open();
        },

        // ---------------- Goods Receipts page ----------------
        onPostGR() {
            this.getView().getModel("grItems").setData({ items: [], locationID: "", locationText: "" });
            this.byId("grPoSelect").setSelectedKey("");
            this.byId("grReceivedByInput").setValue("");
            const b = this.byId("grPoSelect").getBinding("items");
            if (b) { b.refresh(); }
            this.byId("postGRDialog").open();
        },

        async onGRPoChange(oEvent) {
            const poID = oEvent.getSource().getSelectedKey();
            const m = this.getView().getModel("grItems");
            if (!poID) { m.setData({ items: [], locationID: "", locationText: "" }); return; }
            try {
                const lk = this.getView().getModel("lk");

                // location comes from the PR the selected PO was created from
                const sel = oEvent.getParameter("selectedItem");
                const selCtx = sel && sel.getBindingContext();
                const prID = selCtx && selCtx.getProperty("pr_ID");
                const locationID = (await this._getPOLocationID(prID)) || "";
                const locationText = locationID
                    ? this.formatLocation(locationID, lk.getProperty("/locations"))
                    : "No location on the requisition";

                const poItems = await this._fetchFiltered("/PurchaseOrderItems",
                    [new Filter("po_ID", FilterOperator.EQ, poID)]);
                const parts = lk.getProperty("/parts") || {};
                m.setData({
                    locationID,
                    locationText,
                    items: poItems.map((it) => {
                        const part = parts[it.part_ID] || {};
                        return {
                            poItemID: it.ID,
                            partNumber: part.partNumber || it.part_ID,
                            description: part.description || "",
                            orderedQty: it.orderedQty,
                            receivedQty: it.receivedQty || 0,
                            receiveNow: Math.max(0, (it.orderedQty || 0) - (it.receivedQty || 0))
                        };
                    })
                });
            } catch (e) {
                MessageBox.error(e.message);
            }
        },

        async onSubmitGR() {
            const poID = this.byId("grPoSelect").getSelectedKey();
            const locationID = this.getView().getModel("grItems").getProperty("/locationID");
            const receivedBy = (this.byId("grReceivedByInput").getValue() || "").trim();
            if (!poID || !locationID || !receivedBy) {
                MessageToast.show("Purchase Order, Location and Received By are required.");
                return;
            }
            const items = (this.getView().getModel("grItems").getProperty("/items") || [])
                .map((i) => ({ poItemID: i.poItemID, receivedQty: parseInt(i.receiveNow, 10) }))
                .filter((l) => l.receivedQty > 0);
            if (!items.length) {
                MessageToast.show("Enter a quantity greater than 0 for at least one item.");
                return;
            }
            try {
                const gr = await this._callAction("postGoodsReceipt", { poID, locationID, receivedBy, items });
                this.byId("postGRDialog").close();
                MessageToast.show(`Goods receipt ${gr.grNumber} posted.`);
                this._refreshAll();
            } catch (e) {
                MessageBox.error(e.message);
            }
        },

        onCancelGRDialog() {
            this.byId("postGRDialog").close();
        },

        onRefreshGRs() {
            const b = this.byId("grTable").getBinding("items");
            if (b) { b.refresh(); }
        },

        // ---------------- Alerts ----------------
        async onResolveAlert(oEvent) {
            const alertID = oEvent.getSource().getBindingContext().getProperty("ID");
            try {
                await this._callAction("resolveAlert", { alertID });
                MessageToast.show("Alert resolved.");
                this._refreshAll();
            } catch (e) {
                MessageBox.error(e.message);
            }
        },

        // ---------------- AI assistant ----------------
        onToggleChat() {
            const panel = this.byId("chatPanel");
            const fab = this.byId("chatFab");
            const open = !panel.getVisible();
            panel.setVisible(open);

            fab.setIcon("");                          // no UI5 icon, only the text
            fab.setText(open ? "✕" : "🤖");

            if (open) {
                this._unread = 0;
                this.getView().getModel("chat").setProperty("/unread", "");
                this._ensureGreeting();               // shows the greeting instead of "No data"
                setTimeout(() => {
                    const input = this.byId("chatInput");
                    if (input) { input.focus(); }
                    const sc = this.byId("chatScroll");
                    if (sc) { sc.scrollTo(0, 99999, 0); }
                }, 100);
            }
        },

        _ensureGreeting() {
            if (!this.getView().getModel("chat").getProperty("/messages").length) {
                this._addChatMsg("assistant",
                    "Hi! Ask me about PRs, POs, alerts or suppliers. I can also prepare actions, and you confirm before anything changes.", true);
            }
        },

        _addChatMsg(role, text, local) {
            const m = this.getView().getModel("chat");
            const list = m.getProperty("/messages").slice();   // new array so the list refreshes
            list.push({
                role, text, local: !!local,
                sender: role === "user" ? "You" : "Assistant",
                icon: role === "user" ? "sap-icon://person-placeholder" : "sap-icon://discussion"
            });
            m.setProperty("/messages", list);

            // unread badge while the window is closed
            const panel = this.byId("chatPanel");
            if (role === "assistant" && !local && panel && !panel.getVisible()) {
                this._unread = (this._unread || 0) + 1;
                m.setProperty("/unread", String(this._unread));
            }

            setTimeout(() => {
                const sc = this.byId("chatScroll");
                if (sc) { sc.scrollTo(0, 99999, 100); }
            }, 50);
        },

        // the model sometimes answers with markdown; the list item shows plain text
        _plain(t) {
            return String(t || "")
                .replace(/\*\*(.+?)\*\*/g, "$1")
                .replace(/^\s*[-*]\s+/gm, "• ")
                .replace(/^#+\s*/gm, "");
        },

        onChatSend() {
            const input = this.byId("chatInput");
            const text = input.getValue();
            input.setValue("");
            this._sendChat(text);
        },

        onChatSuggest(oEvent) {
            this._sendChat(oEvent.getSource().getText());
        },

        onChatClear() {
            this._unread = 0;
            this.getView().getModel("chat").setData({ messages: [], busy: false, proposal: null, unread: "" });
            this._ensureGreeting();
        },

        async _sendChat(text) {
            text = (text || "").trim();
            const m = this.getView().getModel("chat");
            if (!text || m.getProperty("/busy")) { return; }

            this._addChatMsg("user", text);
            m.setProperty("/proposal", null);
            m.setProperty("/busy", true);
            try {
                const history = m.getProperty("/messages")
                    .filter((x) => !x.local).slice(-20)
                    .map((x) => ({ role: x.role, content: x.text }));
                const res = await this._callAction("chat", { messages: history });
                this._addChatMsg("assistant", this._plain(res.reply));
                if (res.actionName) {
                    m.setProperty("/proposal", {
                        name: res.actionName,
                        params: JSON.parse(res.actionParams || "{}"),
                        summary: res.actionSummary
                    });
                }
            } catch (e) {
                this._addChatMsg("assistant", "Sorry, I couldn't answer: " + e.message, true);
            } finally {
                m.setProperty("/busy", false);
            }
        },

        // the ONLY place where the chatbot's proposal turns into a real action
        async onConfirmAction() {
            const m = this.getView().getModel("chat");
            const p = m.getProperty("/proposal");
            if (!p) { return; }
            m.setProperty("/proposal", null);
            try {
                await this._callAction(p.name, p.params);   // your existing, validated action
                this._addChatMsg("assistant", "Done: " + p.summary);
                MessageToast.show("Action completed.");

                // PR table buttons must not keep the old status
                const tbl = this.byId("prTable");
                if (tbl) { tbl.removeSelections(true); }
                this._prID = null;
                this._setPRFlags(null);

                this._refreshAll();
            } catch (e) {
                this._addChatMsg("assistant", "I could not complete that: " + e.message);
            }
        },

        onDismissAction() {
            this.getView().getModel("chat").setProperty("/proposal", null);
            this._addChatMsg("assistant", "Okay, cancelled.");
        },

        onRefresh() {
            this._loadLookups();
            this._refreshAll();
        }
    });
});