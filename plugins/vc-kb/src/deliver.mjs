// `deliver` — the consumer side of the door.
//
// `ask` is the diagnostic verb: it renders everything a reader needs to judge an entry. `deliver`
// is what a consumer actually injects, and the difference matters. A consumer pastes what it is
// given, so what it is given must be short, must carry the citation id, must state the trust level
// inline rather than in a field the consumer might drop, and must make a MISS impossible to
// mistake for an answer.
//
// The one thing this must never do is render a MISS as empty. An empty string reads as "the base
// had nothing to say about that", which is indistinguishable from "the base was not consulted" and
// from "the base is down" — and those three call for three different behaviours from the caller.

import { ask } from './resolve.mjs';

const MISS_HEADER = 'KB MISS';

export function deliver(base, question, { limit = 2 } = {}) {
  const res = ask(base, question, { limit });

  if (res.miss) {
    const reason = res.degraded
      ? `the base could not be read (${res.degraded.reason})`
      : 'the base holds no entry matching a content term of this question';
    return {
      hit: false,
      degraded: res.degraded ?? null,
      question,
      citations: [],
      block:
        `${MISS_HEADER}: ${reason}.\n` +
        (res.degraded
          ? 'This is an infrastructure answer, not a coverage answer — do not record it as a gap.\n'
          : 'Proceed from primary sources. If you learn the answer, record it with `kb capture`.\n'),
      contract: res,
    };
  }

  const lines = [];
  for (const r of res.results) {
    const trust = r.trust.level === 'top'
      ? 'derived from the deployment contract'
      : `${r.trust.level}, ${r.trust.confirmations} observation(s)${r.trust.axes.length ? `, scoped to ${r.trust.axes.join(', ')}` : ''}`;
    lines.push(`@kb(${r.id}) ${r.subject} — ${trust}`);
    if (r.observedElsewhere) {
      lines.push(`  OBSERVED ELSEWHERE: on ${r.observedElsewhere.observedOn.join(', ')}, not on ${r.observedElsewhere.reference}, which is what this base describes.`);
    }
    if (r.disputed) {
      lines.push(`  DISPUTED (${r.disputed.count}): ${r.disputed.notes.map((d) => d.note).filter(Boolean).join(' | ') || 'see the entry'}`);
    }
    lines.push(r.body.trim().split('\n').map((l) => `  ${l}`).join('\n'));
    lines.push('');
  }

  // A RULE IS NOT AN OBSERVATION, AND A CONSUMER PASTES WHAT IT IS GIVEN.
  //
  // `ask` has served the normative plane in a block of its own since the rules landed. `deliver`
  // did not, and still read `res.results[0]` unconditionally -- so a question that only the rules
  // answered threw `Cannot read properties of undefined`, and because `kb capture` calls this on
  // the way in, the fact the writer had just typed went down with it. Measured 2026-09-18: three
  // of eight ordinary questions, with `npm run kb:test` 323/323 green the whole time.
  //
  // Merging them into the ranked list above is the other way to be wrong. A rule says what SHOULD
  // happen; an observation says what somebody SAW. A consumer that cannot tell them apart will
  // quote a rule as evidence, and where the two disagree that disagreement is the finding this
  // plane exists to surface.
  const rules = res.rules ?? [];
  if (rules.length) {
    if (res.results.length) lines.push('');
    lines.push(`WHAT THE RULES REQUIRE (${rules.length}) — asserted here, NOT observed on this deployment:`);
    lines.push('');
    for (const r of rules) {
      lines.push(`@kb(${r.id}) ${r.subject} — normative, asserted`);
      lines.push(r.body.trim().split('\n').map((l) => `  ${l}`).join('\n'));
      lines.push('');
    }
  }
  lines.push(`-- ${(res.results[0] ?? rules[0]).protocol}`);

  return {
    hit: true,
    degraded: null,
    question,
    citations: [...res.results, ...rules].map((r) => ({
      id: r.id,
      plane: r.plane,
      trust: r.trust.level,
      confirmations: r.trust.confirmations,
      disputed: Boolean(r.disputed),
      path: r.path,
    })),
    block: lines.join('\n'),
    contract: res,
  };
}
