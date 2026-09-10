#!/usr/bin/env node
// PreToolUse hook — makes a Playwright MCP `--secrets` MISS loud instead of silent.
//
// Playwright MCP substitutes a secret only when the typed text is a WHOLE-VALUE
// EXACT MATCH against a bare key name in the `--secrets` dotenv file
// (`lookupSecret()` in playwright-core; verified against @playwright/mcp 0.0.80).
// On a miss it returns the input UNCHANGED with no error, so the literal string
// lands in the field and the only symptom is the site's generic "Login attempt
// failed" — which reads exactly like a wrong password. That silent failure cost a
// whole run on 2026-09-09 (see .claude/knowledge/domain/mobile-navigation.md §10).
//
// This hook blocks the three ways to get a miss, before the keystroke happens:
//   1. `{{KEY}}` / `${KEY}` / `%KEY%` — the repo's own test-data token syntax
//      (.claude/rules/test-data.md), which does NOT apply to this flag.
//   2. A plaintext value that matches a secret in the file — an actual leak into
//      the transcript, and the thing --secrets exists to prevent.
//   3. A credential-shaped KEY NAME that is not in the file (typo / wrong env
//      suffix) — would otherwise be typed literally.
//
// Rule source: .claude/knowledge/execution/browser-lanes.md §Browser login secrets.
// Memory: reference_playwright_secrets_bare_key_name.
// Fails OPEN on any error — a hook bug must never block legitimate work.

import { readFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

/** Read the secrets dotenv the Playwright MCP servers were actually started with. */
function loadSecrets() {
  let file = resolve(ROOT, ".env.playwright.local");
  try {
    const mcp = JSON.parse(readFileSync(resolve(ROOT, ".mcp.json"), "utf8"));
    for (const server of Object.values(mcp.mcpServers ?? {})) {
      const args = server.args ?? [];
      const i = args.indexOf("--secrets");
      if (i !== -1 && args[i + 1]) {
        const p = args[i + 1];
        file = isAbsolute(p) ? p : resolve(ROOT, p);
        break;
      }
    }
  } catch {
    /* fall back to the conventional path */
  }
  const map = new Map();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line);
    if (m) map.set(m[1], m[2]); // dotenv semantics: last assignment wins
  }
  return map;
}

/** Every string the tool call would type into the page. */
function typedValues(toolName, input) {
  if (!input) return [];
  if (/__browser_type$/.test(toolName)) {
    return typeof input.text === "string" ? [input.text] : [];
  }
  // browser_fill_form — only textbox/slider values go through lookupSecret().
  return (input.fields ?? [])
    .filter((f) => f && (f.type === "textbox" || f.type === "slider"))
    .map((f) => f.value)
    .filter((v) => typeof v === "string");
}

const CREDENTIAL_WORD = /(PASSWORD|PASSWD|SECRET|TOKEN|APIKEY|API_KEY)/;
const KEY_SHAPED = /^[A-Z][A-Z0-9_]{5,}$/;
const PLACEHOLDER = /^\s*(?:\{\{\s*([A-Za-z_0-9]+)\s*\}\}|\$\{?\s*([A-Za-z_0-9]+)\s*\}?|%([A-Za-z_0-9]+)%)\s*$/;

function contract(extra) {
  return (
    `${extra}\n\n` +
    "How Playwright MCP --secrets works:\n" +
    "  - Type the BARE KEY NAME, e.g. browser_type(text=\"ORG_USER_PASSWORD\").\n" +
    "  - Whole-value exact match only. No {{}}, no $VAR, no interpolation inside\n" +
    "    a longer string. The repo's {{VAR}} test-data convention does NOT apply here.\n" +
    "  - A miss is SILENT: the literal string is typed and the form just says\n" +
    "    \"Login attempt failed\". Never diagnose that from the login error.\n" +
    "  - Confirm the hit in the same call: the response's \"Ran Playwright code\"\n" +
    "    line reads fill(process.env['NAME']) on a hit, fill('NAME') on a miss.\n" +
    "  - Chrome DevTools MCP has NO --secrets. On that lane the brief must name\n" +
    "    its auth path instead.\n\n" +
    "Contract: .claude/knowledge/execution/browser-lanes.md §Browser login secrets"
  );
}

function check(value, secrets) {
  const ph = PLACEHOLDER.exec(value);
  if (ph) {
    const name = ph[1] ?? ph[2] ?? ph[3];
    const known = secrets.has(name);
    return contract(
      `BLOCKED: "${value}" is a placeholder, not a secret reference.\n` +
        (known
          ? `"${name}" IS a key in the secrets file — type it bare, without the braces.`
          : `"${name}" is also not a key in the secrets file; check the name and env suffix.`),
    );
  }

  for (const [name, secret] of secrets) {
    if (secret && value === secret) {
      return contract(
        `BLOCKED: that is the PLAINTEXT value of ${name}.\n` +
          `Typing it directly puts the credential in the transcript — which is exactly\n` +
          `what --secrets exists to prevent. Type the key name ${name} instead.`,
      );
    }
  }

  if (KEY_SHAPED.test(value.trim()) && CREDENTIAL_WORD.test(value) && !secrets.has(value.trim())) {
    const stem = value.trim().replace(/_(VCST|VCPTCORE|VIRTOSTART|LOCALHOST)$/, "");
    const near = [...secrets.keys()]
      .filter((k) => k.startsWith(stem.slice(0, Math.max(6, stem.indexOf("_") + 1))))
      .slice(0, 6);
    return contract(
      `BLOCKED: "${value.trim()}" is not a key in the --secrets file, so it would be\n` +
        `typed into the page LITERALLY and the sign-in would fail with no error.\n` +
        (near.length ? `Keys that start similarly: ${near.join(", ")}` : "Check the key name against the secrets file."),
    );
  }

  return null;
}

try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  const toolName = event.tool_name ?? "";
  if (!/^mcp__playwright-[a-z]+__(browser_type|browser_fill_form)$/.test(toolName)) {
    process.exit(0);
  }

  const values = typedValues(toolName, event.tool_input);
  if (!values.length) process.exit(0);

  const secrets = loadSecrets();
  if (!secrets.size) process.exit(0);

  for (const v of values) {
    const reason = check(v, secrets);
    if (reason) {
      process.stdout.write(JSON.stringify({ decision: "block", reason }));
      process.exit(0);
    }
  }
  process.exit(0);
} catch (err) {
  process.stderr.write(`enforce-secret-token hook error: ${err?.message ?? err}\n`);
  process.exit(0);
}
