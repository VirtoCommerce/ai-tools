
---

# Visual axis — run 2026-09-04 (round 1), build `a247b3ab`

Lane: **`playwright-edge`**, not the usual Chrome DevTools lane. The first dispatch went to Chrome
DevTools and returned `SKIPPED — lane not authenticated`: the persistent profile
`~/.chrome-devtools-mcp/vc-qa-profile` holds no session at all, so `/company/customer-orders` bounced to
`/sign-in`. That agent correctly declined to work around the credential. Re-dispatched to a Playwright
lane, which carries `--secrets`. **One-time fix worth doing:** sign that DevTools profile in by hand once
and every later design/a11y run is authenticated with the credential never reaching an agent.

Scope: the new **active-filter chip row** and the re-rendered **filter drawer option rows** added by
`vc-frontend` PR #2444 commit `a247b3ab`. Axes run: WCAG 2.2 AA / `BL-A11Y-*`, and design-system
consistency. `vs. DESIGN` is **SKIPPED** — VCST-5733 carries no Claude Design Prototype link (checked:
description, all 6 comments, all 4 attachments) and `DESIGN_SYSTEM_PROJECT_ID` was removed 2026-09-03, so
there is no default to fall back to. **A skip is never a pass.**

## The headline: axe found nothing, and two real defects are present

axe-core 4.10.2, tags 2.0/2.1/2.2 A+AA: **0 violations** on the chip-populated state in light, in dark,
and on the org-scoped route (no CSP block; 1 out-of-scope `incomplete` on `.vc-pagination__page--active`).
Both genuine defects below are invisible to automated scanning — which is the entire argument for keeping
the by-hand checks in the brief rather than treating an axe pass as the axis.

## FAIL — accessibility. Filed standalone, does NOT fail the story

`triage.md` §7a: on a feature story an accessibility finding takes its own ticket at its real severity and
never blocks. Named here so this round's verdict is never read as *"no accessibility problems here"*.

| Finding | Sev | Measured | Provenance |
|---|---|---|---|
| **All six chip close buttons share one accessible name** — the literal `"Close chip"`. Confirmed three independent ways: the rendered attribute, the Chromium AX tree, and `axe.commons.text.accessibleTextVirtual`. `closeButtonAriaLabel` is unset here and at **every** call site in `client-app`. WCAG 2.4.6 / 4.1.2 | **Medium** | 6 of 6 identical | **NEW in `a247b3ab`** — the collision exists only because the chip row does |
| **Focus is destroyed when a chip is removed** — `document.activeElement === document.body` afterwards, so a keyboard user is dumped to the top of the tab order mid-task. Reproduces on **both** routes. WCAG 2.4.3 | **Medium** | `body` | **NEW in `a247b3ab`** |

## PASS — measured, not assumed

| Check | Measured |
|---|---|
| Tab order / operability | 7 stops in visual order (6 closes, then Reset); the chip label is correctly not focusable; Reset is a native `<button type="button">` — **Space verified live**, Enter native |
| Contrast, light | chip text 4.83:1 · chip border 4.83:1 · close icon 19.8:1 · badge text 9.01:1 · badge border 4.59:1 · Reset 14.68:1 |
| Contrast, dark | chip text 5.13:1 · border 4.1:1 · close icon 18.1:1 · Reset 9.51:1 — zero fails |
| Target size 2.5.8 AA | chip closes **28×28**; drawer checkboxes 20px high but pass via the **spacing exception** at 38px centre-to-centre |
| Spacing grid | `column-gap: 12px`, `row-gap: 8px` — both on `SPACING_GRID_PX`; zero off-grid values on the row or the chips |
| Geometry vs tokens | chip `min-height: 28px`, `radius: 8px`; badge `h=18`, `min-width: 18px`, `radius: 9999px`, `font-size: 12px` — all on the token set |
| Alignment `BL-UI-005` | vertical-centre drift **0.0px**, height drift **0.0px** across all 7 chips |
| Overflow `BL-UI-004` | no horizontal overflow at 1920 **or** 375 (`scrollWidth` 360 < 375); the row wraps to 4 lines; longest chip 279.7px inside a 312px row; nothing clipped |
| Count badge survives label truncation | `min-w-0` + `truncate` works as intended — the badge stays fully visible in every case |
| Checkbox accessible name retains the count | Chromium AX: `"New 56"`, `"AGENT-TEST-Org-TechFlow-20260310 60"` — the count did **not** fall out when it moved into a sibling `VcBadge` |

## Low / advisory — recorded, below the 5d filing floor

| Finding | Note |
|---|---|
| **A tooltip that exists but never shows.** The clipped option label has no `title`, no `aria-label`, no `aria-describedby`. A `vc-tooltip` wrapper **is** in the markup but renders no content on hover — and the checkbox `<input>` overlays the row and intercepts pointer events, so the label cannot be hovered at all. Recoverable only via the accessible name | Low. NEW in `a247b3ab` |
| **Accessible name has no separator node.** axe accname computes `"New56"` / `"…2026031060"`; Chromium's AX tree inserts a space and reports `"New 56"`. The accname spec does not guarantee the space, so non-Chromium AT may announce the run-on form. **Firefox/WebKit unverified, and screen-reader output is manual-only** — so this stays Low and explicitly unconfirmed | Low. NEW in `a247b3ab` |
| `BL-UI-006` mobile ≥44×44 guidance: closes are 28×28 and the minimum close-to-close edge gap is **exactly 8.0px** (meets the 8px floor). AA-binding 2.5.8 passes at 28px, and 28px is the UI-kit `vc-chip` md value, not a choice this PR made | Low — graded down deliberately rather than inflated into a blocker |
| Off-grid component internals: `.vc-chip__content` `padding-left: 7.008px`; `vc-badge` `padding: 0 3.008px` | Advisory. **PRE-EXISTING** — the same `7.008px` was recorded as VIS-09 on 2026-09-02 |
| Focus-indicator contrast **1.70:1** — `outline: 2px solid color(srgb .4196 .4471 .5020 / 0.4)` composites to `rgb(196,199,204)` on white. Note a naive alpha-ignoring read reports 4.83:1 and would call this a pass | **PRE-EXISTING, storefront-wide** (VIS-01). Warrants its own escalation, not a finding against this ticket |
| `vc-popover` declares `aria-haspopup="dialog"` on the trigger while the panel has no `role`, no `aria-modal` and no `aria-label` — on **7 triggers** on this page | **PRE-EXISTING**; this is the class already filed as **VCST-5869**. Linked, not re-filed |

## AMBIGUOUS — escalated, not resolved

`VcBadge variant="outline" size="sm"` inside a checkbox row renders `border: #e52121`. That looks like a
danger-palette misuse and **is not**: `--color-primary-500` *is* `#e52121` under this store's Red preset,
so it is brand primary. Whether brand-primary is the right treatment for a neutral facet count is a
**design-owner decision**, not a QA verdict. Per `visual-axis.md` an `AMBIGUOUS` is escalated and never
resolved by guessing — raised as a question, filed as nothing.

## NOT MEASURED — stated, because an omitted axis reads like a clean one

- **`BL-UI-001` CLS** — no `PerformanceObserver('layout-shift')` on this pass. **Not a pass.**
- **Screen-reader output** — manual-only per the contract; may never be reported as PASS.
- **Non-Chromium accname behaviour** for the separator finding above.

## One cross-lane discrepancy, recorded rather than reconciled away

The discovery lane (`3x`, chrome) reported **3 of 4** org labels clipped at 375px; this lane measured
**1 of 4**, clipping by 3px (`clientWidth` 237 vs `scrollWidth` 240). Different methods — rendered
ellipsis versus a `clientWidth`/`scrollWidth` comparison — and possibly different drawer widths between
the two routes. **Both lanes agree on everything load-bearing:** the count badge stays visible, no two
org prefixes collide, and the full value is not recoverable by pointer. The extent of clipping is
genuinely uncertain, and the finding is Low either way, so it is reported as uncertain rather than
resolved in favour of whichever lane is quoted.
