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
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteGIProduction")
                .attachMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._selectedChars = {};
            if (this._oOrderDialog) {
                this._oOrderDialog.destroy();
                this._oOrderDialog = null;
            }
            if (this._oBatchDialog) {
                this._oBatchDialog.destroy();
                this._oBatchDialog = null;
            }
            this.getView().byId("materialPanel").setExpanded(false);
            this.getView().byId("itemPanel").setExpanded(true);
            this.getView().byId("inOrder").setValueState("None");
            this.getView().byId("_IDGenTable").clearSelection();
            this.getView().byId("TreeTableBasic").clearSelection();
            this.getView().byId("BatchClassificationTable").clearSelection();
            this._rebindHeader();
        },
        onOrderChange: function (oEvent) {
            this._rebindHeader();
            var sValue = oEvent.getParameter("value");
            var that = this;

            if (!sValue) {
                return;
            }

            oView.setBusy(true);
            oModel.read("/ProdOrder('" + sValue + "')", {
                success: function (oData) {
                    oView.setBusy(false);
                    if (oData) {
                        that.oViewModel.setProperty("/ManufacturingOrderPlant", oData.Plant);
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
            this.oViewModel.setProperty("/orderSelected", true);
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
                            BatchEditable: item.GoodsMovementType !== "531",
                            AutoEdit: true,
                            QuantityNumerator: item.QuantityNumerator,
                            QuantityDenominator: item.QuantityDenominator,
                            AlternativeUnit: item.AlternativeUnit,
                            QtyConv: item.AlternativeUnit ? (Number(item.RequiredQuantity) / ((Number(item.QuantityNumerator) || 1) / (Number(item.QuantityDenominator) || 1))).toFixed(3) : ""
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
                orderSelected: false,
                MoveType: "",
                ProductDescription: "",
                ProdItems: [],
                ProdDividedItem: [],
                BatchClassifications: [],
                ProdDividedItemCount: 0
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
                            let data = oEvent.getSource().getTable().getContextByIndex(oEvent.getSource().getTable().getSelectedIndex()).getObject()
                            if (data.WorkCenter) {
                                that.oViewModel.setProperty("/WorkCenter", data.WorkCenter);
                            }
                            that.oViewModel.setProperty("/ProductDescription", data.ProductName);
                            that._fillHeaderFields(data.ManufacturingOrder, data.OrderType);
                            that.oViewModel.setProperty("/ManufacturingOrderPlant", data.Plant);
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
                        }),
                        new sap.ui.comp.filterbar.FilterGroupItem({
                            groupName: "G1",
                            name: "Material",
                            label: "Product",
                            control: new sap.m.Input()
                        }),
                        new sap.ui.comp.filterbar.FilterGroupItem({
                            groupName: "G1",
                            name: "ProductName",
                            label: "Product Description",
                            control: new sap.m.Input()
                        })
                    ],
                    search: function (oEvt) {
                        var aSelectionSet = oEvt.getParameter("selectionSet");
                        var sOrder = aSelectionSet[0].getValue().toLowerCase();
                        var sType = aSelectionSet[1].getValue().toLowerCase();
                        var sMaterial = aSelectionSet[2].getValue().toLowerCase();
                        var sMaterialName = aSelectionSet[3].getValue().toLowerCase();


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
                        if (sMaterial) {
                            aFilters.push(new sap.ui.model.Filter("Material", sap.ui.model.FilterOperator.Contains, sMaterial));
                        }
                        if (sMaterialName) {
                            aFilters.push(new sap.ui.model.Filter("ProductName", sap.ui.model.FilterOperator.Contains, sMaterialName));
                        }

                        oBinding.filter(aFilters);
                    }
                });

                this._oOrderDialog.setFilterBar(oFilterBar);

                var oTable = this._oOrderDialog.getTable();
                var oColModel = new JSONModel({
                    cols: [
                        { label: "Production Order", template: "ManufacturingOrder" },
                        { label: "Production Order Type", template: "OrderType" },
                        { label: "Product", template: "Material" },
                        { label: "Product Description", template: "ProductName" },
                    ]
                });
                oTable.setModel(oColModel, "columns");
                var oDateColumn = new sap.ui.table.Column({
                    label: new sap.m.Label({ text: "Production Order Date" }),
                    template: new sap.m.Text({
                        text: {
                            path: "PoDate",
                            formatter: function (sValue) {
                                if (!sValue) return "";
                                var oDate = new Date(sValue);
                                var oFormatter = DateFormat.getDateInstance({ pattern: "dd-MM-yyyy" });
                                return oFormatter.format(oDate);
                            }
                        }
                    }),
                    width: "14rem"
                });
                oTable.addColumn(oDateColumn)
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
        onProductValueHelp: function (oEvent) {
            this.SelectedSPath = oEvent.getSource().getParent().getBindingContext("Header").getPath();
            var oView = this.getView();
            var that = this;
            var oModel = this.getOwnerComponent().getModel();

            if (!this.productDialog) {
                this.productDialog = new sap.ui.comp.valuehelpdialog.ValueHelpDialog({
                    title: "Product",
                    supportMultiselect: false,
                    key: "Product",
                    descriptionKey: "ProductDescription",
                    ok: function (oEvent) {
                        var aTokens = oEvent.getParameter("tokens");
                        if (aTokens.length > 0) {
                            let data = oEvent.getSource().getTable().getContextByIndex(oEvent.getSource().getTable().getSelectedIndex()).getObject()
                            that.oViewModel.setProperty(that.SelectedSPath, {
                                Material: data.Product,
                                ProductName: data.ProductDescription,
                                Unit: data.BaseUnit,
                                Plant: that.oViewModel.getProperty("/ManufacturingOrderPlant"),
                                BatchEditable: true,
                                MoveType: "261",
                                ManufacturingOrder: that.oViewModel.getProperty("/ManufacturingOrder"),
                                AutoEdit: false,
                                QuantityNumerator: data.QuantityNumerator,
                                QuantityDenominator: data.QuantityDenominator,
                                AlternativeUnit: data.AlternativeUnit,
                            })
                        }
                        this.close();
                        that.SelectedSPath = null;
                    },
                    cancel: function () {
                        that.SelectedSPath = null;
                        this.close();
                    }
                });

                var oFilterBar = new sap.ui.comp.filterbar.FilterBar({
                    advancedMode: true,
                    filterGroupItems: [
                        new sap.ui.comp.filterbar.FilterGroupItem({
                            groupName: "G1",
                            name: "Product",
                            label: "Product",
                            control: new sap.m.Input()
                        }),
                        new sap.ui.comp.filterbar.FilterGroupItem({
                            groupName: "G1",
                            name: "Descripton",
                            label: "ProductDescripton",
                            control: new sap.m.Input()
                        })
                    ],
                    search: function (oEvt) {
                        var aSelectionSet = oEvt.getParameter("selectionSet");
                        var sOrder = aSelectionSet[0].getValue().toLowerCase();
                        var sType = aSelectionSet[1].getValue().toLowerCase();

                        var oTable = that.productDialog.getTable();
                        oTable.setSelectionMode("Single");
                        var oBinding = oTable.getBinding("rows");

                        var aFilters = [];
                        if (sOrder) {
                            aFilters.push(new sap.ui.model.Filter("Product", sap.ui.model.FilterOperator.Contains, sOrder));
                        }
                        if (sType) {
                            aFilters.push(new sap.ui.model.Filter("ProductDescription", sap.ui.model.FilterOperator.Contains, sType));
                        }

                        oBinding.filter(aFilters);
                    }
                });

                this.productDialog.setFilterBar(oFilterBar);

                var oTable = this.productDialog.getTable();
                var oColModel = new JSONModel({
                    cols: [
                        { label: "Product", template: "Product" },
                        { label: "Description", template: "ProductDescription" },
                        { label: "Type", template: "ProductType" },
                        { label: "Unit", template: "BaseUnit" },
                    ]
                });
                oTable.setModel(oColModel, "columns");
            }


            this.productDialog.open();
            this.productDialog.getTable().setBusy(true);

            oModel.read("/ProductVH", {
                success: function (oData) {
                    var oLocalModel = new JSONModel({
                        results: oData.results
                    });

                    var oTable = that.productDialog.getTable();
                    oTable.setModel(oLocalModel);
                    oTable.bindRows("/results");

                    that.productDialog.update();
                    that.productDialog.setTitle(
                        "Products (" + oData.results.length + ")"
                    );

                    oTable.setBusy(false);
                },
                error: function () {
                    that.productDialog.getTable().setBusy(false);
                }
            });
        },
        onLocationValueHelp: function (oEvent) {
            this.SelectedSPath = oEvent.getSource().getParent().getBindingContext("Header").getPath();
            var oView = this.getView();
            var that = this;
            var oModel = this.getOwnerComponent().getModel();

            if (!this.locationDialog) {
                this.locationDialog = new sap.ui.comp.valuehelpdialog.ValueHelpDialog({
                    title: "Location",
                    supportMultiselect: false,
                    key: "StorageLocation",
                    descriptionKey: "StorageLocationName",
                    ok: function (oEvent) {
                        var aTokens = oEvent.getParameter("tokens");
                        if (aTokens.length > 0) {
                            let data = oEvent.getSource().getTable().getContextByIndex(oEvent.getSource().getTable().getSelectedIndex()).getObject()
                            that.oViewModel.setProperty(that.SelectedSPath + "/Location", data.StorageLocation)
                        }
                        this.close();
                        that.SelectedSPath = null;
                    },
                    cancel: function () {
                        that.SelectedSPath = null;
                        this.close();
                    }
                });

                var oFilterBar = new sap.ui.comp.filterbar.FilterBar({
                    advancedMode: true,
                    filterGroupItems: [
                        new sap.ui.comp.filterbar.FilterGroupItem({
                            groupName: "G1",
                            name: "StorageLocation",
                            label: "Location",
                            control: new sap.m.Input()
                        }),
                        new sap.ui.comp.filterbar.FilterGroupItem({
                            groupName: "G1",
                            name: "StorageLocationName",
                            label: "Name",
                            control: new sap.m.Input()
                        })
                    ],
                    search: function (oEvt) {
                        var aSelectionSet = oEvt.getParameter("selectionSet");
                        var sOrder = aSelectionSet[0].getValue().toLowerCase();
                        var sType = aSelectionSet[1].getValue().toLowerCase();

                        var oTable = that.locationDialog.getTable();
                        oTable.setSelectionMode("Single");
                        var oBinding = oTable.getBinding("rows");

                        var aFilters = [];
                        if (sOrder) {
                            aFilters.push(new sap.ui.model.Filter("StorageLocation", sap.ui.model.FilterOperator.Contains, sOrder));
                        }
                        if (sType) {
                            aFilters.push(new sap.ui.model.Filter("StorageLocationName", sap.ui.model.FilterOperator.Contains, sType));
                        }
                        aFilters.push(new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, that.oViewModel.getProperty("/ManufacturingOrderPlant")));
                        oBinding.filter(aFilters);
                    }
                });

                this.locationDialog.setFilterBar(oFilterBar);

                var oTable = this.locationDialog.getTable();
                var oColModel = new JSONModel({
                    cols: [
                        { label: "Location", template: "StorageLocation" },
                        { label: "Name", template: "StorageLocationName" },
                    ]
                });
                oTable.setModel(oColModel, "columns");
            }


            this.locationDialog.open();
            this.locationDialog.getTable().setBusy(true);

            oModel.read("/StorageLocationVH", {
                filters: [new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, that.oViewModel.getProperty("/ManufacturingOrderPlant"))],
                success: function (oData) {
                    var oLocalModel = new JSONModel({
                        results: oData.results
                    });

                    var oTable = that.locationDialog.getTable();
                    oTable.setModel(oLocalModel);
                    oTable.bindRows("/results");

                    that.locationDialog.update();
                    that.locationDialog.setTitle(
                        "Storage Location (" + oData.results.length + ")"
                    );

                    oTable.setBusy(false);
                },
                error: function () {
                    that.locationDialog.getTable().setBusy(false);
                }
            });
        },

        onBatchValueHelp: function (oEvent) {
            this.SelectedSPath = oEvent.getSource().getParent().getBindingContext("Header").getPath();
            var that = this;
            var oModel = this.getOwnerComponent().getModel();

            var oSource = oEvent.getSource();
            this._sTrackingPath = oSource.getBindingContext("Header").getPath();
            var oRowData = this.oViewModel.getProperty(this.SelectedSPath);

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
                        var oCurrentRowData = that.oViewModel.getProperty(that.SelectedSPath);

                        var aCurrentItems = that.oViewModel.getProperty("/ProdDividedItem") || [];
                        let selectedItems = oEvt.getSource().getTable().getSelectedIndices();
                        for (let index = 0; index < selectedItems.length; index++) {
                            let selectedData = oEvt.getSource().getTable().getContextByIndex(selectedItems[index]).getObject();
                            aCurrentItems.push({
                                Material: oCurrentRowData.Material,
                                ProductName: oCurrentRowData.ProductName,
                                Batch: selectedData.Batch,
                                Location: oCurrentRowData.Location,
                                Movementtype: oCurrentRowData.MoveType || oCurrentRowData.Movementtype,
                                Quantity: selectedData.MatlStkIncrQtyInMatlBaseUnit,
                                BatchQuantity: selectedData.MatlStkIncrQtyInMatlBaseUnit,
                                Unit: oCurrentRowData.Unit || "KG",
                                Plant: oCurrentRowData.Plant,
                                ManufacturingOrder: oCurrentRowData.ManufacturingOrder,
                                BatchEditable: true
                            });
                        };
                        that.oViewModel.setProperty("/ProdDividedItem", aCurrentItems);
                        that._updateProdDividedCount();
                        that.SelectedSPath = null;
                        this.close();
                    },
                    cancel: function () {
                        that.SelectedSPath = null;
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
                        { label: "Material Description", template: "ProductName" },
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
            var oRowContext = oEvent.getParameter("rowContext");
            if (!oRowContext) {
                return;
            }

            let selectRow = oRowContext.getObject();

            if (!selectRow || !selectRow.Material || !selectRow.Batch) {
                return;
            }

            if (!this._selectedChars) {
                this._selectedChars = {};
                this._fetchMaterialBatchClassifications(selectRow.Material, selectRow.Batch);
            } else {
                let oldProperty = this.oViewModel.getProperty("/BatchClassifications/1");
                if (oldProperty) {
                    this._selectedChars[`${oldProperty.Material}-${oldProperty.Batch}`] = this.oViewModel.getProperty("/BatchClassifications");
                }
                let details = this._selectedChars[`${selectRow.Material}-${selectRow.Batch}`];
                if (!details) {
                    this._fetchMaterialBatchClassifications(selectRow.Material, selectRow.Batch);
                } else {
                    this.oViewModel.setProperty("/BatchClassifications", this._selectedChars[`${selectRow.Material}-${selectRow.Batch}`]);
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
            var aProdItems = this.oViewModel.getProperty("/ProdItems") || [];
            var aProdDividedItem = this.oViewModel.getProperty("/ProdDividedItem") || [];

            var aInvalidBatches = aProdDividedItem.filter(function (oBatchItem) {
                return !aProdItems.some(function (oMatItem) {
                    return oMatItem.Material === oBatchItem.Material;
                });
            });

            if (aInvalidBatches.length > 0) {
                var sErrorMsg = "Please delete the following batch lines before posting:\n\n";
                aInvalidBatches.forEach(function (oItem) {
                    sErrorMsg += "• Batch: " + oItem.Batch + " | Material: " + oItem.Material + " is not present in Material Details.\n";
                });
                MessageBox.error(sErrorMsg);
                return;
            }

            var aRemainingBatches = this.oViewModel.getProperty("/ProdDividedItem") || [];

            let diff531Items = this.oViewModel.getProperty("/ProdItems").filter((data) => {
                if (data.MoveType !== "531") return false;

                var bExistsInDistribution = aRemainingBatches.some(function (item) {
                    return item.Material === data.Material && item.Movementtype === "531";
                });

                return !bExistsInDistribution;
            }).map((data) => {
                return {
                    Material: data.Material,
                    ProductName: data.ProductName,
                    Batch: '',
                    Location: data.Location,
                    Movementtype: data.MoveType || data.Movementtype,
                    Quantity: data.Quantity,
                    Unit: data.Unit || "KG",
                    Plant: data.Plant,
                    ManufacturingOrder: data.ManufacturingOrder,
                    BatchEditable: true
                }
            });

            that.getView().setBusy(true);
            $.ajax({
                url: `/sap/bc/http/sap/ZHTTP_POST_GOODS_ISSUE`,
                method: "POST",
                data: JSON.stringify({
                    ...this.oViewModel.getProperty("/"),
                    ProdDividedItem: [
                        ...this.oViewModel.getProperty("/ProdDividedItem"),
                        ...diff531Items
                    ],
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
                        MessageBox.success(`Document is posted Successfully with No - ${result.MaterialDocument} and Year - ${result.MaterialDocumentYear}`, {
                            onClose: function () {
                                that._resetForm();
                            }
                        });
                        that.getView().setBusy(false);
                    }
                },
                error: function (result) {
                    console.log(result);
                    that.getView().setBusy(false);
                }
            })
        },

        // onPost() {
        //     var that = this;
        //     let diff531Items = this.oViewModel.getProperty("/ProdItems").filter((data) => {
        //         return data.MoveType === "531"
        //     }).map((data) => {
        //         return {
        //             Material: data.Material,
        //             ProductName: data.ProductName,
        //             Batch: '',
        //             Location: data.Location,
        //             Movementtype: data.MoveType || data.Movementtype,
        //             Quantity: data.Quantity,
        //             Unit: data.Unit || "KG",
        //             Plant: data.Plant,
        //             ManufacturingOrder: data.ManufacturingOrder,
        //             BatchEditable: true
        //         }
        //     });
        //     that.getView().setBusy(true);
        //     $.ajax({
        //         url: `/sap/bc/http/sap/ZHTTP_POST_GOODS_ISSUE`,
        //         method: "POST",
        //         data: JSON.stringify({
        //             ...this.oViewModel.getProperty("/"),
        //             ProdDividedItem: [
        //                 ...this.oViewModel.getProperty("/ProdDividedItem"),
        //                 ...diff531Items
        //             ],
        //             BatchClassifications: Object.values(this.oViewModel.getProperty("/BatchClassifications")).flat()
        //         }),
        //         headers: {
        //             "Content-Type": "application/json"
        //         },
        //         success: function (result) {
        //             if (result.ErrorMessage) {
        //                 MessageBox.error(result.ErrorMessage);
        //                 that.getView().setBusy(false);
        //             } else {
        //                 MessageBox.success(`Document is posted Successfully with No - ${result.MaterialDocument} and Year - ${result.MaterialDocumentYear}`, {
        //                     onClose: function () {
        //                         that._resetForm();

        //                     }
        //                 });
        //                 that.getView().setBusy(false);
        //             }
        //         },
        //         error: function (result) {
        //             console.log(result);
        //             that.getView().setBusy(false);
        //         }
        //     })
        // },
        _updateProdDividedCount: function () {
            var iCount = (this.oViewModel.getProperty("/ProdDividedItem") || []).length;
            this.oViewModel.setProperty("/ProdDividedItemCount", iCount);
        },
        _resetForm: function () {
            this._selectedChars = {};

            if (this._oOrderDialog) {
                this._oOrderDialog.destroy();
                this._oOrderDialog = null;
            }
            if (this._oBatchDialog) {
                this._oBatchDialog.destroy();
                this._oBatchDialog = null;
            }

            this._rebindHeader();

            this.getView().byId("materialPanel").setExpanded(false);
            this.getView().byId("itemPanel").setExpanded(true);
            this.getView().byId("inOrder").setValueState("None");
            this.getView().byId("_IDGenTable").clearSelection();
            this.getView().byId("TreeTableBasic").clearSelection();
            this.getView().byId("BatchClassificationTable").clearSelection();

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("RouteView1", {}, true);
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

        onAddMaterialLine: function () {
            var aProdItems = this.oViewModel.getProperty("/ProdItems") || [];
            if (!this.oViewModel.getProperty("/ManufacturingOrder")) {
                MessageBox.error("Select Production Order");
                return;
            }

            var oNewLine = {
                Material: "",
                ProductName: "",
                Quantity: "",
                Unit: "",
                MoveType: "261",
                QtyConv: "",
                Plant: this.oViewModel.getProperty("/ManufacturingOrderPlant"),
                Location: "",
                Batch: "",
                BatchEditable: true,
                ManufacturingOrder: this.oViewModel.getProperty("/ManufacturingOrder")

            };

            aProdItems.push(oNewLine);
            this.oViewModel.setProperty("/ProdItems", aProdItems);
        },

        onDeleteMaterialLine: function () {
            var oTable = this.byId("_IDGenTable");
            var aSelectedIndices = oTable.getSelectedIndices();

            if (aSelectedIndices.length === 0) {
                sap.m.MessageToast.show("Please select a row to delete.");
                return;
            }

            var aProdItems = this.oViewModel.getProperty("/ProdItems") || [];

            aSelectedIndices.reverse().forEach(function (iIndex) {
                aProdItems.splice(iIndex, 1);
            });

            this.oViewModel.setProperty("/ProdItems", aProdItems);
            oTable.clearSelection();
        },
        onQuantityChange: function (oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource.getParent().getBindingContext("Header");
            var sPath = oContext.getPath();
            var oRow = this.oViewModel.getProperty(sPath);
            debugger
            var fQty = parseFloat(oEvent.getParameter("value")) || 0;

            if (oRow.AlternativeUnit) {
                var fNumerator = parseFloat(oRow.QuantityNumerator) || 1;
                var fDenominator = parseFloat(oRow.QuantityDenominator) || 1;
                var fConv = (fQty / (fNumerator / fDenominator)).toFixed(3);
                this.oViewModel.setProperty(sPath + "/QtyConv", fConv);
            } else {
                this.oViewModel.setProperty(sPath + "/QtyConv", "0.000");
            }
        },
        onDeleteBatchLine: function () {
            var oTable = this.byId("TreeTableBasic");
            var aSelectedIndices = oTable.getSelectedIndices();

            if (aSelectedIndices.length === 0) {
                sap.m.MessageToast.show("Please select a batch row to delete.");
                return;
            }

            var aProdDividedItem = this.oViewModel.getProperty("/ProdDividedItem") || [];

            // Get the deleted row's key before removing it
            var oDeletedRow = aProdDividedItem[aSelectedIndices[0]];

            aSelectedIndices.slice().reverse().forEach(function (iIndex) {
                aProdDividedItem.splice(iIndex, 1);
            });

            this.oViewModel.setProperty("/ProdDividedItem", aProdDividedItem);
            oTable.clearSelection();
            this._updateProdDividedCount();

            // Clear BatchClassifications if they belong to the deleted row
            if (oDeletedRow) {
                var aClassifications = this.oViewModel.getProperty("/BatchClassifications") || [];
                if (
                    aClassifications.length > 0 &&
                    aClassifications[0].Material === oDeletedRow.Material &&
                    aClassifications[0].Batch === oDeletedRow.Batch
                ) {
                    this.oViewModel.setProperty("/BatchClassifications", []);
                }

                // Also remove from the cache
                var sKey = oDeletedRow.Material + "-" + oDeletedRow.Batch;
                if (this._selectedChars && this._selectedChars[sKey]) {
                    delete this._selectedChars[sKey];
                }
            }
        },
    });
});