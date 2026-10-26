// plugins/vc-test/skills/ticket-context/lib/jira.mjs — what prepare does with Jira-shaped issues: the blind cut, the
// linked issues' comments, their recency. The reads themselves are the tracker connector's (connectors/).
import { CAPS } from "./fetch.mjs";
import { asGap, gap } from "./gap.mjs";
import { adfText } from "./inventory.mjs";
import { redactText } from "./scrub.mjs";

export const BASE_FIELDS = Object.freeze(["summary", "description", "comment", "status", "issuetype", "priority", "labels", "components",
  "attachment", "issuelinks", "parent", "subtasks", "updated", "fixVersions"]);
export const LINKED_FIELDS = Object.freeze(["summary", "description", "status", "issuetype", "created", "updated", "resolution"]); // `created`: a blind run drops a linked issue filed after its cutoff (U67)

/** True when `created` is an instant after the cutoff `before`, both compared as instants, never as strings (offsets
 *  differ). No cutoff, or an unparsable `created`, is false: a missing date is kept, never guessed away. */
export function postedAfter(created, before) {
  if (!before) return false;
  return Date.parse(created) > Date.parse(before);
}

/** A benchmark run must not see what was posted after its cutoff (U67). Applied once, after every comment page is
 *  merged and before the inventory is built: comments created after `before` leave `fields.comment` and their
 *  index-paired `renderedFields.comment` twin together; attachments created after it leave `fields.attachment`, so an
 *  image inline in a dropped comment never becomes an inventory item (one a kept text still names is a gap); and an
 *  issue link or sub-task naming a `hide` key is dropped, so no later step ever reads either. No option given: the
 *  issue comes back as it was. */
export function blindIssue(issue, { before, hide = [] } = {}) {
  const cutoff = before ? Date.parse(before) : NaN;
  const hidden = new Set(hide);
  if (Number.isNaN(cutoff) && !hidden.size) return issue;
  const out = { ...issue, fields: { ...issue.fields } };
  if (!Number.isNaN(cutoff) && Array.isArray(issue.fields?.attachment)) out.fields.attachment = issue.fields.attachment.filter((a) => !postedAfter(a?.created, before));
  const c = issue.fields?.comment;
  if (!Number.isNaN(cutoff) && Array.isArray(c?.comments)) {
    const keep = c.comments.map((x) => !postedAfter(x?.created, before));
    out.fields.comment = { ...c, comments: c.comments.filter((_, i) => keep[i]) };
    out.fields.comment.total = Math.min(c.total ?? Infinity, out.fields.comment.comments.length);
    const rc = issue.renderedFields?.comment;
    out.renderedFields = { ...issue.renderedFields };
    if (Array.isArray(rc?.comments)) out.renderedFields.comment = { ...rc, comments: rc.comments.filter((_, i) => keep[i] ?? true) };
  }
  if (hidden.size) {
    if (Array.isArray(out.fields.issuelinks)) out.fields.issuelinks = out.fields.issuelinks.filter((l) => !hidden.has((l.outwardIssue ?? l.inwardIssue)?.key));
    if (Array.isArray(out.fields.subtasks)) out.fields.subtasks = out.fields.subtasks.filter((t) => !hidden.has(t?.key));
  }
  return out;
}

/** Rows a blind run must not carry — epic siblings, search hits, and the inventory's `kind: "ticket"` items however
 *  they got there (an issue link, a remote link, a key in a text): whatever names a `hide` key is dropped (U67). */
export function withoutHidden(rows, hide = []) {
  if (!hide.length) return rows;
  const hidden = new Set(hide);
  return rows.filter((r) => !hidden.has(r?.key));
}

/** A blind run's PRs (U67): a PR created after `before` is dropped wherever the ladder found it (dev-status, a link,
 *  the key or commit search, a named companion). Its date is its metadata's `created_at`, or the key search's when the
 *  metadata could not be read; a PR with neither is kept. `sameKey` (the key search's hits, which `later_prs` reads) is
 *  cut the same way. No cutoff: both come back as they were. */
export function blindPrs(prMeta, sameKey = [], before = null) {
  if (!before) return { prMeta, sameKey };
  const searched = new Map(sameKey.map((s) => [String(s.ref).toLowerCase(), s.created_at]));
  const late = (p) => postedAfter(p.meta?.created_at ?? searched.get(String(p.ref).toLowerCase()), before);
  return { prMeta: prMeta.filter((p) => !late(p)), sameKey: sameKey.filter((s) => !postedAfter(s.created_at, before)) };
}

/** A kept linked issue's comments, put on it as `comments: {total, read, comments}` — the CAPS.linkedComments newest,
 *  oldest first, each `{id, created, updated, text}` (no author: who said it is not testing context). The text is plain
 *  (ADF flattened, a pasted PR or commit link kept as its URL) and redacted (env secret values, then token shapes): a
 *  linked issue is one hop further from the reporter than the ticket, and its file is read by an agent whose output
 *  gate rule 6 scans. Unread comments, a comment cut at CAPS.fieldText, or a failed read are ONE gap on
 *  `<ref>:comments`; the issue's fields stay either way. Returns the D10 freshness part: count + each read comment's
 *  id@updated, so a new or edited comment rebuilds the bundle even where the tracker would not bump the issue's `updated`.
 *  `before` (a blind run, U67): a comment created after it is dropped before anything is counted. */
export async function attachLinkedComments(jira, issue, ref, { cap = CAPS.linkedComments, gaps = [], secrets = new Set(), before = null } = {}) {
  let got;
  try { got = await jira.latestComments(issue.key, cap); } catch (e) {
    const g = asGap(`${ref}:comments`, e);
    gaps.push(gap(`${ref}:comments`, g.reason, `comments not read: ${g.detail ?? g.reason}`));
    return "c?";
  }
  if (before) {
    // The page is newest first, so every unread comment is older than the ones read: the dropped ones leave the
    // total too, and no count or gap reveals that later comments exist.
    const kept = got.comments.filter((c) => !postedAfter(c.created, before));
    got = { comments: kept, total: got.total - (got.comments.length - kept.length) };
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
  const ask = (list) => jira.recency(list);
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
