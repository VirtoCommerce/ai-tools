/**
 * skills/project-init/lib/test-env-selector.mjs
 *
 * `.env.test-env` — the project's default environment, one dotenv line `TEST_ENV=<env>`. Every resolver
 * (vc-fix / vc-test / vc-init `scripts/lib/resolve-test-env.js`, the password bridge `lib/passwords.mjs`)
 * reads it after TEST_ENV and before the built-in `vcst`. A client project has no `.env.vcst`, so
 * without this file every command run without an env stops on `unknown env "vcst"`.
 *
 * Written by default-env.mjs (the /project-init step, which ASKS when several envs exist) or by a
 * stand-alone scaffold-env.mjs right after it creates `.env.<env>`, and only when ALL hold:
 *   - the file does not exist yet — an existing one is the developer's own choice and is never rewritten;
 *   - the choice is unambiguous: this env is the project's only one (an `.env.<x>` holding BACK_URL, so a
 *     framework's `.env.development` does not count), or the caller named it the default (`primary`);
 *   - git will not pick it up: it is not tracked, and inside a work tree it is ignored (the caller ran
 *     ensureProjectIgnores first, which lists it in SECRET_IGNORES).
 * It holds an env name and nothing else.
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { envFileNames, isGitTracked, readKey } from "./project-env.mjs";

export const SELECTOR_FILE = ".env.test-env";

/** The env a selector text names, or null, and whether its line carries dotenv's `export ` prefix — which
 *  the resolvers accept but lib/passwords.mjs currentEnv() (the Playwright lanes) does not. `[ \t]` and not
 *  `\s`, so an empty `TEST_ENV=` never takes its value from the next line. A UTF-8 BOM (Notepad, PowerShell
 *  5.1's Set-Content -Encoding UTF8) is dropped, as dotenv does; of several lines the LAST wins, as in dotenv. */
export function parseSelector(text) {
  const lines = [...String(text ?? "").replace(/^﻿/, "").matchAll(/^[ \t]*(export[ \t]+)?TEST_ENV[ \t]*=[ \t]*["']?([^"'\s#]*)/gm)];
  const m = lines[lines.length - 1];
  // lib/passwords.mjs currentEnv() takes the FIRST line, so two different values split commands and lanes.
  const conflict = new Set(lines.map((l) => l[2])).size > 1;
  return { env: m?.[2] || null, exported: !!m?.[1], conflict };
}

/** true inside a git work tree whose ignore rules cover `file`; false when it is in a work tree and NOT
 *  ignored; null outside git (no repository, or git not installed) — nothing there can commit it. */
function gitIgnored(root, file) {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: "ignore" });
  } catch {
    return null;
  }
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", "--", file], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** The project's environments: `.env.<x>` files that hold `BACK_URL` (every env onboarding writes does).
 *  A framework's own `.env.development` / `.env.production` in a Vite or Next repo holds none. */
export function ourEnvs(root) {
  return envFileNames(root).filter((n) => {
    try { return readKey(readFileSync(join(root, n), "utf-8"), "BACK_URL") !== null; } catch { return false; }
  }).map((n) => n.slice(".env.".length));
}

/** A production-looking env name (`prod`, `production`, `prd`, `live`, as a whole `_`-separated word). */
export const looksProduction = (env) => /(^|_)(prod|production|prd|live)\d*(_|$)/.test(env);

// Lower is preferred: a test stand before an acceptance one. Matched as a whole `_`-separated word.
const PREFERENCE = [["qa"], ["test"], ["dev", "develop", "development"], ["staging", "stage", "stg"]];
const UAT = ["uat", "acceptance", "preprod", "pre_prod"];
function rank(env) {
  const words = env.split("_");
  const at = PREFERENCE.findIndex((names) => names.some((n) => words.includes(n)));
  if (at >= 0) return at;
  return UAT.some((n) => words.includes(n) || env === n) ? PREFERENCE.length + 1 : PREFERENCE.length;
}

/**
 * The env /project-init offers first (Recommended) when several exist and none is the default, or null.
 * Never a production-looking one. On a host-governed project, an env the host keeps test-user slots for
 * (`withSlots(env)`, from lib/host-adapter.mjs hostEnvsOf + the profile's env map) goes first; then
 * qa / test / dev / staging before uat; ties keep the given order. Pure.
 */
export function recommendDefault(envs, { withSlots = () => false } = {}) {
  const candidates = envs.filter((e) => !looksProduction(e));
  if (!candidates.length) return null;
  const key = (e) => [withSlots(e) ? 0 : 1, rank(e), envs.indexOf(e)];
  return [...candidates].sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  })[0];
}

/** What an existing selector names, and why it names nothing a resolver can use (`problem`), if so. Never
 *  rewritten — a broken file is reported, so a project that still falls back to vcst says why. */
function inspectSelector(root, path) {
  let raw;
  try { raw = readFileSync(path); } catch { return { env: null, problem: "unreadable" }; }
  // UTF-16 (Windows PowerShell 5.1's `>`): a BOM or NUL bytes. dotenv reads no key from it.
  if ((raw[0] === 0xff && raw[1] === 0xfe) || (raw[0] === 0xfe && raw[1] === 0xff) || raw.includes(0)) return { env: null, problem: "utf16" };
  const { env, exported, conflict } = parseSelector(raw.toString("utf-8"));
  if (!env) return { env: null, problem: "no-env" };
  // An env may live in a QA_ENV_PATH folder instead, so this one is a warning, not a verdict. Checked before
  // `export`: that message says commands use the env, which is false when its file is missing.
  if (!existsSync(join(root, `.env.${env}`))) return { env, problem: "no-env-file" };
  if (exported) return { env, problem: "exported" };
  if (conflict) return { env, problem: "conflict" };
  return { env };
}

/**
 * Write `.env.test-env` for `env` when that is safe and unambiguous. Never throws on a write failure — the
 * project still works with an explicit env argument, so it is reported as `skipped`.
 *
 * @param {string} root  the project directory
 * @param {string} env   the env scaffold-env just wrote
 * @param {{ primary?: boolean, dryRun?: boolean, tracked?: Function, ignored?: Function }} [opts]
 * @returns {{ status: "written"|"kept"|"skipped", env: string|null, reason?: string, envs?: string[] }}
 */
export function ensureTestEnvSelector(root, env, { primary = false, dryRun = false, tracked = isGitTracked, ignored = gitIgnored } = {}) {
  const path = join(root, SELECTOR_FILE);
  if (existsSync(path)) return { status: "kept", ...inspectSelector(root, path) };
  const envs = ourEnvs(root);
  if (!envs.includes(env)) envs.push(env);
  if (envs.length > 1 && !primary) return { status: "skipped", env: null, reason: "several-envs", envs: envs.sort() };
  if (tracked(root, SELECTOR_FILE)) return { status: "skipped", env: null, reason: "tracked" };
  if (ignored(root, SELECTOR_FILE) === false) return { status: "skipped", env: null, reason: "not-ignored" };
  if (dryRun) return { status: "written", env };
  try {
    writeFileSync(path, `TEST_ENV=${env}\n`);
  } catch (e) {
    return { status: "skipped", env: null, reason: `write failed: ${e.message}` };
  }
  return { status: "written", env };
}

/**
 * The operator-facing lines for a result (no `[script]` prefix). `env` is the env just scaffolded. On a
 * host-governed project (lib/governance.mjs isHostGoverned) the browser servers and their passwords are the
 * host's and never read this file, so nothing is said about restarting for them.
 */
export function describeSelector(result, env, { hostGoverned = false } = {}) {
  const switchHow = `to switch, edit ${SELECTOR_FILE} (TEST_ENV=<env>) or pass the env to the command (e.g. /vc-test:qa-ticket <TICKET> <env>)` +
    (hostGoverned ? "" : `; restart Claude Code after a switch — the Playwright lanes pick their env's passwords from ${SELECTOR_FILE} when the MCP servers start`);
  // Our lanes (lib/passwords.mjs currentEnv) read the file's FIRST line and no `export` line; a host's do not read it.
  if (hostGoverned && result.problem === "exported") result = { ...result, problem: undefined };
  switch (result.status) {
    case "written":
      return [`${SELECTOR_FILE}: written (TEST_ENV=${result.env}) — commands run without an env use ${result.env}`];
    case "kept": {
      const fix = `rewrite it as the one line TEST_ENV=<env>, saved as UTF-8`;
      const problem = {
        unreadable: `it cannot be read — ${fix}`,
        utf16: `it is UTF-16 (Windows PowerShell 5.1's >), which no resolver reads, so commands fall back to vcst — ${fix}`,
        "no-env": `it names no TEST_ENV, so commands fall back to vcst — ${fix}`,
        conflict: `it has several TEST_ENV lines with different values: commands use the last (${result.env})${hostGoverned ? "" : ", the Playwright lanes the first"} — ${fix}`,
        exported: `its line starts with "export": commands use ${result.env}, but the Playwright lanes do not read it (they take the only declared env, else vcst) — drop "export"`,
        "no-env-file": `there is no .env.${result.env} here — fine if it is in a QA_ENV_PATH folder, else ${fix}`,
      }[result.problem];
      if (problem) return [`${SELECTOR_FILE}: kept, but ${problem}`];
      return [
        `${SELECTOR_FILE}: kept (TEST_ENV=${result.env})`,
        ...(!env || result.env === env ? [] : [`  ${env} is not the default — ${switchHow}`]),
      ];
    }
    default: {
      // Never a shell redirect (Windows PowerShell 5.1's `>` writes UTF-16, which no resolver reads), and never
      // a scaffold-env re-run (it would need the project's --tracker / --client-vcs to add nothing wrong).
      const create = `create ${SELECTOR_FILE} with the one line TEST_ENV=<env>, saved as UTF-8`;
      const [why, then] = {
        "several-envs": [`several environments (${(result.envs || []).join(", ")}) and none chosen as the default`, `to choose one, ${create}`],
        // Reached only when the file is absent: git tracks it, the checkout lost it.
        tracked: [`git tracks ${SELECTOR_FILE}, but it is missing here`, `restore the team's default with git checkout -- ${SELECTOR_FILE}, or untrack it (git rm --cached ${SELECTOR_FILE}, commit) and ${create}`],
        "not-ignored": [`.gitignore does not cover ${SELECTOR_FILE}`, `add ${SELECTOR_FILE} to .gitignore, then ${create}`],
      }[result.reason] || [result.reason, create];
      return [`${SELECTOR_FILE}: skipped (${why}) — ${then}`];
    }
  }
}
