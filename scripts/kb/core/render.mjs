// What a verb's result LOOKS LIKE, in one place, because there are two doors onto it.
//
// The CLI prints these lines to a terminal; the MCP server joins them into the `text` content of a
// `tools/call` result. Neither formats anything itself. That is not tidiness: the three things this
// renderer prints -- the trust label, the confirmation count and the per-observation provenance --
// are exactly what `cat` cannot print and what the bypass measurement (PLAN §1.4) is about, so an
// agent reaching the base through the OTHER door must not silently get less. Two renderers would
// drift apart on precisely the fields that justify the tool existing.
//
// Every function returns an ARRAY OF LINES rather than a string. The CLI writes them one at a time
// and the server joins them; neither has to guess where the newlines were meant to be.

import { HEADLINE } from './exits.mjs';

/** The three things `cat` cannot print, printed (PLAN §3.1 step 4). */
export function hitLines(hit) {
  const lines = [''];
  lines.push(`  ${hit.id}  [${hit.trust.label}]  ${hit.trust.confirmations} confirmation(s)`
    + `${hit.trust.provisional ? ' per the index, unverified — the body did not arrive' : ''}`
    + `${hit.trust.disputed ? `, ${hit.trust.disputed} DISPUTED` : ''}`
    + `${hit.trust.parties > 1 ? `, ${hit.trust.parties} independent parties` : ''}`);
  lines.push(`  ${hit.subject}`);
  const matched = [
    hit.matchedOn.anchors.length ? `anchor ${hit.matchedOn.anchors.join(', ')}` : null,
    hit.matchedOn.tokens.length ? `words ${hit.matchedOn.tokens.join(' ')}` : null,
  ].filter(Boolean).join('; ');
  lines.push(`  matched on: ${matched || '—'}   (score ${hit.score})`);
  if (hit.indexDrift) lines.push(`  ! ${hit.indexDrift}`);
  if (hit.unavailable) { lines.push(`  ! ${hit.unavailable}`); return lines; }
  for (const p of hit.provenance) {
    lines.push(`  ${p.contradicts ? 'contradicted' : 'seen'} by ${p.by ?? '?'} on ${p.deployment ?? '?'}`
      + ` at ${p.at ?? '?'} (${p.method})${p.note ? ` — ${p.note}` : ''}`);
  }
  lines.push('');
  for (const line of String(hit.body ?? '').split('\n')) lines.push(`  | ${line}`);
  return lines;
}

export function askLines(r, { prefix = 'kb ask' } = {}) {
  const lines = [`${prefix}: ${HEADLINE[r.state] ?? r.state}`];
  if (r.why) lines.push(`  ${r.why}`);
  // A MISS SAYS THE BASE WAS RANKED, NOT MERELY THAT IT WAS EMPTY -- and it does NOT hand back the
  // near-miss id. The near-miss is diagnostic, written to the log for whoever is judging the floor
  // (PLAN §7); giving it to the agent would put a rejected entry in front of exactly the reader
  // most likely to use it anyway, which is the confident-wrong-answer this floor exists to stop.
  // The COUNT is safe and is worth saying: it distinguishes "read, and nothing came close" from
  // "read, and something came close but did not clear the bar".
  if (r.state === 'miss' && r.nearMiss) {
    lines.push(`  the closest candidate scored ${r.nearMiss.score} and did not clear the floor`
      + ` (it matched ${Math.round(r.nearMiss.coverage * 100)}% of your question's words, and no anchor).`);
  }
  for (const hit of r.hits ?? []) lines.push(...hitLines(hit));
  return lines;
}

export function showLines(r, { prefix = 'kb show' } = {}) {
  if (r.state !== 'answer') {
    const lines = [`${prefix}: ${HEADLINE[r.state] ?? r.state}`];
    if (r.why) lines.push(`  ${r.why}`);
    return lines;
  }
  const lines = [
    `${r.entry.id}  [${r.trust.label}]  ${r.trust.confirmations} confirmation(s)`
      + `${r.trust.disputed ? `, ${r.trust.disputed} DISPUTED` : ''}   status: ${r.entry.status}`,
    `${r.entry.subject}`,
    `question: ${r.entry.question ?? '—'}`,
    `anchors:  ${(r.entry.anchors ?? []).map((a) => a.coordinate).join(', ')}`,
    `scope:    ${r.row.scope.join(', ')}`,
  ];
  for (const e of r.entry.evidence ?? []) {
    lines.push(`  ${e.contradicts ? 'contradicted' : 'seen'} by ${e.by ?? '?'} on ${e.deployment ?? '?'} at ${e.at ?? '?'}`
      + `${e.note ? ` — ${e.note}` : ''}`);
  }
  lines.push('');
  lines.push(r.body);
  return lines;
}

export function captureLines(r, { prefix = 'kb capture' } = {}) {
  if (r.state === 'invalid') {
    return [`${prefix}: ${r.why}`, ...(r.problems ?? []).map((p) => `  ${p.coordinate} — ${p.kind}: ${p.why}`)];
  }
  if (r.state === 'refused') {
    // A refusal is not a failure -- it is the design working. The ranking missed an entry that
    // exists, and instead of a duplicate the base gets a confirmation.
    return [`${prefix}: REFUSED — the base already holds this fact.`, '', `  ${r.message.split('\n').join('\n  ')}`];
  }
  if (r.state !== 'queued') {
    const lines = [`${prefix}: ${HEADLINE[r.state] ?? r.state}`];
    if (r.why) lines.push(`  ${r.why}`);
    return lines;
  }
  return [
    `${prefix}: queued ${r.id} — ${r.entry.subject}`,
    `  ${r.queuedTo}`,
    '  nothing has been sent; it ships with the next push.',
    ...(r.alsoHere ?? []).map((n) => `  also anchored at ${n.coordinate}: ${n.id} — ${n.subject}`),
    ...relatedLines(r.related),
  ];
}

/**
 * Entries the fact just written may speak to — printed LAST, and phrased so it cannot be mistaken
 * for a gate.
 *
 * The capture is already queued by the time these lines exist; nothing here can undo that, and the
 * wording says so in the first line rather than leaving the reader to infer it from the absence of
 * a prompt. The sentence is here, in the one renderer both doors go through, so the CLI and the
 * MCP server cannot drift apart on the one thing this hint has to communicate: that it is advice.
 *
 * `more` is printed rather than folded into the list because a capped list cannot distinguish
 * "three related entries" from "three shown, ten not" — and those ask different things of whoever
 * is deciding whether to go and read them.
 */
function relatedLines(related) {
  if (!related?.hits?.length) return [];
  const lines = ['  related — these may be about the same thing; nothing is blocked:'];
  for (const h of related.hits) lines.push(`    ${h.row.id} — ${h.row.subject}`);
  if (related.more) lines.push(`    …and ${related.more} more; \`kb ask\` to see them.`);
  return lines;
}

export function evidenceLines(verb, r) {
  if (r.state === 'invalid') return [`kb ${verb}: ${r.why}`];
  if (r.state !== 'queued') {
    const lines = [`kb ${verb}: ${HEADLINE[r.state] ?? r.state}`];
    if (r.why) lines.push(`  ${r.why}`);
    return lines;
  }
  return [
    `kb ${verb}: queued on ${r.id} (${r.row.subject})`,
    `  ${r.queuedTo}`,
    '  nothing has been sent; it ships with the next push.',
  ];
}
