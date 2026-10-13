// .claude/skills/ticket-context/lib/jira.mjs — read-only Jira Cloud REST v3 + Confluence REST v2.
// The credential is never sent to an origin other than the tracker's (S7); a refusal is a GAP, never a retry.
import { CAPS, readCapped, timedFetch, timeoutGap } from "./fetch.mjs";
import { GapError, asGap, gap } from "./gap.mjs";

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
  // The issue's `comment` field is ONE page; its `total` says how many exist. The rest are paged through the
  // comment endpoint (same origin guard, same timeouts) up to CAPS.comments and merged in place: the raw comment
  // into fields.comment, its renderedBody into renderedFields.comment as `body`, paired by index — the shape
  // buildInventory and the TICKET agent (ticket.json) already read. Whatever stays unread is ONE gap.
  async function completeComments(key, issue, gaps) {
    const c = issue.fields?.comment;
    if (!Array.isArray(c?.comments)) return;
    const total = Number.isInteger(c.total) ? c.total : c.comments.length;
    if (total <= c.comments.length) return;
    const rc = ((issue.renderedFields ??= {}).comment ??= {});
    rc.comments = Array.from({ length: c.comments.length }, (_, i) => rc.comments?.[i] ?? {}); // index pairing holds
    const seen = new Set(c.comments.map((x) => String(x.id)));
    const limit = Math.min(total, CAPS.comments);
    let startAt = (c.startAt ?? 0) + c.comments.length;
    let failure = null;
    while (c.comments.length < limit) {
      let page;
      try {
        page = await json(`/rest/api/3/issue/${encodeURIComponent(key)}/comment?startAt=${startAt}&maxResults=${Math.min(CAPS.commentPage, limit - c.comments.length)}&orderBy=created&expand=renderedBody`);
      } catch (e) { failure = e; break; }
      const got = page.comments ?? [];
      startAt += got.length;
      let added = 0;
      for (const { renderedBody, ...raw } of got) {
        if (c.comments.length >= limit || seen.has(String(raw.id))) continue;
        seen.add(String(raw.id));
        c.comments.push(raw);
        rc.comments.push({ ...raw, body: renderedBody ?? null });
        added++;
      }
      if (!added) { failure = new GapError("unreadable", "the tracker returned no further comments"); break; } // never loops on a page it already gave
    }
    c.maxResults = c.comments.length;
    const unread = total - c.comments.length;
    if (unread <= 0) return;
    const head = `${unread} of ${total} comments not read`;
    if (failure) { const g = asGap("comments", failure); gaps.push(gap("comments", g.reason, `${head}: ${g.detail ?? g.reason}`)); }
    else gaps.push(gap("comments", "over-cap", `${head}: more than ${CAPS.comments} comments; the ${CAPS.comments} oldest are read`));
  }
  return {
    fields: () => json("/rest/api/3/field"),
    /** With `comment` among the fields, every comment up to CAPS.comments is read; an unread rest lands in `gaps`. */
    issue: async (key, fields, { gaps = [] } = {}) => {
      const issue = await json(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=${fields.map(encodeURIComponent).join(",")}&expand=renderedFields`);
      if (fields.includes("comment")) await completeComments(key, issue, gaps);
      return issue;
    },
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
