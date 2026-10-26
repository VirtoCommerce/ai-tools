// plugins/vc-test/skills/ticket-context/lib/profile.mjs — C2 + D9: what to read, from project-profile.json (vc-init's,
// loaded by the plugin's read-only loader). No profile is a STOP (U19): there is no native-platform default here.
// Field names are vc-init's (plugins/vc-init/scripts/lib/project-profile.mjs PROFILE_DEFAULTS).
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
  // The client's own code host; a platform project's code is the upstream's, on GitHub.
  const codeHost = projectType === "client" && vcs.clientHost === "azure-repos" ? "azure-repos" : "github";
  const clientOrg = str(vcs.clientOrg);
  const orgs = projectType === "client" && codeHost === "github" && clientOrg && clientOrg !== upstream ? [clientOrg, upstream] : [upstream];
  // /project-init writes tracker.baseUrl for Jira only; an Azure Boards profile carries tracker.azure.apiBase
  // (https://dev.azure.com/<org>/<project>), or at least its organization and project.
  const az = obj(t.azure);
  const azureBase = str(az.apiBase)
    || (str(az.organization) && str(az.project) ? `https://dev.azure.com/${encodeURIComponent(str(az.organization))}/${encodeURIComponent(str(az.project))}` : "");
  const trackerBase = (str(t.baseUrl) || (tracker === "azure" ? azureBase : "")).replace(/\/+$/, "");
  const fieldList = [];
  for (const list of Object.values(obj(t.fields))) for (const f of Array.isArray(list) ? list : []) {
    if (f?.ref && !fieldList.some((x) => x.id === f.ref)) fieldList.push({ id: f.ref, name: f.name ?? f.ref });
  }
  return {
    projectType, tracker, codeHost, upstream, orgs, fieldList,
    formLayout: obj(t.formLayout), // Azure Boards: { <type>: { htmlControls: [field ref, …] } }, in form order
    trackerBase,
    keyFormat: t.ticketKeyFormat === "numeric" || t.ticketKeyFormat === "prefixed" ? t.ticketKeyFormat : tracker === "azure" ? "numeric" : "prefixed",
    crossLinkToken: str(t.crossLinkToken),
    fieldMap: obj(t.fieldMap),
    azure: { roleStates: obj(az.roleStates), roleStatesByType: obj(az.roleStatesByType) }, // org and project: the bridge pins them
    governed: !!profile.governance?.host || profile.governance?.secrets === "host", // the bridge's own refusal (vc-init bridge/run.mjs hostRefusal)
    // The host's MCP servers per role (U23): the host-governed fetch reads through these, and only these.
    servers: { tracker: str(profile.governance?.servers?.tracker), codeHost: str(profile.governance?.servers?.codeHost), github: str(profile.governance?.servers?.github) },
  };
}
