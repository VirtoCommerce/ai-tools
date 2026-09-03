# VCST-5733 — Visual axis: attempts 1–2 BLOCKED (below), attempt 3 EXECUTED (§Executed run)

**Ticket:** VCST-5733 "[E2E] All Customer Orders" · `/qa-test` Step 4 lane 1b · **Env:** vcst-qa · `https://vcst-qa-storefront.govirto.com` · store `B2B-store` · theme `2.57.0-pr-2444-5946-59465f5e` (live, page footer)
## Attempts 1–2: BLOCKED (record retained — this half was never a PASS)

**Attempt 1, Chrome DevTools MCP — blocked on auth tooling.** That server has **no `--secrets`** flag
(it is a `@playwright/mcp` flag), so the literal `TEST_USER_PASSWORD` was submitted verbatim and the
route redirected to `/sign-in?returnUrl=…`. Two alternative credential routes — printing the value,
and an OS-clipboard paste — were **correctly denied by the permission classifier**, and no workaround
was attempted. `SR_REP_PASSWORD` is unset here, so `TEST_USER_PASSWORD` is the operative variable.

**Attempt 2, `playwright-edge` — authenticated, then killed mid-measurement by a spend-limit 429.**
Its one unconfirmed pagination fragment was carried as a hypothesis, not a fact; attempt 3
re-measured it (row 6) and it held. Axes 1–2 were completed in attempt 3; axis 3 stays **SKIPPED**
(`DesignSync` absent ⇒ `unresolved` is **unknown, not zero**).

**Unblocked** by re-briefing onto `playwright-edge` (which does carry `--secrets`), signing in through
the real UI by typing the variable NAME. `critical-ui-scope.md` was used as a scope selector only (its
matrix is 197/197 `GAP`, so not fact). No tracker ticket filed, nothing transitioned.

---

## Addendum — spec-side finding produced by the orchestrator (no browser required)

`DesignSync` is not in a subagent's toolset, so the orchestrator read the spec itself and ran the one
check needing no live page: **does the declared chip palette meet WCAG 2.2 AA?** Source:
`tokens/chip-badge.theme.json` in design project `5aca50fb-…` ("✴️ VC New Front Design 2026"), read
live 2026-09-02; ratios computed from the declared hex pairs.

| Token | Foreground / background | Ratio | AA 4.5:1 | AA-large 3:1 |
|---|---|---|---|---|
| `chip_solid_primary` | `#ffffff` on `#f99e24` | **2.11:1** | **FAIL** | **FAIL** |
| `chip_solid_secondary` | `#ffffff` on `#688198` | **4.05:1** | **FAIL** | pass |
| `chip_solid_success` | `#ffffff` on `#3e845b` | 4.51:1 | pass (margin 0.01) | pass |
| `chip_solid_info` | `#ffffff` on `#2b7ea8` | 4.51:1 | pass (margin 0.01) | pass |

The other 18 declared pairs pass (`soft`/`tonal` 6.1–15.1:1). **Verdict: `AMBIGUOUS`, escalated — not
resolved by obeying the spec.** Precedence is
`BL-A11Y / BL-UI invariant > design spec > UX heuristic`, so a spec contradicting a WCAG criterion is
escalated, not implemented. `chip_solid_primary` fails even the 3:1 large-text/non-text threshold, so
chip size cannot rescue it.

**Scope and limits:** a property of the **spec**, not the implementation, and **design-system-wide** —
provenance OUT-OF-SCOPE for VCST-5733, contributing no FAIL to 5c. The two 4.51:1 pairs are not
findings, but a 0.01 margin breaks AA silently on any future tweak. Ratios derive from the spec's own
declared values, never transcribed (`.claude/rules/test-data.md` §GOLDEN RULE). **Attempt 3 resolved
the UNVERIFIED half: the live
chips reach no `chip_solid_*` variant at all** (see below), so these two pairs stay design-system-wide.

---

## Executed run (attempt 3) — `playwright-edge`, 2026-09-02

Signed in as `agent-test-sr-primary@example.com` via the real UI (substitution confirmed:
`process.env['TEST_USER_PASSWORD']`). **Preset: RED** (`--color-primary-500: #e52121`) — a WCAG-gated
preset. axe-core 4.12.1, no CSP block. Viewports 375/768/1920; light + dark; drawer
closed/open/applied/zero-match. **Axis 1 COMPLETE · Axis 2 COMPLETE · Axis 3 SKIPPED** (`DesignSync`
absent from a subagent's toolset; yours).

### Invariant failures (blocking) — provenance triangulated against pre-existing control surfaces

"Shared component" was **not** accepted as evidence; each row was re-measured on a pre-existing page using the same component. Severity is mine (5a grades once; 5d only applies the floor).

| # | Finding | Measured | SC | Provenance (control) | Sev |
|---|---|---|---|---|---|
| 1 | Focus ring on **every `vc-input`** — `#e52121` @0.3α → `#f7bcbc` on white. Ring exists (2.4.7 OK) but is invisible | **1.63:1** /3 | 1.4.11 | **PRE-EXISTING** — identical 1.63:1 on `/account/orders` search input. Token is the defect; blast radius = every input in the storefront | High |
| 2 | `aria-haspopup="dialog"` → target has `role=null`, no `aria-modal`, no name; **2× Esc does not close**; focus not restored | determinate | 4.1.2 | **IN-SCOPE** — the drawer's OWN two calendars set `role="dialog"`+`aria-label="Calendar"`, and `vc-popover` sets `tooltip`/`menu` correctly elsewhere. The panel is the lone outlier | High |
| 3 | `Filters` label in **hover** state `#e52121` on `#fad3d3` (rest 4.59:1 PASS) | **3.34:1** /4.5 | 1.4.3 | **PRE-EXISTING** — same 3.34:1 on the `/account/orders` Filters button, byte-identical classes | Med |
| 4 | Breadcrumb links 17px tall, size **and** spacing short, **@375 only** | 17px | 2.5.8 | **PRE-EXISTING** — the deep PDP crumb (11 items, wrapped) reproduces it; the 3-link catalog crumb does not. Depth/wrap-triggered in the shared component | Med |
| 5 | Slash has **no `aria-hidden`** → "/" is announced *and* under-contrast | 2.52 light / 3.88 dark | 1.3.1+1.4.3 | **IN-SCOPE** — catalog **and** PDP both set `aria-hidden="true"`. The contrast is pre-existing but harmless where hidden; omitting it here is what *exposes* it | Med |
| 6 | Pagination active page `#0a0a0a` on `#d34247`, **dark only** (light 4.59:1 PASS) | **4.37:1** /4.5 | 1.4.3 | **NOT SETTLED** — no pre-existing route in this env renders an active `vc-pagination` (catalog uses show-more; orders/members too short) and the CSSOM scan found no matching rule. Probably PRE-EXISTING: both colours are global theme tokens (`#d34247` *is* dark `--color-primary-500`), no page-local literal | Med |
| 7 | Order page heading outline is **H1 only**, plus 6 `aria-labelledby` slots on no-role divs | — | 1.3.1 | **PRE-EXISTING** — buyer `/account/orders/:id` shows the identical H1-only outline and the identical 6 slots; inherited by template duplication | Med |
| 8 | 4 checkboxes 20px vs the 44px house rule. **WCAG 2.5.8 AA PASSES** via 38px centre spacing — mobile ergonomics, **not** a WCAG failure | 20px | BL-UI-006 | **PRE-EXISTING** — catalog facet checkboxes are also 20px (shared `vc-checkbox`) | Low |
| 9 | `.vc-chip__content` padding off the 39-value grid | 7.008px | BL-UI-002 | **PRE-EXISTING** — same 7.008px on `/account/orders` chips | Low |

**#5 is also a genuine `vs. DESIGN` DRIFT** — the spec declares `aria-hidden="true"` on the slash, the
shared component honours it on two pre-existing pages, and these routes do not: the one place an
invariant failure and a spec drift coincide, both pointing the same way.

**One IN-SCOPE regression found by the triangulation itself:** the new orders table has **no
`<caption>`**, while pre-existing `/account/orders` (`Orders`) and `/company/members` (`Company
members`) both have one. Kept **advisory / Low** rather than inflated — headers carry `scope="col"`
and no SC is strictly breached — but it is a regression against two controls, so it is recorded.

### Advisory (never fails the ticket) — full text in `summary.json.visual.advisory`

Warning-chip border 2.09:1 (**not** escalated: label 6.49:1 + icon 4.53:1 both pass and carry the
meaning, so the stroke is a third redundant encoding) · `Sales Rep hub` crumb is the spec-sanctioned
`<span class="vc-breadcrumbs__link">`, link-blue but `cursor:auto`/`tabIndex -1` · missing table
`<caption>` (IN-SCOPE, above) + `aria-sort="none"` on non-sortable columns · hover-only chip tooltip
(AT unaffected) · 6 no-role `aria-labelledby` slots (PRE-EXISTING) · calendar `th` without `scope` +
`tr display:grid` · filter state absent from the URL · 20×20 header theme toggle (out of scope).

### Clean, measured (not assumptions)

Chips resolve to **outline/tonal only — no `chip_solid_*`**, so the spec's 2.11:1/4.05:1 pairs are
**not reached here** (12.11 · 9.06 · 7.85 · 6.49 · 9.21). **The customer-name crumb IS a real
`<a href>`** (240.3×17, tabIndex 0) — AC-5 holds. Every colour traced to a token, **no literals**. No
horizontal overflow at any viewport; Apply/Reset below the 375px fold but **page-scroll reachable,
zero clipping ancestors**. All commit-path controls keyboard-reachable (4/4 checkboxes, 3/3 date
fields, real `<label>`s). Injected markup neither executed nor reflected; zero-match renders
correctly. 768px and both order pages: 0 violations.

### Not covered — stated, never implied as clean

**Lighthouse was NOT RUN — a traded instrument, not an oversight.** `lighthouse_audit` is a Chrome
DevTools MCP tool, and authenticating at all required `--secrets`, which only `playwright-edge`
carries: **Lighthouse was traded for the ability to reach the surface.** Axis 1 is COMPLETE on
axe-core + manual measurement, with that one instrument missing — recorded so a COMPLETE axis never
hides an unstated gap. Also not covered: screen-reader output, 5 of the 6 WCAG 2.2 additions
(2.4.11 · 2.5.7 · 3.2.6 · 3.3.7 · 3.3.8), 200%/400% zoom, `prefers-reduced-motion`,
long-customer-name state, V5's de-DE half. `BL-UI-001..005` out of scope (owner: suite `048c`).

**Evidence trail:** `visual-axis-BLOCKED-auth-gate-1920.png` was removed from this shared tree by another process mid-run; the **citation was amended, not the file restored** (read-only git).

**Token drift, both values** — measured on the `Payment required` chip's 1px border: live
`--color-warning-500` **`#fc9e00`** (2.09:1 vs white) vs spec `chip_solid_primary` **`#f99e24`**
(2.11:1). Live is **not** the worse of the two, but the comparison is not like-for-like: live uses it
as a *stroke* (1.4.11, 3:1, label+icon still pass), the spec as a *fill behind white text* (1.4.3,
4.5:1). Yours to adjudicate.
