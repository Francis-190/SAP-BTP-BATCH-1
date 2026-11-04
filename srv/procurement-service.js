const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {
  const {
    PurchaseRequisitions,
    PurchaseRequisitionItems,
    PurchaseOrders,
    PurchaseOrderItems,
    GoodsReceipts,
    GoodsReceiptItems,
    Suppliers,
    AlertNotifications,
    SupplierParts
  } = this.entities;

  const { Inventory, StockMovements, ApplicationLogs } = cds.entities('mobis.db');
  async function getPRInStatus(req, prID, expected, verb) {
    const pr = await SELECT.one.from(PurchaseRequisitions).where({ ID: prID });
    if (!pr) return void req.error(404, `PR ${prID} not found.`);
    if (pr.status !== expected) {
      return void req.error(409, `PR must be ${expected} to ${verb}, currently ${pr.status}.`);
    }
    return pr;
  }
  async function nextGRNumber() {
    const rows = await SELECT.from(GoodsReceipts)
      .columns('grNumber')
      .where({ grNumber: { like: 'GR-%' } });

    let max = 5000;
    for (const { grNumber } of rows) {
      const m = /^GR-(\d{4})$/.exec(grNumber || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `GR-${max + 1}`;
  }

  async function generateNextPONumber() {
    const PREFIX = 'PO-';
    const START = 4000;
    const rows = await SELECT.from(PurchaseOrders)
      .columns('poNumber')
      .where({ poNumber: { like: PREFIX + '%' } });
    let max = START - 1;
    for (const { poNumber } of rows) {
      const n = parseInt(poNumber.slice(PREFIX.length), 10);
      if (!Number.isNaN(n) && n < 100000 && n > max) max = n;
    }
    return PREFIX + (max + 1);
  }
  this.on('submitPR', async (req) => {
    const { prID } = req.data;

    const pr = await getPRInStatus(req, prID, 'DRAFT', 'submit');
    if (!pr) return;

    const items = await SELECT.from(PurchaseRequisitionItems).where({ pr_ID: prID });
    if (!items.length) return req.error(400, 'PR must have at least one item.');

    for (const item of items) {
      if (!item.requiredQty || item.requiredQty <= 0) {
        return req.error(400, `Item ${item.ID} has an invalid required quantity.`);
      }
      if (item.supplier_ID) {
        const supplier = await SELECT.one.from(Suppliers).where({ ID: item.supplier_ID });
        if (!supplier?.isEligible) {
          return req.error(400, `Supplier for item ${item.ID} is not eligible for procurement.`);
        }
      }
    }

    await UPDATE(PurchaseRequisitions).set({ status: 'SUBMITTED' }).where({ ID: prID });
    return SELECT.one.from(PurchaseRequisitions).where({ ID: prID });
  });

  this.on('sendForApproval', async (req) => {
    const { prID } = req.data;

    const pr = await getPRInStatus(req, prID, 'SUBMITTED', 'send for approval');
    if (!pr) return;

    await UPDATE(PurchaseRequisitions).set({ status: 'PENDING_APPROVAL' }).where({ ID: prID });
    await INSERT.into(AlertNotifications).entries({
      alertType: 'PR_APPROVAL_PENDING',
      location_ID: pr.location_ID,
      message: `PR ${pr.prNumber || prID} is awaiting approval.`,
      severity: 'MEDIUM',
    });

    return SELECT.one.from(PurchaseRequisitions).where({ ID: prID });
  });

  this.on('approvePR', async (req) => {
    const { prID, approver } = req.data;

    const pr = await getPRInStatus(req, prID, 'PENDING_APPROVAL', 'approve');
    if (!pr) return;

    if (approver && pr.requestedBy && approver.trim().toLowerCase() === pr.requestedBy.trim().toLowerCase()) {
      return req.error(403, 'The requester cannot approve their own PR.');
    }

    await UPDATE(PurchaseRequisitions)
      .set({ status: 'APPROVED', approvedBy: approver, approvedAt: new Date().toISOString(), rejectionReason: null })
      .where({ ID: prID });

    return SELECT.one.from(PurchaseRequisitions).where({ ID: prID });
  });

  this.on('rejectPR', async (req) => {
    const { prID, approver, reason } = req.data;

    const pr = await getPRInStatus(req, prID, 'PENDING_APPROVAL', 'reject');
    if (!pr) return;

    if (!reason || !reason.trim()) return req.error(400, 'A rejection reason is required.');
    if (approver && pr.requestedBy && approver.trim().toLowerCase() === pr.requestedBy.trim().toLowerCase()) {
      return req.error(403, 'The requester cannot reject their own PR.');
    }

    await UPDATE(PurchaseRequisitions)
      .set({ status: 'REJECTED', approvedBy: approver, approvedAt: new Date().toISOString(), rejectionReason: reason })
      .where({ ID: prID });

    return SELECT.one.from(PurchaseRequisitions).where({ ID: prID });
  });

  this.on('resubmitPR', async (req) => {
    const { prID } = req.data;

    const pr = await getPRInStatus(req, prID, 'REJECTED', 'resubmit');
    if (!pr) return;

    await UPDATE(PurchaseRequisitions)
      .set({ status: 'DRAFT', approvedBy: null, approvedAt: null, rejectionReason: null })
      .where({ ID: prID });

    return SELECT.one.from(PurchaseRequisitions).where({ ID: prID });
  });

  this.on('closePR', async (req) => {
    const { prID } = req.data;

    const pr = await getPRInStatus(req, prID, 'APPROVED', 'close');
    if (!pr) return;

    const pos = await SELECT.from(PurchaseOrders).columns('ID').where({ pr_ID: prID });
    if (!pos.length) return req.error(409, 'Create the Purchase Order before closing the PR.');

    await UPDATE(PurchaseRequisitions).set({ status: 'CLOSED' }).where({ ID: prID });
    return SELECT.one.from(PurchaseRequisitions).where({ ID: prID });
  });

  this.on('runApprovalJob', async () => {
    const waiting = await SELECT.from(PurchaseRequisitions)
      .columns('ID', 'prNumber', 'location_ID')
      .where({ status: 'SUBMITTED' });

    let processed = 0;
    let failed = 0;

    for (const pr of waiting) {
      try {
        await cds.tx(async () => {
          const moved = await UPDATE(PurchaseRequisitions)
            .set({ status: 'PENDING_APPROVAL' })
            .where({ ID: pr.ID, status: 'SUBMITTED' });
          if (!moved) return;

          await INSERT.into(AlertNotifications).entries({
            alertType: 'PR_APPROVAL_PENDING',
            location_ID: pr.location_ID,
            message: `PR ${pr.prNumber || pr.ID} is awaiting approval.`,
            severity: 'MEDIUM',
          });
          processed++;
        });
      } catch (err) {
        failed++;
        await INSERT.into(ApplicationLogs).entries({
          layer: 'ProcurementService',
          operation: 'runApprovalJob',
          message: `PR ${pr.prNumber || pr.ID}: ${err.message}`,
          severity: 'ERROR',
        });
      }
    }

    await INSERT.into(ApplicationLogs).entries({
      layer: 'ProcurementService',
      operation: 'runApprovalJob',
      message: `Approval job finished: ${processed} moved to PENDING_APPROVAL, ${failed} failed.`,
      severity: failed ? 'WARNING' : 'INFO',
    });

    return { processed, failed };
  });

  this.on('createPOFromPR', async (req) => {
    const { prID } = req.data;

    const pr = await getPRInStatus(req, prID, 'APPROVED', 'convert to PO');
    if (!pr) return;

    const existing = await SELECT.from(PurchaseOrders).columns('ID').where({ pr_ID: prID });
    if (existing.length) return req.error(409, 'Purchase Order(s) already exist for this PR.');

    const items = await SELECT.from(PurchaseRequisitionItems).where({ pr_ID: prID });
    if (!items.length) return req.error(400, 'PR has no items to convert.');

    const itemsBySupplier = items.reduce((acc, item) => {
      const key = item.supplier_ID || 'UNASSIGNED';
      (acc[key] ||= []).push(item);
      return acc;
    }, {});

    if (itemsBySupplier.UNASSIGNED) {
      return req.error(400, 'All PR items must have a supplier assigned before PO creation.');
    }

    const createdPOs = [];
    for (const [supplierID, supplierItems] of Object.entries(itemsBySupplier)) {
      const supplier = await SELECT.one.from(Suppliers).where({ ID: supplierID });
      if (!supplier?.isEligible) {
        return req.error(400, `Supplier ${supplierID} is not eligible for procurement.`);
      }
            for (const item of supplierItems) {
        const source = await SELECT.one.from(SupplierParts)
          .where({ supplier_ID: supplierID, part_ID: item.part_ID, isActive: true });
        if (!source) {
          return req.error(400, `Supplier ${supplier.name} does not supply part ${item.part_ID}.`);
        }
      }

      const poNumber = await generateNextPONumber();
      await INSERT.into(PurchaseOrders).entries({
        poNumber,
        supplier_ID: supplierID,
        pr_ID: prID,
        status: 'CREATED',
      });
      const { ID: poID } = await SELECT.one.from(PurchaseOrders).where({ poNumber });

      for (const item of supplierItems) {
        await INSERT.into(PurchaseOrderItems).entries({
          po_ID: poID,
          part_ID: item.part_ID,
          orderedQty: item.requiredQty,
          unitPrice: item.estimatedPrice ?? 0,
        });
      }
      createdPOs.push(await SELECT.one.from(PurchaseOrders).where({ ID: poID }));
    }

    return createdPOs;
  });
  this.on('sendPOToSupplier', async (req) => {
    const { poID } = req.data;
    const po = await SELECT.one.from(PurchaseOrders).where({ ID: poID });
    if (!po) return req.error(404, `PO ${poID} not found.`);
    if (po.status !== 'CREATED') return req.error(409, `PO must be CREATED, currently ${po.status}.`);
    await UPDATE(PurchaseOrders).set({ status: 'SENT_TO_SUPPLIER' }).where({ ID: poID });
    return SELECT.one.from(PurchaseOrders).where({ ID: poID });
  });

  this.on('supplierConfirmPO', async (req) => {
    const { poID } = req.data;
    const po = await SELECT.one.from(PurchaseOrders).where({ ID: poID });
    if (!po) return req.error(404, `PO ${poID} not found.`);
    if (po.status !== 'SENT_TO_SUPPLIER') {
      return req.error(409, `PO must be SENT_TO_SUPPLIER, currently ${po.status}.`);
    }
    await UPDATE(PurchaseOrders).set({ status: 'CONFIRMED' }).where({ ID: poID });
    return SELECT.one.from(PurchaseOrders).where({ ID: poID });
  });

  this.on('supplierRejectPO', async (req) => {
    const { poID, reason } = req.data;
    if (!reason || !reason.trim()) return req.error(400, 'A reason is required.');
    const po = await SELECT.one.from(PurchaseOrders).where({ ID: poID });
    if (!po) return req.error(404, `PO ${poID} not found.`);
    if (po.status !== 'SENT_TO_SUPPLIER') {
      return req.error(409, `PO must be SENT_TO_SUPPLIER, currently ${po.status}.`);
    }
    await UPDATE(PurchaseOrders).set({ status: 'REJECTED_BY_SUPPLIER' }).where({ ID: poID });
    return SELECT.one.from(PurchaseOrders).where({ ID: poID });
  });

  this.on('postGoodsReceipt', async (req) => {
    const { poID, locationID, receivedBy, items } = req.data;

    const po = await SELECT.one.from(PurchaseOrders).where({ ID: poID });
    if (!po) return req.error(404, `PO ${poID} not found.`);
    if (!['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
      return req.error(409, `PO is in status ${po.status} and cannot receive goods.`);
    }
    if (!items?.length) return req.error(400, 'At least one receipt line is required.');

    const grNumber = await nextGRNumber();
    await INSERT.into(GoodsReceipts).entries({
      grNumber,
      po_ID: poID,
      location_ID: locationID,
      receivedBy,
    });
    const { ID: grID } = await SELECT.one.from(GoodsReceipts).where({ grNumber });

    let allItemsFullyReceived = true;

    for (const line of items) {
      const poItem = await SELECT.one.from(PurchaseOrderItems).where({ ID: line.poItemID });
      if (!poItem || poItem.po_ID !== poID) {
        return req.error(400, `PO item ${line.poItemID} does not belong to PO ${poID}.`);
      }
      if (!(line.receivedQty > 0)) {
        return req.error(400, `Received quantity for item ${line.poItemID} must be positive.`);
      }

      const newReceivedQty = (poItem.receivedQty || 0) + line.receivedQty;
      if (newReceivedQty > poItem.orderedQty) {
        return req.error(
          400,
          `Received quantity (${newReceivedQty}) exceeds ordered quantity (${poItem.orderedQty}) for item ${line.poItemID}.`
        );
      }

      await INSERT.into(GoodsReceiptItems).entries({
        gr_ID: grID,
        poItem_ID: line.poItemID,
        receivedQty: line.receivedQty,
      });
      await UPDATE(PurchaseOrderItems).set({ receivedQty: newReceivedQty }).where({ ID: line.poItemID });

      const existingInv = await SELECT.one.from(Inventory).where({
        part_ID: poItem.part_ID,
        location_ID: locationID,
      });
      if (existingInv) {
        await UPDATE(Inventory)
          .set({
            quantityOnHand: existingInv.quantityOnHand + line.receivedQty,
            lastMovementAt: new Date().toISOString(),
          })
          .where({ part_ID: poItem.part_ID, location_ID: locationID });
      } else {
        await INSERT.into(Inventory).entries({
          part_ID: poItem.part_ID,
          location_ID: locationID,
          quantityOnHand: line.receivedQty,
          lastMovementAt: new Date().toISOString(),
        });
      }
      await INSERT.into(StockMovements).entries({
        movementType: 'RECEIPT',
        part_ID: poItem.part_ID,
        toLocation_ID: locationID,
        quantity: line.receivedQty,
        reference: po.poNumber,
        status: 'POSTED',
      });
      if (newReceivedQty < poItem.orderedQty) allItemsFullyReceived = false;
    }
    await UPDATE(PurchaseOrders)
      .set({ status: allItemsFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' })
      .where({ ID: poID });

    return SELECT.one.from(GoodsReceipts).where({ ID: grID });
  });

  this.on('resolveAlert', async (req) => {
    const { alertID } = req.data;
    await UPDATE(AlertNotifications).set({ isResolved: true }).where({ ID: alertID });
    return SELECT.one.from(AlertNotifications).where({ ID: alertID });
  });

  this.after('error', '*', (err, req) => {
    cds.spawn({ user: cds.User.privileged }, async () => {
      try {
        await INSERT.into(ApplicationLogs).entries({
          layer: 'ProcurementService',
          operation: req && req.event,
          message: err.message,
          severity: 'ERROR',
        });
      } catch (e) {
        console.error('Could not write error log:', e.message);
      }
    });
  });


  this.on('confirmPO', async (req) => {
    const { poID } = req.data;
    const po = await SELECT.one.from(PurchaseOrders).where({ ID: poID });
    if (!po) return req.error(404, 'Purchase order not found');
    if (po.status !== 'SENT_TO_SUPPLIER') return req.error(400, `PO is ${po.status}, it cannot be confirmed`);
    await UPDATE(PurchaseOrders).set({ status: 'CONFIRMED' }).where({ ID: poID });
    return SELECT.one.from(PurchaseOrders).where({ ID: poID });
  });

  this.on('rejectPO', async (req) => {
    const { poID, reason } = req.data;
    const po = await SELECT.one.from(PurchaseOrders).where({ ID: poID });
    if (!po) return req.error(404, 'Purchase order not found');
    if (po.status !== 'SENT_TO_SUPPLIER') return req.error(400, `PO is ${po.status}, it cannot be rejected`);
    if (!reason) return req.error(400, 'A rejection reason is required');
    await UPDATE(PurchaseOrders).set({ status: 'REJECTED_BY_SUPPLIER' }).where({ ID: poID });
    return SELECT.one.from(PurchaseOrders).where({ ID: poID });
  });


  // AI chat assistant
  require('./lib/chat')(this);
});