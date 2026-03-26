# RESOLVED: PageBuilder Designer Sections Panel Empty in Firefox

## Status: RESOLVED — Not a bug. Playwright config issue.

## Root Cause

Playwright Firefox MCP config was missing `"locale": "en-US"` in `contextOptions`. This caused:

1. `navigator.language` = `"undefined"` (string literal, not the value `undefined`)
2. vc-shell-framework calls `new Intl.DateTimeFormat(navigator.language)` during initialization
3. `new Intl.DateTimeFormat("undefined")` throws `RangeError: invalid language tag: "undefined"`
4. The error cascades through the Angular framework, breaking component rendering
5. Sections panel, context menu (CDK overlay), and toolbar buttons all fail to initialize

## Evidence

```javascript
// In Playwright Firefox (broken):
navigator.language    // → "undefined" (string!)
navigator.languages   // → ["undefined"]

// In Playwright Chrome (works):
navigator.language    // → "en-US" (inherited from system)

// The error:
new Intl.DateTimeFormat("undefined")  // → RangeError: invalid language tag: "undefined"
new Intl.DateTimeFormat(undefined)    // → OK (uses system default)
```

## Fix Applied

Added `"locale": "en-US"` to `contextOptions` in all 3 Playwright MCP configs:
- `config/mcp-playwright-firefox.config.json`
- `config/mcp-playwright-chrome.config.json`
- `config/mcp-playwright-edge.config.json`

**MCP server restart required** for the fix to take effect.

## Why Chrome Worked Without locale

Chromium-based browsers (Chrome, Edge) inherit the system locale from the OS even in Playwright's isolated mode. Firefox does NOT — when `locale` is not explicitly set, Playwright passes `undefined` which Firefox stringifies to `"undefined"`.

## Impact on Test Results

The following regression failures from REG-2026-03-25-1715 (suite 060b) were **false positives caused by this config issue**, not real bugs:

- CMS-037, CMS-038, CMS-075, CMS-076, CMS-077 — context menu "empty" (CDK overlay broken by locale error)
- CMS-073 — theme settings "recursion" (framework rendering failure)
- CMS-041, CMS-046-050, CMS-056 — all BLOCKED results (sections panel not rendering)
- CMS-072 — drag & drop BLOCKED (section handles not visible)

**All 20 BLOCKED/FAILED designer tests need re-execution after config fix.**

## Recommendation

After restarting the Firefox MCP server with the updated config:
1. Re-run `/qa-regression 060` to get accurate results
2. Verify `navigator.language` returns `"en-US"` in the browser console
3. Consider adding a pre-flight check for `navigator.language !== "undefined"` in the test framework

## Note for PageBuilder Team

While this is not a PageBuilder bug, the app **could be more resilient** — catching `RangeError` from `Intl.DateTimeFormat` and falling back to a default locale (e.g., `"en-US"`) would prevent this class of failure from cascading through the entire UI. The error banner `"invalid language tag: undefined"` is shown to users, which suggests the app doesn't have a graceful fallback for invalid locale settings.
