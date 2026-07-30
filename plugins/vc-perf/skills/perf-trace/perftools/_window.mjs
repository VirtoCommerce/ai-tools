/*
 * _window.mjs — shared load-window derivation for the span-capture readers.
 *
 * WHY SHARED
 *   An `aspire otel spans --follow` capture is NOT one run. It replays the dashboard's ring-buffer
 *   history, so it routinely holds previous runs, warm-up probing and idle background work —
 *   measured 35 minutes of capture around a 7 minute run. Any reader that pools the whole file
 *   reports a mix of runs as if it were one.
 *
 *   This lived in `publish_metric` only, and `counters_metric` shipped without it: on a real capture
 *   it pooled two runs of the same build and reported n=30/26/24 where the run had made 24/19/18.
 *   Two readers of one format must not disagree about what "the run" is, so the logic lives here.
 *
 * HOW
 *   HTTP server spans exist only while traffic is driven, so they define the run. They are clustered
 *   on idle gaps and the busiest cluster is taken.
 *
 * THE GAP IS A GUESS, AND IT CAN MERGE REPS
 *   Back-to-back reps with no sleep between them land closer together than the idle gap and merge
 *   into one window — silently, because a merged window is one cluster and the multi-block note does
 *   not fire. Measured: two 30 s reps 20 s apart reported 2x the true per-iteration figure. So:
 *   the block count is ALWAYS reported (not only when >1), the gap is tunable, and `since`/`until`
 *   let a caller who knows the boundaries pin them instead of guessing.
 */

export const DEFAULT_IDLE_GAP_MS = 60_000;

/**
 * @param spans array of { start, end } for HTTP server spans (end = start + duration)
 * @param opts  { idleGapMs, since, until } — since/until are epoch ms, or null
 * @returns { start, end, blocks, chosenRequests, pinned } or null when there is nothing to derive from
 */
export function deriveWindow(spans, opts = {}) {
    const idleGapMs = opts.idleGapMs ?? DEFAULT_IDLE_GAP_MS;
    const since = opts.since ?? null;
    const until = opts.until ?? null;

    const usable = spans.filter(s => Number.isFinite(s.start));
    if (!usable.length) { return null; }

    // An explicit window is always honoured verbatim — the caller knows the rep boundaries and the
    // heuristic does not.
    if (since !== null || until !== null) {
        const inRange = usable.filter(s =>
            (since === null || s.start >= since) && (until === null || s.start <= until));

        return {
            start: since ?? Math.min(...inRange.map(s => s.start)),
            end: until ?? maxEnd(inRange),
            blocks: 1,
            chosenRequests: inRange.length,
            pinned: true,
        };
    }

    const sorted = usable.slice().sort((a, b) => a.start - b.start);
    const clusters = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
        const cur = clusters[clusters.length - 1];
        if (sorted[i].start - cur[cur.length - 1].start <= idleGapMs) { cur.push(sorted[i]); }
        else { clusters.push([sorted[i]]); }
    }
    const chosen = clusters.slice().sort((a, b) => b.length - a.length)[0];

    return {
        start: chosen[0].start,
        // End at the last request's END, not its start: trailing fire-and-forget work (the very
        // invalidation behaviour these tools measure) happens after the final request begins, and
        // ending at the start silently drops it.
        end: maxEnd(chosen),
        blocks: clusters.length,
        chosenRequests: chosen.length,
        pinned: false,
    };
}

function maxEnd(spans) {
    let max = -Infinity;
    for (const s of spans) {
        const e = Number.isFinite(s.end) ? s.end : s.start;
        if (e > max) { max = e; }
    }

    return max;
}

/** Shared `--idle-gap` / `--since` / `--until` parsing, so both readers spell them the same way. */
export function parseWindowFlags(args) {
    const rest = [];
    const opts = { idleGapMs: DEFAULT_IDLE_GAP_MS, since: null, until: null };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--idle-gap') { opts.idleGapMs = Number(args[++i]); }
        else if (args[i] === '--since') { opts.since = Date.parse(args[++i]); }
        else if (args[i] === '--until') { opts.until = Date.parse(args[++i]); }
        else { rest.push(args[i]); }
    }
    for (const [name, value] of [['--idle-gap', opts.idleGapMs], ['--since', opts.since], ['--until', opts.until]]) {
        if (value !== null && !Number.isFinite(value)) {
            throw new Error(`${name} needs a value (ms for --idle-gap, an ISO timestamp for --since/--until)`);
        }
    }

    return { rest, windowOpts: opts };
}

/** One-line window banner, identical in both tools so two reports can be compared by eye. */
export function describeWindow(win) {
    const secs = ((win.end - win.start) / 1000).toFixed(0);
    const how = win.pinned ? 'pinned via --since/--until' : `${win.blocks} activity block(s) in capture, using the busiest`;

    return `load window       : ${secs}s  (${win.chosenRequests} requests; ${how})`;
}
