# /qa-design — LoginOnBehalf flow (anchored at `/company/members`)

**Date:** 2026-05-14
**Target type:** Flow (4 stops)
**Target:** Operator → Impersonate → Banner → Stop-Impersonation
**Build:** vc-frontend pr-2280 (newer than VCST-4905's pr-2279 — see Build-drift note below)
**Browser:** Chrome DevTools MCP
**Auth:** `test-john.mitchell-20260310@test-agent.com` (SUPPORT_AGENT, CanImpersonate) impersonating David Kim (`ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b`)
**Viewports:** 375 / 768 / 1280
**Scope:** Design / layout / state-shift / touch targets. Functional behavior already covered by [VCST-4905](https://virtocommerce.atlassian.net/browse/VCST-4905) — this audit is complementary, not duplicative.

---

## Per-Stop Invariant Results

### Stop 1 — `/company/members` (operator view)

| Invariant | Result | Key detail |
|-----------|--------|------------|
| BL-UI-001 CLS | PASS | 0.052 (threshold 0.1) |
| BL-UI-002 spacing-grid | **FAIL** | `tbody td` padding-top = **10 px** (nearest grid 8 or 12); language/currency selector gap = **6 px**; mega-menu button padding = **6 px** |
| BL-UI-003 state-shift | PASS | Opening Actions dropdown causes no neighbour shift |
| BL-UI-004 overflow | PASS | No horizontal scroll at any viewport |
| BL-UI-005 alignment | PASS | All rows 54 px tall; Actions button center-Y drift = 0.5 px |
| BL-UI-006 touch targets | **FAIL** | Per-row Actions icon = **32 × 32 px** across all viewports; Notifications bell 28 × 28 px; mobile Search 38 × 38 px (all below WCAG 2.5.5 44 × 44 px). Invite Members (155 × 44) and Filters (88 × 44) PASS. |

**Impersonation trigger found:** the "Login on behalf" action exists in the Actions dropdown on every member row **except the operator's own row** (correctly hidden for self). The 32 × 32 px icon button IS the impersonation entry point on this page — fails 44 × 44 touch target on mobile (where impersonation by support staff is most relevant).

### Stop 2 — `/account/impersonate/{userId}` (silent + form paths)

| Invariant | Result | Key detail |
|-----------|--------|------------|
| **Silent path** | PASS (functional) | Operator already-authenticated → instant redirect to `/`, no perceivable loader (matches IMP-009 observation from VCST-4905). No CLS opportunity to measure — redirect fires < 1 frame. |
| **Form path — render** | PASS | Anonymous session (isolated context, no auth token) → page stays on `/account/impersonate/:userId`. Form renders `ImpersonateForm.vue` with all expected elements: title "SECURITY VERIFICATION", 2 description lines, Email input, Password input, Show/hide toggle, Verify and continue button (disabled when empty), Cancel button. No redirect to `/sign-in`. IMP-002 Cancel → `/` confirmed. |
| **Form path — BL-UI-001 (empty)** | PASS | CLS = 0.039 (threshold 0.1). 1 shift on initial paint — likely logo/font. |
| **Form path — BL-UI-001 (error)** | PASS | CLS from error insertion = 0.003. Shift value small despite push-layout. |
| **Form path — BL-UI-002 (form)** | PASS | Form structural spacing all on-grid: container padding 24px, field margin-bottom 16px, button padding-x 16px. |
| **Form path — BL-UI-002 (alert)** | **FAIL** | `VcAlert` danger variant has off-grid padding: top/bottom = **5.008 px** (expected 4 or 8), right = **10 px** (expected 8 or 12), left = **7.008 px** (expected 8). Cross-cutting defect — affects all `vc-alert--outline-dark--dang` instances. See F-08. |
| **Form path — BL-UI-003 (filled)** | PASS | Typing into both fields causes zero positional shift. All rects identical to empty baseline. |
| **Form path — BL-UI-003 (error)** | **FAIL** | Error block inserted above fields (push-layout, not overlay). Form grows +46 px, all content shifts down 23 px, form itself shifts up 23 px. Every failed login attempt causes a layout jump. See F-07. |
| **Form path — BL-UI-005 (buttons)** | PASS | Verify + Cancel buttons both 44 px height, drift = 0. |
| **Form path — BL-UI-005 (alert icon)** | PASS | Error icon center-Y = text center-Y = 311.5. Drift = 0. |
| **Form path — BL-UI-006 (1280)** | **FAIL** | 3 undersized targets: Email input h=36 px (−8), Password input h=36 px (−8), Show/hide toggle 38×38 px (−6). Verify + Cancel buttons PASS at 44 px. See F-09. |
| **Form path — BL-UI-006 (mobile ≤768)** | **FAIL** | Same 3 undersized elements. Additionally: password input right edge and show/hide toggle left edge are **1 px apart** (< 8 px gap threshold). |
| **IMP-003 password-not-cleared** | OBSERVE | Password field retains value after failed auth. Likely by-design (allow retry without re-typing) but should be verified against security policy. Not filed as a bug without spec confirmation. |

### Stop 3 — `/` post-impersonation home (banner mounted)

| Invariant | Result | Key detail |
|-----------|--------|------------|
| BL-UI-001 CLS | **FAIL — but pre-existing** | Homepage CLS = **0.476** (well over the 0.25 P0 threshold). Top contributor: `.features-block py-10 lg:py-24 bg-neutral-100` (0.449). **Not introduced by impersonation** — this is the homepage's baseline CLS, surfaced because silent-impersonation lands on `/`. Cross-check against existing CLS bugs before filing. |
| BL-UI-002 spacing | PASS | Banner container gap = 4 px (on-grid); header top-bar gap = 12 px (on-grid) |
| BL-UI-003 state-shift | PASS | Banner top-row rect stable: `{top:7, h:26, w:252}` across navigation |
| BL-UI-004 overflow | **FAIL (downgraded)** | At mobile (≤ 500 px) the top-header impersonation banner renders at 0 × 0 px. Originally framed as "no mobile indicator" — verified 2026-05-14: the hamburger panel DOES contain the impersonation state (operator name + "logged in as" + target name) and a `mobile-back-to-operator-button` exit. Failure is scoped to the **passive page surface** — operator has no ambient cue unless they open the hamburger. |
| BL-UI-005 alignment | PASS | Operator name / "logged in as" / target name share center-Y = 19.5 px |
| BL-UI-006 touch targets | **FAIL** | At 1280: account-menu button 89 × 26 px (height < 44). At mobile: banner hidden → impersonation controls unreachable. |

**Banner is `position: relative` — scrolls out of view.** On long pages the operator loses the impersonation indicator after any scroll past the header.

### Stop 4 — Banner persistence + Stop-Impersonation control

| Invariant | Result | Key detail |
|-----------|--------|------------|
| BL-UI-001 CLS | PASS | `/catalog` 0.028, `/account/orders` 0.021 — both under threshold |
| BL-UI-002 spacing | PASS | Banner gap = 12 px (on-grid) on all pages |
| BL-UI-003 state-shift | PASS | Banner rect identical on all 3 pages — slot-mounted, no remount flash |
| BL-UI-004 overflow | PASS at 1280 | At mobile: banner hidden (same as Stop 3) |
| BL-UI-005 alignment | PASS | Banner items center-Y = 20 on `/catalog`, `/account/orders`, drift 0 |
| BL-UI-006 touch targets | **FAIL (scoped to desktop sign-out)** | Desktop: `data-test-id="sign-out-button"` = **32 × 32 px**. Distinct `data-test-id="back-to-operator-row"` Stop-Impersonation control exists at 256 × 49 px (PASS) — VCST-4905 IMP-012 evidence missed this. Mobile: a separate `data-test-id="mobile-back-to-operator-button"` lives in the hamburger panel (2-tap exit: hamburger → tap → operator session restored, lands on `/company/members`). 17 hamburger items including the operator label, "logged in as" copy, target label, mobile-back button, and mobile-logout. The mobile exit is functional; original "trap" claim was incorrect. |

---

## Findings

| ID | Stop | Invariant | Severity | Finding |
|----|------|-----------|----------|---------|
| **F-01** | 3 | BL-UI-001 | P0 — but pre-existing | Homepage `/` CLS = 0.476 (`.features-block`). Pre-dates impersonation; surfaced because silent flow lands on `/`. Check duplicate bugs. |
| **F-02** | 3, 4 | BL-UI-004 | Low-Medium (revised) | Mobile passive-cue gap. At ≤ 500 px the top-header impersonation banner renders at 0 × 0 px, so the operator has no ambient indicator that the session is impersonated. Exit IS reachable: the hamburger panel contains `mobile-back-to-operator-button` (2-tap exit). Originally framed as "trap" (High) — re-verified 2026-05-14, downgraded to UX-friction (no passive indicator + 2 taps vs desktop 1 tap). |
| **F-03** | 1, 4 | BL-UI-006 | High | Actions icon button (per member row) and Logout button both 32 × 32 px — below WCAG 2.5.5 44 × 44 minimum at every viewport including desktop. |
| **F-04** | 1 | BL-UI-002 | Medium | `tbody td` padding 10 px (off 4-px grid). Language/currency selector and mega-menu button at 6 px — off-grid. Local to `/company/members` chrome. |
| **F-05** | 3 | UX / BL-UI-003 | Medium | Impersonation banner is `position:relative`. Once scrolled past the header, operators lose the "in-impersonation" cue on long pages. |
| ~~F-06~~ | 2 | Coverage gap | **Retired** | Form-path audit completed 2026-05-14 via anonymous isolated session. See F-07, F-08, F-09 below. |
| **F-07** | 2 | BL-UI-003 | Medium | Inline error insertion (empty→error transition) is a push-layout: form grows +46 px, all content shifts ±23 px on every failed login attempt. Fix: pre-reserve height for error slot or use overlay positioning. |
| **F-08** | 2 | BL-UI-002 | Low | `VcAlert` danger variant off-grid padding: 5.008 px top/bottom (expected 4 or 8), 10 px right (expected 8 or 12), 7.008 px left (expected 8). Cross-cutting — affects all danger alerts in the storefront, not isolated to this form. |
| **F-09** | 2 | BL-UI-006 | Medium | Three form elements below WCAG 2.5.5 44×44 px minimum: Email input (h=36 px), Password input (h=36 px), Show/hide toggle (38×38 px). At mobile, password input and toggle are 1 px apart (< 8 px gap). Shared `VcInput size="md"` token defect. |

---

## Build-drift note vs VCST-4905

The functional run (VCST-4905) was against theme `2.49.0-pr-2279-3ce07383`. This design audit ran against `2.49.0-pr-2280-80690ef2` — at least one newer PR.

**Material differences observed:**

- **`data-test-id="back-to-operator-row"` EXISTS in pr-2280** (256 × 49 px button labelled "Back to John Mitchell") — a distinct Stop-Impersonation affordance that VCST-4905's IMP-012 evidence said was missing. Either pr-2280 added it, or pr-2279 already had it and the IMP-012 reviewer overlooked it.
- The IMP-012 P1 bug ("Stop Impersonation redirects to /sign-in") was filed against `sign-out-button` — confirm whether `back-to-operator-row` calls the correct token-revoke path or whether IMP-012's underlying functional bug is still live.

This audit does NOT re-litigate IMP-012, but flags the build mismatch so the functional verdict can be reconfirmed against pr-2280.

---

## Diagnosis summary

- **F-03 (touch targets) is the headline finding.** Per-row Actions icon (32 × 32) on `/company/members` and the Logout button (32 × 32) in the account dropdown both fail WCAG 2.5.5 at every viewport. Direct, fixable, design-system defect.
- **F-09 (form touch targets) is the form-path headline.** Email and Password inputs are 36 px tall (VcInput size="md" token) — 8 px short of the 44 px minimum. Show/hide toggle is 38×38 px. Shared component defects; Verify + Cancel action buttons correctly pass at 44 px.
- **F-07 (error-insertion shift) is a form-specific Medium.** Every failed login pushes the form layout 23 px. Fix: pre-reserve height for the error slot.
- **F-08 (alert spacing) is Low.** Off-grid padding on VcAlert danger variant (5.008/7.008/10 px) is a component-level token issue.
- **F-02 is real but milder than originally written.** Mobile operators get the impersonation cue + exit only after opening the hamburger — no passive on-page indicator. Severity downgraded from High "trap" → Low-Medium UX-friction after the 2026-05-14 hamburger re-verify.
- **F-01 is severe but likely pre-existing** — should be cross-checked against open homepage-CLS bugs before filing.
- **F-06 is retired.** Form-path audit completed 2026-05-14; all gaps closed.
- The functional security findings from VCST-4905 (P0 nested-impersonation, Medium self-impersonation) are **out of this audit's scope** and remain in their existing track.

---

## Evidence paths

- `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/storefront/01-company-members/measurements.json` + `01-mobile-BL-UI-006-FAIL.png`
- `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/storefront/02-impersonate-page/measurements.json` (silent-path placeholder)
- **Form-path (2026-05-14 follow-up):** `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/storefront/02-impersonate-page/form-path/measurements.json` + `form-error-1280-BL-UI-003-FAIL.png` + `form-empty-500-BL-UI-006-FAIL.png` + `form-empty-1280-initial.png` + `form-error-1280-initial.png`
- `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/storefront/03-post-impersonation-home/measurements.json` + `03-1280-BL-UI-001-FAIL.png` + `03-375-BL-UI-004-impersonation-banner-hidden-FAIL.png`
- `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/storefront/04-banner-persistence/measurements.json` + `04-375-BL-UI-006-logout-inaccessible-FAIL.png`
- F-02 re-verify (2026-05-14): `tests/Sprint-current/qa-design/loginonbehalf-flow-2026-05-14/storefront/04-banner-persistence/hamburger-reverify.json` + `hamburger-reverify-375-menu-open.png` + `hamburger-reverify-375-after-exit.png`

---

## Cross-references

- VCST-4905 functional report: [`tests/Sprint-current/VCST-4905/test-execution-report-frontend.md`](../../VCST-4905/test-execution-report-frontend.md)
- Page invariants definitions: [`.claude/agents/knowledge/business-logic.md § Domain 15`](../../../../.claude/agents/knowledge/business-logic.md)
- Critical-UI matrix: [`.claude/agents/knowledge/critical-ui-scope.md`](../../../../.claude/agents/knowledge/critical-ui-scope.md) — `/company/members` IS in the page inventory
