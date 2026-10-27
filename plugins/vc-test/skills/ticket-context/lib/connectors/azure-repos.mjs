// plugins/vc-test/skills/ticket-context/lib/connectors/azure-repos.mjs — the Azure Repos code-host connector (spec §7).
// Every read is one `node "$VC_RUN" ado …` launch (get-pr, pr-iterations, pr-changes, pr-threads, get-file --commit;
// project pinned to the profile) and returns the GitHub shapes collectPr reads. Azure has no unified-diff endpoint, so
// the diff is built here: each changed file at the merge base and at the source commit, compared by plain local
// `git diff --no-index` (no token, no repository). PR statuses are not read in v1.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { HostGoverned, bridgeRun } from "../bridge.mjs";
import { CAPS } from "../fetch.mjs";
import { GapError, gap } from "../gap.mjs";
import { checkNumber, checkRepo, checkSha } from "../github.mjs";
import { cacheDir, outputRoot } from "../paths.mjs";

const PR_URL_RE = /^https:\/\/(?:dev\.azure\.com\/[^/]+|[^./]+\.visualstudio\.com)\/([^/?#]+)\/_git\/([^/?#]+)\/pullrequest\/(\d+)/i;
const strip = (p) => String(p ?? "").replace(/^\/+/, "");
const READ_FILES = 4; // files whose two sides are read at once: up to 8 bridge launches in flight
const FATAL = new Set(["access-denied", "no-credential"]); // every other file would be refused the same way

/** A pull-request URL a ticket names (`…/<project>/_git/<repo>/pullrequest/<n>`) as a ref, or null — also null when a
 *  name fails the ref check that keeps names safe in paths and file names. */
export function azurePrRefFromUrl(url) {
  const m = PR_URL_RE.exec(String(url ?? ""));
  if (!m) return null;
  const [owner, repo] = [m[1], m[2]].map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  try { checkRepo(owner, repo); } catch { return null; }
  return { ref: `${owner}/${repo}#${m[3]}`, owner, repo, number: Number(m[3]) };
}

/** The ref under the project and repository NAMES get-pr returned, when both pass the ref check; else unchanged (a
 *  work item's link names them by id). A name is what the CHANGE analyst reads a repository's layer from. */
export function refWithNames(ref, names) {
  try { checkRepo(names?.project, names?.repo); } catch { return ref; }
  return { ref: `${names.project}/${names.repo}#${ref.number}`, owner: names.project, repo: names.repo, number: ref.number };
}

function status(changeType) {
  const t = String(changeType ?? "").toLowerCase();
  if (t.includes("rename")) return "renamed";
  if (t.includes("add")) return "added";
  if (t.includes("delete")) return "removed";
  return "modified";
}

export function azureReposConnector({ key, run = bridgeRun, git = spawnSync, root = outputRoot() }) {
  const prState = new Map(); // `${repo}#${n}` → { iteration, changes } — read once per PR
  const diffGaps = new Map();
  const threadsOf = new Map();
  const state = async (repo, n) => {
    const k = `${repo}#${n}`;
    if (!prState.has(k)) {
      const its = (await run("ado", ["pr-iterations", "--repo", repo, "--pr", String(n)])).value ?? [];
      const iteration = its.reduce((m, it) => (it.id > (m?.id ?? -1) ? it : m), null);
      if (!iteration) throw new GapError("not-found", `pull request ${n} has no iteration`);
      const page = await run("ado", ["pr-changes", "--repo", repo, "--pr", String(n), "--iteration", String(iteration.id), "--max", String(CAPS.prFiles + 1)]);
      prState.set(k, { iteration, changes: page.changeEntries ?? [] });
    }
    return prState.get(k);
  };
  const threads = async (repo, n) => {
    const k = `${repo}#${n}`;
    if (!threadsOf.has(k)) threadsOf.set(k, ((await run("ado", ["pr-threads", "--repo", repo, "--pr", String(n)])).value ?? []).filter((t) => !t.isDeleted));
    return threadsOf.get(k);
  };
  return {
    /** The GitHub meta shape; `names` carries the project and repository names for a readable ref. */
    pr: async (o, r, n) => {
      checkRepo(o, r); checkNumber(n);
      const pr = await run("ado", ["get-pr", "--pr", String(n)]);
      return {
        title: pr.title ?? "", state: pr.status === "active" ? "open" : "closed",
        merged_at: pr.status === "completed" ? pr.closedDate ?? null : null, created_at: pr.creationDate ?? null,
        head: { sha: pr.lastMergeSourceCommit?.commitId ?? null }, base: { ref: String(pr.targetRefName ?? "").replace(/^refs\/heads\//, "") || null },
        body: pr.description ?? "", names: { project: pr.repository?.project?.name ?? null, repo: pr.repository?.name ?? null },
      };
    },
    files: async (o, r, n, cap) => {
      checkRepo(o, r); checkNumber(n);
      const { changes } = await state(r, n);
      return changes.slice(0, cap + 1).map((c) => ({ filename: strip(c.item?.path), status: status(c.changeType), additions: null, deletions: null }));
    },
    /** `from` (prepare --since): the base side is read at that commit instead of the merge base, so the diff is what
     *  changed since it; a file missing there (404) is read as not yet there. */
    diff: async (o, r, n, { from = null } = {}) => {
      checkRepo(o, r); checkNumber(n);
      if (from !== null) checkSha(from);
      const { iteration, changes } = await state(r, n);
      const base = from ?? iteration.commonRefCommit?.commitId;
      const head = iteration.sourceRefCommit?.commitId;
      const dir = join(cacheDir(key, root), `az-diff-${process.pid}-${Date.now()}`);
      const noPatch = [];
      const out = [];
      let bytes = 0;
      let unread = 0;
      // `originalPath` is a renamed file's path before the rename; `item.path` is its path now.
      const files = changes.slice(0, CAPS.prFiles).map((c) => ({ path: strip(c.item?.path), old: strip(c.originalPath ?? c.item?.path), st: status(c.changeType) }));
      // Both sides of a file are one launch each; null = this file not read. A refusal stops the whole diff.
      const read = ({ path, old, st }) => Promise.all([
        st === "added" && !from ? "" : run("ado", ["get-file", "--repo", r, "--path", old, "--commit", base], { as: "text" })
          .catch((e) => { if (from && e?.reason === "deleted") return ""; throw e; }), // not there at `from`: added since
        st === "removed" ? "" : run("ado", ["get-file", "--repo", r, "--path", path, "--commit", head], { as: "text" }),
      ]).catch((e) => { if (e instanceof HostGoverned || FATAL.has(e?.reason)) throw e; return null; });
      try {
        // READ_FILES files at a time, and none once the diff is past what collectPr keeps (CAPS.diffBytes).
        for (let i = 0; i < files.length; i += READ_FILES) {
          if (bytes > CAPS.diffBytes) { unread = files.length - i; break; }
          const batch = files.slice(i, i + READ_FILES);
          const sides = await Promise.all(batch.map(read));
          for (const [j, { path, old, st }] of batch.entries()) {
            if (!sides[j]) { noPatch.push(path); continue; }
            const [a, b] = sides[j];
            if (a.includes("\0") || b.includes("\0")) { noPatch.push(path); continue; }
            const [aRel, bRel] = [`a/${st === "added" ? path : old}`, `b/${st === "removed" ? old : path}`];
            let d;
            try {
              for (const [rel, text] of [[aRel, a], [bRel, b]]) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); }
              d = git("git", ["-c", "core.autocrlf=false", "diff", "--no-index", "--no-color", "--text", "--no-prefix", "--", aRel, bRel], { cwd: dir, encoding: "utf8", maxBuffer: 64 * 2 ** 20 });
            } catch { noPatch.push(path); continue; } // a path this disk cannot hold: a reserved name, too long
            if (d.error?.code === "ENOENT") throw new GapError("tool-missing", "git is not on PATH: the Azure Repos diff is built with git diff --no-index");
            if (d.status === 0) continue; // identical content: nothing to show
            if (d.status !== 1) { noPatch.push(path); continue; }
            let text = d.stdout;
            if (st === "added" && a === "") text = text.replace(`--- ${aRel}`, "--- /dev/null");
            if (st === "removed") text = text.replace(`+++ ${bRel}`, "+++ /dev/null");
            out.push(text);
            bytes += Buffer.byteLength(text);
          }
        }
      } finally { rmSync(dir, { recursive: true, force: true }); }
      const gaps = [];
      if (noPatch.length) gaps.push(gap(`pr:${o}/${r}#${n}:patches`, "unreadable",
        `no patch (binary or unreadable) for ${noPatch.length} file(s): ${noPatch.slice(0, 20).join(", ")}${noPatch.length > 20 ? ", …" : ""}`));
      if (unread) gaps.push(gap(`pr:${o}/${r}#${n}:diff-files`, "over-cap", `the diff passed ${CAPS.diffBytes} bytes; ${unread} of ${files.length} file(s) not read`));
      diffGaps.set(`${r}#${n}`, gaps);
      return out.join("");
    },
    /** The gaps the last diff of this PR left (files it could not show), for prepare to add to the PR's entry. */
    diffGaps: (r, n) => diffGaps.get(`${r}#${n}`) ?? [],
    reviewComments: async (o, r, n) => {
      checkRepo(o, r); checkNumber(n);
      return (await threads(r, n)).flatMap((t) => (t.comments ?? []).filter((c) => !c.isDeleted && c.commentType !== "system").map((c) => ({
        path: t.threadContext?.filePath ? strip(t.threadContext.filePath) : null, line: t.threadContext?.rightFileStart?.line ?? null,
        body: c.content ?? "", created_at: c.publishedDate ?? null,
      })));
    },
    unresolvedThreads: async (o, r, n) => {
      checkRepo(o, r); checkNumber(n);
      return (await threads(r, n)).filter((t) => t.status === "active" || t.status === "pending").length;
    },
    checkRuns: async () => { throw new GapError("connector-unavailable", "Azure Repos PR statuses are not read in v1"); },
  };
}
