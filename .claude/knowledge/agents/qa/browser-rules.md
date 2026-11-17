# Browser rules — real-user behaviour and typing passwords

Part of the QA team framework. The always-loaded core is [`shared-instructions.md`](shared-instructions.md); this file holds detail read before your first browser action in a run.

## Browser Interaction — Mandatory Real-User Behavior

**Hook-enforced.** A `PreToolUse` hook (`hooks/enforce-real-user.mjs`) blocks `browser_evaluate`, `browser_run_code_unsafe`, and `evaluate_script` MCP calls on ANY MCP server name (plugin-namespaced ones included) unless the JS payload matches the narrow auto-allow regex list (GraphiQL JWT `execCommand('insertText')`, `dataLayer`/`gtag()`, cross-origin iframe inspection, read-only measurement, `/* @allow-eval */`, and a payload that sends only CDP `WebAuthn.*` commands — the virtual authenticator a passkey test needs, which emulates the device while the ceremony itself is still clicked). **Exploratory / SBTM probes** (`/qa-exploratory`, `/qa-sbtm`) declare themselves with `/* @exploratory: <charter> — <reason> */` in the payload; a finding from such a probe is a server/API-layer finding, never a UI-layer one (VCST-5100), and the sentinel never goes into a scripted test case or regression run. Do not try to bypass — if your case fits an exception but was blocked, extend the regex. **Also allowed by what the payload does** (2026-11-06): an evaluate payload that only reads (no synthetic input, member assignment, DOM/CSSOM/storage write, navigation, network or eval); a `browser_run_code_unsafe` payload that drives the page only through Playwright input and capture (locator actions, `page.mouse`/`keyboard`, `setViewportSize`, `waitFor*`, `screenshot`, `pdf`, `emulateMedia` — never `evaluate`, `route`, `addScriptTag`/`addStyleTag`, CDP, `force: true` or `page.request`), so timed bursts and real paged-media print run in a test lane; and `/* @simulate: <what> */` for injecting the CSS or token a fork, plugin or preset would ship — it may restyle the page, never click, submit, set `.value` or unlock a control, and the row names it in its evidence.

**Typing a password — the token is the key NAME with its env.** On a Playwright lane, `browser_type(text="ORG_USER_PASSWORD_VCPTCORE_DEV")` (`NAME_<ENV>`, ENV = the run's `TEST_ENV` upper-cased — the brief names it), or `MASTER_PASSWORD` on a master stand; the lane holds every env's passwords from `test-accounts.local.json` in memory, substitutes the value and redacts it everywhere. **Never `{{ORG_USER_PASSWORD}}`** — the repo's `{{VAR}}` test-data convention does not apply to a lane, the lookup misses, and the miss is SILENT (the literal string is typed; the form just says "Login attempt failed"). Confirm the hit from the response's *Ran Playwright code* line: `fill(process.env['NAME'])` = hit, `fill('NAME')` = miss. A second `PreToolUse` hook (`hooks/enforce-secret-token.mjs`) blocks a placeholder, an unknown credential-shaped key (naming the form the lane uses), a name whose value changed in the store since the lane started (reconnect it in `/mcp`), and a plaintext secret before the keystroke. Chrome DevTools MCP holds **no** passwords — that brief must name its own auth path. Contract: [`../../execution/browser-lanes.md`](../../execution/browser-lanes.md) §Browser login secrets.

You MUST drive the browser like a real customer:

- **Click** buttons, links, and UI elements — never navigate by injecting URLs unless the test specifically targets direct navigation
- **Type** into fields with fill/type tools — never set values via JavaScript
- **Wait** for elements to appear before interacting — never assume instant rendering
- **Scroll** to off-screen elements before clicking; on mobile (≤500 px) **open the hamburger** before claiming a control is missing
- **Hover** over menus and dropdowns to trigger them
- Use **keyboard shortcuts** (Enter / Tab / Escape) where a real user would
- Never skip steps by navigating directly to the result page

### Hard rules — do NOT do these

1. **Never force a disabled or blocked control.** Disabled Save = validation working, NOT a bug. Do not programmatically click, dispatch events, remove `__disabled`/`pointer-events`, or keyboard-force a submit. If the UI blocks the action, the real-user verdict is "blocked by validation," full stop.
2. **Never conflate an API-only repro with a UI-layer defect.** A direct REST/GraphQL call that returns 500 proves the API layer only — it never proves the SPA "has no validation." In the 4-layer table, an API-only finding is Layer-4 FAIL with Layer-2 (Admin SPA) marked PASS/N/A. Label such bugs "API-only (UI blocks this)" in the title.
3. **Never use `browser_evaluate` to read screen content.** Use `browser_snapshot`. The exceptions are extracting a value genuinely not exposed in the DOM tree, the documented GraphiQL JWT paste, GA4 `dataLayer` inspection, or payment-iframe console capture — and each must include an inline comment explaining why a real-user action was insufficient.

### Anti-example — VCST-5100 (do not repeat)

qa-backend-expert posted a direct `POST /api/loyalty-programs` with `name:null`, got a 500 + DB-name leak, and filed it as "no client validation, silent failure" on the Admin SPA. The Save button is **disabled** when Name is empty (`ng-invalid-required`, `menu-item __disabled`). The 500 is a real API-hardening bug, but the UI claim was false and wasted a review cycle. Real-user repro first; only then file an API-only ticket separately if the API behavior is independently wrong.

This rule applies to **all** agents — QA, BA, orchestrators, and the parameterized test runners — without exception.
