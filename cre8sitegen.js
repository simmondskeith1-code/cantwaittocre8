// Cre8 Site Builder: a sales rep types a business name, uploads its logo and photos, and Claude designs a one-page
// concept website to show the owner. Lives on the sales playbook (cantwaittocre8.com/team, "Site Builder").
//
// Rep (team code cookie required, see cre8sales.js teamAllowed):
//   POST /api/cre8/sales/sitegen                 { rep_name, business, kind, town, address, phone, email, hours, social, about, style,
//                                                  tier: launch|growth|signature (the concept shows what that package delivers) }
//                                                -> { id, token }
//   POST /api/cre8/sales/sitegen/:id/image?n=0   raw image body, header X-Gen-Token. n=0 is the logo, 1..6 are photos.
//   POST /api/cre8/sales/sitegen/:id/start       { t } starts the design job (runs in the background, 1 to 3 minutes)
//   GET  /api/cre8/sales/sitegen/:id?t=          { status: queued|working|done|failed, url, error }
//   POST /api/cre8/sales/sitegen/:id/revise      { t, notes } new version with the same photos -> { id, token } (auto-starts)
// Public with the secret link (to send the owner):
//   GET  /concept/:id/:token                     the concept page. Served sandboxed (its scripts run in their own origin,
//                                                so they can never reach the team cookie or the API) and never indexed.
//   GET  /concept/:id/:token/img/:n              its images
// Admin (x-admin-key):
//   GET    /api/admin/cre8/sales/sitegen         latest 200 concepts (no HTML)
//   DELETE /api/admin/cre8/sales/sitegen/:id     removes the concept and its images
// Env: ANTHROPIC_API_KEY (required), CRE8_SITEGEN_MODEL (default claude-sonnet-5-5),
//      CRE8_SITEGEN_DAILY (max new concepts per day for the whole team, default 40).
const express = require('express');
const crypto = require('crypto');
const { teamAllowed } = require('./cre8sales');

const MODEL = () => process.env.CRE8_SITEGEN_MODEL || 'claude-sonnet-5-5';
const DAILY = () => Number(process.env.CRE8_SITEGEN_DAILY) || 40;
const MAX_IMG = 4 * 1024 * 1024, MAX_PHOTOS = 6;
const OK_IMG = /^image\/(png|jpeg|webp|gif)$/;
const STYLES = ['Bold', 'Clean', 'Warm', 'Luxury', 'Playful'];
// What each package delivers, matching the Websites page. The concept shows what that tier includes.
const TIERS = {
  launch: { label: 'Launch Site', tokens: 16000, lines: 700, build: [
    'PACKAGE: Launch Site. Show only what this package includes:',
    '- A clean, mobile-first single page: hero, what they offer, a small photo gallery, contact.',
    '- A simple contact form (name, email or phone, message).',
    '- A Google reviews area that invites customers to read and leave reviews on Google (a button, no quoted reviews), and a Google Maps link for the address.',
    '- Light hover and scroll-reveal motion only. No calculators, configurators, ordering, page transitions or member areas: those belong to bigger packages.'] },
  growth: { label: 'Growth Site', tokens: 24000, lines: 1000, build: [
    'PACKAGE: Growth Site. Show everything a Growth Site includes:',
    '- Everything in a Launch Site: mobile-first design, contact details, Google reviews invitation and a Google Maps link.',
    '- Up to 6 "pages" inside this one file: a sticky menu that switches between page views (Home, Services, Gallery, About, Contact or what fits) with a smooth slide transition, plus scroll effects within each view. Update location.hash so each view has its own link.',
    '- A quote or booking request form with a file upload field (photos or plans) and the fields this business would need. It must not send: on submit show "Preview only: on the live site this request lands in your own lead dashboard and your inbox."',
    '- EXACTLY ONE standout interactive feature that fits this business, for example a price or estimate calculator, a filterable gallery, a before and after slider, or an animated service showcase people tap through. Make it genuinely useful and polished. Any prices in it must be clearly labeled "sample pricing" unless real prices were provided.',
    '- A small "Lead dashboard" teaser in the footer area: one line saying requests go to the owner\'s own dashboard. No fake numbers.',
    '- No online payments, cart or member login: those are Signature features.'] },
  signature: { label: 'Signature Build', tokens: 32000, lines: 1400, build: [
    'PACKAGE: Signature Build. Show everything a Signature Build includes:',
    '- Everything in a Growth Site: page views with slide transitions and scroll effects, the quote or booking form with file upload, and one standout interactive feature.',
    '- A CUSTOM TOOL as the centerpiece, like a product mockup builder: an interactive configurator made for this business where the visitor picks options (style, size, color, add-ons, date or service) and sees a live visual preview built with SVG or CSS that updates as they choose, plus a running summary. Examples: a custom cake or bouquet builder, a shirt or sign designer, a build-your-own juice or bowl, a room or project planner. Pick what fits this business.',
    '- Online ordering or payments: the custom tool or a menu adds items to a cart drawer with quantities and a total. Checkout must not charge: it shows "Preview only: on the live site checkout runs through Stripe or Square."',
    '- A client or member area preview: a "Sign in" page view with a login form that shows "Preview only: members see their orders, bookings and files here." Never collect real credentials.',
    '- Any prices are "sample pricing" unless real prices were provided.'] }
};
const line = (s, n) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const text = (s, n) => String(s == null ? '' : s).replace(/\r\n/g, '\n').trim().slice(0, n);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), h = (hits.get(key) || []).filter((t) => now - t < windowMs);
  h.push(now); hits.set(key, h); if (hits.size > 5000) hits.clear();
  return h.length > max;
}

let ready = null;
function ensure(pool) {
  if (!ready) {
    ready = pool.query(`
      CREATE TABLE IF NOT EXISTS cre8_sitegen (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL,
        rep_name TEXT NOT NULL,
        business TEXT NOT NULL,
        details JSONB NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'queued',
        html TEXT,
        error TEXT,
        parent_id INTEGER,
        created TIMESTAMPTZ NOT NULL DEFAULT now(),
        started TIMESTAMPTZ,
        finished TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS cre8_sitegen_img (
        id SERIAL PRIMARY KEY,
        gen_id INTEGER NOT NULL REFERENCES cre8_sitegen(id) ON DELETE CASCADE,
        n INTEGER NOT NULL,
        type TEXT NOT NULL,
        size INTEGER NOT NULL,
        data BYTEA NOT NULL,
        UNIQUE (gen_id, n)
      );
    `).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

async function load(pool, id, token) {
  await ensure(pool);
  const r = (await pool.query('SELECT * FROM cre8_sitegen WHERE id = $1', [parseInt(id, 10) || 0])).rows[0];
  if (!r || !token || String(token).length !== 32) return null;
  const a = Buffer.from(r.token), b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? r : null;
}

function system(style, tier) {
  const T = TIERS[tier] || TIERS.launch;
  return [
    "You design one-page concept websites for local businesses for Can't Wait to Cre8, a web design studio in Leonardo, New Jersey.",
    'A sales rep shows the concept to the business owner as a pitch, so it has to look custom, polished and real.',
    '',
    'OUTPUT: one complete HTML document and nothing else. Start with <!DOCTYPE html> and end with </html>. No markdown fences, no commentary.',
    '',
    'HONESTY RULES (never break these):',
    '- Use only the facts provided. Never invent reviews, testimonials, star ratings, awards, years in business, prices, staff names, certifications, client counts or statistics.',
    '- If a fact is missing, leave that detail out or use a neutral call to action, for example "Call for today\'s hours". Never use lorem ipsum or fake placeholder text like "123 Main St".',
    '- Do not add any concept or disclaimer banner. One is added automatically above your page.',
    '',
    'IMAGES:',
    '- The only image sources you may use are the placeholders listed in the message, written exactly, for example src="{{LOGO}}" or src="{{PHOTO1}}". No other image URLs.',
    '- Use every photo provided at least once (hero, gallery or feature sections). Use object-fit: cover so any photo shape looks good.',
    '- For decoration use CSS gradients, shapes and inline SVG icons.',
    '- Build the color palette from the logo and photos. State the palette as CSS custom properties on :root.',
    '',
    'BUILD:',
    '- Self-contained: inline <style> and <script>. The only external resource allowed is Google Fonts (pick a distinctive pairing that fits the business).',
    '- Mobile-first and responsive. No horizontal scroll at 360px wide. Readable contrast. Semantic sections. Include <meta name="viewport"> and <meta name="robots" content="noindex">.',
    '- Sticky header with the logo (or the business name in a strong wordmark if there is no logo) and one primary call to action: a tel: link if a phone is given, otherwise mailto: or a jump to #contact.',
    '- Sections, in an order that suits the business: hero (headline, subhead, call to action), what they offer (from the description), photo gallery, about (true and general, from what was provided), visit or contact (address, hours, phone, email, social links exactly as given, plus a Google Maps link if there is an address), footer.',
    '- Tasteful motion: scroll reveal, hover states, a subtle hero animation. Respect prefers-reduced-motion.',
    '- If you include a contact form, it must not send anywhere: on submit, prevent the default and show "Preview only: on the live site this message goes straight to [business name]\'s inbox."',
    '',
    T.build.join('\n'),
    '',
    '- Keep it under about ' + T.lines + ' lines.',
    '',
    'STYLE DIRECTION: ' + (style || 'Clean') + '.'
  ].join('\n');
}

function factsText(d, business, imgs) {
  const rows = [['Business name', business], ['What they do', d.kind], ['Town', d.town], ['Address', d.address], ['Phone', d.phone], ['Email', d.email],
    ['Hours', d.hours], ['Social links', d.social], ['More about them (from the rep)', d.about]].filter((r) => r[1]);
  const ph = imgs.map((i) => (i.n === 0 ? '{{LOGO}} = the logo (image 1 above)' : '{{PHOTO' + i.n + '}} = photo ' + i.n));
  return 'FACTS (the only facts you may use):\n' + rows.map((r) => '- ' + r[0] + ': ' + r[1]).join('\n') +
    '\n\nIMAGE PLACEHOLDERS:\n' + (ph.length ? ph.map((p) => '- ' + p).join('\n') : '- none: no images were provided, so design with color, type and SVG only');
}

// Calls Claude with streaming (long outputs) and returns the full text.
async function callClaude(body) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('The site builder is not set up yet (ANTHROPIC_API_KEY is missing).');
  const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), 9 * 60 * 1000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ model: MODEL(), max_tokens: 24000, stream: true }, body)) // max_tokens is overridden per package
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error('Design service error ' + res.status + (t ? ': ' + t.slice(0, 160) : '')); }
    const dec = new TextDecoder(); let buf = '', out = '';
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const ln = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!ln.startsWith('data:')) continue;
        let ev; try { ev = JSON.parse(ln.slice(5)); } catch (e) { continue; }
        if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') out += ev.delta.text;
        if (ev.type === 'error') throw new Error('Design service error: ' + ((ev.error && ev.error.message) || 'unknown'));
      }
    }
    return out;
  } finally { clearTimeout(to); }
}

function extractHtml(t) {
  const s = String(t || ''), a = s.search(/<!doctype html|<html[\s>]/i), b = s.toLowerCase().lastIndexOf('</html>');
  if (a < 0 || b < a) return null;
  return s.slice(a, b + 7);
}

async function run(pool, id) {
  try {
    await ensure(pool);
    const g = (await pool.query('SELECT * FROM cre8_sitegen WHERE id = $1', [id])).rows[0];
    const imgs = (await pool.query('SELECT n, type, data FROM cre8_sitegen_img WHERE gen_id = $1 ORDER BY n', [id])).rows;
    const d = g.details || {};
    const content = [];
    imgs.forEach((im, k) => {
      content.push({ type: 'text', text: 'Image ' + (k + 1) + ': ' + (im.n === 0 ? 'the business logo, placeholder {{LOGO}}' : 'photo ' + im.n + ', placeholder {{PHOTO' + im.n + '}}') });
      content.push({ type: 'image', source: { type: 'base64', media_type: im.type, data: im.data.toString('base64') } });
    });
    let ask = factsText(d, g.business, imgs);
    if (d.prev_html && d.notes) ask += '\n\nCURRENT VERSION OF THE PAGE:\n' + d.prev_html + '\n\nCHANGES THE REP ASKED FOR:\n' + d.notes + '\n\nApply the changes and return the full updated document. Keep everything else that works.';
    else ask += '\n\nDesign the concept website now.';
    content.push({ type: 'text', text: ask });
    const T = TIERS[d.tier] || TIERS.launch;
    const html = extractHtml(await callClaude({ max_tokens: T.tokens, system: system(d.style, d.tier), messages: [{ role: 'user', content }] }));
    if (!html) throw new Error('The design came back incomplete. Try again.');
    await pool.query("UPDATE cre8_sitegen SET status = 'done', html = $2, finished = now(), details = details - 'prev_html' WHERE id = $1", [id, html]);
  } catch (e) {
    console.error('cre8sitegen: job', id, e.message);
    pool.query("UPDATE cre8_sitegen SET status = 'failed', error = $2, finished = now() WHERE id = $1", [id, line(e.name === 'AbortError' ? 'The design took too long. Try again.' : e.message, 300)]).catch(() => {});
  }
}

// What the owner sees: the concept with a banner on top, image placeholders swapped for real URLs
function finalPage(g, base) {
  let h = String(g.html || '');
  h = h.replace(/\{\{LOGO\}\}/g, base + '/img/0').replace(/\{\{PHOTO(\d)\}\}/g, (m, n) => base + '/img/' + n);
  const bar = '<div style="position:relative;z-index:2147483647;background:#111014;color:#f5e6d6;font:14px/1.4 Arial,sans-serif;text-align:center;padding:8px 14px">' +
    'Concept preview designed by <a href="https://cantwaittocre8.com/websites" target="_blank" rel="noopener" style="color:#ffb21e;font-weight:700">Can\'t Wait to Cre8</a> for ' + esc(g.business) + '. Not the official ' + esc(g.business) + ' website.</div>';
  h = /<body[^>]*>/i.test(h) ? h.replace(/<body[^>]*>/i, (m) => m + bar) : bar + h;
  if (!/name=["']robots["']/i.test(h)) h = h.replace(/<head[^>]*>/i, (m) => m + '<meta name="robots" content="noindex, nofollow">');
  return h;
}

function routes(app, pool, ADMIN_KEY) {
  if (!pool) return;
  const isAdmin = (req) => !!ADMIN_KEY && req.get('x-admin-key') === ADMIN_KEY;
  const deny = (res) => res.status(401).json({ error: 'code', message: 'Open the playbook with the team code first.' });

  app.post('/api/cre8/sales/sitegen', async (req, res) => {
    if (!teamAllowed(req)) return deny(res);
    const b = req.body || {};
    const rep = line(b.rep_name, 80), business = line(b.business, 100);
    if (!rep) return res.status(400).json({ error: 'name', message: 'Add your name at the top of the page first.' });
    if (!business) return res.status(400).json({ error: 'business', message: 'Add the business name.' });
    const d = { kind: line(b.kind, 160), town: line(b.town, 80), address: line(b.address, 160), phone: line(b.phone, 40), email: line(b.email, 120),
      hours: text(b.hours, 300), social: text(b.social, 400), about: text(b.about, 2000), style: STYLES.includes(b.style) ? b.style : 'Clean', tier: TIERS[b.tier] ? b.tier : 'launch' };
    if (!d.kind) return res.status(400).json({ error: 'kind', message: 'Say what the business does.' });
    try {
      await ensure(pool);
      const token = crypto.randomBytes(16).toString('hex');
      const r = await pool.query('INSERT INTO cre8_sitegen (token, rep_name, business, details) VALUES ($1,$2,$3,$4) RETURNING id', [token, rep, business, JSON.stringify(d)]);
      res.json({ id: r.rows[0].id, token });
    } catch (e) { console.error('cre8sitegen: create', e.message); res.status(500).json({ error: 'failed', message: 'Could not start right now.' }); }
  });

  app.post('/api/cre8/sales/sitegen/:id/image', express.raw({ type: () => true, limit: MAX_IMG }), async (req, res) => {
    if (!teamAllowed(req)) return deny(res);
    const g = await load(pool, req.params.id, req.get('x-gen-token')).catch(() => null);
    if (!g || g.status !== 'queued') return res.status(404).json({ error: 'missing', message: 'This design is no longer open for uploads.' });
    const n = parseInt(req.query.n, 10), type = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!(n >= 0 && n <= MAX_PHOTOS)) return res.status(400).json({ error: 'n' });
    if (!OK_IMG.test(type)) return res.status(400).json({ error: 'type', message: 'Use PNG, JPG, WEBP or GIF images.' });
    if (!req.body || !req.body.length) return res.status(400).json({ error: 'empty' });
    try {
      await pool.query('INSERT INTO cre8_sitegen_img (gen_id, n, type, size, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (gen_id, n) DO UPDATE SET type = EXCLUDED.type, size = EXCLUDED.size, data = EXCLUDED.data',
        [g.id, n, type, req.body.length, req.body]);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'failed', message: 'Could not save that image.' }); }
  });

  async function start(req, res, g) {
    const ip = String(req.ip || '');
    if (limited('sg:' + ip, 10, 3600000)) { await pool.query("UPDATE cre8_sitegen SET status = 'failed', error = 'Hourly limit reached' WHERE id = $1", [g.id]).catch(() => {}); return res.status(429).json({ error: 'busy', message: 'That is 10 designs this hour. Try again later.' }); }
    const today = (await pool.query("SELECT count(*)::int AS n FROM cre8_sitegen WHERE started >= date_trunc('day', now())")).rows[0].n;
    if (today >= DAILY()) { await pool.query("UPDATE cre8_sitegen SET status = 'failed', error = 'Daily team limit reached' WHERE id = $1", [g.id]).catch(() => {}); return res.status(429).json({ error: 'cap', message: 'The team hit today\'s design limit. Ask Keith or try tomorrow.' }); }
    await pool.query("UPDATE cre8_sitegen SET status = 'working', started = now() WHERE id = $1", [g.id]);
    setImmediate(() => run(pool, g.id));
    res.json({ ok: true, status: 'working' });
  }

  app.post('/api/cre8/sales/sitegen/:id/start', async (req, res) => {
    if (!teamAllowed(req)) return deny(res);
    try {
      const g = await load(pool, req.params.id, (req.body || {}).t);
      if (!g) return res.status(404).json({ error: 'missing' });
      if (g.status !== 'queued') return res.json({ ok: true, status: g.status });
      await start(req, res, g);
    } catch (e) { console.error('cre8sitegen: start', e.message); res.status(500).json({ error: 'failed', message: 'Could not start right now.' }); }
  });

  app.get('/api/cre8/sales/sitegen/:id', async (req, res) => {
    if (!teamAllowed(req)) return deny(res);
    res.set('Cache-Control', 'no-store');
    try {
      const g = await load(pool, req.params.id, req.query.t);
      if (!g) return res.status(404).json({ error: 'missing' });
      if (g.status === 'working' && Date.now() - new Date(g.started) > 11 * 60 * 1000) {
        await pool.query("UPDATE cre8_sitegen SET status = 'failed', error = 'The design took too long. Try again.' WHERE id = $1", [g.id]);
        g.status = 'failed'; g.error = 'The design took too long. Try again.';
      }
      res.json({ status: g.status, error: g.error || '', url: g.status === 'done' ? '/concept/' + g.id + '/' + g.token : '', business: g.business });
    } catch (e) { res.status(500).json({ error: 'failed' }); }
  });

  app.post('/api/cre8/sales/sitegen/:id/revise', async (req, res) => {
    if (!teamAllowed(req)) return deny(res);
    const b = req.body || {}, notes = text(b.notes, 1500);
    if (!notes) return res.status(400).json({ error: 'notes', message: 'Say what to change.' });
    try {
      const g = await load(pool, req.params.id, b.t);
      if (!g || g.status !== 'done') return res.status(404).json({ error: 'missing', message: 'Open a finished design first.' });
      const token = crypto.randomBytes(16).toString('hex');
      const d = Object.assign({}, g.details, { notes, prev_html: g.html });
      const r = await pool.query('INSERT INTO cre8_sitegen (token, rep_name, business, details, parent_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [token, g.rep_name, g.business, JSON.stringify(d), g.id]);
      const nid = r.rows[0].id;
      await pool.query('INSERT INTO cre8_sitegen_img (gen_id, n, type, size, data) SELECT $1, n, type, size, data FROM cre8_sitegen_img WHERE gen_id = $2', [nid, g.id]);
      const ng = { id: nid, token };
      const out = { json: (o) => res.json(Object.assign({ id: nid, token }, o)), status: (c) => ({ json: (o) => res.status(c).json(o) }) };
      await start(req, out, ng);
    } catch (e) { console.error('cre8sitegen: revise', e.message); res.status(500).json({ error: 'failed', message: 'Could not start the new version.' }); }
  });

  // The concept page and its images: anyone with the secret link (reps send it to the owner)
  app.get('/concept/:id/:token', async (req, res) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    try {
      const g = await load(pool, req.params.id, req.params.token);
      if (!g || g.status !== 'done') return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Not found</title><p style="font-family:Arial;text-align:center;padding:60px">This concept is not available.</p>');
      res.set('Cache-Control', 'private, max-age=300');
      // Sandboxed: the page's own scripts run in an isolated origin, so they cannot touch cookies or the API
      res.set('Content-Security-Policy', 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms');
      res.set('X-Content-Type-Options', 'nosniff');
      res.type('html').send(finalPage(g, '/concept/' + g.id + '/' + g.token));
    } catch (e) { res.status(500).send('Error'); }
  });

  app.get('/concept/:id/:token/img/:n', async (req, res) => {
    try {
      const g = await load(pool, req.params.id, req.params.token);
      if (!g) return res.status(404).end();
      const im = (await pool.query('SELECT type, data FROM cre8_sitegen_img WHERE gen_id = $1 AND n = $2', [g.id, parseInt(req.params.n, 10) || 0])).rows[0];
      if (!im) return res.status(404).end();
      res.set('Cache-Control', 'private, max-age=86400'); res.set('X-Content-Type-Options', 'nosniff');
      res.type(im.type).send(im.data);
    } catch (e) { res.status(500).end(); }
  });

  app.get('/api/admin/cre8/sales/sitegen', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
    try {
      await ensure(pool);
      const rows = (await pool.query("SELECT g.id, g.token, g.rep_name, g.business, g.status, g.error, g.parent_id, g.created, g.finished, g.details->>'kind' AS kind, g.details->>'town' AS town, g.details->>'tier' AS tier, g.details->>'notes' AS notes, (SELECT count(*)::int FROM cre8_sitegen_img i WHERE i.gen_id = g.id) AS images FROM cre8_sitegen g ORDER BY g.id DESC LIMIT 200")).rows;
      const today = (await pool.query("SELECT count(*)::int AS n FROM cre8_sitegen WHERE started >= date_trunc('day', now())")).rows[0].n;
      res.json({ concepts: rows.map((r) => Object.assign(r, { url: r.status === 'done' ? '/concept/' + r.id + '/' + r.token : '' })), today, dailyCap: DAILY(), configured: !!process.env.ANTHROPIC_API_KEY });
    } catch (e) { res.status(500).json({ error: 'failed' }); }
  });

  app.delete('/api/admin/cre8/sales/sitegen/:id', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
    try { await ensure(pool); await pool.query('DELETE FROM cre8_sitegen WHERE id = $1', [parseInt(req.params.id, 10)]); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: 'failed' }); }
  });
}

module.exports = { routes, finalPage, extractHtml, system };
