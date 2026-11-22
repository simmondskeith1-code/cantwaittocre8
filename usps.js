// USPS APIs v3: address standardization and domestic base rates. Shared by any site that ships.
// Off until USPS_CLIENT_ID and USPS_CLIENT_SECRET are set on Render (free app at developers.usps.com).
// Falls back to PXP_USPS_CLIENT_ID / PXP_USPS_CLIENT_SECRET so one USPS app serves both shops.
// Every call fails soft: no keys, an outage or a timeout returns "unchecked" / null so callers fall back.

const API = 'https://apis.usps.com';
const TIMEOUT = 6000;
const ID = () => process.env.USPS_CLIENT_ID || process.env.PXP_USPS_CLIENT_ID || '';
const SECRET = () => process.env.USPS_CLIENT_SECRET || process.env.PXP_USPS_CLIENT_SECRET || '';
const on = () => !!(ID() && SECRET());

async function call(method, path, opts) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(API + path, Object.assign({ method, signal: ctl.signal }, opts));
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  } finally { clearTimeout(t); }
}
let tok = { v: '', exp: 0 };
async function token() {
  if (tok.v && Date.now() < tok.exp) return tok.v;
  const r = await call('POST', '/oauth2/v3/token', { headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: ID(), client_secret: SECRET(), grant_type: 'client_credentials' }) });
  if (!r.ok || !r.j.access_token) throw new Error('USPS sign-in failed (' + r.status + ')');
  tok = { v: r.j.access_token, exp: Date.now() + Math.max(60, (parseInt(r.j.expires_in, 10) || 3600) - 120) * 1000 };
  return tok.v;
}
async function authed(method, path, body) {
  const go = async () => call(method, path, { headers: Object.assign({ Authorization: 'Bearer ' + (await token()) }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
  let r = await go();
  if (r.status === 401) { tok = { v: '', exp: 0 }; r = await go(); }
  return r;
}
const cache = new Map();
function remember(k, v) { cache.set(k, { v, at: Date.now() }); if (cache.size > 2000) cache.delete(cache.keys().next().value); return v; }
function recall(k, ms) { const c = cache.get(k); return c && Date.now() - c.at < ms ? c.v : undefined; }

// a = { line1, line2, city, state, zip } (other keys pass through).
// -> { ok:true, address, changed, unitUnconfirmed } | { ok:false, message, needsUnit } | { ok:true, address:a, unchecked:true }
async function checkAddress(a) {
  if (!on()) return { ok: true, address: a, unchecked: true };
  const key = [a.line1, a.line2, a.city, a.state, a.zip].join('|').toLowerCase();
  const hit = recall('a|' + key, 24 * 3600 * 1000);
  if (hit) return Object.assign({}, hit, hit.address ? { address: Object.assign({}, a, hit.address) } : {});
  const q = new URLSearchParams({ streetAddress: a.line1, city: a.city, state: a.state });
  if (a.line2) q.set('secondaryAddress', a.line2);
  if (a.zip) q.set('ZIPCode', String(a.zip).slice(0, 5));
  try {
    const r = await authed('GET', '/addresses/v3/address?' + q.toString());
    if (r.status === 400 || r.status === 404) return remember('a|' + key, { ok: false, message: 'USPS could not find that address. Check the street, city, state and ZIP.' });
    if (!r.ok || !r.j.address) throw new Error('USPS address ' + r.status);
    const u = r.j.address, dpv = String((r.j.additionalInfo || {}).DPVConfirmation || '').toUpperCase();
    if (dpv === 'N') return remember('a|' + key, { ok: false, message: 'USPS says that address cannot receive mail. Check the house number and street.' });
    if (dpv === 'D') return remember('a|' + key, { ok: false, needsUnit: true, message: 'That building needs an apartment or suite number. Add it so the package reaches the door.' });
    const std = { line1: u.streetAddress || a.line1, line2: u.secondaryAddress || '', city: u.city || a.city, state: u.state || a.state,
      zip: (u.ZIPCode || String(a.zip).slice(0, 5)) + (u.ZIPPlus4 ? '-' + u.ZIPPlus4 : '') };
    const norm = (x) => [x.line1, x.line2, x.city, x.state, String(x.zip).slice(0, 5)].join('|').toLowerCase().replace(/[^a-z0-9|]/g, '');
    const res = remember('a|' + key, { ok: true, address: std, changed: norm(std) !== norm(a), unitUnconfirmed: dpv === 'S' });
    return Object.assign({}, res, { address: Object.assign({}, a, std) });
  } catch (e) {
    console.error('usps: address check', e.message);
    return { ok: true, address: a, unchecked: true };
  }
}

// One package's base rate in cents, or null when USPS is off or fails.
// p = { from, to, lb, l, w, h, priceType: 'RETAIL'|'COMMERCIAL', mailClass (default USPS_GROUND_ADVANTAGE) }
async function rate(p) {
  if (!on()) return null;
  const from = String(p.from || '').slice(0, 5), to = String(p.to || '').slice(0, 5);
  if (!/^\d{5}$/.test(from) || !/^\d{5}$/.test(to) || !(p.lb > 0)) return null;
  const mailClass = p.mailClass || 'USPS_GROUND_ADVANTAGE', priceType = p.priceType === 'COMMERCIAL' ? 'COMMERCIAL' : 'RETAIL';
  const key = ['r', from, to, p.lb, p.l, p.w, p.h, priceType, mailClass].join('|');
  const hit = recall(key, 6 * 3600 * 1000); if (hit !== undefined) return hit;
  try {
    const r = await authed('POST', '/prices/v3/base-rates/search', {
      originZIPCode: from, destinationZIPCode: to, weight: p.lb, length: p.l, width: p.w, height: p.h,
      mailClass, processingCategory: 'MACHINABLE', rateIndicator: 'SP', destinationEntryFacilityType: 'NONE',
      priceType, mailingDate: new Date().toISOString().slice(0, 10)
    });
    const price = r.ok ? (r.j.totalBasePrice != null ? r.j.totalBasePrice : (r.j.rates && r.j.rates[0] && r.j.rates[0].price)) : null;
    if (price == null || !(+price > 0)) throw new Error('USPS price ' + r.status);
    return remember(key, Math.round(+price * 100));
  } catch (e) { console.error('usps: rate', e.message); return null; }
}

module.exports = { enabled: on, checkAddress, rate };
