// Google reviews for the Wellness Center. Needs two env vars on Render:
//   GOOGLE_PLACES_API_KEY  (Places API (New) enabled, restricted to that API)
//   GOOGLE_PLACE_ID        (the Wellness Center's Place ID)
// Second business: GET /api/google-reviews?place=cre8 uses GOOGLE_PLACE_ID_CRE8 (Can't Wait to Cre8).
// Google returns at most 5 reviews per call. Cached 6 hours per place so the widget never burns quota.
const TTL = 6 * 60 * 60 * 1000;
const PLACES = { main: 'GOOGLE_PLACE_ID', cre8: 'GOOGLE_PLACE_ID_CRE8' };
// One Places key covers every place. Cre8 can optionally use its own key (GOOGLE_PLACES_API_KEY_CRE8), e.g. to bill it separately.
function placeKey(place) { return (place === 'cre8' && process.env.GOOGLE_PLACES_API_KEY_CRE8) || process.env.GOOGLE_PLACES_API_KEY; }
const caches = {}; // place -> { at, data }

function clean(r) {
  return {
    name: (r.authorAttribution && r.authorAttribution.displayName) || 'Google user',
    photo: (r.authorAttribution && r.authorAttribution.photoUri) || '',
    rating: r.rating || 0,
    when: r.relativePublishTimeDescription || '',
    text: ((r.text && r.text.text) || (r.originalText && r.originalText.text) || '').slice(0, 900)
  };
}

async function load(place) {
  const key = placeKey(place), id = process.env[PLACES[place]];
  if (!key || !id) throw new Error('not_configured');
  const res = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(id), {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'displayName,rating,userRatingCount,googleMapsUri,reviews'
    }
  });
  if (!res.ok) throw new Error('google_' + res.status);
  const p = await res.json();
  return {
    name: (p.displayName && p.displayName.text) || '',
    rating: p.rating || 0,
    count: p.userRatingCount || 0,
    url: p.googleMapsUri || '',
    reviews: (p.reviews || []).map(clean).filter(r => r.text)
  };
}

// Photos on the Google listing: GET /api/google-photos?place=cre8 returns up to 12 full-size photo links
// (owner uploads first) with the attribution Google requires shown next to each photo.
// Each refresh costs one Place Details call plus one Place Photo call per photo, so the list is cached 12 hours.
const PHOTO_TTL = 12 * 60 * 60 * 1000;
const photoCaches = {};
async function loadPhotos(place) {
  const key = placeKey(place), id = process.env[PLACES[place]];
  if (!key || !id) throw new Error('not_configured');
  const res = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(id), {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'displayName,photos' }
  });
  if (!res.ok) throw new Error('google_' + res.status);
  const p = await res.json();
  const biz = ((p.displayName && p.displayName.text) || '').toLowerCase();
  const list = (p.photos || []).map((ph) => {
    const a = (ph.authorAttributions || [])[0] || {};
    return { name: ph.name, w: ph.widthPx || 0, h: ph.heightPx || 0, author: a.displayName || '', authorUrl: a.uri || '', owner: !!biz && String(a.displayName || '').toLowerCase() === biz };
  });
  list.sort((x, y) => (y.owner ? 1 : 0) - (x.owner ? 1 : 0));
  const out = [];
  for (const ph of list.slice(0, 12)) {
    const m = await fetch('https://places.googleapis.com/v1/' + ph.name + '/media?maxWidthPx=1600&skipHttpRedirect=true', { headers: { 'X-Goog-Api-Key': key } });
    if (!m.ok) continue;
    const j = await m.json().catch(() => ({}));
    if (j.photoUri) out.push({ url: j.photoUri, w: ph.w, h: ph.h, author: ph.author, authorUrl: ph.authorUrl, owner: ph.owner });
  }
  return { photos: out };
}

function routes(app) {
  app.get('/api/google-photos', async (req, res) => {
    const place = PLACES[String(req.query.place || 'main')] ? String(req.query.place || 'main') : 'main';
    const cache = photoCaches[place];
    const ok = (d) => { res.set('Cache-Control', 'public, max-age=1800'); return res.json(d); };
    if (cache && Date.now() - cache.at < PHOTO_TTL) return ok(cache.data);
    try {
      const data = await loadPhotos(place);
      photoCaches[place] = { at: Date.now(), data };
      ok(data);
    } catch (e) {
      if (cache) return ok(cache.data);
      res.set('Cache-Control', 'no-store');
      res.status(503).json({ error: String(e.message || 'unavailable') });
    }
  });

  app.get('/api/google-reviews', async (req, res) => {
    const place = PLACES[String(req.query.place || 'main')] ? String(req.query.place || 'main') : 'main';
    const cache = caches[place];
    const ok = (d) => { res.set('Cache-Control', 'public, max-age=900'); return res.json(d); };
    if (cache && Date.now() - cache.at < TTL) return ok(cache.data);
    try {
      const data = await load(place);
      caches[place] = { at: Date.now(), data };
      ok(data);
    } catch (e) {
      if (cache) return ok(cache.data); // stale beats empty
      res.set('Cache-Control', 'no-store');
      res.status(503).json({ error: String(e.message || 'unavailable') });
    }
  });
}

module.exports = { routes };
