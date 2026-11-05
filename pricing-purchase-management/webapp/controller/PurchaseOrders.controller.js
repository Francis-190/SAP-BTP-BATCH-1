sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "../model/formatter"
], function (
    Controller,
    Filter,
    FilterOperator,
    MessageToast,
    MessageBox,
    formatter
) {
    "use strict";
 
    return Controller.extend(
        "purchasemanagement.controller.PurchaseOrders",
        {
 
            formatter: formatter,
 
            // =========================================================
            // INIT
            // =========================================================
 
            onInit: function () {
 
                var oModel =
                    this.getOwnerComponent()
                        .getModel("purchase");
 
                if (!oModel) {
 
                    oModel =
                        this.getOwnerComponent()
                            .getModel();
 
                    if (oModel) {
                        this.getView()
                            .setModel(
                                oModel,
                                "purchase"
                            );
                    }
                }
 
                console.log(
                    "Purchase Orders controller initialized."
                );
            },
 
 
            // =========================================================
            // TABLE
            // =========================================================
 
            _getTable: function () {
 
                return this.byId(
                    "purchaseOrders_table"
                );
            },
 
 
            _getTableBinding: function () {
 
                var oTable =
                    this._getTable();
 
                if (!oTable) {
                    return null;
                }
 
                return oTable.getBinding(
                    "items"
                );
            },
 
 
            // =========================================================
            // TABLE UPDATE
            // =========================================================
 
            onTableUpdateFinished: function () {
 
                this._updatePOCount();
 
                this._updateActionButtons();
            },
 
 
            _updatePOCount: function () {
 
                var oTable =
                    this._getTable();
 
                var oCountText =
                    this.byId(
                        "purchaseOrders_countText"
                    );
 
                if (
                    !oTable ||
                    !oCountText
                ) {
                    return;
                }
 
                var oBinding =
                    oTable.getBinding("items");
 
                if (oBinding) {
 
                    var iLength =
                        oBinding.getLength();
 
                    if (
                        iLength === Infinity ||
                        iLength < 0
                    ) {
 
                        iLength =
                            oTable.getItems().length;
                    }
 
                    oCountText.setText(
                        "Sales Orders: " +
                        iLength
                    );
 
                } else {
 
                    oCountText.setText(
                        "Sales Orders: " +
                        oTable.getItems().length
                    );
                }
            },
 
 
            // =========================================================
            // SEARCH
            // =========================================================
 
            onSearch: function (oEvent) {
 
                var sQuery =
                    oEvent.getParameter(
                        "query"
                    ) || "";
 
                this._applyFilters(
                    sQuery
                );
            },
 
 
            _applyFilters: function (sQuery) {
 
                var oBinding =
                    this._getTableBinding();
 
                if (!oBinding) {
                    return;
                }
 
                var aFilters = [];
 
                // Search PO number
                if (sQuery) {
 
                    aFilters.push(
                        new Filter({
                            filters: [
                                new Filter(
                                    "poNumber",
                                    FilterOperator.Contains,
                                    sQuery
                                ),
                                new Filter(
                                    "status",
                                    FilterOperator.Contains,
                                    sQuery
                                )
                            ],
                            and: false
                        })
                    );
                }
 
                // Status filter
                var oStatusSelect =
                    this.byId(
                        "purchaseOrders_statusSelect"
                    );
 
                if (oStatusSelect) {
 
                    var sStatus =
                        oStatusSelect
                            .getSelectedKey();
 
                    if (
                        sStatus &&
                        sStatus !== "ALL"
                    ) {
 
                        aFilters.push(
                            new Filter(
                                "status",
                                FilterOperator.EQ,
                                sStatus
                            )
                        );
                    }
                }
 
                oBinding.filter(
                    aFilters
                );
            },
 
 
            onStatusChange: function () {
 
                var oSearch =
                    this.byId(
                        "purchaseOrders_searchField"
                    );
 
                this._applyFilters(
                    oSearch
                        ? oSearch.getValue()
                        : ""
                );
            },
 
 
            // =========================================================
            // SELECTION
            // =========================================================
 
            onSelectionChange: function () {
 
                this._updateActionButtons();
            },
 
 
            _getSelectedContexts: function () {
 
                var oTable =
                    this._getTable();
 
                if (!oTable) {
                    return [];
                }
 
                /*
                 * Get selected binding contexts directly.
                 */
                return oTable
                    .getSelectedContexts();
            },
 
 
            // =========================================================
            // ENABLE / DISABLE ACTION BUTTONS
            // =========================================================
 
            _updateActionButtons: function () {
 
                var oEditButton =
                    this.byId(
                        "purchaseOrders_editActionButton"
                    );
 
                var oSubmitButton =
                    this.byId(
                        "purchaseOrders_submitActionButton"
                    );
 
                var oDeleteButton =
                    this.byId(
                        "purchaseOrders_deleteActionButton"
                    );
 
                if (
                    !oEditButton ||
                    !oSubmitButton ||
                    !oDeleteButton
                ) {
                    return;
                }
 
                var aContexts =
                    this._getSelectedContexts();
 
                // Nothing selected
                if (!aContexts.length) {
 
                    oEditButton.setEnabled(
                        false
                    );
 
                    oSubmitButton.setEnabled(
                        false
                    );
 
                    oDeleteButton.setEnabled(
                        false
                    );
 
                    return;
                }
 
                var aPOs =
                    aContexts.map(
                        function (oContext) {
                            return oContext.getObject();
                        }
                    );
 
                console.log(
                    "Selected POs:",
                    aPOs
                );
 
                /*
                 * Only PENDING POs can be
                 * edited/submitted/deleted.
                 */
                var bAllPending =
                    aPOs.every(
                        function (oPO) {
                            return (
                                oPO &&
                                oPO.status === "PENDING"
                            );
                        }
                    );
 
                /*
                 * EDIT:
                 * Exactly one PENDING PO
                 */
                oEditButton.setEnabled(
                    aPOs.length === 1 &&
                    bAllPending
                );
 
                /*
                 * SUBMIT:
                 * One or multiple PENDING POs
                 */
                oSubmitButton.setEnabled(
                    bAllPending
                );
 
                /*
                 * DELETE:
                 * One or multiple PENDING POs
                 */
                oDeleteButton.setEnabled(
                    bAllPending
                );
            },
 
 
            // =========================================================
            // EDIT PURCHASE ORDER
            // =========================================================
 
            onEditPO: function () {
 
                var oTable =
                    this._getTable();
 
                if (!oTable) {
 
                    MessageBox.error(
                        "Purchase Orders table not found."
                    );
 
                    return;
                }
 
                var aSelectedItems =
                    oTable.getSelectedItems();
 
                console.log(
                    "Selected items:",
                    aSelectedItems
                );
 
                if (
                    aSelectedItems.length !== 1
                ) {
 
                    MessageBox.warning(
                        "Please select exactly one Purchase Order."
                    );
 
                    return;
                }
 
                var oSelectedItem =
                    aSelectedItems[0];
 
                var oContext =
                    oSelectedItem
                        .getBindingContext(
                            "purchase"
                        );
 
                if (!oContext) {
 
                    MessageBox.error(
                        "Purchase Order context not found."
                    );
 
                    return;
                }
 
                var oPO =
                    oContext.getObject();
 
                console.log(
                    "Selected PO:",
                    oPO
                );
 
                if (!oPO) {
 
                    MessageBox.error(
                        "Purchase Order data not found."
                    );
 
                    return;
                }
 
                console.log(
                    "PO ID:",
                    oPO.ID
                );
 
                console.log(
                    "PO Number:",
                    oPO.poNumber
                );
 
                console.log(
                    "PO Status:",
                    oPO.status
                );
 
                if (!oPO.ID) {
 
                    MessageBox.error(
                        "Purchase Order ID is missing."
                    );
 
                    return;
                }
 
                if (
                    oPO.status !== "PENDING"
                ) {
 
                    MessageBox.warning(
                        "Only PENDING Purchase Orders can be edited."
                    );
 
                    return;
                }
 
                console.log(
                    "Navigating to EditPurchaseOrder..."
                );
 
                var oRouter =
                    this.getOwnerComponent()
                        .getRouter();
 
                oRouter.navTo(
                    "EditPurchaseOrder",
                    {
                        ID: oPO.ID
                    }
                );
            },
 
 
            // =========================================================
            // SUBMIT PURCHASE ORDER
            // =========================================================
 
            onSubmitPO: function () {
 
                var oTable =
                    this._getTable();
 
                if (!oTable) {
 
                    MessageBox.error(
                        "Purchase Orders table not found."
                    );
 
                    return;
                }
 
                var aSelectedItems =
                    oTable.getSelectedItems();
 
                if (
                    !aSelectedItems.length
                ) {
 
                    MessageToast.show(
                        "Please select Sales Order(s)."
                    );
 
                    return;
                }
 
                var aContexts =
                    aSelectedItems
                        .map(
                            function (oItem) {
 
                                return oItem
                                    .getBindingContext(
                                        "purchase"
                                    );
                            }
                        )
                        .filter(Boolean);
 
                if (!aContexts.length) {
 
                    MessageBox.error(
                        "Unable to read selected Purchase Orders."
                    );
 
                    return;
                }
 
                /*
                 * Verify every selected PO is PENDING.
                 */
                var bAllPending =
                    aContexts.every(
                        function (oContext) {
 
                            var oPO =
                                oContext.getObject();
 
                            return (
                                oPO &&
                                oPO.status === "PENDING"
                            );
                        }
                    );
 
                if (!bAllPending) {
 
                    MessageBox.warning(
                        "Only PENDING Purchase Orders can be submitted."
                    );
 
                    return;
                }
 
                var oModel =
                    this.getOwnerComponent()
                        .getModel("purchase");
 
                if (!oModel) {
 
                    MessageBox.error(
                        "Purchase Order OData model not found."
                    );
 
                    return;
                }
 
                var that = this;
 
                MessageBox.confirm(
                    "Submit " +
                    aContexts.length +
                    " Sales Order(s)?",
                    {
                        title: "Confirm Submission",
 
                        actions: [
                            MessageBox.Action.OK,
                            MessageBox.Action.CANCEL
                        ],
 
                        emphasizedAction:
                            MessageBox.Action.OK,
 
                        onClose: async function (
                            sAction
                        ) {
 
                            if (
                                sAction !==
                                MessageBox.Action.OK
                            ) {
                                return;
                            }
 
                            try {
 
                                sap.ui.core.BusyIndicator.show(
                                    0
                                );
 
                                /*
                                 * Execute submitPO action
                                 * for every selected PO.
                                 */
                                for (
                                    var i = 0;
                                    i < aContexts.length;
                                    i++
                                ) {
 
                                    var oContext =
                                        aContexts[i];
 
                                    var oPO =
                                        oContext.getObject();
 
                                    console.log(
                                        "Submitting PO:",
                                        oPO.ID,
                                        oPO.poNumber
                                    );
 
                                    
                                    // IMPORTANT:OData V4 bound action.
                                    
                                    var oAction =
                                        oModel.bindContext(
                                            "PurchaseOrderService.submitPO(...)",
                                            oContext
                                        );
 console.log(oAction);
 
                                    await oAction.execute();
 
                                    console.log(
                                        "Submitted PO:",
                                        oPO.poNumber
                                    );
                                }
 
                                MessageToast.show(
                                    "Sales Order(s) submitted successfully."
                                );
 
                                that._clearSelection();
 
                                that.onRefresh();
 
                            } catch (oError) {
 
                                console.error(
                                    "Submit PO error:",
                                    oError
                                );
 
                                MessageBox.error(
                                    that._getErrorMessage(
                                        oError
                                    )
                                );
 
                            } finally {
 
                                sap.ui.core.BusyIndicator.hide();
                            }
                        }
                    }
                );
            },
 
 
            // =========================================================
            // DELETE
            // =========================================================
 
            onDeletePO: function () {
 
                var oTable =
                    this._getTable();
 
                if (!oTable) {
                    return;
                }
 
                var aSelectedItems =
                    oTable.getSelectedItems();
 
                if (
                    !aSelectedItems.length
                ) {
 
                    MessageToast.show(
                        "Please select Sales Order(s)."
                    );
 
                    return;
                }
 
                var aContexts =
                    aSelectedItems
                        .map(
                            function (oItem) {
 
                                return oItem
                                    .getBindingContext(
                                        "purchase"
                                    );
                            }
                        )
                        .filter(Boolean);
 
                var bAllPending =
                    aContexts.every(
                        function (oContext) {
 
                            var oPO =
                                oContext.getObject();
 
                            return (
                                oPO &&
                                oPO.status === "PENDING"
                            );
                        }
                    );
 
                if (!bAllPending) {
 
                    MessageBox.warning(
                        "Only PENDING Purchase Orders can be deleted."
                    );
 
                    return;
                }
 
                var that = this;
 
                MessageBox.confirm(
                    "Delete " +
                    aContexts.length +
                    " Sales Order(s)?",
                    {
                        title: "Confirm Delete",
 
                        actions: [
                            MessageBox.Action.OK,
                            MessageBox.Action.CANCEL
                        ],
 
                        emphasizedAction:
                            MessageBox.Action.OK,
 
                        onClose: async function (
                            sAction
                        ) {
 
                            if (
                                sAction !==
                                MessageBox.Action.OK
                            ) {
                                return;
                            }
 
                            try {
 
                                sap.ui.core.BusyIndicator.show(
                                    0
                                );
 
                                for (
                                    var i = 0;
                                    i < aContexts.length;
                                    i++
                                ) {
 
                                    await aContexts[i]
                                        .delete();
                                }
 
                                MessageToast.show(
                                    "Sales Order(s) deleted successfully."
                                );
 
                                that._clearSelection();
 
                                that.onRefresh();
 
                            } catch (oError) {
 
                                console.error(
                                    "Delete PO error:",
                                    oError
                                );
 
                                MessageBox.error(
                                    that._getErrorMessage(
                                        oError
                                    )
                                );
 
                            } finally {
 
                                sap.ui.core.BusyIndicator.hide();
                            }
                        }
                    }
                );
            },
 
 
            // =========================================================
            // PO DETAILS
            // =========================================================
 
            onPOPress: function (oEvent) {
 
                var oContext =
                    oEvent.getSource()
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
                    !oPO.ID
                ) {
                    return;
                }
 
                console.log(
                    "Opening PO details:",
                    oPO.ID
                );
 
                /*
                 * IMPORTANT:
                 * Manifest route is PODetail,
                 * not PurchaseOrderDetails.
                 */
                // this.getOwnerComponent()
                //     .getRouter()
                //     .navTo(
                //         "PODetail",
                //         {
                //             ID: oPO.ID
                //         }
                //     );
            },
 
 
            // =========================================================
            // REFRESH
            // =========================================================
 
            onRefresh: function () {
 
                var oBinding =
                    this._getTableBinding();
 
                if (oBinding) {
 
                    oBinding.refresh();
                }
 
                this._clearSelection();
            },
 
 
            // =========================================================
            // CLEAR SELECTION
            // =========================================================
 
            _clearSelection: function () {
 
                var oTable =
                    this._getTable();
 
                if (oTable) {
 
                    oTable.removeSelections(
                        true
                    );
                }
 
                this._updateActionButtons();
            },
 
 
            // =========================================================
            // CREATE PO
            // =========================================================
 
            onCreatePO: function () {
 
                this.getOwnerComponent()
                    .getRouter()
                    .navTo(
                        "CreatePurchaseOrder"
                    );
            },
 
 
            // =========================================================
            // BACK
            // =========================================================
 
            onBack: function () {
 
                window.history.back();
            },
 
 
            // =========================================================
            // ERROR MESSAGE
            // =========================================================
 
            _getErrorMessage: function (
                oError
            ) {
 
                console.error(
                    "Full error object:",
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
                    "An error occurred while processing the Purchase Order."
                );
            }
 
        }
    );
});