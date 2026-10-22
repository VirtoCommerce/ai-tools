// plugins/vc-test/lib/capabilities.mjs — what this install can do, once per run (spec §5.2), minimal for the
// prototype: the two stand URLs and the MCP servers the orchestrator reports (a script cannot see them).
// CLI: node plugins/vc-test/lib/capabilities.mjs --key <KEY> --mcp <comma list>
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf, workDir } from "./paths.mjs";

const URLS = { "back-url": "BACK_URL", "front-url": "FRONT_URL" };
const mcpKey = (name) => `mcp:${String(name).trim().toLowerCase().replace(/[\s_]+/g, "-")}`;
// U16: only a declaration makes the stand writable. config.js defaults an unset ENV_RISK to "test", so the raw
// env value is read here: unset or staging/production ⇒ read-only.
const WRITABLE_RISK = new Set(["dev", "test"]);

export async function reach(url) {
  try { await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) }); return true; } catch { return false; }
}

export async function probe({ env, mcp, reach: reachFn = reach }) {
  const caps = { missing: [] };
  for (const [cap, name] of Object.entries(URLS)) {
    const url = env[name];
    if (!url) { caps[cap] = false; caps.missing.push(`${cap}: ${name} not set`); continue; }
    caps[cap] = await reachFn(url);
    if (!caps[cap]) caps.missing.push(`${cap}: ${url} did not answer`);
  }
  for (const name of mcp) if (String(name).trim()) caps[mcpKey(name)] = true;
  const risk = env.ENV_RISK ? String(env.ENV_RISK).toLowerCase() : null;
  caps.stand = { writable: WRITABLE_RISK.has(risk),
    reason: risk ? `ENV_RISK=${risk}` : "ENV_RISK not declared in the env files — read-only" };
  return caps;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const key = argOf(process.argv, "key");
  const config = join(process.cwd(), "config.js");
  if (!key) { console.error("usage: capabilities.mjs --key <KEY> --mcp <comma list>"); process.exit(1); }
  if (!existsSync(config)) { console.error("no config.js here — run from the project root"); process.exit(3); }
  await import(pathToFileURL(config).href); // runs the layered env loader into process.env
  const caps = await probe({ env: process.env, mcp: (argOf(process.argv, "mcp") ?? "").split(",") });
  const out = join(workDir(key), "capabilities.json");
  writeFileSync(out, JSON.stringify(caps, null, 2) + "\n");
  console.log(JSON.stringify({ path: out, ...caps }));
}
