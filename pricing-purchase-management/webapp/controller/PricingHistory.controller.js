sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, MessageToast, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("purchasemanagement.controller.PricingHistory", {
        
        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            var oRoute = oRouter.getRoute("RoutePricingHistory");
            if (oRoute) {
                oRoute.attachPatternMatched(this._onRouteMatched, this);
            }
        },

        _onRouteMatched: function () {
            // Optional: Trigger any data refreshing or logging when history view opens
            var oTable = this.byId("idTablePricingHistory");
            var oBinding = oTable.getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
        },

        formatStatusState: function (sStatus) {
            switch (sStatus) {
                case "ACTIVE": return "Success";
                case "SUBMITTED":
                case "DRAFT": return "Warning";
                case "REJECTED":
                case "EXPIRED": return "Error";
                default: return "None";
            }
        },

        onSearchHistory: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            var aFilters = [];
            
            if (sQuery) {
                aFilters.push(new Filter("product_ID", FilterOperator.Contains, sQuery));
            }
            
            var oTable = this.byId("idTablePricingHistory");
            var oBinding = oTable.getBinding("items");
            if (oBinding) {
                oBinding.filter(aFilters);
            }
        },

        onNavBack: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            // Navigates back to the Home dashboard view (adjust route name if needed)
            oRouter.navTo("RouteHome"); 
        }
    });
});