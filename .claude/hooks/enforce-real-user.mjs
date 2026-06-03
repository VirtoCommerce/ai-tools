#!/usr/bin/env node
// PreToolUse hook — enforces real-user browser interaction.
//
// Blocks MCP browser evaluation tools (browser_evaluate, browser_run_code_unsafe,
// evaluate_script) unless the JS payload matches a documented exception. Wired
// via .claude/settings.json. Source of rule: .claude/agents/qa/shared-instructions.md
// §"Browser Interaction — Mandatory Real-User Behavior" plus the memory entries
// feedback_real_user_interaction and feedback_no_force_disabled_controls.

import { readFileSync } from "node:fs";

const ALLOWED_PATTERNS = [
  // GraphiQL JWT paste — CodeMirror doesn't sync with browser_fill/type for
  // ~1800-char tokens; canonical workaround in graphiql-interaction.md.
  /execCommand\(\s*['"]insertText['"]/,
  // GA4 verification — dataLayer / gtag are JS-only side effects, no UI surface.
  /\b(window\.)?dataLayer\b/,
  /\bgtag\s*\(/,
  // Cross-origin iframe inspection (Skyflow / CyberSource payment frames).
  /document\.querySelector(All)?\(\s*['"][^'"]*iframe/,
  // Read-only layout / a11y measurement — suite 048b (Layout Stability) and
  // /qa-design. These snippets only READ geometry & computed style (no clicks,
  // no typing, no forced controls, no page-state mutation), so they don't
  // violate the real-user rule — they were simply never allowlisted, which
  // blocked all 160 cases in 048b. Canonical source: scripts/lib/measure-layout.ts
  // (LAYOUT_SNIPPETS + spacing/alignment/overflow/touch-target/rect/FOUC audits).
  /window\.__layoutAudit\b/, // CLS observer install/read
  /['"]layout-shift['"]/, // PerformanceObserver CLS
  /\bgetBoundingClientRect\s*\(/, // rect snapshots, overflow, alignment, touch targets
  /\bgetComputedStyle\s*\(/, // spacing, contrast, focus-indicator, overflow audits
  /\bdocument\.fonts\b/, // FOUC / font-swap readiness
  /\b(naturalWidth|naturalHeight)\b/, // image aspect-ratio audit (BL-UI-010)
  // Read-only SEO <head> inspection — PreRender/SEO verification (VCST-5108).
  // These snippets only READ document head meta/link/JSON-LD to compare the
  // hydrated SPA's SEO output against the prerendered snapshot. No clicks,
  // typing, or page-state mutation — same read-only spirit as the layout/a11y
  // and payment-iframe exceptions above.
  /\bdocument\.title\b/, // final hydrated <title>
  /meta\[name=['"]robots['"]\]/, // robots index/noindex check
  /link\[rel=['"]canonical['"]\]/, // canonical URL check
  /script\[type=['"]application\/ld\+json['"]\]/, // JSON-LD Product schema
];

const BLOCK_MESSAGE = [
  "BLOCKED by real-user interaction rule.",
  "",
  "You attempted to call a browser evaluate/run-code tool. Use real-user MCP",
  "tools instead: browser_click, browser_type, browser_fill_form, browser_press_key,",
  "browser_hover, browser_scroll, browser_snapshot, browser_wait_for.",
  "",
  "Why this is enforced:",
  "  - A disabled Save button = validation working, NOT a bug (VCST-5100 lesson).",
  "  - An API-only repro is NOT a UI-layer defect.",
  "  - Tests must validate the user experience, not just an end state.",
  "  - Forcing a blocked control manufactures false positives that waste review cycles.",
  "",
  "Documented auto-allow exceptions (regex match on the JS payload):",
  "  - execCommand('insertText')  — GraphiQL JWT paste into CodeMirror",
  "  - dataLayer / gtag()         — GA4 verification (JS-only side effect)",
  "  - querySelector('iframe...') — cross-origin payment frame inspection",
  "  - getBoundingClientRect / getComputedStyle / __layoutAudit /",
  "    PerformanceObserver('layout-shift') / document.fonts / naturalWidth",
  "                                 — read-only layout & a11y measurement (suite 048b, /qa-design)",
  "",
  "If your case fits an exception but was blocked, refine the regex in",
  ".claude/hooks/enforce-real-user.mjs (do not bypass — extend the allowlist).",
  "",
  "Rule source: .claude/agents/qa/shared-instructions.md §Browser Interaction",
  "Memory: feedback_real_user_interaction, feedback_no_force_disabled_controls",
].join("\n");

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function extractJs(input) {
  if (!input || typeof input !== "object") return "";
  return String(
    input.function ?? input.code ?? input.expression ?? input.script ?? ""
  );
}

try {
  const raw = readStdin();
  if (!raw.trim()) {
    process.exit(0);
  }

  const event = JSON.parse(raw);
  const toolName = String(event.tool_name || "");

  // Defense in depth: the matcher in settings.json already filters, but
  // re-check here so the script is safe to run unconditionally.
  if (
    !/__(browser_evaluate|browser_run_code_unsafe|evaluate_script)$/.test(
      toolName,
    )
  ) {
    process.exit(0);
  }

  const jsCode = extractJs(event.tool_input);
  for (const pat of ALLOWED_PATTERNS) {
    if (pat.test(jsCode)) {
      process.exit(0);
    }
  }

  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason: BLOCK_MESSAGE,
    }),
  );
  process.exit(0);
} catch (err) {
  // Fail open on hook errors — log to stderr and let the call through rather
  // than blocking legitimate work because of a hook bug.
  process.stderr.write(
    `enforce-real-user hook error: ${err?.message ?? err}\n`,
  );
  process.exit(0);
}
