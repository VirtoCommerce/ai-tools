// plugins/vc-test/skills/ticket-context/lib/profile.mjs — C2 + D9: what to read, from project-profile.json (vc-init's,
// loaded by the plugin's read-only loader). No profile is a STOP (U19): there is no native-platform default here.
// Field names are vc-init's (plugins/vc-init/scripts/lib/project-profile.mjs PROFILE_DEFAULTS).
import { execFileSync } from "node:child_process";
import { ProfileError } from "../../../lib/profile.mjs";

const str = (v) => (typeof v === "string" ? v.trim() : "");
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/** The profile as /ticket-context reads it. Throws ProfileError(3) when it names no upstream org. */
export function resolveProfile(profile) {
  const t = obj(profile?.tracker);
  const vcs = obj(profile?.vcs);
  const upstream = str(profile?.upstream?.org);
  if (!upstream) throw new ProfileError(3, "project-profile.json names no upstream.org — run /project-init --check");
  const projectType = profile.projectType === "client" ? "client" : "platform";
  const tracker = t.kind === "azure" ? "azure" : "jira";
  const codeHost = vcs.clientHost === "azure-repos" ? "azure-repos" : "github";
  const clientOrg = str(vcs.clientOrg);
  const orgs = projectType === "client" && codeHost === "github" && clientOrg && clientOrg !== upstream ? [clientOrg, upstream] : [upstream];
  const azureRepos = projectType === "client" && codeHost === "azure-repos"
    ? { organization: str(vcs.azure?.organization) || clientOrg, project: str(vcs.azure?.project) } : null;
  const fieldList = [];
  for (const list of Object.values(obj(t.fields))) for (const f of Array.isArray(list) ? list : []) {
    if (f?.ref && !fieldList.some((x) => x.id === f.ref)) fieldList.push({ id: f.ref, name: f.name ?? f.ref });
  }
  return {
    projectType, tracker, codeHost, orgs, azureRepos, fieldList,
    trackerBase: str(t.baseUrl).replace(/\/+$/, ""),
    keyFormat: t.ticketKeyFormat === "numeric" || t.ticketKeyFormat === "prefixed" ? t.ticketKeyFormat : tracker === "azure" ? "numeric" : "prefixed",
    crossLinkToken: str(t.crossLinkToken),
    fieldMap: obj(t.fieldMap),
    azure: { organization: str(t.azure?.organization), project: str(t.azure?.project), roleStates: obj(t.azure?.roleStates), roleStatesByType: obj(t.azure?.roleStatesByType) },
    governed: !!profile.governance?.host,
    authEnv: str(vcs.authEnv) || null, // read by codeHostCredential until the GitHub connector replaces it (P1d-2 Task 5)
  };
}

// The two credential helpers below go with their last callers: the Jira connector (Task 4) and the GitHub one (Task 5).
export function trackerCredential(p, env = process.env) {
  if (p.tracker !== "jira") return { ok: false, reason: "connector-unavailable", detail: "Azure Boards is read from Phase 5 on" };
  const base = (env.JIRA_BASE_URL || p.trackerBase || "").replace(/\/+$/, "");
  const missing = [!base && "JIRA_BASE_URL", !env.JIRA_EMAIL && "JIRA_EMAIL", !env.JIRA_API_TOKEN && "JIRA_API_TOKEN"].filter(Boolean);
  if (missing.length) return { ok: false, reason: "no-credential", detail: `set ${missing.join(", ")} in .env.local (/project-init writes them)` };
  return { ok: true, base, auth: `Basic ${Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64")}` };
}

/** One code-host credential, chosen once (S7): the profile's authEnv, else GIT_TOKEN, else the gh session. */
export function codeHostCredential(p, env = process.env, ghToken = ghCliToken) {
  const name = p.authEnv || "GIT_TOKEN";
  if (env[name]) return { ok: true, auth: `Bearer ${env[name]}`, via: name };
  const t = ghToken(env);
  if (t) return { ok: true, auth: `Bearer ${t}`, via: "gh auth token" };
  return { ok: false, reason: "no-credential", detail: `set ${name} in .env.local, or run gh auth login` };
}

function ghCliToken(env) {
  // The gh session itself, not a token gh would pick up from the env (as scripts/deploy/lib/github.ts GH_ENV does).
  const clean = { ...env };
  delete clean.GITHUB_TOKEN;
  delete clean.GH_TOKEN;
  try { return execFileSync("gh", ["auth", "token"], { env: clean, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null; } catch { return null; }
}
