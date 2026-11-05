sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (
    Controller,
    History,
    MessageBox,
    MessageToast
) {
    "use strict";

    return Controller.extend("dealermangement.controller.DealerDetails", {

        onInit: function () {
            const oRouter = this.getOwnerComponent().getRouter();

            oRouter
                .getRoute("DealerDetails")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            const sDealerId = oEvent.getParameter("arguments").dealerId;

            if (!sDealerId) {
                MessageBox.error("Dealer ID is missing.");
                return;
            }

            const oModel = this.getOwnerComponent().getModel();

            if (!oModel) {
                MessageBox.error("OData model is not available.");
                return;
            }

            // Dealers is draft-enabled, so the entity has two keys:
            // ID and IsActiveEntity. Both are required in the path.
            const sPath = "/Dealers(ID=" + sDealerId + ",IsActiveEntity=true)";
            const oView = this.getView();

            oView.setBusy(true);

            oView.bindElement({
                path: sPath,
                parameters: {
                    // Load the approval history together with the dealer
                    $expand: "approvalHistory"
                },
                events: {
                    dataRequested: function () {
                        oView.setBusy(true);
                    },
                    dataReceived: function (oDataEvent) {
                        oView.setBusy(false);

                        // dataReceived also fires when the request failed
                        if (oDataEvent && oDataEvent.getParameter("error")) {
                            MessageBox.error(
                                this._getErrorMessage(oDataEvent.getParameter("error"))
                            );
                        }
                    }.bind(this),
                    change: function () {
                        // The data may already be cached, in which case
                        // dataRequested / dataReceived never fire.
                        oView.setBusy(false);
                    }
                }
            });
        },

        onBack: function () {
            const sPreviousHash = History.getInstance().getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent()
                    .getRouter()
                    .navTo("RouteDealer", {}, true);
            }
        },

        /* ================================================================ */
        /* FORMATTERS                                                       */
        /* ================================================================ */

        formatStatusState: function (sStatus) {
            switch (sStatus) {
                case "ACTIVE":
                    return "Success";

                case "PENDING":
                case "SUBMITTED":
                    return "Warning";

                case "L1_APPROVED":
                    return "Information";

                case "REJECTED":
                case "BLOCKED":
                    return "Error";

                default:
                    return "None";
            }
        },

        // Used by the Approval History table in DealerDetails.view.xml
        formatActionState: function (sAction) {
            const sValue = String(sAction || "").toUpperCase();

            if (sValue.indexOf("REJECT") !== -1 || sValue.indexOf("BLOCK") !== -1) {
                return "Error";
            }

            if (sValue.indexOf("APPROVE") !== -1) {
                return "Success";
            }

            if (sValue.indexOf("SUBMIT") !== -1) {
                return "Warning";
            }

            return "None";
        },

        /* ================================================================ */
        /* WORKFLOW ACTIONS (Submit)                                        */
        /* ================================================================ */

        _getDealerContext: function () {
            const oContext = this.getView().getBindingContext();

            if (!oContext) {
                MessageBox.error("Dealer details are not loaded.");
                return null;
            }

            return oContext;
        },

        onSubmitDealer: function () {
            const oContext = this._getDealerContext();
            if (!oContext) return;

            MessageBox.confirm("Are you sure you want to submit this dealer?", {
                title: "Submit Dealer",
                emphasizedAction: MessageBox.Action.OK,
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) return;

                    this._executeAction(oContext, "submitDealer", {}, "Dealer submitted successfully.")
                        .catch(function () { /* error already shown */ });
                }.bind(this)
            });
        },

        _executeAction: async function (oContext, sActionName, mParameters, sSuccessMessage) {
            const oView = this.getView();

            try {
                const oAction = oContext.getModel().bindContext(
                    "DealerService." + sActionName + "(...)",
                    oContext
                );

                Object.keys(mParameters || {}).forEach(function (sParameter) {
                    oAction.setParameter(sParameter, mParameters[sParameter]);
                });

                oView.setBusy(true);

                await oAction.execute("$auto");

                // Refresh what the action changed: the status fields and the
                // approval history row that the action inserted. The Submit
                // button visibility re-evaluates from the new status.
                await oContext.requestSideEffects([
                    { $PropertyPath: "status" },
                    { $PropertyPath: "remarks" },
                    { $PropertyPath: "blockedReason" },
                    { $NavigationPropertyPath: "approvalHistory" }
                ], "$auto");

                oView.setBusy(false);

                MessageToast.show(sSuccessMessage);

            } catch (oError) {
                oView.setBusy(false);
                console.error("Action error:", oError);

                MessageBox.error(this._getErrorMessage(oError));

                throw oError;
            }
        },

        /* ================================================================ */
        /* HELPERS                                                          */
        /* ================================================================ */

        _getErrorMessage: function (oError) {
            if (oError && oError.message) return oError.message;
            if (oError && oError.cause && oError.cause.message) return oError.cause.message;

            return "Dealer operation failed.";
        }

    });
});