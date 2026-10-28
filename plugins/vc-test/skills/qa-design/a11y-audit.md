# Accessibility audit — the criteria and the technique `vc-test:ui-ux-expert` uses

Read by `vc-test:ui-ux-expert` before the a11y axis (its body points here). The recipes themselves are in
[`wcag-accessibility-checklist.md`](../../knowledge/wcag-accessibility-checklist.md).

## WCAG 2.2 AA Critical Criteria

| Criterion | Requirement | Common VC Failures |
|---|---|---|
| **1.1.1** Non-text Content | All images have alt text | Product images missing alt, icon buttons missing aria-label |
| **1.3.1** Info and Relationships | Structure conveyed programmatically | Form labels not associated with inputs |
| **1.4.3** Contrast (Minimum) | Text ≥4.5:1, large text ≥3:1 | Light gray text on white |
| **1.4.11** Non-text Contrast | UI components ≥3:1 | Focus indicators, form borders |
| **2.1.1** Keyboard | All functionality keyboard-accessible | Dropdowns, modals, custom selects |
| **2.1.2** No Keyboard Trap | Users can navigate away | Modal dialogs, date pickers |
| **2.4.3** Focus Order | Logical tab sequence | Blade stacking in Admin, modal overlays |
| **2.4.7** Focus Visible | Visible focus indicator | Custom buttons removing outline |
| **2.4.11** ✦ Focus Not Obscured (Minimum) — *NEW in 2.2* | Sticky/floating elements must not cover the focused field | Sticky header / cookie banner / chat widget covering checkout inputs |
| **2.5.7** ✦ Dragging Movements — *NEW in 2.2* | Drag interactions need a single-pointer alternative | Quantity sliders, sortable lists, address map pins without +/- buttons |
| **2.5.8** ✦ Target Size (Minimum) — *NEW in 2.2* | Interactive targets ≥ 24×24 CSS px (or ≥24 px center spacing), touch included. 44×44 = AAA, advisory | Icon buttons, close (×), pagination dots, line-item controls below 24 px |
| **3.2.6** ✦ Consistent Help — *NEW in 2.2 (Level A)* | If Help/Contact/Chat appears on multiple pages, same relative location | Help link jumping between header/footer between routes |
| **3.3.1** Error Identification | Errors described to user | Form validation without visible errors |
| **3.3.2** Labels or Instructions | Input fields have labels | Placeholder-only inputs |
| **3.3.7** ✦ Redundant Entry — *NEW in 2.2 (Level A)* | Info entered earlier in a flow must be auto-fillable / selectable | Re-typing shipping address as billing, re-entering account email at checkout |
| **3.3.8** ✦ Accessible Authentication (Minimum) — *NEW in 2.2* | No cognitive-function tests without alternative; password managers must work | Paste-blocking on password field, character-by-character OTP without paste, image-recognition CAPTCHA without audio/text alternative |
| **4.1.2** Name, Role, Value | Custom components expose correct role | Custom dropdowns, toggles, steppers |
| ~~4.1.1 Parsing~~ | **Removed in WCAG 2.2** — do not report duplicate-ID violations against this criterion | — |

## Accessibility Audit Technique

> **Canonical recipes:** [`wcag-accessibility-checklist.md`](../../knowledge/wcag-accessibility-checklist.md) (in this repository: `.claude/skills/qa-accessibility/wcag-accessibility-checklist.md`) — the Agent Automation Recipes (axe-core injection, keyboard walk, contrast from computed style, target-size measurement; Recipe 2 is retired). Read this file before running an audit; **do not hand-roll axe invocations.**

**Automated layer (catches ~30–57% per Deque):**
- **axe-core programmatic** — inject `axe.min.js` via `browser_evaluate` (the real-user hook passes `axe.run` / `window.axe`), then `axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22a','wcag22aa'] }, resultTypes: ['violations','incomplete'] })`. **Filter out axe `best-practice` rules** — they're advisory, not WCAG conformance failures. Report `incomplete` results in the "requires manual verification" section.
- **Lighthouse is not on the Playwright lanes** (`lighthouse_audit` is a Chrome DevTools MCP tool), so there is no trend score: axe, Recipe 1, is the automated signal.
- **Storybook a11y addon** — `@storybook/addon-a11y` for component-isolated runs when auditing in Storybook. Per-story rule config via `parameters.a11y.config.rules`.

**Dynamic rescans (mandatory for SPA storefronts):** Re-run axe-core after each state change — modal open, accordion expand, mega-menu open, form-error displayed, toast shown, async route load, cart updated, sticky header pinned with focus below. Initial-DOM-only scanning misses most real bugs.

**Manual layer (the other 43–70%):** Keyboard walk (Tab/Shift+Tab through focus order, assert against visual reading order; Escape returns focus to trigger), focus indicator visibility quality on busy backgrounds, alt-text quality (presence is automated, *usefulness* is not), form-error helpfulness (copy clarity, recovery guidance), `aria-live` timing relative to visual change, modal focus-trap correctness on edge transitions, 200% zoom + 320 px reflow, `prefers-reduced-motion` respected. **Screen reader output verification is not available** in the MCP toolkit (no NVDA/JAWS/VoiceOver hookup) — surface it as a "requires manual verification" item, never claim a PASS on it.

**Theme scope:** Run a11y assertions on the **Coffee** and **Red** presets — the two WCAG-gated themes in this project. Visual diff still covers all themes. Do not gate on `purple-pink` / `watermelon`: their solid-accent token still fails AA (3.58:1 / 3.14:1 against white), so failures there are known-unsupported, not bugs.

**Contrast:** Compute from `getComputedStyle` (walk parent chain for effective background) and assert WCAG 2.x ratios (4.5:1 normal text, 3:1 large/UI/focus indicator). **Never eyeball.** APCA Lc may be reported as a designer-advisory signal, but never as a pass/fail gate — no 2026 scanner enforces APCA normatively.
