// Can't Wait to Cre8: Client Access Authorization agreements with an electronic signature.
// Keith creates a signing link for a client in the Cre8 admin (AGREEMENTS tab), listing the accounts Cre8 needs.
// The client opens the link, reads the agreement, draws and types their signature, and both sides get the signed copy.
//
// Public (secret link):
//   GET  /agreement/:id/:token              the agreement page (to sign, or the signed copy once signed). Never indexed.
//   GET  /api/cre8/agreements/:id/:token    agreement data for that page
//   POST /api/cre8/agreements/:id/:token    { name, title, email, signature (PNG data URL), consent: true } signs it
// Admin (x-admin-key):
//   GET    /api/admin/cre8/agreements       all agreements (no signature images)
//   POST   /api/admin/cre8/agreements       { client_name, business, email, access: [keys], other } -> { id, token, url }
//   DELETE /api/admin/cre8/agreements/:id
// The full agreement text is saved with each agreement when it is created, so editing the template later never changes
// an agreement already sent or signed. Each signature stores a SHA-256 hash of that exact text, the time, IP address and
// browser, so the signed copy can be proven unchanged.
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { resend } = require('./cre8');

const VERSION = '2026-11-04';
const SITE = 'https://cantwaittocre8.com';
const NOTIFY = () => String(process.env.CRE8_NOTIFY || 'ksimmonds@cantwaittocre8.com').trim();
const ACCESS = {
  domain: 'Domain registrar and DNS settings (for example GoDaddy)',
  hosting: 'Website hosting and deployment accounts (for example Render)',
  existing_site: 'Existing website or site builder (for example Wix, Squarespace or WordPress)',
  google_business: 'Google Business Profile',
  search: 'Google Search Console and Google Analytics',
  email: 'Email provider settings, limited to the DNS records email needs',
  payments: 'Payment processor (Stripe or Square), through restricted API keys or a limited team role',
  api_keys: 'Third-party API keys (for example Google Maps, booking, forms or email delivery services)',
  social: 'Social media business pages, for linking and embedding only'
};
const line = (s, n) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanEmail = (e) => { const s = String(e || '').trim().toLowerCase().slice(0, 200); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''; };

// The agreement, as sections of plain text. {client} and {business} are filled in; the access list is inserted in section 1.
function sections(a) {
  const who = a.business || a.client_name;
  return [
    ['Parties', `This Client Access Authorization ("Agreement") is between Can't Wait to Cre8, 37 Center Ave, Leonardo, New Jersey 07737 ("Cre8"), and ${who} ("Client"), signed by the person named below. It covers the access Cre8 needs to build, launch and maintain Client's website and related online services ("Services") under the proposal, quote or service agreement the parties have agreed to.`],
    ['1. Access Client authorizes', 'Client authorizes Cre8 to access, configure and manage the following accounts, systems and restricted areas, only as needed to perform the Services:', 'ACCESS_LIST'],
    ['2. How access is given', 'Wherever a platform allows it, Client will add Cre8 as a team member, delegate or user with only the permissions the work needs, instead of sharing Client\'s own password. Where an API key is needed, Client will create a restricted key limited to the functions the website uses. Client keeps its own owner or administrator access to every account at all times and may remove Cre8\'s access at any time.'],
    ['3. Client stays the owner', 'Every account, domain, listing, key and the data inside them remain Client\'s property. Cre8 claims no ownership of them. Accounts Cre8 sets up for Client will be created in Client\'s name, or transferred to Client on request.'],
    ['4. How Cre8 handles credentials', 'Cre8 will keep passwords, API keys and other credentials confidential; store them only in an encrypted password manager or in the encrypted environment settings of the hosting service, never in website code or shared documents; send them only through secure channels; and limit access to the people performing the Services, each bound to confidentiality. Cre8 will not sell, share or reuse Client\'s credentials or data for any other purpose.'],
    ['5. Limits on what Cre8 will do', 'Cre8 will not initiate charges, payments, transfers, refunds or payouts; change bank, payout or billing details; delete Client accounts or data; or change account ownership, unless Client asks for that specific action in writing. Cre8 will tell Client before any change that could interrupt email, payments or the live website, and will make such changes at an agreed time where possible.'],
    ['6. Client responsibilities', 'Client confirms it has the authority to grant this access. Client will keep two-step verification turned on where available, keep its own recovery details current, tell Cre8 about changes to the accounts listed above, and follow each platform\'s terms of service. Some platforms do not allow password sharing, which is why delegated access is used.'],
    ['7. Security incidents', 'If Cre8 learns or suspects that any credential or account in its care has been exposed or misused, Cre8 will notify Client without unreasonable delay and within 72 hours, help secure the affected account, and recommend which passwords or keys to change.'],
    ['8. When the work ends', 'When the Services end, or at any time Client asks, Cre8 will stop using Client\'s access, hand over any credentials it created for Client, and delete stored copies of Client\'s credentials within 14 days. Client should then remove Cre8 as a user and change any shared passwords and API keys.'],
    ['9. Confidentiality', 'Information Cre8 sees while working in Client\'s accounts, including customer, sales and business information, is confidential. Cre8 will use it only to perform the Services and will not disclose it unless required by law.'],
    ['10. Third-party services and liability', 'The platforms listed above are run by third parties. Cre8 is not responsible for their outages, policy changes, fees or security failures, or for changes made by Client or anyone Client gives access to. Except for gross negligence or willful misconduct, Cre8\'s total liability connected with this Agreement is limited to the fees Client paid Cre8 for the Services in the 12 months before the claim.'],
    ['11. Term', 'This Agreement starts when Client signs it and continues while Cre8 provides Services. Either party may end it with written notice. Sections 3, 4, 8, 9 and 10 continue after it ends.'],
    ['12. Electronic signature', 'The parties agree to sign electronically. Client\'s drawn signature, typed name and confirmation below have the same effect as a handwritten signature under the federal E-SIGN Act and the New Jersey Uniform Electronic Transactions Act. Client may ask Cre8 for a paper copy at any time.'],
    ['13. General', 'This Agreement is governed by the laws of the State of New Jersey. It works together with the parties\' proposal or service agreement; if they conflict about account access or credentials, this Agreement controls. Changes must be in writing and agreed by both parties.']
  ];
}
function accessList(a) {
  const items = (a.access || []).filter((k) => ACCESS[k]).map((k) => ACCESS[k]);
  if (a.other) items.push(a.other);
  return items.length ? items : ['The accounts listed in Client\'s proposal or service agreement'];
}
// The text saved with an agreement: [{ title, text, list }]
function snapshot(a) { return sections(a).map((s) => ({ title: s[0], text: s[1], list: s[2] ? accessList(a) : null })); }
// The exact words the client sees, as one string: this is what the signature hash covers
function canonical(snap, version) {
  return snap.map((s) => s.title + '\n' + s.text + (s.list ? '\n' + s.list.map((i) => '- ' + i).join('\n') : '')).join('\n\n') + '\n\nVersion ' + version;
}

let ready = null;
function ensure(pool) {
  if (!ready) {
    ready = pool.query(`CREATE TABLE IF NOT EXISTS cre8_agreements (
      id SERIAL PRIMARY KEY,
      token TEXT NOT NULL,
      version TEXT NOT NULL,
      client_name TEXT NOT NULL,
      business TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      access JSONB NOT NULL DEFAULT '[]',
      other TEXT NOT NULL DEFAULT '',
      sections JSONB NOT NULL DEFAULT '[]',
      created TIMESTAMPTZ NOT NULL DEFAULT now(),
      viewed TIMESTAMPTZ,
      signed TIMESTAMPTZ,
      signer_name TEXT,
      signer_title TEXT,
      signer_email TEXT,
      signature TEXT,
      text_hash TEXT,
      ip TEXT,
      user_agent TEXT
    )`).catch((e) => { ready = null; throw e; });
  }
  return ready;
}
async function load(pool, id, token) {
  await ensure(pool);
  const r = (await pool.query('SELECT * FROM cre8_agreements WHERE id = $1', [parseInt(id, 10) || 0])).rows[0];
  if (!r || String(token || '').length !== 32) return null;
  const a = Buffer.from(r.token), b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? r : null;
}
const linkOf = (a) => SITE + '/agreement/' + a.id + '/' + a.token;

const hits = new Map();
function limited(key, max) {
  const now = Date.now(), h = (hits.get(key) || []).filter((t) => now - t < 3600000);
  h.push(now); hits.set(key, h); if (hits.size > 5000) hits.clear();
  return h.length > max;
}

async function mailSigned(a) {
  const who = a.business || a.client_name, url = linkOf(a);
  const body = (greet) => '<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;max-width:560px">' +
    '<p>' + greet + '</p><p>The Client Access Authorization for <b>' + esc(who) + '</b> was signed by ' + esc(a.signer_name) + (a.signer_title ? ', ' + esc(a.signer_title) : '') +
    ' on ' + esc(new Date(a.signed).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' })) + ' (Eastern).</p>' +
    '<p><a href="' + url + '" style="display:inline-block;background:#ff3d7f;color:#fff;padding:11px 18px;border-radius:999px;text-decoration:none;font-weight:700">View or print the signed copy</a></p>' +
    '<p style="color:#666;font-size:13px">Keep this email. The link always shows the signed agreement exactly as it was signed.</p></div>';
  const jobs = [resend({ to: [NOTIFY()], subject: 'Signed: Client Access Authorization, ' + who, html: body('Hi Keith,') })];
  if (a.signer_email) jobs.push(resend({ to: [a.signer_email], reply_to: NOTIFY(), subject: "Your signed agreement with Can't Wait to Cre8", html: body('Hi ' + esc(a.signer_name.split(' ')[0]) + ', thank you.') }));
  await Promise.all(jobs.map((j) => j.catch(() => false)));
}

function routes(app, pool, ADMIN_KEY) {
  if (!pool) return;
  const isAdmin = (req) => !!ADMIN_KEY && req.get('x-admin-key') === ADMIN_KEY;

  app.get('/agreement/:id/:token', (req, res) => {
    res.set('X-Robots-Tag', 'noindex, nofollow'); res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
    res.type('html').send(fs.readFileSync(path.join(__dirname, 'views', 'cre8-agreement.html'), 'utf8'));
  });

  app.get('/api/cre8/agreements/:id/:token', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const a = await load(pool, req.params.id, req.params.token);
      if (!a) return res.status(404).json({ error: 'missing', message: 'This agreement link is not valid. Ask Cre8 for a new one.' });
      if (!a.viewed) pool.query('UPDATE cre8_agreements SET viewed = now() WHERE id = $1', [a.id]).catch(() => {});
      res.json({ version: a.version, client_name: a.client_name, business: a.business, email: a.email, created: a.created,
        sections: a.sections,
        signed: a.signed ? { at: a.signed, name: a.signer_name, title: a.signer_title, email: a.signer_email, signature: a.signature, hash: a.text_hash, ip: a.ip } : null });
    } catch (e) { res.status(500).json({ error: 'failed' }); }
  });

  app.post('/api/cre8/agreements/:id/:token', async (req, res) => {
    const b = req.body || {};
    if (limited('ag:' + String(req.ip || ''), 20)) return res.status(429).json({ error: 'busy', message: 'Too many tries. Wait a bit and try again.' });
    try {
      const a = await load(pool, req.params.id, req.params.token);
      if (!a) return res.status(404).json({ error: 'missing', message: 'This agreement link is not valid.' });
      if (a.signed) return res.status(409).json({ error: 'signed', message: 'This agreement is already signed.' });
      const name = line(b.name, 120), title = line(b.title, 80), email = cleanEmail(b.email) || a.email;
      const sig = String(b.signature || '');
      if (name.length < 3) return res.status(400).json({ error: 'name', message: 'Type your full legal name.' });
      if (!b.consent) return res.status(400).json({ error: 'consent', message: 'Check the box to confirm you agree and are signing electronically.' });
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length < 1500) return res.status(400).json({ error: 'signature', message: 'Draw your signature in the box.' });
      if (sig.length > 400000) return res.status(400).json({ error: 'signature', message: 'That signature image is too large. Clear it and sign again.' });
      const hash = crypto.createHash('sha256').update(canonical(a.sections, a.version)).digest('hex');
      const r = await pool.query('UPDATE cre8_agreements SET signed = now(), signer_name = $2, signer_title = $3, signer_email = $4, signature = $5, text_hash = $6, ip = $7, user_agent = $8 WHERE id = $1 AND signed IS NULL RETURNING *',
        [a.id, name, title, email, sig, hash, String(req.ip || '').slice(0, 64), String(req.get('user-agent') || '').slice(0, 300)]);
      if (!r.rows[0]) return res.status(409).json({ error: 'signed', message: 'This agreement is already signed.' });
      mailSigned(r.rows[0]).catch(() => {});
      res.json({ ok: true });
    } catch (e) { console.error('cre8agree: sign', e.message); res.status(500).json({ error: 'failed', message: 'Could not save your signature. Try again.' }); }
  });

  app.get('/api/admin/cre8/agreements', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
    try {
      await ensure(pool);
      const rows = (await pool.query('SELECT id, token, version, client_name, business, email, access, other, created, viewed, signed, signer_name, signer_title, signer_email, text_hash, ip FROM cre8_agreements ORDER BY id DESC LIMIT 300')).rows;
      res.json({ agreements: rows.map((r) => Object.assign(r, { url: linkOf(r), token: undefined })), access: ACCESS });
    } catch (e) { res.status(500).json({ error: 'failed' }); }
  });

  app.post('/api/admin/cre8/agreements', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
    const b = req.body || {};
    const client = line(b.client_name, 120);
    if (!client) return res.status(400).json({ error: 'name', message: 'Add the client\'s name.' });
    const access = (Array.isArray(b.access) ? b.access : []).filter((k) => ACCESS[k]);
    try {
      await ensure(pool);
      const token = crypto.randomBytes(16).toString('hex');
      const a = { client_name: client, business: line(b.business, 120), access, other: line(b.other, 200) };
      const r = await pool.query('INSERT INTO cre8_agreements (token, version, client_name, business, email, access, other, sections) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, token',
        [token, VERSION, client, a.business, cleanEmail(b.email), JSON.stringify(access), a.other, JSON.stringify(snapshot(a))]);
      res.json({ id: r.rows[0].id, url: linkOf(r.rows[0]) });
    } catch (e) { console.error('cre8agree: create', e.message); res.status(500).json({ error: 'failed', message: 'Could not create the agreement.' }); }
  });

  app.delete('/api/admin/cre8/agreements/:id', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
    try { await ensure(pool); await pool.query('DELETE FROM cre8_agreements WHERE id = $1', [parseInt(req.params.id, 10)]); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: 'failed' }); }
  });
}

module.exports = { routes, canonical, snapshot, ACCESS, VERSION };
