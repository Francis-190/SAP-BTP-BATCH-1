sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/Popover",
    "sap/ui/core/HTML"
], function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    Popover,
    HTML
) {
    "use strict";

    var STATUS_COLORS = {
        "Rejected": "#D85A30",
        "Approved": "#1D9E75",
        "Paid": "#2FA8A0",
        "Pending / review": "#EF9F27",
        "InvestigationRequired": "#7F77DD",
        "Submitted": "#3E7CB1",
        "Draft": "#3E7CB1"
    };

    var FALLBACK_PALETTE = [
        "#3E7CB1",
        "#1D9E75",
        "#EF9F27",
        "#7F77DD",
        "#D85A30",
        "#2FA8A0",
        "#C2571F",
        "#4C6EF5"
    ];

    var STATUS_PILL_COLORS = {
        "PendingApproval": {
            bg: "#E9F1FB",
            text: "#2563A6",
            label: "Pending Approval"
        },
        "UnderReview": {
            bg: "#FDF2E3",
            text: "#A66A0A",
            label: "Under Review"
        },
        "Rejected": {
            bg: "#FBEAE5",
            text: "#B33F1E",
            label: "Rejected"
        },
        "Submitted": {
            bg: "#E9F1FB",
            text: "#2563A6",
            label: "Submitted"
        },
        "Approved": {
            bg: "#E6F5EF",
            text: "#0F6E56",
            label: "Approved"
        },
        "Paid": {
            bg: "#E6F5EF",
            text: "#0F6E56",
            label: "Paid"
        },
        "Draft": {
            bg: "#F0F3F7",
            text: "#4A6175",
            label: "Draft"
        },
        "InvestigationRequired": {
            bg: "#F1EEFB",
            text: "#5B55A5",
            label: "Investigation Required"
        }
    };

    return Controller.extend(
        "claimsure.app.controller.Dashboard",
        {

            /* =========================================================
             * INIT
             * ========================================================= */

      onInit: function () {

    this.getView().setModel(
        new JSONModel({
            totalClaims: 0,
            pendingApproval: 0,
            rejectedClaims: 0,
            submittedClaims: 0,
            approvedClaims: 0,
            totalPolicies: 0,
            activePolicies: 0,
            totalCustomers: 0,
            newCustomersThisMonth: 0,
            totalClaimTypes: 0
        }),
        "dash"
    );

    this.getView().setModel(
        new JSONModel([]),
        "recent"
    );

    this.getView().setModel(
        new JSONModel({
            items: []
        }),
        "statusChart"
    );

    this.getView().setModel(
        new JSONModel({
            items: []
        }),
        "policyTrendChart"
    );

    this.getView().setModel(
        new JSONModel({
            years: [],
            selectedYear: null
        }),
        "yearsModel"
    );

    this._loadDashboardData();
},

            /* =========================================================
             * AFTER RENDERING
             * ========================================================= */

          onAfterRendering: function () {

    var oView = this.getView();

    var mHandlers = {
        "navCardClaims": this.onNavClaims,
        "navCardPolicies": this.onNavPolicies,
        "navCardCustomers": this.onNavCustomers,
        "navCardClaimTypes": this.onNavClaimTypes,

        "kpiPendingApproval":
            this.onKpiPendingApproval,

        "kpiRejected":
            this.onKpiRejected,

        "kpiSubmitted":
            this.onKpiSubmitted,

        "kpiApproved":
            this.onKpiApproved,

        "kpiActivePolicies":
            this.onKpiActivePolicies
    };

    Object.keys(mHandlers).forEach(
        function (sId) {

            var oControl =
                oView.byId(sId);

            if (
                oControl &&
                oControl.getDomRef()
            ) {

                oControl.$()
                    .off("click.dashboardCard")
                    .on(
                        "click.dashboardCard",
                        mHandlers[sId].bind(this)
                    )

                    .off("keydown.dashboardCard")
                    .on(
                        "keydown.dashboardCard",
                        function (oEvent) {

                            if (
                                oEvent.key === "Enter" ||
                                oEvent.key === " "
                            ) {

                                oEvent.preventDefault();

                                mHandlers[sId].call(
                                    this
                                );
                            }

                        }.bind(this)
                    );
            }

        }.bind(this)
    );


    // Delegated handler: bound once on the view root, so it
    // keeps working even though the donut/legend markup is
    // regenerated (via core:HTML) whenever statusChart>/items
    // changes.
    oView.$()
        .off("click.statusSegment")
        .on(
            "click.statusSegment",
            ".pieSlice, .legendRowClickable",
            function (oEvent) {
                this._onStatusSegmentPress(oEvent);
            }.bind(this)
        );


    // Delegated handler: bound once on the view root, so it
    // keeps working even though the trend line markup is
    // regenerated (via core:HTML) whenever policyTrendChart>/items
    // changes.
    oView.$()
        .off("mouseenter.trendPoint")
        .on(
            "mouseenter.trendPoint",
            ".chartLinePoint",
            function (oEvent) {
                this._onTrendPointHover(oEvent);
            }.bind(this)
        )
        .off("mouseleave.trendPoint")
        .on(
            "mouseleave.trendPoint",
            ".chartLinePoint",
            function () {
                if (this._oTrendPopover) {
                    this._oTrendPopover.close();
                }
            }.bind(this)
        );
},
_onTrendPointHover: function (oEvent) {

    var oTarget = oEvent.currentTarget;

    if (!oTarget) {
        return;
    }

    var sMonth = oTarget.getAttribute("data-month") || "";
    var sCount = oTarget.getAttribute("data-count") || "0";

    this._openTrendPopover(oTarget, sMonth, sCount);
},

_openTrendPopover: function (oOpenByDomRef, sMonth, sCount) {

    if (!this._oTrendPopover) {

        this._oTrendPopover =
            new Popover({
                showHeader: false,
                placement: "Top",
                contentWidth: "160px"
            });

        this.getView().addDependent(
            this._oTrendPopover
        );
    }

    this._oTrendPopover.destroyContent();

    this._oTrendPopover.addContent(
        new HTML({
            content:
                "<div class='statusPopoverContent'>" +
                "<div class='statusPopoverTitle'>" +
                this._escapeHtml(sMonth) +
                "</div>" +
                "<div class='statusPopoverCount'>" +
                sCount +
                " polic" + (sCount === "1" ? "y" : "ies") +
                "</div>" +
                "</div>"
        })
    );

    this._oTrendPopover.openBy(
        oOpenByDomRef
    );
},

onExit: function () {

    if (this._oStatusPopover) {
        this._oStatusPopover.destroy();
        this._oStatusPopover = null;
    }

    if (this._oTrendPopover) {
        this._oTrendPopover.destroy();
        this._oTrendPopover = null;
    }
},

            /* =========================================================
             * CLEANUP
             * ========================================================= */

            onExit: function () {

                if (this._oStatusPopover) {
                    this._oStatusPopover.destroy();
                    this._oStatusPopover = null;
                }
            },


            /* =========================================================
             * DASHBOARD DATA
             * ========================================================= */

            _loadDashboardData: function () {

                var oModel =
                    this.getOwnerComponent().getModel();

                var oAdminModel =
                    this.getOwnerComponent()
                        .getModel("admin");

                if (!oModel) {

                    console.error(
                        "[Dashboard] Default insurance model is not available."
                    );

                    return;
                }


                Promise.all([

                    // Claim Types
                    this._loadLookupMap(
                        oAdminModel,
                        "/ClaimTypes",
                        "name"
                    ),

                    // Customers
                    this._loadLookupMap(
                        oAdminModel,
                        "/Customers",
                        null
                    ),

                    // Policies
                    this._loadPolicyLookupMap(
                        oModel
                    )

                ])
                .then(function (aMaps) {

                    return this._loadClaims(
                        oModel,
                        aMaps[0],
                        aMaps[1],
                        aMaps[2]
                    );

                }.bind(this))
                .catch(function (oErr) {

                    console.error(
                        "[Dashboard] Failed to load claims",
                        oErr
                    );
                });


                this._loadPolicyCounts(oModel);

               this._loadPolicyTrendChart(
                    oModel
                );
                this._loadCustomerCount(
                    oAdminModel
                );

                this._loadClaimTypeCount(
                    oAdminModel
                );
            },


            /* =========================================================
             * GENERIC LOOKUP
             *
             * ClaimTypes:
             *   ID -> name
             *
             * Customers:
             *   ID -> firstName + lastName
             * ========================================================= */

            _loadLookupMap: function (
                oModel,
                sPath,
                sNameField
            ) {

                return new Promise(
                    function (resolve) {

                        if (!oModel) {
                            resolve({});
                            return;
                        }

                        var oBinding =
                            oModel.bindList(
                                sPath,
                                undefined,
                                undefined,
                                undefined,
                                {
                                    $select:
                                        sNameField
                                            ? "ID," +
                                              sNameField
                                            : "ID,firstName,lastName"
                                }
                            );

                        oBinding
                            .requestContexts(
                                0,
                                1000
                            )
                            .then(
                                function (aContexts) {

                                    var mMap = {};

                                    aContexts.forEach(
                                        function (oCtx) {

                                            var oData =
                                                oCtx.getObject();

                                            if (sNameField) {

                                                mMap[oData.ID] =
                                                    oData[
                                                        sNameField
                                                    ];

                                            } else {

                                                mMap[oData.ID] =
                                                    [
                                                        oData.firstName,
                                                        oData.lastName
                                                    ]
                                                    .filter(Boolean)
                                                    .join(" ");
                                            }
                                        }
                                    );

                                    resolve(mMap);
                                }
                            )
                            .catch(
                                function (oErr) {

                                    console.warn(
                                        "[Dashboard] Lookup failed for " +
                                        sPath,
                                        oErr
                                    );

                                    resolve({});
                                }
                            );
                    }
                );
            },


            /* =========================================================
             * POLICY LOOKUP
             *
             * Policy ID ->
             * {
             *     policyNumber,
             *     claimType_ID
             * }
             * ========================================================= */

            _loadPolicyLookupMap: function (
                oModel
            ) {

                return new Promise(
                    function (resolve) {

                        if (!oModel) {
                            resolve({});
                            return;
                        }

                        var oBinding =
                            oModel.bindList(
                                "/Policies",
                                undefined,
                                undefined,
                                undefined,
                                {
                                    $select:
                                        "ID,policyNumber,claimType_ID"
                                }
                            );

                        oBinding
                            .requestContexts(
                                0,
                                1000
                            )
                            .then(
                                function (aContexts) {

                                    var mMap = {};

                                    aContexts.forEach(
                                        function (oCtx) {

                                            var oData =
                                                oCtx.getObject();

                                            mMap[oData.ID] = {

                                                policyNumber:
                                                    oData.policyNumber,

                                                claimType_ID:
                                                    oData.claimType_ID
                                            };
                                        }
                                    );

                                    resolve(mMap);
                                }
                            )
                            .catch(
                                function (oErr) {

                                    console.warn(
                                        "[Dashboard] Policy lookup failed",
                                        oErr
                                    );

                                    resolve({});
                                }
                            );
                    }
                );
            },


            /* =========================================================
             * CLAIMS
             * ========================================================= */

            _loadClaims: function (
                oModel,
                mClaimTypes,
                mCustomers,
                mPolicies
            ) {

                var oClaimsBinding =
                    oModel.bindList(
                        "/Claims",
                        undefined,
                        undefined,
                        undefined,
                        {
                            $select:
                                "ID,claimNumber,claimedAmount,status,customer_ID,claimType_ID,policy_ID",

                            $orderby:
                                "claimNumber desc"
                        }
                    );


                return oClaimsBinding
                    .requestContexts(
                        0,
                        200
                    )
                    .then(
                        function (aContexts) {

                            var aClaims =
                                aContexts.map(
                                    function (oCtx) {

                                        var oData =
                                            oCtx.getObject();

                                        var oPolicy =
                                            mPolicies[
                                                oData.policy_ID
                                            ];


                                        return Object.assign(
                                            {},
                                            oData,
                                            {

                                                customerName:
                                                    mCustomers[
                                                        oData.customer_ID
                                                    ] || "",


                                                claimTypeName:
                                                    mClaimTypes[
                                                        oData.claimType_ID
                                                    ] || "",


                                                policyNumber:
                                                    oPolicy &&
                                                    oPolicy.policyNumber
                                                        ? oPolicy.policyNumber
                                                        : "",


                                                /*
                                                 * Policies entity does not
                                                 * contain a name field.
                                                 *
                                                 * Therefore we display the
                                                 * Claim Type name associated
                                                 * with the Policy.
                                                 */

                                                policyName:
                                                    oPolicy &&
                                                    oPolicy.claimType_ID
                                                        ? (
                                                            mClaimTypes[
                                                                oPolicy.claimType_ID
                                                            ] || ""
                                                        )
                                                        : ""
                                            }
                                        );
                                    }
                                );


                            var oDash =
                                this.getView()
                                    .getModel("dash");


                            /* Total Claims */

                            oDash.setProperty(
                                "/totalClaims",
                                aClaims.length
                            );


                            /* Pending Approval */

                            oDash.setProperty(
                                "/pendingApproval",

                                aClaims.filter(
                                    function (c) {

                                        return (
                                            c.status ===
                                                "PendingApproval" ||

                                            c.status ===
                                                "UnderReview"
                                        );
                                    }
                                ).length
                            );


                            /* Rejected */

                            oDash.setProperty(
                                "/rejectedClaims",

                                aClaims.filter(
                                    function (c) {

                                        return c.status ===
                                            "Rejected";
                                    }
                                ).length
                            );


                            /* Submitted */

                            oDash.setProperty(
                                "/submittedClaims",

                                aClaims.filter(
                                    function (c) {

                                        return c.status ===
                                            "Submitted";
                                    }
                                ).length
                            );


                            /* Approved */

                            oDash.setProperty(
                                "/approvedClaims",

                                aClaims.filter(
                                    function (c) {

                                        return c.status ===
                                            "Approved";
                                    }
                                ).length
                            );


                            this._buildStatusChart(
                                aClaims
                            );


                            this.getView()
                                .getModel("recent")
                                .setData(
                                    aClaims.slice(0, 5)
                                );

                        }.bind(this)
                    );
            },


            /* =========================================================
             * STATUS CHART (data)
             * ========================================================= */

            _buildStatusChart: function (
                aClaims
            ) {

                var mStatusCounts = {};

                aClaims.forEach(
                    function (oClaim) {

                        var sKey =
                            oClaim.status ===
                                "PendingApproval" ||

                            oClaim.status ===
                                "UnderReview"

                                ? "Pending / review"

                                : (
                                    oClaim.status ||
                                    "Unknown"
                                );


                        mStatusCounts[sKey] =
                            (
                                mStatusCounts[sKey] ||
                                0
                            ) + 1;
                    }
                );


                var iTotal =
                    aClaims.length || 1;


                var aItems =
                    Object.keys(
                        mStatusCounts
                    )
                    .map(
                        function (
                            sStatus,
                            iIndex
                        ) {

                            var iCount =
                                mStatusCounts[
                                    sStatus
                                ];

                            var fShare =
                                (
                                    iCount /
                                    iTotal
                                ) * 100;


                            var sColor =
                                STATUS_COLORS[
                                    sStatus
                                ] ||

                                FALLBACK_PALETTE[
                                    iIndex %
                                    FALLBACK_PALETTE.length
                                ];


                            return {

                                status:
                                    sStatus,

                                count:
                                    iCount,

                                percentOfTotal:
                                    Math.round(
                                        fShare
                                    ),

                                color:
                                    sColor
                            };
                        }
                    )
                    .sort(
                        function (a, b) {
                            return b.count - a.count;
                        }
                    );


                this.getView()
                    .getModel("statusChart")
                    .setData({
                        items: aItems
                    });
            },


            /* =========================================================
             * STATUS DONUT (view)
             *
             * Renders a real SVG donut (one <path> arc per status,
             * carrying data-* attributes) so each slice is a clickable
             * DOM node — a flat CSS conic-gradient div has no way to
             * address individual slices for a click/popover.
             *
             * Data comes from the same statusChart>/items model that
             * also feeds the legend; nothing about how that data is
             * computed has changed.
             * ========================================================= */

            formatStatusDonutHtml: function (
                aItems
            ) {

                if (
                    !aItems ||
                    !aItems.length
                ) {

                    return (
                        "<div class='pieChart emptyPie'></div>"
                    );
                }


                var iTotal =
                    aItems.reduce(
                        function (n, oItem) {
                            return n + oItem.count;
                        },
                        0
                    ) || 1;


                var iSize = 210;
                var iCenter = iSize / 2;
                var iOuterR = 105;
                var iInnerR = 72;

                var fCumulative = 0;

                var sPaths =
                    aItems.map(
                        function (oItem) {

                            var fStartAngle =
                                (fCumulative / iTotal) * 360;

                            fCumulative += oItem.count;

                            var fEndAngle =
                                (fCumulative / iTotal) * 360;

                            // Guard against a single 100% slice, where
                            // start === end after a full revolution.
                            if (fEndAngle - fStartAngle >= 359.99) {
                                fEndAngle = fStartAngle + 359.99;
                            }

                            var iPercent =
                                oItem.percentOfTotal !== undefined
                                    ? oItem.percentOfTotal
                                    : Math.round(
                                        (oItem.count / iTotal) * 100
                                    );

                            return (
                                "<path class='pieSlice' " +
                                "d='" +
                                this._donutSlicePath(
                                    iCenter,
                                    iCenter,
                                    iOuterR,
                                    iInnerR,
                                    fStartAngle,
                                    fEndAngle
                                ) +
                                "' " +
                                "fill='" + oItem.color + "' " +
                                "data-status='" + this._escapeHtml(oItem.status) + "' " +
                                "data-count='" + oItem.count + "' " +
                                "data-percent='" + iPercent + "' " +
                                "data-color='" + oItem.color + "'>" +
                                "<title>" +
                                this._escapeHtml(oItem.status) +
                                " — " + oItem.count +
                                "</title>" +
                                "</path>"
                            );

                        }.bind(this)
                    )
                    .join("");


                return (
                    "<div class='pieChart'>" +

                    "<svg viewBox='0 0 " + iSize + " " + iSize + "' " +
                    "width='" + iSize + "' height='" + iSize + "' " +
                    "class='pieChartSvg'>" +

                    sPaths +

                    "</svg>" +

                    "<div class='pieCenterLabel'>" +
                    "<span class='pieCenterValue'>" +
                    iTotal +
                    "</span>" +
                    "<span class='pieCenterCaption'>Total Claims</span>" +
                    "</div>" +

                    "</div>"
                );
            },


            /* =========================================================
             * DONUT SLICE PATH (geometry helper)
             *
             * Builds an SVG path for one ring segment between
             * fStartAngle/fEndAngle (degrees, clockwise from the top).
             * ========================================================= */

            _donutSlicePath: function (
                iCx,
                iCy,
                iOuterR,
                iInnerR,
                fStartAngle,
                fEndAngle
            ) {

                function polarToCartesian(fAngleDeg, fRadius) {

                    var fRad =
                        (fAngleDeg - 90) *
                        (Math.PI / 180);

                    return {
                        x: iCx + fRadius * Math.cos(fRad),
                        y: iCy + fRadius * Math.sin(fRad)
                    };
                }

                var oOuterStart = polarToCartesian(fEndAngle, iOuterR);
                var oOuterEnd = polarToCartesian(fStartAngle, iOuterR);
                var oInnerStart = polarToCartesian(fEndAngle, iInnerR);
                var oInnerEnd = polarToCartesian(fStartAngle, iInnerR);

                var iLargeArc =
                    (fEndAngle - fStartAngle) <= 180 ? 0 : 1;

                return [
                    "M", oOuterStart.x, oOuterStart.y,
                    "A", iOuterR, iOuterR, 0, iLargeArc, 0, oOuterEnd.x, oOuterEnd.y,
                    "L", oInnerEnd.x, oInnerEnd.y,
                    "A", iInnerR, iInnerR, 0, iLargeArc, 1, oInnerStart.x, oInnerStart.y,
                    "Z"
                ].join(" ");
            },


            /* =========================================================
             * STATUS LEGEND (view)
             * ========================================================= */

            formatStatusLegendHtml: function (
                aItems
            ) {

                if (
                    !aItems ||
                    !aItems.length
                ) {

                    return (
                        "<div class='legendEmpty'>No claims data</div>"
                    );
                }


                return aItems.map(
                    function (oItem) {

                        var iPercent =
                            oItem.percentOfTotal !== undefined
                                ? oItem.percentOfTotal
                                : "";

                        return (
                            "<div class='legendRow legendRowClickable' " +
                            "data-status='" + this._escapeHtml(oItem.status) + "' " +
                            "data-count='" + oItem.count + "' " +
                            "data-percent='" + iPercent + "' " +
                            "data-color='" + oItem.color + "'>" +

                            "<span class='legendDot' style='background:" +
                            oItem.color +
                            ";'></span>" +

                            "<span class='legendLabel'>" +
                            this._escapeHtml(oItem.status) +
                            "</span>" +

                            "<span class='legendPercent'>" +
                            oItem.count +
                            "</span>" +

                            "</div>"
                        );

                    }.bind(this)
                )
                .join("");
            },


            /* =========================================================
             * STATUS SEGMENT CLICK -> POPOVER
             *
             * Fired for both a donut slice (<path class='pieSlice'>)
             * and a legend row (.legendRowClickable) — both carry the
             * same data-* attributes, so one handler covers both.
             * ========================================================= */

            _onStatusSegmentPress: function (
                oEvent
            ) {

                var oTarget = oEvent.currentTarget;

                if (!oTarget) {
                    return;
                }

                var sStatus = oTarget.getAttribute("data-status") || "";
                var sColor = oTarget.getAttribute("data-color") || "#8A969F";
                var sCount = oTarget.getAttribute("data-count") || "0";
                var sPercent = oTarget.getAttribute("data-percent") || "";

                this._openStatusPopover(
                    oTarget,
                    sStatus,
                    sColor,
                    sCount,
                    sPercent
                );
            },


            /* =========================================================
             * STATUS POPOVER
             * ========================================================= */

            _openStatusPopover: function (
                oOpenByDomRef,
                sStatus,
                sColor,
                sCount,
                sPercent
            ) {

                if (!this._oStatusPopover) {

                    this._oStatusPopover =
                        new Popover({
                            showHeader: false,
                            placement: "Auto",
                            contentWidth: "230px"
                        });

                    this.getView().addDependent(
                        this._oStatusPopover
                    );
                }

                this._oStatusPopover.destroyContent();

                this._oStatusPopover.addContent(
                    new HTML({
                        content:
                            this._buildStatusPopoverHtml(
                                sStatus,
                                sColor,
                                sCount,
                                sPercent
                            )
                    })
                );

                this._oStatusPopover.openBy(
                    oOpenByDomRef
                );
            },


            /* =========================================================
             * STATUS POPOVER CONTENT
             * ========================================================= */

            _buildStatusPopoverHtml: function (
                sStatus,
                sColor,
                sCount,
                sPercent
            ) {

                var sPercentLine =
                    sPercent !== ""
                        ? "<div class='statusPopoverPercent'>" +
                          sPercent +
                          "% of total claims</div>"
                        : "";

                return (
                    "<div class='statusPopoverContent'>" +

                    "<div class='statusPopoverHeader'>" +
                    "<span class='statusPopoverDot' style='background:" +
                    sColor +
                    ";'></span>" +
                    "<span class='statusPopoverTitle'>" +
                    this._escapeHtml(sStatus) +
                    "</span>" +
                    "</div>" +

                    "<div class='statusPopoverCount'>" +
                    sCount +
                    " claim" + (sCount === "1" ? "" : "s") +
                    "</div>" +

                    sPercentLine +

                    "</div>"
                );
            },


            /* =========================================================
             * STATUS PILL
             * ========================================================= */

            formatStatusPillHtml: function (
                sStatus
            ) {

                var oColors =
                    STATUS_PILL_COLORS[
                        sStatus
                    ] ||

                    {
                        bg: "#F0F0EC",
                        text: "#6E6E6E",
                        label:
                            sStatus ||
                            "Unknown"
                    };


                return (
                    "<span class='statusPill' style='background:" +
                    oColors.bg +
                    ";color:" +
                    oColors.text +
                    ";'>" +

                    this._escapeHtml(
                        oColors.label
                    ) +

                    "</span>"
                );
            },


            /* =========================================================
             * CURRENCY
             * ========================================================= */

            formatCurrency: function (
                vAmount
            ) {

                if (
                    vAmount === null ||
                    vAmount === undefined ||
                    vAmount === ""
                ) {

                    return "—";
                }


                var fAmount =
                    Number(vAmount);


                if (isNaN(fAmount)) {
                    return String(vAmount);
                }


                return (
                    "₹ " +
                    fAmount.toLocaleString(
                        "en-IN",
                        {
                            maximumFractionDigits: 2
                        }
                    )
                );
            },


            /* =========================================================
             * POLICY SVG
             * ========================================================= */

         formatPolicyTrendChartSvg: function (aItems) {

    if (!aItems || !aItems.length) {
        return "<div class='legendEmpty'>No policy data</div>";
    }

    var iWidth = 560;
    var iHeight = 200;
    var iTopPad = 20;
    var iBottomPad = 34;
    var iSidePad = 30;
    var iChartHeight = iHeight - iTopPad - iBottomPad;
    var iChartWidth = iWidth - iSidePad * 2;

    var iMaxCount = Math.max.apply(
        null,
        aItems.map(function (o) { return o.count; })
    ) || 1;

    var iStepX = iChartWidth / (aItems.length - 1 || 1);

    var iTickCount = Math.min(iMaxCount, 4);
    var sGrid = "";

    for (var t = 0; t <= iTickCount; t++) {

        var fRatio = t / iTickCount;
        var iY = iTopPad + iChartHeight - Math.round(fRatio * iChartHeight);
        var iTickValue = Math.round(fRatio * iMaxCount);

        sGrid +=
            "<line x1='" + iSidePad + "' y1='" + iY + "' x2='" +
            (iWidth - iSidePad) + "' y2='" + iY +
            "' class='chartGridLine'></line>" +

            "<text x='2' y='" + (iY + 3) + "' class='chartGridLabel'>" +
            iTickValue + "</text>";
    }

    var aPoints = aItems.map(function (oItem, i) {
        var x = iSidePad + i * iStepX;
        var y = iTopPad + iChartHeight - Math.round((oItem.count / iMaxCount) * iChartHeight);
        return { x: x, y: y, item: oItem };
    });

    var sLinePath = aPoints.map(function (p, i) {
        return (i === 0 ? "M" : "L") + p.x + " " + p.y;
    }).join(" ");

    var sCircles = aPoints.map(function (p) {
    return (
        "<circle cx='" + p.x + "' cy='" + p.y + "' r='4' class='chartLinePoint' " +
        "data-month='" + this._escapeHtml(p.item.month) + "' " +
        "data-count='" + p.item.count + "'>" +
        "</circle>"
    );
}.bind(this)).join("");

    var sLabels = aPoints.map(function (p) {
        return (
            "<text x='" + p.x + "' y='" + (iHeight - 10) +
            "' text-anchor='middle' class='chartBarLabel'>" +
            this._escapeHtml(p.item.month) + "</text>"
        );
    }.bind(this)).join("");

    return (
        "<svg viewBox='0 0 " + iWidth + " " + iHeight +
        "' class='policyChartSvg' preserveAspectRatio='none'>" +
        sGrid +
        "<path d='" + sLinePath + "' class='chartLinePath'></path>" +
        sCircles +
        sLabels +
        "</svg>"
    );
},


            /* =========================================================
             * POLICY COUNTS
             * ========================================================= */

            _loadPolicyCounts: function (
                oModel
            ) {

                if (!oModel) {
                    return;
                }


                var oAllBinding =
                    oModel.bindList(
                        "/Policies",
                        undefined,
                        undefined,
                        undefined,
                        {
                            $select: "ID"
                        }
                    );


                oAllBinding
                    .requestContexts(
                        0,
                        1000
                    )
                    .then(
                        function (aCtx) {

                            this.getView()
                                .getModel("dash")
                                .setProperty(
                                    "/totalPolicies",
                                    aCtx.length
                                );

                        }.bind(this)
                    )
                    .catch(
                        function (oErr) {

                            console.warn(
                                "[Dashboard] Total policies failed",
                                oErr
                            );
                        }
                    );


                var oActiveBinding =
                    oModel.bindList(
                        "/Policies",
                        undefined,
                        undefined,
                        new Filter(
                            "status",
                            FilterOperator.EQ,
                            "Active"
                        ),
                        {
                            $select: "ID",
                            $$operationMode:
                                "Server"
                        }
                    );


                oActiveBinding
                    .requestContexts(
                        0,
                        1000
                    )
                    .then(
                        function (aCtx) {

                            this.getView()
                                .getModel("dash")
                                .setProperty(
                                    "/activePolicies",
                                    aCtx.length
                                );

                        }.bind(this)
                    )
                    .catch(
                        function (oErr) {

                            console.warn(
                                "[Dashboard] Active policies failed",
                                oErr
                            );
                        }
                    );
            },


            /* =========================================================
             * CUSTOMER COUNT
             * ========================================================= */

            _loadCustomerCount: function (
                oAdminModel
            ) {

                if (!oAdminModel) {
                    return;
                }


                var oBinding =
                    oAdminModel.bindList(
                        "/Customers",
                        undefined,
                        undefined,
                        undefined,
                        {
                            $select: "ID"
                        }
                    );


                oBinding
                    .requestContexts(
                        0,
                        1000
                    )
                    .then(
                        function (aCtx) {

                            this.getView()
                                .getModel("dash")
                                .setProperty(
                                    "/totalCustomers",
                                    aCtx.length
                                );

                        }.bind(this)
                    )
                    .catch(
                        function (oErr) {

                            console.warn(
                                "[Dashboard] Customers count failed",
                                oErr
                            );
                        }
                    );
            },


            /* =========================================================
             * CLAIM TYPE COUNT
             * ========================================================= */

            _loadClaimTypeCount: function (
                oAdminModel
            ) {

                if (!oAdminModel) {
                    return;
                }


                var oBinding =
                    oAdminModel.bindList(
                        "/ClaimTypes",
                        undefined,
                        undefined,
                        undefined,
                        {
                            $select: "ID"
                        }
                    );


                oBinding
                    .requestContexts(
                        0,
                        1000
                    )
                    .then(
                        function (aCtx) {

                            this.getView()
                                .getModel("dash")
                                .setProperty(
                                    "/totalClaimTypes",
                                    aCtx.length
                                );

                        }.bind(this)
                    )
                    .catch(
                        function (oErr) {

                            console.warn(
                                "[Dashboard] ClaimTypes count failed",
                                oErr
                            );
                        }
                    );
            },


            /* =========================================================
             * POLICY TYPE CHART
             * ========================================================= */

_loadPolicyTrendChart: function (oModel) {

    if (!oModel) {
        return;
    }

    var oBinding =
        oModel.bindList(
            "/Policies",
            undefined,
            undefined,
            undefined,
            {
                $select: "ID,startDate"   // <-- changed
            }
        );

    oBinding
        .requestContexts(0, 1000)
        .then(function (aContexts) {

            var aPolicies =
                aContexts.map(function (oCtx) {
                    return oCtx.getObject();
                });

            this._aAllPolicies = aPolicies;

            var aYears =
                Array.from(
                    new Set(
                        aPolicies
                            .filter(function (p) { return p.startDate; })   // <-- changed
                            .map(function (p) {
                                return new Date(p.startDate).getFullYear();  // <-- changed
                            })
                    )
                ).sort(function (a, b) { return b - a; });

            if (!aYears.length) {
                aYears = [new Date().getFullYear()];
            }

            var oYearsModel = this.getView().getModel("yearsModel");

            oYearsModel.setProperty(
                "/years",
                aYears.map(function (y) {
                    return { key: String(y), text: String(y) };
                })
            );

            oYearsModel.setProperty("/selectedYear", String(aYears[0]));

            this._buildPolicyTrendChart(aPolicies, aYears[0]);

        }.bind(this))
        .catch(function (oErr) {
            console.error("[Dashboard] Policy trend chart failed", oErr);
        });
},

            /* =========================================================
             * BUILD POLICY TYPE CHART
             * ========================================================= */

_buildPolicyTrendChart: function (aPolicies, iYear) {

    var aMonthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    var aCounts = new Array(12).fill(0);

    aPolicies.forEach(function (oPolicy) {

        if (!oPolicy.startDate) {          // <-- changed
            return;
        }

        var oDate = new Date(oPolicy.startDate);   // <-- changed

        if (oDate.getFullYear() === iYear) {
            aCounts[oDate.getMonth()] += 1;
        }
    });

    var aItems = aMonthNames.map(function (sName, i) {
        return { month: sName, count: aCounts[i] };
    });

    this.getView()
        .getModel("policyTrendChart")
        .setData({ items: aItems });
},
            /* =========================================================
             * CLAIM PRESS
             * ========================================================= */

            onClaimPress: function (
                oEvent
            ) {

                var oCtx =
                    oEvent
                        .getSource()
                        .getBindingContext(
                            "recent"
                        );


                if (!oCtx) {
                    return;
                }


                var sClaimId =
                    oCtx.getProperty(
                        "ID"
                    );


                this.getOwnerComponent()
                    .getRouter()
                    .navTo(
                        "claimDetail",
                        {
                            claimId:
                                sClaimId
                        }
                    );
            },


            /* =========================================================
             * NAVIGATION
             * ========================================================= */

            onViewAllClaims: function () {
                this.onNavClaims();
            },


            onNavClaims: function () {

                this.getOwnerComponent()
                    .getRouter()
                    .navTo("claims");
            },


            onNavPolicies: function () {

                this.getOwnerComponent()
                    .getRouter()
                    .navTo("policies");
            },


            onNavCustomers: function () {

                this.getOwnerComponent()
                    .getRouter()
                    .navTo(
                        "admin",
                        {
                            "?query": {
                                tab: "customers"
                            }
                        }
                    );
            },


            onNavClaimTypes: function () {

                this.getOwnerComponent()
                    .getRouter()
                    .navTo(
                        "admin",
                        {
                            "?query": {
                                tab: "claimTypes"
                            }
                        }
                    );
            },


            /* =========================================================
             * KPI NAVIGATION
             * ========================================================= */

            onKpiPendingApproval: function () {

                this.getOwnerComponent()
                    .getRouter()
                    .navTo(
                        "claims",
                        {
                            "?query": {
                               status: "PendingApproval,UnderReview"
                            }
                        }
                    );
            },


            onKpiRejected: function () {

                this.getOwnerComponent()
                    .getRouter()
                    .navTo(
                        "claims",
                        {
                            "?query": {
                                status: "Rejected"
                            }
                        }
                    );
            },


            onKpiSubmitted: function () {

                this.getOwnerComponent()
                    .getRouter()
                    .navTo(
                        "claims",
                        {
                            "?query": {
                                status: "Submitted"
                            }
                        }
                    );
            },


            onKpiApproved: function () {

                this.getOwnerComponent()
                    .getRouter()
                    .navTo(
                        "claims",
                        {
                            "?query": {
                                status: "Approved"
                            }
                        }
                    );
            },


            onKpiActivePolicies: function () {

                this.getOwnerComponent()
                    .getRouter()
                    .navTo(
                        "policies",
                        {
                            "?query": {
                                status: "Active"
                            }
                        }
                    );
            },


            /* =========================================================
             * HTML ESCAPE
             * ========================================================= */

            _escapeHtml: function (
                sValue
            ) {

                return String(
                    sValue === null ||
                    sValue === undefined
                        ? ""
                        : sValue
                )
                .replace(
                    /&/g,
                    "&amp;"
                )
                .replace(
                    /</g,
                    "&lt;"
                )
                .replace(
                    />/g,
                    "&gt;"
                )
                .replace(
                    /"/g,
                    "&quot;"
                )
                .replace(
                    /'/g,
                    "&#039;"
                );
            }

        }
    );
});