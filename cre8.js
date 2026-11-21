// Can't Wait to Cre8 (print shop) quote requests with file uploads.
// Three public steps so big files never hit the 1mb JSON limit:
//   POST /api/cre8/quote                      JSON form fields -> { id, token }
//   POST /api/cre8/quote/:id/file?token&name  raw file body (one file per call, max 10MB, max 10 files)
//   POST /api/cre8/quote/:id/done?token       sends the shop alert and the customer confirmation
// Admin (x-admin-key):
//   GET    /api/admin/cre8/quotes             latest 300 with file list
//   GET    /api/admin/cre8/file/:fileId       download one file
//   POST   /api/admin/cre8/quotes/:id         { status, notes }
//   DELETE /api/admin/cre8/quotes/:id         removes the quote and its files
//   DELETE /api/admin/cre8/finished           removes every quote marked done or lost, with its files
// Contact page:
//   POST   /api/cre8/contact                  { name, email, phone, topic, contact_preference, message } saved, then emailed
//   GET    /api/admin/cre8/messages           latest 300 (x-admin-key)
//   DELETE /api/admin/cre8/messages/:id
// Files live in Postgres (cre8_files.data, bytea). Watch database size on Render.
// Env (all optional): CRE8_NOTIFY (who gets the alert, default ksimmonds@cantwaittocre8.com),
//   CRE8_FROM (sender, default Can't Wait to Cre8 <ksimmonds@cantwaittocre8.com>; if Resend rejects it because the
//   domain is not verified yet, the email is resent from BOOKING_FROM or AUTH_FROM so nothing is lost),
//   CRE8_REPLY_TO, CRE8_ADMIN_URL.
const express = require('express');
const crypto = require('crypto');

const MAX_FILE = 10 * 1024 * 1024, MAX_FILES = 10, MAX_TOTAL = 60 * 1024 * 1024;
const ATTACH_LIMIT = 15 * 1024 * 1024; // attach files to the shop alert only if they fit comfortably under Resend's limit
const STATUSES = ['new', 'quoted', 'approved', 'in production', 'ready', 'done', 'lost'];
const OK_TYPES = /^(image\/(png|jpe?g|svg\+xml|heic|heif|webp|gif)|application\/(pdf|postscript|illustrator|octet-stream|x-photoshop|vnd\.adobe\.photoshop)|image\/vnd\.adobe\.photoshop)$/i;

const NOTIFY = () => String(process.env.CRE8_NOTIFY || 'ksimmonds@cantwaittocre8.com').trim();
const FROM = () => process.env.CRE8_FROM || "Can't Wait to Cre8 <ksimmonds@cantwaittocre8.com>";
const FALLBACK_FROM = () => process.env.BOOKING_FROM || process.env.AUTH_FROM || '';
const REPLY_TO = () => process.env.CRE8_REPLY_TO || NOTIFY();
const ADMIN_URL = () => process.env.CRE8_ADMIN_URL || 'https://live-above-scorecard.onrender.com/admin.html#cre8';

let ready = null;
function ensureTables(pool) {
  if (!ready) {
    ready = pool.query(`
      CREATE TABLE IF NOT EXISTS cre8_quotes (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        organization TEXT NOT NULL DEFAULT '',
        quantity INTEGER,
        need_by DATE,
        details JSONB NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'new',
        notes TEXT NOT NULL DEFAULT '',
        emailed BOOLEAN NOT NULL DEFAULT false,
        completed BOOLEAN NOT NULL DEFAULT false,
        created TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS cre8_files (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER NOT NULL REFERENCES cre8_quotes(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'application/octet-stream',
        size INTEGER NOT NULL,
        data BYTEA NOT NULL,
        created TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS cre8_files_quote ON cre8_files(quote_id);
    `).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const line = (s, n) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const text = (s, n) => String(s == null ? '' : s).replace(/\r\n/g, '\n').trim().slice(0, n);
function cleanEmail(e) { const s = String(e || '').trim().toLowerCase().slice(0, 200); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null; }
function list(v, n) { return (Array.isArray(v) ? v : v ? [v] : []).map((x) => line(x, 80)).filter(Boolean).slice(0, n); }
function int(v, max) { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null; }
function safeName(n) { return line(n, 140).replace(/[\\/:*?"<>|]+/g, '_') || 'file'; }
function isAdmin(req, KEY) { return !!KEY && req.get('x-admin-key') === KEY; }

const hits = new Map();
function limited(key, max) {
  const now = Date.now(), arr = (hits.get(key) || []).filter((t) => now - t < 3600000);
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 3600000)) hits.delete(k);
  return arr.length > max;
}

const SIZE_KEYS = ['youth_s', 'youth_m', 'youth_l', 's', 'm', 'l', 'xl', '2xl', '3xl', '4xl_plus'];
const SIZE_LABEL = { youth_s: 'YS', youth_m: 'YM', youth_l: 'YL', s: 'S', m: 'M', l: 'L', xl: 'XL', '2xl': '2XL', '3xl': '3XL', '4xl_plus': '4XL+' };

function parseDetails(b) {
  const sizes = {};
  SIZE_KEYS.forEach((k) => { const n = int(b['size_' + k], 100000); if (n) sizes[k] = n; });
  return {
    idea: text(b.idea, 4000),
    occasion: line(b.occasion, 60),
    products: list(b.product, 16),
    method: line(b.method, 60),
    garment: line(b.garment, 120),
    garment_other: line(b.garment_other, 160),
    garment_color: line(b.garment_color, 120),
    locations: list(b.locations, 10),
    sizes,
    design_status: line(b.design_status, 60),
    budget: line(b.budget, 40),
    delivery: line(b.delivery, 40),
    contact_preference: line(b.contact_preference, 20),
    referral: line(b.referral, 60),
    own_item: line(b.own_item, 200), // customer's own product to brand
    phone_model: line(b.phone_model, 80), // phone case orders: which phone
    finish: b.finish === 'Raised texture' ? 'Raised texture' : (b.finish ? 'Flat' : ''), // print finish
    // From the mockup tool on the site: garment, color and the design's size and position per side (in inches)
    mockup_garment: line(b.mockup_garment, 40),
    mockup_color: line(b.mockup_color, 40),
    mockup_front: line(b.mockup_front, 300),
    mockup_back: line(b.mockup_back, 300),
    // From the engraving mockup: item, text, font, and logo plus size and position in inches
    engrave_item: line(b.engrave_item, 60),
    engrave_text: line(b.engrave_text, 160),
    engrave_font: line(b.engrave_font, 40),
    engrave_design: line(b.engrave_design, 300)
  };
}

function summaryRows(q) {
  const d = q.details || {};
  const sizes = Object.keys(d.sizes || {}).map((k) => SIZE_LABEL[k] + ' ' + d.sizes[k]).join(', ');
  const garment = d.garment === 'Other' ? (d.garment_other || 'Other') : d.garment;
  return [
    ['Name', q.name], ['Business or group', q.organization], ['Email', q.email], ['Phone', q.phone],
    ['Best way to reach', d.contact_preference], ['For', d.occasion], ['Products', (d.products || []).join(', ')],
    ['Method', d.method], ['Print finish', d.finish], ['Their own item', d.own_item], ['Phone model', d.phone_model], ['Garment', garment], ['Garment color', d.garment_color],
    ['Print locations', (d.locations || []).join(', ')], ['Sizes', sizes], ['Quantity', q.quantity],
    ['Need by', q.need_by ? new Date(q.need_by).toISOString().slice(0, 10) : ''], ['Budget', d.budget],
    ['Pickup or ship', d.delivery], ['Design status', d.design_status], ['Heard about us', d.referral],
    ['Mockup', [d.mockup_color, d.mockup_garment].filter(Boolean).join(' ')], ['Mockup front', d.mockup_front], ['Mockup back', d.mockup_back],
    ['Engraving item', d.engrave_item], ['Engraving text', d.engrave_text], ['Engraving font', d.engrave_font], ['Engraving placement', d.engrave_design]
  ].filter((r) => r[1] !== '' && r[1] != null);
}

async function resend(payload) {
  if (!process.env.RESEND_API_KEY) return false;
  const send = (from) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({}, payload, { from }))
  });
  let r = await send(FROM());
  if (r.ok) return true;
  const why = (await r.text().catch(() => '')).slice(0, 300);
  // 403 / 422 from Resend usually means the cantwaittocre8.com domain is not verified in Resend yet: resend from the old sender
  if ((r.status === 403 || r.status === 422) && FALLBACK_FROM() && FALLBACK_FROM() !== FROM()) {
    console.warn('cre8: sender rejected, using fallback sender.', r.status, why);
    r = await send(FALLBACK_FROM());
    if (r.ok) return true;
  }
  console.error('cre8: email failed', r.status, why || (await r.text().catch(() => '')).slice(0, 300));
  return false;
}

async function sendShopAlert(pool, q) {
  const files = (await pool.query('SELECT id, name, type, size FROM cre8_files WHERE quote_id = $1 ORDER BY id', [q.id])).rows;
  const total = files.reduce((a, f) => a + f.size, 0);
  let attachments = [];
  if (files.length && total <= ATTACH_LIMIT) {
    const data = (await pool.query('SELECT name, data FROM cre8_files WHERE quote_id = $1 ORDER BY id', [q.id])).rows;
    attachments = data.map((f) => ({ filename: f.name, content: Buffer.from(f.data).toString('base64') }));
  }
  const rows = summaryRows(q);
  const d = q.details || {};
  const fileNote = !files.length ? 'No files uploaded.'
    : files.length + ' file(s), ' + (total / 1048576).toFixed(1) + 'MB. ' + (attachments.length ? 'Attached to this email.' : 'Too large to attach, open the admin page.');
  const subject = 'New Cre8 Quote #' + q.id + ': ' + (q.organization || q.name) + (q.quantity ? ' (' + q.quantity + ' pcs)' : '');
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;max-width:620px">' +
    '<h2 style="margin:0 0 10px">New quote request #' + q.id + '</h2>' +
    '<p style="white-space:pre-wrap;background:#f6f3ee;border-radius:8px;padding:12px 14px;margin:0 0 14px">' + esc(d.idea) + '</p>' +
    '<table style="border-collapse:collapse;width:100%">' + rows.map((r) => '<tr><td style="padding:5px 10px 5px 0;color:#666;vertical-align:top;white-space:nowrap">' + esc(r[0]) + '</td><td style="padding:5px 0">' + esc(r[1]) + '</td></tr>').join('') + '</table>' +
    '<p style="margin:14px 0 6px"><b>Files:</b> ' + esc(fileNote) + '</p>' +
    (files.length ? '<ul style="margin:0 0 14px">' + files.map((f) => '<li>' + esc(f.name) + ' (' + Math.round(f.size / 1024) + 'KB)</li>').join('') + '</ul>' : '') +
    '<p><a href="' + esc(ADMIN_URL()) + '" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Open Cre8 Admin</a></p>' +
    '<p style="color:#666;font-size:13px">Reply to this email to answer the customer directly.</p></div>';
  const txt = 'New quote request #' + q.id + '\n\n' + d.idea + '\n\n' + rows.map((r) => r[0] + ': ' + r[1]).join('\n') + '\n\nFiles: ' + fileNote + '\n' + files.map((f) => '- ' + f.name).join('\n') + '\n\nAdmin: ' + ADMIN_URL();
  const payload = { to: [NOTIFY()], reply_to: q.email, subject, html, text: txt };
  if (attachments.length) payload.attachments = attachments;
  let ok = await resend(payload);
  if (!ok && attachments.length) { delete payload.attachments; payload.html = payload.html.replace('Attached to this email.', 'Could not attach, open the admin page.'); ok = await resend(payload); }
  return ok;
}

async function sendCustomerConfirm(q) {
  const first = String(q.name || '').trim().split(/\s+/)[0] || 'there';
  const d = q.details || {};
  const html = '<div style="background:#fbf8f3;padding:24px 12px"><div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6e0d6;border-radius:14px;padding:26px 22px;font-family:Arial,sans-serif;font-size:16px;line-height:1.55;color:#111">' +
    '<div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#ff3d7f;font-weight:700">Can\'t Wait to Cre8</div>' +
    '<h1 style="margin:6px 0 14px;font-size:26px">We got your idea, ' + esc(first) + '.</h1>' +
    '<p style="margin:0 0 14px">Your request number is <b>#' + q.id + '</b>. We will send your mockup and quote, usually within 1 business day.</p>' +
    '<p style="margin:0 0 6px;color:#666;font-size:14px">What you told us:</p>' +
    '<p style="white-space:pre-wrap;background:#fbf8f3;border-radius:8px;padding:12px 14px;margin:0 0 14px;font-size:15px">' + esc(d.idea) + '</p>' +
    '<p style="margin:0 0 14px">Small orders are done in 3 days once you approve the proof and payment is in. Larger orders get a firm completion date with your quote.</p>' +
    '<p style="margin:0;color:#666;font-size:14px">Need to add something? Reply to this email, or call or text 732-720-9211.<br>37 Center Ave, Leonardo, NJ 07737</p></div></div>';
  const txt = 'Hi ' + first + ',\n\nWe got your idea. Your request number is #' + q.id + '. We will send your mockup and quote, usually within 1 business day.\n\nWhat you told us:\n' + d.idea + '\n\nSmall orders are done in 3 days once you approve the proof and payment is in. Larger orders get a firm completion date with your quote.\n\nNeed to add something? Reply to this email, or call or text 732-720-9211.\n\nCan\'t Wait to Cre8\n37 Center Ave, Leonardo, NJ 07737';
  return resend({ to: [q.email], reply_to: REPLY_TO(), subject: 'We Got Your Idea: Cre8 Request #' + q.id, html, text: txt });
}

async function loadQuote(pool, id, token) {
  const r = await pool.query('SELECT * FROM cre8_quotes WHERE id = $1', [id]);
  const q = r.rows[0];
  if (!q || !token || q.token.length !== String(token).length) return null;
  return crypto.timingSafeEqual(Buffer.from(q.token), Buffer.from(String(token))) ? q : null;
}

// Safety net: if a browser closes before /done, send the emails anyway after 20 minutes.
async function sweep(pool) {
  try {
    await ensureTables(pool);
    const r = await pool.query("UPDATE cre8_quotes SET completed = true WHERE completed = false AND created < now() - interval '20 minutes' RETURNING *");
    for (const q of r.rows) {
      let shop = false;
      try { shop = await sendShopAlert(pool, q); } catch (e) { console.error('cre8: sweep alert', e.message); }
      try { await sendCustomerConfirm(q); } catch (e) { console.error('cre8: sweep confirm', e.message); }
      if (shop) await pool.query('UPDATE cre8_quotes SET emailed = true WHERE id = $1', [q.id]).catch(() => {});
    }
  } catch (e) { console.error('cre8: sweep failed', e.message); }
}

// The upload token and file name travel in headers (X-Cre8-Token, X-File-Name) so they never land in URLs or logs.
// The query string is still accepted so older copies of the page keep working.
function tokenOf(req) { return String(req.get('x-cre8-token') || req.query.token || ''); }
function fileNameOf(req) {
  const h = req.get('x-file-name');
  if (h) { try { return decodeURIComponent(h); } catch (e) { return h; } }
  return req.query.name;
}

let msgReady = null;
function ensureMessages(pool) {
  if (!msgReady) {
    msgReady = pool.query(`CREATE TABLE IF NOT EXISTS cre8_messages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      topic TEXT NOT NULL DEFAULT '',
      contact_preference TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      emailed BOOLEAN NOT NULL DEFAULT false,
      created TIMESTAMPTZ NOT NULL DEFAULT now()
    )`).catch((e) => { msgReady = null; throw e; });
  }
  return msgReady;
}

async function sendContactMail(m) {
  const rows = [['Name', m.name], ['Email', m.email], ['Phone', m.phone], ['Topic', m.topic], ['Best way to reach', m.contact_preference]].filter((r) => r[1]);
  return resend({
    to: [NOTIFY()], reply_to: m.email,
    subject: 'Cre8 Contact: ' + (m.topic || 'Message') + ' from ' + m.name,
    text: rows.map((r) => r[0] + ': ' + r[1]).join('\n') + '\n\n' + m.message + '\n\nReply to this email to answer them directly.',
    html: '<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;max-width:600px">' +
      '<table style="border-collapse:collapse">' + rows.map((r) => '<tr><td style="padding:4px 12px 4px 0;color:#666">' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>').join('') + '</table>' +
      '<p style="white-space:pre-wrap;background:#f6f3ee;border-radius:8px;padding:12px 14px">' + esc(m.message) + '</p>' +
      '<p style="color:#666;font-size:13px">Reply to this email to answer them directly.</p></div>'
  });
}

function routes(app, pool, ADMIN_KEY) {
  if (!pool) return;

  app.post('/api/cre8/contact', async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true }); // honeypot
    const m = { name: line(b.name, 120), email: cleanEmail(b.email), phone: line(b.phone, 40), topic: line(b.topic, 60),
      contact_preference: line(b.contact_preference, 20), message: text(b.message, 3000) };
    if (!m.name) return res.status(400).json({ error: 'name', message: 'Add your name.' });
    if (!m.email) return res.status(400).json({ error: 'email', message: 'Add a valid email so we can reply.' });
    if (m.message.length < 3) return res.status(400).json({ error: 'message', message: 'Add a message.' });
    if (limited('cip:' + String(req.ip || ''), 10) || limited('cem:' + m.email, 5)) return res.status(429).json({ error: 'busy', message: 'Too many messages. Try again in an hour.' });
    let id = null, emailed = false;
    try { await ensureMessages(pool); id = (await pool.query('INSERT INTO cre8_messages (name, email, phone, topic, contact_preference, message) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [m.name, m.email, m.phone, m.topic, m.contact_preference, m.message])).rows[0].id; }
    catch (e) { console.error('cre8: contact save failed', e.message); }
    try { emailed = await sendContactMail(m); } catch (e) { console.error('cre8: contact email', e.message); }
    if (id && emailed) pool.query('UPDATE cre8_messages SET emailed = true WHERE id = $1', [id]).catch(() => {});
    if (!id && !emailed) return res.status(502).json({ error: 'failed', message: 'Could not send right now.' });
    res.json({ ok: true });
  });

  app.get('/api/admin/cre8/messages', async (req, res) => {
    if (!isAdmin(req, ADMIN_KEY)) return res.status(401).json({ error: 'unauthorized' });
    try { await ensureMessages(pool); res.json({ messages: (await pool.query('SELECT * FROM cre8_messages ORDER BY id DESC LIMIT 300')).rows }); }
    catch (e) { res.status(500).json({ error: 'failed' }); }
  });

  app.delete('/api/admin/cre8/messages/:id', async (req, res) => {
    if (!isAdmin(req, ADMIN_KEY)) return res.status(401).json({ error: 'unauthorized' });
    try { await ensureMessages(pool); await pool.query('DELETE FROM cre8_messages WHERE id = $1', [parseInt(req.params.id, 10)]); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: 'failed' }); }
  });
  const t = setInterval(() => sweep(pool), 5 * 60 * 1000); if (t.unref) t.unref();

  app.post('/api/cre8/quote', async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true, id: 0, token: 'x' }); // honeypot: bots fill hidden fields
    const email = cleanEmail(b.email), name = line(b.name, 120);
    const details = parseDetails(b);
    if (!name) return res.status(400).json({ error: 'name', message: 'Add your name.' });
    if (!email) return res.status(400).json({ error: 'email', message: 'Add a valid email so we can send your quote.' });
    if (details.idea.length < 5) return res.status(400).json({ error: 'idea', message: 'Tell us what you want to create.' });
    if (b.rights_confirmed !== 'yes' && b.rights_confirmed !== true) return res.status(400).json({ error: 'rights', message: 'Confirm you have permission to use the artwork.' });
    if (limited('ip:' + String(req.ip || ''), 12) || limited('em:' + email, 6)) return res.status(429).json({ error: 'busy', message: 'Too many requests. Try again in an hour or text us.' });
    const needBy = /^\d{4}-\d{2}-\d{2}$/.test(String(b.need_by || '')) ? b.need_by : null;
    const token = crypto.randomBytes(18).toString('hex');
    try {
      await ensureTables(pool);
      const r = await pool.query(
        'INSERT INTO cre8_quotes (token, name, email, phone, organization, quantity, need_by, details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [token, name, email, line(b.phone, 40), line(b.organization, 140), int(b.quantity, 1000000), needBy, details]
      );
      res.json({ ok: true, id: r.rows[0].id, token });
    } catch (e) { console.error('cre8: save failed', e.message); res.status(500).json({ error: 'failed', message: 'Could not save right now. Try again in a minute.' }); }
  });

  app.post('/api/cre8/quote/:id/file', express.raw({ type: () => true, limit: MAX_FILE }), async (req, res) => {
    try {
      await ensureTables(pool);
      const q = await loadQuote(pool, parseInt(req.params.id, 10), tokenOf(req));
      if (!q) return res.status(403).json({ error: 'forbidden' });
      if (q.completed || Date.now() - new Date(q.created).getTime() > 2 * 3600000) return res.status(409).json({ error: 'closed', message: 'This request is closed. Reply to your confirmation email with the file.' });
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'empty' });
      const type = line(req.get('content-type') || 'application/octet-stream', 100).split(';')[0];
      if (!OK_TYPES.test(type)) return res.status(415).json({ error: 'type', message: 'That file type is not supported.' });
      const c = (await pool.query('SELECT count(*)::int AS n, coalesce(sum(size),0)::bigint AS t FROM cre8_files WHERE quote_id = $1', [q.id])).rows[0];
      if (c.n >= MAX_FILES) return res.status(400).json({ error: 'too_many', message: 'Max ' + MAX_FILES + ' files.' });
      if (Number(c.t) + buf.length > MAX_TOTAL) return res.status(400).json({ error: 'too_big', message: 'Total upload limit reached.' });
      const r = await pool.query('INSERT INTO cre8_files (quote_id, name, type, size, data) VALUES ($1,$2,$3,$4,$5) RETURNING id', [q.id, safeName(fileNameOf(req)), type, buf.length, buf]);
      res.json({ ok: true, fileId: r.rows[0].id });
    } catch (e) { console.error('cre8: file failed', e.message); res.status(500).json({ error: 'failed' }); }
  });

  app.post('/api/cre8/quote/:id/done', async (req, res) => {
    try {
      await ensureTables(pool);
      const q = await loadQuote(pool, parseInt(req.params.id, 10), tokenOf(req));
      if (!q) return res.status(403).json({ error: 'forbidden' });
      if (q.completed) return res.json({ ok: true, id: q.id });
      await pool.query('UPDATE cre8_quotes SET completed = true WHERE id = $1', [q.id]);
      let shop = false;
      try { shop = await sendShopAlert(pool, q); } catch (e) { console.error('cre8: alert error', e.message); }
      try { await sendCustomerConfirm(q); } catch (e) { console.error('cre8: confirm error', e.message); }
      if (shop) await pool.query('UPDATE cre8_quotes SET emailed = true WHERE id = $1', [q.id]).catch(() => {});
      res.json({ ok: true, id: q.id });
    } catch (e) { console.error('cre8: done failed', e.message); res.status(500).json({ error: 'failed' }); }
  });

  app.get('/api/admin/cre8/quotes', async (req, res) => {
    if (!isAdmin(req, ADMIN_KEY)) return res.status(401).json({ error: 'unauthorized' });
    try {
      await ensureTables(pool);
      const q = (await pool.query('SELECT id, name, email, phone, organization, quantity, need_by, details, status, notes, emailed, completed, created FROM cre8_quotes ORDER BY id DESC LIMIT 300')).rows;
      const ids = q.map((x) => x.id);
      const f = ids.length ? (await pool.query('SELECT id, quote_id, name, type, size FROM cre8_files WHERE quote_id = ANY($1) ORDER BY id', [ids])).rows : [];
      const db = (await pool.query("SELECT coalesce(sum(size),0)::bigint AS t FROM cre8_files")).rows[0];
      q.forEach((x) => { x.files = f.filter((y) => y.quote_id === x.id); });
      res.json({ quotes: q, statuses: STATUSES, storedBytes: Number(db.t) });
    } catch (e) { console.error('cre8: admin list', e.message); res.status(500).json({ error: 'failed' }); }
  });

  app.get('/api/admin/cre8/file/:fileId', async (req, res) => {
    if (!isAdmin(req, ADMIN_KEY)) return res.status(401).json({ error: 'unauthorized' });
    try {
      await ensureTables(pool);
      const r = (await pool.query('SELECT name, type, data FROM cre8_files WHERE id = $1', [parseInt(req.params.fileId, 10)])).rows[0];
      if (!r) return res.status(404).json({ error: 'not_found' });
      res.set('Content-Type', r.type || 'application/octet-stream');
      res.set('Content-Disposition', (req.query.dl ? 'attachment' : 'inline') + '; filename="' + r.name.replace(/"/g, '') + '"');
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
      res.send(Buffer.from(r.data));
    } catch (e) { res.status(500).json({ error: 'failed' }); }
  });

  app.post('/api/admin/cre8/quotes/:id', async (req, res) => {
    if (!isAdmin(req, ADMIN_KEY)) return res.status(401).json({ error: 'unauthorized' });
    const b = req.body || {}, sets = [], vals = [];
    if (b.status != null) { if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'bad_status' }); vals.push(b.status); sets.push('status = $' + vals.length); }
    if (b.notes != null) { vals.push(text(b.notes, 4000)); sets.push('notes = $' + vals.length); }
    if (!sets.length) return res.status(400).json({ error: 'nothing' });
    vals.push(parseInt(req.params.id, 10));
    try { await ensureTables(pool); await pool.query('UPDATE cre8_quotes SET ' + sets.join(', ') + ' WHERE id = $' + vals.length, vals); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: 'failed' }); }
  });

  app.delete('/api/admin/cre8/finished', async (req, res) => {
    if (!isAdmin(req, ADMIN_KEY)) return res.status(401).json({ error: 'unauthorized' });
    try {
      await ensureTables(pool);
      const f = (await pool.query("SELECT coalesce(sum(f.size),0)::bigint AS t FROM cre8_files f JOIN cre8_quotes q ON q.id = f.quote_id WHERE q.status IN ('done','lost')")).rows[0];
      const r = await pool.query("DELETE FROM cre8_quotes WHERE status IN ('done','lost') RETURNING id");
      res.json({ ok: true, deleted: r.rowCount, freedBytes: Number(f.t) });
    } catch (e) { console.error('cre8: clear finished', e.message); res.status(500).json({ error: 'failed' }); }
  });

  app.delete('/api/admin/cre8/quotes/:id', async (req, res) => {
    if (!isAdmin(req, ADMIN_KEY)) return res.status(401).json({ error: 'unauthorized' });
    try { await ensureTables(pool); await pool.query('DELETE FROM cre8_quotes WHERE id = $1', [parseInt(req.params.id, 10)]); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: 'failed' }); }
  });
}

module.exports = { routes, ensureTables, resend };
