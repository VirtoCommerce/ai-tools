#!/usr/bin/env node
/*
 * publish_metric.mjs — Redis PUBLISH and search-backend call volume inside an L2 load window,
 * normalized per iteration, from an `aspire otel spans <resource> --follow --format Json` capture.
 * Node only, no dependencies.
 *
 * WHAT IT ANSWERS
 *   "Did this change actually reduce the cache-invalidation storm / the number of searches, and how
 *   much wall time do they really occupy?" — the two questions a raw span count answers wrongly.
 *
 * UNION, NEVER SUM
 *   Fire-and-forget calls overlap heavily. Measured on one backend: Redis PUBLISH was 55% of all
 *   spans but the union of merged intervals was 1-2.5% of the window, while the naive sum was ~35x
 *   larger. Span count and duration-sum are both non-metrics under overlap; only the union of merged
 *   intervals is a share of wall time.
 *
 * THE WINDOW IS A GUESS UNLESS YOU PIN IT
 *   The capture holds more than one run (`--follow` replays the dashboard ring buffer). The window is
 *   derived by clustering server spans on idle gaps — but reps driven back-to-back with no sleep land
 *   inside the gap and MERGE, which inflates the headline per-iteration figure with no warning
 *   (measured: two 30 s reps 20 s apart reported 2x). The block count is always printed; when reps
 *   run close together, pin the window with --since/--until.
 *
 * DENORMALISE BEFORE CLAIMING A WIN
 *   A per-iteration figure moves with BOTH numerator and denominator. Measured: PUBLISH/iteration
 *   halved while publishes/second rose 16% — the "win" was throughput, not less work. Read the
 *   absolute in-window count and the window length alongside the ratio, both of which are printed.
 *
 * USAGE
 *   node perftools/publish_metric.mjs <spans.json> <iterations> [--search-host <substr>]
 *                                     [--idle-gap <ms>] [--since <iso>] [--until <iso>]
 *
 *   <iterations>     metrics.iterations.values.count from the k6 summary (note the `.values.` level)
 *   --search-host    substring matching the search backend's span destination (default `elastic`)
 *
 * Both sides of an A/B MUST be measured with this same script and the same flags.
 */

import fs from 'node:fs';
import readline from 'node:readline';
import { deriveWindow, describeWindow, parseWindowFlags } from './_window.mjs';

let windowOpts, rest;
try { ({ rest, windowOpts } = parseWindowFlags(process.argv.slice(2))); }
catch (e) { console.error(e.message); process.exit(1); }

const positional = [];
let searchHost = 'elastic';
for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--search-host') { searchHost = rest[++i]; }
    else { positional.push(rest[i]); }
}
const [file, iterArg] = positional;

if (!file || iterArg === undefined) {
    console.error('usage: node publish_metric.mjs <spans.json> <iterations> [--search-host <substr>]');
    console.error('                               [--idle-gap <ms>] [--since <iso>] [--until <iso>]');
    process.exit(1);
}
if (searchHost === undefined) {
    console.error('--search-host needs a value');
    process.exit(1);
}
const iterations = Number(iterArg);
// Unvalidated, this silently yields `NaN /iteration` — and the classic way to get here is reading
// `metrics.iterations.count` instead of `metrics.iterations.values.count`, which is `undefined`.
if (!Number.isFinite(iterations) || iterations <= 0) {
    console.error(`iterations must be a positive number, got \`${iterArg}\`.`);
    console.error('it is metrics.iterations.values.count in the k6 summary — note the `.values.` level.');
    process.exit(1);
}
if (!fs.existsSync(file)) {
    console.error(`capture not found: ${file}`);
    process.exit(1);
}

const spans = { pub: [], server: [], search: [] };

const rl = readline.createInterface({ input: fs.createReadStream(file) });
rl.on('line', line => {
    if (!line.trim()) { return; }
    let arr;
    try { arr = JSON.parse(line); } catch { return; }
    if (!Array.isArray(arr)) { return; }
    for (const s of arr) {
        const st = Date.parse(s.timestamp);
        if (!Number.isFinite(st)) { continue; }
        // Coerce: a string durationMs would string-concatenate and produce an absurd union.
        const dur = Number(s.durationMs);
        const en = st + (Number.isFinite(dur) ? dur : 0);
        if (s.name === 'PUBLISH') { spans.pub.push([st, en]); }
        // Health probes and the dashboard run for the whole capture, so including them would stretch
        // the window far past the k6 run and dilute the per-iteration figure with background-job
        // activity. Only load-bearing request spans define the window.
        if (s.kind === 'Server' && !/health|\{controller=/i.test(s.name)) { spans.server.push({ start: st, end: en }); }
        if ((s.destination || '').includes(searchHost) && s.name === 'search') { spans.search.push([st, en]); }
    }
});

// Merged-interval total: summing overlapping span durations counts the same wall clock many times
// over (2560 fire-and-forget publishes inside one 7 ms window sum to ~44 s).
function union(intervals) {
    if (!intervals.length) { return 0; }
    const iv = intervals.slice().sort((a, b) => a[0] - b[0]);
    let total = 0;
    let [curStart, curEnd] = iv[0];
    for (let i = 1; i < iv.length; i++) {
        const [s, e] = iv[i];
        if (s <= curEnd) { curEnd = Math.max(curEnd, e); }
        else { total += curEnd - curStart; curStart = s; curEnd = e; }
    }

    return total + curEnd - curStart;
}

// Contiguous runs of publishes; a gap this large separates distinct invalidation episodes.
const BURST_GAP_MS = 50;
function bursts(intervals) {
    if (!intervals.length) { return []; }
    const starts = intervals.map(x => x[0]).sort((a, b) => a - b);
    const out = [];
    let n = 1;
    for (let i = 1; i < starts.length; i++) {
        if (starts[i] - starts[i - 1] <= BURST_GAP_MS) { n++; }
        else { out.push(n); n = 1; }
    }
    out.push(n);

    return out.sort((a, b) => b - a);
}

rl.on('close', () => {
    const win = deriveWindow(spans.server, windowOpts);
    if (!win) {
        console.error('no HTTP server spans - cannot establish the load window');
        process.exit(2);
    }
    const inWindow = iv => iv.filter(([s]) => s >= win.start && s <= win.end);
    const windowMs = win.end - win.start;

    const pub = inWindow(spans.pub);
    const search = inWindow(spans.search);
    const b = bursts(pub);
    const big = b.filter(x => x >= 100);
    const pubUnion = union(pub);
    const searchUnion = union(search);

    console.log(describeWindow(win) + `   iterations: ${iterations}`);
    console.log(`PUBLISH  in-window: ${pub.length}  (${(pub.length / iterations).toFixed(1)} /iteration)`);
    console.log(`  union wall      : ${(pubUnion / 1000).toFixed(1)}s  (${(100 * pubUnion / windowMs).toFixed(2)}% of window)`);
    console.log(`  bursts >=100    : ${big.length}  carrying ${(100 * big.reduce((a, c) => a + c, 0) / (pub.length || 1)).toFixed(1)}% of publishes`);
    console.log(`  top burst sizes : ${b.length ? b.slice(0, 8).join(', ') : '(none)'}`);
    console.log(`search   in-window: ${search.length}  (${(search.length / iterations).toFixed(1)} /iteration)  [host ~ ${searchHost}]`);
    console.log(`  union wall      : ${(searchUnion / 1000).toFixed(1)}s  (${(100 * searchUnion / windowMs).toFixed(2)}% of window)`);
    if (!search.length) {
        console.log('  (0 matched - check --search-host against the `destination` field in the capture)');
    }
});
