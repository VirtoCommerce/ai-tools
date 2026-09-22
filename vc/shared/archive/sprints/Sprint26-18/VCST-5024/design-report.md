# VCST-5024 — Visual Lane (4v) Report — RECOVERY PASS

**Browser:** `playwright-chrome` (deliberate lane deviation — Chrome DevTools MCP has no `--secrets`). Auth via
`--secrets` bare key names: `DEFAULT_TEST_PASSWORD` (buyer), `ADMIN_PASSWORD_LOCALHOST` (Admin — **no bare
`ADMIN_PASSWORD` key exists** in `.env.playwright.local`). **The first attempt (4v) returned SKIPPED on every
axis** — both Chrome DevTools MCP profiles were signed out (4th recurrence); unchanged, this pass routed around it.
Env: storefront `http://localhost` · Admin `http://localhost:8090` (Platform `3.1071.0-pr-3108-016f`, storefront
`2.58.0-pr-2475-d710`), store `B2B-store`, `LoyaltyBalanceCalculationMode = Organization`. Balances re-read live:
outlet org **127040**, no-org contact **33872**.
## Per-axis verdicts

| Axis | Verdict | Basis |
|---|---|---|
| `vs. DESIGN` | **SKIPPED** | no design/Prototype link on the ticket; no global default (`DESIGN_SYSTEM_PROJECT_ID` removed 2026-09-03). True regardless of auth. Never a PASS |
| Accessibility (WCAG 2.2 AA) | **PASS** + 2 candidates | axe 0 violations on both storefront routes; all `incomplete` resolved manually to PASS |
| Design system | **PASS** + 3 candidates | measured token/geometry parity, new org widget vs established contact widget |
| BL-UI-001..006 | **PASS** | table below |
## HEADLINE — three-state comparison of the new `organization-loyalty-widget`

It **does** render — registered on `organizationDetail2`, so it sits in the *second* widget group at the blade
bottom. That is why earlier passes reported it missing.

| # | State | Org | Renders | Balance API |
|---|---|---|---|---|
| 1 | Real non-zero | `…Org-LoyaltyOutlet` `01a0a9fa-8015-…e10` | **`127040`** | `…/balance/organization/{id}` → **200** |
| 2 | Genuine zero | `…Org-Empty-Org-20260310` `920515d4-9acf-…` | **`0`** | `…/balance/organization/{id}` → **200** |
| 3a | No entity id (new unsaved org) | "New company" blade | **widget absent** — guarded by `isVisible: !e.isNew` | no request |
| 3b | Failed load (bogus id `…0000deadbeef`) | — | **whole workspace blank** — no blade, no error | member GET fails first |

`4v2-01-org-state1-real-127040.png` · `4v2-02-org-state2-genuine-zero.png` · `4v2-03-org-state3-new-unsaved-no-entity-id.png` · `4v2-04-org-state3-failed-load-bogus-id.png`

**Answer: state 3 is NOT reachable through the UI on this build** — both no-data paths are guarded (widget hidden
on an unsaved entity; blade dead before mount on a bad id), so there is **no live repro of "a failure presented as
data"**. Narrower than the brief anticipated; reported as such, not as a pass. **The code path is still live**
(served `modules/$(VirtoCommerce.Loyalty)/dist/app.js`):

```js
$scope.balance = 0;
criteria.organizationId && svc.getOrganizationBalance({organizationId: criteria.organizationId},
  function (d) { $scope.balance = d.balance; });     // success-only — no error callback
```

Template is a bare `{{balance}}`, no loading and no error branch. Any *balance-request* failure while the member
loads normally (401/403/500/timeout — operator without the loyalty permission, expired token) renders a literal
`0`, indistinguishable from state 2. **C1 (Medium)** — code-evidenced, not live-reproduced; needs a
permission-restricted admin. **Not a new-in-PR regression:** the pre-existing contact widget
(`customerLoyaltyWidgetController`) is structurally identical — the new widget copied the existing pattern.
## The silent zero that IS live-reproducible (contact blade, `customerDetail1`)

| Contact | Widget shows | API |
|---|---|---|
| `Nina Solo` (no org) `01a0a9fa-8420-…1a` | **`33872`** | `…/balance/user/{id}` → 200 |
| `Ada Outlet` (outlet-org member) `01a0a9fa-8121-…81` | **`0`** | `…/balance/user/{id}` → 200 |

Ada's *spendable* balance is **127,040** (pooled, org mode — confirmed on the storefront the same minute). The
widget faithfully renders a personal balance that is structurally always zero on an Organization-mode store, under
the generic label "Loyalty balance". **C2 (Medium→High)** — a back-office operator reads "0 points" for a customer
who can spend 127,040. `4v2-05-contact-noorg-33872.png`, `4v2-06-contact-orgmember-silent-zero.png`.

## Design system — measured, PASS

Correcting my own first read: I eyeballed "the org widget has no colour accent". **Measurement disproved it.**

| Property | Contact widget | New org widget |
|---|---|---|
| Accent bar (`li::before`) | `4px` `oklch(0.5 0.13 291.6)` | identical |
| Tile box (`size:[2,1]`) / radius / padding | `250×120` / `0px` / `0px` | identical |
| Count / label type | `22px 500 rgb(22,29,37)` / `11px rgb(51,51,51)` | identical |

All match the platform's canonical `.gridster-cnt` widgets on the same blades. Three lower-severity candidates:
**C3 (Low)** the org template reuses the **contact** widget's i18n key `Loyalty.widgets.customer-loyalty.title` —
invisible today, but the org label can't change independently and editing the contact label changes both;
**C4 (Low/Med)** placement asymmetry — contact widget on `customerDetail1` (primary group), org widget on
`organizationDetail2` (secondary group, **last of 10**, y ≈ 1302, below the fold after Assets/White labeling);
**C5 (Low)** formatting — `/account/missions` → **127,040** vs `/account/points-history` and both Admin widgets →
**127040**: same value, two formats, one nav click apart.

## Accessibility — WCAG 2.2 AA

| Target | Violations | Incomplete | Resolution |
|---|---|---|---|
| `/account/points-history` | **0** | 2 (footer contrast) | manual: PASS |
| `/account/missions` | **0** | 14 (`.mission-card__*` on banner) | manual: **all PASS**, min **4.51:1** ("Completed" chip) |
| Admin org blade | 6 | 2 | all in platform chrome (logo `image-alt`, header `link-name`, select2 `list`/`listitem`, toolbar `button-name`/contrast) — **none in the loyalty widget** |

Manual layer PASS: real `<table>` + `<thead>`/`<tbody>`, `scope="col"` on all 4 `<th>` (header association correct);
skip links work and land in `<main>`; focus indicator `2px solid rgb(68,125,156)` on every control walked;
pagination keyboard-reachable and operable. No unexposed disabled control was counted toward contrast.
**A1 (Medium) — pagination current page is not exposed programmatically.** Current page is a `<span>` (32×32) with
**no `aria-current="page"`**; other pages are `<button>`. Container is a plain `div` — no `nav` landmark, no
accessible name — and a page change is not announced (no `aria-live`, no focus move). Verified live: clicking "2"
swapped rows and swapped which element is the span, with no programmatic current-state. WCAG 1.3.1 / 4.1.2.
**A2 (Medium, platform-wide, not new) — Admin widget tiles are not keyboard operable:** every tile, both loyalty
widgets included, is `<div class="gridster-cnt" ng-click="openBlade()">` with no `tabindex`, `role` or key handler
— mouse-only. WCAG 2.1.1 / 4.1.2. Platform-level; the new widget inherits it.

**Checked, NOT violations** (so they are not re-raised): dark-mode toggle is 20×20 but its nearest interactive
neighbour is **43.8 px** centre-to-centre → **2.5.8 spacing exception met, PASS**; sub-24 px mega-menu/footer links
are inline text links (2.5.8 inline exception). **SKIPPED, not passed:** screen-reader output — no NVDA/JAWS/VoiceOver.

## BL-UI invariants

| ID | Result | Evidence |
|---|---|---|
| BL-UI-002 spacing | **PASS** | only off-grid values are `-2px` optical nudges on `vc-icon`; grid from `SPACING_GRID` in `scripts/lib/measure-layout.ts` (39 values, `tokens:sync`-derived — not hand-listed) |
| BL-UI-004 overflow | **PASS** | at 375 px `scrollWidth` 360 ≤ 375; table swaps to cards (`4v2-09-points-history-375px.png`) |
| BL-UI-005 alignment | **PASS** | pagination centres 937.5 vs 937.0 → Δ 0.5 px ≤ 1 px |
| BL-UI-006 mobile ≥44 | **advisory** | pagination 32×32, Prev/Next 38 px tall, header icons 32×40 — below the 44 px mobile guidance, above the 2.5.8 AA gate of 24 px |
| *scope note* | — | the Admin SPA is a separate design system (AngularJS platform CSS), so the storefront-derived `SPACING_GRID` was **not** applied to the blades; the org widget was compared against the established Admin widget pattern instead |

## Known environment noise — did NOT obstruct this pass

`ws://localhost/graphql` fails 400 on every storefront load (console errors throughout), but **no red toast
rendered at any point** — probed the notification region immediately and at +4 s on `/account/points-history`:
empty both times. Nothing intercepted, no click blocked. So **the toast's own accessibility is SKIPPED, not
passed** — it never rendered, so focus trapping / name / auto-dismiss could not be observed. Not counted either way.
Incidental, out of scope, Admin "New company" blade: `401` on `…/settings/VirtoCommerce.Platform.UI.WidgetColorMarkers`
and `TypeError: Cannot set properties of undefined (setting 'status')` from the **Customer** module bundle.

**No bugs filed** — C1–C5, A1, A2 are candidates with evidence for triage at 5a.
