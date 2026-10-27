// plugins/vc-test/skills/ticket-context/lib/since.mjs — the decisions of `prepare <KEY> --since <round record>`, the
// round-N delta read (vc-test P2-2, rounds.md): what changed since the last tested round. Pure: cli.mjs reads, this
// decides. A record is rounds.mjs close's `<RUN_DIR>/rounds/round-<N>.json`; its paths are POSIX, relative to outputRoot().
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const SHA = /^[0-9a-f]{7,64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** The round record at `path` (relative: against `root`). Throws an Error naming what is wrong — a usage failure. */
export function readRoundRecord(path, root) {
  const abs = isAbsolute(path) ? path : resolve(root, path);
  let record;
  try { record = JSON.parse(readFileSync(abs, "utf8")); } catch (e) { throw new Error(`--since: cannot read the round record ${abs}: ${e.code ?? "not JSON"}`); }
  if (!Array.isArray(record?.build)) throw new Error("--since: the round record has no build[]");
  for (const b of record.build) {
    if (typeof b?.repo !== "string" || !Number.isInteger(b?.number) || !SHA.test(String(b?.sha))) throw new Error("--since: a build[] entry needs repo, number and a lower-case sha of 7+ hex");
  }
  if (!ISO.test(String(record.closedAt)) || Number.isNaN(Date.parse(record.closedAt))) throw new Error("--since: the round record's closedAt is not an ISO instant with an offset");
  if (record.bugs !== undefined && !Array.isArray(record.bugs)) throw new Error("--since: the round record's bugs is not a list");
  return { record, path: abs };
}

/** The recorded build entry of a PR: same number, same repository name (a record may omit the owner; compared
 *  case-insensitively, as GitHub names are). */
export function buildEntryFor(p, build) {
  const name = String(p.repo).toLowerCase();
  const owner = String(p.owner ?? "").toLowerCase();
  return build.find((b) => {
    if (b.number !== p.number) return false;
    const parts = String(b.repo).toLowerCase().split("/");
    return parts.length === 1 ? parts[0] === name : parts[1] === name && (!owner || parts[0] === owner);
  }) ?? null;
}

/** A PR against the last tested round: its head is the recorded sha (a prefix of it may be recorded) ⇒ unchanged; its
 *  head moved ⇒ changed, diffed from the recorded sha; not in the record ⇒ new. */
export function classifyPr(p, build) {
  const b = buildEntryFor(p, build);
  if (!b) return { delta: "new" };
  const head = String(p.meta?.head?.sha ?? "").toLowerCase();
  const sha = String(b.sha).toLowerCase();
  if (head && head.startsWith(sha)) return { delta: "unchanged" };
  return { delta: "changed", from: sha };
}

/** GitHub compare's status → the sha the delta diff starts from. `diverged` or `behind` (a force-push: the recorded
 *  sha is no ancestor of the head) is null — the whole PR diff is read, never "unchanged" (Review Focus 4). */
export function compareFrom(status, sha) {
  return status === "ahead" || status === "identical" ? sha : null;
}

/** The issue with only the comments created after `closedAt` (their rendered twins kept, paired by index) — the
 *  mirror of jira.mjs blindIssue. A comment with no parsable date is kept: a missing date is never guessed away. */
export function commentsAfter(issue, closedAt) {
  const cutoff = Date.parse(closedAt);
  const c = issue.fields?.comment;
  if (!Array.isArray(c?.comments)) return issue;
  const keep = c.comments.map((x) => !(Date.parse(x?.created) <= cutoff));
  const out = { ...issue, fields: { ...issue.fields, comment: { ...c, comments: c.comments.filter((_, i) => keep[i]) } } };
  out.fields.comment.total = out.fields.comment.comments.length;
  const rc = issue.renderedFields?.comment;
  if (Array.isArray(rc?.comments)) out.renderedFields = { ...issue.renderedFields, comment: { ...rc, comments: rc.comments.filter((_, i) => keep[i] ?? true) } };
  return out;
}

/** Whether the ticket's description or AC-field text differs from the round's bundle copy (both as ticketFields
 *  extracts them). */
export function acceptanceChanged(fields, bundle) {
  const was = bundle?.fields ?? {};
  return String(fields.description ?? "") !== String(was.description ?? "") || String(fields.acceptance ?? "") !== String(was.acceptance ?? "");
}

/** The tracker keys of the record's out-of-scope bugs, once each. */
export function outOfScopeKeys(record) {
  return [...new Set((record.bugs ?? []).filter((b) => b?.scope === "out" && typeof b.key === "string" && b.key).map((b) => b.key))];
}
