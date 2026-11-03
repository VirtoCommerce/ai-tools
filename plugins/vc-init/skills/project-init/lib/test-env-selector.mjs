/**
 * skills/project-init/lib/test-env-selector.mjs
 *
 * `.env.test-env` — the project's default environment, one dotenv line `TEST_ENV=<env>`. Every resolver
 * (vc-fix / vc-test / vc-init `scripts/lib/resolve-test-env.js`, the password bridge `lib/passwords.mjs`)
 * reads it after TEST_ENV and before the built-in `vcst`. A client project has no `.env.vcst`, so
 * without this file every command run without an env stops on `unknown env "vcst"`.
 *
 * Written by scaffold-env.mjs right after it creates `.env.<env>`, and only when ALL hold:
 *   - the file does not exist yet — an existing one is the developer's own choice and is never rewritten;
 *   - the choice is unambiguous: this env is the only `.env.<env>` in the project, or the caller named
 *     it the default (`primary`);
 *   - git will not pick it up: it is not tracked, and inside a work tree it is ignored (the caller ran
 *     ensureProjectIgnores first, which lists it in SECRET_IGNORES).
 * It holds an env name and nothing else.
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { envFileNames, isGitTracked } from "./project-env.mjs";

export const SELECTOR_FILE = ".env.test-env";

/** The env a selector text names, or null — the same line shape lib/passwords.mjs currentEnv() reads. */
export function selectedEnv(text) {
  return /^\s*TEST_ENV\s*=\s*["']?([^"'\s#]+)/m.exec(String(text ?? ""))?.[1] ?? null;
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
  if (existsSync(path)) {
    let text = "";
    try { text = readFileSync(path, "utf-8"); } catch { /* unreadable — still never overwritten */ }
    return { status: "kept", env: selectedEnv(text) };
  }
  const envs = envFileNames(root).map((n) => n.slice(".env.".length));
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

/** The operator-facing lines for a result (no `[script]` prefix). `env` is the env just scaffolded. */
export function describeSelector(result, env) {
  const switchHow = `to switch, edit ${SELECTOR_FILE} (TEST_ENV=<env>) or pass the env to the command (e.g. /vc-test:qa-ticket <TICKET> <env>); restart Claude Code after a switch — the Playwright lanes pick their env's passwords from ${SELECTOR_FILE} when the MCP servers start`;
  switch (result.status) {
    case "written":
      return [`${SELECTOR_FILE}: written (TEST_ENV=${result.env}) — commands run without an env use ${result.env}`];
    case "kept":
      return [
        `${SELECTOR_FILE}: kept (TEST_ENV=${result.env ?? "?"})`,
        ...(result.env === env ? [] : [`  ${env} is not the default — ${switchHow}`]),
      ];
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
