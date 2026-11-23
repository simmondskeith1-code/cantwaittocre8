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
// Preview before DNS points here: https://live-above-scorecard.onrender.com/site/<key>
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
    pages: { '/': 'home', '/how-it-works': 'how-it-works', '/custom-t-shirts': 'custom-t-shirts', '/custom-hoodies': 'custom-hoodies', '/custom-hats': 'custom-hats', '/custom-tumblers': 'custom-tumblers', '/laser-engraving': 'laser-engraving', '/custom-journals': 'custom-journals', '/custom-stickers': 'custom-stickers', '/custom-phone-cases': 'custom-phone-cases', '/embroidery': 'embroidery', '/dtf-printing': 'dtf-printing', '/business-apparel': 'business-apparel', '/team-uniforms': 'team-uniforms', '/event-shirts': 'event-shirts', '/custom-gifts': 'custom-gifts', '/areas-we-serve': 'areas-we-serve', '/websites': 'websites', '/about': 'about', '/contact': 'contact' },
    redirects: { '/home': '/', '/about-us': '/about', '/contact-us': '/contact', '/our-work': '/how-it-works#work', '/order': '/how-it-works#create', '/t-shirts': '/custom-t-shirts', '/phone-cases': '/custom-phone-cases', '/stickers': '/custom-stickers', '/engraving': '/laser-engraving', '/hats': '/custom-hats', '/tumblers': '/custom-tumblers', '/journals': '/custom-journals', '/hoodies': '/custom-hoodies', '/web-design': '/websites', '/website': '/websites', '/gifts': '/custom-gifts', '/dtf': '/dtf-printing', '/dtf-transfers': '/dtf-printing', '/uniforms': '/team-uniforms', '/team-shirts': '/team-uniforms', '/family-reunion-shirts': '/event-shirts', '/corporate-apparel': '/business-apparel', '/service-area': '/areas-we-serve' },
    meta: {
      home: ["Custom T-Shirt Printing, Embroidery &amp; Laser Engraving in Leonardo, NJ | Can't Wait to Cre8",
        'Custom shirts, hoodies, hats, tumblers, mugs, stickers, phone cases, journals, embroidery and laser engraving in Leonardo, NJ. Free mockup before we print. No minimum.'],
      'how-it-works': ["How It Works: Custom Printing, Embroidery &amp; Engraving | Can't Wait to Cre8",
        'See how custom apparel, printing, embroidery, laser engraving and full color orders get made, browse our work, and start your order with a free mockup.'],
      websites: ["Website Design for Local Businesses in Leonardo, NJ | Can't Wait to Cre8",
        'Custom websites for Monmouth County businesses that launch search-ready, with lead forms, admin dashboards, Google reviews and Local Search plans. Build your package and see your price.'],
      about: ["About Us: The Story Behind Can't Wait to Cre8 | Leonardo, NJ",
        "Can't Wait to Cre8 started while founder Keith Simmonds Jr. was recovering from surgery for severe spinal stenosis. Here is why we believe creating is what makes us feel alive."],
      'custom-t-shirts': ["Custom T-Shirt Printing in Leonardo, NJ | Can't Wait to Cre8",
        "Custom t-shirts for businesses, teams, events and family reunions in Leonardo, NJ. Heat press and full color printing, no minimum, free mockup, from $12."],
      'custom-hoodies': ["Custom Hoodies &amp; Sweatshirts in Leonardo, NJ | Can't Wait to Cre8",
        "Custom hoodies and crewneck sweatshirts printed with your logo or design in Leonardo, NJ. Front, back and sleeves. Free mockup, no minimum, from $25."],
      'custom-hats': ["Custom Embroidered Hats &amp; Beanies in Leonardo, NJ | Can't Wait to Cre8",
        "Custom hats, trucker caps, snapbacks and beanies with your logo, embroidered or printed, in Leonardo, NJ. Free mockup, no minimum, from $17."],
      'custom-tumblers': ["Custom Engraved Tumblers &amp; Mugs in Leonardo, NJ | Can't Wait to Cre8",
        "Laser engraved and printed tumblers and mugs with names, logos and dates in Leonardo, NJ. Great gifts for weddings, teams and staff. Mugs from $10."],
      'laser-engraving': ["Laser Engraving in Leonardo, NJ: Wood, Glass, Metal | Can't Wait to Cre8",
        "Laser engraving on wood signs, cutting boards, glass, metal, leather and acrylic in Leonardo, NJ. Wedding gifts, plaques and business items. From $23."],
      'custom-journals': ["Custom Journals &amp; Notebooks in Leonardo, NJ | Can't Wait to Cre8",
        "Personalized journals and notebooks with names, logos and art on the cover in Leonardo, NJ. Engraved, full color or raised texture. From $21."],
      'custom-stickers': ["Custom Stickers &amp; Decals in Leonardo, NJ | Can't Wait to Cre8",
        "Full color custom stickers and decals in any shape for brands, events and merch in Leonardo, NJ. 25 stickers for $22. Free mockup before we print."],
      'custom-phone-cases': ["Custom Phone Cases in Leonardo, NJ | 2D &amp; 3D | Can't Wait to Cre8",
        "Custom phone cases with your photo, art or logo in Leonardo, NJ. 2D flat print $30 or raised 3D texture you can feel $65. Free mockup first."],
      'dtf-printing': ["DTF Printing in Leonardo, NJ: Full Color on Any Fabric | Can't Wait to Cre8",
        "DTF (direct to film) printing in Leonardo, NJ. Full color designs on cotton, polyester, blends, dark or light fabric. No minimum, free mockup, from $12."],
      'embroidery': ["Custom Embroidery in Leonardo, NJ: Logos, Hats, Polos | Can't Wait to Cre8",
        "Custom logo embroidery on hats, polos, jackets, hoodies and uniforms in Leonardo, NJ. Premium stitched finish, free mockup, no minimum."],
      'business-apparel': ["Custom Business Apparel &amp; Staff Uniforms in Leonardo, NJ | Can't Wait to Cre8",
        "Logo shirts, polos, hoodies and hats for your staff, plus branded mugs, stickers and engraved gifts, made in Leonardo, NJ. Free mockup, no minimum."],
      'team-uniforms': ["Custom Team Shirts &amp; Uniforms in Leonardo, NJ | Can't Wait to Cre8",
        "Custom team shirts, names and numbers, hoodies and hats for youth sports, schools, churches and clubs in Leonardo, NJ. Free mockup, no minimum."],
      'event-shirts': ["Family Reunion &amp; Event T-Shirts in Leonardo, NJ | Can't Wait to Cre8",
        "Custom shirts for family reunions, birthdays, memorials, bachelorette trips, cookouts and charity walks in Leonardo, NJ. Photos welcome. No minimum."],
      'custom-gifts': ["Personalized Gifts in Leonardo, NJ: Engraved, Printed | Can't Wait to Cre8",
        "Personalized gifts in Leonardo, NJ: engraved tumblers, wood signs, cutting boards, journals, mugs and photo phone cases. Mugs from $10. Free mockup."],
      'areas-we-serve': ["Custom Shirts &amp; Engraving Near Middletown, Red Bank &amp; Hazlet, NJ | Can't Wait to Cre8",
        "Custom shirts, embroidery and laser engraving for Middletown, Atlantic Highlands, Keansburg, Hazlet, Holmdel, Red Bank and the Bayshore. Pickup in Leonardo."],
      contact: ["Contact Can't Wait to Cre8 | 37 Center Ave, Leonardo, NJ",
        'Call or text 732-720-9211, email ksimmonds@cantwaittocre8.com, or send us a message. Pick up at 37 Center Ave, Leonardo, NJ 07737.']
    }
  },
  // Multi-page site: each path maps to sites/axp/<file>.html (links inside the pages are root-relative, so they work on the domain).
  axp: {
    domain: 'abovexpectations.com', aliases: [], envHosts: 'SITE_HOSTS_AXP',
    pages: {
      '/': 'index', '/wellness-center': 'wellness-center', '/the-live-above-app': 'the-live-above-app', '/podcast': 'podcast',
      '/shop': 'shop', '/apparel': 'apparel', '/games': 'games', '/books': 'books', '/contact-us': 'contact-us',
      '/body-mechanics-mobility-training': 'body-mechanics-mobility-training', '/vibration-plate-therapy': 'vibration-plate-therapy',
      '/group-fitness-classes': 'group-fitness-classes',
      // Journal posts restored at their old GoDaddy addresses so the rankings they earned carry over
      '/f/the-invisible-habit-why-people-dont-breathe-through-their-noses': 'f-the-invisible-habit-why-people-dont-breathe-through-their-noses',
      '/f/healing-nervous-systems-with-movement-when-trauma-meets-strength': 'f-healing-nervous-systems-with-movement-when-trauma-meets-strength',
      '/f/macro-vs-micronutrients': 'f-macro-vs-micronutrients',
      '/f/itis-what-does-it-mean': 'f-itis-what-does-it-mean',
      '/f/fda-glp1-vision-loss-warning': 'f-fda-glp1-vision-loss-warning'
    },
    // Old GoDaddy Website Builder addresses Google still shows (Search Console export, Nov 5 2026) point to their new pages
    redirects: { '/home': '/', '/contact': '/contact-us', '/book': '/books',
      '/live-above-app': '/the-live-above-app', '/the-podcast': '/podcast', '/apparel-1': '/apparel', '/blog': '/' },
    // GoDaddy blog posts lived under /f/ and member account pages under /m/; both are gone, so send them somewhere useful
    prefixRedirects: [['/f/', '/'], ['/m/', '/the-live-above-app']]
  },
  // BB Blends: concept demo for a website pitch. Preview only at /site/bbblends (noindex). The .invalid domain never matches a real host.
  // One page in sites/bbblends/index.html; photos and logo in public/bbblends/.
  bbblends: { domain: 'bbblends.invalid', aliases: [], envHosts: 'SITE_HOSTS_BBBLENDS' },
  // The Nick of Time travel agency (client Nicole Crooks). Preview only at /site/nickoftime until her domain is set.
  // One page in sites/nickoftime/index.html (Home and About views via #about); logo in public/nickoftime/.
  nickoftime: { domain: 'nickoftime.invalid', aliases: [], envHosts: 'SITE_HOSTS_NICKOFTIME' },
  // Cosmic Vibez Creations: concept demo for a website pitch (laser engraving + 3D printing). Preview only at /site/cosmicvibez (noindex).
  // Pages: sites/cosmicvibez/index.html and policies.html. Logo is hotlinked from their current Wix site until they send the file.
  cosmicvibez: { domain: 'cosmicvibez.invalid', aliases: [], envHosts: 'SITE_HOSTS_COSMICVIBEZ',
    pages: { '/': 'index', '/policies': 'policies' }, redirects: { '/store-policies': '/policies', '/home': '/' } },
  // M.A.D. Make A Difference nonprofit. Each path maps to sites/mad/<file>.html; photos and video live in public/mad/.
  // Nominations post to /api/mad/nominations (mad.js).
  mad: {
    domain: 'makeadifference.life', aliases: [], envHosts: 'SITE_HOSTS_MAD',
    pages: { '/': 'index', '/mission': 'mission', '/nominate': 'nominate', '/get-involved': 'get-involved', '/how-it-works': 'how-it-works', '/privacy': 'privacy', '/terms': 'terms' },
    redirects: { '/home': '/', '/about': '/mission', '/nominations': '/nominate', '/privacy-policy': '/privacy', '/donate': '/#donate', '/volunteer': '/get-involved', '/sponsor': '/get-involved', '/faq': '/how-it-works', '/terms-of-use': '/terms' }
  },
  // Creative Healing Counseling & Wellness Center (client site, preview on this server before it moves to their own accounts).
  // Pages are built by tools/chcwc-build.py into sites/chcwc/<file>.html; shared site.css/site.js and photos live in public/chcwc/.
  // Old Wix paths redirect so existing Google links keep working.
  chcwc: {
    domain: 'creativehealingcwc.com', aliases: [], envHosts: 'SITE_HOSTS_CHCWC',
    pages: { '/': 'index', '/services': 'services', '/about': 'about', '/faq': 'faq', '/contact': 'contact', '/blog': 'blog', '/shop': 'shop' },
    redirects: { '/home': '/', '/category/all-products': '/shop', '/wellness-shop': '/shop', '/resources': '/blog', '/book-a-consultation': '/contact', '/book-online': '/contact', '/contact-us': '/contact' }
  }
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

    // M.A.D. admin page: makeadifference.life/admin (key login and noindex live in mad.js; never in the sitemap)
    if (key === 'mad' && /^\/admin\/?$/.test(req.path)) { req.url = '/mad-admin'; return next(); }
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
      // No lastmod: a date that changes on every request teaches Google to ignore it
      return res.type('application/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        Object.keys(S.pages).map((u) => '  <url><loc>https://' + d + (u === '/' ? '/' : u) + '</loc></url>\n').join('') + '</urlset>\n'
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
