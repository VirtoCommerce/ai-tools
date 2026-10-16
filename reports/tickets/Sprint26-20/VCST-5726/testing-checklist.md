# VCST-5726 — Testing checklist (Artifact B)

**Ticket:** Asset Library: server-side pagination and reference counting at scale (500+ assets) · Story · High · FULL
**Env:** vcptcore_qa1 · PageBuilderModule 3.1035.0-pr-171-61df (temporary pin, vc-deploy-dev#6933) · Platform 3.1079.0-pr-3135-163c
**Model:** `reports/ba/test-models/VCST-5726-2026-10-14.md` (incl. Round 1 — 3x) · **Discovery:** `reports/exploratory/SBTM-VCST-5726-2026-10-14.md`
**Fixtures (seeded, `td:validate:cms-assets` green):** root `@td(PB_ASSETS_ROOT.folderUrl)` · `@td(PB_ASSETS_P500)` · `@td(PB_ASSETS_MIXED)` · `@td(PB_ASSETS_FOLDERS)` · `@td(PB_ASSETS_DEEP)` · `@td(PB_ASSETS_EMPTY)` · `@td(PB_ASSETS_TPL)` · refs `@td(PB_ASSET_REF_1)`=1 · `@td(PB_ASSET_REF_3)`=3 · `@td(PB_ASSET_REF_2)`=4 · `@td(PB_ASSET_REF_DEEP)`=1
**Lanes:** S = Shell + API (`qa-backend-expert`, playwright-edge) · D = Designer picker (`qa-frontend-expert`, playwright-chrome) · V = visual/a11y (`ui-ux-expert`, Chrome DevTools)
**Result legend:** PASS · FAIL · BLOCKED · N/A (with reason) · PENDING-A (covering case still being authored)

## AC1 — one page from the server; paginator shows the real total
| ID | Condition | Lane | Expected (oracle) | Model # | Result |
|---|---|---|---|---|---|
| C-01 | Open p500 (list): exactly ONE `POST /search` with `skip:0,take:20`; 20 rows shown; no `GET /api/assets` | S | {SPEC} AC1 | 1 | PASS — one /search skip 0 take 20, one /references (20 URLs), no GET /api/assets (4a-S-C01) |
| C-02 | Same in grid view: 20 tiles, same request shape | S | {SPEC} AC1 "list and grid" | 5 | PASS — grid, same request shape, 20 tiles (4a-S-C02) |
| C-03 | Page 2 → `skip:20`; page 25 (last) → `skip:480`, 20 rows; no 26th page | S | {SPEC} AC1 + BVA | 1, 3 | PASS — p2 skip 20; p25 skip 480 = asset-480..499; Next/Last disabled (4a-S-C03) |
| C-04 | Page size 100 → 5 pages; last page 100 rows; size change on page 3 resets to page 1 (`skip:0`) | S | {SPEC} dev contract | 3, 6 | PASS — size 100 on p3 ⇒ skip 0 take 100; 5 pages; last skip 400 |
| C-05 | `folders` (25 sub + 30 files): counter reads files (30), paginator pages = 55 entries; state which the UI calls "total" | S | {SPEC} AC1 "real total" — **record both numbers; the meaning needs a PO answer** | 2 | PASS — counter 30 = fileCount; paginator 3 pages = totalCount 55. **PO question:** which is "the real total" |
| C-06 | Delete the only file on a last page (throwaway upload into `empty`… or a 21-file throwaway folder) → UI lands on the last real page, rows shown, no empty page | S | {SPEC} AC1 + {OBSERVED} server clamp | 4 | PASS — deleting the only file on p2 ⇒ server clamps, UI lands on p1 with 20 rows (4a-S-C06) |
| C-07 | Empty folder `@td(PB_ASSETS_EMPTY)`: empty state, paginator controls all **disabled** (shell vs picker parity) | S, D | {SPEC} parity with picker ("0 of 0", disabled) | 28 | **FAIL (Low)** shell — empty folder: Next/Last enabled, dead clicks (4a-S-C07). Picker: PASS — "0 of 0", all four controls disabled (4a-D3-C07) |

## AC2 — search and sort over the whole location
| ID | Condition | Lane | Expected | Model # | Result |
|---|---|---|---|---|---|
| C-08 | From p500 page 5 search `499` → one request `keyword:"499", skip:0`; exactly asset-499.png | S | {SPEC} AC2 | 7 | PASS — from p5 one debounced request keyword 499 skip 0 ⇒ asset-499, refs 4 (4a-S-C08) |
| C-09 | Sort Name (Z-A) on page 3 → `sort:"name:desc"`, page resets to 1, first row asset-499 | S | {SPEC} AC2 | 8 | PASS — name:desc on p3 ⇒ skip 0, first asset-499 (4a-S-C09) |
| C-10 | Sort Recently modified → first row = `@td(PB_ASSETS_P500.firstByUpload)` or `lastByUpload` per direction (not asset-000) | S | {SPEC} AC2 (fixture uploaded shuffled) | 8 | PASS — modifiedDate:desc first = asset-129 = @td(PB_ASSETS_P500.lastByUpload); asc ⇒ asset-497 (4a-S-C10) |
| C-11 | Sort Largest first → request carries a size sort; folders stay on top in `folders` | S | {OBSERVED} folders-first; record | 10 | PASS — size:desc; folders stay on top (4a-S-C11) |
| C-12 | From the root search `d2-a` (exists only in deep/l1/l2) → 0 results; record the empty-state copy | S | {HYPOTHESIS} non-recursive — **PO decision**; copy ≠ "No assets in this folder yet" | 11, 29 | **FAIL (Low, copy)** — 0 results (non-recursive: PO decision) shown with the empty-FOLDER copy "No assets in this folder yet" (4a-S-C12) |
| C-13 | API: `sort:"foo"` → 400; `take:101` → 400; no `folderUrl` → 400 (no 500s) | S | {OBSERVED} 1c; contradict ⇒ finding | 9 | PASS — 400 for sort foo / take 101 / take 0 / skip -5 / no folderUrl; anonymous 401; no 500s |

## AC3 — N refs in a bounded number of requests
| ID | Condition | Lane | Expected | Model # | Result |
|---|---|---|---|---|---|
| C-14 | p500 page 1: exactly ONE `POST /references` whose `assetUrls` = the 20 page URLs; asset-007 badge = 1 | S | {SPEC} AC3 + `@td(PB_ASSET_REF_1.expectedRefs)` | 12 | PASS — one /references = exactly the 20 page URLs; asset-007 = 1 |
| C-15 | Page 2: one new `/references`; asset-025 = 3. Name Z-A page 1: asset-499 = 4. Others = 0 | S | {SPEC} AC3 + fixture oracle 1/3/4 | 12 | PASS — p2 one new call, asset-025 = 3; Z-A p1 asset-499 = 4; others 0 |
| C-16 | API: `/references` with 100 asset URLs → 100 results in one response | S | {SPEC} AC3 | 14 | PASS — 100 URLs ⇒ 100 results in one response (~434 ms); 101 also accepted (no cap) |
| C-17 | `/references` forced 500 (route) → badges "—"/details "N/A", **never "0 refs"**; delete does not proceed unwarned | S | {OBSERVED} 3x → {SPEC}-candidate | 15 | PASS + finding — badges "—", details "Refs N/A", never 0; Delete then does nothing at all (no dialog, no toast) — UX Low/Medium (4a-S-C17) |
| C-18 | Details panel of asset-499 lists the 2 pages and 2 shared components | S | {SPEC} VCST-4932 + fixture | 12 | PASS — asset-499 "Used in (4)": 2 pages + 2 shared components (4a-S-C18) |

## AC4 — folder delete usage lookup
| ID | Condition | Lane | Expected | Model # | Result |
|---|---|---|---|---|---|
| C-19 | Delete `deep` → dialog opens; ONE `POST /references {folderUrl, includePages:true}`; warning names ref-4; **no** nested `/search` calls; time to dialog recorded. **CANCEL** | S | {SPEC} AC4 | 18 | PASS — one POST /references {folderUrl, includePages:true}, no nested /search, warning names ref-4, dialog <1 s (API 252 ms); CANCELLED (4a-S-C19) |
| C-20 | Delete a throwaway nested folder with no refs → dialog with no usage warning; confirm; folder gone, total −1 | S | {SPEC} AC9 delete | 18 | PASS — throwaway nested folder: no usage warning, deleted, 20→19 |

## AC5 — measured at 500 assets
| ID | Condition | Lane | Expected | Model # | Result |
|---|---|---|---|---|---|
| C-21 | Image GETs: grid page 1 = 20, page 2 = the next 20, none for off-page assets | S | {SPEC} AC5a | 1 | PASS — image GETs p1 = asset-000..019, p2 = 020..039; none off-page |
| C-22 | Time (3 runs, median) for: open p500, next page, search `499` — **recorded, not judged** | S | AC5b budget **not agreed** ⇒ reported as data | 1 | DATA — median open 530 ms · next page 570 ms · search 488 ms (cold first call 1–2 s). Budget not agreed ⇒ no verdict |

## AC6 — Designer picker obeys the same limits
| ID | Condition | Lane | Expected | Model # | Result |
|---|---|---|---|---|---|
| C-23 | Picker on `mixed`: request has `acceptedTypes`, skip/take; "1 – 20 of 480"; first asset-020; no PDFs | D | {SPEC} dev step 6 | 20 | PASS — picker on mixed: acceptedTypes ["image/*"], "1 – 20 of 480", first asset-020; no PDF on pages 1, 2, size 50/100, last page (4a-D3-C23) |
| C-24 | Picker page 2, sizes 50/100, search `499` → server-side; one hit | D | {SPEC} AC6 + AC2 | 21 | PASS — picker Next ⇒ skip 20; size 50 on p2 resets to skip 0; one debounced request for `499` ⇒ 1 of 1 (4a-D3-C24) |
| C-25 | Pick asset-025 from picker page 2 into a NEW throwaway page, save → page content holds that asset; its refs become 4 (delete the page after) | D | {SPEC} AC6 + reference index | 22, 13b | PASS — picked asset-025 from picker p2 into a throwaway page, saved; stored URL = the same absolute form as the seed; refs 3 → 4 → 3 after the page was deleted (4a-D3-C25) |
| C-26 | Legacy GET descriptor via configUrl/theme override | D | **N/A on this env** — no UI sets configUrl (3x); FIXTURE-GAP | 23 | N/A — no UI sets configUrl; descriptor = static settings.json + GET /api/pagebuilder/settings ({}); FIXTURE-GAP |

## AC7 — superseded responses dropped
| ID | Condition | Lane | Expected | Model # | Result |
|---|---|---|---|---|---|
| C-27 | Throttle (Slow 3G / route delay on older request): type `4`→`49`→`499` fast → final rows = `499` result | S | {SPEC} AC7 | 24 | PASS — older responses delayed 6 s / 3.5 s arrived after `499`; final grid = asset-499 only (4a-S-C27) |
| C-28 | Throttled: click Next 5× fast → final page = 6 and rows = that page | S, D | {SPEC} AC7 | 24 | PASS — shell: Next locked while loading (clicks serialise). Picker: Next stays enabled, 5 overlapping clicks, the delayed skip 20 response was dropped; final page 6 correct; CLS 0.00013 (4a-D3-C28) |

## AC8 — restored offset
| ID | Condition | Lane | Expected | Model # | Result |
|---|---|---|---|---|---|
| C-29 | Page 3 of p500 → reload → record folder/page/sort/view after reload; paginator agrees with rows | S | AC8 **N/A by design** (no stateKey) — record behaviour; a mismatch is a FAIL | UIP-REFRESH | PASS (recorded) — reload ⇒ root / p1 / Name A-Z / grid; paginator agrees with rows; >4 s loader on first paint |

## AC9 — no regression
| ID | Condition | Lane | Expected | Model # | Result |
|---|---|---|---|---|---|
| C-30 | Into a subfolder from p500 page 3, breadcrumb back → page 1, search cleared | S | {SPEC} AC9 | 19 | **FAIL (Medium)** — page resets on folder change, but the search keyword is carried into the next folder: search `p500` at root, open p500 ⇒ "No assets in this folder yet" on a 500-file folder (4a-S-C30). **Same in the Designer picker** (4a-D3-obs-keyword-kept-after-breadcrumb) |
| C-31 | Details panel + Copy URL on an asset from page 2 | S | {SPEC} AC9 | 19 | PASS — details of asset-025 from p2 correct; Copy URL toast (4a-S-C31) |
| C-32 | Upload (button) a throwaway `agent-test-new.png` into p500 from page 1 → lands on its page; total 501; delete it after | S | {SPEC} dev contract | 16 | PASS — upload from p1 ⇒ 501, file shown and selected; deleted ⇒ 500 (4a-S-C32) |
| C-33 | Drag & drop upload into a throwaway folder works | S | {SPEC} AC9 | 9 | PASS (note) — DnD works on the Upload dialog drop zone; dropping on the grid is not supported (4a-S-C33) |
| C-34 | Upload a file named `asset-450.png` from page 1 → replace dialog (Cancel / Replace / Upload as); **Cancel** | S | {SPEC} dev step 4 | 17 | PASS — "File name conflict" Cancel / Replace / Upload as; Cancel writes nothing (4a-S-C34) |

## Security & permissions (comment on ticket + 1c)
| ID | Condition | Lane | Expected | Model # | Result |
|---|---|---|---|---|---|
| C-35 | `{{=window.__vcst5726=1}}` as search keyword (shell + picker); open `tpl-{{…}}` folder; list `tpl` → request bodies carry the literal; `window.__vcst5726` undefined in shell and Designer frame | S, D | {SPEC} security review on PR #171 | 25 | PASS — shell and picker: keyword and folderUrl carry the literal; window.__vcst5726 undefined in the shell and the Designer frame (4a-S-C35, 4a-D3-C35) |
| C-36 | Token without `platform:asset:read` → `/search` 403 | S | {SPEC} BSC-1 | 26 | PASS — RESTRICTED_CMS_ADMIN seeded; /search 403, GET /api/assets 403 |
| C-37 | Token with asset read but no Page Builder read → `/references` 403, UI "—" not "0" | S | {SPEC} BSC-2 | 27 | PASS (server) — throwaway asset-read-only role: /search 200, /references 403 (all forms); UI half not run; role/user deleted |

## Visual / accessibility (lane V)
| ID | Condition | Lane | Expected | Result |
|---|---|---|---|---|
| V-01 | Paginator, page-size select, sort select: keyboard-operable, visible focus, accessible names | V | BL-A11Y-001..004 | PASS (advisory) — names, aria-current, disabled OK; focus ring ~1.2:1 (Medium, WCAG 1.4.11); extra "Toggle dropdown" tab stop; selected option unnamed; DE aria-labels stay English (4v-*) |
| V-02 | Page switch causes no layout shift (CLS ≤ 0.1) in grid | V | BL-UI-001 | PASS — CLS 0.000 on grid p1→2→3, and under Fast 3G |
| V-03 | Paginator strings are translated (no raw i18n keys) in en + one other locale | V | DoD (1d) | PASS — EN + DE strings translated, no raw keys |

## Not covered by this checklist (stated, not silent)
- AC5b pass/fail — no budget agreed (open question on the ticket).
- V4 legacy descriptor (C-26) — not reachable on this env.
- C-36/C-37 role scenarios — fixture gap unless seeded during 4a.
- Release recommendation — `/qa-test` makes none (no cross-suite sweep); gate recorded `not-assessed`.
