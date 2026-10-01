#!/usr/bin/env -S npx tsx
/**
 * `npm run gaps` — the REQ-12 gap list (`docs/bug-detection-requirements.md` REQ-12, D13): the scenarios no
 * case exercises, per domain, ranked. Bugs live in gaps: an assertion cannot fail where nothing runs.
 *
 * Two kinds of gap, each with its reason:
 *   ESCAPE    a closed Jira bug that no suite row cites by key. Escape traceability = cited / closed.
 *             Production signals rank first: a `support`-labelled bug outranks the rest, newest first.
 *   BEHAVIOR  a mind-map behaviour / branch / state (`.claude/knowledge/domain/*.mind-map.json`) that no
 *             case stamps with `Behavior:` — read through `loadCases`, the same reader `models:check` uses.
 *
 * A bug is assigned to the BL domain whose heading words its summary shares most (headings are read from
 * the oracle (rendered from bl/*.yaml) via `listDomains`, never listed here); a bug that shares none is `unassigned`. The
 * assignment is a ranking aid, printed as such, not a classification anyone signs off.
 *
 * THE FIGURES ARE NOT COMMITTED. ai-tools is public, and bug counts are internal statistics: this command
 * prints to stdout (or `--json`) and writes no file. The numbers go to the tracking ticket.
 *
 * Bugs come from Jira REST (JIRA_BASE_URL + JIRA_EMAIL / JIRA_API_TOKEN, the same credentials
 * `scripts/tracker/comment.mjs` uses) with `--jql`, or from `--input <file.json>`: an array of
 * `{ key, summary, labels?, resolved? }` exported by any other means.
 *
 * Usage:
 *   npm run gaps                                   # Jira, last 365 days of Fixed/Done bugs in VCST + VP
 *   npm run gaps -- --input bugs.json [--domain cart] [--top 10] [--json]
 *   npm run gaps -- --jql 'project = VCST AND issuetype = Bug AND resolved >= -90d'
 *
 * Exit codes: 0 report printed · 3 no bug source (no --input and no Jira credentials) or Jira refused ·
 * 1 is `config.js` refusing a missing core env var on the Jira path, which also means "no report".
 */
import "../lib/sync-stdio.mjs";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { parseSuite } from "../test-cases/append-test-cases-to-suite.ts";
import { loadCases } from "../maintenance/check-test-models.ts";
import { listDomains } from "../knowledge/extract-bl.ts";
import { oracleText } from "../knowledge/bl-yaml.ts";
import { flagValue, intFlag, rejectUnknownFlags } from "../lib/cli-args.ts";

const SUITES_DIR = "regression/suites";
const MAPS_DIR = ".claude/knowledge/domain";
const DEFAULT_JQL = "project in (VCST, VP) AND issuetype = Bug AND resolution in (Fixed, Done) AND resolved >= -365d ORDER BY resolved DESC";
const KEY_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g;
/** Behaviour-like node types: what a case can exercise. Features and capabilities are containers. */
const EXERCISABLE = new Set(["behavior", "branch", "state"]);

export interface Bug { key: string; summary: string; labels?: string[]; resolved?: string }
export interface DomainTerms { token: string; name: string; terms: string[] }
export interface EscapeGap { kind: "ESCAPE"; key: string; summary: string; domain: string; support: boolean; resolved?: string; reason: string }
export interface BehaviorGap { kind: "BEHAVIOR"; id: string; name: string; map: string; reason: string }

/** Every issue key cited anywhere in any suite row. */
export function citedKeys(suiteTexts: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const text of suiteTexts) {
    for (const row of parseSuite(text).rows) for (const v of Object.values(row)) for (const k of String(v ?? "").match(KEY_RE) ?? []) out.add(k);
  }
  return out;
}

const STOP = new Set(["domain", "rules", "specific", "invariants", "cross", "and", "the", "member", "data", "display"]);
const stem = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);

/** The words of each BL domain heading ("Domain 2: Cart (BL-CART)" → cart), as 5-letter stems. */
export function domainTerms(oracle: string): DomainTerms[] {
  return listDomains(oracle)
    .filter((d) => d.token)
    .map((d) => {
      const name = d.domain.replace(/^Domain\s+\S+:\s*/, "").replace(/\(BL-[A-Z0-9]+\)/, "").trim();
      const words = name.split(/[^A-Za-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()));
      return { token: d.token, name, terms: [...new Set([...words.map(stem), stem(d.token)])].filter((t) => t.length >= 3) };
    });
}

/** The domain whose terms the summary shares most; ties go to the earlier domain; none → `unassigned`. */
export function assignDomain(summary: string, domains: readonly DomainTerms[]): string {
  const words = new Set(summary.split(/[^A-Za-z0-9]+/).filter((w) => w.length >= 3).map(stem));
  let best = { token: "unassigned", score: 0 };
  for (const d of domains) {
    const score = d.terms.filter((t) => words.has(t)).length;
    if (score > best.score) best = { token: d.token, score };
  }
  return best.token;
}

/** Closed bugs no suite cites, ranked: `support` first, then newest resolved. */
export function escapeGaps(bugs: readonly Bug[], cited: ReadonlySet<string>, domains: readonly DomainTerms[]): EscapeGap[] {
  return bugs
    .filter((b) => !cited.has(b.key))
    .map((b) => {
      const support = (b.labels ?? []).some((l) => l.toLowerCase() === "support");
      return {
        kind: "ESCAPE" as const,
        key: b.key,
        summary: b.summary,
        domain: assignDomain(b.summary, domains),
        support,
        resolved: b.resolved,
        reason: support ? "customer-reported bug, no suite row cites it" : "closed bug, no suite row cites it",
      };
    })
    .sort((a, b) => Number(b.support) - Number(a.support) || String(b.resolved ?? "").localeCompare(String(a.resolved ?? "")));
}

interface MapNode { id: string; type: string; name?: string; status?: string }

/** Mind-map behaviours, branches and states no case stamps (OBSOLETE nodes are not gaps). */
export function behaviorGaps(maps: ReadonlyArray<{ slug: string; nodes: readonly MapNode[] }>, stamped: ReadonlySet<string>): BehaviorGap[] {
  const out: BehaviorGap[] = [];
  for (const m of maps) {
    for (const n of m.nodes) {
      if (!EXERCISABLE.has(n.type) || n.status === "OBSOLETE" || stamped.has(n.id)) continue;
      out.push({ kind: "BEHAVIOR", id: n.id, name: n.name ?? n.id, map: m.slug, reason: `no case carries Behavior:${n.id}` });
    }
  }
  return out;
}

export interface DomainRow { domain: string; closed: number; cited: number; escapes: number; gapShare: number }

/** Per-domain counts. gapShare = escapes / closed bugs assigned to the domain. */
export function domainTable(bugs: readonly Bug[], cited: ReadonlySet<string>, domains: readonly DomainTerms[]): DomainRow[] {
  const rows = new Map<string, DomainRow>();
  for (const b of bugs) {
    const d = assignDomain(b.summary, domains);
    const r = rows.get(d) ?? { domain: d, closed: 0, cited: 0, escapes: 0, gapShare: 0 };
    r.closed++;
    if (cited.has(b.key)) r.cited++;
    else r.escapes++;
    rows.set(d, r);
  }
  return [...rows.values()].map((r) => ({ ...r, gapShare: r.closed ? r.escapes / r.closed : 0 })).sort((a, b) => b.escapes - a.escapes);
}

async function fetchJira(jql: string): Promise<Bug[]> {
  // Loaded only here: config.js refuses to start without the storefront/admin core variables, which a run
  // on an exported --input file does not need.
  await import(new URL("../../config.js", import.meta.url).href);
  const base = (process.env.JIRA_BASE_URL ?? "").replace(/\/+$/, "");
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!base || !email || !token) throw new Error("no --input and no Jira credentials (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN in .env.local)");
  const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
  const out: Bug[] = [];
  let next: string | undefined;
  do {
    const res = await fetch(`${base}/rest/api/3/search/jql`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jql, fields: ["summary", "labels", "resolutiondate"], maxResults: 100, ...(next ? { nextPageToken: next } : {}) }),
    });
    if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = (await res.json()) as { issues: Array<{ key: string; fields: { summary: string; labels?: string[]; resolutiondate?: string } }>; nextPageToken?: string };
    for (const i of page.issues) out.push({ key: i.key, summary: i.fields.summary, labels: i.fields.labels, resolved: i.fields.resolutiondate });
    next = page.nextPageToken;
  } while (next);
  return out;
}

function suiteTexts(dir = SUITES_DIR): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".csv")) out.push(readFileSync(p, "utf-8"));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

function readMaps(dir = MAPS_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mind-map.json"))
    .map((f) => ({ slug: f.replace(/\.mind-map\.json$/, ""), nodes: (JSON.parse(readFileSync(join(dir, f), "utf-8")).nodes ?? []) as MapNode[] }));
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

async function main(argv: string[]): Promise<number> {
  rejectUnknownFlags(argv, ["--input", "--jql", "--domain", "--top", "--json"], ["--input", "--jql", "--domain", "--top"]);
  const input = flagValue(argv, "--input");
  const onlyDomain = flagValue(argv, "--domain");
  const top = intFlag(argv, "--top", 10);
  let bugs: Bug[];
  try {
    bugs = input ? (JSON.parse(readFileSync(input, "utf-8")) as Bug[]) : await fetchJira(flagValue(argv, "--jql") ?? DEFAULT_JQL);
  } catch (e) {
    console.error(`gaps: ${(e as Error).message}`);
    return 3;
  }

  const domains = domainTerms(oracleText());
  const cited = citedKeys(suiteTexts());
  const escapes = escapeGaps(bugs, cited, domains).filter((g) => !onlyDomain || g.domain === onlyDomain);
  const table = domainTable(bugs, cited, domains).filter((r) => !onlyDomain || r.domain === onlyDomain);
  const stamped = new Set([...loadCases([]).values()].flatMap((c) => c.behaviors));
  const behaviors = behaviorGaps(readMaps(), stamped);
  const tracedCount = bugs.filter((b) => cited.has(b.key)).length;

  if (argv.includes("--json")) {
    console.log(JSON.stringify({ closed: bugs.length, cited: tracedCount, traceability: bugs.length ? tracedCount / bugs.length : null, domains: table, escapes, behaviors }, null, 2));
    return 0;
  }
  console.log(`Escape traceability: ${tracedCount} of ${bugs.length} closed bugs are cited by a suite row (${pct(bugs.length ? tracedCount / bugs.length : 0)}).`);
  console.log(`Domain assignment is by heading words and is a ranking aid; "unassigned" shares no word with any BL domain.\n`);
  console.log("domain               closed  cited  escapes  gap share");
  for (const r of table) console.log(`${r.domain.padEnd(20)} ${String(r.closed).padStart(6)} ${String(r.cited).padStart(6)} ${String(r.escapes).padStart(8)}  ${pct(r.gapShare).padStart(9)}`);
  const byDomain = new Map<string, EscapeGap[]>();
  for (const g of escapes) byDomain.set(g.domain, [...(byDomain.get(g.domain) ?? []), g]);
  for (const [d, gs] of byDomain) {
    console.log(`\n## ${d} — top ${Math.min(top, gs.length)} of ${gs.length} escapes`);
    for (const g of gs.slice(0, top)) console.log(`  ${g.support ? "[support] " : ""}${g.key}  ${g.summary.slice(0, 90)}`);
  }
  const perMap = new Map<string, number>();
  for (const b of behaviors) perMap.set(b.map, (perMap.get(b.map) ?? 0) + 1);
  console.log(`\nBehaviour gaps (mind-map nodes no case stamps): ${behaviors.length}`);
  for (const [m, n] of perMap) console.log(`  ${m}: ${n}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2)).then((c) => process.exit(c));
