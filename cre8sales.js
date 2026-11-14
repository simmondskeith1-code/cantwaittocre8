// Can't Wait to Cre8 sales team: training playbook for website sales reps, plus everything they send back.
//   GET  /cre8-sales                          the playbook (views/cre8-sales.html). If CRE8_SALES_CODE is set, reps
//                                             enter that team code once; a cookie keeps them in for 60 days.
//   GET  /api/cre8/sales/config               { foundingLeft } so reps always quote the right price
//   POST /api/cre8/sales/entry                { kind, rep_name, rep_email, ...fields } kind is one of:
//                                             drill (objection practice score), quiz (certification), checklist
//                                             (onboarding progress), lead (visit log / lead claim), feedback
// Admin (x-admin-key):
//   GET    /api/admin/cre8/sales              entries (newest 1000) + settings
//   POST   /api/admin/cre8/sales/config       { foundingLeft }
//   DELETE /api/admin/cre8/sales/:id
// Env: CRE8_SALES_CODE (team access code; leave unset and the page is open to anyone with the link, never indexed).
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const KINDS = ['drill', 'quiz', 'checklist', 'lead', 'feedback'];
const line = (s, n) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const text = (s, n) => String(s == null ? '' : s).replace(/\r\n/g, '\n').trim().slice(0, n);
const int = (v, max) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null; };
const cleanEmail = (e) => { const s = String(e || '').trim().toLowerCase().slice(0, 200); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''; };
const CODE = () => String(process.env.CRE8_SALES_CODE || '').trim();
const cookieVal = () => crypto.createHash('sha256').update('cre8sales:' + CODE()).digest('hex').slice(0, 32);
// True when the request carries the team cookie (or no team code is set). Shared with cre8sitegen.js.
function teamAllowed(req) {
  if (!CODE()) return true;
  const c = String(req.get('cookie') || '').match(/(?:^|;\s*)cre8s=([a-f0-9]{32})/);
  return !!c && c[1] === cookieVal();
}

const hits = new Map();
function limited(key, max) {
  const now = Date.now(), h = (hits.get(key) || []).filter((t) => now - t < 3600000);
  h.push(now); hits.set(key, h);
  if (hits.size > 5000) hits.clear();
  return h.length > max;
}

let ready = null;
function ensure(pool) {
  if (!ready) {
    ready = pool.query(`
      CREATE TABLE IF NOT EXISTS cre8_sales_entries (
        id SERIAL PRIMARY KEY,
        kind TEXT NOT NULL,
        rep_name TEXT NOT NULL,
        rep_email TEXT NOT NULL DEFAULT '',
        score INTEGER,
        total INTEGER,
        data JSONB NOT NULL DEFAULT '{}',
        created TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS cre8_sales_kind ON cre8_sales_entries(kind);
      CREATE TABLE IF NOT EXISTS cre8_sales_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

async function foundingLeft(pool) {
  try { await ensure(pool); const r = await pool.query("SELECT value FROM cre8_sales_settings WHERE key = 'founding_left'"); return r.rows[0] ? parseInt(r.rows[0].value, 10) : 5; }
  catch (e) { return null; }
}

// Only the fields each kind needs, trimmed, so nothing unexpected is stored
function cleanData(kind, b) {
  if (kind === 'drill') {
    return { answers: (Array.isArray(b.answers) ? b.answers : []).slice(0, 20).map((a) => ({ id: line(a && a.id, 30), pick: line(a && a.pick, 4), best: !!(a && a.best) })) };
  }
  if (kind === 'quiz') {
    return { missed: (Array.isArray(b.missed) ? b.missed : []).slice(0, 20).map((m) => line(m, 120)) };
  }
  if (kind === 'checklist') {
    return { done: (Array.isArray(b.done) ? b.done : []).slice(0, 40).map((d) => line(d, 40)) };
  }
  if (kind === 'lead') {
    return { business: line(b.business, 120), address: line(b.address, 160), contact: line(b.contact, 120), phone: line(b.phone, 40),
      outcome: line(b.outcome, 40), followup: /^\d{4}-\d{2}-\d{2}$/.test(String(b.followup || '')) ? b.followup : '', notes: text(b.notes, 1500) };
  }
  return { rating: int(b.rating, 5), unclear: text(b.unclear, 1500), ideas: text(b.ideas, 1500) };
}

function routes(app, pool, ADMIN_KEY) {
  const isAdmin = (req) => !!ADMIN_KEY && req.get('x-admin-key') === ADMIN_KEY;
  const allowed = teamAllowed;

  // One page file, split into pages by path: /cre8-sales, /cre8-sales/pay, /pitch, /objections, /builder, /quiz, /log
  app.get(['/cre8-sales', /^\/cre8-sales\/(pay|pitch|objections|builder|quiz|log)\/?$/], (req, res) => {
    const here = String(req.originalUrl || '/cre8-sales').split('?')[0]; // /sales on hq.cantwaittocre8.com
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Cache-Control', 'no-store');
    if (CODE() && req.query.code !== undefined) {
      if (String(req.query.code).trim() === CODE()) {
        res.set('Set-Cookie', 'cre8s=' + cookieVal() + '; Path=/; Max-Age=' + 60 * 86400 + '; HttpOnly; Secure; SameSite=Lax');
        return res.redirect(302, here);
      }
      return res.redirect(302, here + '?wrong=1');
    }
    if (!allowed(req)) {
      return res.type('html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">' +
        '<title>Cre8 Sales Team</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111014;color:#fff;font-family:Arial,sans-serif;padding:20px}' +
        'form{background:#1c1a20;border-radius:16px;padding:28px;max-width:360px;width:100%}h1{margin:0 0 6px;font-size:24px}p{color:#bbb;font-size:14px}' +
        'input{width:100%;box-sizing:border-box;padding:13px;border-radius:10px;border:1px solid #333;background:#111014;color:#fff;font-size:16px;margin:10px 0}' +
        'button{width:100%;padding:13px;border:0;border-radius:10px;background:linear-gradient(90deg,#ff3d7f,#ffb020);color:#fff;font-weight:700;font-size:16px}.e{color:#ff7aa6}</style></head>' +
        '<body><form method="get" action="' + here + '"><h1>Cre8 Sales Team</h1><p>Enter the team code Keith gave you.</p>' +
        (req.query.wrong ? '<p class="e">That code did not match. Try again.</p>' : '') +
        '<input name="code" type="password" autocomplete="off" required autofocus><button>Open Playbook</button></form></body></html>');
    }
    res.type('html').send(fs.readFileSync(path.join(__dirname, 'views', 'cre8-sales.html'), 'utf8'));
  });

  if (!pool) return;

  app.get('/api/cre8/sales/config', async (req, res) => {
    if (!allowed(req)) return res.status(401).json({ error: 'code' });
    res.set('Cache-Control', 'no-store');
    res.json({ foundingLeft: await foundingLeft(pool) });
  });

  app.post('/api/cre8/sales/entry', async (req, res) => {
    if (!allowed(req)) return res.status(401).json({ error: 'code', message: 'Open the playbook with the team code first.' });
    const b = req.body || {};
    const kind = KINDS.includes(b.kind) ? b.kind : null;
    const rep = line(b.rep_name, 80);
    if (!kind) return res.status(400).json({ error: 'kind' });
    if (!rep) return res.status(400).json({ error: 'name', message: 'Add your name at the top of the page first.' });
    if (kind === 'lead' && !line(b.business, 120)) return res.status(400).json({ error: 'business', message: 'Add the business name.' });
    if (limited('cs:' + String(req.ip || ''), 120)) return res.status(429).json({ error: 'busy', message: 'Too many saves in an hour. Try again later.' });
    try {
      await ensure(pool);
      const r = await pool.query('INSERT INTO cre8_sales_entries (kind, rep_name, rep_email, score, total, data) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [kind, rep, cleanEmail(b.rep_email), int(b.score, 1000), int(b.total, 1000), JSON.stringify(cleanData(kind, b))]);
      res.json({ ok: true, id: r.rows[0].id });
    } catch (e) { console.error('cre8sales: save failed', e.message); res.status(500).json({ error: 'failed', message: 'Could not save right now.' }); }
  });

  app.get('/api/admin/cre8/sales', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
    try {
      await ensure(pool);
      const rows = (await pool.query('SELECT * FROM cre8_sales_entries ORDER BY id DESC LIMIT 1000')).rows;
      res.json({ entries: rows, foundingLeft: await foundingLeft(pool), codeSet: !!CODE() });
    } catch (e) { res.status(500).json({ error: 'failed' }); }
  });

  app.post('/api/admin/cre8/sales/config', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
    const n = int((req.body || {}).foundingLeft, 99);
    if (n === null) return res.status(400).json({ error: 'number' });
    try {
      await ensure(pool);
      await pool.query("INSERT INTO cre8_sales_settings (key, value) VALUES ('founding_left', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [String(n)]);
      res.json({ ok: true, foundingLeft: n });
    } catch (e) { res.status(500).json({ error: 'failed' }); }
  });

  app.delete('/api/admin/cre8/sales/:id', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
    try { await ensure(pool); await pool.query('DELETE FROM cre8_sales_entries WHERE id = $1', [parseInt(req.params.id, 10)]); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: 'failed' }); }
  });
}

module.exports = { routes, teamAllowed };
