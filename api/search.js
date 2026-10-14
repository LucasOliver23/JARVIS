const { A, route, body } = require('./_util');
module.exports = route('POST', (req) => {
  const { query, api_key, max_results } = body(req);
  const q = String(query || '').trim().slice(0, 400);
  if (!q) throw Object.assign(new Error('query vazia'), { code: 400 });
  if (!api_key) throw Object.assign(new Error('Chave Tavily ausente'), { code: 400 });
  return A.tavily(q, String(api_key).trim(), Math.min(Math.max(Number(max_results) || 5, 1), 8));
});
