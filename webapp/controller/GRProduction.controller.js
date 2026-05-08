
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

    return Controller.extend("zmigo.controller.GRProduction", {
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
            this.oViewModel.setProperty("/MoveType", "101");

            oView.setBusy(true);

            var aFilters = [new sap.ui.model.Filter("ProductionOrder", sap.ui.model.FilterOperator.EQ, sOrder)];

            oModel.read("/ProdOrderItems", {
                filters: aFilters,
                success: function (oData) {
                    oView.setBusy(false);

                    let overallQty = 0
                    var aHeaderTableItems = oData.results.map(function (item) {
                        overallQty += Number(item.PlannedTotalQty);
                        return {
                            Material: item.Product,
                            ProductName: item.ProductName,
                            Quantity: item.PlannedTotalQty,
                            Unit: item.ProductionUnit,
                            MoveType: item.GoodsMovementType,
                            Location: item.StorageLocation,
                            Batch: item.Batch,
                            Plant: item.Plant,
                            ManufacturingOrder: item.ProductionOrder
                        };
                    });
                    that.oViewModel.setProperty("/ProdItems", aHeaderTableItems)
                    that.oViewModel.setProperty("/AllOverQty", overallQty)
                    oView.byId("_IDGenPanel3").setExpanded(true);
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
                DistQty: 0,
                AllOverQty: 0,
                FilledQty: 0,
                ProdItems: [],
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

        PalletChange: function (oEvent) {
            let value = oEvent.getParameter("value");
            let line = this.oViewModel.getProperty("/ProdItems");
            let newLines = [];

            for (let index = 0; index < value; index++) {
                newLines = [...newLines, ...line.map((data, idx) => {
                    return {
                        ...data,
                        index: newLines.length + index + idx
                    }
                })];
            }
            this.oViewModel.setProperty("/ProdItems", newLines);
            this.qtyChange();

        },
        qtyChange: function () {
            let line = this.oViewModel.getProperty("/ProdItems");
            let filledQty = 0
            line.map((data) => {
                filledQty += Number(data.Quantity);
                return data
            })
            this.oViewModel.setProperty("/FilledQty", filledQty);
        },

        GenerateBatches: function () {
            var that = this;
            that.getView().setBusy(true);
            $.ajax({
                url: `/sap/bc/http/sap/ZHTTP_CREATEBATCH`,
                method: "POST",
                data: JSON.stringify(this.oViewModel.getProperty("/ProdItems")),
                headers: {
                    "Content-Type": "application/json"
                },
                success: function (result) {
                    if (result.ErrorMessage) {
                        MessageBox.error(result.ErrorMessage);
                    } else {
                        sap.m.MessageToast.show("Batches Generated Successfully");
                        const aItems = result.Items.map(item => {
                            const oItem = { ...item };
                            const aCharcs = result.BatchClassifications.filter(c =>
                                c.Material === item.Material && c.Batch === item.Batch
                            );
                            aCharcs.forEach(c => {
                                oItem[c.CharcDescription] = c.CharcValue;
                            });
                            return oItem;
                        });
                        that.oViewModel.setProperty("/ProdItems", aItems);

                        // Get unique characteristic names for column generation
                        if (result.BatchClassifications) {
                            const aCharacteristics = [
                                ...new Map(
                                    result.BatchClassifications.map(c => [c.CharcDescription, c.CharcValue])
                                ).entries()
                            ];
                            const oBatchClassMap = {};

                            result.BatchClassifications.forEach(c => {
                                const sKey = c.Material + "_" + c.Batch;
                                if (!oBatchClassMap[sKey]) {
                                    oBatchClassMap[sKey] = [];
                                }

                                // Avoid duplicate characteristics per material+batch
                                const bExists = oBatchClassMap[sKey].some(
                                    x => x.CharcInternalID === c.CharcInternalID
                                );

                                if (!bExists) {
                                    oBatchClassMap[sKey].push({
                                        CharcInternalID: c.CharcInternalID,
                                        Characteristic: c.Characteristic,
                                        CharcDescription: c.CharcDescription
                                    });
                                }
                            });

                            that.oViewModel.setProperty("/BatchClassMap", oBatchClassMap);

                            that._addDynamicColumns(aCharacteristics);
                        }
                    }
                    that.getView().setBusy(false);
                },
                error: function (result) {
                    console.log(result);
                    that.getView().setBusy(false);
                }
            })

        },

        _preparePayload: function () {
            const oModel = this.getView().getModel("Header");
            const aItems = oModel.getProperty("/ProdItems");
            const oBatchClassMap = oModel.getProperty("/BatchClassMap");
            const aProdItems = [];
            const aBatchClassifications = [];
            aItems.forEach(oItem => {
                aProdItems.push({
                    Material: oItem.Material,
                    ProductName: oItem.ProductName,
                    Plant: oItem.Plant,
                    Quantity: oItem.Quantity,
                    unit: oItem.Unit,
                    Batch: oItem.Batch,
                    MoveType: oItem.MoveType,
                    Location: oItem.Location,
                    ManufacturingOrder: oItem.ManufacturingOrder,
                    index: oItem.index
                });
                if (oBatchClassMap) {
                    const aCharKeys = oBatchClassMap[oItem.Material.padStart(18, "0") + "_" + oItem.Batch] || [];

                    aCharKeys.forEach(oCharMeta => {
                        aBatchClassifications.push({
                            Material: oItem.Material,
                            Batch: oItem.Batch,
                            CharcInternalID: oCharMeta.CharcInternalID,
                            Characteristic: oCharMeta.Characteristic,
                            CharcDescription: oCharMeta.CharcDescription,
                            CharcValue: oItem[oCharMeta.CharcDescription] ?? ""
                        });
                    });
                }
            });

            return {
                proditems: aProdItems,
                BatchClassifications: aBatchClassifications || []
            };
        },

        _addDynamicColumns: function (aCharacteristics) {
            const oTable = this.byId("_IDGenTable1");
            const aExisting = oTable.getColumns();
            aExisting.forEach(col => {
                if (col.data("dynamic")) {
                    oTable.removeColumn(col);
                }
            });

            aCharacteristics.forEach(([CharcDescription, CharcValue]) => {
                const oColumn = new sap.ui.table.Column({
                    width: "14rem",
                    label: new sap.m.Label({ text: CharcDescription }),
                    template: new sap.m.Input({
                        value: `{Header>${CharcDescription}}`
                    })
                });
                oColumn.data("dynamic", true);

                oTable.addColumn(oColumn);
            });
        },

        _removeDynamicColumns: function () {
            const oTable = this.byId("_IDGenTable1");
            const aExisting = oTable.getColumns();
            aExisting.forEach(col => {
                if (col.data("dynamic")) {
                    oTable.removeColumn(col);
                }
            });
        },
        onPost() {
            var that = this;
            if (Number(this.oViewModel.getProperty("/AllOverQty")) < Number(this.oViewModel.getProperty("/FilledQty"))) {
                MessageBox.error("Filled Qty cannot be greater than Material Qty.")
                return
            }
            let data = {
                ...this.oViewModel.getProperty("/"),
                ...this._preparePayload()
            }
            that.getView().setBusy(true);
            $.ajax({
                url: `/sap/bc/http/sap/ZHTTP_POST_GOODS_RCPT`,
                method: "POST",
                data: JSON.stringify({
                    ...this.oViewModel.getProperty("/"),
                    ...this._preparePayload()
                }),
                headers: {
                    "Content-Type": "application/json"
                },
                success: function (result) {
                    if (result.ErrorMessage) {
                        MessageBox.error(result.ErrorMessage);
                    } else {
                        MessageBox.success(`Document is posted Successfully with No - ${result.MaterialDocument} and Year - ${result.MaterialDocumentYear}`);
                        that._removeDynamicColumns();

                        that._rebindHeader();
                    }
                    that.getView().setBusy(false);
                },
                error: function (result) {
                    console.log(result);
                    that.getView().setBusy(false);
                }
            })
        },
        onCancel: function () {
            this._selectedChars = {};
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("RouteView1", {}, true);

        },

    });
});