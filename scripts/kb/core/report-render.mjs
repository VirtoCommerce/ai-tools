// The report's HTML — one self-contained file, no dependencies, no network at render time.
//
// Inline CSS and no <script> deliberately: the file lands in the session scratchpad and is opened
// from the filesystem, where a CDN stylesheet is a blank page and a fetch is a CORS error. A report
// that needs the network to render is a report that fails in exactly the situation the cache path
// exists for.
//
// PANEL ORDER IS MISSES FIRST, because the miss list IS the work queue (PLAN §8). Panel 6 sits
// second rather than last for the same reason: an unhelpful answer is a miss the miss list cannot
// see, so a reader who stops after two panels has still seen everything that is work.

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const pct = (n) => (n == null ? '—' : `${Math.round(n * 1000) / 10}%`);
const when = (iso) => String(iso ?? '').replace('T', ' ').replace(/\.\d+Z$/, 'Z').slice(0, 19);

/**
 * An empty panel says WHY it is empty. "No rows" and "nothing happened" are not the same fact — and
 * neither is "nothing was read", which is the one a report must never dress up as the first two.
 *
 * `NOTHING_READ` is a module-level switch rather than a parameter threaded through six panels
 * because it is not a per-panel property: when the read failed, EVERY panel's emptiness has the same
 * cause, and a per-panel flag is one that eventually gets forgotten on the seventh panel. Set once
 * by `renderHtml` before any panel runs. Found by a test: with an empty cache the misses panel
 * still offered "Either coverage is good…", which is §3.5's confusion in the exact place §8 says it
 * must not appear.
 */
let NOTHING_READ = false;
const NOTHING_READ_TEXT = 'Nothing was read — see the banner above. This panel is empty because there is no data, '
  + 'not because there were no events. Conclude nothing from it.';
const empty = (text) => `<p class="empty">${esc(NOTHING_READ ? NOTHING_READ_TEXT : text)}</p>`;

function table(headers, rows) {
  if (!rows.length) return '';
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>`
    + `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/**
 * The banner. Its job is to make a cache-rendered report impossible to mistake for a live one —
 * the single thing PLAN §8 says the report must not get wrong.
 */
function banner(meta) {
  if (!meta.fromCache) return '';
  if (meta.cacheEmpty) {
    return `<div class="banner bad"><strong>The base could not be read, and the cache is empty.</strong>
      <span>${esc(meta.failure ?? 'unknown failure')}</span>
      <span>This is <em>not</em> "no activity" — nothing was read at all. Every panel below is empty
      because there is no data, not because there were no events.</span></div>`;
  }
  return `<div class="banner"><strong>The base could not be read — this report is rendered from cache.</strong>
    <span>${esc(meta.failure ?? 'unknown failure')}</span>
    <span>Newest cached record: <code>${esc(when(meta.newestCached) || 'unknown')}</code>.
    Anything after that timestamp is missing from every panel below.</span></div>`;
}

/**
 * The §15 acceptance block, above panel 1 because it is the thing the check wave is judged by.
 *
 * `NOT ENOUGH DATA` gets its OWN colour and its own word — it is not a softer PASS. §14.1's
 * mistake was a comfortable number with nothing behind it, and a verdict block that rendered a
 * thin absence in the same green as a real one would reproduce it in the one place that exists to
 * prevent it. Every row prints the n it judged, beside the value.
 */
function verdictBlock(v) {
  if (!v) return '';
  const cls = { PASS: 'ok', FAIL: 'bad', 'NOT ENOUGH DATA': 'nodata' };
  const rows = v.rows.map((r) => `<tr>
    <td><span class="verdict ${esc(cls[r.state] ?? '')}">${esc(r.state)}</span></td>
    <td><b>${esc(r.threshold)}</b><div class="muted">${esc(r.source)}</div></td>
    <td><code>n=${esc(r.n)}</code></td>
    <td>${esc(r.detail)}</td>
  </tr>`).join('');
  return `<section id="verdict" class="verdict-block">
    <h2>§15 acceptance — the three thresholds, declared before the run</h2>
    <p class="lede">Declared in <code>report-analyse.mjs</code>, not passed in: a threshold supplied
      on the command line is a threshold that can be moved after seeing the result.
      <strong>NOT ENOUGH DATA is a real verdict, not a soft pass</strong> — an absence only counts
      below a rate once there are at least <strong>${esc(v.thresholds.minSample)}</strong> observations
      behind it (rule of three against the ${esc(v.thresholds.unhelpfulRate * 100)}% trigger).
      A 0% rate over two asks is not a pass.</p>
    <table><thead><tr><th>verdict</th><th>threshold</th><th>n</th><th>what was judged</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <p class="muted">${esc(v.pass)} pass · ${esc(v.fail)} fail · ${esc(v.noData)} not enough data.
      The near-miss row <strong>flags</strong> candidates for a human to read; it never claims to
      judge whether they were answerable (PLAN §15.3).</p>
  </section>`;
}

function panelNearMisses(p) {
  const rows = p.rows.map((r) => [
    `<b class="${r.inBand ? 'bad' : ''}">${esc(r.coverage.toFixed(2))}</b>`,
    `<code>${esc(r.id)}</code>`,
    esc(r.subject) || (r.inIndex ? '' : '<span class="muted">not in the index snapshot</span>'),
    `<span class="q">${esc(r.question)}</span>`,
    esc(r.score),
    r.rejectedBy === 'words'
      ? `<span class="muted">word count (&lt;&nbsp;${esc(p.minWords)}); coverage already cleared the floor</span>`
      : '<span class="muted">coverage</span>',
    esc(r.session),
  ]);
  const repeats = p.repeats.map((g) => `<code>${esc(g.id)}</code>&nbsp;×${esc(g.count)}`
    + ` <span class="muted">${esc(g.subject)} — ${esc(g.distinctQuestions)} distinct question(s), best ${esc(g.best.toFixed(2))}</span>`).join(' · ');
  return `<section id="near-misses">
    <h2>1a · Near misses — the floor's own error bar</h2>
    <p class="lede">The best candidate each miss <em>rejected</em>, sorted by coverage descending.
      The admissibility floor is <code>${esc(p.floor)}</code> coverage (or one anchor, or
      &lt;&nbsp;${esc(p.minWords)} overlapping words), and the nearest surviving BAD hit in its
      derivation sat at <strong>0.45</strong> — one word below. So
      <strong>anything at or above ${esc(p.review)} is a row a human must read</strong>: either the
      floor refused a question it should have answered, or an entry is phrased so unlike the way
      people ask that it is invisible. The log cannot tell which.
      ${p.repeats.length ? '' : '<em>A candidate that near-misses repeatedly is the second case, and is worth rewriting rather than re-cutting the floor.</em>'}</p>
    <p class="metric">
      <strong class="${p.inBand.length ? 'bad' : ''}">${esc(p.inBand.length)}</strong> row(s) at
      coverage ≥ ${esc(p.review)} · <strong>${esc(p.rows.length)}</strong> of
      <strong>${esc(p.missTotal)}</strong> miss(es) carried a candidate
      <span class="muted">(${esc(p.withoutNearMiss)} scored nothing at all — not a floor problem)</span>
    </p>
    ${repeats ? `<p class="metric">Repeatedly near-missed: ${repeats}</p>` : ''}
    ${rows.length ? table(['coverage', 'candidate', 'subject', 'the question it missed', 'score', 'stopped by', 'session'], rows)
    : empty('No miss in this window carried a rejected candidate. Either there were no misses, or nothing in the base scored above zero on them — the metric line above says which.')}
  </section>`;
}

function header(report) {
  const m = report.meta;
  const days = m.days;
  const act = report.activity;
  const spark = act.length
    ? act.map((a) => `<span class="day" title="${esc(a.day)}: ${a.count} lines"><i style="height:${Math.max(2, Math.round(28 * a.count / Math.max(...act.map((x) => x.count))))}px"></i><b>${esc(a.day.slice(5))}</b></span>`).join('')
    : '';
  const notes = [];
  if (m.truncated) notes.push('the git tree came back <strong>truncated</strong> — some log files may be missing');
  if (m.malformed) notes.push(`<strong>${m.malformed}</strong> log line(s) failed to parse and were dropped`);
  if (m.indexLoaded === false) notes.push('<strong>index.json did not load</strong> — subjects and panel 6 verdicts below are unreliable');
  // The filter SAYS SO. A report that silently dropped part of its input would be a measurement
  // you cannot audit, which is the defect the synthetic flag exists to fix, relocated one layer up.
  if (m.synthetic) {
    notes.push(`<strong>${m.synthetic}</strong> line(s) in this window are marked <code>synthetic</code>`
      + `${m.syntheticAsks ? ` (${m.syntheticAsks} of them asks)` : ''} — a benchmark, demo or acceptance run. `
      + 'They are excluded from every panel below: a stopwatch is not demand.');
  }
  // A report headed "last 30 days" that actually read three named sessions publishes a number
  // nobody can reproduce -- PLAN §15.2's objection, in the header.
  if (m.sessionsMissing?.length) {
    notes.push('<strong>named session(s) with no log file in the base:</strong> '
      + m.sessionsMissing.map((x) => `<code>${esc(x)}</code>`).join(' ')
      + ' — they pushed nothing, or their queue has not been swept yet. This is NOT "they asked nothing".');
  }
  for (const f of m.failures ?? []) notes.push(`could not read <code>${esc(f.path)}</code> — ${esc(f.detail)}`);

  return `<header>
    <h1>kb — what agents asked, and what the base could not answer</h1>
    <p class="sub">
      <code>${esc(m.base)}</code> ·
      ${m.sessions?.length
    ? `scoped to <strong>${esc(m.sessions.length)}</strong> named session(s) `
      + `<span class="muted">(${m.sessions.map((x) => `<code>${esc(x)}</code>`).join(' ')})</span>, whole log tree`
    : `last <strong>${esc(days)}</strong> days`} ·
      <strong>${esc(m.files ?? 0)}</strong> session log file(s) ·
      <strong>${esc(report.sessions)}</strong> session(s) ·
      <strong>${esc(report.panels.questions.totalAsks)}</strong> ask(s) ·
      generated ${esc(when(m.at))}
    </p>
    ${spark ? `<div class="spark">${spark}</div>` : ''}
    <p class="tally">${Object.entries(report.tally).map(([k, n]) => `<span><b>${esc(n)}</b> ${esc(k)}</span>`).join('') || '<span class="empty">no log lines in the window</span>'}</p>
    ${notes.length ? `<ul class="notes">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
  </header>`;
}

function panelMisses(p) {
  const rows = p.ranked.map((m) => [
    `<b>${esc(m.count)}</b>`,
    esc(m.sessions),
    `<span class="q">${esc(m.question)}</span>`,
    `<code>${esc(when(m.last))}</code>`,
  ]);
  return `<section id="misses">
    <h2>1 · Misses — the work queue</h2>
    <p class="lede">A question asked and not answered. Ranked by repeat count: asked three times and
      never answered is the highest-value entry nobody has written.
      ${p.unreachable ? `<em>${p.unreachable} ask(s) in this window were <code>unreachable</code>, not misses — the base was not read, so they say nothing about coverage.</em>` : ''}</p>
    ${rows.length ? table(['asked', 'sessions', 'question', 'last'], rows)
    : empty('No misses in this window. Either coverage is good, or nobody asked anything the base does not hold — panel 2 says which.')}
  </section>`;
}

function panelUnhelpful(p) {
  const rows = p.rows.filter((r) => r.verdict !== 'helpful').map((r) => [
    r.verdict === 'unhelpful' ? '<span class="bad">unhelpful</span>' : '<span class="muted">undecidable</span>',
    `<span class="q">${esc(r.question)}</span>`,
    `<div class="ids">${(r.matchedSubjects ?? r.matched.map((id) => ({ id, subject: '' })))
      .map((m) => `<div><code>${esc(m.id)}</code> ${esc(m.subject)}</div>`).join('')}</div>`,
    `<div class="ids"><div><code>${esc(r.captureId)}</code> ${esc(r.captureSubject)}</div>`
      + `<div class="anchors">${r.captureAnchors.map((a) => `<code>${esc(a)}</code>`).join(' ') || '<span class="muted">no anchors</span>'}</div>`
      + (r.why ? `<div class="muted">${esc(r.why)}</div>` : '') + '</div>',
    esc(r.session),
  ]);
  return `<section id="unhelpful">
    <h2>2 · Unhelpful answers — the misses the miss list cannot see</h2>
    <p class="lede">A miss is honest: the base says it holds nothing. This is the opposite —
      <code>state: "answer"</code>, ids returned, and not one of them any use. An ask is
      <strong>unhelpful</strong> when the same session later captures a fact whose anchors appear in
      <strong>none</strong> of that ask's matched rows. The base answered; the agent went and found
      out anyway.</p>
    <p class="metric">
      <strong>${esc(p.flagged.length)}</strong> unhelpful of <strong>${esc(p.decidable)}</strong> decidable
      = <strong class="${p.rate != null && p.rate > 0.15 ? 'bad' : ''}">${esc(pct(p.rate))}</strong>
      <span class="muted">(${esc(p.undecidable)} undecidable — the entry or the matched rows are not in the index snapshot)</span>
    </p>
    <p class="muted">The denominator is asks that were <em>followed by a capture in the same session</em>, not
      all asks: an ask nobody captured against is not evidence either way. PLAN §11 gates
      "ranking beyond token overlap" on a rate above ~15% — this panel measures it and decides nothing.</p>
    ${rows.length ? table(['verdict', 'question', 'what the base returned', 'what the agent captured instead', 'session'], rows)
    : empty('No ask in this window was followed by a capture in the same session, so there is nothing to judge. That is not a 0% rate — it is no measurement.')}
  </section>`;
}

function panelQuestions(p) {
  const rows = p.asked.map((q) => [
    `<b>${esc(q.count)}</b>`,
    esc(q.sessions),
    `<span class="q">${esc(q.question)}</span>`,
    Object.entries(q.states).map(([s, n]) => `<span class="state ${esc(s)}">${esc(s)}&nbsp;${esc(n)}</span>`).join(' '),
    q.medianMs == null ? '—' : `${esc(q.medianMs)}&nbsp;ms`,
  ]);
  const bySession = p.bySession.map((s) => `<span><code>${esc(s.session)}</code> ${esc(s.count)}</span>`).join('');
  return `<section id="questions">
    <h2>3 · Questions asked</h2>
    <p class="lede">What agents actually want — which §1 says cannot be guessed in advance, only observed.</p>
    ${bySession ? `<p class="tally">${bySession}</p>` : ''}
    ${rows.length ? table(['asked', 'sessions', 'question', 'outcome', 'median'], rows)
    : empty('No asks in this window.')}
  </section>`;
}

function panelEntries(p) {
  const used = p.used.map((e) => [
    `<code>${esc(e.id)}</code>`,
    esc(e.subject) || (e.inIndex ? '' : '<span class="muted">not in the index snapshot</span>'),
    esc(e.matched), esc(e.opened), esc(e.shown),
  ]);
  const never = p.never.map((e) => [`<code>${esc(e.id)}</code>`, esc(e.subject), esc(e.trust)]);
  return `<section id="entries">
    <h2>4 · Entries used, and never used</h2>
    <p class="lede">A never-served entry is either unfindable or worthless. The log names the
      candidates; it does not decide which — and an entry written yesterday cannot have been used
      last month, so read this against the window, not against the base.
      <strong>${esc(p.used.length)}</strong> of <strong>${esc(p.indexed)}</strong> indexed entries were served here.</p>
    ${used.length ? table(['id', 'subject', 'matched', 'opened', 'shown'], used) : empty('No entry was served in this window.')}
    <details><summary>${esc(p.never.length)} entry/entries never served in this window</summary>
      ${never.length ? table(['id', 'subject', 'trust'], never) : empty('Every indexed entry was served at least once.')}
    </details>
  </section>`;
}

function panelEvidence(p) {
  const rows = p.rows.map((r) => [
    `<code>${esc(r.id)}</code>`,
    esc(r.subject),
    esc(r.confirms),
    r.disputes ? `<span class="bad">${esc(r.disputes)}</span>` : '0',
    r.deployments.map((d) => `<code>${esc(d)}</code>`).join(' '),
    r.saw.map((s) => `<div>${esc(s)}</div>`).join(''),
  ]);
  return `<section id="evidence">
    <h2>5 · Confirmations and disputes</h2>
    <p class="lede">Where a fact was seen to hold again, and where it did not.
      <strong>${esc(p.confirms)}</strong> confirmation(s), <strong>${esc(p.disputes)}</strong> dispute(s).
      ${p.contested.length ? `<strong class="bad">${p.contested.length} entry/entries are contested</strong> — confirmed and disputed both. A disputed entry with four confirmations is the single most decision-worthy row in this report.` : ''}</p>
    ${rows.length ? table(['id', 'subject', 'confirms', 'disputes', 'deployments', 'saw instead'], rows)
    : empty('Nobody confirmed or disputed anything in this window. Not "everything holds" — nobody checked.')}
  </section>`;
}

function panelRefusals(p) {
  const rows = p.rows.map((r) => [
    `<span class="q">${esc(r.subject)}</span>`,
    `<code>${esc(r.dupeOf)}</code> ${esc(r.dupeSubject)}`,
    esc(r.why), esc(r.when), esc(r.session), `<code>${esc(when(r.at))}</code>`,
  ]);
  return `<section id="refusals">
    <h2>6 · Refused captures — ranking misses that did not become duplicates</h2>
    <p class="lede">A rising count is not a problem: it is the identity guard working, <em>and</em> a
      direct measure of how often <code>ask</code> fails to find something the base already holds.
      The agent looked, did not find it, went and found out, and only the write caught the duplicate.
      <strong>${esc(p.total)}</strong> refusal(s).</p>
    ${p.repeatTargets.length ? `<p class="metric">Repeatedly re-discovered: ${p.repeatTargets.map((t) => `<code>${esc(t.id)}</code>&nbsp;×${esc(t.count)} <span class="muted">${esc(t.subject)}</span>`).join(' · ')}</p>` : ''}
    ${rows.length ? table(['what was written', 'refused against', 'why', 'caught at', 'session', 'when'], rows)
    : empty('No capture was refused as a duplicate in this window.')}
  </section>`;
}

const CSS = `
:root{--fg:#1c1c1c;--dim:#6a6a6a;--line:#e0ddd8;--bg:#fbfaf8;--card:#fff;--bad:#a4262c;--accent:#2f5d50}
*{box-sizing:border-box}
body{margin:0;padding:28px 20px 80px;background:var(--bg);color:var(--fg);
  font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
main{max-width:1180px;margin:0 auto}
h1{font-size:22px;margin:0 0 6px;letter-spacing:-.2px}
h2{font-size:16px;margin:0 0 8px;letter-spacing:-.1px}
header{margin-bottom:26px;padding-bottom:18px;border-bottom:2px solid var(--line)}
.sub{margin:0;color:var(--dim);font-size:13px}
.lede{margin:0 0 12px;color:#3d3d3d;font-size:13.5px;max-width:80ch}
.metric{margin:0 0 8px;font-size:14px}
.muted,.empty{color:var(--dim)}
.empty{font-size:13px;font-style:italic;margin:8px 0 0}
.bad{color:var(--bad)}
section{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:18px 20px;margin:0 0 20px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
th{text-align:left;font-weight:600;color:var(--dim);font-size:11px;letter-spacing:.06em;
  text-transform:uppercase;border-bottom:1px solid var(--line);padding:0 10px 6px 0}
td{padding:8px 10px 8px 0;border-bottom:1px solid #f1efec;vertical-align:top}
tr:last-child td{border-bottom:none}
code{font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;background:#f2f0ec;
  padding:1px 5px;border-radius:3px}
.q{max-width:52ch;display:inline-block}
.ids div{margin-bottom:3px}
.anchors code{background:#e8f0ec}
.tally{margin:10px 0 0;font-size:12px;color:var(--dim);display:flex;flex-wrap:wrap;gap:14px}
.tally b{color:var(--fg)}
.notes{margin:10px 0 0;padding-left:18px;font-size:12.5px;color:var(--bad)}
.state{font-size:11px;padding:1px 6px;border-radius:9px;background:#eef1ef;white-space:nowrap}
.state.miss{background:#fbe9e9;color:var(--bad)}
.state.unreachable{background:#f6efe2;color:#8a5a00}
.verdict-block{border-left:5px solid var(--accent)}
.verdict{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.05em;white-space:nowrap;
  padding:2px 8px;border-radius:10px;background:#eef1ef;color:var(--dim)}
.verdict.ok{background:#e4efe9;color:var(--accent)}
.verdict.bad{background:#fbe9e9;color:var(--bad)}
.verdict.nodata{background:#f3efe4;color:#7a6320}
.banner{background:#fdf3e0;border:1px solid #e2c489;border-left:5px solid #c98a12;
  border-radius:6px;padding:12px 16px;margin:0 0 22px;font-size:13.5px;display:grid;gap:5px}
.banner.bad{background:#fbeaea;border-color:#e0a9ac;border-left-color:var(--bad)}
.spark{display:flex;gap:4px;align-items:flex-end;margin:12px 0 0;height:44px}
.day{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px}
.day i{display:block;width:16px;background:var(--accent);border-radius:2px 2px 0 0}
.day b{font-size:9px;color:var(--dim);font-weight:400}
details{margin-top:14px}
summary{cursor:pointer;font-size:13px;color:var(--dim)}
footer{color:var(--dim);font-size:12px;text-align:center;margin-top:28px;max-width:80ch;
  margin-left:auto;margin-right:auto}
`;

/** The whole page. Deterministic given `report` — the tests assert on the string. */
export function renderHtml(report) {
  NOTHING_READ = Boolean(report.meta?.fromCache && report.meta?.cacheEmpty);
  const p = report.panels;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>kb report — ${esc(when(report.meta.at))}</title>
<style>${CSS}</style></head>
<body><main>
${banner(report.meta)}
${header(report)}
${verdictBlock(report.verdict)}
${panelMisses(p.misses)}
${panelNearMisses(p.nearMisses)}
${panelUnhelpful(p.unhelpful)}
${panelQuestions(p.questions)}
${panelEntries(p.entries)}
${panelEvidence(p.evidence)}
${panelRefusals(p.refusals)}
<footer>Read from the base's <code>log/</code> over the network, analysed locally, rendered here.
Nothing was written to the base and nothing was written into the repository tree.</footer>
</main></body></html>`;
}

/** The terminal summary — what the operator sees without opening anything. */
export function renderText(report) {
  const p = report.panels;
  const out = [];
  const m = report.meta;
  if (m.fromCache) {
    out.push(m.cacheEmpty
      ? `! the base could not be read and the cache is empty (${m.failure}) — this is NOT "no activity"`
      : `! the base could not be read (${m.failure}) — rendered from cache, newest record ${when(m.newestCached)}`);
  }
  // THE SCOPE IS PART OF THE NUMBER. A line headed "last 30 days" over a report that actually
  // read three named sessions is a figure nobody can reproduce -- PLAN §15.2.
  const scope = m.sessions?.length
    ? `${m.sessions.length} named session(s): ${m.sessions.join(", ")}`
    : `last ${m.days} days`;
  out.push(`${m.files ?? 0} log file(s), ${report.sessions} session(s), ${p.questions.totalAsks} ask(s), ${scope}`
    + (m.synthetic ? `  [+${m.synthetic} synthetic line(s)${m.syntheticAsks ? `, ${m.syntheticAsks} ask(s)` : ''} excluded]` : ''));
  out.push(`  misses         ${p.misses.ranked.length} distinct (${p.misses.total} asks)${p.misses.unreachable ? `, ${p.misses.unreachable} unreachable` : ''}`);
  out.push(`  near misses    ${p.nearMisses.rows.length} rejected candidate(s); `
    + `${p.nearMisses.inBand.length} at coverage >= ${p.nearMisses.review}`
    + `${p.nearMisses.rows.length ? `, top ${p.nearMisses.rows[0].coverage.toFixed(2)}` : ''}`);
  out.push(`  unhelpful      ${p.unhelpful.flagged.length}/${p.unhelpful.decidable} decidable = ${pct(p.unhelpful.rate)} (${p.unhelpful.undecidable} undecidable)`);
  out.push(`  entries served ${p.entries.used.length} of ${p.entries.indexed} indexed; ${p.entries.never.length} never served here`);
  out.push(`  evidence       ${p.evidence.confirms} confirm, ${p.evidence.disputes} dispute, ${p.evidence.contested.length} contested`);
  out.push(`  refusals       ${p.refusals.total}`);
  out.push(`  loop           ${p.loop.afterMiss} capture(s) after a miss, ${p.loop.afterAnswer} after an answer`
    + `${p.loop.unlinked ? `, ${p.loop.unlinked} carrying no after-pointer to link` : ''}`);
  if (report.verdict) {
    // The counts above are a summary; the GATE is these three rows, so they print in full. An
    // operator who never opens the HTML still sees exactly what PLAN §15 will be judged on.
    out.push('');
    out.push(`§15 acceptance — ${report.verdict.pass} pass, ${report.verdict.fail} fail, `
      + `${report.verdict.noData} not enough data`);
    for (const r of report.verdict.rows) {
      out.push(`  ${r.state.padEnd(15)} ${r.threshold}  [n=${r.n}]`);
      out.push(`  ${''.padEnd(15)} ${r.detail}`);
    }
  }
  return out.join('\n');
}
