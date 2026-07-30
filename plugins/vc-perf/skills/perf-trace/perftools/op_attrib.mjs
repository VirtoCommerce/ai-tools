#!/usr/bin/env node
/*
 * op_attrib.mjs — attribute backend work to the GraphQL operation that caused it, from an
 * `aspire otel spans <resource> --follow --format Json` capture. Node only, no dependencies.
 *
 * WHAT IT ANSWERS
 *   "getFullCart costs 630 ms — of which how much is Elasticsearch, SQL, Redis, outbound HTTP,
 *   and how much is in-process work with nothing to blame?" and "how many searches/queries does
 *   ONE request of each operation issue?" That is the L3 question the in-process counters would
 *   otherwise be written by hand to answer, with no code change and no rebuild.
 *
 * WHY NOT GROUP BY traceId
 *   Because on a VC backend it does not work. Measured 2026-07-26: every `POST /graphql` server
 *   span was ALONE in its trace (152 of 152, trace size 1) — trace context is not propagated
 *   from the ASP.NET request into the downstream ES / SQL / Redis client spans, which start their
 *   own roots. Grouping by traceId therefore attributes exactly nothing.
 *   Sharper trap: a "root = the longest span with no parent inside the trace" fallback produces a
 *   table that LOOKS like per-request attribution and is not — the root it picks is a client span.
 *   If a future runtime does propagate context, prefer parentage; verify before trusting it.
 *
 * HOW IT ATTRIBUTES INSTEAD — time containment
 *   Each HTTP server span gives an exact [start, start+duration] interval. Every client span is
 *   assigned to the request whose interval contains its start.
 *
 *   CORRECTNESS CONDITION: request intervals must not overlap — i.e. ONE virtual user
 *   (`PROFILE=smoke`). Under concurrency a span cannot be attributed to one of several in-flight
 *   requests. The script counts overlaps and refuses to print per-operation numbers when they are
 *   material, rather than emitting numbers that quietly mean nothing.
 *
 * OPERATION LABELS
 *   Every GraphQL operation POSTs to the same `/graphql` path, so the span alone cannot tell
 *   `getFullCart` from `createOrderFromCart`. Run the L2 harness with `OP_TAG=1`: it appends
 *   `?op=<name>`, which the ASP.NET Core instrumentation records as `url.query`. Without OP_TAG
 *   every GraphQL request collapses into one `/graphql` row.
 *
 * TIME IS UNIONED, NOT SUMMED
 *   Concurrent client calls inside one request would otherwise sum past the request's own
 *   duration. Union of merged intervals per backend keeps the shares honest — the same discipline
 *   that turned a "55% of spans are Redis PUBLISH" reading into its true 1-2.5% of wall time.
 *
 * BACKGROUND WORK IS SEPARATED
 *   Hangfire jobs (indexing, notifications) run inside request windows but are not caused by the
 *   request. Spans in a trace containing an `Internal | JOB *` span are reported separately.
 *
 * USAGE
 *   node op_attrib.mjs <spans.json> [--last] [--rows] [--max-overlap-pct N]
 *     --last              keep only the final activity cluster. `--follow` replays the dashboard
 *                         ring buffer, so a capture bracketing a 60 s run can hold 20+ minutes of
 *                         older requests. The fresh run is always last.
 *     --rows              print every request, not just the per-operation rollup.
 *     --max-overlap-pct   overlapping-request tolerance before refusing attribution (default 0).
 *                         Above 0 you are accepting ambiguous attribution — see the note above.
 */

// `.mjs`, not `.js`: the documented entry point is $pluginRoot — the per-version plugin CACHE dir,
// which has no ancestor package.json, so a `.js` file there is CommonJS and these imports throw
// `SyntaxError: Cannot use import statement outside a module`. It happens to load on Node >= 22.7
// (ESM syntax detection unflagged) and fails on Node 20 LTS. Sibling plugins get away with `.js`
// only because they ship their own package.json declaring "type": "module" — vc-perf ships none,
// so the extension has to carry it.
import fs from 'node:fs';
import readline from 'node:readline';
import process from 'node:process';

const args = process.argv.slice(2);
const file = args[0];
if (!file || file.startsWith('--')) {
    console.error('usage: node op_attrib.mjs <spans.json> [--last] [--rows] [--max-overlap-pct N]');
    process.exit(1);
}
// A bare `--flag` with no value, a non-numeric value, or the `--flag=N` form would all yield NaN,
// and every `x > NaN` comparison is false — which would SILENTLY disable the refusal gate below.
// Reject instead of defaulting: a disabled correctness gate must never be the quiet outcome.
const numArg = (name, dflt) => {
    let i = args.indexOf(name);
    let raw = i === -1 ? null : args[i + 1];
    if (i === -1) {
        const eq = args.find(a => a.startsWith(`${name}=`));
        if (!eq) { return dflt; }
        raw = eq.slice(name.length + 1);
        i = 0;
    }
    const n = Number(raw);
    if (raw === null || raw === undefined || raw === '' || !Number.isFinite(n)) {
        console.error(`${name} needs a numeric value (got ${raw === undefined ? 'nothing' : JSON.stringify(raw)})`);
        process.exit(1);
    }

    return n;
};
// Default 0: attribution by containment is only unambiguous when requests do not overlap. Raise it
// deliberately (and read the caveat in the header) if you accept ambiguity.
const maxOverlapPct = numArg('--max-overlap-pct', 0);

const spans = [];
const stream = fs.createReadStream(file);
// Without this, a missing/unreadable capture dies with an unhandled 'error' event and a stack trace.
stream.on('error', err => {
    console.error(`cannot read ${file}: ${err.message}`);
    process.exit(2);
});
const rl = readline.createInterface({ input: stream });
rl.on('line', line => {
    if (!line.trim()) { return; }
    let arr;
    try { arr = JSON.parse(line); } catch { return; }
    for (const s of arr) { spans.push(s); }
});

/*
 * Classify a client span into a backend bucket. Keyed on the OTel `db.system` attribute rather
 * than on span names or host/database names, which are deployment-specific.
 *
 * This also solves ES double-counting for free: the Elasticsearch client emits BOTH a logical
 * span (`search`, `bulk`, carrying db.system=elasticsearch) AND the raw HTTP span for the same
 * call (`POST`/`GET`/`HEAD`, carrying NO db.system). Verified on a real capture: 934 bare `POST`
 * with no db.system beside 802 `search` with it. Counting both would inflate every search count.
 */
function classify(s, dbHosts) {
    const a = s.attributes || {};
    const sys = a['db.system'];

    // The raw HTTP leg of an instrumented datastore call carries no db.system, so the generic
    // "outbound HTTPS" rule below would count every Elasticsearch search a SECOND time as
    // third-party HTTP. Anything aimed at a host already seen carrying db.system is that leg.
    if (!sys && dbHosts.has(a['server.address'] || (s.destination || '').replace(/:\d+$/, ''))) {
        return null;
    }

    if (sys === 'elasticsearch') {
        let op = a['db.operation'] || s.name;
        const url = a['url.full'] || '';
        // The client reports the typed-keys search variant as db.operation=POST rather than
        // `search` (measured: 38 spans, all `/<index>/_search?typed_keys=true`). Splitting those
        // into a separate `es:POST` bucket UNDER-COUNTS searches for any faceted query — it made a
        // 3-search catalog request read as 1 search plus unexplained work. Classify by the endpoint.
        if (/\/_search\b/.test(url)) { op = 'search'; }
        // Those same spans also lack the index attribute, so fall back to the index segment of the
        // URL — otherwise identical searches land in two different columns.
        const idx = a['db.elasticsearch.path_parts.index']
            || (/^https?:\/\/[^/]+\/([^/?]+)\/_search\b/.exec(url)?.[1] ?? null);
        // Index names are environment-scoped (<org>-<env>-<...>-<entity>-<state>). Keep the last
        // two segments: specific enough to tell a product search from a member search, generic
        // across deployments.
        const tail = idx ? idx.split('-').slice(-2).join('-') : '';

        return op === 'search' && tail ? `es:search:${tail}` : `es:${op}`;
    }
    if (sys === 'redis') { return `redis:${a['db.statement'] || s.name}`; }
    if (sys) { return `sql:${a['db.name'] || sys}`; }             // mssql, postgresql, ...
    // Outbound HTTP: identified by the HTTP client semantics being present, NOT by port. Matching
    // only `:443` silently dropped every third-party call on any other port (a supplier API on
    // :8080), and its time then landed in `in-proc` — which is the documented trigger to escalate to
    // a CPU profile, so the misclassification actively misroutes the next diagnostic step.
    if (s.kind === 'Client' && (a['http.request.method'] || a['url.full'])) {
        const host = a['server.address'] || (s.destination || '').replace(/:\d+$/, '');

        return `http:${host || 'unknown'}`;
    }

    return null;
}

const med = xs => {
    if (!xs.length) { return 0; }
    const v = xs.slice().sort((a, b) => a - b);
    const m = Math.floor(v.length / 2);

    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Union of merged intervals: overlapping calls must not be counted twice.
const union = intervals => {
    if (!intervals || !intervals.length) { return 0; }
    const iv = intervals.slice().sort((a, b) => a[0] - b[0]);
    let total = 0;
    let [cs, ce] = iv[0];
    for (let i = 1; i < iv.length; i++) {
        const [s, e] = iv[i];
        if (s <= ce) { ce = Math.max(ce, e); } else { total += ce - cs; cs = s; ce = e; }
    }

    return total + ce - cs;
};

rl.on('close', () => {
    if (!spans.length) { console.error('no spans parsed'); process.exit(2); }

    const jobTraces = new Set();
    // Hosts that ever carry db.system — used to drop the uninstrumented HTTP leg of a datastore
    // call so it is not also billed as third-party HTTP.
    const dbHosts = new Set();
    for (const s of spans) {
        if (s.kind === 'Internal' && /^JOB /.test(s.name)) { jobTraces.add(s.traceId); }
        if (s.attributes?.['db.system']) {
            const h = s.attributes['server.address'] || (s.destination || '').replace(/:\d+$/, '');
            if (h) { dbHosts.add(h); }
        }
    }

    let requests = [];
    for (const s of spans) {
        if (s.kind !== 'Server') { continue; }
        const path = s.attributes?.['url.path'] || '';
        if (/health|alive|ready/i.test(path)) { continue; }        // probes, not load
        // `url.query` is recorded with a leading `?` by the runtime measured here, but the OTel spec
        // form omits it — anchor on either, or every row silently collapses to `/graphql`.
        const m = /(?:^|[?&])op=([^&]*)/.exec(s.attributes?.['url.query'] || '');
        const start = Date.parse(s.timestamp);
        requests.push({
            label: m ? decodeURIComponent(m[1]) : (path || s.name),
            labelled: Boolean(m),
            start,
            end: start + (s.durationMs || 0),
            ms: s.durationMs || 0,
            counts: new Map(),
            iv: {},
        });
    }
    requests.sort((a, b) => a.start - b.start);
    if (!requests.length) {
        console.error('no HTTP server spans — nothing to attribute work to');
        process.exit(2);
    }

    if (args.includes('--last')) {
        const IDLE_GAP_MS = 30_000;
        let cut = 0;
        for (let i = 1; i < requests.length; i++) {
            if (requests[i].start - requests[i - 1].end > IDLE_GAP_MS) { cut = i; }
        }
        if (cut) {
            console.log(`note: dropped ${cut} pre-window requests (ring-buffer replay); keeping the last cluster`);
            requests = requests.slice(cut);
        }
    }

    const winStart = requests[0].start;
    const winEnd = requests[requests.length - 1].end;

    /*
     * Two silent-garbage guards. Both failure modes produce a full, plausible-looking table:
     *  - no positive durations at all => the capture's duration field is named something else (the
     *    parser reads `durationMs`), and every ms column is 0 with NaN% shares;
     *  - no request carried an `op=` label => either the harness ran without OP_TAG=1, or this
     *    runtime does not record `url.query` (upstream ASP.NET Core has carried a "url.query is
     *    missing" note in some versions). Output is then byte-identical to a correct unlabelled run,
     *    so the operator cannot tell a forgotten flag from an unsupported attribute.
     */
    if (!requests.some(r => r.ms > 0)) {
        console.error('every request span has zero/absent duration — expected a `durationMs` field on each span.');
        console.error('The capture format does not match what this parser reads; numbers would be meaningless.');
        process.exit(4);
    }
    const labelled = requests.filter(r => r.labelled).length;
    if (!labelled) {
        console.log(`WARNING: 0 of ${requests.length} requests carried an "op=" label — every GraphQL`);
        console.log('  operation will be pooled under its URL path. Re-run the harness with OP_TAG=1;');
        console.log('  if it was already set, this runtime does not record `url.query` on server spans.');
    } else if (labelled < requests.length) {
        console.log(`note: ${labelled} of ${requests.length} requests carried an "op=" label`
            + ' (unlabelled ones — auth, REST — are pooled under their URL path).');
    }

    let overlaps = 0;
    for (let i = 1; i < requests.length; i++) {
        if (requests[i].start < requests[i - 1].end) { overlaps++; }
    }
    const overlapPct = 100 * overlaps / requests.length;
    console.log(`requests: ${requests.length}   window: ${((winEnd - winStart) / 1000).toFixed(1)}s   `
        + `overlapping: ${overlaps} (${overlapPct.toFixed(1)}%)`);
    if (overlapPct > maxOverlapPct) {
        console.error('\nREFUSING per-operation attribution: requests overlap, so a client span cannot be');
        console.error('assigned to one in-flight request. Re-capture at 1 VU (PROFILE=smoke).');
        process.exit(3);
    }

    /*
     * Innermost containing request. A binary search would be wrong here: it assumes monotonically
     * ordered, non-overlapping intervals, so with ANY overlap tolerated (--max-overlap-pct > 0) it
     * can walk past a request that genuinely contains the span and return null — the span then gets
     * filed under "outside every request interval", which reads as fire-and-forget work rather than
     * as the misattribution it is. Scan and keep the tightest enclosing interval instead: correct
     * regardless of overlap, and O(requests) per span is nothing at these sizes.
     */
    function findRequest(t) {
        let best = null;
        for (const r of requests) {
            if (t < r.start) { break; }                    // sorted by start: no later one can contain t
            if (t > r.end) { continue; }
            if (!best || (r.end - r.start) < (best.end - best.start)) { best = r; }
        }

        return best;
    }

    const outside = new Map();
    const jobWork = new Map();
    for (const s of spans) {
        const c = classify(s, dbHosts);
        if (!c) { continue; }
        const t = Date.parse(s.timestamp);
        if (t < winStart || t > winEnd) { continue; }
        if (jobTraces.has(s.traceId)) { jobWork.set(c, (jobWork.get(c) || 0) + 1); continue; }
        const r = findRequest(t);
        if (!r) { outside.set(c, (outside.get(c) || 0) + 1); continue; }
        r.counts.set(c, (r.counts.get(c) || 0) + 1);
        const grp = c.split(':')[0];
        if (!r.iv[grp]) { r.iv[grp] = []; }
        // CLIP to the request: a span that starts inside the request but outlives it (a
        // fire-and-forget continuation, or a span still open when the response was written) would
        // otherwise contribute its full duration and report more backend time than the request
        // lasted — e.g. a 10 ms request crediting 300 ms of ES.
        r.iv[grp].push([Math.max(t, r.start), Math.min(t + (s.durationMs || 0), r.end)]);
    }

    const get = (r, k) => r.counts.get(k) || 0;
    const pre = (r, p) => [...r.counts].filter(([k]) => k.startsWith(p)).reduce((a, [, v]) => a + v, 0);
    const esOf = r => pre(r, 'es:');
    const sqlOf = r => pre(r, 'sql:');
    const httpOf = r => pre(r, 'http:');
    const pubOf = r => pre(r, 'redis:PUBLISH');
    const LW = 26;
    const pad = (c, w = 8) => String(c).padStart(w);

    const byOp = new Map();
    for (const r of requests) {
        if (!byOp.has(r.label)) { byOp.set(r.label, []); }
        byOp.get(r.label).push(r);
    }
    const opRows = [...byOp.entries()]
        .map(([label, rs]) => ({ label, rs, totMs: rs.reduce((a, r) => a + r.ms, 0) }))
        .sort((a, b) => b.totMs - a.totMs);

    if (args.includes('--rows')) {
        console.log('\nper-request rows:');
        console.log('op'.padEnd(LW) + ['t+s', 'ms', 'ES', 'SQL', 'PUB', 'HTTP'].map(h => pad(h)).join(''));
        for (const r of requests) {
            console.log(r.label.slice(0, LW - 1).padEnd(LW)
                + [((r.start - winStart) / 1000).toFixed(1), r.ms, esOf(r), sqlOf(r), pubOf(r), httpOf(r)]
                    .map(c => pad(c)).join(''));
        }
    }

    console.log('\ncalls issued per request — MEDIAN (n = requests seen):');
    console.log('op'.padEnd(LW) + ['n', 'ms', 'ES', 'SQL', 'PUB', 'HTTP'].map(h => pad(h)).join(''));
    console.log('-'.repeat(LW + 48));
    for (const o of opRows) {
        console.log(o.label.slice(0, LW - 1).padEnd(LW) + [o.rs.length, med(o.rs.map(r => r.ms)),
            med(o.rs.map(esOf)), med(o.rs.map(sqlOf)), med(o.rs.map(pubOf)), med(o.rs.map(httpOf))]
            .map(c => pad(c)).join(''));
    }

    console.log('\nwhere the time goes — MEDIAN ms per request (union per backend):');
    console.log('op'.padEnd(LW) + ['n', 'total', 'ES', 'SQL', 'redis', 'http', 'in-proc']
        .map(h => pad(h)).join(''));
    console.log('-'.repeat(LW + 56));
    for (const o of opRows) {
        const t = med(o.rs.map(r => r.ms));
        // in-proc = duration minus the union of ALL its client work: CPU, lock waits, GC — the
        // part no downstream call explains. A large share here means the next step is a CPU
        // profile, not another call-count reduction.
        const inproc = med(o.rs.map(r => Math.max(0, r.ms - union([].concat(
            r.iv.es || [], r.iv.sql || [], r.iv.redis || [], r.iv.http || [])))));
        console.log(o.label.slice(0, LW - 1).padEnd(LW) + [o.rs.length, t,
            med(o.rs.map(r => union(r.iv.es))), med(o.rs.map(r => union(r.iv.sql))),
            med(o.rs.map(r => union(r.iv.redis))), med(o.rs.map(r => union(r.iv.http))), inproc]
            .map(c => pad(c)).join(''));
    }

    const totalMs = requests.reduce((a, r) => a + r.ms, 0);
    const windowMs = winEnd - winStart;
    // Guard the denominators rather than printing NaN%, and clamp idle at 0: with overlap tolerated,
    // summed request time can exceed the window, which would otherwise print a negative "idle".
    const pct = (num, den) => (den > 0 ? `${(100 * num / den).toFixed(1)}%` : 'n/a');
    console.log('\nshare of summed request time (at 1 VU requests are sequential, so this is wall share):');
    for (const o of opRows) {
        console.log(`  ${o.label.slice(0, LW - 1).padEnd(LW)}${(o.totMs / 1000).toFixed(1).padStart(7)}s`
            + `${pct(o.totMs, totalMs).padStart(8)}   n=${o.rs.length}`);
    }
    const idle = windowMs > 0 ? Math.max(0, 100 * (1 - totalMs / windowMs)).toFixed(0) : '-';
    console.log(`  ${'TOTAL'.padEnd(LW)}${(totalMs / 1000).toFixed(1).padStart(7)}s`
        + `   window ${(windowMs / 1000).toFixed(1)}s (idle ${idle}%)`
        + (totalMs > windowMs ? '  [summed > window: requests overlap]' : ''));

    // Which index each search hits: tells product-catalog load apart from member/order lookups.
    const esKeys = [...new Set(requests.flatMap(r => [...r.counts.keys()]))]
        .filter(k => k.startsWith('es:')).sort();
    if (esKeys.length) {
        console.log('\nES calls per request by target (MEAN):');
        console.log('op'.padEnd(LW) + esKeys.map(k => pad(k.replace(/^es:(search:)?/, ''), 14)).join(''));
        console.log('-'.repeat(LW + 14 * esKeys.length));
        for (const o of opRows) {
            console.log(o.label.slice(0, LW - 1).padEnd(LW) + esKeys.map(k => {
                const tot = o.rs.reduce((a, r) => a + (r.counts.get(k) || 0), 0);

                return pad(tot ? (tot / o.rs.length).toFixed(1) : '.', 14);
            }).join(''));
        }
    }

    const dump = (title, m) => {
        const tot = [...m.values()].reduce((a, c) => a + c, 0);
        if (!tot) { return; }
        console.log(`\n${title} (${tot} spans):`);
        [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
            .forEach(([k, v]) => console.log(`  ${String(v).padStart(6)}  ${k}`));
    };
    dump('background JOB work inside the window — NOT caused by the requests', jobWork);
    dump('in-window work outside every request interval (fire-and-forget / async continuations)', outside);
});
