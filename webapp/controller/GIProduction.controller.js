sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ui/core/format/DateFormat",
    "sap/m/MessageToast",
    "sap/m/SearchField",
    "sap/m/Label",
    "sap/ui/table/Column",
    "sap/m/Text",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/ui/model/type/String",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/comp/valuehelpdialog/ValueHelpDialog",
    "sap/m/BusyDialog",
    "sap/m/Input",
    "sap/ui/comp/filterbar/FilterBar",
    "sap/ui/comp/filterbar/FilterGroupItem"
], function (Controller, JSONModel, MessageBox, DateFormat) {
    "use strict";

    return Controller.extend("zmigo.controller.GIProduction", {
        onInit: function () {
            this._rebindHeader();
        },
        onOrderChange: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var that = this;

            if (!sValue) {
                this._rebindHeader();
                return;
            }

            oView.setBusy(true);
            oModel.read("/ProdOrder('" + sValue + "')", {
                success: function (oData) {
                    oView.setBusy(false);
                    if (oData) {
                        that._fillHeaderFields(oData.ManufacturingOrder, oData.OrderType);
                    }
                },
                error: function () {
                    oView.setBusy(false);
                    sap.m.MessageBox.error("Order number " + sValue + " does not exist.");
                    oEvent.getSource().setValue("");
                    that._rebindHeader();
                }
            });
        },

        _fillHeaderFields: function (sOrder, sType) {
            var oNow = new Date();
            var oDateFormatter = DateFormat.getDateInstance({ pattern: "yyyy-MM-ddTHH:mm:ss" });
            var sFormattedDate = oDateFormatter.format(oNow);
            var oModel = this.getOwnerComponent().getModel();
            var that = this,
                oView = this.getView();

            this.oViewModel.setProperty("/ManufacturingOrder", sOrder);
            this.oViewModel.setProperty("/OrderType", sType);
            this.oViewModel.setProperty("/DocumentDate", sFormattedDate);
            this.oViewModel.setProperty("/PostingDate", sFormattedDate);
            this.oViewModel.setProperty("/MoveType", "261");

            oView.setBusy(true);

            var aFilters = [new sap.ui.model.Filter("ProductionOrder", sap.ui.model.FilterOperator.EQ, sOrder)];

            oModel.read("/ProdOrderDetails", {
                filters: aFilters,
                success: function (oData) {
                    oView.setBusy(false);


                    var aHeaderTableItems = oData.results.map(function (item) {
                        return {
                            Material: item.Material,
                            ProductName: item.ProductName,
                            Quantity: item.RequiredQuantity,
                            Unit: item.BaseUnit,
                            MoveType: item.GoodsMovementType,
                            Location: item.StorageLocation,
                            Batch: item.Batch,
                            Plant: item.Plant,
                            ManufacturingOrder: item.ProductionOrder,
                            BatchEditable: item.GoodsMovementType !== "531"
                        };
                    });
                    that.oViewModel.setProperty("/ProdItems", aHeaderTableItems)
                    oView.byId("materialPanel").setExpanded(true);
                },
                error: function () {
                    oView.setBusy(false);
                    sap.m.MessageToast.show("Error fetching material details.");
                }
            });
        },

        _rebindHeader: function () {
            var oData = {
                DocumentDate: null,
                PostingDate: null,
                HeaderText: "",
                ManufacturingOrder: "",
                RefernceDocument: "",
                fieldsEnabled: true,
                MoveType: "",
                ProdItems: [],
                ProdDividedItem: [],
                BatchClassifications: []
            };

            this.oViewModel = new JSONModel(oData);
            this.getView().setModel(this.oViewModel, "Header");
        },

        onPOValueHelp: function () {
            var oView = this.getView();
            var that = this;
            var oModel = this.getOwnerComponent().getModel();

            if (!this._oOrderDialog) {
                this._oOrderDialog = new sap.ui.comp.valuehelpdialog.ValueHelpDialog({
                    title: "Production Order",
                    supportMultiselect: false,
                    key: "ManufacturingOrder",
                    descriptionKey: "OrderType",
                    ok: function (oEvent) {
                        var aTokens = oEvent.getParameter("tokens");
                        if (aTokens.length > 0) {
                            var sSelectedPO = aTokens[0].getKey();
                            var sSelectedType = aTokens[0].getText();
                            that._fillHeaderFields(sSelectedPO, sSelectedType);
                        }
                        this.close();
                    },
                    cancel: function () { this.close(); }
                });

                var oFilterBar = new sap.ui.comp.filterbar.FilterBar({
                    advancedMode: true,
                    filterGroupItems: [
                        new sap.ui.comp.filterbar.FilterGroupItem({
                            groupName: "G1",
                            name: "ManufacturingOrder",
                            label: "Production Order",
                            control: new sap.m.Input()
                        }),
                        new sap.ui.comp.filterbar.FilterGroupItem({
                            groupName: "G1",
                            name: "OrderType",
                            label: "Production Order Type",
                            control: new sap.m.Input()
                        })
                    ],
                    search: function (oEvt) {
                        var aSelectionSet = oEvt.getParameter("selectionSet");
                        var sOrder = aSelectionSet[0].getValue().toLowerCase();
                        var sType = aSelectionSet[1].getValue().toLowerCase();

                        var oTable = that._oOrderDialog.getTable();
                        oTable.setSelectionMode("Single");
                        var oBinding = oTable.getBinding("rows");

                        var aFilters = [];
                        if (sOrder) {
                            aFilters.push(new sap.ui.model.Filter("ManufacturingOrder", sap.ui.model.FilterOperator.Contains, sOrder));
                        }
                        if (sType) {
                            aFilters.push(new sap.ui.model.Filter("OrderType", sap.ui.model.FilterOperator.Contains, sType));
                        }

                        oBinding.filter(aFilters);
                    }
                });

                this._oOrderDialog.setFilterBar(oFilterBar);

                var oTable = this._oOrderDialog.getTable();
                var oColModel = new JSONModel({
                    cols: [
                        { label: "Production Order", template: "ManufacturingOrder" },
                        { label: "Production Order Type", template: "OrderType" }
                    ]
                });
                oTable.setModel(oColModel, "columns");
            }


            this._oOrderDialog.open();
            this._oOrderDialog.getTable().setBusy(true);

            oModel.read("/ProdOrder", {
                success: function (oData) {
                    var oLocalModel = new JSONModel({
                        results: oData.results
                    });

                    var oTable = that._oOrderDialog.getTable();
                    oTable.setModel(oLocalModel);
                    oTable.bindRows("/results");

                    that._oOrderDialog.update();
                    that._oOrderDialog.setTitle(
                        "Production Order (" + oData.results.length + ")"
                    );

                    oTable.setBusy(false);
                },
                error: function () {
                    that._oOrderDialog.getTable().setBusy(false);
                }
            });
        },

        onBatchValueHelp: function (oEvent) {
            var that = this;
            var oModel = this.getOwnerComponent().getModel();

            var oSource = oEvent.getSource();
            this._sTrackingPath = oSource.getBindingContext("Header").getPath();
            var oRowData = oSource.getBindingContext("Header").getObject();

            var sCurrentMaterial = oRowData.Material;
            var sCurrentLocation = oRowData.Location;

            if (!sCurrentMaterial) {
                sap.m.MessageToast.show("Please ensure Material is present first.");
                return;
            }

            var aExistingItems = this.oViewModel.getProperty("/ProdDividedItem") || [];

            var aExcludeBatches = aExistingItems
                .filter(function (item) {
                    return item.Material === sCurrentMaterial && item.Batch;
                })
                .map(function (item) {
                    return item.Batch;
                });

            if (!this._oBatchDialog) {
                this._oBatchDialog = new sap.ui.comp.valuehelpdialog.ValueHelpDialog({
                    title: "Select Available Batches",
                    supportMultiselect: true,
                    key: "Batch",
                    descriptionKey: "Batch",
                    ok: function (oEvt) {

                        ;
                        var aTokens = oEvt.getParameter("tokens");
                        var aCurrentItems = that.oViewModel.getProperty("/ProdDividedItem") || [];
                        if (aTokens.length > 0) {
                            aTokens.forEach(function (oToken) {
                                aCurrentItems.push({
                                    Material: oRowData.Material,
                                    ProductName: oRowData.ProductName,
                                    Batch: oToken.getKey(),
                                    Location: oRowData.Location,
                                    Movementtype: oRowData.MoveType || oRowData.Movementtype,
                                    Quantity: "0.000",
                                    Unit: oRowData.Unit || "KG",
                                    Plant: oRowData.Plant,
                                    ManufacturingOrder: oRowData.ManufacturingOrder,
                                    BatchEditable: true
                                });
                            });
                            that.oViewModel.setProperty("/ProdDividedItem", aCurrentItems);
                        }
                        this.close();
                    },
                    cancel: function () {
                        this.close();
                    }
                });

                this._oBatchDialog.setFilterBar(new sap.ui.comp.filterbar.FilterBar({
                    advancedMode: true,
                    filterGroupItems: [
                        new sap.ui.comp.filterbar.FilterGroupItem({
                            groupName: "G1", name: "Material", label: "Material",
                            control: new sap.m.Input({ editable: false })
                        }),
                        new sap.ui.comp.filterbar.FilterGroupItem({
                            groupName: "G1", name: "StorageLocation", label: "Storage Location",
                            control: new sap.m.Input({ editable: false })
                        })
                    ]
                }));

                this._oBatchDialog.getTable().setModel(new JSONModel({
                    cols: [
                        { label: "Batch", template: "Batch" },
                        { label: "Material", template: "Material" },
                        { label: "Storage Location", template: "StorageLocation" },
                        { label: "Net Stock", template: "NetStock" }
                    ]
                }), "columns");
            }
            this._oBatchDialog.getTable().unbindRows();
            this._oBatchDialog.setTokens([]);

            var oFB = this._oBatchDialog.getFilterBar();
            oFB.getFilterGroupItems()[0].getControl().setValue(sCurrentMaterial);
            oFB.getFilterGroupItems()[1].getControl().setValue(sCurrentLocation);

            this._oBatchDialog.open();
            this._oBatchDialog.getTable().setBusy(true);

            var aFilters = [
                new sap.ui.model.Filter("Material", sap.ui.model.FilterOperator.EQ, sCurrentMaterial),
                new sap.ui.model.Filter("StorageLocation", sap.ui.model.FilterOperator.EQ, sCurrentLocation)
            ];

            oModel.read("/BatchVH", {
                filters: aFilters,
                success: function (oData) {
                    var aFilteredResults = oData.results.filter(function (item) {
                        return !aExcludeBatches.includes(item.Batch);
                    }).map(function (item) {
                        var nStock = parseFloat(item.MatlStkIncrQtyInMatlBaseUnit || 0) - parseFloat(item.MatlCnsmpnQtyInMatlBaseUnit || 0);
                        return Object.assign({}, item, { NetStock: nStock.toFixed(3) });
                    });

                    var oLocalModel = new JSONModel({ results: aFilteredResults });
                    var oTable = that._oBatchDialog.getTable();
                    oTable.setModel(oLocalModel);
                    oTable.bindRows("/results");
                    oTable.setBusy(false);
                    that._oBatchDialog.update();
                },
                error: function () {
                    that._oBatchDialog.getTable().setBusy(false);
                }
            });
        },

        OnDistriButionChange: function (oEvent) {
            let selectRow = oEvent.getParameter("rowContext").getObject();
            if (!this._selectedChars) {
                this._selectedChars = {};
                this._fetchMaterialBatchClassifications(selectRow.Material, selectRow.Batch)
            }
            else {
                let oldProperty = this.oViewModel.getProperty("/BatchClassifications/1");
                if (oldProperty) this._selectedChars[`${oldProperty.Material}-${oldProperty.Batch}`] = this.oViewModel.getProperty("/BatchClassifications");
                let details = this._selectedChars[`${selectRow.Material}-${selectRow.Batch}`];
                if (!details) {
                    this._fetchMaterialBatchClassifications(selectRow.Material, selectRow.Batch)
                }
                else {
                    this.oViewModel.setProperty("/BatchClassifications", this._selectedChars[`${selectRow.Material}-${selectRow.Batch}`])
                }
            }
        },

        _fetchMaterialBatchClassifications: function (Material, Batch) {
            var that = this;
            that.getView().setBusy(true);
            $.ajax({
                url: `/sap/bc/http/sap/ZHTTP_GETBATCHCHARS`,
                method: "GET",
                headers: {
                    Material: Material,
                    Batch: Batch
                },
                success: function (result) {
                    if (result.length > 0) {
                        that._selectedChars[`${Material}-${Batch}`] = result
                        that.oViewModel.setProperty("/BatchClassifications", that._selectedChars[`${Material}-${Batch}`])
                    } else {
                        sap.m.MessageToast.show("No Characteristics found");
                        that.oViewModel.setProperty("/BatchClassifications", [])
                    }
                    that.getView().setBusy(false);

                },
                error: function (result) {
                    console.log(result);
                    that.getView().setBusy(false);
                }
            })
        },

        onPost() {
            var that = this;
            that.getView().setBusy(true);
            $.ajax({
                url: `/sap/bc/http/sap/ZHTTP_POST_GOODS_ISSUE`,
                method: "POST",
                data: JSON.stringify({
                    ...this.oViewModel.getProperty("/"),
                    BatchClassifications: Object.values(this.oViewModel.getProperty("/BatchClassifications")).flat()
                }),
                headers: {
                    "Content-Type": "application/json"
                },
                success: function (result) {
                    if (result.ErrorMessage) {
                        MessageBox.error(result.ErrorMessage);
                        that.getView().setBusy(false);
                    } else {
                        MessageBox.success(`Document is posted Successfully with No - ${result.MaterialDocument} and Year - ${result.MaterialDocumentYear}`);
                        that.getView().setBusy(false);
                        var oModel = that.getView().getModel("Header");
                        if (oModel) {
                            oModel.setProperty("/ManufacturingOrder", "");
                            oModel.setProperty("/DocumentDate", null);
                            oModel.setProperty("/PostingDate", null);
                            oModel.setProperty("/HeaderText", "");
                            oModel.setProperty("/RefernceDocument", "");
                            oModel.setProperty("/MoveType", "");
                            oModel.setProperty("/ProdItems", []);
                            oModel.setProperty("/ProdDividedItem", []);
                            oModel.setProperty("/BatchClassifications", []);
                        }
                        that._selectedChars = {};
                        that.getView().byId("materialPanel").setExpanded(false);
                        that._rebindHeader();

                        that._rebindHeader();
                    }
                },
                error: function (result) {
                    console.log(result);
                    that.getView().setBusy(false);
                }
            })
        },
        onCancel: function () {
            this._selectedChars = {};

            var oModel = this.getView().getModel("Header");
            if (oModel) {
                oModel.setProperty("/ManufacturingOrder", "");
                oModel.setProperty("/DocumentDate", null);
                oModel.setProperty("/PostingDate", null);
                oModel.setProperty("/HeaderText", "");
                oModel.setProperty("/RefernceDocument", "");
                oModel.setProperty("/MoveType", "");
                oModel.setProperty("/ProdItems", []);
                oModel.setProperty("/ProdDividedItem", []);
                oModel.setProperty("/BatchClassifications", []);
            }

               this._selectedChars = {};
                var oRouter = this.getOwnerComponent().getRouter();
                oRouter.navTo("RouteView1", {}, true);
            
        },

    });
});