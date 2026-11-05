sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "claimsure/app/model/formatter"
], function (
    Controller,
    JSONModel,
    MessageToast,
    MessageBox,
    formatter
) {
    "use strict";

    var EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

    var VALID_ROLES = ["ClaimsAgent", "Investigator", "ClaimsManager", "FinanceOfficer", "Admin"];
    var VALID_CATEGORIES = ["Vehicle", "Health", "Property", "Life", "Business"];

    // Entity configuration: key -> OData entity set + number field
    var ENTITY = {
        employees:  { set: "Employees",  numberField: "employeeNumber", defaultPrefix: "EMP-" },
        customers:  { set: "Customers",  numberField: "customerNumber", defaultPrefix: "CUS-" },
        claimTypes: { set: "ClaimTypes", numberField: "code",           defaultPrefix: "POL"  }
    };

    // Used only when a policy category has no records yet
    var CATEGORY_PREFIX = {
        Vehicle:  "VEH",
        Health:   "HLT",
        Property: "PRO",
        Life:     "LIF",
        Business: "BUS"
    };

    return Controller.extend("claimsure.app.controller.Administration", {

        formatter: formatter,

        // ============================================================
        // INIT
        // ============================================================

        onInit: function () {

            this._employeeContext = null;
            this._customerContext = null;
            this._claimTypeContext = null;
            this._sSelectedCategory = "";

            // OData V4 list bindings + contexts (needed for update / delete)
            this._oBindings = {};
            this._ctx = { employees: {}, customers: {}, claimTypes: {} };

            this.getView().setModel(new JSONModel({
                employeeDepartments: [
                    "Claims Operations",
                    "Claims Management",
                    "Investigation",
                    "Finance",
                    "Administration"
                ],
                employeeRoles: VALID_ROLES,
                claimTypeCategories: VALID_CATEGORIES
            }), "adminOptions");

            this.getView().setModel(new JSONModel({
                showCategories: true,
                showTypes: false,
                selectedCategory: ""
            }), "policyView");

            // Table data, already sorted ascending (EMP-1, EMP-2 ... EMP-10)
            var oList = new JSONModel({
                busy: false,
                employees: [],
                customers: [],
                claimTypes: [],
                claimTypesView: []
            });
            oList.setSizeLimit(10000);
            this.getView().setModel(oList, "list");

            this._loadAll();
        },

        // ============================================================
        // COMMON HELPERS
        // ============================================================

        _getModel: function () {
            return this.getOwnerComponent().getModel("admin");
        },

        _getList: function () {
            return this.getView().getModel("list");
        },

        _getErrorMessage: function (oErr) {
            if (!oErr) {
                return "Unknown error occurred.";
            }
            return oErr.message || "Operation failed.";
        },

        // Natural ascending compare: EMP-2 < EMP-10, VEH9 < VEH10
        _compare: function (sField) {
            return function (a, b) {
                return String(a[sField] || "").localeCompare(
                    String(b[sField] || ""),
                    undefined,
                    { numeric: true, sensitivity: "base" }
                );
            };
        },

        // Reads all rows from the OData service, sorts them ascending
        // and puts them in the JSON model used by the tables.
        _load: function (sKey) {

            var oConfig = ENTITY[sKey];
            var oModel = this._getModel();
            var oList = this._getList();

            if (!oModel) {
                return Promise.resolve();
            }

            var oBinding = oModel.bindList("/" + oConfig.set);

            oList.setProperty("/busy", true);

            return oBinding.requestContexts(0, 5000)
                .then(function (aContexts) {

                    var mContexts = {};
                    var aRows = [];

                    aContexts.forEach(function (oCtx) {
                        // copy: the JSON model must not change the OData cache
                        var oRow = JSON.parse(JSON.stringify(oCtx.getObject()));
                        mContexts[oRow.ID] = oCtx;
                        aRows.push(oRow);
                    });

                    aRows.sort(this._compare(oConfig.numberField));

                    var oOld = this._oBindings[sKey];

                    this._oBindings[sKey] = oBinding;
                    this._ctx[sKey] = mContexts;

                    oList.setProperty("/" + sKey, aRows);

                    if (sKey === "claimTypes") {
                        this._updateClaimTypeView();
                    }

                    if (oOld) {
                        try {
                            oOld.destroy();
                        } catch (e) {
                            // ignore
                        }
                    }
                }.bind(this))
                .catch(function (oErr) {
                    console.error("[Admin] Load " + sKey + " failed:", oErr);
                    MessageBox.error(this._getErrorMessage(oErr));
                }.bind(this))
                .then(function () {
                    oList.setProperty("/busy", false);
                });
        },

        _loadAll: function () {
            return Promise.all([
                this._load("employees"),
                this._load("customers"),
                this._load("claimTypes")
            ]);
        },

        _updateClaimTypeView: function () {

            var oList = this._getList();
            var sCategory = this._sSelectedCategory;

            var aAll = oList.getProperty("/claimTypes") || [];

            oList.setProperty(
                "/claimTypesView",
                aAll.filter(function (oRow) {
                    return oRow.category === sCategory;
                })
            );
        },

        // Next number = highest existing number + 1, same prefix/format
        // VEH10 -> VEH11, EMP-19 -> EMP-20, VEH009 -> VEH010
        _nextNumber: function (aRows, sField, sDefaultPrefix) {

            var iMax = 0;
            var sPrefix = sDefaultPrefix;
            var iPad = 0;

            aRows.forEach(function (oRow) {

                var aMatch = /^(.*?)(\d+)$/.exec(oRow[sField] || "");

                if (!aMatch) {
                    return;
                }

                var iNum = parseInt(aMatch[2], 10);

                if (iNum >= iMax) {
                    iMax = iNum;
                    sPrefix = aMatch[1];
                    iPad = (aMatch[2].length > 1 && aMatch[2].charAt(0) === "0")
                        ? aMatch[2].length
                        : 0;
                }
            });

            var sNumber = String(iMax + 1);

            while (sNumber.length < iPad) {
                sNumber = "0" + sNumber;
            }

            return sPrefix + sNumber;
        },

        _getRowContext: function (oEvent, sKey) {

            var oRow = oEvent.getSource().getBindingContext("list");

            if (!oRow) {
                return null;
            }

            return (this._ctx[sKey] || {})[oRow.getProperty("ID")] || null;
        },

        // Creates a record (number is already in oData)
        _createEntity: function (sKey, oData) {

            var oContext = this._getModel()
                .bindList("/" + ENTITY[sKey].set)
                .create(oData, true);

            return oContext.created();
        },

        _afterSave: function (sMessage, sKey, sContextProp, oDialog) {

            MessageToast.show(sMessage);

            this[sContextProp] = null;
            oDialog.close();

            return this._load(sKey);
        },

        _onSaveError: function (sLog, oErr) {
            console.error(sLog, oErr);
            MessageBox.error(this._getErrorMessage(oErr));
        },

        _confirmDelete: function (oContext, sText, sToast, sKey) {

            MessageBox.confirm(sText, {
                title: "Confirm Delete",
                actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.OK,
                onClose: function (sAction) {

                    if (sAction !== MessageBox.Action.OK) {
                        return;
                    }

                    oContext.delete()
                        .then(function () {
                            MessageToast.show(sToast);
                            return this._load(sKey);
                        }.bind(this))
                        .catch(function (oErr) {
                            console.error("[Admin] Delete failed:", oErr);
                            MessageBox.error(this._getErrorMessage(oErr));
                        }.bind(this));

                }.bind(this)
            });
        },

        _changeStatus: function (oEvent, sAction, sIdParam, sOn, sOff, sFail) {

            var oSwitch = oEvent.getSource();
            var bNewState = oEvent.getParameter("state");
            var oRow = oSwitch.getBindingContext("list");

            if (!oRow) {
                MessageBox.error("Context not found.");
                return;
            }

            var oOperation = this._getModel().bindContext("/" + sAction + "(...)");
            oOperation.setParameter(sIdParam, oRow.getProperty("ID"));
            oOperation.setParameter("active", bNewState);

            oOperation.execute()
                .then(function () {
                    MessageToast.show(bNewState ? sOn : sOff);
                })
                .catch(function (oErr) {
                    console.error("[Admin] Status error:", oErr);
                    oSwitch.setState(!bNewState);
                    MessageBox.error(oErr.message || sFail);
                });
        },

        // ============================================================
        // TABS / REFRESH
        // ============================================================

        onTabSelect: function (oEvent) {

            var sKey = oEvent.getParameter("key");

            if (ENTITY[sKey]) {
                this._load(sKey);
            }
        },

        onRefreshEmployees: function () {
            this._load("employees").then(function () {
                MessageToast.show("Employees refreshed");
            });
        },

        onRefreshCustomers: function () {
            this._load("customers").then(function () {
                MessageToast.show("Customers refreshed");
            });
        },

        onRefreshClaimTypes: function () {
            this._load("claimTypes").then(function () {
                MessageToast.show("Policies refreshed");
            });
        },

        // ============================================================
        // ACTIVE / INACTIVE SWITCHES
        // ============================================================

        onEmployeeActiveChange: function (oEvent) {
            this._changeStatus(
                oEvent, "changeEmployeeStatus", "employeeId",
                "Employee activated", "Employee deactivated",
                "Could not update employee status."
            );
        },

        onClaimTypeActiveChange: function (oEvent) {
            this._changeStatus(
                oEvent, "changeClaimTypeStatus", "claimTypeId",
                "Policy type activated", "Policy type deactivated",
                "Could not update policy type status."
            );
        },

        // ============================================================
        // EMPLOYEES
        // ============================================================

        onCreateEmployee: function () {

            this._employeeContext = null;

            var oDialog = this.byId("employeeDialog");
            oDialog.setTitle("New Employee");

            oDialog.setModel(new JSONModel({
                firstName: "",
                lastName: "",
                email: "",
                department: "Claims Operations",
                role: "ClaimsAgent",
                active: true
            }), "draft");

            oDialog.open();
        },

        onEditEmployee: function (oEvent) {

            var oContext = this._getRowContext(oEvent, "employees");

            if (!oContext) {
                MessageBox.error("Employee context not found. Please refresh and try again.");
                return;
            }

            this._employeeContext = oContext;

            var oData = oContext.getObject();
            var oDialog = this.byId("employeeDialog");
            oDialog.setTitle("Edit Employee");

            oDialog.setModel(new JSONModel({
                firstName: oData.firstName || "",
                lastName: oData.lastName || "",
                email: oData.email || "",
                department: oData.department || "",
                role: oData.role || "",
                active: oData.active !== false
            }), "draft");

            oDialog.open();
        },

        onSaveEmployee: function () {

            var oDialog = this.byId("employeeDialog");
            var oDraft = oDialog.getModel("draft").getData();

            var sFirstName = (oDraft.firstName || "").trim();
            var sLastName = (oDraft.lastName || "").trim();
            var sEmail = (oDraft.email || "").trim();
            var sDepartment = (oDraft.department || "").trim();
            var sRole = (oDraft.role || "").trim();

            if (!sFirstName) {
                MessageBox.warning("Please enter First Name.");
                return;
            }

            if (!sLastName) {
                MessageBox.warning("Please enter Last Name.");
                return;
            }

            if (!sEmail) {
                MessageBox.warning("Please enter Email.");
                return;
            }

            if (!EMAIL_PATTERN.test(sEmail)) {
                MessageBox.warning(
                    "Please enter a valid email address.\n\nExample: john@example.com"
                );
                return;
            }

            if (sRole && VALID_ROLES.indexOf(sRole) === -1) {
                MessageBox.warning("Please select a valid Employee Role.");
                return;
            }

            if (!this._getModel()) {
                MessageBox.error("Administration OData model is not available.");
                return;
            }

            // ---------------- UPDATE ----------------
            if (this._employeeContext) {

                var oCtx = this._employeeContext;

                Promise.resolve()
                    .then(function () {
                        return Promise.all([
                            oCtx.setProperty("firstName", sFirstName),
                            oCtx.setProperty("lastName", sLastName),
                            oCtx.setProperty("email", sEmail),
                            oCtx.setProperty("department", sDepartment || null),
                            oCtx.setProperty("role", sRole || null),
                            oCtx.setProperty("active", oDraft.active !== false)
                        ]);
                    })
                    .then(function () {
                        return this._afterSave(
                            "Employee updated successfully",
                            "employees", "_employeeContext", oDialog
                        );
                    }.bind(this))
                    .catch(this._onSaveError.bind(this, "[Admin] Update employee failed:"));

                return;
            }

            // ---------------- CREATE ----------------
            // reload first so the next number is based on the latest data
            this._load("employees")
                .then(function () {

                    var sNumber = this._nextNumber(
                        this._getList().getProperty("/employees"),
                        "employeeNumber",
                        ENTITY.employees.defaultPrefix
                    );

                    return this._createEntity("employees", {
                        employeeNumber: sNumber,
                        firstName: sFirstName,
                        lastName: sLastName,
                        email: sEmail,
                        department: sDepartment || null,
                        role: sRole || null,
                        active: oDraft.active !== false
                    });
                }.bind(this))
                .then(function () {
                    return this._afterSave(
                        "Employee created successfully",
                        "employees", "_employeeContext", oDialog
                    );
                }.bind(this))
                .catch(this._onSaveError.bind(this, "[Admin] Create employee failed:"));
        },

        onCancelEmployee: function () {
            this._employeeContext = null;
            this.byId("employeeDialog").close();
        },

        onDeleteEmployee: function (oEvent) {

            var oContext = this._getRowContext(oEvent, "employees");

            if (!oContext) {
                MessageBox.error("Employee context not found. Please refresh and try again.");
                return;
            }

            var oData = oContext.getObject();

            this._confirmDelete(
                oContext,
                "Delete employee " + oData.employeeNumber +
                " (" + oData.firstName + " " + oData.lastName + ")?",
                "Employee deleted",
                "employees"
            );
        },

        // ============================================================
        // CUSTOMERS
        // ============================================================

        onCreateCustomer: function () {

            this._customerContext = null;

            var oDialog = this.byId("customerDialog");
            oDialog.setTitle("New Customer");

            oDialog.setModel(new JSONModel({
                firstName: "",
                lastName: "",
                email: "",
                phone: "",
                status: "Active"
            }), "draft");

            oDialog.open();
        },

        onEditCustomer: function (oEvent) {

            var oContext = this._getRowContext(oEvent, "customers");

            if (!oContext) {
                MessageBox.error("Customer context not found. Please refresh and try again.");
                return;
            }

            this._customerContext = oContext;

            var oData = oContext.getObject();
            var oDialog = this.byId("customerDialog");
            oDialog.setTitle("Edit Customer");

            oDialog.setModel(new JSONModel({
                firstName: oData.firstName || "",
                lastName: oData.lastName || "",
                email: oData.email || "",
                phone: oData.phone || "",
                status: oData.status || "Active"
            }), "draft");

            oDialog.open();
        },

        onSaveCustomer: function () {

            var oDialog = this.byId("customerDialog");
            var oDraft = oDialog.getModel("draft").getData();

            var sFirstName = (oDraft.firstName || "").trim();
            var sLastName = (oDraft.lastName || "").trim();
            var sEmail = (oDraft.email || "").trim();
            var sPhone = (oDraft.phone || "").trim();
            var sStatus = oDraft.status || "Active";

            if (!sFirstName) {
                MessageBox.warning("Please enter First Name.");
                return;
            }

            if (!sLastName) {
                MessageBox.warning("Please enter Last Name.");
                return;
            }

            if (!sEmail) {
                MessageBox.warning("Please enter Email.");
                return;
            }

            if (!EMAIL_PATTERN.test(sEmail)) {
                MessageBox.warning("Please enter a valid email address.");
                return;
            }

            if (!this._getModel()) {
                MessageBox.error("Administration OData model is not available.");
                return;
            }

            // ---------------- UPDATE ----------------
            if (this._customerContext) {

                var oCtx = this._customerContext;

                Promise.resolve()
                    .then(function () {
                        return Promise.all([
                            oCtx.setProperty("firstName", sFirstName),
                            oCtx.setProperty("lastName", sLastName),
                            oCtx.setProperty("email", sEmail),
                            oCtx.setProperty("phone", sPhone || null),
                            oCtx.setProperty("status", sStatus)
                        ]);
                    })
                    .then(function () {
                        return this._afterSave(
                            "Customer updated successfully",
                            "customers", "_customerContext", oDialog
                        );
                    }.bind(this))
                    .catch(this._onSaveError.bind(this, "[Admin] Update customer failed:"));

                return;
            }

            // ---------------- CREATE ----------------
            this._load("customers")
                .then(function () {

                    var sNumber = this._nextNumber(
                        this._getList().getProperty("/customers"),
                        "customerNumber",
                        ENTITY.customers.defaultPrefix
                    );

                    return this._createEntity("customers", {
                        customerNumber: sNumber,
                        firstName: sFirstName,
                        lastName: sLastName,
                        email: sEmail,
                        phone: sPhone || null,
                        status: sStatus
                    });
                }.bind(this))
                .then(function () {
                    return this._afterSave(
                        "Customer created successfully",
                        "customers", "_customerContext", oDialog
                    );
                }.bind(this))
                .catch(this._onSaveError.bind(this, "[Admin] Create customer failed:"));
        },

        onCancelCustomer: function () {
            this._customerContext = null;
            this.byId("customerDialog").close();
        },

        onDeleteCustomer: function (oEvent) {

            var oContext = this._getRowContext(oEvent, "customers");

            if (!oContext) {
                MessageBox.error("Customer context not found. Please refresh and try again.");
                return;
            }

            var oData = oContext.getObject();

            this._confirmDelete(
                oContext,
                "Delete customer " + oData.customerNumber +
                " (" + oData.firstName + " " + oData.lastName + ")?",
                "Customer deleted",
                "customers"
            );
        },

        // ============================================================
        // POLICY CATEGORY NAVIGATION
        // ============================================================

        onCategoryPress: function (oEvent) {

            this._sSelectedCategory = oEvent.getSource().data("category");

            this._updateClaimTypeView();

            var oPolicyView = this.getView().getModel("policyView");
            oPolicyView.setProperty("/selectedCategory", this._sSelectedCategory);
            oPolicyView.setProperty("/showCategories", false);
            oPolicyView.setProperty("/showTypes", true);

            // always show fresh data when a tile is opened
            this._load("claimTypes");
        },

        onBackToCategories: function () {

            this._sSelectedCategory = "";
            this._updateClaimTypeView();

            var oPolicyView = this.getView().getModel("policyView");
            oPolicyView.setProperty("/showCategories", true);
            oPolicyView.setProperty("/showTypes", false);
            oPolicyView.setProperty("/selectedCategory", "");
        },

        // ============================================================
        // POLICY TYPES
        // ============================================================

        onCreateClaimType: function () {

            this._claimTypeContext = null;

            var oDialog = this.byId("claimTypeDialog");
            oDialog.setTitle("New " + this._sSelectedCategory + " Policy Type");

            oDialog.setModel(new JSONModel({
                name: "",
                category: this._sSelectedCategory,
                active: true
            }), "draft");

            oDialog.open();
        },

        onEditClaimType: function (oEvent) {

            var oContext = this._getRowContext(oEvent, "claimTypes");

            if (!oContext) {
                MessageBox.error("Policy type context not found. Please refresh and try again.");
                return;
            }

            this._claimTypeContext = oContext;

            var oData = oContext.getObject();
            var oDialog = this.byId("claimTypeDialog");
            oDialog.setTitle("Edit Policy Type");

            oDialog.setModel(new JSONModel({
                name: oData.name || "",
                category: oData.category || "",
                active: oData.active !== false
            }), "draft");

            oDialog.open();
        },

        onSaveClaimType: function () {

            var oDialog = this.byId("claimTypeDialog");
            var oDraft = oDialog.getModel("draft").getData();

            var sName = (oDraft.name || "").trim();
            var sCategory = (oDraft.category || "").trim();

            if (!sName) {
                MessageBox.warning("Please enter Policy Type Name.");
                return;
            }

            if (!sCategory || VALID_CATEGORIES.indexOf(sCategory) === -1) {
                MessageBox.warning("Please select a valid Policy Category.");
                return;
            }

            if (!this._getModel()) {
                MessageBox.error("Administration OData model is not available.");
                return;
            }

            // ---------------- UPDATE ----------------
            if (this._claimTypeContext) {

                var oCtx = this._claimTypeContext;

                Promise.resolve()
                    .then(function () {
                        return Promise.all([
                            oCtx.setProperty("name", sName),
                            oCtx.setProperty("category", sCategory),
                            oCtx.setProperty("active", oDraft.active !== false)
                        ]);
                    })
                    .then(function () {
                        return this._afterSave(
                            "Policy type updated successfully",
                            "claimTypes", "_claimTypeContext", oDialog
                        );
                    }.bind(this))
                    .catch(this._onSaveError.bind(this, "[Admin] Update policy type failed:"));

                return;
            }

            // ---------------- CREATE ----------------
            // next code is calculated per category: VEH10 -> VEH11
            this._load("claimTypes")
                .then(function () {

                    var aInCategory = (this._getList().getProperty("/claimTypes") || [])
                        .filter(function (oRow) {
                            return oRow.category === sCategory;
                        });

                    var sCode = this._nextNumber(
                        aInCategory,
                        "code",
                        CATEGORY_PREFIX[sCategory] || ENTITY.claimTypes.defaultPrefix
                    );

                    return this._createEntity("claimTypes", {
                        code: sCode,
                        name: sName,
                        category: sCategory,
                        active: oDraft.active !== false
                    });
                }.bind(this))
                .then(function () {
                    return this._afterSave(
                        "Policy type created successfully",
                        "claimTypes", "_claimTypeContext", oDialog
                    );
                }.bind(this))
                .catch(this._onSaveError.bind(this, "[Admin] Create policy type failed:"));
        },

        onCancelClaimType: function () {
            this._claimTypeContext = null;
            this.byId("claimTypeDialog").close();
        },

        onDeleteClaimType: function (oEvent) {

            var oContext = this._getRowContext(oEvent, "claimTypes");

            if (!oContext) {
                MessageBox.error("Policy type context not found. Please refresh and try again.");
                return;
            }

            var oData = oContext.getObject();

            this._confirmDelete(
                oContext,
                "Delete policy type " + oData.code + " (" + oData.name + ")?",
                "Policy type deleted",
                "claimTypes"
            );
        }

    });
});