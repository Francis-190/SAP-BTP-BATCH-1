sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast"
], function (
    Controller,
    MessageToast
) {

    "use strict";

    return Controller.extend(
        "purchasemanagement.controller.App",
        {

            // =========================================================
            // INITIALIZATION
            // =========================================================

            onInit: function () {

                this.oRouter =
                    this.getOwnerComponent()
                        .getRouter();

                this.oSideNavigation =
                    this.byId("sideNavigation");

                  // Listen to every route change
                this.oRouter.attachRouteMatched( this._onRouteMatched, this );

            },


            // =========================================================
            // ROUTE MATCHED
            // =========================================================

            _onRouteMatched: function (oEvent) {

                var sRouteName = oEvent.getParameter("name");

                console.log( "Current route:", sRouteName );

                if (sRouteName === "Purchase") {

                    this.oSideNavigation.setExpanded(false);

                }

                else {

                    this.oSideNavigation.setExpanded(true);

                }

            },


            // =========================================================
            // TOGGLE SIDE NAVIGATION
            // =========================================================

            onToggleSideNavigation: function () {

                if (!this.oSideNavigation) {
                    return;
                }

                var bExpanded =
                    this.oSideNavigation.getExpanded();

                this.oSideNavigation.setExpanded(
                    !bExpanded
                );

            },


            // =========================================================
            // NAVIGATION
            // =========================================================

            onNavigationSelect: function (oEvent) {

                var oItem =
                    oEvent.getParameter("item");

                if (!oItem) {
                    return;
                }

                var sKey =
                    oItem.getKey();

                console.log(
                    "Navigation key:",
                    sKey
                );


                switch (sKey) {


                    // =================================================
                    // DASHBOARD
                    // =================================================

                    case "dashboard":

                        this.oRouter.navTo(
                            "Purchase"
                        );

                        break;


                    // Keep compatibility if old key is used
                    case "home":

                        this.oRouter.navTo(
                            "Purchase"
                        );

                        break;


                    // =================================================
                    // PURCHASE ORDERS
                    // =================================================

                    case "purchase":

                        /*
                         * Parent menu item.
                         * No navigation required.
                         */

                        break;


                    case "allOrders":

                        this.oRouter.navTo(
                            "PurchaseOrders"
                        );

                        break;


                    case "createOrder":

                        this.oRouter.navTo(
                            "CreatePurchaseOrder"
                        );

                        break;


                    // =================================================
                    // INVENTORY
                    // =================================================

                    case "inventory":

                        /*
                         * Parent menu item.
                         * No navigation required.
                         */

                        break;


                    // =================================================
                    // PRODUCTS
                    // =================================================

                    case "products":

                        this.oRouter.navTo(
                            "Products"
                        );

                        break;


                    // =================================================
                    // WAREHOUSES
                    // =================================================

                    case "warehouses":

                        console.log(
                            "Opening Warehouses page"
                        );

                        this.oRouter.navTo(
                            "Warehouses"
                        );

                        break;


                    // =================================================
                    // STOCK
                    // =================================================

                    case "stock":

                        console.log(
                            "Opening Stock page"
                        );

                        this.oRouter.navTo(
                            "Stock"
                        );

                        break;


                    // =================================================
                    // PRICING
                    // =================================================

                    case "pricing":

                        /*
                         * Parent menu item.
                         * No navigation required.
                         */

                        break;


                    case "priceMaster":

                        this.oRouter.navTo(
                            "PriceMaster"
                        );

                        break;


                    case "priceHistory":

                        this.oRouter.navTo(
                            "PriceHistory"
                        );

                        break;


                    // =================================================
                    // ANALYTICS
                    // =================================================

                    case "analytics":

                        this.oRouter.navTo(
                            "Analytics"
                        );

                        break;

                    // =================================================
                    // ANALYTICS
                    // =================================================

                    case "dealerAnalytics":
                        this.oRouter.navTo("DealerAnalytics");
                        break;
                    
                    case "purchaseOrderAnalytics":
                        this.oRouter.navTo("PurchaseOrderAnalytics");
                        break;

                    case "productSalesAnalytics":
                        this.oRouter.navTo("ProductSalesAnalytics");
                        break;

                    case "pricingAnalytics":
                        this.oRouter.navTo("PricingAnalytics");
                        break;

                    case "monthlyAnalytics":
                        this.oRouter.navTo("MonthlyAnalytics");
                        break;


                    // =================================================
                    // DEFAULT
                    // =================================================

                    default:

                        console.warn(
                            "No navigation configured for key:",
                            sKey
                        );

                        break;

                }

            },


            // =========================================================
            // HEADER SEARCH
            // =========================================================

            onSearch: function () {

                MessageToast.show(
                    "Search functionality"
                );

            },


            // =========================================================
            // NOTIFICATIONS
            // =========================================================

            onNotifications: function () {

                MessageToast.show(
                    "No new notifications"
                );

            },


            // =========================================================
            // USER PROFILE
            // =========================================================

            onUserPress: function () {

                MessageToast.show(
                    "User profile"
                );

            }

        }
    );

});