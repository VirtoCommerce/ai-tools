// plugins/vc-test/skills/ticket-context/lib/connectors/github.mjs — the GitHub code-host connector (spec §7). Every
// method is one `node "$VC_RUN" gh api …` GET (the bridge refuses any other method) and returns what the old in-process
// client returned, so the ladder, the companions and collectPr read the same shapes. This process holds no token.
import { bridgeRun } from "../bridge.mjs";
import { GapError } from "../gap.mjs";
import { REVIEW_THREADS_QUERY, checkNumber, checkRepo, checkSha } from "../github.mjs";

/** What the PR and commit searches look for: the ticket key; on an Azure Boards tracker the cross-link token GitHub's
 *  Azure Boards integration reads (`AB#967`), or null when the profile names none (the search rungs are skipped). */
export function searchKeyFor(profile, key) {
  if (profile.tracker !== "azure") return key;
  return profile.crossLinkToken ? `${profile.crossLinkToken}${key}` : null;
}

/** Where the search rungs look. A Jira key may be in any configured org. An Azure Boards token means something only
 *  in the client's own GitHub org — the upstream's PRs never carry it — so on Azure Repos, or a platform project,
 *  nothing is searched (plan Task 7: the GitHub ladder does not run there). */
export function searchOrgsFor(profile) {
  return profile.tracker === "azure" ? profile.orgs.filter((o) => o !== profile.upstream) : profile.orgs;
}

export function githubConnector({ run = bridgeRun } = {}) {
  const api = (path, opts) => run("gh", ["api", path], opts);
  const q = (s) => encodeURIComponent(s);
  return {
    searchPrs: async (key, orgs) => (await api(`search/issues?q=${q(`"${key}" is:pr ${orgs.map((o) => `org:${o}`).join(" ")}`)}&per_page=50`)).items ?? [],
    searchCommits: async (key, orgs) => (await api(`search/commits?q=${q(`"${key}" ${orgs.map((o) => `org:${o}`).join(" ")}`)}&per_page=30`)).items ?? [],
    prsForCommit: async (o, r, sha) => { checkRepo(o, r); checkSha(sha); return api(`repos/${o}/${r}/commits/${sha}/pulls`); },
    pr: async (o, r, n) => { checkRepo(o, r); checkNumber(n); return api(`repos/${o}/${r}/pulls/${n}`); },
    // Returns up to cap+1 entries: the extra one is how the caller sees that the PR has more files than the cap.
    files: async (o, r, n, cap) => {
      checkRepo(o, r); checkNumber(n);
      const out = [];
      for (let page = 1; out.length <= cap; page++) {
        const batch = await api(`repos/${o}/${r}/pulls/${n}/files?per_page=100&page=${page}`);
        out.push(...batch);
        if (batch.length < 100) break;
      }
      return out.slice(0, cap + 1);
    },
    diff: async (o, r, n) => { checkRepo(o, r); checkNumber(n); return run("gh", ["api", "-H", "Accept: application/vnd.github.diff", `repos/${o}/${r}/pulls/${n}`], { as: "text" }); },
    /** `from...to` (prepare --since): the compare's status — ahead · identical · behind · diverged — then, when the
     *  first sha is an ancestor (ahead or identical), the range's unified diff; otherwise `diff` is "" and not read. */
    compareDiff: async (o, r, from, to) => {
      checkRepo(o, r); checkSha(from); checkSha(to);
      const path = `repos/${o}/${r}/compare/${from}...${to}`;
      const { status } = await api(path);
      if (status !== "ahead" && status !== "identical") return { status: String(status ?? "unknown"), diff: "" };
      return { status, diff: await run("gh", ["api", "-H", "Accept: application/vnd.github.diff", path], { as: "text" }) };
    },
    reviewComments: async (o, r, n) => { checkRepo(o, r); checkNumber(n); return api(`repos/${o}/${r}/pulls/${n}/comments?per_page=100`); },
    unresolvedThreads: async (o, r, n) => {
      checkRepo(o, r); checkNumber(n);
      const j = await run("gh", ["api", "graphql", "-f", `query=${REVIEW_THREADS_QUERY}`, "-f", `o=${o}`, "-f", `r=${r}`, "-F", `n=${n}`]);
      // A 200 can still carry {errors, data:null}: that is "not read", never "0 unresolved".
      const nodes = j?.data?.repository?.pullRequest?.reviewThreads?.nodes;
      if (j?.errors || !Array.isArray(nodes)) throw new GapError("unreadable", "GitHub GraphQL returned errors or no pull request for the review threads");
      return nodes.filter((t) => !t.isResolved).length;
    },
    checkRuns: async (o, r, sha) => { checkRepo(o, r); checkSha(sha); return api(`repos/${o}/${r}/commits/${sha}/check-runs?per_page=100`); },
  };
}
