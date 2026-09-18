// The experiential plane: everything an agent learns by doing, which today cannot be recorded at
// all. Four of the six verbs live here (capture, confirm-as-part-of-capture, dispute, retire);
// consolidate is next door and deliver is the read side.
//
// Three things about this file are consequences of a measurement, not preferences
// (docs/adr/measurements/kb-dedup-2026-09 in the QA repo):
//
//   * The fingerprint does NOT hash the claim's wording. Over 19 labelled pairs of independently
//     recorded facts, the wording-similarity range of pairs that must collapse contained the range
//     of pairs that must stay apart entirely, on both question and answer text -- and one pair that
//     must collapse sat at similarity 0.00, so wording does not even raise the candidate.
//   * What the fingerprint DOES hash is the pair (normalized anchors, scope). Coordinates raise the
//     candidate; the scope axes decide.
//   * A claim that lands on an existing fingerprint is never merged silently. The door reports the
//     collision and makes the writer say `--confirm` or `--dispute`. Two records with one
//     coordinate and one scope are either the same fact twice or a disagreement about it, and text
//     cannot tell those apart -- that was the measurement's decisive pair.
//
// Step 2 adds NO top-level field to the schema. The confirmation count, the disputed flag and the
// versions an entry has been seen on are all COMPUTED from evidence[], because a declared count is
// a second copy of a fact that already has a home, and second copies drift.

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { parseEntry, stringifyFrontmatter } from './frontmatter.mjs';
import { hash, mintId } from './canonical.mjs';
import { buildIndex } from './index-build.mjs';
import { locate, installedVersionOf, knownModules } from './source-door.mjs';
import { derivedFacts, unreachableAnchors } from './coordinates.mjs';
import { CAPTURED_DIR, CAPTURED_INDEX, CAPTURED_CATALOG, FLOWS_DIR, FLOWS_INDEX, FLOWS_CATALOG, WRITTEN_STORES, DERIVED_ENTRIES } from './planes.mjs';
// Re-exported: normalizeAnchor is half of the identity rule and callers have always found it
// here. Its home moved to break an import cycle, not its meaning.
export { normalizeAnchor } from './anchors.mjs';
import { normalizeAnchor, LOOKS_LIKE_A_LOCAL_PATH, MSYS_REMEDY } from './anchors.mjs';
import { sessionParty, writerParty, transcriptionSource, partiesOf, isAttested } from './provenance.mjs';
import { sectioned } from './topics.mjs';
import { ruleIdOf, ruleDomainOf, severityOf, byDomain } from './rules.mjs';

// Re-exported: callers have always found these here, and their home moved to planes.mjs so that
// both planes are named in one place rather than as literals scattered across six modules.
export { CAPTURED_DIR, CAPTURED_INDEX, CAPTURED_CATALOG, FLOWS_DIR, FLOWS_INDEX, FLOWS_CATALOG, WRITTEN_STORES } from './planes.mjs';

// The identity of a fact. Anchors say what it is about; scope says who or where it holds for.
// The claim is deliberately absent -- see the header.
//
// A FLOW IS IDENTIFIED BY ITS GOAL INSTEAD, and the reason is that anchors do not work for one:
// "place an order" and "cancel an order" both touch /cart and /account/orders, so an anchor rule
// would call two different procedures one procedure and refuse the second. What makes two flows the
// same flow is that they reach the same end state for the same principal on the same surface.
//
// THIS IS UNMEASURED, and it is the opposite trade from the fact rule, deliberately. The dedup
// measurement that put wording out of the fact fingerprint was about CLAIMS, and says nothing about
// goals; two writers will phrase one goal differently and the base will hold that flow twice. That
// failure is visible and `consolidate` can fix it. The other failure -- refusing a legitimate
// second flow because it shares a route with the first -- is invisible, and the writer works around
// it by inventing an anchor, which is how a guess enters a corpus. Duplicate-but-visible beats
// refuse-legitimate until somebody measures it.
export function fingerprint({ subject, anchors, appliesTo, plane }) {
  const scope = [...new Set((appliesTo ?? []).map((s) => `${s.axis}=${s.value}`))].sort();
  if (plane === 'flow') {
    return hash({ goal: String(subject ?? '').trim().toLowerCase().replace(/\s+/g, ' '), scope }, 16);
  }
  // A RULE IS ITS ID, and the anchors play no part. Two rules constrain one coordinate routinely --
  // BL-PRICE-002 and BL-PRICE-003 are both about money on an order -- so hashing coordinates here
  // would refuse the second rule of every such pair as a duplicate of the first. Scope stays in the
  // hash, unused today and there for the day somebody records one rule holding differently on two
  // module versions; with no scope axes it degenerates to the id, which is what identity means here.
  if (plane === 'normative') {
    return hash({ rule: ruleIdOf(subject), scope }, 16);
  }
  const coordinates = [...new Set((anchors ?? []).map((a) => normalizeAnchor(a.coordinate)).filter(Boolean))].sort();
  return hash({ coordinates, scope }, 16);
}

// --- computed, never declared -----------------------------------------------------------------

// Injected into `sourceRef` rather than reached for inside it, so a test can drive it with a base
// that has no derived plane at all.
const sourceTools = { locate, installedVersionOf, knownModules };

// THE NUMBER IN THE REGISTER MEANS INDEPENDENT PARTIES, BECAUSE THAT IS WHAT THE BRIEF SAYS IT
// MEANS. It counted rows until 2026-09-16. The catalog handed to round four's arm carried a column
// headed `confirmations`, and the brief in the same prompt told it: "`confirmations` is how many
// independent parties have seen it. An entry with two or more has been seen by somebody other than
// its author." That was false for eight active entries — `KB-BCA7468D` printed 3 where one party
// had seen it, and three entries printed 1 for a reading of source code that nobody observed at
// all. The trust LEVEL has used `partiesOf` since the provenance fix, so an entry could print
// `confirmations: 3` and `single-observation` in the same breath.
//
// Source readings are excluded rather than folded in: code says what should happen and an
// observation says what did, and `evidenceKinds` already reports the two side by side. An entry
// backed only by source now reads 0, which is the honest answer to "how many parties have seen
// this" and is why the column exists.
export const confirmationsOf = (data) =>
  partiesOf((data.evidence ?? []).filter((e) => !e.contradicts && e.method !== 'source'));
// DOES ANY ROW SAY WHAT WAS SEEN? Distinct from the count beside it, and the register now prints
// both, because the licence to act on a `confirmed` entry without re-verifying rests on this one
// and not on that one. A count says how many parties agreed; it cannot say that any of them wrote
// down what they saw. `confirm` took no `--note` until 2026-09-16, so most of the corpus's
// agreement is undescribed — 5 of the 22 licensed entries carry an attested row. That number is not
// a reason to demote the other 17; it is the number the next run should be raising.
//
// Three shapes count: a note on the row, a `from` naming a report a reader can open, or a source
// reading, which names module, installed version and path and is self-describing.
export const attestedOf = (data) =>
  (data.evidence ?? []).some((e) => !e.contradicts && isAttested(e) && (e.note || e.from || e.method === 'source'));
export const disputesOf = (data) => (data.evidence ?? []).filter((e) => e.contradicts).length;
export const isDisputed = (data) => disputesOf(data) > 0;

// "Confirmed on 3.1007.26 and 3.1039.11" is a range read out of the observations, not a claim an
// author typed. An entry can only say it holds where something actually looked.
export function observedOn(data) {
  const seen = new Map();
  for (const e of data.evidence ?? []) {
    // A source reading was not observed ANYWHERE, so it does not belong in a list of where
    // something was seen. Left in, it grouped under the key `null@?` and printed as
    // "null — 1 confirming", which reads as a broken stamp rather than as a different kind of
    // evidence -- the exact failure `method: source` exists to prevent. Caught by running the verb
    // against the live corpus, not by a test, which is the third time that has been the order.
    if (e.method === 'source') continue;
    const key = `${e.deployment ?? '?'}@${e.platformVersion ?? '?'}`;
    if (!seen.has(key)) seen.set(key, { deployment: e.deployment ?? null, platformVersion: e.platformVersion ?? null, contradicts: 0, confirms: 0 });
    const row = seen.get(key);
    if (e.contradicts) row.contradicts++; else row.confirms++;
  }
  return [...seen.values()];
}

// --- reading the captured corpus --------------------------------------------------------------

export const storeOf = (plane) => WRITTEN_STORES[plane] ?? WRITTEN_STORES.experiential;

export function capturedDir(base, plane = 'experiential') {
  return join(base, storeOf(plane).dir);
}

export function readStore(base, plane = 'experiential') {
  const { dir: rel } = storeOf(plane);
  const dir = join(base, rel);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const path = `${rel}/${f}`;
      const { data, body } = parseEntry(readFileSync(join(dir, f), 'utf8'), path);
      return { file: f, rel: path, data, body };
    });
}

export function readCaptured(base) {
  return readStore(base, 'experiential');
}

export function readFlows(base) {
  return readStore(base, 'flow');
}

export function readRules(base) {
  return readStore(base, 'normative');
}

// ACTIVE FIRST. A retired entry keeps its fingerprint -- ids are eternal and so are the files --
// so a scan in file order can answer a live collision with a withdrawn entry, and every remedy the
// refusal then offers is aimed at something nothing serves.
export function findByFingerprint(base, fp, plane = 'experiential') {
  const matches = readStore(base, plane).filter((e) => fingerprint(e.data) === fp);
  return matches.find((e) => e.data.status === 'active') ?? matches[0] ?? null;
}

// Follow `supersededBy` to the entry that is actually served. Consolidation can retire A into B and
// later B into C, and a writer sent to B has been sent nowhere. The visited set is not paranoia:
// a merge in one direction and a correction in the other would otherwise loop here forever.
export function survivorOf(base, entry) {
  const seen = new Set();
  let at = entry;
  while (at && at.data.status !== 'active') {
    const next = at.data.supersededBy;
    if (!next || seen.has(next)) return null;
    seen.add(next);
    at = loadEntry(base, next);
  }
  return at ?? null;
}

// An id names exactly one entry in the whole base -- it is minted from the subject and `validate`
// checks uniqueness -- so this looks in every written store rather than being told which. That is
// what lets `confirm`, `dispute`, `retire` and `reanchor` work on a flow without gaining a flag.
export function loadEntry(base, id) {
  for (const plane of Object.keys(WRITTEN_STORES)) {
    const { dir } = storeOf(plane);
    const abs = join(base, dir, `${id}.md`);
    if (!existsSync(abs)) continue;
    const { data, body } = parseEntry(readFileSync(abs, 'utf8'), `${dir}/${id}.md`);
    return { file: `${id}.md`, rel: `${dir}/${id}.md`, data, body, abs };
  }
  return null;
}

// THE DERIVED PLANE IS READABLE, AND DELIBERATELY NOT LOADABLE BY THE WRITING VERBS.
//
// `loadEntry` walks WRITTEN_STORES, which is right: `confirm`, `dispute`, `retire` and `reanchor`
// all write their result back to the file they were handed, and a derived entry is REGENERATED --
// the next `kb extract` overwrites it and `validate` byte-compares it, so a row written there is
// destroyed on the next run and fails a gate on somebody else's commit in between.
//
// But `kb show` only reads, and until this it inherited the refusal: all 590 derived entries
// answered `is not in <base>. Ids in the catalog are exact; check the line you read it from.`
// for an id the base's own catalog had just printed -- and `kb capture` hands these ids out. The
// message blamed the reader for a correct citation, which is worse than a plain miss: it teaches
// distrust of the catalog rather than of the tool.
export function loadDerivedEntry(base, id) {
  const abs = join(base, DERIVED_ENTRIES, `${id}.md`);
  if (!existsSync(abs)) return null;
  const { data, body } = parseEntry(readFileSync(abs, 'utf8'), `${DERIVED_ENTRIES}/${id}.md`);
  return { file: `${id}.md`, rel: `${DERIVED_ENTRIES}/${id}.md`, data, body, abs, regenerated: true };
}

// "no captured entry <id>" SENDS A READER LOOKING FOR A TYPO THEY DID NOT MAKE.
//
// Now that `kb show` opens the derived plane, a reader arrives at a writing verb holding an id
// they have just watched work. The id is right; what is wrong is the request. Saying so is the
// difference between "you mistyped it" and "this plane cannot hold your row, and here is the verb
// that can" -- and the second one keeps the observation, which is the whole point of asking.
export const noWritableEntry = (base, id) => (loadDerivedEntry(base, id)
  ? `${id} is a DERIVED entry, and the derived plane is regenerated: \`kb extract\` rewrites the file and `
    + '`kb validate` byte-compares it, so a row written here is destroyed on the next run and fails a gate '
    + 'in between. Watched it NOT hold? Record what you SAW with `kb capture` — an observation that '
    + 'contradicts a derivation is exactly the finding the two planes exist to surface.'
  : `no captured entry ${id}`);

// --- writing ----------------------------------------------------------------------------------

export function renderCaptured(data, body) {
  return `${stringifyFrontmatter(data)}\n${body.startsWith('\n') ? '' : '\n'}${body}${body.endsWith('\n') ? '' : '\n'}`;
}

// The entry's own `plane` decides its store, so nothing has to be told twice and a write can never
// land in the wrong half of the base.
function writeEntry(base, data, body) {
  const dir = join(base, storeOf(data.plane).dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${data.id}.md`), renderCaptured(data, body));
}

// A retired entry stays on disk -- ids are eternal (ADR §4.3) -- but leaves the index, so nothing
// can be served from it. That is the whole of retirement's machinery in this step.
//
// BUILDING IS SEPARATE FROM WRITING so the gate can regenerate in memory and byte-compare, the way
// `kb check` does for the derived plane. Without that split, `validate` can only check that the
// index MENTIONS the right ids -- and an index built from an older version of a body mentions
// exactly the right ids while serving text that is no longer in the corpus.
export function buildCapturedArtifacts(base, plane = 'experiential') {
  const all = readStore(base, plane);
  const live = all.filter((e) => e.data.status === 'active');
  const docs = live.map((e) => ({
    id: e.data.id,
    subject: e.data.subject,
    question: e.data.question,
    text: e.body,
    path: e.rel,
  }));
  const index = JSON.stringify(buildIndex(docs), null, 2) + '\n';

  const flow = plane === 'flow';
  const normative = plane === 'normative';

  // THE RULES CATALOG IS A REFERENCE, NOT A LIST TO SCAN, and that is the whole difference from the
  // captured one above. A reader reaches it already knowing they are working on carts, so it is
  // ordered like an index -- domains alphabetical, rules by id inside one -- rather than
  // biggest-section-first. It carries the severity the rule's own author assigned, because that is
  // what decides whether an agent stops the work or files a note, and it carries the same two trust
  // columns as every other written plane: a rule transcribed off a page has been seen by one party,
  // and the register must not let a page's own "CONFIRMED 3/3" read as three.
  if (normative) {
    const retiredRules = all.filter((e) => e.data.status !== 'active');
    const HEAD = ['| id | rule | severity | confirmations | attested | disputed |', '|---|---|---|---|---|---|'];
    const ruleRow = (e) => {
      const id = ruleIdOf(e.data.subject);
      const title = String(e.data.subject).slice(String(id ?? '').length).trim() || '—';
      return `| [\`${id ?? e.data.id}\`](${e.rel}) | ${title}${e.data.status === 'active' ? '' : ' _(retired)_'} `
        + `| ${severityOf(e.body) ?? '—'} | ${confirmationsOf(e.data)} | ${attestedOf(e.data) ? 'yes' : 'no'} `
        + `| ${isDisputed(e.data) ? `yes (${disputesOf(e.data)})` : 'no'} |`;
    };
    const out = [
      '# Rules',
      '',
      `Constraints written down by people, not observations made by agents. ${live.length} active rule`
        + `${live.length === 1 ? '' : 's'}${all.length - live.length ? `, ${all.length - live.length} retired` : ''}, `
        + `in ${byDomain(live).length} domain${byDomain(live).length === 1 ? '' : 's'}.`,
      '',
      'A rule is identified by its ID and by nothing else. Two rules about one coordinate are the',
      'normal case, so the coordinate rule that identifies a fact would refuse half of these.',
      '',
      'READ THE TRUST COLUMNS. `confirmations` counts parties that have SEEN this rule hold on a',
      'deployment, and a rule carried over from a page starts at zero however confident the page was.',
      '`disputed` means somebody observed the opposite here; those are the rules to read first, and',
      'a disagreement between a rule and an observation is a finding rather than a mistake.',
      '',
      'This catalog is a reference. It is ordered by domain and by id so it can be looked up in, not',
      'scanned top to bottom: read the domain you are working in, with `kb rules <domain>`.',
    ];
    for (const [domain, rows] of byDomain(live)) {
      out.push('', `## ${domain} — ${rows.length}`, '', ...HEAD);
      for (const e of rows) out.push(ruleRow(e));
    }
    if (retiredRules.length) {
      out.push('', `## retired — ${retiredRules.length}`, '',
        'Withdrawn or superseded. Kept so a citation that still names one leads somewhere true.',
        '', ...HEAD);
      for (const e of retiredRules.sort((a, b) => a.data.id.localeCompare(b.data.id))) out.push(ruleRow(e));
    }
    out.push('');
    return { index, catalog: out.join('\n'), active: live.length, retired: all.length - live.length };
  }

  const lines = flow
    ? [
      '# Flows',
      '',
      `Procedures written through \`kb capture --flow\` and served by \`kb how\`, never by \`kb ask\`. ` +
        `${live.length} active flow${live.length === 1 ? '' : 's'}` +
        `${all.length - live.length ? `, ${all.length - live.length} retired` : ''}.`,
      '',
      'A flow is identified by its GOAL and its scope, not by the coordinates it touches: "place an',
      'order" and "cancel an order" travel the same routes and are not the same procedure. It is',
      'searched from its own index, because a procedure names the generic nouns of a whole journey',
      'and would otherwise be a plausible answer to most questions asked in ordinary words.',
      '',
      '| id | goal | confirmations | disputed | scope |',
      '|---|---|---|---|---|',
    ]
    : [
      '# Captured',
      '',
      `Written by agents through \`kb capture\`, not generated. ${live.length} active entr${live.length === 1 ? 'y' : 'ies'}` +
        `${all.length - live.length ? `, ${all.length - live.length} retired` : ''}.`,
      '',
      'The confirmation count, the disputed flag and the versions each fact has been seen on are read',
      'out of `evidence[]`. Nothing here declares them.',
      '',
      'SECTIONS EXIST SO THE LIST STAYS READ. This catalog is meant to be handed to an agent whole,',
      'and what fails as it grows is the reading, not the context window. Sections are derived from',
      'subject, question and anchors (`src/topics.mjs`), so a wrong filing is visible here rather than',
      'hidden in a table. An entry is filed under one section and its other topics are named beside',
      'it: 27 of 78 touch more than one, so these are tags, not folders.',
      '',
      'Within a section: disputed first, then by independent confirmations. A reader who stops early',
      'should stop on what most parties have seen, and on what somebody disagrees with.',
    ];

  const TABLE_HEAD = flow
    ? ['| id | goal | confirmations | attested | disputed | scope |', '|---|---|---|---|---|---|']
    : ['| id | subject | confirmations | attested | disputed | scope | also |', '|---|---|---|---|---|---|---|'];

  const row = (e, also = []) => {
    const scope = (e.data.appliesTo ?? []).map((s) => `${s.axis}=${s.value}`).join(' ') || '—';
    const cells = [
      `[\`${e.data.id}\`](${e.rel})`,
      `\`${e.data.subject}\`${e.data.status === 'active' ? '' : ' _(retired)_'}`,
      String(confirmationsOf(e.data)),
      attestedOf(e.data) ? 'yes' : 'no',
      isDisputed(e.data) ? `yes (${disputesOf(e.data)})` : 'no',
      scope,
    ];
    if (!flow) cells.push(also.length ? also.join(', ') : '—');
    return `| ${cells.join(' | ')} |`;
  };

  if (flow) {
    // Three procedures do not need sections, and a heading per row would be worse than a table.
    lines.push('', ...TABLE_HEAD);
    for (const e of all.sort((a, b) => a.data.id.localeCompare(b.data.id))) lines.push(row(e));
  } else {
    // Retired entries are not part of what an agent should scan; they go last, in one block, so the
    // sections above are exactly the live register.
    const retiredEntries = all.filter((e) => e.data.status !== 'active');
    for (const [section, rows] of sectioned(live, { confirmations: confirmationsOf, disputed: isDisputed })) {
      lines.push('', `## ${section} — ${rows.length}`, '', ...TABLE_HEAD);
      for (const { entry, also } of rows) lines.push(row(entry, also));
    }
    if (retiredEntries.length) {
      lines.push('', `## retired — ${retiredEntries.length}`, '',
        'Superseded or withdrawn. Kept so a reader who meets an id somewhere can find out what',
        'happened to it; not part of the register an agent scans.', '', ...TABLE_HEAD);
      for (const e of retiredEntries.sort((a, b) => a.data.id.localeCompare(b.data.id))) lines.push(row(e));
    }
  }
  lines.push('');
  return { index, catalog: lines.join('\n'), active: live.length, retired: all.length - live.length };
}

export function rebuildCapturedArtifacts(base, plane = 'experiential') {
  const built = buildCapturedArtifacts(base, plane);
  const store = storeOf(plane);
  // AN EMPTY STORE HAS NO INDEX AND NO CATALOG, and writing one is how `kb reindex` came to produce
  // a corpus its own gate then failed. `validate` says "rules-index.json exists while rules/ holds
  // no rules" -- correctly, because an index for a store that does not exist is a claim about
  // nothing -- and `reindex` was creating exactly that on any base without the plane. Latent for
  // the flow store since the day it shipped; live the moment a third store existed.
  //
  // It skips rather than deleting: a store that once held entries and now holds none cannot happen
  // here (retirement keeps the file), and a verb that removes a file because a directory looks
  // empty is a worse failure than a stale one the gate already reports.
  if (!readStore(base, plane).length) return { active: 0, retired: 0, skipped: true };
  writeFileSync(join(base, store.index), built.index);
  writeFileSync(join(base, store.catalog), built.catalog);
  return { active: built.active, retired: built.retired };
}

export class CaptureRefused extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'CaptureRefused';
    Object.assign(this, detail);
  }
}

// M3: no field is silently defaulted. Everything the schema needs is either supplied or the door
// refuses and names what is missing -- it never invents a plausible value, because a plausible
// value is indistinguishable from a recorded one once it is in the file.
const REQUIRED_INPUT = {
  subject: 'a short stable noun phrase for what the fact is about',
  question: 'the question this fact answers, in the words an asker would use',
  claim: 'the fact itself (becomes the body)',
  refutableBy: 'the channel that could show this false: observation | artifact | practice | anchor',
  anchors: 'at least one coordinate the claim is about (a route, a file, an env layer, a Type.field)',
  appliesTo: 'at least one scope axis, as axis=value (this is what decides whether two records are one fact)',
  deployment: 'where it was observed',
};

// The editorial half of the door, and the only place it lives. It sits next to REQUIRED_INPUT
// because that list says what the seven inputs ARE and this says what belongs in them -- two
// halves of one instruction, which drift apart the moment they are kept apart.
//
// Why here and not in a CLAUDE.md line, a skill, or a run brief: those are read before the work.
// This is read DURING it, at the one moment someone is deciding whether what they just learned is
// worth another agent's time. That decision is a judgement no gate can make -- the gate checks
// that seven fields are filled, never that anything worth reading is in them -- so the guidance
// has to arrive where the judgement happens. It is also the only copy, so it cannot go stale
// against a second one.
export const CAPTURE_HELP = `kb capture -- record something you learned by doing

Seven inputs, none of them defaulted. Run "kb capture" with none of them and it names them all.

  --subject        a short stable noun phrase for what the fact is about
  --question       the question this answers, in the words an asker would use
  --claim          the fact itself; it becomes the body
  --refutable-by   observation | anchor | artifact | practice   (see below)
  --anchor         a coordinate the claim is about -- a route, a Type.field, a file. Repeatable.
  --scope          axis=value. Repeatable. This is what decides whether two records are one fact.
  --deployment     where you observed it
  --source         <Module.Id>:<path/in/repo>, INSTEAD of --deployment, when you read the claim out
                   of code rather than off a running system. The version is not part of it: this
                   base already records which version of each module the deployment runs, and that
                   tag is what gets stamped and turned into a fetchable URL. A module this base
                   does not record as installed is refused rather than guessed at.

READ FROM CODE IS NOT OBSERVED, and the corpus keeps them apart. Source says what the code does; an
observation says what this deployment did. They can agree while the deployment runs a different
build -- in round two, two of three arms read \`dev\` instead of the installed tag -- so a source
reading and an observation never confirm each other. A second reading of the SAME kind does.

The VERSION is not an eighth input. When --deployment is the deployment this corpus was projected
from, the door stamps the pin and the platform version out of derived/pin.json, because they are
already recorded there and a retyped copy of a published value is what this base refuses
everywhere else. On any other deployment that pin describes a different system, so nothing is
stamped and you are told: pass --platform-version to say which version you saw it on. The entry is
written either way -- a fact whose limits are visible beats no fact.

WHAT IS WORTH RECORDING

Something about the PLATFORM that you had to find out and that would save the next agent the same
work: a behaviour, a constraint, a pitfall, a coordinate that is not where it looks like it
should be.

Record the MECHANISM, not the instance. This is the whole difference between a base still worth
reading in a year and one full of things that were true one week on one stand:

  not  "account X can sign in to the storefront here"
  but  "the storefront sign-in posts a username, not the email, so a contact whose account carries
        a different username cannot sign in however right the password is -- and the error is a
        generic login_failed either way, so it cannot tell you which of the two happened. Read the
        contact's account and its type in Admin instead of trying more passwords."

The first is a fixture and it rots. The second is still right on a deployment you have never seen.
A procedure counts, and so does a diagnosis: if you got stuck and worked out how to get unstuck,
how you did it is often worth more to the next agent than the fact you were after.

Do NOT record: what your current task happens to want, a hypothesis you did not confirm, a plan
for what to check next, values that rot (an order number, a price, which account exists on this
stand), or anything about your own tooling -- your shell, your browser lane, your env files.

If you learned nothing worth recording, record nothing. Zero captures is a result, not a failure.

CHOOSING --refutable-by

Name the channel that could actually FAIL for this claim, and picture it failing:

  observation  someone tries it and sees otherwise. The right answer for almost everything,
               procedures and diagnoses included -- a procedure is a way of phrasing a claim,
               not a different kind of claim.
  anchor       the coordinate it is anchored on changes or disappears. A diff raises it and the
               next reader closes it.
  artifact     a stored artifact contradicts it.
  practice     a rule people agree to follow. This is the one channel with NO EXECUTOR: nothing
               in this system can ever contradict such an entry, so it would accrue trust from
               use alone. Do not reach for it.

If you cannot say what observation would show your claim wrong, the claim is not ready. That is a
reason to go and find out, not a reason to pick a weaker channel.

WHEN THE DOOR ARGUES BACK

Before it writes, the door shows you what is already recorded about the coordinates you named. Two
entries on one coordinate are usually two honest facts about one place and that is fine. But read
them: a reader asking about that coordinate is served EVERY one of them, so if your new fact makes
an older one wrong, leaving both in place teaches the next agent something false.

When it does, replace it rather than adding to it:

  kb supersede <id> --reason "why it stopped being true" --subject ... --claim ... (and the rest)

One act: the new fact is written and the old one retired, pointing here. The old id stays
resolvable and keeps your reason, so a report that cited it last week still leads somewhere true.
This exists because correcting yourself was already possible with two verbs and nobody ever did it
-- one run wrote a claim, learned nine minutes later that part of it was wrong, wrote the correct
entry, and left the first one being served for a day.

A REFUSAL (exit 4) means the base already holds a fact on those coordinates at that scope. It is
never merged silently, because whether two claims about one coordinate agree is not something text
can be asked. The message names the entry; the answer is "kb confirm" if you saw the same thing,
"kb dispute" if you saw otherwise, or a scope axis that genuinely separates the two.

An axis may repeat. A fact that holds on two surfaces gets two rows --
--scope surface=rest --scope surface=admin-ui -- because a joined value computes a scope that
matches neither of the things it stands for, and the gate will say so.

After a capture lands, the tool prints what the DERIVED plane already says about the same
coordinates. Read that. If your observation disagrees with a generated contract, "kb dispute" it:
the disagreement is worth more than either claim alone.

AN ANCHOR IS SOMETHING THAT CAN CHANGE AND SAY SO. That is the whole test. A route, a Type.field, a
mutation name: a regeneration diffs it, \`kb consolidate\` groups by it, and the arrival hook offers
your entry to the next agent who touches the same place.

A menu path is not one. "Admin SPA: Security > Users > <account> > Roles" says truly where you were
standing, and nothing will ever raise it -- no diff notices that a blade moved, and the release that
renames it will not touch your entry. Put the path in the BODY, where it helps a reader reach the
screen, and anchor on the call that screen makes.

Do not guess a coordinate from a UI action. An anchor that reads like a real one and resolves to
nothing is worse than no anchor at all, because it looks reached: one entry anchored on
\`Mutations.deleteOrganizationContact\` after watching a Delete button, where the schema has
\`Mutations.deleteContact\` and nothing else, and for a day nothing said so. If you did not see the
call, anchor on what you did see. \`kb validate\` prints these; it does not fail on them.

Under Git Bash a bare --anchor "/route" is rewritten into a local path before the tool sees it.
Use the "VERB /route" form, or set MSYS_NO_PATHCONV=1.
`;

export function readPin(base) {
  const p = join(base, 'derived/pin.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * What version an observation was made against, resolved rather than asked for.
 *
 * M3 forbids inventing a plausible value. It does not forbid reading one that already has a home:
 * `derived/pin.json` carries the pin and the platform version of the deployment this corpus was
 * projected from, written by the extraction that produced it. Asking a writer to retype it would
 * be a second copy of a published value, which is the one thing this base refuses everywhere else.
 *
 * MEASURED, 2026-09-14: 54 of 54 evidence rows in the live base carried a deployment NAME and no
 * version. The CLI has accepted `--pin` and `--platform-version` since the door was built and no
 * run has ever passed them -- while `pin.json`, in the same base, held `3.1007.26` the whole time.
 * The README's own rule is that an environment's name is not evidence of anything; a corpus of
 * rows saying only `vcptcore_stable` is that rule being broken by the door that enforces it.
 *
 * It stamps ONLY when the observation was made on the deployment the corpus was projected from.
 * On any other deployment the pin describes a different system and stamping it would be a lie, so
 * the row goes out unversioned and the caller is told. It does not REFUSE: a foreign-deployment
 * observation is how `observedElsewhere` exists at all, and this base's stance -- three tests in
 * capture.test.mjs encode it -- is that a fact whose limits are visible beats no fact.
 */
export function stampOf(base, input) {
  if (input.pin || input.platformVersion) {
    return { pin: input.pin ?? null, platformVersion: input.platformVersion ?? null, source: 'supplied' };
  }
  const p = readPin(base);
  if (!p) return { pin: null, platformVersion: null, source: 'unpinned' };
  if (!input.deployment || input.deployment !== p.deployment) {
    return { pin: null, platformVersion: null, source: 'foreign', reference: p.deployment ?? null };
  }
  return { pin: p.pin ?? null, platformVersion: p.platformVersion ?? null, source: 'pin' };
}

// What a caller should be told about a stamp, or null when there is nothing worth saying. The
// text lives here rather than in bin/kb.mjs so that every door -- CLI today, anything else later
// -- says the same thing about the same situation.
export function stampNotice(stamp) {
  if (stamp.source === 'foreign') {
    return `version NOT recorded: this observation is on another deployment than \`${stamp.reference}\`, ` +
      'which is what derived/pin.json describes, so its version cannot be stamped from there. ' +
      'Pass --platform-version to say which version you saw it on; without it the row says only where.';
  }
  if (stamp.source === 'unpinned') {
    return 'version NOT recorded: this base has no derived/pin.json, so there is nothing to stamp from. ' +
      'Pass --platform-version, or run `kb extract` first.';
  }
  return null;
}

export function evidenceRow({ deployment, pin, platformVersion, by, at, from, contradicts, note, source }) {
  // A CLAIM READ OUT OF CODE IS NOT A CLAIM READ OFF A RUNNING DEPLOYMENT, and the corpus must be
  // able to tell them apart. Every one of the 124 evidence rows in this base said
  // `method: observation`, because that was the only method the door could write -- so a corpus
  // whose whole contract is that every claim is dated, placed and refutable could not say where
  // half of what it will hold next came from.
  //
  // The two are not interchangeable and must not confirm each other: source says what the code
  // does, an observation says what this deployment did, and they can agree while the deployment
  // runs a different build. `evidenceKinds` below is what keeps the counts apart; VCST-5975's
  // fourth acceptance is exactly that.
  //
  // A source row carries a module, the version INSTALLED HERE, and a path. The version is resolved
  // from the derived plane rather than typed, for the same reason `stampOf` resolves the pin: two
  // of round two's three arms read `dev`, and a value the base already holds should never be
  // retyped by hand.
  if (source) {
    const row = {
      method: 'source',
      module: source.module,
      version: source.version,
      path: source.path,
    };
    if (source.url) row.url = source.url;
    row.at = at;
    if (by) row.by = by;
    if (from) row.from = from;
    if (contradicts) row.contradicts = true;
    if (note) row.note = note;
    return row;
  }
  const row = { method: 'observation', deployment };
  if (pin) row.pin = pin;
  if (platformVersion) row.platformVersion = platformVersion;
  row.at = at;
  if (by) row.by = by;
  if (from) row.from = from;
  if (contradicts) row.contradicts = true;
  if (note) row.note = note;
  return row;
}

/**
 * How many rows of each KIND back an entry, and how many contradict it.
 *
 * Counted apart rather than summed, because two readings of the same code are a repetition and an
 * observation beside a source reading is a different kind of support. Nothing here decides what
 * that is worth -- `experientialTrust` does, and it reports both numbers rather than blending them
 * into a score nobody has measured.
 */
export function evidenceKinds(data) {
  const out = { observation: 0, source: 0, disputes: 0 };
  for (const e of data.evidence ?? []) {
    if (e.contradicts) { out.disputes += 1; continue; }
    if (e.method === 'source') out.source += 1;
    else out.observation += 1;
  }
  return out;
}

/**
 * Parse `--source VirtoCommerce.Orders:src/.../Handler.cs` and resolve the installed version.
 *
 * Refuses a module the base does not say is installed. That refusal is the point: a claim about
 * code the deployment is not running is not evidence about this deployment, and the corpus has no
 * way to notice later.
 */
export function sourceRef(base, raw, { locate, installedVersionOf, knownModules }) {
  const at = String(raw ?? '').indexOf(':');
  if (at < 1 || at === String(raw).length - 1) {
    throw new CaptureRefused(
      'capture refused: --source must be <Module.Id>:<path/in/repo>, for example '
        + '`--source VirtoCommerce.Orders:src/VirtoCommerce.OrdersModule.Data/Handlers/'
        + 'CancelPaymentOrderChangedEventHandler.cs`. The version is not part of it: this base '
        + 'already knows which version it runs.',
    );
  }
  const module = String(raw).slice(0, at).trim();
  const path = String(raw).slice(at + 1).trim();
  const version = installedVersionOf(base, module);
  if (!version) {
    const known = knownModules(base);
    throw new CaptureRefused(
      `capture refused: this base does not record \`${module}\` as installed, so there is no version `
        + 'to stamp and the claim would be about code that may not be running here. '
        + `${known.length} modules are recorded${known.length ? `; the nearest by name: ${known.filter((k) => k.toLowerCase().includes(module.toLowerCase().split('.').pop() ?? '')).slice(0, 3).join(', ') || known.slice(0, 3).join(', ')}` : ''}.`,
    );
  }
  const where = locate(module, version);
  return { module, version, path, url: where.raw ? `${where.raw}${path}` : null };
}

/**
 * The capture door. Returns either a written entry or a refusal -- never a silent merge and never
 * a second entry for a fact the base already holds.
 */
// `ignoreId` exempts one entry from the fingerprint gate, and `supersede` is the only caller that
// passes it. Replacing an entry with a better one about the SAME coordinates at the SAME scope is
// the ordinary case -- and without this it is the one case the door refuses, because the fact being
// replaced collides with its own replacement. Every other refusal still fires first, so the new
// fact is never written on the strength of an exemption that hid a genuine collision with a third
// entry.
export function capture(base, input, { now = () => new Date().toISOString(), ignoreId = null } = {}) {
  // One door, two written planes. A flow takes the same seven inputs and means two of them slightly
  // differently -- `subject` is the goal, and it alone decides identity -- so it goes through every
  // refusal here rather than round a second door that would drift from this one.
  // A BASE THAT DOES NOT EXIST IS NOT AN EMPTY BASE. Without this, `capture` pointed at any path at
  // all creates the directories it needs and writes the entry there, leaving a corpus-shaped thing
  // nobody will ever read. It happened on 2026-09-16: exporting MSYS_NO_PATHCONV=1 for a whole shell
  // stops Git Bash converting a Unix-style `--base /c/...`, Node resolved the literal string against
  // the drive root, and three entries plus an index and a catalog landed in C:\c\_VIRTO\vc-knowledge.
  // Every command reported success. The loss was noticed only because a later read of the real base
  // came up one entry short.
  //
  // `kb.json` is the marker because `validate` already treats its absence as "not a base" and
  // refuses to say anything else about the directory. The same rule that makes `ask` report a
  // degraded base rather than a coverage MISS applies here, and with more force: a read that is
  // wrong is visible in its answer, a write that is wrong is silent until somebody goes looking.
  if (!existsSync(join(base, 'kb.json'))) {
    throw new CaptureRefused(
      `capture refused: ${base} holds no kb.json, so it is not a knowledge base. Writing here would `
        + 'CREATE one silently and the entry would be lost to everyone reading the real corpus. '
        + 'Check --base: under Git Bash a Unix-style path is converted for you, and exporting '
        + 'MSYS_NO_PATHCONV=1 for the whole shell turns that off, which is exactly how this was '
        + 'first hit. Pass a drive-letter path (C:/… on Windows) and it cannot happen.',
    );
  }

  const plane = input.rule ? 'normative' : input.flow ? 'flow' : 'experiential';

  // A RULE THAT DOES NOT NAME ITSELF CANNOT BE FILED. Identity on this plane IS the id, so a rule
  // written without one is indistinguishable from the next rule on the same subject -- and an
  // import of 216 of them would collapse pairs silently, which is the one failure a bulk write can
  // produce that nobody would ever notice.
  if (plane === 'normative' && !ruleIdOf(input.subject)) {
    throw new CaptureRefused(
      'capture refused: a rule must lead with its ID. `--subject "BL-CART-003 coupon + sale '
        + 'interaction"`, not `--subject "coupon + sale interaction"`.\n'
        + '  The id is what identifies a rule here, what `kb show BL-CART-003` resolves, and what the '
        + 'citations already in agent prompts and regression suites point at. If this claim has no id '
        + 'because nobody wrote it as a rule, it is an observation: capture it without --rule.',
    );
  }
  // `deployment` answers "where did you see this". A claim read out of code was not seen ANYWHERE
  // -- it was read at a tag -- and `--source` answers the same question better, because a module
  // and a path at an installed version is a coordinate anybody can return to, while a deployment
  // name is the thing the README already says is not evidence of anything on its own. So one of
  // the two is required and neither defaults; asking for both would make a writer name a
  // deployment they did not look at, which is how a plausible value enters a corpus.
  // WHAT A RULE IS NOT ASKED FOR, and why each one is a decision rather than a relaxation.
  //
  //   question   a fact is an answer and a rule is a constraint. The seven-field door asks for the
  //              question "in the words an asker would use" because that is how a fact is found;
  //              a rule is found by working in its domain, and the rules catalog carries no
  //              question column. Asking for one would make every importer invent 216 of them.
  //   appliesTo  scope is what separates two records of one fact. A rule is separated by its id, so
  //              scope here is optional and empty is honest: `BL-PRICE-003` holds for the platform,
  //              and inventing `surface=rest` for it would be a value nobody observed.
  //   deployment a rule was not observed anywhere -- it was READ. `--from <the page it was read out
  //              of>` answers the same question better, and `--source` answers it better still.
  //              One of the three is required; none defaults.
  //   anchors    a rule is reached by its ID and by its domain, not by a coordinate. Measured on
  //              the document this plane exists for: of the 216 BL-* invariants in
  //              `business-logic.md`, 143 name no coordinate anywhere in their Rule, Verify or
  //              Violation signal, and only 41 name one this base projects. They are not badly
  //              written -- "money rounds half-up to two decimals" and "the search index lags an
  //              admin change by 30-60 seconds" are about the platform, not about a place in it.
  //              An importer made to satisfy this field would have invented 143 coordinates, and a
  //              gate made to report them would have raised the corpus from 39 notices to 182.
  //              Where a rule DOES name one it is recorded, because that anchor is what puts the
  //              rule beside an observation in `writtenNeighbours` and what `kb refute` can check.
  const NORMATIVE_EXEMPT = new Set(['question', 'appliesTo', 'anchors']);
  const missing = Object.keys(REQUIRED_INPUT).filter((k) => {
    if (plane === 'normative' && NORMATIVE_EXEMPT.has(k)) return false;
    if (k === 'deployment' && (input.source || (plane === 'normative' && input.from))) return false;
    const v = input[k];
    return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  });
  if (missing.length) {
    throw new CaptureRefused(
      `capture refused: ${missing.length} required input(s) missing, and none of them has a safe default:\n` +
        missing.map((k) => `  ${k} — ${REQUIRED_INPUT[k]}`).join('\n') +
        '\n\nkb capture --help says what belongs in each, and what is not worth recording at all.',
      { missing },
    );
  }
  if (input.refutableBy === 'derivation') {
    throw new CaptureRefused(
      'capture refused: refutableBy "derivation" belongs to the derived plane — an observed fact is ' +
        'not refuted by regenerating a schema. Name a channel that could actually FAIL for this claim.',
    );
  }

  // `?? []` for the same reason as `appliesTo` below: a rule may legitimately name no coordinate
  // (see NORMATIVE_EXEMPT). Every other plane has already been refused above if this is empty.
  const anchors = (input.anchors ?? []).map((a) => (typeof a === 'string' ? { coordinate: a } : a));
  // REFUSED, not warned. Everything else the door dislikes about an anchor is a judgement the
  // writer is better placed to make than the tool -- a menu path is honest about where somebody
  // stood, an unprojected surface is not their problem. This one is not a judgement: a path into
  // the Git installation is never what anybody meant, it is what the shell did to what they meant,
  // and the entry is unreachable from the moment it is written. Run 07 wrote one and left the
  // corpus failing its gate for a day; the correction was mangled the same way by someone who knew.
  for (const { coordinate } of anchors) {
    if (LOOKS_LIKE_A_LOCAL_PATH.test(String(coordinate ?? ''))) {
      throw new CaptureRefused(
        `capture refused: anchor "${coordinate}" is a path on this machine, not a coordinate anyone `
        + `can look up. ${MSYS_REMEDY}`,
      );
    }
  }
  // `?? []` because a rule may legitimately carry no scope (see NORMATIVE_EXEMPT); every other
  // plane has already been refused above if this is empty.
  const appliesTo = (input.appliesTo ?? []).map((s) => (typeof s === 'string'
    ? { axis: s.split('=')[0], value: s.split('=').slice(1).join('=') }
    : s));
  for (const s of appliesTo) {
    if (!s.axis || s.value === undefined || s.value === '') {
      throw new CaptureRefused(`capture refused: scope must be axis=value; got ${JSON.stringify(s)}`);
    }
  }

  // Delivery addresses. Normalized like anchors so the same string matches whichever field it was
  // written in, and deliberately absent from the fingerprint below: identity is (anchors, scope),
  // and a delivery address that could collide two facts would make the cheapest improvement
  // available -- saying where a fact is wanted -- into a thing that refuses entries.
  const arrivesAt = (Array.isArray(input.arrivesAt) ? input.arrivesAt : [input.arrivesAt])
    .filter(Boolean)
    .map((a) => (typeof a === 'string' ? { coordinate: a } : a));
  for (const a of arrivesAt) {
    if (LOOKS_LIKE_A_LOCAL_PATH.test(String(a.coordinate ?? ''))) {
      throw new CaptureRefused(
        `capture refused: arrival coordinate "${a.coordinate}" is a path on this machine. ${MSYS_REMEDY}`,
      );
    }
  }

  const fp = fingerprint({ subject: input.subject, anchors, appliesTo, plane });
  let existing = findByFingerprint(base, fp, plane);
  if (existing && ignoreId && existing.data.id === ignoreId) existing = null;
  if (existing && existing.data.status !== 'active') {
    // The fingerprint belongs to a WITHDRAWN entry. Two different situations, and answering both
    // the same way is what made every merge a dead end: the writer was refused, pointed at a
    // retired file, and then refused again by the remedy the message named.
    const survivor = survivorOf(base, existing);
    if (survivor) {
      // Retired INTO something. The fact is still held; it is held elsewhere. Refuse against the
      // entry that is actually served, so `confirm` and `dispute` both work on what they are given.
      existing = survivor;
    } else {
      // Retired and replaced by nothing: the fact was withdrawn on purpose. A later observation of
      // it is not a duplicate, it is evidence the withdrawal was wrong -- the one thing that could
      // reopen the question. Refusing here would make a withdrawn fact unrecordable forever, so the
      // capture goes through and says what it walked past.
      process.stderr.write(
        `note: ${existing.data.id} held these coordinates under this scope and was retired.
` +
        `  Nothing supersedes it, so this is recorded as a new fact rather than refused.
` +
        `  If the retirement was wrong, read ${existing.rel} before trusting either.
`,
      );
      existing = null;
    }
  }
  if (existing) {
    // The base already holds a fact about these coordinates under this scope. Whether this capture
    // agrees with it is not something the text can be asked -- so the writer is.
    throw new CaptureRefused(
      `capture refused: ${existing.data.id} already ${plane === 'flow'
        ? 'reaches this goal at this scope'
        : plane === 'normative'
          ? `carries the rule ${ruleIdOf(input.subject)}`
          : 'holds a fact about these coordinates under this scope'}.\n` +
        `  existing subject : ${existing.data.subject}\n` +
        (existing.data.question === undefined ? '' : `  existing question: ${existing.data.question}\n`) +
        `  confirmations    : ${confirmationsOf(existing.data)}${isDisputed(existing.data) ? `, disputed (${disputesOf(existing.data)})` : ''}\n` +
        `  Read ${existing.rel}, then say which this is:\n` +
        `    kb confirm ${existing.data.id} --deployment <env> --note "<what you saw>"   (your observation agrees)\n` +
        `    kb dispute ${existing.data.id} --deployment <env> --note "<what you saw instead>"\n` +
        `  If it is neither, your scope is wider than your claim: capture again with the axis that separates them.`,
      { collidesWith: existing.data.id, fingerprint: fp, path: existing.rel },
    );
  }

  const id = mintId(input.subject);
  const clash = loadEntry(base, id);
  if (clash) {
    // Same id, different fingerprint: two different facts hashing to one number. Never merged
    // quietly -- that would be the one failure the id scheme exists to make impossible.
    throw new CaptureRefused(
      `capture refused: id ${id} is already held by a DIFFERENT fact ("${clash.data.subject}"). ` +
        'Two facts must not share an id. Change the subject.',
      { collidesWith: id },
    );
  }

  const source = input.source ? sourceRef(base, input.source, sourceTools) : null;
  const stamp = source ? { pin: null, platformVersion: null, source: 'read-from-source' } : stampOf(base, input);
  const firstRow = evidenceRow({
    deployment: input.deployment,
    pin: stamp.pin,
    platformVersion: stamp.platformVersion,
    by: input.by ?? writerParty(),
    from: transcriptionSource(input.from, { root: base }),
    at: input.at ?? now(),
    source,
  });

  // A TRANSCRIBED RULE HAS BEEN SEEN BY NOBODY, and its first row must not say otherwise.
  //
  // `partiesOf` counts a `from` artefact as a party, and it is right to: an arm's report IS an
  // observation, badly recorded. A page of rules is not. `business-logic.md` asserts that tax is
  // computed after discounts; nobody watched that happen on this deployment by writing the page,
  // and 216 rules arriving at one party each would put the whole imported plane one confirmation
  // away from a licence to act on it unverified.
  //
  // So the row is kept in full -- it says which page, which commit, which session -- and marked
  // `attested: false`, which is the flag this base already has for a row that records something
  // nobody described. It does not vote. The rule reads 0 parties until somebody watches it hold
  // and says what they saw, which is exactly the bar every other entry here clears.
  //
  // Passing `--deployment` or `--source` opts out: then the writer did watch it, or did read the
  // code that decides it, and the row is evidence of the ordinary kind.
  if (plane === 'normative' && !input.deployment && !source) {
    firstRow.attested = false;
    firstRow.whyNot = `transcribed from ${input.from ?? 'a page'}; nobody has yet watched this rule hold on a deployment`;
  }

  const data = {
    id,
    subject: input.subject,
    plane,
    question: input.question,
    status: 'active',
    refutableBy: input.refutableBy,
    appliesTo,
    anchors,
    ...(arrivesAt.length ? { arrivesAt } : {}),
    evidence: [firstRow],
  };
  const body = `\n${String(input.claim).trim()}\n`;
  writeEntry(base, data, body);
  const artifacts = rebuildCapturedArtifacts(base, data.plane);
  // What the DERIVED plane already says about these same coordinates. Computed on every capture and
  // never acted on: an observation contradicting a generated contract is often the most valuable
  // thing in the corpus, and only the writer can tell that from a misreading. See coordinates.mjs.
  return {
    id,
    fingerprint: fp,
    path: `${storeOf(plane).dir}/${id}.md`,
    artifacts,
    stamp,
    derived: derivedFacts(base, anchors),
    unreachable: unreachableAnchors(base, anchors),
  };
}

// A repeat capture raises the count on the entry that exists. It never creates a second file, and
// what it appends is an observation event -- so the count and the version range stay readable off
// the same list rather than off a counter someone has to remember to increment.
/**
 * Say where an entry that already exists should ARRIVE.
 *
 * `capture` can write a delivery address, but 78 entries were written before the field existed and
 * the whole value of it is retrofitting them: `/sign-in` was visited 19 times across the archived
 * logs with nothing arriving, while four entries that answer sign-in questions sat in the corpus
 * anchored elsewhere. A field only new entries can use would have taken twelve more runs to matter.
 *
 * It writes no evidence row. Saying where a fact is wanted is not a second sighting of it, and a
 * verb that quietly raised the confirmation count would make the cheapest edit in the tool also the
 * easiest way to inflate trust. `amend` made the same choice for the same reason.
 *
 * A REASON IS REQUIRED, as it is for `reanchor`. A delivery address is a claim about where somebody
 * will need this, and an unexplained one is indistinguishable from a coordinate pasted into the
 * wrong entry.
 */
export function addArrival(base, id, { at, reason } = {}) {
  const entry = loadEntry(base, id);
  if (!entry) throw new CaptureRefused(`no entry ${id}`);
  if (!at) throw new CaptureRefused('refused: --at is required — the coordinate an agent would be standing on');
  if (!reason) {
    throw new CaptureRefused(
      'refused: --reason is required. A delivery address says somebody will need this fact HERE, '
      + 'and one without a reason cannot be told from a coordinate pasted into the wrong entry.',
    );
  }
  if (entry.data.status !== 'active') {
    throw new CaptureRefused(`refused: ${id} is ${entry.data.status}; delivering a withdrawn fact is worse than not delivering it`);
  }
  if (LOOKS_LIKE_A_LOCAL_PATH.test(String(at))) {
    throw new CaptureRefused(`refused: "${at}" is a path on this machine, not a coordinate. ${MSYS_REMEDY}`);
  }
  const key = normalizeAnchor(at);
  if (!key) throw new CaptureRefused(`refused: "${at}" does not normalize to a coordinate`);
  const already = [...(entry.data.arrivesAt ?? []), ...(entry.data.anchors ?? [])]
    .some((a) => normalizeAnchor(a?.coordinate) === key);
  if (already) {
    throw new CaptureRefused(`refused: ${id} already arrives at "${at}" — as a delivery address or as an anchor, which delivers too`);
  }
  entry.data.arrivesAt = [...(entry.data.arrivesAt ?? []), { coordinate: at }];
  writeEntry(base, entry.data, entry.body);
  const artifacts = rebuildCapturedArtifacts(base, entry.data.plane);
  return { id, at, reason, arrivesAt: entry.data.arrivesAt.map((a) => a.coordinate), artifacts };
}

export function confirm(base, id, input, { now = () => new Date().toISOString() } = {}) {
  const entry = loadEntry(base, id);
  if (!entry) throw new CaptureRefused(noWritableEntry(base, id));
  if (entry.data.status !== 'active') {
    const survivor = survivorOf(base, entry);
    throw new CaptureRefused(
      `${id} is ${entry.data.status}; confirming it would revive a fact that was withdrawn.` +
        (survivor ? ` Its fact is held by ${survivor.data.id} — confirm that instead.` : ' Nothing supersedes it: capture what you observed as a new fact.'),
      survivor ? { supersededBy: survivor.data.id } : {},
    );
  }
  // `--source` is the other way to back an existing claim: somebody went and read the code that
  // decides it. It is NOT a confirmation and the verb says so -- `evidenceKinds` keeps the counts
  // apart and `experientialTrust` refuses to call one of each `confirmed`. It is recorded on the
  // entry all the same, because the alternative is a second entry saying the same thing with a
  // different provenance, which is the duplicate the fingerprint exists to prevent.
  if (!input.deployment && !input.source) {
    throw new CaptureRefused(
      'confirm refused: --deployment is required — a confirmation with no observation behind it is '
        + 'not a confirmation. If you READ the code that decides this rather than watching it happen, '
        + 'pass --source <Module.Id>:<path> instead: that is recorded as evidence of a different kind '
        + 'and does not raise the confirmation count.',
    );
  }

  const source = input.source ? sourceRef(base, input.source, sourceTools) : null;

  // A CONFIRMATION MUST SAY WHAT WAS SEEN. `dispute` has required this since it was written, on the
  // grounds that a contradiction nobody described cannot be resolved by anyone; the same argument
  // applies to agreement and the verb did not make it. Round four's arm confirmed an entry about
  // order timestamps at the end of a pricing task, in a batch of three one second apart, and the
  // row was indistinguishable from a sighting — provenance was tool-set and honest, `by` proved who
  // wrote it, and nothing could show that nothing was observed. The entry read `confirmed` and the
  // round-five register would have licensed the next agent to act on it unverified.
  //
  // `--source` is exempt: a source row already names the module, the installed version and the path
  // that was read, which is what a note would have said.
  if (!source && !input.note) {
    throw new CaptureRefused(
      'confirm refused: --note is required — say what you saw that agrees with this entry. A row '
        + 'that records agreement and describes nothing is a sighting nobody can check, and it '
        + 'counts toward the `confirmed` level that lets the next reader act without re-verifying. '
        + 'If you read the code rather than watching it happen, pass --source <Module.Id>:<path>.',
    );
  }

  const stamp = source ? { pin: null, platformVersion: null, source: 'read-from-source' } : stampOf(base, input);
  entry.data.evidence = [...entry.data.evidence, evidenceRow({
    deployment: input.deployment,
    pin: stamp.pin,
    platformVersion: stamp.platformVersion,
    by: input.by ?? writerParty(),
    from: transcriptionSource(input.from, { root: base }),
    at: input.at ?? now(),
    note: input.note,
    source,
  })];
  writeEntry(base, entry.data, entry.body);
  rebuildCapturedArtifacts(base, entry.data.plane);
  return { id, confirmations: confirmationsOf(entry.data), kinds: evidenceKinds(entry.data), observedOn: observedOn(entry.data), stamp, source };
}

// A dispute is an observation that contradicts. It lands ON the entry rather than beside it,
// because two records about one coordinate under one scope that disagree are a disagreement about
// one fact -- and a corpus that holds them as two entries answers with whichever it retrieves
// first, silently.
export function dispute(base, id, input, { now = () => new Date().toISOString() } = {}) {
  const entry = loadEntry(base, id);
  if (!entry) throw new CaptureRefused(noWritableEntry(base, id));
  // A retired entry is served by nothing, so a dispute written onto it is a contradiction recorded
  // where no reader will ever meet it -- quieter than a refusal and worse. `confirm` has always
  // refused here; the two verbs disagreeing about retirement was the asymmetry that let a writer
  // through into silence.
  if (entry.data.status !== 'active') {
    const survivor = survivorOf(base, entry);
    throw new CaptureRefused(
      `${id} is ${entry.data.status}; a dispute on it would be recorded where nothing serves it.` +
        (survivor ? ` Its fact is held by ${survivor.data.id} — dispute that instead.` : ' Nothing supersedes it, so there is nothing left to contradict.'),
      survivor ? { supersededBy: survivor.data.id } : {},
    );
  }
  if (!input.deployment) throw new CaptureRefused('dispute refused: --deployment is required');
  if (!input.note) throw new CaptureRefused('dispute refused: --note is required — a dispute must say what was seen instead, or it cannot be resolved by anyone');

  const stamp = stampOf(base, input);
  entry.data.evidence = [...entry.data.evidence, evidenceRow({
    deployment: input.deployment,
    pin: stamp.pin,
    platformVersion: stamp.platformVersion,
    by: input.by ?? writerParty(),
    from: transcriptionSource(input.from, { root: base }),
    at: input.at ?? now(),
    contradicts: true,
    note: input.note,
  })];
  const body = `${entry.body.replace(/\s+$/, '')}\n\n**Disputed.** ${input.note} — observed on \`${input.deployment}\`.\n`;
  writeEntry(base, entry.data, body);
  rebuildCapturedArtifacts(base, entry.data.plane);
  return { id, disputes: disputesOf(entry.data), confirmations: confirmationsOf(entry.data), stamp };
}

export function retire(base, id, { reason, supersededBy } = {}) {
  const entry = loadEntry(base, id);
  if (!entry) throw new CaptureRefused(noWritableEntry(base, id));
  if (!reason) throw new CaptureRefused('retire refused: --reason is required — an entry that vanishes without one is indistinguishable from a mistake');
  entry.data.status = 'retired';
  if (supersededBy) {
    if (!loadEntry(base, supersededBy)) throw new CaptureRefused(`retire refused: --superseded-by ${supersededBy} is not an entry in this base`);
    entry.data.supersededBy = supersededBy;
  }
  const pointer = supersededBy ? ` Superseded by ${supersededBy}.` : '';
  const body = `${entry.body.replace(/\s+$/, '')}\n\n**Retired.** ${reason}${pointer}\n`;
  writeEntry(base, entry.data, body);
  const artifacts = rebuildCapturedArtifacts(base, entry.data.plane);
  return { id, artifacts };
}

/**
 * Correct a coordinate an entry is filed under, without touching what it says.
 *
 * WHY A VERB OF ITS OWN. Three entries in this corpus are anchored on coordinates that resolve to
 * nothing -- `Mutations.deleteOrganizationContact` written after watching a Delete button, where
 * the schema has `Mutations.deleteContact`; `Promotion.isActive` beside four Promotion fields
 * that exist; `GET /api/platform/security/users/id` missing the `/{id}` that makes it a route.
 * Every one of them reads exactly like a real coordinate and is reachable by nothing.
 *
 * Nothing could fix them. `supersede` mints a new id from the subject, so correcting an address
 * meant destroying the number other entries cite -- and one of the three, KB-4A8606CA, is cited by
 * KB-FA724D31. The only moves available were to leave a known-wrong address in place or to break a
 * reference, and for a day the base did the first.
 *
 * AN ANCHOR IS NOT A CLAIM. It is where the claim is filed. Changing it alters neither what the
 * entry asserts nor who observed it, so the id -- which is minted from the subject and is what
 * makes a citation durable -- has no business changing with it. That is the whole argument for
 * editing in place here and against it everywhere else in this file.
 *
 * THE FINGERPRINT DOES MOVE, and that is the one real hazard. Identity is (normalized anchors,
 * scope), so correcting an address can make an entry collide with a different entry that was
 * already there -- exactly the duplicate the door exists to refuse. It is refused here too, by the
 * same rule and against the served survivor, rather than being written and found later by a gate.
 */
export function reanchor(base, id, { was, now: to, reason, drop = false } = {}) {
  const entry = loadEntry(base, id);
  if (!entry) throw new CaptureRefused(noWritableEntry(base, id));
  if (!was || (!to && !drop)) throw new CaptureRefused('reanchor refused: --was and --now are both required (or --was with --drop)');
  if (!reason) {
    throw new CaptureRefused(
      'reanchor refused: --reason is required. A coordinate that changes without one is '
      + 'indistinguishable from a typo introduced by the correction.',
    );
  }
  if (entry.data.status !== 'active') {
    const survivor = survivorOf(base, entry);
    throw new CaptureRefused(
      `reanchor refused: ${id} is ${entry.data.status}`
      + (survivor ? `; its fact is held by ${survivor.data.id}, correct that instead` : ''),
    );
  }

  const from = normalizeAnchor(was);
  const anchors = entry.data.anchors ?? [];
  const hit = anchors.findIndex((a) => normalizeAnchor(a?.coordinate) === from);
  if (hit === -1) {
    throw new CaptureRefused(
      `reanchor refused: ${id} is not anchored on "${was}". It carries: `
      + anchors.map((a) => a.coordinate).join(', '),
    );
  }
  if (!drop && normalizeAnchor(to) === from) {
    throw new CaptureRefused(`reanchor refused: "${was}" and "${to}" normalize to the same coordinate, so nothing would change`);
  }

  // REMOVING ONE IS THE SAME ACT AS MOVING IT, and it is here because the corpus contains addresses
  // that should never have been addresses: `Admin SPA: Contacts > Companies and contacts` is a menu
  // path, and `kb validate` says of one what nothing could then do — "nothing can raise one, no diff
  // notices that a blade moved, keep the path in the body and anchor on the call the screen makes".
  // Both entries carrying one ALREADY anchor on that call as well, so the menu path is a leftover;
  // without this the only ways to drop it were to leave it or to rewrite the entry and destroy the
  // id. An advisory nobody can act on is how a gate's notices become scenery.
  //
  // THE LAST ANCHOR CANNOT GO. `capture` refuses an entry with none — a fact filed under no
  // coordinate is unreachable by every path except full-text luck — and a verb that could leave one
  // in a state its own door would not accept is a verb that breaks the corpus quietly.
  if (drop && anchors.length < 2) {
    throw new CaptureRefused(
      `reanchor refused: "${was}" is the only anchor ${id} carries, and an entry filed under no `
      + 'coordinate is one nothing can reach. Correct it with --now instead, or retire the entry.',
    );
  }

  // The hash goes with the old coordinate. It was taken over the thing at the old address, and
  // carrying it forward would claim this entry had been checked against the new one.
  const next = drop ? anchors.filter((_, i) => i !== hit) : anchors.map((a, i) => (i === hit ? { coordinate: to } : a));

  // The plane goes in, and for a flow that makes this whole check a no-op -- correctly. A flow is
  // identified by its goal, so moving an anchor cannot collide it with anything, and computing the
  // anchor fingerprint here would have compared a flow against facts on a rule that does not apply
  // to it. Latent from the day the flow plane shipped; no flow has been reanchored yet.
  const fp = fingerprint({ subject: entry.data.subject, anchors: next, appliesTo: entry.data.appliesTo, plane: entry.data.plane });
  let clash = findByFingerprint(base, fp, entry.data.plane);
  if (clash && clash.data.id === id) clash = null;
  if (clash && clash.data.status !== 'active') clash = survivorOf(base, clash);
  if (clash) {
    throw new CaptureRefused(
      `reanchor refused: at "${to}" this entry would have the same normalized anchors and scope as `
      + `${clash.data.id} (${clash.data.subject}), which by the identity rule makes them one fact. `
      + 'Either the correction is wrong, or these two entries need reconciling -- `kb consolidate` shows the group.',
      { clash: clash.data.id },
    );
  }

  entry.data.anchors = next;
  const note = drop
    ? `**Anchor dropped.** \`${was}\` — ${reason}`
    : `**Anchor corrected.** \`${was}\` → \`${to}\` — ${reason}`;
  const body = `${entry.body.replace(/\s+$/, '')}\n\n${note}\n`;
  writeEntry(base, entry.data, body);
  const artifacts = rebuildCapturedArtifacts(base, entry.data.plane);
  return { id, was, now: drop ? null : to, dropped: drop, fingerprint: fp, artifacts };
}

/**
 * Correct or complete ONE STEP of a flow, keeping the goal, the id and the fingerprint.
 *
 * WHY THIS IS A VERB, and it is the `reanchor` argument one level along. An anchor is an address
 * rather than a claim, so correcting one must not destroy the id others cite. A flow's STEPS are
 * not its identity either -- its GOAL is -- so fixing a step must not destroy it either. Before
 * this, it did: `supersede` mints the id from the subject, and a flow's subject is the one thing
 * that does not change when step 4 turns out to be incomplete.
 *
 * MEASURED, not anticipated. Two consecutive runs walked KB-AFB2D3C5, found gaps, and could record
 * neither:
 *
 *   run 08  step 4 omits selecting a shipping address (its own account had a default, so it did
 *           not bite) and names one of the store's two delivery options
 *   run 09  the step that says this storefront has no `/checkout` route -- `/checkout/completed`
 *           exists as the post-placement landing page
 *
 * `dispute` was wrong for all three: it is for a claim an observation contradicts, and an omission
 * contradicts nothing. Both runs confirmed the flow and put the gap in a report instead, which is
 * where knowledge goes to be archived and never read. One gap survived only because its author
 * filed it separately as an ordinary fact.
 *
 * IT WRITES NO EVIDENCE ROW, and that is deliberate. `confirmationsOf` counts rows as independent
 * observations that AGREE with the entry, and somebody amending it partly did not. Run 09 confirmed
 * this flow and would have amended it in the same breath; one walk would then have counted twice.
 * So the amendment carries its own stamp where it is written, `kb confirm` stays the separate and
 * honest act for "I walked it and it held", and the count keeps meaning exactly what it meant.
 *
 * FLOWS ONLY. On a fact the claim IS the entry: text that is wrong is `dispute`, text that is
 * superseded is `supersede`, and appending to a claim would make its evidence rows attest to
 * sentences their observers never saw. A flow is the one thing here that is improved without
 * becoming a different thing.
 */
export function amend(base, id, input = {}) {
  const { step, note, at, by } = input;
  const entry = loadEntry(base, id);
  if (!entry) throw new CaptureRefused(`no entry ${id}`);
  if (entry.data.plane !== 'flow') {
    throw new CaptureRefused(
      `amend refused: ${id} is on the ${entry.data.plane} plane, and amend is for flows only.\n`
      + '  A fact\'s claim IS the entry. If an observation contradicts it, `kb dispute`; if you know\n'
      + '  better than it, `kb supersede`. Appending to a claim would make its evidence rows attest\n'
      + '  to sentences their observers never saw.',
    );
  }
  if (entry.data.status !== 'active') {
    const survivor = survivorOf(base, entry);
    throw new CaptureRefused(
      `amend refused: ${id} is ${entry.data.status}`
      + (survivor ? `; the procedure is held by ${survivor.data.id}, amend that instead` : ', and a withdrawn procedure is not improved'),
    );
  }
  if (!step) {
    throw new CaptureRefused(
      'amend refused: --step is required. Name the step this corrects, so a reader of that step\n'
      + '  meets the correction rather than finding it at the bottom of a page.\n'
      + '  An amendment that belongs to no step is not a step correction -- it is a fact about the\n'
      + '  platform, and `kb capture` is the door for one.',
    );
  }
  if (!note) {
    throw new CaptureRefused(
      'amend refused: --note is required. It is the amendment itself -- what the step should say,\n'
      + '  in the words of somebody who has just watched it not work.',
    );
  }
  // REFUSED, exactly as `capture` refuses it, and this was missing for the verb's first two days.
  // The doc comment above promised that "the amendment carries its own stamp where it is written"
  // -- and it only did when somebody happened to pass --deployment, which nothing asked for. Both
  // amendments written by runs 10 and 11 landed unstamped, so a correction to a procedure said
  // nothing about where or on what version it had been seen.
  //
  // That is this base's oldest defect in a new place: a field that exists while nothing asks for it.
  // It is the 54-of-54 unversioned evidence rows again, and the M3 no-defaults rule one level up.
  // The two amendments already written stay as they are, for the same reason those 54 rows did.
  if (!input.deployment) {
    throw new CaptureRefused(
      'amend refused: --deployment is required. An amendment says a step does not work, and a\n'
      + '  correction nobody can date or place is a correction the next reader cannot weigh --\n'
      + '  a step may have been right on the version it was written against and wrong on yours.\n'
      + '  `capture` refuses without it for the same reason; this verb did not, for two days.',
    );
  }

  const stamp = stampOf(base, input);
  const when = at ?? new Date().toISOString();
  const where = [
    input.deployment ?? null,
    stamp.platformVersion ? `platform ${stamp.platformVersion}` : null,
    by ?? null,
  ].filter(Boolean).join(', ');

  // An ERRATA SECTION, not an edit in place. Rewriting the step would leave every evidence row
  // above attesting to text its observer never walked, which is the same defect this verb exists
  // to avoid on the other side. Errata are a form every reader already understands, and each one
  // names its step so it can be attached to the right place rather than read as a footnote.
  const has = /\n## Amendments\n/.test(entry.body);
  const line = `- **Step ${step}** — ${note}${where ? `  \n  _observed ${where} · ${when}_` : `  \n  _${when}_`}`;
  const body = has
    ? `${entry.body.replace(/\s+$/, '')}\n${line}\n`
    : `${entry.body.replace(/\s+$/, '')}\n\n## Amendments\n\n`
      + 'Corrections to individual steps, each from somebody who walked this and found it wanting.\n'
      + 'The steps above are as first written; read these with them.\n\n'
      + `${line}\n`;

  writeEntry(base, entry.data, body);
  const artifacts = rebuildCapturedArtifacts(base, entry.data.plane);
  return { id, step, artifacts, stamp };
}

/**
 * Replace an entry with a better one, in a single act.
 *
 * WHY THIS IS A VERB. Correcting yourself was already possible -- capture the new fact, then
 * retire the old one with --superseded-by -- and in four runs nobody ever did it. Run 04 wrote a
 * causal clause at 17:52, learned at 18:01 that it was wrong, wrote the correct entry, and left
 * the first one served. Not carelessness: two verbs, in the right order, while the work is still
 * open, and `dispute` -- the verb that comes to mind -- is written for contradicting SOMEONE ELSE.
 * There was no move that means 'I know more now than when I wrote that'.
 *
 * CAPTURE FIRST, RETIRE SECOND, and the order is load-bearing. The capture can be refused -- for a
 * fingerprint collision, a missing input, a joined scope value -- and retiring first would leave
 * the base with the old fact withdrawn and nothing in its place. Failing the other way round is
 * survivable and visible: the new entry exists, the old one is still served, and the caller is
 * told in as many words which half did not happen.
 *
 * The old entry is RETIRED, not deleted. Its id stays resolvable and its body keeps the reason and
 * a pointer to the survivor, so a report that cited it a week ago still leads a reader somewhere
 * true instead of nowhere.
 */
export function supersede(base, oldId, input, opts = {}) {
  const old = loadEntry(base, oldId);
  if (!old) throw new CaptureRefused(`supersede refused: ${noWritableEntry(base, oldId)}`);
  if (old.data.status === 'retired') {
    const survivor = survivorOf(base, old);
    throw new CaptureRefused(
      `supersede refused: ${oldId} is already retired${survivor && survivor.data.id !== oldId ? `, superseded by ${survivor.data.id}` : ''}. ` +
        'Supersede the entry that is actually being served.',
    );
  }
  if (!input.reason) {
    throw new CaptureRefused(
      'supersede refused: --reason is required. It is the one sentence a later reader has for why ' +
        'the old entry stopped being true, and it is the whole difference between a correction and ' +
        'a fact quietly disappearing.',
    );
  }

  const written = capture(base, input, { ...opts, ignoreId: oldId });
  try {
    retire(base, oldId, { reason: input.reason, supersededBy: written.id });
  } catch (e) {
    throw new CaptureRefused(
      `captured ${written.id}, but retiring ${oldId} failed: ${e.message}
` +
        `The new fact IS in the base. The old one is still served. Retire it by hand:
` +
        `  kb retire ${oldId} --reason "…" --superseded-by ${written.id}`,
      { wrote: written.id },
    );
  }
  return { ...written, superseded: oldId, artifacts: rebuildCapturedArtifacts(base, old.data.plane) };
}
