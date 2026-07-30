#!/usr/bin/env node
/*
 * parse_rep.mjs — reduce one k6 `summary.json` to the digest an A/B is actually compared on:
 * iterations, rate, iteration duration (med/p95/avg), per-operation p95/med/count, and any custom
 * counters the scenario defines. Node only, no dependencies.
 *
 * WHY A DIGEST
 *   A k6 summary is large enough that reading it inline costs more attention than the three numbers
 *   a comparison turns on, and eyeballing two summaries side by side is how a rep that ended early
 *   gets mistaken for a fast one.
 *
 * THE `.values.` LEVEL
 *   Iteration count is `metrics.iterations.values.count`, not `metrics.iterations.count`. Reading the
 *   shallower path yields `undefined`, which silently becomes 0 in most arithmetic and turns a
 *   per-iteration figure into a division by zero or an infinity.
 *
 * SECONDS, NOT MILLISECONDS
 *   k6 reports durations in ms. This prints seconds, matching how load baselines are usually recorded.
 *
 * ABSENT IS NOT ZERO
 *   Custom counters (`orders_ok`, `orders_failed`, …) are defined by the SCENARIO, so a scenario that
 *   does not define one is not a scenario that scored zero. Absent counters are omitted rather than
 *   reported as 0 — a 0 here would read as "the run placed no orders" when it means "this scenario
 *   places no orders".
 *
 * USAGE
 *   node loadtests/tools/parse_rep.mjs <summary.json>
 *
 * Both sides of an A/B must be reduced with this same script.
 */

import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
    console.error('usage: node parse_rep.mjs <summary.json>');
    process.exit(1);
}
if (!fs.existsSync(file)) {
    console.error(`summary not found: ${file}`);
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const m = data.metrics || {};

function v(name, field) {
    return m[name] && m[name].values && m[name].values[field];
}

function msToS(x) {
    return x != null ? Math.round((x / 1000) * 100) / 100 : null;
}

const OP_PREFIX = 'http_req_duration{name:';
const ops = {};
for (const key of Object.keys(m)) {
    if (!key.startsWith(OP_PREFIX)) { continue; }
    const op = key.slice(OP_PREFIX.length, -1);
    ops[op] = {
        p95: msToS(m[key].values['p(95)']),
        med: msToS(m[key].values['med']),
        count: m[key].values['count'],
    };
}

// Every counter the scenario declared, rather than a hardcoded list — a scenario's own counters are
// the only place its domain-level success criterion (orders placed, carts cleared) is recorded.
// k6's own built-in counters are excluded by name: they are transport bookkeeping, and leaving them
// in buries the one or two metrics that carry the scenario's meaning.
// Matched on the BASE name: k6 emits tagged submetrics as `name{tag:value}`, so an exact-match set
// lets `iterations{scenario:x}` and `data_sent{group::setup}` through as if they were the
// scenario's own. Name-based is the only mechanism available — the summary JSON does not flag which
// metrics are built in.
const K6_BUILTIN_COUNTERS = new Set([
    'data_sent', 'data_received', 'dropped_iterations', 'iterations', 'checks_total',
]);
const K6_BUILTIN_PREFIXES = ['http_', 'ws_', 'grpc_'];
const counters = {};
for (const [name, metric] of Object.entries(m)) {
    if (metric.type !== 'counter') { continue; }
    const base = name.replace(/\{.*$/, '');
    if (K6_BUILTIN_PREFIXES.some(p => base.startsWith(p)) || K6_BUILTIN_COUNTERS.has(base)) { continue; }
    counters[name] = metric.values && metric.values.count;
}

const out = {
    file,
    iters: v('iterations', 'count') ?? 0,
    rate: v('iterations', 'rate') ?? 0,
    iter_dur: {
        med: msToS(v('iteration_duration', 'med')),
        p95: msToS(v('iteration_duration', 'p(95)')),
        avg: msToS(v('iteration_duration', 'avg')),
    },
    counters,
    ops,
};

console.log(JSON.stringify(out, null, 2));
