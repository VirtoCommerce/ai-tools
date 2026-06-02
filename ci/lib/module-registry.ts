/**
 * Module Registry — module dependency graph sourced from the VirtoCommerce
 * **Platform API** (the authoritative, resolved graph of the running env), not
 * from scraping 100+ GitHub manifests.
 *
 *   GET  {BACK_URL}/api/platform/modules            → ModuleDescriptor[]
 *        (Id, Version, Dependencies[], ProjectUrl, …) — ProjectUrl gives the
 *        authoritative module-ID → repo mapping (e.g. VirtoCommerce.Xapi →
 *        vc-module-experience-api, which a name heuristic cannot derive).
 *   POST {BACK_URL}/api/platform/modules/getdependents          → reverse graph
 *        body: [{ "id": "<moduleId>" }]  → modules that depend ON it (impact).
 *   POST {BACK_URL}/api/platform/modules/getmissingdependencies → expand deps.
 *
 * Auth: OAuth2 password grant (no client_id), admin creds from env — see
 * `.claude/agents/knowledge/api-auth.md`. The installed-modules list is disk
 * cached with a TTL so repeated runs don't re-hit the API.
 *
 * Everything is best-effort: if BACK_URL/creds are absent or a call fails, the
 * functions degrade (return [] / heuristic) so the fix pipeline still runs —
 * it just won't show dependency context.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

const BACK_URL = (process.env.BACK_URL || "").replace(/\/$/, "");
const ADMIN = process.env.ADMIN || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const STORE_ID = process.env.STORE_ID || "B2B-store";
const TTL_MS = parseInt(process.env.MODULE_REGISTRY_TTL_H || "24", 10) * 3600 * 1000;
const CACHE_PATH =
  process.env.MODULE_REGISTRY_CACHE ||
  join("ci", "config", ".module-registry.cache.json");

if (process.env.FIX_INSECURE_TLS === "true") {
  // vcst-qa may present a cert Node rejects; opt-in relaxation for CI only.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

// ---------------------------------------------------------------------------
// Types (subset of the platform's ModuleDescriptor)
// ---------------------------------------------------------------------------

export interface ModuleIdentity {
  id: string;
  version?: string;
  optional?: boolean;
}

export interface ModuleDescriptor {
  id: string; // e.g. "VirtoCommerce.XCart"
  version?: string;
  projectUrl?: string; // e.g. "https://github.com/VirtoCommerce/vc-module-x-cart"
  dependencies?: ModuleIdentity[];
  isInstalled?: boolean;
}

export interface DepEdge {
  moduleId: string;
  repo: string | null; // bare repo name (no org), or null if unresolved
}

// ---------------------------------------------------------------------------
// Auth + HTTP
// ---------------------------------------------------------------------------

let cachedToken: { token: string; expiresAt: number } | null = null;

function apiConfigured(): boolean {
  return Boolean(BACK_URL && ADMIN_PASSWORD);
}

async function getToken(): Promise<string | null> {
  if (!apiConfigured()) return null;
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const body = new URLSearchParams({
    grant_type: "password",
    scope: "offline_access",
    username: ADMIN,
    password: ADMIN_PASSWORD,
    storeId: STORE_ID,
  });
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    console.warn(`module-registry: token request failed — ${res.status}`);
    return null;
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

async function apiGet<T>(path: string): Promise<T | null> {
  const token = await getToken();
  if (!token) return null;
  const res = await fetch(`${BACK_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    console.warn(`module-registry: GET ${path} failed — ${res.status}`);
    return null;
  }
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, jsonBody: unknown): Promise<T | null> {
  const token = await getToken();
  if (!token) return null;
  const res = await fetch(`${BACK_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(jsonBody),
  });
  if (!res.ok) {
    console.warn(`module-registry: POST ${path} failed — ${res.status}`);
    return null;
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Module list (disk cached) + indices
// ---------------------------------------------------------------------------

interface Cache {
  ts: number;
  backUrl: string;
  modules: ModuleDescriptor[];
}

function readCache(): ModuleDescriptor[] | null {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const c = JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as Cache;
    if (c.backUrl === BACK_URL && Date.now() - c.ts < TTL_MS) return c.modules;
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(modules: ModuleDescriptor[]): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(
    CACHE_PATH,
    JSON.stringify({ ts: Date.now(), backUrl: BACK_URL, modules } satisfies Cache, null, 2),
  );
}

let memoModules: ModuleDescriptor[] | null = null;

/** All installed modules (cached: memory → disk → API). [] if unavailable. */
export async function getModules(): Promise<ModuleDescriptor[]> {
  if (memoModules) return memoModules;
  const disk = readCache();
  if (disk) return (memoModules = disk);

  const modules = await apiGet<ModuleDescriptor[]>("/api/platform/modules");
  if (!modules) return [];
  writeCache(modules);
  return (memoModules = modules);
}

/** Extract a bare repo name from a GitHub project URL, or null. */
export function repoFromProjectUrl(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/github\.com\/[^/]+\/([^/#?]+?)(?:\.git)?(?:[/#?]|$)/i);
  return m ? m[1] : null;
}

/** Heuristic fallback when the API has no ProjectUrl: VirtoCommerce.XCart → vc-module-x-cart. */
export function moduleIdToRepoGuess(moduleId: string): string {
  const core = moduleId.replace(/^VirtoCommerce\./, "");
  const kebab = core
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
  return `vc-module-${kebab}`;
}

// ---------------------------------------------------------------------------
// Graph queries (all async, all best-effort)
// ---------------------------------------------------------------------------

async function buildIndices(): Promise<{
  byRepo: Map<string, ModuleDescriptor>;
  idToRepo: (id: string) => string | null;
}> {
  const modules = await getModules();
  const byRepo = new Map<string, ModuleDescriptor>();
  const idMap = new Map<string, string>();
  for (const m of modules) {
    const repo = repoFromProjectUrl(m.projectUrl);
    if (repo) {
      byRepo.set(repo, m);
      idMap.set(m.id, repo);
    }
  }
  const idToRepo = (id: string): string | null =>
    idMap.get(id) || (modules.length === 0 ? moduleIdToRepoGuess(id) : null);
  return { byRepo, idToRepo };
}

/** Authoritative module-ID → repo (via ProjectUrl); heuristic only if API is down. */
export async function moduleIdToRepo(moduleId: string): Promise<string | null> {
  const { idToRepo } = await buildIndices();
  return idToRepo(moduleId);
}

/** Discovered repo names (derived from installed modules' ProjectUrls). */
export async function discoverModuleRepos(): Promise<string[]> {
  const { byRepo } = await buildIndices();
  return [...byRepo.keys()];
}

/** Direct dependencies of a repo (modules IT needs), mapped to repo targets. */
export async function dependenciesOf(repo: string): Promise<DepEdge[]> {
  const { byRepo, idToRepo } = await buildIndices();
  const mod = byRepo.get(repo);
  if (!mod?.dependencies) return [];
  return mod.dependencies.map((d) => ({ moduleId: d.id, repo: idToRepo(d.id) }));
}

/**
 * Reverse edges: repos that depend ON `repo` (impacted by a fix here).
 * Uses the platform's getdependents endpoint — authoritative, one call.
 */
export async function dependentsOf(repo: string): Promise<DepEdge[]> {
  const { byRepo, idToRepo } = await buildIndices();
  const mod = byRepo.get(repo);
  if (!mod) return [];
  const dependents = await apiPost<ModuleDescriptor[]>(
    "/api/platform/modules/getdependents",
    [{ id: mod.id }],
  );
  if (!dependents) return [];
  return dependents.map((d) => ({ moduleId: d.id, repo: idToRepo(d.id) }));
}
