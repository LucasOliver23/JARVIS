// Utilidades comuns às funções serverless (Vercel). Mesma lógica do server.js local.
const A = require('../server.js');

function cors(res) { for (const [k, v] of Object.entries(A.CORS)) res.setHeader(k, v); res.setHeader('Cache-Control', 'no-store'); }

// Envolve um handler: CORS, preflight, JSON e erros com status numérico
function route(method, fn) {
  return async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== method) return res.status(405).json({ error: 'Método não permitido' });
    try {
      const out = await fn(req, res);
      if (out !== undefined) res.status(200).json(out);
    } catch (e) {
      res.status(Number.isInteger(e.code) ? e.code : 502).json({ error: e.message });
    }
  };
}
const body = (req) => (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});
module.exports = { A, route, body };
