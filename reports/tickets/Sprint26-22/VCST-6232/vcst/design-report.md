# Design report — VCST-6232 round 2 (visual lane, `ui-kit`)

**Lane:** `vc-test:ui-ux-expert` on playwright-edge (Chromium) · **Preset:** red (coffee derived only, not run) · **Account:** `ORG_USER_EMAIL`, signed out of all three origins at the end.
**Surfaces:** classic-PR = vcst (theme 2.62.0-pr-2600-a4f2-a4f29534) · classic-BASE = local dev@4ce61d0c, :3001 · soft-PR = local a4f29534 with design soft, :3000 · Storybook-PR :6006. All local builds use the vcst backend.
**Method:** DOM-path-paired computed-style sampling (12 properties) injected once per origin and driven by real clicks; verbatim `LAYOUT_SNIPPETS.overflowAudit` + control rects for BL-UI-004/005; axe-core 4.10.2. Raw data `test-results/edge/v6232-4v/` (gitignored). Round 1 report re-measured, not trusted.
**Scope kept honest:** the brief's 6 pages (home, /catalog, a PDP, /cart, /account/orders, a Builder page = `/demo-landing`) plus 6 anonymous P pages for C-16. The checklist's widened page set P (checkout steps, account pages, order details, 404, empty cart, quotes, overlays) was **not run**; see "Not covered".

## Axes

| Axis | Verdict | Basis |
|---|---|---|
| Classic regression (AC-1), C-2 | **PASS** on the 6 pages | 24 pairs (6 pages x light/dark x 1280/375): 31,056 element pairs, 0 differences in type, shape, colour; 1 hover-state shadow (pointer artefact); 240 root vars identical. Same result as round 1 (34,421 samples) |
| Negative control, C-2n | **PASS** | Same harness soft vs BASE reports font-family on ~1400 elements, radius 8→16 / 6→14 on ~72, 7 footer titles; 0 elsewhere. The 0 of C-2 is real |
| Colour (AC-4), C-22 runtime | **PASS** | 0 of 238 `--color-*` differ soft vs BASE, light and dark (230 differ light→dark inside one build: the check is mode-sensitive) |
| BL-UI-004 / 005 (soft vs classic), C-16 | **PASS** | No soft-only document scroll, no soft-only row drift; control heights equal at 5 viewports; soft-only clipped nodes are ellipsis or line-clamp, none silent |
| Headings, C-17 | **PASS with residual** | Soft h1–h6 Geologica, only family differs; h4–h6 exist only in Storybook (VcMarkdownRender) and their classic-vs-BASE parity is left to C-21 PIXEL |
| Storybook toggle, C-20 | **PASS** | Classic→Soft→Classic, Canvas and Docs: Lato/8px/0 links → Inter/16px/1 link → back, link removed |
| Inputs, C-27 | **PASS** (Chromium) | Every input/select height identical soft vs BASE; row-mates unchanged |
| a11y (axe), C-29 | **PASS** | 0 soft-only violations (home + /cart, light + dark). Pre-existing violations on both builds are listed below |
| design_system | **PASS WITH NOTES** | Classic exact. Soft changes 3 tokens only (`--vc-radius`, base and heading family); the scale and role tokens stay unset, so AC-2 is not met. That is the 4a rows' FAIL (C-4..C-10), not re-graded here |
| vs. DESIGN | **SKIPPED** | VCST-6232 links no Claude Design prototype; nothing guessed |

## Findings (none caused by this PR; nothing filed)

| # | Sev (proposed) | Where | Finding | Evidence |
|---|---|---|---|---|
| F1 | High (P1; A11y Critical = P0 candidate) | /cart, both builds | axe `button-name` critical: `.vc-address-selection__button` has no accessible name (WCAG 4.1.2 / 2.4.4) | `axe-BASE-cart-light.json`, `axe-SOFT-cart-dark.json` |
| F2 | High (P1) | /cart | axe `aria-allowed-attr` critical x2 on vc-select triggers `#select-*-trigger`; `image-alt` critical x2 (shipping method placeholder image, CyberSource method icon) | same |
| F3 | Medium | /cart | axe `link-in-text-block` serious x2 (agreement, policy links indistinguishable from text) | same |
| F4 | Medium | home (Builder text) | axe `color-contrast` serious: 1 node light, 3 dark (`.mb-6`, `h2`, `.builder-text`); VC-UI-001: red preset | `axe-BASE-home-*.json` |
| F5 | Medium | home at 1024x768 | BL-UI-004: document scrolls horizontally (scrollWidth 1105 > 1024) on classic-BASE and soft alike; cause not isolated (Builder content?) | `BASE-L-1024-home.json` |
| F6 | Low | header search at >=1024 | BL-UI-005: buttons in the search decorator are 32 and 38 px high in one row, identical on BASE | `BASE-L-1280-home.json` |
| F7 | Low | /cart line item at 1280 | "Customize" button label ellipsised ("Custo…") on classic (Lato 66 > 59 px) and worse on soft (73 > 59) | `screenshots/4v-C-16-soft-cart-customize-label-ellipsis-1280.png` |

STR for F1–F4: sign in as `ORG_USER_EMAIL`, open /cart (home for F4), inject axe 4.10.2, run wcag2a/2aa/21a/21aa/22a/22aa. STR F5: classic-BASE, 1024x768, signed in, open `/`. Per `triage.md` §7a these file separately at their real severity and never block this ticket.

## Not covered (owed, named)
- Page set P beyond the briefed pages: checkout shipping/billing/payment/review, order details, dashboard, addresses, profile, lists, saved-for-later, company members, quotes, `/404`, empty cart, empty search, overlays (filters drawer, address picker, quick view). C-2 classic parity and C-16 soft layout were run on none of them. C-16 anonymous P pages that were run: sign-in (password form), forgot-password, sign-up, /compare, /search, /printers.
- Firefox, Coffee preset (C-3), print (C-19 is another lane), K10 payment iframe (CSP on localhost), K12 fork build.
- Classic h4–h6 vs BASE (no BASE Storybook up): C-21 PIXEL owns it.

## Incidental (process / stand)
- A foreign write replaced `test-results/edge/v6232r2/BASE-home-light-1280.json` at 10:45:26 (another agent shares that folder); the lane moved to `v6232-4v/` and re-captured it. The shared folder is not safe for raw data.
- The local builds show a red notification alert after load (image-host failures) that intercepts header clicks for ~10 s; vcst shows the version-mismatch banner. Environment, not PR.
- `localStorage` theme was never touched (colour scheme emulated). No data written; cart not modified by this lane.

**Left behind:** nothing on the stands. Signed out of vcst, :3001 and :3000 through the account menu; browser closed. Local files only: `test-results/edge/v6232-4v/` and `v6232r2/` (raw JSON, gitignored) and one screenshot in `screenshots/`.
