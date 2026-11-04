# VCST-6475 — testing checklist (vcptcore-qa, 2026-10-28)

Build: `VirtoCommerce.Sanity 3.1004.0-pr-4-f7a8` (head `f7a8ba09`), `VirtoCommerce.Pages 3.1011.0-pr-23-e50f`.
Config: `Sanity__WebhookSecrets__0/1`, `Sanity__Secrets__qaToken` (vc-deploy-dev PR #7014, temporary).
Fixture: Sanity project `ryu3mu0u`, datasets `production` + `qa-secondary`, `AGENT-TEST-6475-*` docs (deleted after the run).
Index path = `POST /api/search/indexes/index` (Pages, full rebuild); webhook path = signed `POST /api/pages/sanity`.

## Document types
| # | Condition | Result |
|---|---|---|
| R0 | Unchanged legacy store (DocumentTypes empty, stored PageType) indexes exactly its legacy type | PASS — only `virtoPage` (3 legacy + fixture pages + draft) |
| V1 | `" virtoPage , footerNavigation;siteSettings"` — spaces, `,` and `;` | PASS — 9 docs, unlisted types excluded |
| V2b | Single type on the legacy project | PASS |
| V2 / V2c / V8 | `siteSettings` doc indexed by full rebuild | first runs FAIL — rebuilds launched within 10 min reused the Pages change-list cache (F1); **re-run with a fresh cache: PASS** |
| VB | Store settings saved with every displayed default (what the settings blade does) keep the hidden `PageType` | PASS — `virtoPage` still indexed |
| — | Drafts (`drafts.` id) indexed with Status=Draft | PASS |

## Multiple projects / datasets
| # | Condition | Result |
|---|---|---|
| V3 | 2 datasets, `production` isPriority, token inherited from `Sanity.ApiToken` | PASS — conflict = production version |
| V4 | isPriority moved to `qa-secondary` | PASS — conflict = qa-secondary version |
| V5 | No isPriority — configured order wins | PASS |
| V7 | Dataset without `documentTypes` inherits `Sanity.DocumentTypes` | PASS |
| V8 | Entry without projectId skipped | skip logic PASS; result masked by F1 |
| V9 | Invalid JSON in `Sanity.Projects` → single-project fallback | PASS |
| — | Per-dataset types: `landing` in production (not listed there) never indexed | PASS |

## Secrets
| # | Condition | Result |
|---|---|---|
| V6 | `apiToken: "${qaToken}"` resolves; `"${notDefined}"` entry skipped, other entry still indexed | PASS |
| V10 | `Sanity.ApiToken = ${qaToken}` (drafts need a valid token) | PASS |
| V11 | `Sanity.ApiToken = ${notDefined}` → project skipped | PASS |
| — | `Sanity.Projects` / `Sanity.ApiToken` not exposed to the storefront (xAPI `store.settings`) | PASS — only `Sanity.Enabled` |

## Signed webhook
| # | Condition | Result |
|---|---|---|
| W1–W2 | No signature / unknown secret → 401 | PASS |
| W3–W4 | Secret #0 and #1 accepted (rotation) | PASS |
| W5–W8 | t −10 min / +10 min / seconds → 401; t −4 min → 200 | PASS |
| W9 | Body changed after signing → 401 | PASS |
| W10–W13 | Malformed signature headers → 401 | PASS |
| W14 | Legacy `?api_key=&storeId=` URL → 401 (documented breaking change) | PASS |
| W15 | Signed body > 10 MB → 401 | PASS |
| H1 | Payload is a notification: indexed title comes from Sanity, not the payload | PASS |
| H3 | Headers scope the source: conflict doc from `qa-secondary` header indexed despite production priority | PASS |
| H4/H8 | Type not listed for the dataset / unlisted type → nothing indexed | PASS |
| H5 | Unconfigured project → nothing indexed (200) | PASS |
| H6 | `?cultureName=fr-FR` applied | PASS |
| H7 | `delete` removes the page from the index | PASS |

## Link and asset resolution
| # | Condition | Result |
|---|---|---|
| H1 | Image / file asset get `url` equal to the URL Sanity returned on upload | PASS |
| H1 | Malformed asset ref untouched | PASS |
| H2 | Ref → page with permalink gets `slug`; ref → page with only `seo.slug` gets it | PASS |
| H2 | Ref → doc without slug / missing doc untouched; nested ref (depth 3) resolved | PASS |
| H6 | Cross-dataset weak ref (target not in this dataset) untouched | PASS (observed) |

## Signed values vs headers (round 2)
| # | Condition | Result |
|---|---|---|
| T1–T3 | Header `sanity-document-id` / `sanity-operation` / `sanity-dataset` contradicts the signed body → 400 | PASS |
| T4 | Recommended projection, no `sanity-*` headers → indexed | PASS |
| T5 | Empty projection `{}` → works from headers | PASS |
| T6 | Invalid document id in body or header → 400 before any GROQ query | PASS |
| T7/T8 | Delete via projection (with storeId) and via headers → removed | PASS |
| SF | xAPI `slugInfo` + `pageDocument` resolve the published Sanity page (not the draft), `hero.asset.url` present | PASS |

## Platform log (both pods, 08:48–09:00 UTC)
| # | Condition | Result |
|---|---|---|
| LG1 | Every webhook rejection logs its reason (missing header, no matching secret, time window, body size, header ≠ signed value, invalid id) | PASS |
| LG2 | Not-found warning names document, project and dataset | PASS |
| LG3 | Unresolved `${name}`, conflict (winner + loser source), invalid Projects JSON warnings — wording as in README | PASS |
| LG4 | No token, webhook secret or admin password value in either pod log | PASS (0 occurrences of 6 values) |

Notes: the real Sanity webhook of project `ryu3mu0u` still posts unsigned (rejected at 08:19/08:48/08:59 on fixture
mutations) — the documented upgrade step is pending on this stand. The `${name}` warning repeats per batch (~10× per rebuild)
and is paired with the generic "no project id or no API token" line — log noise, not a defect.

## Findings
- **No defect in this story.** All AC conditions pass.
- **F1 — not this PR (Pages module, existing behaviour).** `PageIndexDocumentChangesProvider` (vc-module-pages, since
  `bc18fdee` VCST-4848, in released builds) caches the full-rebuild change list for 10 min under a date-only key; store
  setting changes do not invalidate it (page publishes via the webhook do). A rebuild within 10 min of the previous one
  reuses the old id list, so documents of a newly configured type/source are skipped while the job reports success
  ("processed" > indexed). Confirmed: V2 FAIL on a stale cache, PASS on a fresh one. Candidate separate bug on vc-module-pages.
- First full rebuild after 2026-09-10 removed stale entries (page-builder 419→321, builder.io 85→38); storefront home and sampled pages resolve.
- **UNDECLARED** — no domain map / test model for Sanity content; this checklist is the first record of the surface.

## Not covered
- Scheduled sync path — `VirtoPages.ScheduledSync.Enable = false` stand-wide.
- Multi-project with two DIFFERENT project ids (one Sanity project available; two entries of the same project used instead).
- Admin SPA settings blade visuals (headless Admin SPA did not render); its save behaviour emulated via API (VB).
- Theme rendering of Sanity content (B2B-store requires sign-in; not in this story's scope).
