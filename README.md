# Can't Wait to Cre8

The shop's own server: the public site at cantwaittocre8.com, quote requests with live mockups, and the private HQ tools at hq.cantwaittocre8.com. Split out of the Live Above server in November 2026 so one business can never take the other down.

## What lives where

| Path | What it is |
| --- | --- |
| `server.js` | Boots the app: CORS, HQ domain, site router, static files, API routes |
| `sites.js`, `sites/cre8/` | Public site pages (layout plus one body file per page), sitemap, redirects |
| `public/cre8/` | Site styles, scripts (order form, garment mockup, engraving mockup) and images |
| `cre8.js` | Quote requests, file uploads, contact messages, admin quotes API, email alerts |
| `cre8hq.js`, `views/cre8-hq-admin.html` | hq.cantwaittocre8.com: admin dashboard, sales playbook, demos |
| `cre8sales.js`, `views/cre8-sales.html` | Sales team playbook at /team (team code gate) |
| `cre8sitegen.js` | Site Builder: reps generate concept websites with Claude |
| `cre8agree.js` | Client access agreements with e-signature |
| `cre8search.js` | Local Search clients: monthly Search Reports from Search Console |
| `googlereviews.js` | Google reviews and photos for the site |

## Render environment variables

| Name | Needed for |
| --- | --- |
| `DATABASE_URL` | Postgres (Cre8 tables are created on boot) |
| `ADMIN_KEY` | HQ admin sign-in. Use a new key, not the Live Above one |
| `RESEND_API_KEY`, `CRE8_FROM`, `CRE8_NOTIFY`, `CRE8_REPLY_TO` | Quote and message emails |
| `CRE8_SALES_CODE` | Sales team code for /team |
| `ANTHROPIC_API_KEY`, `CRE8_SITEGEN_MODEL`, `CRE8_SITEGEN_DAILY` | Site Builder |
| `GOOGLE_SC_CREDENTIALS` | Search Reports |
| `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID_CRE8` | Reviews and photos |
| `CRE8_ADMIN_URL` | Optional: link in alert emails (default https://hq.cantwaittocre8.com/) |

## Preview before DNS

`https://<service>.onrender.com/site/cre8` shows the site (noindex). `/cre8-dashboard` shows the admin.
