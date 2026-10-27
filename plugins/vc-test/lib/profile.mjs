// plugins/vc-test/lib/profile.mjs — vc-test's READ-ONLY view of the deployment profile (spec U19, U21).
// vc-init owns project-profile.json and is its only writer; /vc-test:init writes the `test` block through
// vc-init's profile-set.mjs. A missing profile is a STOP, never a default (U19); a profile written by a newer
// vc-init is a STOP too, rather than a guess at its shape.
// CLI: node plugins/vc-test/lib/profile.mjs --check   → exit 0 readable, 2 missing, 3 unreadable or newer
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { outputRoot } from "./paths.mjs";

/** Highest profile schema this reader understands — vc-init's PROFILE_SCHEMA_VERSION when this was written. */
export const SUPPORTED_SCHEMA = 3;

export class ProfileError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Where the profile is: PROJECT_PROFILE_PATH, else VC_FIX_HOME, else <root> — the order every vc-fix reader uses. */
export function profilePath({ root = outputRoot() } = {}) {
  if (process.env.PROJECT_PROFILE_PATH) return process.env.PROJECT_PROFILE_PATH;
  if (process.env.VC_FIX_HOME) return join(resolve(process.env.VC_FIX_HOME), "project-profile.json");
  return join(root, "project-profile.json");
}

/** The profile, or a ProfileError: code 2 missing, code 3 unreadable or newer than this reader. */
export function loadProfile({ root = outputRoot() } = {}) {
  const path = profilePath({ root });
  if (!existsSync(path)) throw new ProfileError(2, `no project-profile.json at ${path} — run /project-init (vc-init), then /vc-test:init`);
  let profile;
  try {
    profile = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new ProfileError(3, `${path} is not valid JSON (${e.message}) — run /project-init --check`);
  }
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new ProfileError(3, `${path} is not a profile object — run /project-init --check`);
  const version = profile.schemaVersion === undefined ? 1 : profile.schemaVersion;
  if (typeof version !== "number" || version > SUPPORTED_SCHEMA) {
    throw new ProfileError(3, `${path} is schemaVersion ${JSON.stringify(version)}, newer than vc-test reads (${SUPPORTED_SCHEMA}) — update vc-test`);
  }
  return profile;
}

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const str = (v) => (typeof v === "string" && v.trim() ? v : null);

// The one measured number the budget defaults derive from (spec U73: "set once in P2 by run-cost.mjs"). Spec §2b,
// VCST-6398 (a large ticket), session d992339e-e30b-494f-a5cd-3c360d8b812b, measured 2026-10-27 by
// `run-cost.mjs --session-file`: 772,398,137 input-equivalent tokens; 184.8 min wall, counted from the invocation.
export const BUDGET_BASELINE = Object.freeze({ tokens: 772398137, wallMin: 184.8 });
const round1 = (n) => Math.round(n * 10) / 10;
export const BUDGET_COMMANDS = Object.freeze(["qa", "dev"]);

/** The defaults: qa = half the baseline (U34's target, Q5), dev = 40% of qa (U38's 20 : 50); no window share. */
export function defaultBudget() {
  const qa = { tokens: Math.round(0.5 * BUDGET_BASELINE.tokens), minutes: round1(0.5 * BUDGET_BASELINE.wallMin) };
  const dev = { tokens: Math.round(0.4 * qa.tokens), minutes: round1(0.4 * qa.minutes) };
  return { qa, dev };
}

const positive = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * `test.budget` as the operator may state it: `qa` and `dev` ({ tokens, minutes }, each a positive number) and an
 * optional `windowTokens`. A command left out stays out; anything else throws, naming the key.
 */
export function normaliseBudget(raw) {
  if (!obj(raw)) throw new Error("test.budget must be an object");
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "windowTokens") {
      if (!positive(value)) throw new Error("test.budget.windowTokens must be a positive number");
      out.windowTokens = value;
    } else if (BUDGET_COMMANDS.includes(key)) {
      if (!obj(value)) throw new Error(`test.budget.${key} must be an object with tokens and minutes`);
      for (const k of Object.keys(value)) if (k !== "tokens" && k !== "minutes") throw new Error(`test.budget.${key}.${k} is not a budget key (tokens, minutes)`);
      for (const k of ["tokens", "minutes"]) if (!positive(value[k])) throw new Error(`test.budget.${key}.${k} must be a positive number`);
      out[key] = { tokens: value.tokens, minutes: value.minutes };
    } else throw new Error(`test.budget.${key} is not a budget key (qa, dev, windowTokens)`);
  }
  return out;
}

/** The budget a run is measured against: the profile's, a command it leaves out from the defaults; each says which. */
export function resolveBudget(raw) {
  const given = raw === undefined || raw === null ? {} : normaliseBudget(raw);
  const defaults = defaultBudget();
  const out = {};
  for (const c of BUDGET_COMMANDS) out[c] = given[c] ? { ...given[c], source: "profile" } : { ...defaults[c], source: "default" };
  if (given.windowTokens) out.windowTokens = given.windowTokens;
  out.source = BUDGET_COMMANDS.every((c) => out[c].source === "default") ? "default" : "profile";
  return out;
}

/** vc-test's `test` block with every key present: what is missing comes back empty, never invented. A malformed
 *  `budget` comes back null with `budgetError` naming the key — one bad number must not hide the rest of the block. */
export function testBlock(profile) {
  const t = obj(profile?.test) ?? {};
  let budget = null, budgetError = null;
  try { budget = resolveBudget(t.budget); } catch (e) { budgetError = e.message; }
  return {
    budget, budgetError,
    environments: obj(t.environments) ?? {},
    scriptRoots: Array.isArray(t.scriptRoots) ? t.scriptRoots.filter((r) => typeof r === "string" && r.trim()) : [],
    knowledgeStore: str(t.knowledgeStore),
    platformStore: str(t.platformStore),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (process.argv[2] !== "--check") {
    console.error("usage: profile.mjs --check");
    process.exit(1);
  }
  try {
    loadProfile();
    console.log("profile: ok");
  } catch (e) {
    console.error(`profile: ${e.message}`);
    process.exit(e.code ?? 1);
  }
}
