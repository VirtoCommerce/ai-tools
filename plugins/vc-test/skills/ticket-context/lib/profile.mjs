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
  const fieldList = [];
  for (const list of Object.values(obj(t.fields))) for (const f of Array.isArray(list) ? list : []) {
    if (f?.ref && !fieldList.some((x) => x.id === f.ref)) fieldList.push({ id: f.ref, name: f.name ?? f.ref });
  }
  return {
    projectType, tracker, codeHost, orgs, fieldList,
    trackerBase: str(t.baseUrl).replace(/\/+$/, ""),
    keyFormat: t.ticketKeyFormat === "numeric" || t.ticketKeyFormat === "prefixed" ? t.ticketKeyFormat : tracker === "azure" ? "numeric" : "prefixed",
    crossLinkToken: str(t.crossLinkToken),
    fieldMap: obj(t.fieldMap),
    azure: { roleStates: obj(t.azure?.roleStates), roleStatesByType: obj(t.azure?.roleStatesByType) }, // org and project: the bridge pins them
    governed: !!profile.governance?.host,
  };
}
