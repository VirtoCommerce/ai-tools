// scripts/lib/env-facts.ts — the pre-flight FACT CORE. Read-only, no policy: it never says
// OK/WARN/BLOCK. Every source can be UNKNOWN on its own without failing the others.
// Spec: docs/superpowers/specs/2026-10-08-preflight-skill-design.md §4.
import { basename } from "node:path";
import { CORE_REQUIRED_VARS } from "./env-core.js";
import { selectTestEnv } from "./load-env.mjs";
import { isLocalUrl, loadEnvFiles, resolveEnvCoords, REPO_ROOT, type EnvCoords } from "../deploy/lib/env.ts";
import { fetchFile, setToken } from "../deploy/lib/github.ts";
import { platformHealthy, probeAdminToken, probeLiveModules, probePlatformVersion, probeThemeVersion, type LiveModule } from "../deploy/lib/live.ts";
import { listPinnedModules, THEME_URL_RE } from "../deploy/lib/manifest.ts";
import { probeStorefrontModules } from "./storefront-caps.mjs";
import { readLedger, type Ledger, type LedgerRow } from "./release-ledger-read.ts";
import { cmpSemver } from "../maintenance/refresh-release-ledger.mjs";
import { repoFromProjectUrl, moduleIdToRepoGuess } from "../../plugins/vc-fix/skills/qa-fix-routing/module-registry.ts";

export interface Unknown { unknown: string }
export const isUnknown = (v: unknown): v is Unknown => typeof v === "object" && v !== null && "unknown" in v;
const U = (reason: string): Unknown => ({ unknown: reason });
/** `declared` on a stand whose BACK_URL is on this machine: no vc-deploy-dev manifest to read. */
export const LOCAL_STAND = "local stand: no vc-deploy-dev branch, it runs its own build";

export interface DeployedModule { version: string; repo: string | null; repoGuessed: boolean; loadErrors: string[] }

/** The deployed module map: lower-cased id → module. A module the API lists as not installed is not deployed. */
export function toDeployedModules(list: LiveModule[]): Record<string, DeployedModule> {
  const modules: Record<string, DeployedModule> = {};
  for (const m of list) {
    if (m.isInstalled === false) continue;
    const fromUrl = repoFromProjectUrl(m.projectUrl);
    modules[m.id.toLowerCase()] = { version: m.version, repo: fromUrl ?? moduleIdToRepoGuess(m.id), repoGuessed: !fromUrl, loadErrors: m.loadErrors };
  }
  return modules;
}
export interface DriftRow { id: string; declared: string | null; deployed: string | null }
export interface ReleasedNotDeployed { component: string; repo: string; released: string; deployed: string | null; feature: string }
/** `releasedNotDeployed` is UNKNOWN when `deployed` is — "released, not deployed" cannot be told from "not probed". */
/** A released component whose deployed version no live source reports (vc-frontend when the storefront bundle gave no version; vc-platform when the Admin page gave none): unknown, never "not deployed". */
export interface NoLiveSource { component: string; repo: string; released: string }
export interface LedgerFacts { generated: string | null; stale: boolean | null; releasedNotDeployed: ReleasedNotDeployed[] | Unknown; noLiveSource: NoLiveSource[]; breaking: LedgerRow[] }
export interface EnvFacts {
  env: string; observedAt: string; backUrl: string; frontUrl: string;
  config: { missing: string[] };
  health: "UP" | "DOWN" | Unknown;
  declared: { platform: string | null; theme: string | null; modules: Record<string, string> } | Unknown;
  deployed: { platform: string | Unknown; modules: Record<string, DeployedModule> } | Unknown;
  /** The storefront theme (vc-frontend) version, read anonymously from FRONT_URL's entry bundle — not behind the admin token. */
  deployedTheme: string | Unknown;
  storefrontVisible: { versionsHidden: boolean; modules: Record<string, string> } | Unknown | null;
  drift: DriftRow[] | Unknown;
  ledger: LedgerFacts | Unknown;
  components: { input: string; repo: string | null }[];
}
export interface EnvFactsOptions { env?: string; components?: string[]; storefront?: boolean; now?: Date }

/** The base version a PR / prerelease build is built from: 3.1006.0-pr-21-8964 → 3.1006.0. */
export const baseOf = (v: string) => v.split("-")[0];

/** Platform drift on BASE versions: a PR image tag (3.1057.0-pr-3095-…) and its live string match. */
export function platformDrift(declared: string | null, deployed: string | null): DriftRow | null {
  if (!declared || !deployed || baseOf(declared) === baseOf(deployed)) return null;
  return { id: "platform", declared, deployed };
}

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

export function computeLedgerFacts(ledger: Ledger, deployed: Record<string, DeployedModule> | null, repos: string[], now: Date, platformVersion: string | null = null, themeVersion: string | null = null): LedgerFacts | Unknown {
  // Neither §1 nor §2 parsed ⇒ the headings drifted from the reader, not "nothing shipped".
  if (ledger.latest.length === 0 && ledger.rows.length === 0) return U("ledger-unparsed");
  const wanted = new Set(repos);
  const deployedByRepo = new Map<string, string>();
  for (const m of Object.values(deployed ?? {})) if (m.repo) deployedByRepo.set(m.repo, m.version);
  // The platform's live version comes from the Admin page, not the modules API (probePlatformVersion).
  if (platformVersion) deployedByRepo.set("vc-platform", platformVersion);
  // The theme's live version comes from the storefront entry bundle (probeThemeVersion).
  if (themeVersion) deployedByRepo.set("vc-frontend", themeVersion);
  // /api/platform/modules reports modules only: vc-frontend (when the storefront bundle gave no version) and
  // vc-platform (when the Admin page gave none) have no live version, so their releases are UNKNOWN against the stand — never "not deployed"
  // (spec §4: UNKNOWN is never upgraded).
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
  const env = opts.env ?? selectTestEnv("vcst"); // not resolveTestEnv: loadEnvFiles is ambientWins (load-env.mjs selectTestEnv)
  const now = opts.now ?? new Date();
  loadEnvFiles(env); // the layers, the KEY_<ENV> promotion, the QA_ENV_PATH folders, the master password
  setToken(process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN);
  const c = probeCoords(env);
  const frontUrl = (process.env.FRONT_URL || "").replace(/\/$/, "");
  const missing = CORE_REQUIRED_VARS.filter((v) => !process.env[v]);
  if (!c.backUrl && !missing.includes("BACK_URL")) missing.push("BACK_URL");

  const health: EnvFacts["health"] = c.backUrl ? ((await platformHealthy(c)) ? "UP" : "DOWN") : U("no-back-url");

  // declared — vc-deploy-dev, branch per env. A local stand has no branch there: it runs its own build, which
  // `deployed` and `--expect` read off the stand itself.
  let declared: EnvFacts["declared"];
  if (isLocalUrl(c.backUrl)) declared = U(LOCAL_STAND);
  else try {
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

  // deployed — the only ground truth. Modules from /api/platform/modules (token); the platform from the
  // anonymous Admin page (kb KB-B858E12A), so its version is known even when it is not in the modules API.
  const pv = await probePlatformVersion(c);
  const livePlatform: string | Unknown = pv.ok ? pv.version : U(`admin-page: ${pv.status}`);
  let deployed: EnvFacts["deployed"];
  const tok = await probeAdminToken(c);
  if (!tok.token) {
    deployed = U(tok.status === "no-back-url" ? "no-back-url" : `token: ${tok.status}`);
  } else {
    const live = await probeLiveModules(c, tok.token);
    if (!live.ok) deployed = U(`modules: ${live.status}`);
    else {
      deployed = { platform: livePlatform, modules: toDeployedModules(live.modules) };
    }
  }

  const tv = await probeThemeVersion(frontUrl);
  const deployedTheme: string | Unknown = tv.ok ? tv.version : U(`storefront-bundle: ${tv.status}`);

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
  const platformVersion = isUnknown(livePlatform) ? null : livePlatform;
  let drift: EnvFacts["drift"];
  if (isUnknown(declared) || !deployedMods) drift = U(isUnknown(declared) ? "declared-unknown" : "deployed-unknown");
  else {
    const pd = platformDrift(declared.platform, platformVersion);
    drift = [...(pd ? [pd] : []), ...computeDrift(declared.modules, deployedMods)];
  }

  let ledgerDoc: Ledger | null = null;
  let ledgerError: string | null = null;
  try { ledgerDoc = readLedger(); } catch (e) { ledgerError = (e as Error).message; }
  const components = resolveComponentRepos(opts.components ?? [], ledgerDoc, deployedMods);
  const repos = components.map((x) => x.repo).filter((r): r is string => !!r);
  const ledger: EnvFacts["ledger"] = ledgerError !== null ? U(`ledger: ${ledgerError}`)
    : ledgerDoc ? computeLedgerFacts(ledgerDoc, deployedMods, repos, now, platformVersion, isUnknown(deployedTheme) ? null : deployedTheme) : U("ledger-file-absent");

  return { env, observedAt: now.toISOString(), backUrl: c.backUrl, frontUrl, config: { missing }, health, declared, deployed, deployedTheme, storefrontVisible, drift, ledger, components };
}
