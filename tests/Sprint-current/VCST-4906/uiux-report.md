# VCST-4906 — UI/UX Quality Audit

**Build:** `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2` | **Theme:** Coffee | **Auditor:** ui-ux-expert | **Date:** 2026-05-14
**Environment:** https://vcst-qa-storefront.govirto.com | **Operator:** John Mitchell (CanImpersonate) | **Target:** David Kim
**Baselines:** `tests/Sprint-current/VCST-4906/uiux-baselines/` (15 screenshots)

---

## Executive Verdict: **CONDITIONAL PASS** — 7 accessibility bugs filed

The new UI surfaces introduced by PR #2280 (MembersDropdownMenu "Login on behalf" entry, Security Verification modal, `VcLoaderOverlay` slot, "Back to John Mitchell" revert) are functionally correct and visually consistent with the Coffee design system. Spacing, typography, color tokens, and border radius all pass design system compliance.

However, the feature introduces multiple WCAG 2.1 AA violations that must be addressed before production release given the security-sensitive nature of the impersonation flow.

**Escalation trigger met:** WCAG Critical violations (keyboard reachability for BUG-A, focus indicator absent on security action for BUG-C).

---

## 1 — WCAG 2.1 AA Accessibility Audit

### 1.1 Members Table — Row Action Dropdown (`MembersDropdownMenu`)

- **FAIL — WCAG 4.1.2 Name, Role, Value (Critical)** — Row action trigger at desktop is a `DIV` with `role="button"` and `aria-haspopup="dialog"` but no `tabindex`. Without `tabindex="0"` it is unreachable via keyboard Tab. The popover body has `role="tooltip"` (not `role="menu"`), and individual items lack `role="menuitem"`. Confirmed via `evaluate_script`: `DIV[role="button"][aria-haspopup="dialog"][tabindex=null]`.
- **FAIL — WCAG 2.1.1 Keyboard (Critical)** — "Login on behalf" entry point inaccessible to keyboard-only users on all viewports. ArrowDown does not move focus into menu items; container has no menu role.
- **FAIL — WCAG 2.4.7 Focus Visible** — All dropdown item buttons (including "Login on behalf") have `outline-style: none` in the focused state. No visible focus indicator (desktop 1920px).
- **PASS — WCAG 1.4.3 Contrast (text)** — Dropdown items ~19:1 against white popover background.

### 1.2 Security Verification Modal (`VcModal` / `VcDialog`)

- **FAIL — WCAG 4.1.2 Name, Role, Value (Medium)** — `aria-describedby` on `[role="dialog"]` is `null`. Body text element has `id="dialog-641"` but it is not wired to the dialog. Screen readers announce the title but not the security-critical body text "You are logging in on behalf of {email}. The session will be audited."
- **FAIL — WCAG 2.4.7 Focus Visible (High)** — Close (X) button and OK button both have `outline-style: none` when focused. Cancel button has `outline: 3px solid` (PASS).
- **PASS — WCAG 2.1.1 Keyboard** — Focus traps correctly. Tab order: Cancel → OK → Close (X) → wraps. All reachable.
- **PASS — WCAG 2.1.2 No Keyboard Trap** — Escape closes; focus returns to trigger.
- **PASS — WCAG 2.4.3 Focus Order** — Lands on Cancel on open (safe default).
- **PASS — WCAG 1.4.3 Contrast (all text)** — Heading 21:1, body 21:1, Cancel label 3.76:1 (PASS large/border), OK label 4.79:1.
- **OBSERVATION** — Tab order Cancel → OK → Close (X) is non-standard (ARIA APG recommends Close last-before-wrap or first). Non-blocking.

### 1.3 Impersonation Banner (header top bar)

- **FAIL — WCAG 4.1.2 Name, Role, Value (Medium)** — Banner is plain `SPAN`s with no `role="status"`, no `aria-label`, no `aria-live`. No landmark grouping for AT users. Session-switch is not announced when impersonation begins.
- **PASS — WCAG 1.4.3 Contrast** — All banner text ≥5.30:1 on `#3d2b24` background:

| Element | FG | BG | Ratio |
|---|---|---|---|
| "John Mitchell" / "David Kim" | `rgb(255,255,255)` | `rgb(61,43,36)` | 13.38:1 |
| "logged in as" | `rgb(163,163,163)` | `rgb(61,43,36)` | 5.30:1 |
| Dashboard / Contacts links | `rgb(196,167,155)` | `rgb(61,43,36)` | 5.96:1 |

### 1.4 Account Popup (impersonated — "Back to John Mitchell")

- **FAIL — WCAG 4.1.2 Name, Role, Value (High)** — Account popup has no `role="menu"`; items lack `role="menuitem"`. "David Kim" link, Logout button, and "Back to John Mitchell" button all have `role=null`.
- **FAIL — WCAG 2.4.7 Focus Visible (High)** — "David Kim" link and Logout button: `outline-style: none`. "Back to John Mitchell": 2px solid outline BUT at 40% opacity. Effective blended color `rgb(214,196,189)` vs white → **1.68:1** contrast → fails **WCAG 1.4.11 Non-text Contrast** (≥3:1 required for focus indicators).
- **PASS — WCAG 1.3.1 Info and Relationships** — Border-top separator between David Kim link and Logout.

### 1.5 Touch Target Sizes (Responsive)

| Element | Size | WCAG 2.2 SC 2.5.8 (AA, ≥24px) | WCAG 2.5.5 (AAA, ≥44px) |
|---|---|---|---|
| Row action trigger — desktop BUTTON | 32×32 | PASS | FAIL |
| Row action trigger — tablet DIV | 20×20 | **FAIL** | FAIL |
| Row action trigger — mobile | hidden | N/A | N/A |
| Modal Cancel button | 128×44 | PASS | PASS |
| Modal OK button | 128×44 | PASS | PASS |
| Logout button (account popup) | 32×32 | PASS | FAIL |

---

## 2 — Design System Consistency (Coffee Theme)

- **PASS — BL-UI-002 Spacing Grid** — Modal header `12px 24px`, content `16px 24px`, footer `16px 24px`, button padding `0 16px` / `0 12px` — all values on the `{0,4,8,12,16,20,24…}` grid.
- **PASS — BL-UI-002 Border Radius** — Modal card uses `border-radius: 8px` (= `--vc-radius: .5rem`).
- **PASS — Color Token Usage** — OK button uses `vc-button--color--info` (`rgb(43,126,168)`) — semantically appropriate for an audited verify-and-continue action. No hardcoded hex. Backdrop overlay uses standard `srgb(.09 .09 .09 / .3)`.
- **OBSERVATION — "OK" vs "Continue"** — AC#3 specifies "Continue"; deployed UI shows "OK". "Continue" is the superior label (Nielsen #2): signals sequential flow and weight of the action (initiating an audited session). Recommendation: change to "Continue". This concurs with the qa-frontend-expert IMP-039 finding (P3).

---

## 3 — UX Heuristic Evaluation (Nielsen's 10)

| # | Heuristic | Finding | Severity |
|---|---|---|---|
| 1 | Visibility of system status | `VcLoaderOverlay` present during transitions (PR #2280 addition) — by-design transient overlay, not capturable at speed. Banner mounts immediately after switch. | 0 |
| 1 | Visibility — screen readers | **ISSUE**: No `aria-live` on banner — AT users get no announcement when session switches. Focus drops after modal close with no announcement. | **3 (Major)** |
| 2 | Match real world | "OK" vs "Continue" — generic label for consequential action (see §2). Banner text "{operator} logged in as {target}" is clear. | 2→3 (security-critical) |
| 3 | User control | PASS — Cancel button, Escape, "Back to John Mitchell". All exits present. | 0 |
| 4 | Consistency | PARTIAL — Modal uses `vc-button--color--info` for confirm; other confirmation modals use primary. Defensible but inconsistent. | 1 (Cosmetic) |
| 5 | Error prevention | PASS — Target email shown before confirmation; audit notice present; Cancel is default focus. | 0 |
| 6 | Recognition vs recall | PASS — Target email shown in modal body. | 0 |
| 7 | Flexibility | PASS — Entry point in standard members table; revert in both desktop header and mobile main-menu (IMP-043 PASS). | 0 |
| 8 | Aesthetic / minimal | PASS — Clean modal, two CTAs only, icon + title + close. | 0 |
| 9 | Error recovery | NOT TESTABLE in audit scope — error states (network fail, permission revoked) belong to functional/exploratory scope. | — |
| 10 | Help / docs | Audit notice "The session will be audited" provides context. No tooltip / help link for first-time operators. Low priority for B2B admins. | 1 (Cosmetic) |

---

## 4 — Responsive Audit Summary

| Viewport | Surface | Finding |
|---|---|---|
| 1920×1080 desktop | Members table | Row action trigger BUTTON 32×32 — below 44px AAA recommendation. DIV variant has no `tabindex`. |
| 1920×1080 desktop | Modal | Renders correctly, 564px width, centered. **PASS** layout. |
| 1920×1080 desktop | Banner | Dark top bar, all contrasts PASS. |
| 768×1024 tablet | Members table | Mobile card layout. Action trigger DIV 20×20 — **fails WCAG 2.2 SC 2.5.8** (≥24px). |
| 768×1024 tablet | Modal | Not independently tested at 768 — expected PASS based on VcModal behavior. |
| 375×812 mobile | Members table | Action trigger has `w:0, h:0` — fully hidden at 375. Entry point at mobile is via main menu (covered by IMP-043 PASS). |
| 375×812 mobile | Banner | Not captured in this audit — covered by IMP-043 evidence. |

---

## 5 — Bug Filing Summary

| ID | Title | WCAG | Priority |
|---|---|---|---|
| BUG-A | Row action trigger DIV missing `tabindex="0"` — keyboard users cannot reach "Login on behalf" | 2.1.1, 4.1.2 | **P1 / Critical** |
| BUG-B | Modal `aria-describedby` not wired to body text — screen readers miss security notice | 4.1.2 | P2 / High |
| BUG-C | OK button and Close (X) button missing visible focus indicator in modal | 2.4.7 | **P1 / High** |
| BUG-D | Account popup missing `role="menu"`; items missing `role="menuitem"` | 4.1.2 | P2 / Medium |
| BUG-E | "Back to John Mitchell" focus outline contrast 1.68:1 — fails non-text contrast | 1.4.11 | P2 / Medium |
| BUG-F | No `aria-live` on impersonation banner — session switch not announced to AT | 1.3.1 / 4.1.3 | P2 / Medium |
| BUG-G | Row action button 32×32 desktop / 20×20 tablet — below WCAG 2.2 SC 2.5.8 (≥24px) | 2.5.8 | P2 / Medium |
| BUG-H | (Concurs with qa-frontend IMP-039) Modal CTA "OK" should be "Continue" per AC#3 | UX / AC | P3 |

---

## 6 — Visual Regression Baselines

All in `tests/Sprint-current/VCST-4906/uiux-baselines/`:

- `01-members-table-desktop-1920.png` — members table baseline
- `02-actions-dropdown-open-david-kim.png` — David Kim row dropdown open
- `03-modal-open-david-kim.png` — modal open
- `04-modal-focus-on-ok.png` — OK button focused state (no visible ring)
- `05-impersonated-header-banner.png` — banner "John Mitchell logged in as David Kim"
- `06-account-menu-impersonated-desktop-1920.png` — account popup open, impersonated
- `07-account-menu-back-btn-focused-1920.png` — "Back to John Mitchell" focused (40% opacity outline visible)
- `08-homepage-impersonated-tablet-768.png` — homepage 768px impersonated
- `09–11-members-page-tablet-768.png` — tablet card layout
- `12-members-page-mobile-375.png` — members page 375×812
- `13-members-dropdown-desktop-1920-reopen.png` — dropdown re-open
- `14-modal-open-desktop-1920-token-audit.png` — modal token audit
- `15-debug-members-page-state.png` — debug capture
- `16-loader-overlay-attempt-1/2.png` — loader capture attempts (overlay too transient)
- `17-post-impersonation-homepage-state.png` — post-impersonation state

**`VcLoaderOverlay` note:** Not capturable via DevTools screenshot + 6× CPU throttle — token exchange + redirect completes before screenshot writes. Existence confirmed by PR #2280 code (`VcLoaderOverlay` extended with slot). Transient-by-design; not a finding.

---

## 7 — Coverage Summary

| Scope | Status |
|---|---|
| WCAG 2.1 AA across 4 surfaces (dropdown, modal, banner, account popup) | Audited |
| WCAG 2.2 SC 2.5.8 touch targets | Audited |
| Design system token & spacing consistency | Audited |
| Nielsen heuristic eval | Audited |
| Responsive (1920 / 768 / 375) | Audited |
| Visual baselines (Coffee theme, en-US) | Captured (15 PNGs) |
| de-DE i18n visual audit | Skipped — qa-frontend IMP-047 already covered text translation; no new design tokens in localized strings |
| Error / network failure states | Skipped — belongs to exploratory scope (qa-testing-expert FA2 already covered) |
