// Can't Wait to Cre8: the shop's own server, separate from Live Above.
//   cantwaittocre8.com      public site (sites.js), quote form with uploads and mockups (cre8.js)
//   hq.cantwaittocre8.com   private business tools: admin, sales team, Site Builder (cre8hq.js)
//   /site/cre8              preview on the Render address before DNS points here (noindex)
// Env: DATABASE_URL, ADMIN_KEY, RESEND_API_KEY, CRE8_* (see README.md for the full list).
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const cre8 = require('./cre8'); // quote requests with uploads, contact messages
const cre8sales = require('./cre8sales'); // sales team playbook, drill scores, lead log
const sites = require('./sites'); // public site served by domain, so Google reads every page
const googlereviews = require('./googlereviews'); // Google reviews and photos for the site

const app = express();
app.set('trust proxy', 1); // Render sits in front: req.ip is the real client IP

// Browsers may call the API only from Cre8's own domains. Calls with no Origin (server to server) are unaffected.
const CORS_EXTRA = String(process.env.CORS_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
function corsOk(origin) {
  if (!origin || origin === 'null' || CORS_EXTRA.indexOf(origin) !== -1) return true;
  try {
    const h = new URL(origin).hostname;
    return /(^|\.)(cantwaittocre8\.(com|shop)|onrender\.com)$/.test(h) || h === 'localhost';
  } catch (e) { return false; }
}
app.use(cors({ origin: function (origin, cb) { cb(null, corsOk(origin)); } }));
app.use(express.json({ limit: '1mb' }));
app.use(require('./cre8hq').middleware()); // hq domain first, so it only ever shows Cre8 tools
app.use(sites.middleware()); // must run before static files so the site's domain never shows admin pages

// The Render address (no custom domain): send the bare root to the site preview
app.get('/', (req, res, next) => (sites.siteForHost(req.hostname) ? next() : res.redirect(302, '/site/cre8')));
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Render's INTERNAL connection string (host with no dot) does not use SSL; the EXTERNAL one does.
function sslFor(cs) {
  if (!cs) return false;
  try { return new URL(cs).hostname.includes('.') ? { rejectUnauthorized: false } : false; } catch (e) { return false; }
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslFor(process.env.DATABASE_URL) });

const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me';
if (ADMIN_KEY === 'change-me') console.warn('ADMIN_KEY is not set: admin APIs are using the default key. Set it in Render.');

googlereviews.routes(app);
cre8.routes(app, pool, ADMIN_KEY);
cre8sales.routes(app, pool, ADMIN_KEY);
require('./cre8search').routes(app, pool, ADMIN_KEY); // Local Search plans: monthly client Search Reports
require('./cre8agree').routes(app, pool, ADMIN_KEY); // client access agreements with e-signature
require('./cre8sitegen').routes(app, pool, ADMIN_KEY); // Site Builder: reps generate concept websites with Claude

const PORT = process.env.PORT || 3000;
cre8.ensureTables(pool)
  .then(() => {
    app.use(function (err, req, res, next) {
      console.error('request error ' + req.method + ' ' + String(req.path).slice(0, 80) + ':', err && err.message ? err.message : err);
      if (res.headersSent) return next(err);
      res.status(err && err.status && err.status < 500 ? err.status : 500).json({ error: 'server error' });
    });
    app.listen(PORT, () => console.log("Can't Wait to Cre8 server running on port " + PORT));
  })
  .catch((err) => { console.error('Failed to reach the database:', err); process.exit(1); });
