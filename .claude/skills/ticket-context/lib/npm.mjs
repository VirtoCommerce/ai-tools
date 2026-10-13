// .claude/skills/ticket-context/lib/npm.mjs — M2: repo tooling is run only when this install declares it.
// Security: npm is NEVER run through a shell. Some arguments derive from external text (a PR body's artifact
// URL, an agent's observable); with `shell: true` on Windows cmd.exe they could be run as commands. We spawn
// node itself on npm's CLI script, with the arguments as an array.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export function hasScript(root, name) {
  try { return !!JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts?.[name]; } catch { return false; }
}

/** npm's CLI script: the one running us, else the one that ships next to the node binary (Windows, then Unix layout). */
function findNpmCli(env, execPath) {
  const fromEnv = env.npm_execpath;
  if (fromEnv && basename(fromEnv) === "npm-cli.js" && existsSync(fromEnv)) return fromEnv;
  const here = dirname(execPath);
  return [join(here, "node_modules", "npm", "bin", "npm-cli.js"), join(here, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")]
    .find((p) => existsSync(p)) ?? null;
}

/** `ctx` is for tests: { env, execPath }. */
export function runNpmJson(root, args, spawn = spawnSync, ctx = {}) {
  if (args.some((a) => /[\0\r\n]/.test(String(a)))) return { status: null, json: null, error: "unsafe-argument" };
  const cli = findNpmCli(ctx.env ?? process.env, ctx.execPath ?? process.execPath);
  if (!cli) return { status: null, json: null, error: "npm-cli-not-found" };
  const r = spawn(ctx.execPath ?? process.execPath, [cli, "run", "--silent", ...args],
    { cwd: root, encoding: "utf8", shell: false, maxBuffer: 64 * 2 ** 20 });
  const text = r.stdout ?? "";
  const at = text.indexOf("{");
  let json = null;
  if (at >= 0) { try { json = JSON.parse(text.slice(at)); } catch { json = null; } }
  return r.error ? { status: r.status, json, error: String(r.error.code ?? r.error.message) } : { status: r.status, json };
}
