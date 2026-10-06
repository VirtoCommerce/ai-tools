#!/usr/bin/env node
// PreToolUse hook — makes a Playwright MCP `--secrets` MISS loud instead of silent.
//
// Playwright MCP substitutes a secret only when the typed text is a WHOLE-VALUE
// EXACT MATCH against a key name in the `--secrets` dotenv file
// (`lookupSecret()` in playwright-core; verified against @playwright/mcp 0.0.80).
// On a miss it returns the input UNCHANGED with no error, so the literal string
// lands in the field and the only symptom is the site's generic "Login attempt
// failed" — which reads exactly like a wrong password. That silent failure cost a
// whole run on 2026-09-09 (see .claude/knowledge/domain/mobile-navigation.md §10).
//
// The file is one of two shapes, and the hook reads which from the file itself:
//   - a single-env file (`.env.playwright.local`, `npm run secrets:sync`): bare names;
//   - the combined `.env.playwright.all` (`npm run secrets:sync:all`): every env's
//     names as NAME_<ENV>, listed on its `# envs:` line (scripts/lib/browser-secrets.mjs).
//
// This hook blocks the ways to get a miss, before the keystroke happens:
//   1. `{{KEY}}` / `${KEY}` / `%KEY%` — the repo's own test-data token syntax
//      (.claude/rules/test-data.md), which does NOT apply to this flag.
//   2. A plaintext value that matches a secret in the file — an actual leak into
//      the transcript, and the thing --secrets exists to prevent.
//   3. A credential-shaped KEY NAME that is not in the file (typo / wrong env
//      suffix / the other file shape's form) — would otherwise be typed literally.
//      The message names the form this file uses.
//   4. On the combined file, a name whose value no longer matches its env's
//      layered value (scripts/lib/env-core.js `layeredEnv`) — the old password
//      would be typed.
//
// Rule source: .claude/knowledge/execution/browser-lanes.md §Browser login secrets.
// Memory: reference_playwright_secrets_bare_key_name.
// Fails OPEN on any error — a hook bug must never block legitimate work.

import { readFileSync } from "node:fs";
import { resolve, isAbsolute, dirname, basename } from "node:path";

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

/** Claude Code expands `${VAR}` and `${VAR:-default}` in `.mcp.json` args before it starts a server
 *  (code.claude.com/docs/en/mcp.md), from the same environment this hook inherits — so a
 *  `--secrets …/.env.playwright.${TEST_ENV:-vcst}` resolves here to the file the servers read. An
 *  unset `${VAR}` with no default stays literal, as Claude Code leaves it. */
const expandVars = (s) =>
  s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (whole, name, fallback) => {
    const value = process.env[name];
    if (fallback !== undefined) return value ? value : fallback;
    return value !== undefined ? value : whole;
  });

/** The `--secrets` path in the nearest `.mcp.json` that declares one, from ROOT upwards —
 *  the servers may be declared by a parent workspace's `.mcp.json`, not only the repo's.
 *  (scripts/lib/browser-secrets.mjs `declaredSecretsFile` is the same rule; this copy needs no node_modules.) */
function declaredSecretsFile() {
  for (let dir = ROOT, prev = null; dir !== prev; prev = dir, dir = dirname(dir)) {
    try {
      const mcp = JSON.parse(readFileSync(resolve(dir, ".mcp.json"), "utf8"));
      for (const server of Object.values(mcp.mcpServers ?? {})) {
        const args = server.args ?? [];
        const i = args.indexOf("--secrets");
        if (i !== -1 && args[i + 1]) {
          const file = expandVars(args[i + 1]);
          return isAbsolute(file) ? file : resolve(ROOT, file);
        }
      }
    } catch {
      /* no (readable) .mcp.json at this level — keep walking */
    }
  }
  return null;
}

/** Read the secrets dotenv the Playwright MCP servers were actually started with. With dotenv
 *  available its values are parsed as the MCP parses them (quotes removed); without it, line by line. */
async function loadSecrets() {
  const file = declaredSecretsFile() ?? resolve(ROOT, ".env.playwright.local");
  const text = readFileSync(file, "utf8");
  let map = null;
  try {
    const { parse } = await import("dotenv");
    map = new Map(Object.entries(parse(text)));
  } catch {
    map = new Map();
    for (const line of text.split(/\r?\n/)) {
      const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line);
      if (m) map.set(m[1], m[2]); // dotenv semantics: last assignment wins
    }
  }
  return { file, text, map };
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

function contract(extra, ctx) {
  const lane = ctx.envs
    ? `the combined ${basename(ctx.file)} (envs: ${ctx.envs.join(", ")}) — type NAME_<ENV>`
    : `the single-env ${basename(ctx.file)} — type the bare NAME`;
  return (
    `${extra}\n\n` +
    "How Playwright MCP --secrets works:\n" +
    "  - Type the key NAME exactly as the --secrets file spells it:\n" +
    "      combined .env.playwright.all -> NAME_<ENV>, e.g. browser_type(text=\"ORG_USER_PASSWORD_VCST_QA\")\n" +
    "      (ENV = the run's TEST_ENV upper-cased); a single-env file -> the bare NAME,\n" +
    "      e.g. browser_type(text=\"ORG_USER_PASSWORD\").\n" +
    `    This lane reads ${lane}.\n` +
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

/** The form this file uses for a NAME it lacks: the env-qualified names of a bare name on the combined
 *  file, the envs a qualified name could have used there, or the bare name on a single-env file. */
function nameHint(name, secrets, { envs, lib }) {
  const keys = [...secrets.keys()];
  if (envs && lib) {
    const variants = keys.filter((k) => lib.splitQualifiedName(k, envs)?.name === name);
    if (variants.length) {
      return `The combined file names every key with its env. Type ${name}_<ENV> for the env under test.\nIt has: ${variants.join(", ")}`;
    }
    const base = keys.map((k) => lib.splitQualifiedName(k, envs)?.name)
      .filter((b) => b && name.startsWith(`${b}_`))
      .sort((a, b) => b.length - a.length)[0];
    if (base) {
      return `The combined file has no ${name.slice(base.length)} entry for ${base}; it covers: ${envs.join(", ")}.\n` +
        "For another env: give it a .env.<env> with that password (or a .env.playwright.<env>), run npm run secrets:sync:all, reconnect the Playwright servers.";
    }
    return null;
  }
  const bare = keys.filter((k) => name.startsWith(`${k}_`)).sort((a, b) => b.length - a.length)[0];
  return bare
    ? `This lane reads a single-env file with bare key names: type ${bare}.\n` +
      "It serves only the env it was generated for (every env in one file: npm run secrets:sync:all)."
    : null;
}

function nearMatches(name, secrets) {
  const stem = name.slice(0, Math.max(6, name.indexOf("_") + 1));
  const near = [...secrets.keys()].filter((k) => k.startsWith(stem)).slice(0, 6);
  return near.length ? `Keys that start similarly: ${near.join(", ")}` : "Check the key name against the secrets file.";
}

/** On the combined file: a name whose value differs from its env's layered value now. No current value
 *  (the env files are not next to the secrets file) is not evidence of staleness — fail open. */
function staleReason(qualified, secrets, { envs, lib, file }) {
  const split = envs && lib ? lib.splitQualifiedName(qualified, envs) : null;
  if (!split) return null;
  const now = lib.layeredEnv(split.env, { root: dirname(file) })[split.name];
  if (!now || now === secrets.get(qualified)) return null;
  return (
    `BLOCKED: ${qualified} in ${basename(file)} is out of date: env ${split.env} has a different ${split.name} now.\n` +
    "The servers would type the old value. Run npm run secrets:sync:all, then reconnect the Playwright MCP servers in /mcp."
  );
}

function check(value, secrets, ctx) {
  const ph = PLACEHOLDER.exec(value);
  if (ph) {
    const name = ph[1] ?? ph[2] ?? ph[3];
    return contract(
      `BLOCKED: "${value}" is a placeholder, not a secret reference.\n` +
        (secrets.has(name)
          ? `"${name}" IS a key in the secrets file — type it bare, without the braces.`
          : nameHint(name, secrets, ctx) ?? `"${name}" is also not a key in the secrets file; check the name and env suffix.`),
      ctx,
    );
  }

  for (const [name, secret] of secrets) {
    if (secret && value === secret) {
      return contract(
        `BLOCKED: that is the PLAINTEXT value of ${name}.\n` +
          `Typing it directly puts the credential in the transcript — which is exactly\n` +
          `what --secrets exists to prevent. Type the key name ${name} instead.`,
        ctx,
      );
    }
  }

  const typed = value.trim();
  if (KEY_SHAPED.test(typed) && CREDENTIAL_WORD.test(typed) && !secrets.has(typed)) {
    return contract(
      `BLOCKED: "${typed}" is not a key in the --secrets file, so it would be\n` +
        `typed into the page LITERALLY and the sign-in would fail with no error.\n` +
        (nameHint(typed, secrets, ctx) ?? nearMatches(typed, secrets)),
      ctx,
    );
  }

  const stale = secrets.has(typed) ? staleReason(typed, secrets, ctx) : null;
  return stale ? contract(stale, ctx) : null;
}

try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  const toolName = event.tool_name ?? "";
  if (!/^mcp__playwright-[a-z]+__(browser_type|browser_fill_form)$/.test(toolName)) {
    process.exit(0);
  }

  const values = typedValues(toolName, event.tool_input);
  if (!values.length) process.exit(0);

  const { file, text, map: secrets } = await loadSecrets();
  if (!secrets.size) process.exit(0);

  // The combined-file helpers; without them (no node_modules yet) a combined file is checked as a plain one.
  let lib = null;
  try {
    const [secretsLib, envCore] = await Promise.all([
      import(new URL("../../scripts/lib/browser-secrets.mjs", import.meta.url).href),
      import(new URL("../../scripts/lib/env-core.js", import.meta.url).href),
    ]);
    lib = { combinedEnvs: secretsLib.combinedEnvs, splitQualifiedName: secretsLib.splitQualifiedName, layeredEnv: envCore.layeredEnv };
  } catch {
    /* fail open on the combined-file checks only */
  }
  const ctx = { file, lib, envs: lib?.combinedEnvs(text) ?? null };

  for (const v of values) {
    const reason = check(v, secrets, ctx);
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
