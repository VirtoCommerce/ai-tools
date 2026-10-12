// scripts/lib/env-facts.ts — the pre-flight FACT CORE. Read-only, no policy: it never says
// OK/WARN/BLOCK. Every source can be UNKNOWN on its own without failing the others.
// Spec: docs/superpowers/specs/2026-10-08-preflight-skill-design.md §4.
import { basename } from "node:path";
import { CORE_REQUIRED_VARS, promoteEnvSuffix } from "./env-core.js";
import { resolveTestEnv } from "./resolve-test-env.js";
import { loadEnvFiles, resolveEnvCoords, REPO_ROOT, type EnvCoords } from "../deploy/lib/env.ts";
import { fetchFile, setToken } from "../deploy/lib/github.ts";
import { platformHealthy, probeAdminToken, probeLiveModules } from "../deploy/lib/live.ts";
import { listPinnedModules, THEME_URL_RE } from "../deploy/lib/manifest.ts";
import { probeStorefrontModules } from "./storefront-caps.mjs";
import { readLedger, type Ledger, type LedgerRow } from "./release-ledger-read.ts";
import { cmpSemver } from "../maintenance/refresh-release-ledger.mjs";
import { repoFromProjectUrl, moduleIdToRepoGuess } from "../../plugins/vc-fix/skills/qa-fix-routing/module-registry.ts";

export interface Unknown { unknown: string }
export const isUnknown = (v: unknown): v is Unknown => typeof v === "object" && v !== null && "unknown" in v;
const U = (reason: string): Unknown => ({ unknown: reason });

export interface DeployedModule { version: string; repo: string | null; repoGuessed: boolean }
export interface DriftRow { id: string; declared: string | null; deployed: string | null }
export interface ReleasedNotDeployed { component: string; repo: string; released: string; deployed: string | null; feature: string }
/** `releasedNotDeployed` is UNKNOWN when `deployed` is — "released, not deployed" cannot be told from "not probed". */
/** A released component whose deployed version no live source reports (vc-platform, vc-frontend): unknown, never "not deployed". */
export interface NoLiveSource { component: string; repo: string; released: string }
export interface LedgerFacts { generated: string | null; stale: boolean | null; releasedNotDeployed: ReleasedNotDeployed[] | Unknown; noLiveSource: NoLiveSource[]; breaking: LedgerRow[] }
export interface EnvFacts {
  env: string; observedAt: string; backUrl: string; frontUrl: string;
  config: { missing: string[] };
  health: "UP" | "DOWN" | Unknown;
  declared: { platform: string | null; theme: string | null; modules: Record<string, string> } | Unknown;
  deployed: { platform: Unknown; modules: Record<string, DeployedModule> } | Unknown;
  storefrontVisible: { versionsHidden: boolean; modules: Record<string, string> } | Unknown | null;
  drift: DriftRow[] | Unknown;
  ledger: LedgerFacts | Unknown;
  components: { input: string; repo: string | null }[];
}
export interface EnvFactsOptions { env?: string; components?: string[]; storefront?: boolean; now?: Date }

/** The base version a PR / prerelease build is built from: 3.1006.0-pr-21-8964 → 3.1006.0. */
export const baseOf = (v: string) => v.split("-")[0];

export function computeDrift(declared: Record<string, string>, deployed: Record<string, DeployedModule>): DriftRow[] {
  const ids = [...new Set([...Object.keys(declared), ...Object.keys(deployed)])].sort();
  const rows: DriftRow[] = [];
  for (const id of ids) {
    const d = declared[id] ?? null;
    const l = deployed[id]?.version ?? null;
    if (d !== l) rows.push({ id, declared: d, deployed: l });
  }
  return rows;
}

export function computeLedgerFacts(ledger: Ledger, deployed: Record<string, DeployedModule> | null, repos: string[], now: Date): LedgerFacts | Unknown {
  // Neither §1 nor §2 parsed ⇒ the headings drifted from the reader, not "nothing shipped".
  if (ledger.latest.length === 0 && ledger.rows.length === 0) return U("ledger-unparsed");
  const wanted = new Set(repos);
  const deployedByRepo = new Map<string, string>();
  for (const m of Object.values(deployed ?? {})) if (m.repo) deployedByRepo.set(m.repo, m.version);
  // /api/platform/modules reports modules only: vc-platform and vc-frontend have no live version, so their
  // releases are UNKNOWN against the stand — never "not deployed" (spec §4: UNKNOWN is never upgraded).
  const hasLiveSource = (repo: string) => /^vc-module-/.test(repo) || deployedByRepo.has(repo);
  const noLive = new Map<string, NoLiveSource>();
  for (const row of ledger.rows) {
    if (!wanted.has(row.repo) || hasLiveSource(row.repo)) continue;
    const prev = noLive.get(row.repo);
    if (!prev || cmpSemver(row.version, prev.released) > 0) noLive.set(row.repo, { component: row.component, repo: row.repo, released: row.version });
  }
  let releasedNotDeployed: ReleasedNotDeployed[] | Unknown = U("deployed-unknown");
  if (deployed) {
    const rows: ReleasedNotDeployed[] = [];
    for (const row of ledger.rows) {
      if (!wanted.has(row.repo) || !hasLiveSource(row.repo)) continue;
      const live = deployedByRepo.get(row.repo) ?? null;
      // A PR build of the released base counts as having it (Review Focus 2).
      if (live !== null && cmpSemver(baseOf(live), row.version) >= 0) continue;
      rows.push({ component: row.component, repo: row.repo, released: row.version, deployed: live, feature: row.feature });
    }
    releasedNotDeployed = rows;
  }
  const breaking = ledger.rows.filter((r) => r.breaking && wanted.has(r.repo));
  // An unparsable `generated` date is UNKNOWN freshness, never "fresh".
  const generatedMs = ledger.generated ? new Date(ledger.generated).getTime() : NaN;
  const stale = Number.isNaN(generatedMs) || ledger.staleAfterDays === null ? null : (now.getTime() - generatedMs) / 86_400_000 > ledger.staleAfterDays;
  return { generated: ledger.generated, stale, releasedNotDeployed, noLiveSource: [...noLive.values()], breaking };
}

export function resolveComponentRepos(inputs: string[], ledger: Ledger | null, deployed: Record<string, DeployedModule> | null): { input: string; repo: string | null }[] {
  return inputs.map((input) => {
    const s = input.trim();
    if (/^vc-/i.test(s)) return { input, repo: s.toLowerCase() };
    if (/^VirtoCommerce\./i.test(s)) {
      const live = deployed?.[s.toLowerCase()];
      // moduleIdToRepoGuess strips only a PascalCase prefix: normalise it so any casing guesses the same repo.
      return { input, repo: live?.repo ?? moduleIdToRepoGuess(s.replace(/^virtocommerce\./i, "VirtoCommerce.")) };
    }
    const byName = ledger?.latest.find((l) => l.component.toLowerCase() === s.toLowerCase());
    return { input, repo: byName?.repo ?? null };
  });
}

/**
 * Coordinates for the live probe. Deploy coordinates (repo, branch, paths) come from
 * resolveEnvCoords; the connection identity comes from the LAYERED process.env this module just
 * loaded for `env` — config.js precedence, so a .env.local ADMIN/BACK_URL override is paired with
 * the .env.local password instead of the committed .env.<env> values. resolveEnvCoords itself stays
 * file-first because vc-deploy resolves envs other than the loaded one.
 */
export function probeCoords(env: string): EnvCoords {
  const c = resolveEnvCoords(env);
  return {
    ...c,
    backUrl: (process.env.BACK_URL || c.backUrl).replace(/\/$/, ""),
    admin: process.env.ADMIN || c.admin,
    password: process.env.ADMIN_PASSWORD || c.password,
  };
}

export async function getEnvFacts(opts: EnvFactsOptions = {}): Promise<EnvFacts> {
  const env = opts.env ?? resolveTestEnv("vcst");
  const now = opts.now ?? new Date();
  loadEnvFiles(env);
  promoteEnvSuffix(env);
  setToken(process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN);
  const c = probeCoords(env);
  const frontUrl = (process.env.FRONT_URL || "").replace(/\/$/, "");
  const missing = CORE_REQUIRED_VARS.filter((v) => !process.env[v]);
  if (!c.backUrl && !missing.includes("BACK_URL")) missing.push("BACK_URL");

  const health: EnvFacts["health"] = c.backUrl ? ((await platformHealthy(c)) ? "UP" : "DOWN") : U("no-back-url");

  // declared — vc-deploy-dev, branch per env
  let declared: EnvFacts["declared"];
  try {
    const pk = await fetchFile(c, c.packagesPath);
    const modules: Record<string, string> = {};
    for (const m of listPinnedModules(pk.json)) modules[m.id.toLowerCase()] = m.version;
    let theme: string | null = null;
    try {
      const th = await fetchFile(c, c.themePath);
      const url = THEME_URL_RE.exec(th.text)?.[0];
      theme = url ? basename(url).replace(/\.zip$/i, "") : null;
    } catch { theme = null; }
    declared = { platform: pk.json.PlatformImageTag ?? pk.json.PlatformVersion ?? null, theme, modules };
  } catch (e) {
    declared = U(`vc-deploy-dev: ${(e as Error).message}`);
  }

  // deployed — the only ground truth; platform has no live source
  let deployed: EnvFacts["deployed"];
  const tok = await probeAdminToken(c);
  if (!tok.token) {
    deployed = U(tok.status === "no-back-url" ? "no-back-url" : `token: ${tok.status}`);
  } else {
    const live = await probeLiveModules(c, tok.token);
    if (!live.ok) deployed = U(`modules: ${live.status}`);
    else {
      const modules: Record<string, DeployedModule> = {};
      for (const m of live.modules) {
        const fromUrl = repoFromProjectUrl(m.projectUrl);
        modules[m.id.toLowerCase()] = { version: m.version, repo: fromUrl ?? moduleIdToRepoGuess(m.id), repoGuessed: !fromUrl };
      }
      deployed = { platform: U("no-live-source"), modules };
    }
  }

  let storefrontVisible: EnvFacts["storefrontVisible"] = null;
  if (opts.storefront) {
    let domain: string | null = null;
    try { domain = frontUrl ? new URL(frontUrl).host : null; } catch { domain = null; }
    if (!c.backUrl || !frontUrl) storefrontVisible = U("no-back-or-front-url");
    else if (!domain) storefrontVisible = U("front-url-unparsable");
    else {
      const sf = await probeStorefrontModules({ backUrl: c.backUrl, domain, root: REPO_ROOT });
      storefrontVisible = sf.ok
        ? { versionsHidden: sf.versionsHidden, modules: Object.fromEntries(sf.modules.map((m: { moduleId: string; version: string }) => [m.moduleId.toLowerCase(), m.version])) }
        : U(sf.reason);
    }
  }

  const deployedMods = isUnknown(deployed) ? null : deployed.modules;
  const drift: EnvFacts["drift"] = isUnknown(declared) || !deployedMods
    ? U(isUnknown(declared) ? "declared-unknown" : "deployed-unknown")
    : computeDrift(declared.modules, deployedMods);

  let ledgerDoc: Ledger | null = null;
  let ledgerError: string | null = null;
  try { ledgerDoc = readLedger(); } catch (e) { ledgerError = (e as Error).message; }
  const components = resolveComponentRepos(opts.components ?? [], ledgerDoc, deployedMods);
  const repos = components.map((x) => x.repo).filter((r): r is string => !!r);
  const ledger: EnvFacts["ledger"] = ledgerError !== null ? U(`ledger: ${ledgerError}`)
    : ledgerDoc ? computeLedgerFacts(ledgerDoc, deployedMods, repos, now) : U("ledger-file-absent");

  return { env, observedAt: now.toISOString(), backUrl: c.backUrl, frontUrl, config: { missing }, health, declared, deployed, storefrontVisible, drift, ledger, components };
}
