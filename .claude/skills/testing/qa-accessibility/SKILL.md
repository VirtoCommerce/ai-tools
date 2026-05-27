---
description: "[Testing] WCAG 2.2 AA accessibility audit: POUR + 2.2 additions, axe-core injection, Lighthouse MCP, keyboard walk, ARIA."
argument-hint: "page URL | component name | full audit"
---

# /qa-accessibility — WCAG 2.2 AA Accessibility Audit

Run an accessibility audit against **WCAG 2.2 Level AA** (the 2026 practical baseline — 2.2 is the current W3C Recommendation since 2023-10-05 and is backward-compatible with 2.1; 4.1.1 Parsing was retired). Covers POUR plus the six new 2.2 AA criteria (Focus Not Obscured, Dragging Movements, Target Size Minimum, Consistent Help, Redundant Entry, Accessible Authentication).

## Usage
```
/qa-accessibility https://example.com/checkout    # Audit a specific page
/qa-accessibility ProductCard                      # Audit a component (delegate to /qa-storybook)
/qa-accessibility full audit                       # Full site audit: homepage, sign-in, catalog, PDP, cart, checkout, account
```

## Supporting Files

- **wcag-accessibility-checklist.md** — Complete WCAG 2.2 AA checklist organized by POUR, plus the six new 2.2 criteria, dynamic-state rescans, manual-only items, agent automation recipes (axe-core injection, Lighthouse, keyboard walk, contrast from computed style), and pitfalls.

## Boundary with `/qa-storybook`
- `/qa-storybook` — a11y addon **inside stories** (component-isolated; tune axe rules per component).
- `/qa-accessibility` — full-page audits against storefront/admin (keyboard journeys across landmarks, page-level contrast, modal focus return, dynamic ARIA announcements).
- A finding that reproduces in a single story belongs to `/qa-storybook`. A finding that only appears once composed into a page (focus order across landmarks, skip-link target, modal portal escape) belongs here.

## Execution

1. **Determine audit scope:**
   - Specific page URL → audit that page across the dynamic states list in the checklist
   - Component name → delegate to `/qa-storybook` instead
   - Full audit → P0 routes: `/`, `/sign-in`, `/search`, PDP, `/cart`, `/checkout`, `/account/orders`. Skip-link and consent banner must be tested first (they affect every page).

2. **Theme scope:** Run a11y assertions only on the **Coffee** theme — it's the only WCAG-compliant theme in this project (memory: `feedback_a11y_coffee_only`). Capture other themes for visual diff, not a11y gating.

3. **Delegate to ui-ux-expert** via Task tool (`subagent_type: ui-ux-expert`):
   - Pass scope, URL(s), and reference to `wcag-accessibility-checklist.md`
   - Agent uses **Chrome DevTools MCP** for `lighthouse_audit`, `evaluate_script` (to inject axe-core and run it), `take_screenshot` (focus states), and the network/console capture
   - For multi-browser parity: re-run keyboard walk on `playwright-firefox` and `playwright-edge`

4. **Run the four-layer scan per route:**
   - **Layer A — axe-core (programmatic):** Inject `axe.min.js` via `evaluate_script`, then `axe.run({ runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22a','wcag22aa'] } })`. Filter out `best-practice` rules — only WCAG-tagged rules count as conformance failures.
   - **Layer B — Lighthouse a11y category:** Call `lighthouse_audit` MCP and read the accessibility category. Lighthouse runs a subset of axe (~50 rules) — use for trend score, **never** as the only signal.
   - **Layer C — keyboard walk:** Press Tab through the page, capture `document.activeElement` after each step, assert focus order matches visual reading order. Verify Escape closes modals and focus returns to the trigger.
   - **Layer D — dynamic rescans:** Re-run Layer A after each significant state change (modal open, accordion expand, form error displayed, toast shown, mega-menu opened, async route load). Scanning only the initial DOM is the #1 cause of missed real bugs.

5. **POUR checklist (per WCAG 2.2 AA):**
   - **Perceivable:** Alt text, color contrast ≥ 4.5:1 / 3:1 (UI ≥ 3:1), text resizing to 200%, reflow at 320px, time-based media captions.
   - **Operable:** Keyboard nav, focus indicators, no traps, skip links, **2.4.11 Focus Not Obscured (sticky elements must not cover focused field)**, **2.5.7 alternative to drag**, **2.5.8 target size ≥ 24×24 CSS px** (44×44 stays the mobile guidance).
   - **Understandable:** Lang attributes, consistent nav, error identification and helpful messages, **3.2.6 Consistent Help placement**, **3.3.7 Redundant Entry (don't re-ask for known data)**, **3.3.8 Accessible Authentication (no cognitive-function tests without alternative; password managers must work)**.
   - **Robust:** ARIA name/role/value for custom controls, state changes announced (aria-live, aria-expanded). Note: 4.1.1 Parsing was removed in 2.2 — don't report duplicate-ID issues against it.

6. **Output:**
   - Audit report with pass/fail per criterion + measured values (contrast ratios, target sizes, focus-order delta from visual order)
   - Group findings by **severity** (Critical / Serious / Moderate / Minor — match axe-core severity) and **WCAG criterion ID** (e.g., `1.4.3`, `2.4.11`)
   - Explicit **"Requires manual verification"** section listing what automation cannot decide (alt-text quality, focus visibility quality, screen-reader narrative coherence, cognitive load, form-error helpfulness, modal focus-trap correctness on edge transitions, aria-live timing)
   - Bug reports follow `.claude/rules/reports.md` (hard cap 80–150 lines per bug); include WCAG criterion ID, measured vs required values, and one annotated screenshot

## Rules
- **WCAG 2.2 AA is the gate** — not 2.1, not 3.0. APCA may be cited as an *advisory* signal for designer review but never as a pass/fail (no scanner enforces APCA in 2026).
- **Automated PASS is necessary but not sufficient** — axe catches ~30–57% of real WCAG issues. Always pair with a manual keyboard pass and an explicit "manual verification needed" section.
- **Test keyboard navigation, not just visual rendering** — the agent must walk Tab order programmatically and assert against expected DOM sequence.
- **Color contrast from computed CSS only** — never eyeball. Compute from `getComputedStyle` color + effective background; assert WCAG 2.x luminance ratio (4.5:1 normal text, 3:1 large/UI/focus indicator).
- **Custom interactive elements** (dropdowns, modals, tabs, comboboxes) need a full ARIA audit — name, role, value, expanded/selected/pressed states.
- **Filter axe `best-practice` tag** — those are advisory, not WCAG failures. Treating them as conformance bugs creates noise and erodes the team's trust in the report.
- **Re-scan dynamic states** — modal open, accordion expand, form-error displayed, toast shown, async chunk loaded. Initial-DOM-only scanning misses most real bugs in SPA storefronts.
- **EU exposure:** The European Accessibility Act has been enforceable since 2025-06-28; treat public-storefront a11y violations as P0/P1 for any EU-reachable site.
