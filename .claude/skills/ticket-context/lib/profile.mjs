// .claude/skills/ticket-context/lib/profile.mjs — C2 + D9: what to read and with which credential.
// Field names are project-profile.json's (plugins/vc-fix/scripts/lib/project-profile.d.mts).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The documented "absent profile ⇒ native-platform defaults" (CLAUDE.md §Prerequisites). */
export const DEFAULT_ORG = "VirtoCommerce";

export function readProfile(root) {
  const p = join(root, "project-profile.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

export function resolveProfile(profile) {
  if (!profile) return { source: "defaults", projectType: "platform", tracker: "jira", trackerBaseUrl: null, fieldMap: {}, repoHosts: [{ host: "github", org: DEFAULT_ORG }], authEnv: null };
  const projectType = profile.projectType === "client" ? "client" : "platform";
  const repoHosts = [{ host: "github", org: profile.upstream?.org || DEFAULT_ORG }];
  const client = profile.vcs?.clientOrg;
  if (projectType === "client" && client && client !== repoHosts[0].org) {
    repoHosts.unshift({ host: profile.vcs?.clientHost === "azure-repos" ? "azure-repos" : "github", org: client });
  }
  return {
    source: "profile", projectType,
    tracker: profile.tracker?.kind === "azure" ? "azure" : "jira",
    trackerBaseUrl: profile.tracker?.baseUrl || null,
    fieldMap: profile.tracker?.fieldMap ?? {},
    repoHosts,
    authEnv: profile.vcs?.authEnv || null,
  };
}

export function trackerCredential(p, env = process.env) {
  if (p.tracker !== "jira") return { ok: false, reason: "connector-unavailable", detail: "Azure Boards is read from Phase 5 on" };
  const base = (env.JIRA_BASE_URL || p.trackerBaseUrl || "").replace(/\/+$/, "");
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
