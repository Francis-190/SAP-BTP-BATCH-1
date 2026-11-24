const cds = require('@sap/cds')
const USERS = ['alice', 'bob', 'carol', 'dave', 'admin', 'vamsi']
const BASE = 'http://localhost:4004/odata/v4/'
const HOME = {
  alice: BASE + 's',
  vamsi: BASE + 's',
  bob: BASE + 'requisition/Mrequisition/RequisitionyTasks',
  carol: BASE + 'requisition/MyTasks',
  dave: BASE + 'requisition/ProcurementQueue',
  admin: BASE + 'admin/ApprovalMatrix',
}
const getUser = req => {
  const m = /(?:^|;\s*)devuser=([^;]+)/.exec(req.headers.cookie || '')
  const u = m && decodeURIComponent(m[1])
  return USERS.includes(u) ? u : 'alice'
}
cds.on('bootstrap', app => {
  if (process.env.NODE_ENV === 'production') return
  console.log('[dev-auth] server.js loaded')
  app.get('/dev-login/:user', (req, res) => {
    const u = req.params.user
    if (!USERS.includes(u)) return res.status(404).send('Unknown user')
    res.setHeader('Set-Cookie', `devuser=${u}; Path=/; Max-Age=31536000; SameSite=Lax`)
    console.log(`[dev-auth] switched to ${u}`)
    res.redirect('/.cap/table.html?url=' + encodeURIComponent(HOME[u]))
  })
  app.get('/dev-whoami', (req, res) => res.send(`Current user: ${getUser(req)}`))
  app.use((req, _res, next) => {
    if (!req.headers.authorization) {
      const u = getUser(req)
      req.headers.authorization = 'Basic ' + Buffer.from(`${u}:${u}`).toString('base64')
      if (req.url.startsWith('/odata')) console.log(`[dev-auth] ${u} -> ${req.method} ${req.url}`)
    }
    next()
  })
})