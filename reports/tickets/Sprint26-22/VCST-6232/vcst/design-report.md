# Design report — VCST-6232 round 2 (visual lane, `ui-kit`)

**Lane:** `vc-test:ui-ux-expert` on playwright-edge (Chromium) · **Preset:** red (coffee derived only, not run) · **Account:** `ORG_USER_EMAIL`, signed out of all three origins at the end.
**Surfaces:** classic-PR = vcst (theme 2.62.0-pr-2600-a4f2-a4f29534) · classic-BASE = local dev@4ce61d0c, :3001 · soft-PR = local a4f29534 with design soft, :3000 · Storybook-PR :6006. All local builds use the vcst backend.
**Method:** DOM-path-paired computed-style sampling (12 properties + root `--color-*`) injected once per page load and driven by real clicks; verbatim `LAYOUT_SNIPPETS.overflowAudit` + control rects for BL-UI-004/005; axe-core 4.10.2. Raw data `test-results/edge/v6232-4v/` (gitignored). Round 1 re-measured, not trusted.
**Scope:** the widened page set P of the checklist (operator-confirmed). Every P page is accounted for: 24 covered, 6 `NOT_APPLICABLE` with a reason (below), 0 `BLOCKED`.

## Axes

| Axis | Verdict | Basis |
|---|---|---|
| Classic regression (AC-1), C-2 | **PASS** | 102 pair-runs (24 P pages x light/dark x 1280/375 where the page exists at that size): 106,750 element pairs, 0 differences in type, shape, colour; 1 hover-state shadow (pointer artefact); 240 root vars identical. Round 1: 34,421 samples, same result |
| Negative control, C-2n | **PASS** | Same harness soft vs BASE reports font family on ~1400 elements, radius 8→16 / 6→14, 7 footer titles; 0 elsewhere |
| Colour (AC-4), C-22 runtime | **PASS** | 0 of 238 `--color-*` differ soft vs BASE, light and dark (230 differ light→dark inside one build) |
| BL-UI-004 / 005 (soft vs classic), C-16 | **FAIL Low** | 92 + 15 soft-vs-BASE comparisons over all P layout pages at 375/768/1024/1280/1920 and 2 overlays at 375: 0 soft-only document scroll, 0 soft-only row drift, control heights equal. One soft-induced silent clip (F8) |
| Headings, C-17 | **PASS with residual** | Soft h1–h6 Geologica, only family differs; classic h4–h6 vs BASE left to C-21 PIXEL |
| Storybook toggle, C-20 | **PASS** | Classic→Soft→Classic, Canvas and Docs, link removed on the way back |
| Inputs, C-27 | **PASS** (Chromium) | Every input/select height identical soft vs BASE |
| a11y (axe), C-29 | **PASS** | 0 soft-only violations (home + /cart, light + dark); pre-existing violations below |
| design_system | **PASS WITH NOTES** | Classic exact. Soft changes 3 tokens only; scale and role tokens unset, so AC-2 is not met (4a rows C-4..C-10) |
| vs. DESIGN | **SKIPPED** | VCST-6232 links no Claude Design prototype |

## NOT_APPLICABLE P pages
- `/checkout/shipping`, `/billing`, `/payment`, `/review`: this build has a one-page checkout on `/cart`; each route redirects to `/cart` (classic-BASE: all four; classic-PR: shipping; soft: review). Shipping address, payment and Place order are measured on `/cart`. The order was never placed, the cart's address and payment were not changed.
- `/account/addresses`: redirects to `/account/dashboard` on all three origins; no such page here.
- Add-to-cart notification / quick view: none exists (catalog stepper shows no toast, only the stepper and the header cart badge). Line removed again, cart count 1 before and after (classic-BASE only).

## Findings (nothing filed)

| # | Sev (proposed) | Caused by PR? | Where | Finding | Evidence |
|---|---|---|---|---|---|
| F8 | Low | **Yes (soft font)** | /account/profile, soft, 375 and 1024 | BL-UI-004: the disabled email input `input-149` shows "…@test-ag" (scrollWidth 369 in 306 px, overflow clip, no ellipsis, disabled so it cannot be scrolled). Lato fits on BASE | `screenshots/4v-C-16-soft-profile-input-clip-375.png` |
| F1 | High (P1; Critical = P0 candidate) | No | /cart, both builds | axe `button-name` critical: `.vc-address-selection__button` has no accessible name | `axe-BASE-cart-light.json` |
| F2 | High (P1) | No | /cart | axe `aria-allowed-attr` critical x2 (vc-select triggers); `image-alt` critical x2 | same |
| F3 | Medium | No | /cart | axe `link-in-text-block` serious x2 | same |
| F4 | Medium | No | home (Builder text) | axe `color-contrast` serious: 1 node light, 3 dark | `axe-BASE-home-*.json` |
| F5 | Medium | No | home at 1024x768; /company/members at 1024x768 | BL-UI-004: document scrolls horizontally on both builds (home 1105 > 1024; members soft 1139 / BASE 1107 > 1024, soft adds 32 px) | `BASE-L-1024-home.json`, `*-X-1024-members.json` |
| F6 | Low | No | header search at >=1024 | BL-UI-005: decorator buttons 32 and 38 px high in one row, identical on BASE | `BASE-L-1280-home.json` |
| F7 | Low | No | /cart line item at 1280 | "Customize" label ellipsised on classic (66 > 59) and worse on soft (73 > 59) | `screenshots/4v-C-16-soft-cart-customize-label-ellipsis-1280.png` |

STR F8: soft build, sign in as `ORG_USER_EMAIL`, 375x812 (or 1024), open `/account/profile`. STR F1–F4: sign in, open /cart (home for F4), inject axe 4.10.2, run wcag2a/2aa/21a/21aa/22a/22aa. STR F5: BASE or soft, 1024x768, open `/` or `/company/members` signed in. Per `triage.md` §7a F1–F4 file separately and never block this ticket.

## Not covered
Firefox, Coffee preset (C-3), print (C-19, another lane), K10 payment iframe (CSP on localhost), K12 fork build, classic h4–h6 vs BASE (C-21 PIXEL). The anonymous PDP first capture at 1280 shows a document scroll on both builds (soft 1618, BASE 1522) that does not reproduce at the other viewports or on the signed-in PDP; swiper initial layout, not graded.

## Incidental (process / stand)
- A foreign write replaced `test-results/edge/v6232r2/BASE-home-light-1280.json` at 10:45:26 (another agent shares that folder); raw data moved to `v6232-4v/`.
- The local builds show a red notification alert after load (image-host failures) that intercepts header clicks for ~10 s; vcst shows the version-mismatch banner. Environment. Order-detail rows open in a new tab that defaults to 1920 wide (re-measured at the right width).

**Left behind:** nothing on the stands. Signed out of vcst, :3001 and :3000; browser closed. The ORG_USER cart is as it started (catalog add-and-remove on classic-BASE; the address picker was closed without Save). Local only: `test-results/edge/v6232-4v/` and `v6232r2/` (raw JSON, harnesses, screenshots, gitignored) and two screenshots in `screenshots/`.
