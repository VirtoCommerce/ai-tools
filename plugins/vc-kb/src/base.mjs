// WHERE THE BASE IS.
//
// Until this tool moved into a consumer repository it carried an absolute path to one directory
// on one machine, which is the kind of constant that works until somebody else clones the thing.
// The order below is deliberate and every step of it is a place an OPERATOR has spoken:
//
//   1. `--base <dir>`        the argument. Taken as given, with no checking at all, because a
//                            base under construction is not yet a base -- `kb extract` writes
//                            one from nothing and several gates run against a temp directory.
//   2. `KB_BASE`             the environment.
//   3. a sibling checkout    `../vc-knowledge` beside the repository this tool lives in, which
//                            is what a clone of both repositories looks like.
//
// AN EXPLICIT CANDIDATE THAT IS NOT A BASE IS AN ERROR, NOT A MISS. If `KB_BASE` is set and the
// directory it names carries no manifest, resolution STOPS there -- it does not quietly walk on
// to the sibling. An operator who names a directory has said where to look, and answering
// confidently out of a different corpus than the one they named is the exact failure this whole
// base exists to remove. Only the implicit candidate may be skipped, because nobody claimed it.
// (The first version of this file fell through, and a probe pointed at a deliberately bogus
// KB_BASE answered out of the real corpus with full confidence.)
//
// THERE IS NO FALLBACK CONSTANT, and that is the point. If none of the three resolves, the door
// says so and exits; it does not carry on against a directory that does not exist. The answer
// contract distinguishes three states -- an answer, an absence of COVERAGE, and an absence of the
// BASE -- and a default path that happens to be wrong collapses the last two into the second,
// which makes an outage look like a gap in knowledge. That is the specific failure `degraded`
// exists to prevent, and it would be silly to defeat it in the first line of the program.
//
// A DIRECTORY IS A BASE IF IT CARRIES `kb.json`. The manifest is already the thing that declares
// the namespace, the planes, the schema fields and the identity rule, so it is also the honest
// marker: a directory holding one is a base of some version, and a directory holding none is not
// a base whatever it is named.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const BASE_MARKER = 'kb.json';

export const looksLikeBase = (dir) => Boolean(dir) && existsSync(join(dir, BASE_MARKER));

// `here` is the tool's own root. The sibling candidate is computed from it rather than from
// process.cwd(), because the door is run from wherever the agent happens to be standing and the
// answer must not depend on that.
export function baseCandidates({ explicit, env = process.env, here } = {}) {
  const out = [];
  if (explicit) out.push({ dir: explicit, source: '--base', checked: false, explicit: true });
  if (env.KB_BASE) out.push({ dir: env.KB_BASE, source: 'KB_BASE', checked: true, explicit: true });
  if (here) out.push({ dir: resolve(here, '..', '..', '..', 'vc-knowledge'), source: 'sibling checkout', checked: true, explicit: false });
  return out;
}

export function resolveBase(opts = {}) {
  for (const c of baseCandidates(opts)) {
    if (!c.checked || looksLikeBase(c.dir)) return c.dir;
    // Named by a person and wrong: stop, rather than answer out of a corpus nobody asked for.
    if (c.explicit) return null;
  }
  return null;
}

// Said once, in full, naming every place that was looked at. A "base not found" that does not say
// where it looked sends the reader to guess, and the guess is usually the one directory they have
// already checked.
export function baseNotFoundMessage(opts = {}) {
  const tried = baseCandidates(opts);
  const lines = [
    'No knowledge base found. This is NOT the same as a base holding nothing about your question —',
    'nothing was read at all.',
    '',
    'Looked at:',
  ];
  if (tried.length === 0) lines.push('  (nowhere — no --base, no KB_BASE, and the tool could not locate itself)');
  let stoppedAt = null;
  for (const t of tried) {
    const bad = t.checked && !looksLikeBase(t.dir);
    lines.push(`  ${t.dir}   [${t.source}]${bad ? ` — no ${BASE_MARKER}` : ''}`);
    if (bad && t.explicit) { stoppedAt = t; break; }
  }
  if (stoppedAt) {
    lines.push(
      '',
      `${stoppedAt.source} names a directory that is not a base, so the search STOPPED there rather`,
      'than falling through to somewhere you did not ask for. Fix it or unset it.',
    );
  }
  lines.push(
    '',
    'Point at one of:',
    '  kb <verb> --base <dir>          one invocation',
    '  KB_BASE=<dir>                   this shell, and every hook in it',
    '',
    `A base is a directory carrying ${BASE_MARKER}. Clone one:`,
    '  git clone https://github.com/VirtoCommerce/vc-knowledge',
  );
  return lines.join('\n');
}
