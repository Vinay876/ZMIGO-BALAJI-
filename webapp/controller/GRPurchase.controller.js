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

        return Controller.extend("zmigo.controller.GRPurchase", {

                onInit: function () {
                        this._rebindHeader();
                },

                _rebindHeader: function () {
                        var oData = {
                                DocumentDate:         null,
                                PostingDate:          null,
                                HeaderText:           "",
                                PurchaseOrder:        "",
                                Supplier:             "",
                                SupplierName:         "",
                                SupplierDisplay:      "",
                                fieldsEnabled:        true,
                                orderSelected:        false,
                                MoveType:             "",
                                FilledQty:            0,
                                AllOverQty:           0,
                                ConfirmedTotalQty:    0,
                                ProdItems:            [],
                                PurchaseItemsCount:   0,
                                BatchDistItems:       []
                        };

                        this.oViewModel = new JSONModel(oData);
                        this.getView().setModel(this.oViewModel, "Header");
                },

                _updatePurchaseItemsCount: function () {
                        var iCount = (this.oViewModel.getProperty("/ProdItems") || []).length;
                        this.oViewModel.setProperty("/PurchaseItemsCount", iCount);
                },

                _updateFilledQty: function () {
                        var aProdItems = this.oViewModel.getProperty("/ProdItems") || [];
                        var fTotal = aProdItems.reduce(function (sum, item) {
                                return sum + (parseFloat(item.Quantity) || 0);
                        }, 0);
                        this.oViewModel.setProperty("/FilledQty", fTotal);
                },

                _formatSupplierDisplay: function (sSupplier, sSupplierName) {
                        if (!sSupplier) { return ""; }
                        return sSupplierName ? sSupplier + " (" + sSupplierName + ")" : sSupplier;
                },

                _calcConvertedQty: function (fQty, oItem) {
                        if (!oItem.AlternativeUnit) { return ""; }
                        var fNum = parseFloat(oItem.QuantityNumerator)   || 1;
                        var fDen = parseFloat(oItem.QuantityDenominator) || 1;
                        return (fQty / (fNum / fDen)).toFixed(3);
                },

                qtyChange:    function () { this._updateFilledQty(); },
                PalletChange: function () { this._updateFilledQty(); },

                onAddToBatchDist: function () {
                        var oMatTable = this.byId("_IDGenTable2");
                        var iIdx      = oMatTable.getSelectedIndex();

                        if (iIdx < 0) {
                                sap.m.MessageToast.show("Please select a material row first.");
                                return;
                        }

                        var aProdItems = this.oViewModel.getProperty("/ProdItems") || [];
                        var oSrc       = aProdItems[iIdx];
                        if (!oSrc) { return; }

                        var fOrderQty = parseFloat(oSrc.OrderQuantity) || 0;
                        var fDone     = this._getDistributedQtyForMaterial(oSrc.Material);
                        if (fOrderQty > 0 && fDone >= fOrderQty) {
                                MessageBox.information(
                                        "Material " + oSrc.Material + " is already fully distributed " +
                                        "(" + fOrderQty + " " + oSrc.Unit + ").\nPlease select the next material."
                                );
                                return;
                        }

                        oMatTable.clearSelection();

                        var oSeedRow = {
                                Material:            oSrc.Material,
                                ProductName:         oSrc.ProductName,
                                Quantity:            "",
                                Unit:                oSrc.Unit,
                                MoveType:            oSrc.MoveType || "101",
                                Location:            oSrc.Location,
                                Batch:               "",
                                Plant:               oSrc.Plant,
                                ManufacturingOrder:  oSrc.PurchaseOrder,
                                PurchaseOrder:       oSrc.PurchaseOrder,
                                QuantityNumerator:   oSrc.QuantityNumerator   || 1,
                                QuantityDenominator: oSrc.QuantityDenominator || 1,
                                AlternativeUnit:     oSrc.AlternativeUnit     || "",
                                OrderQuantity:       oSrc.OrderQuantity,
                                DistQuantity:        "",
                                DistPercent:         "",
                                ConvertedQuantity:   ""
                        };

                        var oPanel = this.getView().byId("_IDGenPanelBatchDist");
                        if (oPanel) { oPanel.setExpanded(true); }

                        this.GenerateBatchForDist(oSeedRow);
                },

                GenerateBatchForDist: function (currData) {
                        var that = this;

                        that.getView().setBusy(true);

                        $.ajax({
                                url:    "/sap/bc/http/sap/ZHTTP_CREATEBATCH",
                                method: "POST",
                                data:   JSON.stringify([currData]),
                                headers: { "Content-Type": "application/json" },

                                success: function (result) {
                                        that.getView().setBusy(false);

                                        if (result.ErrorMessage) {
                                                MessageBox.error(result.ErrorMessage);
                                                return;
                                        }

                                        sap.m.MessageToast.show("Batches Generated Successfully");

                                        currData.Batch = (result.Items && result.Items[0])
                                                ? result.Items[0].Batch : "";

                                        var aDistItems = that.oViewModel.getProperty("/BatchDistItems") || [];
                                        aDistItems.push(currData);
                                        that.oViewModel.setProperty("/BatchDistItems", aDistItems);

                                        that._recalcDistPercent(currData.Material);
                                        that._updateDistributedQtyOnProdItem(currData.Material);
                                },

                                error: function (result) {
                                        console.error(result);
                                        that.getView().setBusy(false);
                                        MessageBox.error("Batch generation failed. Please try again.");
                                }
                        });
                },

                onBatchDistRowEnter: function (oEvent) {
                        var aDistItems = this.oViewModel.getProperty("/BatchDistItems") || [];
                        if (aDistItems.length === 0) { return; }

                        var oCtx   = oEvent.getSource().getParent().getBindingContext("Header");
                        var sSpath = oCtx.getPath();
                        var oRow   = this.oViewModel.getProperty(sSpath);

                        var fEnteredQty = parseFloat(oRow.DistQuantity) || 0;
                        this.oViewModel.setProperty(sSpath + "/DistQuantity", fEnteredQty);
                        this.oViewModel.setProperty(sSpath + "/ConvertedQuantity",
                                this._calcConvertedQty(fEnteredQty, oRow));

                        this._recalcDistPercent(oRow.Material);
                        this._updateDistributedQtyOnProdItem(oRow.Material);

                        var fOrderQty = parseFloat(oRow.OrderQuantity) || 0;
                        var fDone     = this._getDistributedQtyForMaterial(oRow.Material);

                        if (fDone > fOrderQty) {
                                var fAllowed = Math.max(0, fOrderQty - (fDone - fEnteredQty));
                                this.oViewModel.setProperty(sSpath + "/DistQuantity", fAllowed);
                                this.oViewModel.setProperty(sSpath + "/ConvertedQuantity",
                                        this._calcConvertedQty(fAllowed, oRow));
                                this._recalcDistPercent(oRow.Material);
                                this._updateDistributedQtyOnProdItem(oRow.Material);
                                MessageBox.warning(
                                        "Quantity exceeds Order Quantity (" + fOrderQty + " " + oRow.Unit + ").\n" +
                                        "Adjusted to " + fAllowed + " " + oRow.Unit + "."
                                );
                                return;
                        }

                        if (fDone >= fOrderQty && fOrderQty > 0) {
                                MessageBox.information(
                                        "Distribution complete for Material " + oRow.Material + ".\n" +
                                        "Total: " + fDone + " / " + fOrderQty + " " + oRow.Unit + ".\n" +
                                        "Please select the next material from Material Details."
                                );
                                return;
                        }

                        var oNewSeed = Object.assign({}, oRow, {
                                Batch: "", DistQuantity: "", DistPercent: "", ConvertedQuantity: ""
                        });
                        this.GenerateBatchForDist(oNewSeed);
                },

                onBatchDistQtyChange: function (oEvent) {
                        var oCtx = oEvent.getSource().getParent().getBindingContext("Header");
                        if (!oCtx) { return; }
                        var oRow = this.oViewModel.getProperty(oCtx.getPath());
                        this._recalcDistPercent(oRow.Material);
                        this._updateDistributedQtyOnProdItem(oRow.Material);
                },

                onDeleteBatchDistRow: function () {
                        var oTable   = this.byId("_IDGenTableBatchDist");
                        var aIndices = oTable.getSelectedIndices();
                        if (!aIndices || aIndices.length === 0) {
                                sap.m.MessageToast.show("Please select at least one row to delete.");
                                return;
                        }
                        var aDistItems = this.oViewModel.getProperty("/BatchDistItems") || [];
                        var aAffected  = aIndices.map(function (i) {
                                return aDistItems[i]
                                        ? { mat: aDistItems[i].Material, batch: aDistItems[i].Batch }
                                        : null;
                        }).filter(Boolean);

                        aIndices.slice().sort(function (a, b) { return b - a; }).forEach(function (i) {
                                aDistItems.splice(i, 1);
                        });
                        this.oViewModel.setProperty("/BatchDistItems", aDistItems);
                        oTable.clearSelection();

                        var that = this, aDone = [];
                        aAffected.forEach(function (o) {
                                if (aDone.indexOf(o.mat) < 0) {
                                        that._recalcDistPercent(o.mat);
                                        that._updateDistributedQtyOnProdItem(o.mat);
                                        aDone.push(o.mat);
                                }
                        });
                },

                OnDeleteSelectedITem: function () {
                        sap.m.MessageToast.show("Delete batches using the Batch Distribution Delete button.");
                },

                onRowEnter: function (oEvent) {
                        var oProdItems = this.oViewModel.getProperty("/ProdItems") || [];
                        if (oProdItems.length === 0) { return; }
                        var sSpath   = oEvent.getSource().getParent().getBindingContext("Header").getPath();
                        var currItem = this.oViewModel.getProperty(sSpath);
                        var oNewLine = Object.assign({}, currItem, {
                                Batch: "", Quantity: "", ConvertedQuantity: "",
                                DistributedQty: 0, index: oProdItems.length + 1
                        });
                        oProdItems.push(oNewLine);
                        this.oViewModel.setProperty("/ProdItems", [...oProdItems]);
                        this._updatePurchaseItemsCount();
                },

                _getDistributedQtyForMaterial: function (sMaterial) {
                        var aDistItems = this.oViewModel.getProperty("/BatchDistItems") || [];
                        return aDistItems.reduce(function (sum, item) {
                                return item.Material === sMaterial
                                        ? sum + (parseFloat(item.DistQuantity) || 0) : sum;
                        }, 0);
                },

                _recalcDistPercent: function (sMaterial) {
                        var aDistItems = this.oViewModel.getProperty("/BatchDistItems") || [];
                        var fTotal     = this._getDistributedQtyForMaterial(sMaterial);
                        aDistItems.forEach(function (item) {
                                if (item.Material !== sMaterial) { return; }
                                var fQty = parseFloat(item.DistQuantity) || 0;
                                item.DistPercent = fTotal > 0
                                        ? (fQty / fTotal * 100).toFixed(2) + "%" : "0.00%";
                        });
                        this.oViewModel.setProperty("/BatchDistItems", aDistItems);
                },

                _updateDistributedQtyOnProdItem: function (sMaterial) {
                        var aProdItems = this.oViewModel.getProperty("/ProdItems") || [];
                        var fDone      = this._getDistributedQtyForMaterial(sMaterial);
                        aProdItems.forEach(function (item) {
                                if (item.Material === sMaterial) { item.DistributedQty = fDone; }
                        });
                        this.oViewModel.setProperty("/ProdItems", aProdItems);
                },

                onPurchaseValueHelp: function () {
                        var that   = this;
                        var oModel = this.getOwnerComponent().getModel();

                        if (!this._oPODialog) {
                                this._oPODialog = new sap.ui.comp.valuehelpdialog.ValueHelpDialog({
                                        title:              "Purchase Order",
                                        supportMultiselect: false,
                                        key:                "PurchaseOrder",
                                        descriptionKey:     "SupplierName",
                                        ok: function (oEvent) {
                                                var aTokens = oEvent.getParameter("tokens");
                                                if (aTokens.length > 0) {
                                                        var sSelectedPO = aTokens[0].getKey();
                                                        var oSelected   = that._aPOResults &&
                                                                that._aPOResults.find(function (o) {
                                                                        return o.PurchaseOrder === sSelectedPO;
                                                                });
                                                        if (oSelected) { that._fillHeaderFields(oSelected); }
                                                }
                                                this.close();
                                        },
                                        cancel: function () { this.close(); }
                                });

                                var oFilterBar = new sap.ui.comp.filterbar.FilterBar({
                                        advancedMode: true,
                                        filterGroupItems: [
                                                new sap.ui.comp.filterbar.FilterGroupItem({
                                                        groupName: "G1", name: "PurchaseOrder",
                                                        label: "Purchase Order",
                                                        control: new sap.m.Input({ id: "filterPO" })
                                                }),
                                                new sap.ui.comp.filterbar.FilterGroupItem({
                                                        groupName: "G1", name: "Material",
                                                        label: "Material",
                                                        control: new sap.m.Input({ id: "filterMaterial" })
                                                }),
                                                new sap.ui.comp.filterbar.FilterGroupItem({
                                                        groupName: "G1", name: "Supplier",
                                                        label: "Supplier",
                                                        control: new sap.m.Input({ id: "filterSupplier" })
                                                }),
                                                new sap.ui.comp.filterbar.FilterGroupItem({
                                                        groupName: "G1", name: "SupplierName",
                                                        label: "Supplier Name",
                                                        control: new sap.m.Input({ id: "filterSupplierName" })
                                                })
                                        ],
                                        search: function (oEvt) {
                                                var aSet = oEvt.getParameter("selectionSet");
                                                var sPO = "", sMat = "", sSup = "", sSupName = "";
                                                if (aSet && aSet.length >= 4) {
                                                        sPO      = (aSet[0].getValue() || "").toLowerCase();
                                                        sMat     = (aSet[1].getValue() || "").toLowerCase();
                                                        sSup     = (aSet[2].getValue() || "").toLowerCase();
                                                        sSupName = (aSet[3].getValue() || "").toLowerCase();
                                                } else {
                                                        var oFPO  = sap.ui.getCore().byId("filterPO");
                                                        var oFMat = sap.ui.getCore().byId("filterMaterial");
                                                        var oFSup = sap.ui.getCore().byId("filterSupplier");
                                                        var oFSN  = sap.ui.getCore().byId("filterSupplierName");
                                                        sPO      = oFPO  ? (oFPO.getValue()  || "").toLowerCase() : "";
                                                        sMat     = oFMat ? (oFMat.getValue() || "").toLowerCase() : "";
                                                        sSup     = oFSup ? (oFSup.getValue() || "").toLowerCase() : "";
                                                        sSupName = oFSN  ? (oFSN.getValue()  || "").toLowerCase() : "";
                                                }
                                                var oTbl     = that._oPODialog.getTable();
                                                oTbl.setSelectionMode("Single");
                                                var oBinding = oTbl.getBinding("rows");
                                                var aFilters = [];
                                                if (sPO)      { aFilters.push(new sap.ui.model.Filter("PurchaseOrder", sap.ui.model.FilterOperator.Contains, sPO)); }
                                                if (sMat)     { aFilters.push(new sap.ui.model.Filter("Material",      sap.ui.model.FilterOperator.Contains, sMat)); }
                                                if (sSup)     { aFilters.push(new sap.ui.model.Filter("Supplier",      sap.ui.model.FilterOperator.Contains, sSup)); }
                                                if (sSupName) { aFilters.push(new sap.ui.model.Filter("SupplierName",  sap.ui.model.FilterOperator.Contains, sSupName)); }
                                                oBinding.filter(aFilters);
                                        }
                                });

                                this._oPODialog.setFilterBar(oFilterBar);
                                var oTable    = this._oPODialog.getTable();
                                var oColModel = new JSONModel({
                                        cols: [
                                                { label: "Purchase Order",   template: "PurchaseOrder"  },
                                                { label: "Material",         template: "Material"        },
                                                { label: "Material Name",    template: "materialname"    },
                                                { label: "Supplier",         template: "Supplier"        },
                                                { label: "Supplier Name",    template: "SupplierName"    },
                                                { label: "Order Quantity",   template: "OrderQuantity"   },
                                                { label: "Unit",             template: "BaseUnit"        },
                                                { label: "Storage Location", template: "StorageLocation" },
                                                { label: "Plant",            template: "Plant"           }
                                        ]
                                });
                                oTable.setModel(oColModel, "columns");
                        }

                        this._oPODialog.open();
                        this._oPODialog.getTable().setBusy(true);

                        oModel.read("/PurchaseOrder", {
                                success: function (oData) {
                                        that._aPOResults = oData.results;
                                        var oLocal = new JSONModel({ results: oData.results });
                                        var oTbl   = that._oPODialog.getTable();
                                        oTbl.setModel(oLocal);
                                        oTbl.bindRows("/results");
                                        that._oPODialog.update();
                                        that._oPODialog.setTitle("Purchase Order (" + oData.results.length + ")");
                                        oTbl.setBusy(false);
                                },
                                error: function () {
                                        that._oPODialog.getTable().setBusy(false);
                                        sap.m.MessageToast.show("Error loading Purchase Orders.");
                                }
                        });
                },

                _fillHeaderFields: function (oSelected) {
                        var oNow           = new Date();
                        var oDateFormatter = DateFormat.getDateInstance({ pattern: "yyyy-MM-ddTHH:mm:ss" });
                        var sFormattedDate = oDateFormatter.format(oNow);
                        var oModel         = this.getOwnerComponent().getModel();
                        var that           = this;
                        var oView          = this.getView();

                        this.oViewModel.setProperty("/PurchaseOrder",   oSelected.PurchaseOrder);
                        this.oViewModel.setProperty("/Supplier",        oSelected.Supplier);
                        this.oViewModel.setProperty("/SupplierName",    oSelected.SupplierName);
                        this.oViewModel.setProperty("/SupplierDisplay",
                                this._formatSupplierDisplay(oSelected.Supplier, oSelected.SupplierName));
                        this.oViewModel.setProperty("/DocumentDate",    sFormattedDate);
                        this.oViewModel.setProperty("/PostingDate",     sFormattedDate);
                        this.oViewModel.setProperty("/MoveType",        "101");
                        this.oViewModel.setProperty("/orderSelected",   true);

                        this.oViewModel.setProperty("/BatchDistItems", []);

                        var oTblDist = that.byId("_IDGenTableBatchDist");
                        if (oTblDist) {
                                oTblDist.getColumns().forEach(function (col) {
                                        if (col.data("dynamic")) { oTblDist.removeColumn(col); }
                                });
                        }

                        oView.setBusy(true);

                        oModel.read("/PurchaseOrder", {
                                filters: [new sap.ui.model.Filter("PurchaseOrder",
                                        sap.ui.model.FilterOperator.EQ, oSelected.PurchaseOrder)],
                                success: function (oData) {
                                        oView.setBusy(false);
                                        var fOverallQty = 0;
                                        var aProdItems  = oData.results.map(function (item) {
                                                fOverallQty += parseFloat(item.OrderQuantity) || 0;
                                                return {
                                                        Material:            item.Material,
                                                        ProductName:         item.materialname    || item.Material,
                                                        Plant:               item.Plant           || "",
                                                        Quantity:            "",
                                                        Unit:                item.BaseUnit,
                                                        MoveType:            "101",
                                                        Location:            item.StorageLocation || "",
                                                        Batch:               "",
                                                        Supplier:            item.Supplier,
                                                        SupplierName:        item.SupplierName,
                                                        PurchaseOrder:       item.PurchaseOrder,
                                                        OrderQuantity:       item.OrderQuantity,
                                                        DistributedQty:      0,
                                                        AlternativeUnit:     "",
                                                        QuantityNumerator:   1,
                                                        QuantityDenominator: 1,
                                                        ConvertedQuantity:   ""
                                                };
                                        });
                                        that.oViewModel.setProperty("/AllOverQty",  fOverallQty);
                                        that.oViewModel.setProperty("/ProdItems",   aProdItems);
                                        that._updatePurchaseItemsCount();
                                        that._updateFilledQty();
                                        var oPanel = oView.byId("_IDGenPanel5");
                                        if (oPanel) { oPanel.setExpanded(true); }
                                },
                                error: function () {
                                        oView.setBusy(false);
                                        sap.m.MessageToast.show("Error fetching material details for PO.");
                                }
                        });
                },

                _preparePayload: function () {
                        var aDistItems = this.oViewModel.getProperty("/BatchDistItems") || [];
                        var aProdItems = [];

                        aDistItems.forEach(function (oItem) {
                                if (!parseFloat(oItem.DistQuantity)) { return; }
                                aProdItems.push({
                                        Material:      oItem.Material,
                                        ProductName:   oItem.ProductName,
                                        Plant:         oItem.Plant,
                                        Quantity:      oItem.DistQuantity,
                                        Unit:          oItem.Unit,
                                        Batch:         oItem.Batch,
                                        MoveType:      oItem.MoveType || "101",
                                        Location:      oItem.Location,
                                        PurchaseOrder: oItem.PurchaseOrder,
                                        index:         aDistItems.indexOf(oItem)
                                });
                        });

                        return { proditems: aProdItems };
                },

                onPost: function () {
                        var that       = this;
                        var aDistItems = this.oViewModel.getProperty("/BatchDistItems") || [];

                        var bValid = aDistItems.some(function (item) {
                                return parseFloat(item.DistQuantity) > 0;
                        });
                        if (!bValid) {
                                MessageBox.warning("Please distribute quantity before posting.");
                                return;
                        }

                        that.getView().setBusy(true);

                        $.ajax({
                                url:    "/sap/bc/http/sap/ZHTTP_POST_GOODS_RCPT",
                                method: "POST",
                                data:   JSON.stringify({
                                        ...this.oViewModel.getProperty("/"),
                                        ...this._preparePayload()
                                }),
                                headers: { "Content-Type": "application/json" },
                                success: function (result) {
                                        that.getView().setBusy(false);
                                        if (result.ErrorMessage) {
                                                MessageBox.error(result.ErrorMessage);
                                        } else {
                                                MessageBox.success(
                                                        "Document posted successfully.\nDocument No: " +
                                                        result.MaterialDocument +
                                                        "  |  Year: " + result.MaterialDocumentYear,
                                                        {
                                                                onClose: function () {
                                                                        that._rebindHeader();
                                                                        that.getOwnerComponent().getRouter()
                                                                                .navTo("RouteView1", {}, true);
                                                                }
                                                        }
                                                );
                                        }
                                },
                                error: function (result) {
                                        console.error(result);
                                        that.getView().setBusy(false);
                                        MessageBox.error("An error occurred while posting. Please try again.");
                                }
                        });
                },

                onCancel: function () {
                        var oModel = this.getView().getModel("Header");
                        if (oModel) {
                                oModel.setProperty("/PurchaseOrder",      "");
                                oModel.setProperty("/DocumentDate",       null);
                                oModel.setProperty("/PostingDate",        null);
                                oModel.setProperty("/HeaderText",         "");
                                oModel.setProperty("/Supplier",           "");
                                oModel.setProperty("/SupplierName",       "");
                                oModel.setProperty("/SupplierDisplay",    "");
                                oModel.setProperty("/MoveType",           "");
                                oModel.setProperty("/FilledQty",          0);
                                oModel.setProperty("/AllOverQty",         0);
                                oModel.setProperty("/ProdItems",          []);
                                oModel.setProperty("/PurchaseItemsCount", 0);
                                oModel.setProperty("/BatchDistItems",     []);
                        }

                        var that = this;
                        var oTblDist = that.byId("_IDGenTableBatchDist");
                        if (oTblDist) {
                                oTblDist.getColumns().forEach(function (col) {
                                        if (col.data("dynamic")) { oTblDist.removeColumn(col); }
                                });
                        }

                        var oPanel = this.getView().byId("_IDGenPanel5");
                        if (oPanel) { oPanel.setExpanded(false); }

                        this._rebindHeader();
                        this.getOwnerComponent().getRouter().navTo("RouteView1", {}, true);
                }
        });
});