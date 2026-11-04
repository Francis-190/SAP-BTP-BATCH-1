const cds = require('@sap/cds');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

module.exports = cds.service.impl(async function () {
  const DESTINATION_NAME = 'Mobis_Inventory_BPA';
  const WORKFLOW_DEFINITION_ID = 'us10.3c318b49trial.mobisinventory3.managerApproval';
  const { SpareParts, Locations, Inventory, StockMovements, AlertNotifications, StockTransferRequests } =
    this.entities;

  const { ApplicationLogs, PurchaseRequisitions } = cds.entities('mobis.db');


  async function getInventoryRow(partID, locationID) {
    let row = await SELECT.one.from(Inventory).where({ part_ID: partID, location_ID: locationID });
    if (!row) {
      await INSERT.into(Inventory).entries({ part_ID: partID, location_ID: locationID, quantityOnHand: 0 });
      row = { part_ID: partID, location_ID: locationID, quantityOnHand: 0, reorderLevel: null };
    }
    return row;
  }

  //alert notification entity if service impl
  async function raiseLowStockAlertIfNeeded(part, locationID, newQty) {
    const effectiveReorderLevel =
      (await SELECT.one.from(Inventory).where({ part_ID: part.ID, location_ID: locationID }))
        ?.reorderLevel ?? part.reorderLevel;

    if (newQty < effectiveReorderLevel) {
      await INSERT.into(AlertNotifications).entries({
        alertType: 'LOW_STOCK',
        part_ID: part.ID,
        location_ID: locationID,
        message: `Part ${part.partNumber} at location fell to ${newQty}, below reorder level ${effectiveReorderLevel}.`,
        severity: newQty <= (part.safetyStock ?? 0) ? 'HIGH' : 'MEDIUM',
      });
    }
  }


  this.on('issueStock', async (req) => {
    const { partID, locationID, quantity, reference, serviceCenterID } = req.data;

    if (!(quantity > 0)) {
      return req.error(400, 'Quantity must be a positive number.');
    }

    // Service center is required for every issue
    if (!serviceCenterID) {
      return req.error(400, 'Service center is required.');
    }

    const part = await SELECT.one.from(SpareParts).where({ ID: partID });
    if (!part) return req.error(404, `Spare part ${partID} does not exist.`);

    const location = await SELECT.one.from(Locations).where({ ID: locationID });
    if (!location) return req.error(404, `Location ${locationID} does not exist.`);

    const center = await SELECT.one.from('mobis.db.ServiceCenters').where({ ID: serviceCenterID });
    if (!center) return req.error(404, 'Service center does not exist.');
    if (!center.isActive) return req.error(400, 'Service center is inactive.');

    const invRow = await getInventoryRow(partID, locationID);
    if (invRow.quantityOnHand < quantity) {

      await INSERT.into(ApplicationLogs).entries({
        layer: 'InventoryService',
        operation: 'issueStock',
        message: `Insufficient stock: requested ${quantity}, available ${invRow.quantityOnHand} for part ${partID} at ${locationID}.`,
        severity: 'WARNING',
      });
      return req.error(
        409,
        `Insufficient stock. Available: ${invRow.quantityOnHand}, requested: ${quantity}.`
      );
    }

    const newQty = invRow.quantityOnHand - quantity;

    await UPDATE(Inventory)
      .set({ quantityOnHand: newQty, lastMovementAt: new Date().toISOString() })
      .where({ part_ID: partID, location_ID: locationID });

    await INSERT.into(StockMovements).entries({
      movementType: 'ISSUE',
      part_ID: partID,
      fromLocation_ID: locationID,
      quantity,
      reference,
      status: 'POSTED',
    });

    // Track what happens to the parts after they reach the service center
    await INSERT.into('mobis.db.ServicePartIssues').entries({
      ID: cds.utils.uuid(),
      serviceCenter_ID: serviceCenterID,
      warehouse_ID: locationID,
      part_ID: partID,
      issuedQuantity: quantity,
      consumedQuantity: 0,
      unusedReturnedQuantity: 0,
      defectiveReturnedQuantity: 0,
      status: 'ISSUED',
      issueDate: new Date().toISOString(),
      remarks: reference
    });

    await raiseLowStockAlertIfNeeded(part, locationID, newQty);

    return SELECT.one.from(StockMovements).where({ part_ID: partID, reference });
  });

  this.on('transferStock', async (req) => {
    const { partID, fromLocationID, toLocationID, quantity, reference } = req.data;

    if (!(quantity > 0)) return req.error(400, 'Quantity must be positive.');
    if (fromLocationID === toLocationID)
      return req.error(400, 'Source and target location must differ.');

    const part = await SELECT.one.from(SpareParts).where({ ID: partID });
    if (!part) return req.error(404, `Spare part ${partID} does not exist.`);

    for (const locID of [fromLocationID, toLocationID]) {
      const loc = await SELECT.one.from(Locations).where({ ID: locID });
      if (!loc) return req.error(404, `Location ${locID} does not exist.`);
    }

    const sourceRow = await getInventoryRow(partID, fromLocationID);
    if (sourceRow.quantityOnHand < quantity) {
      return req.error(
        409,
        `Insufficient stock at source. Available: ${sourceRow.quantityOnHand}, requested: ${quantity}.`
      );
    }
    const targetRow = await getInventoryRow(partID, toLocationID);

    const newSourceQty = sourceRow.quantityOnHand - quantity;
    const newTargetQty = targetRow.quantityOnHand + quantity;
    const now = new Date().toISOString();

    await UPDATE(Inventory)
      .set({ quantityOnHand: newSourceQty, lastMovementAt: now })
      .where({ part_ID: partID, location_ID: fromLocationID });

    await UPDATE(Inventory)
      .set({ quantityOnHand: newTargetQty, lastMovementAt: now })
      .where({ part_ID: partID, location_ID: toLocationID });

    await INSERT.into(StockMovements).entries({
      movementType: 'TRANSFER',
      part_ID: partID,
      fromLocation_ID: fromLocationID,
      toLocation_ID: toLocationID,
      quantity,
      reference,
      status: 'POSTED',
    });

    await raiseLowStockAlertIfNeeded(part, fromLocationID, newSourceQty);

    return SELECT.one
      .from(StockMovements)
      .where({ part_ID: partID, fromLocation_ID: fromLocationID, toLocation_ID: toLocationID })
      .orderBy('createdAt desc');
  });

  this.on('getAvailableStock', async (req) => {
    const { partID, locationID } = req.data;
    const row = await SELECT.one.from(Inventory).where({ part_ID: partID, location_ID: locationID });
    return row ? row.quantityOnHand : 0;
  });


  this.on('CREATE', 'StockTransferRequests', async (req) => {
    const { part_ID, fromLocation_ID, toLocation_ID, quantity } = req.data;
    const requestId = req.data.ID || cds.utils.uuid();
    req.data.ID = requestId;
    req.data.requestedBy = req.data.requestedBy || 'admin';

    if (quantity <= 0) {
      return req.error(400, 'Quantity must be positive.');
    }
    if (fromLocation_ID === toLocation_ID) {
      return req.error(400, 'Source and target locations must be different.');
    }

    const part = await SELECT.one.from(SpareParts).where({ ID: part_ID });
    if (!part) {
      return req.error(404, 'Spare part does not exist.');
    }

    const fromLocation = await SELECT.one.from(Locations).where({ ID: fromLocation_ID });
    if (!fromLocation) {
      return req.error(404, 'Source location does not exist.');
    }

    const toLocation = await SELECT.one.from(Locations).where({ ID: toLocation_ID });
    if (!toLocation) {
      return req.error(404, 'Target location does not exist.');
    }

    const sourceStock = await getInventoryRow(part_ID, fromLocation_ID);
    if (sourceStock.quantityOnHand < quantity) {
      return req.error(409, 'Insufficient stock at source location.');
    }

    req.data.status = 'PENDING';

    await INSERT.into('mobis.db.StockTransferRequests').entries(req.data);

    console.log("ABOUT TO CALL BPA");

    const response = await executeHttpRequest(
      {
        destinationName: DESTINATION_NAME,
      },
      {
        method: 'POST',
        url: '/workflow/rest/v1/workflow-instances',
        data: {
          definitionId: WORKFLOW_DEFINITION_ID,
          context: {
            st_requestId: requestId,
            st_sparePart: part.partNumber + ' - ' + part.description,
            st_sourceLocation: fromLocation.name,
            st_destinationLocation: toLocation.name,
            st_quantity: req.data.quantity,
            st_requestedBy: req.data.requestedBy,
            st_requestStatus: req.data.status
          }
        },
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log("BPA RESPONSE", response.status);

    return req.data;
  });


  this.on('approveStockTransferRequest', async (req) => {
    const ID = req.params[0].ID;

    const transferRequest = await SELECT.one
      .from('mobis.db.StockTransferRequests')
      .where({ ID });

    if (!transferRequest) {
      return req.error(404, 'Stock transfer request not found.');
    }

    if (transferRequest.status !== 'PENDING') {
      return req.error(400, 'Only pending requests can be approved.');
    }

    const {
      part_ID,
      fromLocation_ID,
      toLocation_ID,
      quantity
    } = transferRequest;

    const sourceInventory = await SELECT.one
      .from('mobis.db.Inventory')
      .where({
        part_ID,
        location_ID: fromLocation_ID
      });

    if (!sourceInventory || sourceInventory.quantityOnHand < quantity) {
      return req.error(400, 'Insufficient stock at source location.');
    }

    await UPDATE('mobis.db.Inventory')
      .set({
        quantityOnHand: { '-=': quantity }
      })
      .where({
        part_ID,
        location_ID: fromLocation_ID
      });

    const destinationInventory = await SELECT.one
      .from('mobis.db.Inventory')
      .where({
        part_ID,
        location_ID: toLocation_ID
      });

    if (destinationInventory) {

      await UPDATE('mobis.db.Inventory')
        .set({
          quantityOnHand: { '+=': quantity }
        })
        .where({
          part_ID,
          location_ID: toLocation_ID
        });

    } else {

      await INSERT.into('mobis.db.Inventory').entries({
        part_ID,
        location_ID: toLocation_ID,
        quantityOnHand: quantity
      });
    }

    await INSERT.into('mobis.db.StockMovements').entries({
      part_ID,
      fromLocation_ID,
      toLocation_ID,
      quantity,
      movementType: 'TRANSFER'
    });

    await UPDATE('mobis.db.StockTransferRequests')
      .set({
        status: 'Approved'
      })
      .where({ ID });

    return 'Stock transfer approved successfully.';
  });


  this.on('rejectStockTransferRequest', 'StockTransferRequests', async (req) => {
    const requestID = req.params[0].ID;

    const request = await SELECT.one
      .from('mobis.db.StockTransferRequests')
      .where({ ID: requestID });

    if (!request) {
      return req.error(404, 'Stock transfer request not found.');
    }

    if (request.status !== 'PENDING') {
      return req.error(
        400,
        `Only PENDING requests can be rejected. Current status: ${request.status}`
      );
    }

    await UPDATE('mobis.db.StockTransferRequests')
      .set({
        status: 'Rejected'
      })
      .where({ ID: requestID });

    return 'Stock transfer request rejected successfully.';
  });


  this.on('generateDailyInventorySummary', async (req) => {
    const now = new Date();

    const startOfDay = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      )
    );

    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    const movements = await SELECT.from('mobis.db.StockMovements')
      .where({ status: 'POSTED' });

    const dailyMovements = movements.filter(m => {
      const movementDate = new Date(m.createdAt);

      return movementDate >= startOfDay &&
        movementDate < endOfDay &&
        (m.movementType === 'ISSUE' ||
          m.movementType === 'TRANSFER');
    });

    const summary = {
      date: startOfDay.toISOString().slice(0, 10),

      totalMovements: dailyMovements.length,

      issueCount: dailyMovements.filter(
        m => m.movementType === 'ISSUE'
      ).length,

      transferCount: dailyMovements.filter(
        m => m.movementType === 'TRANSFER'
      ).length,

      totalQuantityMoved: dailyMovements.reduce(
        (total, m) => total + (m.quantity || 0),
        0
      )
    };

    await INSERT.into(ApplicationLogs).entries({
      layer: 'InventoryService',
      operation: 'generateDailyInventorySummary',
      message: JSON.stringify(summary),
      severity: 'INFO'
    });

    return JSON.stringify(summary);
  });


  this.on('raisePurchaseRequisition', async (req) => {
    const { part_ID, location_ID } = req.params[0];

    const inventory = await SELECT.one
      .from(Inventory)
      .where({ part_ID, location_ID });

    if (!inventory) {
      return req.error(404, 'Inventory record not found');
    }

    let reorderLevel = inventory.reorderLevel;

    if (reorderLevel === null || reorderLevel === undefined) {
      const sparePart = await SELECT.one
        .from(SpareParts)
        .where({ ID: part_ID });

      if (!sparePart) {
        return req.error(404, 'Spare part not found');
      }

      reorderLevel = sparePart.reorderLevel ?? 0;
    }

    const suggestedQty = reorderLevel - inventory.quantityOnHand;
    const requiredQty = req.data.quantity ?? suggestedQty;

    if (!Number.isInteger(requiredQty) || requiredQty <= 0) {
      return req.error(400, 'Quantity must be a whole number greater than zero.');
    }

    // Auto-generate next PR number: highest valid PR-xxxx + 1
    const existing = await SELECT.from(PurchaseRequisitions).columns('prNumber');

    let max = 2999; 
    for (const row of existing) {
      const match = /^PR-(\d{1,6})$/.exec(String(row.prNumber));
      if (!match) continue;
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
    const prNumber = 'PR-' + (max + 1);

    await INSERT.into(PurchaseRequisitions).entries({
      prNumber: prNumber,
      location_ID: location_ID,
      status: 'DRAFT',
      requestedBy: req.user.id,
      items: [
        {
          part_ID: part_ID,
          requiredQty: requiredQty
        }
      ]
    });

    return `Purchase Requisition ${prNumber} created successfully`;
  });


  // ---------- RECONCILE AFTER REPAIR ----------
  this.on('reconcileServiceIssue', async (req) => {
    const { issueID, consumedQuantity, unusedReturnedQuantity, defectiveReturnedQuantity } = req.data;

    for (const n of [consumedQuantity, unusedReturnedQuantity, defectiveReturnedQuantity]) {
      if (!Number.isInteger(n) || n < 0)
        return req.error(400, 'Quantities must be whole numbers, zero or more.');
    }

    const issue = await SELECT.one
      .from('mobis.db.ServicePartIssues')
      .where({ ID: issueID });

    if (!issue) return req.error(404, 'Service issue not found.');
    if (issue.status !== 'ISSUED')
      return req.error(409, 'This issue is already reconciled.');

    const total = consumedQuantity + unusedReturnedQuantity + defectiveReturnedQuantity;
    if (total !== issue.issuedQuantity)
      return req.error(
        400,
        `Quantities must add up to the issued quantity. Issued: ${issue.issuedQuantity}, entered: ${total}.`
      );

    // Close the issue; the status guard makes sure it can only be reconciled once
    const closed = await UPDATE('mobis.db.ServicePartIssues')
      .set({
        consumedQuantity,
        unusedReturnedQuantity,
        defectiveReturnedQuantity,
        status: 'RECONCILED',
        reconciledDate: new Date().toISOString()
      })
      .where({ ID: issueID, status: 'ISSUED' });

    if (!closed) return req.error(409, 'This issue is already reconciled.');

    // Only unused parts go back into usable stock. Defective parts stay on the record only.
    if (unusedReturnedQuantity > 0) {
      const back = await UPDATE('mobis.db.Inventory')
        .set({ quantityOnHand: { '+=': unusedReturnedQuantity }, lastMovementAt: new Date().toISOString() })
        .where({ part_ID: issue.part_ID, location_ID: issue.warehouse_ID });

      if (!back) {
        await INSERT.into('mobis.db.Inventory').entries({
          part_ID: issue.part_ID,
          location_ID: issue.warehouse_ID,
          quantityOnHand: unusedReturnedQuantity,
          lastMovementAt: new Date().toISOString()
        });
      }
    }

    await INSERT.into(ApplicationLogs).entries({
      layer: 'InventoryService',
      operation: 'reconcileServiceIssue',
      message: `Issue ${issueID}: consumed ${consumedQuantity}, returned ${unusedReturnedQuantity}, defective ${defectiveReturnedQuantity}.`,
      severity: 'INFO'
    });

    return SELECT.one.from('mobis.db.ServicePartIssues').where({ ID: issueID });
  });

});