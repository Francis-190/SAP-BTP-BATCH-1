sap.ui.define([
    "sap/ui/core/UIComponent",
    "purchasemanagement/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("purchasemanagement.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {

            
            // AnalyticMap.GeoJSONURL = sap.ui.require.toUrl( "pricingmaster/model/india_5_regions.geojson" );

            // console.log(sap.ui.require.toUrl( "pricingmaster/model/india_5_regions.geojson" ));
             

            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // enable routing
            this.getRouter().initialize();
        }
    });
});