// Can't Wait to Cre8 shipping: checked ship-to addresses on quote requests, a USPS Ground Advantage
// estimate the customer sees on the form, and an exact rate lookup in the admin when invoicing.
// Uses usps.js (off until USPS_CLIENT_ID / USPS_CLIENT_SECRET are set). Without keys, addresses get a format
// check only and no estimate is shown ("we confirm shipping on your quote").
//
// Env (optional):
//   CRE8_SHIP_FROM_ZIP        ZIP orders ship from (default 07737, Leonardo NJ)
//   CRE8_USPS_PRICE_TYPE      RETAIL (default, Post Office counter price) or COMMERCIAL (Click-N-Ship / label software price)
//   CRE8_SHIP_HANDLING_CENTS  added per package for the box and packing (default 0)
//   CRE8_ITEM_OUNCES          packed weight per piece, Product:ounces pairs separated by commas, e.g. "Apparel:7,Hoodies:20"
//                             Weigh a packed piece of each and put the real numbers here.

const usps = require('./usps');

const FROM_ZIP = () => (String(process.env.CRE8_SHIP_FROM_ZIP || '07737').match(/^\d{5}/) || ['07737'])[0];
const PRICE_TYPE = () => (String(process.env.CRE8_USPS_PRICE_TYPE || 'RETAIL').toUpperCase() === 'COMMERCIAL' ? 'COMMERCIAL' : 'RETAIL');
const HANDLING = () => { const n = parseInt(process.env.CRE8_SHIP_HANDLING_CENTS || '', 10); return Number.isFinite(n) && n >= 0 ? n : 0; };

// Estimated packed ounces per piece. Signs, banners, "your own item" and "other" are too varied to estimate.
function ounces() {
  const o = { Apparel: 7, Hoodies: 20, Hats: 5, Beanies: 4, 'Tumblers / Drinkware': 16, 'Journals / Notebooks': 14,
    'Wood (signs, puzzles, plaques)': 24, 'Metal / Glass / Acrylic': 16, Leather: 8, 'Stickers / Decals': 0.4, 'Phone Cases': 4 };
  String(process.env.CRE8_ITEM_OUNCES || '').split(',').forEach((pair) => {
    const i = pair.lastIndexOf(':'); if (i < 1) return;
    const k = pair.slice(0, i).trim(), n = parseFloat(pair.slice(i + 1));
    if (k && n > 0) o[k] = n;
  });
  return o;
}
const US_STATE = /^(A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|PR|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])$/;
const s = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

// Ship-to address from the form (fields ship_line1, ship_line2, ship_city, ship_state, ship_zip).
function cleanShipTo(b) {
  const a = { line1: s(b.ship_line1, 120), line2: s(b.ship_line2, 120), city: s(b.ship_city, 60), state: s(b.ship_state, 2).toUpperCase(), zip: s(b.ship_zip, 10) };
  if (!a.line1 || !a.city || !US_STATE.test(a.state) || !/^\d{5}(-\d{4})?$/.test(a.zip)) return { bad: true };
  return a;
}

// Packages for an order: weight from the heaviest picked product times the quantity, split into boxes of up to 20 lb.
function packagesFor(products, quantity, garment) {
  const o = ounces(), qty = Math.max(1, Math.min(5000, parseInt(quantity, 10) || 1));
  const picked = (products || []).map((p) => (p === 'Apparel' && /hoodie|crewneck|sweat/i.test(garment || '') ? 'Hoodies' : p)).filter((p) => o[p]);
  if (!picked.length) return null;
  const per = Math.max.apply(null, picked.map((p) => o[p]));
  let lb = Math.max(0.25, Math.round(((per * qty + 4) / 16) * 100) / 100);
  const out = [];
  while (lb > 0) { const w = Math.min(20, lb); out.push(box(w)); lb = Math.round((lb - w) * 100) / 100; }
  return out;
}
function box(lb) {
  if (lb <= 1) return { lb, l: 10, w: 8, h: 2 };
  if (lb <= 3) return { lb, l: 12, w: 10, h: 4 };
  if (lb <= 10) return { lb, l: 14, w: 12, h: 8 };
  return { lb, l: 18, w: 14, h: 12 };
}

// Estimate for the quote form. -> { cents, packages, live } or { cents: null } when it can't be estimated.
async function estimate(zip, products, quantity, garment) {
  const packs = packagesFor(products, quantity, garment);
  if (!packs || !usps.enabled() || !/^\d{5}/.test(String(zip || ''))) return { cents: null, packages: packs ? packs.length : 0, live: false };
  const rates = await Promise.all(packs.map((p) => usps.rate(Object.assign({ from: FROM_ZIP(), to: zip, priceType: PRICE_TYPE() }, p))));
  if (rates.some((r) => r == null)) return { cents: null, packages: packs.length, live: false };
  return { cents: rates.reduce((a, r) => a + r + HANDLING(), 0), packages: packs.length, live: true, lb: Math.round(packs.reduce((a, p) => a + p.lb, 0) * 100) / 100 };
}

// Exact rate for the admin: real packed weight and box size.
async function exact(zip, lb, l, w, h) {
  const c = await usps.rate({ from: FROM_ZIP(), to: zip, lb: +lb, l: +l || 12, w: +w || 10, h: +h || 4, priceType: PRICE_TYPE() });
  return c == null ? null : c + HANDLING();
}

module.exports = { enabled: usps.enabled, checkAddress: usps.checkAddress, cleanShipTo, estimate, exact, packagesFor };
