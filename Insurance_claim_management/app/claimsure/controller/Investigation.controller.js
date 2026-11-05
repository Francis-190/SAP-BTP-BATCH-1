sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/VBox",
    "sap/m/Label",
    "sap/m/Text",
    "sap/m/ObjectStatus",
    "sap/m/Button"
], function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    MessageToast,
    Dialog,
    VBox,
    Label,
    Text,
    ObjectStatus,
    Button
) {
    "use strict";

    return Controller.extend(
        "claimsure.app.controller.Investigation",
        {

            // =====================================================
            // INIT
            // =====================================================

            onInit: function () {

                // KPI MODEL
                // Do NOT overwrite the "investigation"
                // OData model from manifest.json.

                this.getView().setModel(
                    new JSONModel({
                        total: 0,
                        assigned: 0,
                        inProgress: 0,
                        completed: 0
                    }),
                    "investigationKpi"
                );


                // LOOKUP MODEL

                this.getView().setModel(
                    new JSONModel({
                        claims: [],
                        claimTypes: [],
                        employees: []
                    }),
                    "lookups"
                );


                this._loadKpis();

                this._loadLookups();
            },


            // =====================================================
            // LOAD KPI DATA
            // =====================================================

            _loadKpis: function () {

                var oModel =
                    this.getOwnerComponent()
                        .getModel("investigation");


                if (!oModel) {

                    console.error(
                        "Investigation OData model not found."
                    );

                    return;
                }


                var oBinding =
                    oModel.bindList(
                        "/Investigations"
                    );


                oBinding
                    .requestContexts(0, 1000)
                    .then(function (aContexts) {

                        var iTotal =
                            aContexts.length;

                        var iAssigned = 0;
                        var iInProgress = 0;
                        var iCompleted = 0;


                        aContexts.forEach(
                            function (oContext) {

                                var oData =
                                    oContext.getObject();


                                switch (oData.status) {

                                    case "Assigned":
                                        iAssigned++;
                                        break;

                                    case "InProgress":
                                        iInProgress++;
                                        break;

                                    case "Completed":
                                        iCompleted++;
                                        break;
                                }

                            }
                        );


                        this.getView()
                            .getModel(
                                "investigationKpi"
                            )
                            .setData({

                                total: iTotal,

                                assigned: iAssigned,

                                inProgress: iInProgress,

                                completed: iCompleted

                            });


                    }.bind(this))
                    .catch(function (oError) {

                        console.error(
                            "Failed to load investigation KPI:",
                            oError
                        );

                    });
            },


            // =====================================================
            // LOAD CLAIMS
            // =====================================================

            _loadLookups: function () {

                var oLookupModel =
                    this.getView()
                        .getModel("lookups");


                // =================================================
                // CLAIMS
                // InsuranceService
                // =================================================

                var oInsuranceModel =
                    this.getOwnerComponent()
                        .getModel();


                if (oInsuranceModel) {

                    oInsuranceModel
                        .bindList(
                            "/Claims",
                            {
                                $select:
                                    "ID,claimNumber,claimType_ID"
                            }
                        )
                        .requestContexts(0, 1000)
                        .then(function (aContexts) {

                            var aClaims =
                                aContexts.map(
                                    function (oContext) {

                                        return oContext
                                            .getObject();

                                    }
                                );


                            console.log(
                                "Claims loaded:",
                                aClaims
                            );


                            oLookupModel.setProperty(
                                "/claims",
                                aClaims
                            );


                            this._refreshInvestigationTable();

                        }.bind(this))
                        .catch(function (oError) {

                            console.error(
                                "Error loading Claims:",
                                oError
                            );

                        });
                }


                // =================================================
                // CLAIM TYPES
                // MainService
                // =================================================

                var oAdminModel =
                    this.getOwnerComponent()
                        .getModel("admin");


                if (!oAdminModel) {

                    console.error(
                        "Admin OData model not found."
                    );

                    return;
                }


                oAdminModel
                    .bindList(
                        "/ClaimTypes",
                        {
                            $select:
                                "ID,code,name,description,category,active"
                        }
                    )
                    .requestContexts(0, 1000)
                    .then(function (aContexts) {

                        var aClaimTypes =
                            aContexts.map(
                                function (oContext) {

                                    return oContext
                                        .getObject();

                                }
                            );


                        console.log(
                            "Claim Types loaded:",
                            aClaimTypes
                        );


                        oLookupModel.setProperty(
                            "/claimTypes",
                            aClaimTypes
                        );


                        this._refreshInvestigationTable();

                    }.bind(this))
                    .catch(function (oError) {

                        console.error(
                            "Error loading Claim Types:",
                            oError
                        );

                    });


                // =================================================
                // EMPLOYEES
                // MainService
                // =================================================

                oAdminModel
                    .bindList(
                        "/Employees",
                        {
                            $select:
                                "ID,employeeNumber,firstName,lastName,email,department,role,active"
                        }
                    )
                    .requestContexts(0, 1000)
                    .then(function (aContexts) {

                        var aEmployees =
                            aContexts.map(
                                function (oContext) {

                                    return oContext
                                        .getObject();

                                }
                            );


                        console.log(
                            "Employees loaded:",
                            aEmployees
                        );


                        oLookupModel.setProperty(
                            "/employees",
                            aEmployees
                        );


                        this._refreshInvestigationTable();

                    }.bind(this))
                    .catch(function (oError) {

                        console.error(
                            "Error loading Employees:",
                            oError
                        );

                    });
            },


            // =====================================================
            // REFRESH INVESTIGATION TABLE
            // =====================================================

            _refreshInvestigationTable: function () {

                var oTable =
                    this.byId(
                        "investigationsTable"
                    );


                if (!oTable) {
                    return;
                }


                var oBinding =
                    oTable.getBinding(
                        "items"
                    );


                if (!oBinding) {
                    return;
                }


                try {

                    oBinding.refresh();

                } catch (oError) {

                    console.error(
                        "Unable to refresh investigation table:",
                        oError
                    );

                }
            },


            // =====================================================
            // GET CLAIM NUMBER
            // =====================================================

            getClaimNumber: function (sClaimId) {

                if (!sClaimId) {
                    return "-";
                }


                var oLookupModel =
                    this.getView()
                        .getModel("lookups");


                if (!oLookupModel) {
                    return "-";
                }


                var aClaims =
                    oLookupModel
                        .getProperty("/claims") || [];


                var sId =
                    String(sClaimId)
                        .trim()
                        .toLowerCase();


                var oClaim =
                    aClaims.find(
                        function (oClaim) {

                            return String(
                                oClaim.ID || ""
                            )
                                .trim()
                                .toLowerCase() === sId;

                        }
                    );


                if (oClaim) {

                    return oClaim.claimNumber || "-";

                }


                return "-";
            },


            // =====================================================
            // GET CLAIM TYPE NAME
            // =====================================================

            getClaimTypeName: function (sClaimId) {

                if (!sClaimId) {
                    return "";
                }


                var oLookupModel =
                    this.getView()
                        .getModel("lookups");


                if (!oLookupModel) {
                    return "";
                }


                var aClaims =
                    oLookupModel
                        .getProperty("/claims") || [];


                var aClaimTypes =
                    oLookupModel
                        .getProperty("/claimTypes") || [];


                var sClaimIdNormalized =
                    String(sClaimId)
                        .trim()
                        .toLowerCase();


                // ---------------------------------------------
                // FIND CLAIM
                // ---------------------------------------------

                var oClaim =
                    aClaims.find(
                        function (oClaim) {

                            return String(
                                oClaim.ID || ""
                            )
                                .trim()
                                .toLowerCase() ===
                                sClaimIdNormalized;

                        }
                    );


                if (!oClaim) {
                    return "";
                }


                // ---------------------------------------------
                // GET claimType_ID
                // ---------------------------------------------

                var sClaimTypeId =
                    oClaim.claimType_ID;


                if (!sClaimTypeId) {
                    return "";
                }


                var sClaimTypeIdNormalized =
                    String(sClaimTypeId)
                        .trim()
                        .toLowerCase();


                // ---------------------------------------------
                // FIND CLAIM TYPE
                // ---------------------------------------------

                var oClaimType =
                    aClaimTypes.find(
                        function (oType) {

                            return String(
                                oType.ID || ""
                            )
                                .trim()
                                .toLowerCase() ===
                                sClaimTypeIdNormalized;

                        }
                    );


                if (!oClaimType) {
                    return "";
                }


                // Prefer name
                // Example: Vehicle Insurance

                return (
                    oClaimType.name ||
                    oClaimType.code ||
                    oClaimType.category ||
                    ""
                );
            },


            // =====================================================
            // GET INVESTIGATOR NAME
            // =====================================================

            getInvestigatorName: function (sEmployeeId) {

                if (!sEmployeeId) {
                    return "-";
                }


                var oLookupModel =
                    this.getView()
                        .getModel("lookups");


                if (!oLookupModel) {
                    return "-";
                }


                var aEmployees =
                    oLookupModel
                        .getProperty("/employees") || [];


                var sId =
                    String(sEmployeeId)
                        .trim()
                        .toLowerCase();


                var oEmployee =
                    aEmployees.find(
                        function (oEmployee) {

                            return String(
                                oEmployee.ID || ""
                            )
                                .trim()
                                .toLowerCase() === sId;

                        }
                    );


                if (!oEmployee) {
                    return "-";
                }


                var sFirstName =
                    oEmployee.firstName || "";


                var sLastName =
                    oEmployee.lastName || "";


                var sFullName =
                    (
                        sFirstName +
                        " " +
                        sLastName
                    ).trim();


                return (
                    sFullName ||
                    oEmployee.employeeNumber ||
                    "-"
                );
            },


            // =====================================================
            // SEARCH
            // =====================================================
onSearch: function (oEvent) {

    var sValue = oEvent.getParameter("query");

    if (sValue === undefined) {
        sValue = oEvent.getParameter("newValue");
    }

    sValue = (sValue || "").trim().toLowerCase();

    var oTable = this.byId("investigationsTable");

    if (!oTable) {
        console.error("Investigation table not found");
        return;
    }

    var aItems = oTable.getItems();

    console.log("Search:", sValue);
    console.log("Items:", aItems.length);

    // =====================================================
    // SHOW ALL WHEN SEARCH IS EMPTY
    // =====================================================

    if (!sValue) {

        aItems.forEach(function (oItem) {
            oItem.setVisible(true);
        });

        return;
    }


    // =====================================================
    // LOOKUP MODEL
    // =====================================================

    var oLookupModel = this.getView().getModel("lookups");

    var aClaims =
        oLookupModel.getProperty("/claims") || [];

    var aClaimTypes =
        oLookupModel.getProperty("/claimTypes") || [];

    var aEmployees =
        oLookupModel.getProperty("/employees") || [];


    // =====================================================
    // CHECK EACH ROW
    // =====================================================

    aItems.forEach(function (oItem) {

        var oContext =
            oItem.getBindingContext("investigation");

        if (!oContext) {
            oItem.setVisible(false);
            return;
        }

        var oData = oContext.getObject();

        if (!oData) {
            oItem.setVisible(false);
            return;
        }


        // =================================================
        // CLAIM TYPE
        // =================================================

        var sClaimName = "";

        var oClaim = aClaims.find(function (oClaim) {

            return String(oClaim.ID || "")
                .toLowerCase()
                ===
                String(oData.claim_ID || "")
                    .toLowerCase();

        });


        if (oClaim) {

            var oClaimType = aClaimTypes.find(
                function (oType) {

                    return String(oType.ID || "")
                        .toLowerCase()
                        ===
                        String(oClaim.claimType_ID || "")
                            .toLowerCase();

                }
            );

            if (oClaimType) {

                sClaimName =
                    oClaimType.name ||
                    oClaimType.code ||
                    oClaimType.category ||
                    "";
            }
        }


        // =================================================
        // INVESTIGATOR
        // =================================================

        var sInvestigatorName = "";

        var oEmployee = aEmployees.find(
            function (oEmployee) {

                return String(oEmployee.ID || "")
                    .toLowerCase()
                    ===
                    String(oData.investigator_ID || "")
                        .toLowerCase();

            }
        );


        if (oEmployee) {

            sInvestigatorName =
                (
                    (oEmployee.firstName || "") +
                    " " +
                    (oEmployee.lastName || "")
                ).trim();

            if (!sInvestigatorName) {

                sInvestigatorName =
                    oEmployee.employeeNumber || "";
            }
        }


        // =================================================
        // OTHER SEARCHABLE VALUES
        // =================================================

        var sInvestigationNumber =
            String(
                oData.investigationNumber || ""
            );

        var sStatus =
            String(
                oData.status || ""
            );

        var sFindings =
            String(
                oData.findings || ""
            );


        // =================================================
        // COMBINE EVERYTHING
        // =================================================

        var sSearchText = (

            sClaimName + " " +
            sInvestigatorName + " " +
            sInvestigationNumber + " " +
            sStatus + " " +
            sFindings

        ).toLowerCase();


        // =================================================
        // SHOW / HIDE ROW
        // =================================================

        oItem.setVisible(
            sSearchText.includes(sValue)
        );

    });

},
            // =====================================================
            // SELECT INVESTIGATION
            // =====================================================

            onInvestigationSelect: function (oEvent) {

                var oItem =
                    oEvent.getParameter(
                        "listItem"
                    );


                if (!oItem) {
                    return;
                }


                var oContext =
                    oItem.getBindingContext(
                        "investigation"
                    );


                if (!oContext) {
                    return;
                }


                var oData =
                    oContext.getObject();


                if (!oData) {
                    return;
                }


                MessageToast.show(
                    "Selected claim: " +
                    this.getClaimNumber(
                        oData.claim_ID
                    )
                );
            },


            // =====================================================
            // VIEW INVESTIGATION
            // =====================================================

            onInvestigationPress: function (oEvent) {

                var oItem =
                    oEvent.getSource();


                if (
                    oItem &&
                    oItem.isA("sap.m.Button")
                ) {

                    oItem =
                        oItem.getParent();
                }


                if (!oItem) {
                    return;
                }


                var oContext =
                    oItem.getBindingContext(
                        "investigation"
                    );


                if (!oContext) {
                    return;
                }


                var oData =
                    oContext.getObject();


                if (!oData) {
                    return;
                }


                this._showInvestigationDetails(
                    oData
                );
            },


            // =====================================================
            // DETAILS DIALOG
            // =====================================================

            _showInvestigationDetails: function (oData) {

                var oDialog =
                    this._oInvestigationDialog;


                if (!oDialog) {

                    oDialog =
                        new Dialog({

                            title:
                                "Investigation Details",

                            contentWidth:
                                "36rem",

                            content: [

                                new VBox({

                                    class:
                                        "sapUiMediumMargin",

                                    items: [

                                        // =====================
                                        // CLAIM
                                        // =====================

                                        new Label({
                                            text: "Claim"
                                        }),

                                        new Text({

                                            text: {
                                                path:
                                                    "selectedInvestigation>/claim_ID",

                                                formatter:
                                                    this.getClaimNumber
                                                        .bind(this)
                                            }

                                        }),


                                        // =====================
                                        // CLAIM TYPE
                                        // =====================

                                        new Label({

                                            text:
                                                "Claim Type",

                                            class:
                                                "sapUiSmallMarginTop"

                                        }),

                                        new Text({

                                            text: {
                                                path:
                                                    "selectedInvestigation>/claim_ID",

                                                formatter:
                                                    this.getClaimTypeName
                                                        .bind(this)
                                            }

                                        }),


                                        // =====================
                                        // INVESTIGATOR
                                        // =====================

                                        new Label({

                                            text:
                                                "Investigator",

                                            class:
                                                "sapUiSmallMarginTop"

                                        }),

                                        new Text({

                                            text: {

                                                path:
                                                    "selectedInvestigation>/investigator_ID",

                                                formatter:
                                                    this.getInvestigatorName
                                                        .bind(this)

                                            }

                                        }),


                                        // =====================
                                        // STATUS
                                        // =====================

                                        new Label({

                                            text:
                                                "Status",

                                            class:
                                                "sapUiSmallMarginTop"

                                        }),


                                        new ObjectStatus({

                                            text:
                                                "{selectedInvestigation>/status}",

                                            state: {

                                                path:
                                                    "selectedInvestigation>/status",

                                                formatter:
                                                    this.formatInvestigationState
                                                        .bind(this)

                                            }

                                        }),


                                        // =====================
                                        // FINDINGS
                                        // =====================

                                        new Label({

                                            text:
                                                "Findings",

                                            class:
                                                "sapUiSmallMarginTop"

                                        }),


                                        new Text({

                                            text:
                                                "{selectedInvestigation>/findings}",

                                            wrapping:
                                                true

                                        })

                                    ]

                                })

                            ],


                            endButton:
                                new Button({

                                    text:
                                        "Close",

                                    press:
                                        function () {

                                            oDialog.close();

                                        }

                                })

                        });


                    this._oInvestigationDialog =
                        oDialog;


                    this.getView()
                        .addDependent(
                            oDialog
                        );
                }


                oDialog.setModel(
                    new JSONModel(oData),
                    "selectedInvestigation"
                );


                oDialog.open();
            },


            // =====================================================
            // INVESTIGATION STATUS
            // =====================================================

          formatInvestigationState: function (sStatus) {
            switch (sStatus) {
                case "Assigned":
                    return "Warning";       // Orange

                case "InProgress":
                    return "Information";   // Blue

                case "Completed":
                    return "Success";       // Green

                case "Pending":
                    return "Warning";       // Orange

                case "Rejected":
                    return "Error";         // Red

                default:
                    return "None";
            }
        },


            // =====================================================
            // FRAUD RISK STATE
            // =====================================================

            formatRiskState:
                function (sRiskLevel) {

                    switch (sRiskLevel) {

                        case "Low":
                            return "Success";

                        case "Medium":
                            return "Warning";

                        case "High":
                            return "Error";

                        case "Critical":
                            return "Error";

                        default:
                            return "None";
                    }
                },


            // =====================================================
            // FRAUD RISK NUMBER STATE
            // =====================================================

            formatRiskNumberState:
                function (sRiskLevel) {

                    return this.formatRiskState(
                        sRiskLevel
                    );
                },


            // =====================================================
            // FRAUD RISK DESCRIPTION
            // =====================================================

            getRiskDescription:
                function (sRiskLevel) {

                    switch (sRiskLevel) {

                        case "Low":
                            return "Low fraud probability";

                        case "Medium":
                            return "Requires review";

                        case "High":
                            return "Investigation recommended";

                        case "Critical":
                            return "Immediate investigation required";

                        default:
                            return "-";
                    }
                },


            // =====================================================
            // APPROVAL DECISION STATE
            // =====================================================

            formatDecisionState:
                function (sDecision) {

                    switch (sDecision) {

                        case "Approved":
                            return "Success";

                        case "Rejected":
                            return "Error";

                        case "Pending":
                            return "Warning";

                        default:
                            return "None";
                    }
                }

        }
    );
});