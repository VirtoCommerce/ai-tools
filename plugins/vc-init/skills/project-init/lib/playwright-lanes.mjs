/**
 * skills/project-init/lib/playwright-lanes.mjs — the Playwright MCP lanes' command lines.
 *
 * Two consumers build a lane from the same template entry and must agree on it:
 *   - gen-mcp.mjs, which writes the lane into `.mcp.json` (option A: `npx @playwright/mcp@<pin> …`
 *     with `--secrets .env.playwright.local`);
 *   - write-secrets-decl.mjs, which declares the lane as a vc-secrets server per environment
 *     (option B, lib/passwords.mjs) — the same CLI flags, run in-process by bridge/playwright-mcp.mjs.
 * Writing the declaration already at /project-init §3c, from the same builder, is what lets the
 * operator trust it once: gen-mcp (§7) then finds it unchanged.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pluginRoot } from "./paths.mjs";

// Screenshots taken during a /qa-bug run were landing at the PROJECT ROOT and being moved
// afterwards. Two facts existed but were never connected: the template's `--output-dir` was
// RELATIVE (`test-results/<browser>`, resolved against whatever cwd the MCP server happens to
// start in — the project root, if we're lucky), while `skills/qa-evidence/output-paths.md`
// declared the destination policy `reports/bugs/screenshots/`. Nothing said HOW a screenshot
// gets from one to the other, so the path was guessed.
//
// The fix is to make the DESTINATION DETERMINISTIC rather than hope about cwd: we rewrite
// `--output-dir` to an ABSOLUTE path inside the project's own evidence tree. Whatever cwd the
// MCP server inherits, its default target can no longer be the project root — the strongest
// available guarantee, since playwright-mcp resolves a relative --output-dir against its cwd.
// `_incoming/` is the landing zone; /qa-bug performs ONE deterministic move from there into
// `reports/bugs/screenshots/<bug-slug>/` at its evidence step.
export const EVIDENCE_INCOMING = ["reports", "bugs", "screenshots", "_incoming"];

/** Rewrite a Playwright server's relative --output-dir to an absolute path under the project. */
export function absolutizeOutputDir(server, root) {
  const args = server?.args;
  if (!Array.isArray(args)) return server;
  const i = args.indexOf("--output-dir");
  if (i < 0 || i + 1 >= args.length) return server;
  const current = String(args[i + 1] || "");
  if (isAbsolute(current)) return server; // already pinned (a hand-edited template)
  // Keep only the LAST path segment (the browser lane) and re-root it in the evidence tree,
  // so an older template value like `test-results/chrome` is migrated too.
  const lane = current.split(/[/\\]/).filter(Boolean).pop() || "chrome";
  const next = [...args];
  next[i + 1] = join(root, ...EVIDENCE_INCOMING, lane);
  return { ...server, args: next };
}

// A deployment may ship its OWN Playwright MCP config per lane
// (`config/mcp-playwright-<lane>.config.json`) plus a `--secrets` file. Those carry settings the
// template's CLI flags cannot express — recordHar, recordVideo, locale, launchOptions, and the
// Firefox `widget.windows.window_occlusion_tracking.enabled=false` workaround that is the only
// thing making that lane click-capable. Regenerating with the template's inline flags silently
// dropped all of it, and dropping `--secrets` is worse than a crash: playwright-mcp then types the
// BARE KEY NAME as a literal, so a login "succeeds" with the wrong string and nothing errors.
// So: when the project has a config for a lane, hand it to `--config` and drop the inline flags it
// supersedes; when it has a secrets file, always pass it. Both paths absolute — playwright-mcp
// resolves relative paths against ITS OWN cwd, which is the bug absolutizeOutputDir already fixes.
// With the passwords in vc-secrets (`withSecrets: false`) there is no file to pass.
const PW_SUPERSEDED = new Set(["--browser", "--isolated", "--viewport-size", "--output-dir"]);
/** Point a Playwright lane at the deployment's own --config / --secrets when they exist. Pure-ish (fs reads). */
export function preferProjectPlaywrightConfig(server, name, root, exists = existsSync, { withSecrets = true } = {}) {
  const args = server?.args;
  if (!Array.isArray(args) || !/^playwright-/.test(name || "")) return server;
  const lane = name.slice("playwright-".length);
  const cfg = join(root, "config", `mcp-playwright-${lane}.config.json`);
  const secrets = join(root, ".env.playwright.local");
  const hasCfg = exists(cfg);
  const hasSecrets = withSecrets && exists(secrets);
  if (!hasCfg && !hasSecrets) return server;
  let next = [...args];
  if (hasCfg) {
    // Drop the flags the config file supersedes, then append --config.
    const kept = [];
    for (let i = 0; i < next.length; i++) {
      if (PW_SUPERSEDED.has(next[i])) { if (next[i] !== "--isolated") i++; continue; }
      kept.push(next[i]);
    }
    next = kept;
    if (!next.includes("--config")) next.push("--config", cfg);
  }
  if (hasSecrets && !next.includes("--secrets")) next.push("--secrets", secrets);
  return { ...server, args: next };
}

const SPEC_RE = /^@playwright\/mcp(@.+)?$/;

/** The `.mcp.json` template's servers (the plugin's own asset). */
export function readTemplateServers(templatePath = join(pluginRoot(), "templates", ".mcp.json.example")) {
  return JSON.parse(readFileSync(templatePath, "utf8")).mcpServers || {};
}

/**
 * Each Playwright lane of the template as a vc-secrets server command (option B), env not included:
 *   npx -y -p <spec> node <shim> --playwright <spec> <the lane's CLI flags, project-pinned>
 * The pin appears twice by design: npx installs it, and bridge/playwright-mcp.mjs refuses any other
 * version it finds on PATH. Pure-ish (fs reads for the project's lane configs).
 * @returns {Record<string, { command: string, args: string[] }>}  keyed by lane (chrome, firefox, edge)
 */
export function laneCommands({ servers, root, shim, exists = existsSync }) {
  const out = {};
  for (const [name, def] of Object.entries(servers || {})) {
    if (!/^playwright-[a-z0-9]+$/.test(name) || !Array.isArray(def?.args)) continue;
    const at = def.args.findIndex((a) => SPEC_RE.test(a));
    if (at < 0) continue;
    const spec = def.args[at];
    const flags = preferProjectPlaywrightConfig(absolutizeOutputDir({ args: def.args.slice(at + 1) }, root), name, root, exists, { withSecrets: false }).args;
    out[name.slice("playwright-".length)] = { command: "npx", args: ["-y", "-p", spec, "node", shim, "--playwright", spec, ...flags] };
  }
  return out;
}

/** `.mcp.json` entry for a lane whose passwords are in vc-secrets: a call to the bridge, nothing else. */
export const laneEntryViaBridge = (lane) => ({ type: "stdio", command: "node", args: ["${VC_RUN}", "playwright", lane] });
