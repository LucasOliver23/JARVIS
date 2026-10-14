const { A, route } = require('./_util');
module.exports = route('GET', async (req, res) => {
  const r = await A.fetchAllowed(String(req.query.url || '')).catch((e) => { throw Object.assign(e, { code: 400 }); });
  res.status(r.status).setHeader('Content-Type', r.type);
  res.send(r.body);
});
