sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment",
    
    "../model/formatter"
], function (
    Controller,
    Filter,
    FilterOperator,
    MessageToast,
    MessageBox,
    Fragment,
    formatter
) {
    "use strict";

    return Controller.extend(
        "purchasemanagement.controller.PriceMaster",
        {

            formatter: formatter,

            // =========================================================
            // INIT
            // =========================================================

            onInit: function () {
                this._oCreateDialog = null;
                this._oEditDialog = null;

                var oTable = this.byId("priceMasterTable");

                if (oTable) {
                    oTable.attachUpdateFinished(
                        this._onTableUpdateFinished,
                        this
                    );
                }
            },


            // =========================================================
            // NAVIGATION
            // =========================================================

            onNavBack: function () {
                var oHistory = sap.ui.core.routing.History.getInstance();
                var sPreviousHash = oHistory.getPreviousHash();

                if (sPreviousHash !== undefined) {
                    window.history.go(-1);
                } else {
                    var oRouter = this.getOwnerComponent().getRouter();
                    oRouter.navTo("RouteDashboard", {}, true);
                }
            },


            // =========================================================
            // REFRESH
            // =========================================================

            onRefresh: function () {
                var oModel = this.getView().getModel("purchase");

                if (!oModel) {
                    MessageBox.error(
                        "Purchase model is not available."
                    );
                    return;
                }

                oModel.refresh();

                MessageToast.show(
                    "Price Master refreshed"
                );
            },


            // =========================================================
            // TABLE UPDATE
            // =========================================================

            _onTableUpdateFinished: function (oEvent) {
                var iTotal = oEvent.getParameter("total");

                var oSummaryText = this.byId(
                    "priceMasterSummaryText"
                );

                if (oSummaryText) {
                    oSummaryText.setText(
                        iTotal +
                        " price record(s) available"
                    );
                }
            },


            // =========================================================
            // SEARCH
            // =========================================================

            onSearch: function (oEvent) {
                var sValue = oEvent
                    .getParameter("newValue");

                var oTable = this.byId(
                    "priceMasterTable"
                );

                var oBinding = oTable.getBinding("items");

                if (!oBinding) {
                    return;
                }

                var aFilters = [];

                if (sValue && sValue.trim()) {

                    sValue = sValue.trim();

                    var oProductCodeFilter =
                        new Filter(
                            "product/productCode",
                            FilterOperator.Contains,
                            sValue
                        );

                    var oProductNameFilter =
                        new Filter(
                            "product/productName",
                            FilterOperator.Contains,
                            sValue
                        );

                    var oSearchFilter =
                        new Filter({
                            filters: [
                                oProductCodeFilter,
                                oProductNameFilter
                            ],
                            and: false
                        });

                    aFilters.push(
                        oSearchFilter
                    );
                }

                this._applyAllFilters(aFilters);
            },


            // =========================================================
            // REGION FILTER
            // =========================================================

            onRegionChange: function () {
                this._applyFilters();
            },


            // =========================================================
            // STATUS FILTER
            // =========================================================

            onStatusChange: function () {
                this._applyFilters();
            },


            // =========================================================
            // APPLY ALL FILTERS
            // =========================================================

            _applyFilters: function () {
                var oTable = this.byId(
                    "priceMasterTable"
                );

                var oBinding = oTable.getBinding("items");

                if (!oBinding) {
                    return;
                }

                var aFilters = [];

                var oSearchField = this.byId(
                    "priceMasterSearchField"
                );

                var sSearch =
                    oSearchField.getValue();

                if (sSearch && sSearch.trim()) {

                    sSearch = sSearch.trim();

                    var oCodeFilter =
                        new Filter(
                            "product/productCode",
                            FilterOperator.Contains,
                            sSearch
                        );

                    var oNameFilter =
                        new Filter(
                            "product/productName",
                            FilterOperator.Contains,
                            sSearch
                        );

                    aFilters.push(
                        new Filter({
                            filters: [
                                oCodeFilter,
                                oNameFilter
                            ],
                            and: false
                        })
                    );
                }


                var oRegionSelect = this.byId(
                    "priceMasterRegionSelect"
                );

                var sRegion =
                    oRegionSelect.getSelectedKey();

                if (
                    sRegion &&
                    sRegion !== "ALL"
                ) {
                    aFilters.push(
                        new Filter(
                            "region/regionName",
                            FilterOperator.EQ,
                            sRegion
                        )
                    );
                }


                var oStatusSelect = this.byId(
                    "priceMasterStatusSelect"
                );

                var sStatus =
                    oStatusSelect.getSelectedKey();

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

                oBinding.filter(aFilters);
            },


            _applyAllFilters: function (aFilters) {
                var oRegionSelect = this.byId(
                    "priceMasterRegionSelect"
                );

                var sRegion =
                    oRegionSelect.getSelectedKey();

                if (
                    sRegion &&
                    sRegion !== "ALL"
                ) {
                    aFilters.push(
                        new Filter(
                            "region/regionName",
                            FilterOperator.EQ,
                            sRegion
                        )
                    );
                }


                var oStatusSelect = this.byId(
                    "priceMasterStatusSelect"
                );

                var sStatus =
                    oStatusSelect.getSelectedKey();

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


                var oTable = this.byId(
                    "priceMasterTable"
                );

                var oBinding =
                    oTable.getBinding("items");

                if (oBinding) {
                    oBinding.filter(aFilters);
                }
            },


            // =========================================================
            // GET SELECTED CONTEXT
            // =========================================================

            _getSelectedContext: function () {
                var oTable = this.byId(
                    "priceMasterTable"
                );

                var oSelectedItem =
                    oTable.getSelectedItem();

                if (!oSelectedItem) {
                    MessageToast.show(
                        "Please select a price record."
                    );
                    return null;
                }

                return oSelectedItem.getBindingContext(
                    "purchase"
                );
            },


            // =========================================================
            // ITEM PRESS
            // =========================================================

            onItemPress: function (oEvent) {
                var oItem =
                    oEvent.getParameter("listItem");

                if (!oItem) {
                    return;
                }

                var oContext =
                    oItem.getBindingContext("purchase");

                if (!oContext) {
                    return;
                }

                var oData =
                    oContext.getObject();

                MessageBox.information(
                    "Product: " +
                    (oData.product?.productName || "") +
                    "\nRegion: " +
                    (oData.region?.regionName || "") +
                    "\nFinal Price: ₹" +
                    (oData.finalPrice || 0) +
                    "\nStatus: " +
                    (oData.status || "")
                );
            },


            // =========================================================
            // VIEW
            // =========================================================

            onViewPrice: function () {
                var oContext =
                    this._getSelectedContext();

                if (!oContext) {
                    return;
                }

                var oData =
                    oContext.getObject();

                var sProduct =
                    oData.product?.productName ||
                    "Unknown Product";

                var sCode =
                    oData.product?.productCode ||
                    "";

                var sRegion =
                    oData.region?.regionName ||
                    "Unknown Region";

                var sBasePrice =
                    this._formatCurrency(
                        oData.basePrice
                    );

                var sDiscount =
                    this._formatCurrency(
                        oData.discount
                    );

                var sTax =
                    this._formatCurrency(
                        oData.tax
                    );

                var sFinalPrice =
                    this._formatCurrency(
                        oData.finalPrice
                    );

                MessageBox.information(
                    "Product: " +
                    sProduct +
                    "\nProduct Code: " +
                    sCode +
                    "\nRegion: " +
                    sRegion +
                    "\n\nBase Price: ₹" +
                    sBasePrice +
                    "\nDiscount: ₹" +
                    sDiscount +
                    "\nTax: ₹" +
                    sTax +
                    "\nFinal Price: ₹" +
                    sFinalPrice +
                    "\n\nStatus: " +
                    (oData.status || "")
                );
            },


            // =========================================================
            // CREATE PRICE
            // =========================================================

            onCreatePrice: function () {
                MessageToast.show(
                    "Create Price screen will be opened here."
                );

                if (this._oCreateDialog) { 
                    this._oCreateDialog.open(); 
                    return; 
                }
                                              
                Fragment.load({
                    id: this.getView().getId(),
                    name: "purchasemanagement.fragment.CreatePrice",
                    controller: this
                }).then(function (oDialog) {
                
                this._oCreateDialog = oDialog;
                this.getView().addDependent(oDialog);
                oDialog.open();
                
                }.bind(this));
                
            },

            onChangeSltProduct : function (oEvent) {

                 var oSelectedItem = oEvent.getParameter("selectedItem");

                if (!oSelectedItem) {
                    MessageToast.show("Select the Product from the dropdown");
                    return;
                }

                var oProductContext = oSelectedItem.getBindingContext();
                var oProductData = oProductContext.getObject();

                console.log(oProductData);

                this.byId('cpriceInpPrice001').setValue(oProductData.unitPrice);
            },

            onCreatePriceConfirm : function () {

                var oModel = this.getView().getModel("purchase"); 

                // Get controls from fragment 
                
                var oBasePrice = this.byId("cpriceInpPrice001"); 
                var oDiscount = this.byId("cpriceInpDisc001");
                var oTax = this.byId("cpriceInpTax001"); 
                var oValidFrom = this.byId("idDatePckFormValidFrom"); 
                var oValidTo = this.byId("idDatePckFormValidTo"); 
                
                // Read values 
              
                var oSelectedItemProduct = this.byId("CpriceMasterProductSelect").getSelectedItem();            
                var sProductId = oSelectedItemProduct.getBindingContext().getProperty("ID");

                var oSelectedItemRegion = this.byId("CpriceMasterRegionSelect").getSelectedItem();
                var sRegionId = oSelectedItemRegion.getBindingContext("pricing").getProperty("ID");

                var sBasePrice = oBasePrice.getValue(); 
                var sDiscount = oDiscount.getValue(); 
                var sTax = oTax.getValue(); 
                var sValidFrom = oValidFrom.getValue(); 
                var sValidTo = oValidTo.getValue();

                // Validation 
                
                if (!sProductId) { 
                    MessageBox.error("Please enter Product Code."); 
                    sProductId.focus(); return; 
                } 
                if (!sRegionId) { 
                    MessageBox.error("Please select a region."); 
                    oRegionSelect.focus(); return; 
                } 
                if (!sBasePrice || isNaN(parseFloat(sBasePrice))) { 
                    MessageBox.error("Please enter a valid Base Price."); 
                    oBasePrice.focus(); return; 
                } 
                if (sDiscount && isNaN(parseFloat(sDiscount))) {
                    MessageBox.error("Please enter a valid Discount."); 
                    oDiscount.focus(); return; 
                } 
                if (sTax && isNaN(parseFloat(sTax))) { 
                    MessageBox.error("Please enter a valid Tax."); 
                    oTax.focus(); return; 
                } 
                if (!sValidFrom) { 
                    MessageBox.error("Please select Valid From Date."); 
                    oValidFrom.focus(); return; 
                } 
                if (!sValidTo) { 
                    MessageBox.error("Please select Valid To Date."); 
                    oValidTo.focus(); return; 
                } 
                
                // Validate date range 
                if (new Date(sValidFrom) > new Date(sValidTo)) { 
                    MessageBox.error("Valid From Date cannot be greater than Valid To Date."); 
                    return; 
                } 
            
                var oPayload = { 
                    product_ID: sProductId, 
                    region_ID: sRegionId, 
                    basePrice: parseFloat(sBasePrice), 
                    discount: parseFloat(sDiscount || 0), 
                    tax: parseFloat(sTax || 0), 
                    validFrom: sValidFrom, 
                    validTo: sValidTo, 
                    status: "PENDING" 
                }; 
                
                console.log("Create Payload:", oPayload); 
                
                // Get Pricing/PriceMaster list binding 
                
                var oTable = this.byId("priceMasterTable"); 
                if (!oTable) { 
                    MessageBox.error("Pricing table not found."); 
                    return; 
                } 
                
                var oListBinding = oTable.getBinding("items"); 
                
                if (!oListBinding) { MessageBox.error("Pricing table binding not found."); return; }
                    
                var oNewContext = oListBinding.create(oPayload);

                oNewContext.created().then(function () {

                    MessageToast.show("Price Record Created.");
                    this._closeCreatePriceDialog();

                }.bind(this)).
                
                catch(function (oError) {
                    console.log(oError);
                    
                    if (!oError.canceled) {
                        MessageBox.error("Creation failed: " + (oError.message || oError));
                    }
                });

                
            },

            onCreatePriceCancel: function () { 
                 
                this.byId('CpriceMasterProductSelect').setSelectedKey("");

                this.byId('CpriceMasterRegionSelect').setSelectedKey("");

                this.byId('cpriceInpPrice001').setValue(0);

                this._closeCreatePriceDialog(); 
            }, 
            
            _closeCreatePriceDialog: function () { 

                if (this._oCreateDialog) { 
                    this._oCreateDialog.close(); 
                } 
            },

            // =========================================================
            // EDIT PRICE
            // =========================================================

            onEditPrice: function () {
                var oContext =
                    this._getSelectedContext();

                if (!oContext) {
                    return;
                }

                var oData =
                    oContext.getObject();

                if (
                    oData.status &&
                    oData.status === "EXPIRED"
                ) {
                    MessageBox.warning(
                        "Expired prices cannot be edited."
                    );
                    return;
                }

                MessageToast.show(
                    "Edit Price screen will be opened here."
                );

                /*
                 * When EditPrice.fragment.xml is created:
                 *
                 * Fragment.load({
                 *     name: "purchasemanagement.fragments.EditPrice",
                 *     controller: this
                 * }).then(function (oDialog) {
                 *
                 *     this._oEditDialog = oDialog;
                 *     this.getView().addDependent(oDialog);
                 *
                 *     oDialog.setBindingContext(
                 *         oContext,
                 *         "purchase"
                 *     );
                 *
                 *     oDialog.open();
                 *
                 * }.bind(this));
                 */
            },


            // =========================================================
            // RECALCULATE FINAL PRICE
            // =========================================================

            onRecalculatePrice: function () {
                var oContext =
                    this._getSelectedContext();

                if (!oContext) {
                    return;
                }

                var oData =
                    oContext.getObject();

                var fBasePrice =
                    Number(oData.basePrice || 0);

                var fDiscount =
                    Number(oData.discount || 0);

                var fTax =
                    Number(oData.tax || 0);

                var fFinalPrice =
                    fBasePrice -
                    fDiscount +
                    fTax;

                MessageBox.confirm(
                    "Recalculate final price?\n\n" +
                    "Base Price: ₹" +
                    this._formatCurrency(fBasePrice) +
                    "\nDiscount: ₹" +
                    this._formatCurrency(fDiscount) +
                    "\nTax: ₹" +
                    this._formatCurrency(fTax) +
                    "\n\nNew Final Price: ₹" +
                    this._formatCurrency(fFinalPrice),
                    {
                        title: "Recalculate Price",
                        onClose: function (sAction) {

                            if (
                                sAction !==
                                MessageBox.Action.OK
                            ) {
                                return;
                            }

                            this._updateFinalPrice(
                                oContext,
                                fFinalPrice
                            );

                        }.bind(this)
                    }
                );
            },


            _updateFinalPrice: function (
                oContext,
                fFinalPrice
            ) {
                var oModel =
                    this.getView().getModel("purchase");

                if (!oModel) {
                    MessageBox.error(
                        "Purchase model is not available."
                    );
                    return;
                }

                oContext.setProperty(
                    "finalPrice",
                    fFinalPrice
                );

                oModel.submitBatch("$auto")
                    .then(function () {

                        MessageToast.show(
                            "Final price recalculated successfully."
                        );

                    })
                    .catch(function (oError) {

                        MessageBox.error(
                            this._getErrorMessage(
                                oError
                            )
                        );

                    }.bind(this));
            },


            // =========================================================
            // EXPIRE PRICE
            // =========================================================

            onExpirePrice: function () {
                var oContext =
                    this._getSelectedContext();

                if (!oContext) {
                    return;
                }

                var oData =
                    oContext.getObject();

                if (
                    oData.status === "EXPIRED" 
                ) {
                    MessageToast.show(
                        "Price is already expired."
                    );
                    return;
                }

                var sId =
                    oData.ID;
console.log(oData, oData.ID);

                MessageBox.confirm(
                    "Are you sure you want to expire this price?",
                    {
                        title: "Expire Price",
                        actions: [
                            MessageBox.Action.OK,
                            MessageBox.Action.CANCEL
                        ],
                        emphasizedAction:
                            MessageBox.Action.OK,

                        onClose: function (sAction) {

                            if (
                                sAction !==
                                MessageBox.Action.OK
                            ) {
                                return;
                            }

                            this._callExpireAction(
                                sId
                            );

                        }.bind(this)
                    }
                );
            },


            _callExpireAction: function (sId) {

                var oModel =
                    this.getView().getModel("pricing");

                if (!oModel) {
                    MessageBox.error(
                        "Purchase model is not available."
                    );
                    return;
                }

                var oAction =
                    oModel.bindContext(
                        "/expirePrices(...)"
                    );
                
                oAction.setParameter( "ID", sId );

                 console.log( "Parameter context:", oAction.getParameterContext() );

                 console.log( "Parameter ID:", oAction.getParameterContext() ? oAction.getParameterContext().getProperty("ID") : "NO PARAMETER CONTEXT" );

                oAction.execute()
                    .then(function () {

                        var oResult = oAction.getBoundContext() ? oAction.getBoundContext().getObject() : null; 
                        console.log( "Expire action result:", oResult ); 
                        MessageToast.show( oResult && oResult.message ? oResult.message : "Price expired successfully." );

                        // Refresh table 
                        
                       // var oTable = this.byId("priceMasterTable"); 
                        var oTable = this.byId("priceMasterTable"); 

                        if ( oTable && oTable.getBinding("items") ) { 
                            oTable.getBinding("items").refresh(); 
                        }

                    }.bind(this))
                    .catch(function (oError) {

                        MessageBox.error(
                            this._getErrorMessage(
                                oError
                            )
                        );

                    }.bind(this));
            },


            // =========================================================
            // DELETE PRICE
            // =========================================================

            onDeletePrice: function () {
                var oContext =
                    this._getSelectedContext();

                if (!oContext) {
                    return;
                }

                var oData =
                    oContext.getObject();

                if (
                    oData.status === "ACTIVE"
                ) {
                    MessageBox.warning(
                        "Active price records cannot be deleted. " +
                        "Expire the price first."
                    );
                    return;
                }

                MessageBox.confirm(
                    "Are you sure you want to delete this price record?",
                    {
                        title: "Delete Price",
                        actions: [
                            MessageBox.Action.DELETE,
                            MessageBox.Action.CANCEL
                        ],
                        emphasizedAction:
                            MessageBox.Action.DELETE,

                        onClose: function (sAction) {

                            if (
                                sAction !==
                                MessageBox.Action.DELETE
                            ) {
                                return;
                            }

                            this._deletePrice(
                                oContext
                            );

                        }.bind(this)
                    }
                );
            },


            _deletePrice: function (
                oContext
            ) {
                oContext.delete("$auto")
                    .then(function () {

                        MessageToast.show(
                            "Price deleted successfully."
                        );

                    })
                    .catch(function (oError) {

                        MessageBox.error(
                            this._getErrorMessage(
                                oError
                            )
                        );

                    }.bind(this));
            },


            // =========================================================
            // CURRENCY FORMAT
            // =========================================================

            _formatCurrency: function (
                vValue
            ) {
                var fValue =
                    Number(vValue || 0);

                return fValue.toLocaleString(
                    "en-IN",
                    {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }
                );
            },


            // =========================================================
            // ERROR HANDLER
            // =========================================================

            _getErrorMessage: function (
                oError
            ) {
                if (!oError) {
                    return "Unknown error occurred.";
                }

                if (
                    oError.message
                ) {
                    return oError.message;
                }

                if (
                    oError.cause &&
                    oError.cause.message
                ) {
                    return oError.cause.message;
                }

                try {
                    if (
                        oError.responseText
                    ) {
                        var oResponse =
                            JSON.parse(
                                oError.responseText
                            );

                        if (
                            oResponse.error &&
                            oResponse.error.message
                        ) {
                            return oResponse.error.message;
                        }
                    }
                } catch (e) {
                    // Ignore JSON parsing error
                }

                return "An error occurred while processing the request.";
            }

        }
    );
});