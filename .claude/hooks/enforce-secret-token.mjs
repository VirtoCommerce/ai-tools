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
//   5. The master password (the one password of every PASSWORDS=master stand,
//      scripts/lib/env-layers.mjs) when this session's stand is not a master
//      stand — it would reach that stand's sign-in form: MASTER_PASSWORD, and any
//      name whose value is a copy of it (a single-env file synced on a master stand
//      holds it under every name) unless the stand's own value for that name is
//      the same. Also when the stand cannot be confirmed: no TEST_ENV and no session
//      id, only the vcst default chose it, its env files could not be layered, or the
//      hook could not load the repo's env libraries (then MASTER_PASSWORD only: the
//      name needs no library). And MASTER_PASSWORD when the file's copy differs from
//      .env.playwright.master. A name the file lacks on a master stand is answered
//      with "type MASTER_PASSWORD".
//   6. On the combined file, a NAME_<ENV> of another env than this session's
//      (TEST_ENV, its binding, .env.test-env, vcst). The file holds every
//      non-production env's passwords, so typing another env's name is a sign-in
//      on the wrong stand, or a page/prompt asking for another stand's password.
//      CLI and IDE hooks start without CLAUDE_CODE_SESSION_ID (VCST-6091), so the
//      session id comes from the event, and the binding is read from the project root.
//   7. On a single-env file whose `generated-for` line names another env than this
//      session's, any of its names: they are that env's passwords.
//
// Rule source: .claude/knowledge/execution/browser-lanes.md §Browser login secrets.
// Memory: reference_playwright_secrets_bare_key_name.
// Fails OPEN on any error — a hook bug must never block legitimate work — except
// for the master password (item 5), which goes nowhere this hook cannot confirm.

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
    "      combined .env.playwright.all -> NAME_<ENV>, e.g. browser_type(text=\"ORG_USER_PASSWORD_VCPTCORE_DEV\")\n" +
    "      (ENV = the run's TEST_ENV upper-cased); a single-env file -> the bare NAME,\n" +
    "      e.g. browser_type(text=\"ORG_USER_PASSWORD\").\n" +
    `    This lane reads ${lane}.\n` +
    "  - On a master stand (PASSWORDS=master in its env file) every password field takes\n" +
    "    MASTER_PASSWORD, whatever account signs in.\n" +
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

const MASTER_NAME = "MASTER_PASSWORD";

/** The command that re-generates this lane's --secrets file. */
const resync = (ctx) => (ctx.envs ? "npm run secrets:sync:all" : "npm run secrets:sync");

/** This session's stand: the env it resolves (TEST_ENV, its binding, .env.test-env, vcst), what chose it, its values
 *  layered with its run's ticket, and whether it says PASSWORDS=master. `{ unknown: why }` when it cannot be told:
 *  neither TEST_ENV nor a session id is known (only a default would answer, and a default is no evidence), or
 *  layering its env files failed. Null without the libraries. */
function sessionStand(ctx) {
  if (!ctx.lib) return null;
  if (ctx.stand === undefined) {
    try {
      if (!process.env.TEST_ENV?.trim() && !process.env.CLAUDE_CODE_SESSION_ID) {
        ctx.stand = { unknown: "no TEST_ENV and no session id" };
      } else {
        const { env, source } = ctx.lib.testEnvChoice("vcst");
        // Only the decision: masterValues false skips the scan of every suite and test-data file for password names.
        const values = ctx.lib.layered(env, { root: ROOT, masterValues: false }).env;
        ctx.stand = { env, source, master: ctx.lib.usesMaster(values), values };
      }
    } catch (e) {
      ctx.stand = { unknown: `its env files could not be layered: ${String(e?.message ?? e).split("\n")[0]}` };
    }
  }
  return ctx.stand;
}

/** The stand this session resolved, or null when it cannot be told. */
const knownStand = (ctx) => {
  const stand = sessionStand(ctx);
  return stand && !stand.unknown ? stand : null;
};

/** The block for the master password when this session's stand cannot be confirmed (`why`). */
const unconfirmed = (typed, why) =>
  `BLOCKED: ${typed} would send the master password to a stand this session cannot confirm (${why}).\n` +
  "The master password goes only to a master stand (PASSWORDS=master): fix that, then bind the session to one (npm run env:use -- <env>).";

/** The master password goes only to a stand that uses it. `name` is a hit in the file: MASTER_PASSWORD, or a name
 *  whose value is a copy of the master password (the file's or .env.playwright.master's). Blocked when this session's
 *  stand does not say PASSWORDS=master — unless its own value for the name is that same password — and when the
 *  stand cannot be confirmed; MASTER_PASSWORD also when the file's copy is not .env.playwright.master's. Without the
 *  libraries no master value can be read, so only MASTER_PASSWORD itself is blocked then. */
function masterReason(name, secrets, ctx) {
  if (!ctx.lib) return name === MASTER_NAME ? unconfirmed(MASTER_NAME, "the hook could not load the repo's env libraries: run npm ci") : null;
  const master = ctx.lib.readMaster({ root: ROOT }).value;
  const value = secrets.get(name);
  if (name !== MASTER_NAME && !(value && (value === master || value === secrets.get(MASTER_NAME)))) return null;
  const stand = sessionStand(ctx);
  if (!stand.unknown && name !== MASTER_NAME) {
    const split = ctx.envs ? ctx.lib.splitQualifiedName(name, ctx.envs) : null;
    if (split && split.env !== stand.env) return null; // another env's name: wrongEnvReason answers it
    if (stand.values[split ? split.name : name] === value) return null; // the stand's own password for it is the same
  }
  const typed = name === MASTER_NAME ? MASTER_NAME : `${name} (its value is the master password)`;
  if (stand.unknown || stand.source === "default") {
    return unconfirmed(typed, stand.unknown ?? `only the ${stand.env} default chose it: no TEST_ENV, binding or .env.test-env`);
  }
  if (!stand.master) {
    return (
      `BLOCKED: this session's stand ${stand.env} does not use the master password (its env files have no PASSWORDS=master),\n` +
      `so ${typed} would send it to ${stand.env}'s sign-in form. Type ${stand.env}'s own name: ` +
      (ctx.envs ? `NAME_${stand.env.toUpperCase()}.` : `the bare NAME, from a file generated for ${stand.env} (${resync(ctx)}, then reconnect the Playwright MCP servers in /mcp).`)
    );
  }
  if (name === MASTER_NAME && master && master !== value) {
    return (
      `BLOCKED: ${MASTER_NAME} in ${basename(ctx.file)} is out of date: .env.playwright.master holds a different one now.\n` +
      `The servers would type the old value. Run ${resync(ctx)}, then reconnect the Playwright MCP servers in /mcp.`
    );
  }
  return null;
}

/** On a single-env file generated for another env than this session's (its `generated-for` line): any name from it
 *  is that env's password. MASTER_PASSWORD is no env's, so masterReason decides it. Null when either env is unknown. */
function otherEnvFileReason(name, ctx) {
  if (ctx.envs || !ctx.stamp || name === MASTER_NAME) return null;
  const stand = knownStand(ctx);
  if (!stand || stand.env === ctx.stamp) return null;
  return (
    `BLOCKED: ${basename(ctx.file)} was generated for ${ctx.stamp}, and this session's env is ${stand.env}:\n` +
    `${name} there is ${ctx.stamp}'s password, so the lane would type it into ${stand.env}'s sign-in form.\n` +
    `Generate the file for ${stand.env} (npm run secrets:sync), then reconnect the Playwright MCP servers in /mcp —\n` +
    "or, for sessions on several envs, point --secrets at .env.playwright.all (npm run secrets:sync:all)."
  );
}

/** The form this file uses for a NAME it lacks: MASTER_PASSWORD on a master stand, the env-qualified names of a bare
 *  name on the combined file, the envs a qualified name could have used there, or the bare name on a single-env file. */
function nameHint(name, secrets, ctx) {
  const { envs, lib } = ctx;
  if (name === MASTER_NAME) {
    return `MASTER_PASSWORD is not in this --secrets file yet: ${resync(ctx)} copies it from .env.playwright.master` +
      `${ctx.envs ? "" : " (run on a master stand)"},\nthen reconnect the Playwright servers in /mcp.`;
  }
  const stand = knownStand(ctx);
  if (stand?.master) return `This session's stand ${stand.env} uses the master password (PASSWORDS=master): type ${MASTER_NAME} in every password field.`;
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

/** On the combined file: a NAME_<ENV> of another env than this session's. Null when the name is this session's,
 *  or when the session's env cannot be read (fail open). */
function wrongEnvReason(qualified, ctx) {
  const split = ctx.envs && ctx.lib ? ctx.lib.splitQualifiedName(qualified, ctx.envs) : null;
  const stand = split ? knownStand(ctx) : null;
  if (!split || !stand || split.env === stand.env) return null;
  const own = stand.master ? MASTER_NAME : `${split.name}_${stand.env.toUpperCase()}`;
  return (
    `BLOCKED: ${qualified} is ${split.env}'s password, and this session's env is ${stand.env}.\n` +
    `To sign in on ${stand.env}, type ${own}. To work on ${split.env}, bind the session to it first:\n` +
    `npm run env:use -- ${split.env} (a command's env argument does this at its Step 0).`
  );
}

/** On the combined file: a name whose value differs from its env's layered value now. No current value
 *  (the env files are not next to the secrets file) is not evidence of staleness — fail open. */
function staleReason(qualified, secrets, ctx) {
  const { envs, lib, file } = ctx;
  const split = envs && lib ? lib.splitQualifiedName(qualified, envs) : null;
  if (!split) return null;
  // A master stand types MASTER_PASSWORD; its NAME_<ENV> in the file is not its password, and a re-sync would only
  // write the same entry again. (The loader lets only a stand's own file make it a master stand, so this session and
  // secrets:sync:all agree on it; this answer stays in case they ever do not.)
  const stand = knownStand(ctx);
  if (stand?.master && stand.env === split.env) {
    return `BLOCKED: this session's stand ${stand.env} uses the master password (PASSWORDS=master): type ${MASTER_NAME}, not ${qualified}.`;
  }
  const now = lib.layeredEnv(split.env, { root: dirname(file) })[split.name];
  if (!now || now === secrets.get(qualified)) return null;
  return (
    `BLOCKED: ${qualified} in ${basename(file)} is out of date: env ${split.env} has a different ${split.name} now.\n` +
    `The servers would type the old value. Run ${resync(ctx)}, then reconnect the Playwright MCP servers in /mcp.`
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

  if (!secrets.has(typed)) return null;
  const reason = masterReason(typed, secrets, ctx) ?? otherEnvFileReason(typed, ctx)
    ?? wrongEnvReason(typed, ctx) ?? staleReason(typed, secrets, ctx);
  return reason ? contract(reason, ctx) : null;
}

try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  const toolName = event.tool_name ?? "";
  if (!/^mcp__playwright-[a-z]+__(browser_type|browser_fill_form)$/.test(toolName)) {
    process.exit(0);
  }

  const values = typedValues(toolName, event.tool_input);
  if (!values.length) process.exit(0);

  // The session's env binding is keyed by CLAUDE_CODE_SESSION_ID, which CLI and IDE hooks do not get: the id is in
  // the event (VCST-6091; scripts/kb/core/queue.mjs `hookEnv` does the same). The resolver reads the binding and
  // .env.test-env from the cwd, so resolve from the project root.
  const sid = typeof event.session_id === "string" && /^[A-Za-z0-9-]+$/.test(event.session_id) ? event.session_id : null;
  if (!process.env.CLAUDE_CODE_SESSION_ID && sid) process.env.CLAUDE_CODE_SESSION_ID = sid;
  try {
    process.chdir(ROOT);
  } catch {
    /* no such directory: resolve from the cwd */
  }

  const { file, text, map: secrets } = await loadSecrets();
  if (!secrets.size) process.exit(0);

  // The combined-file and master-stand helpers; without them (no node_modules yet) a combined file is checked as a
  // plain one and MASTER_PASSWORD as any other name.
  let lib = null;
  try {
    const [secretsLib, envCore, layers, resolver] = await Promise.all([
      import(new URL("../../scripts/lib/browser-secrets.mjs", import.meta.url).href),
      import(new URL("../../scripts/lib/env-core.js", import.meta.url).href),
      import(new URL("../../scripts/lib/env-layers.mjs", import.meta.url).href),
      import(new URL("../../scripts/lib/resolve-test-env.js", import.meta.url).href),
    ]);
    lib = {
      combinedEnvs: secretsLib.combinedEnvs, splitQualifiedName: secretsLib.splitQualifiedName, envStamp: secretsLib.ENV_STAMP,
      layeredEnv: envCore.layeredEnv, usesMaster: layers.usesMaster, readMaster: layers.readMaster, layered: layers.layered,
      testEnvChoice: resolver.testEnvChoice,
    };
  } catch {
    /* fail open on the combined-file checks only */
  }
  const envs = lib?.combinedEnvs(text) ?? null;
  // A single-env file's `# generated-for: TEST_ENV=<env>` line: the env whose passwords it holds.
  const ctx = { file, lib, envs, stamp: lib && !envs ? lib.envStamp.exec(text)?.[1] ?? null : null };

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
