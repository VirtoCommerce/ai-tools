---
applicability: universal
applicability_rationale: "Per-browser rendering differences. Cross-VC universal."
---

# Browser Quirks — Cross-Browser Testing Reference

## iOS Safari

- `100vh` includes toolbar — use `dvh` (dynamic viewport height) instead
- Fixed positioning breaks during keyboard open
- Momentum scroll traps — elements can "trap" touch scrolling
- Safe area insets needed for notch devices
- Auto-zoom on inputs with font-size < 16px — always verify mobile form inputs

## Safari Desktop

- `<input type="date">` renders native picker differently than Chrome
- `backdrop-filter` has performance issues
- `position: sticky` inside overflow containers may break

## Firefox

- Scrollbar styling: `::-webkit-scrollbar` not supported (use `scrollbar-width` / `scrollbar-color`)
- Subgrid support varies
- `gap` may not work in older flexbox contexts

### "playwright-firefox cannot click here" — root cause (2026-09-08) and the fix

**Symptom (confirmed 6× on the team's Windows machines, 2026-06 → 2026-08):** `browser_click` on the
`playwright-firefox` MCP lane resolves the element, then times out on Playwright's *"visible, enabled
and stable"* wait — on fully visible, non-moving elements (CLS 0, fixed rect). `browser_type` and
navigation work. Raw `playwright-core` + firefox in a single foreground window clicks the same element,
headed and headless. A browser-revision re-install changed nothing.

**Mechanism — four shipped facts that together predict exactly that split:**

1. Playwright's *stable* check samples the element rect on consecutive `requestAnimationFrame` ticks and
   on **Windows + Firefox demands 5 identical ticks** (`rafCountForStablePosition()` is
   `process.platform === "win32" ? 5 : 1`; Chromium, WebKit and non-Windows Firefox need 1).
2. Since Firefox 102, **Windows window-occlusion tracking** is on by default: a window fully covered by
   other windows is treated as hidden — rAF periods lengthen and then **stop**, `document.hidden` stays
   `true` (Mozilla bugs 1712854, 1732733; Marionette hit the same class in 1802473). Three headed
   1920×1080 browsers on one desktop means the firefox window sits under the two Chromium windows.
3. No rAF ticks → the 5-tick wait never completes → the MCP's **default 5 s action timeout** fires with
   the element still reported visible and enabled.
4. `fill()` waits for visible + enabled + **editable, not stable**, and navigation has no actionability
   wait — so typing and navigating keep working while every click dies. Chromium is immune because
   Playwright launches it with `--disable-backgrounding-occluded-windows` /
   `--disable-renderer-backgrounding`; Playwright sets Firefox's background *timer* prefs but not the
   occlusion pref.

It is not a Firefox rendering bug, not the storefront, and not the MCP's click code — it is the MCP's
*headed, three-windows-at-once* topology meeting a Windows-only Firefox power-saving feature.

**Fix (in the repo):** `config/mcp-playwright-firefox.config.json` → `launchOptions.firefoxUserPrefs`
`{ "widget.windows.window_occlusion_tracking.enabled": false }`. The MCP spreads `launchOptions` into
`browserType.launch()`, so the pref reaches Firefox. Restart the MCP server after the change. Running the
firefox lane headless would also avoid it (a headless window is never occluded); the pref keeps the lane
headed like the other two.

**Prove it before touching any lane rule:** `node scripts/maintenance/firefox-click-probe.mjs` on a
Windows machine that showed the bug. It A/B-launches headed Firefox with and without the pref, covers it
with a Chromium window, and reports rAF ticks / `document.hidden` / a `trial: true` click (full
actionability wait, no real click). Expected: default → 0 ticks, hidden, TIMEOUT; pref off → ~120 ticks,
OK; exit 0. Only on that result: drop `NOT ON playwright-firefox` from the click-driven suites' plan
marking, restore firefox as a real third slot, and rewrite the box in `.claude/rules/agents.md`
§Parallel Execution. Until then the box stands — the rule was measured, and the fix is not yet.

## Edge

- Generally Chrome-compatible (Chromium-based)
- Extension-injected console noise — filter out `extension://` messages
- **High-contrast mode** (Edge/Windows): Verify components remain usable, borders visible, focus indicators work

## WebKit — NOT Available on Windows

WebKit is not available on Windows via Playwright. Use Edge or Chrome as fallback. Do not attempt WebKit installation.
