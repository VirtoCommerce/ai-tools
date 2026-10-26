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
 * (project-relative), compared after realpath on both sides. A file argument is relative to `base` (the
 * caller's cwd; default the project root). Returns the real paths to run, and `given` — the same files
 * resolved but not realpath'd, the form a directory walk from the project sees (fileFilter).
 * @returns {{ ok: boolean, reason: string, files: string[], given: string[] }}
 */
export function checkRunnerFiles(args, { projectRoot, scriptRoots, base = projectRoot } = {}) {
  if (!Array.isArray(scriptRoots) || !scriptRoots.some((r) => typeof r === "string" && r.trim())) {
    return { ...no("the profile's test block names no scriptRoots — run /vc-test:init"), files: [], given: [] };
  }
  const project = real(projectRoot);
  // `strict`: the path must lie strictly below the root, not be the root itself.
  const within = (root, path, strict = false) => {
    const rel = relative(root, path);
    return rel === "" ? !strict : !rel.startsWith("..") && !isAbsolute(rel);
  };
  const roots = [];
  for (const r of scriptRoots.filter((x) => typeof x === "string" && x.trim())) {
    const root = real(resolve(projectRoot, r));
    if (!root) continue; // a root that does not exist yet holds nothing to run
    if (!project || !within(project, root)) return { ...no(`scriptRoot ${JSON.stringify(r)} is outside the project — a root holds the run folder or the corpus`), files: [], given: [] };
    roots.push(root);
  }
  const files = [];
  const given = [];
  for (const f of filesOf(args)) {
    const abs = resolve(base, f);
    if (!existsSync(abs)) return { ...no(`no such file: ${f}`), files: [], given: [] };
    const path = real(abs);
    const inside = path && roots.some((root) => within(root, path, true));
    if (!inside) return { ...no(`${f} is outside the test block's scriptRoots (${scriptRoots.join(", ")})`), files: [], given: [] };
    files.push(path);
    given.push(abs);
  }
  return { ...ok(), files, given };
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

/**
 * Playwright reads every CLI file argument as a case-insensitive REGEX matched anywhere in a test file's
 * path. A raw Windows path never matches (`\r`, `\t` become escapes) and a name like `x|.spec.ts` would
 * widen the selection past the checked file, so each file goes as an anchored, escaped pattern that
 * accepts either separator. Given several spellings of one file (its real path and the path as walked from
 * the project — they differ under a junction, a `subst` drive or an 8.3 name), the pattern accepts each.
 */
export function fileFilter(...paths) {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const one = (p) => String(p).split(/[\\/]/).map(escape).join("[\\\\/]");
  const alts = [...new Set(paths.filter(Boolean).map(one))];
  return alts.length === 1 ? `^${alts[0]}$` : `^(?:${alts.join("|")})$`;
}

/**
 * The fixed argv: node runs the Playwright CLI or the script; nothing else reaches the command line.
 * Contract for vc-test's pinned config (P1c): its `testDir` must come from the project (the cwd the runner
 * sets), not from the config's own folder, or no project file is ever found.
 */
export function runnerCommand(args, { node, playwrightCli, config, files, given = [] }) {
  if (args[0] === "playwright") return { command: node, args: [playwrightCli, "test", "--config", config, ...files.map((f, i) => fileFilter(f, given[i]))] };
  return { command: node, args: [files[0], ...args.slice(2)] };
}
