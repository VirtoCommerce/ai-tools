// scripts/preflight/mcp-static.ts — MCP availability levels 1–2 (spec §7): CONFIGURED (present in
// .mcp.json) and READY (no placeholder, env refs resolve, Playwright pinned, firefox occlusion flag).
// Level 3 — callable in THIS session — is the skill's, never this file's.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REQUIREMENTS_PATH = ".claude/skills/preflight/mcp-requirements.json";

export type Consumer = "ticket" | "ticket-fast" | "exploratory" | "lifecycle" | "domain-map" | "ba" | "regression" | "smoke";
export const CONSUMERS: readonly Consumer[] = ["ticket", "ticket-fast", "exploratory", "lifecycle", "domain-map", "ba", "regression", "smoke"];
export type ReqClass = "REQ" | "REQ_FALLBACK" | "OPT";
export interface McpRequirements {
  servers: Record<string, { scope: "project" | "user"; toolSearch: string; fallback: string | null; lane?: boolean }>;
  consumers: Record<Consumer, Record<string, { class: ReqClass; when?: string }>>;
  lanes: Record<Consumer, { min: number; want: number }>;
}
export interface McpStatic {
  server: string; scope: "project" | "user"; class: ReqClass;
  level: "ABSENT" | "CONFIGURED" | "READY" | "NOT_VISIBLE";
  problem: string | null; fallback: string | null; when?: string;
}

export function loadMcpRequirements(root: string = REPO_ROOT): McpRequirements {
  const raw = JSON.parse(readFileSync(join(root, REQUIREMENTS_PATH), "utf8"));
  const fail = (m: string) => { throw new Error(`${REQUIREMENTS_PATH}: ${m}`); };
  if (!raw?.servers || !raw?.consumers || !raw?.lanes) fail("needs servers, consumers and lanes");
  for (const [name, s] of Object.entries<any>(raw.servers)) {
    if (s.scope !== "project" && s.scope !== "user") fail(`servers.${name}.scope must be project|user`);
    if (typeof s.toolSearch !== "string" || !s.toolSearch) fail(`servers.${name}.toolSearch is required`);
  }
  for (const c of CONSUMERS) {
    if (!raw.consumers[c]) fail(`consumers.${c} is missing`);
    if (!raw.lanes[c]) fail(`lanes.${c} is missing`);
    for (const [s, r] of Object.entries<any>(raw.consumers[c])) {
      if (!raw.servers[s]) fail(`consumers.${c}.${s}: unknown server`);
      if (!["REQ", "REQ_FALLBACK", "OPT"].includes(r.class)) fail(`consumers.${c}.${s}.class must be REQ|REQ_FALLBACK|OPT`);
    }
  }
  return raw as McpRequirements;
}

const PLACEHOLDER = /^<.*>$/;
const ENV_REF = /\$\{([A-Z0-9_]+)\}/g;

function readinessProblem(name: string, entry: any, readFile: (p: string) => string | null): string | null {
  const values: string[] = [
    ...Object.values<string>(entry.env ?? {}),
    ...Object.values<string>(entry.headers ?? {}),
    ...(entry.args ?? []).map(String),
  ];
  for (const v of values) {
    if (PLACEHOLDER.test(v)) return `placeholder value ${v} — set it in .env.local and reference it as \${VAR}`;
    for (const m of v.matchAll(ENV_REF)) if (!process.env[m[1]]) return `\${${m[1]}} does not resolve in the layered .env`;
  }
  if (name.startsWith("playwright-")) {
    const pkg = (entry.args ?? []).map(String).find((a: string) => a.startsWith("@playwright/mcp"));
    if (!pkg || !/@playwright\/mcp@\d/.test(pkg)) return `@playwright/mcp must be pinned to a version, found ${pkg ?? "none"}`;
    if (name === "playwright-firefox") {
      const i = (entry.args ?? []).indexOf("--config");
      const cfgPath = i >= 0 ? entry.args[i + 1] : null;
      const cfg = cfgPath ? readFile(cfgPath) : null;
      if (!cfg || !/window_occlusion_tracking/.test(cfg)) return "firefox config lacks widget.windows.window_occlusion_tracking.enabled=false (restart the server after adding it)";
    }
  }
  return null;
}

export const defaultReadFile = (p: string): string | null => {
  const abs = join(REPO_ROOT, p);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
};

export function readMcpJson(root: string = REPO_ROOT): any | null {
  const p = join(root, ".mcp.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

export function checkMcpStatic(consumer: Consumer, reqs: McpRequirements, mcpJson: any | null, readFile: (p: string) => string | null = defaultReadFile) {
  const configured = mcpJson?.mcpServers ?? {};
  const servers: McpStatic[] = [];
  const wanted = { ...reqs.consumers[consumer] };
  for (const [name, s] of Object.entries(reqs.servers)) if (s.lane && !wanted[name]) wanted[name] = { class: "OPT" };
  for (const [name, r] of Object.entries(wanted)) {
    const s = reqs.servers[name];
    const base = { server: name, scope: s.scope, class: r.class, fallback: s.fallback, ...(r.when ? { when: r.when } : {}) };
    if (s.scope === "user" && !configured[name]) { servers.push({ ...base, level: "NOT_VISIBLE", problem: null }); continue; }
    if (!configured[name]) { servers.push({ ...base, level: "ABSENT", problem: null }); continue; }
    const problem = readinessProblem(name, configured[name], readFile);
    servers.push({ ...base, level: problem ? "CONFIGURED" : "READY", problem });
  }
  const liveLanes = servers.filter((x) => reqs.servers[x.server].lane && x.level === "READY").length;
  return { servers, liveLanes, lanes: reqs.lanes[consumer] };
}
