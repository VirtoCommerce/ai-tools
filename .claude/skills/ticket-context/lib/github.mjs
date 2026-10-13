// .claude/skills/ticket-context/lib/github.mjs — block 3 "find" (design §5): the measured ladder of
// qa-test/technical-change.md §2.1, rungs 1–3, as a script (A4), plus the per-PR files the CHANGE agent reads.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CAPS } from "./fetch.mjs";
import { GapError, asGap, gap } from "./gap.mjs";

/** Stage-1 rule: deployment-manifest PRs and this repo's PRs are context, not change surface. */
export const CONTEXT_ONLY_REPOS = Object.freeze(["vc-deploy-dev", "ai-tools"]);

export function ghClient(cred, fetchImpl = fetch) {
  async function req(path, { accept = "application/vnd.github+json", method = "GET", body } = {}) {
    const res = await fetchImpl(`https://api.github.com${path}`, { method, body, headers: {
      Authorization: cred.auth, Accept: accept, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ticket-context",
      ...(body ? { "Content-Type": "application/json" } : {}) } });
    const where = path.split("?")[0];
    if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") throw new GapError("unreadable", `GitHub rate limit reached on ${where} — wait for the reset`);
    if (res.status === 401 || res.status === 403) throw new GapError("access-denied", `GitHub ${res.status} on ${where} (credential: ${cred.via}; never retried with another)`);
    if (res.status === 404) throw new GapError("deleted", `GitHub 404 on ${where}`);
    if (!res.ok) throw new GapError("unreadable", `GitHub ${res.status} on ${where}`);
    return res;
  }
  const json = async (p, o) => (await req(p, o)).json();
  const q = (s) => encodeURIComponent(s);
  return {
    searchPrs: async (key, orgs) => (await json(`/search/issues?q=${q(`"${key}" is:pr ${orgs.map((o) => `org:${o}`).join(" ")}`)}&per_page=50`)).items ?? [],
    searchCommits: async (key, orgs) => (await json(`/search/commits?q=${q(`"${key}" ${orgs.map((o) => `org:${o}`).join(" ")}`)}&per_page=30`)).items ?? [],
    prsForCommit: (o, r, sha) => json(`/repos/${o}/${r}/commits/${sha}/pulls`),
    pr: (o, r, n) => json(`/repos/${o}/${r}/pulls/${n}`),
    files: async (o, r, n, cap) => {
      const out = [];
      for (let page = 1; out.length < cap; page++) {
        const batch = await json(`/repos/${o}/${r}/pulls/${n}/files?per_page=100&page=${page}`);
        out.push(...batch);
        if (batch.length < 100) break;
      }
      return out.slice(0, cap);
    },
    diff: async (o, r, n) => (await req(`/repos/${o}/${r}/pulls/${n}`, { accept: "application/vnd.github.diff" })).text(),
    reviewComments: (o, r, n) => json(`/repos/${o}/${r}/pulls/${n}/comments?per_page=100`),
    unresolvedThreads: async (o, r, n) => {
      const query = "query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved}}}}}";
      const j = await json("/graphql", { method: "POST", body: JSON.stringify({ query, variables: { o, r, n } }) });
      return (j.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []).filter((t) => !t.isResolved).length;
    },
    checkRuns: (o, r, sha) => json(`/repos/${o}/${r}/commits/${sha}/check-runs?per_page=100`),
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
  if (explicitRefs.length) {
    ladder.push({ rung: 1, found: explicitRefs.length });
    return { rung: 1, refs: explicitRefs.map((r) => ({ ref: r.ref, owner: r.owner, repo: r.repo, number: r.number, rung: 1 })), sameKey, ladder };
  }
  ladder.push({ rung: 1, found: 0 });
  if (sameKey.length) {
    ladder.push({ rung: 2, found: sameKey.length });
    return { rung: 2, refs: sameKey.map((r) => ({ ref: r.ref, owner: r.owner, repo: r.repo, number: r.number, rung: 2 })), sameKey, ladder };
  }
  ladder.push({ rung: 2, found: 0 });
  const refs = new Map();
  if (orgs.length) {
    try {
      for (const c of (await gh.searchCommits(key, orgs)).slice(0, 10)) {
        const [owner, repo] = c.repository.full_name.split("/");
        for (const pr of await gh.prsForCommit(owner, repo, c.sha)) {
          const ref = `${owner}/${repo}#${pr.number}`;
          refs.set(ref, { ref, owner, repo, number: pr.number, rung: 3 });
        }
      }
    } catch (e) { gaps.push(asGap("change.commits", e)); }
  }
  ladder.push({ rung: 3, found: refs.size });
  return { rung: refs.size ? 3 : null, refs: [...refs.values()], sameKey, ladder };
}

export async function collectPr(gh, p, runDir, { caps = CAPS, sameKey = [] } = {}) {
  const { owner, repo, number, meta } = p;
  const slug = `${owner}-${repo}-${number}`;
  const merged = !!meta.merged_at;
  const entry = { ref: p.ref, repo: `${owner}/${repo}`, number, rung: p.rung ?? null, state: meta.state, merged, merged_at: meta.merged_at ?? null,
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
  try {
    entry.files_path = write("files.json", (await gh.files(owner, repo, number, caps.prFiles))
      .map((f) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions })));
  } catch (e) { entry.gaps.push(asGap(`pr:${p.ref}:files`, e)); }
  try {
    const diff = await gh.diff(owner, repo, number);
    if (diff.length > caps.diffBytes) entry.gaps.push(gap(`pr:${p.ref}:diff`, "over-cap", `diff truncated at ${caps.diffBytes} of ${diff.length} bytes`));
    entry.diff_path = write("diff.patch", diff.slice(0, caps.diffBytes));
  } catch (e) { entry.gaps.push(asGap(`pr:${p.ref}:diff`, e)); }
  try {
    const comments = await gh.reviewComments(owner, repo, number);
    const unresolved = await gh.unresolvedThreads(owner, repo, number);
    // No author handles: who said it is not what the agent reports.
    entry.reviews_path = write("reviews.json", { unresolved_threads: unresolved,
      comments: comments.map((c) => ({ path: c.path, line: c.line ?? c.original_line ?? null, body: String(c.body ?? "").slice(0, 500), created_at: c.created_at })) });
  } catch (e) { entry.gaps.push(asGap(`pr:${p.ref}:reviews`, e)); }
  if (entry.head_sha) {
    try { entry.checks_path = write("checks.json", summarizeChecks(await gh.checkRuns(owner, repo, entry.head_sha))); } catch (e) { entry.gaps.push(asGap(`pr:${p.ref}:checks`, e)); }
  }
  return entry;
}
