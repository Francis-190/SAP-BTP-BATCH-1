sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("claimsure.app.controller.App", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.attachRouteMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var sRouteName = oEvent.getParameter("name");
            var oAppModel = this.getOwnerComponent().getModel("app");

            // Keep the SideNavigation selection in sync with the active route.
            var sKey = sRouteName;
            if (sRouteName === "claimDetail") {
                sKey = "claims";
            }
            oAppModel.setProperty("/selectedKey", sKey);
        },

        onToggleSideNav: function () {
            var oToolPage = this.byId("toolPage");
            oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
        },

        onNavItemSelect: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo(sKey);
        },

        onGlobalSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            if (!sQuery) return;
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("claims", {}, true);
            // Claims view picks up ?q= via its own search field; for a true
            // global search you can extend this to pass query params.
        }
    });
});