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

/** vc-test's `test` block with every key present: what is missing comes back empty, never invented. */
export function testBlock(profile) {
  const t = obj(profile?.test) ?? {};
  return {
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
