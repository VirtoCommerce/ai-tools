# Browser rules — real-user behaviour and typing passwords

Part of the QA team framework. The always-loaded core is [`shared-instructions.md`](shared-instructions.md); this file holds detail read before your first browser action in a run.

## Browser Interaction — Mandatory Real-User Behavior

**Hook-enforced.** A `PreToolUse` hook (`hooks/enforce-real-user.mjs`) blocks `browser_evaluate`, `browser_run_code_unsafe`, and `evaluate_script` MCP calls on ANY MCP server name (plugin-namespaced ones included) unless the JS payload matches the narrow auto-allow regex list (GraphiQL JWT `execCommand('insertText')`, `dataLayer`/`gtag()`, cross-origin iframe inspection, read-only measurement, `/* @allow-eval */`, and a payload that sends only CDP `WebAuthn.*` commands — the virtual authenticator a passkey test needs, which emulates the device while the ceremony itself is still clicked). **Exploratory / SBTM probes** (`/qa-exploratory`, `/qa-sbtm`) declare themselves with `/* @exploratory: <charter> — <reason> */` in the payload; a finding from such a probe is a server/API-layer finding, never a UI-layer one (VCST-5100), and the sentinel never goes into a scripted test case or regression run. Do not try to bypass — if your case fits an exception but was blocked, extend the regex.

**Typing a password — the token is the key NAME in the `--secrets` file.** On a Playwright lane, `browser_type(text="ORG_USER_PASSWORD")` on the single-env `.env.playwright.local`, or `browser_type(text="ORG_USER_PASSWORD_VCPTCORE_DEV")` when the lanes read the combined `.env.playwright.all` (`NAME_<ENV>`, ENV = the run's `TEST_ENV` upper-cased — the brief names it); the MCP substitutes the value from `--secrets` and redacts it everywhere. **Never `{{ORG_USER_PASSWORD}}`** — the repo's `{{VAR}}` test-data convention does not apply to this flag, the lookup misses, and the miss is SILENT (the literal string is typed; the form just says "Login attempt failed"). Confirm the hit from the response's *Ran Playwright code* line: `fill(process.env['NAME'])` = hit, `fill('NAME')` = miss. A second `PreToolUse` hook (`hooks/enforce-secret-token.mjs`) blocks a placeholder, an unknown credential-shaped key (naming the form the lane's file uses), a combined-file name older than its env's value, and a plaintext secret before the keystroke. Chrome DevTools MCP has **no** `--secrets` — that brief must name its own auth path. Contract: [`../../execution/browser-lanes.md`](../../execution/browser-lanes.md) §Browser login secrets.

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
