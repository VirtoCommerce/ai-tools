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
//   defect   VCST-1234   a filed bug, in a project this repo's committed config names (`publicProjects`)
//            suspected   looks wrong against the docs or a BL-* rule; no ticket yet
//            none        withdraws the marker -- it turned out to be intended
//   fixedIn  VirtoCommerce.<Module>@<version>, `platform@<version>` or `theme@<version>`: the first
//            RELEASED version (x.y.z, no pre-release) without it
//
// What may be marked, and the docs check that comes first, is the contract's
// (`.claude/knowledge/execution/kb-capture-contract.md` §Defects).

import { themeVersion } from './canonical.mjs';
import { amendmentsOf, attestsCurrentClaim } from './index-build.mjs';

export const DEFECT_WORDS = Object.freeze(['suspected', 'none']);
const TICKET = /^([A-Z][A-Z0-9]{0,19})-\d{1,9}$/;
// The part after `@` must be a VERSION: `fixState` compares it with a build, and a commit or a zip name
// compares as 0 -- every build would read "fixed".
// The part before `@` is `platform`, `theme` or a `VirtoCommerce.*` module: the base is PUBLIC, and a
// free module id would carry a client's own module name into it -- the leak the build stamp already
// refuses for a private stand (`probeStand`, build.mjs).
const FIXED_IN = /^(platform|theme|VirtoCommerce\.[A-Za-z][\w.]{0,70})@(\S{1,80})$/i;
// A RELEASED version only: a PR build's fix may never reach the release of the same number, so a release
// compared against it would read "fixed" on a guess.
const VERSION = /^\d+\.\d+\.\d+$/;

/**
 * `{ value }` -- a ticket key, `suspected` or `none`; null when none was given -- or `{ problem }`.
 *
 * `projects` (the door's, `loadPublicProjects`): the Jira projects whose keys may be PUBLISHED. The base is
 * public, so a key of any other tracker -- a client's own `ACME-42`, a case id `CFG-12`, an oracle `ECL-12`
 * -- is refused: either it leaks a client's tracker, or it reads as a filed bug that does not exist. Without
 * `projects` (reading what the door already accepted) any key shape is taken.
 */
export function resolveDefect(raw, { projects = null } = {}) {
  const s = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim();
  if (!s) return { value: null };
  if (DEFECT_WORDS.includes(s.toLowerCase())) return { value: s.toLowerCase() };
  const key = TICKET.exec(s.toUpperCase());
  if (key && (!projects || projects.includes(key[1]))) return { value: s.toUpperCase() };
  const allowed = projects ? (projects.length ? projects.map((p) => `${p}-1234`).join(', ') : 'none is configured, so only') : 'VCST-1234';
  return { problem: `defect "${s.slice(0, 40)}" is not a bug ticket of a public project (${allowed}), \`suspected\` (looks wrong against the docs or a BL-* rule, no ticket yet -- also for a bug filed in a private tracker) or \`none\` (withdraws a marker); what is wrong goes in the claim or note` };
}

/** `{ value }` -- `<module|platform|theme>@<version>`, null when none was given -- or `{ problem }`. */
export function resolveFixedIn(raw) {
  const s = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim();
  if (!s) return { value: null };
  const m = FIXED_IN.exec(s);
  // A theme may be named as its artifact (`theme@vc-theme-b2b-vue-2.61.0`): reduced to the version, the
  // spelling every build stamp uses (`themeVersion`).
  const version = m && (m[1].toLowerCase() === 'theme' ? themeVersion(m[2]) : m[2]);
  if (m && VERSION.test(version)) return { value: `${m[1]}@${version}` };
  return { problem: `fixedIn "${s.slice(0, 40)}" is not <module>@<version> -- the first build without the defect, a VirtoCommerce.* module, platform or theme at a released version x.y.z: VirtoCommerce.XOrder@3.1001.0, platform@3.1080.0 or theme@2.61.0 (never a commit)` };
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
 * The entry's marker, from its evidence: `{ defect, fixedIn }` or null.
 *
 * In the order the markers were SET -- an item's `at`, or `resolvedAt` when a judge wrote it on a dispute
 * (`defect-fixed`) -- the latest `defect` wins, `none` clears it, and a `fixedIn` alone completes the marker
 * standing at the time. A new ticket starts a new marker, so an older `fixedIn` does not carry over to it;
 * `suspected` after a ticket is the same bug seen by someone who did not know the ticket, and keeps it.
 *
 * A marker is about the claim it was set on. After a judge CORRECTS the claim (`claim-amended`), a marker
 * set before the correction -- or on the corrected body -- no longer applies, as such a confirmation no
 * longer counts toward trust (`attestsCurrentClaim`): the corrected claim may well be the intended
 * behaviour. A judge's `defect-fixed` counts from the time it was resolved.
 */
export function defectOf(evidence = []) {
  const all = Array.isArray(evidence) ? evidence : [];
  const amendments = amendmentsOf(all);
  // A resolution whose time does not parse cannot be placed after an amendment, so it predates it -- the
  // rule `attestsCurrentClaim` applies to every other item.
  const current = (e) => {
    if (!e.resolvedAt) return attestsCurrentClaim(e, amendments);
    const t = Date.parse(String(e.resolvedAt));
    return !amendments.some((a) => !Number.isFinite(t) || (Number.isFinite(a.at) && t <= a.at));
  };
  // An item whose time does not parse sorts FIRST (it cannot be placed after anything), then by time, then
  // as written: one total order, so the marker never depends on how the engine sorts.
  const items = all
    .filter((e) => e && !e.duplicateSession && (e.defect || e.fixedIn) && current(e))
    .map((e, i) => { const t = Date.parse(String(e.resolvedAt ?? e.at ?? '')); return { e, i, t: Number.isFinite(t) ? t : -Infinity }; })
    .sort((a, b) => (a.t !== b.t ? (a.t < b.t ? -1 : 1) : a.i - b.i));
  let cur = null;
  for (const { e } of items) {
    const d = resolveDefect(e.defect).value;
    const f = resolveFixedIn(e.fixedIn).value;
    if (d === 'none') { cur = null; continue; }
    // `suspected` never downgrades a filed ticket: whoever saw the bug without knowing its ticket confirms
    // the same defect, and must not erase the ticket and its `fixedIn` for every later reader.
    if (d === 'suspected' && cur && cur.defect !== 'suspected') { if (f) cur = { ...cur, fixedIn: f }; continue; }
    // The same bug keeps its fixedIn: the same ticket, or the ticket it got after being `suspected`.
    if (d) cur = { defect: d, fixedIn: f ?? (cur && (cur.defect === d || cur.defect === 'suspected') ? cur.fixedIn : null) };
    else if (f && cur) cur = { ...cur, fixedIn: f };
  }
  return cur;
}

/** Said where the entry's body did not arrive: its evidence -- and so any defect marker -- went unread. */
export const DEFECT_UNKNOWN = 'body not read, so whether this is a KNOWN DEFECT is unknown: open it before you assert what it says';

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
