/**
 * scripts/lib/project-profile.mjs
 *
 * Single source of truth for the DEPLOYMENT PROFILE — the description of what
 * infrastructure THIS checkout of the QA plugin is wired against:
 *   - projectType: native-platform vs a client project with custom modules
 *   - tracker:     Jira vs Azure Boards (bug tracker)
 *   - vcs:         GitHub vs Azure Repos for the CLIENT's own code
 *   - upstream:    the VirtoCommerce GitHub org (always GitHub) where platform
 *                  fixes are PR'd / platform bugs are filed as issues
 *   - repos:       the discovered client/platform repo map
 *
 * Written by `/project-init` (gen-profile.mjs). Read by:
 *   - config.js                → every skill sees it via `env.PROFILE`
 *   - ci/lib/trackers/*        → which tracker adapter to use
 *   - ci/lib/repo-router.ts    → client-vs-platform ownership routing
 *   - ci/run-fix-cycle.ts + developer agents
 *
 * SAFE DEFAULTS: when project-profile.json is ABSENT (fresh checkout, or the
 * existing VirtoCommerce-internal QA setup) this returns the exact pre-existing
 * behaviour — projectType "platform", tracker "jira", client VCS "github",
 * upstream "VirtoCommerce". No file present ⇒ nothing changes.
 *
 * @typedef {Object} ProjectProfile
 * @property {"platform"|"client"} projectType
 * @property {"virto-engineer"|"client"|"ask"} operator
 * @property {{kind:"jira"|"azure", baseUrl:string, projectKey:string,
 *   azure:{organization:string, project:string, team:string,
 *   stateMap:Record<string,string>}}} tracker
 * @property {{clientHost:"github"|"azure-repos", clientOrg:string,
 *   azure:{organization:string, project:string}, auth:"gh-cli"|"pat"|"az-login"}} vcs
 * @property {{host:"github", org:string, fileIssues:boolean,
 *   contributionMode:"fork"|"direct", clientGithubAccount:string}} upstream
 * @property {{client:Array<object>, platform:Array<object>}} repos
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/** @type {ProjectProfile} */
export const PROFILE_DEFAULTS = {
  projectType: "platform",
  operator: "virto-engineer",
  tracker: {
    kind: "jira",
    baseUrl: "",
    projectKey: "",
    azure: { organization: "", project: "", team: "", stateMap: {} },
  },
  vcs: {
    clientHost: "github",
    clientOrg: "",
    azure: { organization: "", project: "" },
    auth: "gh-cli",
  },
  upstream: {
    host: "github",
    org: "VirtoCommerce",
    fileIssues: true,
    contributionMode: "fork",
    clientGithubAccount: "",
  },
  repos: { client: [], platform: [] },
};

/** Recursive merge: objects merge key-by-key; arrays + scalars are replaced wholesale. */
function deepMerge(base, override) {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (typeof base !== "object" || typeof override !== "object") return override;
  const out = { ...base };
  for (const k of Object.keys(override)) out[k] = deepMerge(base[k], override[k]);
  return out;
}

let _cache;

/**
 * Load + memoize the deployment profile, layered over PROFILE_DEFAULTS.
 * Path: PROJECT_PROFILE_PATH env override, else <repoRoot>/project-profile.json.
 * Never throws — a missing/malformed file falls back to defaults with a warning.
 * @param {string} [repoRoot]
 * @returns {ProjectProfile}
 */
export function loadProjectProfile(repoRoot = process.cwd()) {
  if (_cache) return _cache;
  const path =
    process.env.PROJECT_PROFILE_PATH || join(repoRoot, "project-profile.json");
  let profile = PROFILE_DEFAULTS;
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      delete raw._meta;
      profile = deepMerge(PROFILE_DEFAULTS, raw);
    } catch (err) {
      console.warn(
        `[project-profile] Failed to read/parse ${path}: ${err.message}. Using defaults.`,
      );
    }
  }
  _cache = profile;
  return profile;
}

/** Drop the memoized profile (used by gen-profile after writing, and by tests). */
export function resetProjectProfileCache() {
  _cache = undefined;
}
