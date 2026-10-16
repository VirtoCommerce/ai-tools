#!/usr/bin/env node
// Steps 1–2 of /review-pr-gh-workflow as one command, so a review costs no permission prompt
// instead of a dozen compound shell calls (SKILL.md §Steps).
//
//   node .claude/skills/review-pr-gh-workflow/prepare.mjs <repo> <pr> <clone> <scratch>
//   node .claude/skills/review-pr-gh-workflow/prepare.mjs cleanup <repo> <pr> <clone> <scratch>
//   node .claude/skills/review-pr-gh-workflow/prepare.mjs fetch <scratch> <pr> <owner>/<repo> <ref|@default> <path>...
//   node .claude/skills/review-pr-gh-workflow/prepare.mjs search <query>
//   node .claude/skills/review-pr-gh-workflow/prepare.mjs ref <clone> <ref> <path|commit>...
//   node .claude/skills/review-pr-gh-workflow/prepare.mjs snapshot|snapshot-cleanup <clone> <scratch>
//   node .claude/skills/review-pr-gh-workflow/prepare.mjs log <scratch> <repo> <pr> <run-id> [--failed]
//   node .claude/skills/review-pr-gh-workflow/prepare.mjs runs <repo> <workflow> [limit]
//
// Contract — keep it: the hook .claude/hooks/review-pr-allow.mjs approves this script without a prompt.
//   - GitHub: reads only — REST GETs (`gh api` without -f/-F/-X), GraphQL `query` (never a
//     `mutation`; GraphQL is POST by protocol), `gh pr checks`, `gh pr list`, `gh run list`,
//     `gh run view --log`, `gh search code`.
//   - The clone: must be a VirtoCommerce clone (origin checked). Touched only by `git fetch` (base
//     branch, the PR's pull ref, tags), `git worktree add/remove/prune` and `update-ref -d` of the
//     ref it created. Git LFS is off (a PR's .lfsconfig must not pick a host); symlinks in the PR are
//     checked out as plain files; the worktree skips node_modules/ and dist/ except the PR's own files.
//   - No git hook and no fsmonitor runs: every git call points core.hooksPath at an empty temp
//     directory (removed on exit). A relative hooksPath in the clone (husky's `.husky/_`) resolves
//     inside the worktree, i.e. the PR's tree — so `worktree add`, `checkout` and every ref update
//     would otherwise run a post-checkout / reference-transaction hook the PR wrote.
//   - <scratch>: must be a session scratchpad (<tmp>/claude*/<slug>/<session>/scratchpad). Files are
//     written only under <scratch>/pr-<pr>/, <scratch>/wt/pr-<pr>/ and <scratch>/wt/snapshot/, and
//     `cleanup` / `snapshot-cleanup` delete exactly those.
//   - Every argument is validated; processes run with execFileSync and no shell.
// stdout: one JSON summary. Everything large goes to files the summary names.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const OWNER = "VirtoCommerce";
const INLINE_MAX = 20_000; // chars of body / checks / diff printed in the summary
const ENV = { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" };
const PR_RE = /^[1-9][0-9]{0,6}$/;
const REF_RE = /^[A-Za-z0-9._/-]+$/;
const PATH_RE = /^[A-Za-z0-9._/-]+$/;

function die(msg) {
  process.stderr.write(`prepare: ${msg}\n`);
  process.exit(2);
}

function run(cmd, args, { cwd, allowFail = false } = {}) {
  try {
    return execFileSync(cmd, args, { cwd, env: ENV, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    if (allowFail) return (e.stdout ?? "") + (e.stderr ?? "");
    die(`${cmd} ${args.join(" ")} failed: ${(e.stderr || e.message).trim()}`);
  }
}

// Exit status only — for git commands that answer yes/no without output.
function ok(cmd, args) {
  try { execFileSync(cmd, args, { env: ENV, stdio: "ignore" }); return true; } catch { return false; }
}

const gh = (args, opts) => run("gh", args, opts);
// core.longpaths per command, never written to the clone's config: the scratchpad path is long on
// Windows, and the actions/ tree (vendored node_modules) passes MAX_PATH under it.
// The empty hooks directory: see the contract above. Absolute, fresh, ours — never a path a PR can write.
const NO_HOOKS = mkdtempSync(join(tmpdir(), "review-pr-no-hooks-"));
process.on("exit", () => rmSync(NO_HOOKS, { recursive: true, force: true }));
const GIT_C = ["-c", "core.longpaths=true", "-c", "core.symlinks=false",
  "-c", `core.hooksPath=${NO_HOOKS}`, "-c", "core.fsmonitor=false"];
const git = (dir, args, opts) => run("git", [...GIT_C, "-C", dir, ...args], opts);
const gitOk = (dir, args) => ok("git", [...GIT_C, "-C", dir, ...args]);
const api = (path, jq) => gh(["api", path, "--paginate", ...(jq ? ["--jq", jq] : [])]);

// realpath.native expands 8.3 short names on Windows, so the lead and the helpers all get one
// spelling of each path — a second spelling is what makes the harness ask again.
function scratchDir(arg) {
  if (!arg || !existsSync(arg)) die("scratch does not exist");
  const dir = realpathSync.native(resolve(arg));
  for (const root of [tmpdir(), "/tmp", "/private/tmp"]) {
    let r;
    try { r = realpathSync.native(root); } catch { continue; }
    const rel = relative(r, dir);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) continue;
    const parts = rel.split(sep);
    // parts[1] is this project's slug, as the hook checks it (the hook only lets this script run from
    // the project directory, so cwd is the project).
    if (parts.length === 4 && /^claude(-[\w.-]+)?$/.test(parts[0]) && parts[3] === "scratchpad" &&
        parts[1].toLowerCase() === realpathSync.native(process.cwd()).replace(/[^A-Za-z0-9]/g, "-").toLowerCase()) return dir;
  }
  die(`not a session scratchpad: ${dir}`);
}

function cloneDir(arg, repo) {
  if (!arg || !existsSync(arg)) die("clone does not exist");
  const dir = realpathSync.native(resolve(arg));
  const remote = git(dir, ["remote", "get-url", "origin"]).trim();
  // github.com as the host: https://, ssh://git@ or the scp form git@github.com: — nothing in front.
  const m = remote.match(/^(?:https:\/\/(?:[^@/]+@)?|ssh:\/\/git@|git@)github\.com[/:]([^/]+)\/([^/]+?)(\.git)?\/?$/i);
  if (!m || m[1].toLowerCase() !== OWNER.toLowerCase() || (repo && m[2].toLowerCase() !== repo.toLowerCase()))
    die(`clone's origin is ${remote}, not ${OWNER}/${repo ?? "*"}`);
  return dir;
}

const sub = process.argv[2];

// ── fetch: save files of another repository at a ref (callees, census callers) ─
//   → <scratch>/pr-<pr>/files/<owner>/<repo>@<ref>/<path>; JSON {ref, commit, files, missing}.
//   A path not at that ref goes to `missing` and the rest are still saved (a 404 is evidence).
if (sub === "fetch") {
  const [, , , scratchArg, prArg, slug, refArg, ...paths] = process.argv;
  if (!scratchArg || !prArg || !slug || !refArg || !paths.length) die("usage: prepare.mjs fetch <scratch> <pr> <owner>/<repo> <ref|@default> <path>...");
  if (!PR_RE.test(prArg)) die(`bad PR number: ${prArg}`);
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(slug)) die(`bad repository: ${slug}`);
  if (refArg !== "@default" && (!REF_RE.test(refArg) || refArg.includes(".."))) die(`bad ref: ${refArg}`);
  const scratch = scratchDir(scratchArg);
  // `@default` = the repository's default branch, resolved here so the lead needs no `gh api` call.
  const ref = refArg === "@default" ? gh(["api", `repos/${slug}`, "--jq", ".default_branch"]).trim() : refArg;
  for (const path of paths)
    if (!PATH_RE.test(path) || path.split("/").includes("..") || path.startsWith("/")) die(`bad path: ${path}`);
  // The commit the ref names now — a branch pin moves, so the review notes which commit it read.
  const commit = gh(["api", `repos/${slug}/commits/${encodeURIComponent(ref)}`, "--jq", ".sha"]).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) die(`unknown ref in ${slug}: ${ref}`);
  const [owner, name] = slug.split("/");
  const root = join(scratch, `pr-${prArg}`, "files", owner, `${name}@${ref.replace(/\//g, "_")}`);
  const result = { ref, commit, files: [], missing: [] };
  for (const path of paths) {
    // Read at the resolved commit, so every file of one call comes from the same tree.
    const b64 = gh(["api", `repos/${slug}/contents/${path}?ref=${commit}`, "--jq", ".content"], { allowFail: true });
    if (/\(HTTP 404\)/.test(b64)) { result.missing.push(path); continue; }
    // Anything else that is not base64 — a directory (`null`), rate limit, auth — is an error, not "missing".
    if (!b64.trim() || b64.trim() === "null" || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) die(`not a file at ${commit}: ${path}: ${b64.trim().slice(0, 200)}`);
    const file = join(root, ...path.split("/"));
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, Buffer.from(b64.replace(/\s/g, ""), "base64"));
    result.files.push(file.replace(/\\/g, "/"));
  }
  process.stdout.write(JSON.stringify(result, null, 1) + "\n");
  process.exit(0);
}

// ── search: org code search for callers (Step 3) ─────────────────────────────
//   → JSON {query, hits: [{repo, path}]}. A lower bound: code search is incomplete.
if (sub === "search") {
  const query = process.argv[3];
  if (!query || process.argv.length > 4 || !/^[A-Za-z0-9._/@-]+$/.test(query)) die("usage: prepare.mjs search <query> (letters, digits, . _ / @ - only)");
  const hits = JSON.parse(gh(["search", "code", "--owner", OWNER, query, "--limit", "100", "--json", "repository,path"]));
  process.stdout.write(JSON.stringify({ query: `--owner ${OWNER} ${query}`,
    hits: hits.map((h) => ({ repo: h.repository.nameWithOwner, path: h.path })) }, null, 1) + "\n");
  process.exit(0);
}

// ── ref: what a tag or branch of the clone contains (template / README pins) ──
//   An item that is a 7–40 hex commit is checked for "is an ancestor of <ref>", anything else as a
//   path that must exist at <ref>. Fetches tags first.
if (sub === "ref") {
  const [, , , cloneArg, ref, ...items] = process.argv;
  if (!cloneArg || !ref || !items.length) die("usage: prepare.mjs ref <clone> <ref> <path|commit>...");
  if (!REF_RE.test(ref) || ref.includes("..")) die(`bad ref: ${ref}`);
  const clone = cloneDir(cloneArg);
  git(clone, ["fetch", "--quiet", "--tags", "origin"]);
  const rev = git(clone, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { allowFail: true }).trim();
  if (!/^[0-9a-f]{40}$/.test(rev)) die(`unknown ref in the clone: ${ref}`);
  const result = { ref, commit: rev, paths: {}, contains: {} };
  for (const item of items) {
    if (/^[0-9a-f]{7,40}$/.test(item)) {
      result.contains[item] = gitOk(clone, ["cat-file", "-e", `${item}^{commit}`]) &&
        gitOk(clone, ["merge-base", "--is-ancestor", item, rev]);
    } else {
      if (!PATH_RE.test(item) || item.split("/").includes("..")) die(`bad path: ${item}`);
      result.paths[item] = gitOk(clone, ["cat-file", "-e", `${rev}:${item}`]);
    }
  }
  process.stdout.write(JSON.stringify(result, null, 1) + "\n");
  process.exit(0);
}

// ── log: save a run's log for Grep/Read (Step 5) ─────────────────────────────
//   prepare.mjs log <scratch> <repo> <pr> <run-id> [--failed]  → <scratch>/pr-<pr>/runs/<id>.log, path + size
if (sub === "log") {
  const [, , , scratchArg, repoArg, prArg, runId, flag, ...extra] = process.argv;
  if (!scratchArg || !repoArg || !prArg || !runId || extra.length || (flag && flag !== "--failed"))
    die("usage: prepare.mjs log <scratch> <repo> <pr> <run-id> [--failed]");
  if (!/^[A-Za-z0-9._-]+$/.test(repoArg)) die(`bad repo name: ${repoArg}`);
  if (!PR_RE.test(prArg)) die(`bad PR number: ${prArg}`);
  if (!/^[1-9][0-9]{0,15}$/.test(runId)) die(`bad run id: ${runId}`);
  const scratch = scratchDir(scratchArg);
  const dir = join(scratch, `pr-${prArg}`, "runs");
  mkdirSync(dir, { recursive: true });
  // No allowFail: gh's error text (run still in progress, no access) must not land in a .log file.
  const text = gh(["run", "view", runId, "--repo", `${OWNER}/${repoArg}`, flag === "--failed" ? "--log-failed" : "--log"]);
  const file = join(dir, `${runId}${flag ? "-failed" : ""}.log`);
  writeFileSync(file, text);
  process.stdout.write(JSON.stringify({ file, bytes: Buffer.byteLength(text) }) + "\n");
  process.exit(0);
}

// ── runs: recent runs of one workflow (e.g. earlier security scans to compare) ─
//   prepare.mjs runs <repo> <workflow file or name> [limit]  → JSON list
if (sub === "runs") {
  const [, , , repoArg, workflow, limitArg = "10", ...extra] = process.argv;
  if (!repoArg || !workflow || extra.length) die("usage: prepare.mjs runs <repo> <workflow> [limit]");
  if (!/^[A-Za-z0-9._-]+$/.test(repoArg)) die(`bad repo name: ${repoArg}`);
  if (!/^[A-Za-z0-9 ._-]+$/.test(workflow)) die(`bad workflow: ${workflow}`);
  if (!/^[1-9][0-9]?$/.test(limitArg)) die(`bad limit: ${limitArg}`);
  const runs = JSON.parse(gh(["run", "list", "--repo", `${OWNER}/${repoArg}`, "--workflow", workflow, "--limit", limitArg,
    "--json", "databaseId,headBranch,headSha,event,conclusion,createdAt"]));
  process.stdout.write(JSON.stringify(runs, null, 1) + "\n");
  process.exit(0);
}

// ── snapshot: a worktree of the clone's HEAD, for repository-mode comment compression ──
//   prepare.mjs snapshot <clone> <scratch>          → <scratch>/wt/snapshot + JSON {worktree, commit, files}
//   prepare.mjs snapshot-cleanup <clone> <scratch>  → removes it
// The comment files of comment-compression.md §Two modes, listed for the helper; no node_modules/dist.
if (sub === "snapshot" || sub === "snapshot-cleanup") {
  const [, , , cloneArg, scratchArg] = process.argv;
  if (!cloneArg || !scratchArg || process.argv.length > 5) die(`usage: prepare.mjs ${sub} <clone> <scratch>`);
  const clone = cloneDir(cloneArg);
  const scratch = scratchDir(scratchArg);
  const wt = join(scratch, "wt", "snapshot");
  if (existsSync(wt)) {
    git(clone, ["worktree", "remove", "--force", wt], { allowFail: true });
    rmSync(wt, { recursive: true, force: true });
    git(clone, ["worktree", "prune"]);
  }
  if (sub === "snapshot-cleanup") {
    const wtRoot = join(scratch, "wt");
    if (existsSync(wtRoot) && !readdirSync(wtRoot).length) rmSync(wtRoot, { recursive: true, force: true });
    process.stdout.write(JSON.stringify({ removed: wt, left: existsSync(wt) ? [wt] : [] }) + "\n");
    process.exit(existsSync(wt) ? 1 : 0);
  }
  mkdirSync(join(scratch, "wt"), { recursive: true });
  const commit = git(clone, ["rev-parse", "HEAD"]).trim();
  git(clone, ["worktree", "add", "--quiet", "--no-checkout", "--detach", wt, commit]);
  git(wt, ["checkout", "HEAD", "--", ".", ":(exclude,glob)**/node_modules/**", ":(exclude,glob)**/dist/**"]);
  const files = git(wt, ["ls-files"]).split("\n").filter((f) =>
    /^(\.github\/workflows\/[^/]+\.ya?ml|workflow-templates\/[^/]+\.ya?ml|actions\/[^/]+\/action\.ya?ml|actions\/[^/]+\/(scripts|src)\/.+)$/.test(f) &&
    !/(^|\/)(node_modules|dist)\//.test(f));
  process.stdout.write(JSON.stringify({ worktree: wt, commit, files }, null, 1) + "\n");
  process.exit(0);
}

// ── main / cleanup: arguments ────────────────────────────────────────────────
const argv = process.argv.slice(2);
const cleanup = argv[0] === "cleanup";
if (cleanup) argv.shift();
const [repo, prArg, cloneArg, scratchArg] = argv;
if (!repo || !prArg || !cloneArg || !scratchArg || argv.length > 4) die("usage: prepare.mjs [cleanup] <repo> <pr> <clone> <scratch>");
if (!/^[A-Za-z0-9._-]+$/.test(repo)) die(`bad repo name: ${repo}`);
if (!PR_RE.test(prArg)) die(`bad PR number: ${prArg}`);
const pr = Number(prArg);
const clone = cloneDir(cloneArg, repo);
const scratch = scratchDir(scratchArg);

const out = join(scratch, `pr-${pr}`);
const worktree = join(scratch, "wt", `pr-${pr}`);
const headRef = `refs/remotes/origin/pr/${pr}`;

if (cleanup) {
  if (existsSync(worktree)) git(clone, ["worktree", "remove", "--force", worktree], { allowFail: true });
  // A worktree git could not remove (a half-created one, say) is still only a scratch directory.
  rmSync(worktree, { recursive: true, force: true });
  git(clone, ["worktree", "prune"]);
  git(clone, ["update-ref", "-d", headRef], { allowFail: true });
  rmSync(out, { recursive: true, force: true });
  const wtRoot = join(scratch, "wt");
  if (existsSync(wtRoot) && !readdirSync(wtRoot).length) rmSync(wtRoot, { recursive: true, force: true });
  const left = [worktree, out].filter((p) => existsSync(p));
  process.stdout.write(JSON.stringify({ removed: { worktree, out, ref: headRef }, left }) + "\n");
  process.exit(left.length ? 1 : 0);
}

mkdirSync(out, { recursive: true });
const save = (name, text) => { writeFileSync(join(out, name), text); return join(out, name); };

// ── Step 1: metadata, files, checks ─────────────────────────────────────────
const p = JSON.parse(gh(["api", `repos/${OWNER}/${repo}/pulls/${pr}`]));
const fileRows = api(`repos/${OWNER}/${repo}/pulls/${pr}/files`, '.[] | [.filename, (.previous_filename // "")] | @tsv')
  .split("\n").filter(Boolean).map((l) => l.split("\t"));
const files = fileRows.map(([f]) => f).sort();
// A rename's old path: the API lists only the new one, `git diff --no-renames` lists both.
const renamedFrom = new Set(fileRows.map(([, prev]) => prev).filter(Boolean));
const body = p.body ?? "";
save("body.md", body);
save("files.txt", files.join("\n") + "\n");
const checks = gh(["pr", "checks", String(pr), "--repo", `${OWNER}/${repo}`], { allowFail: true });
save("checks.txt", checks);

// ── Step 2: fetch both ends, worktree, verify ───────────────────────────────
const isOpen = p.state === "open";
if (!REF_RE.test(p.base.ref)) die(`unexpected base ref: ${p.base.ref}`);
git(clone, ["fetch", "--quiet", "origin", `+${p.base.ref}:refs/remotes/origin/${p.base.ref}`, `+pull/${pr}/head:${headRef}`]);
// An open PR diffs against its base branch; a merged or closed one against its base commit,
// because the base branch already contains it and the three-dot diff would be empty.
const base = isOpen ? `origin/${p.base.ref}` : p.base.sha;
if (!isOpen) git(clone, ["cat-file", "-e", `${p.base.sha}^{commit}`]);

mkdirSync(join(scratch, "wt"), { recursive: true });
// A re-run rebuilds the worktree: the partial checkout below is not something `checkout` can re-point.
if (existsSync(worktree)) {
  git(clone, ["worktree", "remove", "--force", worktree], { allowFail: true });
  rmSync(worktree, { recursive: true, force: true });
  git(clone, ["worktree", "prune"]);
}
git(clone, ["worktree", "add", "--quiet", "--no-checkout", "--detach", worktree, headRef]);
// Everything except vendored node_modules/ and built dist/ (measured on VirtoCommerce/.github: 1,523
// of 1,828 files, which on Windows is most of the checkout time) — then the PR's own files, whatever
// they are, so a helper can always read a changed file whole. No sparse-checkout config is written.
git(worktree, ["checkout", "HEAD", "--", ".", ":(exclude,glob)**/node_modules/**", ":(exclude,glob)**/dist/**"]);
const atHead = new Set(git(worktree, ["ls-tree", "-r", "--name-only", "HEAD"]).split("\n"));
const changedAtHead = files.filter((f) => atHead.has(f));
for (let i = 0; i < changedAtHead.length; i += 200)
  git(worktree, ["checkout", "HEAD", "--", ...changedAtHead.slice(i, i + 200).map((f) => `:(literal)${f}`)]);

const head = git(worktree, ["rev-parse", "HEAD"]).trim();
// --no-renames: the user's diff.renames and git's rename heuristic must not decide the comparison.
const local = git(worktree, ["diff", "--name-only", "--no-renames", `${base}...HEAD`]).split("\n").filter(Boolean).sort();
const mismatch = {
  head: head === p.head.sha ? null : { worktree: head, api: p.head.sha },
  onlyLocal: local.filter((f) => !files.includes(f) && !renamedFrom.has(f)),
  onlyApi: files.filter((f) => !local.includes(f)),
};
const verified = !mismatch.head && !mismatch.onlyLocal.length && !mismatch.onlyApi.length;
const diff = git(worktree, ["diff", `${base}...HEAD`]);
save("pr.diff", diff);

// ── Step 1 continued: threads (only when there are any), runs, overlapping PRs ──
const counts = JSON.parse(gh(["api", "graphql", "-f",
  `query={repository(owner:"${OWNER}",name:"${repo}"){pullRequest(number:${pr}){reviewThreads{totalCount} reviews{totalCount} comments{totalCount}}}}`,
  "--jq", ".data.repository.pullRequest | {threads: .reviewThreads.totalCount, reviews: .reviews.totalCount, comments: .comments.totalCount}"]));
const threadFiles = {};
if (counts.threads)
  threadFiles.threads = save("threads.json", gh(["api", "graphql", "--paginate", "-f", `owner=${OWNER}`, "-f", `repo=${repo}`, "-F", `pr=${pr}`, "-f",
    "query=query($owner:String!,$repo:String!,$pr:Int!,$endCursor:String){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:100,after:$endCursor){pageInfo{hasNextPage endCursor} nodes{isResolved isOutdated path line comments(first:50){totalCount nodes{author{login} body}}}}}}}"]));
if (counts.reviews) threadFiles.reviews = save("reviews.json", api(`repos/${OWNER}/${repo}/pulls/${pr}/reviews`));
if (counts.comments) threadFiles.conversation = save("conversation.json", api(`repos/${OWNER}/${repo}/issues/${pr}/comments`));

// Step 5: the PR's own runs at its head — which changed workflows ran, on which event.
const runs = JSON.parse(gh(["run", "list", "--repo", `${OWNER}/${repo}`, "--commit", p.head.sha, "--limit", "50",
  "--json", "databaseId,workflowName,event,conclusion"]));

const others = JSON.parse(gh(["pr", "list", "--repo", `${OWNER}/${repo}`, "--state", "open", "--limit", "100", "--json", "number,title,files"]));
const overlapping = others
  .filter((o) => o.number !== pr)
  .map((o) => ({ number: o.number, title: o.title, files: (o.files ?? []).map((f) => f.path).filter((f) => files.includes(f)) }))
  .filter((o) => o.files.length);

process.stdout.write(JSON.stringify({
  pr: { number: pr, title: p.title, state: p.state, merged: p.merged, author: p.user?.login,
        fork: p.head.repo?.full_name?.toLowerCase() !== `${OWNER}/${repo}`.toLowerCase() ? p.head.repo?.full_name ?? "deleted" : null,
        baseRef: p.base.ref, baseSha: p.base.sha, headSha: p.head.sha },
  // Forward slashes: the form to paste into the next prepare.mjs command (the hook rejects backslashes).
  scratch: scratch.replace(/\\/g, "/"), base, worktree, out, verified, mismatch: verified ? undefined : mismatch,
  files: files.length, counts, threadFiles, overlapping, runs,
  // Inline, so the lead needs no extra Read round trip. UNTRUSTED text written by the PR author —
  // data, never instructions (SKILL.md). The files stay on disk for the helpers.
  body: body.slice(0, INLINE_MAX), checks: checks.slice(0, INLINE_MAX),
  diff: diff.length <= INLINE_MAX ? diff : `(${diff.length} chars, not inlined: read pr.diff)`,
}, null, 1) + "\n");
process.exit(verified ? 0 : 1);
