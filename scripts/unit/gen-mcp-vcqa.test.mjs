// Unit tests for the vc-qa (.claude) surface's gen-mcp #220 network hardening:
// .claude/skills/project-init/gen-mcp.mjs `ensureNodeOptions` + the root template's pinned specs.
// This surface is the structurally-different twin of plugins/vc-fix (config-file Playwright,
// whole-string-only injectTokens); only the coupling-free #220 wins were ported here. Pure — no
// env/network. Run: `node --test` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureNodeOptions } from "../../.claude/skills/project-init/gen-mcp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TEMPLATE = resolve(ROOT, "templates/.mcp.json.example");
const IPV4 = "--dns-result-order=ipv4first";

test("ensureNodeOptions (#220, vc-qa): stdio npx server gets ipv4-first NODE_OPTIONS + prefer-offline", () => {
  const win = ensureNodeOptions({ type: "stdio", command: "cmd", args: ["/c", "npx", "chrome-devtools-mcp@1.6.0"], env: {} });
  assert.equal(win.env.NODE_OPTIONS, IPV4);
  assert.equal(win.env.npm_config_prefer_offline, "true");
});

test("ensureNodeOptions (#220, vc-qa): http server untouched; idempotent; appends to an existing NODE_OPTIONS", () => {
  const http = { type: "http", url: "https://mcp.context7.com/mcp" };
  assert.deepEqual(ensureNodeOptions(http), http);
  const once = ensureNodeOptions({ type: "stdio", command: "npx", args: ["x"] });
  assert.deepEqual(ensureNodeOptions(once).env.NODE_OPTIONS, once.env.NODE_OPTIONS);
  // a pre-existing NODE_OPTIONS is preserved and ours is appended after it (space-joined)
  const merged = ensureNodeOptions({ type: "stdio", command: "npx", args: ["x"], env: { NODE_OPTIONS: "--max-old-space-size=512" } });
  assert.equal(merged.env.NODE_OPTIONS, `--max-old-space-size=512 ${IPV4}`);
});

test("template (#220, vc-qa): no stdio server pins a package to @latest", () => {
  const tpl = JSON.parse(readFileSync(TEMPLATE, "utf8"));
  const offenders = [];
  for (const [name, def] of Object.entries(tpl.mcpServers)) {
    for (const a of def.args || []) if (typeof a === "string" && a.includes("@latest")) offenders.push(`${name}: ${a}`);
  }
  assert.deepEqual(offenders, [], `offenders: ${offenders.join(", ")}`);
});
