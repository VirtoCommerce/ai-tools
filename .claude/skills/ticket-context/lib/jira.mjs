// .claude/skills/ticket-context/lib/jira.mjs — read-only Jira Cloud REST v3 + Confluence REST v2.
// The credential is never sent to an origin other than the tracker's (S7); a refusal is a GAP, never a retry.
import { CAPS, readCapped, timedFetch, timeoutGap } from "./fetch.mjs";
import { GapError, asGap, gap } from "./gap.mjs";
import { adfText } from "./inventory.mjs";
import { redactText } from "./scrub.mjs";

export const BASE_FIELDS = Object.freeze(["summary", "description", "comment", "status", "issuetype", "priority", "labels", "components",
  "attachment", "issuelinks", "parent", "subtasks", "updated", "fixVersions"]);
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
    if (res.status === 400) {
      // A JQL 400 names the keys it rejects (a deleted or moved issue): carry those keys, never the body text.
      let keys = [];
      try { keys = [...new Set((await readCapped(res, 16 * 1024, { truncate: true, label: "Jira error body", ms })).buf.toString("utf8").match(/\b[A-Z][A-Z0-9]*-\d+\b/g) ?? [])]; } catch { /* no keys */ }
      throw Object.assign(new GapError("unreadable", `Jira 400 on ${target.pathname}`), { status: 400, keys });
    }
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
    /** The newest `n` comments, newest first, and how many exist. */
    latestComments: async (key, n) => {
      const page = await json(`/rest/api/3/issue/${encodeURIComponent(key)}/comment?startAt=0&maxResults=${n}&orderBy=-created`);
      const comments = (page.comments ?? []).slice(0, n);
      return { comments, total: Number.isInteger(page.total) ? page.total : comments.length };
    },
    remoteLinks: (key) => json(`/rest/api/3/issue/${encodeURIComponent(key)}/remotelink`),
    // `detail` answers only for the applicationType the GitHub integration is registered under (a wrong one is an
    // empty 200); the new GitHub app is `oAuth-com.github.integration.production`, so the type comes from `summary`.
    devPrUrls: async (issueId) => {
      const id = encodeURIComponent(issueId);
      const sum = await json(`/rest/dev-status/latest/issue/summary?issueId=${id}`);
      const types = new Set([...Object.keys(sum?.summary?.pullrequest?.byInstanceType ?? {}), "GitHub"]);
      const urls = new Set();
      for (const t of types) {
        const j = await json(`/rest/dev-status/latest/issue/detail?issueId=${id}&applicationType=${encodeURIComponent(t)}&dataType=pullrequest`);
        for (const d of j.detail ?? []) for (const p of d.pullRequests ?? []) if (p.url) urls.add(p.url);
      }
      return [...urls];
    },
    search: async (jql, fields, cap = 50) => (await json("/rest/api/3/search/jql", { method: "POST", body: JSON.stringify({ jql, fields, maxResults: cap }) })).issues ?? [],
    // Streamed and capped: the attachment's declared size is the tracker's word, the bytes read are ours.
    download: async (url) => (await readCapped(await get(url, { accept: "*/*", ms: CAPS.downloadTimeoutMs }), CAPS.attachmentBytes,
      { label: "attachment download", ms: CAPS.downloadTimeoutMs })).buf,
    confluencePage: (id) => json(`/wiki/api/v2/pages/${encodeURIComponent(id)}?body-format=storage`),
  };
}

/** A kept linked issue's comments, put on it as `comments: {total, read, comments}` — the CAPS.linkedComments newest,
 *  oldest first, each `{id, created, updated, text}` (no author: who said it is not testing context). The text is plain
 *  (ADF flattened, a pasted PR or commit link kept as its URL) and redacted (env secret values, then token shapes): a
 *  linked issue is one hop further from the reporter than the ticket, and its file is read by an agent whose output
 *  gate rule 6 scans. Unread comments, a comment cut at CAPS.fieldText, or a failed read are ONE gap on
 *  `<ref>:comments`; the issue's fields stay either way. Returns the D10 freshness part: count + each read comment's
 *  id@updated, so a new or edited comment rebuilds the bundle even where the tracker would not bump the issue's `updated`. */
export async function attachLinkedComments(jira, issue, ref, { cap = CAPS.linkedComments, gaps = [], secrets = new Set() } = {}) {
  let got;
  try { got = await jira.latestComments(issue.key, cap); } catch (e) {
    const g = asGap(`${ref}:comments`, e);
    gaps.push(gap(`${ref}:comments`, g.reason, `comments not read: ${g.detail ?? g.reason}`));
    return "c?";
  }
  const cut = [];
  const comments = [...got.comments].reverse().map((c) => {
    const text = redactText(adfText(c.body), secrets).replace(/\n{3,}/g, "\n\n").trim();
    if (text.length > CAPS.fieldText) cut.push(`${c.id} (${text.length} chars)`);
    return { id: String(c.id), created: c.created ?? null, updated: c.updated ?? null, text: text.slice(0, CAPS.fieldText) };
  });
  issue.comments = { total: got.total, read: comments.length, comments };
  const unread = got.total - comments.length;
  const over = [
    ...(unread > 0 ? [`${unread} of ${got.total} comments on ${issue.key} not read: the ${comments.length} newest are read`] : []),
    ...(cut.length ? [`comment ${cut.join(", ")} on ${issue.key} cut to its first ${CAPS.fieldText} chars`] : [])];
  if (over.length) gaps.push(gap(`${ref}:comments`, "over-cap", over.join("; ")));
  return `c${got.total}/${comments.map((c) => `${c.id}@${c.updated ?? c.created}`).join(",")}`;
}

/** D12: the linked issues' recency, as each key's index in one `ORDER BY updated DESC` search (the tracker orders
 *  the dates; no string comparison of them here). A 400 that names keys of ours (an issue deleted or moved) is
 *  retried ONCE without them; any other failure, or a second one, leaves the order empty, so the ranking falls back
 *  to the link groups alone. Any failure is one gap. */
export async function recencyOrder(jira, keys, gaps) {
  const ask = async (list) => (await jira.search(`key in (${list.join(",")}) ORDER BY updated DESC`, ["updated"], Math.min(list.length, 100))).map((j) => j.key);
  let found;
  try { found = await ask(keys); } catch (e) {
    const gone = (e?.keys ?? []).filter((k) => keys.includes(k));
    const rest = keys.filter((k) => !gone.includes(k));
    let retried = "";
    if (e?.status === 400 && gone.length && rest.length) {
      try { found = await ask(rest); retried = `; retried without ${gone.join(", ")}`; } catch { retried = `; the retry without ${gone.join(", ")} failed too`; }
    }
    const g = asGap("linked-issues.order", e);
    gaps.push(gap("linked-issues.order", g.reason, `${g.detail ?? g.reason}${retried}${found ? "" : " — linked issues ranked by link type only"}`));
  }
  return new Map((found ?? []).map((k, i) => [k, i]));
}
