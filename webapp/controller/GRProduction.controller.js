
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
                                ProductDescription: "",
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
                                                        if (oSelected && oSelected.ProductName) {
                                                                that.oViewModel.setProperty("/ProductDescription", oSelected.ProductName);
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

                // onRowEnter: function (oEvent) {
                //         var oProdItems = this.oViewModel.getProperty("/ProdItems") || [];

                //         if (oProdItems.length === 0) return;

                //         // update current item
                //         let curSpath = oEvent.getSource().getParent().getBindingContext("Header").getPath();
                //         let currItem = this.oViewModel.getProperty(curSpath);
                //         let iCurrentIndex = parseInt(curSpath.split("/").pop());

                //         this.oViewModel.setProperty(curSpath + "/Quantity", Number(currItem["Gross weight"]) ? Number(currItem["Gross weight"]) - Number(currItem["Core weight"]) : Number(currItem.Quantity));
                //         this._updateFilledQty();
                //         this.oViewModel.setProperty(curSpath + "/ConvertedQuantity", currItem.AlternativeUnit ? (Number(currItem.Quantity) / ((Number(currItem.QuantityNumerator) || 1) / (Number(currItem.QuantityDenominator) || 1))).toFixed(3) : "");

                //         // PRN DOwnload
                //         var oUpdatedItem = this.oViewModel.getProperty(curSpath);
                //         var oHeaderData = this.oViewModel.getProperty("/");

                //         // to skip label download for those materials.
                //         var aNoPrintMaterials = [
                //                 // "100000001",
                //                 // "200000099",
                //                 // Add more material numbers below:
                //         ];


                //         var sMaterialTrimmed = (oUpdatedItem.Material || "").replace(/^0+/, ""); // strip leading zeros for comparison
                //         var bSkipPrint = aNoPrintMaterials.some(function (m) {
                //                 return m.replace(/^0+/, "") === sMaterialTrimmed;
                //         });

                //         if (bSkipPrint) {
                //                 sap.m.MessageToast.show("Label print skipped for material: " + oUpdatedItem.Material);
                //         } else if (oUpdatedItem.Batch) {
                //                 var sPRN = this._buildPRN(oUpdatedItem, oHeaderData);
                //                 this._downloadPRN(sPRN, oUpdatedItem);
                //         } else {
                //                 sap.m.MessageToast.show("Batch not available — label not printed.");
                //         }
                //         // 

                //         //  Pallet Print 
                //         var iPalletQty = parseInt(this.oViewModel.getProperty("/FilledQty")) || 0;

                //         if (iPalletQty > 0 && ((iCurrentIndex + 1) % iPalletQty === 0)) {
                //                 var iGroupStart = iCurrentIndex + 1 - iPalletQty;
                //                 var aPalletItems = oProdItems.slice(iGroupStart, iCurrentIndex + 1);
                //                 aPalletItems[aPalletItems.length - 1] = oUpdatedItem;
                //                 var iPalletIndex = Math.floor((iCurrentIndex + 1) / iPalletQty);

                //                 this._downloadPalletPRN(aPalletItems, oHeaderData, iPalletIndex);
                //         }

                //         // ── 5. Slitting Department PRN ────────────────────────────
                //         var sDept = (oHeaderData.WorkCenter || "").toLowerCase();
                //         if (sDept.indexOf("slitting") !== -1 && oUpdatedItem.Batch) {
                //                 this._downloadSlittingPRN(oUpdatedItem, oHeaderData);
                //         }
                //         // 


                //         var iPrevIndex = iCurrentIndex - 1;
                //         var oPrevItem = iPrevIndex >= 0 ? oProdItems[iPrevIndex] : currItem;
                //         var oBatchClassMap = this.oViewModel.getProperty("/BatchClassMap") || {};
                //         var sKey = oPrevItem.Material.padStart(18, "0") + "_" + oPrevItem.Batch;
                //         var aDynamicChars = oBatchClassMap[sKey] || [];

                //         var oDynamicData = {};
                //         aDynamicChars.forEach(function (oChar) {
                //                 var sField = oChar.CharcDescription;
                //                 oDynamicData[sField] = oPrevItem[sField] || "";
                //         });
                //         nk
                //         var oNewLine = {
                //                 ...oPrevItem,
                //                 ...oDynamicData,
                //                 Batch: "",
                //                 Quantity: "",
                //                 ConvertedQuantity: "",
                //                 "Gross weight": "",
                //                 index: oProdItems.length + 1
                //         };

                //         this.GenerateBatches(oNewLine);
                // },

                onRowEnter: function (oEvent) {
                        var oProdItems = this.oViewModel.getProperty("/ProdItems") || [];
                        if (oProdItems.length === 0) return;

                        // ── 1. Identify current row ───────────────────────────────────
                        var curSpath = oEvent.getSource().getParent().getBindingContext("Header").getPath();
                        var currItem = this.oViewModel.getProperty(curSpath);
                        var iCurrentIndex = parseInt(curSpath.split("/").pop());

                        // ── 2. Update Quantity & ConvertedQuantity ────────────────────
                        this.oViewModel.setProperty(
                                curSpath + "/Quantity",
                                Number(currItem["Gross weight"])
                                        ? Number(currItem["Gross weight"]) - Number(currItem["Core weight"])
                                        : Number(currItem.Quantity)
                        );
                        this._updateFilledQty();
                        this.oViewModel.setProperty(
                                curSpath + "/ConvertedQuantity",
                                currItem.AlternativeUnit
                                        ? (Number(currItem.Quantity) / ((Number(currItem.QuantityNumerator) || 1) / (Number(currItem.QuantityDenominator) || 1))).toFixed(3)
                                        : ""
                        );

                        // ── 3. Material PRN Download ──────────────────────────────────
                        var oUpdatedItem = this.oViewModel.getProperty(curSpath);
                        var oHeaderData = this.oViewModel.getProperty("/");

                        // Add material numbers here to skip PRN for specific materials
                        var aNoPrintMaterials = [
                                // "100000001",
                        ];

                        var sMaterialTrimmed = (oUpdatedItem.Material || "").replace(/^0+/, "");
                        var bSkipPrint = aNoPrintMaterials.some(function (m) {
                                return m.replace(/^0+/, "") === sMaterialTrimmed;
                        });

                        if (bSkipPrint) {
                                sap.m.MessageToast.show("Label print skipped for material: " + oUpdatedItem.Material);
                        } else if (oUpdatedItem.Batch) {
                                var sPRN = this._buildPRN(oUpdatedItem, oHeaderData);
                                this._downloadPRN(sPRN, oUpdatedItem);
                        } else {
                                sap.m.MessageToast.show("Batch not available — label not printed.");
                        }

                        // ── 4. Pallet PRN — trigger when pallet qty limit is reached ──
                        var iPalletQty = parseInt(this.oViewModel.getProperty("/FilledQty")) || 0;

                        if (iPalletQty > 0 && ((iCurrentIndex + 1) % iPalletQty === 0)) {
                                var iGroupStart = iCurrentIndex + 1 - iPalletQty;
                                var aPalletItems = oProdItems.slice(iGroupStart, iCurrentIndex + 1);
                                aPalletItems[aPalletItems.length - 1] = oUpdatedItem;
                                var iPalletIndex = Math.floor((iCurrentIndex + 1) / iPalletQty);
                                this._downloadPalletPRN(aPalletItems, oHeaderData, iPalletIndex);
                        }

                        // ── 5. Slitting Department PRN ────────────────────────────────
                        var sDept = (oHeaderData.WorkCenter || "").toLowerCase();
                        if (sDept.indexOf("slitting") !== -1 && oUpdatedItem.Batch) {
                                this._downloadSlittingPRN(oUpdatedItem, oHeaderData);
                        }

                        // ── 6. Prepare next new row ───────────────────────────────────
                        // Read ProdItems FRESH after all setProperty calls above.
                        // Use iCurrentIndex (the row just completed) as the source —
                        // deep clone it so we don't mutate the model.
                        var aFreshItems = this.oViewModel.getProperty("/ProdItems") || [];

                        var oSourceItem = aFreshItems[iCurrentIndex]
                                ? JSON.parse(JSON.stringify(aFreshItems[iCurrentIndex]))
                                : Object.assign({}, oUpdatedItem);

                        // Patch in latest Quantity/ConvertedQuantity (array entry may be slightly stale)
                        oSourceItem.Quantity = this.oViewModel.getProperty(curSpath + "/Quantity") || oSourceItem.Quantity;
                        oSourceItem.ConvertedQuantity = this.oViewModel.getProperty(curSpath + "/ConvertedQuantity") || oSourceItem.ConvertedQuantity;

                        var oBatchClassMap = this.oViewModel.getProperty("/BatchClassMap") || {};
                        var sKey = oSourceItem.Material.padStart(18, "0") + "_" + oSourceItem.Batch;
                        var aDynamicChars = oBatchClassMap[sKey] || [];

                        var oDynamicData = {};
                        aDynamicChars.forEach(function (oChar) {
                                oDynamicData[oChar.CharcDescription] = oSourceItem[oChar.CharcDescription] || "";
                        });

                        var oNewLine = {
                                ...oSourceItem,         // ALL fields from the row just completed
                                ...oDynamicData,        // dynamic classification fields from that row
                                Batch: "",  // blank — generated fresh by GenerateBatches
                                Quantity: "",  // blank — user enters gross/core
                                ConvertedQuantity: "",
                                "Gross weight": "",  // blank — user enters new value
                                // Core weight carries forward from previous row ✓
                                index: aFreshItems.length + 1
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
                _esc: function (s) {
                        if (s === null || s === undefined) return "";
                        return String(s).replace(/"/g, '\\"');
                },

                _buildPRN: function (oItem, oHeader) {
                        var that = this;
                        var esc = function (s) { return that._esc(s); };

                        var materialName = oItem.ProductName || "";
                        var materialCode = oItem.Material || "";
                        var batchNo = oItem.Batch || "";
                        var machineNo = "";
                        var prodPlanNo = oItem.ManufacturingOrder || oHeader.ManufacturingOrder || "";

                        var batchNoDisplay = batchNo.replace(/^0+/, "") || batchNo;

                        var oDate = oHeader.PostingDate ? new Date(oHeader.PostingDate) : new Date();
                        var dateDisplay = String(oDate.getDate()).padStart(2, "0") + "-" +
                                String(oDate.getMonth() + 1).padStart(2, "0") + "-" +
                                String(oDate.getFullYear());
                        var dateStr = String(oDate.getDate()).padStart(2, "0") + "-" +
                                String(oDate.getMonth() + 1).padStart(2, "0") + "-" +
                                String(oDate.getFullYear()).substring(2);

                        function formatBatchDate(sRaw) {
                                if (!sRaw) return "";
                                var s = String(sRaw).trim();
                                if (s.indexOf("-") !== -1) return s;
                                if (s.length === 8) {
                                        var yr = s.substring(0, 4);
                                        var mo = s.substring(4, 6);
                                        var dy = s.substring(6, 8);
                                        return dy + "-" + mo + "-" + yr;
                                }
                                return s;
                        }

                        var oBatchClassMap = this.oViewModel.getProperty("/BatchClassMap") || {};
                        var sKey = materialCode.padStart(18, "0") + "_" + batchNo;
                        var aCharcs = oBatchClassMap[sKey] || [];

                        var aExcludeKeys = [
                                "pallet no", "pallet",
                                "storage loaction / rack number",
                                "storage location / rack number",
                                "rack no", "rack number"
                        ];
                        function isExcluded(sDesc) {
                                var s = (sDesc || "").replace("YTYZ", "/").toLowerCase().trim();
                                return aExcludeKeys.indexOf(s) !== -1;
                        }

                        var oAliasMap = {
                                "Gross weight": "Gross Wt",
                                "Gross Weight": "Gross Wt",
                                "Core weight": "Core Wt",
                                "Core Weight": "Core Wt",
                                "Net weight": "Net Wt",
                                "Net Weight": "Net Wt",
                                "RM Batch No": "RM Batch",
                                "RM Batch No.": "RM Batch",
                                "RM Batch no": "RM Batch",
                                "Master roll No.1": "M.Roll 1",
                                "Master roll No.2": "M.Roll 2",
                                "Mat. Comb": "Mat.Comb"
                        };
                        function getAlias(sDesc) {
                                var sClean = (sDesc || "").replace("YTYZ", "/");
                                return oAliasMap[sClean] || sClean;
                        }

                        var aPrintCharcs = aCharcs.filter(function (c) {
                                return !isExcluded(c.CharcDescription);
                        });

                        aCharcs.forEach(function (c) {
                                var sDesc = (c.CharcDescription || "").replace("YTYZ", "/").toLowerCase();
                                if (!machineNo && sDesc.indexOf("machine") !== -1) {
                                        machineNo = oItem[c.CharcDescription] || "";
                                }
                        });
                        var qrParts = [
                                "MAT:" + materialCode,
                                "BAT:" + batchNoDisplay,
                                "PLN:" + prodPlanNo,
                                "DAT:" + dateStr,
                                "QTY:" + (oItem.Quantity || "")
                        ];
                        aPrintCharcs.forEach(function (c) {
                                var sShort = getAlias(c.CharcDescription)
                                        .replace(/[^a-zA-Z0-9]/g, "")
                                        .substring(0, 6)
                                        .toUpperCase();
                                var sVal = (oItem[c.CharcDescription] || "").toString().replace(/"/g, "");
                                qrParts.push(sShort + ":" + sVal);
                        });
                        if (machineNo) { qrParts.push("MCH:" + machineNo); }
                        var qrData = qrParts.join(" ").replace(/"/g, '\\"');

                        var lines = [];

                        lines.push("SIZE 100 mm, 75 mm");
                        lines.push("DIRECTION 0,0");
                        lines.push("REFERENCE 0,0");
                        lines.push("OFFSET 0 mm");
                        lines.push("SET REWIND OFF");
                        lines.push("SET PEEL OFF");
                        lines.push("SET CUTTER OFF");
                        lines.push("SET PARTIAL_CUTTER OFF");
                        lines.push("SET TEAR ON");
                        lines.push("CLS");
                        lines.push("CODEPAGE 1252");
                        lines.push("BAR 0,8,800,3");
                        lines.push('TEXT 15,20,"3",0,1,1,"Plan:-"');
                        lines.push('TEXT 110,20,"3",0,1,1,"' + esc(prodPlanNo) + '"');
                        lines.push("BAR 0,45,800,3");
                        var yDynStart = 62;
                        var rowStep = 30;
                        var yRow = yDynStart;

                        aPrintCharcs.forEach(function (c) {
                                var sLabel = getAlias(c.CharcDescription);
                                var sDesc = (c.CharcDescription || "").replace("YTYZ", "/").toLowerCase();
                                var sRaw = oItem[c.CharcDescription] || "";
                                var sVal;
                                if (sDesc.indexOf("date") !== -1) {
                                        sVal = esc(formatBatchDate(sRaw));
                                } else {
                                        sVal = esc(sRaw);
                                }

                                lines.push('TEXT 15,' + yRow + ',"3",0,1,1,"' + esc(sLabel + ":-") + '"');
                                lines.push('TEXT 190,' + yRow + ',"3",0,1,1,"' + sVal + '"');
                                yRow += rowStep;
                        });

                        if (machineNo) {
                                lines.push('TEXT 15,' + yRow + ',"3",0,1,1,"Mach No:-"');
                                lines.push('TEXT 190,' + yRow + ',"3",0,1,1,"' + esc(machineNo) + '"');
                                yRow += rowStep;
                        }
                        lines.push('TEXT 15,' + yRow + ',"3",0,1,1,"Date:-"');
                        lines.push('TEXT 190,' + yRow + ',"3",0,1,1,"' + esc(dateDisplay) + '"');
                        yRow += rowStep;
                        var yDynCenter = Math.round((yDynStart + yRow) / 2);
                        var yQR = Math.max(yDynCenter - 75, yDynStart);
                        lines.push('QRCODE 560,' + yQR + ',L,4,A,0,M2,S7,"' + qrData + '"');
                        var yMidDiv = Math.max(yRow + 15, 300);
                        lines.push("BAR 0," + yMidDiv + ",800,3");
                        var yInfo = yMidDiv + 18;
                        var yInfoS = 28;

                        lines.push('TEXT 15,' + yInfo + ',"3",0,1,1,"Mat Code:-"');
                        lines.push('TEXT 190,' + yInfo + ',"3",0,1,1,"' + esc(materialCode) + '"');
                        lines.push('TEXT 15,' + (yInfo + yInfoS) + ',"3",0,1,1,"Batch No:-"');
                        lines.push('TEXT 190,' + (yInfo + yInfoS) + ',"3",0,1,1,"' + esc(batchNoDisplay) + '"');
                        lines.push('TEXT 15,' + (yInfo + yInfoS * 2) + ',"3",0,1,1,"Mat Name:-"');
                        lines.push('TEXT 190,' + (yInfo + yInfoS * 2) + ',"3",0,1,1,"' + esc(materialName) + '"');
                        var yFootTop = yInfo + yInfoS * 3 + 15;
                        var yFootBot = yFootTop + 118;

                        lines.push("BAR 0," + yFootTop + ",800,3");
                        lines.push("BAR 0," + yFootBot + ",800,3");
                        var yBmfpl = yFootTop + 43;
                        lines.push('TEXT 15,' + yBmfpl + ',"4",0,2,2,"BMFPL"');
                        var yBarcode = yFootTop + 25;
                        lines.push('BARCODE 430,' + yBarcode + ',"128M",52,0,0,2,3,"' + esc(batchNoDisplay) + '"');
                        lines.push('TEXT 460,' + (yBarcode + 55) + ',"3",0,1,1,"' + esc(batchNoDisplay) + '"');

                        lines.push("PRINT 1,1");

                        return lines.join("\r\n") + "\r\n";
                },
                _downloadPRN: function (sContent, oItem) {
                        var sBatch = (oItem.Batch || "UNKNOWN").replace(/[^a-zA-Z0-9_\-]/g, "_");
                        var sPO = (oItem.ManufacturingOrder || "PO").replace(/[^a-zA-Z0-9_\-]/g, "_");
                        var oNow = new Date();
                        var sDate = oNow.getFullYear().toString() +
                                String(oNow.getMonth() + 1).padStart(2, "0") +
                                String(oNow.getDate()).padStart(2, "0");
                        var sTime = String(oNow.getHours()).padStart(2, "0") +
                                String(oNow.getMinutes()).padStart(2, "0") +
                                String(oNow.getSeconds()).padStart(2, "0");
                        var sFilename = sPO + "_" + sBatch + "_" + sDate + "_" + sTime + ".prn";
                        var sFolderName = "goodsreceiptmaterialprint";

                        var oBlob = new Blob([sContent], { type: "text/plain;charset=utf-8" });
                        if (window.showDirectoryPicker) {
                                var that = this;

                                var fnSaveInFolder = function (oRootHandle) {
                                        oRootHandle.getDirectoryHandle(sFolderName, { create: true })
                                                .then(function (oFolderHandle) {
                                                        return oFolderHandle.getFileHandle(sFilename, { create: true });
                                                })
                                                .then(function (oFileHandle) {
                                                        return oFileHandle.createWritable();
                                                })
                                                .then(function (oWritable) {
                                                        return oWritable.write(oBlob).then(function () {
                                                                return oWritable.close();
                                                        });
                                                })
                                                .then(function () {
                                                        sap.m.MessageToast.show("Label saved: " + sFolderName + "/" + sFilename);
                                                })
                                                .catch(function (err) {
                                                        console.error("File save error:", err);
                                                        sap.m.MessageToast.show("Save failed: " + err.message);
                                                });
                                };

                                if (that._oRootDirHandle) {
                                        fnSaveInFolder(that._oRootDirHandle);
                                } else {
                                        window.showDirectoryPicker({ mode: "readwrite" })
                                                .then(function (oHandle) {
                                                        that._oRootDirHandle = oHandle;
                                                        fnSaveInFolder(oHandle);
                                                })
                                                .catch(function (err) {
                                                        console.warn("Directory picker cancelled, falling back:", err);
                                                        that._downloadPRNFallback(oBlob, sFilename);
                                                });
                                }
                        } else {
                                this._downloadPRNFallback(oBlob, sFilename);
                        }
                },

                _downloadPRNFallback: function (oBlob, sFilename) {
                        var sUrl = URL.createObjectURL(oBlob);
                        var oLink = document.createElement("a");
                        oLink.href = sUrl;
                        oLink.download = sFilename;
                        oLink.style.display = "none";
                        document.body.appendChild(oLink);
                        oLink.click();
                        document.body.removeChild(oLink);
                        setTimeout(function () { URL.revokeObjectURL(sUrl); }, 1000);
                },
                //
                _downloadPalletPRN: function (aPalletItems, oHeaderData, iPalletIndex) {
                        if (!aPalletItems || aPalletItems.length === 0) return;

                        var sPRN = this._buildPalletPRN(aPalletItems, oHeaderData, iPalletIndex);

                        var sPO = (oHeaderData.ManufacturingOrder || "PO").replace(/[^a-zA-Z0-9_\-]/g, "-");
                        var oNow = new Date();
                        var sDate = oNow.getFullYear().toString() +
                                String(oNow.getMonth() + 1).padStart(2, "0") +
                                String(oNow.getDate()).padStart(2, "0");
                        var sTime = String(oNow.getHours()).padStart(2, "0") +
                                String(oNow.getMinutes()).padStart(2, "0") +
                                String(oNow.getSeconds()).padStart(2, "0");
                        var sFilename = "FG-" + sPO + "-P" + iPalletIndex + "-" + sDate + "-" + sTime + ".prn";

                        var oBlob = new Blob([sPRN], { type: "text/plain;charset=utf-8" });

                        var that = this;
                        var sFolderName = "goodsreceiptmaterialprint";

                        var fnSave = function (oRootHandle) {
                                oRootHandle.getDirectoryHandle(sFolderName, { create: true })
                                        .then(function (oFolderHandle) {
                                                return oFolderHandle.getFileHandle(sFilename, { create: true });
                                        })
                                        .then(function (oFileHandle) {
                                                return oFileHandle.createWritable();
                                        })
                                        .then(function (oWritable) {
                                                return oWritable.write(oBlob).then(function () {
                                                        return oWritable.close();
                                                });
                                        })
                                        .then(function () {
                                                sap.m.MessageToast.show("Pallet label saved: " + sFilename);
                                        })
                                        .catch(function (err) {
                                                console.error("Pallet save error:", err);
                                                that._downloadPRNFallback(oBlob, sFilename);
                                        });
                        };

                        if (window.showDirectoryPicker) {
                                if (that._oRootDirHandle) {
                                        fnSave(that._oRootDirHandle);
                                } else {
                                        window.showDirectoryPicker({ mode: "readwrite" })
                                                .then(function (oHandle) {
                                                        that._oRootDirHandle = oHandle;
                                                        fnSave(oHandle);
                                                })
                                                .catch(function (err) {
                                                        that._downloadPRNFallback(oBlob, sFilename);
                                                });
                                }
                        } else {
                                this._downloadPRNFallback(oBlob, sFilename);
                        }
                },
                _buildPalletPRN: function (aPalletItems, oHeaderData, iPalletIndex) {
                        var that = this;
                        var esc = function (s) { return that._esc(s); };

                        var oFirst = aPalletItems[0] || {};
                        var oLast = aPalletItems[aPalletItems.length - 1] || {};

                        var materialName = oFirst.ProductName || "";
                        var materialCode = oFirst.Material || "";
                        var storageArea = oFirst.Location || "";
                        var prodPlanNo = oFirst.ManufacturingOrder || oHeaderData.ManufacturingOrder || "";

                        var oDate = oHeaderData.PostingDate ? new Date(oHeaderData.PostingDate) : new Date();
                        var dateDisplay = String(oDate.getDate()).padStart(2, "0") + "-" +
                                String(oDate.getMonth() + 1).padStart(2, "0") + "-" +
                                String(oDate.getFullYear());
                        var dateShort = String(oDate.getDate()).padStart(2, "0") + "-" +
                                String(oDate.getMonth() + 1).padStart(2, "0") + "-" +
                                String(oDate.getFullYear()).substring(2);

                        var sRollFrom = oFirst.Batch || "";
                        var sRollTo = oLast.Batch || "";
                        var sRollFromDisplay = sRollFrom.replace(/^0+/, "") || sRollFrom;
                        var sRollToDisplay = sRollTo.replace(/^0+/, "") || sRollTo;

                        var iPalletNumber = iPalletIndex;

                        var fTotalNetWt = 0;
                        aPalletItems.forEach(function (oItem) {
                                var fNet = 0;
                                Object.keys(oItem).forEach(function (k) {
                                        if (k.toLowerCase().indexOf("net") !== -1 &&
                                                k.toLowerCase().indexOf("weight") !== -1) {
                                                fNet = fNet || parseFloat(oItem[k]) || 0;
                                        }
                                });
                                if (!fNet) fNet = parseFloat(oItem.Quantity || "") || 0;
                                fTotalNetWt += fNet;
                        });
                        var sTotalNetWt = fTotalNetWt > 0 ? fTotalNetWt.toFixed(3) : "";

                        var sRemarks = "";
                        aPalletItems.forEach(function (oItem) {
                                if (!sRemarks) {
                                        Object.keys(oItem).forEach(function (k) {
                                                if (!sRemarks && k.toLowerCase().indexOf("remark") !== -1) {
                                                        sRemarks = oItem[k] || "";
                                                }
                                        });
                                }
                        });

                        var aAllBatches = aPalletItems.map(function (o) {
                                return (o.Batch || "").replace(/^0+/, "") || o.Batch;
                        });

                        var sPalletNo = (prodPlanNo || oHeaderData.ManufacturingOrder || "PAL") +
                                "_P" + iPalletIndex;

                        var qrData = (
                                "MAT:" + materialCode + " " +
                                "NAM:" + materialName + " " +
                                "PLN:" + prodPlanNo + " " +
                                "DAT:" + dateShort + " " +
                                "PALLT:" + iPalletNumber + " " +
                                "FROM:" + sRollFromDisplay + " " +
                                "TO:" + sRollToDisplay + " " +
                                "BAT:" + aAllBatches.join("-") + " " +
                                "NWT:" + sTotalNetWt + " " +
                                "REM:" + sRemarks + " " +
                                "STO:" + storageArea + " " +
                                "PLT:" + sPalletNo
                        ).replace(/"/g, '\\"');

                        var lines = [];

                        lines.push("SIZE 98.7 mm, 150 mm");
                        lines.push("DIRECTION 0,0");
                        lines.push("REFERENCE 0,0");
                        lines.push("OFFSET 0 mm");
                        lines.push("SET REWIND OFF");
                        lines.push("SET PEEL OFF");
                        lines.push("SET CUTTER OFF");
                        lines.push("SET PARTIAL_CUTTER OFF");
                        lines.push("SET TEAR ON");
                        lines.push("CLS");
                        lines.push("CODEPAGE 1252");
                        lines.push('TEXT 682,19,"ROMAN.TTF",90,1,13,"Material Name"');
                        lines.push('TEXT 682,202,"ROMAN.TTF",90,1,13,":"');
                        var sNamePart1 = materialName.substring(0, 20);
                        var sNamePart2 = materialName.substring(20, 40);
                        lines.push('TEXT 629,19,"ROMAN.TTF",90,1,13,"' + esc(sNamePart1) + '"');
                        lines.push('TEXT 576,19,"ROMAN.TTF",90,1,13,"' + esc(sNamePart2) + '"');

                        lines.push('TEXT 480,19,"ROMAN.TTF",90,1,13,"Plan No."');
                        lines.push('TEXT 480,202,"ROMAN.TTF",90,1,13,":"');
                        lines.push('TEXT 480,217,"ROMAN.TTF",90,1,13,"' + esc(prodPlanNo) + '"');

                        lines.push('TEXT 418,19,"ROMAN.TTF",90,1,13,"Roll From"');
                        lines.push('TEXT 418,202,"ROMAN.TTF",90,1,13,":"');
                        lines.push('TEXT 418,217,"ROMAN.TTF",90,1,13,"' + esc(sRollFromDisplay) + '"');
                        lines.push('TEXT 418,500,"ROMAN.TTF",90,1,13,"Roll To  :-  ' + esc(sRollToDisplay) + '"');

                        lines.push('TEXT 356,19,"ROMAN.TTF",90,1,13,"No. of Rolls"');
                        lines.push('TEXT 356,202,"ROMAN.TTF",90,1,13,":"');
                        lines.push('TEXT 356,217,"ROMAN.TTF",90,1,13,"' + esc(String(iPalletNumber)) + '"');

                        lines.push('TEXT 293,19,"ROMAN.TTF",90,1,13,"Net Weight"');
                        lines.push('TEXT 293,202,"ROMAN.TTF",90,1,13,":"');
                        lines.push('TEXT 293,217,"ROMAN.TTF",90,1,13,"' + esc(sTotalNetWt) + '"');

                        lines.push('TEXT 231,19,"ROMAN.TTF",90,1,13,"Remarks"');
                        lines.push('TEXT 231,202,"ROMAN.TTF",90,1,13,":"');
                        lines.push('TEXT 231,217,"ROMAN.TTF",90,1,13,"' + esc(sRemarks) + '"');

                        lines.push('TEXT 169,19,"ROMAN.TTF",90,1,13,"Storage Area"');
                        lines.push('TEXT 169,202,"ROMAN.TTF",90,1,13,":"');
                        lines.push('TEXT 169,217,"ROMAN.TTF",90,1,13,"' + esc(storageArea) + '"');

                        lines.push('TEXT 107,19,"ROMAN.TTF",90,1,13,"Date"');
                        lines.push('TEXT 107,202,"ROMAN.TTF",90,1,13,":"');
                        lines.push('TEXT 107,217,"ROMAN.TTF",90,1,13,"' + esc(dateDisplay) + '"');
                        lines.push('BARCODE 171,159,"128M",115,0,90,4,8,"' + esc(sPalletNo) + '"');
                        lines.push('TEXT 50,420,"ROMAN.TTF",90,1,13,"' + esc(sPalletNo) + '"');
                        lines.push('QRCODE 521,799,L,3,A,90,M2,S7,"' + qrData + '"');
                        lines.push('TEXT 739,517,"ROMAN.TTF",90,1,18,"BMFPL"');

                        lines.push("PRINT 1,1");

                        return lines.join("\r\n") + "\r\n";
                },
                _downloadSlittingPRN: function (oItem, oHeaderData) {
                        var sPRN = this._buildSlittingPRN(oItem, oHeaderData);

                        var sPO = (oHeaderData.ManufacturingOrder || "PO").replace(/[^a-zA-Z0-9_\-]/g, "-");
                        var sBatch = (oItem.Batch || "BATCH").replace(/[^a-zA-Z0-9_\-]/g, "-");
                        var oNow = new Date();
                        var sDate = oNow.getFullYear().toString() +
                                String(oNow.getMonth() + 1).padStart(2, "0") +
                                String(oNow.getDate()).padStart(2, "0");
                        var sTime = String(oNow.getHours()).padStart(2, "0") +
                                String(oNow.getMinutes()).padStart(2, "0") +
                                String(oNow.getSeconds()).padStart(2, "0");
                        var sFilename = "SLITTING-" + sPO + "-" + sBatch + "-" + sDate + "-" + sTime + ".prn";
                        var sFolderName = "goodsreceiptmaterialprint";

                        var oBlob = new Blob([sPRN], { type: "text/plain;charset=utf-8" });
                        var that = this;

                        var fnSave = function (oRootHandle) {
                                oRootHandle.getDirectoryHandle(sFolderName, { create: true })
                                        .then(function (oFolderHandle) {
                                                return oFolderHandle.getFileHandle(sFilename, { create: true });
                                        })
                                        .then(function (oFileHandle) {
                                                return oFileHandle.createWritable();
                                        })
                                        .then(function (oWritable) {
                                                return oWritable.write(oBlob).then(function () {
                                                        return oWritable.close();
                                                });
                                        })
                                        .then(function () {
                                                sap.m.MessageToast.show("Slitting label saved: " + sFilename);
                                        })
                                        .catch(function (err) {
                                                console.error("Slitting save error:", err);
                                                that._downloadPRNFallback(oBlob, sFilename);
                                        });
                        };

                        if (window.showDirectoryPicker) {
                                if (that._oRootDirHandle) {
                                        fnSave(that._oRootDirHandle);
                                } else {
                                        window.showDirectoryPicker({ mode: "readwrite" })
                                                .then(function (oHandle) {
                                                        that._oRootDirHandle = oHandle;
                                                        fnSave(oHandle);
                                                })
                                                .catch(function (err) {
                                                        that._downloadPRNFallback(oBlob, sFilename);
                                                });
                                }
                        } else {
                                this._downloadPRNFallback(oBlob, sFilename);
                        }
                },

                _buildSlittingPRN: function (oItem, oHeaderData) {
                        var that = this;
                        var esc = function (s) { return that._esc(s); };
                        var batchNo = oItem.Batch || "";
                        var machineNo = oHeaderData.HeaderText || "";
                        var prodPlanNo = oItem.ManufacturingOrder || oHeaderData.ManufacturingOrder || "";

                        var oDate = oHeaderData.PostingDate ? new Date(oHeaderData.PostingDate) : new Date();
                        var dateStr = String(oDate.getDate()).padStart(2, "0") + "-" +
                                String(oDate.getMonth() + 1).padStart(2, "0") + "-" +
                                String(oDate.getFullYear()).substring(2);

                        var matComb = "";
                        var oBatchClassMap = this.oViewModel.getProperty("/BatchClassMap") || {};
                        var sKey = (oItem.Material || "").padStart(18, "0") + "_" + batchNo;
                        var aCharcs = oBatchClassMap[sKey] || [];
                        aCharcs.forEach(function (c) {
                                var sDesc = (c.CharcDescription || "").replace("YTYZ", "/").toLowerCase();
                                if (!matComb && (sDesc.indexOf("mat") !== -1 && sDesc.indexOf("comb") !== -1)) {
                                        matComb = oItem[c.CharcDescription] || "";
                                }
                                if (!matComb && sDesc === "mat. comb") {
                                        matComb = oItem[c.CharcDescription] || "";
                                }
                        });
                        matComb = matComb || oItem["Mat. Comb"] || oItem["Mat.Comb"] || oItem["Mat Comb"] || "";
                        var netWt = "";
                        aCharcs.forEach(function (c) {
                                var sDesc = (c.CharcDescription || "").replace("YTYZ", "/").toLowerCase();
                                if (!netWt && sDesc.indexOf("net") !== -1) {
                                        netWt = oItem[c.CharcDescription] || "";
                                }
                        });
                        netWt = netWt || oItem["Net weight"] || oItem["Net Weight"] || oItem.Quantity || "";

                        var lines = [];
                        lines.push("I8,A");
                        lines.push("ZN");
                        lines.push("q790");
                        lines.push("S3");
                        lines.push("O");
                        lines.push("JF");
                        lines.push("KIZZQ0");
                        lines.push("D8");
                        lines.push("ZT");
                        lines.push("Q350,25");
                        lines.push("KI81");
                        lines.push("N");

                        lines.push("X5,5,2,785,345");
                        lines.push("X80,5,2,80,345");
                        lines.push('A58,55,2,3,1,1,N,"Date:"');
                        lines.push('A30,200,2,3,1,1,N,"Batch No."');
                        lines.push('A390,320,2,4,2,2,N,"BMFPL"');
                        lines.push('A95,285,2,3,1,1,N,"Batch No:"');
                        lines.push('A265,285,2,3,1,1,N,"' + esc(batchNo) + '"');
                        lines.push('A95,250,2,3,1,1,N,"Date:"');
                        lines.push('A265,250,2,3,1,1,N,"' + esc(dateStr) + '"');
                        lines.push('A95,215,2,3,1,1,N,"Machine No:"');
                        lines.push('A265,215,2,3,1,1,N,"' + esc(machineNo) + '"');
                        lines.push('A95,180,2,3,1,1,N,"Production Plan no."');
                        lines.push('A360,180,2,3,1,1,N,"' + esc(prodPlanNo) + '"');
                        lines.push('A95,145,2,3,1,1,N,"Mat. Comb:"');
                        lines.push('A265,145,2,3,1,1,N,"' + esc(matComb) + '"');
                        lines.push('A95,110,2,3,1,1,N,"Net Weight:"');
                        lines.push('A265,110,2,3,1,1,N,"' + esc(netWt) + '"');

                        lines.push("P1");

                        return lines.join("\r\n") + "\r\n";
                },

                // 
        });
});