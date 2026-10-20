/**
 * requirements — does the stand carry what THESE cases need? The case-level half of the regression pre-flight.
 *
 * `regression:plan --preflight` already answers "is the stand up, is the build the one declared, are the modules
 * deployed, are the lane passwords declared". It did not answer the question that blocked most of Stable 16's
 * W2/W3 cases: the stand is up and the module is there, but a store setting is off, an upload scope is not
 * configured in vc-deploy-dev, a fixture was never seeded on this env, or a persona's account is locked. Those
 * cases ran, BLOCKED one by one, and were triaged by hand. This module finds them before the run.
 *
 * Three sources, cheapest first:
 *   1. DERIVED from the suite CSVs, no declaration needed —
 *      - personas: every `[PRE:SIGNIN_AS|SWITCH_ORG|VERIFY_AUTH:<ALIAS>]`. Checked through the admin API
 *        (account exists, not locked out, password not expired) and the env (email + password resolvable).
 *        NEVER by signing in: a failed sign-in counts towards the lockout of an account other lanes share.
 *      - fixtures: every `@td(ALIAS.field)`, resolved by the same TestDataResolver the runners use. A miss the
 *        resolver classifies `unseeded` (another env has the value, this one does not) is a seeding gap.
 *   2. DECLARED in `config/suite-requirements.json` — what a CSV cannot express: a store setting, a platform
 *      setting, a payment method, a key in vc-deploy-dev `infra/environments.yml` (headers, FileUpload scopes,
 *      KnownAssetHosts). Each entry names the cases it gates and why.
 *   3. Read-only, always: GETs against the platform, one GitHub read of the yml. Nothing here writes anywhere.
 *
 * Severity: a derived gap is a WARN with its case count (the run still goes; those cases will BLOCK, and the
 * owner now knows which before spending a run on them). A declared requirement is WARN unless it says
 * `"level": "block"`. Anything that could not be read is UNKNOWN, never OK.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { parse as parseYaml } from "yaml";
import { TestDataResolver } from "../lib/test-data-resolver.ts";
import { resolveEnvCoords, type EnvCoords } from "../deploy/lib/env.ts";
import { getAdminToken } from "../deploy/lib/live.ts";
import { ghJson, setToken } from "../deploy/lib/github.ts";
import type { Check } from "../preflight/policy.ts";

export type ReqKind = "storeSetting" | "platformSetting" | "paymentMethod" | "deployConfig" | "uploadScope";
export interface Requirement {
  kind: ReqKind;
  /** Setting name · payment method code · yml path (`storefront.headers.X`, `platform.config.KEY`) · upload scope name. */
  name: string;
  /** The value the cases need. Omitted with `nonEmpty` / `notEquals` / `prefix`. */
  equals?: unknown;
  notEquals?: unknown;
  nonEmpty?: boolean;
  /** deployConfig: true when `name` is a key PREFIX (an indexed list such as `…KnownAssetHosts__`). */
  prefix?: boolean;
  /** platformSetting: values the setting's dictionary (`allowedValues`) must offer — a seeder writes them as statuses. */
  allowedIncludes?: string[];
  level?: "warn" | "block";
  cases?: string[];
  why: string;
}
/**
 * A persona — or a fixture alias — that only exists where a module is installed (a sales rep needs
 * VirtoCommerce.SalesRep). On a stand without the module its cases are NOT DEPLOYED: they leave the plan,
 * exactly as a suite does whose `requiresModules` is not deployed, instead of being run or recorded BLOCKED.
 */
export interface PersonaRequirement { module: string; why: string }
export interface RequirementsFile {
  _meta?: unknown;
  suites: Record<string, Requirement[]>;
  /** Keyed by persona alias; a trailing `*` matches a prefix (`SR_*`). */
  personas?: Record<string, PersonaRequirement>;
}
export interface SuiteFile { id: string; file: string }

const PERSONA = /\[PRE:(?:SIGNIN_AS|SWITCH_ORG|VERIFY_AUTH):([A-Z][A-Z0-9_]+)\]/g;
const TD_REF = /@td\(([A-Z][A-Z0-9_]+(?:\.\w+)+)\)/g;
const VAR = /^\{\{([A-Z0-9_]+)\}\}$/;

/** The resolver logs its overlay layering to stdout; under `--json` that line would corrupt the JSON a caller parses. */
function makeResolver(root: string, env: string): TestDataResolver {
  const log = console.log;
  console.log = (...a: unknown[]) => console.error(...a);
  try { return new TestDataResolver(join(root, "test-data"), env); } finally { console.log = log; }
}

export function loadRequirements(root: string): RequirementsFile {
  const p = join(root, "config/suite-requirements.json");
  if (!existsSync(p)) return { suites: {} };
  return JSON.parse(readFileSync(p, "utf-8")) as RequirementsFile;
}

/** Every persona alias and `@td()` reference the selected suites use, each with the cases that use it. */
export function collectCaseNeeds(root: string, suites: SuiteFile[]) {
  const personas = new Map<string, Set<string>>();
  const refs = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, c: string) => (m.get(k) ?? m.set(k, new Set()).get(k)!).add(c);
  const unreadable: string[] = [];
  for (const s of suites) {
    const path = join(root, s.file);
    if (!existsSync(path)) { unreadable.push(s.id); continue; }
    let rows: Record<string, string>[];
    try {
      rows = parseCsv(readFileSync(path, "utf-8").replace(/^﻿/, ""), { columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });
    } catch { unreadable.push(s.id); continue; }
    for (const r of rows) {
      const id = r.ID || r.Id || r["Test_Case_ID"] || Object.values(r)[0];
      if (!id) continue;
      const text = Object.values(r).join("\n");
      const key = `${s.id}/${id}`;
      for (const m of text.matchAll(PERSONA)) add(personas, m[1], key);
      for (const m of text.matchAll(TD_REF)) add(refs, m[1], key);
    }
  }
  return { personas, refs, unreadable };
}

/** "036 (29), 037 (2)" — the affected cases, by suite. */
function bySuite(cases: Iterable<string>): string {
  const n = new Map<string, number>();
  for (const c of cases) { const s = c.split("/")[0]; n.set(s, (n.get(s) ?? 0) + 1); }
  return [...n].map(([s, k]) => `${s} (${k})`).join(", ");
}
const count = (c: Set<string>) => `${c.size} case${c.size === 1 ? "" : "s"}`;

export function fixtureChecks(root: string, env: string, refs: Map<string, Set<string>>,
  modules: { reqs?: Record<string, PersonaRequirement>; installed: Set<string> | null } = { installed: null }): Check[] {
  const resolver = makeResolver(root, env);
  const absent: Check[] = [];
  const absentAliases = new Set<string>();
  for (const [ref, cases] of refs) {
    const alias = ref.split(".")[0];
    const needs = personaModule(modules.reqs, alias);
    if (!needs || !modules.installed || modules.installed.has(needs.module)) continue;
    const row = absent.find((c) => c.id === `fixture:${alias}`);
    if (row) { for (const c of cases) if (!row.cases!.includes(c)) row.cases!.push(c); continue; }
    absentAliases.add(alias);
    absent.push({ id: `fixture:${alias}`, status: "WARN", found: `${needs.module} is not installed on ${env}: ${needs.why}`, who: "you",
      do: `not deployed — these cases leave the plan; deploy ${needs.module} on ${env} to test them`, diagnose: [], cases: [...cases], notDeployed: needs.module });
  }
  for (const r of absent) r.found += ` — ${r.cases!.length} case(s): ${bySuite(r.cases!)}`;
  refs = new Map([...refs].filter(([ref]) => !absentAliases.has(ref.split(".")[0])));
  const byAlias = new Map<string, { cases: Set<string>; fields: Set<string>; kind: "unseeded" | "broken"; detail: string; seed?: string }>();
  for (const [ref, cases] of refs) {
    let out = "";
    try { out = resolver.resolve(`@td(${ref})`); } catch { out = `@td(${ref})`; }
    resolver.clearWarnings();
    if (out && !out.includes("@td(")) continue;
    const miss = resolver.explainMiss(ref);
    const alias = ref.split(".")[0];
    const cur = byAlias.get(alias) ?? { cases: new Set<string>(), fields: new Set<string>(), kind: miss.kind, detail: "", seed: undefined };
    for (const c of cases) cur.cases.add(c);
    cur.fields.add(ref.slice(alias.length + 1));
    if (miss.kind === "unseeded") { cur.kind = "unseeded"; cur.detail = `seeded on ${miss.seededOn.join(", ")}, not on ${env}`; cur.seed = miss.seed; }
    else if (cur.kind !== "unseeded") cur.detail = miss.reason;
    byAlias.set(alias, cur);
  }
  return [...byAlias].map(([alias, a]): Check => ({
    id: `fixture:${alias}`,
    status: "WARN",
    found: `@td(${alias}.${[...a.fields].join("|")}) does not resolve on ${env}: ${a.detail} — ${count(a.cases)}: ${bySuite(a.cases)}`,
    who: a.kind === "unseeded" ? "me, with OK" : "me",
    do: a.kind === "unseeded"
      ? (a.seed ? `seed it: TEST_ENV=${env} npm run ${a.seed}, then re-run` : `seed the fixture behind ${alias} on ${env} (/qa-seed-data), then re-run`)
      : `fix the reference or the alias (test-data/aliases.json, aliases.${env}.json) — a suite defect, not env state`,
    diagnose: [`TEST_ENV=${env} npm run td:validate`],
    cases: [...a.cases],
  })).concat(absent);
}

interface AliasEntry { email_env?: string; password_env?: string; [k: string]: unknown }

/** The platform account behind an email: by user name first, then by search (storefront user names often differ from the email). */
async function lookupAccount(c: EnvCoords, token: string, email: string): Promise<{ user: any | null; status: number }> {
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    const r = await fetch(`${c.backUrl}/api/platform/security/users/${encodeURIComponent(email)}`, { headers: h });
    if (r.status === 200) { const u = await r.json().catch(() => null); if (u) return { user: u, status: 200 }; }
    const s = await fetch(`${c.backUrl}/api/platform/security/users/search`, { method: "POST", headers: h, body: JSON.stringify({ searchPhrase: email, take: 5 }) });
    if (s.status !== 200) return { user: null, status: s.status };
    const j = await s.json().catch(() => null);
    const hit = (j?.results ?? j?.users ?? []).find((u: any) => String(u.email ?? "").toLowerCase() === email.toLowerCase() || String(u.userName ?? "").toLowerCase() === email.toLowerCase());
    return { user: hit ?? null, status: 200 };
  } catch { return { user: null, status: -1 }; }
}

function accountProblems(u: any, status: number): string[] {
  if (!u) return [status === 200 ? "no such account on this env" : `account lookup failed (HTTP ${status})`];
  const p: string[] = [];
  if (u.lockoutEnd && Date.parse(u.lockoutEnd) > Date.now()) p.push(`locked out until ${u.lockoutEnd}`);
  if (u.passwordExpired === true) p.push("password expired (the storefront forces /change-password)");
  return p;
}

/** The persona's module requirement, by exact alias or by a `PREFIX*` key. */
function personaModule(reqs: Record<string, PersonaRequirement> | undefined, alias: string): PersonaRequirement | null {
  if (!reqs) return null;
  if (reqs[alias]) return reqs[alias];
  const hit = Object.keys(reqs).find((k) => k.endsWith("*") && alias.startsWith(k.slice(0, -1)));
  return hit ? reqs[hit] : null;
}

/** Installed module ids, or null when they could not be read (then no persona is judged on its module). */
async function installedModules(c: EnvCoords, token: string | null): Promise<Set<string> | null> {
  if (!token || !c.backUrl) return null;
  try {
    const r = await fetch(`${c.backUrl}/api/platform/modules`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200) return null;
    const list = (await r.json()) as { id: string; isInstalled?: boolean }[];
    return new Set(list.filter((m) => m.isInstalled !== false).map((m) => m.id));
  } catch { return null; }
}

export async function personaChecks(root: string, env: string, c: EnvCoords, token: string | null, personas: Map<string, Set<string>>,
  modules: { reqs?: Record<string, PersonaRequirement>; installed: Set<string> | null } = { installed: null }): Promise<Check[]> {
  const registry = JSON.parse(readFileSync(join(root, "test-data/aliases.json"), "utf-8")) as Record<string, AliasEntry>;
  const resolver = makeResolver(root, env);
  const read = (expr: string) => { try { const v = resolver.resolve(expr); resolver.clearWarnings(); return v.includes("@td(") ? "" : v; } catch { return ""; } };
  const secretSet = (v: string) => {
    if (!v) return false;
    const m = v.match(VAR);
    return m ? !!process.env[m[1]] || !!process.env[`${m[1]}_${env.toUpperCase()}`] : true;
  };
  const out: Check[] = [];
  for (const [alias, cases] of personas) {
    // Not an alias: a config.js persona (USER, ORG_USER, ADMIN…), read from <NAME>_EMAIL / <NAME> and <NAME>_PASSWORD.
    const envEmail = [`${alias}_EMAIL`, `${alias}_USERNAME`, alias].find((k) => process.env[k] && process.env[k]!.includes("@") || (k === alias && process.env[k]));
    const entry: AliasEntry | undefined = registry[alias] ?? (envEmail && process.env[`${alias}_PASSWORD`] !== undefined ? { email_env: envEmail, password_env: `${alias}_PASSWORD` } : undefined);
    const where = `${count(cases)}: ${bySuite(cases)}`;
    // Before the account: without the module the account cannot be provisioned, so "no such account" would send
    // someone to seed what the platform cannot hold (Stable 16: seed:sales-rep → 404 on /api/sales-rep/*).
    const needs = personaModule(modules.reqs, alias);
    if (needs && modules.installed && !modules.installed.has(needs.module)) {
      out.push({ id: `persona:${alias}`, status: "WARN", found: `${needs.module} is not installed on ${env}: ${needs.why} — ${where}`, who: "you",
        do: `not deployed — these cases leave the plan; deploy ${needs.module} on ${env} to test them`, diagnose: [], cases: [...cases], notDeployed: needs.module });
      continue;
    }
    if (!entry) { out.push({ id: `persona:${alias}`, status: "WARN", found: `unknown persona — neither an alias in test-data/aliases.json nor ${alias}_EMAIL / ${alias}_PASSWORD in the env — ${where}`, who: "me", do: `add the alias to test-data/aliases.json, set ${alias}_EMAIL and ${alias}_PASSWORD for the env, or fix the [PRE:*] tag`, diagnose: [], cases: [...cases] }); continue; }
    const email = entry.email_env ? process.env[entry.email_env] ?? "" : read(`@td(${alias}.email)`);
    const pwdOk = entry.password_env ? !!process.env[entry.password_env] : secretSet(read(`@td(${alias}.password)`));
    if (!email || !pwdOk) {
      const vars = [entry.email_env && !email ? entry.email_env : null, entry.password_env && !pwdOk ? entry.password_env : null].filter(Boolean).join(", ");
      out.push({ id: `persona:${alias}`, status: "WARN", found: `${!email ? "no email" : "no password"} for ${alias} on ${env}${vars ? ` (${vars})` : ""} — ${where}`, who: "you", do: `set ${vars || "the persona's credentials"} in .env.local (the team secret store has the values); never commit a password`, diagnose: [], cases: [...cases] });
      continue;
    }
    if (!token || !c.backUrl) { out.push({ id: `persona:${alias}`, status: "UNKNOWN", found: `${email}: account state not checked (no admin token) — ${where}`, who: "you", do: `fix the admin credentials for ${env}`, diagnose: [] }); continue; }
    const { user: u, status } = await lookupAccount(c, token, email);
    const problems = accountProblems(u, status);
    out.push(problems.length
      ? { id: `persona:${alias}`, status: "WARN", found: `${email}: ${problems.join("; ")} — ${where}`, who: "me, with OK",
          do: !u ? `provision the account on ${env} (/qa-seed-data users), or point ${alias} at an account this env has in test-data/aliases.${env}.json — then re-run` : `reset the account on ${env} (unlock / set a new password from .env.local), then re-run`, diagnose: [], cases: [...cases] }
      : { id: `persona:${alias}`, status: "OK", found: `${email} — ${where}`, who: null, do: null, diagnose: [] });
  }
  return out;
}

/**
 * The lane accounts the runners actually sign in with: test-data/users/agent-user-pool.csv, one row per slot
 * (personal + B2B). A missing or locked slot account sends that lane's runner to the config.js personas
 * (test-runner-agent Phase 1) — two lanes on one persona collide, which reads as product failures. A WARN, not a
 * BLOCK: the run still works, and stopping it would hide the cases that are fine.
 */
export async function laneAccountChecks(root: string, env: string, c: EnvCoords, token: string | null, slots = 3): Promise<Check[]> {
  const p = join(root, "test-data/users/agent-user-pool.csv");
  if (!existsSync(p)) return [];
  const rows = parseCsv(readFileSync(p, "utf-8").replace(/^﻿/, ""), { columns: true, skip_empty_lines: true, relax_column_count: true }) as Record<string, string>[];
  const out: Check[] = [];
  let usable = 0, checked = 0;
  for (const r of rows.filter((x) => /^[0-9]+$/.test(x.slot) && Number(x.slot) <= slots)) {
    const bad: string[] = [];
    for (const [kind, email] of [["personal", r.personal_email], ["b2b", r.b2b_email]] as const) {
      if (!email) continue;
      if (!token || !c.backUrl) return [{ id: "lanes:accounts", status: "UNKNOWN", found: "lane accounts not checked (no admin token)", who: "you", do: `fix the admin credentials for ${env}`, diagnose: [] }];
      const { user, status } = await lookupAccount(c, token, email);
      const pr = accountProblems(user, status);
      if (pr.length) bad.push(`${kind} ${email}: ${pr.join("; ")}`);
    }
    checked++;
    if (bad.length) out.push({ id: `lane-account:slot${r.slot}`, status: "WARN", found: `slot ${r.slot} (${r.server_name}): ${bad.join(" · ")}`, who: "me, with OK",
      do: `provision or reset the slot account on ${env} (npm run seed:company-users / /qa-seed-data users); until then this lane's runner falls back to the config.js personas`, diagnose: ["node scripts/seed-data/validate-credentials.mjs"] });
    else usable++;
  }
  if (checked && !usable) out.push({ id: "lane-accounts", status: "WARN", found: `no lane slot account is usable on ${env}: every lane falls back to the config.js personas, so parallel lanes share accounts`, who: "me, with OK", do: `seed the slot accounts on ${env} (npm run seed:company-users) before running more than one lane`, diagnose: [] });
  if (checked && usable === checked) out.push({ id: "lane-accounts", status: "OK", found: `${checked} lane slot(s) usable on ${env}`, who: null, do: null, diagnose: [] });
  return out;
}

/** The env's block of vc-deploy-dev `infra/environments.yml`, flattened to dotted keys. */
async function readDeployYml(c: EnvCoords): Promise<Map<string, string> | { unknown: string }> {
  setToken(process.env.GIT_TOKEN || process.env.GITHUB_TOKEN);
  const j = await ghJson(`https://api.github.com/repos/${c.deployOwner}/${c.deployRepo}/contents/infra/environments.yml?ref=${encodeURIComponent(c.branch)}`).catch(() => null);
  if (!j?.content) return { unknown: `infra/environments.yml not readable at ${c.deployRepo}@${c.branch}` };
  let doc: unknown;
  // Real files carry duplicated keys (commented-out alternatives left in place); the deploy tooling reads the last one.
  try { doc = parseYaml(Buffer.from(j.content, "base64").toString("utf8"), { uniqueKeys: false }); } catch (e) { return { unknown: `infra/environments.yml does not parse: ${(e as Error).message.split("\n")[0]}` }; }
  const list = Array.isArray(doc) ? doc : [doc];
  const block = list.find((e: any) => e?.name === c.branch) ?? (list.length === 1 ? list[0] : null);
  if (!block) return { unknown: `no environment named ${c.branch} in infra/environments.yml` };
  const flat = new Map<string, string>();
  const walk = (o: unknown, pre: string) => {
    if (o !== null && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, pre ? `${pre}.${k}` : k);
    else flat.set(pre, String(o));
  };
  walk(block, "");
  return flat;
}

const norm = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "string" ? v.trim().toLowerCase() : JSON.stringify(v).toLowerCase());
function meets(r: Requirement, value: unknown, present: boolean): boolean {
  if (r.allowedIncludes) return present && Array.isArray(value) && r.allowedIncludes.every((v) => (value as unknown[]).map(norm).includes(norm(v)));
  if (r.equals !== undefined) return present && norm(value) === norm(r.equals);
  if (r.notEquals !== undefined) return !present || norm(value) !== norm(r.notEquals);
  if (r.nonEmpty || r.prefix) return present && norm(value) !== "" && norm(value) !== "[]" && norm(value) !== "null";
  return present;
}
const want = (r: Requirement) => r.allowedIncludes ? `to offer ${r.allowedIncludes.map((v) => JSON.stringify(v)).join(", ")}` : r.equals !== undefined ? `= ${JSON.stringify(r.equals)}` : r.notEquals !== undefined ? `≠ ${JSON.stringify(r.notEquals)}` : "set";

export async function declaredChecks(env: string, c: EnvCoords, token: string | null, reqs: { suite: string; r: Requirement }[]): Promise<Check[]> {
  if (!reqs.length) return [];
  const storeId = process.env.STORE_ID || "B2B-store";
  const auth = token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : null;
  const getJson = async (url: string, init?: RequestInit) => {
    if (!auth || !c.backUrl) return null;
    try { const r = await fetch(`${c.backUrl}${url}`, { headers: auth, ...init }); return r.status === 200 ? await r.json() : null; } catch { return null; }
  };
  const kinds = new Set(reqs.map((x) => x.r.kind));
  const store = kinds.has("storeSetting") ? await getJson(`/api/stores/${encodeURIComponent(storeId)}`) : null;
  const payments = kinds.has("paymentMethod") ? await getJson(`/api/payment/search`, { method: "POST", body: JSON.stringify({ storeId, take: 100 }) }) : null;
  const yml = kinds.has("deployConfig") || kinds.has("uploadScope") ? await readDeployYml(c) : null;
  const platform = new Map<string, unknown>();

  // One row per distinct requirement; the suites and cases that need it are listed together.
  const groups = new Map<string, { r: Requirement; suites: Set<string>; cases: Set<string> }>();
  for (const { suite, r } of reqs) {
    const k = `${r.kind}:${r.name}:${want(r)}`;
    const g = groups.get(k) ?? { r, suites: new Set<string>(), cases: new Set<string>() };
    g.suites.add(suite);
    for (const cid of r.cases ?? []) g.cases.add(`${suite}/${cid}`);
    if (r.level === "block") g.r = { ...g.r, level: "block" };
    groups.set(k, g);
  }
  const out: Check[] = [];
  for (const [, g] of groups) {
    const r = g.r;
    let value: unknown, present = false, unknown: string | null = null, where = "";
    if (r.kind === "storeSetting") {
      if (!store) unknown = `store ${storeId} not readable (admin token?)`;
      else { const s = (store.settings ?? []).find((x: any) => x.name === r.name); present = !!s; value = s ? s.value ?? s.defaultValue : undefined; where = `store ${storeId}`; }
    } else if (r.kind === "platformSetting") {
      if (!platform.has(r.name)) platform.set(r.name, await getJson(`/api/platform/settings/${encodeURIComponent(r.name)}`));
      const s: any = platform.get(r.name);
      if (!auth) unknown = "no admin token";
      else { present = !!s; value = s ? (r.allowedIncludes ? s.allowedValues ?? [] : s.value ?? s.defaultValue) : undefined; where = r.allowedIncludes ? "platform, allowed values" : "platform"; }
    } else if (r.kind === "paymentMethod") {
      if (!payments) unknown = `payment methods of ${storeId} not readable`;
      else { const m = (payments.results ?? []).find((x: any) => x.code === r.name); present = !!m; value = m ? m.isActive : undefined; where = `store ${storeId} payment methods (isActive)`; }
    } else if (yml && "unknown" in yml) {
      unknown = yml.unknown;
    } else if (yml) {
      where = `vc-deploy-dev ${c.branch} infra/environments.yml`;
      if (r.kind === "uploadScope") {
        const scopes = [...yml].filter(([k]) => /^platform\.config\.FileUpload__Scopes__\d+__Scope$/.test(k)).map(([, v]) => v);
        present = scopes.includes(r.name); value = scopes.join(", ") || "(none)";
      } else if (r.prefix) {
        const hits = [...yml].filter(([k]) => k.startsWith(r.name)).map(([, v]) => v);
        present = hits.length > 0; value = hits.join(", ");
      } else { present = yml.has(r.name); value = yml.get(r.name); }
    }
    const cases = g.cases.size ? ` — ${count(g.cases)}: ${bySuite(g.cases)}` : ` — suites ${[...g.suites].join(", ")}`;
    const id = `req:${r.kind}:${r.name}`;
    if (unknown) { out.push({ id, status: "UNKNOWN", found: `${r.name}: not checked (${unknown})${cases}`, who: "you", do: "make it readable (admin credentials / GIT_TOKEN) and re-run", diagnose: [] }); continue; }
    const ok = r.kind === "uploadScope" ? present : meets(r, value, present);
    const shown = r.kind === "uploadScope" ? `scopes: ${value}` : present ? `${r.name} = ${JSON.stringify(value)}` : `${r.name} not set`;
    const absent = r.allowedIncludes && Array.isArray(value) ? r.allowedIncludes.filter((v) => !(value as unknown[]).map(norm).includes(norm(v))) : [];
    if (ok) { out.push({ id, status: "OK", found: `${shown} (${where})${cases}`, who: null, do: null, diagnose: [] }); continue; }
    const fix = r.kind === "storeSetting" ? `set ${r.name} ${want(r)} on store ${storeId} (Admin › Stores › ${storeId} › Settings) — a shared-env write`
      : r.kind === "platformSetting" && absent.length ? `add ${absent.map((v) => JSON.stringify(v)).join(", ")} to the allowed values of ${r.name} (Admin › Settings, or PUT /api/platform/settings with the full list) — a shared-env write`
      : r.kind === "platformSetting" ? `set ${r.name} ${want(r)} (Admin › Settings) — a shared-env write`
      : r.kind === "paymentMethod" ? `activate ${r.name} on store ${storeId} (Admin › Stores › ${storeId} › Payment methods), with a working sandbox configuration`
      : `TEST_ENV=${env} npm run deploy:env-config -- --env ${env} --apply — opens ONE vc-deploy-dev PR to ${c.branch} with the value copied from vcst-qa / vcptcore-qa; you merge it (merging deploys)`;
    out.push({ id, status: r.level === "block" ? "BLOCK" : "WARN", found: `${shown}, needs ${r.kind === "uploadScope" ? `scope "${r.name}"` : want(r)} (${where}): ${r.why}${cases}`,
      who: "me, with OK", do: fix, diagnose: [], cases: [...g.cases] });
  }
  return out;
}

/** All case-level checks for the selected suites. Read-only. */
export async function requirementChecks(o: { root: string; env: string; suites: SuiteFile[] }): Promise<Check[]> {
  const reqFile = loadRequirements(o.root);
  const needs = collectCaseNeeds(o.root, o.suites);
  let c: EnvCoords | null = null, token: string | null = null;
  try { c = resolveEnvCoords(o.env); } catch { /* reported per row as UNKNOWN */ }
  // One retry: without the token every account and module check degrades to UNKNOWN, and a single dropped
  // connection is common enough on a busy stand to cost the whole case-level half (2026-10-20, vcptcore_regression).
  for (let i = 0; c && !token && i < 2; i++) { try { token = await getAdminToken(c); } catch { /* retried, then UNKNOWN */ } }
  const checks: Check[] = [];
  for (const s of needs.unreadable) checks.push({ id: `case-needs:${s}`, status: "UNKNOWN", found: `suite ${s}: CSV not readable, its personas and fixtures were not checked`, who: "me", do: "npm run suites:lint", diagnose: [] });
  const installed = c && reqFile.personas ? await installedModules(c, token) : null;
  checks.push(...fixtureChecks(o.root, o.env, needs.refs, { reqs: reqFile.personas, installed }));
  if (c) checks.push(...await laneAccountChecks(o.root, o.env, c, token));
  if (c) checks.push(...await personaChecks(o.root, o.env, c, token, needs.personas, { reqs: reqFile.personas, installed }));
  const declared = o.suites.flatMap((s) => (reqFile.suites[s.id] ?? []).map((r) => ({ suite: s.id, r })));
  if (c) checks.push(...await declaredChecks(o.env, c, token, declared));
  return checks;
}
