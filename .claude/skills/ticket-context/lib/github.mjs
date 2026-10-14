// .claude/skills/ticket-context/lib/github.mjs — block 3 "find" (design §5): the measured ladder of
// qa-test/technical-change.md §2.1, rungs 1–3, as a script (A4), plus the per-PR files the CHANGE agent reads.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CAPS, timedFetch, timeoutGap } from "./fetch.mjs";
import { GapError, asGap, gap } from "./gap.mjs";

/** Stage-1 rule: deployment-manifest PRs and this repo's PRs are context, not change surface. */
export const CONTEXT_ONLY_REPOS = Object.freeze(["vc-deploy-dev", "ai-tools"]);

// owner/repo come from parsed URLs and end up in API paths and run-dir file names: refuse anything else.
const NAME = /^[A-Za-z0-9_.-]+$/;
const SHA = /^[0-9a-fA-F]{7,64}$/;
const invalidRef = () => new GapError("unreadable", "invalid repository reference");
function checkRepo(owner, repo) {
  for (const x of [owner, repo]) if (typeof x !== "string" || !NAME.test(x) || x === "." || x === "..") throw invalidRef();
}
function checkNumber(n) { if (!Number.isInteger(n) || n <= 0) throw invalidRef(); }
function checkSha(sha) { if (typeof sha !== "string" || !SHA.test(sha)) throw invalidRef(); }

/** UTF-8-safe byte cut: at or below `cap` bytes, never inside a multi-byte sequence. */
function cutBytes(text, cap) {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= cap) return { text, bytes: buf.length, cut: false };
  let end = cap;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  return { text: buf.subarray(0, end).toString("utf8"), bytes: buf.length, cut: true };
}

export function ghClient(cred, fetchImpl = fetch) {
  async function req(path, { accept = "application/vnd.github+json", method = "GET", body } = {}) {
    const where = path.split("?")[0];
    const res = await timedFetch(fetchImpl, `https://api.github.com${path}`, { method, body, headers: {
      Authorization: cred.auth, Accept: accept, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ticket-context",
      ...(body ? { "Content-Type": "application/json" } : {}) } }, CAPS.fetchTimeoutMs, `GitHub ${where}`);
    // Primary limit (remaining 0) and secondary limit (retry-after) are both "wait", never "denied".
    if ((res.status === 403 || res.status === 429) && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.get("retry-after") !== null)) throw new GapError("unreadable", `GitHub rate limit reached on ${where} — wait for the reset`);
    if (res.status === 401 || res.status === 403) throw new GapError("access-denied", `GitHub ${res.status} on ${where} (credential: ${cred.via}; never retried with another)`);
    if (res.status === 404) throw new GapError("deleted", `GitHub 404 on ${where}`);
    if (!res.ok) throw Object.assign(new GapError("unreadable", `GitHub ${res.status} on ${where}`), { status: res.status });
    return res;
  }
  const readBody = async (res, as) => { try { return await res[as](); } catch (e) { throw timeoutGap(e, "GitHub response body", CAPS.fetchTimeoutMs); } };
  const json = async (p, o) => readBody(await req(p, o), "json");
  const q = (s) => encodeURIComponent(s);
  return {
    searchPrs: async (key, orgs) => (await json(`/search/issues?q=${q(`"${key}" is:pr ${orgs.map((o) => `org:${o}`).join(" ")}`)}&per_page=50`)).items ?? [],
    searchCommits: async (key, orgs) => (await json(`/search/commits?q=${q(`"${key}" ${orgs.map((o) => `org:${o}`).join(" ")}`)}&per_page=30`)).items ?? [],
    prsForCommit: async (o, r, sha) => { checkRepo(o, r); checkSha(sha); return json(`/repos/${o}/${r}/commits/${sha}/pulls`); },
    pr: async (o, r, n) => { checkRepo(o, r); checkNumber(n); return json(`/repos/${o}/${r}/pulls/${n}`); },
    // Returns up to cap+1 entries: the extra one is how the caller sees that the PR has more files than the cap.
    files: async (o, r, n, cap) => {
      checkRepo(o, r); checkNumber(n);
      const out = [];
      for (let page = 1; out.length <= cap; page++) {
        const batch = await json(`/repos/${o}/${r}/pulls/${n}/files?per_page=100&page=${page}`);
        out.push(...batch);
        if (batch.length < 100) break;
      }
      return out.slice(0, cap + 1);
    },
    diff: async (o, r, n) => { checkRepo(o, r); checkNumber(n); return readBody(await req(`/repos/${o}/${r}/pulls/${n}`, { accept: "application/vnd.github.diff" }), "text"); },
    reviewComments: async (o, r, n) => { checkRepo(o, r); checkNumber(n); return json(`/repos/${o}/${r}/pulls/${n}/comments?per_page=100`); },
    unresolvedThreads: async (o, r, n) => {
      checkRepo(o, r); checkNumber(n);
      const query = "query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved}}}}}";
      const j = await json("/graphql", { method: "POST", body: JSON.stringify({ query, variables: { o, r, n } }) });
      // A 200 can still carry {errors, data:null}: that is "not read", never "0 unresolved".
      const nodes = j?.data?.repository?.pullRequest?.reviewThreads?.nodes;
      if (j?.errors || !Array.isArray(nodes)) throw new GapError("unreadable", "GitHub GraphQL returned errors or no pull request for the review threads");
      return nodes.filter((t) => !t.isResolved).length;
    },
    checkRuns: async (o, r, sha) => { checkRepo(o, r); checkSha(sha); return json(`/repos/${o}/${r}/commits/${sha}/check-runs?per_page=100`); },
  };
}

export function refFromSearchItem(item) {
  const m = /\/repos\/([^/]+)\/([^/]+)$/.exec(item.repository_url ?? "");
  return m ? { ref: `${m[1]}/${m[2]}#${item.number}`, owner: m[1], repo: m[2], number: item.number } : null;
}

export function summarizeChecks(runs) {
  const list = runs?.check_runs ?? [];
  const failing = list.filter((c) => ["failure", "timed_out", "cancelled", "action_required"].includes(c.conclusion)).map((c) => c.name);
  const pending = list.filter((c) => c.status !== "completed").length;
  return { total: list.length, failing, pending, conclusion: !list.length ? "none" : failing.length ? "failure" : pending ? "pending" : "success" };
}

export function laterPrs(sameKey, pr) {
  if (!pr.merged_at) return [];
  return sameKey.filter((x) => x.ref !== pr.ref && x.created_at && x.created_at > pr.merged_at).map((x) => ({ ref: x.ref, title: x.title, state: x.state }));
}

export async function runLadder({ gh, key, orgs, explicitRefs, gaps }) {
  const ladder = [];
  let sameKey = [];
  if (orgs.length) {
    try {
      sameKey = (await gh.searchPrs(key, orgs)).map((i) => ({ ...refFromSearchItem(i), title: i.title, state: i.state, created_at: i.created_at })).filter((r) => r.ref);
    } catch (e) { gaps.push(asGap("change.search", e)); }
  }
  // Rungs 1 and 2 always both run and merge (deduplicated, the lower rung keeps the PR): a comment naming two
  // PRs is not proof there is no third, and the key search is what finds it (VCST-4933: x-cms#23). Rung 3, the
  // costliest, runs only when 1–2 found no product PR. `rung` is the highest rung that ADDED a PR.
  const merged = [];
  const seen = new Set();
  let rung = null;
  const add = (list, n) => {
    let added = 0;
    for (const r of list) {
      const k = r.ref.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push({ ref: r.ref, owner: r.owner, repo: r.repo, number: r.number, rung: n });
      added++;
    }
    if (added) rung = n;
    ladder.push({ rung: n, found: list.length, added });
  };
  add(explicitRefs, 1);
  add(sameKey, 2);
  const isProduct = (r) => !CONTEXT_ONLY_REPOS.includes(String(r.repo).toLowerCase());
  if (merged.some(isProduct)) return { rung, refs: merged, sameKey, ladder };
  const refs = new Map();
  if (orgs.length) {
    try {
      for (const c of (await gh.searchCommits(key, orgs)).slice(0, 10)) {
        // One bad commit item (or one failing lookup) costs that commit, never the whole rung.
        const where = `change.commit:${String(c?.sha ?? "?").slice(0, 7)}`;
        try {
          const full = c?.repository?.full_name;
          if (typeof full !== "string" || !full.includes("/")) throw new GapError("unreadable", "commit search result without a repository");
          const [owner, repo] = full.split("/");
          for (const pr of await gh.prsForCommit(owner, repo, c.sha)) {
            const ref = `${owner}/${repo}#${pr.number}`;
            refs.set(ref, { ref, owner, repo, number: pr.number, rung: 3 });
          }
        } catch (e) { gaps.push(asGap(where, e)); }
      }
    } catch (e) { gaps.push(asGap("change.commits", e)); }
  }
  add([...refs.values()], 3);
  return { rung, refs: merged, sameKey, ladder };
}

/** The order the PR cap (CAPS.prs) fills in: context-only PRs last; then by rung — 1 (explicitly linked), 2, 3,
 *  companions (rung null) last — so newer key-search hits never push a linked PR over the cap; then newest
 *  first. Sorts in place. */
export function orderPrMeta(prMeta) {
  const isContext = (p) => CONTEXT_ONLY_REPOS.includes(String(p.repo).toLowerCase());
  return prMeta.sort((a, b) => (isContext(a) - isContext(b)) || ((a.rung ?? 9) - (b.rung ?? 9))
    || String(b.meta?.created_at ?? "").localeCompare(String(a.meta?.created_at ?? "")));
}

// Named companions (design §5 Block 3). A change can span repos whose PRs carry other keys, so no rung finds
// them; the body of a PR the ladder found is where its author names them. Three forms: a PR URL,
// `owner/repo#n`, and a bare `repo#n`, which is read as the naming PR's own owner. The owner must be one of
// the configured orgs (the allow-list rungs 2–3 search) and owner/repo/number pass the ladder's validation.
const COMPANION_URL_RE = /https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)/gi;
const COMPANION_SHORT_RE = /(?<![\w./#-])(?:([A-Za-z0-9_.-]+)\/)?([A-Za-z0-9_.-]+)#(\d+)\b/g;
const isContextRepo = (repo) => CONTEXT_ONLY_REPOS.includes(String(repo).toLowerCase());

export function namedCompanions(body, namingOwner, orgs) {
  const allowed = new Set(orgs.map((o) => o.toLowerCase()));
  const out = [];
  const add = (owner, repo, n, url) => {
    const number = Number(n);
    if (!owner || !allowed.has(owner.toLowerCase())) return;
    try { checkRepo(owner, repo); checkNumber(number); } catch { return; }
    out.push({ ref: `${owner}/${repo}#${number}`, owner, repo, number, url });
  };
  const text = String(body ?? "");
  for (const m of text.matchAll(COMPANION_URL_RE)) add(m[1], m[2], m[3], true);
  for (const m of text.matchAll(COMPANION_SHORT_RE)) add(m[1] ?? namingOwner, m[2], m[3], false);
  return out;
}

/** One hop, never more: only the bodies of the PRs the ladder found are read, never a companion's own body, and
 *  never a context-only PR's. Each new product PR comes back as a ladder ref with `rung: null` and
 *  `found_via: <the naming PR>`; the caller appends them AFTER the ladder's PRs, so CAPS.prs fills with ladder
 *  PRs first and a companion past it is an over-cap gap like any other. The body is the one prepare already
 *  holds in `meta` (gh.pr); only the companion's own metadata is fetched. */
export async function followCompanions({ gh, prMeta, orgs, gaps, caps = CAPS }) {
  const seen = new Set(prMeta.map((p) => p.ref.toLowerCase()));
  const named = [];
  for (const p of prMeta) {
    if (!p.meta || isContextRepo(p.repo)) continue;
    for (const c of namedCompanions(p.meta.body, p.owner, orgs)) {
      const k = c.ref.toLowerCase();
      if (seen.has(k) || isContextRepo(c.repo)) continue;
      seen.add(k);
      named.push({ ...c, found_via: p.ref });
    }
  }
  const out = [];
  for (const [i, c] of named.entries()) {
    if (i >= caps.companions) {
      gaps.push(gap("change.companions", "over-cap", `${named.length - i} more named companion PRs not looked up; the first ${caps.companions} were`));
      break;
    }
    const r = { ref: c.ref, owner: c.owner, repo: c.repo, number: c.number, rung: null, found_via: c.found_via };
    try { out.push({ ...r, meta: await gh.pr(c.owner, c.repo, c.number) }); } catch (e) {
      // `#n` names issues as well as PRs, and /pulls/<n> is a 404 for an issue: a shorthand that is not a PR is
      // not a companion. A PR URL that cannot be read is one, and keeps its gap.
      if (!c.url && e instanceof GapError && e.reason === "deleted") continue;
      out.push({ ...r, gap: asGap(`pr:${c.ref}`, e) });
    }
  }
  return out;
}

/** A context-only PR (deployment manifest, tooling): metadata only, same entry shape as collectPr with the change-surface paths null. */
export function collectContextPr(p, base, runDir, sameKey = []) {
  const { owner, repo, number, meta: m } = p;
  checkRepo(owner, repo);
  checkNumber(number);
  const merged_at = m.merged_at ?? null;
  const meta_path = join(runDir, `pr-${owner}-${repo}-${number}-meta.json`);
  writeFileSync(meta_path, JSON.stringify({ repo: base.repo, number, title: m.title, state: m.state, merged: !!merged_at, merged_at, created_at: m.created_at ?? null,
    head_sha: m.head?.sha ?? null, base: m.base?.ref ?? null, body: m.body ?? "", later_prs: laterPrs(sameKey, { ref: p.ref, merged_at }) }, null, 1));
  return { ...base, state: m.state, merged: !!merged_at, merged_at, created_at: m.created_at ?? null, head_sha: m.head?.sha ?? null,
    meta_path, files_path: null, diff_path: null, reviews_path: null, checks_path: null, gaps: [] };
}

/** The files API's per-file `patch` fields as one unified diff, with `diff --git`-style headers, in the shape the
 *  CHANGE agent already reads. A file without `patch` (binary, or too large for GitHub) keeps its header and a
 *  note, and is returned in `noPatch`. */
export function assembleDiff(files) {
  const parts = [];
  const noPatch = [];
  for (const f of files) {
    const from = f.previous_filename ?? f.filename;
    const head = [`diff --git a/${from} b/${f.filename}`];
    if (f.status === "renamed") head.push(`rename from ${from}`, `rename to ${f.filename}`);
    if (typeof f.patch !== "string") { noPatch.push(f.filename); parts.push([...head, "(no patch from GitHub: binary or too large)"].join("\n")); continue; }
    head.push(f.status === "added" ? "--- /dev/null" : `--- a/${from}`, f.status === "removed" ? "+++ /dev/null" : `+++ b/${f.filename}`);
    parts.push([...head, f.patch].join("\n"));
  }
  return { text: parts.length ? `${parts.join("\n")}\n` : "", noPatch };
}

export async function collectPr(gh, p, runDir, { caps = CAPS, sameKey = [] } = {}) {
  const { owner, repo, number, meta } = p;
  checkRepo(owner, repo);
  checkNumber(number);
  const slug = `${owner}-${repo}-${number}`;
  const merged = !!meta.merged_at;
  const entry = { ref: p.ref, repo: `${owner}/${repo}`, number, rung: p.rung ?? null, ...(p.found_via ? { found_via: p.found_via } : {}), state: meta.state, merged, merged_at: meta.merged_at ?? null,
    created_at: meta.created_at ?? null, head_sha: meta.head?.sha ?? null, context_only: CONTEXT_ONLY_REPOS.includes(repo.toLowerCase()),
    meta_path: null, files_path: null, diff_path: null, reviews_path: null, checks_path: null, gaps: [] };
  const write = (name, data) => {
    const f = join(runDir, `pr-${slug}-${name}`);
    writeFileSync(f, typeof data === "string" ? data : JSON.stringify(data, null, 1));
    return f;
  };
  entry.meta_path = write("meta.json", { repo: entry.repo, number, title: meta.title, state: meta.state, merged, merged_at: entry.merged_at,
    created_at: entry.created_at, head_sha: entry.head_sha, base: meta.base?.ref ?? null, body: meta.body ?? "",
    later_prs: laterPrs(sameKey, { ref: p.ref, merged_at: entry.merged_at }) });
  let files = null; // the files API's entries, `patch` included: the fallback when the whole diff is refused
  try {
    // gh.files may return up to cap+1 entries; the extra one is the over-cap signal.
    const all = await gh.files(owner, repo, number, caps.prFiles);
    if (all.length > caps.prFiles) entry.gaps.push(gap(`pr:${p.ref}:files`, "over-cap", `${all.length}+ files; first ${caps.prFiles} read`));
    files = all.slice(0, caps.prFiles);
    entry.files_path = write("files.json", files.map((f) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions })));
  } catch (e) { entry.gaps.push(asGap(`pr:${p.ref}:files`, e)); }
  const writeDiff = (text) => {
    const cut = cutBytes(text, caps.diffBytes);
    if (cut.cut) entry.gaps.push(gap(`pr:${p.ref}:diff`, "over-cap", `diff truncated at ${caps.diffBytes} of ${cut.bytes} bytes`));
    entry.diff_path = write("diff.patch", cut.text);
  };
  try { writeDiff(String(await gh.diff(owner, repo, number))); } catch (e) {
    // 406 = GitHub will not render the whole diff (too many lines or files). The same hunks come per file from the
    // files API read above; the PR's diff is a gap only when that read failed too.
    if (e?.status === 406 && files) {
      const { text, noPatch } = assembleDiff(files);
      writeDiff(text);
      if (noPatch.length) entry.gaps.push(gap(`pr:${p.ref}:patches`, "unreadable", `whole diff refused (406), read per file; no patch from GitHub (binary or too large) for ${noPatch.length} file(s): ${noPatch.slice(0, 20).join(", ")}${noPatch.length > 20 ? ", …" : ""}`));
    } else entry.gaps.push(e?.status === 406 ? gap(`pr:${p.ref}:diff`, "unreadable", "GitHub refused the whole diff (406, too large) and the per-file read failed too") : asGap(`pr:${p.ref}:diff`, e));
  }
  let comments = null;
  try { comments = await gh.reviewComments(owner, repo, number); } catch (e) { entry.gaps.push(asGap(`pr:${p.ref}:reviews`, e)); }
  if (comments) {
    // A threads failure must not discard the comments already read: null says "not read", never 0.
    let unresolved = null;
    try { unresolved = await gh.unresolvedThreads(owner, repo, number); } catch (e) { entry.gaps.push(asGap(`pr:${p.ref}:threads`, e)); }
    // No author handles: who said it is not what the agent reports.
    entry.reviews_path = write("reviews.json", { unresolved_threads: unresolved,
      comments: comments.map((c) => ({ path: c.path, line: c.line ?? c.original_line ?? null, body: String(c.body ?? "").slice(0, 500), created_at: c.created_at })) });
  }
  if (entry.head_sha) {
    try { entry.checks_path = write("checks.json", summarizeChecks(await gh.checkRuns(owner, repo, entry.head_sha))); } catch (e) { entry.gaps.push(asGap(`pr:${p.ref}:checks`, e)); }
  } else entry.gaps.push(gap(`pr:${p.ref}:checks`, "not-found", "no head SHA"));
  return entry;
}
