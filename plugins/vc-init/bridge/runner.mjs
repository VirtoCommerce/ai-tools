/**
 * bridge/runner.mjs — the rules of the `runner` bridge tool (vc-test U32, B10).
 *
 *   node "$VC_RUN" runner playwright <a.spec.ts> [<b.spec.ts> …]   playwright test, the pinned config
 *   node "$VC_RUN" runner node <check.mjs> [args…]                  a node check script
 *
 * It is the first bridge tool that runs code no plugin ships — agent-written `.spec` files and check
 * scripts — so it is held tighter than the others. Its group, `runner`, receives the current env's
 * TEST-USER PASSWORDS and never a tracker or host token. It runs only for an environment the profile's
 * `test` block lists, only files inside the block's `scriptRoots` (checked after realpath, so a link
 * cannot lead out), and with a fixed argv: no flag of the runner's own, no node option, no config the
 * caller picks. Residual risk, accepted by the design (B10): a script can read its own environment;
 * that is a non-production test-user password a browser lane can already type.
 *
 * Every function here is pure or reads the file system only.
 */
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const ok = () => ({ ok: true, reason: "" });
const no = (reason) => ({ ok: false, reason });
const USAGE = "runner runs `playwright <spec file…>` or `node <script.mjs|.js> [args…]`";
const SPEC_RE = /\.spec\.(ts|mjs|js)$/;
const SCRIPT_RE = /\.(mjs|js)$/;

/** The command line's shape, with no file system: the mode, then files only (playwright) or one script. */
export function checkRunnerShape(args) {
  const [mode, ...rest] = args;
  if (mode === "playwright") {
    if (!rest.length) return no(`${USAGE} — no spec file given`);
    for (const f of rest) {
      if (f.startsWith("-")) return no(`runner playwright takes spec files only, no flags (${JSON.stringify(f)}) — the config is pinned`);
      if (!SPEC_RE.test(f)) return no(`runner playwright runs *.spec.ts / *.spec.mjs / *.spec.js files, got ${JSON.stringify(f)}`);
    }
    return ok();
  }
  if (mode === "node") {
    const [script] = rest;
    if (!script) return no(`${USAGE} — no script given`);
    if (script.startsWith("-")) return no(`runner node takes a script, never a node option (${JSON.stringify(script)})`);
    if (!SCRIPT_RE.test(script)) return no(`runner node runs a .mjs or .js script, got ${JSON.stringify(script)}`);
    return ok();
  }
  return no(USAGE);
}

/** The files a command line runs: every spec for playwright, the script for node. */
const filesOf = ([mode, ...rest]) => (mode === "playwright" ? rest : rest.slice(0, 1));

const real = (p) => {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
};

/**
 * Every file the command runs must exist and lie inside one of the profile's `test.scriptRoots`
 * (project-relative), compared after realpath on both sides. Returns the real paths to run.
 * @returns {{ ok: boolean, reason: string, files: string[] }}
 */
export function checkRunnerFiles(args, { projectRoot, scriptRoots } = {}) {
  if (!Array.isArray(scriptRoots) || !scriptRoots.some((r) => typeof r === "string" && r.trim())) {
    return { ...no("the profile's test block names no scriptRoots — run /vc-test:init"), files: [] };
  }
  const roots = scriptRoots.filter((r) => typeof r === "string" && r.trim()).map((r) => real(resolve(projectRoot, r))).filter(Boolean);
  const files = [];
  for (const f of filesOf(args)) {
    const abs = resolve(projectRoot, f);
    if (!existsSync(abs)) return { ...no(`no such file: ${f}`), files: [] };
    const path = real(abs);
    const inside = path && roots.some((root) => {
      const rel = relative(root, path);
      return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
    });
    if (!inside) return { ...no(`${f} is outside the test block's scriptRoots (${scriptRoots.join(", ")})`), files: [] };
    files.push(path);
  }
  return { ...ok(), files };
}

/** Only an environment the profile's `test.environments` lists; writability is vc-test's business. */
export function runnerEnvAllowed(testBlock, env) {
  if (!testBlock || typeof testBlock !== "object") return no("the profile has no test block — run /vc-test:init");
  const envs = testBlock.environments && typeof testBlock.environments === "object" ? testBlock.environments : {};
  if (!Object.prototype.hasOwnProperty.call(envs, env)) {
    return no(`environment ${JSON.stringify(env)} is not in the profile's test.environments (${Object.keys(envs).join(", ") || "none"}) — run /vc-test:init`);
  }
  return ok();
}

/**
 * Where Playwright and its pinned config come from: the project's own `@playwright/test` when it has one,
 * else vc-test's (spec B1); the config is always vc-test's `harness/playwright.config.mjs`.
 * @param {string} projectRoot
 * @param {(name: string, rel: string, opts?: object) => string|null} resolvePlugin  resolvePluginFile
 */
export function findPlaywright(projectRoot, resolvePlugin, opts = {}) {
  const own = join(projectRoot, "node_modules", "@playwright", "test", "cli.js");
  const playwrightCli = existsSync(own) ? own : resolvePlugin("vc-test", "node_modules/@playwright/test/cli.js", opts);
  const config = resolvePlugin("vc-test", "harness/playwright.config.mjs", opts);
  if (!playwrightCli) return { error: "no @playwright/test in the project or in vc-test — install vc-test (/plugin install vc-test@ai-tools)" };
  if (!config) return { error: "vc-test's pinned Playwright config (harness/playwright.config.mjs) is missing — install vc-test (/plugin install vc-test@ai-tools)" };
  return { playwrightCli, config };
}

/** The fixed argv: node runs the Playwright CLI or the script; nothing else reaches the command line. */
export function runnerCommand(args, { node, playwrightCli, config, files }) {
  if (args[0] === "playwright") return { command: node, args: [playwrightCli, "test", "--config", config, ...files] };
  return { command: node, args: [files[0], ...args.slice(2)] };
}
