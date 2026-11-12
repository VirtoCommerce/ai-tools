// scripts/preflight/delivery.ts — is everything the regression is about to test actually ON the stand?
//
// Sprint 26-22 (2026-11-11): the stand ran theme alpha.2642 while VirtoCommerce.SalesRep 3.1023.0 was already
// deployed. The module half of VCST-6078 (vc-module-sales-rep#24) needed the theme half (vc-frontend#2552), which
// was not in that alpha: the Sales Rep hub never started and a whole wave run (68 Critical cases) was spent on it.
// Five PRs of Done sprint tickets were missing from the alpha too, written down only as a note in the plan.
// Neither was a version-compatibility problem — `@vc-frontend/core` was 0.2.11 in both alphas — so the check that
// catches it works per TICKET: every merged PR of a ticket, in every repo the stand runs, must be in the build the
// stand runs. A ticket with some parts on the stand and some not (PARTIAL) is the dangerous one.
//
// Tickets come from two sides: the sprint's Done tickets (the plan's scope), and every ticket a component the stand
// changed during the sprint carries (its commits between the build at sprint start and the build now). Read-only:
// GitHub, the blob store and vc-deploy-dev are only read.
import type { Http } from "../deploy/lib/github.ts";
import { listPinnedModules } from "../deploy/lib/manifest.ts";
import { matchRun, themePinKind, type PublishRun } from "../deploy/upgrade/theme.ts";
import type { Check } from "./policy.ts";

export const FRONTEND_REPO = "VirtoCommerce/vc-frontend";
const THEME_PKG = "vc-theme-b2b-vue";
const KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

/** A build reference in one repo: a git ref (tag or sha) that the PR's merge commit must be an ancestor of. */
export interface BuildRef { repo: string; ref: string | null; label: string; note?: string }
export type PrState = "IN" | "OUT" | "NOT_MERGED" | "NOT_ON_STAND" | "UNKNOWN";
export interface PrDelivery { repo: string; number: number; url: string; state: PrState; note: string }
export type Verdict = "DELIVERED" | "PARTIAL" | "INCOMPLETE" | "MASS" | "NOT_DELIVERED" | "NO_CODE" | "UNKNOWN";
export interface TicketDelivery { key: string; sources: string[]; prs: PrDelivery[]; verdict: Verdict }

/** A ticket whose PRs span more deployed repos than this is a cross-cutting change (a dependency bump, a rename
 *  across modules): each module picks it up at its own release, so a mix of IN and OUT is the normal state of it. */
export const MASS_REPOS = 4;

/**
 * Per ticket, over its merged PRs in repos this stand runs:
 * - DELIVERED — every one is in the build.
 * - PARTIAL — a repo holds its part and ANOTHER repo's part is missing: the deployed half calls code that is not
 *   there (VCST-6078: the module was deployed, its theme half was not — a whole hub failed). Blocks.
 * - INCOMPLETE — only later PRs of a repo whose earlier PRs are in are missing (the feature continues in a later build).
 * - MASS — more than MASS_REPOS repos: reported, never blocking.
 * - NOT_DELIVERED — none is in. NO_CODE — no merged PR in a repo this stand runs.
 * - UNKNOWN — a PR could not be decided and nothing above already holds.
 */
export function ticketVerdict(prs: PrDelivery[]): Verdict {
  const relevant = prs.filter((p) => p.state === "IN" || p.state === "OUT" || p.state === "UNKNOWN");
  if (!relevant.length) return "NO_CODE";
  const byRepo = new Map<string, Set<PrState>>();
  for (const p of relevant) byRepo.set(p.repo.toLowerCase(), (byRepo.get(p.repo.toLowerCase()) ?? new Set()).add(p.state));
  const ins = relevant.some((p) => p.state === "IN"), outs = relevant.some((p) => p.state === "OUT");
  if (ins && outs) {
    if (byRepo.size > MASS_REPOS) return "MASS";
    // PARTIAL only when a repo has NONE of its part on the stand while another repo has its part. A repo whose
    // earlier PR is in and a later one is not is a feature continuing in a later build (INCOMPLETE).
    const missingRepo = [...byRepo.values()].some((s) => s.has("OUT") && !s.has("IN"));
    return missingRepo ? "PARTIAL" : "INCOMPLETE";
  }
  if (relevant.some((p) => p.state === "UNKNOWN")) return "UNKNOWN";
  return outs ? "NOT_DELIVERED" : "DELIVERED";
}

/** Module version → the ref its build came from: a release tag, or the short sha a PR/alpha build carries. */
export function moduleRef(version: string): string {
  const sha = /-([0-9a-f]{4,40})$/i.exec(version)?.[1];
  return sha && /-(pr|alpha)/i.test(version) ? sha : version;
}

export function ticketKeys(text: string, project: string | null = null): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(KEY_RE)) if (!project || m[1].startsWith(`${project}-`)) out.add(m[1]);
  return [...out];
}

/** The commit a deployed theme zip was built from. Alpha blobs carry no sha: the blob's Last-Modified falls inside
 *  one CI run's "Publish to Blob" step (scripts/deploy/upgrade/theme.ts), so that run's head sha is the build. */
export async function themeBuildRef(http: Http, themeFile: string, blobBase = "https://vc3prerelease.blob.core.windows.net/packages", workflow = "theme-ci.yml"): Promise<BuildRef> {
  const file = /\.zip$/i.test(themeFile) ? themeFile : `${themeFile}.zip`; // env-facts `declared.theme` drops the extension
  const k = themePinKind(file.includes("/") ? file : `${blobBase}/${file}`, THEME_PKG);
  const label = file.split("/").pop() ?? file;
  if (k.kind === "release") return { repo: FRONTEND_REPO, ref: k.version!, label };
  if (k.kind === "pr") {
    const p = await http.gh(`/repos/${FRONTEND_REPO}/pulls/${k.pr}`);
    return { repo: FRONTEND_REPO, ref: p?.head?.sha ?? null, label, note: `PR build of #${k.pr}` };
  }
  if (k.kind !== "alpha") return { repo: FRONTEND_REPO, ref: null, label, note: `theme pin of kind ${k.kind}: build commit not derivable` };
  const blobUrl = `${blobBase}/${label}`;
  const lm = (await http.head(blobUrl)).lastModified;
  if (!lm) return { repo: FRONTEND_REPO, ref: null, label, note: "theme blob has no Last-Modified" };
  const t = Date.parse(lm);
  const until = new Date(t + 60_000).toISOString();
  const commits = await http.ghAll(`/repos/${FRONTEND_REPO}/commits?sha=dev&until=${until}`, 1);
  const runs: PublishRun[] = [];
  for (const c of commits.slice(0, 25)) {
    for (const r of (await http.gh(`/repos/${FRONTEND_REPO}/actions/runs?head_sha=${c.sha}&per_page=20`))?.workflow_runs ?? []) {
      if (!String(r.path ?? "").endsWith(workflow)) continue;
      for (const j of (await http.gh(`/repos/${FRONTEND_REPO}/actions/runs/${r.id}/jobs?per_page=100`))?.jobs ?? [])
        for (const s of j.steps ?? [])
          if (/publish.*blob/i.test(String(s.name)) && s.started_at && s.completed_at)
            runs.push({ runId: r.id, headSha: r.head_sha, conclusion: r.conclusion, runStart: Date.parse(r.run_started_at ?? r.created_at), start: Date.parse(s.started_at), end: Date.parse(s.completed_at) });
    }
    const hit = matchRun({ name: label, n: k.n!, lastModified: lm }, runs);
    if (hit.length) {
      const shas = [...new Set(hit.map((h) => h.headSha))];
      // Overlapping publish windows of two commits: take the OLDER one, so "PR is in the build" can only under-claim.
      return { repo: FRONTEND_REPO, ref: shas[shas.length - 1], label, note: shas.length > 1 ? `ambiguous: runs of ${shas.join(", ")} overlap` : undefined };
    }
  }
  return { repo: FRONTEND_REPO, ref: null, label, note: "no theme-ci publish step matches the blob time" };
}

/** IN when `sha` is an ancestor of (or equal to) `ref` in `repo`. */
export async function contains(http: Http, repo: string, sha: string, ref: string): Promise<PrState> {
  const c = await http.gh(`/repos/${repo}/compare/${sha}...${encodeURIComponent(ref)}`);
  if (!c?.status) return "UNKNOWN";
  return c.status === "ahead" || c.status === "identical" ? "IN" : "OUT";
}

/** Every PR in the org whose title or branch names the key. The search index is case-insensitive and fuzzy, so the
 *  key is re-checked as a whole word. */
export async function prsOfTicket(http: Http, key: string, org = "VirtoCommerce"): Promise<{ repo: string; number: number; url: string; merged: boolean }[]> {
  const res = await http.gh(`/search/issues?q=${encodeURIComponent(`${key} org:${org} is:pr`)}&per_page=50`);
  const re = new RegExp(`\\b${key}\\b`);
  return (res?.items ?? [])
    .filter((i: any) => re.test(String(i.title)) || re.test(String(i.body ?? "").slice(0, 400)))
    .map((i: any) => ({ repo: String(i.repository_url).split("/repos/")[1], number: i.number, url: i.html_url, merged: !!i.pull_request?.merged_at }));
}

/** Ticket keys a component carries between two refs (commit messages). */
export async function keysBetween(http: Http, repo: string, from: string, to: string, project: string | null): Promise<string[] | null> {
  const c = await http.gh(`/repos/${repo}/compare/${encodeURIComponent(from)}...${encodeURIComponent(to)}`);
  if (!c?.commits) return null;
  return ticketKeys(c.commits.map((x: any) => x.commit?.message ?? "").join("\n"), project);
}

export interface StandBuild { theme: BuildRef; modules: Map<string, BuildRef & { id: string; version: string }> }

/** What the stand runs now: the theme build commit and, per module repo, the version's ref. */
export async function standBuild(http: Http, themeFile: string | null, deployed: Record<string, { version: string; repo: string | null }>): Promise<StandBuild> {
  const theme = themeFile ? await themeBuildRef(http, themeFile) : { repo: FRONTEND_REPO, ref: null, label: "unknown", note: "theme not declared" };
  const modules = new Map<string, BuildRef & { id: string; version: string }>();
  for (const [id, m] of Object.entries(deployed)) {
    if (!m.repo) continue;
    const repo = m.repo.includes("/") ? m.repo : `VirtoCommerce/${m.repo}`;
    modules.set(repo.toLowerCase(), { repo, id, version: m.version, ref: moduleRef(m.version), label: `${id} ${m.version}` });
  }
  return { theme, modules };
}

export async function deliveryOfTicket(http: Http, key: string, sources: string[], build: StandBuild): Promise<TicketDelivery> {
  const prs: PrDelivery[] = [];
  for (const p of await prsOfTicket(http, key)) {
    const target = p.repo.toLowerCase() === FRONTEND_REPO.toLowerCase() ? build.theme : build.modules.get(p.repo.toLowerCase());
    if (!target) { prs.push({ ...p, state: "NOT_ON_STAND", note: "repo not deployed on this stand" }); continue; }
    if (!p.merged) { prs.push({ ...p, state: "NOT_MERGED", note: "not merged" }); continue; }
    const pr = await http.gh(`/repos/${p.repo}/pulls/${p.number}`);
    if (!pr?.merge_commit_sha || !target.ref) { prs.push({ ...p, state: "UNKNOWN", note: target.ref ? "no merge commit" : `build of ${target.label} unknown${target.note ? ` (${target.note})` : ""}` }); continue; }
    // A PR build of this very PR is the PR itself.
    if (/-pr-(\d+)-/.test(target.label) && Number(/-pr-(\d+)-/.exec(target.label)![1]) === p.number) { prs.push({ ...p, state: "IN", note: `PR build ${target.label}` }); continue; }
    const state = await contains(http, p.repo, pr.merge_commit_sha, target.ref);
    prs.push({ ...p, state, note: `${state === "IN" ? "in" : "not in"} ${target.label}` });
  }
  return { key, sources, prs, verdict: ticketVerdict(prs) };
}

/** The tickets the stand's components picked up since sprint start: module + platform + theme commits between the
 *  vc-deploy-dev manifest at `since` and the stand now. */
export async function standChangeTickets(http: Http, o: { deployRepo: string; branch: string; packagesPath: string; themePath: string; since: string; build: StandBuild; project: string | null }): Promise<{ keys: Map<string, string[]>; notes: string[] }> {
  const keys = new Map<string, string[]>(), notes: string[] = [];
  const add = (k: string, src: string) => keys.set(k, [...(keys.get(k) ?? []), src]);
  const at = (await http.gh(`/repos/${o.deployRepo}/commits?sha=${encodeURIComponent(o.branch)}&until=${encodeURIComponent(o.since)}&per_page=1`))?.[0]?.sha;
  if (!at) { notes.push(`no ${o.deployRepo}@${o.branch} commit before ${o.since}`); return { keys, notes }; }
  const read = async (p: string) => { const f = await http.gh(`/repos/${o.deployRepo}/contents/${p}?ref=${at}`); return f?.content ? Buffer.from(f.content, "base64").toString("utf8") : null; };
  const pk = await read(o.packagesPath);
  const before = new Map((pk ? listPinnedModules(JSON.parse(pk)) : []).map((m) => [m.id.toLowerCase(), m.version]));
  for (const m of o.build.modules.values()) {
    const from = before.get(m.id.toLowerCase());
    if (!from || from === m.version) continue;
    const ks = await keysBetween(http, m.repo, moduleRef(from), m.ref!, o.project);
    if (ks === null) { notes.push(`${m.repo}: cannot compare ${from}…${m.version}`); continue; }
    for (const k of ks) add(k, `${m.id} ${from}→${m.version}`);
  }
  const th = await read(o.themePath);
  const fromFile = th ? (JSON.parse(th).URL ?? JSON.parse(th).url ?? null) : null;
  if (fromFile && o.build.theme.ref && !fromFile.endsWith(o.build.theme.label)) {
    const fromRef = await themeBuildRef(http, fromFile);
    const ks = fromRef.ref ? await keysBetween(http, FRONTEND_REPO, fromRef.ref, o.build.theme.ref, o.project) : null;
    if (ks === null) notes.push(`theme: cannot compare ${fromRef.label}…${o.build.theme.label}${fromRef.note ? ` (${fromRef.note})` : ""}`);
    else for (const k of ks) add(k, `theme ${fromRef.label.replace(`${THEME_PKG}-`, "")}→${o.build.theme.label.replace(`${THEME_PKG}-`, "")}`);
  }
  return { keys, notes };
}

/**
 * Pre-flight rows. PARTIAL always BLOCKs (code on the stand calls code that is not there — whole areas fail for a
 * reason no test case is about). A sprint ticket NOT_DELIVERED BLOCKs until accepted (`delivery:<KEY>`): its cases
 * then report NOT_DEPLOYED, never FAIL. UNKNOWN is shown, never counted as delivered.
 */
export function deliveryChecks(rows: TicketDelivery[], accepted: string[] = [], notes: string[] = []): Check[] {
  const acc = new Set(accepted), checks: Check[] = [];
  const prList = (t: TicketDelivery, s: PrState[]) => t.prs.filter((p) => s.includes(p.state)).map((p) => `${p.repo.replace("VirtoCommerce/", "")}#${p.number}`).join(", ");
  for (const t of rows) {
    const yes = acc.has(`delivery:${t.key}`);
    if (t.verdict === "PARTIAL")
      checks.push({ id: `delivery:${t.key}`, status: yes ? "WARN" : "BLOCK", who: "you", diagnose: [],
        found: `${t.key} is PARTLY on the stand: ${prList(t, ["IN"])} deployed, ${prList(t, ["OUT"])} NOT — the deployed half expects the missing one${yes ? " (accepted)" : ""}`,
        do: "STOP the waves and tell the release owner + delivery manager: deploy the missing build, or roll the deployed half back" });
    else if (t.verdict === "NOT_DELIVERED" && t.sources.includes("sprint"))
      checks.push({ id: `delivery:${t.key}`, status: yes ? "WARN" : "BLOCK", who: "you", diagnose: [],
        found: `${t.key} (sprint Done) is NOT on the stand: ${prList(t, ["OUT"])}${yes ? " (accepted — its cases report NOT_DEPLOYED)" : ""}`,
        do: `deploy a build that contains it, or accept with --accept delivery:${t.key} (its cases then report NOT_DEPLOYED, never FAIL)` });
    else if (t.verdict === "INCOMPLETE" && t.sources.includes("sprint"))
      checks.push({ id: `delivery:${t.key}`, status: "WARN", who: "you", diagnose: [],
        found: `${t.key} (sprint Done) is only partly in its repo's build: ${prList(t, ["OUT"])} not yet deployed`,
        do: "name it to the W0 owner; the cases of the missing PRs report NOT_DEPLOYED, never FAIL" });
    else if (t.verdict === "UNKNOWN")
      checks.push({ id: `delivery:${t.key}`, status: "UNKNOWN", who: "me", diagnose: [], found: `${t.key}: ${t.prs.filter((p) => p.state === "UNKNOWN").map((p) => `${p.repo.replace("VirtoCommerce/", "")}#${p.number} ${p.note}`).join("; ")}`, do: "confirm by hand before the first wave" });
  }
  for (const n of notes) checks.push({ id: "delivery", status: "UNKNOWN", who: "me", diagnose: [], found: n, do: "confirm by hand" });
  if (!rows.some((t) => t.sources.includes("sprint")))
    checks.push({ id: "delivery:sprint", status: "UNKNOWN", who: "me", diagnose: [], found: "no sprint Done ticket was read — only the stand's own changes were checked", do: "check the sprint name the tracker search used" });
  const counted = rows.filter((t) => t.verdict !== "NO_CODE");
  const okN = counted.filter((t) => t.verdict === "DELIVERED").length;
  if (counted.length && !checks.some((c) => c.status === "BLOCK"))
    checks.push({ id: "delivery", status: "OK", who: null, do: null, diagnose: [], found: `${okN} of ${counted.length} ticket(s) with code are fully on the stand` });
  return checks;
}

/** The build a delivery result was computed for: the theme pin and every module version. A changed stand means
 *  the stored result no longer describes it. */
export function buildFingerprint(theme: string | null, modules: Record<string, { version: string }>): string {
  return [String(theme ?? "").replace(/.zip$/i, ""), ...Object.entries(modules).map(([id, m]) => `${id.toLowerCase()}@${m.version}`).sort()].join("|");
}

export const DELIVERY_FILE = "delivery.json";

/** Rows for a wave's pre-flight from the release's stored delivery result (`release:delivery --write`). */
export function storedDeliveryChecks(stored: { fingerprint?: string; tickets?: TicketDelivery[]; notes?: string[]; observedAt?: string } | null, fingerprint: string | null, release: string, accepted: string[]): Check[] {
  const run = `npm run release:delivery -- ${release} --write`;
  if (!stored?.tickets) return [{ id: "delivery", status: "BLOCK", who: "me", diagnose: [], found: `delivery not checked for ${release}: no ${DELIVERY_FILE} in the release folder`, do: `${run} (a few minutes), then re-run the pre-flight` }];
  if (fingerprint && stored.fingerprint !== fingerprint)
    return [{ id: "delivery", status: "BLOCK", who: "me", diagnose: [], found: `the stand changed since delivery was checked (${stored.observedAt ?? "unknown time"})`, do: `${run}, then re-run the pre-flight` }];
  return deliveryChecks(stored.tickets, accepted, stored.notes ?? []);
}
