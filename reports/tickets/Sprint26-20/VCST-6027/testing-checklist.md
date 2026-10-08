# Testing checklist — VCST-6027 [Configurable products] Check list to help the user to proceed next

**Env (hybrid):** storefront `http://localhost` = vc-frontend PR #2527 build `2.59.0-pr-2527-d089-d08928e7` (header `X-VC-Local-Theme: fe-b0b078dafdb1`) · API/Admin proxied to vcst-qa (`TEST_ENV=vcst`, B2B-store) · backend not changed by this ticket (Catalog 3.1046.0, XCatalog 3.1022.0, XCart 3.1038.0-pr-141-3d86)
**Model:** `reports/ba/test-models/VCST-6027-2026-10-06.md` (#1–#28) · **Discovery:** `reports/exploratory/SBTM-VCST-6027-2026-10-06.md` · **C1:** `REG-2026-10-06-1857` (26/31 PASS)
**Actor:** Buyer — signed-in `{{USER_EMAIL}}` (anonymous renders identically, 1r) · **Fixtures:** `@td(CFG_*)` CFG-023…CFG-033 · `@td(CFG_CHECKLIST_ALLTYPES)` (3a)
**Oracle:** `{SPEC}` = ticket description (AC-1…AC-3.1) · `{BL-CAT-006}` (SUSPECT) · `{DOC}` platform guide *Manage Product Configurations* · BL-UI-003/004/006 · mockup is **stale on grouping** (description wins)
**Lanes:** 4a chrome · firefox re-run (desktop; stalls at 375) · 4v Chrome DevTools · C1 edge+firefox · timing/CLS settled by in-page probes (`performance.now()`), not by agent snapshot polling.
**Result (2026-10-06):** 45 rows — 34 PASS · 5 FAIL (A1.1, C6, C9, C12, C13 — C9 restates A1.1; C13 is PRE-EXISTING) · 2 PARTIAL · 4 OBSERVED (PO) → **verdict FAIL** (AC-1 / AC-3.1 DRIFT confirmed live: Text and File rows show the name only).

## A. Acceptance criteria (as written)

| # | Condition | Source | Model | Verdict |
|---|---|---|---|---|
| A1.1 | A filled section's row is green and reads `{name} - {value}` | AC-1 | #11 #1 | **FAIL / DRIFT** — Product rows `Layers — AGENT-TEST-CHK-Layers …` (em dash); Text/File rows name only: "Text", "Photo for the cake topper", "Engraving Line 1" (`4a-alltypes-load-1920`, C1 CFG-CHK-011) |
| A1.2 | The value is clamped to max 2 rows (no overflow, full text reachable) | AC-1.1 | #20 | PASS — 2 lines at 1920 + 375, `scrollWidth = clientWidth`, full text in `title`/accessible name (chrome + firefox, C1 CFG-CHK-020) |
| A2.1 | A required, empty section's row is red `{name} - required` | AC-2 | #3 #4 #5 | PASS — "Text — required", "Photo for the cake topper — required", "Extra Type — required" … |
| A2.2 | Text → link "Fill it in", anchor to the option; when filled "- required" removed and row green | AC-2.1 | #3 #9 #13 | PASS — link focuses the section **header**, not the field (PR choice; PO ruling) |
| A2.3 | File → link "Upload a file", anchor to the option; when filled "- required" removed and row green | AC-2.2 | #4 #9 #16 | PASS |
| A2.4 | Other (Product) → link "Check it out", anchor to the option; when filled "- required" replaced by the value, green | AC-2.3 | #5 | PASS — shown only when a user action reveals a required Product (CFG-029, CFG-027); root/auto-revealed ones are preselected green |
| A3.1 | Optional sections are yellow, **NOT grouped**, one row each with its own "Review" link | AC-3 | #18 | PASS — 4 optional sections → 4 rows, 4 Review links |
| A3.2 | A filled optional section turns green `{name} - {value}` | AC-3.1 | #11 #12 | **PARTIAL / DRIFT** — Product "Icing — AGENT-TEST-CHK-Buttercream" ✓; optional Text "Message (completed)" and File show name only |

## B. The ticket's problem statement

| # | Condition | Source | Model | Verdict |
|---|---|---|---|---|
| B1 | While Add to cart is disabled, the checklist shows at least one red row naming the blocking section | statement · BL-CAT-006 | #7 #8 | PASS (after load settles) — every disabled state seen had a red row; see C6 for the ~0.5 s exception |
| B2 | When no row is red, Add to cart is enabled — measure the lag after the last required value (2 s = QA tolerance, `{HYPOTHESIS}` — PO to ratify; the ticket gives no number) | statement · BL-CAT-006 converse | #27 #8 | PASS — in-page: ~500 ms after the last keystroke (1920 and 375); C1 CFG-CHK-027 FAIL = snapshot-polling artifact (test-defect) |
| B3 | "(or any other btn)" — Add to list / Compare / Share / quote behaviour while a row is red is stated and consistent | statement | #26 | OBSERVED — Add to list, Compare, Share, Print stay enabled with a red row; ticket never defines "any other btn" → PO |

## C. Mechanism (Part 0 chain C1–C6)

| # | Condition | Model | Verdict |
|---|---|---|---|
| C1 | [JOURNEY] open → read rows → button disabled → each link → fill each required → dependents appear → all green → Add to cart → cart line = green rows | #1 | PASS — cart components = green rows (`4a-c1-cart-line-components`, C1 CFG-CHK-001) |
| C2 | Hidden dependent sections have no row; rows follow page/Admin section order | #2 | PASS |
| C3 | Root required Product sections (default or first option) are green on load with the value | #6 | PASS — "Frame Material — …Carbon", "Service Plan — …Basic" |
| C4 | A required Product child revealed by its parent is red with "Check it out" (CFG-029, CFG-027 two siblings) | #5 | PASS |
| C5 | Decision table: button enabled ⇔ no red row, over required × optional states (CFG-027) | #7 | PASS — 5/5 cells (chrome, firefox, C1) |
| C6 | No rows-green / button-disabled window at first paint or after an edit (CFG-023, CFG-029) | #8 #27 | **FAIL (Low)** — in-page: ~500–550 ms on every load (6/6) and ~0.5 s after each edit → `BUG-config-checklist-green-while-add-to-cart-disabled-500ms-VCST-6027` |
| C7 | Each link expands the section (even if manually collapsed), scrolls to it, focuses it; URL unchanged | #9 | PASS (chrome + firefox) |
| C8 | Link of a just-revealed dependent row works | #17 | PASS |
| C9 | Done label per type: Product `name — value`; Text/File required and optional — per AC (name + value) | #11 | **FAIL / DRIFT** — = A1.1 / A3.2 |
| C10 | Optional Product → None returns the row to "— optional" + Review | #12 | PASS |
| C11 | Required Text: type → green; clear → red + button disabled | #13 | PASS |
| C12 | Whitespace-only text: required stays red + disabled; optional Notes not shown as done | #14 | **FAIL (Low)** — required ✓; optional → "Notes (completed)", `customText:"   "` sent → `BUG-config-checklist-whitespace-optional-text-completed-VCST-6027` |
| C13 | Whitespace-only required PARENT text does not reveal its dependent section/row | #28 | **FAIL (Low, PRE-EXISTING)** — Style Pack revealed; reproduced on the deployed theme without the checklist → `BUG-config-whitespace-parent-text-reveals-dependent-section` |
| C14 | Text at maxLength: row green; input truncates beyond (paste check) | #15 | PASS — "50 / 50" / "60 / 60" |
| C15 | Required File: upload → green; remove → red + disabled; rejected type → stays red | #16 | PASS — ".exe": "File format is not allowed" |
| C16 | Optional File: upload → green; remove → "— optional" + Review | #16 | PASS |
| C17 | Dependent chain CFG-023: Creme → Message → required text row red + button disabled → Creme None → rows gone + enabled | #17 | PASS |
| C18 | Duplicate section names (CFG-033): separate rows, each link opens its own section | #19 | PASS |
| C19 | SPA navigation to another configurable product: checklist = new product's sections; Back restores correctly | #25 | PASS (chrome + firefox) |

## D. Edit configured cart line (`?lineItemId=`) — conditions the ACs never named

| # | Condition | Model | Verdict |
|---|---|---|---|
| D1 | Checklist prefilled green from the line; button "Update cart" gates like Add to cart | #10 | PASS |
| D2 | Checklist links never open the "Save changes" dialog; URL keeps `lineItemId` | #10 | PASS |
| D3 | Clear a required value → red + Update cart disabled; refill → enabled — lag measured (2 s QA tolerance, `{HYPOTHESIS}`) | #10 #27 | PASS — ≤ 0.1 s sample |
| D4 | "Create new configuration" link (still fires the save guard — pre-existing) | #10 | PASS — "Save changes" dialog (fires even on an identical retype — pre-existing note) |
| D5 | Cleanup: the configured cart line created for D1–D4 is removed | — | PASS — "Your cart is empty" |

## E. Layout, mobile, a11y, i18n

| # | Condition | Model | Verdict |
|---|---|---|---|
| E1 | Checklist sits below Add to cart + stock badge; no layout shift when rows change status (BL-UI-003) | #22 #1 | PARTIAL — placement ✓, Add to cart does not move (4v BL-UI-003 PASS); a row shrinking 30→16 px moves content BELOW the card 14 px. Page CLS 0.112–0.147 is **PRE-EXISTING** (identical on the deployed theme without the checklist) |
| E2 | Long label (> 2 lines, CFG_CHECKLIST_ALLTYPES) clamped inside the widget at 1920 and 375 px; full text in `title` (BL-UI-004) | #20 | PASS |
| E3 | 375 px: checklist in "Share & Actions"; links scroll + expand; vs sticky bottom Add to cart | #21 | OBSERVED — works; checklist at y≈2167 while the disabled sticky Add to cart has no reason in view → PO / UX |
| E4 | Link target size ≥ 24×24 or spacing exception (BL-UI-006) — 3x measured 40×14 | #21 | PASS via spacing exception (39–67×14, ≥ 44 px apart) |
| E5 | Status not by colour only: sr-only "(completed)" / "required" / "optional"; link names + `aria-describedby`; focus visible after keyboard activation | #22 | PASS — **but** BL-A11Y-004 FAIL: status changes not announced (no `aria-live`) — 4v |
| E6 | Non-configurable product (simple, variations): no checklist, price block unchanged | #23 | PASS |
| E7 | Deutsch: all checklist strings translated, no raw keys | #24 | PASS — "Konfigurations-Checkliste", "erforderlich", "Datei hochladen", "(abgeschlossen)" |
| E8 | Legacy per-section prompt "Complete all required options…" coexisting with the checklist — recorded for PO ruling | — | OBSERVED — duplicate messaging; same state also reads "Section is required" after interaction |
| E9 | Deep link `#product-configuration-section-<id>` — observed: scroll + focus, not expanded — recorded for PO ruling | — | OBSERVED |
| E10 | Console: no new errors on PDP load, link click, fill/clear (always-on) | — | PASS — 0 JS errors; only AGENT-TEST fixture-image 404s |

## Coverage of the 27 atomic conditions (1d C-01…C-27)

Every C-xx maps to a row above or to an Artifact-A case — all **28 `CFG-CHK-001…028` now exist** in
`072-configurable-products-ui.csv` (Draft; executed in C1 `REG-2026-10-06-1857`). C-27 (print-hidden) → **not covered — print is out of scope for this run** (stated, not silent).

## F. Corpus triage — Artifact A phase 2a

**Invocation:** `npm run tc:scope -- --domain configurable-products,cat --suite 072,072b,072c,072d,072e,009 --observable "Add to cart" --observable "Price and delivery" --observable "required" --observable "Fill it in" --observable "Upload a file" --json`
**Counts:** 8 suites scoped (incl. 050i, 052 by tag), 367 rows, **211 hits**, unscannable `[]`.
**Unmatched observables at scan time:** "Price and delivery", "Fill it in", "Upload a file" (new strings, no prior coverage; a re-run now matches them only on the new `CFG-CHK-*` rows).
**Missed-RE-BASE re-check:** no hit asserts Price-and-delivery layout, "Create new configuration" position or edit mode in a way the PR moves (checklist sits between price and link; "below price" still true). The Manual gate rows `CFG-PDP-033/034/035/039/043-COND` assert Add-to-cart enable/disable (same class as the two RE-BASE rows) but are NOT_EXECUTING, so C1 cannot run them: CONFIRMED, exposure noted.

| Disposition | Count | Ids | Reason |
|---|---|---|---|
| REPAIR | 1 | CFG-GQL-032 | dead alias CFG_WEDDING_CAKE_CONDITIONS (YOC-85609878 gone) re-pointed to CFG_WEDDING_CAKE_CONDITIONAL; assertions untouched; re-linted, no new findings |
| RE-BASE | 2 | CFG-E2E-074-COND, CFG-FILE-ST-003 | executable rows asserting button disabled/enabled transitions after edits; 3x saw 5-16 s enable lag; old assertion kept, run in C1 |
| SUPERSEDED | 0 | none | no surface removed |
| CONFIRMED | 22 | B2C-VAR-001/002/003/005/006/008/009/011/012, B2C-CONFIG-001..008/011/012/013/014/018 | 009: variation PDPs have no checklist; configurable rows assert options/price/mobile/a11y generics; "Add to cart" is a term match |
| CONFIRMED | 26 | CFG-GQL-001/004/005/006/007/008/009/010/011/012/013/023/024/027/028/030/031/033/042/043/045/048/049/050/051/057 | 050i GraphQL: PR is storefront-only, no xAPI change |
| CONFIRMED | 7 | CFG-CA-002/005/011/016/019/025/029 | 052 Admin/REST authoring unchanged |
| CONFIRMED | 17 | CFG-VAR-013/017/019, CFG-XAPI-001/002/003/004/005/008, CFG-E2E-034/035/036/053/063-COND, CFG-GQL-010-COND, CFG-CROSS-001-COND, CFG-CROSS-002-COND | API-level payload assertions, untouched |
| CONFIRMED | 7 | CFG-E2E-070/071-COND/072-COND/075, CFG-PDP-042/043/049-COND | executable config/cart/default rows; no moved assertion; run under normal selection |
| CONFIRMED | 129 | 072: CFG-PDP-001/005/006/007/011/015/016/017/020-COND/026-COND/027-COND/028-COND/029-COND/033-COND/034-COND/035-COND/036-COND/038-COND/039-COND/040-COND/043-COND, CFG-VAR-001/006/007/008/009/010, CFG-ADM-001/002/003/004/010, CFG-PROMO-001/002/003/004, CFG-MOB-003, CFG-A11Y-001, CFG-B2B-001/002, CFG-TEXT-010/011, CFG-EDIT-001/002/003, CFG-EDGE-001, CFG-GA4-002/003; 072b: CFG-E2E-002/003/004/005/007/009/010/011/012/013/015/016/017..033/037/038/039/040/041/042/043/045/046/048/051/055/056/057/058..062-COND/064..070-COND, CFG-VAR-020/021; 072d: CFG-FILE-002/003/004/005/009, CFG-TEXT-001..009, CFG-TEXT-019-COND-TOAST, CFG-TEXT-COUNTER-001/002/003/005/006; 072e: CFG-3902-001/002/003/004/006 | Manual (NOT_EXECUTING); gate, section rendering, per-section prompts, cart and edit-mode behaviour unchanged |

Total 1 + 2 + 0 + 208 = 211; every hit id appears once.
