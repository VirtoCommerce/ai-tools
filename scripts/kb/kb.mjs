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
import { ask, capture, confirm, dispute, show, stat } from './core/verbs.mjs';

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

  npm run kb -- ask "<question>" [--base <dir>] [--top 3] [--json]
  npm run kb -- show KB-XXXXXXXX [--base <dir>] [--json]
  npm run kb -- capture --subject "<one line>" --question "<the question it answers>"
                        --claim "<the claim, in prose>" --deployment <env>
                        --anchor /company/members [--anchor ...] --scope surface=storefront-ui [--scope ...]
  npm run kb -- confirm KB-XXXXXXXX --deployment <env> [--note "<what you saw>"]
  npm run kb -- dispute KB-XXXXXXXX --deployment <env> --saw "<what you saw instead>"
  npm run kb -- stat [--base <dir>]

exit: 0 answered · 1 no coverage (or capture refused as a duplicate) · 2 no base · 3 unreachable

capture / confirm / dispute QUEUE their change locally. Nothing is sent by this command.`;

// ── printing ──────────────────────────────────────────────────────────────────────────────────

const out = (s = '') => process.stdout.write(`${s}\n`);

/** The three things `cat` cannot print, printed (PLAN §3.1 step 4). */
function printHit(hit) {
  out('');
  out(`  ${hit.id}  [${hit.trust.label}]  ${hit.trust.confirmations} confirmation(s)`
    + `${hit.trust.provisional ? ' per the index, unverified — the body did not arrive' : ''}`
    + `${hit.trust.disputed ? `, ${hit.trust.disputed} DISPUTED` : ''}`
    + `${hit.trust.parties > 1 ? `, ${hit.trust.parties} independent parties` : ''}`);
  out(`  ${hit.subject}`);
  const matched = [
    hit.matchedOn.anchors.length ? `anchor ${hit.matchedOn.anchors.join(', ')}` : null,
    hit.matchedOn.tokens.length ? `words ${hit.matchedOn.tokens.join(' ')}` : null,
  ].filter(Boolean).join('; ');
  out(`  matched on: ${matched || '—'}   (score ${hit.score})`);
  if (hit.indexDrift) out(`  ! ${hit.indexDrift}`);
  if (hit.unavailable) { out(`  ! ${hit.unavailable}`); return; }
  for (const p of hit.provenance) {
    out(`  ${p.contradicts ? 'contradicted' : 'seen'} by ${p.by ?? '?'} on ${p.deployment ?? '?'}`
      + ` at ${p.at ?? '?'} (${p.method})${p.note ? ` — ${p.note}` : ''}`);
  }
  out('');
  for (const line of String(hit.body ?? '').split('\n')) out(`  | ${line}`);
}

// ── verbs ─────────────────────────────────────────────────────────────────────────────────────

async function main(argv) {
  const args = parseArgs(argv);
  const verb = args._[0];
  if (!verb || args.flags.help) { out(USAGE); return verb ? EXIT.ANSWER : EXIT.NO_BASE; }

  const json = Boolean(args.flags.json);
  const opened = openBase({ baseArg: args.flags.base ? String(args.flags.base) : null });

  if (verb === 'stat') {
    const r = await stat(opened);
    if (json) { out(JSON.stringify(r, null, 2)); return exitFor(r.state); }
    out(`base      ${r.base}`);
    out(`chosen by ${r.how}`);
    out(`reader    ${r.reader ?? `none — ${r.readerWhy}`}`);
    out(`session   ${r.session}`);
    out(`queue     ${r.queue}  (${r.queueDepth} line(s), ${r.pending} pending change(s)`
      + `${r.malformedQueueLines ? `, ${r.malformedQueueLines} malformed` : ''})`);
    if (r.state === 'answer') out(`index     ${r.entries} entr(ies), ${r.active} active, from ${r.indexes.join(', ')}`);
    else out(`index     ${r.state} — ${r.why}`);
    return exitFor(r.state);
  }

  if (verb === 'ask') {
    const question = args._.slice(1).join(' ').trim();
    if (!question) { out('ask needs a question'); return EXIT.NO_COVERAGE; }
    const r = await ask(question, opened, { top: Number(args.flags.top) || 3 });
    if (json) { out(JSON.stringify(r, null, 2)); return exitFor(r.state); }
    out(`kb ask: ${HEADLINE[r.state]}`);
    if (r.why) out(`  ${r.why}`);
    for (const hit of r.hits ?? []) printHit(hit);
    return exitFor(r.state);
  }

  if (verb === 'show') {
    const id = args._[1];
    if (!id) { out('show needs an id'); return EXIT.NO_COVERAGE; }
    const r = await show(id, opened);
    if (json) { out(JSON.stringify(r, null, 2)); return exitFor(r.state); }
    if (r.state !== 'answer') { out(`kb show: ${HEADLINE[r.state] ?? r.state}`); if (r.why) out(`  ${r.why}`); return exitFor(r.state); }
    out(`${r.entry.id}  [${r.trust.label}]  ${r.trust.confirmations} confirmation(s)`
      + `${r.trust.disputed ? `, ${r.trust.disputed} DISPUTED` : ''}   status: ${r.entry.status}`);
    out(`${r.entry.subject}`);
    out(`question: ${r.entry.question ?? '—'}`);
    out(`anchors:  ${(r.entry.anchors ?? []).map((a) => a.coordinate).join(', ')}`);
    out(`scope:    ${r.row.scope.join(', ')}`);
    for (const e of r.entry.evidence ?? []) {
      out(`  ${e.contradicts ? 'contradicted' : 'seen'} by ${e.by ?? '?'} on ${e.deployment ?? '?'} at ${e.at ?? '?'}`
        + `${e.note ? ` — ${e.note}` : ''}`);
    }
    out('');
    out(r.body);
    return EXIT.ANSWER;
  }

  if (verb === 'capture') {
    const r = await capture({
      subject: args.flags.subject, question: args.flags.question, claim: args.flags.claim,
      deployment: args.flags.deployment, method: args.flags.method,
      anchors: args.repeated.anchor, scope: args.repeated.scope,
    }, opened);
    if (json) { out(JSON.stringify(r, null, 2)); }
    if (r.state === 'invalid') {
      if (!json) { out(`kb capture: ${r.why}`); for (const p of r.problems ?? []) out(`  ${p.coordinate} — ${p.kind}: ${p.why}`); }
      return EXIT.NO_COVERAGE;
    }
    if (r.state === 'refused') {
      // A refusal is not a failure -- it is the design working. The ranking missed an entry that
      // exists, and instead of a duplicate the base gets a confirmation.
      if (!json) { out('kb capture: REFUSED — the base already holds this fact.'); out(''); out(`  ${r.message.split('\n').join('\n  ')}`); }
      return EXIT.NO_COVERAGE;
    }
    if (r.state !== 'queued') { if (!json) { out(`kb capture: ${HEADLINE[r.state] ?? r.state}`); if (r.why) out(`  ${r.why}`); } return exitFor(r.state); }
    if (!json) {
      out(`kb capture: queued ${r.id} — ${r.entry.subject}`);
      out(`  ${r.queuedTo}`);
      out('  nothing has been sent; it ships with the next push.');
      for (const n of r.alsoHere ?? []) out(`  also anchored at ${n.coordinate}: ${n.id} — ${n.subject}`);
    }
    return EXIT.ANSWER;
  }

  if (verb === 'confirm' || verb === 'dispute') {
    const fn = verb === 'confirm' ? confirm : dispute;
    const r = await fn(args._[1], {
      deployment: args.flags.deployment, note: args.flags.note, saw: args.flags.saw, method: args.flags.method,
    }, opened);
    if (json) { out(JSON.stringify(r, null, 2)); return r.state === 'queued' ? EXIT.ANSWER : r.state === 'invalid' ? EXIT.NO_COVERAGE : exitFor(r.state); }
    if (r.state === 'invalid') { out(`kb ${verb}: ${r.why}`); return EXIT.NO_COVERAGE; }
    if (r.state !== 'queued') { out(`kb ${verb}: ${HEADLINE[r.state] ?? r.state}`); if (r.why) out(`  ${r.why}`); return exitFor(r.state); }
    out(`kb ${verb}: queued on ${r.id} (${r.row.subject})`);
    out(`  ${r.queuedTo}`);
    out('  nothing has been sent; it ships with the next push.');
    return EXIT.ANSWER;
  }

  out(`unknown verb: ${verb}`);
  out('');
  out(USAGE);
  return EXIT.NO_BASE;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
  // A genuine crash is not one of the four states -- it must not be mistaken for any of them, and
  // least of all for "the base holds nothing".
  process.stderr.write(`kb: ${err?.stack ?? err}\n`);
  process.exitCode = EXIT.UNREACHABLE;
});
