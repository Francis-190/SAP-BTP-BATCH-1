sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (
    Controller,
    Fragment,
    Filter,
    FilterOperator,
    JSONModel,
    MessageToast,
    MessageBox
) {
    "use strict";

    // L1 / L2 approvals happen in SAP Build Process Automation, outside this UI.
    // The list is refreshed on this interval so those status changes show up.
    const AUTO_REFRESH_INTERVAL_MS = 15000;

    return Controller.extend("dealermangement.controller.Dealer", {

        onInit: function () {

            this._sBatchGroupId = "dealerBatchGroup";
            this._oDealerDialog = null;
            this._aChangedContexts = [];
            this._bEditMode = false;
            this._bAutoRefreshing = false;

            this.getView().setModel(
                new JSONModel({
                    dealerName: "",
                    dealerType: "DEALER",
                    gstNumber: "",
                    panNumber: "",
                    phone: "",
                    email: "",
                    address: "",
                    city: "",
                    state: "",
                    country: "India",
                    remarks: ""
                }),
                "createDealer"
            );

            this.getView().setModel(
                new JSONModel({
                    states: [
                        { key: "Andhra Pradesh", text: "Andhra Pradesh" },
                        { key: "Assam", text: "Assam" },
                        { key: "Bihar", text: "Bihar" },
                        { key: "Chhattisgarh", text: "Chhattisgarh" },
                        { key: "Delhi", text: "Delhi" },
                        { key: "Goa", text: "Goa" },
                        { key: "Gujarat", text: "Gujarat" },
                        { key: "Haryana", text: "Haryana" },
                        { key: "Himachal Pradesh", text: "Himachal Pradesh" },
                        { key: "Jharkhand", text: "Jharkhand" },
                        { key: "Karnataka", text: "Karnataka" },
                        { key: "Kerala", text: "Kerala" },
                        { key: "Madhya Pradesh", text: "Madhya Pradesh" },
                        { key: "Maharashtra", text: "Maharashtra" },
                        { key: "Odisha", text: "Odisha" },
                        { key: "Punjab", text: "Punjab" },
                        { key: "Rajasthan", text: "Rajasthan" },
                        { key: "Tamil Nadu", text: "Tamil Nadu" },
                        { key: "Telangana", text: "Telangana" },
                        { key: "Uttar Pradesh", text: "Uttar Pradesh" },
                        { key: "Uttarakhand", text: "Uttarakhand" },
                        { key: "West Bengal", text: "West Bengal" }
                    ],
                    filteredCities: [],
                    latitude: null,
                    longitude: null,
                    geocodeStatus: "",
                    locationValidIcon: "",
                    locationValidIconColor: ""
                }),
                "address"
            );

            // Refresh when the user comes back to this page (for example from
            // Dealer Details after a BPA approval changed the status)
            const oRoute = this.getOwnerComponent().getRouter().getRoute("RouteDealer");
            if (oRoute) {
                oRoute.attachPatternMatched(this._onRouteMatched, this);
            }

            // Pick up status changes made outside the UI (BPA L1 / L2 approvals)
            this._iRefreshTimer = setInterval(function () {
                this._refreshList(false);
            }.bind(this), AUTO_REFRESH_INTERVAL_MS);
        },

        onExit: function () {
            clearInterval(this._iRefreshTimer);

            const oRoute = this.getOwnerComponent().getRouter().getRoute("RouteDealer");
            if (oRoute) {
                oRoute.detachPatternMatched(this._onRouteMatched, this);
            }
        },

        _onRouteMatched: function () {
            this._refreshList(true);
        },

        // Silent refresh of the dealer table.
        // bForce = true skips the "is the page visible" check (used on navigation,
        // when the view is not displayed yet).
        _refreshList: async function (bForce) {
            if (this._bAutoRefreshing) return;

            const oView = this.getView();
            const oDom = oView.getDomRef();

            if (!bForce) {
                // Page not displayed or browser tab hidden: nothing to refresh
                if (!oDom || oDom.offsetParent === null || document.hidden) return;
            }

            // Never refresh while the user is editing or creating a dealer
            if (this._bEditMode) return;
            if (this._oDealerDialog && this._oDealerDialog.isOpen()) return;

            const oModel = oView.getModel();
            const oTable = this.byId("dealerTable");
            if (!oModel || !oTable || oModel.hasPendingChanges()) return;

            const oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            this._bAutoRefreshing = true;

            try {
                await oBinding.requestRefresh();
            } catch (oError) {
                console.warn("Dealer list refresh failed:", oError);
            } finally {
                this._bAutoRefreshing = false;
            }
        },

        onRefresh: async function () {
            const oTable = this.byId("dealerTable");
            if (!oTable) return;
            const oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            try {
                await oBinding.requestRefresh();
                MessageToast.show("Dealer data refreshed");
            } catch (oError) {
                console.error("Refresh error:", oError);
                MessageBox.error("Unable to refresh dealer data.\n\n" + this._getErrorMessage(oError));
            }
        },

        onSearch: function (oEvent) {
            const sValue = oEvent.getParameter("newValue") || "";
            this._applyFilters(sValue);
        },

        onStatusFilterChange: function () {
            const oSearch = this.byId("dealerSearchField");
            this._applyFilters(oSearch ? oSearch.getValue() : "");
        },

        onDealerTypeFilterChange: function () {
            const oSearch = this.byId("dealerSearchField");
            this._applyFilters(oSearch ? oSearch.getValue() : "");
        },

        _applyFilters: function (sSearchValue) {
            const aFilters = [];
            const oStatus = this.byId("statusFilterSelect");
            const oType = this.byId("dealerTypeFilterSelect");
            const sStatus = oStatus ? oStatus.getSelectedKey() : "ALL";
            const sType = oType ? oType.getSelectedKey() : "ALL";

            if (sSearchValue && sSearchValue.trim()) {
                const sSearch = sSearchValue.trim();
                aFilters.push(new Filter({
                    filters: [
                        new Filter("dealerCode", FilterOperator.Contains, sSearch),
                        new Filter("dealerName", FilterOperator.Contains, sSearch),
                        new Filter("gstNumber", FilterOperator.Contains, sSearch),
                        new Filter("panNumber", FilterOperator.Contains, sSearch),
                        new Filter("city", FilterOperator.Contains, sSearch),
                        new Filter("state", FilterOperator.Contains, sSearch)
                    ],
                    and: false
                }));
            }

            if (sStatus && sStatus !== "ALL") {
                aFilters.push(new Filter("status", FilterOperator.EQ, sStatus));
            }

            if (sType && sType !== "ALL") {
                aFilters.push(new Filter("dealerType", FilterOperator.EQ, sType));
            }

            const oTable = this.byId("dealerTable");
            if (!oTable) return;
            const oBinding = oTable.getBinding("items");
            if (oBinding) {
                oBinding.filter(aFilters, "Application");
            }
        },

        onClearFilters: function () {
            const oSearch = this.byId("dealerSearchField");
            const oStatus = this.byId("statusFilterSelect");
            const oType = this.byId("dealerTypeFilterSelect");

            if (oSearch) oSearch.setValue("");
            if (oStatus) oStatus.setSelectedKey("ALL");
            if (oType) oType.setSelectedKey("ALL");

            const oTable = this.byId("dealerTable");
            if (oTable) {
                const oBinding = oTable.getBinding("items");
                if (oBinding) oBinding.filter([], "Application");
            }

            MessageToast.show("Filters cleared");
        },

        onSelectionChange: function () {
            const oTable = this.byId("dealerTable");
            if (!oTable) return;

            const aSelected = oTable.getSelectedItems();
            const iCount = aSelected.length;

            const oDelete = this.byId("deleteDealerButton");
            const oEdit = this.byId("editDealerButton");
            const oMultipleEdit = this.byId("multipleEditButton");

            if (oDelete) oDelete.setEnabled(iCount > 0);
            if (oEdit) oEdit.setEnabled(iCount === 1);
            if (oMultipleEdit) oMultipleEdit.setEnabled(iCount > 0);

            // Workflow button: exactly one dealer selected, enabled by its status
            const oContext = iCount === 1 ? aSelected[0].getBindingContext() : null;
            const sStatus = oContext ? oContext.getProperty("status") : null;

            const mEnabled = {
                submitDealerButton: sStatus === "PENDING"
            };

            Object.keys(mEnabled).forEach(function (sId) {
                const oBtn = this.byId(sId);
                if (oBtn) oBtn.setEnabled(mEnabled[sId]);
            }.bind(this));
        },

        onDealerTableUpdateFinished: function () {
            const oTable = this.byId("dealerTable");
            if (!oTable) return;

            oTable.getItems().forEach(function (oItem) {
                const aCells = oItem.getCells();
                const oLocationInput = aCells[6];

                if (!oLocationInput || typeof oLocationInput.getDomRef !== "function") return;

                const oDomRef = oLocationInput.getDomRef();
                if (!oDomRef || oDomRef.dataset.mapClickBound) return;

                oDomRef.dataset.mapClickBound = "true";
                oDomRef.style.cursor = "pointer";

                oDomRef.addEventListener("click", function () {
                    if (oLocationInput.getEditable()) return;

                    const oContext = oItem.getBindingContext();
                    if (!oContext) return;

                    this._openLocationMap(
                        oContext.getProperty("city"),
                        oContext.getProperty("state"),
                        oContext.getProperty("country")
                    );
                }.bind(this));
            }.bind(this));

            // Selection may have been cleared by a refresh/growing; re-sync buttons
            this.onSelectionChange();
        },

        _openLocationMap: function (sCity, sState, sCountry) {
            sCity = (sCity || "").trim();
            sState = (sState || "").trim();
            sCountry = (sCountry || "India").trim();

            if (!sCity && !sState) {
                MessageToast.show("No location available for this dealer.");
                return;
            }

            const aParts = [sCity, sState, sCountry].filter(function (sPart) { return !!sPart; });
            const sQuery = aParts.join(", ");
            const sMapUrl = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(sQuery);

            window.open(sMapUrl, "_blank", "noopener,noreferrer");
        },

        /* ================================================================ */
        /* CREATE DEALER                                                    */
        /* ================================================================ */

        onCreateDealer: async function () {
            try {
                const oCreateModel = this.getView().getModel("createDealer");

                oCreateModel.setData({
                    dealerName: "",
                    dealerType: "DEALER",
                    gstNumber: "",
                    panNumber: "",
                    phone: "",
                    email: "",
                    address: "",
                    city: "",
                    state: "",
                    country: "India",
                    remarks: ""
                });

                this.getView().getModel("address").setData({
                    states: this.getView().getModel("address").getProperty("/states"),
                    filteredCities: [],
                    latitude: null,
                    longitude: null,
                    geocodeStatus: "",
                    locationValidIcon: "",
                    locationValidIconColor: ""
                });

                if (!this._oDealerDialog) {
                    this._oDealerDialog = await Fragment.load({
                        id: this.getView().getId(),
                        name: "dealermangement.fragment.DealerDialog",
                        controller: this
                    });

                    this.getView().addDependent(this._oDealerDialog);
                }

                this._clearDialogValidation();

                const oCityControl = this.byId("cityInnput");
                if (oCityControl) oCityControl.setEnabled(false);

                this._oDealerDialog.open();

            } catch (oError) {
                console.error("Create dialog error:", oError);
                MessageBox.error("Unable to open Create Dealer dialog.\n\n" + this._getErrorMessage(oError));
            }
        },

        onStateChange: async function (oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            const sState = oSelectedItem ? oSelectedItem.getKey() : "";

            const oAddressModel = this.getView().getModel("address");
            const oCreateModel = this.getView().getModel("createDealer");
            const oCityControl = this.byId("cityInnput");

            oCreateModel.setProperty("/city", "");
            oAddressModel.setProperty("/filteredCities", []);

            if (!sState) {
                if (oCityControl) oCityControl.setEnabled(false);
                return;
            }

            if (oCityControl) oCityControl.setEnabled(false);

            try {
                const oModel = this.getView().getModel();
                const oOperation = oModel.bindContext("/getCitiesByState(...)");
                oOperation.setParameter("state", sState);

                await oOperation.execute();

                const oResult = oOperation.getBoundContext().getObject();
                const aCityNames = (oResult && oResult.value) || [];
                const aCities = aCityNames.map(function (sCity) {
                    return { key: sCity, text: sCity };
                });

                oAddressModel.setProperty("/filteredCities", aCities);

                if (oCityControl) {
                    oCityControl.setEnabled(aCities.length > 0);
                    oCityControl.setValueState("None");

                    if (aCities.length === 0) {
                        MessageToast.show("No cities found for " + sState);
                    }
                }

            } catch (oError) {
                console.error("getCitiesByState error:", oError);
                MessageToast.show("Unable to fetch cities. Please try again.");
                if (oCityControl) oCityControl.setEnabled(false);
            }
        },

        onAddressChange: function () {
            this._geocodeCurrentAddress();
        },

        onCityChange: function () {
            this._geocodeCurrentAddress();
        },

        _fetchGeocode: async function (sQuery) {
            const sUrl = "https://nominatim.openstreetmap.org/search" +
                "?format=json&limit=1&countrycodes=in&q=" + encodeURIComponent(sQuery);

            const oResponse = await fetch(sUrl, { headers: { "Accept": "application/json" } });

            if (!oResponse.ok) {
                throw new Error("Geocoding request failed with status " + oResponse.status);
            }

            const aResults = await oResponse.json();

            if (!aResults || aResults.length === 0) {
                throw new Error("No results found for this address.");
            }

            const oResult = aResults[0];
            return { latitude: parseFloat(oResult.lat), longitude: parseFloat(oResult.lon) };
        },

        _geocodeWithFallback: async function (sAddress, sCity, sState, sCountry) {
            const sFullQuery = [sAddress, sCity, sState, sCountry]
                .filter(function (sPart) { return !!sPart; }).join(", ");

            try {
                const oResult = await this._fetchGeocode(sFullQuery);
                return { latitude: oResult.latitude, longitude: oResult.longitude, simplified: false };
            } catch (oFullError) {
                const sFirstSegment = sAddress.split(",")[0].trim();

                if (!sFirstSegment || sFirstSegment === sAddress) {
                    throw oFullError;
                }

                const sSimplifiedQuery = [sFirstSegment, sCity, sState, sCountry]
                    .filter(function (sPart) { return !!sPart; }).join(", ");

                const oResult = await this._fetchGeocode(sSimplifiedQuery);
                return { latitude: oResult.latitude, longitude: oResult.longitude, simplified: true };
            }
        },

        _geocodeCurrentAddress: async function () {
            const oCreateModel = this.getView().getModel("createDealer");
            const oData = oCreateModel.getData();
            const oAddressModel = this.getView().getModel("address");

            const sCity = (oData.city || "").trim();
            const sState = (oData.state || "").trim();

            if (!sCity || !sState) {
                oAddressModel.setProperty("/latitude", null);
                oAddressModel.setProperty("/longitude", null);
                oAddressModel.setProperty("/geocodeStatus", "");
                return;
            }

            const sAddress = (oData.address || "").trim();

            if (!sAddress) {
                oAddressModel.setProperty("/latitude", null);
                oAddressModel.setProperty("/longitude", null);
                oAddressModel.setProperty("/geocodeStatus", "");
                return;
            }

            const sCountry = (oData.country || "India").trim();

            oAddressModel.setProperty("/geocodeStatus", "Locating address...");

            try {
                const oResult = await this._geocodeWithFallback(sAddress, sCity, sState, sCountry);

                oAddressModel.setProperty("/latitude", oResult.latitude);
                oAddressModel.setProperty("/longitude", oResult.longitude);
                oAddressModel.setProperty("/geocodeStatus", "Location found");

            } catch (oError) {
                console.error("geocodeAddress error:", oError);

                oAddressModel.setProperty("/latitude", null);
                oAddressModel.setProperty("/longitude", null);
                oAddressModel.setProperty("/geocodeStatus", "Couldn't locate exact address - map will use a text search instead");
            }
        },

        onValidateLocation: async function () {
            const oCreateModel = this.getView().getModel("createDealer");
            const oData = oCreateModel.getData();
            const oAddressModel = this.getView().getModel("address");

            const sCity = (oData.city || "").trim();
            const sState = (oData.state || "").trim();

            if (!sCity || !sState) {
                MessageToast.show("Please select State and City first.");
                return;
            }

            const sAddress = (oData.address || "").trim();

            if (!sAddress) {
                MessageToast.show("Please enter an address to validate.");
                return;
            }

            const sCountry = (oData.country || "India").trim();

            oAddressModel.setProperty("/locationValidIcon", "");
            oAddressModel.setProperty("/geocodeStatus", "Validating location...");

            try {
                const oResult = await this._geocodeWithFallback(sAddress, sCity, sState, sCountry);

                oAddressModel.setProperty("/latitude", oResult.latitude);
                oAddressModel.setProperty("/longitude", oResult.longitude);
                oAddressModel.setProperty("/locationValidIcon", "sap-icon://sys-enter-2");
                oAddressModel.setProperty("/locationValidIconColor", "#2B7D2B");
                oAddressModel.setProperty("/geocodeStatus", "Location found");

            } catch (oError) {
                console.error("Validate location error:", oError);

                oAddressModel.setProperty("/latitude", null);
                oAddressModel.setProperty("/longitude", null);
                oAddressModel.setProperty("/locationValidIcon", "sap-icon://sys-cancel-2");
                oAddressModel.setProperty("/locationValidIconColor", "#B00000");
                oAddressModel.setProperty("/geocodeStatus", "Location not found in this state/city");
            }
        },

        onViewOnMap: function () {
            const oCreateModel = this.getView().getModel("createDealer");
            const oData = oCreateModel.getData();

            const sState = (oData.state || "").trim();
            const sCity = (oData.city || "").trim();

            if (!sState || !sCity) {
                MessageToast.show("Please select State and City first.");
                return;
            }

            const oAddressModel = this.getView().getModel("address");
            const fLatitude = oAddressModel.getProperty("/latitude");
            const fLongitude = oAddressModel.getProperty("/longitude");

            let sMapUrl;

            if (fLatitude !== null && fLatitude !== undefined && fLongitude !== null && fLongitude !== undefined) {
                sMapUrl = "https://www.google.com/maps/search/?api=1&query=" + fLatitude + "," + fLongitude;
            } else {
                const sAddress = (oData.address || "").trim();
                const sCountry = (oData.country || "India").trim();

                const aParts = [sAddress, sCity, sState, sCountry].filter(function (sPart) { return !!sPart; });
                const sQuery = aParts.join(", ");

                sMapUrl = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(sQuery);
            }

            window.open(sMapUrl, "_blank", "noopener,noreferrer");
        },

        _clearDialogValidation: function () {
            const aIds = [
                "dealerNameInpput", "gstInput", "panInput", "phoneInnput",
                "emailInput", "addressInput", "cityInnput", "stateInnput",
                "countryInput", "remarksInput"
            ];

            aIds.forEach(function (sId) {
                const oControl = this.byId(sId);
                if (oControl && typeof oControl.setValueState === "function") {
                    oControl.setValueState("None");
                }
            }.bind(this));
        },

        // Returns the first check whose value already exists on a dealer, or null.
        // aChecks: [{ field, value, control, label }]
        _findDuplicate: async function (aChecks) {
            const oModel = this.getView().getModel();

            for (const oCheck of aChecks) {
                if (!oCheck.value) continue;

                const oListBinding = oModel.bindList(
                    "/Dealers",
                    null,
                    null,
                    [new Filter(oCheck.field, FilterOperator.EQ, oCheck.value)],
                    { $select: "ID" }
                );

                const aContexts = await oListBinding.requestContexts(0, 1);
                oListBinding.destroy();

                if (aContexts.length > 0) {
                    return oCheck;
                }
            }

            return null;
        },

        onSaveDealer: async function () {
            const oCreateModel = this.getView().getModel("createDealer");

            if (!oCreateModel) {
                MessageBox.error("Create Dealer model is not available.");
                return;
            }

            const oData = oCreateModel.getData();
            const oName = this.byId("dealerNameInpput");

            if (!oData.dealerName || !oData.dealerName.trim()) {
                oName.setValueState("Error");
                oName.setValueStateText("Dealer Name is required.");
                MessageBox.error("Dealer Name is required.");
                return;
            }

            oName.setValueState("None");

            const sGST = (oData.gstNumber || "").trim().toUpperCase();
            const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
            const oGST = this.byId("gstInput");

            if (!gstRegex.test(sGST)) {
                oGST.setValueState("Error");
                oGST.setValueStateText("Enter a valid GST Number.");
                MessageBox.error("Invalid GST Number.\n\nExample: 27ABCDE1234F1Z5");
                return;
            }

            oGST.setValueState("None");

            const sPAN = (oData.panNumber || "").trim().toUpperCase();
            const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
            const oPAN = this.byId("panInput");

            if (!panRegex.test(sPAN)) {
                oPAN.setValueState("Error");
                oPAN.setValueStateText("Enter a valid PAN Number.");
                MessageBox.error("Invalid PAN Number.\n\nExample: ABCDE1234F");
                return;
            }

            oPAN.setValueState("None");

            const sPhone = (oData.phone || "").trim();
            const phoneRegex = /^[6-9][0-9]{9}$/;
            const oPhone = this.byId("phoneInnput");

            if (!phoneRegex.test(sPhone)) {
                oPhone.setValueState("Error");
                oPhone.setValueStateText("Enter a valid 10 digit mobile number.");
                MessageBox.error("Invalid Phone Number.\n\nEnter a valid 10 digit mobile number.");
                return;
            }

            oPhone.setValueState("None");

            // Duplicate pre-check (GST / PAN / phone / email): show the problem on the
            // field itself instead of sending a POST the server will reject.
            const sEmail = oData.email ? oData.email.trim().toLowerCase() : "";
            const oEmail = this.byId("emailInput");
            if (oEmail) oEmail.setValueState("None");

            try {
                const oDuplicate = await this._findDuplicate([
                    { field: "gstNumber", value: sGST, control: oGST, label: "GST number" },
                    { field: "panNumber", value: sPAN, control: oPAN, label: "PAN number" },
                    { field: "phone", value: sPhone, control: oPhone, label: "phone number" },
                    { field: "email", value: sEmail, control: oEmail, label: "email address" }
                ]);

                if (oDuplicate) {
                    const sMessage = "A dealer with this " + oDuplicate.label + " already exists.";

                    if (oDuplicate.control) {
                        oDuplicate.control.setValueState("Error");
                        oDuplicate.control.setValueStateText(sMessage);
                    }

                    MessageBox.error(sMessage);
                    return;
                }
            } catch (oCheckError) {
                // If the pre-check itself fails, the server-side check still protects the data
                console.warn("Duplicate pre-check failed:", oCheckError);
            }

            const oTable = this.byId("dealerTable");
            const oBinding = oTable.getBinding("items");

            if (!oBinding) {
                MessageBox.error("Dealer table binding is not available.");
                return;
            }

            let oContext = null;
            let bDraftCreated = false;

            try {
                const oCreateData = {
                    dealerName: oData.dealerName.trim(),
                    dealerType: oData.dealerType,
                    gstNumber: sGST,
                    panNumber: sPAN,
                    phone: sPhone,
                    email: sEmail || null,
                    address: oData.address ? oData.address.trim() : null,
                    city: oData.city ? oData.city.trim() : null,
                    state: oData.state ? oData.state.trim() : null,
                    country: oData.country ? oData.country.trim() : "India",
                    remarks: oData.remarks ? oData.remarks.trim() : null
                };

                oContext = oBinding.create(oCreateData, true);

                // Prevents an "uncaught (in promise)" error when a failed creation is cancelled below
                oContext.created().catch(function () { /* handled in the catch block */ });

                await this.getView().getModel().submitBatch(this._sBatchGroupId);
                await oContext.created();

                // Dealers is draft-enabled, so the POST above only created a DRAFT.
                // Activate it: this runs the server-side validation, sets the status
                // to PENDING, generates the dealer code and turns the draft into a
                // real (active) dealer that the list can show.
                bDraftCreated = true;

                const oActivate = this.getView().getModel().bindContext(
                    "DealerService.draftActivate(...)",
                    oContext,
                    { $$inheritExpandSelect: true }
                );
                await oActivate.execute("$auto");

                bDraftCreated = false;

                this._oDealerDialog.close();

                await oBinding.requestRefresh();

                MessageToast.show("Dealer created successfully");

            } catch (oError) {
                console.error("Create dealer error:", oError);

                // A POST that failed (e.g. 409 duplicate GST) stays queued in the batch group
                // and is re-sent on every later submit. Cancel it so the user can correct the
                // data and press Save again without the old failed request coming back.
                if (oContext && oContext.isTransient && oContext.isTransient()) {
                    try {
                        await oContext.delete();
                    } catch (oCancelError) {
                        // already cancelled
                    }
                }

                // Activation failed (for example a duplicate GST number): discard the
                // draft so it does not stay behind as an orphan
                if (bDraftCreated && oContext) {
                    try {
                        await oContext.delete("$auto");
                    } catch (oDiscardError) {
                        console.warn("Could not discard the draft:", oDiscardError);
                    }
                }

                MessageBox.error("Unable to create dealer.\n\n" + this._getErrorMessage(oError));
            }
        },

        onCloseDealer: function () {
            if (this._oDealerDialog) {
                this._clearDialogValidation();
                this._oDealerDialog.close();
            }
        },

        /* ================================================================ */
        /* EDIT / MULTIPLE EDIT                                             */
        /* ================================================================ */

        onEditDealer: function () {
            const oTable = this.byId("dealerTable");
            const aSelected = oTable.getSelectedItems();

            if (aSelected.length !== 1) {
                MessageToast.show("Select exactly one dealer to edit");
                return;
            }

            this._bEditMode = true;
            this._setRowEditable(aSelected[0], true);
            this._aChangedContexts = [];
            this._enableSaveButtons();

            MessageToast.show("Dealer is ready for editing");
        },

        onMultipleEdit: function () {
            const oTable = this.byId("dealerTable");
            const aSelected = oTable.getSelectedItems();

            if (aSelected.length === 0) {
                MessageToast.show("Select dealer(s) for multiple edit");
                return;
            }

            this._bEditMode = true;
            this._aChangedContexts = [];

            aSelected.forEach(function (oItem) {
                this._setRowEditable(oItem, true);
            }.bind(this));

            this._enableSaveButtons();

            MessageToast.show(aSelected.length + " dealer(s) ready for multiple edit");
        },

        _setRowEditable: function (oItem, bEditable) {
            if (!oItem) return;

            const aCells = oItem.getCells();

            if (aCells[1] && typeof aCells[1].setEditable === "function") {
                aCells[1].setEditable(bEditable);
            }

            if (aCells[2] && typeof aCells[2].setEnabled === "function") {
                aCells[2].setEnabled(bEditable);
            }

            if (aCells[3] && typeof aCells[3].setEditable === "function") {
                aCells[3].setEditable(bEditable);
            }

            if (aCells[4] && typeof aCells[4].setEditable === "function") {
                aCells[4].setEditable(bEditable);
            }

            if (aCells[5] && typeof aCells[5].setEditable === "function") {
                aCells[5].setEditable(bEditable);
            }

            if (aCells[6] && typeof aCells[6].setEditable === "function") {
                aCells[6].setEditable(bEditable);
            }

            [aCells[1], aCells[3], aCells[4], aCells[5], aCells[6]].forEach(function (oControl) {
                if (oControl && typeof oControl.setValueState === "function") {
                    oControl.setValueState("None");
                }
            });
        },

        _enableSaveButtons: function () {
            const oSave = this.byId("saveAllButton");
            const oCancel = this.byId("cancelChangesButton");
            const oStatus = this.byId("batchStatusText");

            if (oSave) oSave.setEnabled(true);
            if (oCancel) oCancel.setEnabled(true);
            if (oStatus) oStatus.setVisible(true);
        },

        onDealerFieldChange: function (oEvent) {
            const oControl = oEvent.getSource();
            const oContext = oControl.getBindingContext();
            if (!oContext) return;
            this._addChangedContext(oContext);
        },

        onLocationChange: function (oEvent) {
            const oInput = oEvent.getSource();
            const oContext = oInput.getBindingContext();
            if (!oContext) return;

            const sLocation = oInput.getValue().trim();

            if (!sLocation) {
                oInput.setValueState("Error");
                oInput.setValueStateText("Location is required.");
                this._addChangedContext(oContext);
                return;
            }

            oInput.setValueState("None");

            const aParts = sLocation.split(",");
            const sCity = aParts[0] ? aParts[0].trim() : "";
            const sState = aParts.length > 1 ? aParts.slice(1).join(",").trim() : "";

            oContext.setProperty("city", sCity);
            oContext.setProperty("state", sState);

            this._addChangedContext(oContext);
        },

        _addChangedContext: function (oContext) {
            if (this._aChangedContexts.indexOf(oContext) === -1) {
                this._aChangedContexts.push(oContext);
            }
            this._enableSaveButtons();
        },

        onSaveAll: async function () {
            const oModel = this.getView().getModel();

            if (!oModel) {
                MessageBox.error("OData model is not available.");
                return;
            }

            const oTable = this.byId("dealerTable");

            if (!oTable) {
                MessageBox.error("Dealer table is not available.");
                return;
            }

            if (!oModel.hasPendingChanges()) {
                MessageToast.show("No changes to save");
                return;
            }

            for (const oContext of this._aChangedContexts) {
                const oItem = oTable.getItems().find(function (oRow) {
                    return oRow.getBindingContext() === oContext;
                });

                if (!oItem) continue;

                const aCells = oItem.getCells();

                const oGST = aCells[3];
                if (oGST && typeof oGST.getValue === "function") {
                    const sGST = oGST.getValue().trim().toUpperCase();
                    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

                    if (!sGST) {
                        oGST.setValueState("Error");
                        oGST.setValueStateText("GST Number is required.");
                        MessageBox.error("GST Number is required.");
                        return;
                    }

                    if (!gstRegex.test(sGST)) {
                        oGST.setValueState("Error");
                        oGST.setValueStateText("Enter a valid GST Number.");
                        MessageBox.error("Invalid GST Number.\n\nExample: 27ABCDE1234F1Z5");
                        return;
                    }

                    oGST.setValueState("None");
                    oGST.setValue(sGST);
                    oContext.setProperty("gstNumber", sGST);
                }

                const oPAN = aCells[4];
                if (oPAN && typeof oPAN.getValue === "function") {
                    const sPAN = oPAN.getValue().trim().toUpperCase();
                    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

                    if (!sPAN) {
                        oPAN.setValueState("Error");
                        oPAN.setValueStateText("PAN Number is required.");
                        MessageBox.error("PAN Number is required.");
                        return;
                    }

                    if (!panRegex.test(sPAN)) {
                        oPAN.setValueState("Error");
                        oPAN.setValueStateText("Enter a valid PAN Number.");
                        MessageBox.error("Invalid PAN Number.\n\nExample: ABCDE1234F");
                        return;
                    }

                    oPAN.setValueState("None");
                    oPAN.setValue(sPAN);
                    oContext.setProperty("panNumber", sPAN);
                }

                const oPhone = aCells[5];
                if (oPhone && typeof oPhone.getValue === "function") {
                    const sPhone = oPhone.getValue().trim();
                    const phoneRegex = /^[6-9][0-9]{9}$/;

                    if (!sPhone) {
                        oPhone.setValueState("Error");
                        oPhone.setValueStateText("Phone number is required.");
                        MessageBox.error("Phone number is required.");
                        return;
                    }

                    if (!phoneRegex.test(sPhone)) {
                        oPhone.setValueState("Error");
                        oPhone.setValueStateText("Enter a valid 10 digit mobile number.");
                        MessageBox.error("Invalid Phone Number.\n\nEnter a valid 10 digit mobile number.");
                        return;
                    }

                    oPhone.setValueState("None");
                    oContext.setProperty("phone", sPhone);
                }

                const oLocation = aCells[6];
                if (oLocation && typeof oLocation.getValue === "function") {
                    const sLocation = oLocation.getValue().trim();

                    if (!sLocation) {
                        oLocation.setValueState("Error");
                        oLocation.setValueStateText("Location is required.");
                        MessageBox.error("Location is required.");
                        return;
                    }

                    oLocation.setValueState("None");

                    const aParts = sLocation.split(",");
                    const sCity = aParts[0] ? aParts[0].trim() : "";
                    const sState = aParts.length > 1 ? aParts.slice(1).join(",").trim() : "";

                    oContext.setProperty("city", sCity);
                    oContext.setProperty("state", sState);
                }
            }

            try {
                this.getView().setBusy(true);

                await oModel.submitBatch(this._sBatchGroupId);

                const oBinding = oTable.getBinding("items");
                if (oBinding) await oBinding.requestRefresh();

                this._aChangedContexts = [];
                this._bEditMode = false;
                this._setAllRowsEditable(false);

                const oSave = this.byId("saveAllButton");
                const oCancel = this.byId("cancelChangesButton");
                const oStatus = this.byId("batchStatusText");

                if (oSave) oSave.setEnabled(false);
                if (oCancel) oCancel.setEnabled(false);
                if (oStatus) oStatus.setVisible(false);

                oTable.removeSelections(true);
                this.onSelectionChange();

                this.getView().setBusy(false);

                MessageToast.show("All dealer changes saved successfully");

            } catch (oError) {
                this.getView().setBusy(false);
                console.error("Save error:", oError);
                MessageBox.error("Unable to save changes.\n\n" + this._getErrorMessage(oError));
            }
        },

        onCancelChanges: function () {
            const oModel = this.getView().getModel();
            if (oModel) oModel.resetChanges(this._sBatchGroupId);

            this._aChangedContexts = [];
            this._bEditMode = false;
            this._setAllRowsEditable(false);

            const oSave = this.byId("saveAllButton");
            const oCancel = this.byId("cancelChangesButton");
            const oStatus = this.byId("batchStatusText");

            if (oSave) oSave.setEnabled(false);
            if (oCancel) oCancel.setEnabled(false);
            if (oStatus) oStatus.setVisible(false);

            const oTable = this.byId("dealerTable");
            if (oTable) {
                oTable.removeSelections(true);
                this.onSelectionChange();
            }

            MessageToast.show("Changes cancelled");
        },

        _setAllRowsEditable: function (bEditable) {
            const oTable = this.byId("dealerTable");
            if (!oTable) return;

            oTable.getItems().forEach(function (oItem) {
                this._setRowEditable(oItem, bEditable);
            }.bind(this));
        },

        /* ================================================================ */
        /* DELETE                                                           */
        /* ================================================================ */

        onDeleteDealer: function () {
            const oTable = this.byId("dealerTable");
            const aSelected = oTable.getSelectedItems();

            if (aSelected.length === 0) {
                MessageToast.show("Select dealer(s) to delete");
                return;
            }

            const iCount = aSelected.length;

            MessageBox.confirm(
                "Are you sure you want to delete " + iCount + " selected dealer(s)?",
                {
                    title: "Delete Dealer",
                    emphasizedAction: MessageBox.Action.OK,
                    onClose: async function (sAction) {
                        if (sAction !== MessageBox.Action.OK) return;

                        try {
                            const oModel = this.getView().getModel();
                            const aDeletePromises = [];

                            aSelected.forEach(function (oItem) {
                                const oContext = oItem.getBindingContext();
                                if (!oContext) return;

                                const oPromise = oContext.delete(this._sBatchGroupId);

                                // Avoid "uncaught (in promise)" if the batch fails;
                                // the error is handled by the catch block below
                                oPromise.catch(function () { /* handled below */ });

                                aDeletePromises.push(oPromise);
                            }.bind(this));

                            await oModel.submitBatch(this._sBatchGroupId);
                            await Promise.all(aDeletePromises);

                            const oBinding = oTable.getBinding("items");
                            if (oBinding) await oBinding.requestRefresh();

                            oTable.removeSelections(true);
                            this.onSelectionChange();

                            MessageToast.show(iCount + " dealer(s) deleted successfully");

                        } catch (oError) {
                            console.error("Delete error:", oError);
                            MessageBox.error("Dealer deletion failed.\n\n" + this._getErrorMessage(oError));
                        }
                    }.bind(this)
                }
            );
        },

        /* ================================================================ */
        /* NAVIGATION                                                       */
        /* ================================================================ */

        onViewDealer: function (oEvent) {
            try {
                const oSource = oEvent.getSource();
                const oContext = oSource.getBindingContext();

                if (!oContext) {
                    MessageBox.error("Dealer information is not available.");
                    return;
                }

                const sDealerId = oContext.getProperty("ID");

                if (!sDealerId) {
                    MessageBox.error("Dealer ID is missing.");
                    return;
                }

                this.getOwnerComponent().getRouter().navTo("DealerDetails", {
                    dealerId: String(sDealerId)
                });

            } catch (oError) {
                console.error("Navigation error:", oError);
                MessageBox.error("Unable to open Dealer Details.\n\n" + this._getErrorMessage(oError));
            }
        },

        /* ================================================================ */
        /* WORKFLOW ACTIONS (Submit)                                        */
        /* L1 / L2 approvals are done in BPA and arrive through the         */
        /* auto refresh, not through buttons in this app.                   */
        /* ================================================================ */

        _getSelectedDealerContext: function () {
            const aSelected = this.byId("dealerTable").getSelectedItems();

            if (aSelected.length !== 1) {
                MessageToast.show("Select exactly one dealer");
                return null;
            }

            return aSelected[0].getBindingContext();
        },

        onSubmitDealer: function () {
            const oContext = this._getSelectedDealerContext();
            if (!oContext) return;

            MessageBox.confirm("Submit this dealer for approval?", {
                title: "Submit Dealer",
                emphasizedAction: MessageBox.Action.OK,
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        this._executeAction(oContext, "submitDealer", {}, "Dealer submitted successfully.")
                            .catch(function () { /* error already shown */ });
                    }
                }.bind(this)
            });
        },

        _executeAction: async function (oContext, sActionName, mParameters, sSuccessMsg) {
            try {
                const oAction = oContext.getModel().bindContext(
                    "DealerService." + sActionName + "(...)",
                    oContext
                );

                Object.keys(mParameters || {}).forEach(function (sKey) {
                    oAction.setParameter(sKey, mParameters[sKey]);
                });

                this.getView().setBusy(true);

                await oAction.execute("$auto");

                // Refresh only the fields the action changed
                await oContext.requestSideEffects([
                    { $PropertyPath: "status" },
                    { $PropertyPath: "remarks" },
                    { $PropertyPath: "blockedReason" }
                ], "$auto");

                this.getView().setBusy(false);
                MessageToast.show(sSuccessMsg);

                // Re-evaluate which workflow buttons are enabled
                this.onSelectionChange();

            } catch (oError) {
                this.getView().setBusy(false);
                console.error("Action error:", oError);
                MessageBox.error(this._getErrorMessage(oError));
                throw oError;
            }
        },

        /* ================================================================ */
        /* FORMATTERS / HELPERS                                             */
        /* ================================================================ */

        formatStatusState: function (sStatus) {
            if (!sStatus) return "None";

            switch (String(sStatus).toUpperCase()) {
                case "ACTIVE":
                    return "Success";
                case "PENDING":
                case "SUBMITTED":
                    return "Warning";
                case "L1_APPROVED":
                    return "Information";
                case "REJECTED":
                case "BLOCKED":
                    return "Error";
                default:
                    return "None";
            }
        },

        _getErrorMessage: function (oError) {
            if (oError && oError.message) return oError.message;
            if (oError && oError.cause && oError.cause.message) return oError.cause.message;

            if (oError && oError.responseText) {
                try {
                    const oResponse = JSON.parse(oError.responseText);
                    if (oResponse.error && oResponse.error.message) return oResponse.error.message;
                } catch (e) {
                    // Ignore JSON parse error
                }
            }

            return "Operation failed.";
        }

    });
});