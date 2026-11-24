const http = require('http')

let failMode = false
let counter = 4500010000
const byKey = new Map()      
const orders = []           
const requestLog = []        
const send = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body, null, 2))
}
const sendHtml = (res, html) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const addLog = entry => {
  requestLog.unshift({ time: new Date().toISOString(), ...entry })
  if (requestLog.length > 50) requestLog.pop()
}
const money = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
function dashboard() {
  const orderRows = orders.map(o => `
    <tr>
      <td><b>${esc(o.poNumber)}</b></td>
      <td>${esc(o.requisitionNumber)}</td>
      <td>${esc(o.requester)}</td>
      <td>${esc(o.costCentre)}</td>
      <td style="text-align:right">${money(o.totalAmount)} ${esc(o.currency)}</td>
      <td style="text-align:center">${esc(o.itemCount)}</td>
      <td><code>${esc(o.idempotencyKey)}</code></td>
      <td style="text-align:center">${esc(o.duplicateHits)}</td>
      <td>${esc(o.createdAt)}</td>
    </tr>`).join('') || '<tr><td colspan="9">No purchase orders yet</td></tr>'

  const logRows = requestLog.map(l => `
    <tr>
      <td>${esc(l.time)}</td>
      <td>${esc(l.result)}</td>
      <td>${esc(l.requisitionNumber)}</td>
      <td><code>${esc(l.key)}</code></td>
      <td>${esc(l.poNumber)}</td>
    </tr>`).join('') || '<tr><td colspan="5">No requests yet</td></tr>'

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Mock ERP</title>
<meta http-equiv="refresh" content="10">
<style>
  body { font-family: Arial, sans-serif; margin: 24px; color: #222; }
  h1 { margin-bottom: 4px; } h2 { margin-top: 28px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #eef2f7; }
  .on { color: #b00020; font-weight: bold; } .off { color: #1b7f3b; font-weight: bold; }
  a.btn { display: inline-block; padding: 6px 12px; border: 1px solid #888; border-radius: 4px;
          text-decoration: none; color: #222; margin-right: 8px; }
  code { font-size: 12px; }
</style></head><body>
<h1>Mock ERP</h1>
<div>Purchase orders created: <b>${orders.length}</b> &nbsp;|&nbsp;
  Fail mode: <span class="${failMode ? 'on' : 'off'}">${failMode ? 'ON (requests fail with 503)' : 'OFF'}</span></div>
<p>
  <a class="btn" href="/ui/fail/on">Turn fail mode ON</a>
  <a class="btn" href="/ui/fail/off">Turn fail mode OFF</a>
  <a class="btn" href="/purchase-orders">JSON list</a>
  <a class="btn" href="/">Refresh</a>
</p>
<h2>Purchase orders</h2>
<table>
  <tr><th>PO number</th><th>Requisition</th><th>Requester</th><th>Cost centre</th>
      <th>Total</th><th>Items</th><th>Idempotency key</th><th>Duplicate hits</th><th>Created at</th></tr>
  ${orderRows}
</table>
<h2>Request log (latest first)</h2>
<table>
  <tr><th>Time</th><th>Result</th><th>Requisition</th><th>Idempotency key</th><th>PO number</th></tr>
  ${logRows}
</table>
<p style="color:#666;font-size:12px">Data is kept in memory. It is cleared when the app restarts or is pushed again. This page refreshes every 10 seconds.</p>
</body></html>`
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0]
  if (req.method === 'GET' && url === '/') return sendHtml(res, dashboard())
  if (req.method === 'GET' && url === '/ui/fail/on')  { failMode = true;  res.writeHead(302, { Location: '/' }); return res.end() }
  if (req.method === 'GET' && url === '/ui/fail/off') { failMode = false; res.writeHead(302, { Location: '/' }); return res.end() }
  if (req.method === 'GET' && url === '/mock/fail/on')  { failMode = true;  return send(res, 200, { failMode }) }
  if (req.method === 'GET' && url === '/mock/fail/off') { failMode = false; return send(res, 200, { failMode }) }
  if (req.method === 'GET' && url === '/purchase-orders') {
    return send(res, 200, { count: orders.length, failMode, orders })
  }
  if (req.method === 'GET' && url.startsWith('/purchase-orders/')) {
    const po = decodeURIComponent(url.slice('/purchase-orders/'.length))
    const order = orders.find(o => o.poNumber === po)
    return order ? send(res, 200, order) : send(res, 404, { error: 'PO not found' })
  }
  if (req.method === 'POST' && url === '/purchase-orders') {
    let raw = ''
    req.on('data', c => (raw += c))
    req.on('end', () => {
      const key = req.headers['idempotency-key']
      let payload = {}
      try { payload = JSON.parse(raw || '{}') } catch (e) { payload = {} }
      if (!key) {
        addLog({ result: '400 key missing', requisitionNumber: payload.requisitionNumber, key: '' })
        return send(res, 400, { error: 'Idempotency-Key header is required' })
      }
      if (byKey.has(key)) {                                   
        const existing = byKey.get(key)
        existing.duplicateHits += 1
        console.log(`[mock-erp] duplicate key ${key}, returning PO ${existing.poNumber}`)
        addLog({ result: '200 duplicate, same PO', requisitionNumber: payload.requisitionNumber, key, poNumber: existing.poNumber })
        return send(res, 200, { poNumber: existing.poNumber, duplicate: true })
      }
      if (failMode) {
        addLog({ result: '503 failed', requisitionNumber: payload.requisitionNumber, key })
        return send(res, 503, { error: 'ERP temporarily unavailable' })
      }
      const poNumber = String(++counter)
      const order = {
        poNumber,
        idempotencyKey: key,
        requisitionNumber: payload.requisitionNumber,
        requester: payload.requester,
        title: payload.title,
        costCentre: payload.costCentre,
        category: payload.category,
        currency: payload.currency,
        totalAmount: payload.totalAmount,
        itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
        items: payload.items || [],
        duplicateHits: 0,
        createdAt: new Date().toISOString()
      }
      orders.unshift(order)
      byKey.set(key, order)
      console.log(`[mock-erp] created PO ${poNumber} for ${payload.requisitionNumber}`)
      addLog({ result: '201 created', requisitionNumber: payload.requisitionNumber, key, poNumber })
      return send(res, 201, { poNumber })
    })
    return
  }

  send(res, 404, { error: 'Not found' })
}).listen(process.env.PORT || 4010, () => console.log('[mock-erp] listening'))