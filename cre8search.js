// Can't Wait to Cre8 Local Search plans: monthly Search Reports for clients.
// Keith adds a client and their Search Console property in the Cre8 admin (SEARCH tab), logs the month's work and
// AI answer checks, pulls Google search numbers from Search Console, and sends the client a report link.
//
// Admin (x-admin-key):
//   GET    /api/admin/cre8/seo                       clients + whether Search Console is connected (and the email to share)
//   POST   /api/admin/cre8/seo/clients               { name, business, site, plan, started, gbp_url }
//   DELETE /api/admin/cre8/seo/clients/:id
//   GET    /api/admin/cre8/seo/:id?m=YYYY-MM         one client's month: work log, AI checks, search snapshot
//   POST   /api/admin/cre8/seo/:id/pull              { m } pulls that month and the month before from Search Console
//   POST   /api/admin/cre8/seo/:id/work              { day, kind, note, url }
//   DELETE /api/admin/cre8/seo/work/:wid
//   POST   /api/admin/cre8/seo/:id/ai                { m, results: [{ q, google, chatgpt, perplexity }] } (true/false/null)
// Public (secret link for the client):
//   GET    /report/:id/:token                        the report page (?m=YYYY-MM picks the month)
//   GET    /api/cre8/report/:id/:token?m=YYYY-MM     its data
// Env: GOOGLE_SC_CREDENTIALS = the whole JSON key of a Google Cloud service account with the Search Console API enabled.
//      Each client adds that service account's email as a Restricted user on their Search Console property.
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const SITE = 'https://cantwaittocre8.com';
const PLANS = { visibility: 'Local Visibility', growth: 'Local Growth', leader: 'Local Leader' };
const KINDS = ['Page published', 'Article published', 'Page improved', 'Google profile post', 'Photos added', 'Reviews answered', 'Review requests sent', 'Listing fixed', 'Local link earned', 'Technical fix', 'Other'];
const line = (s, n) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const okMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));
const thisMonth = () => new Date().toISOString().slice(0, 7);
function prevMonth(m) { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 2, 1)); return d.toISOString().slice(0, 7); }
function monthRange(m) {
  const [y, mo] = m.split('-').map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1)), end = new Date(Date.UTC(y, mo, 0));
  const latest = new Date(Date.now() - 3 * 86400000); // Search Console data runs about 2 to 3 days behind
  return { start: start.toISOString().slice(0, 10), end: (end < latest ? end : latest).toISOString().slice(0, 10), partial: end >= latest };
}

// ---------- Google Search Console (service account, no extra packages) ----------
function creds() { try { const c = JSON.parse(process.env.GOOGLE_SC_CREDENTIALS || ''); return c.client_email && c.private_key ? c : null; } catch (e) { return null; } }
let tok = { value: '', exp: 0 }, pending = null;
function accessToken() {
  if (tok.value && Date.now() < tok.exp - 60000) return Promise.resolve(tok.value);
  if (!pending) pending = fetchToken().finally(() => { pending = null; }); // one sign-in shared by parallel requests
  return pending;
}
async function fetchToken() {
  const c = creds(); if (!c) throw new Error('Search Console is not connected yet (GOOGLE_SC_CREDENTIALS is missing).');
  const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: c.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(c.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + unsigned + '.' + sig });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google sign-in failed: ' + (j.error_description || j.error || r.status));
  tok = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tok.value;
}
async function scQuery(site, body) {
  const t = await accessToken();
  const r = await fetch('https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(site) + '/searchAnalytics/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 403) throw new Error('No access to ' + site + '. Ask the client to add ' + (creds() || {}).client_email + ' as a user in Search Console.');
  if (!r.ok) throw new Error('Search Console error ' + r.status + ': ' + ((j.error && j.error.message) || ''));
  return j.rows || [];
}
async function monthData(site, m) {
  const { start, end, partial } = monthRange(m);
  if (end < start) return { start, end, partial: true, totals: { clicks: 0, impressions: 0, ctr: 0, position: null }, daily: [], queries: [], pages: [] };
  const base = { startDate: start, endDate: end };
  const [all, daily, queries, pages] = await Promise.all([
    scQuery(site, base),
    scQuery(site, Object.assign({ dimensions: ['date'], rowLimit: 40 }, base)),
    scQuery(site, Object.assign({ dimensions: ['query'], rowLimit: 15 }, base)),
    scQuery(site, Object.assign({ dimensions: ['page'], rowLimit: 10 }, base))
  ]);
  const t = all[0] || { clicks: 0, impressions: 0, ctr: 0, position: null };
  const row = (r) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });
  return { start, end, partial, totals: { clicks: t.clicks, impressions: t.impressions, ctr: t.ctr, position: t.position },
    daily: daily.map(row), queries: queries.map(row), pages: pages.map(row) };
}

// ---------- storage ----------
let ready = null;
function ensure(pool) {
  if (!ready) {
    ready = pool.query(`
      CREATE TABLE IF NOT EXISTS cre8_seo_clients (
        id SERIAL PRIMARY KEY, token TEXT NOT NULL, name TEXT NOT NULL, business TEXT NOT NULL DEFAULT '',
        site TEXT NOT NULL DEFAULT '', plan TEXT NOT NULL DEFAULT 'growth', started DATE, gbp_url TEXT NOT NULL DEFAULT '',
        created TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS cre8_seo_work (
        id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES cre8_seo_clients(id) ON DELETE CASCADE,
        day DATE NOT NULL, kind TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', created TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS cre8_seo_ai (
        client_id INTEGER NOT NULL REFERENCES cre8_seo_clients(id) ON DELETE CASCADE, month TEXT NOT NULL,
        results JSONB NOT NULL DEFAULT '[]', updated TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (client_id, month)
      );
      CREATE TABLE IF NOT EXISTS cre8_seo_snap (
        client_id INTEGER NOT NULL REFERENCES cre8_seo_clients(id) ON DELETE CASCADE, month TEXT NOT NULL,
        data JSONB NOT NULL, fetched TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (client_id, month)
      );
    `).catch((e) => { ready = null; throw e; });
  }
  return ready;
}
async function monthBundle(pool, c, m) {
  const p = prevMonth(m);
  const [work, ai, snaps, months] = await Promise.all([
    pool.query("SELECT id, to_char(day, 'YYYY-MM-DD') AS day, kind, note, url FROM cre8_seo_work WHERE client_id = $1 AND to_char(day, 'YYYY-MM') = $2 ORDER BY day, id", [c.id, m]),
    pool.query('SELECT results, updated FROM cre8_seo_ai WHERE client_id = $1 AND month = $2', [c.id, m]),
    pool.query('SELECT month, data, fetched FROM cre8_seo_snap WHERE client_id = $1 AND month = ANY($2)', [c.id, [m, p]]),
    pool.query("SELECT DISTINCT month FROM (SELECT month FROM cre8_seo_snap WHERE client_id = $1 UNION SELECT to_char(day, 'YYYY-MM') FROM cre8_seo_work WHERE client_id = $1 UNION SELECT month FROM cre8_seo_ai WHERE client_id = $1) x ORDER BY month DESC", [c.id])
  ]);
  const snap = (mm) => snaps.rows.find((r) => r.month === mm) || null;
  return { month: m, prev: p, work: work.rows, ai: ai.rows[0] ? ai.rows[0].results : [], aiUpdated: ai.rows[0] ? ai.rows[0].updated : null,
    snap: snap(m), prevSnap: snap(p), months: months.rows.map((r) => r.month) };
}
const linkOf = (c) => SITE + '/report/' + c.id + '/' + c.token;
async function loadPublic(pool, id, token) {
  await ensure(pool);
  const c = (await pool.query('SELECT * FROM cre8_seo_clients WHERE id = $1', [parseInt(id, 10) || 0])).rows[0];
  if (!c || String(token || '').length !== 32) return null;
  const a = Buffer.from(c.token), b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? c : null;
}

function routes(app, pool, ADMIN_KEY) {
  if (!pool) return;
  const isAdmin = (req) => !!ADMIN_KEY && req.get('x-admin-key') === ADMIN_KEY;
  const guard = (fn) => async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
    try { await ensure(pool); await fn(req, res); } catch (e) { console.error('cre8search:', e.message); res.status(500).json({ error: 'failed', message: e.message }); }
  };
  const client = async (id) => (await pool.query('SELECT * FROM cre8_seo_clients WHERE id = $1', [parseInt(id, 10) || 0])).rows[0];

  app.get('/api/admin/cre8/seo', guard(async (req, res) => {
    const rows = (await pool.query(`SELECT c.*, (SELECT max(fetched) FROM cre8_seo_snap s WHERE s.client_id = c.id) AS last_pull,
      (SELECT count(*)::int FROM cre8_seo_work w WHERE w.client_id = c.id AND to_char(w.day, 'YYYY-MM') = $1) AS work_this_month FROM cre8_seo_clients c ORDER BY c.id DESC`, [thisMonth()])).rows;
    const c = creds();
    res.json({ clients: rows.map((r) => Object.assign(r, { url: linkOf(r), token: undefined })), connected: !!c, shareEmail: c ? c.client_email : '', plans: PLANS, kinds: KINDS, month: thisMonth() });
  }));

  app.post('/api/admin/cre8/seo/clients', guard(async (req, res) => {
    const b = req.body || {}, name = line(b.name, 120);
    if (!name) return res.status(400).json({ error: 'name', message: 'Add the client name.' });
    let site = line(b.site, 200);
    if (site && !/^sc-domain:|^https?:\/\//.test(site)) site = 'sc-domain:' + site.replace(/^www\./, '').replace(/\/.*$/, '');
    const started = /^\d{4}-\d{2}-\d{2}$/.test(String(b.started || '')) ? b.started : null;
    const r = await pool.query('INSERT INTO cre8_seo_clients (token, name, business, site, plan, started, gbp_url) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [crypto.randomBytes(16).toString('hex'), name, line(b.business, 120), site, PLANS[b.plan] ? b.plan : 'growth', started, line(b.gbp_url, 300)]);
    res.json({ id: r.rows[0].id });
  }));

  app.delete('/api/admin/cre8/seo/clients/:id', guard(async (req, res) => {
    await pool.query('DELETE FROM cre8_seo_clients WHERE id = $1', [parseInt(req.params.id, 10)]); res.json({ ok: true });
  }));

  app.get('/api/admin/cre8/seo/:id', guard(async (req, res) => {
    const c = await client(req.params.id); if (!c) return res.status(404).json({ error: 'missing' });
    const m = okMonth(req.query.m) ? req.query.m : thisMonth();
    res.json(Object.assign({ client: Object.assign({}, c, { url: linkOf(c), token: undefined }) }, await monthBundle(pool, c, m)));
  }));

  app.post('/api/admin/cre8/seo/:id/pull', guard(async (req, res) => {
    const c = await client(req.params.id); if (!c) return res.status(404).json({ error: 'missing' });
    if (!c.site) return res.status(400).json({ error: 'site', message: 'Add the client\'s Search Console property first.' });
    const m = okMonth((req.body || {}).m) ? req.body.m : thisMonth();
    try {
      for (const mm of [m, prevMonth(m)]) {
        const d = await monthData(c.site, mm);
        await pool.query('INSERT INTO cre8_seo_snap (client_id, month, data) VALUES ($1,$2,$3) ON CONFLICT (client_id, month) DO UPDATE SET data = EXCLUDED.data, fetched = now()', [c.id, mm, JSON.stringify(d)]);
      }
      res.json({ ok: true });
    } catch (e) { res.status(502).json({ error: 'google', message: e.message }); }
  }));

  app.post('/api/admin/cre8/seo/:id/work', guard(async (req, res) => {
    const b = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.day || ''))) return res.status(400).json({ error: 'day', message: 'Pick a date.' });
    const kind = KINDS.includes(b.kind) ? b.kind : 'Other';
    const url = /^https?:\/\//.test(String(b.url || '')) ? line(b.url, 300) : '';
    const r = await pool.query('INSERT INTO cre8_seo_work (client_id, day, kind, note, url) VALUES ($1,$2,$3,$4,$5) RETURNING id', [parseInt(req.params.id, 10), b.day, kind, line(b.note, 300), url]);
    res.json({ id: r.rows[0].id });
  }));

  app.delete('/api/admin/cre8/seo/work/:wid', guard(async (req, res) => {
    await pool.query('DELETE FROM cre8_seo_work WHERE id = $1', [parseInt(req.params.wid, 10)]); res.json({ ok: true });
  }));

  app.post('/api/admin/cre8/seo/:id/ai', guard(async (req, res) => {
    const b = req.body || {}, m = okMonth(b.m) ? b.m : thisMonth();
    const tri = (v) => (v === true || v === false ? v : null);
    const results = (Array.isArray(b.results) ? b.results : []).slice(0, 15).map((r) => ({ q: line(r && r.q, 160), google: tri(r && r.google), chatgpt: tri(r && r.chatgpt), perplexity: tri(r && r.perplexity) })).filter((r) => r.q);
    await pool.query('INSERT INTO cre8_seo_ai (client_id, month, results) VALUES ($1,$2,$3) ON CONFLICT (client_id, month) DO UPDATE SET results = EXCLUDED.results, updated = now()', [parseInt(req.params.id, 10), m, JSON.stringify(results)]);
    res.json({ ok: true });
  }));

  // ---------- the client's report ----------
  app.get('/report/:id/:token', (req, res) => {
    res.set('X-Robots-Tag', 'noindex, nofollow'); res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
    res.type('html').send(fs.readFileSync(path.join(__dirname, 'views', 'cre8-report.html'), 'utf8'));
  });
  app.get('/api/cre8/report/:id/:token', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const c = await loadPublic(pool, req.params.id, req.params.token);
      if (!c) return res.status(404).json({ error: 'missing', message: 'This report link is not valid.' });
      let m = okMonth(req.query.m) ? req.query.m : null;
      const first = await monthBundle(pool, c, m || thisMonth());
      if (!m && first.months.length && !first.months.includes(thisMonth())) m = first.months[0];
      const data = m && m !== first.month ? await monthBundle(pool, c, m) : first;
      res.json(Object.assign({ client: { name: c.name, business: c.business, plan: PLANS[c.plan] || '', site: c.site.replace(/^sc-domain:/, ''), started: c.started } }, data));
    } catch (e) { res.status(500).json({ error: 'failed' }); }
  });
}

module.exports = { routes, monthRange, prevMonth, monthData };
