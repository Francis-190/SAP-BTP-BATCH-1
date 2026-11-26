const cds=require("@sap/cds");


module.exports=cds.service.impl(function() {
    

    require('./inventory-service').call(this);
    require('./transfer-service').call(this);

})