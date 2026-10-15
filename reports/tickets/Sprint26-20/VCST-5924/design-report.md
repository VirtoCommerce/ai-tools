# VCST-5924 round 2 - visual lane (4v) - design / a11y report

PR vc-frontend#2485 (`configuration-items.vue`), theme `2.60.0-pr-2485-f6cd-f6cd22b2` on `http://localhost`. Chrome DevTools MCP, isolated context, anonymous shopper (no login). Date 2026-10-13.

## READ FIRST - data caveat (affects every live B-item)
The File upload could NOT produce real files: `POST /api/files/product-configuration` returns `200 {"succeeded":false,"errorCode":"INVALID_SCOPE","errorMessage":"Unknown scope 'product-configuration'"}` on `vcst-qa.govirto.com` itself (same with direct curl, so not the local proxy). The UI shows nothing for it. Anonymous add-to-cart works, but `addItem` with `fileUrls` returns `files: []` (server drops unknown urls). So the cart had two File lines with **empty** files.
To measure the PR component I injected a **synthetic** GraphQL response (initScript `fetch` wrapper) giving the File item 4 files: `test-fixture-1page.pdf`, `AGENT-TEST-short.txt`, an 109-char `AGENT-TEST-this-is-a-very-long-...-abcdefghij.txt`, and `AGENT-TEST-pending-no-url.txt` (url null), urls `/api/files/AAAA|BBBB|CCCC` (nonexistent). Layout/a11y/keyboard results below are real DOM measurements of the PR component; the download itself is NOT verified end to end (the injected urls 404). Real upload verdicts need a stand with the scope registered.

## Axis verdicts
| Axis | Verdict |
|---|---|
| vs. DESIGN | SKIPPED - no Claude Design / prototype link on VCST-5924 |
| vs. RULES BL-UI-001/003 | not exercised (no load shift observed; nothing hover-driven in the component) |
| BL-UI-004 content boundary | PASS (1920/768/390) |
| BL-UI-005 alignment | PASS (links share left=470/86/52, row pitch 18) |
| BL-UI-006 touch target | FAIL (re-measure of VCST-5998) |
| WCAG 2.2 (axe, component-scoped) | 1 violation (target-size 2.5.8), already VCST-5998 |

## Per-item table
| Item | Verdict | Measured |
|---|---|---|
| B1 files stacked, non-touching | PASS (weak) | `.configuration-items__files` flex-col, `row-gap 4px`; link/span boxes 14px tall, gaps measured 4/4/4 px at 1920, 768 and 390; each file on its own line, no comma. 4 px is tight (18 px pitch, 12 px font) but they do not touch. Reviewer ask "spacing OR separate lines" satisfied by lines. Link vs no-url file differ only by colour (link `#155f7a` ~6.8:1 on `#fafafa`, no underline; plain `#0a0a0a`) - advisory |
| B2 80+ char name truncates, no overflow | PASS | 109-char name: 1920 w=609 untruncated (fits); 768 w=312 in a 312 px cell, scrollWidth 609, ellipsis; 390 w=286 in 286 px cell, ellipsis. `docSW` = 1905 (1920 minus scrollbar) / 753 / 390 - no horizontal page scroll at any width; files never exceed the table right edge (398/338). Full name reachable by `title` (109 chars) on both link and span; `aria-label` absent (not needed, name = text) |
| B3 accessible name = filename only | PASS | a11y tree: `link "test-fixture-1page.pdf"`, `link "AGENT-TEST-short.txt"`, `link "AGENT-TEST-this-is-...txt"`; the no-url file is plain StaticText. No separator comma. `href`, `download=<name>` set |
| B4 keyboard | PASS | Tab from "Components list": link1, link2, link3, then "Edit configuration" (no-url span correctly skipped, 3 stops = 3 links). `:focus-visible` true, outline `1.6px solid #1b789b`, offset 1.6px; ratio vs `#fafafa` ~4.8:1 (>=3:1, 1.4.11). Enter on link1 issued `GET /api/files/AAAA` (JS handler ran, download requested; 404 because synthetic). Screenshot `4v-cart-1920-focus-link1.png` |
| B5 touch target @390 | FAIL (VCST-5998, not re-filed) | link box 116x14 / 118x14 / 286x14 px; below 24x24 (2.5.8). Spacing exemption also fails: 4 px gap, 18 px centre pitch (<24), axe: "safe clickable space diameter 12px instead of 24". BL-UI-006 gap also 4 px < 8 |
| Round-1 low: label at 390 (headers hidden) | PASS in cart / UNVERIFIED in Order details | In the cart the row reads "1. Design Upload:" above the stacked files at all widths (390 screenshot) - the attachment has its label. Order details = other lane |
| axe 1920 (wcag2a/aa/21/22aa) | component: 1 serious | `target-size` x2 on the two 14px links (2.5.8). Out of scope: see findings |
| axe 390 | component: 1 serious | same `target-size` x2 (116x14, 117.8x14) |
| /checkout | n/a | `/checkout` redirects to `/cart` - single-page cart (Place order lives in the cart). Only the cart carries the component |

## Findings
| # | Sev | Provenance | Finding |
|---|---|---|---|
| F1 | Medium (env blocker) | OUT-OF-SCOPE (env) | `product-configuration` file scope unregistered on vcst-qa (INVALID_SCOPE, HTTP 200) - upload impossible for anyone, so the real file path of PR#2485 cannot be exercised on this stand. Known family: KB-53AE7807 (error text renders `Unknown scope ''.`; here the UI showed no visible error at all within the check) |
| F2 | Low | IN-SCOPE (PR #2485) = VCST-5998 | File links are 14 px high with 4 px gap: fail 2.5.8 and BL-UI-006 at 390 (and at 1920 per axe). Fix idea: `py-1.5`/`min-h-6` on `.configuration-items__file`, keep row gap >=8 px or make the link block 24 px |
| F3 | Low (advisory) | IN-SCOPE | Linked and unlinked files are distinguished by colour only (no underline); the unlinked "pending" file looks like plain label text. Acceptable for a separate list, flag for design |
| F4 | Low | PRE-EXISTING | A File section with no files renders a row "1. Design Upload:" with an empty value (confirmed with the real empty cart at 768); cosmetic |
| F5 | Medium | PRE-EXISTING / OUT-OF-SCOPE | Cart page axe: `aria-allowed-attr` critical on `#select-*-trigger` (delivery/payment select); `image-alt` critical on `.shipping-details-section__method-image--placeholder` and `.bg-neutral-100`; incomplete `aria-prohibited-attr` x5 and `color-contrast` (textarea placeholder, badge, widget header). None are in `configuration-items` |
| F6 | Low | PRE-EXISTING | At 390 the sticky "Total / Place order" bar covers the lower content while scrolling (visible in `4v-cart-390-components.png`); no focus-obscuring check run |

## Not verified
Real download of a stored file, screen-reader announcement, Order details (other lane), Coffee/Red preset pass (theme is B2B storefront here), hover colour contrast (`--link-hover-color`).

## Screenshots (`reports/tickets/Sprint26-20/VCST-5924/screenshots/`)
- `4v-cart-1920-components.png` - 4 stacked files, open Components list
- `4v-cart-1920-focus-link1.png` - focus ring on link 1
- `4v-cart-768-components.png` - 768 with the injected files (ellipsis on the long name)
- `4v-cart-390-components.png` - 390 with ellipsis on the 109-char name
- `4v-checkout-route.png` - `/checkout` landing on `/cart`

Cleanup: anonymous cart cleared via UI (Clear cart -> Yes, "Your cart is empty"); uploads were rejected by the server so no stored files; temp files only in the scratchpad.

## Round 3 (2026-10-13, vcptcore-qa, real data, playwright-edge, theme 2.60.0-pr-2485-f6cd22b2)

Orders: CO261013-00003 (2 files), -00004 (2 files), -00005 (5 files + 90-char name; also File/Product/Text rows). Read-only. Files sit behind the "Components list" toggle (collapsed by default, `.configuration-items__content` display:none) - expanded via UI.

| Row | Verdict | Measured |
|---|---|---|
| R3-15 long name | PASS | 90-char name: 508 px natural width. 1920: fits (block 910), no truncation. 768: link 312 px, scrollWidth 508, ellipsis, title = full name. 390: link 270 px, ellipsis, title full. docSW <= viewport at all three (no horizontal scroll) |
| R3-16 Order details 768/390 | PASS (ADVISORY) | No clipping/overlap; files stacked under the numbered row ("1."). ADVISORY: only Number/Value columns - File/Product/Text rows carry no section label (e.g. "2. AGENT-TEST r3 note text"), so a file is identifiable only by its extension |
| R3-17 target size | KNOWN (VCST-5998 open) | Links 14 px high x 116-142 px wide (12px/14px line-height) at 390/768/1920; 4 px gap, centre pitch 18 px, so the 24 px spacing exemption fails too. WCAG 2.5.8 / BL-UI-006 below AA |
| R3-18 keyboard | PASS (+ADVISORY) | Tab reaches link, :focus-visible true; Enter fired a download (test-fixture-1page.pdf, page stayed). Accessible name = filename (no comma, no aria-label). Focus ring solid 1.6px rgb(27,120,155), 4.78:1 vs #fafafa. ADVISORY: ring clipped ~2.2 px on top/left by `.configuration-items__value` (overflow hidden, padding 1px 16px 1px 1px) |
| R3-19 colour/contrast | PASS (ADVISORY on 1.4.1) | Text rgb(21,95,122) on #fafafa = 6.82:1; hover rgb(15,72,94) = 9.54:1. No underline in any state, weight 400; link vs body text (10,10,10) ~2.8:1 so colour alone distinguishes. Standalone list links (not inline in a sentence) so not an AA fail |
| R3-20 separation | PASS | Stacked block, row-gap 4 px, no wrap/overlap; 5 files at 18 px pitch |
| R3-21 vs. DESIGN | SKIPPED | No Prototype link on the ticket |

Legacy CO261013-00001: not clicked (R3-18 on 00003 only). Console: 0 errors (1 warning: platform/module version banner).
Evidence (screenshots/): 4v-r3-orderdetails-1920/768/390.png, 4v-r3-co5-1920/768/390.png (full page), 4v-r3-link-hover-390.png, 4v-r3-focus-1280.png, 4v-r3-focus-ring-closeup.png, 4v-r3-longname-1920.png (00004).
Incidental: orders table opened row in a new tab on click (not in scope, normal app behaviour).
