// .claude/skills/ticket-context/lib/jira.mjs — read-only Jira Cloud REST v3 + Confluence REST v2.
// The credential is never sent to an origin other than the tracker's (S7); a refusal is a GAP, never a retry.
import { CAPS, readCapped, timedFetch, timeoutGap } from "./fetch.mjs";
import { GapError } from "./gap.mjs";

export const BASE_FIELDS = Object.freeze(["summary", "description", "comment", "status", "issuetype", "labels", "components",
  "attachment", "issuelinks", "parent", "updated", "fixVersions"]);
export const LINKED_FIELDS = Object.freeze(["summary", "description", "status", "issuetype", "updated", "resolution"]);

export function jiraClient(cred, fetchImpl = fetch) {
  const origin = new URL(cred.base).origin;
  async function get(pathOrUrl, { method = "GET", body, accept = "application/json", ms = CAPS.fetchTimeoutMs } = {}) {
    const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : cred.base + pathOrUrl;
    const target = new URL(url);
    if (target.origin !== origin) throw new GapError("private-host", `not sent: ${target.host} is not the tracker (${new URL(cred.base).host})`);
    // download() relies on this: Jira 303s attachment content to the media host, and fetch (redirect: "follow")
    // strips the Authorization header on a cross-origin redirect, so the credential never reaches that host.
    const res = await timedFetch(fetchImpl, url, { method, body, headers: { Authorization: cred.auth, Accept: accept, ...(body ? { "Content-Type": "application/json" } : {}) } }, ms, `Jira ${target.pathname}`);
    if (res.status === 401 || res.status === 403) throw new GapError("access-denied", `Jira ${res.status} on ${target.pathname} — check JIRA_EMAIL / JIRA_API_TOKEN (never retried with another credential)`);
    if (res.status === 404) throw new GapError("deleted", `Jira 404 on ${target.pathname}`);
    if (!res.ok) throw new GapError("unreadable", `Jira ${res.status} on ${target.pathname}`);
    return res;
  }
  const json = async (p, o) => {
    const res = await get(p, o);
    try { return await res.json(); } catch (e) { throw timeoutGap(e, "Jira response body", o?.ms ?? CAPS.fetchTimeoutMs); }
  };
  return {
    fields: () => json("/rest/api/3/field"),
    issue: (key, fields) => json(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=${fields.map(encodeURIComponent).join(",")}&expand=renderedFields`),
    remoteLinks: (key) => json(`/rest/api/3/issue/${encodeURIComponent(key)}/remotelink`),
    devPrUrls: async (issueId) => {
      const j = await json(`/rest/dev-status/latest/issue/detail?issueId=${encodeURIComponent(issueId)}&applicationType=GitHub&dataType=pullrequest`);
      return (j.detail ?? []).flatMap((d) => (d.pullRequests ?? []).map((p) => p.url)).filter(Boolean);
    },
    search: async (jql, fields, cap = 50) => (await json("/rest/api/3/search/jql", { method: "POST", body: JSON.stringify({ jql, fields, maxResults: cap }) })).issues ?? [],
    // Streamed and capped: the attachment's declared size is the tracker's word, the bytes read are ours.
    download: async (url) => (await readCapped(await get(url, { accept: "*/*", ms: CAPS.downloadTimeoutMs }), CAPS.attachmentBytes,
      { label: "attachment download", ms: CAPS.downloadTimeoutMs })).buf,
    confluencePage: (id) => json(`/wiki/api/v2/pages/${encodeURIComponent(id)}?body-format=storage`),
  };
}
