// The door's own record: what was asked of the base, and what was written to it.
//
// TWO OUTPUTS, because a consultation and a write are different events and one shape cannot hold
// both without lying about one of them.
//
//   questions-<session>.csv   one row per CONSULTATION (`ask`, `deliver`), added by handing the
//                             row to vendor/agent-log/log-row.mjs. This is the file the step-0
//                             measurement already reads. (The joiner that consumed it,
//                             `reconcile.mjs`, stayed in vc-kb-lab -- see PORT.md.)
//   kb-log-<session>.jsonl    one line per INVOCATION -- every verb, the writes included.
//
// Why hand the row to log-row.mjs instead of writing the CSV here. It already owns the column
// set, the mutually disjoint enums, the call-count stamp read from the hook's ground-truth log,
// and a write that re-parses and compares before it returns. It also rewrites the whole file on
// every add, which makes it a SINGLE-WRITER design: a second process appending to that CSV loses
// rows. One writer, one format, and nothing here re-implements a shape that already has 84
// assertions standing behind it.
//
// THE DOOR FILLS ONLY THE HALF OF A ROW IT CAN KNOW. `add` records the question and where the
// caller is about to look; `mark` records what came back and whether it held. `held`,
// `found_elsewhere`, `used`, `reusable` and `applied` are judgments about work the door never
// sees, so they stay with the agent. A row the agent never closes stays `(pending)` and
// `log-row check` reports it -- which is itself the signal that a question was consulted and its
// outcome never recorded.
//
// WHAT THIS FILE DELIBERATELY DOES NOT WRITE. The verb log carries no question text and no served
// entry bodies -- only a hash of the question. The text belongs in the CSV, the file built to hold
// it; storing it a second time would double the surface a secret can land on and add no
// information. Coordinates and scope ARE recorded, because they are already committed inside the
// base's own entries, so the journal adds no exposure the corpus does not already have. Whatever
// remains is covered at rest by the same `scrub-scan.mjs` that covers the other artifacts in this
// directory.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { hash } from './canonical.mjs';

const LOG_ROW = fileURLToPath(new URL('../vendor/agent-log/log-row.mjs', import.meta.url));

// THE CSV HALF IS INERT WITHOUT ITS RECORDER, and says so once rather than failing per call.
// `log-row.mjs` is vendored beside this file, so on a normal install it is always there -- but the
// vendor directory is exactly the kind of thing a packager trims, and the failure mode without
// this check is a spawn error per consultation that reads like the journal is broken rather than
// absent. The verb log is written by this file directly and keeps working either way, which is the
// half that matters: an invocation is still recorded, only the question row is not.
const hasRecorder = () => existsSync(LOG_ROW);

// The verbs that CONSULT. Only these produce a question row: the CSV's columns ask what the
// answer was and whether it held, and a `capture` has no answer -- it IS one.
//
// `how` was missing here for exactly one run, and that run is the reason it is not. Run 08 asked it
// at tool call 9, got the whole order-placement procedure, and reached a placed order in 15 calls
// from /cart where run 07 took 78. That consultation -- the single most load-bearing one any run
// has made -- left NO row in the question log, which is the record the whole measurement reads to
// answer what the base contributed. A verb added to the tool and not to the instrument measures the
// base as if the verb did not exist.
const CONSULTATIONS = new Set(['ask', 'deliver', 'how']);

// Opt-in on VC_MEASURE_OUT alone, and NOT on the toolkit's own `<project>/MEASUREMENT` fallback.
// `kb` runs in checkouts that are not measuring anything; an instrument that switches itself on
// was chosen by nobody, and the first thing this one would do is create a directory in someone
// else's working tree.
export function journalDir() {
  const raw = process.env.VC_MEASURE_OUT;
  return raw && raw.trim() ? resolve(raw.trim()) : null;
}

function toolLogs(dir, wanted) {
  const out = [];
  try {
    for (const f of readdirSync(dir)) {
      const m = /^tool-log-(.*)\.jsonl$/.exec(f);
      if (!m) continue;
      if (wanted && !m[1].startsWith(wanted)) continue;
      out.push({ session: m[1], mtime: statSync(join(dir, f)).mtimeMs, host: hostOf(join(dir, f)) });
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

// NEVER GUESS WHICH SESSION THIS IS -- the same rule log-row.mjs enforces, for the same reason:
// with two sessions active, picking the newest log files this session's rows under the other
// one's id, and nothing downstream can tell. Several candidates is a refusal, not a coin toss.
//
// `stamped` is the other half of the answer. A question row needs the hook's call count, so
// without a ground-truth log there is no row -- an unstamped row is exactly the unverifiable row
// the toolkit exists to prevent. The VERB log needs nothing from the hook and is written anyway,
// which is what makes the door useful before the hook is wired.
// The harness's own session id, off the first line of a log. Read once per candidate, one line
// each, because the alternative is asking the run to tell us what the file already knows.
function hostOf(path) {
  try {
    const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
    // FIRST AND LAST, not just first. A log that began before this field existed carries no host on
    // line 1 and does carry one on every line written since -- which is exactly the authoring
    // session's log while a run is starting beside it. Reading only the head would leave the live
    // session unable to recognise its own file for as long as that log lived.
    for (const line of [lines[0], lines[lines.length - 1]]) {
      if (!line) continue;
      const host = JSON.parse(line).host;
      if (host) return host;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveSession(dir) {
  const wanted = (process.env.VC_MEASURE_SESSION || '').trim();
  let found = toolLogs(dir, wanted);
  // WHICH LOG IS MINE, answered without being told. A child process cannot see the transcript id
  // the logs are named by, but it does inherit CLAUDE_CODE_HOST_SESSION_ID -- and the hook writes
  // that into every line it emits. When exactly one candidate carries this process's host id, the
  // ambiguity the refusal below exists for does not exist, whatever else is in the directory.
  const host = (process.env.CLAUDE_CODE_HOST_SESSION_ID || '').trim();
  if (host && found.length > 1) {
    const mine = found.filter((f) => f.host === host);
    if (mine.length === 1) found = mine;
  }
  if (found.length > 1) {
    return {
      session: null,
      stamped: false,
      reason: `${found.length} ground-truth logs in ${dir} and none of them carries this session's host id (CLAUDE_CODE_HOST_SESSION_ID is ${host ? 'set but unmatched — the logs predate it' : 'not set by this harness'}); set VC_MEASURE_SESSION to the one this run is, or give each run its own VC_MEASURE_OUT`,
    };
  }
  if (found.length === 1) return { session: found[0].session, stamped: true, reason: null };
  return {
    session: wanted || 'no-hook-log',
    stamped: false,
    reason: `no tool-log-*.jsonl under ${dir}: the PostToolUse hook is not wired, so no question row is written (the verb log still is)`,
  };
}

// Which plane answered. The TOP-RANKED served entry decides, not a blend: the row records one
// source, and the entry read first is the one that shapes what the agent does next. Attributing a
// derived-first answer to the experiential plane because something experiential ranked third
// would overstate exactly the half of the base that is under test. The full served list, planes
// and all, is on the verb line, so the mix is never lost.
export function backedByOf({ miss, served } = {}) {
  if (miss || !served?.length) return 'KB-MISS';
  return served[0].plane === 'experiential' ? 'KB-EXPERIENTIAL' : 'KB-DERIVED';
}

const normalizeQuestion = (q) => String(q ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
export const questionHash = (q) => hash(normalizeQuestion(q), 12);

// Answered from this session's own verb log, which is line-delimited JSON and needs no CSV
// parser. EXACT match after normalizing case and whitespace, and nothing looser: a fuzzy match
// would answer `yes` for a question that was never asked before, and no reader of the data
// afterwards could tell that it had.
function reAskedOf(path, qhash) {
  if (!existsSync(path)) return 'no';
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      if (rec.question_hash === qhash) return 'yes';
    }
  } catch {
    return 'no';
  }
  return 'no';
}

function addQuestionRow({ dir, session, cls, backed, phase, question, method, reAsked }) {
  if (!hasRecorder()) return { ok: false, reason: `no question recorder at ${LOG_ROW}` };
  const r = spawnSync(
    process.execPath,
    [
      LOG_ROW, 'add',
      '--session', session,
      '--class', cls,
      '--backed-by', backed,
      '--phase', phase,
      '--question', question,
      '--method', method,
      '--re-asked', reAsked,
    ],
    { cwd: dir, encoding: 'utf8', env: { ...process.env, VC_MEASURE_OUT: dir } },
  );
  if (r.status === 0) return { ok: true };
  const said = (r.stderr || r.stdout || `log-row exited ${r.status}`).trim().split('\n')[0];
  return { ok: false, reason: said };
}

// The single entry point. It NEVER throws and NEVER changes an exit code: a journal that can
// break the call it is recording would corrupt the very work it exists to measure. Every failure
// leaves one line on stderr naming what was not written, because a journal that fails quietly is
// indistinguishable from a session that did nothing.
export function record({ cmd, argv, base, exit, outcome }) {
  const dir = journalDir();
  if (!dir) return { journalled: false, reason: 'VC_MEASURE_OUT is not set' };

  try {
    mkdirSync(dir, { recursive: true });
    const { session, stamped, reason } = resolveSession(dir);
    if (!session) {
      process.stderr.write(`kb journal: ${reason}\n`);
      return { journalled: false, reason };
    }

    const verbPath = join(dir, `kb-log-${session}.jsonl`);
    const consulting = CONSULTATIONS.has(cmd);
    const question = consulting ? (outcome?.question ?? null) : null;
    const qhash = question ? questionHash(question) : null;
    const backed = consulting ? backedByOf(outcome ?? {}) : null;
    const reAsked = qhash ? reAskedOf(verbPath, qhash) : 'no';

    // The verb line goes first, so `re_asked` on the row about to be added still reflects the
    // state BEFORE this question -- and so the write that matters most survives a failure in the
    // other one.
    appendFileSync(verbPath, `${JSON.stringify({
      ts: new Date().toISOString(),
      session,
      verb: cmd,
      exit,
      base,
      question_hash: qhash,
      backed_by: backed,
      re_asked: qhash ? reAsked : null,
      served: outcome?.served ?? null,
      wrote: outcome?.wrote ?? null,
      refused: outcome?.refused ?? null,
      anchors: outcome?.anchors ?? null,
      scope: outcome?.scope ?? null,
      // The derived entries the writer was shown at capture time, if any.
      cross_plane: outcome?.crossPlane ?? null,
      // The one open field, for what is specific to a verb: a validate's problem count, a
      // check's diff count, an extractor's pin, a crash's message. Open on purpose -- closing it
      // would mean a new column per verb, and a verb whose fact did not fit would then report
      // nothing at all rather than something unindexed.
      detail: outcome?.detail ?? null,
    })}\n`, 'utf8');

    if (!consulting) return { journalled: true, row: false };
    if (!stamped) {
      process.stderr.write(`kb journal: ${reason}\n`);
      return { journalled: true, row: false, reason };
    }

    // `phase` is required and is never defaulted. The door cannot know which phase of a task a
    // question was asked in, and a default would come back on every row -- making the column
    // unable to tell "it was not recorded" from "it was always this". So: no phase, no row, and
    // a line saying which flag fixes it.
    const phase = String(argv?.phase ?? process.env.KB_PHASE ?? '').trim();
    if (!phase) {
      const why = 'no phase given, so no question row was written -- pass `--phase <phase>` or set KB_PHASE';
      process.stderr.write(`kb journal: ${why}\n`);
      return { journalled: true, row: false, reason: why };
    }

    // KNOWLEDGE by default because VALUE was excluded from this base by decision, so a VALUE
    // question is out of its scope by construction. A MISS filed as KNOWLEDGE that was really a
    // VALUE question inflates the coverage denominator, and `--class VALUE` is how a caller says
    // so; the door cannot tell the two apart from the question text.
    const cls = String(argv?.class ?? 'KNOWLEDGE').trim();
    const added = addQuestionRow({
      dir,
      session,
      cls,
      backed,
      phase,
      question,
      // `method` exists so a joiner can ask whether the named lookup appears among the calls
      // in this row's window. It matches on tokens of four characters or more, so the method has
      // to be built from what the hook actually recorded -- the command line -- and from nothing
      // else. The script's own basename is the token that survives both invocation styles
      // (`node bin/kb.mjs ask`, and the `kb` bin alias, whose argv still names this file).
      //
      // The limit is deliberately NOT here. It would add the token `limit`, which any unrelated
      // call mentioning a limit would satisfy, and a spurious HIT is worse than a spurious miss:
      // a miss is visible in a report that calls itself heuristic, while a hit silently vouches
      // for a row that may never have happened. The limit is a fact about the call, and it is on
      // the verb line where facts about the call belong.
      //
      // Known gap: under the bin alias, `ask` is three characters and drops out of the token
      // filter, leaving only the basename -- which an alias command line does not contain. Those
      // rows show up in report 3. Every other verb is long enough to match on its own.
      method: `${basename(process.argv[1] ?? 'kb.mjs')} ${cmd}`,
      reAsked,
    });
    if (!added.ok) {
      process.stderr.write(`kb journal: the question row was refused -- ${added.reason}\n`);
      return { journalled: true, row: false, reason: added.reason };
    }
    return { journalled: true, row: true };
  } catch (e) {
    // Last resort. Recording is never worth failing a verb over.
    try {
      process.stderr.write(`kb journal: not written -- ${e.message}\n`);
    } catch {
      /* nothing left to try */
    }
    return { journalled: false, reason: e.message };
  }
}
