# Design / a11y measurement lane — VCST-5869 (Track 4v, Chrome DevTools MCP, ui-ux-expert) — pass 2 (rep signed in)
Run 2026-09-21 · http://localhost · footer `Ver. 2.58.0-pr-2486-4348-43488a7a` (verified) · en-US · preset **Red** (`--color-primary-500` = `#e52121` after settle; a read straight after load returns the pre-import default `#d34247` — polled). No preset switched. Rep panel opened by REAL keys at 1920x1080 (click FILTERS-search → Tab ×2 → Enter); narrower widths opened by click (rect measurement only).

## Surfaces
| Surface | Result |
|---|---|
| Rep `/company/customer-orders` | REACHED (pass 2). Signed-in session dropped after the `/account/orders` visit (see below) |
| Buyer `/account/orders` | **BLOCKED(no buyer identity)** — same profile redirected to `/sign-in?returnUrl=/account/orders`, no Filters rendered. No account minted |
No credential typed/fetched; not signed out by me.

## Per item
| ID | Verdict | Measured |
|---|---|---|
| V-01 | **PASS (0 Critical/Serious violations)** on rep, buyer NOT reachable | axe-core 4.12.1 (canonical `axeRunSnippet` form, jsDelivr), tags wcag2a/aa/21a/21aa/22a/22aa. Closed trigger page: violations `[]`, incomplete `color-contrast`×1 (`.vc-alert__content > span`, server-error alert). OPEN rep panel: document violations `[]`; panel-only (`#vc-popover-247`) violations `[]`, incomplete `[]`; incomplete on page: `color-contrast`×33 (table cells/headers, not the panel), `aria-valid-attr-value`×1 (the FILTERS trigger, `aria-controls="vc-popover-247"`, needs manual review — `getElementById` resolves it to the panel). `aria-dialog-name` PASSED ×1. Buyer panel: BLOCKED |
| V-02 | **PASS/INFO facts (rep)** | table below |
| V-03 | **PASS** (Red preset, keyboard `:focus-visible` true everywhere) | ring = `outline: rgb(59,130,246) solid 2px`, offset 2px, box-shadow none on: panel div (`tabindex=-1`), Close X, Apply, Reset, checkboxes, Open-calendar btn, FILTERS trigger. **Select trigger "Created date"** (`input[role=combobox]`): input outline is `rgba(0,0,0,0)`; the ring is on the wrapper `.vc-input__container` (outline `rgb(59,130,246) solid 2px`, border 1px `#a3a3a3`). `#3b82f6` on `#fff` = **3.678:1** (node WCAG calc) ≥3:1. Start/End date inputs = VIS-01, excluded |
| V-04 | **PASS (no horizontal overflow, Close X hit)** | see rect table |
| V-05 | **SKIPPED** (no Prototype link) · tokens NOT_APPLICABLE (no colour/token change) · PR Storybook Dialog story SKIPPED (PR-build only) |

## V-02 raw attributes (rep, 1920)
| Element | aria-haspopup | aria-expanded | aria-controls | role | aria-modal | aria-label | tabindex |
|---|---|---|---|---|---|---|---|
| FILTERS trigger, closed | `dialog` | `false` | null | – | – | – | – |
| FILTERS trigger, open | `dialog` | `true` | `vc-popover-247` | – | – | – | – |
| Panel `div.vc-popover__body#vc-popover-247` | – | – | – | `dialog` | null | `Filters` | `-1` |
| Calendar popovers (closed, 0x0) ×2 | – | – | – | `dialog` | null | `Calendar` | `-1` |
| Mega-menu "All products" (guest pass 1) | `menu` | `false` | null | panel `menu` | null | `All products` | trigger 0 |
| Header Language/Currency (pass 1) | `dialog` | – | Language open: `vc-popover-8` | panel **no role** | null | **null** | null |
Focus on open (Enter): `document.activeElement` = the panel (`DIV[role=dialog]`, in panel). Non-modal: Tab from Apply leaves the panel (→ table sort "Date"); panel stays open. Header account button and chip/tooltip not measured (not exercised in pass 2).

## V-04 rep panel rect vs viewport (reload after each resize; hScroll = scrollWidth>innerWidth)
| Viewport | Panel l/t/r/b (w×h) | X inside | Close X rect / centre → elementFromPoint | hScroll |
|---|---|---|---|---|
| 1920x1080 | 1214/347/1654/1059 (440x712) | yes; b<1080 | 52x52 @1603,347 · (1628,373) → the Close X svg path | no |
| 1440x900 | 953/343/1393/1055 (440x712) | x yes; **b 1055 > vh 900** | (1367,369) → Close X | no (scrollW 1425) |
| 768x1024 | 289/260/729/1054 (440x794) | x yes; **b 1054 > 1024** | (703,286) → Close X | no (753) |
| 500 (window minimum — `resize_page` 414 was clamped to 500) | 21/248/461/1042 (440x794) | x yes | (435,274) → Close X | no (485) |
| 414x896 (emulated, mobile) | 8/248/390/1042 (382x794) | x yes | rect 338,248 52x52 · (364,274) → Close X | no (414) |
| 375x812 (emulated, mobile) | 8/236/351/1030 (343x794) | x yes | rect 299,236 52x52 · (325,262) → Close X | no (375) |
Horizontal containment and the Close X are fine at all widths (panel is 343 wide at 375). The panel is taller than the viewport at 1440x900 / 768 / 500 / 414 / 375 — Apply/Reset sit below the fold and need page scroll (INFO; not a BL-UI-004 horizontal failure). 375 screenshot timed out (`Page.captureScreenshot`); earlier exploratory `exp-375px-filters-panel-clipped.png` is the standing 375 evidence.

## Bug candidates (NOT filed)
1. Header Language/Currency triggers `aria-haspopup="dialog"` with `aria-controls` → panel has no role/label (Medium, 4.1.2). Legacy-vs-regression not determinable on this build alone.
2. OBSERVATION (unconfirmed): after visiting `/account/orders` as the rep, the profile's session was signed out (`/company/customer-orders` then redirected to `/sign-in`). Could be a route guard logging the rep out or coincidental expiry — not reproduced.
3. INFO: panel taller than viewport at ≤1440x900 (Apply/Reset below fold).

## Not concluded (manual)
Screen-reader speech · WCAG 2.2 additions other than 2.5.8 · non-gated presets · buyer-surface axe/attributes.

Screenshots: `screenshots/v-03-rep-panel-open-focus-1920.png`, `v-03-rep-panel-apply-focus-1920.png`, `v-04-rep-panel-500-window-min.png`, `v-04-rep-panel-414-emulated.png`.
