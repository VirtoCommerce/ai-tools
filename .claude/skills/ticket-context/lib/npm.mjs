// .claude/skills/ticket-context/lib/npm.mjs — M2: repo tooling is run only when this install declares it.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function hasScript(root, name) {
  try { return !!JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts?.[name]; } catch { return false; }
}

/** cmd.exe needs an argument with spaces or quotes wrapped; everything else passes as is. */
export const quoteArg = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

export function runNpmJson(root, args, spawn = spawnSync) {
  const win = process.platform === "win32";
  const r = spawn(win ? "npm.cmd" : "npm", ["run", "--silent", ...(win ? args.map(quoteArg) : args)],
    { cwd: root, encoding: "utf8", shell: win, maxBuffer: 64 * 2 ** 20 });
  const text = r.stdout ?? "";
  const at = text.indexOf("{");
  let json = null;
  if (at >= 0) { try { json = JSON.parse(text.slice(at)); } catch { json = null; } }
  return { status: r.status, json };
}
