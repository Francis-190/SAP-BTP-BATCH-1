sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/odata/v4/ODataModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "claimsure/app/model/formatter"
], function (
    Controller,
    JSONModel,
    ODataModel,
    Filter,
    FilterOperator,
    MessageBox,
    formatter
) {

    "use strict";

    return Controller.extend("claimsure.app.controller.ClaimDetail", {

        formatter: formatter,

        onInit: function () {

            this._sClaimId = null;

            /* ============================================================
             * CLAIM DETAIL JSON MODEL
             * ============================================================ */

            var oDetailModel = new JSONModel({
                busy: false,

                ID: "",
                claimNumber: "",
                customer_ID: "",
                claimType_ID: "",
                policy_ID: "",
                incidentDate: "",
                description: "",
                claimedAmount: "",
                status: "",

                assignedAgent_ID: "",
                assignedAgentDisplay: "Not Assigned",

                employeeNumber: "",
                department: "",
                role: "",
                email: "",

                policy: null,
                documents: [],

                fraudRiskScores: []
            });

            this.getView().setModel(
                oDetailModel,
                "claimDetail"
            );


            /* ============================================================
             * MAIN SERVICE MODEL
             * Used for Employees
             * ============================================================ */

            this._oMainModel = new ODataModel({
                serviceUrl: "/odata/v4/main/",
                synchronizationMode: "None",
                autoExpandSelect: true
            });


            /* ============================================================
             * INVESTIGATION SERVICE MODEL
             * Used for FraudRiskScores
             * ============================================================ */

            this._oInvestigationModel = new ODataModel({
                serviceUrl: "/odata/v4/investigation/",
                synchronizationMode: "None",
                autoExpandSelect: true
            });

            this.getView().setModel(
                this._oInvestigationModel,
                "investigation"
            );


            /* ============================================================
             * ROUTE
             * ============================================================ */

            this.getOwnerComponent()
                .getRouter()
                .getRoute("claimDetail")
                .attachPatternMatched(
                    this._onRouteMatched,
                    this
                );
        },


        /* ================================================================
         * ROUTE MATCHED
         * ================================================================ */

        _onRouteMatched: function (oEvent) {

            var oArguments =
                oEvent.getParameter("arguments");

            this._sClaimId =
                oArguments.claimId;

            console.log(
                "[ClaimDetail] Claim ID:",
                this._sClaimId
            );

            if (!this._sClaimId) {

                MessageBox.error(
                    "Claim ID is missing from the route."
                );

                return;
            }

            this._loadClaim(
                this._sClaimId
            );
        },


        /* ================================================================
         * LOAD CLAIM
         * ================================================================ */

        _loadClaim: async function (sClaimId) {

            var oInsuranceModel =
                this.getView().getModel();

            var oDetailModel =
                this.getView().getModel(
                    "claimDetail"
                );


            if (!oInsuranceModel) {

                MessageBox.error(
                    "InsuranceService OData model is not available."
                );

                return;
            }


            oDetailModel.setProperty(
                "/busy",
                true
            );


            try {

                /* ========================================================
                 * LOAD CLAIM
                 * ======================================================== */

                var oClaimBinding =
                    oInsuranceModel.bindContext(
                        "/Claims(" + sClaimId + ")",
                        undefined,
                        {
                            $expand:
                                "policy,documents"
                        }
                    );


                var oClaim =
                    await oClaimBinding.requestObject();


                if (!oClaim) {

                    MessageBox.error(
                        "Claim not found."
                    );

                    return;
                }


                console.log(
                    "[ClaimDetail] Claim:",
                    oClaim
                );


                console.log(
                    "[ClaimDetail] assignedAgent_ID:",
                    oClaim.assignedAgent_ID
                );


                /* ========================================================
                 * SET CLAIM DATA
                 * ======================================================== */

                oDetailModel.setData({

                    busy: false,

                    ID:
                        oClaim.ID || "",

                    claimNumber:
                        oClaim.claimNumber || "",

                    customer_ID:
                        oClaim.customer_ID || "",

                    claimType_ID:
                        oClaim.claimType_ID || "",

                    policy_ID:
                        oClaim.policy_ID || "",

                    incidentDate:
                        oClaim.incidentDate || "",

                    description:
                        oClaim.description || "",

                    claimedAmount:
                        oClaim.claimedAmount || "",

                    status:
                        oClaim.status || "",

                    assignedAgent_ID:
                        oClaim.assignedAgent_ID || "",

                    assignedAgentDisplay:
                        "Not Assigned",

                    employeeNumber: "",
                    department: "",
                    role: "",
                    email: "",

                    policy:
                        oClaim.policy || null,

                    documents:
                        oClaim.documents || [],

                    fraudRiskScores: []
                });


                /* ========================================================
                 * LOAD ASSIGNED EMPLOYEE
                 * ======================================================== */

                if (oClaim.assignedAgent_ID) {

                    await this._loadAssignedAgent(
                        oClaim.assignedAgent_ID
                    );

                } else {

                    console.warn(
                        "[ClaimDetail] No assigned agent ID."
                    );

                    oDetailModel.setProperty(
                        "/assignedAgentDisplay",
                        "Not Assigned"
                    );
                }


                /* ========================================================
                 * LOAD FRAUD RISK SCORES
                 * ======================================================== */

                await this._loadFraudRiskScores(
                    sClaimId
                );


            } catch (oError) {

                console.error(
                    "[ClaimDetail] Error loading claim:",
                    oError
                );

                MessageBox.error(
                    "Could not load claim details.\n\n" +
                    (
                        oError &&
                            oError.message
                            ? oError.message
                            : "Unknown error"
                    )
                );

            } finally {

                oDetailModel.setProperty(
                    "/busy",
                    false
                );
            }
        },


        /* ================================================================
         * LOAD ASSIGNED EMPLOYEE
         * ================================================================ */

        _loadAssignedAgent: async function (
            sEmployeeId
        ) {

            var oDetailModel =
                this.getView().getModel(
                    "claimDetail"
                );


            if (!sEmployeeId) {

                oDetailModel.setProperty(
                    "/assignedAgentDisplay",
                    "Not Assigned"
                );

                return;
            }


            console.log(
                "[ClaimDetail] Fetching employee:",
                sEmployeeId
            );


            try {

                var oEmployeeBinding =
                    this._oMainModel.bindContext(
                        "/Employees(" +
                        sEmployeeId +
                        ")",
                        undefined,
                        {
                            $select:
                                "ID,employeeNumber,firstName,lastName,department,role,email,active"
                        }
                    );


                var oEmployee =
                    await oEmployeeBinding.requestObject();


                console.log(
                    "[ClaimDetail] Employee response:",
                    oEmployee
                );


                if (!oEmployee) {

                    console.warn(
                        "[ClaimDetail] Employee not found."
                    );

                    oDetailModel.setProperty(
                        "/assignedAgentDisplay",
                        "Not Assigned"
                    );

                    return;
                }


                var sFullName = [
                    oEmployee.firstName,
                    oEmployee.lastName
                ]
                    .filter(Boolean)
                    .join(" ")
                    .trim();


                if (!sFullName) {
                    sFullName = "Not Assigned";
                }


                oDetailModel.setProperty(
                    "/assignedAgentDisplay",
                    sFullName
                );


                oDetailModel.setProperty(
                    "/employeeNumber",
                    oEmployee.employeeNumber || ""
                );

                oDetailModel.setProperty(
                    "/department",
                    oEmployee.department || ""
                );

                oDetailModel.setProperty(
                    "/role",
                    oEmployee.role || ""
                );

                oDetailModel.setProperty(
                    "/email",
                    oEmployee.email || ""
                );


                console.log(
                    "[ClaimDetail] Assigned Agent Name:",
                    sFullName
                );


            } catch (oError) {

                console.error(
                    "[ClaimDetail] Employee loading failed:",
                    oError
                );

                oDetailModel.setProperty(
                    "/assignedAgentDisplay",
                    "Not Assigned"
                );
            }
        },


        /* ================================================================
         * LOAD FRAUD RISK SCORES
         * ================================================================ */

        _loadFraudRiskScores: async function (sClaimId) {

            var oDetailModel =
                this.getView().getModel("claimDetail");

            if (!this._oInvestigationModel) {

                console.error(
                    "[ClaimDetail] Investigation model is not available."
                );

                return;
            }

            if (!sClaimId) {

                console.error(
                    "[ClaimDetail] Claim ID is missing."
                );

                return;
            }

            try {

                console.log(
                    "=============================================="
                );

                console.log(
                    "[ClaimDetail] Loading FraudRiskScores"
                );

                console.log(
                    "[ClaimDetail] Current Claim ID:",
                    sClaimId
                );

                console.log(
                    "[ClaimDetail] Investigation URL:",
                    this._oInvestigationModel.getServiceUrl()
                );


                /* ============================================================
                 * LOAD ALL FRAUD RISK SCORES
                 * We intentionally do NOT use claim_ID filter here.
                 * ============================================================ */

                var oBinding =
                    this._oInvestigationModel.bindList(
                        "/FraudRiskScores",
                        undefined,
                        undefined,
                        undefined,
                        {
                            $select:
                                "ID,claim_ID,riskScore,riskLevel"
                        }
                    );


                var aContexts =
                    await oBinding.requestContexts(
                        0,
                        100
                    );


                console.log(
                    "[ClaimDetail] Total FraudRiskScores:",
                    aContexts.length
                );


                var aAllScores =
                    aContexts.map(function (oContext) {

                        return oContext.getObject();

                    });


                console.log(
                    "[ClaimDetail] All FraudRiskScores:",
                    aAllScores
                );


                /* ============================================================
                 * FIND SCORE FOR CURRENT CLAIM
                 * ============================================================ */

                var aScores =
                    aAllScores.filter(function (oScore) {

                        return String(oScore.claim_ID) ===
                            String(sClaimId);

                    });


                console.log(
                    "[ClaimDetail] Matching FraudRiskScores:",
                    aScores
                );


                console.log(
                    "[ClaimDetail] Matching count:",
                    aScores.length
                );


                /* ============================================================
                 * SET DATA FOR UI
                 * ============================================================ */

                oDetailModel.setProperty(
                    "/fraudRiskScores",
                    aScores
                );


                console.log(
                    "[ClaimDetail] fraudRiskScores model value:",
                    oDetailModel.getProperty(
                        "/fraudRiskScores"
                    )
                );


                console.log(
                    "=============================================="
                );


            } catch (oError) {

                console.error(
                    "[ClaimDetail] FraudRiskScores loading failed:",
                    oError
                );

                console.error(
                    "[ClaimDetail] Error message:",
                    oError.message
                );

                oDetailModel.setProperty(
                    "/fraudRiskScores",
                    []
                );
            }
        },


        /* ================================================================
         * DOCUMENT PRESS
         * ================================================================ */

        onDocumentPress: function (oEvent) {

            var oDocument = oEvent.getSource()
                .getBindingContext("claimDetail")
                .getObject();

            if (!oDocument || !oDocument.ID) {
                MessageBox.error("Unable to open document.");
                return;
            }

            var oInsuranceModel = this.getView().getModel();

            if (!oInsuranceModel) {
                MessageBox.error("OData model is not available.");
                return;
            }

            var sBaseUrl = oInsuranceModel
                .getServiceUrl()
                .replace(/\/$/, "");

            var sUrl =
                sBaseUrl +
                "/ClaimDocuments(" +
                oDocument.ID +
                ")/content";

            console.log("========== DOCUMENT DEBUG ==========");
            console.log("Document object:", oDocument);
            console.log("Document ID:", oDocument.ID);
            console.log("File name:", oDocument.fileName);
            console.log("Media type:", oDocument.mediaType);
            console.log("Base URL:", sBaseUrl);
            console.log("Final document URL:", sUrl);
            console.log("====================================");

            window.open(sUrl, "_blank");
        },

        /* ================================================================
         * NAVIGATION BACK
         * ================================================================ */

        onNavBack: function () {

            this.getOwnerComponent()
                .getRouter()
                .navTo("claims");
        }

    });

});