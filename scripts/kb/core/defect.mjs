// WHAT HAPPENS, AND SHOULD NOT (VCST-6317): a marker that says an entry's behaviour is a DEFECT.
//
// The base records what the platform DOES. A bug an agent observed live was captured as an ordinary
// fact, and the next agent read it as expected behaviour: a test author asked what a field should be,
// got the bug's value, and wrote a case that locks the bug in. Measured on the base 2026-10-13: of the
// 44 active entries whose prose says "bug", "defect" or "regression", 12 state that the behaviour is a
// defect, 22 say the opposite ("not a defect, by design") and 10 are noise ("regression run") -- prose
// cannot carry the marker, a reader of the headline and the trust label never sees it.
//
// The marker answers a different question from the trust label: trust says "this really happens", the
// marker says "it should not". An entry can be both -- a bug reproduced on three stands.
//
// IT RIDES ON AN EVIDENCE ITEM, NEVER ON THE ENTRY'S FRONTMATTER, and the entry's state is DERIVED
// (PLAN §12 rule 5, like trust). The frontmatter is a closed schema: a top-level field a client does not
// know makes it throw, so every teammate who had not pulled would lose every marked entry -- `ask` would
// print "body unavailable" and `push` "did not parse". Keys on an evidence item pass through every
// client unchanged (`appendEvidence`, push.mjs). For the same reason it is set by `confirm --defect`, not
// by a new verb: an older client's `push` applies capture / confirm / dispute only, and would turn a new
// mutation into a log line and lose it. A marker therefore always arrives with an observation.
//
//   defect   VCST-1234   a filed bug (any tracker key: PROJECT-<n>)
//            suspected   looks wrong against the docs or a BL-* rule; no ticket yet
//            none        withdraws the marker -- it turned out to be intended
//   fixedIn  <module>@<version>, `platform@<version>` or `theme@<version>`: the first build without it
//
// What may be marked, and the docs check that comes first, is the contract's
// (`.claude/knowledge/execution/kb-capture-contract.md` §Defects).

import { CODE_VERSION } from './method.mjs';

export const DEFECT_WORDS = Object.freeze(['suspected', 'none']);
const TICKET = /^[A-Z][A-Z0-9]{0,19}-\d{1,9}$/;

/** `{ value }` -- a ticket key, `suspected` or `none`; null when none was given -- or `{ problem }`. */
export function resolveDefect(raw) {
  const s = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim();
  if (!s) return { value: null };
  if (DEFECT_WORDS.includes(s.toLowerCase())) return { value: s.toLowerCase() };
  if (TICKET.test(s.toUpperCase())) return { value: s.toUpperCase() };
  return { problem: `defect "${s.slice(0, 40)}" is not a bug ticket (VCST-1234), \`suspected\` (looks wrong against the docs or a BL-* rule, no ticket yet) or \`none\` (withdraws a marker); what is wrong goes in the claim or note` };
}

/** `{ value }` -- `<module|platform|theme>@<version>`, null when none was given -- or `{ problem }`. */
export function resolveFixedIn(raw) {
  const s = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim();
  if (!s) return { value: null };
  if (CODE_VERSION.test(s)) return { value: s };
  return { problem: `fixedIn "${s.slice(0, 40)}" is not <module>@<version> -- the first build without the defect: VirtoCommerce.XOrder@3.1001.0, platform@3.1080.0 or theme@2.61.0` };
}

/**
 * Why a marker on a write is unusable, or null. `current` is the entry's marker now (`defectOf`), or
 * undefined when the entry is new or could not be read.
 */
export function markerProblem({ defect, fixedIn }, current) {
  if (defect === 'none' && fixedIn) return 'fixedIn names when a defect was fixed; `defect none` says there was none -- give one of them';
  if (fixedIn && !defect && current === null) return 'fixedIn needs a defect marker: this entry carries none -- give --defect with it';
  return null;
}

/**
 * The entry's marker, from its evidence: `{ defect, fixedIn, at }` or null.
 *
 * In the order the markers were SET -- an item's `at`, or `resolvedAt` when a judge wrote it on a dispute
 * (`defect-fixed`) -- the latest `defect` wins, `none` clears it, and a `fixedIn` alone completes the marker
 * standing at the time. A new ticket starts a new marker, so an older `fixedIn` does not carry over to it.
 */
export function defectOf(evidence = []) {
  const items = (Array.isArray(evidence) ? evidence : [])
    .filter((e) => e && !e.duplicateSession && (e.defect || e.fixedIn))
    .map((e, i) => ({ e, i, t: Date.parse(String(e.resolvedAt ?? e.at ?? '')) }))
    .sort((a, b) => ((Number.isFinite(a.t) && Number.isFinite(b.t) && a.t !== b.t) ? a.t - b.t : a.i - b.i));
  let cur = null;
  for (const { e } of items) {
    const d = resolveDefect(e.defect).value;
    const f = resolveFixedIn(e.fixedIn).value;
    if (d === 'none') { cur = null; continue; }
    if (d) cur = { defect: d, fixedIn: f ?? (cur && cur.defect === d ? cur.fixedIn : null), at: e.resolvedAt ?? e.at ?? null };
    else if (f && cur) cur = { ...cur, fixedIn: f };
  }
  return cur;
}

/** The marker as a reader reads it, beside the trust label. `fix` is `fixState` against the asker's build. */
export function defectText(marker, fix = null) {
  if (!marker) return null;
  const head = marker.defect === 'suspected'
    ? 'SUSPECTED DEFECT (no ticket yet): observed behaviour, likely NOT expected; do not assert it'
    : `KNOWN DEFECT ${marker.defect}: observed behaviour, NOT expected; do not assert it`;
  if (!marker.fixedIn) return head;
  const where = !fix ? ''
    : fix.state === 'fixed' ? `; you run ${fix.have}: fixed on your build`
      : fix.state === 'not-fixed' ? `; you run ${fix.have}: NOT fixed on your build`
        : `; whether your build has the fix is unknown${fix.have ? ` (you run ${fix.have})` : ''}`;
  return `${head}. Fixed in ${marker.fixedIn}${where}`;
}
