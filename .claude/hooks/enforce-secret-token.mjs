#!/usr/bin/env node
// PreToolUse hook — makes a Playwright MCP secret MISS loud instead of silent.
//
// Playwright MCP substitutes a secret only when the typed text is a WHOLE-VALUE EXACT MATCH against a name it was
// started with (`lookupSecret()` in playwright-core; verified against @playwright/mcp 0.0.80). On a miss it returns
// the input UNCHANGED with no error, so the literal string lands in the field and the only symptom is the site's
// generic "Login attempt failed" — which reads exactly like a wrong password. That silent failure cost a whole run on
// 2026-09-09 (see .claude/knowledge/domain/mobile-navigation.md §10).
//
// A lane starts through scripts/lanes/playwright-lane.mjs, which hands it every non-production env's passwords from
// the test-account store (test-accounts.local.json) as NAME_<ENV>, plus MASTER_PASSWORD, and leaves a manifest of the
// names it holds (.vc-fix/lanes/<lane>-<pid>.json: names + salted fingerprints, no value; scripts/lib/browser-secrets.mjs).
//
// This hook blocks the ways to get a miss, before the keystroke happens:
//   1. `{{KEY}}` / `${KEY}` / `%KEY%` — the repo's own test-data token syntax (.claude/rules/test-data.md), which
//      does NOT apply to a lane.
//   2. A plaintext value that matches a password the lanes hold — an actual leak into the transcript.
//   3. A credential-shaped KEY NAME the lane does not hold (typo, a bare name, a wrong env suffix) — it would be
//      typed literally. The message names the form the lane uses.
//   4. A name whose value changed in the store after the lane started — the lane would type the old password.
//      Reconnect the lane.
//   5. The master password (the one password of every PASSWORDS=master stand, scripts/lib/env-layers.mjs) when this
//      session's stand is not a master stand — MASTER_PASSWORD, and any name whose value is a copy of it unless the
//      stand's own value for that name is the same. Also when the stand cannot be confirmed: no TEST_ENV and no
//      session id, only the vcst default chose it, its env files could not be layered, or the hook could not load the
//      repo's env libraries (then MASTER_PASSWORD only: the name needs no library). A name the lane lacks on a master
//      stand is answered with "type MASTER_PASSWORD".
//   6. A NAME_<ENV> of another env than this session's (TEST_ENV, its binding, .env.test-env, vcst): a sign-in on the
//      wrong stand, or a page/prompt asking for another stand's password. CLI and IDE hooks start without
//      CLAUDE_CODE_SESSION_ID (VCST-6091), so the session id comes from the event, and the binding is read from the
//      project root.
//   7. A lane that was not started by the launcher (no manifest): it holds no store password — `npm run creds:migrate`
//      points .mcp.json at the launcher.
//
// Rule source: .claude/knowledge/execution/browser-lanes.md §Browser login secrets.
// Fails OPEN on any error — a hook bug must never block legitimate work — except for the master password (item 5),
// which goes nowhere this hook cannot confirm.

import { readFileSync } from "node:fs";

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const MASTER_NAME = "MASTER_PASSWORD";
const RECONNECT = "reconnect the playwright-* lanes in /mcp (never while a run has browser suites in flight)";

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
  return (
    `${extra}\n\n` +
    "How a Playwright lane's passwords work:\n" +
    "  - Type the NAME with the env under test: NAME_<ENV>, e.g. browser_type(text=\"ORG_USER_PASSWORD_VCPTCORE_DEV\")\n" +
    "    (ENV = the run's TEST_ENV upper-cased)." +
    (ctx.envs?.length ? ` This lane holds: ${ctx.envs.join(", ")}.\n` : "\n") +
    "  - On a master stand (PASSWORDS=master in its env file) every password field takes\n" +
    "    MASTER_PASSWORD, whatever account signs in.\n" +
    "  - Whole-value exact match only. No {{}}, no $VAR, no interpolation inside\n" +
    "    a longer string. The repo's {{VAR}} test-data convention does NOT apply here.\n" +
    "  - A miss is SILENT: the literal string is typed and the form just says\n" +
    "    \"Login attempt failed\". Never diagnose that from the login error.\n" +
    "  - Confirm the hit in the same call: the response's \"Ran Playwright code\"\n" +
    "    line reads fill(process.env['NAME']) on a hit, fill('NAME') on a miss.\n" +
    "  - The values come from test-accounts.local.json; a lane reads it when it starts.\n" +
    "  - Chrome DevTools MCP holds no password. On that lane the brief must name\n" +
    "    its auth path instead.\n\n" +
    "Contract: .claude/knowledge/execution/browser-lanes.md §Browser login secrets"
  );
}

/** This session's stand: the env it resolves (TEST_ENV, its binding, .env.test-env, vcst), what chose it, its values
 *  layered with its run's ticket, and whether it says PASSWORDS=master. `{ unknown: why }` when it cannot be told. */
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

const knownStand = (ctx) => {
  const stand = sessionStand(ctx);
  return stand && !stand.unknown ? stand : null;
};

const unconfirmed = (typed, why) =>
  `BLOCKED: ${typed} would send the master password to a stand this session cannot confirm (${why}).\n` +
  "The master password goes only to a master stand (PASSWORDS=master): fix that, then bind the session to one (npm run env:use -- <env>).";

/** The master password goes only to a stand that uses it (see the head of this file, item 5). */
function masterReason(name, ctx) {
  if (!ctx.lib) return name === MASTER_NAME ? unconfirmed(MASTER_NAME, "the hook could not load the repo's env libraries: run npm ci") : null;
  const master = ctx.secrets.get(MASTER_NAME);
  const value = ctx.secrets.get(name);
  if (name !== MASTER_NAME && !(value && master && value === master)) return null;
  const stand = sessionStand(ctx);
  if (!stand.unknown && name !== MASTER_NAME) {
    const split = ctx.lib.splitQualifiedName(name, ctx.envs);
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
      `so ${typed} would send it to ${stand.env}'s sign-in form. Type ${stand.env}'s own name: NAME_${stand.env.toUpperCase()}.`
    );
  }
  return null;
}

/** The form the lane uses for a NAME it lacks. */
function nameHint(name, ctx) {
  if (name === MASTER_NAME) return `This lane holds no ${MASTER_NAME}: add "master" to test-accounts.local.json, then ${RECONNECT}.`;
  const stand = knownStand(ctx);
  if (stand?.master) return `This session's stand ${stand.env} uses the master password (PASSWORDS=master): type ${MASTER_NAME} in every password field.`;
  const keys = [...ctx.registered];
  const variants = keys.filter((k) => ctx.lib.splitQualifiedName(k, ctx.envs)?.name === name);
  if (variants.length) {
    const own = stand ? `${name}_${stand.env.toUpperCase()}` : `${name}_<ENV>`;
    return `The lane names every password with its env. Type ${own}.\nIt has: ${variants.slice(0, 8).join(", ")}${variants.length > 8 ? ", …" : ""}`;
  }
  const base = keys.map((k) => ctx.lib.splitQualifiedName(k, ctx.envs)?.name)
    .filter((b) => b && name.startsWith(`${b}_`))
    .sort((a, b) => b.length - a.length)[0];
  if (base) {
    return `The lane has no ${name.slice(base.length)} entry for ${base}; it holds: ${ctx.envs.join(", ")}.\n` +
      `Add that env's account to test-accounts.local.json (envs.<env>.accounts), then ${RECONNECT}.`;
  }
  if (ctx.drift?.absent.includes(name)) return `${name} was added to the store after this lane started: ${RECONNECT}.`;
  return null;
}

function nearMatches(name, ctx) {
  const stem = name.slice(0, Math.max(6, name.indexOf("_") + 1));
  const near = [...ctx.registered].filter((k) => k.startsWith(stem)).slice(0, 6);
  return near.length ? `Names that start similarly: ${near.join(", ")}` : "Check the name against test-accounts.local.json (npm run creds:check).";
}

/** A NAME_<ENV> of another env than this session's. Null when it is this session's, or the env cannot be read. */
function wrongEnvReason(qualified, ctx) {
  const split = ctx.lib ? ctx.lib.splitQualifiedName(qualified, ctx.envs) : null;
  const stand = split ? knownStand(ctx) : null;
  if (!split || !stand || split.env === stand.env) return null;
  const own = stand.master ? MASTER_NAME : `${split.name}_${stand.env.toUpperCase()}`;
  return (
    `BLOCKED: ${qualified} is ${split.env}'s password, and this session's env is ${stand.env}.\n` +
    `To sign in on ${stand.env}, type ${own}. To work on ${split.env}, bind the session to it first:\n` +
    `npm run env:use -- ${split.env} (a command's env argument does this at its Step 0).`
  );
}

/** A name whose value changed in the store after the lane started, on a master stand the wrong form. */
function staleReason(qualified, ctx) {
  const split = ctx.lib.splitQualifiedName(qualified, ctx.envs);
  const stand = knownStand(ctx);
  if (split && stand?.master && stand.env === split.env) {
    return `BLOCKED: this session's stand ${stand.env} uses the master password (PASSWORDS=master): type ${MASTER_NAME}, not ${qualified}.`;
  }
  if (!ctx.drift?.stale.includes(qualified)) return null;
  return `BLOCKED: ${qualified} changed in test-accounts.local.json after this lane started — it would type the old value.\n` +
    `${RECONNECT[0].toUpperCase()}${RECONNECT.slice(1)}.`;
}

function check(value, ctx) {
  const ph = PLACEHOLDER.exec(value);
  if (ph) {
    const name = ph[1] ?? ph[2] ?? ph[3];
    return contract(
      `BLOCKED: "${value}" is a placeholder, not a secret reference.\n` +
        (ctx.registered.has(name)
          ? `"${name}" IS a name the lane holds — type it bare, without the braces.`
          : nameHint(name, ctx) ?? `"${name}" is also not a name the lane holds; check the name and env suffix.`),
      ctx,
    );
  }

  for (const [name, secret] of ctx.secrets) {
    if (secret && value === secret) {
      return contract(
        `BLOCKED: that is the PLAINTEXT value of ${name}.\n` +
          "Typing it directly puts the credential in the transcript — which is exactly\n" +
          `what the lane's names exist to prevent. Type the name ${name} instead.`,
        ctx,
      );
    }
  }

  const typed = value.trim();
  if (KEY_SHAPED.test(typed) && CREDENTIAL_WORD.test(typed) && !ctx.registered.has(typed)) {
    return contract(
      `BLOCKED: "${typed}" is not a name this lane holds, so it would be\n` +
        "typed into the page LITERALLY and the sign-in would fail with no error.\n" +
        (nameHint(typed, ctx) ?? nearMatches(typed, ctx)),
      ctx,
    );
  }

  if (!ctx.registered.has(typed)) return null;
  const reason = masterReason(typed, ctx) ?? wrongEnvReason(typed, ctx) ?? staleReason(typed, ctx);
  return reason ? contract(reason, ctx) : null;
}

try {
  const event = JSON.parse(readFileSync(0, "utf8"));
  const toolName = event.tool_name ?? "";
  if (!/^mcp__playwright-[a-z]+__(browser_type|browser_fill_form)$/.test(toolName)) process.exit(0);
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

  let lib = null;
  try {
    const [secretsLib, layers, resolver] = await Promise.all([
      import(new URL("../../scripts/lib/browser-secrets.mjs", import.meta.url).href),
      import(new URL("../../scripts/lib/env-layers.mjs", import.meta.url).href),
      import(new URL("../../scripts/lib/resolve-test-env.js", import.meta.url).href),
    ]);
    lib = {
      laneSecrets: secretsLib.laneSecrets, readLaneManifests: secretsLib.readLaneManifests, laneDrift: secretsLib.laneDrift,
      splitQualifiedName: secretsLib.splitQualifiedName, usesMaster: layers.usesMaster, layered: layers.layered,
      testEnvChoice: resolver.testEnvChoice,
    };
  } catch {
    /* without the libraries only MASTER_PASSWORD is checked */
  }
  if (!lib) {
    for (const v of values) if (v.trim() === MASTER_NAME) {
      process.stdout.write(JSON.stringify({ decision: "block", reason: unconfirmed(MASTER_NAME, "the hook could not load the repo's env libraries: run npm ci") }));
      process.exit(0);
    }
    process.exit(0);
  }

  const lane = toolName.split("__")[1];
  const manifests = lib.readLaneManifests(ROOT, lane);
  if (!manifests.length) {
    const named = values.map((v) => v.trim()).find((v) => KEY_SHAPED.test(v) && CREDENTIAL_WORD.test(v));
    if (named) {
      process.stdout.write(JSON.stringify({ decision: "block", reason:
        `BLOCKED: ${lane} was not started by scripts/lanes/playwright-lane.mjs, so it holds no password from test-accounts.local.json — "${named}" would be typed literally.\n` +
        `Run npm run creds:migrate (it points .mcp.json's playwright-* lanes at the launcher), then ${RECONNECT}.` }));
    }
    process.exit(0);
  }
  // Several sessions may run this lane at once: a name is held when any of them holds it, and stale only when every
  // one that holds it holds an old value.
  const registered = new Set(manifests.flatMap((m) => Object.keys(m.names)));
  const laneEnvs = [...new Set(manifests.flatMap((m) => m.envs ?? []))];
  // Only the names the running lanes hold — deriving every name from the suite CSVs costs ~350 ms per keystroke call.
  const bases = new Set([...registered].map((n) => lib.splitQualifiedName(n, laneEnvs)?.name).filter(Boolean));
  let current;
  try {
    current = lib.laneSecrets(ROOT, { names: bases }).secrets;
  } catch (e) {
    // An unreadable store (malformed, an older format) leaves nothing to compare with — but the master password still
    // goes nowhere this hook cannot confirm (item 5).
    const why = `test-accounts.local.json could not be read: ${String(e?.message ?? e).split("\n")[0]}`;
    for (const v of values) if (v.trim() === MASTER_NAME) {
      process.stdout.write(JSON.stringify({ decision: "block", reason: unconfirmed(MASTER_NAME, why) }));
      process.exit(0);
    }
    process.stderr.write(`enforce-secret-token: ${why} — only MASTER_PASSWORD is checked\n`);
    process.exit(0);
  }
  const drifts = manifests.map((m) => lib.laneDrift(m, current));
  const drift = {
    stale: [...registered].filter((n) => manifests.every((m, i) => !(n in m.names) || drifts[i].stale.includes(n))),
    absent: drifts.reduce((acc, d) => acc.filter((n) => d.absent.includes(n)), drifts[0].absent),
  };
  const envs = [...new Set(manifests.flatMap((m) => m.envs ?? []))].sort();
  const secrets = new Map([...current].filter(([n]) => registered.has(n) || n === MASTER_NAME));
  const ctx = { lib, envs, registered, secrets, drift };

  for (const v of values) {
    const reason = check(v, ctx);
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
