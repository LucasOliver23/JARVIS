#!/usr/bin/env node
// Jarvis · Antena — proxy local (ICS/RSS) + leitor IMAP somente-leitura. Node puro, zero dependências.
'use strict';
const http = require('http');
const https = require('https');
const tls = require('tls');

const PORT = 4242;
const HOST = '127.0.0.1';
const PROXY_HOSTS = new Set(['calendar.google.com', 'news.google.com']);
const IMAP_HOSTS = new Set(['imap.gmail.com', 'outlook.office365.com', 'imap.mail.yahoo.com']);
const MAX_PROXY = 5 * 1024 * 1024;
const MAX_BODY = 16 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Max-Age': '600',
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { ...CORS, 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

/* ---------------- /proxy ---------------- */
function fetchAllowed(url, hops = 0) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { return reject(new Error('URL inválida')); }
    if (u.protocol !== 'https:' || !PROXY_HOSTS.has(u.hostname)) return reject(new Error('Host não permitido: ' + u.hostname));
    const req = https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 Jarvis-Antena', Accept: '*/*' }, timeout: 15000 }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        if (hops >= 3) return reject(new Error('Redirecionamentos demais'));
        return resolve(fetchAllowed(new URL(r.headers.location, u).href, hops + 1));
      }
      const chunks = []; let size = 0;
      r.on('data', (c) => { size += c.length; if (size > MAX_PROXY) { req.destroy(new Error('Resposta grande demais')); } else chunks.push(c); });
      r.on('end', () => resolve({ status: r.statusCode, type: r.headers['content-type'] || 'text/plain', body: Buffer.concat(chunks) }));
      r.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
  });
}

/* ---------------- MIME helpers ---------------- */
function decodeBytes(buf, charset) {
  try { return new TextDecoder((charset || 'utf-8').toLowerCase()).decode(buf); }
  catch { return buf.toString('utf8'); }
}
function qpBytes(s, header) {
  if (header) s = s.replace(/_/g, ' ');
  s = s.replace(/=\r?\n/g, '');
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else out.push(s.charCodeAt(i) & 0xff);
  }
  return Buffer.from(out);
}
// RFC 2047: =?charset?B|Q?texto?=
function decodeWords(s) {
  return String(s || '')
    .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, '$1')
    .replace(/=\?([^?*]+)(?:\*[^?]*)?\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, txt) =>
      decodeBytes(enc.toUpperCase() === 'B' ? Buffer.from(txt, 'base64') : qpBytes(txt, true), cs));
}
function parseHeaders(raw) {
  const h = {};
  raw.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach((l) => {
    const i = l.indexOf(':');
    if (i > 0) h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
  });
  return h;
}
function param(v, name) {
  const m = new RegExp(name + '\\s*=\\s*"?([^";]+)"?', 'i').exec(v || '');
  return m ? m[1] : '';
}
function decodeBody(buf, cte, charset) {
  cte = (cte || '').toLowerCase();
  if (cte.includes('base64')) buf = Buffer.from(buf.toString('latin1').replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
  else if (cte.includes('quoted-printable')) buf = qpBytes(buf.toString('latin1'), false);
  return decodeBytes(buf, charset);
}
const clean = (s) => s.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;|&\w+;/g, ' ')
  .replace(/\s+/g, ' ').trim();

// Extrai um trecho legível do início do corpo (melhor esforço, prefere text/plain)
function snippet(buf, ctype, cte) {
  const boundary = param(ctype, 'boundary');
  if (!boundary) return clean(decodeBody(buf, cte, param(ctype, 'charset'))).slice(0, 400);
  const parts = buf.toString('latin1').split('--' + boundary).slice(1);
  let best = null;
  for (const p of parts) {
    const sep = p.search(/\r?\n\r?\n/);
    if (sep < 0) continue;
    const ph = parseHeaders(p.slice(0, sep));
    const ct = ph['content-type'] || 'text/plain';
    const body = Buffer.from(p.slice(sep).replace(/^\r?\n\r?\n/, ''), 'latin1');
    if (/multipart\//i.test(ct)) { const s = snippet(body, ct, ''); if (s) return s; continue; }
    if (/text\/plain/i.test(ct)) return clean(decodeBody(body, ph['content-transfer-encoding'], param(ct, 'charset'))).slice(0, 400);
    if (/text\/html/i.test(ct) && !best) best = clean(decodeBody(body, ph['content-transfer-encoding'], param(ct, 'charset'))).slice(0, 400);
  }
  return best || '';
}
function parseFrom(v) {
  v = decodeWords(v);
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(v);
  return m ? { name: m[1].trim() || m[2], addr: m[2].trim() } : { name: v.trim(), addr: v.trim() };
}

/* ---------------- IMAP minimalista (somente leitura) ---------------- */
function imapSession(host, user, pass) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port: 993, servername: host, timeout: 20000 });
    let buf = Buffer.alloc(0), waiter = null, n = 0, greeted = false, dead = null;
    const fail = (e) => { dead = e; if (waiter) { const w = waiter; waiter = null; w.reject(e); } else reject(e); };
    sock.on('timeout', () => { fail(new Error('IMAP timeout')); sock.destroy(); });
    sock.on('error', fail);
    sock.on('close', () => fail(new Error('IMAP desconectado')));

    // Resposta completa = linha com a tag, respeitando literais {n}
    function scan(tag) {
      let pos = 0;
      for (;;) {
        const e = buf.indexOf('\r\n', pos);
        if (e < 0) return -1;
        const line = buf.toString('latin1', pos, e);
        const lit = /\{(\d+)\}$/.exec(line);
        if (lit) { pos = e + 2 + Number(lit[1]); if (pos > buf.length) return -1; continue; }
        if (tag ? line.startsWith(tag + ' ') : line.startsWith('* ')) return e + 2;
        pos = e + 2;
      }
    }
    function pump() {
      if (!greeted) { const end = scan(null); if (end < 0) return; greeted = true; buf = buf.slice(end); return resolve(api); }
      if (!waiter) return;
      const end = scan(waiter.tag);
      if (end < 0) return;
      const data = buf.slice(0, end); buf = buf.slice(end);
      const w = waiter; waiter = null;
      const nl = data.lastIndexOf('\r\n', data.length - 3);
      const last = data.toString('latin1', nl < 0 ? 0 : nl + 2).trim();
      if (!last.startsWith(w.tag + ' OK')) w.reject(new Error(last.replace(w.tag, '').trim() || 'IMAP erro'));
      else w.resolve(data);
    }
    sock.on('data', (c) => { buf = Buffer.concat([buf, c]); pump(); });

    const api = {
      cmd(line) {
        if (dead) return Promise.reject(dead);
        return new Promise((res, rej) => { const tag = 'J' + (++n); waiter = { tag, resolve: res, reject: rej }; sock.write(tag + ' ' + line + '\r\n'); pump(); });
      },
      close() { try { sock.write('Z LOGOUT\r\n'); } catch {} setTimeout(() => sock.destroy(), 300); },
    };
  });
}
const q = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseFetch(buf) {
  const out = []; let pos = 0, cur = null;
  for (;;) {
    const e = buf.indexOf('\r\n', pos);
    if (e < 0) break;
    const line = buf.toString('latin1', pos, e); pos = e + 2;
    if (/^\* \d+ FETCH /.test(line)) { cur = { text: '', head: null, body: null }; out.push(cur); }
    else if (/^J\d+ /.test(line)) cur = null;
    if (!cur) continue;
    cur.text += line + ' ';
    const lit = /\{(\d+)\}$/.exec(line);
    if (lit) {
      const data = buf.slice(pos, pos + Number(lit[1])); pos += Number(lit[1]);
      if (/HEADER\.FIELDS[^\]]*\]\s*\{\d+\}$/i.test(line)) cur.head = data; else if (/\[TEXT\](<\d+>)?\s*\{\d+\}$/i.test(line)) cur.body = data;
    }
  }
  return out;
}

async function readInbox({ host = 'imap.gmail.com', user, pass, limit = 20, days = 3 }) {
  if (!IMAP_HOSTS.has(host)) throw Object.assign(new Error('Servidor IMAP não permitido: ' + host), { code: 400 });
  if (!user || !pass) throw Object.assign(new Error('Usuário e senha de app são obrigatórios'), { code: 400 });
  limit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const s = await imapSession(host, user, pass);
  try {
    await s.cmd('LOGIN ' + q(user) + ' ' + q(String(pass).replace(/\s+/g, ''))).catch((e) => { throw Object.assign(new Error('Login recusado: ' + e.message), { code: 401 }); });
    const ex = (await s.cmd('EXAMINE "INBOX"')).toString('latin1'); // EXAMINE = caixa em modo somente-leitura
    const validity = (/UIDVALIDITY (\d+)/.exec(ex) || [])[1] || '0';
    const d = new Date(Date.now() - Math.min(Number(days) || 3, 30) * 864e5);
    const sr = (await s.cmd('UID SEARCH SINCE ' + d.getDate() + '-' + MON[d.getMonth()] + '-' + d.getFullYear())).toString('latin1');
    const uids = ((/^\* SEARCH([\d ]*)$/m.exec(sr) || [])[1] || '').trim().split(/\s+/).filter(Boolean).map(Number).sort((a, b) => b - a).slice(0, limit);
    if (!uids.length) return { account: user, messages: [] };
    // BODY.PEEK: lê sem marcar como lido (\Seen não é alterado)
    const raw = await s.cmd('UID FETCH ' + uids.join(',') +
      ' (UID FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID CONTENT-TYPE CONTENT-TRANSFER-ENCODING)] BODY.PEEK[TEXT]<0.6000>)');
    const messages = parseFetch(raw).map((m) => {
      const uid = (/UID (\d+)/.exec(m.text) || [])[1];
      const h = parseHeaders(m.head ? m.head.toString('utf8') : '');
      const from = parseFrom(h.from || '');
      return {
        id: user + ':' + validity + ':' + uid,
        uid: Number(uid),
        from: from.name, fromAddr: from.addr,
        subject: decodeWords(h.subject || '(sem assunto)'),
        date: h.date ? new Date(h.date).toISOString() : null,
        seen: /\\Seen/.test(m.text),
        snippet: m.body ? snippet(m.body, h['content-type'] || 'text/plain', h['content-transfer-encoding']) : '',
      };
    }).filter((m) => m.uid).sort((a, b) => b.uid - a.uid);
    return { account: user, messages };
  } finally { s.close(); }
}

/* ---------------- servidor ---------------- */
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://' + HOST);
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  if (req.method === 'GET' && u.pathname === '/health') return send(res, 200, { ok: true, v: '1.0' });

  if (req.method === 'GET' && u.pathname === '/proxy') {
    return fetchAllowed(u.searchParams.get('url') || '')
      .then((r) => send(res, r.status, r.body, r.type))
      .catch((e) => send(res, 400, { error: e.message }));
  }

  if (req.method === 'POST' && u.pathname === '/emails') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > MAX_BODY) req.destroy(); });
    req.on('end', async () => {
      let p;
      try { p = JSON.parse(body || '{}'); } catch { return send(res, 400, { error: 'JSON inválido' }); }
      try { send(res, 200, await readInbox(p)); }
      catch (e) { send(res, e.code || 502, { error: e.message }); }
    });
    return;
  }
  send(res, 404, { error: 'Rota não encontrada' });
}).listen(PORT, HOST, () => console.log(`Jarvis · Antena online em http://${HOST}:${PORT}  (Ctrl+C para sair)`));
