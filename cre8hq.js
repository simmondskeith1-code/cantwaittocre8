// hq.cantwaittocre8.com: one private address for Can't Wait to Cre8 business tools, separate from the public site
// and from the Live Above dashboard. Same Render service as the public site, chosen by the domain the visitor typed.
//   / and /admin       Cre8 admin dashboard: overview, quotes, website leads, messages, sales team, reviews, tools
//   /sales             sales team playbook (team code gate lives in cre8sales.js)
//   /cre8-dashboard    (Render address only) the same dashboard, before the hq domain is connected
//   /demos/bbblends    website concept demos for pitches
// Only Cre8 pages, Cre8 images and the API work on this domain. Live Above pages (admin.html etc.) return 404.
// Never indexed: every response is noindex and robots.txt disallows everything.
// Env (optional): CRE8_HQ_HOSTS comma-separated hosts (default hq.cantwaittocre8.com).
// Setup: GoDaddy DNS CNAME  hq -> <this service>.onrender.com, then add hq.cantwaittocre8.com under
//        Render > Settings > Custom Domains.
const path = require('path');
const fs = require('fs');

const HOSTS = () => String(process.env.CRE8_HQ_HOSTS || 'hq.cantwaittocre8.com').toLowerCase().split(',').map((h) => h.trim()).filter(Boolean);
const DEMOS = { bbblends: path.join(__dirname, 'sites', 'bbblends', 'index.html') };
const STATIC_OK = /^\/(cre8|bbblends|concept|agreement|report)\//;
const FILES_OK = ['/cre8-admin.html', '/cre8-sales-admin.html'];

function send(res, file) {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(fs.readFileSync(file, 'utf8'));
}

function middleware() {
  return function cre8hq(req, res, next) {
    const host = String(req.hostname || '').toLowerCase();
    if (!HOSTS().includes(host)) {
      // the same dashboard on the Render address, usable before the hq domain is connected
      if (req.path === '/cre8-dashboard' && req.method === 'GET') { res.set('X-Robots-Tag', 'noindex, nofollow'); return send(res, path.join(__dirname, 'views', 'cre8-hq-admin.html')); }
      return next();
    }
    res.set('X-Robots-Tag', 'noindex, nofollow');
    const p = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;

    if (p.startsWith('/api/') || STATIC_OK.test(p) || FILES_OK.includes(p)) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).end();
    if (p === '/robots.txt') return res.type('text/plain').send('User-agent: *\nDisallow: /\n');
    if (p === '/favicon.ico') return res.redirect(301, '/cre8/favicon.png');
    if (p === '/' || p === '/admin') return send(res, path.join(__dirname, 'views', 'cre8-hq-admin.html'));
    const sm = p.match(/^\/(sales|cre8-sales)(\/(pay|pitch|objections|builder|quiz|log))?$/);
    if (sm) { req.url = '/cre8-sales' + (sm[2] || '') + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''); return next(); }
    const demo = p.match(/^\/demos\/([a-z0-9-]+)$/);
    if (demo && DEMOS[demo[1]]) return send(res, DEMOS[demo[1]]);
    res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Not found</title>' +
      '<body style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px;background:#111014;color:#fff"><h1>Page not found</h1><p><a href="/" style="color:#ff3d7f">Cre8 HQ home</a></p></body>');
  };
}

module.exports = { middleware, HOSTS };
