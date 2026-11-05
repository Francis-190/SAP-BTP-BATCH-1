sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/Item",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "../model/formatter"
], function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    Item,
    MessageBox,
    MessageToast,
    formatter
) {
    "use strict";

    return Controller.extend(
        "purchasemanagement.controller.CreatePurchaseOrder",
        {

            formatter: formatter,


            // =====================================================
            // INIT
            // =====================================================

            onInit: function () {

                this.getOwnerComponent()
                    .getRouter()
                    .getRoute("CreatePurchaseOrder")
                    .attachPatternMatched(
                        this._onRouteMatched,
                        this
                    );
            },


            // =====================================================
            // ROUTE MATCHED
            // =====================================================

            _onRouteMatched: function () {

                var oToday = new Date();

                var sDate =
                    oToday.getFullYear() +
                    "-" +
                    String(
                        oToday.getMonth() + 1
                    ).padStart(2, "0") +
                    "-" +
                    String(
                        oToday.getDate()
                    ).padStart(2, "0");


                var oPOModel =
                    new JSONModel({

                        dealer_ID: "",

                        region_ID: "",

                        orderDate: sDate,

                        items: [],

                        subtotal: "0.00",

                        totalDiscount: "0.00",

                        taxAmount: "0.00",

                        totalAmount: "0.00"

                    });


                this.getView().setModel( oPOModel, "po" );

                // Load only ACTIVE dealers
                this._loadActiveDealers();

                // Load only ACTIVE products
                this._loadActiveProducts();
            },


            // =====================================================
            // LOAD ACTIVE DEALERS
            // =====================================================

            _loadActiveDealers: function () {

                try {

                    var oPurchaseModel =
                        this.getOwnerComponent()
                            .getModel("purchase");


                    var oDealerSelect =
                        this.byId(
                            "dealerSelect"
                        );


                    var oTemplate =
                        new Item({
                            key: "{purchase>ID}",
                            text: "{purchase>dealerCode} - {purchase>dealerName}"
                        });


                    oDealerSelect.bindItems({

                        path: "purchase>/Dealers",

                        template: oTemplate,

                        filters: [
                            new Filter(
                                "status",
                                FilterOperator.EQ,
                                "ACTIVE"
                            )
                        ],

                        parameters: {
                            $expand: "region"
                        }

                    });


                } catch (oError) {

                    console.error(
                        "Loading ACTIVE dealers failed:",
                        oError
                    );


                    MessageBox.error(
                        "Unable to load ACTIVE dealers."
                    );
                }
            },


            // =====================================================
            // LOAD ACTIVE PRODUCTS
            // =====================================================

            _loadActiveProducts: async function () {

                try {

                    var oPurchaseModel =
                        this.getOwnerComponent()
                            .getModel("purchase");


                    var oBinding =
                        oPurchaseModel.bindList(
                            "/Products"
                        );


                    var aContexts =
                        await oBinding.requestContexts(
                            0,
                            1000
                        );


                    var aProducts =
                        aContexts
                            .map(function (oContext) {

                                return oContext.getObject();

                            })
                            .filter(function (oProduct) {

                                return (
                                    oProduct.active === true
                                );

                            });


                    this.getView().setModel(
                        new JSONModel(aProducts),
                        "products"
                    );


                } catch (oError) {

                    console.error(
                        "Loading ACTIVE products failed:",
                        oError
                    );


                    MessageBox.error(
                        "Unable to load ACTIVE products."
                    );
                }
            },


            // =====================================================
            // DEALER CHANGE
            // =====================================================

            onDealerChange: function (oEvent) {

                var sDealerID = oEvent.getSource().getSelectedKey();

                this.getView().getModel("po").setProperty( "/dealer_ID", sDealerID );

                var oSelectedItem = oEvent.getParameter("selectedItem");

                if (!oSelectedItem) {
                    this.byId("dealerRegionTxt").setText("");
                    return;
                }

                var oContext = oSelectedItem.getBindingContext("purchase");

                if (!oContext) {
                    this.byId("dealerRegionTxt").setText("");
                    return;
                }

                var oDealer = oContext.getObject();

                var sRegion = oDealer.region && oDealer.region.regionName ? oDealer.region.regionName : "";

                this.getView().getModel("po").setProperty("/region_ID", oDealer.region.ID);

                this.byId("dealerRegionTxt").setText(sRegion);

            },


            // =====================================================
            // ADD ITEM
            // =====================================================

            onAddItem: function () {

                var oModel =
                    this.getView()
                        .getModel("po");


                var aItems =
                    oModel.getProperty(
                        "/items"
                    ) || [];


                var iItemNumber =
                    aItems.length + 1;


                aItems.push({

                    itemNumber:
                        iItemNumber,

                    product_ID:
                        "",

                    quantity:
                        1,

                    unitPrice:
                        0,

                    finalPrice:
                        0,

                    lineTotal:
                        0,
                    
                    unitPrWithQty: 0,
                    
                    discountWithQty: 0,

                    taxWithQty: 0


                });


                oModel.setProperty(
                    "/items",
                    aItems
                );
            },


            // =====================================================
            // REMOVE ITEM
            // =====================================================

            onRemoveItem: function () {

                var oTable =
                    this.byId(
                        "poItemsTable"
                    );


                var aSelectedItems =
                    oTable.getSelectedItems();


                if (
                    !aSelectedItems ||
                    aSelectedItems.length === 0
                ) {

                    MessageToast.show(
                        "Please select an item to remove."
                    );

                    return;
                }


                var oModel =
                    this.getView()
                        .getModel("po");


                var aItems =
                    oModel.getProperty(
                        "/items"
                    );


                var aIndexes =
                    aSelectedItems
                        .map(function (oItem) {

                            var oContext =
                                oItem.getBindingContext(
                                    "po"
                                );

                            return Number(
                                oContext
                                    .getPath()
                                    .split("/")
                                    .pop()
                            );

                        })
                        .sort(function (a, b) {

                            return b - a;

                        });


                aIndexes.forEach(
                    function (iIndex) {

                        aItems.splice(
                            iIndex,
                            1
                        );
                    }
                );


                // Renumber items

                aItems.forEach(
                    function (
                        oItem,
                        iIndex
                    ) {

                        oItem.itemNumber =
                            iIndex + 1;

                    }
                );


                oModel.setProperty(
                    "/items",
                    aItems
                );


                oTable.removeSelections();

                this._calculateTotals();
            },


            // =====================================================
            // PRODUCT CHANGE
            // =====================================================

            onProductChange: async function (oEvent) {

                var oSelect = oEvent.getSource();

                var sProductID = oSelect.getSelectedKey();

                var oContext = oSelect.getBindingContext( "po" );

                if (!oContext) { return; }

                var sPath = oContext.getPath();

                var oPOModel = this.getView().getModel("po");

                // No product selected

                if (!sProductID) {

                    oPOModel.setProperty( sPath + "/unitPrice", 0 );

                    oPOModel.setProperty( sPath + "/finalPrice", 0 );

                    oPOModel.setProperty( sPath + "/lineTotal", 0 );

                    this._calculateTotals();

                    return;
                }


                try {

                    var oPurchaseModel = this.getOwnerComponent().getModel("purchase");
                    
                    // Find ACTIVE price for product

                    var oPriceBinding = oPurchaseModel.bindList( "/PriceMaster", null, null,
                            [
                                new Filter( "product_ID", FilterOperator.EQ, sProductID ),

                                new Filter( "region_ID", FilterOperator.EQ, oPOModel.getProperty("/region_ID") ),

                                new Filter( "status", FilterOperator.EQ, "ACTIVE" )

                            ]
                        );

                    var aPriceContexts = await oPriceBinding.requestContexts( 0, 100 );

                    if ( !aPriceContexts || aPriceContexts.length === 0 ) {

                        MessageBox.warning( "No ACTIVE price is available for the selected product in the Dealer Region." );

                        oPOModel.setProperty( sPath + "/unitPrice", 0 );

                        oPOModel.setProperty( sPath + "/finalPrice", 0 );

                        oPOModel.setProperty( sPath + "/lineTotal", 0 );

                        this._calculateTotals();

                        return;
                    }

                    this.oPrice = aPriceContexts[0] .getObject();
console.log(this.oPrice);

                    /*
                     * PriceMaster.finalPrice is used
                     * as the unit price.
                     */

                    var nUnitPrice = Number( this.oPrice.basePrice || 0 );

                    var nFinalPrice = Number( this.oPrice.finalPrice || 0 );

                    if (nUnitPrice <= 0) {

                        MessageBox.warning( "The selected product does not have a valid ACTIVE price." );

                        oPOModel.setProperty( sPath + "/unitPrice", 0 );

                        oPOModel.setProperty( sPath + "/finalPrice", 0 );

                        oPOModel.setProperty( sPath + "/lineTotal", 0 );

                        this._calculateTotals();

                        return;
                    }


                    oPOModel.setProperty( sPath + "/unitPrice", nUnitPrice.toFixed(2) );

                    oPOModel.setProperty( sPath + "/finalPrice", nFinalPrice.toFixed(2) );

                    var nQuantity = Number( oPOModel.getProperty( sPath + "/quantity" ) || 1 );
                    
                    var nUnitPriceWithQty = nQuantity * nUnitPrice;                
                    oPOModel.setProperty( sPath + "/unitPrWithQty", nUnitPriceWithQty.toFixed(2) );
                    
                    var nDiscountWithQty = nQuantity * this.oPrice.discount;                
                    oPOModel.setProperty( sPath + "/discountWithQty", nDiscountWithQty.toFixed(2) );
                    
                    var nTaxWithQty = nQuantity * this.oPrice.tax;                
                    oPOModel.setProperty( sPath + "/taxWithQty", nTaxWithQty.toFixed(2) );
                    
                    var nLineTotal = nQuantity * nFinalPrice;
                    oPOModel.setProperty( sPath + "/lineTotal", nLineTotal.toFixed(2) );


                    this._calculateTotals();


                } catch (oError) {

                    console.error( "Price lookup failed:", oError );

                    MessageBox.error( "Unable to fetch the ACTIVE price for this product." );
                }
            },


            // =====================================================
            // QUANTITY CHANGE
            // =====================================================

            onQuantityChange: function (oEvent) {

                var oInput = oEvent.getSource();

                var oContext = oInput.getBindingContext( "po" );

                if (!oContext) {
                    return;
                }

                var sPath = oContext.getPath();

                var oModel = this.getView().getModel("po");

                var nQuantity = Number( oInput.getValue() || 0 );

                if (nQuantity <= 0) {

                    MessageToast.show( "Quantity must be greater than zero." );

                    oInput.setValue(1);

                    nQuantity = 1;
                }


                var nUnitPrice = Number( oModel.getProperty( sPath + "/unitPrice" ) || 0 );

                var nFinalPrice = Number( oModel.getProperty( sPath + "/finalPrice" ) || 0 );

                var nLineTotal = nQuantity * nFinalPrice;
                oModel.setProperty( sPath + "/lineTotal", nLineTotal.toFixed(2) );

                var nUnitPriceWithQty = nQuantity * nUnitPrice;                
                oModel.setProperty( sPath + "/unitPrWithQty", nUnitPriceWithQty.toFixed(2) );

                var nDiscountWithQty = nQuantity * this.oPrice.discount;                
                oModel.setProperty( sPath + "/discountWithQty", nDiscountWithQty.toFixed(2) );

                var nTaxWithQty = nQuantity * this.oPrice.tax;                
                oModel.setProperty( sPath + "/taxWithQty", nTaxWithQty.toFixed(2) );

                this._calculateTotals();
            },


            // =====================================================
            // CALCULATE TOTALS
            // =====================================================

            _calculateTotals: function () {

                var oModel = this.getView().getModel("po");

                var aItems = oModel.getProperty( "/items" ) || [];

                var nSubtotal = 0;
                var nTotalDiscount = 0;
                var nTax = 0;
                var nTotal = 0;

                aItems.forEach( function (oItem) {

                        nSubtotal += Number( oItem.unitPrWithQty || 0 );

                        nTotalDiscount += Number( oItem.discountWithQty || 0 );

                        nTax += Number( oItem.taxWithQty || 0 );

                        nTotal += Number( oItem.lineTotal || 0 );
                    }
                );

                /*
                 * Current backend uses 18% tax.
                 */

                // var nTax = nSubtotal * 0.18;

                // var nTotal = nSubtotal + nTax;


                oModel.setProperty( "/subtotal", nSubtotal.toFixed(2) );

                oModel.setProperty( "/totalDiscount", nTotalDiscount.toFixed(2) );

                oModel.setProperty( "/taxAmount", nTax.toFixed(2) );

                oModel.setProperty( "/totalAmount", nTotal.toFixed(2) );
            },


            // =====================================================
            // CREATE PURCHASE ORDER
            // =====================================================

            onCreatePO: async function () {

                var oPOModel =
                    this.getView()
                        .getModel("po");

                var sDealerID =
                    oPOModel.getProperty("/dealer_ID");

                var sOrderDate =
                    oPOModel.getProperty("/orderDate");

                var aItems =
                    oPOModel.getProperty("/items") || [];


                // =====================================================
                // VALIDATION
                // =====================================================

                if (!sDealerID) {

                    MessageBox.error(
                        "Please select an ACTIVE dealer."
                    );

                    return;
                }


                if (!sOrderDate) {

                    MessageBox.error(
                        "Please select the order date."
                    );

                    return;
                }


                if (aItems.length === 0) {

                    MessageBox.error(
                        "Please add at least one product."
                    );

                    return;
                }


                // Validate every item

                for (
                    var i = 0;
                    i < aItems.length;
                    i++
                ) {

                    var oItem =
                        aItems[i];


                    if (!oItem.product_ID) {

                        MessageBox.error(
                            "Please select a product for item " +
                            (i + 1) +
                            "."
                        );

                        return;
                    }


                    if (
                        Number(oItem.quantity || 0) <= 0
                    ) {

                        MessageBox.error(
                            "Quantity must be greater than zero for item " +
                            (i + 1) +
                            "."
                        );

                        return;
                    }


                    if (
                        Number(oItem.unitPrice || 0) <= 0
                    ) {

                        MessageBox.error(
                            "No valid ACTIVE price found for item " +
                            (i + 1) +
                            "."
                        );

                        return;
                    }

                }


                // =====================================================
                // CALCULATE TOTALS
                // =====================================================

                this._calculateTotals();


                var nSubtotal =
                    Number(
                        oPOModel.getProperty(
                            "/subtotal"
                        ) || 0
                    );


                var nTax =
                    Number(
                        oPOModel.getProperty(
                            "/taxAmount"
                        ) || 0
                    );


                var nTotal =
                    Number(
                        oPOModel.getProperty(
                            "/totalAmount"
                        ) || 0
                    );


                // =====================================================
                // CREATE DEEP PAYLOAD
                // =====================================================

                var aPOLineItems =
                    aItems.map(function (oItem) {

                        return {

                            quantity:
                                Number(
                                    oItem.quantity
                                ),

                            unitPrice:
                                Number(
                                    oItem.finalPrice
                                ),

                            // finalPrice:
                            //     Number(
                            //         oItem.finalPrice
                            //     ),

                            lineTotal:
                                Number(
                                    oItem.lineTotal
                                ),

                            product_ID:
                                oItem.product_ID

                        };

                    });


                var oPayload = {

                    dealer_ID:
                        sDealerID,

                    orderDate:
                        sOrderDate,

                    status:
                        "PENDING",

                    totalAmount:
                        nTotal,

                    taxAmount:
                        nTax,

                    items:
                        aPOLineItems

                };


                console.log(
                    "Purchase Order Payload:",
                    oPayload
                );


                // =====================================================
                // CREATE PURCHASE ORDER + ITEMS
                // =====================================================

                try {

                    var oPurchaseModel =
                        this.getOwnerComponent()
                            .getModel("purchase");


                    var oPOListBinding =
                        oPurchaseModel.bindList(
                            "/PurchaseOrders"
                        );


                    /*
                    * Deep create:
                    *
                    * PurchaseOrders
                    *       |
                    *       └── items[]
                    *
                    * CAP will create the composition
                    * POLineItems automatically.
                    */

                    var oPOContext =
                        oPOListBinding.create(
                            oPayload
                        );


                    // Wait until backend creation finishes

                    await oPOContext.created();


                    // Get server response

                    var oCreatedPO =
                        oPOContext.getObject();


                    var sPONumber =
                        oCreatedPO &&
                        oCreatedPO.poNumber
                            ? oCreatedPO.poNumber
                            : "Purchase Order";


                    // =====================================================
                    // SUCCESS
                    // =====================================================

                    MessageBox.success(
                        sPONumber +
                        " created successfully.",
                        {

                            onClose: function () {

                                this.getOwnerComponent()
                                    .getRouter()
                                    .navTo(
                                        "PurchaseOrders"
                                    );

                            }.bind(this)

                        }
                    );


                } catch (oError) {

                    console.error(
                        "Create Purchase Order failed:",
                        oError
                    );


                    MessageBox.error(
                        this._getErrorMessage(
                            oError
                        )
                    );
                }
},


            // =====================================================
            // ERROR MESSAGE
            // =====================================================

            _getErrorMessage: function (oError) {

                if (
                    oError &&
                    oError.message
                ) {

                    return oError.message;
                }


                return "Unable to create Purchase Order.";
            },


            // =====================================================
            // CANCEL
            // =====================================================

            onCancel: function () {

                MessageBox.confirm(
                    "Do you want to cancel this Purchase Order?",
                    {

                        onClose: function (sAction) {

                            if (
                                sAction ===
                                MessageBox.Action.OK
                            ) {

                                this.onNavBack();
                            }

                        }.bind(this)

                    }
                );
            },


            // =====================================================
            // BACK
            // =====================================================

            onNavBack: function () {

                this.getOwnerComponent()
                    .getRouter()
                    .navTo(
                        "PurchaseOrders"
                    );
            }

        }
    );
});