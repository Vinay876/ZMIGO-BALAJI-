
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
            this.oViewModel.setProperty("/orderSelected", true);
            this.oViewModel.setProperty("/DocumentDate", sFormattedDate);
            this.oViewModel.setProperty("/PostingDate", sFormattedDate);
            this.oViewModel.setProperty("/MoveType", "101");

            oView.setBusy(true);

            var aFilters = [new sap.ui.model.Filter("ProductionOrder", sap.ui.model.FilterOperator.EQ, sOrder)];

            oModel.read("/ProdOrderItems", {
                filters: aFilters,
                success: function (oData) {
                    oView.setBusy(false);

                    let overallQty = 0,
                        confirmedQty = 0
                    var aHeaderTableItems = oData.results.map(function (item) {
                        overallQty += parseFloat(item.PlannedTotalQty) || 0
                        confirmedQty += Number(item.ConfirmedTotalQty);
                        return {
                            Material: item.Product,
                            ProductName: item.ProductName,
                            Quantity: '',
                            Unit: item.ProductionUnit,
                            MoveType: item.GoodsMovementType,
                            Location: item.StorageLocation,
                            Batch: item.Batch,
                            Plant: item.Plant,
                            ManufacturingOrder: item.ProductionOrder,
                            QuantityNumerator: item.QuantityNumerator,
                            QuantityDenominator: item.QuantityDenominator,
                            AlternativeUnit: item.AlternativeUnit,
                        };
                    });
                    console.log("overallQty:", overallQty);
                    that.oViewModel.setProperty("/AllOverQty", overallQty)
                    that.oViewModel.setProperty("/ConfirmedTotalQty", confirmedQty)
                    for (let index = 0; index < aHeaderTableItems.length; index++) {
                        that.GenerateBatches(aHeaderTableItems[index])
                    }

                    oView.setBusy(false);
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
                orderSelected: false,
                MoveType: "",
                DistQty: 0,
                AllOverQty: 0,
                FilledQty: 0,
                ProdItems: [],
                BatchClassifications: [],
                ProdItemsCount: 0
            };

            this.oViewModel = new JSONModel(oData);
            this.getView().setModel(this.oViewModel, "Header");
        },
        _updateProdItemsCount: function () {
            var iCount = (this.oViewModel.getProperty("/ProdItems") || []).length;
            this.oViewModel.setProperty("/ProdItemsCount", iCount);

        },

        _updateFilledQty: function () {
            var aProdItems = this.oViewModel.getProperty("/ProdItems") || [];
            var fTotal = aProdItems.reduce(function (sum, item) {
                return sum + (parseFloat(item.Quantity) || 0);
            }, 0);
            this.oViewModel.setProperty("/FilledQty", fTotal);
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

                            var oSelected = that._aProdOrderResults &&
                                that._aProdOrderResults.find(function (o) {
                                    return o.ManufacturingOrder === sSelectedPO;
                                });

                            if (oSelected && oSelected.WorkCenter) {
                                that.oViewModel.setProperty("/WorkCenter", oSelected.WorkCenter);
                            }

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
                oTable.addColumn(oDateColumn);
            }


            this._oOrderDialog.open();
            this._oOrderDialog.getTable().setBusy(true);

            oModel.read("/ProdOrder", {
                success: function (oData) {
                    var oLocalModel = new JSONModel({
                        results: oData.results
                    });

                    that._aProdOrderResults = oData.results;

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

        _loadBatchCharacteristics: function (aItems) {
            var that = this;
            if (!aItems || aItems.length === 0) return;

            var aMaterials = [...new Set(aItems.map(item => item.Material))];

            that.getView().setBusy(true);

            $.ajax({
                url: `/sap/bc/http/sap/ZHTTP_CREATEBATCH`,
                method: "POST",
                data: JSON.stringify(aItems),
                headers: {
                    "Content-Type": "application/json"
                },
                success: function (result) {
                    that.getView().setBusy(false);

                    if (result.ErrorMessage) {
                        return;
                    }

                    if (result.BatchClassifications && result.BatchClassifications.length > 0) {
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
                },
                error: function () {
                    that.getView().setBusy(false);
                }
            });
        },
        GenerateBatches: function (currData) {
            var that = this;
            that.getView().setBusy(true);
            var oPreservedData = { ...currData };

            $.ajax({
                url: `/sap/bc/http/sap/ZHTTP_CREATEBATCH`,
                method: "POST",
                data: JSON.stringify([currData]),
                headers: {
                    "Content-Type": "application/json"
                },
                success: function (result) {
                    if (result.ErrorMessage) {
                        MessageBox.error(result.ErrorMessage);
                    } else {
                        sap.m.MessageToast.show("Batches Generated Successfully");
                        currData.Batch = result.Items[0].Batch;

                        const aCharcs = result.BatchClassifications.filter(c =>
                            c.Material === currData.Material.padStart(18, "0") && c.Batch === currData.Batch
                        );

                        aCharcs.forEach(c => {
                            var sField = c.CharcDescription.replace("/", "YTYZ");
                            currData[sField] = oPreservedData[sField] || c.CharcValue;
                        });

                        let prodItems = that.oViewModel.getProperty("/ProdItems") || [];
                        prodItems.push(currData);
                        that.oViewModel.setProperty("/ProdItems", [...prodItems]);
                        that._updateProdItemsCount();

                        if (result.BatchClassifications) {
                            const aCharacteristics = [
                                ...new Map(
                                    result.BatchClassifications.map(c => [c.CharcDescription.replace("/", "YTYZ"), c.CharcValue])
                                ).entries()
                            ];
                            const oBatchClassMap = that.oViewModel.getProperty("/BatchClassMap") || {};

                            result.BatchClassifications.forEach(c => {
                                const sKey = c.Material + "_" + c.Batch;
                                if (!oBatchClassMap[sKey]) {
                                    oBatchClassMap[sKey] = [];
                                }
                                const bExists = oBatchClassMap[sKey].some(
                                    x => x.CharcInternalID === c.CharcInternalID
                                );
                                if (!bExists) {
                                    oBatchClassMap[sKey].push({
                                        CharcInternalID: c.CharcInternalID,
                                        Characteristic: c.Characteristic,
                                        CharcDescription: c.CharcDescription.replace("/", "YTYZ")
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
            });
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
                            CharcDescription: oCharMeta.CharcDescription.replace("YTYZ", "/"),
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
                const bIsWeightField = CharcDescription === "Gross weight" || CharcDescription === "Core weight";

                const oInput = new sap.m.Input({
                    value: `{Header>${CharcDescription}}`,
                    submit: this.onRowEnter.bind(this)
                });

                if (bIsWeightField) {
                    oInput.attachChange(this._onWeightChange.bind(this));
                }

                const oColumn = new sap.ui.table.Column({
                    width: "8rem",
                    label: new sap.m.Label({ text: CharcDescription.replace("YTYZ", "/") }),
                    template: oInput
                });
                oColumn.data("dynamic", true);

                oTable.addColumn(oColumn);
            });
        },

        _onWeightChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var oContext = oInput.getBindingContext("Header");
            var sPath = oContext.getPath();
            var iIndex = parseInt(sPath.split("/").pop());

            var aProdItems = this.oViewModel.getProperty("/ProdItems") || [];
            var oItem = aProdItems[iIndex];

            var fGross = parseFloat(oItem["Gross weight"]) || 0;
            var fCore = parseFloat(oItem["Core weight"]) || 0;
            if (fGross > 0 && fCore > 0) {
                oItem.Quantity = (fGross - fCore).toString();
                oItem.ConvertedQuantity = (Number(oItem.Quantity) / ((Number(oItem.QuantityNumerator) || 1) / (Number(oItem.QuantityDenominator) || 1))).toFixed(3);
            }

            aProdItems[iIndex] = oItem;
            this.oViewModel.setProperty("/ProdItems", aProdItems)
            this._updateFilledQty();
        },

        onRowEnter: function (oEvent) {
            var oProdItems = this.oViewModel.getProperty("/ProdItems") || [];

            if (oProdItems.length === 0) return;

            // update current item
            let curSpath = oEvent.getSource().getParent().getBindingContext("Header").getPath();
            let currItem = this.oViewModel.getProperty(curSpath);
            let iCurrentIndex = parseInt(curSpath.split("/").pop());

            this.oViewModel.setProperty(curSpath + "/Quantity", Number(currItem["Gross weight"]) ? Number(currItem["Gross weight"]) - Number(currItem["Core weight"]) : Number(currItem.Quantity));
            this._updateFilledQty();
            this.oViewModel.setProperty(curSpath + "/ConvertedQuantity", currItem.AlternativeUnit ? (Number(currItem.Quantity) / ((Number(currItem.QuantityNumerator) || 1) / (Number(currItem.QuantityDenominator) || 1))).toFixed(3) : "");

            // ← Previous item lo (current ke pehle wala)
            var iPrevIndex = iCurrentIndex - 1;
            var oPrevItem = iPrevIndex >= 0 ? oProdItems[iPrevIndex] : currItem; // fallback to currItem if first row

            // Dynamic columns ka data nikalo previous item se
            var oBatchClassMap = this.oViewModel.getProperty("/BatchClassMap") || {};
            var sKey = oPrevItem.Material.padStart(18, "0") + "_" + oPrevItem.Batch;
            var aDynamicChars = oBatchClassMap[sKey] || [];

            var oDynamicData = {};
            aDynamicChars.forEach(function (oChar) {
                var sField = oChar.CharcDescription;
                oDynamicData[sField] = oPrevItem[sField] || ""; // ← previous item se copy
            });

            // new line — previous row copy + excluded fields blank
            var oNewLine = {
                ...oPrevItem,             // ← previous item ka data
                ...oDynamicData,          // ← previous item ke dynamic fields
                Batch: "",
                Quantity: "",
                ConvertedQuantity: "",
                "Gross weight": "",
                "Core weight": "",
                index: oProdItems.length + 1
            };

            this.GenerateBatches(oNewLine);
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
                    that.getView().setBusy(false);
                    if (result.ErrorMessage) {
                        MessageBox.error(result.ErrorMessage);
                    } else {
                        MessageBox.success(`Document is posted Successfully with No - ${result.MaterialDocument} and Year - ${result.MaterialDocumentYear}`, {
                            onClose: function () {
                                that._removeDynamicColumns();
                                that._rebindHeader();
                                var oRouter = that.getOwnerComponent().getRouter();
                                oRouter.navTo("RouteView1", {}, true);
                            }
                        });
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
            this._originalProdItems = null;
            var oModel = this.getView().getModel("Header");
            if (oModel) {
                oModel.setProperty("/ManufacturingOrder", "");
                oModel.setProperty("/DocumentDate", null);
                oModel.setProperty("/PostingDate", null);
                oModel.setProperty("/HeaderText", "");
                oModel.setProperty("/RefernceDocument", "");
                oModel.setProperty("/MoveType", "");
                oModel.setProperty("/DistQty", "");
                oModel.setProperty("/FilledQty", 0);
                oModel.setProperty("/AllOverQty", 0);
                oModel.setProperty("/ProdItems", []);
            }
            var oInput = this.getView().byId("_IDGenInput13");
            if (oInput) {
                oInput.setEditable(true);
            }
            var oTable = this.getView().byId("_IDGenTable1");
            if (oTable) {
                oTable.getColumns().forEach(function (col) {
                    if (col.data("dynamic")) {
                        oTable.removeColumn(col);
                    }
                });
            }
            var oPanel = this.getView().byId("_IDGenPanel3");
            if (oPanel) {
                oPanel.setExpanded(false);
            }
            this._rebindHeader();
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("RouteView1", {}, true);
        },
        onDeleteRow: function () {
            var oTable = this.byId("_IDGenTable1");
            var aSelectedIndices = oTable.getSelectedIndices();

            if (aSelectedIndices.length === 0) {
                sap.m.MessageToast.show("Please select a row to delete.");
                return;
            }

            var aProdItems = this.oViewModel.getProperty("/ProdItems") || [];
            aSelectedIndices.reverse().forEach(function (iIndex) {
                aProdItems.splice(iIndex, 1);
            });
            aProdItems.forEach(function (item, i) {
                item.index = i;
            });

            this.oViewModel.setProperty("/ProdItems", aProdItems);
            this._updateFilledQty();
            oTable.clearSelection();
            this._updateProdItemsCount();
            this.qtyChange();
        },
    });
});