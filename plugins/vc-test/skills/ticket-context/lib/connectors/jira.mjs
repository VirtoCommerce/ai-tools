// plugins/vc-test/skills/ticket-context/lib/connectors/jira.mjs — the Jira tracker connector (spec §7). Every method is
// one `node "$VC_RUN" jira …` launch (vc-fix's qa-fix-routing/jira.mjs, host pinned to the profile's tracker.baseUrl)
// and returns what the old in-process client returned, so prepare reads the same shapes. This process holds no token.
import { rmSync, writeFileSync } from "node:fs";
import { bridgeDownload, bridgeRun, bridgeTempFiles } from "../bridge.mjs";
import { CAPS } from "../fetch.mjs";
import { GapError, asGap, gap } from "../gap.mjs";
import { outputRoot } from "../paths.mjs";

const ATTACHMENT_RE = /\/rest\/api\/3\/attachment\/content\/(\d+)(?:[?#]|$)/;

/**
 * The issue's `comment` field is ONE page; its `total` says how many exist. The rest come in one launch
 * (`comments --rendered`, oldest first, up to CAPS.comments) and are merged in place exactly as before: the raw comment
 * into fields.comment, its renderedBody into renderedFields.comment as `body`, paired by index. An unread rest is ONE gap.
 */
async function completeComments(run, key, issue, gaps) {
  const c = issue.fields?.comment;
  if (!Array.isArray(c?.comments)) return;
  const total = Number.isInteger(c.total) ? c.total : c.comments.length;
  if (total <= c.comments.length) return;
  const rc = ((issue.renderedFields ??= {}).comment ??= {});
  rc.comments = Array.from({ length: c.comments.length }, (_, i) => rc.comments?.[i] ?? {}); // index pairing holds
  const seen = new Set(c.comments.map((x) => String(x.id)));
  const limit = Math.min(total, CAPS.comments);
  let failure = null;
  let page = null;
  try { page = await run("jira", ["comments", "--key", key, "--rendered", "--max", String(CAPS.comments)]); } catch (e) { failure = e; }
  if (page) {
    let added = 0;
    for (const { renderedBody, ...raw } of page.comments ?? []) {
      if (c.comments.length >= limit || seen.has(String(raw.id))) continue;
      seen.add(String(raw.id));
      c.comments.push(raw);
      rc.comments.push({ ...raw, body: renderedBody ?? null });
      added++;
    }
    if (!added) failure = new GapError("unreadable", "the tracker returned no further comments");
  }
  c.maxResults = c.comments.length;
  const unread = total - c.comments.length;
  if (unread <= 0) return;
  const head = `${unread} of ${total} comments not read`;
  if (failure) { const g = asGap("comments", failure); gaps.push(gap("comments", g.reason, `${head}: ${g.detail ?? g.reason}`)); }
  else gaps.push(gap("comments", "over-cap", `${head}: more than ${CAPS.comments} comments; the ${CAPS.comments} oldest are read`));
}

/** `base`: the profile's tracker.baseUrl. `key`: the ticket being prepared — its .vc-fix/context/<key>/ holds temp files. */
export function jiraConnector({ base, key, run = bridgeRun, root = outputRoot() }) {
  const origin = new URL(base).origin;
  const tempFile = bridgeTempFiles(key, root);
  const request = (method, path) => run("jira", ["request", "--method", method, "--path", path]);
  async function search(jql, fields, maxResults) {
    const f = tempFile("json");
    writeFileSync(f, JSON.stringify({ jql, fields, maxResults }));
    try { return (await run("jira", ["request", "--method", "POST", "--path", "/rest/api/3/search/jql", "--body-file", f])).issues ?? []; }
    finally { rmSync(f, { force: true }); }
  }
  return {
    base,
    fields: () => request("GET", "/rest/api/3/field"),
    /** With `comment` among the fields, every comment up to CAPS.comments is read; an unread rest lands in `gaps`. */
    issue: async (k, fields, { gaps = [] } = {}) => {
      const issue = await run("jira", ["get", "--key", k, "--fields", fields.join(","), "--expand", "renderedFields"]);
      if (fields.includes("comment")) await completeComments(run, k, issue, gaps);
      return issue;
    },
    /** The newest `n` comments, newest first, and how many exist. */
    latestComments: async (k, count) => {
      const page = await run("jira", ["comments", "--key", k, "--newest", "--max", String(count)]);
      const comments = (page.comments ?? []).slice(0, count);
      return { comments, total: Number.isInteger(page.total) ? page.total : comments.length };
    },
    remoteLinks: (k) => request("GET", `/rest/api/3/issue/${encodeURIComponent(k)}/remotelink`),
    /** The development panel's PR URLs; Jira names no PR by reference, so `refs` is empty. */
    linkedPrs: async (issue) => ({ urls: (await run("jira", ["dev-prs", "--key", issue.key])).urls ?? [], refs: [] }),
    siblings: (parentKey, k) => search(`parent = ${parentKey} AND key != ${k} ORDER BY updated DESC`, ["summary", "status"], 50),
    recency: async (keys) => (await search(`key in (${keys.join(",")}) ORDER BY updated DESC`, ["updated"], Math.min(keys.length, 100))).map((j) => j.key),
    /** The attachment's bytes, capped; the bridge writes them under .vc-fix/ and the file is removed once read. */
    download: async (url) => {
      const target = new URL(url);
      if (target.origin !== origin) throw new GapError("private-host", `not sent: ${target.host} is not the tracker (${new URL(base).host})`);
      const id = ATTACHMENT_RE.exec(target.pathname + target.search)?.[1];
      if (!id) throw new GapError("unreadable", `no attachment id in ${target.pathname}`);
      return bridgeDownload(run, "jira", ["download", "--attachment", id], tempFile("bin"));
    },
    page: (id) => run("jira", ["confluence-page", "--id", String(id)]),
  };
}
