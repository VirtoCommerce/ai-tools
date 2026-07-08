# WCAG 2.2 AA Accessibility Checklist

> Reference file for ui-ux-expert agent. Read when performing accessibility audits. **Gate: WCAG 2.2 Level AA** (W3C Recommendation since 2023-10-05; backward-compatible with 2.1; 4.1.1 Parsing was retired).

## Four WCAG Principles: POUR

**P** Perceivable | **O** Operable | **U** Understandable | **R** Robust

## What's new in WCAG 2.2 vs 2.1

| SC | Level | Note |
|---|---|---|
| **2.4.11 Focus Not Obscured (Minimum)** | AA | Sticky header / footer / cookie banner must not cover the focused field — common on `/checkout` and `/cart` |
| **2.5.7 Dragging Movements** | AA | Quantity steppers, address-map pins, carousels need single-pointer alternative |
| **2.5.8 Target Size (Minimum)** | AA | Interactive targets ≥ **24×24 CSS px**. 44×44 stays as mobile guidance (and 2.5.5 AAA). |
| **3.2.6 Consistent Help** | A | If Help/Chat appears on multiple pages, same relative location |
| **3.3.7 Redundant Entry** | A | Don't re-ask for info already given in the same flow (billing = shipping must auto-fill) |
| **3.3.8 Accessible Authentication (Minimum)** | AA | No cognitive-function puzzles unless alternative exists; password managers must work |
| 2.4.12, 2.4.13, 3.3.9 | AAA | Out of scope for AA gate |
| ~~4.1.1 Parsing~~ | — | **Removed in 2.2** — don't file duplicate-ID issues against it |

## Complete Checklist

```markdown
Test Case: TC_A11Y_PAGE_001
Title: WCAG 2.2 AA audit for [Page or Flow]

PRINCIPLE 1: PERCEIVABLE
Information and UI components must be presentable to users in ways they can perceive.

1.1 Text Alternatives:
[] All images have alt text
  - Decorative images: alt="" (empty)
  - Informative images: descriptive alt text
  - Product images: alt="[Product Name]"
[] Icons have accessible labels (aria-label / aria-labelledby / visible text)
[] SVG icons have <title> or aria-label
[] Alt text quality — agent flags but does NOT auto-fail "image1.jpg"; surface for manual review

1.2 Time-based Media:
[] Videos have captions (if videos present)
[] Audio content has transcripts (if audio present)

1.3 Adaptable:
[] Content presented in meaningful reading order
[] Relationships programmatically determined
  - Form labels associated with inputs (for/id, or wrapped <label>)
  - Headings nest properly (no skipping levels)
  - Landmarks present (header / nav / main / footer)
[] Instructions don't rely only on sensory characteristics
  - Bad: "Click the round button"
  - Good: "Click the 'Add to Cart' button"

1.4 Distinguishable:
[] Color Contrast (computed from CSS, never eyeballed):
  - Normal text (< 18px regular / 14pt): 4.5:1 minimum
  - Large text (≥ 18.66px regular / ≥ 14.66px bold): 3:1 minimum
  - UI components (borders, icons, focus indicators): 3:1 minimum

  Test all combinations: text on background, buttons in every state (default/hover/focus/active/disabled),
  links, form inputs (default/focus/error), icons, error and success messages, focus indicators.

[] Color is not the ONLY way information is conveyed (error/success/required: icon + text, not just hue)
[] Text resizable to 200% without loss of content or functionality
[] Reflow at 320px width — no horizontal scrolling except for data tables, images, toolbars
[] Images of text avoided (logos exempt)
[] APCA Lc — advisory only in 2026; never the pass/fail gate

PRINCIPLE 2: OPERABLE
UI components and navigation must be operable.

2.1 Keyboard Accessible:
[] ALL functionality available via keyboard
  - Tab reaches every interactive element
  - Enter/Space activates buttons/links
  - Arrow keys navigate composite widgets (dropdowns, menus, radio groups)
  - Escape closes modals/dropdowns
[] No keyboard trap (can Tab into AND out of every component)
[] Focus order matches visual reading order
[] Modal traps focus while open; focus returns to trigger on close

2.2 Enough Time:
[] No time limits, or adjustable/extendable
[] Can pause/stop/hide moving content (carousels, animations)

2.3 Seizures:
[] No content flashes more than 3 times per second

2.4 Navigable:
[] Skip link present and reaches main content (test from a cold Tab)
[] Page has descriptive <title>
[] Link purpose clear from link text or context (no bare "click here", "read more")
[] Multiple ways to find pages (menu, search, sitemap)
[] Headings and labels descriptive
[] Focus indicator visible (≥ 3:1 contrast against background, ≥ 2 CSS px thick or equivalent)
[] **2.4.11 Focus Not Obscured (AA, NEW in 2.2)** — sticky/floating elements (header, cookie banner,
  chat widget, sticky CTA) must not cover the currently-focused field. Test by Tab-walking the
  checkout form with the sticky header pinned.

2.5 Input Modalities:
[] **2.5.7 Dragging Movements (AA, NEW in 2.2)** — any drag interaction (quantity slider, sortable
  list, map pin, range input) must have a single-pointer alternative (button +/-, type-to-set, etc.)
[] **2.5.8 Target Size Minimum (AA, NEW in 2.2)** — interactive targets ≥ 24×24 CSS px, OR an
  equivalent invisible hit area, OR spacing ≥ 24 px between centers. Exceptions: inline text links,
  user-agent-controlled controls, essential presentation. Mobile guidance remains 44×44.
[] Functionality operable with single pointer (no required multi-touch gestures)

PRINCIPLE 3: UNDERSTANDABLE
Information and operation of UI must be understandable.

3.1 Readable:
[] Language of page set: <html lang="en">
[] Language of parts set when different: <span lang="es">Hola</span>

3.2 Predictable:
[] Components don't change context on focus (no auto-nav while tabbing)
[] Components don't change context on input (no auto-submit without warning)
[] Consistent navigation across pages
[] Consistent identification — same icon/label means the same thing throughout
[] **3.2.6 Consistent Help (A, NEW in 2.2)** — if Help / Contact / Chat / FAQ appears on multiple
  pages, place it in the same relative location in the DOM order

3.3 Input Assistance:
[] Errors identified and described in text (not color alone)
[] Form fields have visible labels; required fields marked with text + asterisk
[] Instructions provided when format is non-obvious (date format, password rules)
[] Error suggestion provided ("Email must contain @"), not just "Invalid"
[] Error prevention for critical actions (checkout, delete) — confirmation step, review opportunity
[] **3.3.7 Redundant Entry (A, NEW in 2.2)** — info previously entered in the same process must be
  auto-filled or selectable. Billing = shipping toggle, returning-user address picker, etc.
[] **3.3.8 Accessible Authentication Minimum (AA, NEW in 2.2)** — sign-in MUST NOT require a
  cognitive function test (puzzle, memorisation, transcription) unless an alternative exists.
  Password managers MUST work (no paste blocking, no character-by-character inputs).
  CAPTCHA needs a non-cognitive alternative.

PRINCIPLE 4: ROBUST
Content must be robust enough to be interpreted by user agents including assistive technologies.

4.1 Compatible:
[] Name, Role, Value available for all UI components (4.1.2)
  - Custom components have appropriate ARIA
  - aria-label / aria-labelledby when needed
  - role attribute for custom widgets
[] Status messages programmatically determinable without focus (4.1.3)
  - aria-live regions for async toasts, error summaries, cart updates
  - aria-live announcement fires AT the visual change, not before or after
[] (4.1.1 Parsing — REMOVED in 2.2; do not report)
```

## Dynamic States to Re-Scan

Initial-DOM-only scanning misses most SPA bugs. Re-run axe-core after each of these:

- Modal / dialog opened (focus trap, role, aria-modal, ESC behavior)
- Accordion / disclosure expanded
- Mega-menu / dropdown opened
- Form-level error displayed (aria-live, focus management)
- Toast / snackbar shown (aria-live, dismissibility)
- Async route load complete (Vue chunk arrived, skeletons replaced)
- Cart updated (line item added, quantity changed)
- Theme toggled (contrast must hold across themes — but assert only on Coffee theme)
- Sticky header pinned (re-check 2.4.11 with a focused form below)

## What Automation Cannot Catch

axe-core catches ~30–57% of real WCAG issues. The rest requires human judgment — surface these in a **"Requires manual verification"** section in every report:

- **Focus order quality** — axe sees focusable elements, not whether Tab order matches visual reading order
- **Focus visibility quality** — passes contrast, but is the indicator easily lost on busy backgrounds?
- **Alt text quality** — `alt="image1.jpg"` passes presence; useless to a screen reader
- **Screen reader narrative coherence** — labels read isolated make sense; concatenated by NVDA/VoiceOver they may not. The MCP agent has no AT hook-up.
- **Form error helpfulness** — copy clarity, recovery guidance
- **Modal focus return on close** — does focus go back to the trigger, or to the body?
- **`aria-live` timing** — region exists (axe-pass) but announcement fires before/after the visual change
- **Cognitive load / reading level / plain-language**
- **Keyboard traps only revealed by state transition** (expanded mega-menu, layered modals)
- **Real assistive-tech user testing** — no substitute for it

## Agent Automation Recipes

The agent runs these via Chrome DevTools MCP and/or Playwright MCP. **Do not reference axe DevTools browser extension** — extensions can't be loaded in MCP-driven browsers.

### Recipe 1 — Inject and run axe-core

```js
// In evaluate_script (Chrome DevTools MCP) or page.evaluate (Playwright MCP)
// 1. Load axe.min.js from CDN or local copy via addScriptTag/inject <script>
// 2. Run with WCAG-only tags — exclude best-practice rules
const results = await axe.run(document, {
  runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22a','wcag22aa'] },
  resultTypes: ['violations', 'incomplete']
});
// Report results.violations grouped by (id, target). `incomplete` = needs manual.
// `best-practice` tag deliberately excluded — those are advisory, not WCAG failures.
```

Re-run after each dynamic state listed above. Wait on a sentinel selector before scanning to avoid false negatives from async Vue chunks.

### Recipe 2 — Lighthouse accessibility category

Call Chrome DevTools MCP `lighthouse_audit` per route. Read the `accessibility` category for a numeric trend score. Lighthouse runs ~50 axe rules — **never use as the only signal**; pair with Recipe 1.

### Recipe 3 — Keyboard walk (focus-order verification)

```js
const trail = [];
for (let i = 0; i < 40; i++) {
  await page.keyboard.press('Tab');
  trail.push(await page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el.tagName, role: el.getAttribute('role'), label:
      el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 60), rect: el.getBoundingClientRect() };
  }));
}
// Assert: trail rect.top values are monotonically increasing (or per visual layout),
// no element appears twice (no loop), no off-screen jumps without an intervening landmark.
```

Repeat with `Shift+Tab` to verify reverse order. After opening any modal, assert focus is inside it; after ESC, assert focus returned to the trigger.

### Recipe 4 — Contrast from computed style

```js
const { color, backgroundColor } = getComputedStyle(el);
// Walk parent chain if backgroundColor is rgba(0,0,0,0) to find effective background.
// Compute relative luminance per WCAG 2.x formula, then contrast ratio.
// Assert ratio >= 4.5 (normal text) / 3 (large text or UI components / focus indicators).
```

Never trust the rendered pixel — themes, alpha layers, and background images defeat eyeball checks.

### Recipe 5 — Target size (2.5.8)

```js
const rect = el.getBoundingClientRect();
// Pass if min(rect.width, rect.height) >= 24, OR spacing-to-neighbors >= 24,
// OR element is an inline text link in a sentence (exception), OR essential presentation.
```

## Pitfalls

1. **Treating axe `best-practice` rules as WCAG failures.** They're advisory. Filter by tag.
2. **Scanning only initial DOM.** SPAs need rescans after every state change (see list above).
3. **False positives on intentional patterns** — skip-links visually-hidden until `:focus`, decorative SVGs with `aria-hidden`, off-screen menus. Maintain an `exclude()` allowlist with comments.
4. **"0 axe violations = WCAG compliant" fallacy.** Automation floor, not ceiling.
5. **Scanning before app is ready** — Vue async chunks cause false negatives. Wait on a sentinel selector.
6. **Reporting 4.1.1 Parsing failures** — removed in WCAG 2.2.
7. **Cross-theme leakage** — only Coffee is A11y-compliant in this project; don't gate on other themes.
8. **APCA as a gate** — APCA is exploratory and not enforced by any 2026 scanner. Use WCAG 2.x ratios for pass/fail; surface APCA Lc only as designer-advisory.

## Reporting

Bug reports follow `.claude/rules/reports.md` — hard caps apply (simple UI/copy a11y bug ≤ 80 lines TOTAL; functional bug ≤ 120; cross-layer ≤ 150). Required fields for an a11y bug:

- Title: `[Component/Page] - A11y: WCAG <criterion-id> - <issue>` (e.g., `Checkout - A11y: WCAG 2.4.11 - Sticky header obscures focused address field`)
- WCAG criterion ID + level (A / AA / AA-2.2)
- Measured value vs required (contrast ratio, target size in px, focus-order delta)
- One annotated screenshot (focus state, contrast measurement, or DOM inspector)
- Affected pages / components
- Suggested fix (color hex, size delta, ARIA attribute, focus-management change)
- Severity from axe (Critical / Serious / Moderate / Minor) → maps to JIRA P0–P3

Do **not** embed the full POUR breakdown, "Assistive Technology Impact" tables, or "How Detected" walkthroughs in the bug — those belong in the audit report, not the ticket.
