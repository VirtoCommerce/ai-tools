#!/usr/bin/env node
/**
 * Refresh / check the MCP module's contract surface (VirtoCommerce.MCP — every scope it serves).
 *
 * WHY THIS EXISTS. `ucp:schema:check` covers ONE scope (`/ucp/mcp`) and `schema:check` covers xAPI.
 * Nothing covered the MCP module itself: which scopes exist, which tools each scope carries, which of
 * them are destructive or held for approval, and what arguments `/admin/mcp`'s tools and prompts take.
 * Suite 118 asserts all of that, and a case that transcribes a tool list goes stale the next time a
 * module registers a tool (VCST-6155: the ticket said "18 tools", the stand served 25). Same shape as
 * refresh-ucp-schema.mjs on purpose: derive from the live surface, render a deterministic snapshot, diff.
 * Per .claude/rules/test-data.md GOLDEN RULE the contract is read from its source of truth, never
 * transcribed into a test case.
 *
 * TWO PARTS, because the module guards them differently:
 *   Part 1 — needs only a platform administrator's ordinary token (password grant, ADMIN_EMAIL /
 *            ADMIN_PASSWORD from the env layers): GET api/mcp/scopes + api/mcp/tools (every tool of
 *            every scope with its annotations), plus each scope's protected-resource metadata and
 *            its unauthenticated challenge. Always refreshed, always checked.
 *   Part 2 — `/admin/mcp` initialize + tools/list (input schemas) + prompts/list (arguments). The
 *            module refuses a password-grant token there by design ("not issued for this MCP
 *            resource"), so this part needs an AGENT token — OAuth authorization code + PKCE for a
 *            registered client — handed in with `--token-file <json with an access_token|access field>`
 *            or env MCP_AGENT_TOKEN. The token must belong to an ADMINISTRATOR: tools/list shows only
 *            what the signed-in user may run, so a narrower principal would snapshot a partial
 *            contract — refused rather than written. Without a token Part 2 is left as it was
 *            (refresh) or not compared (check), and the output says so.
 *   The ucp scope's tool ARGUMENTS stay in .claude/knowledge/api/ucp-schema.md (ucp:schema:refresh).
 *
 *   npm run mcp:schema:refresh [-- --token-file <path>]   # write the snapshot
 *   npm run mcp:schema:check   [-- --token-file <path>]   # diff against it; non-zero on drift
 */

import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import "../../config.js";

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const OUT = resolve(ROOT, ".claude/knowledge/api/mcp-schema.md");
const argv = process.argv.slice(2);
const MODE = argv.includes("--check") ? "check" : "refresh";
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };

const BACK = (process.env.BACK_URL ?? "").replace(/\/+$/, "");
const FRONT = (process.env.FRONT_URL ?? "").replace(/\/+$/, "");
if (!BACK) { console.error("BACK_URL is not set"); process.exit(2); }
// Hosts are env-specific; the snapshot must not be. Replace them so the file diffs on contract, not on env.
const norm = (s) => {
  if (s == null) return s;
  let out = String(s).split(BACK).join("<platform>");
  if (FRONT) out = out.split(FRONT).join("<storefront>");
  return out;
};
const PART2 = "<!-- part 2: /admin/mcp tools/list + prompts/list -->";

// ---------- auth ----------
async function adminRestToken() {
  const username = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
  if (!username || !password) { console.error("ADMIN_EMAIL / ADMIN_PASSWORD are not set (env layers) — Part 1 needs them"); process.exit(2); }
  const r = await fetch(`${BACK}/connect/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", scope: "offline_access", username, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) { console.error(`admin token: HTTP ${r.status} ${JSON.stringify(j).slice(0, 160)}`); process.exit(2); }
  return j.access_token;
}

function agentToken() {
  const file = arg("--token-file");
  if (file) {
    const j = JSON.parse(readFileSync(file, "utf8"));
    return j.access_token ?? j.access ?? null;
  }
  return process.env.MCP_AGENT_TOKEN || null;
}

const getJson = async (url, token) => {
  const r = await fetch(url, { headers: { Accept: "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) } });
  const text = await r.text();
  let body = null; try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body, headers: r.headers };
};

async function rpc(endpoint, method, params, token) {
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? {} }) });
  const text = await r.text();
  const m = text.match(/^data: (.*)$/m); // the endpoint may answer as SSE
  let j = null; try { j = JSON.parse(m ? m[1] : text); } catch { /* not JSON */ }
  return { status: r.status, json: j, wwwAuthenticate: r.headers.get("www-authenticate") };
}

// ---------- collect ----------
async function collectPart1() {
  const token = await adminRestToken();
  const scopes = (await getJson(`${BACK}/api/mcp/scopes`, token)).body;
  const tools = (await getJson(`${BACK}/api/mcp/tools`, token)).body;
  if (!Array.isArray(scopes) || !Array.isArray(tools)) {
    console.error("api/mcp/scopes or api/mcp/tools did not answer a list — is VirtoCommerce.MCP installed and the admin allowed mcp:manage?");
    process.exit(2);
  }
  const perScope = [];
  for (const s of scopes) {
    // The scope's own host: a scope may be served on the storefront host too (ucp). Probe both hosts
    // and record what each answers — which host serves which scope is part of the contract.
    const hosts = {};
    for (const [label, host] of [["platform", BACK], ["storefront", FRONT]]) {
      if (!host) continue;
      const prm = await getJson(`${host}/.well-known/oauth-protected-resource${s.path}`);
      const anon = await rpc(`${host}${s.path}`, "tools/list", {}, null);
      const challenge = anon.wwwAuthenticate ? norm(anon.wwwAuthenticate) : null;
      hosts[label] = {
        prmStatus: prm.status,
        resource: norm(prm.body?.resource ?? null),
        authorizationServers: (prm.body?.authorization_servers ?? []).map(norm),
        scopesSupported: (prm.body?.scopes_supported ?? []).slice().sort(),
        anonymousToolsList: anon.status,
        challenge,
      };
    }
    perScope.push({ ...s, hosts });
  }
  return { scopes: perScope, tools };
}

async function collectPart2(token) {
  const ep = `${BACK}/admin/mcp`;
  const me = await getJson(`${BACK}/api/platform/security/currentuser`, token);
  if (me.status !== 200) return { error: `the agent token was refused on platform REST (HTTP ${me.status}) — expired or revoked?` };
  if (!me.body?.isAdministrator) {
    return { error: "the agent token's user is not an administrator — tools/list would snapshot only that user's tools. Use an administrator's agent token." };
  }
  const init = await rpc(ep, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-schema", version: "1" } }, token);
  if (init.status !== 200) return { error: `initialize on /admin/mcp answered HTTP ${init.status} — ${JSON.stringify(init.json ?? {}).slice(0, 160)}` };
  const tools = (await rpc(ep, "tools/list", {}, token)).json?.result?.tools ?? [];
  const prompts = (await rpc(ep, "prompts/list", {}, token)).json?.result?.prompts ?? [];
  return { init: init.json?.result ?? {}, tools, prompts };
}

// ---------- render ----------
function renderProps(schema, indent = "") {
  const out = [];
  const req = new Set(schema?.required ?? []);
  for (const [k, v] of Object.entries(schema?.properties ?? {})) {
    const type = Array.isArray(v.type) ? v.type.join("|") : (v.type ?? (v.oneOf ? "oneOf" : v.anyOf ? "anyOf" : "?"));
    const extra = [v.enum ? `enum[${v.enum.join("|")}]` : "", v.default !== undefined ? `default ${JSON.stringify(v.default)}` : "",
      v.minimum !== undefined ? `min ${v.minimum}` : "", v.maximum !== undefined ? `max ${v.maximum}` : ""].filter(Boolean).join(" ");
    out.push(`${indent}${req.has(k) ? "*" : " "} ${k}: ${type}${extra ? " " + extra : ""}`);
    if (v.type === "object" && v.properties) out.push(...renderProps(v, indent + "    "));
    if (v.type === "array" && v.items?.properties) { out.push(`${indent}    [item]`); out.push(...renderProps(v.items, indent + "      ")); }
  }
  return out;
}

const flag = (b) => (b ? "yes" : "—");
const oneLine = (s) => (s ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();

function renderPart1({ scopes, tools }) {
  const L = [];
  L.push("# MCP module contract surface — GENERATED, do not edit by hand");
  L.push("");
  L.push("> Written by `npm run mcp:schema:refresh`; `mcp:schema:check` fails on drift. This file is the SOURCE OF");
  L.push("> TRUTH for which scopes the MCP module serves, which tools each scope carries and how they are");
  L.push("> annotated, and (Part 2) what `/admin/mcp`'s tools and prompts take — a test case cites it and never");
  L.push("> transcribes it (`.claude/rules/test-data.md` GOLDEN RULE). Tool ARGUMENTS of the `ucp` scope live in");
  L.push("> [`ucp-schema.md`](ucp-schema.md). Run-time STATE (a tool switched off, counts, the caller's approver");
  L.push("> flag) is deliberately excluded: it changes without the contract changing.");
  L.push("");
  L.push("## Part 1 — scopes and tool catalog (`api/mcp/scopes`, `api/mcp/tools`, as an administrator)");
  L.push("");
  L.push("### Scopes");
  L.push("");
  L.push("| scope | title | path | approval | approver permission |");
  L.push("|---|---|---|---|---|");
  for (const s of [...scopes].sort((a, b) => a.name.localeCompare(b.name))) {
    L.push(`| \`${s.name}\` | ${s.title ?? "—"} | \`${s.path}\` | ${flag(s.supportsApproval)} | ${s.approvalPermission ? `\`${s.approvalPermission}\`` : "—"} |`);
  }
  L.push("");
  L.push("### Per scope and host — protected-resource metadata and the unauthenticated answer");
  L.push("");
  L.push("`<platform>` / `<storefront>` stand for BACK_URL / FRONT_URL of the env refreshed against. `tools/list` is sent with no token.");
  L.push("");
  L.push("| scope | host | PRM | resource | authorization server | scopes_supported | anonymous tools/list | challenge |");
  L.push("|---|---|---|---|---|---|---|---|");
  for (const s of [...scopes].sort((a, b) => a.name.localeCompare(b.name))) {
    for (const [h, v] of Object.entries(s.hosts)) {
      L.push(`| \`${s.name}\` | ${h} | ${v.prmStatus} | ${v.resource ? `\`${v.resource}\`` : "—"} | ${v.authorizationServers.map((a) => `\`${a}\``).join(", ") || "—"} | ${v.scopesSupported.join(", ") || "—"} | ${v.anonymousToolsList} | ${v.challenge ? `\`${oneLine(v.challenge)}\`` : "—"} |`);
    }
  }
  L.push("");
  L.push("### Tools per scope");
  L.push("");
  const byScope = new Map();
  for (const t of tools) { if (!byScope.has(t.scopeName)) byScope.set(t.scopeName, []); byScope.get(t.scopeName).push(t); }
  for (const name of [...byScope.keys()].sort()) {
    const list = byScope.get(name).sort((a, b) => a.name.localeCompare(b.name));
    const n = (p) => list.filter(p).length;
    L.push(`#### \`${name}\` — ${list.length} tools (read-only ${n((t) => t.readOnly)} · destructive ${n((t) => t.destructive)} · requires approval ${n((t) => t.requiresApproval)})`);
    L.push("");
    L.push("| tool | read-only | destructive | approval | description |");
    L.push("|---|---|---|---|---|");
    for (const t of list) L.push(`| \`${t.name}\` | ${flag(t.readOnly)} | ${flag(t.destructive)} | ${flag(t.requiresApproval)} | ${oneLine(t.description)} |`);
    L.push("");
  }
  return L.join("\n") + "\n";
}

function renderPart2(p2) {
  const L = [PART2, "", "## Part 2 — `/admin/mcp` as an administrator's agent (`tools/list`, `prompts/list`)", ""];
  const init = p2.init;
  L.push(`- protocol: \`${init.protocolVersion ?? "?"}\` · serverInfo: \`${init.serverInfo?.name ?? "?"}\` v\`${init.serverInfo?.version ?? "?"}\``);
  L.push(`- capabilities: ${Object.keys(init.capabilities ?? {}).sort().map((c) => `\`${c}\``).join(", ") || "(none)"}`);
  L.push(`- ${p2.tools.length} tools · ${p2.prompts.length} prompts (an administrator sees every tool of the scope; another user sees the subset its permissions allow)`);
  L.push("");
  L.push("### Tool arguments (`*` = required)");
  L.push("");
  for (const t of [...p2.tools].sort((a, b) => a.name.localeCompare(b.name))) {
    const ann = t.annotations ?? {};
    const tags = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"].filter((k) => ann[k] !== undefined).map((k) => `${k.replace("Hint", "")}=${ann[k]}`);
    L.push(`#### \`${t.name}\`${tags.length ? ` — ${tags.join(" · ")}` : ""}`);
    L.push("");
    const props = renderProps(t.inputSchema ?? {});
    L.push("```");
    L.push(props.length ? props.join("\n") : "(no arguments)");
    L.push("```");
    L.push("");
  }
  L.push("### Prompts");
  L.push("");
  L.push("| prompt | arguments (`*` = required) | description |");
  L.push("|---|---|---|");
  for (const p of [...p2.prompts].sort((a, b) => a.name.localeCompare(b.name))) {
    const args = (p.arguments ?? []).map((a) => `${a.required ? "*" : ""}\`${a.name}\``).join(", ") || "(none)";
    L.push(`| \`${p.name}\` | ${args} | ${oneLine(p.description)} |`);
  }
  L.push("");
  return L.join("\n") + "\n";
}

// ---------- main ----------
const part1 = renderPart1(await collectPart1());
const token = agentToken();
let part2 = null, part2Note;
if (token) {
  const p2 = await collectPart2(token);
  if (p2.error) { console.error(`[mcp:schema] Part 2 NOT collected: ${p2.error}`); process.exit(2); }
  part2 = renderPart2(p2);
} else {
  part2Note = "Part 2 (/admin/mcp tool arguments + prompts) needs an administrator's AGENT token: --token-file <json> or MCP_AGENT_TOKEN.";
}

const prev = existsSync(OUT) ? readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : null;
const prevPart1 = prev ? prev.split(PART2)[0] : null;
const prevPart2 = prev && prev.includes(PART2) ? PART2 + prev.split(PART2)[1] : null;

if (MODE === "check") {
  if (!prev) { console.error(`[mcp:schema:check] no snapshot at ${OUT} — run mcp:schema:refresh first`); process.exit(1); }
  const diffs = [];
  const cmp = (label, a, b) => {
    const x = a.split("\n"), y = b.split("\n");
    for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) diffs.push(`  [${label}] line ${i + 1}\n    - ${x[i] ?? "(absent)"}\n    + ${y[i] ?? "(absent)"}`);
  };
  cmp("part 1", prevPart1, part1);
  if (part2) cmp("part 2", prevPart2 ?? "", part2);
  if (!diffs.length) {
    console.log(`[mcp:schema:check] OK — Part 1 no drift${part2 ? ", Part 2 no drift" : ` · Part 2 NOT checked: ${part2Note}`}`);
    process.exit(0);
  }
  console.error(`[mcp:schema:check] DRIFT — ${diffs.length} differing line(s). The MCP contract changed:\n`);
  console.error(diffs.slice(0, 40).join("\n"));
  if (diffs.length > 40) console.error(`  … and ${diffs.length - 40} more`);
  if (!part2) console.error(`\n  Part 2 NOT checked: ${part2Note}`);
  console.error("\n  If the change is intended: npm run mcp:schema:refresh, and re-read any case that asserts the old shape.");
  process.exit(1);
}

const body = part1 + (part2 ?? prevPart2 ?? `${PART2}\n\n## Part 2 — not yet captured\n\n${part2Note}\n`);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body);
console.log(`[mcp:schema:refresh] wrote ${OUT}`);
console.log(`  Part 1 refreshed${part2 ? " · Part 2 refreshed" : prevPart2 ? " · Part 2 kept from the previous snapshot (no agent token)" : " · Part 2 not captured (no agent token)"}`);
if (!part2) console.log(`  ${part2Note}`);
