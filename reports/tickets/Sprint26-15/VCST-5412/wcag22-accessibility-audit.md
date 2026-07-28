# VCST-5412 — WCAG 2.2 AA Accessibility Audit

**Scope:** Marketplace Vendor Portal `https://vcmp-dev.govirto.com/apps/vendor-portal/` (framework 2.3.0) + the 13 changed components in hosted Storybook.
**Gate:** WCAG **2.2** Level AA. **Method:** canonical `scripts/lib/axe-runner.ts` (`axeRunSnippet` / `classifyAxeResults` / `ACTIVE_ELEMENT_SNIPPET` / `classifyKeyboardTrail`), axe-core **4.12.1**, tags `wcag2a wcag2aa wcag21a wcag21aa wcag22a wcag22aa`, `best-practice` excluded. Lighthouse via Chrome DevTools MCP.
**Theme:** the project's "Coffee-theme-only" a11y rule is a **storefront** rule and does not map here — the Vendor Portal ships Light / Dark / Green. Audited on **Light** (default); Dark spot-checked.
**Executed by the orchestrator directly** — the `ui-ux-expert` agent terminated on an internal API error earlier in this session, so per the repo's delegation rule the work was not re-delegated.

## Verdict: **FAIL against WCAG 2.2 AA**

Two AA criteria fail that the ticket's own scope could not have caught, because **PR #255 targeted WCAG 2.1** (*"Eliminate WCAG 2.1 A/AA violations"*) while the 2026 baseline is 2.2:

- **2.5.8 Target Size (Minimum)** — a 2.2 addition — fails on both surfaces, one root cause.
- **2.5.7 Dragging Movements** — a 2.2 addition — fails on the dashboard.

**Correction to my earlier report in this ticket:** the Storybook sweep I ran earlier used tags `wcag2a wcag2aa wcag21a wcag21aa` and reported *0 critical/serious/moderate/minor*. That is accurate **for WCAG 2.1**, but it is **not clean under 2.2** — re-running with `wcag22a`/`wcag22aa` only surfaces **3 serious `target-size` violations** across 3 components. The earlier "A11Y-01 PASS" should be read as "PASS at 2.1, FAIL at 2.2".

## The six WCAG 2.2 additions — the point of this audit

| SC | Criterion | Verdict | Basis |
|---|---|---|---|
| **2.4.11** | Focus Not Obscured (Minimum) | **PASS** | 70 tab stops across login + dashboard; `elementFromPoint` at each focused element's centre — **0** covered by any `position: fixed/sticky` element |
| **2.5.7** | Dragging Movements | **FAIL** | dashboard widget reorder **and** resize are drag-only — see below |
| **2.5.8** | Target Size (Minimum) | **FAIL** | one root cause, both surfaces — see below |
| **3.2.6** | Consistent Help | **N/A** | **no help mechanism exists anywhere** — zero help/support/contact/FAQ/docs affordances on login or dashboard. 3.2.6 constrains the *placement consistency* of a help mechanism that exists; it does not require providing one. Not a failure — but see EAA below |
| **3.3.7** | Redundant Entry | **NOT ASSESSED** | requires a genuine multi-step process; the portal uses single-blade forms, not wizards. Reported honestly as unassessed rather than passed |
| **3.3.8** | Accessible Authentication (Minimum) | **PASS** (with a gap) | no CAPTCHA, no cognitive-function test (`captchaEls=0`, no puzzle/arithmetic text); password field is **not** `readonly` and has **no `onpaste` handler**, so paste + password managers work — that is the qualifying mechanism. **Gap:** `autocomplete` is `null` on *both* username and password fields, which degrades password-manager autofill (a 3.3.8 supporting technique). Independently corroborates the agent's D5. Recommend `autocomplete="username"` / `"current-password"` |

### 2.5.8 Target Size — one shared root cause, wide blast radius

`VcInput`'s adornment buttons are ~**12–14 px wide**, roughly half the 24 px minimum, and every consumer inherits it:

| Location | Element | Measured |
|---|---|---|
| Storybook `VcInputDropdown` | `.vc-input__clear` | **12×34** |
| Storybook `VcDataTable` | `.vc-input__clear` | **12×30** |
| App item blade (agent-measured) ×2 | `.vc-input__clear` | **12×34** |
| App login | `.vc-input__showhide` | **14×34** |
| Storybook `VcColorInput` | `.vc-color-input__color-square` | **20×20** |
| App sidebar header | `.sidebar-header__notification-bell`, `.sidebar-header__menu-button` | **18×21** each |
| App blade header | Restore / Close | **18×21** (not axe-flagged — sufficient spacing exemption) |
| App login | "Forgot password?" | **354×18** (height fails) |

Fixing `.vc-input__clear` / `.vc-input__showhide` in the shared input component resolves the majority across every component *and* every app blade — **one fix, not eleven**. Filed: `reports/bugs/open/BUG-vc-shell-target-size-below-wcag22-minimum.md`.

### 2.5.7 Dragging Movements — dashboard layout is drag-only

The gridstack dashboard exposes **10** draggable elements and **5** resize handles. Every `grid-stack-item` has `tabIndex = -1`, no `aria-grabbed`, and the `ui-resizable-handle` elements contain **no buttons and are not tabbable**. The buttons inside widgets (2–5 each) are the widget's own actions ("All offers →"), not layout controls. So there is **no single-pointer or keyboard alternative** to dragging for reordering or resizing widgets — a direct 2.5.7 failure.

This also explains, and upgrades, the behaviour agent's BS-13 note ("harness cannot drive gridstack"): the operation isn't merely un-automatable, it is **keyboard-inaccessible**. Filed: `reports/bugs/open/BUG-vc-shell-dashboard-drag-only-no-keyboard-alternative.md`.

## Carried-over failures (pre-2.2, already reported in this ticket)

Grouped by pattern, not instance:

| SC | Rule | Impact | Instances | Status |
|---|---|---|---|---|
| 3.1.1 | `html-has-lang` — `<html lang="">` | serious | all page states | already filed |
| 1.4.4 | `meta-viewport` — `user-scalable=no` | moderate | all page states | **new here**: zoom disabled on mobile |
| 1.4.3 | `color-contrast` | serious | 3 (login) / 3 + 5 incomplete (dashboard) / 53 stories | **informational** per the ticket's documented A11Y-02 exception |
| 2.1.1 / 4.1.2 | side-nav items unfocusable | — | 14 items | already filed |
| 4.1.2 | `button-name` — breadcrumb back button | critical | every item blade | already filed |

## Layer B — Lighthouse (trend signal only)

Login page, desktop: **Accessibility 78/100** (38 passed, 6 failed). Failing audits: `color-contrast` (3), `html-has-lang` (1), `meta-viewport` (1), `target-size` (1) — **identical to axe, no additional signal**, as expected from an axe subset. Note **48 not-applicable + 10 manual-only** audits, which is precisely why the manual pass above is the load-bearing part.

## Layer C — keyboard trail

| Page | Stops | Result |
|---|---|---|
| Login | 25 | **PASS** — clean order, no traps, no off-screen focus (7 distinct elements) |
| Dashboard | 45 | **WARN** — 4 upward focus jumps >100 px; plausible in a multi-column dashboard, but confirm DOM order matches visual order |

## EAA / EN 301 549

**No accessibility statement exists** — zero links matching `accessib*` in text or `href`, and the login `<footer>` is empty. The skill treats this as **P1**.

**Scope caveat, stated honestly:** this is a **login-gated B2B back-office**, not a public consumer storefront, and the EAA's e-commerce obligations centre on consumer-facing services. If the portal is offered as a service to EU-based vendors it is in scope and a published statement (conformance status + known barriers) is expected; if it is purely an internal operator tool, it is not. **Routing question for the product owner**, not an automatic defect.

## Requires manual verification (automation cannot decide)

- **Alt-text quality** — `VcImage` renders CSS `background-image`, no `<img>`, so no alt is possible; whether that is acceptable depends on whether it ever carries meaningful imagery (product thumbnails in a vendor portal suggest it does). Design decision, WCAG 1.1.1.
- **Focus-indicator quality** — a 2 px outline was measured as present; whether contrast against every background meets 3:1 was not computed per-state.
- **Screen-reader narrative coherence** — no NVDA/VoiceOver available. All state claims here come from programmatic ARIA/accessible-name inspection: **an a11y-tree substitute, not a screen-reader transcript.** No AT announcement is claimed anywhere.
- **3.3.7 Redundant Entry** — needs a real multi-step flow to judge.
- **Form-error helpfulness** (3.3.3) — errors are correctly `role="alert"` + `aria-invalid`, but wording quality is unjudged. Related known gap: Save on an untouched empty required form is a silent no-op.
- **aria-live timing** — toasts use `role="alert"`; whether announcements land before auto-dismiss is untested without AT.
- **Dark/Green themes** — contrast not audited per-theme.

## Artifacts

`results/vcst-5412/wcag22-audit.mts`, `wcag22-storybook-delta.mts` (+ `wcag22-app.txt`, `wcag22-storybook-delta.json`, `wcag22-dashboard.png`) — gitignored.
