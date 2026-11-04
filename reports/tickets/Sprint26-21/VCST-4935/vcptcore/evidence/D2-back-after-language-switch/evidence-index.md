# D2 — Back after storefront language switch → 404 — evidence index

Run: 2026-10-23, lane playwright-firefox. Investigation package for /vc-fix:qa-bug (no report filed).

## Builds (read from the live bundles and footers, not assumed)

| Stand | Theme (footer + `index-*.js`) | Language selector `select()` (compiled) |
|---|---|---|
| vcptcore-qa (B2B-store, signed-in `agent-test-vcst4935-buyer`) | `2.61.0-pr-2576-211e-211e3e15` | `permalink = getUrlWithoutLocale(location.pathname).slice(1)` (PR 2576) |
| vcst-qa (B2B-store, anonymous) | `2.61.0-pr-2570-5d81-5d81afc0` | `permalink = location.pathname.slice(1)` (pre-PR). No `alternates` in the bundle, so PR 2576 is absent |

Both bundles end `select()` the same way: `removeLocaleFromUrl()` then `location.reload()`.

## Outcomes (same click path on both: open `/fr/<route>`, then selector → English (en-US), wait for the reload, then Back)

| # | Stand | Route | After Back | Screenshot |
|---|---|---|---|---|
| 1 | vcptcore | PDP `/fr/alcoholic-drinks/beer/affligem-dubbel-24x30cl-bottle` | URL `/fr/…`, title "404 Page not found" | `../../screenshots/inv-D2-pdp-01-fr.png`, `inv-D2-pdp-02-back-404.png` |
| 2 | vcptcore | category `/fr/alcoholic-drinks/beer` | 404 | `inv-D2-cat-02-back-404.png` |
| 3 | vcptcore | category `/fr/alcoholic-drinks` (top level) | 404 | `inv-D2-cat-top-02-back-404.png` |
| 4 | vcst (control) | PDP `/fr/printers/…/canon-imageclass-wifi-mf232w-…-color-black` | **404**, English UI | `inv-D2-ctrl-vcst-01-fr-pdp.png`, `inv-D2-ctrl-vcst-03-fr-enUS-back-404.png` |
| 5 | vcst (control) | category `/fr/printers/multifunction-printers` | **404** | `inv-D2-ctrl-vcst-04-cat-back-404.png` |
| 6 | vcst (control) | category `/fr/alcoholic-drinks` (top level) | rendered the category, in English, at a `/fr/` URL (not a 404, still the wrong locale) | none |
| 7 | vcst (control, variant b) | PDP: fr → **en-GB** (non-default) | 1st Back: stays on `/en-GB/…`; 2nd Back: `/fr/…` → 404 | `inv-D2-ctrl-vcst-02-fr-enGB-back-404.png` |
| 8 | vcst | reload of `/fr/<Canon PDP>` | renders correctly in French | none |

Screenshots are in `reports/tickets/Sprint26-21/VCST-4935/vcptcore/screenshots/`.

## Request shapes (from the HARs: operation and variables only, no headers)

The request that decides the outcome is **the same on both builds**:

| Moment | vcptcore (PR 2576) | vcst (pr-2570) |
|---|---|---|
| Back (popstate, **no document request**) | `GetSlugInfo {permalink:"fr/alcoholic-drinks/beer/affligem-…", cultureName:"en-US"}` → `entityInfo:null` | `GetSlugInfo {permalink:"fr/printers/…/canon-…", cultureName:"en-US"}` → `entityInfo:null` |
| Back on a category | `{permalink:"fr/alcoholic-drinks/beer", en-US}` → null | `{permalink:"fr/printers/multifunction-printers", en-US}` → null |
| Click on the selector, before the reload | `{permalink:"alcoholic-drinks/beer/affligem-…", en-US}` → **resolved** (PR fix: no locale prefix) | `{permalink:"fr/printers/…", en-US}` → **null** (pre-PR: the prefix is sent) |
| After the reload | `DOC /alcoholic-drinks/…`, en-US content | `DOC /printers/…`, plus `GetSlugInfo {fr-FR, unprefixed}` (the pre-PR fallback through `previousCultureSlug`) |

The only diff between the builds is the selector's own lookup, the part PR 2576 fixed. It does not touch the Back path.
The stray `getPageDocument {id:"?"}` from the first report did **not** occur on the PDP or the category routes in this run. It belongs to Page Builder routes and was not examined here.

## HARs (gitignored, may contain tokens; cite by path only)

- `inv-D2-vcptcore.har`: rows 1–3, signed-in session
- `inv-D2-ctrl-vcst.har`: rows 4, 6, 7, 8
- `inv-D2-ctrl-vcst-cat.har`: row 5
- From the earlier run: `../../4a-fe-B1.har`, `../../4a-fe-B30-*.har`, `../../4a-fe-ctrl-vcst.har`

## kb

KB-912B0774 confirmed on vcst_qa (pre-PR build). See root-cause.md §kb.
