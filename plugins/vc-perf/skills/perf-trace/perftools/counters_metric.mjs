#!/usr/bin/env node
/*
 * counters_metric.mjs — per-operation report of in-process counters a module emits as attributes on
 * each request's own span, read from an `aspire otel spans <resource> --follow --format Json` capture.
 * Node only, no dependencies.
 *
 * WHAT IT ANSWERS
 *   "How many times per request does this operation build a validation context / load products /
 *   clone the cart?" — the half of the L3 question `op_attrib` structurally cannot answer, because
 *   work that never leaves the process emits no client span to attribute.
 *
 * WHY IT IS NOT SUBJECT TO THE 1-VU RULE
 *   `op_attrib` attributes downstream calls by TIME CONTAINMENT, which is only valid when request
 *   intervals do not overlap. These counters ride on the request's own server span, so reading them
 *   is a group-by, not an attribution — it stays correct under concurrency.
 *
 * IT IS SUBJECT TO THE WINDOW RULE
 *   The capture is not one run: `--follow` replays the dashboard ring buffer, so previous runs are in
 *   the file. Spans are therefore restricted to one load window (see `_window.mjs`) — without it an
 *   A-build and a B-build replayed together pool into one row with no signal that they did.
 *
 * WHAT THE EMITTING SIDE MUST GET RIGHT
 *   The module must tag the REQUEST's activity, not `Activity.Current`. On a backend with
 *   Application Insights enabled, `Activity.Current` inside a request is a parentless
 *   `Microsoft.ApplicationInsights.OperationContext` — Internal, unrecorded, never exported, and the
 *   ASP.NET activity is not reachable from its parent chain either. Tags written there are dropped
 *   silently and completely. The ASP.NET-side source of truth is
 *   `HttpContext.Features.Get<IHttpActivityFeature>()?.Activity`. Symptom of getting this wrong:
 *   this tool reports "no server spans carry an attribute with prefix X" on a run you know emitted them.
 *
 * DISTRIBUTION, NOT AVERAGE
 *   The counts are exact integers per request, so the interesting figure is the spread. A counter
 *   that is constant across every request is a FIXED cost per invocation; one that tracks input size
 *   is a PER-ITEM multiplier. Averaging the two together hides exactly that distinction — the
 *   cheapest discriminator available for "is this per-item or batched?", and it costs one run rather
 *   than one reading of the source. So min/median/max is printed and a varying counter marked.
 *
 * COUNT IS NOT COST
 *   A high count is a lead, never a finding. Pair it with a duration (a `<prefix>time.*` attribute
 *   accumulated by the emitting side) before ranking anything: measured on one VC backend, a
 *   cart-to-order conversion ran 9-18x per request and cost 0.1-0.5% of request time.
 *
 * USAGE
 *   node perftools/counters_metric.mjs <spans.json> --prefix <p> [--idle-gap <ms>] [--since <iso>] [--until <iso>]
 *
 *   <spans.json>  `aspire otel spans <resource> --follow --format Json` output (one JSON array per line)
 *   --prefix      attribute-name prefix the module emits, e.g. `opus.`. REQUIRED and deliberately has
 *                 no default: a wrong-but-plausible default would report an empty table, which is
 *                 indistinguishable from "the code under test emitted nothing".
 *   --idle-gap    seconds-scale gap (ms) that separates runs; default 60000. Back-to-back reps with
 *                 no sleep between them merge into one window — pin them with --since/--until.
 *   --since/--until  explicit ISO window bounds, honoured verbatim instead of the heuristic.
 *
 *   Attributes whose name continues `time.` after the prefix are treated as accumulated milliseconds
 *   rather than exact counts.
 */

import fs from 'node:fs';
import readline from 'node:readline';
import { deriveWindow, describeWindow, parseWindowFlags } from './_window.mjs';

let windowOpts, rest;
try { ({ rest, windowOpts } = parseWindowFlags(process.argv.slice(2))); }
catch (e) { console.error(e.message); process.exit(1); }

const positional = [];
let prefix = null;
for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--prefix') { prefix = rest[++i]; }
    else { positional.push(rest[i]); }
}
const [file] = positional;

if (!file || prefix === null || prefix === undefined) {
    console.error('usage: node counters_metric.mjs <spans.json> --prefix <p> [--idle-gap <ms>] [--since <iso>] [--until <iso>]');
    console.error('  e.g. node counters_metric.mjs spans.json --prefix opus.');
    process.exit(1);
}
if (!fs.existsSync(file)) {
    console.error(`capture not found: ${file}`);
    process.exit(1);
}

// Requests are self-labelled by the harness `OP_TAG=1` knob appending `?op=<name>`; the runtime
// records it as `url.query`. Unlabelled requests are kept under `(unlabelled)` rather than dropped,
// so a run with OP_TAG unset reports totals instead of silently reporting nothing.
const OP_RE = /(?:^|[?&])op=([^&]*)/;

// Two passes over one file: the window is defined by ALL server spans, but only counter-bearing ones
// are reported — deriving the window from the latter would let a build that emits no counters at all
// define an empty window and mask itself.
const serverSpans = [];
const bearing = [];
let nonNumeric = 0;

const rl = readline.createInterface({ input: fs.createReadStream(file) });
rl.on('line', line => {
    if (!line.trim()) { return; }
    let arr;
    try { arr = JSON.parse(line); } catch { return; }
    if (!Array.isArray(arr)) { return; }
    for (const s of arr) {
        if (s.kind !== 'Server') { continue; }
        const start = Date.parse(s.timestamp);
        const dur = Number(s.durationMs);
        serverSpans.push({ start, end: start + (Number.isFinite(dur) ? dur : 0) });

        const a = s.attributes || {};
        const keys = Object.keys(a).filter(k => k.startsWith(prefix));
        if (keys.length) { bearing.push({ start, attributes: a, keys }); }
    }
});

function median(values) {
    const v = values.slice().sort((a, b) => a - b);
    const mid = v.length >> 1;

    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// Not Math.min(...v): spreading a large sample overflows the call stack (verified at ~130k), and the
// header advertises this tool as usable under concurrency, which invites exactly that volume.
function extent(values) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const x of values) {
        if (x < lo) { lo = x; }
        if (x > hi) { hi = x; }
    }

    return [lo, hi];
}

function timeRounder(lo, hi) {
    for (const decimals of [1, 2, 3]) {
        const f = 10 ** decimals;
        if (lo === hi || Math.round(lo * f) !== Math.round(hi * f)) {
            return x => Math.round(x * f) / f;
        }
    }

    return x => Math.round(x * 1000) / 1000;
}

rl.on('close', () => {
    if (!bearing.length) {
        console.error(`no server spans carry an attribute with prefix \`${prefix}\`.`);
        console.error('either the build under test predates the counters, the capture missed the load,');
        console.error('or the emitting code tagged Activity.Current instead of IHttpActivityFeature.');
        process.exit(2);
    }

    const win = deriveWindow(serverSpans, windowOpts);
    const inWindow = bearing.filter(s => s.start >= win.start && s.start <= win.end);
    if (!inWindow.length) {
        console.error('no counter-bearing request falls inside the derived load window.');
        console.error(describeWindow(win));
        console.error('pin the window explicitly with --since/--until if the heuristic picked the wrong block.');
        process.exit(2);
    }

    const byOp = new Map();
    let labelled = 0;
    for (const s of inWindow) {
        const m = OP_RE.exec(s.attributes['url.query'] || '');
        if (m) { labelled++; }
        const op = m ? decodeURIComponent(m[1]) : '(unlabelled)';
        if (!byOp.has(op)) { byOp.set(op, { requests: 0, counters: new Map() }); }
        const entry = byOp.get(op);
        entry.requests++;
        for (const key of s.keys) {
            const raw = Number(s.attributes[key]);
            // A non-numeric value is NOT a measured zero — the legend below promises that a printed
            // number is a real measurement, so an unparseable one is dropped and counted instead.
            if (!Number.isFinite(raw)) { nonNumeric++; continue; }
            const short = key.slice(prefix.length);
            if (!entry.counters.has(short)) { entry.counters.set(short, []); }
            entry.counters.get(short).push(raw);
        }
    }

    console.log(describeWindow(win));
    if (bearing.length !== inWindow.length) {
        console.log(`note: ${bearing.length - inWindow.length} counter-bearing requests outside the window were excluded.`);
    }
    // A run where nothing is labelled produces output identical in shape to a correct one, so say it
    // loudly — and on stderr, so a redirected report table does not swallow it.
    if (!labelled) {
        console.error(`WARNING: 0 of ${inWindow.length} counter-bearing requests carry an \`op=\` label.`);
        console.error('  set OP_TAG=1 for the run, or this runtime does not record `url.query` on server spans.');
    }
    if (nonNumeric) {
        console.error(`WARNING: ${nonNumeric} attribute values were not numeric and were dropped, not counted as 0.`);
    }

    // A counter that never fires on an operation is absent from that operation's spans, not zero —
    // printing it as 0 would claim a measurement that was never taken.
    const allCounters = [...new Set([...byOp.values()].flatMap(e => [...e.counters.keys()]))].sort();
    // Column width from the longest label: a fixed pad silently concatenates header cells and every
    // column after the overflow stops sitting above its data.
    const OP_W = Math.max(12, ...[...byOp.keys()].map(o => o.length)) + 2;
    const N_W = 6;
    const widths = allCounters.map(c => Math.max(c.length, 16) + 2);

    console.log('');
    console.log(`counters (per request), prefix \`${prefix}\``);
    console.log('op'.padEnd(OP_W) + 'n'.padEnd(N_W) + allCounters.map((c, i) => c.padEnd(widths[i])).join(''));

    for (const [op, entry] of [...byOp.entries()].sort((a, b) => b[1].requests - a[1].requests)) {
        const cells = allCounters.map((c, i) => {
            const v = entry.counters.get(c);
            if (!v) { return '-'.padEnd(widths[i]); }
            const [lo, hi] = extent(v);
            // Decide variance on RAW values, then round only for display: rounding first turns a
            // genuinely varying timing (0.31 vs 0.34) into a "fixed cost per invocation".
            const varies = lo !== hi;
            // ...and pick the precision that keeps the printed bounds distinct, so a varying counter
            // does not render as `0.3 [0.3..0.3] *`, which reads as a broken tool rather than a
            // narrow spread.
            const round = c.startsWith('time.') ? timeRounder(lo, hi) : (x => x);
            const cell = varies
                ? `${round(median(v))} [${round(lo)}..${round(hi)}] *`
                : String(round(lo));

            return cell.padEnd(widths[i]);
        });
        console.log(op.padEnd(OP_W) + String(entry.requests).padEnd(N_W) + cells.join(''));
    }

    console.log('');
    console.log('* = varies across requests (median [min..max]); a constant is a fixed cost per invocation.');
    console.log('- = the counter never fired on this operation (absent, not measured as zero).');
    console.log('`time.*` counters are accumulated milliseconds; the rest are exact counts.');
});
