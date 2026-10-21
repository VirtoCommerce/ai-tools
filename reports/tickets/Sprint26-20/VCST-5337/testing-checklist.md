# Testing checklist — VCST-5337 + VCST-5731, round 2 (full re-check)

Env vcptcore-qa · store B2B-store · theme 2.61.0-pr-2458-3f0b · SalesRep 3.1015.0-pr-15-e5bc · GA 4.1005.0-pr-61-5267 · Platform 3.1085.0
Model: `reports/ba/test-models/VCST-5337-2026-10-07.md` §Round 2 · Plain reps only (never admin). GA-fresh rows are read back ≥9 h after planting (2026-10-19 ~17:30Z).
Lanes: A = qa-frontend-expert (playwright-firefox, storefront UI) · B = qa-backend-expert (playwright-edge, API/authz/settings) · P = planting (playwright-chrome) · R = regression suites.

| # | Condition | Expected | Lane | Data | Verdict |
|---|---|---|---|---|---|
| **Delivery (new link)** |||||
| L-1 | Hub loads from the MF plugin on every hub route, after reload and in a new tab | no host 404; rail: Dashboard / My customers / My activity (+ Tasks, Documents per role) | A | now | PASS |
| L-2 | Plugin files on storefront origin | mf-manifest.json / remoteEntry.js / plugin.json 200, JSON/JS | B | now | PASS |
| **VCST-5731 ACs** |||||
| AC-1 | Customer profile → Customer activity → Searches; same list on the customer's Activity page | present for a served customer | A | now | PASS |
| AC-2 | Searches: Recent default, this year, terms by customer members | listed | A | now + GA-fresh | PASS |
| AC-3 | Newest hour bucket first; ×N for repeats | ordered | A | now | PASS |
| AC-4 | Click a term | `/search?q=<term>` in a new tab; special-char term encoded | A | now | PASS |
| AC-5 | Only header `search` events; one search = one row | URL-opened search not listed | A | GA-fresh | PASS (GA read-back 10-20 18:10Z) |
| AC-6 | Org scope: all members of a served org, nothing from unserved orgs | exact org attribution | A+B | GA-fresh | PASS |
| **Round-1 defects (F)** |||||
| F-1 | Rep's own activity excluded on every surface (page, both widgets, Logins, Summary) | `qa5337-repself-20261007`, `qa5337-r4-alla-*` gone; `qa5337r2-repself-*` never appears | A+B | now (history) + GA-fresh | PASS (history + GA read-back) |
| F-2 | Signed-out visitor tagged anonymous | `qa5337r2-*-anon-*` never counted | P→A | GA-fresh | PASS (wire + GA read-back) |
| F-3 | Slow read → "Web activity isn't available right now", never "Couldn't load"; timeout setting `GoogleAnalytics4.DataApi.RequestTimeoutSeconds` (45) | message, no error page | B | now | PASS (changed as described) |
| F-4 | Partial failure → tracked tabs AND All show (–) + "Some tracked activity couldn't be loaded…" notice | consistent | A+B | now (timeout 1–2 s) | PASS |
| F-5 | Sign-in reported once from the landing page with the member's identity; Logins = Total visits | wire: once; GA: 1 per sign-in | P→A | now (wire) + GA-fresh | PASS (wire + GA read-back) |
| F-6 | 320 px, exactly 2 pages: icon-only Prev/Next, no horizontal scroll | fits | A | now | PASS |
| F-7 | `/company/my-customers/{id}/activities`: My customers highlighted desktop + mobile; `aria-current` not on My activity | a11y snapshot | A | now | PASS (as described; UI-kit limit) |
| F-8 | Diagnostics needs `sales-rep:diagnostics` | by design — record only | B | now | BY DESIGN |
| **New behaviours (N)** |||||
| N-1..3 | New route, breadcrumbs My customers › customer › Activity; widget "All activity" link; old `?organizationId=` opens rep's own feed | as spec | A | now | PASS |
| N-7/8 | Sign-in retry within 10 s keeps the login; wrong password not reported as success, once | wire | P | now | PASS (failed attempt = 1 anonymous login, success=false) |
| N-10 | ALCE* products link with image (store catalog wins) | link | A | now + GA-fresh | PASS |
| N-12..14 | Chip switch shows no stale badges; no "Data as of"; 2-line clamp + hover; "No customers assigned to you yet" | as spec | A | now | PASS |
| N-4..6 | Without the GA module | WAIVED — no env runs SalesRep pr-15 without the module (checked 6 stands) | — | — | WAIVED |
| **Decisions (D) not covered above** |||||
| D-5/24/25/26 | Widget: Summary/Searches/Product views; lazy load; 5 rows, "This year", footer "Based on tracked activity only"; Last viewed product on its own line | as spec | A | now | PASS |
| D-6 | Dashboard My activity: 5 newest events incl. orders | as spec | A | now | PASS (compact row by design) |
| D-9/16/17 | Tabs + counts identical across selected tab; All = Σ; zero tabs visible; chips This month/This year/All time; This month ≤ This year ≤ All time | consistent | A | now | PASS |
| D-12/13 | Hourglass on GA figures only; "during the hour of HH:00", "~N hours ago", "~yesterday", "2 days ago" | as spec | A | now | PASS; ~yesterday <24 h = OPEN QUESTION |
| D-20/21 | 20 rows/page; Recent/Top switch | as spec | A | now | PASS |
| D-23 | Rep with zero customers | "No customers assigned to you yet" | A | now | PASS |
| D-27 | GA unavailable → each widget "Web activity isn't available…", platform data still shown | as spec | B | now | PASS |
| D-34/38 | Unserved customer (hand-edited id) → not-found, no data; non-rep members redirected, `null` from the 3 ops on /graphql and /graphql/sales-rep | authz holds | B | now | PASS |
| D-35 | Impersonated activity excluded | BLOCKED expected — no rep impersonation entry (round 1) | B | — | BLOCKED (no rep impersonation entry) |
| R2-4 | Pre-`is_sales_rep` customer history still counted | compare All-time counts vs round 1 | B | now | BASELINE (no regression in counts) |
| **Responsive / a11y** |||||
| V-1 | 320/375/414/768/1024/1280/1440/1920 + 200% zoom: activity page, both widgets, rail/mobile menu | no overflow, targets ≥32 px | A | now | PASS (hint triggers 14 px: Low, BL-UI-006) |
| **Hub regression (moved theme → module)** |||||
| R-1 | Suites 089, 090, 091, 093, 093b, 097, 106 (storefront) + 050m (API) | per suite | R | now | DONE — all 13 Sales Rep suites, no regression from the plugin move; VCST-6437 filed (pre-existing) |

**Verdict 2026-10-20: PASS WITH NOTES** (both tickets). GA read-back completed 2026-10-21 07:06Z — all planted member rows visible, no rep / signed-out / URL-search rows. Tickets moved to Tested 2026-10-21 07:07Z.
