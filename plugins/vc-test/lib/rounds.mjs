// plugins/vc-test/lib/rounds.mjs — a ticket's round number and the cap of three, decided by script BEFORE any context is
// gathered (spec §3 Rounds, D6; method: skills/qa-test-strategy/rounds.md). A round is one QA verdict on one build, and it
// is seen by up to four sources that must not be counted twice: a `## Round N` section of test-strategy.md, a round
// record (`rounds/round-<N>.json`), a `summary.json` (every git version of it, and the ones /qa-test-fast wrote), and a
// verdict comment in the ticket-context bundle's signals[].
// CLI: node plugins/vc-test/lib/rounds.mjs count --key <KEY> [--run-dir <RUN_DIR>] [--bundle <bundle.json>]
//   reads test-strategy.md, rounds/round-*.json and summary.json (+ its git versions) of every run folder of the ticket
//   (`priorRunDirs`: every env, wherever QA_OUTPUT_DIR puts them) and of --run-dir; prints
//   { round, mode, closed, open, superseded, escalation, strategy, record }, mode one of first | refresh | resume | cap.
//   exit 0: a round to run; 2: mode cap (a fourth round is refused, `escalation` says to whom the ticket goes back);
//   1: usage or an unreadable input.
// CLI: node plugins/vc-test/lib/rounds.mjs close --key <KEY> --run-dir <RUN_DIR> --bundle <bundle.json> [--filed B-1=VCST-7001,…]
//   closes the round the last `## Round N` section of <RUN_DIR>/test-strategy.md opened: reads <RUN_DIR>/verdict.json
//   (validated against verdict.schema.json), writes <RUN_DIR>/rounds/round-<N>.json and copies --bundle beside it as
//   round-<N>.bundle.json (the bundle is swept after 24 h and round N+1 needs it; skipped when --bundle is that file).
//   Every path the record stores is POSIX-relative to outputRoot(). exit 0; 1: usage, a missing or invalid verdict.json,
//   no `## Round`, or a --filed id that is no bug of the verdict.
// CLI: node plugins/vc-test/lib/rounds.mjs delta --key <KEY> --run-dir <RUN_DIR> --prepare <delta prepare.json>
//   round N's refresh over `ticket-context prepare --since`'s output: which PRs changed, which analysts to dispatch
//   (TICKET on new comments or a changed AC, CHANGE per changed or new PR), the prior bugs of every round (in scope only,
//   one PB per bug), the out-of-scope bugs with their status, the carried risks, and the round recounted with the kept
//   comments as signals. Writes <WORK>/delta.json (WORK = paths.mjs workDir) and prints it. exit 0; 2: the same build
//   (P3: no PR changed or new — round N−1 already tested it) or mode cap (`escalation` as `count`); 1: usage or an
//   unreadable input.
// CLI: node plugins/vc-test/lib/rounds.mjs append --run-dir <RUN_DIR> --delta <WORK>/delta.json [--change-map <path>]
//   appends `## Round <N>` to <RUN_DIR>/test-strategy.md without asking (U15): the carried risks, one risk and one
//   `### Prior bugs` row per prior bug, the Artifacts of round N−1, and one `TBD — strategy agent` line for each part the
//   strategy agent writes. A RUN_DIR with no test-strategy.md first takes the newest prior one, whose folder keeps the
//   line `Moved to <path> at Round <N>.` (rounds.md §Storage). Round N−1's text is never touched; a last section already
//   numbered N is left as it is. A --change-map that does not exist (another env's WORK) is `Change map: none`.
//   exit 0; 1: usage, an unreadable input, a delta that STOPs, or a file whose last round is not N−1.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { argOf, currentEnv, KEY_RE, outputRoot, workDir } from "./paths.mjs";
import { validate } from "../skills/ticket-context/lib/schema.mjs";
import { rows as tableRows } from "./strategy-artifacts.mjs";
import { priorRunDirs } from "../scripts/lib/run-dir.mjs";

const CAP = 3;
const ESCALATE_TO = "the developer, the PO and the QA lead";
const lf = (s) => String(s).replace(/\r\n?/g, "\n");
const day = (s) => (/^\d{4}-\d{2}-\d{2}/.exec(String(s ?? ""))?.[0]) ?? null;

// A build's 7-hex prefix: 7-40 hex characters with at least one digit and one a-f letter (so a word such as `defaced`
// or a bare number is not one), bounded by non-alphanumerics.
export function hexKeys(text) {
  const out = new Set();
  for (const m of String(text ?? "").matchAll(/(?<![0-9a-z])[0-9a-f]{7,40}(?![0-9a-z])/gi)) {
    if (/\d/.test(m[0]) && /[a-f]/i.test(m[0])) out.add(m[0].slice(0, 7).toLowerCase());
  }
  return out;
}
const overlap = (a, b) => { let n = 0; for (const k of a) if (b.has(k)) n++; return n; };
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
// A verdict word ends at a non-word, non-hyphen character: "Passing", "Failed", "Fail-safe" and "PASSWORD" are not verdicts.
const END = "(?![\\p{L}\\p{N}_-])";
const verdictWord = (s) => new RegExp(`^(PASS WITH NOTES|PASS|FAIL|BLOCKED)${END}`, "iu").exec(String(s ?? "").trim().replace(/[_]+/g, " "))?.[1].toUpperCase() ?? null;

// ── test-strategy.md: one entry per `## Round N` section ─────────────────────────────────────────────────────────
const reconBlock = (sec) => /^### Reconciliation.*\n([\s\S]*?)(?=\n### |(?![\s\S]))/m.exec(sec)?.[1] ?? "";
const riskBlock = (sec) => /^### Risks[ \t]*\n([\s\S]*?)(?=\n### |(?![\s\S]))/m.exec(sec)?.[1] ?? "";
const UNRESULTED = /^[\s—–-]*$/;

export function strategySections(md, path = null) {
  const text = lf(md);
  const starts = [...text.matchAll(/^## Round (\d+)\b/gm)].map((m) => ({ n: Number(m[1]), at: m.index }));
  return starts.map((s, i) => {
    const sec = text.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : undefined);
    const buildLine = /^Build:[ \t]*(.*)$/m.exec(sec)?.[1] ?? "";
    const previous = /Previous:[ \t]*(.*)$/m.exec(buildLine)?.[1] ?? /^Previous:[ \t]*(.*)$/m.exec(sec)?.[1] ?? "";
    const build = buildLine.replace(/\s*·\s*Previous:.*$/, "").replace(/\s*·\s*Stand:.*$/, "").trim();
    const risks = new Map(tableRows(riskBlock(sec)).filter((c) => /^R\d+$/.test(c[0] ?? "")).map((c) => [c[0], { text: c[1] ?? "", source: c[2] ?? "" }]));
    const recon = tableRows(reconBlock(sec)).filter((c) => (c[0] ?? "") !== "");
    return {
      path, n: s.n, date: /^## Round \d+[^\n]*?(\d{4}-\d{2}-\d{2})/.exec(sec)?.[1] ?? null,
      build, keys: hexKeys(build), risks,
      previous: { n: Number(/^Round\s+(\d+)/i.exec(previous)?.[1] ?? 0) || null, verdict: verdictWord(previous.replace(/^Round\s+\d+\s+/i, "")) },
      resulted: recon.some((c) => !UNRESULTED.test(c[3] ?? "")),
      fails: recon.filter((c) => /^R\d+/.test(c[0]) && /^FAIL\b/i.test(c[3] ?? "")).map((c) => /^R\d+/.exec(c[0])[0]),
    };
  });
}

// ── candidates ───────────────────────────────────────────────────────────────────────────────────────────────────
function recordCandidate({ path, json }) {
  const shas = (json.build ?? []).map((b) => String(b?.sha ?? ""));
  return { kind: "record", path, n: json.round ?? null, date: day(json.closedAt), keys: hexKeys(shas.join(" ")), verdict: verdictWord(json.verdict), json,
    build: (json.build ?? []).map((b) => `${b.repo ?? "?"}#${b.number ?? "?"} @ ${String(b.sha ?? "").slice(0, 7)}`).join(" · ") || null,
    titles: (json.bugs ?? []).map((b) => String(b.title ?? b.id ?? "")).filter(Boolean) };
}

// A summary's build, minus `previous_round` (it names the PREVIOUS round's sha: counted, it would merge two rounds).
function summaryCandidate({ path, json, committedAt = null }) {
  const b = json?.build && typeof json.build === "object" ? { ...json.build } : (json?.build ?? null);
  if (b && typeof b === "object") delete b.previous_round;
  const text = b == null ? "" : typeof b === "string" ? b : JSON.stringify(b);
  const pick = b && typeof b === "object" ? [b.head, b.theme, b.platform].find((v) => typeof v === "string" && v) : typeof b === "string" ? b : null;
  return { kind: "summary", path, date: day(json?.date) ?? day(committedAt), keys: hexKeys(text), text: text || `summary:${path}`, verdict: verdictWord(json?.verdict),
    build: pick ?? null, bugs: (json?.bugs_filed ?? []).map((x) => `${x.key}${x.severity ? ` (${x.severity})` : ""}`), committedAt };
}

// ── grouping: one group = one round, however many sources saw it ─────────────────────────────────────────────────
// Sections are the spine and are never merged with each other (a multi-PR ticket keeps the unchanged PRs' shas from
// round to round). A record joins the section it shares most shas with; a summary joins the group it shares most with, or
// the group a no-hex summary's identical build text names.
function group({ sections, records, summaries }) {
  const groups = [];
  for (const s of sections) groups.push({ strategy: s, record: null, summaries: [], keys: new Set(s.keys), text: null });
  for (const r of records) {
    const cands = groups.filter((g) => !g.record && g.strategy).map((g) => [g, overlap(r.keys, g.keys)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (cands.length) cands[0][0].record = r;
    else groups.push({ strategy: null, record: r, summaries: [], keys: new Set(r.keys), text: null });
  }
  for (const s of summaries) {
    const byKey = s.keys.size ? groups.map((g) => [g, overlap(s.keys, g.keys)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) : [];
    const target = byKey[0]?.[0] ?? (s.keys.size ? null : groups.find((g) => g.text === s.text));
    if (target) target.summaries.push(s);
    else groups.push({ strategy: null, record: null, summaries: [s], keys: new Set(s.keys), text: s.keys.size ? null : s.text });
  }
  return groups;
}

const isClosed = (g) => !!(g.record || g.summaries.length || g.strategy?.resulted);
const dateOf = (g) => [g.record?.date, ...g.summaries.map((s) => s.date), ...(g.signalDate ? [g.signalDate] : []), g.strategy?.date].filter(Boolean).sort().at(-1) ?? null;

/** Failed items of a closed group (strings) and the normalised source texts they rest on (Map norm -> display). */
function failuresOf(g) {
  const items = [];
  const sources = new Map();
  const add = (text) => { const k = norm(text); if (k && !sources.has(k)) sources.set(k, String(text).trim()); };
  const s = g.strategy;
  if (s?.resulted) {
    for (const r of s.fails) {
      const risk = s.risks.get(r);
      items.push(risk ? `${r} — ${risk.text}` : r);
      for (const tok of (risk?.source ?? "").split("·").map((t) => t.trim().replace(/:\d+(?:-\d+)?$/, ""))) if (tok && !/^carried from\b/i.test(tok)) add(tok);
    }
  }
  for (const t of g.record?.titles ?? []) { items.push(t); add(t); }
  if (!items.length) for (const b of g.summaries[0]?.bugs ?? []) { items.push(b); add(b.replace(/\s*\(.*\)$/, "")); }
  return { items, sources };
}

const VERDICT_COMMENT = new RegExp(`^(QA Complete|PASS WITH NOTES|PASS|FAIL)${END}`, "iu");

export function countRounds({ strategies = [], records = [], summaries = [], signals = [] } = {}) {
  // sections: the same section seen in two folders (the file moves with the newest round) counts once
  const seen = new Map();
  for (const f of strategies) for (const s of strategySections(f.md, f.path ?? null)) { const k = `${s.n}|${s.date}|${s.build}`; if (!seen.has(k)) seen.set(k, s); }
  const sections = [...seen.values()];
  const groups = group({ sections, records: records.map(recordCandidate), summaries: summaries.map(summaryCandidate) });

  // verdicts of earlier rounds are on the next section's `Previous:` line
  for (const g of groups) {
    if (!g.strategy) continue;
    const next = sections.find((s) => s.previous.n === g.strategy.n && s.previous.verdict);
    g.previousVerdict = next?.previous.verdict ?? null;
  }

  let closed = groups.filter(isClosed);
  const newestDate = () => closed.map(dateOf).filter(Boolean).sort().at(-1) ?? null;

  // verdict comments: a round when posted after the newest local round closed; else that round's own comment
  const verdicts = signals.filter((x) => String(x.source ?? "").startsWith("comment:") && VERDICT_COMMENT.test(String(x.text ?? "").replace(/^[#*_>\s]+/, "")))
    .map((x) => {
      const [, id, created] = /^comment:([^@]+)@?(.*)$/.exec(x.source);
      const text = String(x.text).replace(/^[#*_>\s]+/, "");
      return { id, day: day(created), keys: hexKeys(x.text), word: verdictWord(/^QA Complete/i.test(text) ? text.replace(/^QA Complete[\s*_—–:-]*/i, "") : text) };
    }).sort((a, b) => String(a.day).localeCompare(String(b.day)));
  for (const v of verdicts) {
    const own = v.keys.size ? closed.map((g) => [g, overlap(v.keys, new Set([...g.keys, ...g.summaries.flatMap((s) => [...s.keys])]))]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0]?.[0] : null;
    const newest = newestDate();
    if (own) { (own.comments ??= []).push(v); continue; }
    if (v.day && (!newest || v.day > newest)) {
      const g = { strategy: null, record: null, summaries: [], keys: new Set(v.keys), text: null, comments: [v], signalDate: v.day };
      groups.push(g); closed.push(g);
    } else {
      const last = [...closed].sort((a, b) => String(dateOf(a)).localeCompare(String(dateOf(b)))).at(-1);
      if (last) (last.comments ??= []).push(v);
    }
  }

  closed = closed.sort((a, b) => String(dateOf(a)).localeCompare(String(dateOf(b))) || (a.strategy?.n ?? 99) - (b.strategy?.n ?? 99));
  const out = closed.map((g, i) => {
    const sum = g.summaries[0];
    return {
      n: i + 1,
      build: g.strategy?.build || g.record?.build || sum?.build || null,
      date: dateOf(g),
      verdict: g.record?.verdict ?? sum?.verdict ?? g.previousVerdict ?? g.comments?.find((c) => c.word)?.word ?? null,
      sources: [...new Set([
        ...(g.strategy ? [`strategy:${g.strategy.path ?? "?"}#Round ${g.strategy.n}`] : []),
        ...(g.record ? [`record:${g.record.path}`] : []),
        ...g.summaries.map((s) => `summary:${s.path}${s.committedAt ? `@${s.committedAt.slice(0, 10)}` : ""}`),
        ...(g.comments ?? []).map((c) => `comment:${c.id}`),
      ])],
    };
  });

  // open: the last section, while no source closed it — unless a later close superseded it (a legacy summary that
  // never filled the section's Reconciliation)
  const last = [...sections].sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.n - b.n).at(-1);
  const lastGroup = last ? groups.find((g) => g.strategy === last) : null;
  let open = null;
  let superseded = [];
  if (lastGroup && !isClosed(lastGroup)) {
    if (closed.some((g) => last.date && dateOf(g) > last.date)) superseded = [last.n];
    else open = last.n;
  }

  const mode = open != null ? "resume" : !out.length ? "first" : out.length >= CAP ? "cap" : "refresh";
  const result = { round: open ?? out.length + 1, mode, closed: out, open, superseded };
  const newestStrategy = sections.length ? [...sections].sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.n - b.n).at(-1).path : null;
  const recs = records.slice().sort((a, b) => (a.json?.round ?? 0) - (b.json?.round ?? 0) || String(a.json?.closedAt).localeCompare(String(b.json?.closedAt)));
  result.strategy = newestStrategy;
  result.record = recs.at(-1)?.path ?? null;

  if (mode === "cap") {
    const per = closed.map((g) => failuresOf(g));
    const rounds = new Map();
    per.forEach((f, i) => { for (const [k, text] of f.sources) { const e = rounds.get(k) ?? { text, at: new Set() }; e.at.add(i); rounds.set(k, e); } });
    result.escalation = {
      rounds: out,
      failed: per.map((f, i) => ({ n: i + 1, items: f.items })),
      repeated: [...rounds.values()].filter((e) => e.at.size > 1).map((e) => e.text),
      to: ESCALATE_TO,
    };
  }
  return result;
}

// ── closing a round: the machine record ──────────────────────────────────────────────────────────────────────────
const VERDICT_SCHEMA = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "verdict.schema.json"), "utf8"));
export const validateVerdict = (verdict) => validate(verdict, VERDICT_SCHEMA);

/** Every `<repo>#<n> @ <hex>` of a Build line, the sha being the first hex after `@`. */
export function parseBuild(build) {
  return [...String(build ?? "").matchAll(/([\w.-]+(?:\/[\w.-]+)?)#(\d+)\s*@\s*([0-9a-f]{7,40})(?![0-9a-z])/gi)]
    .map((m) => ({ repo: m[1], number: Number(m[2]), sha: m[3].toLowerCase() }));
}

/** The R ids of a section whose Reconciliation Result is empty, a dash, or BLOCKED. */
function unresultedOf(md, n) {
  const text = lf(md);
  const starts = [...text.matchAll(/^## Round (\d+)\b/gm)];
  const i = starts.findIndex((m) => Number(m[1]) === n);
  if (i < 0) return [];
  const sec = text.slice(starts[i].index, starts[i + 1]?.index);
  return tableRows(reconBlock(sec))
    .filter((c) => /^R\d+/.test(c[0] ?? "") && (UNRESULTED.test(c[3] ?? "") || /^BLOCKED(?![\p{L}\p{N}_-])/iu.test(c[3] ?? "")))
    .map((c) => /^R\d+/.exec(c[0])[0]);
}

/**
 * The record `rounds/round-<N>.json` that closes a round. `strategyMd` is test-strategy.md; the round it closes is its last
 * section (`round` names it, the last section's own number when omitted); `verdict` is verdict.json; `filed` maps a bug id
 * to the tracker key it was just filed under; `bundlePath` is the stored, outputRoot-relative path of the round's bundle copy.
 */
export function closeRound({ round, strategyMd, verdict, filed = {}, env, closedAt = new Date().toISOString(), bundlePath }) {
  const errors = validateVerdict(verdict);
  if (errors.length) throw new Error(`verdict.json is invalid: ${errors.join("; ")}`);
  const sections = strategySections(strategyMd);
  const section = round == null ? sections.at(-1) : sections.find((s) => s.n === round);
  if (!section) throw new Error(round == null ? "test-strategy.md has no `## Round N` section" : `test-strategy.md has no \`## Round ${round}\` section`);
  const ids = new Set(verdict.bugs.map((b) => b.id));
  for (const id of Object.keys(filed)) if (!ids.has(id)) throw new Error(`--filed ${id}: the verdict has no such bug`);
  return {
    round: section.n, env, closedAt, verdict: verdict.verdict,
    build: parseBuild(section.build),
    bugs: verdict.bugs.map((b) => ({ ...b, key: filed[b.id] ?? b.key ?? null })),
    unresulted: unresultedOf(strategyMd, section.n),
    bundle: bundlePath,
  };
}

// ── round N: the delta and the appended section ──────────────────────────────────────────────────────────────────
const asRecord = (r) => (r && typeof r === "object" && "json" in r ? r : { path: null, json: r });
const idNum = (id) => Number(/\d+/.exec(String(id ?? ""))?.[0] ?? 0);
const SEVERITY = ["Medium", "High", "Critical"];
const byRound = (a, b) => (a.round ?? 0) - (b.round ?? 0) || String(a.closedAt).localeCompare(String(b.closedAt));

/** The first non-blank line of a comment body: a Jira v2 string (a wiki heading marker dropped) or a v3 ADF document. */
function firstLine(body) {
  if (typeof body === "string") return (lf(body).split("\n").map((l) => l.trim()).find(Boolean) ?? "").replace(/^h[1-6]\.\s*/i, "");
  const texts = [];
  const walk = (n) => { if (!n || typeof n !== "object") return; if (typeof n.text === "string") texts.push(n.text); for (const c of n.content ?? []) walk(c); };
  for (const blockNode of body?.content ?? []) {
    texts.length = 0;
    walk(blockNode);
    const t = texts.join("").trim();
    if (t) return t.split("\n")[0].trim();
  }
  return "";
}

/** The kept comments of a delta read (prepare's ticket_json) as countRounds signals. */
export function commentSignals(ticket) {
  return (ticket?.fields?.comment?.comments ?? []).map((c) => ({ text: firstLine(c?.body), source: `comment:${c?.id}@${c?.created ?? ""}` })).filter((s) => s.text);
}

/** Every in-scope bug of every record, one entry per bug (B2): a re-observed bug — the same tracker key, or a bug whose
 *  `priorBug` names an entry — joins its first sighting; otherwise `id@round` is the identity. PB-n in round, then id order. */
export function priorBugsOf(records) {
  const out = [];
  const byKey = new Map(), byPb = new Map(), byId = new Map();
  for (const rec of records.map((r) => asRecord(r).json).filter(Boolean).sort(byRound)) {
    for (const b of (rec.bugs ?? []).filter((x) => x?.scope === "in").sort((x, y) => idNum(x.id) - idNum(y.id))) {
      const hit = (b.key && byKey.get(b.key)) || (b.priorBug && byPb.get(b.priorBug)) || byId.get(`${b.id}@${rec.round}`);
      if (hit) {
        for (const f of ["key", "spec", "package"]) hit[f] ??= b[f] ?? null;
        if (SEVERITY.indexOf(b.severity) > SEVERITY.indexOf(hit.severity)) hit.severity = b.severity;
        if (hit.key) byKey.set(hit.key, hit);
        continue;
      }
      const e = { pb: `PB-${out.length + 1}`, key: b.key ?? null, id: b.id, title: b.title, severity: b.severity, foundIn: rec.round ?? null, spec: b.spec ?? null, package: b.package ?? null };
      out.push(e);
      byPb.set(e.pb, e);
      byId.set(`${b.id}@${rec.round}`, e);
      if (e.key) byKey.set(e.key, e);
    }
  }
  return out;
}

const shortBuild = (build) => (build ?? []).map((b) => `${b.repo}#${b.number} @ ${String(b.sha ?? "").slice(0, 8)}`).join(", ") || "none";

/**
 * Round N's delta over `ticket-context prepare --since`'s output. `records` are every round record of the ticket
 * (`{ path, json }` or the bare record), `strategies` / `summaries` what `count` reads, `ticket` the parsed
 * `prepare.ticket_json` (the comments posted after the round closed). A context-only PR is no build; a PR that could
 * not be read (`delta: null`) is not "the same build" — the build is never assumed unread.
 */
export function deltaOf({ records = [], strategies = [], summaries = [], prepare, ticket = null }) {
  if (!prepare?.delta) throw new Error("not a --since delta prepare.json (it has no `delta`)");
  const recs = records.map(asRecord);
  const recount = countRounds({ strategies, records: recs, summaries, signals: commentSignals(ticket) });
  const prs = (prepare.prs ?? []).filter((p) => !p.context_only)
    .map((p) => ({ ref: p.ref ?? `${p.repo}#${p.number}`, repo: p.repo, number: p.number, delta: p.delta ?? null, from: p.from ?? null, to: p.head_sha ?? null }));
  const moved = prs.filter((p) => p.delta === "changed" || p.delta === "new");
  const newest = recs.map((r) => r.json).filter(Boolean).sort(byRound).at(-1) ?? null;
  const comments = Number(prepare.delta.comments ?? 0);
  const acceptanceChanged = !!prepare.delta.acceptance_changed;
  return {
    round: recount.round, mode: recount.mode, ...(recount.escalation ? { escalation: recount.escalation } : {}),
    since: prepare.delta.since ?? null, sameBuild: prs.every((p) => p.delta === "unchanged"), prs, comments, acceptanceChanged,
    priorBugs: priorBugsOf(recs), outOfScope: (prepare.delta.bug_status ?? []).map((b) => ({ key: b.key, status: b.status ?? null })),
    carried: newest ? (newest.unresulted ?? []).map((r) => ({ r, round: newest.round })) : [],
    previous: newest ? { round: newest.round, verdict: newest.verdict ?? null, build: shortBuild(newest.build) } : null,
    strategy: recount.strategy ?? null,
    dispatch: { ticket: comments > 0 || acceptanceChanged, change: moved.map((p) => p.ref) },
  };
}

const TBD = "TBD — strategy agent";
const cell = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
/** Table lines of a block, with their cells (the header and separator rows dropped). */
const rawRows = (text) => text.split("\n").filter((l) => /^\|/.test(l) && !/^[\s|:-]+$/.test(l)).slice(1).map((line) => ({ line, cells: line.split("|").slice(1, -1).map((c) => c.trim()) }));
const blockOf = (sec, heading) => new RegExp(`^### ${heading}[ \\t]*\\n([\\s\\S]*?)(?=\\n### |(?![\\s\\S]))`, "m").exec(sec)?.[1] ?? "";
const RISKS_HEAD = "| R | What a customer would see if this is wrong | Source | L×I | Level |\n|---|---|---|---|---|";
const APPROACH_HEAD = "| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent | Effort |\n|---|---|---|---|---|---|";
const SCENARIOS_HEAD = "| S | Class | What it does | Bug it hunts | Why likely | Score | Proof | Writes |\n|---|---|---|---|---|---|---|---|";
const PRIOR_HEAD = "| PB | Bug | Severity | Found | Reproduction | R |\n|---|---|---|---|---|---|";
const RECON_HEAD = "| R | Planned | Ran (item ids · charter · lane · case ids) | Result | Deviation — reason |\n|---|---|---|---|---|";

/** How a prior bug is reproduced (P4): its .spec through the runner, else its package on a browser lane, else nothing. */
function proofOf(b) {
  if (b.spec) return { repro: `spec ${b.spec}`, layer: "spec · Playwright runner", lane: "node · playwright test", effort: "low" };
  if (b.package) return { repro: `package ${b.package}`, layer: "the package's layer · Playwright", lane: "chrome · qa-frontend-expert", effort: "medium" };
  return { repro: "none", layer: "—", lane: "none · BLOCKED — no reproduction recorded", effort: "low" };
}

/**
 * test-strategy.md with `## Round <N>` appended (U15, written without asking). Round N−1's text is the returned text's
 * prefix, byte for byte; a last section already numbered N returns the file unchanged. Throws when the last section is
 * neither N nor N−1.
 */
export function appendRound({ strategyMd, delta, env, date, changeMapPath = null }) {
  const md = String(strategyMd);
  const text = lf(md);
  const n = Number(delta?.round);
  const starts = [...text.matchAll(/^## Round (\d+)\b/gm)];
  const last = starts.length ? Number(starts.at(-1)[1]) : null;
  if (last === n) return md;
  if (!Number.isInteger(n) || n < 2 || last !== n - 1) throw new Error(`test-strategy.md's last section is ${last == null ? "none" : `Round ${last}`}; the delta is for Round ${delta?.round}: expected Round ${n - 1}`);
  const prev = text.slice(starts.at(-1).index);
  const p = n - 1;

  const riskRows = rawRows(blockOf(prev, "Risks")).filter((r) => /^R\d+$/.test(r.cells[0] ?? ""));
  const approachRows = rawRows(blockOf(prev, "Approach per risk"));
  const reconIds = rawRows(blockOf(prev, "Reconciliation.*")).map((r) => /^R(\d+)/.exec(r.cells[0] ?? "")?.[1]).filter(Boolean).map(Number);
  let next = Math.max(0, ...riskRows.map((r) => idNum(r.cells[0])), ...reconIds) + 1;

  const risks = [], approach = [], prior = [];
  const carriedText = new Map();
  for (const { r } of delta.carried ?? []) {
    const row = riskRows.find((x) => x.cells[0] === r);
    if (!row) {
      risks.push(`| ${r} | ${TBD} (Round ${p} ${r} is in no Risks row) | carried from Round ${p} ${r} | — | ${TBD} |`);
      approach.push(`| ${r} | ${TBD} | — | — | — | — |`);
      continue;
    }
    const [, what = "", source = "", li = "", level = ""] = row.cells;
    const tokens = source.split("·").map((t) => t.trim()).filter((t) => t && !/^carried from Round\b/i.test(t));
    risks.push(`| ${r} | ${what} | ${[...tokens, `carried from Round ${p} ${r}`].join(" · ")} | ${li} | ${level} |`);
    carriedText.set(what, r);
    approach.push(approachRows.find((x) => x.cells[0] === r)?.line ?? `| ${r} | ${TBD} | — | — | — | — |`);
  }
  for (const b of delta.priorBugs ?? []) {
    const what = `${cell(b.title)} is fixed, and nothing next to it broke`;
    const ref = b.key ?? `${b.id} (Round ${b.foundIn})`;
    const proof = proofOf(b);
    let r = carriedText.get(what);
    if (!r) {
      r = `R${next++}`;
      risks.push(`| ${r} | ${what} | ${ref} | — | ${b.severity} |`);
      approach.push(`| ${r} | FLOW · REGRESSION | ${b.key ?? b.id}'s expected result {OBSERVED} | ${proof.layer} | ${proof.lane} | ${proof.effort} |`);
    }
    prior.push(`| ${b.pb} | ${b.key ?? b.id} — ${cell(b.title)} | ${b.severity} | Round ${b.foundIn} | ${proof.repro} | ${r} |`);
  }

  // Round N−1's Artifacts, the Prior bugs row replaced; a decision naming one of its scenarios (S-n) is round N's to write.
  const artifacts = rawRows(blockOf(prev, "Artifacts")).filter((x) => x.cells[0] !== "Prior bugs")
    .map((x) => (/\bS-\d+/.test(x.cells[1] ?? "") ? `| ${x.cells[0]} | ${TBD} |` : x.line));
  const nPrior = (delta.priorBugs ?? []).length;
  artifacts.push(`| Prior bugs | ${nPrior ? `RUN — ${nPrior} bug${nPrior > 1 ? "s" : ""}` : "SKIP — no prior bug"} |`);

  const depth = /^Status:.*?Depth label:[ \t]*(.*)$/m.exec(prev)?.[1].trim() || TBD;
  const build = (delta.prs ?? []).map((x) => `${x.repo}#${x.number} @ ${x.to ?? "?"}`).join(" · ") || "none";
  const pv = delta.previous;
  const section = [
    `## Round ${n} of 3 — ${date}`, "",
    `Status: AUTO (round ${n} refresh, U15) · Depth label: ${depth}`,
    `Blocked: ${TBD}`,
    `Build: ${build} · Stand: ${env} · Deployed: ${TBD} · Previous: Round ${pv?.round ?? p} ${pv?.verdict ?? "?"}, ${pv?.build ?? "none"}`,
    `Floors fired: ${TBD}`,
    `Change map: ${changeMapPath ?? "none"}`, "",
    `**Mission.** ${TBD}`, "",
    "### Inputs", TBD, "",
    "### Risks", RISKS_HEAD, ...risks, "",
    `Project risks: ${TBD}`, "",
    "### Strategy mix", TBD, "",
    "### Approach per risk", APPROACH_HEAD, ...approach, "",
    "### Scenarios", SCENARIOS_HEAD, "",
    "### Prior bugs", PRIOR_HEAD, ...prior, "",
    "### Artifacts", "| Artifact | Decision |", "|---|---|", ...artifacts, "",
    "### Data", TBD, "",
    "### Out of scope", TBD, "",
    "### Criteria", TBD, "",
    "### Amendments", "",
    "### Reconciliation (filled at close-out)", RECON_HEAD, "",
  ];
  const eol = /\r\n/.test(md) ? "\r\n" : "\n";
  return md + (/\n$/.test(md) ? "" : eol) + eol + section.join(eol);
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const posix =(file, root) => { const rel = relative(root, file); return (isAbsolute(rel) || rel.startsWith("..") ? file : rel).split(sep).join("/"); };
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });

/** Every committed version of a file (newest first): `[{ committedAt, text }]`; [] outside a work tree. */
function gitVersions(file) {
  try {
    const cwd = dirname(file);
    const prefix = git(cwd, ["rev-parse", "--show-prefix"]).trim();
    const name = prefix + file.slice(cwd.length + 1).split(sep).join("/");
    return git(cwd, ["log", "--all", "--format=%H%x09%cI", "--", file.slice(cwd.length + 1)]).split("\n").filter(Boolean).map((l) => {
      const [sha, committedAt] = l.split("\t");
      try { return { committedAt, text: git(cwd, ["show", `${sha}:${name}`]) }; } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function readInputs({ key, runDir, root }) {
  const dirs = new Map();
  for (const r of priorRunDirs({ ticket: key })) dirs.set(resolve(r.dir), r.dir);
  if (runDir) dirs.set(resolve(runDir), runDir);
  const strategies = [], records = [], summaries = [];
  const json = (file, text) => { try { return JSON.parse(text); } catch (e) { throw new Error(`${file}: ${e.message}`); } };
  for (const dir of dirs.values()) {
    const p = (f) => join(dir, f);
    if (existsSync(p("test-strategy.md"))) strategies.push({ path: posix(p("test-strategy.md"), root), md: readFileSync(p("test-strategy.md"), "utf8") });
    const rdir = p("rounds");
    if (existsSync(rdir)) for (const n of readdirSync(rdir).filter((f) => /^round-\d+\.json$/.test(f)).sort()) records.push({ path: posix(join(rdir, n), root), json: json(join(rdir, n), readFileSync(join(rdir, n), "utf8")) });
    if (existsSync(p("summary.json"))) {
      const file = p("summary.json");
      const path = posix(file, root);
      const working = readFileSync(file, "utf8");
      summaries.push({ path, json: json(file, working), committedAt: null });
      for (const v of gitVersions(file)) { try { summaries.push({ path, json: JSON.parse(v.text), committedAt: v.committedAt }); } catch { /* an old, non-JSON version */ } }
    }
  }
  return { strategies, records, summaries };
}

function usage(msg) {
  console.error(`${msg}\nusage: rounds.mjs count --key <KEY> [--run-dir <RUN_DIR>] [--bundle <bundle.json>]\n       rounds.mjs close --key <KEY> --run-dir <RUN_DIR> --bundle <bundle.json> [--filed B-1=VCST-7001,B-2=…]
       rounds.mjs delta --key <KEY> --run-dir <RUN_DIR> --prepare <delta prepare.json>
       rounds.mjs append --run-dir <RUN_DIR> --delta <WORK>/delta.json [--change-map <path>]`);
  process.exit(1);
}

function count(argv, key) {
  const bundlePath = argOf(argv, "bundle");
  let signals = [];
  if (bundlePath !== undefined) {
    try { signals = JSON.parse(readFileSync(bundlePath, "utf8")).signals ?? []; } catch (e) { usage(`${bundlePath}: ${e.message}`); }
  }
  let inputs;
  try { inputs = readInputs({ key, runDir: argOf(argv, "run-dir"), root: outputRoot() }); } catch (e) { console.error(e.message); process.exit(1); }
  const result = countRounds({ ...inputs, signals });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.mode === "cap" ? 2 : 0);
}

function close(argv) {
  const runDir = argOf(argv, "run-dir");
  const bundle = argOf(argv, "bundle");
  if (!runDir) usage("--run-dir is required");
  if (!bundle) usage("--bundle is required");
  const filed = {};
  for (const pair of (argOf(argv, "filed") ?? "").split(",").filter(Boolean)) {
    const m = /^(B-\d+)=(.+)$/.exec(pair.trim());
    if (!m) usage(`--filed expects B-<n>=<KEY>[,…], got "${pair}"`);
    filed[m[1]] = m[2];
  }
  const fail = (msg) => { console.error(msg); process.exit(1); };
  const read = (file) => { try { return readFileSync(file, "utf8"); } catch (e) { return fail(`${file}: ${e.message}`); } };
  const strategyFile = join(runDir, "test-strategy.md");
  const verdictFile = join(runDir, "verdict.json");
  const strategyMd = read(strategyFile);
  let verdict;
  try { verdict = JSON.parse(read(verdictFile)); } catch (e) { fail(`${verdictFile}: ${e.message}`); }
  const n = strategySections(strategyMd).at(-1)?.n;
  if (n == null) fail(`${strategyFile}: no "## Round N" section`);
  if (!existsSync(bundle)) fail(`${bundle}: not found`);
  const root = outputRoot();
  const rdir = join(runDir, "rounds");
  const copy = join(rdir, `round-${n}.bundle.json`);
  let record;
  try { record = closeRound({ round: n, strategyMd, verdict, filed, env: currentEnv(), bundlePath: posix(copy, root) }); } catch (e) { fail(e.message); }
  mkdirSync(rdir, { recursive: true });
  if (resolve(bundle) !== resolve(copy)) copyFileSync(bundle, copy);
  writeFileSync(join(rdir, `round-${n}.json`), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({ record: posix(join(rdir, `round-${n}.json`), root), bundle: record.bundle, round: n, verdict: record.verdict, unresulted: record.unresulted }));
  process.exit(0);
}

const fail = (msg) => { console.error(msg); process.exit(1); };
const readJsonFile = (file) => { try { return JSON.parse(readFileSync(file, "utf8")); } catch (e) { return fail(`${file}: ${e.code ?? e.message}`); } };

function deltaCmd(argv, key) {
  const runDir = argOf(argv, "run-dir");
  const prepPath = argOf(argv, "prepare");
  if (!runDir) usage("--run-dir is required");
  if (!prepPath) usage("--prepare is required (ticket-context prepare --since's prepare.json)");
  const root = outputRoot();
  const prepare = readJsonFile(prepPath);
  if (!prepare?.delta) fail(`${prepPath}: not a --since delta read (no \`delta\`)`);
  // The kept comments are read here and only their first lines become signals; no comment text is printed.
  const ticket = prepare.ticket_json ? readJsonFile(resolve(root, String(prepare.ticket_json))) : null;
  let inputs;
  try { inputs = readInputs({ key, runDir, root }); } catch (e) { fail(e.message); }
  const d = { key, ...deltaOf({ ...inputs, prepare, ticket }) };
  if (d.sameBuild) d.stop = `round ${d.round - 1} already tested this build (P3): no PR changed and none is new — amend that round instead`;
  writeFileSync(join(workDir(key), "delta.json"), `${JSON.stringify(d, null, 2)}\n`);
  console.log(JSON.stringify(d, null, 2));
  process.exit(d.sameBuild || d.mode === "cap" ? 2 : 0);
}

function appendCmd(argv) {
  const runDir = argOf(argv, "run-dir");
  const deltaPath = argOf(argv, "delta");
  if (!runDir) usage("--run-dir is required");
  if (!deltaPath) usage("--delta is required (<WORK>/delta.json)");
  const delta = readJsonFile(deltaPath);
  if (delta.mode === "cap" || delta.sameBuild) fail(`${deltaPath}: this delta STOPs the run (${delta.mode === "cap" ? "a fourth round" : "the same build"}) — nothing to append`);
  const root = outputRoot();
  const file = join(runDir, "test-strategy.md");
  let src = file;
  if (!existsSync(file)) {
    if (!delta.strategy) fail(`${file}: not found, and the delta names no prior test-strategy.md`);
    src = resolve(root, delta.strategy);
  }
  let md;
  try { md = readFileSync(src, "utf8"); } catch (e) { fail(`${src}: ${e.code ?? e.message}`); }
  const cm = argOf(argv, "change-map");
  let out;
  try { out = appendRound({ strategyMd: md, delta, env: currentEnv(), date: new Date().toISOString().slice(0, 10), changeMapPath: cm && existsSync(cm) ? cm : null }); } catch (e) { fail(e.message); }
  mkdirSync(runDir, { recursive: true });
  if (out !== md || src !== file) writeFileSync(file, out);
  // The file moves with the newest round; the older folder keeps one line (rounds.md §Storage).
  if (src !== file) writeFileSync(src, `Moved to ${posix(file, root)} at Round ${delta.round}.\n`);
  console.log(JSON.stringify({ strategy: posix(file, root), round: delta.round, appended: out !== md, moved_from: src !== file ? posix(src, root) : null }));
  process.exit(0);
}

function main() {
  const argv = process.argv.slice(2);
  if (!["count", "close", "delta", "append"].includes(argv[0])) usage(`unknown command "${argv[0] ?? ""}"`);
  if (argv[0] === "append") return appendCmd(argv);
  const key = argOf(argv, "key");
  if (!key || !KEY_RE.test(key)) usage(`--key must be a ticket key, got "${key ?? ""}"`);
  if (argv[0] === "close") close(argv); else if (argv[0] === "delta") deltaCmd(argv, key); else count(argv, key);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
