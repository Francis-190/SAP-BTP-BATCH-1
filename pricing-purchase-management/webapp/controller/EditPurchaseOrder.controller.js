sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (
    Controller,
    MessageBox,
    MessageToast
) {
    "use strict";

    return Controller.extend(
        "purchasemanagement.controller.EditPurchaseOrder",
        {

            // =====================================================
            // INIT
            // =====================================================

            onInit: function () {

                console.log(
                    "EditPurchaseOrder Controller Loaded"
                );

                var oRouter =
                    this.getOwnerComponent()
                        .getRouter();

                var oRoute =
                    oRouter.getRoute(
                        "EditPurchaseOrder"
                    );

                if (!oRoute) {

                    console.error(
                        "EditPurchaseOrder route not found."
                    );

                    MessageBox.error(
                        "Edit Purchase Order route is not configured."
                    );

                    return;
                }

                console.log(
                    "EditPurchaseOrder route found."
                );

                oRoute.attachPatternMatched(
                    this._onRouteMatched,
                    this
                );
            },


            // =====================================================
            // LOAD PURCHASE ORDER
            // =====================================================

            _onRouteMatched: async function (
                oEvent
            ) {

                console.log(
                    "========== EDIT ROUTE MATCHED =========="
                );

                var oArguments =
                    oEvent.getParameter(
                        "arguments"
                    );

                var sID =
                    oArguments &&
                    oArguments.ID;

                console.log(
                    "Route Arguments:",
                    oArguments
                );

                console.log(
                    "Purchase Order ID:",
                    sID
                );

                if (!sID) {

                    MessageBox.error(
                        "Purchase Order ID is missing."
                    );

                    return;
                }

                var oModel =
                    this.getOwnerComponent()
                        .getModel("purchase");

                if (!oModel) {

                    oModel =
                        this.getOwnerComponent()
                            .getModel();
                }

                if (!oModel) {

                    MessageBox.error(
                        "Purchase Order OData model is not available."
                    );

                    return;
                }

                // Set named model on the view
                this.getView().setModel(
                    oModel,
                    "purchase"
                );

                try {

                    sap.ui.core.BusyIndicator.show(0);

                    /*
                     * OData V4 entity path
                     */
                    var sPath =
                        "/PurchaseOrders(" +
                        sID +
                        ")";

                    console.log(
                        "OData Request Path:",
                        sPath
                    );

                    /*
                     * Bind Purchase Order.
                     *
                     * dealer
                     * items
                     * items/product
                     */
                    var oBinding =
                        oModel.bindContext(
                            sPath,
                            null,
                            {
                                $expand:
                                    "dealer,items($expand=product)"
                            }
                        );

                    /*
                     * Request PO from backend
                     */
                    var oPO =
                        await oBinding.requestObject();

                    console.log(
                        "Purchase Order Loaded:",
                        oPO
                    );

                    if (!oPO) {

                        MessageBox.error(
                            "Purchase Order not found."
                        );

                        this._goBack();

                        return;
                    }

                    /*
                     * Only PENDING PO can be edited
                     */
                    if (
                        oPO.status !== "PENDING"
                    ) {

                        MessageBox.warning(
                            "Only PENDING Purchase Orders can be edited."
                        );

                        this._goBack();

                        return;
                    }

                    /*
                     * Store binding context
                     */
                    this._oPOContext =
                        oBinding.getBoundContext();

                    /*
                     * Bind complete view to PO
                     */
                    this.getView()
                        .setBindingContext(
                            this._oPOContext,
                            "purchase"
                        );

                    console.log(
                        "Purchase Order successfully bound to Edit page."
                    );

                    /*
                     * Recalculate totals
                     */
                    this._recalculateTotals();

                } catch (oError) {

                    console.error(
                        "EDIT LOAD ERROR:",
                        oError
                    );

                    MessageBox.error(
                        this._getErrorMessage(
                            oError
                        )
                    );

                } finally {

                    sap.ui.core.BusyIndicator.hide();
                }
            },


            // =====================================================
            // QUANTITY CHANGE
            // =====================================================

            onQuantityChange: function (
                oEvent
            ) {

                console.log(
                    "Quantity changed."
                );

                var oSource =
                    oEvent.getSource();

                var oContext =
                    oSource.getBindingContext(
                        "purchase"
                    );

                if (!oContext) {

                    MessageBox.error(
                        "Purchase Order item context not found."
                    );

                    return;
                }

                var iQuantity =
                    Number(
                        oEvent.getParameter(
                            "value"
                        )
                    );

                if (
                    !iQuantity ||
                    iQuantity <= 0
                ) {

                    MessageToast.show(
                        "Quantity must be greater than zero."
                    );

                    return;
                }

                var oItem =
                    oContext.getObject();

                if (!oItem) {

                    MessageBox.error(
                        "Purchase Order item not found."
                    );

                    return;
                }

                var nUnitPrice =
                    Number(
                        oItem.unitPrice || 0
                    );

                var nLineTotal =
                    iQuantity *
                    nUnitPrice;

                /*
                 * Update quantity
                 */
                oContext.setProperty(
                    "quantity",
                    iQuantity
                );

                /*
                 * Update line total
                 */
                oContext.setProperty(
                    "lineTotal",
                    Number(
                        nLineTotal.toFixed(2)
                    )
                );

                console.log(
                    "Quantity:",
                    iQuantity
                );

                console.log(
                    "Unit Price:",
                    nUnitPrice
                );

                console.log(
                    "Line Total:",
                    nLineTotal
                );

                /*
                 * Recalculate PO total
                 */
                this._recalculateTotals();
            },


            // =====================================================
            // RECALCULATE TOTALS
            // =====================================================

            _recalculateTotals: function () {

                var oContext =
                    this.getView()
                        .getBindingContext(
                            "purchase"
                        );

                if (!oContext) {
                    return;
                }

                var oPO =
                    oContext.getObject();

                if (
                    !oPO ||
                    !oPO.items
                ) {
                    return;
                }

                var nSubtotal = 0;

                oPO.items.forEach(
                    function (oItem) {

                        nSubtotal +=
                            Number(
                                oItem.lineTotal || 0
                            );
                    }
                );

                /*
                 * GST = 18%
                 */
                var nTax =
                    Number(
                        (
                            nSubtotal * 0.18
                        ).toFixed(2)
                    );

                var nTotal =
                    Number(
                        (
                            nSubtotal + nTax
                        ).toFixed(2)
                    );

                console.log(
                    "Subtotal:",
                    nSubtotal
                );

                console.log(
                    "Tax:",
                    nTax
                );

                console.log(
                    "Total:",
                    nTotal
                );

                /*
                 * Update PO
                 */
                oContext.setProperty(
                    "taxAmount",
                    nTax
                );

                oContext.setProperty(
                    "totalAmount",
                    nTotal
                );
            },


            // =====================================================
            // SAVE CHANGES
            // =====================================================

            onSave: async function () {

                console.log(
                    "========== SAVE CLICKED =========="
                );

                var oContext =
                    this.getView()
                        .getBindingContext(
                            "purchase"
                        );

                if (!oContext) {

                    MessageBox.error(
                        "Purchase Order context is missing."
                    );

                    return;
                }

                var oPO =
                    oContext.getObject();

                if (!oPO) {

                    MessageBox.error(
                        "Purchase Order data is not available."
                    );

                    return;
                }

                console.log(
                    "PO Before Save:",
                    oPO
                );

                /*
                 * Only PENDING PO can be edited
                 */
                if (
                    oPO.status !== "PENDING"
                ) {

                    MessageBox.warning(
                        "Only PENDING Purchase Orders can be edited."
                    );

                    return;
                }

                var oModel =
                    this.getOwnerComponent()
                        .getModel("purchase");

                if (!oModel) {

                    oModel =
                        this.getOwnerComponent()
                            .getModel();
                }

                if (!oModel) {

                    MessageBox.error(
                        "Purchase Order OData model not found."
                    );

                    return;
                }

                try {

                    sap.ui.core.BusyIndicator.show(0);

                    /*
                     * Recalculate totals before saving
                     */
                    this._recalculateTotals();

                    /*
                     * Check for pending changes
                     */
                    var bHasChanges =
                        oModel.hasPendingChanges();

                    console.log(
                        "Model Has Pending Changes:",
                        bHasChanges
                    );

                    if (!bHasChanges) {

                        MessageToast.show(
                            "No changes to save."
                        );

                        return;
                    }

                    console.log(
                        "Submitting OData batch..."
                    );

                    /*
                     * Save OData V4 changes
                     */
                    await oModel.submitBatch(
                        "$auto"
                    );

                    console.log(
                        "OData batch submitted successfully."
                    );

                    /*
                     * Refresh PO
                     */
                    await oContext.requestObject();

                    MessageToast.show(
                        "Purchase Order updated successfully."
                    );

                    /*
                     * Go back to PO list
                     */
                    this._goBack();

                } catch (oError) {

                    console.error(
                        "SAVE PURCHASE ORDER ERROR:",
                        oError
                    );

                    MessageBox.error(
                        this._getErrorMessage(
                            oError
                        )
                    );

                } finally {

                    sap.ui.core.BusyIndicator.hide();
                }
            },


            // =====================================================
            // CANCEL
            // =====================================================

            onCancel: function () {

                console.log(
                    "Cancel clicked."
                );

                var oContext =
                    this.getView()
                        .getBindingContext(
                            "purchase"
                        );

                if (
                    oContext &&
                    oContext.hasPendingChanges()
                ) {

                    MessageBox.confirm(
                        "You have unsaved changes. Do you want to discard them?",
                        {
                            title: "Cancel Changes",

                            actions: [
                                MessageBox.Action.OK,
                                MessageBox.Action.CANCEL
                            ],

                            emphasizedAction:
                                MessageBox.Action.OK,

                            onClose: function (
                                sAction
                            ) {

                                if (
                                    sAction ===
                                    MessageBox.Action.OK
                                ) {

                                    oContext.resetChanges();

                                    this._goBack();
                                }

                            }.bind(this)
                        }
                    );

                } else {

                    this._goBack();
                }
            },


            // =====================================================
            // GO BACK
            // =====================================================

            _goBack: function () {

                console.log(
                    "Navigating back to Purchase Orders."
                );

                this.getOwnerComponent()
                    .getRouter()
                    .navTo(
                        "PurchaseOrders",
                        {},
                        true
                    );
            },


            // =====================================================
            // ERROR MESSAGE
            // =====================================================

            _getErrorMessage: function (
                oError
            ) {

                console.error(
                    "Full Error:",
                    oError
                );

                if (
                    oError &&
                    oError.message
                ) {

                    return oError.message;
                }

                if (
                    oError &&
                    oError.cause &&
                    oError.cause.message
                ) {

                    return oError.cause.message;
                }

                return (
                    "Failed to update Purchase Order."
                );
            }

        }
    );
});