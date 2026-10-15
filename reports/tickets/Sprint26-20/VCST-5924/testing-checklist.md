# Testing checklist — VCST-5924 `[Configurable products] File attach enhancements` — round 2

- **Path:** FAST + `--visual` · `feature-test` · Story · operator override of `ticket-routing.md` §5b (domains = cart + orders → rule says FULL) · shape class: not `ui-kit` · no Test Model
- **Build under test:** storefront `http://localhost` = local theme `vc-theme-b2b-vue-2.60.0-pr-2485-f6cd-f6cd22b2` (PR vc-frontend#2485 head `f6cd22b2`, served index.html byte-identical to the ZIP) · API proxied to vcst-qa (Platform 3.1078.0; FileExperienceApi 3.1008.0, XCart 3.1041.0, XOrder 3.1015.0, Quote 3.1004.0, Orders 3.1018.0)
- **Round 1 (2026-09-16, vcptcore-qa1, theme pr-2485-ee6efd90):** FAIL. VCST-5995 (403 Order Details) + VCST-5999 (404 Quote) since fixed, Done, API-verified only. VCST-5996 cancelled — download is the intended behaviour, not inline open
- **PR delta since round 1:** `configuration-items.vue`: one row per file; `<a download>` + `downloadFile` on click when `url` exists; plain truncated text when it does not; stacked list with truncation
- **Data:** `data_surface: false`. Product `@td(CFG_FILE_HOODIE.url)` (optional File section `@td(CFG_FILE_HOODIE.fileSectionName)`, max 5 files, 1 MB); file `@td(CFG_TEST_FILES.validPdf.path)` + case-created `.txt` files (`AGENT-TEST-` prefix, one with a ≥80-char name); buyer `{{USER_EMAIL}}` (secret `TEST_USER_PASSWORD_VCST`). **The order is created in the case** (FIFTH RULE): orders placed before the fix builds keep 403 files (KB-45F13A37)
- **Routes:** `{{FRONT_URL}}/<CFG_FILE_HOODIE.url>` · `/cart` · `/checkout` (record whether a separate review step exists) · `/account/orders/<id>` · quote page (incidental)

Legend: Track `4a` = qa-frontend-expert (playwright-chrome) · `4v` = ui-ux-expert (Chrome DevTools MCP). Verdict filled in at 5-report.

## A. Story requirements (no ACs on the ticket; derived)

| # | Condition | How | Track | Verdict |
|---|---|---|---|---|
| A1 | **FLOW:** 2 divergent files (pdf + txt) attached on PDP travel to cart → checkout → placed order; each surface lists BOTH with the right name | PDP → Add to cart → place order | 4a | |
| A2 | Cart: each file is its own row (not a comma-joined line) | DOM: one `<a>` per file | 4a | |
| A3 | Cart: each file is a link with a real `href` (= the file's `/api/files/{id}`) and a `download` attribute | DOM attributes | 4a | |
| A4 | Cart: activating a link downloads THAT file. Bytes/size match the upload, no page navigation, network GET 200 | click + network + download event | 4a | |
| A5 | Checkout (pre-submit state, or the review step if one exists): A2–A4 hold | same | 4a | |
| A6 | **Order Details of a FRESH order: link downloads with 200 for the owner** (VCST-5995 fix in UI; round 1 = /403 page) | click both files | 4a | |
| A7 | Order Details: A2–A3 hold (one row per file, href + download) | DOM | 4a | |

## B. Gap conditions (PR delta, round-1 notes, regression of the shared component)

| # | Condition | How | Track | Verdict |
|---|---|---|---|---|
| B1 | Comment 2026-09-17 item 1: files visibly separated (stacked, non-touching) | screenshot cart + order | 4a / 4v | |
| B2 | ≥80-char filename truncates inside the cell. No table overflow, no horizontal page scroll at 1920 / 768 / 390. Full name reachable (title/aria) | resize + screenshot | 4v | |
| B3 | Accessible name of each link is the filename only, no trailing separator comma (round-1 Low) | a11y tree | 4v | |
| B4 | Keyboard: links are Tab-reachable with a visible focus ring; Enter triggers the download | keyboard | 4v | |
| B5 | Touch target of a file link at 390 px ≥ 24×24 or spacing-exempt (WCAG 2.5.8; VCST-5998 open) | measure | 4v | |
| B6 | Non-file sections (Product / Text) on the same line render as before, with no layout change | cart line with Text/Product sections, if the fixture has one; else note | 4a | |
| B7 | A file with no `url` renders as plain text, not a dead link (PR branch). Reachable only mid-upload → **attempt; else NOT REACHED + reason** | — | 4a | |
| B8 | Console: no errors from the component; no 4xx/5xx on file GETs across all surfaces | console + network | 4a | |
| B9 | Mobile 390: Order Details still identifies the attachment (round-1 Low: headers hidden, no label) | screenshot | 4v | |

## C. Incidental (outside the story's three surfaces — report, do not fail the story on)

| # | Condition | How | Track | Verdict |
|---|---|---|---|---|
| C1 | Quote created from a cart with files: quote page lists the files and the owner's download returns 200 (VCST-5999 fix in UI) | create quote from cart if the store allows | 4a | |
| C2 | Saved for later: a line with files moved to Saved for later shows the same file rows | move + inspect | 4a | |

## Verdict — BLOCKED (environment)
16 items PASS. B5 is the known VCST-5998. B7 NOT REACHED. **A6 (the round-1 FAIL) and C1 cannot be closed on any stand today.** vcst-qa has the backend fixes but no `product-configuration` upload scope (removed 2026-10-12, vc-deploy-dev#6911). vcptcore-qa has the scope but none of the fixes. **PR #2485 itself: every reachable condition passes.** To close: re-run A6 + C1 once vcst-qa has the scope back, or once vcptcore-qa has FileExperienceApi ≥ 3.1008 / XOrder ≥ 3.1015 / Quote ≥ 3.1004.

## Not covered by this run
- VCST-5997 (>5 files) and VCST-5998 (touch target) are open separate bugs. B5 only re-measures, it does not re-file
- No regression cases are authored (FAST). C1 regression (exact set) = empty, because no `--coverage` and nothing written

---

## Round 3 — re-test, FULL (2026-10-13, vcptcore-qa, theme 2.60.0-pr-2485-f6cd22b2 · FileExperienceApi 3.1008.0 · XOrder 3.1015.0 · Quote 3.1004.0)

- **Path:** FULL (§5b, operator choice) · model `reports/ba/test-models/VCST-5924-2026-10-13.md` (#n = model row) · round-2 BLOCKED cause cleared: the scope AND the fixes are on one stand
- **Data:** `data_surface: false` — `@td(CFG_FILE_HOODIE.url)`, `@td(CFG_TEST_FILES.validPdf.path)` + case-created `AGENT-TEST-` files; buyer `{{USER_EMAIL}}` (secret `TEST_USER_PASSWORD_VCST`). Orders/quotes created in the case (FIFTH RULE). PDP limit read from the page (9.5 MB / 5), not the alias (1 MB)
- **Deviation:** written while 3x is still running (operator asked to speed up); 3x findings are appended as `X*` rows when it returns
- Tracks: `4a` qa-frontend-expert (playwright-chrome) · `4v` ui-ux-expert (Chrome DevTools) · `4c` = C1 (Artifact A cases)

| # | Condition | Model | Track | Verdict |
|---|---|---|---|---|
| R3-1 | **[JOURNEY]** 2 divergent files (pdf + txt) uploaded on PDP → cart lists both → each downloads with its own bytes → place order → Order details lists both → each downloads 200 for the owner, page stays | #1 · C1/C3/C6/C7 | 4a | PASS — CO261013-00004; cart + order downloads 200, bytes identical (4a-r3-01/05) |
| R3-2 | Cart: one row per file, no comma join; `href` = that file's `/api/files/{id}`, `download` = its name | #2 · C2/C4 | 4a | PASS — one `<a>` per file, href/download correct |
| R3-3 | Cart click: download event (name + size match upload), page URL unchanged, no new tab | #3 · C3 | 4a | PASS — download event, URL stays /cart, one tab |
| R3-4 | **Order details, FRESH order: owner download 200 + correct bytes** (R1/R2 = /403) | #1 · C6/C7 | 4a | **PASS** — owner 200 + identical bytes (R1/R2: /403) |
| R3-5 | Order with 5 mixed-type files (pdf, txt, png, docx, xlsx): 5 rows, each download its own size | #4 | 4a | PASS — CO261013-00005, 5 files, each 200 with its own size (4a-r3-06/07) |
| R3-6 | Quote from cart with files: quote page lists links, owner download 200 (R1 = 404) | #5 | 4a | PASS — RFQ261013-00002, 3 files 200 draft + submitted (R1: 404) |
| R3-7 | Saved for later → back: file links present and downloadable (BL-CART-015); note what the saved card shows | #6 · C16 | 4a | PASS — new lineItemId, same urls, 200 after return; saved card shows no configuration |
| R3-8 | Two files with the SAME name, different content: two rows, two hrefs, two different sizes | #9 · C18 | 4a | PARTIAL — PDP refuses duplicate names (by design); via API both rows + distinct bytes (4a-r3-09/10) |
| R3-9 | Product + Text sections on the same line still show their values (cart + order) after the toCSV removal | #14 · C19 | 4a | PASS — Text/Product values intact on cart + order (CFG-034 404 on vcptcore; used file-driven-cond) |
| R3-10 | Edit configuration → replace the file → cart lists only the new file, it downloads | #15 | 4a | PASS — replace via Edit configuration, only new file listed, 200 |
| R3-11 | API parity: `Query.order` files.url == rendered hrefs; owner GET status matches UI | #16 | 4a | PASS — 8/8 hrefs == Query.orders files.url; owner 200, anon 403 |
| R3-12 | Legacy order (pre-fix, e.g. CO261013-00001 if this buyer's): click → status + what the UI does (/403 page? toast?) — observe, `{HYPOTHESIS}` | #10 · C8 | 4a | OBSERVED — owner 403, SPA → /403 page (4a-r3-08, 3x); pre-fix data, no spec |
| R3-13 | Checkout: `/checkout` → `/cart`? A separate review step (`checkout_multistep_enabled`)? If present: links + download there | R2 DRIFT · C5 | 4a | PASS — /checkout → /cart, no review step (flag OFF) |
| R3-14 | Console: no errors from the component; no 4xx/5xx on file GETs on cart / order / quote | C8 | 4a | PASS — no component errors; only env noise + expected legacy 403 |
| R3-15 | ≥80-char name: truncates in cell at 1920 / 768 / 390, no horizontal scroll, full name via title | #8 · C11 · BL-UI-004 | 4v | PASS — 90-char name ellipsis at 768/390, full title, no h-scroll |
| R3-16 | Order details at 768 / 390: links readable, not clipped/overlapping; attachments identifiable (R1 Low: no label at 390) | #12 · BL-UI-005 | 4v | PASS + ADVISORY — no Section label on order view (Low) |
| R3-17 | Touch target ≥ 24×24 CSS px or spacing-exempt at 390 (WCAG 2.5.8) — VCST-5998 open, re-measure only | #12 · C13 · BL-UI-006 | 4v | KNOWN — 14 px high, 18 px pitch (VCST-5998 open) |
| R3-18 | Keyboard: Tab reaches each link, visible focus, Enter downloads; accessible name = filename, no comma | #13 · C14 · BL-A11Y-001..003 | 4v | PASS + ADVISORY — Tab/Enter/focus OK, name = filename; focus ring clipped ~2 px (Low) |
| R3-19 | Link vs plain text distinguishable not by colour alone; link contrast ≥ 4.5:1 | C15 · BL-A11Y | 4v | PASS + ADVISORY — 6.82:1; colour-only link cue (Low) |
| R3-20 | Files visibly separated (stacked, gap) on cart + order — comment 2026-09-17 | C4 | 4v | PASS — stacked, 4 px gap |
| R3-21 | `vs. DESIGN` | — | 4v | SKIPPED — ticket has no Prototype link |

**Uncovered by any case / run (stated):** file without url (#7, span branch — unit-tested in PR; live reachability left to 3x) · legacy quote 404 UX (#11 → 3x) · purchase-request page (V6 → 3x) · other-buyer access (VCST-5995 scope, not this diff) · >5 files (VCST-5997) · zero-byte (VCST-6000).

**3x additions** (`reports/exploratory/SBTM-VCST-5924-2026-10-13.md`; edge lane lost ~30 min to a hung tool call):

| # | Condition | Source | Track | Verdict |
|---|---|---|---|---|
| X1 | `checkout_multistep_enabled` is OFF here: `/checkout` and `/checkout/review` → `/cart` — R2 not addressable on this stand | 3x obs. | 3x | OBSERVED |
| X2 | Order details table is `Number · Value` only (cart: `Number · Section · Value`) — a file on a multi-section line has no section label | 3x obs. | 3x / 4v | OBSERVED — by-design pending PO (Low) |
| X3 | Legacy order CO261013-00001: owner 403 ×3; click sends the whole SPA to `/403`, no toast (KB-10210674) | #10 | 3x | OBSERVED |
| X4 | Fresh order CO261013-00003: hrefs = cart file urls = `Query.orders` files.url; owner 200/200, sha match | #16 | 3x | PASS |
| X5 | Purchase-request page reachable, empty for this buyer — file links NOT REACHED; tab title shows raw key `purchase_requests.title` | V6 | 3x | NOT REACHED (links); raw i18n tab title (Low, out of scope) |
