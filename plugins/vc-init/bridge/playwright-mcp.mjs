/**
 * bridge/playwright-mcp.mjs — a Playwright MCP lane whose login passwords never touch a file.
 *
 * A browser agent types a password's NAME (`browser_type(text="ADMIN_PASSWORD")`) and Playwright MCP
 * types the value and masks it in every tool response. Playwright MCP takes those secrets only as a
 * dotenv FILE (`--secrets`, `PLAYWRIGHT_MCP_SECRETS_FILE`) or as `config.secrets` — so this runs the
 * pinned package's own CLI in this process and hands it `config.secrets` from memory.
 *
 * Where the passwords come from, lowest first (each later source wins a name it also has):
 *   - the project's test-account store, `test-accounts.local.json` (scripts/lib/test-accounts.mjs) — the default
 *     since vc-init 0.8.0: every env's passwords as `NAME_<ENV>`, and the lane's env's as the bare `NAME`, plus
 *     `MASTER_PASSWORD`. Started straight from `.mcp.json`:
 *       npx -y -p @playwright/mcp@<pin> node ${VC_RUN} --playwright @playwright/mcp@<pin> <lane CLI args>
 *   - a project that has not moved to the store yet: its `.env.local` passwords for the lane's env;
 *   - option B (skills/project-init/lib/passwords.mjs): the vc-secrets server `playwright-<lane>.<env>`, declared by
 *     write-secrets-decl.mjs, runs the same command with `--vc-env <env>` and that env's vc-secrets passwords in its
 *     environment (`ADMIN_PASSWORD: secret:admin-password-<env>`, …).
 * The lane's env is `--vc-env`, else TEST_ENV, .env.test-env, `vcst`. Everything ends up only in this process's memory
 * — no `.env.playwright.local` is generated. An agent types the bare NAME for the lane's env, or NAME_<ENV>.
 * npx installs the pinned package and puts its `.bin` on PATH; the shim hands over to this file; this
 * file finds the package through PATH, checks its version against the pin, takes every `*PASSWORD` out
 * of the environment (the browser it starts inherits none) and runs the CLI exactly as
 * `@playwright/mcp/cli.js` does, with one addition: a `preAction` hook sets the `secrets` option, which
 * the CLI's config resolution maps to `config.secrets`. Every other flag (`--config`, `--output-dir`,
 * `--isolated`, …) keeps its CLI meaning.
 *
 *   Verified 2026-10-20 on 0.0.77 (Windows, Edge): the field received the value, the `browser_type`
 *   response read `fill(process.env['ADMIN_PASSWORD'])`, and a `browser_evaluate` returning the field
 *   printed `<secret>ADMIN_PASSWORD</secret>` — no value in any response, no file anywhere.
 *
 * A `--secrets` argument and PLAYWRIGHT_MCP_SECRETS_FILE are refused / dropped: they would put a file
 * back. Playwright MCP masks a typed password in its responses, not in the HAR the lane's `recordHar`
 * writes — the sign-in request's body holds the value — so this process, the one place that knows the
 * values, keeps that HAR's directory scrubbed (bridge/har-scrub.mjs): at start, after every HAR write
 * and at exit. The IPv4-first DNS hint gen-mcp gives the other servers through NODE_OPTIONS (#220) is set here
 * in-process, because vc-secrets refuses a NODE_OPTIONS key in a declaration.
 */
import dns from "node:dns";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, join } from "node:path";
import { readdirSync } from "node:fs";
import { ENV_NAME_RE, currentEnv, envFilePasswords, isPasswordName } from "../skills/project-init/lib/passwords.mjs";
import { readStore, storeValues } from "../scripts/lib/test-accounts.mjs";

/** The envs a project names: every `.env.<env>` file in its root. Pure-ish (one directory read). */
export function projectEnvs(root, { list = readdirSync } = {}) {
  const NOT_AN_ENV = new Set(["local", "defaults", "backup", "master", "example", "template"]);
  let names = [];
  try { names = list(root); } catch { return []; }
  return names.map((f) => /^\.env\.([a-z0-9_]+)$/.exec(f)?.[1]).filter((e) => e && !NOT_AN_ENV.has(e) && e !== "test");
}

/**
 * The passwords a lane takes from the test-account store: every env's (the store's own envs and the project's
 * `.env.<env>` ones) as NAME_<ENV>, the lane's env's also as the bare NAME, and MASTER_PASSWORD. Passwords only —
 * a login is no secret. Empty without a store. Throws the store's own error on a malformed file.
 */
export function storeLaneSecrets(root, env, { read = readStore, envs = projectEnvs } = {}) {
  const store = read(root);
  if (!store.exists) return {};
  const out = {};
  const passwordsOf = (e) => Object.entries(storeValues(store, e).values).filter(([k, v]) => v && isPasswordName(k));
  for (const e of new Set([...Object.keys(store.envs), ...envs(root)])) {
    for (const [k, v] of passwordsOf(e)) out[`${k}_${e.toUpperCase()}`] = v;
  }
  for (const [k, v] of passwordsOf(env)) out[k] = v;
  if (store.master) out.MASTER_PASSWORD = store.master;
  return out;
}
import { configArg, configHarPath, watchHarDirs } from "./har-scrub.mjs";

const SPEC_RE = /^@playwright\/mcp@(\d+\.\d+\.\d+(?:-[\w.]+)?)$/;

/** The pinned version of an `@playwright/mcp@<x.y.z>` spec, or null. Pure. */
export function pinnedVersion(spec) {
  return SPEC_RE.exec(String(spec || ""))?.[1] ?? null;
}

/**
 * Split the environment: the passwords to hand Playwright MCP, and the environment to keep. Every key
 * that mentions PASSWORD leaves the environment, suffixed ones (another env's) included; only bare
 * password names with a value become secrets. Pure.
 * @returns {{ secrets: Record<string,string>, env: Record<string,string>, dropped: string[] }}
 */
export function takePasswords(source) {
  const secrets = {};
  const env = {};
  const dropped = [];
  for (const [k, v] of Object.entries(source || {})) {
    if (/PASSWORD/i.test(k) || k.toUpperCase() === "PLAYWRIGHT_MCP_SECRETS_FILE") {
      dropped.push(k);
      if (isPasswordName(k) && typeof v === "string" && v.length) secrets[k] = v;
      continue;
    }
    env[k] = v;
  }
  return { secrets, env, dropped };
}

/**
 * The installed `@playwright/mcp` of exactly `version`, found through PATH: npx puts
 * `<cache>/node_modules/.bin` there, and the package sits at `.bin/../@playwright/mcp`. First match in
 * PATH order — npx prepends its own. Returns the package directory or null.
 */
export function findPackage(pathValue, version, { exists = existsSync, read = (p) => readFileSync(p, "utf8") } = {}) {
  for (const dir of String(pathValue || "").split(delimiter).filter(Boolean)) {
    const pkg = join(dir, "..", "@playwright", "mcp");
    const manifest = join(pkg, "package.json");
    if (!exists(manifest)) continue;
    try {
      if (JSON.parse(read(manifest)).version === version) return pkg;
    } catch {
      /* not a readable manifest — keep looking */
    }
  }
  return null;
}

/** Why these CLI args may not run here, or null. Pure. */
export function refusal(args) {
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string")) return "arguments must be strings";
  if (args.some((a) => a === "--secrets" || a.startsWith("--secrets="))) return "--secrets names a password file; the passwords come from vc-secrets here";
  if (args.some((a) => a === "--port" || a.startsWith("--port="))) return "--port would serve this lane over HTTP; it runs on stdio only";
  return null;
}

function say(message) {
  process.stderr.write(`vc-run playwright: ${message}\n`);
}

/**
 * Run the lane. `argv` = [<spec>, ...CLI args]. Resolves once the server is up (it then lives on stdin).
 * @returns {Promise<number|undefined>}  an exit code when it could not start, else undefined
 */
export async function runPlaywrightMcp(argv) {
  const [spec, ...args] = argv;
  const version = pinnedVersion(spec);
  if (!version) {
    say(`the first argument must be the pinned package (@playwright/mcp@x.y.z), got ${JSON.stringify(spec)}`);
    return 64;
  }
  let env = null;
  if (args[0] === "--vc-env") {
    env = args[1];
    args.splice(0, 2);
    if (!ENV_NAME_RE.test(String(env || ""))) {
      say(`--vc-env needs an environment name ([a-z0-9_]+), got ${JSON.stringify(env)}`);
      return 64;
    }
  }
  const why = refusal(args);
  if (why) {
    say(`refused — ${why}`);
    return 64;
  }
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") || "PATH";
  const pkg = findPackage(process.env[pathKey], version);
  if (!pkg) {
    say(`@playwright/mcp@${version} is not on PATH — start this through npx -p @playwright/mcp@${version} (the vc-secrets declaration does)`);
    return 69;
  }
  const { secrets: fromVcSecrets, dropped } = takePasswords(process.env);
  for (const k of dropped) delete process.env[k];
  // The lane's env: --vc-env (a vc-secrets server's), else what the session resolves.
  const root = process.cwd();
  const laneEnv = env || currentEnv(root);
  let fromStore;
  try {
    fromStore = storeLaneSecrets(root, laneEnv);
  } catch (e) {
    say(`cannot read the test-account store: ${e?.message || e}`);
    return 78;
  }
  // A project that has not moved to the store keeps passwords in .env.local; the store beats it, vc-secrets beats both.
  let fromFile = {};
  try {
    fromFile = envFilePasswords(readFileSync(join(root, ".env.local"), "utf8"), laneEnv);
  } catch {
    /* no .env.local */
  }
  const secrets = { ...fromFile, ...fromStore, ...fromVcSecrets };
  if (!Object.keys(secrets).length) say("started without a password — the agent cannot log in on this lane: fill test-accounts.local.json (or, for vc-secrets lanes, vc-secrets doctor)");
  return startPlaywrightMcp({ pkg, version, args, secrets, say });
}

/**
 * Start the pinned package's own CLI in this process with `secrets` ({ NAME: value }) as `config.secrets`, keeping the
 * lane's HAR scrubbed of their values. Shared by `runPlaywrightMcp` (vc-secrets) and a project's own launcher that
 * reads its passwords elsewhere (ai-tools: scripts/lanes/playwright-lane.mjs, the test-account store). `pkg`: the
 * package directory (`findPackage`); `args` must pass `refusal`. Resolves once the server is up.
 * @returns {Promise<undefined>}
 */
export async function startPlaywrightMcp({ pkg, version, args, secrets, say: tell = say }) {
  // The lane's HAR holds the sign-in request: take the values (and any password-named field) out of it.
  const har = configHarPath(configArg(args) || "", process.cwd());
  if (har) {
    watchHarDirs([har], {
      secrets: Object.values(secrets),
      onResult: (file, r) => {
        if (r.status === "scrubbed") tell(`masked ${r.masked} secret value(s) in ${file}`);
        else if (r.status === "error") tell(`could not scrub ${file}: ${r.error}`);
      },
    });
  }
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch {
    /* Node without the API — the default order is fine */
  }
  // The package's own cli.js, plus the hook. Resolved from the package so it gets ITS playwright-core.
  const req = createRequire(join(pkg, "package.json"));
  const { program } = req("playwright-core/lib/utilsBundle");
  const { tools } = req("playwright-core/lib/coreBundle");
  const p = program.version(`Version ${version}`).name("Playwright MCP");
  tools.decorateMCPCommand(p, version);
  p.hook("preAction", (cmd) => {
    cmd.setOptionValue("secrets", secrets);
  });
  await program.parseAsync([process.argv[0], "playwright-mcp", ...args]);
  return undefined;
}
