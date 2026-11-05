sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";


    // ================================================================
    // SIDEBAR NAVIGATION TARGETS
    // ================================================================

    const oNavTargets = {

        dashboard: {
            route: "dashboard"
        },

        all: {
            route: "inventory",
            params: {
                filter: "all"
            }
        },

        lowStock: {
            route: "inventory",
            params: {
                filter: "lowStock"
            }
        },

        healthy: {
            route: "inventory",
            params: {
                filter: "healthy"
            }
        },

        issue: {
            route: "issue"
        },

        serviceCenter: {
            route: "serviceCenter"
        },
        inspection: {
            route: "inspection"
        },
        transfer: {
            route: "transfer"
        },

        // Key matches the route name so the sidebar highlight follows it.
        purchaseRequisitions: {
            route: "purchaseRequisitions"
        }
    };


    return Controller.extend(
        "inventorytest.controller.App",
        {


            // ========================================================
            // INITIALIZATION
            // ========================================================

            onInit: function () {

                // Model used only for sidebar
                // selection/highlighting.
                this.getView().setModel(
                    new JSONModel({
                        selectedKey: "dashboard"
                    }),
                    "appNav"
                );


                // Keep sidebar selection synchronized
                // with the current route.
                this.getOwnerComponent()
                    .getRouter()
                    .attachRouteMatched(
                        this._onAnyRouteMatched,
                        this
                    );
            },


            // ========================================================
            // HAMBURGER BUTTON
            // ========================================================

            onToggleSideNavigation: function () {

                const oSideNavigation =
                    this.byId("appSideNav");


                const bExpanded =
                    oSideNavigation.getExpanded();


                // Toggle between:
                // collapsed -> expanded
                // expanded -> collapsed
                oSideNavigation.setExpanded(
                    !bExpanded
                );
            },


            // ========================================================
            // ROUTE MATCHED
            // ========================================================

            _onAnyRouteMatched: function (oEvent) {

                const sRouteName =
                    oEvent.getParameter("name");


                const oArgs =
                    oEvent.getParameter("arguments") || {};


                let sKey = sRouteName;


                // ----------------------------------------------------
                // Inventory route can represent multiple
                // sidebar selections.
                // ----------------------------------------------------

                if (sRouteName === "inventory") {

                    if (oArgs.filter === "lowStock") {

                        sKey = "lowStock";

                    } else if (oArgs.filter === "healthy") {

                        sKey = "healthy";

                    } else {

                        sKey = "all";
                    }
                }


                // ----------------------------------------------------
                // Update selected sidebar item.
                // ----------------------------------------------------

                const oAppNavModel =
                    this.getView()
                        .getModel("appNav");


                if (oAppNavModel) {

                    oAppNavModel.setProperty(
                        "/selectedKey",
                        sKey
                    );
                }
            },


            // ========================================================
            // SIDEBAR ITEM SELECT
            // ========================================================

            onSideNavItemSelect: function (oEvent) {

                const sKey =
                    oEvent
                        .getParameter("item")
                        .getKey();


                const oTarget =
                    oNavTargets[sKey];


                // Unknown navigation item.
                if (!oTarget) {
                    return;
                }


                const oRouter =
                    this.getOwnerComponent()
                        .getRouter();


                // ----------------------------------------------------
                // Check that the route exists.
                // ----------------------------------------------------

                if (!oRouter.getRoute(oTarget.route)) {

                    // eslint-disable-next-line no-console
                    console.warn(
                        "Route \"" +
                        oTarget.route +
                        "\" is not defined in manifest.json."
                    );

                    return;
                }


                // ----------------------------------------------------
                // Navigate.
                // ----------------------------------------------------

                oRouter.navTo(
                    oTarget.route,
                    oTarget.params || {}
                );
            }

        }
    );
});