# VCST-5317 — Visual / a11y / design-system lane, Round 3 (`/qa-test` Step 4v, 2nd dispatch)

**Surface:** org switcher — desktop Account-menu popover (`listbox "Organizations"`) and mobile
hamburger → Corporate → *"My organizations"*, `{FRONT_URL}`. **Delta under test:** `878e765a`
(mobile lock treatment + refetch-on-mount, both switchers). **Build:** footer `Ver.
2.58.0-pr-2469-afce-afce27e1` — matches brief. **Browser:** `playwright-edge` (re-dispatched off
Chrome DevTools MCP, which returned all-SKIPPED twice — B-26). **Auth:** signed in via UI form,
`@td(MULTI_ORG_TF_BR.email)` + bare-key `DEFAULT_TEST_PASSWORD`; active org BuildRight, locked org
TechFlow (V2), confirmed on sign-in. Read-only throughout; **left signed in per the brief**, no
seed/lock/teardown.

## This dispatch reached the surface (the 1st, on Chrome DevTools, did not). Verdict: BL-UI-004 FAIL (signed-in, 1280 only) + 2 a11y findings confirmed standing (routed, not blocking)

### BL-UI invariants

| Invariant | Result | Evidence |
|---|---|---|
| BL-UI-004 content boundary — utility bar, 1280 signed-in | **FAIL** | `Select address` box `[390,2,439,38]` overlaps `Call us:` box `[436,11,478,29]` by 3px×18px (getBoundingClientRect). Visible in `utility-bar-1280-signedin.png`. Reproduces Round 2's finding; the anonymous leg (Round 3) never showed it because "Dashboard"/"Select address" copy only renders signed-in. |
| Same, 1920 signed-in | PASS | No overlaps found (30-item sweep); `scrollWidth 1905 ≤ innerWidth 1920`. `utility-bar-1920-signedin.png`. |
| Same, anonymous, 1280 & 1920 (Round 3, carried forward) | PASS | `scrollWidth 1265/1905 ≤ innerWidth` both; 0 overlaps in an 8-item sweep. |
| BL-UI-002 spacing grid, popover listbox + options | PASS | padding 4/12px, gap 6px — all on `SPACING_GRID_PX`. |
| BL-UI-005 alignment, popover option rows | PASS | Both `[role=option]` rows measure 256×48px exactly — no drift. |
| BL-UI-006 touch target, popover options | PASS | 256×48 ≥ 44×44 AAA bar, desktop. |
| BL-UI-004, mobile My-organizations panel | PASS (negligible) | `scrollWidth 376` vs `innerWidth 375` — 1px, not a real overflow. |

**Conclusion for BL-UI-004:** the utility-bar overlap is real, confirmed only at 1280 signed-in,
clean at 1920 signed-in and at both widths anonymous — the wrapped "Select address" copy is the
trigger, present only once authenticated. Route as its own layout bug against the header (not the
org-switcher delta itself, which does not touch the utility bar).

### Cross-surface lock-reason exposure (desktop `title` vs mobile inline AX text) — CONFIRMED, both programmatically determinable, quality differs

Desktop: `<button disabled title="This organization is locked. Contact your administrator for
access." role="option">` wraps a nested `<div title="AGENT-TEST-Org-TechFlow-20260310">` (the radio
label). **F-A2 still stands**: the nested title shadows the outer one for anyone hovering the inner
label text, and native `disabled` removes the whole row from `Tab` order — confirmed by a keyboard
walk (Account menu → profile link → Logout → BuildRight option → focus exits the popover to the
header logo link, skipping TechFlow entirely; the popover itself stays visually open, an
unrelated advisory note, not one of the tracked findings).

Mobile: the disabled radio's accessible name/label carries the full sentence *"This organization is
locked. Contact your administrator for access."* inline (confirmed via snapshot text on the
`generic` label node), not as a hover-only attribute. **Both are programmatically determinable** —
neither is colour-only — but mobile has no sighted-non-AT path to the reason at all: the org name
truncates with `…` at 375px (`mobile-375-my-organizations.png`), only a padlock icon sits beside it,
there is no touch equivalent of desktop's hover tooltip, and the click guard means tapping does
nothing. Desktop's sighted mouse users get the tooltip; desktop's AT users depend on inconsistent
`title` exposure; mobile's AT users get a clean accessible name; mobile's sighted-only users get
nothing. Advisory UX/consistency finding — routes separately, does not block this ticket
(`feedback_a11y_never_blocks_feature_stories`).

### F-A1 (focus-ring contrast) — CONFIRMED STILL STANDS, now also on the org-switcher control itself

Focused BuildRight option: `outline: 2px solid rgba(229,33,33,0.3)` over a white row background →
effective ≈ rgb(247,188,188) on white ≈ **1.63:1** (WCAG 1.4.11 needs 3:1). Live preset confirmed
Red (`--color-primary-500: #e52121`) — store-config-driven, matches Round 2. Previously logged as
site-wide/pre-existing on the public header; this round adds the org-switcher listbox as a second
confirmed location using the same token. Not filed again (already tracked); still a11y-only, does
not block.

### F-A3 (all-locked listbox exposing 0/2 focusable options) — NOT REACHED

This fixture is at V2 (one org locked), not V7 (all-locked). Confirmed the V2 baseline instead: 1 of
2 options focusable (BuildRight enabled, TechFlow `disabled`) on both surfaces — consistent with
what V7 would degrade from, but the all-locked state itself was not exercised this round (no
lock/unlock performed, read-only per the brief).

### Icon contrast / parity — lock-closed

Icon stroke `rgb(163,163,163)` on white ≈ **2.52:1** — below 3:1, but the control is genuinely
`disabled` (native attribute, not a CSS-only phantom), so it is **exempt** under WCAG 1.4.11's
inactive-component carve-out. Not a violation. Rendered glyph = Lucide `lock` (closed padlock,
24×24px) — semantically correct for "lock-closed". A true name→glyph diff against the design source
could not run (`vs. DESIGN` SKIPPED below), so this is an observed-glyph confirmation only, not a
spec diff.

### Mobile viewport

Requested 375×812 → **achieved exactly** (screenshot pixel dimensions confirm 375×812, `scale:
"css"`, no clamp) — unlike the Chrome DevTools lane's persistent 500px clamp (Rounds 1–3). All
mobile axes reachable this round.

### `vs. DESIGN` — SKIPPED

No Prototype link on the ticket; `DESIGN_SYSTEM_PROJECT_ID` removed 2026-09-03. Per the brief, not a
pass.

### A3.a (throttled-network refetch race) — NOT REACHED

`playwright-edge` has no network-throttling primitive. Stated explicitly per the brief, not
simulated by other means.

### Contrast — Coffee / Red

Red: measured (see F-A1 above, same preset). Coffee: **SKIPPED** — the live preset is
store-config-driven and not user-togglable from this session (confirms Round 2); a preset this
session cannot reach is SKIPPED, never PASS.

## Evidence

`reports/tickets/Sprint26-18/VCST-5317/screenshots/`: `utility-bar-1280-signedin.png`,
`utility-bar-1920-signedin.png`, `desktop-1920-popover-organizations.png`,
`desktop-1920-focus-exit-to-logo.png`, `mobile-375-viewport-check.png`,
`mobile-375-my-organizations.png`.

## Lane state

No fixture mutation, no seed/lock/unlock/teardown, no suite CSV touched. Session left **signed in**
per the brief (no logout). No console errors observed beyond routine third-party noise, no 4xx/5xx
on visited routes.

## Recommendation

File BL-UI-004 (utility-bar overlap, signed-in, 1280 only) as its own layout bug against the header,
separate from this ticket's org-switcher delta. F-A1/F-A2 remain tracked a11y findings, unchanged in
severity, now with one additional confirmed location (F-A1) — no new ticket needed unless the
existing ones are already closed. The mobile no-sighted-path-to-lock-reason gap is new this round;
recommend a UX ticket, not a blocker.
