sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("dealermangement.controller.App", {

        onInit: function () {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.attachRouteMatched(this._onRouteMatched, this);
        },

        // Keep the side nav highlight in sync with whatever route is active,
        // including deep links straight into DealerDetails/{dealerId}.
        _onRouteMatched: function (oEvent) {
            const sRouteName = oEvent.getParameter("name");
            const oSideNav = this.byId("appSideNavigation");
            if (!oSideNav) return;

            const mRouteToKey = {
                "RouteHome": "home",
                "RouteDealer": "dealer",
                "DealerDetails": "dealer",
                "RouteProducts": "product",
                "ProductObjectPage": "product",
                "ApprovalHistory": "approvalHistory"
            };

            const sKey = mRouteToKey[sRouteName];
            if (sKey) oSideNav.setSelectedKey(sKey);
        },

        onSideNavItemSelect: function (oEvent) {
            const sKey = oEvent.getParameter("item").getKey();
            const oRouter = this.getOwnerComponent().getRouter();

            switch (sKey) {
                case "home":
                    oRouter.navTo("RouteHome");
                    break;
                case "dealer":
                    oRouter.navTo("RouteDealer");
                    break;
                case "product":
                    oRouter.navTo("RouteProducts");
                    break;
                case "approvalHistory":
                    oRouter.navTo("ApprovalHistory");
                    break;
            }
        },

        onSideNavToggle: function () {
            const oToolPage = this.byId("toolPage");
            oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
        }

    });
});