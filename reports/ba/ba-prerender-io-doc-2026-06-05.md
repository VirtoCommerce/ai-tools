# Prerender.io Dynamic Rendering for the Virto Commerce Storefront

The Virto Commerce storefront (`vc-frontend`) is a Vue 3 SPA. Search-engine crawlers receive a
mostly empty `index.html` shell unless the server intercepts and substitutes pre-rendered HTML.
Prerender.io renders pages on demand using a headless browser, caches the snapshots, and serves
them only to bots while humans continue receiving the SPA. This page covers the four operational
areas administrators and DevOps engineers need to understand.

Sources: [Prerender.io integration guide](https://docs.virtocommerce.org/storefront/developer-guide/integrations/prerender_io)
· [SPA SEO architecture](https://docs.virtocommerce.org/storefront/developer-guide/spa-architecture-for-seo-and-404-handling)
· [Azure App Gateway setup](https://docs.virtocommerce.org/platform/developer-guide/Tutorials-and-How-tos/How-tos/setting-up-prerender-io-with-azure-app-gateway)

---

## 1. Request Routing

```
Incoming request
  |
  +-- Static asset? (/static/*, /themes/*, .js, .css, images)
  |     YES -> CDN / static file server  (Prerender bypassed entirely)
  |
  +-- User-Agent matches crawler regex? (Section 2)
  |     YES -> Reverse proxy -> Prerender service -> pre-rendered HTML snapshot
  |
  NO  -> index.html SPA shell (HTTP 200) -> Vue hydrates in the browser
```

Two supported reverse-proxy configurations:

**nginx** — follow the [Prerender nginx example](https://docs.prerender.io/docs/nginx-1). The
reference deployment (virtostart-demo-store.govirto.com) uses nginx with vc-theme-b2b-vue.

**Azure Application Gateway (AGW)** — two backend pools (Prerender service + storefront). A
rewrite rule evaluates the `User-Agent` header against the crawler regex and routes matching
requests to the Prerender pool, adding the `X-Prerender-Token` auth header. Path-based rules
send `/static/*` and `/themes/*` directly to the storefront, bypassing Prerender.

**Virto Cloud note:** vcst-qa runs a self-hosted Virto Cloud prerender service (VCI-1010/VP-9138,
preview) rather than the Prerender.io cloud SaaS. Headers and behavior mirror the cloud service;
the auth token and recache API endpoint differ.

---

## 2. Crawler Detection

The reverse proxy identifies bots by matching the `User-Agent` header against a regex. Only
matching agents are forwarded to Prerender; all others receive the SPA shell. The Virto AGW
tutorial does not publish the full pattern — it states the rewrite inspects the User-Agent for
crawler values ("googlebot, bingbot, etc.") and forwards matches to `service.prerender.io`.

### Standard crawler list (prerender-node baseline)

The list below is the canonical [`prerender-node`](https://github.com/prerender/prerender-node)
`crawlerUserAgents` set — the de-facto baseline most Prerender proxies start from. Treat it as the
starting point, not a verbatim copy of the VC AGW condition; confirm the exact pattern in your
deployment's rewrite rule.

```
(googlebot|bingbot|yandex|baiduspider|facebookexternalhit|twitterbot|rogerbot|linkedinbot|
embedly|quora\ link\ preview|showyoubot|outbrain|pinterest\/0\.|pinterestbot|slackbot|vkShare|
W3C_Validator|whatsapp|redditbot|applebot|flipboard|tumblr|bitlybot|skypeuripreview|nuzzel|
discordbot|google\ page\ speed|qwantify|bitrix\ link\ preview|xing-contenttabreceiver|
chrome-lighthouse|telegrambot|google-inspectiontool)
```

> This baseline predates AI crawlers — it does **not** include `GPTBot`, `ClaudeBot`, or other
> LLM agents that Prerender.io now identifies by default. Add them if AI-crawler indexing matters.

**Adding a bot:** append `|<new-ua-fragment>` before the closing parenthesis, then redeploy the
proxy configuration. Verify with a curl recipe from Section 6.

### Recommendation: exclude private routes

`/account`, `/checkout`, `/cart`, and `/sign-in` contain session-specific content that should not
be cached by Prerender. On vcst-qa these routes currently reach Prerender (they return
`x-prerender-cache` headers), which wastes render capacity and risks caching transient errors.
Add a path exclusion in the proxy so these prefixes bypass Prerender even when the User-Agent
matches the crawler regex.

---

## 3. HTTP Headers Reference

### Request header (proxy to Prerender service)

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Prerender-Token` | `<token from Prerender.io account>` | Authenticates the proxy to Prerender. Set via AGW rewrite set or nginx `proxy_set_header`. Never expose client-side. |

### Response headers (Prerender → bot/proxy)

| Header | Example | Meaning |
|--------|---------|---------|
| `x-prerender-cache` | `HIT` / `MISS` | Snapshot served from cache (`HIT`) or freshly rendered (`MISS`). **Absent on human responses** — this absence is the primary discriminator that a request took the SPA path. |
| `x-prerender-cache-level` | `L2` | Cache tier: `L1` = in-memory, `L2` = persistent snapshot store. |
| `Cache-Control` | `private, max-age=600, must-revalidate` | Downstream cache directive on prerendered responses. Governs CDN/browser re-use; separate from Prerender's internal snapshot TTL. |
| `x-response-time` | `13.901` (MISS) / ~0 (HIT) | Server-side render time in ms. Fresh MISS: 3–14 s; cached HIT: near-instant. |

### In-page snapshot timestamp

```html
<meta rel="x-prerender-render-at" content="2026-06-05T10:22:47.000Z">
```

Check this tag in the rendered HTML to confirm when a snapshot was captured and whether it is
stale relative to a recent deploy.

---

## 4. robots.txt in the Frontend

`robots.txt` is **not committed in `vc-frontend`** (GitHub code search: no results) — it is store
content managed from the Platform Admin and served by the storefront. No frontend redeploy is
needed to change the crawl policy.

### Changing the policy from the Admin

**Upload a custom file to store Assets** (the documented method — overrides the system-generated
one):

1. Open **Stores** in the main menu and select your store.
2. Click the **Assets** widget.
3. Click **Upload** in the toolbar and upload your `robots.txt`. It immediately overrides the
   system-generated file.

To serve different policies per domain/language, use separate stores, each with its own file.
([Custom robots.txt File](https://docs.virtocommerce.org/platform/user-guide/store/custom-robot-txt))

**CDN caveat (verified live 2026-06-05):** the override is immediate at origin, but `/robots.txt` is CDN-cached (`max-age=14400` = 4 h on vcst-qa/Cloudflare). Verify via `/robots.txt?nocache=1`; the canonical URL updates after CDN purge or TTL expiry.

> Note: editing a `robots.txt` inside a theme via the **Content** module is the legacy
> vc-storefront (Liquid) pattern and does not apply to the current vc-frontend Vue SPA. Use the
> store Assets upload above.

### Demo / QA environment (restrictive — vcst-qa state 2026-06-05)

```
# Restrictive policy for demo environments
User-agent: *
Disallow: /
```

Correct for QA and demo. Must NOT be used in production.

### Production environment (permissive — required)

```
User-agent: *
Disallow: /account
Disallow: /checkout
Disallow: /cart
Disallow: /sign-in
Allow: /

Sitemap: https://<your-storefront-domain>/sitemap/sitemap.xml
```

**Warning:** `Disallow: /` blocks all crawling — Prerender.io delivers zero SEO value behind a
disallow-all robots.txt. Replace this file before go-live.

**Sitemap URL:** on vcst-qa, `/sitemap.xml` returns 404; the valid path is `/sitemap/sitemap.xml`.
Use the latter in the `Sitemap:` directive and in any recache batch scripts.

**Prerequisite — the sitemap must be populated and exported first.** The file is generated by the
Platform **Sitemaps** module, not by the frontend. Before it is usable for `Sitemap:` submission
or sitemap-driven recache, you must add sitemap items (catalog/category/content) and export them
to the store's static assets — **Stores → store → Sitemaps widget → Export to store assets**
(manual), or enable the scheduled "Export sitemap files by job" setting. On vcst-qa the current
file is effectively self-referential (no product/category URLs), so a recache batch pointed at it
today would recache nothing useful until items are added and re-exported.
([Manage Sitemaps](https://docs.virtocommerce.org/platform/user-guide/sitemaps/configuring-sitemaps))

---

## 5. Page Caching

### Snapshot lifecycle

```
First bot hit  -> MISS -> Prerender renders (3–14 s) -> snapshot stored -> HTML returned
Subsequent hit -> HIT  -> snapshot served immediately (~instant)
Frontend deploy -> cache does NOT auto-invalidate -> bots see old snapshot until recache/expiry
```

### Cache tiers

`x-prerender-cache-level: L2` = persistent store; `L1` = in-memory (fastest). Both return
`x-prerender-cache: HIT`; the level value helps diagnose memory-pressure evictions.

### Stale snapshots after deploy

After a frontend deploy, cached prerendered pages continue serving old HTML until manually
recached or the internal TTL expires.

**Recache options:**

- **Prerender.io dashboard** — Recache UI for individual URLs or a sitemap-driven batch.
- **Recache API** — `POST https://api.prerender.io/recache` with body
  `{"prerenderToken":"<token>","url":"<url>"}`. Automate from your CI/CD pipeline post-deploy.
  For Virto Cloud self-hosted prerender, consult VP-9138 documentation for the equivalent endpoint.
- **`Cache-Control: max-age=600`** — governs downstream (CDN/browser) re-use of prerendered
  HTML, not Prerender's internal snapshot TTL. Cloudflare on vcst-qa returns
  `cf-cache-status: DYNAMIC` (Cloudflare does not cache the HTML itself; Prerender is the
  authoritative cache layer).

### Cache-busting during testing

Append a throwaway query parameter to force a MISS without clearing the full cache:

```bash
curl -A "googlebot" "https://<storefront>/catalog/laptops?cachebust=1"
```

Each unique URL is a separate cache entry. Remove the parameter when testing real cached-path
behavior.

---

## 6. Verifying the Setup

**Recipe 1 — confirm bot path reaches Prerender**
```bash
curl -sI -A "googlebot" https://<storefront>/catalog | grep -i "x-prerender"
# Expected: x-prerender-cache: HIT (or MISS on first hit)
# No header = bot routing is not working
```

**Recipe 2 — confirm human path bypasses Prerender**
```bash
curl -sI https://<storefront>/catalog | grep -i "x-prerender"
# Expected: no output (header absent on human responses)
```

**Recipe 3 — check snapshot timestamp**
```bash
curl -s -A "googlebot" https://<storefront>/catalog/laptops | grep "x-prerender-render-at"
# Expected: <meta rel="x-prerender-render-at" content="2026-06-05T...">
```

**Recipe 4 — force fresh render and measure MISS latency**
```bash
time curl -s -A "googlebot" "https://<storefront>/catalog/laptops?cachebust=$(date +%s)" \
  -o /dev/null -w "HTTP %{http_code} | Time: %{time_total}s\n"
# Expected: HTTP 200, 3–14 s (MISS). Follow up without ?cachebust to confirm HIT is ~instant.
```

---

## 7. Known Limitations (QA environment, June 2026) — VCST-5108

- **Deep-route snapshots are shell-only.** vc-frontend emits no `window.prerenderReady` signal,
  so Prerender captures on a timeout. PDP and PLP routes often snapshot only the app shell; the
  `/catalog` root URL does capture full content.
- **No canonical links.** `<link rel="canonical">` is not emitted on any route.
- **No Product JSON-LD.** Structured data for products is not generated.
- **Sitemap URL mismatch.** `/sitemap.xml` returns 404; use `/sitemap/sitemap.xml`.
