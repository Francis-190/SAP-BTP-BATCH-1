sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/Sorter",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, Filter, Sorter, MessageToast, MessageBox) {
    "use strict";

    const PAGE_SIZE = 10;

    // Must match the PartCategory enum in db/schema.cds
    const CATEGORIES = [
        "BRAKE_PADS", "OIL_FILTER", "AIR_FILTER", "FUEL_FILTER", "SPARK_PLUG",
        "WIPER_BLADE", "HEADLAMP_ASSEMBLY", "TAILLAMP_ASSEMBLY", "SENSOR",
        "BATTERY_COMPONENT", "ELECTRONIC_CONTROL_UNIT", "SUSPENSION_COMPONENT",
        "STEERING_COMPONENT"
    ].map(function (k) {
        return {
            key: k,
            text: k.split("_").map(function (w) {
                return w[0] + w.slice(1).toLowerCase();
            }).join(" ")
        };
    });

    return Controller.extend("addinventory.controller.AddInventory", {

        onInit: function () {
            this._page = 1;
            this._location = "";

            this.getView().setModel(new JSONModel({
                categories: CATEGORIES,
                locations: []
            }), "addForm");

            this.getView().setModel(new JSONModel({
                all: [],
                items: [],
                locationOptions: [],
                pages: []
            }), "addRecent");

            this.getOwnerComponent().getRouter()
                .getRoute("RouteAddInventory")
                .attachPatternMatched(this._load, this);
        },

        // ---------- data loading ----------

        _load: function () {
            this._loadLocations();
            this._loadAdditions();
        },

        _loadLocations: async function () {
            const aCtx = await this.getView().getModel()
                .bindList("/Locations", null, [new Sorter("name")],
                    [new Filter("isActive", "EQ", true)])
                .requestContexts(0, 500);

            this.getView().getModel("addForm").setProperty(
                "/locations", aCtx.map(function (c) { return c.getObject(); }));
        },

        _loadAdditions: async function () {
            const aCtx = await this.getView().getModel().bindList(
                "/StockMovements", null, null, null, {
                    "$filter": "movementType eq 'RECEIPT'",
                    "$expand": "part,toLocation",
                    "$orderby": "createdAt desc"
                }).requestContexts(0, 1000);

            const aAll = aCtx.map(function (c) {
                const o = c.getObject();
                return {
                    partNumber: o.part && o.part.partNumber,
                    description: o.part && o.part.description,
                    location: o.toLocation && o.toLocation.name,
                    locationCode: o.toLocation && o.toLocation.locationCode,
                    quantity: o.quantity,
                    status: o.status,
                    dateTime: o.createdAt
                        ? new Date(o.createdAt).toLocaleString() : ""
                };
            });

            const aLoc = [...new Set(aAll.map(function (i) { return i.location; })
                .filter(Boolean))].sort();

            const oModel = this.getView().getModel("addRecent");
            oModel.setProperty("/all", aAll);
            oModel.setProperty("/locationOptions",
                [{ key: "", text: "All Locations" }].concat(
                    aLoc.map(function (l) { return { key: l, text: l }; })));

            this._page = 1;
            this._render();
        },

        // ---------- filter + paging ----------

        _render: function () {
            const oModel = this.getView().getModel("addRecent");
            const aRows = oModel.getProperty("/all").filter(function (i) {
                return !this._location || i.location === this._location;
            }, this);

            const iPages = Math.max(1, Math.ceil(aRows.length / PAGE_SIZE));
            this._page = Math.min(this._page, iPages);

            const aButtons = [{ label: "<", page: this._page - 1, enabled: this._page > 1 }];
            for (let i = 1; i <= iPages; i++) {
                aButtons.push({ label: String(i), page: i, enabled: true,
                    type: i === this._page ? "Emphasized" : "Transparent" });
            }
            aButtons.push({ label: ">", page: this._page + 1, enabled: this._page < iPages });

            oModel.setProperty("/items",
                aRows.slice((this._page - 1) * PAGE_SIZE, this._page * PAGE_SIZE));
            oModel.setProperty("/pages", aButtons.map(function (b) {
                return Object.assign({ type: "Transparent" }, b);
            }));
        },

        onFilterChange: function (oEvent) {
            this._location = oEvent.getSource().getSelectedKey();
            this._page = 1;
            this._render();
        },

        onPageButtonPress: function (oEvent) {
            this._page = oEvent.getSource().getBindingContext("addRecent").getProperty("page");
            this._render();
        },

        onRefreshRecent: function () {
            this._loadAdditions();
        },

        // ---------- form ----------

        _val: function (sId) {
            return this.byId(sId).getValue().trim();
        },

        onCancel: function () {
            ["addPartNumberInput", "addDescriptionInput", "addQtyInput", "addReorderInput"]
                .forEach(function (s) { this.byId(s).setValue(""); }, this);
            this.byId("addCategorySelect").setSelectedKey("");
            this.byId("addLocationSelect").setSelectedKey("");
        },

        onAddInventoryItem: async function () {
            const oModel = this.getView().getModel();
            const partNumber = this._val("addPartNumberInput");
            const description = this._val("addDescriptionInput");
            const category = this.byId("addCategorySelect").getSelectedKey();
            const locationID = this.byId("addLocationSelect").getSelectedKey();
            const quantity = Number(this._val("addQtyInput"));
            const reorderLevel = Number(this._val("addReorderInput"));

            if (!partNumber || !description || !category || !locationID ||
                !this._val("addQtyInput") || !this._val("addReorderInput")) {
                return MessageBox.error("Please fill in all fields.");
            }
            if (!Number.isInteger(quantity) || quantity <= 0) {
                return MessageBox.error("Quantity must be a whole number greater than zero.");
            }
            if (!Number.isInteger(reorderLevel) || reorderLevel < 0) {
                return MessageBox.error("Reorder Level must be zero or a positive whole number.");
            }

            try {
                // New parts only: stock for existing parts comes from Procurement
                const aDup = await oModel.bindList("/SpareParts", null, null,
                    [new Filter("partNumber", "EQ", partNumber)]).requestContexts(0, 1);
                if (aDup.length) {
                    return MessageBox.error("Part " + partNumber + " already exists. " +
                        "Stock for existing parts is added through Procurement.");
                }

                const oAction = oModel.bindContext("/addInventoryItem(...)");
                Object.entries({ partNumber, description, category, locationID, quantity, reorderLevel })
                    .forEach(function (e) { oAction.setParameter(e[0], e[1]); });
                await oAction.execute();

                MessageToast.show(oAction.getBoundContext().getObject().value);
                this.onCancel();
                this._loadAdditions();

            } catch (oError) {
                MessageBox.error(oError.message || "Failed to add inventory item.");
            }
        }
    });
});