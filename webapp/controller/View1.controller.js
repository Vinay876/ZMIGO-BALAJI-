sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("zmigo.controller.View1", {
        
        onNavToGRProd: function () {
            this._getRouter().navTo("RouteGRProduction");
        },
        
        onNavToGIProd: function () {
            this._getRouter().navTo("RouteGIProduction");
        },
        
        onNavToGRPur: function () {
            this._getRouter().navTo("RouteGRPurchase");
        },

        _getRouter: function () {
            return this.getOwnerComponent().getRouter();
        }
    });
});