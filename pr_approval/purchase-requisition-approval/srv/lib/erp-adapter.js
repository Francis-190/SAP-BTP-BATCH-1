'use strict'
const cds = require('@sap/cds')
const LOG = cds.log('erp-adapter')
async function resolveTarget() {
  if (process.env.VCAP_SERVICES || process.env.NODE_ENV === 'production') {
    const { getDestination } = require('@sap-cloud-sdk/connectivity')
    const name = process.env.ERP_DESTINATION || 'ERP_API'
    const dest = await getDestination({ destinationName: name })
    if (!dest?.url) throw new Error(`Destination ${name} not found`)
    const headers = {}
    for (const t of dest.authTokens || [])
      if (t.http_header) headers[t.http_header.key] = t.http_header.value
    return { baseUrl: dest.url, headers }
  }
  return { baseUrl: process.env.ERP_URL || 'http://localhost:4010', headers: {} }
}
async function createPurchaseOrder(payload, idempotencyKey) {
  const { baseUrl, headers } = await resolveTarget()
  LOG.info(`POST ${baseUrl}/purchase-orders (key ${idempotencyKey})`)
  let res
  try {
    res = await fetch(`${baseUrl}/purchase-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey, ...headers },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    })
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? 'ERP endpoint timeout' : `ERP unreachable: ${e.message}`)
  }
  if (!res.ok) throw new Error(`ERP responded with HTTP ${res.status}`)
  const body = await res.json()
  if (!body.poNumber) throw new Error('ERP response contained no PO number')
  return String(body.poNumber)
}
module.exports = { createPurchaseOrder }