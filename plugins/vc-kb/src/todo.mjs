// What can actually be DONE about the open loop, sorted by what it would take.
//
// `kb demand` lists questions that were asked with nothing written back. It has listed them for
// days and the list has grown, because a list of complaints is not a list of work: every row looks
// the same and every row looks like it needs the deployment.
//
// It does not. Sorted by what answering would cost, the 25 open rows fall into four piles, and
// three of them can be emptied offline:
//
//   CHECK        the base answers it now -- but the MISS contract has drifted, so the answer may
//                be an entry that merely shares the words. Costs one reader deciding, which is why
//                each row prints what the served entry CLAIMS to answer beside what was asked.
//   PROCEDURE    a flow answers it. `ask` refuses it now and points at `kb how`; the row is open
//                because it was asked of the wrong verb. Costs one command.
//   SOURCE       a MISS, and the contract names the module whose code decides it, at the version
//                installed here. Costs reading one file on GitHub -- no deployment, no stand.
//   STAND        a MISS with nothing to go on. Only a run against the deployment can settle it.
//
// The split is the point. Before this, "25 open questions" was a number that made the loop look
// hopeless; the same 25 sorted this way say how many afternoons it is.
//
// THE FIRST VERSION CALLED THE FIRST PILE "ANSWERED" AND SAID IT WAS FREE. It had 24 of the 25
// rows in it and told the reader there was almost nothing to do. A hand check of all 24 on
// 2026-09-16 found roughly a third of those answers adjacent rather than right -- "sign in to the
// Admin platform UI" answered with platform GraphiQL, "taxTotal zero" with a cart-configuration
// mutation. The planner had inherited the defect it was planning around, and a work queue that
// lies in the reassuring direction is worse than no queue.
//
// EVERY COMMAND IT PRINTS CARRIES THE QUESTION VERBATIM, and that is not cosmetic: a demand row
// closes on the question's WORDING. A capture written with a rephrased question leaves the row
// open forever and the loop slowly fills with work that was already done.

import { ask, how, openBase } from './resolve.mjs';
import { openQuestions } from './demand.mjs';

/**
 * Sort the open loop into what it would take to close each row.
 *
 * Read-only: it calls the resolver through the module API, which writes nothing. The demand row
 * that `bin/kb.mjs ask` appends is written by the CLI, and this is not it -- a planner that logged
 * a question every time it planned would grow the list it is planning.
 */
export function plan(base) {
  // NO BASE IS NOT AN EMPTY LOOP, and the first version said it was. Pointed at a directory that
  // does not exist it printed "the demand loop is empty. Nothing was asked and left unanswered."
  // and exited 0 -- the most reassuring sentence the tool can produce, for the worst state it can
  // be in. Found by tripping over it: exporting MSYS_NO_PATHCONV=1 for a whole shell stops Git Bash
  // converting a Unix-style `--base /c/...`, Node resolves it to a path that is not there, and the
  // loop came back clean while `kb demand` two lines later listed four open rows.
  //
  // `ask` has never had this failure, because ADR §9.5 makes it report `degraded` -- an absence of
  // the BASE and an absence of COVERAGE are different answers and a caller must be able to tell
  // them apart. A planner is exactly where that distinction matters most: it is read as "there is
  // nothing to do".
  const opened = openBase(base);
  if (opened.degraded) {
    return { degraded: opened.degraded, rows: [], check: [], procedure: [], source: [], stand: [] };
  }
  const rows = openQuestions(base).map((q) => {
    const a = ask(base, q.question, { limit: 3 });
    if (!a.miss) {
      // The served entry's OWN `question` field travels with it, and that is the whole value of
      // this pile. The MISS contract has drifted (measurements/kb-missdrift-2026-09/): the base
      // answers questions it has nothing for, with entries that share the words. No rule tested
      // separates the two -- thirteen candidates, each either missing the bad answers or
      // destroying the good ones -- so the judgement is handed to a reader, with the one line that
      // makes it a one-second judgement: what the entry claims to answer, beside what was asked.
      return {
        ...q,
        kind: 'check',
        by: a.results.map((r) => ({ id: r.id, subject: r.subject, answers: r.question })),
      };
    }
    if (a.procedural?.length) {
      return { ...q, kind: 'procedure', by: a.procedural };
    }
    const h = how(base, q.question, { limit: 2 });
    if (!h.miss) return { ...q, kind: 'procedure', by: h.results.map((r) => ({ id: r.id, subject: r.subject })) };
    if (a.source?.length) return { ...q, kind: 'source', modules: a.source };
    return { ...q, kind: 'stand' };
  });
  const of = (kind) => rows.filter((r) => r.kind === kind);
  return {
    rows,
    check: of('check'),
    procedure: of('procedure'),
    source: of('source'),
    stand: of('stand'),
  };
}

// A capture command with the question already in it. Printed rather than run: what the claim SAYS
// is the one thing no tool can fill in, and a door that offered to is a door that would be used to
// write a plausible sentence.
export const captureCommand = (q, module) =>
  `kb capture --question ${JSON.stringify(q)} \\\n`
  + `    --subject "<a short noun phrase for what you found>" \\\n`
  + `    --claim "<what the code actually says>" \\\n`
  + `    --refutable-by observation \\\n`
  + `    --anchor "<the route or Type.field it is about>" --scope "surface=rest" \\\n`
  + `    --source ${module}:<path/in/repo>`;

export function renderPlan(p) {
  const out = [];
  if (p.degraded) {
    out.push("TODO (degraded) — this is not an empty loop, it is an absent base.");
    out.push(`  ${p.degraded.reason}`);
    out.push("  Nothing about the demand loop can be said until the base is readable.");
    return out.join('\n');
  }
  const n = p.rows.length;
  if (!n) {
    out.push('TODO — the demand loop is empty. Nothing was asked and left unanswered.');
    return out.join('\n');
  }
  out.push(`${n} open question(s), sorted by what closing each one would take:`);
  out.push('');
  out.push(`  ${String(p.check.length).padStart(3)}  the base ANSWERS now      — CHECK each: the answer may merely share the words`);
  out.push(`  ${String(p.procedure.length).padStart(3)}  a PROCEDURE answers       — asked of the wrong verb`);
  out.push(`  ${String(p.source.length).padStart(3)}  answerable from SOURCE    — read one file, no deployment`);
  out.push(`  ${String(p.stand.length).padStart(3)}  needs the DEPLOYMENT      — nothing offline can settle these`);

  if (p.check.length) {
    out.push('');
    out.push('CHECK — the base answers these now. It also answers questions it has nothing for, with');
    out.push('entries that share the words, so each row prints what the served entry CLAIMS to answer.');
    out.push('If the two are about the same thing, drop the row. If they are not, the row is real work.');
    for (const r of p.check) {
      const top = r.by[0];
      out.push(`  ${r.key}  asked   : ${r.question.slice(0, 92)}`);
      out.push(`                @kb(${top.id}) answers: ${String(top.answers ?? '(no question field)').slice(0, 92)}`);
      out.push(`                same thing?  yes -> kb demand drop ${r.key} --reason "answered by ${top.id} since it was asked"`);
    }
  }
  if (p.procedure.length) {
    out.push('');
    out.push('A PROCEDURE ANSWERS IT — `ask` refuses these now and points here.');
    for (const r of p.procedure) {
      out.push(`  ${r.key}  ${r.question.slice(0, 96)}`);
      out.push(`      kb how ${JSON.stringify(r.question)}`);
    }
  }
  if (p.source.length) {
    out.push('');
    out.push('ANSWERABLE FROM SOURCE — the contract names the module, at the version installed here.');
    out.push('Read the file, then capture what it says with the question WORDED EXACTLY as below, or');
    out.push('the row stays open.');
    for (const r of p.source) {
      out.push(`  ${r.key}  ${r.question.slice(0, 96)}`);
      for (const m of r.modules) {
        out.push(`      ${m.module} ${m.version}  ${m.tree ?? '(no repository on record)'}`);
      }
      out.push(`      ${captureCommand(r.question, r.modules[0].module).split('\n').join('\n      ')}`);
    }
  }
  if (p.stand.length) {
    out.push('');
    out.push('NEEDS THE DEPLOYMENT — a MISS with no module behind it. Only a run can settle these, and');
    out.push('until one does, they are the honest measure of what this base does not cover.');
    for (const r of p.stand) out.push(`  ${r.key}  ${r.question.slice(0, 104)}`);
  }
  out.push('');
  out.push('Nothing here writes to the corpus or touches a deployment. It reads the loop and says what');
  out.push('each row would cost.');
  return out.join('\n');
}
