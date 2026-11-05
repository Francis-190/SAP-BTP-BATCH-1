sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/DatePicker",
    "sap/m/VBox",
    "sap/ui/model/json/JSONModel",
    "../model/formatter"
], function (Controller, MessageToast, MessageBox, Filter, FilterOperator, Dialog, Button, Label, Input, DatePicker, VBox, JSONModel, formatter) {
    "use strict";

    return Controller.extend("pricingmaster.controller.PricingMaster", {
        
        formatter: formatter,

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            if (oRouter && oRouter.getRoute("pricingMaster")) {
                oRouter.getRoute("pricingMaster").attachPatternMatched(this._onRouteMatched, this);
            }

            var oViewModel = new JSONModel({
                layout: "OneColumn",
                createMode: false,
                editMode: false,
                editablePricing: false
            });

            this.getView().setModel( oViewModel, "viewModel" );

            var oDraftModel = new JSONModel({});
            this.getView().setModel( oDraftModel, "draftModel" );
        },

        _onRouteMatched: function (oEvent) {
            var oArgs = oEvent.getParameter("arguments");
            var sStatus = oArgs ? oArgs.status : null;
            
            if (sStatus) {
                this._applyTableFilter(sStatus);
            } else {
                this._applyTableFilter("TOTAL");
            }
        },

        _applyTableFilter: function (sStatus) {
            var aFilters = [];
            var oTable = this.byId("pricingTable");
            var oBinding = oTable.getBinding("items");

            if (!oBinding) {
                return;
            }

            if (sStatus === "TOTAL") {
                oBinding.filter([]);
                return;
            }

            if (sStatus === "PENDING") {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("status", FilterOperator.EQ, "PENDING"),
                        new Filter("status", FilterOperator.EQ, "SUBMITTED"),
                        new Filter("status", FilterOperator.EQ, "DRAFT")
                    ],
                    and: false
                }));
            } else if (sStatus === "ACTIVE") {
                aFilters.push(new Filter("status", FilterOperator.EQ, "ACTIVE"));
            } else if (sStatus === "REJECTED") {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("status", FilterOperator.EQ, "REJECTED"),
                        new Filter("status", FilterOperator.EQ, "EXPIRED")
                    ],
                    and: false
                }));
            }

            oBinding.filter(aFilters);
        },


        onSelectionChange: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("listItem");
            var oContext = oSelectedItem ? oSelectedItem.getBindingContext() : null;

            this._resetModes(); // Ensure we load in read-only mode

            if (oContext) {

                // Expand detail column (Flexible Column Layout)
                var oFCL = this.byId("idFCLLayout");
                oFCL.setLayout("TwoColumnsMidExpanded");

                var oObjPage = this.byId("idObjPagePricing");
                oObjPage.setBindingContext(oContext);

                // Open Detail column
                this.getView().getModel("viewModel").setProperty("/layout", "TwoColumnsMidExpanded");

                var sStatus = oContext.getProperty("status");
                var bIsDraftOrSubmitted = (sStatus === "PENDING" || sStatus === "DRAFT" || sStatus === "SUBMITTED");
                var bIsActiveOrRejected = (sStatus === "ACTIVE" );

                this.byId("idBtnObjEdit").setEnabled(true);
                this.byId("btnDelete").setEnabled(!bIsDraftOrSubmitted);

                this.byId("idBtnObjApprove").setEnabled(!bIsActiveOrRejected); 
                this.byId("idBtnObjReject").setEnabled(bIsActiveOrRejected);  
            }
        },

        onCloseDetailColumn: function () {
            var oFCL = this.byId("idFCLLayout");
            oFCL.setLayout("OneColumn");

            this.getView().byId("pricingTable").removeSelections(true);
            this.getView().getModel("viewModel").setProperty("/layout", "OneColumn");
            this._resetModes();
        },

        _resetModes: function () {
            var oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/createMode", false);
            oViewModel.setProperty("/editMode", false);
            oViewModel.setProperty("/editablePricing", false);
        },

        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            console.log(sQuery);
            
            var aFilters = [];
            if (sQuery) {
                aFilters.push(new Filter("product/productCode", FilterOperator.Contains, sQuery));
            }
            var oTable = this.byId("pricingTable");
            var oBinding = oTable.getBinding("items");
            if (oBinding) {
                oBinding.filter(aFilters);
            }
        },

        onApprovePriceDetail: function () {
            this._updateSelectedStatus("ACTIVE", "Pricing record approved and activated!");
        },

        onRejectPriceDetail: function () {
            this._updateSelectedStatus("REJECTED", "Pricing record has been rejected.");
        },

        _updateSelectedStatus: function (sNewStatus, sSuccessMsg) {
            var oTable = this.byId("pricingTable");
            var oSelectedItem = oTable.getSelectedItem();
            if (!oSelectedItem) {
                MessageToast.show("Please select a record.");
                return;
            }
            console.log(oSelectedItem);
            
            var oContext = oSelectedItem.getBindingContext();

            // if (oContext && oContext.setProperty) {
            //     oContext.setProperty("status", sNewStatus);
            //     MessageToast.show(sSuccessMsg);
            // } else {
            //     MessageToast.show(sSuccessMsg);
            // } instead of this batch operation performed

            var oModel = this.getView().getModel(); // OData V4 Model

            if (oContext && oContext.setProperty) {
                oContext.setProperty("status", sNewStatus);
                
                // Explicitly submit changes to the server via batch group
                oModel.submitBatch("$auto").then(function () {
                    MessageToast.show(sSuccessMsg);
                }).catch(function (oError) {
                    MessageBox.error("Failed to update status on server: " + (oError.message || oError));
                });
            }

            this.byId("idBtnObjApprove").setEnabled( !(sNewStatus === 'ACTIVE') );
            this.byId("idBtnObjReject").setEnabled( !(sNewStatus === 'REJECTED') );
        },

        onCreatePrice : function () {

            var oFCL = this.byId("idFCLLayout");
            oFCL.setLayout("TwoColumnsMidExpanded");

            var oView = this.getView();
            var oViewModel = oView.getModel("viewModel");
            var oDraftModel = oView.getModel("draftModel");

            // Reset draft model to blank fields for a New Record
            oDraftModel.setData({
                productID: "",
                productCode: "",
                productName: "",
                productCategory: "",
                productUnitPrice: "",
                productActive: "",
                regionID: "",
                regionCode: "",
                regionName: "",
                basePrice: "",
                discount: "",
                tax: "",
                validFrom: "",
                validTo: "",
                finalPrice: "0.00"
            });

            // oView.unbindElement();
            // Unbind any previously selected row from the Object Page
            this.getView().byId("idObjPagePricing").unbindElement();
            this.getView().byId("pricingTable").removeSelections(true);

            // Toggle UI states to show Inputs
            oViewModel.setProperty("/createMode", true);
            oViewModel.setProperty("/editMode", false);
            oViewModel.setProperty("/editablePricing", true);
            oViewModel.setProperty("/layout", "TwoColumnsMidExpanded");
            
            MessageToast.show("Draft mode activated. Please fill in the details.");

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
            
            // this.getView().byId("idFormGeneral").bindElement("/Products('" + oProductData.ID + "')");
            var oDraftModel = this.getView().getModel("draftModel");
            oDraftModel.setProperty("/productName", oProductData.productName);
            oDraftModel.setProperty("/productID", oProductData.ID);
            oDraftModel.setProperty("/productCategory", oProductData.category);
            oDraftModel.setProperty("/productUnitPrice", oProductData.unitPrice);
            oDraftModel.setProperty("/productActive", oProductData.active);
            oDraftModel.setProperty("/basePrice", oProductData.unitPrice); // Optional default mapping
        },

        onChangeSltRegion : function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) {
                MessageToast.show("Select the Region from the dropdown");
                return;
            }

            var oRegionContext = oSelectedItem.getBindingContext();
            var oRegionData = oRegionContext.getObject();
            console.log(oRegionData);

            var oDraftModel = this.getView().getModel("draftModel");
            oDraftModel.setProperty("/regionID", oRegionData.ID);
            oDraftModel.setProperty("/regionCode", oRegionData.regionCode);
            oDraftModel.setProperty("/regionName", oRegionData.regionName);
        },

        onEditPriceDetail: function () {
            // this._openEditDialog();

            var oContext = this.getView().byId("idObjPagePricing").getBindingContext();
            if (!oContext) return;

            var oViewModel = this.getView().getModel("viewModel");
            var oDraftModel = this.getView().getModel("draftModel");

            // Copy existing OData values into Draft Model for editing
            oDraftModel.setData({
                basePrice: oContext.getProperty("basePrice"),
                discount: oContext.getProperty("discount"),
                tax: oContext.getProperty("tax"),
                validFrom: oContext.getProperty("validFrom"),
                validTo: oContext.getProperty("validTo"),
                finalPrice: oContext.getProperty("finalPrice")
            });

            // Toggle Modes
            oViewModel.setProperty("/createMode", false);
            oViewModel.setProperty("/editMode", true);
            oViewModel.setProperty("/editablePricing", true);
        },

        onSavePrice: function () {
            var oViewModel = this.getView().getModel("viewModel");
            var oDraftData = this.getView().getModel("draftModel").getData();
            var oModel = this.getView().getModel(); 
            
            // Validation
            if (!oDraftData.basePrice || !oDraftData.validFrom || !oDraftData.validTo) {
                MessageBox.error("Please fill all mandatory fields.");
                return;
            }

            if (oViewModel.getProperty("/createMode")) {
                if (!oDraftData.productCode) {
                    MessageBox.error("Please select a Product.");
                    return;
                }
console.log(oDraftData);

                var oListBinding = this.byId("pricingTable").getBinding("items");
                var oPayload ={
                    product_ID: oDraftData.productID,
                    region_ID: oDraftData.regionID,
                    basePrice: parseFloat(oDraftData.basePrice),
                    discount: parseFloat(oDraftData.discount || 0),
                    tax: parseFloat(oDraftData.tax || 0),
                    validFrom: oDraftData.validFrom,
                    validTo: oDraftData.validTo,
                    status: "PENDING"
                }
                console.log(oPayload);
                
                var oNewContext = oListBinding.create({
                    product_ID: oDraftData.productID,
                    region_ID: oDraftData.regionID,
                    basePrice: parseFloat(oDraftData.basePrice),
                    discount: parseFloat(oDraftData.discount || 0),
                    tax: parseFloat(oDraftData.tax || 0),
                    validFrom: oDraftData.validFrom,
                    validTo: oDraftData.validTo,
                    status: "PENDING"
                });

                oNewContext.created().then(function () {
                    console.log("oError");
                    MessageToast.show("Price Record Created.");
                    this.onCloseDetailColumn();
                }.bind(this)).catch(function (oError) {
                    console.log(oError);
                    
                    if (!oError.canceled) {
                        MessageBox.error("Creation failed: " + (oError.message || oError));
                    }
                });

            } else {
                // EDIT EXISTING ENTRY logic
                var oContext = this.getView().byId("idObjPagePricing").getBindingContext();
                
                // Set properties back to OData Model
                oContext.setProperty("basePrice", parseFloat(oDraftData.basePrice));
                oContext.setProperty("discount", parseFloat(oDraftData.discount || 0));
                oContext.setProperty("tax", parseFloat(oDraftData.tax || 0));
                oContext.setProperty("validFrom", oDraftData.validFrom);
                oContext.setProperty("validTo", oDraftData.validTo);

               oModel.submitBatch("$auto").then(function () {
                    MessageToast.show("Price Record Updated.");
                    this._resetModes();
                }.bind(this)).catch(function (oError) {
                    MessageBox.error("Update failed: " + (oError.message || oError));
                });
            }
        },

        onCancelEdit: function () {
            var oViewModel = this.getView().getModel("viewModel");

            // Discard un-submitted OData changes if in Edit mode
            if (oViewModel.getProperty("/editMode")) {
                this.getView().getModel().resetChanges();
            }

            if (oViewModel.getProperty("/createMode")) {
                this.onCloseDetailColumn(); // Exit out completely if canceling a Create
            } else {
                this._resetModes(); // Revert back to read-only detail view
            }
        },

        // _openEditDialog: function () {
        //     var oTable = this.byId("pricingTable");
        //     var oSelectedItem = oTable.getSelectedItem();

        //     if (!oSelectedItem) {
        //         MessageToast.show("Please select a record to edit.");
        //         return;
        //     }

        //     var oContext = oSelectedItem.getBindingContext();
        //     var oView = this.getView();

        //     if (!this._oEditDialog) {
        //         this._oEditDialog = new Dialog({
        //             id: oView.createId("idDlgEditPrice"),
        //             title: "Edit Price Record",
        //             contentWidth: "400px",
        //             content: new VBox({
        //                 id: oView.createId("idVBoxEditForm"),
        //                 class: "sapUiSmallMargin",
        //                 items: [
        //                     new Label({ id: oView.createId("idLblEditBasePrice"), text: "Base Price", required: true }),
        //                     new Input({ id: oView.createId("idInpEditBasePrice"), type: "Number" }),
                            
        //                     new Label({ id: oView.createId("idLblEditDiscount"), text: "Discount (%)" }),
        //                     new Input({ id: oView.createId("idInpEditDiscount"), type: "Number" }),
                            
        //                     new Label({ id: oView.createId("idLblEditTax"), text: "Tax (%)" }),
        //                     new Input({ id: oView.createId("idInpEditTax"), type: "Number" }),
                            
        //                     new Label({ id: oView.createId("idLblEditValidFrom"), text: "Valid From", required: true }),
        //                     new DatePicker({ id: oView.createId("idDPEditValidFrom"), valueFormat: "yyyy-MM-dd", displayFormat: "yyyy-MM-dd" }),
                            
        //                     new Label({ id: oView.createId("idLblEditValidTo"), text: "Valid To", required: true }),
        //                     new DatePicker({ id: oView.createId("idDPEditValidTo"), valueFormat: "yyyy-MM-dd", displayFormat: "yyyy-MM-dd" })
        //                 ]
        //             }).addStyleClass("sapUiSmallMargin sapUiSmallPadding"),
        //             beginButton: new Button({
        //                 id: oView.createId("idBtnSaveEditPrice"),
        //                 text: "Save Changes",
        //                 type: "Emphasized",
        //                 press: function () {
        //                     var nBase = parseFloat(oView.byId("idInpEditBasePrice").getValue()) || 0;
        //                     var nDisc = parseFloat(oView.byId("idInpEditDiscount").getValue()) || 0;
        //                     var nTax = parseFloat(oView.byId("idInpEditTax").getValue()) || 0;
        //                     var sFrom = oView.byId("idDPEditValidFrom").getValue();
        //                     var sTo = oView.byId("idDPEditValidTo").getValue();

        //                     if (!nBase || !sFrom || !sTo) {
        //                         MessageBox.error("Base Price, Valid From, and Valid To are required.");
        //                         return;
        //                     }

        //                     oContext.setProperty("basePrice", nBase);
        //                     oContext.setProperty("discount", nDisc);
        //                     oContext.setProperty("tax", nTax);
        //                     oContext.setProperty("validFrom", sFrom);
        //                     oContext.setProperty("validTo", sTo);

        //                     MessageToast.show("Price record updated successfully.");
        //                     this._oEditDialog.close();
        //                 }.bind(this)
        //             }),
        //             endButton: new Button({
        //                 id: oView.createId("idBtnCancelEditPrice"),
        //                 text: "Cancel",
        //                 press: function () {
        //                     this._oEditDialog.close();
        //                 }.bind(this)
        //             })
        //         });
        //         oView.addDependent(this._oEditDialog);
        //     }

        //     // Populate current context values into dialog fields
        //     oView.byId("idInpEditBasePrice").setValue(oContext.getProperty("basePrice"));
        //     oView.byId("idInpEditDiscount").setValue(oContext.getProperty("discount"));
        //     oView.byId("idInpEditTax").setValue(oContext.getProperty("tax"));
        //     oView.byId("idDPEditValidFrom").setValue(oContext.getProperty("validFrom"));
        //     oView.byId("idDPEditValidTo").setValue(oContext.getProperty("validTo"));

        //     this._oEditDialog.open();
        // },

        onDeletePrice: function () {
            var oTable = this.byId("pricingTable");
            var oSelectedItem = oTable.getSelectedItem();
            if (oSelectedItem) {
                MessageBox.confirm("Are you sure you want to delete this pricing record?", {
                    id: "idMsgBoxDeleteConfirm",
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            var oContext = oSelectedItem.getBindingContext();

                            // if (oContext && oContext.delete) {
                            //     oContext.delete();
                            // }

                            if (oContext && oContext.delete) {
                                oContext.delete("$auto").then(function () {
                                    MessageToast.show("Price record deleted from backend.");
                                }.bind(this)).catch(function (oError) {
                                    MessageBox.error("Deletion failed: " + (oError.message || oError));
                                });
                            }

                            MessageToast.show("Price record deleted.");
                            this.onCloseDetailColumn();
                        }
                    }.bind(this)
                });
            }
        }
    });
});