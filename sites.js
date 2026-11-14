// Public websites served straight from this server, chosen by the domain the visitor typed.
// Each site is one HTML page in sites/<key>/index.html. Its images stay in public/<key>/ (served as /<key>/...).
// Pages served this way are real top-level pages, so Google reads all their text (an embed hides it).
//
//   https://<domain>/              the page
//   https://<domain>/robots.txt    allows crawling, points to the sitemap
//   https://<domain>/sitemap.xml   one URL, the home page
//   www.<domain> and alias domains 301 redirect to the main domain, same path (one address for Google)
//   anything else on the domain    404 page with a link home (/api/* and /<key>/* images still work)
//
// Preview before DNS points here: https://<render address>/site/<key>
// (sent with X-Robots-Tag: noindex so Google never indexes the preview as a duplicate).
//
// Env (optional): SITE_HOSTS_CRE8 extra comma-separated domains that should redirect to the Cre8 main domain.
const path = require('path');
const fs = require('fs');

const SITES = {
  // Main domain is cantwaittocre8.com. The .shop domain (kept for email) redirects here, so old links and labels still work.
  // Pages are assembled from sites/cre8/layout.html (shared head, menu, footer) plus sites/cre8/pages/<file>.html.
  // Shared styles and script live in public/cre8/site.css and site.js.
  cre8: {
    domain: 'cantwaittocre8.com', aliases: ['cantwaittocre8.shop'], envHosts: 'SITE_HOSTS_CRE8', layout: true,
    pages: { '/': 'home', '/how-it-works': 'how-it-works', '/websites': 'websites', '/about': 'about', '/contact': 'contact' },
    redirects: { '/home': '/', '/about-us': '/about', '/contact-us': '/contact', '/our-work': '/how-it-works#work', '/order': '/how-it-works#create', '/web-design': '/websites', '/website': '/websites' },
    meta: {
      home: ["Custom T-Shirt Printing, Embroidery &amp; Laser Engraving in Leonardo, NJ | Can't Wait to Cre8",
        'Custom shirts, hoodies, hats, embroidery, laser engraving, full color printing and website design in Leonardo, NJ. Free mockup before we print. Orders of 5 pieces or fewer done in 3 days.'],
      'how-it-works': ["How It Works: Custom Printing, Embroidery &amp; Engraving | Can't Wait to Cre8",
        'See how custom apparel, printing, embroidery, laser engraving and full color orders get made, browse our work, and start your order with a free mockup.'],
      websites: ["Website Design for Local Businesses in Leonardo, NJ | Can't Wait to Cre8",
        'Custom websites for Monmouth County businesses that launch search-ready, with lead forms, admin dashboards, Google reviews and Local Search plans. Build your package and see your price.'],
      about: ["About Us: The Story Behind Can't Wait to Cre8 | Leonardo, NJ",
        "Can't Wait to Cre8 started while founder Keith Simmonds Jr. was recovering from a spinal cord injury. Here is why we believe creating is what makes us feel alive."],
      contact: ["Contact Can't Wait to Cre8 | 37 Center Ave, Leonardo, NJ",
        'Call or text 732-720-9211, email ksimmonds@cantwaittocre8.com, or send us a message. Pick up at 37 Center Ave, Leonardo, NJ 07737.']
    }
  },
  // BB Blends: concept demo for a website pitch. Preview only at /site/bbblends (noindex). The .invalid domain never matches a real host.
  // One page in sites/bbblends/index.html; photos and logo in public/bbblends/.
  bbblends: { domain: 'bbblends.invalid', aliases: [], envHosts: 'SITE_HOSTS_BBBLENDS' }
};

function hostsFor(key) {
  const s = SITES[key];
  const extra = String(process.env[s.envHosts] || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  const alias = (s.aliases || []).reduce((a, d) => a.concat([d, 'www.' + d]), []);
  return [s.domain, 'www.' + s.domain].concat(alias, extra);
}

function siteForHost(host) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
  return Object.keys(SITES).find((k) => hostsFor(k).includes(h)) || null;
}

const VERSION = Date.now().toString(36); // busts browser caches of site.css and site.js on every deploy
const pageCache = {};

// Layout sites: shared layout plus one body file per page. base is '' on the domain, '/site/<key>' on the preview.
function buildPage(key, name, base) {
  const ck = 'L:' + key + '/' + name + '|' + base;
  if (pageCache[ck]) return pageCache[ck];
  const dir = path.join(__dirname, 'sites', key);
  const S = SITES[key], meta = (S.meta && S.meta[name]) || ['', ''];
  const canonical = Object.keys(S.pages).find((u) => S.pages[u] === name) || '/';
  let extra = '';
  try { extra = fs.readFileSync(path.join(dir, name + '-head.html'), 'utf8'); } catch (e) { /* optional */ }
  const html = fs.readFileSync(path.join(dir, 'layout.html'), 'utf8')
    .replace('{{BODY}}', () => fs.readFileSync(path.join(dir, 'pages', name + '.html'), 'utf8'))
    .replace('{{HEAD_EXTRA}}', () => extra)
    .replace(/\{\{TITLE\}\}/g, meta[0]).replace(/\{\{DESC\}\}/g, meta[1])
    .replace(/\{\{CANONICAL\}\}/g, canonical).replace(/\{\{ROBOTS\}\}/g, base ? 'noindex' : 'index, follow')
    .replace(/\{\{PAGE\}\}/g, name).replace(/\{\{V\}\}/g, VERSION).replace(/\{\{BASE\}\}/g, base);
  pageCache[ck] = html;
  return html;
}
function page(key, name) {
  // Read once per deploy; Render restarts the server on every push, which refreshes it.
  const f = name || 'index', ck = key + '/' + f;
  if (!pageCache[ck]) pageCache[ck] = fs.readFileSync(path.join(__dirname, 'sites', key, f + '.html'), 'utf8');
  return pageCache[ck];
}

function sendPage(res, key, noindex, name) {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (noindex) res.set('X-Robots-Tag', 'noindex');
  if (SITES[key].layout) return res.send(buildPage(key, name || 'home', noindex ? '/site/' + key : ''));
  let html = page(key, name);
  // Preview only: point the menu links at the preview paths so every page opens before the domain is connected
  if (noindex && SITES[key].pages) {
    html = html.replace(/href="(\/[a-z0-9-]*)(\?[^"#]*)?(#[a-z0-9-]+)?"/g, (m, u, q, h) => (SITES[key].pages[u] ? 'href="/site/' + key + (u === '/' ? '' : u) + (q || '') + (h || '') + '"' : m));
  }
  res.send(html);
}

function notFound(res, key) {
  const d = SITES[key].domain;
  res.status(404).set('Content-Type', 'text/html; charset=utf-8').send(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>Page not found</title></head>' +
    '<body style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px">' +
    '<h1>Page not found</h1><p><a href="https://' + d + '/">Go to the home page</a></p></body></html>'
  );
}

function middleware() {
  return function sitesRouter(req, res, next) {
    // Preview on the Render address, before the domain points here
    const pv = req.path.match(/^\/site\/([a-z0-9-]+)(\/[a-z0-9-]+)?\/?$/);
    if (pv && SITES[pv[1]]) {
      const pg = SITES[pv[1]].pages;
      if (!pv[2]) return sendPage(res, pv[1], true, pg ? pg['/'] : null);
      if (pg && pg[pv[2]]) return sendPage(res, pv[1], true, pg[pv[2]]);
    }

    const key = siteForHost(req.hostname);
    if (!key) return next();
    const d = SITES[key].domain;

    // API calls and images work on every domain (a redirect would turn a form POST into a GET and lose it)
    if (req.path.startsWith('/api/') || req.path.startsWith('/' + key + '/')) return next();
    if (String(req.hostname).toLowerCase() !== d) return res.redirect(301, 'https://' + d + req.originalUrl);
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    // Cre8 sales team playbook: cantwaittocre8.com/team (team code gate and noindex live in cre8sales.js; never in the sitemap)
    // Site Builder concept pages (secret links reps send to owners): cantwaittocre8.com/concept/<id>/<token>
    if (key === 'cre8' && req.path.startsWith('/concept/')) return next();
    // Client access agreements (secret signing links): cantwaittocre8.com/agreement/<id>/<token>
    if (key === 'cre8' && req.path.startsWith('/agreement/')) return next();
    // Monthly Search Reports for Local Search clients: cantwaittocre8.com/report/<id>/<token>
    if (key === 'cre8' && req.path.startsWith('/report/')) return next();
    const tm = key === 'cre8' && req.path.match(/^\/team(\/(pay|pitch|objections|builder|quiz|log))?\/?$/);
    if (tm) { req.url = '/cre8-sales' + (tm[1] || '') + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''); return next(); }

    const S = SITES[key];
    if (S.redirects && S.redirects[req.path]) return res.redirect(301, S.redirects[req.path]);
    // Pages win over prefix redirects, so restored posts can live at their old /f/ addresses
    const pr = !(S.pages && S.pages[req.path.replace(/\/+$/, '')]) && (S.prefixRedirects || []).find((x) => req.path.startsWith(x[0]));
    if (pr) return res.redirect(301, pr[1]);
    if (S.pages) {
      const p = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
      if (p !== req.path) return res.redirect(301, p);
      if (S.pages[p]) return sendPage(res, key, false, S.pages[p]);
      if (p === '/llms.txt') return res.type('text/plain').send(fs.readFileSync(path.join(__dirname, 'sites', key, 'llms.txt'), 'utf8'));
    }
    if (req.path === '/') return sendPage(res, key, false);
    if (req.path === '/index.html') return res.redirect(301, '/');
    if (req.path === '/robots.txt') {
      return res.type('text/plain').send('User-agent: *\nAllow: /\n\nSitemap: https://' + d + '/sitemap.xml\n');
    }
    if (req.path === '/sitemap.xml' && S.pages) {
      const day = new Date().toISOString().slice(0, 10);
      return res.type('application/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        Object.keys(S.pages).map((u) => '  <url><loc>https://' + d + (u === '/' ? '/' : u) + '</loc><lastmod>' + day + '</lastmod></url>\n').join('') + '</urlset>\n'
      );
    }
    if (req.path === '/sitemap.xml') {
      return res.type('application/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        '  <url><loc>https://' + d + '/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n'
      );
    }
    if (req.path === '/favicon.ico') return res.redirect(301, '/' + key + '/favicon.png');
    // Never expose the Live Above admin pages or other sites on this domain
    return notFound(res, key);
  };
}

module.exports = { middleware, siteForHost, hostsFor, SITES };
