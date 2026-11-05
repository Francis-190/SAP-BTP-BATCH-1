sap.ui.define([
  "sap/ui/core/mvc/Controller"
], (BaseController) => {
  "use strict";

  return BaseController.extend("pricingmaster.controller.App", {
      onInit() {
          this.oRouter = this.getOwnerComponent().getRouter();
      },

      onSideNavButtonPress() {
          const oToolPage = this.byId("toolPage");
          const bSideExpanded = oToolPage.getSideExpanded();
          oToolPage.setSideExpanded(!bSideExpanded);
      },

      onItemSelect(oEvent) {
          const oItem = oEvent.getParameter("item");
          const sKey = oItem.getKey();
          this.oRouter.navTo(sKey);
      }
  });
});