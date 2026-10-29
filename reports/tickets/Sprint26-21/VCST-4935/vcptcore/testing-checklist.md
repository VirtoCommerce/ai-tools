| PASS — 4 round-1 roots + their archived versions deleted (404 read-back); 35 R2-BE roots + ~130 pages deleted; ~45 older round-1 AGENT-TEST-VCST4935-* roots left (out of scope) || PASS — B2, B3, B6, B10/B11 (all 3 dialog paths), B13, B15, B16, B21, B31 + pr-178 permalink rule on Landing (# / space → 400) (r2-be-R2-14-*) || PASS — never-published source → 400 with message; on source → 400; on plain page → 400 || PASS — version-less root under Drafts (UI + REST lifecycle=drafts), absent from active || PASS — userGroups array → 400; string control 200 || PASS — "Published: 2 of 13, outdated: 3"; full-culture pills en-US/en-GB, nl-BL/nl-NL, single pill fr-FR; "All languages" (r2-be-R2-10-*) || PASS — "Create: fr-FR", "Link existing: ru-RU", "Open: en-US", "Unlink: fr-FR", "Mark up to date: de-DE" || PASS — 10 parallel pairs: source processed once, other call skipped/NoDraft, sourceRevisionDate advanced, translations Outdated; archive-all pair processed + AlreadyArchived || PASS — 1025 chars → 400 on ML POST/PUT, create-group-page, POST/PUT grouped (1024 → 200); permalink 2049 / whitespace / each forbidden char / // /./ /../ → 400; 2048 → 200; blade blocks Save (r2-be-R2-07-*) || PASS — standalone Draft copy, no [BladeMessaging] error (r2-be-R2-06-*) || PASS — (copy)/-copy → (copy 2)/-copy-2 in en/de/fr custom → copy of copy (copy 3); no permalink collision; Landing copy-name same scheme (REST) || PASS — PUT storeId change → 400 "store … cannot be changed"; organizationId accepted + propagated (by design) || PASS — link xx-XX page → 400; fr-FR control 200 || PASS — xx-XX → 400; EN-us → stored en-US; removed de-DE default shows isStoreLanguage:false, PUT unchanged 200, PUT back to de-DE 400; store restored + read back || PASS — inline row (select/Cancel/Link), mouse select + Link at 1920 → custom badge; mouse select at 1366; "No options" for ru-RU; keyboard ArrowDown+Enter works (r2-be-R2-01-*) |# VCST-4935 — Testing checklist (Artifact B, FULL, round 1)

Env vcptcore-qa · Platform 3.1085.0 · PageBuilderModule 3.1036.0-pr-175-a3bc · Pages 3.1011.0-pr-23-4bcd · XCMS 3.1009.0-pr-27-bb4c · theme 2.61.0-pr-2576-211e3e15
Model: `test-model.md` (#1–#36) · Discovery: `exploratory/SBTM-VCST-4935-2026-10-23.md` · Spec: dev comment 2026-10-21 (no AC section in the ticket)
Data: per-run fixtures created in-case, prefix `AGENT-TEST-VCST4935-<lane>-` (cleanup: archive / unlink / delete roots without versions) · stores `{{STORE_ID}}` (B2B-store, 13 langs), single-language store live-discovered (store2), `{{STORE_ID_SECONDARY}}` (Electronics) · buyer `@td(VCST4935_BUYER.email)` (key `DEFAULT_TEST_PASSWORD`) · read-only editor `@td(RESTRICTED_CMS_ADMIN.email)` (REST only — no --secrets key) · admin key `ADMIN_PASSWORD_VCPTCORE`
Covering case: `PENDING-A #N` = row N of the 059m authoring plan (plan-059m.json), being authored in `059m` (CMS-ML-*) / `050f` (CMS-GQL-133..135). Verdict column filled at 5-report.

| # | Lane | Condition (oracle) | Covering case | Verdict |
|---|---|---|---|---|
| B1 | E2E (BE→FE) | [JOURNEY] Convert EN Landing → Link existing FR (custom permalink) → Create DE → Publish all → storefront /fr/<fr> → switch EN → /<en>, EN content; head hreflang en-US/fr-FR/(de-DE when published)/x-default; alternates match ({SPEC} dev §3.2) | PENDING-A #1 || PASS — FR→EN switch, hreflang de/en/fr + x-default, alternates (4a-fe-B1-01/02); Back after switch → see B39 |
| B2 | BE | Single-language store: Add opens Landing blade, no chooser, no Convert action ({SPEC} R2) | PENDING-A #2 || PASS (4a-be-B2) |
| B3 | BE | Multi-language Add → chooser; ML blade has Name, Permalink, Default language (= store default), Advanced options; after Save the table lists all 13 store languages, default first, all Missing, no Slug column ({SPEC} R3/R5) | PENDING-A #3 || PASS — 13 rows, Missing, no Slug col (4a-be-B3) |
| B4 | BE | Name/Permalink required + boundaries (empty, whitespace, no leading slash, long) | PENDING-A #4 || PASS — required/whitespace blocked; incidental: Name >1024 → HTTP 500 w/ raw SQL text (B44) |
| B5 | BE (REST) | POST root with non-store DefaultCultureName → expect 400 like PUT. 3x: 200 (suspected bug N1) — re-confirm with evidence | PENDING-A #5 || FAIL — POST xx-XX → 200, isStoreLanguage:true; PUT → 400 (4a-be-B5-B8; 3x-02/03) |
| B6 | BE | Create version: Draft, copy of source content (block count equal), permalink inherited badge ({SPEC} R8; VC-CMS-003) | PENDING-A #6 || PASS — draft, 3/3 blocks copied, inherited |
| B7 | BE | Link existing keeps permalink + settings (custom badge); 2nd page same language and page of another root → refused | PENDING-A #7 || FAIL (UI) — Link-existing dropdown renders under the dialog overlay, unselectable by mouse/keyboard, Link disabled (Edge 1920/1366; 4v D1 DOM: listbox in .vc-app z9300 vs body-portal popup); REST link PASS incl. refusals (4a-be-B7-*, 4v-be-08..10) |
| B8 | BE (REST) | Link existing of a page whose culture is not a store language → expect 400 like Convert. 3x: 200 (suspected bug N2) | PENDING-A #31 || FAIL — Link of xx-XX page → 200; Convert of same → 400 |
| B9 | BE | Convert refused for non-store culture / null culture / already linked (no orphan root); converted page's storefront URL unchanged | PENDING-A #8 || PASS — refusals 400, no orphan root, URL unchanged |
| B10 | BE | Root advanced option change (Visibility, Start date) propagates to inheriting versions; hint "inherited" | PENDING-A #9 || PASS |
| B11 | BE | Conflict dialog "Some languages have their own values": Cancel saves nothing; Apply to all resets fr-FR; Apply to inheriting only keeps fr-FR ({SPEC} R10) | PENDING-A #10 || PASS — labels as observed; Cancel saves nothing (4a-be-B11) |
| B12 | BE | Version: value set back to root → inherited; Name read-only on version | PENDING-A #11 || PASS |
| B13 | BE | Outdated ST: source draft save → none; source publish → translations Outdated (not Archived); translation publish clears; Mark up to date clears ({SPEC} R12 as implemented) | PENDING-A #12 || PASS — Outdated on source publish, cleared by publish / Mark up to date |
| B14 | BE (REST) | Mark up to date on never-published source → observe (3x: 200 no-op, unreachable in UI) — record, PO question | PENDING-A #13 || UNSPEC — 200 silent no-op; unreachable in UI → PO question |
| B15 | BE | Publish all: source first, languages without draft "skipped", report per language; double Publish all → consistent end state | PENDING-A #14 || PASS — source first, skipped list; UI double-click sends 1 request; REST parallel pair race → B45 |
| B16 | BE+FE | Archive all → statuses Archived, storefront no longer serves; DELETE root with versions → 400; without → 200 | PENDING-A #15 || PASS — archived → soft 404 at 200; DELETE w/ versions 400 |
| B17 | BE+FE | Unlink FR → Landing at same permalink, still served; gone from EN alternates + hreflang | PENDING-A #16 || PASS — unlinked page still served, gone from sibling alternates/hreflang |
| B18 | BE | Clone root → all versions Draft, `-copy` permalinks; 2nd clone no collision | PENDING-A #17 || FAIL — 2nd Clone → same name + identical -copy permalinks in every language (permalink-usage reports both) |
| B19 | BE | Clone from a version blade → standalone Landing copy, no console error (3x: "[BladeMessaging] Caller blade … not found") | PENDING-A #33 || FAIL — standalone copy + console "[BladeMessaging] Caller blade … not found in stack" (4a-be-B19) |
| B20 | BE | Pages list: ML = one row, pills per language/status, Filters (type, language, Missing, Outdated), empty state on no match; ML row Status cell (3x: empty — PO question); pill label collision EN/EN, NL/NL; "null: Draft" rows (ECL-10.3) | PENDING-A #18 || PASS w/ notes — one row, pills, Filters, empty state OK; ML Status cell empty, EN/EN NL/NL pill collision, "null: Draft" (4a-be-B20) |
| B21 | BE | Permalink-usage warning: same permalink+language other page → warning, save allowed; other language / siblings → no warning (BL-SEO-001) | PENDING-A #19 || PASS (4a-be-B21) |
| B22 | BE (GQL) | slugInfo(fr permalink, en-US) → EN id and reverse; pageDocument.cultureName (BL-SEO-001) | PENDING-A CMS-GQL #1 || PASS |
| B23 | BE (GQL) | alternates: only Published, store languages, one per language — draft/archived excluded | PENDING-A CMS-GQL #2 || PASS |
| B24 | BE (GQL) | Product + category slugs (en-US, fr-FR) resolve unchanged; unknown slug → empty entityInfo (BL-SEO-001/002) | PENDING-A CMS-GQL #3 || PASS |
| B25 | FE | MissingTranslationBehavior unset: /es/<en permalink> → EN content, no es alternate ({SPEC} AC3 as implemented) | PENDING-A #20 || PASS — /es/ → EN content, no es alternate |
| B25b | FE | MissingTranslationBehavior=NotFound on {{STORE_ID}}: /es/<en permalink> → SPA NotFound at 200; /<en permalink> in en-US still served; RESTORE setting to unset (BL-SEO-002; H6) — serialise with B25 | PENDING-A #21 || PASS — NotFound → SPA 404 at 200, own languages still served; setting restored to null (read back) |
| B26 | FE | Root default de-DE, store en-US, no en-US version → observe /es/ and / (3x: 404 at 200, no x-default); add en-US → fallback + x-default (PO question: which "default") | PENDING-A #22 || UNSPEC — no store-default version ⇒ /es/ and / 404, no x-default; with en-US → fallback + x-default (PO question; KB-AA9BFC82) |
| B27 | FE | hreflang: full cultures, absolute on store URL, x-default = store default, no rel=canonical, none on a single-version page; og:url present? (3x: absent on ML page — compare with a PDP; BL-SEO-003) | PENDING-A #23 || PASS w/ note — hreflang full cultures, absolute, x-default, no canonical; og:url absent on ALL Page Builder pages (pre-existing, vcst control) → B47 |
| B28 | FE | FR version restricted to a user group the buyer lacks → not in alternates/hreflang; /fr/<fr> → fallback | PENDING-A #24 || FAIL (partial) — fr-FR leaves alternates/hreflang (PASS); /fr/<fr> → 404 instead of fallback; slugInfo still returns the restricted id anonymously → B40 |
| B29 | BE (GQL) | FR StartDate future → absent from alternates; past → present | PENDING-A #25 || PASS |
| B30 | FE | Regression: language switch on PDP, category, search (?q) and a static page keeps a correct localized URL + content (non-page routes; selector change) | PENDING-A #26 || PASS (switch) — Back → B39 |
| B31 | BE+FE | Plain Landing Page publish / unpublish / archive + storefront render unchanged (GroupedPagePublishing refactor) | PENDING-A #27 || PASS |
| B32 | BE (REST) | Read-only editor token: search 200; every mutating ML endpoint → 403. UI controls part BLOCKED (no --secrets key) | PENDING-A #28 || PASS (REST: reads 200, 12 mutations 403); UI half BLOCKED (no --secrets key) |
| B33 | FE | nl-NL / nl-BL: distinct URLs (/nl-NL/, /nl-BL/), correct switch; Back after switch → previous URL (3x: /nl-BL/<nl-NL permalink>) | PENDING-A #29, #32 || FAIL — distinct /nl-NL/ /nl-BL/ OK; Back lands on /nl-BL/<nl-NL permalink>; /nl/<slug> → /nl-BL/nl/<slug> 404; duplicate "Nederlands"/"English" menu items |
| B34 | BE | Language removed from Electronics store while a version exists → row flagged, no blade error; restore | PENDING-A #30 || PASS — "not a store language" row, no error; restored |
| B35 | BE | Root OrganizationId accepts arbitrary values (3x: 200, copied to all versions) — record; PUT root store change → 400 | none — PO/dev question, Low || FAIL (Low) — arbitrary organizationId 200 + propagated; PUT storeId silently ignored (200, not 400) |
| B36 | VIS | ML blade, language table (13 rows), version blade, conflict dialog, list pills + Filters: BL-UI-001..007, BL-A11Y-001..004 (keyboard, focus, names, contrast), 1366 + 1920 widths | 4v (design-report.md) || FAIL — D1 (=B7 UI), D2 contrast 2.8–3.9:1 (Multilanguage tag, Missing, Outdated pills), D3 31 unnamed row actions; chooser + conflict dialog PASS (design-report.md) |
| B37 | VIS | Storefront ML page + language switcher: BL-UI + BL-A11Y; vs. DESIGN axis vs ticket mockups (image-2026*) | 4v || PASS layout, axe 0 on storefront; D5 switcher duplicate names (BL-A11Y-002) (4v-sf-*) |
| B38 | Integration | Done sibling VCST-4933 Shared Components: Create/Clone of a version whose source holds a shared-component placement — placement survives, usage count consistent | gap top-up 2026-10-26 | PASS — fr-FR draft and both clone versions keep the componentRef; /fr/ consumer and clone render the shared sections; usage counts every version (drafts/clones/archived), released only by DELETE (KB-0128A6EB) (gap-G5-01/02) |

## Findings outside the planned rows (from 4a / 4v / 3x) — triage input
| # | Lane | Condition / observation | Source | Verdict |
|---|---|---|---|---|
| B39 | FE | Back after a language switch to the default language → 404 on every route (ML page, landing, PDP, category, /catalog, /search): URL /fr/<slug>, html lang en-US, slugInfo(permalink "fr/<slug>", en-US) empty; reload renders fine. Control vcst-qa theme pr-2570 (no PR 2576): no 404 | 4a-fe S1 (4a-fe-B1-03-back-after-switch-404.png, 4a-fe-B30-*) | FAIL |
| B40 | FE | Translation hidden by user group → /fr/<fr> 404 instead of DefaultLanguage fallback; slugInfo returns the restricted page id even anonymously | 4a-fe S2 (4a-fe-B28-fr-restricted.png) | FAIL |
| B41 | BE | Link existing UI dropdown unusable (see B7 UI) — vc-shell VcSelect inside VcPopup stacking | 4v D1 | FAIL |
| B42 | VIS | Contrast <4.5:1 on Multilanguage tag 2.77, Missing pill 3.93, Outdated pill 3.84 (WCAG 1.4.3) | 4v D2 | FAIL |
| B43 | VIS | 31 language-table row buttons without accessible names incl. language (WCAG 4.1.2) | 4v D3 | FAIL |
| B44 | BE | Name >1024 chars → HTTP 500 exposing SQL truncation text (also on create-group-page — pre-existing) | 4a-be B4 | FAIL |
| B45 | BE | Concurrent REST publish-all pair: 1 of 5 pairs processed the source twice and SourceRevisionDate did not advance → translations not Outdated (UI double-click guarded) | 4a-be bug 5 / 3x #12 | FAIL (Low) |
| B46 | VIS/FE | Storefront switcher: two "English", two "Nederlands", flags alt="" — indistinguishable to AT | 4v D5 / 3x | FAIL (Low) |
| B47 | FE | Page Builder pages have no og:url and a generic <title> (BL-SEO-003); same on vcst control → pre-existing | 4a-fe S3 | FAIL (pre-existing) |
| B48 | FE | PUT grouped with userGroups as JSON array → 500 NRE instead of 400 | 4a-fe incidental | FAIL (Low) |
| B49 | BE | pageDocument(id) for an archived former ML version → GraphQL error inside 200 ("Error trying to resolve field 'content'"); archived plain landing returns full content by id | 4a-be observation | ADVISORY — not on the storefront path (slugInfo null for all) |

## Gap top-up — 2026-10-26 (firefox lane; chrome/edge/mobile MCP down; mobile 375 px removed by user)
| # | Lane | Condition | Source | Verdict |
|---|---|---|---|---|
| B50 | FE | D4 live re-check: fr-FR version hidden by user group → /fr/<fr permalink> | gap G1 | FAIL — 404 at 200 instead of fallback; signed-in slugInfo null in every culture, anonymous slugInfo returns the hidden id; anonymous id leak is PRE-EXISTING (same on a plain restricted Landing page); missing fallback is IN-SCOPE (gap-G1-01) |
| B51 | FE | Firefox parity: /fr/<fr> → English → /<en>; /es/<en> fallback; alternates/hreflang | gap G3 | PASS (gap-G3-01/02) |
| B52 | FE/API | Language removed from a store (store2, fr-FR added then removed, restored and read back) | gap G4 | PASS on xAPI — alternates drop fr-FR, slugInfo(fr permalink, en-US) → en-US; storefront2 host does not resolve (NOT REACHED); ADVISORY: slugInfo/pageDocument still serve the fr-FR version for cultureName fr-FR (KB-F0FCB9A2) |
| B53 | Edge | Storefront on Edge | — | BLOCKED — playwright-edge MCP not connected (needs restart) |
| B54 | GQL | C1 re-run 050f after test fixes (REG-2026-10-26-0858-c1b) | 050f | CMS-GQL-135 PASS 10/10 (product/category slugs en+fr through the page-first resolver); CMS-GQL-133/134 create+publish now 200, convert/link 404 → BLOCKED-on-deploy (PageBuilderModule replaced by pr-178 at ~09:15 UTC, ML API gone) |

| B55 | BE | C1 re-run 060c after seed:cms-assets (REG-2026-10-26-0924, firefox, PageBuilderModule pr-178) | 060c | 5 PASS (CMS-199, 200, 207, 208, 209); CMS-215 FAIL — shell paginator Next/Last stay enabled after a zero-hit search (known pr-171 defect, OUT-OF-SCOPE for VCST-4935, Low); BLOCKED: CMS-210 FIXTURE-GAP, CMS-211/212 need page evaluation (hook-blocked; 212 observable asserts passed); chooser REPAIR not exercised (no chooser on pr-178) |

Environment note 2026-10-26: PageBuilderModule on vcptcore-qa is now 3.1036.0-pr-178-61e8 (PR 175 removed); Pages pr-23 and XCMS pr-27 unchanged. Any further ML admin/REST check needs PR 175 redeployed. 4 ML roots left from the gap run (b7060959…, ddd7476e…, 4f22b957…, 782438d7…) can only be deleted once PR 175 is back.

Uncovered/held: B35 (no case — question), B38 (WAIVED, reason above), UI part of B32 (BLOCKED: RESTRICTED_CMS_ADMIN_PASSWORD not in --secrets). Release-process risk (not a test item): PRs pin pre-release package versions (theme `backend-packages.json`, x-cms/pagebuilder manifests → Pages 3.1011.0-alpha.91-vcst-4935).

Not filed (below severity floor): to be filled at 5-report.

## Corpus proposals for suites held by VCST-6443 (not applied)

`059-page-builder.csv` and `060b-page-builder-fields-assets.csv` carry uncommitted edits from another session, so Artifact A only proposes. None of these was edited. Whoever owns the suite applies them, then carries REPAIR and RE-BASE ids into C1.

### 059-page-builder.csv
| Id | Proposed | Reason |
|---|---|---|
| CMS-001, 112, 118, 130, 135 | REPAIR | Add on a multi-language store (B2B-store) now opens a page-type chooser before the Landing Page blade; insert a step choosing "Landing Page". Mechanics only. |
| CMS-220, 235, 242, 247, 252, 253 | REPAIR (shell half only) | Same chooser step in the shell Add path. The legacy Content-module half of 235, 242, 252, 253 is CONFIRMED (no chooser assumed there; unverified). |
| CMS-017, 018, 020 | RE-BASE | Assert Draft/Active/Archived badges and counters; the list loads via POST /list, one row per Multilanguage Page, Status cell empty for those rows. Keep the assertion, carry to C1. |
| CMS-019, 021 | RE-BASE | Pending tab and counters, same list change. Not tc:scope hits; taken from the discovery at-risk list. |
| CMS-128 | RE-BASE | Asserts Draft/Active counter movement after Unpublish; same list change. |
| CMS-115, 116, 186, 228 | watch (CONFIRMED) | 115/116/186: unchanged-count and relative-subset assertions still hold; 228: legacy AngularJS Content-module list. |

### 060b-page-builder-fields-assets.csv
| Id | Proposed | Reason |
|---|---|---|
| CMS-087, 088 | REPAIR | Click Add to create a page: same chooser step. |
| CMS-097 | RE-BASE | Sorts by the Language column; Multilanguage rows show language pills instead of one language. |

### R1 suites (046, 003, 042)
Not held: no uncommitted edits. Dispositioned directly in the Artifact A return; no proposals.

C1 scope note (3-cases re-verify, APPROVE): the verifier recommended adding 046 L10N-ROUTE-001/004 and 003 CAT-078 (CONFIRMED, unchanged rows) to C1 as guards for the changed initLocale/getLocalizedPath rewrite. DECLINED for C1 — C1 is the exact set this run wrote or changed; the same selector path was exercised live in B30/B33 (which found S1, Back → 404). Recommended for the next deliberate /qa-regression on this theme build.

## Round 2 — retest on the new build (2026-10-27)
Build: Platform 3.1085.0 · PageBuilderModule 3.1039.0-pr-175-3d2f (pr-178 merged) · Pages 3.1011.0-pr-23-e50f · XCMS 3.1009.0-pr-27-a8d6 · theme pr-2576 (storefront last-modified 2026-10-27 12:06 GMT). Trigger: dev reply 2026-10-27 11:39. Round-1 rows above are kept as recorded (append-only).
Lanes: BE `qa-backend-expert` playwright-edge · FE `qa-frontend-expert` playwright-firefox (chrome held by a parallel VCST-6314 run). Fixture prefix `AGENT-TEST-VCST4935-R2-<lane>-`.

| # | Lane | Condition (round-1 ref → expected after fix) | Verdict |
|---|---|---|---|
| R2-01 | BE | D1 (B7/B41/CMS-ML-001/007): Link existing opens an inline row under the language with page select, Cancel, Link; option selectable by mouse; Link completes; "No options" visible when none; keyboard nav recorded only (vc-shell, out of scope) | |
| R2-02 | BE | D3 (B5/CMS-ML-005): POST root with non-store default → 400; "EN-us" stored as en-US; table shows isStoreLanguage:false for an unserved default | |
| R2-03 | BE | D3 (B8/CMS-ML-031): Link of a page in a non-store language → 400 | |
| R2-04 | BE | B35: PUT root with another storeId → 400; organizationId accepted (by design) | |
| R2-05 | BE | B18 (CMS-ML-017): 2nd Clone → "(copy 2)"/-copy-2 in every language; clone of a copy counts from the original; Landing Page clone same | |
| R2-06 | BE | B19 (CMS-ML-033): Clone from a version blade → no "[BladeMessaging] Caller blade not found" | |
| R2-07 | BE | B44 (CMS-ML-004): Name > 1024 → 400 on ML root, create-group-page, POST/PUT grouped; ML root permalink > 2048 / forbidden chars / // / ./.. → 400; blade validates before save | |
| R2-08 | BE | B45: 5 parallel Publish all pairs → source processed once, SourceRevisionDate advances, translations Outdated, 2nd call reports skipped; Archive all pair consistent | |
| R2-09 | BE | B43: language-table row buttons have accessible names incl. the language ("Create: fr-FR") | |
| R2-10 | BE | B20: ML Status cell "Published: N of M" + outdated count; full-culture pills (en-US/en-GB, nl-NL/nl-BL, single pill); "All languages" instead of "null" | |
| R2-11 | BE | B48: PUT grouped with userGroups as array → 400 | |
| R2-12 | BE | New: ML page without versions listed under Drafts | |
| R2-13 | BE | B14: Mark up to date on never-published source, and on the source itself → 400 with message | |
| R2-14 | BE | Regression on the new build: B2, B3, B6, B10, B11, B13, B15, B16, B21, B31 (+ pr-178 permalink rule on a plain Landing page) | |
| R2-15 | BE | Cleanup: round-1 leftover ML roots b7060959…, ddd7476e…, 4f22b957…, 782438d7… + round-2 fixtures | |
| R2-20 | FE | D4 (B28/B40/B50): fr-FR version hidden by user group → /fr/<fr> renders en-US (signed-in w/o group, anonymous); slugInfo returns no hidden id; Visibility-off translation for anonymous → fallback; restricted plain Landing page id no longer leaks | PASS — buyer /fr/<fr> → /fr/<en>, en-US content; slugInfo anon+buyer → en-US id, hidden id never returned; Visibility off → anon fallback (buyer keeps fr, by design); plain restricted Landing → entityInfo null (leak fixed) (r2-fe-R2-20-*) |
| R2-21 | FE | B26: root default de-DE, store en-US, no en-US version → /es/ and / fall back to the visited permalink's version; no x-default | PASS — de-DE content, hreflang de/fr, no x-default; after en-US publish → /es/<en> + x-default en-US (r2-fe-R2-21-*) |
| R2-22 | FE | Regression: B1 journey, B17, B25, B25b (restore setting), B27, B29, B30 (switch on PDP/category/search/static), B33 nl-NL/nl-BL | PASS — all sub-rows; MissingTranslationBehavior restored, read back null (r2-fe-R2-22-B1-switch-en.png) |
| R2-23 | FE | B39/D2 Back after a language switch — re-observe on the rebuilt theme (dev: pre-existing, separate ticket) | FAIL (pre-existing, out of ticket) — still 404 after Back: URL /fr/<fr>, html lang en-US, GetSlugInfo(fr/<fr>, en-US) null; static page same; nl-NL→nl-BL Back → /nl-NL/ + lang nl-BL 404 (r2-fe-R2-23-*) |
| R2-24 | FE | Theme build identity: confirm the deployed bundle is the latest pr-2576 build | PASS — 2.61.0-pr-2576-be2c-be2c7cc0 = PR head, CI 40482233460 green |
| R2-30 | C1 | Re-run round-1 non-passing C1 ids: 059m CMS-ML-001, 004, 005, 007, 017, 031, 032, 033 (FAIL), 023, 028 (BLOCKED); 050f CMS-GQL-133, 134 | PARTIAL — REG-2026-10-27-2202-r2: PASS CMS-ML-005, CMS-GQL-133; CMS-GQL-134 test defect (assertion path `alternates[*?cultureName=fr-FR].permalink` reads undefined, product returns it); BLOCKED CMS-ML-001/004/007/017/023/031/032/033 (runner REST fixture scripts denied by the auto-mode permission classifier — tooling, not product; conditions covered live by R2-01..R2-07, R2-23), CMS-ML-028 (RESTRICTED_CMS_ADMIN_PASSWORD absent). Test-defect proposal: CMS-ML-031 create-group-page body needs `content`. No CSV edited, no promotion |

### Round 2 — incidental findings (FE lane)
| # | Lane | Observation | Verdict |
|---|---|---|---|
| R2-F1 | FE/API | Scheduled translation (fr-FR StartDate in future): slugInfo(fr permalink, fr-FR) → null, no fallback to en-US — unlike a hidden translation (KB-F2888890) | ADVISORY — PO question (404 for a not-yet-live permalink is defensible) |
| R2-F2 | FE | /nl/<slug> with nl-BL pinned → /nl-BL/nl/<slug> 404 (unchanged since round 1) | FAIL (Low, pre-existing) |
| R2-F3 | FE | Header "Contacts" (/contacts) 404 in EN and DE | NOT ATTRIBUTED — env content, not this ticket |
| R2-F4 | FE | Language menu: two "English", two "Nederlands" (B46) | FAIL (Low, out of ticket by dev decision) |
Anonymous storefront not reachable on B2B-store (redirect to /sign-in) — anonymous side checked via xAPI without bearer.

### Round 2 — incidental findings (BE lane)
| # | Lane | Observation | Verdict |
|---|---|---|---|
| R2-F5 | BE | create-group-page accepts a non-store cultureName (xx-XX → 200); Link/Convert of it refused | FAIL (Low, pre-existing, not this ticket) |
| R2-F6 | BE | Version-less ML root saved with a permalink already served in en-US → no permalink-usage warning; a later Create inherits the colliding permalink | ADVISORY — dev question |

Round 2 verdict: PASS WITH NOTES · Jira comment 112447 · VCST-4935 Testing → Tested (2026-10-27, operator-confirmed). Not filed (below severity floor / out of ticket): R2-23 (separate vc-frontend ticket by dev), R2-F2, R2-F4, R2-F5, B42; questions R2-F1, R2-F6 in the comment.

## Round 2 — gap top-up (2026-10-28)
Trigger: operator asked "did you check everything?" — rows not re-run on the round-2 build. Lanes: BE edge · FE chrome (parity) · 4v firefox (DevTools attempt BLOCKED: profile not signed in, no --secrets).

| # | Lane | Condition | Verdict |
|---|---|---|---|
| G-4v-1 | VIS | Inline Link-existing row 1920/1366: layout, names, keyboard, disabled Link, "No options", axe | PASS w/ notes — no overlap/clipping, popup inside the blade (D1 fixed), named combobox, Enter/Space open, Esc closes, Link natively disabled until selection; N1–N3 below; axe: only framework VcSelect aria-required-children + 2.52:1 placeholder (r2g-4v-03..07) |
| G-4v-2 | VIS | Language table names + pill contrast | PASS names (D3 fixed); contrast unchanged 2.77 / 3.93 (known/accepted, vc-shell tokens); Outdated pill not measured (no fixture row) |
| G-4v-3 | VIS | Pages list Status / pills / Filters at 1366 | PASS layout (pills wrap, culture never hidden); "outdated: K" not observed in UI (covered by BE R2-10); Filters panel FAIL (pre-existing): focus never enters, 4 selects unnamed (axe aria-input-field-name ×4); N4 below (r2g-4v-01/08/09) |
| G-4v-4 | VIS | Conflict dialog focus trap / Esc / names | PASS — role dialog, named, focus trapped, Esc closes; focus not restored after Esc (Low, shared dialog) (r2g-4v-13) |
| N1 | VIS | ArrowDown on closed Link-existing combobox does not open it (WCAG 2.1.1) | FAIL (Low) — VcSelect keyboard, dev declared vc-shell scope |
| N2 | VIS | Focus lost after keyboard selection in Link-existing select; next Tab → top "Notifications" (WCAG 2.4.3), seen once | FAIL (Medium, likely vc-shell VcSelect — dev declared keyboard nav out of ticket) |
| N3 | VIS | Second Esc with the inline row open closes the whole blade | FAIL (Low, UX, in-scope) |
| N4 | VIS | List at 1366: row-hover delete icon overlaps/truncates Status text "Published: 2 of" (BL-UI-003/004) | FAIL (Low, in-scope) |
Leftover from 4v: archived Landing page AGENT-TEST-VCST4935-R2G-4V-a1 (id 4a0040f8-6a62-4e94-b218-52d335f4fe94) — no Delete for an archived Landing in the UI; remove by API.

### Gap top-up — FE Chrome parity (playwright-chrome)
| # | Lane | Condition | Verdict |
|---|---|---|---|
| G-C1 | FE | B1 journey on Chrome | PASS — hreflang de-DE/en-US/fr-FR + x-default absolute, no canonical; switch → /<en>, EN content (r2g-fe-C-1-*) |
| G-C2 | FE | D4 hidden fr-FR on Chrome | PASS — /fr/<fr> → /fr/<en> EN content; fr absent from hreflang; slugInfo buyer+anon never return hidden id (r2g-fe-C-2-*) |
| G-C3 | FE | B26 fallback on Chrome | PASS — /es/<de> and /<de> render DE, no x-default (r2g-fe-C-3-*) |
| G-C4 | FE | B30 switch PDP / category / search / static on Chrome | PASS (r2g-fe-C-4-*) |
| G-C5 | FE | B33 nl-NL / nl-BL on Chrome | PASS (r2g-fe-C-5-*) |
| G-C6 | FE | Back after switch on Chrome | FAIL (pre-existing, out of ticket) — identical to Firefox (r2g-fe-C-6-*) |
| G-CF1 | FE | PDP switch shows another product when two products share an en-US slug (env catalog data clash; KB-08DE22F1) | NOT THIS TICKET — env data, Low |
| G-CF2 | API | pageDocument(<old id after republish>){content} → INVALID_OPERATION error instead of null (cf. B49) | ADVISORY — not on storefront path |
Chrome = Firefox on every row. One HAR for C-1..C-6: r2g-fe-C-1-C-6.har.

### Gap top-up — BE (playwright-edge)
| # | Lane | Condition | Verdict |
|---|---|---|---|
| G-B9 | BE | Convert refusals (xx-XX, null culture, already linked) + no orphan root; valid Convert keeps URL | PASS — 400s, root count +1 only for the valid convert, URL unchanged (r2g-be-B9-B38-converted-en-url.png; KB-116F5DC4) |
| G-B32 | BE | Read-only editor: reads 200, every ML mutation 403 | PASS (REST) — after `seed:rbac --only RESTRICTED_CMS_ADMIN --verify` proved the account works (var was only missing locally): reads 200 ×10; mutations 403 ×21 (12 ML actions incl. reset-overrides + 9 grouped-page writes), state unchanged after each (admin re-read); KB-8105EAF3 confirmed. UI half not run (needs MCP reconnect or a restricted DevTools session) |
| G-B20 | BE | List Filters: type, language, Missing, Outdated, combination, empty state, Clear | PASS — counts match REST (53 ML / 171 Landing; pt-PT 4; Missing+pt-PT 49; Outdated 1 "Published: 3 of 13, outdated: 2"); empty state; Clear restores (r2g-be-B20-*) |
| G-B22–24 | BE (GQL) | slugInfo both directions, cultureName, alternates published-only, product/category slugs en+fr, unknown slug | PASS |
| G-B38 | BE+FE | Shared Components across convert / version / publish / clone; /fr/ renders the shared section | PASS — usageCount 1→1→2→2→4; fr renders "R2G SHARED" (r2g-be-B38-fr-shared-section.png) |
| G-060 | BE | pr-178 asset library smoke: list, upload, search, delete | PASS (r2g-be-060-*) |
| G-BF1 | BE | Content GET returns weak ETag W/ through Cloudflare; save rejects it unless W/ stripped | ADVISORY (env/proxy) |
| G-BF2 | BE | Asset delete double-encodes space (%2520), still deletes; counter "1 assets", files only | Low cosmetic (pr-178) |
Gap verdict: no in-scope blocker; round-2 verdict PASS WITH NOTES stands. New in-scope Lows: N3, N4; N1/N2 vc-shell VcSelect.

### Round 2 — tester-reported finding (2026-10-28)
| ID | Lane | Check | Verdict |
|----|------|-------|---------|
| R2-H1 | Admin UI | Link existing: long page name in a non-maximized blade → languages table overflows, Cancel/Link off-screen, zh-CN Unlink hidden; cause `linkPageSelect.vue` VcSelect without min-w-0 (new in PR #175) | FAIL Low → **VCST-6589** (Basil Kotov, Sprint 26-21, relates VCST-4935) |
