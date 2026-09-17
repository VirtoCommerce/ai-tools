#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extract, Skipped } from '../src/extract.mjs';
import { ask, how, flowsMatching, renderAnswer } from '../src/resolve.mjs';
import { deliver } from '../src/deliver.mjs';
import { parseEntry } from '../src/frontmatter.mjs';
import { validate } from '../src/validate.mjs';
import {
  capture, supersede, confirm, dispute, retire,
  reanchor, amend, addArrival, CaptureRefused, rebuildCapturedArtifacts,
  readCaptured, readRules, confirmationsOf, evidenceKinds, disputesOf, isDisputed, loadEntry, CAPTURED_DIR, CAPTURE_HELP, stampNotice,
} from '../src/capture.mjs';
import { consolidate, renderConsolidation, MergeRefused } from '../src/consolidate.mjs';
import { plan, renderPlan } from '../src/todo.mjs';
import { writtenNeighbours } from '../src/coordinates.mjs';
import { ruleIdOf, ruleDomainOf, severityOf, byDomain } from '../src/rules.mjs';
import { record } from '../src/journal.mjs';
import {
  recordAsk, recordUses, recordSettled, closeQuestions, openQuestions, buriedQuestion, dropQuestion,
  unconfirmedUses, loopBanner,
} from '../src/demand.mjs';
import { OWNED_ROOTS, OWNED_FILES, DERIVED_ENTRIES } from '../src/planes.mjs';
import { resolveBase, baseNotFoundMessage, baseProvenance, managedBaseDir } from '../src/base.mjs';
import { sync, renderSync, ageNotice, SyncRefused } from '../src/sync.mjs';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_BASE = resolveBase();

const VERB_HELP = { capture: CAPTURE_HELP };

// What version the observation just written was stamped against. Printed on every write that adds
// an evidence row, and printed LOUDLY when it could not be stamped -- an unversioned row is not a
// failure the writer will notice otherwise, and 54 consecutive ones is how this defect survived.
function printStamp(stamp) {
  if (!stamp) return;
  if (stamp.source === 'pin') {
    console.log(`  version     : ${stamp.platformVersion ?? '(none in pin.json)'}  pin ${stamp.pin ?? '—'}  (stamped from derived/pin.json)`);
    return;
  }
  if (stamp.source === 'supplied') {
    console.log(`  version     : ${stamp.platformVersion ?? '—'}${stamp.pin ? `  pin ${stamp.pin}` : ''}  (you supplied it)`);
    return;
  }
  const notice = stampNotice(stamp);
  if (notice) console.log(`  ${notice}`);
}

// Help is not a verb, and must not leave a line in the journal. The journal is this measurement's
// ground truth about what an agent did; a `capture --help` recorded as a capture would say it
// wrote something down when it was reading the manual -- and the one number the whole experiment
// turns on is how often agents write.
const HELP_FLAGS = new Set(['--help', '-h']);
const asksForHelp = (argv) => !argv[0] || HELP_FLAGS.has(argv[0])
  || (Boolean(VERB_HELP[argv[0]]) && argv.slice(1).some((x) => HELP_FLAGS.has(x)));

const USAGE = `kb — the knowledge base tool

The six verbs (ADR §13.3). Everything else on this page serves them.

  kb ask         "<question>"                 what is TRUE: the derived and experiential planes
  kb how         "<question>"                 what to DO: the flow plane, and nothing else
  kb deliver     "<question>" [--json]        the consumer form: a citable block, or an explicit MISS
  kb capture     --subject … --question … --claim … --anchor … --scope … --deployment …
                                              record something learned by doing
                                              — kb capture --help: what belongs in each
                                              — add --flow to record a PROCEDURE instead of a fact:
                                                --subject becomes the goal and alone decides identity,
                                                --claim becomes the steps. Served by kb how only.
  kb show        <id>                         open ONE entry by id. What the catalog needs: when the
                                              written register is handed over whole, a reader picks a
                                              line and opens it. A rule opens by the id its author
                                              gave it: kb show BL-CART-003.
  kb rules       [<domain>]                   the NORMATIVE plane: what must hold, as opposed to what
                                              was seen. No argument lists the domains; a domain prints
                                              its rules. A rule is written with
                                              kb capture --rule --subject "<ID> <title>", and is
                                              identified by that ID and nothing else.
  kb consolidate [--merge <id>,<id>]          group entries by shared coordinate; merge a named group
  kb dispute     <id> --deployment … --note … record an observation that contradicts an entry
  kb retire      <id> --reason …              withdraw an entry; the id stays, the entry leaves the index
  kb supersede   <id> --reason … --subject …  replace an entry you now know better than, in one act
  kb arrives     <id> --at … --reason …       say WHERE a fact should arrive, which is not where
                                              it is ABOUT. Writes no evidence row and cannot
                                              change an entry's identity.
  kb reanchor    <id> --was … --now … --reason …  correct a coordinate an entry is filed under,
                                              leaving the claim, the id and the evidence untouched
  kb amend       <id> --step … --note …       correct ONE STEP of a flow, keeping its goal and id.
                                              Flows only: a fact's claim IS the entry, so use
                                              dispute or supersede for one. Writes no evidence row —
                                              amending is not agreeing; confirm separately if it held.

Supporting:

  kb confirm     <id> --deployment … --note … a repeat observation; raises the count, writes no second entry
  kb refute      [--baseline]                  do licensed claims still stand on published coordinates
  kb sync        [--ref <branch>]             fetch the base onto this machine, or bring the
                                              checkout up to date. One clone per machine, at
                                              ~/.claude/vc-knowledge; every project reads it
  kb extract     [--env <name>]               regenerate the derived plane from a deployment
  kb check       [--env <name>]               regenerate in memory and byte-compare
  kb validate                                 gate the corpus on disk; needs no deployment
  kb reindex                                  rebuild the captured AND flow indexes and catalogs from disk
  kb stat                                     what the corpus currently holds
  kb demand      [drop <key> --reason …]      questions asked with nothing written back, and
                                              observations served that nobody has confirmed

Common: [--base <path>]  [--json]  [--limit <n>]
Journalling: with VC_MEASURE_OUT set, every invocation is recorded and every consultation
adds a question row. A row needs its phase, which the door cannot know: [--phase <phase>],
or KB_PHASE. Nothing is defaulted, so without one the row is skipped and says so.

An extractor that cannot reach a deployment reports SKIPPED and exits 3. It never reports a pass.
A capture that lands on a fact the base already holds is REFUSED and exits 4; it is never merged
silently, because whether two claims about one coordinate agree is not something text can be asked.
`;

const REPEATABLE = new Set(['anchor', 'scope', 'arrivesAt']);
const FLAGS = {
  '--env': 'env', '--base': 'base', '--limit': 'limit',
  '--subject': 'subject', '--question': 'question', '--claim': 'claim',
  '--anchor': 'anchor', '--arrives-at': 'arrivesAt', '--scope': 'scope', '--refutable-by': 'refutableBy',
  '--deployment': 'deployment', '--pin': 'pin', '--platform-version': 'platformVersion',
  '--source': 'source',
  // `kb demand buried --entry <id>`: the entry that should have been served and was not.
  '--entry': 'entry',
  // `--by` and `--at` USED TO BE HERE and are refused now. Fifteen rows in the live corpus said
  // `by: round2-arm-B` with a timestamp rounded to the minute the arm ran; no arm ever ran a
  // writing verb, so every one was the author typing a witness name. The tool sets both fields.
  //
  // `--from` is what those rows should have said: the report the claim was READ OUT OF, as a path
  // that has to exist. A reader can open it and disagree, which is the property a typed author
  // name never had, and it is what `partiesOf` counts for independence.
  '--from': 'from',
  '--note': 'note', '--reason': 'reason',
  '--superseded-by': 'supersededBy',
  // reanchor. `--now` is the corrected coordinate and never a timestamp: nothing in this CLI takes
  // a clock reading, and the pair reads as a sentence at the point of use -- was X, now Y.
  '--was': 'was', '--now': 'now',
  // amend. `--step` names which step of a flow the correction belongs to.
  '--step': 'step',
  '--phase': 'phase', '--class': 'class',
};

function args(argv) {
  const out = { _: [], anchor: [], scope: [], arrivesAt: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--flow') out.flow = true;
    else if (a === '--rule') out.rule = true;
    else if (a === '--baseline') out.baseline = true;
    else if (a === '--merge') out.merge = String(argv[++i]).split(/[,\s]+/).filter(Boolean);
    else if (FLAGS[a]) {
      const key = FLAGS[a];
      const value = argv[++i];
      if (REPEATABLE.has(key)) out[key].push(value);
      else out[key] = value;
    } else out._.push(a);
  }
  if (out.limit !== undefined) out.limit = Number(out.limit);
  return out;
}

// What the extractor owns is declared once, in planes.mjs, alongside where each plane lives.

function ownedFiles(base) {
  const out = [];
  const walk = (rel) => {
    const abs = join(base, rel);
    if (!existsSync(abs)) return;
    for (const name of readdirSync(abs)) {
      if (name === '.gitkeep') continue;
      const childRel = `${rel}/${name}`;
      if (statSync(join(abs, name)).isDirectory()) walk(childRel);
      else out.push(childRel);
    }
  };
  for (const r of OWNED_ROOTS) walk(r);
  for (const f of OWNED_FILES) if (existsSync(join(base, f))) out.push(f);
  return out;
}

function reportStats(s) {
  console.log(`  deployment pin  : ${s.pin}${s.platformVersion ? ` (platform ${s.platformVersion})` : ''}`);
  console.log(`  documents       : ${s.documents}` + (s.aggregate.length ? `, of which aggregate: ${s.aggregate.join(', ')}` : ''));
  console.log(`  coordinates     : ${s.coordinates} distinct (the aggregate document's copies deduplicated by the owner each operation declares)`);
  console.log(`  graphql roots   : query=${s.graphqlRoots.query} mutation=${s.graphqlRoots.mutation} subscription=${s.graphqlRoots.subscription}`);
  console.log(`  entries         : ${s.entries}  (rest ${s.restEntries} · graphql ${s.graphqlEntries} · no-REST-surface ${s.noRestEntries})`);
  console.log(`  versions        : ${s.versionsKnown ? 'read from the module inventory' : 'UNAVAILABLE — every appliesTo omits its version'}`);
  console.log(`  pre-release     : ${s.prerelease.length ? s.prerelease.map((p) => `${p.module}@${p.version}`).join(', ') : 'none installed'}`);
  console.log(`  unresolved      : ${s.unresolved.length}`);
  for (const u of s.unresolved.slice(0, 10)) console.log(`      ${u.coordinate}: ${u.reason}`);
}

// What the journal keeps of a served entry: which one, from which plane, at what trust. Never
// the body -- the body is in the base, and a log that copies it is stale the moment the entry
// moves, while claiming to be a record of what was served.
const servedOf = (results) => (results ?? []).map((r) => ({
  id: r.id,
  plane: r.plane,
  trust: r.trust?.level ?? null,
  confirmations: r.trust?.confirmations ?? null,
  disputed: Boolean(r.disputed),
}));

function refused(e) {
  console.error(e.message);
  return e.collidesWith ? 4 : 2;
}

// One place where a read touches the loop. A MISS becomes a question the base is on the hook for;
// an experiential entry served becomes something someone owes an answer about. Both are recorded
// beside the base rather than in this process, because every mechanism that relied on an agent
// remembering has so far failed -- measured, three runs running.
//
// Never throws and never changes an exit code, for the same reason the journal does not: a
// bookkeeping file that can fail the answer it is bookkeeping about is worse than no file.
function noteLoop(base, question, miss, served) {
  try {
    recordAsk(base, question, { miss });
    recordUses(base, served);
  } catch {
    // deliberately silent
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = args(rest);
  const base = a.base ?? DEFAULT_BASE;

  // Per-verb help for the one verb whose difficulty is not its syntax. `capture` is where an agent
  // decides whether what it just learned is worth recording at all, and that judgement is the one
  // thing no gate downstream can check -- so its guidance lives with the verb, read at the moment
  // of the decision, rather than in a brief read before the work started.
  if (asksForHelp(process.argv.slice(2))) {
    console.log(VERB_HELP[cmd] ?? USAGE);
    return 0;
  }

  // BEFORE THE BASE GATE, because this is the one verb whose entire job is that there is no base
  // yet. Everything else needs one; this is how a machine gets one.
  if (cmd === 'sync') {
    try {
      const r = sync({ dir: a.dir ?? a.base ?? managedBaseDir(), ref: a.ref });
      console.log(renderSync(r));
      if (r.action === 'cloned') {
        console.log('  every project on this machine now reads this corpus — `kb stat` names it');
      }
      return 0;
    } catch (e) {
      if (e instanceof SyncRefused) { console.error(e.message); return 2; }
      throw e;
    }
  }

  // After the help pages, because `kb --help` must work on a machine that has no base yet, and
  // before every verb, because there is no verb that can do anything useful without one.
  if (!base) {
    console.error(baseNotFoundMessage({ explicit: a.base }));
    return 2;
  }

  if (cmd === 'extract' || cmd === 'check') {
    let result;
    try {
      result = await extract({ base, root: HERE, testEnv: a.env ?? process.env.TEST_ENV, write: cmd === 'extract' });
    } catch (e) {
      if (e instanceof Skipped) {
        console.error(`SKIPPED — ${e.message}`);
        console.error('Not a pass. The corpus on disk is unchanged and says nothing about this run.');
        return { code: 3, outcome: { detail: { skipped: e.message } } };
      }
      throw e;
    }

    if (cmd === 'extract') {
      console.log('EXTRACTED');
      reportStats(result.stats);
      console.log(`  written to      : ${base}`);
      return { code: 0, outcome: { detail: { pin: result.stats.pin, entries: result.stats.entries } } };
    }

    // check: byte-compare every generated file against what is committed
    const diffs = [];
    for (const [rel, contents] of result.files) {
      const abs = join(base, rel);
      if (!existsSync(abs)) {
        diffs.push(`${rel}: missing on disk`);
        continue;
      }
      const onDisk = readFileSync(abs);
      if (!onDisk.equals(Buffer.from(contents))) diffs.push(`${rel}: differs (${onDisk.length} bytes on disk, ${Buffer.byteLength(contents)} regenerated)`);
    }
    // And the other direction, over EVERY path the extractor owns -- not just the entry files. A generated
    // file the extractor stops producing is invisible to a one-directional compare: it simply stays
    // in the corpus forever, and the gate keeps saying OK. That happened here once, to derived-ids.json.
    for (const rel of ownedFiles(base)) {
      if (!result.files.has(rel)) diffs.push(`${rel}: in the corpus but not regenerated`);
    }

    if (diffs.length) {
      console.error(`CHECK FAILED — ${diffs.length} file(s) differ`);
      for (const d of diffs.slice(0, 25)) console.error(`  ${d}`);
      if (diffs.length > 25) console.error(`  … +${diffs.length - 25}`);
      return { code: 1, outcome: { detail: { differ: diffs.length } } };
    }
    console.log(`CHECK OK — ${result.files.size} generated files byte-match the corpus`);
    reportStats(result.stats);
    return { code: 0, outcome: { detail: { files: result.files.size, pin: result.stats.pin } } };
  }

  if (cmd === 'validate') {
    const r = validate(base);
    // Notices print on a PASS as well as a failure, and after the verdict rather than before it.
    // They are not problems -- a corpus with twelve of them is a working corpus that has something
    // in it worth a look -- so they must never be mistaken for the reason a gate went red, and they
    // must not be invisible on the green run, which is every run.
    const printNotices = (write) => {
      if (!r.notices?.length) return;
      write(`${r.notices.length} notice(s) — nothing failed; a corpus working as intended with something worth a second look:`);
      for (const n of r.notices.slice(0, 20)) write(`  · ${n}`);
      if (r.notices.length > 20) write(`  … +${r.notices.length - 20}`);
    };
    if (!r.ok) {
      console.error(`VALIDATE FAILED — ${r.problems.length} problem(s) over ${r.entries} derived, ${r.captured} captured and ${r.rules ?? 0} rule entries`);
      for (const p of r.problems.slice(0, 40)) console.error(`  ${p}`);
      if (r.problems.length > 40) console.error(`  … +${r.problems.length - 40}`);
      printNotices((m) => console.error(m));
      return { code: 1, outcome: { detail: { ok: false, problems: r.problems.length, notices: r.notices?.length ?? 0, derived: r.entries, captured: r.captured } } };
    }
    console.log(`VALIDATE OK — ${r.entries} derived, ${r.captured} captured, ${r.flows ?? 0} flow(s), ${r.rules ?? 0} rule(s), at ${base}`);
    printNotices((m) => console.log(m));
    return { code: 0, outcome: { detail: { ok: true, notices: r.notices?.length ?? 0, derived: r.entries, captured: r.captured } } };
  }

  // OPEN AN ENTRY BY ID. The verb the catalog needs: when the written register is handed over whole
  // in the prompt, a reader picks a line and opens it, and there was no way to do that except
  // `cat`ting a path. It also gives the measurement an exact open event in the journal rather than
  // a guess parsed out of shell commands.
  if (cmd === 'show') {
    const id = (a._[0] ?? '').toUpperCase();
    if (!id) {
      console.error('kb show <id> — open one entry from the catalog by its id');
      return 2;
    }
    let entry;
    try {
      entry = loadEntry(base, id);
    } catch { entry = null; }
    // A RULE IS REACHED BY THE ID ITS AUTHOR GAVE IT. `BL-CART-003` is what 23 places in the
    // consuming plugin's prompts and a column in every regression suite cite, and the point of
    // keeping that string in the subject rather than renaming 216 rules is that those citations
    // keep resolving. The base's own id is still `KB-<hex>`; this is a lookup, not a second
    // namespace. Exact match on the leading id, never a prefix search over subjects, so
    // `BL-CART-01` cannot quietly open `BL-CART-010`.
    if (!entry && ruleIdOf(id)) {
      const wanted = ruleIdOf(id);
      const hit = readRules(base).find((e) => ruleIdOf(e.data.subject) === wanted);
      if (hit) entry = hit;
    }
    if (!entry) {
      console.error(`kb show: ${id} is not in ${base}. Ids in the catalog are exact; check the line you read it from.`);
      return 1;
    }
    const d = entry.data;
    console.log(`${d.id}  ${d.subject}   [${d.plane ?? 'experiential'}]`);
    console.log(`  question   : ${d.question ?? '—'}`);
    console.log(`  trust      : ${confirmationsOf(d)} confirmation(s)${isDisputed(d) ? `, DISPUTED (${disputesOf(d)})` : ''}`);
    console.log(`  appliesTo  : ${(d.appliesTo ?? []).map((s) => `${s.axis}=${s.value}`).join(' ') || '—'}`);
    console.log(`  refutableBy: ${d.refutableBy ?? '—'}`);
    console.log(`  path       : ${entry.rel}`);
    console.log('');
    console.log(entry.body.trim());
    return { code: 0, outcome: { served: [{ id, plane: entry.data.plane ?? 'experiential' }], detail: { verb: 'show' } } };
  }

  // RETRIEVAL OFF — the treatment of round four, set by the arm's settings file and nowhere else.
  //
  // The catalog of written entries goes into the agent's prompt instead, and it is meant to REPLACE
  // the search rather than sit beside it: a reader who can fall back to a query never has to read
  // the list, and the run would measure a mixture. Fourteen ranking rules failed on vocabulary that
  // a reader crosses without noticing, so the thing being tested is the reader's judgement over a
  // list they can see in full.
  //
  // Writing verbs are untouched. The loop still closes.
  if (process.env.KB_RETRIEVAL_OFF === '1' && ['ask', 'how', 'deliver'].includes(cmd)) {
    console.error(`kb ${cmd} is off in this session. The written catalog is in your brief — read it and open an entry by id.`);
    console.error('  node bin/kb.mjs show <id>, or open captured/<id>.md directly.');
    console.error('  This is the treatment being measured, not a fault. `capture`, `confirm` and `dispute` still work.');
    return 2;
  }

  if (cmd === 'ask') {
    const q = a._.join(' ').trim();
    if (!q) {
      console.error('kb ask needs a question');
      return 2;
    }
    const res = ask(base, q, { limit: a.limit ?? 3 });
    console.log(a.json ? JSON.stringify(res, null, 2) : renderAnswer(res));
    // A POINTER, never a merged result. `ask` and `how` read disjoint corpora on purpose, so the
    // only thing that may cross is a sentence saying the other one has something -- shown when this
    // plane came up empty, where a reader is about to go and find out the hard way.
    if (res.miss && !res.degraded && !a.json) {
      const flows = flowsMatching(base, q);
      if (flows.length) {
        console.log('');
        console.log(`The FLOW plane holds ${flows.length} procedure${flows.length === 1 ? '' : 's'} matching this. Facts and procedures`);
        console.log('are searched separately, so ask for one with the verb that serves it:');
        for (const f of flows.slice(0, 3)) console.log(`  @kb(${f.id})  ${f.subject}`);
        console.log(`  kb how "${q}"`);
      }
    }
    // PROBING THE LIVE BASE FROM HERE WRITES. The loop is wired in the CLI rather than in ask()
    // precisely so the replay harness can call the library without depositing 34 questions -- and
    // the same escape is the one to use when checking something by hand. I have now recorded two of
    // my own probes as somebody's unmet demand, in two consecutive sessions, the second an hour
    // after writing the commit about the first. Use `node -e` against the library, or --base a copy.
    noteLoop(base, q, res.miss && !res.degraded, servedOf(res.results));
    return {
      code: res.miss ? (res.degraded ? 3 : 1) : 0,
      outcome: {
        question: q,
        miss: res.miss,
        degraded: Boolean(res.degraded),
        served: servedOf(res.results),
        detail: { limit: a.limit ?? 3 },
      },
    };
  }

  // `kb how` is `kb ask` for procedures, and it exists because a separate INDEX was measured not to
  // be enough: derived and captured already have separate indexes and still compete, since `ask`
  // merges both by raw score. Two verbs over disjoint corpora is what actually removes the
  // competition -- see planes.mjs for the 18-of-34 measurement that bought this.
  if (cmd === 'how') {
    const q = a._.join(' ').trim();
    if (!q) {
      console.error('kb how needs a question — what are you trying to get done?');
      console.error('It searches procedures only. For a fact about the platform, use `kb ask`.');
      return 2;
    }
    const res = how(base, q, { limit: a.limit ?? 2 });
    console.log(a.json ? JSON.stringify(res, null, 2) : renderAnswer(res));
    noteLoop(base, q, res.miss && !res.degraded, servedOf(res.results));
    return {
      code: res.miss ? (res.degraded ? 3 : 1) : 0,
      outcome: {
        question: q,
        miss: res.miss,
        degraded: Boolean(res.degraded),
        served: servedOf(res.results),
        detail: { limit: a.limit ?? 2, plane: 'flow' },
      },
    };
  }

  if (cmd === 'deliver') {
    const q = a._.join(' ').trim();
    if (!q) {
      console.error('kb deliver needs a question');
      return 2;
    }
    const d = deliver(base, q, { limit: a.limit ?? 2 });
    console.log(a.json ? JSON.stringify(d, null, 2) : d.block);
    noteLoop(base, q, !d.hit && !d.degraded, d.citations ?? []);
    return {
      code: d.hit ? 0 : (d.degraded ? 3 : 1),
      outcome: {
        question: q,
        miss: !d.hit,
        degraded: Boolean(d.degraded),
        // `citations` already carries exactly what servedOf builds, minus the on-disk path, which
        // is a fact about this checkout rather than about the answer.
        served: (d.citations ?? []).map(({ path, ...rest }) => rest),
        detail: { limit: a.limit ?? 2 },
      },
    };
  }

  for (const banned of ['--by', '--at']) {
    if (rest.includes(banned)) {
      console.error(`${banned} refused: the tool writes who wrote a row and when, and a writer cannot type either.`);
      console.error('  Fifteen rows in this corpus once said `by: round2-arm-B`, timestamped to that arm run.');
      console.error('  No arm ever ran a writing verb; the author had typed the witness. Three entries reached');
      console.error('  `confirmed` on it, and the arrival replay read those rows as help that existed before the run.');
      console.error('');
      console.error('  If you are transcribing a claim out of a report, say so: --from <path to the report>.');
      return 2;
    }
  }

  if (cmd === 'capture') {
    // The one consumer call site: the door reads the base before it writes to it.
    //
    // The fingerprint gate below catches a fact already held under the same coordinates and scope.
    // It cannot catch a fact recorded against DIFFERENT coordinates -- three of the fifteen
    // duplicate pairs in the dedup measurement shared none -- so the writer is shown what the base
    // already says about this question first. Shown, not blocked: wording similarity was measured
    // and does not separate a duplicate from a distinct fact, so it may inform a person and must
    // never decide on its own.
    if (a.question) {
      const near = deliver(base, a.question, { limit: 2 });
      if (near.hit) {
        console.log('The base already answers something near this question:');
        console.log(near.block.split('\n').map((l) => `  ${l}`).join('\n'));
        console.log('  If one of those is the fact you are recording, confirm it instead of capturing again.');
        console.log('');
      }
    }

    // What anyone has already written about these coordinates. Shown BEFORE the write, because
    // that is the only moment it is cheap to act on: the page is still open and the writer still
    // remembers what it saw.
    //
    // It exists because of a pair the fingerprint gate was right to pass. Run 04 wrote KB-27B4CD10
    // at 17:52 and KB-4D082C89 at 18:01, sharing a coordinate but not an anchor set or a scope, so
    // two distinct facts -- which they are. The first carried a `because` the second refutes, and
    // nobody found out for a day. No gate can catch that: it takes reading two paragraphs and
    // noticing one contradicts the other, and the only party who can is the writer.
    //
    // The near-question check above would not have fired on that pair. Their wordings are nothing
    // alike; only the coordinate is shared, which is exactly what an anchor is for.
    // BOTH claim-bearing planes, since the rules arrived. What somebody RULED about this coordinate
    // is at least as worth seeing before you write as what somebody observed there -- and where the
    // two disagree, that disagreement is the most valuable thing the corpus can produce. Thirteen
    // such pairs were found the day the rules were inventoried, every one of them invisible while
    // the rules lived in another repository.
    const neighbours = writtenNeighbours(base, a.anchor);
    if (neighbours.length) {
      console.log(`${neighbours.length} entr${neighbours.length === 1 ? 'y' : 'ies'} already written about a coordinate you are anchoring on:`);
      for (const n of neighbours) console.log(`  @kb(${n.id})  ${n.subject}   — on ${n.coordinate}${n.plane === 'normative' ? '  [RULE]' : ''}`);
      console.log('  Two entries on one coordinate are usually two honest facts, and that is fine.');
      console.log('  But if your new fact makes one of them wrong, fix it now rather than leaving');
      console.log('  both served: `kb supersede <id> --subject … --claim …` replaces it and keeps the trail.');
      // A RULE IS NOT SUPERSEDED BY AN OBSERVATION, and pointing a writer at `supersede` for one
      // would let a single sighting quietly rewrite a constraint somebody reasoned out. What an
      // observation can do to a rule is contradict it, on the record, with both sides kept.
      if (neighbours.some((n) => n.plane === 'normative') && !a.rule) {
        console.log('  One of those is a RULE — what must hold, not what somebody saw. If what you');
        console.log('  observed contradicts it, that is `kb dispute <id> --deployment … --note …`, not');
        console.log('  a supersede: a rule and an observation disagreeing is a finding, and both sides stay.');
      }
      console.log('');
    }
    try {
      const r = capture(base, {
        subject: a.subject, question: a.question, claim: a.claim, refutableBy: a.refutableBy,
        anchors: a.anchor, arrivesAt: a.arrivesAt, appliesTo: a.scope, flow: a.flow, rule: a.rule,
        deployment: a.deployment, pin: a.pin, platformVersion: a.platformVersion, from: a.from, source: a.source,
      });
      console.log(`${a.rule ? 'RULE ' : a.flow ? 'FLOW ' : ''}CAPTURED ${r.id}`);
      for (const d of closeQuestions(base, { question: a.question, id: r.id })) {
        console.log(`  closed      : an open question asked ${d.asked} time(s) — "${d.question}"`);
      }
      console.log(`  path        : ${r.path}`);
      console.log(`  fingerprint : ${r.fingerprint}  ${a.rule
        ? '(the rule ID + scope; two rules about one coordinate are the normal case)'
        : a.flow
          ? '(the goal + scope; the steps are not its identity)'
          : "(coordinates + scope; the claim's wording is deliberately not in it)"}`);
      console.log(`  ${a.rule ? 'rules       ' : a.flow ? 'flows       ' : 'captured    '}: ${r.artifacts.active} active, ${r.artifacts.retired} retired`);
      printStamp(r.stamp);
      // The derived plane already describes some of these coordinates. Shown after the write, not
      // before it: the observation is recorded either way, and what the writer does next -- confirm
      // it, dispute it, or find they misread a signature -- is a judgement no tool can make. This
      // is the check that was missing when a captured entry said Query.cart took all-optional
      // arguments while the derived entry beside it, generated from introspection, said two were
      // required, and the base served the wrong one above the right one.
      if (r.derived.length) {
        console.log('');
        console.log(`  The derived plane already describes ${r.derived.length === 1 ? 'this coordinate' : 'these coordinates'}:`);
        for (const d of r.derived) console.log(`    ${d.coordinate}  ->  @kb(${d.id}) ${d.subject}   ${d.path}`);
        console.log('  It is regenerated from the deployment, so on a contract it is the stronger source.');
        console.log('  Read it. If your observation disagrees, that disagreement is worth recording -- say so');
        console.log(`  with \`kb dispute\`, rather than leaving two entries that answer the same question differently.`);
      }
      // AND WHICH ANCHORS NOTHING WILL BE ABLE TO RAISE. Said here, to the person who has just been
      // looking at the screen, because they are the only party who can tell a misspelling from a
      // surface this base has never extracted. `kb validate` says the same thing over the whole
      // corpus, which is a day too late and to the wrong reader: the three it found had been sitting
      // in the base since the runs that wrote them.
      const invented = r.unreachable.filter((u) => u.kind === 'invented');
      const menuPaths = r.unreachable.filter((u) => u.kind === 'menu-path');
      if (invented.length || menuPaths.length) console.log('');
      for (const u of invented) {
        console.log(`  ANCHOR NAMES NOTHING: "${u.coordinate}"`);
        console.log(`    Every other "${u.namespace}" coordinate in this base resolves; this one does not.`);
        console.log('    If you read it off a signature, check the spelling. If you inferred it from a button,');
        console.log('    anchor on what you actually saw -- an anchor that looks reached and is not is worse');
        console.log('    than none, because nothing will ever raise the entry.');
      }
      for (const u of menuPaths) {
        console.log(`  ANCHOR IS A MENU PATH: "${u.coordinate}"`);
        console.log('    Nothing raises a breadcrumb: no diff notices that a blade moved. Keep the path in the');
        console.log('    body, where it helps a reader reach the screen, and anchor on the call the screen makes.');
      }
      return {
        code: 0,
        outcome: {
          wrote: { id: r.id, fingerprint: r.fingerprint },
          anchors: a.anchor,
          scope: a.scope,
          // What the writer was TOLD about the anchors themselves, beside what the base already
          // said about the coordinates. Recorded for the same reason crossPlane is: a capture whose
          // anchor was flagged and kept is a different act from one where nothing was flagged.
          unreachable: r.unreachable,
          // What the writer was SHOWN about these coordinates. Without it the log records that a
          // capture happened and not that the base argued with it, so an observation recorded in
          // the face of a contradicting contract is indistinguishable from one recorded where the
          // base had nothing to say. That distinction is the whole point of the cross-plane read.
          crossPlane: r.derived.map((d) => ({ id: d.id, subject: d.subject, coordinate: d.coordinate })),
        },
      };
    } catch (e) {
      // A refusal is the most informative thing the door produces, so it is recorded WHOLE. The
      // message names the entry it collided with and the remedy it offers, and whether that
      // remedy is reachable at all is the question the journal exists to answer.
      if (e instanceof CaptureRefused) {
        return {
          code: refused(e),
          outcome: {
            refused: { reason: e.message, collidesWith: e.collidesWith ?? null },
            anchors: a.anchor,
            scope: a.scope,
          },
        };
      }
      throw e;
    }
  }

  if (cmd === 'supersede') {
    const oldId = a._[0];
    if (!oldId) {
      console.error('kb supersede <id> --reason "why the old one stopped being true" --subject … --question … --claim … --refutable-by … --anchor … --scope … --deployment …');
      console.error('Writes the new fact and retires the old one in one act. `kb capture --help` explains the fields.');
      return 2;
    }
    try {
      const r = supersede(base, oldId, {
        subject: a.subject, question: a.question, claim: a.claim, refutableBy: a.refutableBy,
        anchors: a.anchor, arrivesAt: a.arrivesAt, appliesTo: a.scope, reason: a.reason,
        flow: a.flow, rule: a.rule,
        deployment: a.deployment, pin: a.pin, platformVersion: a.platformVersion, from: a.from, source: a.source,
      });
      console.log(`SUPERSEDED ${r.superseded} -> ${r.id}`);
      console.log(`  path        : ${r.path}`);
      console.log(`  reason      : ${a.reason}`);
      console.log(`  captured    : ${r.artifacts.active} active, ${r.artifacts.retired} retired`);
      console.log(`  ${r.superseded} keeps its id and its body, plus the reason and a pointer here, so a`);
      console.log('  report that cited it last week still leads somewhere true.');
      for (const d of closeQuestions(base, { question: a.question, id: r.id })) {
        console.log(`  closed      : an open question asked ${d.asked} time(s) — "${d.question}"`);
      }
      return { code: 0, outcome: { wrote: { id: r.id, superseded: r.superseded } } };
    } catch (e) {
      if (e instanceof CaptureRefused) {
        return { code: refused(e), outcome: { refused: { reason: e.message, collidesWith: e.collidesWith ?? null } } };
      }
      throw e;
    }
  }

  if (cmd === 'confirm' || cmd === 'dispute' || cmd === 'retire') {
    const id = a._[0];
    if (!id) {
      console.error(`kb ${cmd} needs an entry id`);
      return 2;
    }
    try {
      if (cmd === 'confirm') {
        const r = confirm(base, id, a);
        recordSettled(base, r.id);
        if (r.source) {
          // Said as what it is. A source reading backing an existing claim is evidence of a
          // different kind, and printing it as a confirmation would undo the rule in one line.
          console.log(`SOURCE-BACKED ${r.id} — read at ${r.source.module}:${r.source.version}`);
          console.log(`  ${r.source.url ?? r.source.path}`);
          console.log(`  evidence now: ${r.kinds.observation} observed, ${r.kinds.source} read from source. This did NOT raise the confirmation count: code says what should happen, an observation says what did.`);
        } else
        console.log(`CONFIRMED ${r.id} — ${r.confirmations} independent observation(s)`);
        for (const o of r.observedOn) console.log(`  ${o.deployment}${o.platformVersion ? `:${o.platformVersion}` : ''} — ${o.confirms} confirming, ${o.contradicts} contradicting`);
        printStamp(r.stamp);
        return { code: 0, outcome: { wrote: { id: r.id, confirmations: r.confirmations } } };
      }
      if (cmd === 'dispute') {
        const r = dispute(base, id, a);
        recordSettled(base, r.id);
        console.log(`DISPUTED ${r.id} — ${r.disputes} contradicting observation(s) against ${r.confirmations} confirming`);
        console.log('  The entry stays. `kb ask` now serves it at trust level "disputed" with both sides visible.');
        printStamp(r.stamp);
        return { code: 0, outcome: { wrote: { id: r.id, disputes: r.disputes } } };
      }
      const r = retire(base, id, a);
      console.log(`RETIRED ${r.id} — the id stays (ids are eternal); the entry has left the index`);
      console.log(`  captured    : ${r.artifacts.active} active, ${r.artifacts.retired} retired`);
      return { code: 0, outcome: { wrote: { id: r.id, retired: true } } };
    } catch (e) {
      if (e instanceof CaptureRefused) {
        return { code: refused(e), outcome: { refused: { reason: e.message, collidesWith: e.collidesWith ?? null } } };
      }
      throw e;
    }
  }

  // An anchor is where a claim is FILED, not part of the claim, so correcting one is neither a new
  // observation nor a new fact -- which is why it edits in place and keeps the id. Everything else
  // in this file that changes an entry either adds evidence or withdraws it.
  if (cmd === 'arrives') {
    const id = a._[0];
    if (!id) {
      console.error('kb arrives <id> --at <coordinate> --reason "who needs it there"');
      console.error('  Where a fact should ARRIVE, which is not where it is ABOUT. Writes no evidence');
      console.error('  row and cannot change identity: saying where a fact is wanted is not a sighting.');
      return 2;
    }
    try {
      const r = addArrival(base, id, { at: a.at, reason: a.reason });
      console.log(`ARRIVES ${r.id} at ${r.at}`);
      console.log(`  reason      : ${r.reason}`);
      console.log(`  delivers to : ${r.arrivesAt.join(', ')}`);
      console.log('  identity    : unchanged — a delivery address is not an anchor');
      return { code: 0, outcome: { wrote: { id: r.id, arrivesAt: r.arrivesAt } } };
    } catch (e) {
      if (e instanceof CaptureRefused) { console.error(e.message); return 4; }
      throw e;
    }
  }
  if (cmd === 'reanchor') {
    const id = a._[0];
    if (!id) {
      console.error('kb reanchor needs an entry id');
      return 2;
    }
    try {
      const r = reanchor(base, id, { was: a.was, now: a.now, reason: a.reason });
      console.log(`REANCHORED ${r.id}`);
      console.log(`  was         : ${r.was}`);
      console.log(`  now         : ${r.now}`);
      console.log(`  fingerprint : ${r.fingerprint}  (it MOVED: identity is anchors + scope)`);
      console.log(`  captured    : ${r.artifacts.active} active, ${r.artifacts.retired} retired`);
      console.log('  The id, the claim and the evidence are untouched. Anything citing this entry still resolves.');
      return { code: 0, outcome: { wrote: { id: r.id, reanchored: { was: r.was, now: r.now } } } };
    } catch (e) {
      if (e instanceof CaptureRefused) {
        return { code: refused(e), outcome: { refused: { reason: e.message, collidesWith: e.clash ?? null } } };
      }
      throw e;
    }
  }

  if (cmd === 'amend') {
    const id = a._[0];
    if (!id) {
      console.error('kb amend needs the id of a flow, --step and --note');
      return 2;
    }
    try {
      const r = amend(base, id, {
        step: a.step, note: a.note,
        deployment: a.deployment, pin: a.pin, platformVersion: a.platformVersion, from: a.from, source: a.source,
      });
      console.log(`AMENDED ${r.id}  step ${r.step}`);
      console.log(`  flows       : ${r.artifacts.active} active, ${r.artifacts.retired} retired`);
      printStamp(r.stamp);
      console.log('  The goal, the id and the fingerprint are untouched — anything citing this flow still resolves.');
      // Said here because the alternative is a writer who amends and assumes they have also
      // confirmed. They have not, on purpose: amending is partly disagreeing, and no evidence row
      // was written. Somebody who walked the rest of it successfully should say so separately.
      console.log('  NO evidence row was written. If the rest of the procedure held, `kb confirm` says so.');
      return { code: 0, outcome: { wrote: { id: r.id, amended: { step: String(r.step) } } } };
    } catch (e) {
      if (e instanceof CaptureRefused) {
        return { code: refused(e), outcome: { refused: { reason: e.message, collidesWith: null } } };
      }
      throw e;
    }
  }

  if (cmd === 'consolidate') {
    try {
      const r = consolidate(base, { merge: a.merge ?? null });
      console.log(a.json ? JSON.stringify(r, null, 2) : renderConsolidation(r));
      return { code: 0, outcome: { detail: { merged: a.merge ?? null, groups: r.groups?.length ?? null } } };
    } catch (e) {
      if (e instanceof MergeRefused) {
        console.error(e.message);
        return { code: 2, outcome: { refused: { reason: e.message, collidesWith: null } } };
      }
      throw e;
    }
  }

  // A correction to an entry that no verb made -- a coordinate mangled on the way in, a scope
  // value spelled two ways -- leaves the index and catalog behind the files. `validate` detects
  // that by rebuilding and comparing, and told the reader to run a verb that rebuilds; until this
  // one existed there was none, which is the same shape of dead end as a refusal naming a remedy
  // that refuses in turn.
  if (cmd === 'reindex') {
    const r = rebuildCapturedArtifacts(base);
    console.log(`REINDEXED — ${r.active} active, ${r.retired} retired, from the entries on disk`);
    // EVERY written plane, because a verb that rebuilds "the index" and silently means one of three
    // is how the others go stale with the gate telling you to run exactly this. It said "both" and
    // meant two until the normative plane existed; the loop is over WRITTEN_STORES now, so a fourth
    // store cannot be forgotten here the way the flow store nearly was.
    const f = rebuildCapturedArtifacts(base, 'flow');
    console.log(`             ${f.active} active flow(s), ${f.retired} retired`);
    const n = rebuildCapturedArtifacts(base, 'normative');
    console.log(`             ${n.active} active rule(s), ${n.retired} retired`);
    return { code: 0, outcome: { detail: { active: r.active, retired: r.retired, flows: f.active, rules: n.active } } };
  }

  // TIER ONE OF EXECUTABLE REFUTATION: does the ground a licensed claim stands on still exist?
  // Read-only against the corpus and the contract, and it touches no deployment — the half that
  // needs a request is a separate, authorized action. `--baseline` records what resolves today so
  // that a later extract losing a coordinate reads as ROT rather than as a coverage gap.
  if (cmd === 'refute') {
    const { refute, writeBaseline, readBaseline } = await import('../src/refute.mjs');
    if (a.baseline) {
      const doc = writeBaseline(base);
      const n = Object.keys(doc.entries).length;
      console.log(`baseline written — ${n} licensed entr(ies) with at least one resolving anchor, against ${doc.contractCoordinates} contract coordinates`);
      console.log('  Re-take it only after a `kb extract` you have read. A baseline refreshed blindly');
      console.log('  turns every rotted anchor into a new normal, which is the failure it exists to catch.');
      return { code: 0, outcome: { detail: { baselined: n } } };
    }
    const r = refute(base);
    if (!readBaseline(base)) {
      console.error('refute: no baseline. Run `kb refute --baseline` first, on a contract you trust.');
      console.error('  Without one, an anchor that never resolved and an anchor that stopped resolving');
      console.error('  are the same picture, and they are opposite findings.');
      return 2;
    }
    console.log(`refute — ${r.results.length} licensed entr(ies), baseline taken ${r.baseline.takenAt}`);
    console.log('');
    for (const e of r.results) {
      if (e.verdict === 'holds') continue;
      console.log(`  ${e.verdict.padEnd(11)} ${e.id}  ${e.subject}`);
      for (const c of e.lost) console.log(`              lost coordinate: ${c}`);
    }
    const rotted = r.counts.ROTTED ?? 0;
    console.log('');
    console.log(`  holds ${r.counts.holds ?? 0} · ROTTED ${rotted} · unprojected ${r.counts.unprojected ?? 0}`);
    // A VERDICT THAT DOES NOT NAME ITS BLIND SPOT IS READ AS A GUARANTEE. Both of these were found
    // by a reviewer trying to make the rot test fail, not by the author.
    console.log('');
    console.log('  `holds` means the coordinate is still published. It does NOT mean the claim is still');
    console.log('  true — behaviour can change under a coordinate that never moves, which is tier two and');
    console.log('  needs the deployment. It also cannot see a contract change confined to a parameter');
    console.log('  segment: /{id}, /{orderId} and /{id}-GONE are one coordinate to the normalizer.');
    if (rotted) {
      console.log('');
      console.log('A ROTTED entry is still licensed and an agent may still be told to act on it without');
      console.log('re-verifying. Re-observe it or dispute it; this verb will not do either for you,');
      console.log('because a coordinate disappearing says the ground moved, not what is true now.');
    }
    return { code: rotted ? 1 : 0, outcome: { detail: r.counts } };
  }

  // THE RULES, BY DOMAIN — the normative plane's reading door.
  //
  // It is a listing and not a search, for the same reason the written catalog is handed over whole:
  // fourteen ranking rules were swept over this corpus and none of them separated a good answer
  // from an adjacent one, while a reader picking from a list they can see makes that judgement in a
  // second. A rule is reached the way a reference is reached -- you already know you are working on
  // carts -- so the argument is a DOMAIN, and the whole domain is printed.
  //
  // With no argument it prints the domains and their counts, which is the 24-line index the session
  // hook injects. That index is level one of the three-level read: the domain list is always in
  // context, a domain is printed on demand, and a rule's body is opened by id.
  if (cmd === 'rules') {
    const all = readRules(base).filter((e) => e.data.status === 'active');
    if (!all.length) {
      console.log('The normative plane holds no rules yet.');
      console.log('  Rules are written with `kb capture --rule --subject "<ID> <title>" …` and read here by domain.');
      return { code: 0, outcome: { detail: { rules: 0 } } };
    }
    const groups = byDomain(all);
    const wanted = (a._[0] ?? '').toUpperCase();

    if (!wanted) {
      if (a.json) console.log(JSON.stringify(groups.map(([domain, rows]) => ({ domain, rules: rows.length })), null, 2));
      else {
        console.log(`${all.length} rule(s) in ${groups.length} domain(s). \`kb rules <domain>\` prints one; \`kb show <ID>\` opens one.`);
        console.log('');
        for (const [domain, rows] of groups) {
          const disputed = rows.filter((e) => isDisputed(e.data)).length;
          console.log(`  ${domain.padEnd(14)} ${String(rows.length).padStart(3)} rule(s)${disputed ? `, ${disputed} DISPUTED` : ''}`);
        }
      }
      return { code: 0, outcome: { detail: { domains: groups.length, rules: all.length } } };
    }

    // `cart`, `CART`, `BL-CART` and `bl-cart` all reach the same domain: a reader types the word
    // they are working on, not the prefix the corpus files it under.
    const match = groups.filter(([domain]) => domain.toUpperCase() === wanted || domain.toUpperCase().endsWith(`-${wanted}`));
    if (!match.length) {
      console.error(`kb rules: no domain matches "${a._[0]}". Domains: ${groups.map(([d]) => d).join(', ')}`);
      return 1;
    }
    const served = [];
    for (const [domain, rows] of match) {
      console.log(`${domain} — ${rows.length} rule(s)`);
      console.log('');
      for (const e of rows) {
        const id = ruleIdOf(e.data.subject);
        const title = String(e.data.subject).slice(String(id ?? '').length).trim();
        const sev = severityOf(e.body);
        const trust = isDisputed(e.data)
          ? `DISPUTED (${disputesOf(e.data)})`
          : `${confirmationsOf(e.data)} party(ies)`;
        console.log(`  ${id}${sev ? `  [${sev}]` : ''}`);
        console.log(`      ${title}`);
        console.log(`      ${trust} · ${e.data.anchors?.length ?? 0} anchor(s) · kb show ${id}`);
        served.push({ id: e.data.id, plane: 'normative' });
      }
      console.log('');
    }
    console.log('A rule says what MUST hold. What was SEEN to hold here is on the written plane, and');
    console.log('where a rule and an observation disagree, the disagreement is the finding — `kb dispute`.');
    return { code: 0, outcome: { served, detail: { domains: match.map(([d]) => d) } } };
  }

  if (cmd === 'stat') {
    const dir = join(base, DERIVED_ENTRIES);
    let derived = 0;
    let anchors = 0;
    if (existsSync(dir)) {
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
        const { data } = parseEntry(readFileSync(join(dir, f), 'utf8'), f);
        anchors += (data.anchors ?? []).length;
        derived++;
      }
    }
    const captured = readCaptured(base);
    const active = captured.filter((e) => e.data.status === 'active');
    const rules = readRules(base);
    const activeRules = rules.filter((e) => e.data.status === 'active');
    // WHICH base, and WHY THIS ONE. A machine can carry a workbench checkout and the project's
    // own, and a run that reads one while writing the other leaves no trace at all. Naming the
    // directory was never enough on its own -- the operator already believes they know it.
    const chose = a.base ? { dir: a.base, source: '--base' } : baseProvenance();
    console.log(`${derived} derived entries, ${anchors} anchors, at ${base}`
      + `${chose ? `  [${chose.source}]` : ''}`);
    // HOW OLD WHAT IS IN IT IS. A month-stale base answers plausibly, and a plausible stale answer
    // is worse than no answer because nothing about it looks wrong. Printed always, flagged past a
    // month; never a gate -- an old base is still a base.
    const fresh = ageNotice(base);
    if (fresh) console.log(`  ${fresh.line}`);
    console.log(`${active.length} captured entries active (${captured.length - active.length} retired) in ${CAPTURED_DIR}/`);
    if (rules.length) {
      const disputedRules = activeRules.filter((e) => isDisputed(e.data)).length;
      console.log(`${activeRules.length} rules active (${rules.length - activeRules.length} retired) in rules/`
        + `${disputedRules ? `, ${disputedRules} DISPUTED by an observation here` : ''}`);
    }
    // The two kinds of evidence, counted apart. A corpus that cannot say how much of itself was
    // read off a running system and how much out of code cannot answer the question the review
    // asked: 124 rows, every one `method: observation`, and every arm going to source anyway.
    const kinds = active.reduce((acc, e) => { const k = evidenceKinds(e.data); acc.observation += k.observation; acc.source += k.source; acc.disputes += k.disputes; return acc; }, { observation: 0, source: 0, disputes: 0 });
    console.log(`  evidence rows: ${kinds.observation} observed, ${kinds.source} read from source, ${kinds.disputes} contradicting`);
    for (const e of active) {
      console.log(`  ${e.data.id}  ${e.data.subject}  — ${confirmationsOf(e.data)} confirmation(s)` +
        `${isDisputed(e.data) ? `, DISPUTED (${disputesOf(e.data)})` : ''}` +
        `  scope: ${(e.data.appliesTo ?? []).map((s) => `${s.axis}=${s.value}`).join(' ') || '—'}`);
    }
    return {
      code: 0,
      outcome: { detail: { derived, anchors, active: active.length, retired: captured.length - active.length } },
    };
  }

  if (cmd === 'todo') {
    const p = plan(base);
    console.log(renderPlan(p));
    return {
      // 3, the same code `ask` returns for a degraded base. An absent base exiting 0 is what let
      // this print "the demand loop is empty" and be believed.
      code: p.degraded ? 3 : 0,
      outcome: { detail: { degraded: Boolean(p.degraded), open: p.rows.length, check: p.check.length, procedure: p.procedure.length, source: p.source.length, stand: p.stand.length } },
    };
  }

  if (cmd === 'demand') {
    if (a._[0] === 'buried') {
      const key = a._[1];
      if (!key || !a.entry) {
        console.error('kb demand buried <key> --entry <KB-ID> [--reason "..."]');
        console.error('  For a question whose answer the base ALREADY HELD and did not serve. Not `drop`:');
        console.error('  dropping says the question was not worth answering, which is false and deletes the');
        console.error('  signal. Every row recorded here is one more labelled case for the ranking problem.');
        return 2;
      }
      const r = buriedQuestion(base, key, { id: a.entry, reason: a.reason ?? null });
      if (!r) { console.error(`no open question matches ${key}`); return 2; }
      console.log(`BURIED ${r.key} — "${r.question}"`);
      console.log(`  ${r.id} answers it and was not served. The row is settled; the retrieval defect is now on record.`);
      return { code: 0, outcome: { detail: { buried: r.key, want: r.id } } };
    }
    if (a._[0] === 'drop' || a.reason !== undefined) {
      const key = a._[a._[0] === 'drop' ? 1 : 0];
      if (!key) {
        console.error('kb demand drop <key> --reason "why nothing was worth recording"');
        return 2;
      }
      const dropped = dropQuestion(base, key, { reason: a.reason ?? null });
      if (!dropped) {
        console.error(`no open question matches ${key}`);
        return 2;
      }
      console.log(`DROPPED ${dropped.key} — "${dropped.question}"`);
      console.log('  Recorded, not erased: how often a question is asked and then judged not worth');
      console.log('  an entry is itself worth being able to count.');
      return { code: 0, outcome: { detail: { dropped: dropped.key } } };
    }
    const open = openQuestions(base);
    const uses = unconfirmedUses(base);
    if (!open.length && !uses.length) {
      console.log('DEMAND — nothing open. Every question asked has been written back to or dropped,');
      console.log('and every observation served has been confirmed or disputed.');
      try {
        const c = consolidate(base);
        if (c.groups.length) console.log(`
${c.groups.length} group(s) of entries still share a coordinate — \`kb consolidate\` to read them together.`);
      } catch { /* never fail on bookkeeping */ }
      return { code: 0, outcome: { detail: { open: 0, unconfirmed: 0 } } };
    }
    if (open.length) {
      console.log(`${open.length} question(s) asked, with nothing written back:`);
      console.log('');
      for (const d of open) {
        console.log(`  ${d.key}  asked ${String(d.asked).padStart(2)}x${d.missed ? `, missed ${d.missed}x` : ''}  ${d.question}`);
      }
      console.log('');
      console.log('  If you found out something the base did not tell you, capture it with the SAME');
      console.log('  question wording -- that is what closes the row. If there was nothing worth');
      console.log('  recording, say so: `kb demand drop <key> --reason "..."`. That is a real outcome,');
      console.log('  and the loop needs somewhere to put it.');
      console.log('');
    }
    // The third thing a run should look at before it finishes, and the one nobody has ever run.
    // `consolidate` groups entries that name a coordinate in common, and it found run 04's
    // contradicting pair on its own the first time anyone typed it -- a day after the fact. The
    // groups are not defects: two entries about one coordinate are usually two honest facts. What
    // makes them worth a minute is that a reader asking about that coordinate gets BOTH, so if they
    // disagree, one of them is teaching the next agent something false.
    try {
      const c = consolidate(base);
      if (c.groups.length) {
        console.log(`${c.groups.length} group(s) of entries name a coordinate in common:`);
        for (const g of c.groups.slice(0, 5)) {
          console.log(`  ${g.coordinate}   ${g.members.map((m) => m.id).join(', ')}`);
        }
        if (c.groups.length > 5) console.log(`  … +${c.groups.length - 5}`);
        console.log('');
        console.log('  `kb consolidate` shows them in full. A reader asking about one of these');
        console.log('  coordinates is served every member of its group, so they had better agree.');
        console.log('  Where one is wrong, `kb supersede <id>` replaces it and keeps the trail.');
        console.log('');
      }
    } catch { /* the loop must never fail a verb over its own bookkeeping */ }

    if (uses.length) {
      console.log(`${uses.length} observation(s) served and not yet confirmed or disputed:`);
      for (const u of uses) console.log(`  ${u.id}   served ${u.at}`);
      console.log('');
      console.log('  `kb confirm <id> --deployment <name> --note "<what you saw>"` if it held, `kb dispute` if it did not.');
      console.log('  A confirmation is the only thing that moves an entry from one report to');
      console.log('  something two runs have seen.');
    }
    return { code: 0, outcome: { detail: { open: open.length, unconfirmed: uses.length } } };
  }

  console.error(`unknown command: ${cmd}\n\n${USAGE}`);
  return 2;
}

// One journal call, at the one place every verb leaves through. A verb returns either a bare
// exit code or `{ code, outcome }`; the second form is what the journal records, and a verb with
// nothing worth recording keeps the first. `record` never throws and never touches the code -- a
// journal able to fail the call it is recording would corrupt the work it exists to measure.
const journal = (cmd, code, outcome) => {
  const a = args(process.argv.slice(3));
  const base = a.base ?? DEFAULT_BASE;
  if (!base) return; // nothing was read and nothing was written; there is no journal to write to
  record({ cmd, argv: a, base, exit: code, outcome });
};

main().then((r) => {
  const cmd = process.argv[2];
  const code = typeof r === 'number' ? r : r.code;
  // The loop, said once per invocation. `demand` is excluded because it has just printed the whole
  // thing, and the help pages because nothing has happened yet.
  if (cmd && cmd !== 'demand' && !asksForHelp(process.argv.slice(2))) {
    try {
      const bannerBase = args(process.argv.slice(3)).base ?? DEFAULT_BASE;
      const banner = bannerBase && loopBanner(bannerBase);
      if (banner) console.log(`\n${banner}`);
    } catch { /* never fail a verb over its own bookkeeping */ }
  }
  if (!asksForHelp(process.argv.slice(2))) journal(cmd, code, typeof r === 'number' ? null : r.outcome);
  process.exit(code);
}, (err) => {
  console.error(err.stack ?? String(err));
  // A crash is a fact about the door, and the least likely one to be reconstructed later.
  const cmd = process.argv[2];
  // The whole message, not a first line: a crash is the one event nobody reconstructs later.
  if (!asksForHelp(process.argv.slice(2))) journal(cmd, 2, { detail: { threw: String(err.message ?? err) } });
  process.exit(2);
});
