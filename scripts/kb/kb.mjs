#!/usr/bin/env node
// `npm run kb -- <verb>` -- the CLI door onto the knowledge base (PLAN §4).
//
// Two doors, one module. The MCP server is the primary door (it reaches subagents, where this
// repo's work actually happens); this one is load-bearing for three things MCP cannot do:
// `.mcp.json` is gitignored, so the server does not reach a clone until an operator registers it,
// while `package.json` is tracked and this works on every clone with zero setup; the report, the
// log flush and the unit tests run in a shell, where no MCP client exists; and CI has no MCP
// client at all.
//
// EXIT CODES (PLAN §3.5). 0 answered · 1 the base was read and holds nothing · 2 no base
// configured · 3 could not reach it. The distinction between 1 and 3 is the whole point: the first
// is work to do, the second is a retry, and an agent that confuses them invents facts.
//
// `capture` adds one more use of 1: a capture REFUSED as a duplicate. It is the same shape of
// signal -- the base was read, and there is something for you to do about it (read, then confirm
// or dispute) -- and 0 would say "queued", which it was not.

import { openBase } from './core/base.mjs';
import { EXIT, HEADLINE, exitFor } from './core/exits.mjs';
import { flush, sweepIfDue } from './core/push.mjs';
import { pushConfirmRequired, queueDir } from './core/queue.mjs';
import { resolveWho } from './core/who.mjs';
import { writeToken } from './core/token.mjs';
import { askLines, captureLines, evidenceLines, showLines } from './core/render.mjs';
import { TOPIC_MAX, ask, capture, confirm, dispute, reindex, show, stat } from './core/verbs.mjs';

// ── argument parsing ──────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { _: [], flags: {}, repeated: { anchor: [], scope: [] } };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    const name = (eq === -1 ? a.slice(2) : a.slice(2, eq));
    const value = eq === -1 ? (argv[i + 1]?.startsWith('--') ? true : argv[++i] ?? true) : a.slice(eq + 1);
    if (name in out.repeated) out.repeated[name].push(String(value));
    else out.flags[name] = value;
  }
  return out;
}

const USAGE = `kb — the knowledge base (PLAN v1)

  npm run kb -- ask "<question>" [--deployment <env>] [--topic "<what you're working on>"]
                                 [--base <dir>] [--top 3] [--json]
  npm run kb -- show KB-XXXXXXXX [--topic "<...>"] [--base <dir>] [--json]
  npm run kb -- capture --subject "<one line>" --question "<the question it answers>"
                        --claim "<the claim, in prose>" --deployment <env>
                        --anchor /company/members [--anchor ...] --scope surface=storefront-ui [--scope ...]
                        [--topic "<...>"]
  npm run kb -- confirm KB-XXXXXXXX --deployment <env> [--note "<what you saw>"] [--topic "<...>"]
  npm run kb -- dispute KB-XXXXXXXX --deployment <env> --saw "<what you saw instead>" [--topic "<...>"]
  npm run kb -- stat [--base <dir>]
  npm run kb -- reindex --base <dir> [--dry-run]     repair: rebuild index.json from every entry
  npm run kb -- push [--dry-run] [--no-sweep]        send the queue to the base as ONE commit

exit: 0 answered · 1 no coverage (or capture refused as a duplicate) · 2 no base · 3 unreachable

capture / confirm / dispute QUEUE their change locally. Nothing is sent by those commands.
\`push\` sends everything queued — this session's lines plus any idle file left by an earlier one —
as one atomic commit. \`--dry-run\` shows exactly what would be written and sends nothing.

Every invocation also sweeps IDLE queue files left behind by earlier sessions, at most every 30
minutes, silently and without affecting the exit code. That sweep is why a failed push needs no
hook and no scheduler: the next session picks it up.

--topic is a short ENGLISH noun phrase for what the work is -- "configurable product checkout" --
so a window of the log can be read by what it was about rather than by whose session it was. Cut at
${TOPIC_MAX} characters. KB_RUN=<handle> in the environment stamps every line this session writes
with an opaque run handle (a ticket, a PR, a branch); it is never parsed, and it is an env var and
not a flag so that it reaches the MCP server too.`;

// ── printing ──────────────────────────────────────────────────────────────────────────────────

const out = (s = '') => process.stdout.write(`${s}\n`);

/** Every verb's human output comes from `core/render.mjs`, which the MCP server also uses. */
const emit = (lines) => { for (const line of lines) out(line); };

// ── verbs ─────────────────────────────────────────────────────────────────────────────────────

/**
 * WHICH DOOR THIS IS, stamped on every line this process writes (PLAN §7).
 *
 * PLAN §4 claims the CLI is load-bearing for three things MCP cannot do. That is an argument, not a
 * measurement, and two doors are twice the surface to keep working -- so the log records which one
 * was actually used, and a month of lines says whether the CLI is carrying real traffic or has
 * quietly become test and CI infrastructure only.
 */
const VIA = 'cli';

/** Set by `main` once the base is resolved; read by the post-answer sweep. */
let sweepBase = null;

async function main(argv) {
  const args = parseArgs(argv);
  const verb = args._[0];
  if (!verb || args.flags.help) { out(USAGE); return verb ? EXIT.ANSWER : EXIT.NO_BASE; }

  // WHO THIS PROCESS IS, resolved ONCE and before any verb runs, so the first line of a cold
  // machine carries an identity like every line after it. Everything downstream reads the cache
  // this fills, synchronously and off the filesystem — the network is touched here or nowhere.
  //
  // It is awaited rather than fired and forgotten: a handle that arrives after the lines it was
  // meant for is a handle nobody can use. The cost is bounded twice over — `WHO_TIMEOUT_MS`, and
  // a cache shared by every session on the machine, so it is one call per token per week and
  // nothing at all for the sweeps. A lookup that fails costs the line its `who` and costs the
  // verb nothing, which is the trade this whole field is written under.
  await resolveWho({ dir: queueDir() });

  const json = Boolean(args.flags.json);
  const opened = openBase({ baseArg: args.flags.base ? String(args.flags.base) : null });
  // The sweep targets THE BASE THIS INVOCATION READ, never the default: a run pointed at a local
  // fixture must not push fixture-derived lines to the public base, and the cheapest way to
  // guarantee that is to hand the sweep the same locator the verb used.
  sweepBase = opened.locator;

  if (verb === 'stat') {
    const r = await stat(opened);
    if (json) { out(JSON.stringify(r, null, 2)); return exitFor(r.state); }
    out(`base      ${r.base}`);
    out(`chosen by ${r.how}`);
    out(`reader    ${r.reader ?? `none — ${r.readerWhy}`}`);
    out(`session   ${r.session}`);
    // The one place an operator can ask "what will my lines say about me?" before writing any.
    out(`who       ${r.who ?? 'none — no write token, or the lookup has not succeeded here'}`);
    out(`queue     ${r.queue}  (${r.queueDepth} line(s), ${r.pending} pending change(s)`
      + `${r.malformedQueueLines ? `, ${r.malformedQueueLines} malformed` : ''})`);
    if (r.backlog?.lines) {
      const age = r.backlog.oldest ? Math.round((Date.now() - Date.parse(r.backlog.oldest)) / 60000) : null;
      out(`backlog   ${r.backlog.lines} line(s) in ${r.backlog.files} queue file(s)${age === null ? '' : `, oldest ${age} min old`}`);
    }
    const p = r.push ?? {};
    out(`last push ${p.last ? `${p.last.state} at ${p.last.at}${p.last.commit ? ` ${p.last.commit.slice(0, 7)}` : ''}${p.last.why ? ` — ${p.last.why}` : ''}` : 'none recorded on this machine'}`);
    // Sticky until a push LANDS: a later "nothing to do" must not hide that the queue never drained.
    if (p.lastFailure && p.lastFailure.at !== p.last?.at) out(`  FAILED  ${p.lastFailure.state} at ${p.lastFailure.at}${p.lastFailure.why ? ` — ${p.lastFailure.why}` : ''}`);
    if (r.state === 'answer') out(`index     ${r.entries} entr(ies), ${r.active} active, from ${r.indexes.join(', ')}`);
    else out(`index     ${r.state} — ${r.why}`);
    return exitFor(r.state);
  }

  if (verb === 'reindex') {
    // The repair verb the drift messages name. It REPORTS what moved rather than only succeeding:
    // a row that vanished is either the drift being fixed or an entry that stopped parsing, and
    // only the operator can tell those apart.
    const r = await reindex(opened, { write: !args.flags['dry-run'] });
    if (json) { out(JSON.stringify(r, null, 2)); return exitFor(r.state); }
    if (r.state !== 'answer') { out(`kb reindex: ${HEADLINE[r.state] ?? r.state}`); if (r.why) out(`  ${r.why}`); return exitFor(r.state); }
    out(`kb reindex: ${r.wrote ? 'rebuilt' : 'would rebuild'} ${r.written.map((w) => `${w.file} (${w.count})`).join(', ')}`);
    out(`  ${r.entries} entr(ies) read from ${opened.locator}`);
    if (r.added.length) out(`  + ${r.added.length} not previously indexed: ${r.added.join(', ')}`);
    if (r.removed.length) out(`  - ${r.removed.length} indexed but not present: ${r.removed.join(', ')}`);
    for (const t of r.retrusted) out(`  ~ ${t.id} trust ${t.was} → ${t.now}`);
    for (const p of r.problems) out(`  ! ${p.path} — ${p.why}`);
    // A problem is not a crash, and it is not "no coverage" either. The index was rebuilt; some
    // entries could not be put in it, and the operator has to look. Exit 1 is the "there is work
    // for you" code, which is exactly what this is.
    return r.problems.length ? EXIT.NO_COVERAGE : EXIT.ANSWER;
  }

  if (verb === 'ask') {
    const question = args._.slice(1).join(' ').trim();
    if (!question) { out('ask needs a question'); return EXIT.NO_COVERAGE; }
    // `--deployment` is OPTIONAL on ask and is never derived -- see `stand()` in core/verbs.mjs
    // for why this door has no authoritative source to derive it from either.
    const r = await ask(question, opened, {
      top: Number(args.flags.top) || 3, via: VIA, deployment: args.flags.deployment, topic: args.flags.topic,
    });
    if (json) { out(JSON.stringify(r, null, 2)); return exitFor(r.state); }
    emit(askLines(r));
    return exitFor(r.state);
  }

  if (verb === 'show') {
    const id = args._[1];
    if (!id) { out('show needs an id'); return EXIT.NO_COVERAGE; }
    const r = await show(id, opened, { via: VIA, topic: args.flags.topic });
    if (json) { out(JSON.stringify(r, null, 2)); return exitFor(r.state); }
    emit(showLines(r));
    return exitFor(r.state);
  }

  if (verb === 'capture') {
    const r = await capture({
      subject: args.flags.subject, question: args.flags.question, claim: args.flags.claim,
      deployment: args.flags.deployment, method: args.flags.method,
      anchors: args.repeated.anchor, scope: args.repeated.scope,
    }, opened, { via: VIA, topic: args.flags.topic });
    if (json) out(JSON.stringify(r, null, 2));
    else emit(captureLines(r));
    // A refusal is not a failure -- it is the design working (the ranking missed an entry that
    // exists, and instead of a duplicate the base gets a confirmation) -- but it is not a queued
    // capture either, and 0 would say it was.
    if (r.state === 'invalid' || r.state === 'refused') return EXIT.NO_COVERAGE;
    return r.state === 'queued' ? EXIT.ANSWER : r.state === 'disabled' ? EXIT.NO_BASE : exitFor(r.state);
  }

  if (verb === 'confirm' || verb === 'dispute') {
    const fn = verb === 'confirm' ? confirm : dispute;
    const r = await fn(args._[1], {
      deployment: args.flags.deployment, note: args.flags.note, saw: args.flags.saw, method: args.flags.method,
    }, opened, { via: VIA, topic: args.flags.topic });
    if (json) out(JSON.stringify(r, null, 2));
    else emit(evidenceLines(verb, r));
    if (r.state === 'invalid') return EXIT.NO_COVERAGE;
    return r.state === 'queued' ? EXIT.ANSWER : r.state === 'disabled' ? EXIT.NO_BASE : exitFor(r.state);
  }

  if (verb === 'push' || verb === 'flush') {
    // The one verb that sends anything. Everything else in this CLI is local.
    const { token, from } = writeToken();
    // KB_PUSH_CONFIRM=1: a terminal is the one place a person can say yes, so only there is a gate
    // offered. Anywhere else (the hook's detached child, a pipe) there is no gate and the push HOLDS.
    const gate = pushConfirmRequired() && process.stdin.isTTY ? confirmPlan : null;
    const r = await flush({
      base: opened.locator,
      token,
      dryRun: Boolean(args.flags['dry-run']),
      sweep: !args.flags['no-sweep'],
      gate,
    });
    if (json) { out(JSON.stringify(r, null, 2)); }
    else if (r.state === 'pushed') {
      out(`kb push: ${r.commit.slice(0, 7)} on ${opened.locator}`);
      out(`  parent ${r.parent.slice(0, 7)}, ${r.attempts} attempt(s), token from ${from}`);
      for (const w of r.plan.writes) out(`  + ${w.path}  (${w.text.length} B)`);
      for (const d of r.plan.deletions) out(`  - ${d}  (retention)`);
      if (r.converted) out(`  ${r.converted} queued capture(s) converted to confirm at push time`);
      if (r.dropped) out(`  ${r.dropped} line(s) dropped by the secret gate`);
      for (const p of r.problems ?? []) out(`  ! ${p.id ?? ''} ${p.why}`);
    } else if (r.state === 'dry-run') {
      out(`kb push (dry run): would commit on parent ${r.plan.parent.slice(0, 7)}`);
      out(`  message: ${r.plan.message}`);
      for (const w of r.plan.writes) out(`  + ${w.path}  (${w.text.length} B)`);
      for (const d of r.plan.deletions) out(`  - ${d}  (retention)`);
      if (r.plan.converted) out(`  ${r.plan.converted} queued capture(s) would convert to confirm`);
      for (const p of r.plan.problems ?? []) out(`  ! ${p.id ?? ''} ${p.why}`);
      out('  nothing was sent.');
    } else {
      out(`kb push: ${r.state} — ${r.why ?? ''}`);
      if (r.state === 'failed') out('  the queue is intact; the next session sweeps it.');
    }
    return r.state === 'pushed' || r.state === 'nothing' || r.state === 'dry-run' ? EXIT.ANSWER
      : r.state === 'no-base' || r.state === 'foreign-base' || r.state === 'disabled' || r.state === 'held' ? EXIT.NO_BASE
        : r.state === 'failed' ? EXIT.UNREACHABLE : EXIT.NO_COVERAGE;
  }

  out(`unknown verb: ${verb}`);
  out('');
  out(USAGE);
  return EXIT.NO_BASE;
}

/**
 * Show the exact commit and ask. Everything that would be written is listed with its size, and the
 * entry BODIES are printed in full: they are the free prose the gate cannot judge, and the reason
 * this mode exists.
 */
async function confirmPlan(plan) {
  const { createInterface } = await import('node:readline/promises');
  const say = (s) => process.stdout.write(`${s}\n`);
  say(`kb push: about to commit on ${plan.parent.slice(0, 7)} — ${plan.message}`);
  for (const w of plan.writes) {
    say(`  + ${w.path}  (${w.text.length} B)`);
    if (/(^|\/)entries\//.test(w.path)) say(w.text.replace(/^/gm, '    | '));
  }
  for (const d of plan.deletions) say(`  - ${d}  (retention)`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return /^y(es)?$/i.test((await rl.question('publish this to the PUBLIC base? [y/N] ')).trim()); } finally { rl.close(); }
}

/**
 * The answer is delivered first; the sweep happens after, and cannot change the exit code.
 *
 * This is the whole retry mechanism (PLAN §7): a push that failed is picked up by the next `kb`
 * invocation, with no hook and no `.claude/settings.json` edit — which keeps the riskiest file in
 * the repo out of this design entirely.
 */
async function sweep() {
  try {
    if (!sweepBase) return;
    await sweepIfDue({ base: sweepBase, token: writeToken().token });
  } catch { /* best effort, always: a sweep that broke an `ask` would be a bad trade */ }
}

main(process.argv.slice(2)).then(async (code) => {
  process.exitCode = code;
  await sweep();
}, (err) => {
  // A genuine crash is not one of the four states -- it must not be mistaken for any of them, and
  // least of all for "the base holds nothing".
  process.stderr.write(`kb: ${err?.stack ?? err}\n`);
  process.exitCode = EXIT.UNREACHABLE;
});
