#!/usr/bin/env node
/**
 * log-row.mjs — the door an agent session writes its QUESTION log through.
 *
 * The other half of the two-log design (see tool-log.mjs). This side records what only the agent
 * can know: what it wanted to find out, where it intended to look, and whether the answer
 * survived contact with the system. It is a supplied tool rather than an instruction to
 * hand-format a table, and the shape below is the reason.
 *
 *   - EVERY FIELD IS A NAMED FLAG and the vocabularies are MUTUALLY DISJOINT. Adjacent columns
 *     in a hand-written table get transposed; here there is no adjacency, and a value in the
 *     wrong field is rejected with a message naming the field it actually belongs to.
 *   - A MISSING REQUIRED FIELD IS A LOUD REFUSAL, never a blank cell. An agent that builds its
 *     own fill-in helper will silently drop a column with it; owning the write prevents that.
 *   - MARKERS STAY IN ONE CLOSED VOCABULARY so distinct things (written late vs corrected in
 *     place) cannot quietly merge back into one.
 *   - EVERY ROW IS STAMPED WITH THE HOOK'S CURRENT TOOL-CALL COUNT. `check` then flags a row
 *     that claims an external lookup while the count did not move: the method was very probably
 *     never performed. That is detected automatically instead of by eye, and it is the whole
 *     reason the second log exists.
 *
 * TWO WRITE COMMANDS, NOT ONE, because a question and its answer are two events at two moments.
 * `add` records the question and where the agent is ABOUT to look. `mark` records what came back
 * and whether it held. Collapsing them would force `held` to carry a default, and a default of
 * HELD silently inflates the headline number of any analysis built on it. A row still pending at
 * the end is itself a result, and `check` reports it.
 *
 * Usage
 *   node log-row.mjs add  --class KNOWLEDGE --backed-by LIVE --phase locate --re-asked no
 *                         --question "..." --method "where I am about to look"
 *   node log-row.mjs mark --row 7 --answer "..." --held HELD --found-elsewhere no
 *                         [--found-via "..."] [--reusable yes] [--marker SELF-CORRECTED]
 *                         [--applied MATCHED] [--note "..."]
 *   node log-row.mjs render          # the markdown table, so nothing is hand-formatted
 *   node log-row.mjs check           # validation + the automatic sanity reports:
 *                                   #   a claimed external lookup at an unmoved call count
 *                                   #   a row never closed, or closed with no answer text
 *                                   #   UNANSWERED or CONTRADICTED-BY-ENV with no note
 *                                   #   `applied` set on a row that read nothing loaded
 *
 * The file is chosen from the ground-truth log: the single tool-log-<session>.jsonl under
 * VC_MEASURE_OUT gives the session, and the rows land in questions-<session>.csv beside it.
 * Override with --file. Two refusals, both deliberate:
 *
 *   - NO log found: an unstamped row is exactly the unverifiable row this tool exists to
 *     prevent. Pass --no-log to accept one anyway; it is written with warn=NO-HOOK-LOG, so the
 *     gap sits in the data instead of being invisible.
 *   - SEVERAL logs found: picking the newest is how a row gets attributed to a different
 *     session. Pass --session <id-prefix> or --log <path>. Better, give each session its own
 *     VC_MEASURE_OUT and exactly one candidate exists by construction.
 *
 * Zero dependencies, and it imports nothing from any repository.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const ENUMS = {
  class: ["KNOWLEDGE", "VALUE"],
  /* KB-* were added when the knowledge base itself became a source an agent consults, which is
   * the thing the base's experiment measures. Without them a base-answered row has to be filed
   * as LIVE (it was not: nothing was probed) or ASSUMED (it was not: something was read), and the
   * central number — did the base answer, or did the agent go to the deployment — stops being
   * recoverable from the log. The two planes are separate values because they age differently:
   * KB-DERIVED is regenerated from a deployment and cannot go stale unnoticed, KB-EXPERIENTIAL is
   * written once by whoever learned it and can. KB-MISS is a THIRD value rather than an outcome in
   * `held` because the row must carry it at `add` time: a base that was asked and had nothing is a
   * complete result on its own, and a row left unmarked would otherwise be indistinguishable from
   * a hit whose outcome nobody closed. */
  backed_by: ["CODE", "LIVE", "DOCS", "INSTRUCTIONS", "ASSUMED", "KB-DERIVED", "KB-EXPERIENTIAL", "KB-MISS"],
  /* A superset across task shapes: a feature investigation uses orient/locate/understand,
   * a defect reproduction uses reproduce/diagnose, a change uses change/restore. THE PROMPT
   * names only the phases that apply to the task at hand — this enum is the guard, not the
   * instruction, so a shared tool does not widen what any one session is told. */
  phase: ["orient", "locate", "understand", "reproduce", "change", "diagnose", "verify", "restore", "report"],
  used: ["yes", "no"],
  /* UNANSWERED matters more than it looks. Without it, a session that could not answer a
   * blocking question leaves a log in which every row looks fine, and the failure appears only
   * in the prose of the final report. "I asked, I tried, I got nothing" must be a first-class
   * outcome, distinct from `(pending)` (never marked), NOT-USED (answered, not acted on) and
   * CONTRADICTED (answered, then the answer failed). */
  held: ["HELD", "CONTRADICTED", "NOT-USED", "UNANSWERED"],
  reusable: ["yes", "no"],
  re_asked: ["yes", "no"],
  /* A JUDGMENT the agent makes, not something inferred from prose. Diffing "where I intended
   * to look" against "where it came from" as strings does not work: an agent restates the same
   * place in different words, so almost every row reads as divergent and the metric measures
   * phrasing. Ask for the judgment; never infer it. */
  found_elsewhere: ["yes", "no"],
  marker: ["NONE", "SELF-CORRECTED", "LATE-ENTRY", "REPAIRED"],
  applied: ["N/A", "MATCHED", "CONTRADICTED-BY-ENV", "UNTESTABLE-HERE"],
};

/* An external lookup must have cost at least one tool call. INSTRUCTIONS (it was in the brief)
 * and ASSUMED (it was not looked up at all) legitimately cost none.
 *
 * Every KB-* value is here too, including KB-MISS: consulting the base is a command like any
 * other, so a row claiming the base answered while the call count never moved is a fabricated
 * row, and that is precisely what this list makes detectable. */
const NEEDS_A_CALL = ["CODE", "LIVE", "DOCS", "KB-DERIVED", "KB-EXPERIENTIAL", "KB-MISS"];

const COLUMNS = [
  "row",
  "ts",
  "session",
  "calls",
  "class",
  "backed_by",
  "phase",
  "question",
  "answer",
  "method",
  "found_via",
  "found_elsewhere",
  "used",
  "held",
  "reusable",
  "re_asked",
  "marker",
  "applied",
  "note",
  "warn",
];

const PENDING = "(pending)";
const die = (msg) => {
  console.error("log-row: " + msg);
  process.exit(1);
};

/* ---------- argv: --key value and --key=value, both ---------- */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > -1) {
      out[a.slice(2, eq).replace(/-/g, "_")] = a.slice(eq + 1);
    } else {
      const key = a.slice(2).replace(/-/g, "_");
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out[key] = "true";
      } else {
        out[key] = next;
        i += 1;
      }
    }
  }
  return out;
}

/* ---------- enum resolution: case-insensitive, and a misplaced value names its real field ---------- */
function resolveEnum(field, raw) {
  const allowed = ENUMS[field];
  const hit = allowed.find((v) => v.toLowerCase() === String(raw).trim().toLowerCase());
  if (hit) return hit;
  const elsewhere = Object.entries(ENUMS).filter(
    ([f, vs]) => f !== field && vs.some((v) => v.toLowerCase() === String(raw).trim().toLowerCase()),
  );
  const hint = elsewhere.length ? "  (that value belongs to --" + elsewhere[0][0].replace(/_/g, "-") + ")" : "";
  die("--" + field.replace(/_/g, "-") + ' cannot be "' + raw + '". Allowed: ' + allowed.join(" | ") + hint);
}

/* ---------- CSV, quoted properly in both directions ---------- */
const csvCell = (v) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csvLine = (values) => values.map(csvCell).join(",");

function csvParse(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r[0] !== undefined && r[0] !== ""));
}

function load(file) {
  if (!existsSync(file)) return [];
  const rows = csvParse(readFileSync(file, "utf8"));
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/* Re-parse after EVERY write and compare, the discipline promote-cases.ts uses in this repo's
 * shared tree: a file that parses but lost a field is worse than one that fails to parse. */
function save(file, records) {
  const text = [csvLine(COLUMNS), ...records.map((r) => csvLine(COLUMNS.map((c) => r[c])))].join("\n") + "\n";
  writeFileSync(file, text, "utf8");
  const back = load(file);
  if (back.length !== records.length) die("write verification failed: " + records.length + " in, " + back.length + " back");
  for (let i = 0; i < records.length; i += 1) {
    for (const c of COLUMNS) {
      const a = records[i][c] === undefined ? "" : String(records[i][c]);
      if (back[i][c] !== a) die('write verification failed at row ' + records[i].row + ' field "' + c + '"');
    }
  }
}

/* ---------- the ground-truth log: session identity and the call stamp ---------- */
/* NEVER GUESS WHICH SESSION THIS IS. The hook writes one log per session because pooling
 * sessions into one file forces the analysis to hand-exclude the other sessions' lines before it
 * can count anything. Resolving "the newest log in the folder" reintroduces that failure one
 * layer up: with a second session active, rows land in its CSV instead. So a single candidate is
 * used, several is a refusal, and the caller supplies --session or --log. Structurally, giving
 * each session its own VC_MEASURE_OUT leaves exactly one candidate. */
/* The harness's own session id, off the first line of a log. The hook writes it into every record
 * it emits; a child process inherits the same value in its environment. So "which of these logs is
 * mine" has an answer that does not require the run to be told, which is what the paragraph above
 * was working around. Absent on a harness that does not set it, and then nothing changes. */
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

function hookLogs(dir, wanted) {
  const found = [];
  try {
    for (const f of readdirSync(dir)) {
      const m = /^tool-log-(.*)\.jsonl$/.exec(f);
      if (!m) continue;
      if (wanted && !m[1].startsWith(wanted)) continue;
      found.push({ path: join(dir, f), session: m[1], mtime: statSync(join(dir, f)).mtimeMs, host: hostOf(join(dir, f)) });
    }
  } catch {
    return [];
  }
  const host = (process.env.CLAUDE_CODE_HOST_SESSION_ID || "").trim();
  if (host && found.length > 1) {
    const mine = found.filter((x) => x.host === host);
    if (mine.length === 1) return mine;
  }
  return found.sort((a, b) => b.mtime - a.mtime);
}

function countCalls(path) {
  let n = 0;
  for (const l of readFileSync(path, "utf8").split("\n")) {
    if (!l) continue;
    try {
      if (!JSON.parse(l).part) n += 1; // a batch continuation is a line, not a call
    } catch {
      n += 1;
    }
  }
  return n;
}

function context(args) {
  /* The default MUST match tool-log.mjs, or with VC_MEASURE_OUT unset the hook writes to
   * <project>/MEASUREMENT while this tool looks in the current directory and then refuses
   * with "no ground-truth log found" - two tools, two answers, no error explaining it. */
  const outDir = process.env.VC_MEASURE_OUT
    || join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), "MEASUREMENT");
  const noLog = args.no_log === "true";
  let log = null;
  if (args.log) {
    log = { path: args.log, session: basename(args.log).replace(/^tool-log-/, "").replace(/\.jsonl$/, "") };
  } else {
    const wanted = args.session || process.env.VC_MEASURE_SESSION || "";
    const found = hookLogs(outDir, wanted);
    if (found.length > 1) {
      die(
        "several ground-truth logs are present in " +
          outDir +
          ":\n" +
          found.map((f) => "    " + basename(f.path)).join("\n") +
          "\n  Refusing to guess which session is this run - picking the newest is how a row gets\n" +
          "  attributed to another session. Pass --session <id-prefix> or --log <path>, or give each\n" +
          "  run its own VC_MEASURE_OUT so exactly one candidate exists.",
      );
    }
    log = found[0] || null;
  }
  if (!log && !noLog) {
    die(
      "no ground-truth log found under " +
        outDir +
        ".\n  The instrument is not wired, and an unstamped row is exactly the unverifiable row this\n" +
        "  script exists to prevent. Wire the PostToolUse hook, or pass --no-log to accept the gap\n" +
        "  deliberately (the row is then written with warn=NO-HOOK-LOG).",
    );
  }
  const session = log ? log.session : "no-hook-log";
  const file = args.file || join(log ? dirname(log.path) : outDir, "questions-" + session + ".csv");
  return { file, session, calls: log ? countCalls(log.path) : "", warn: log ? "" : "NO-HOOK-LOG" };
}

/* ---------- commands ---------- */
function cmdAdd(args) {
  const ctx = context(args);
  /* `answer` is NOT required here. The instruction is to add the row BEFORE looking, so the
   * answer cannot be known at this moment. A tool that demands a field the caller cannot yet
   * have teaches the caller to lie to it: given the choice, callers write a placeholder into it
   * and smuggle the real answer somewhere else. `answer` is set by `mark`.
   *
   * `re_asked` IS required and is never defaulted. A field with a safe default comes back at
   * that default on every row, which makes it worth nothing — the data cannot tell "it never
   * happened" from "nobody filled it in". Ask, or drop the field. */
  const required = ["class", "backed_by", "phase", "question", "re_asked"];
  const missing = required.filter((k) => !args[k] || !String(args[k]).trim());
  if (missing.length) {
    die(
      "missing required field(s): " +
        missing.map((m) => "--" + m.replace(/_/g, "-")).join(", ") +
        "\n  Nothing is defaulted. --re-asked yes|no asks whether you already looked this same" +
        "\n  thing up earlier in this run; --answer is NOT given here, it is set by `mark`.",
    );
  }
  const cls = resolveEnum("class", args.class);
  const backed = resolveEnum("backed_by", args.backed_by);
  const phase = resolveEnum("phase", args.phase);
  if (NEEDS_A_CALL.includes(backed) && !String(args.method || "").trim()) {
    die("--method is required when --backed-by is " + NEEDS_A_CALL.join("/") + ": name the command, endpoint or file that answered it.");
  }

  const records = load(ctx.file);
  const record = {
    row: records.length + 1,
    ts: new Date().toISOString(),
    session: ctx.session,
    calls: ctx.calls,
    class: cls,
    backed_by: backed,
    phase,
    question: String(args.question).trim(),
    answer: "", // set by `mark`; unknowable before the lookup
    method: String(args.method || "").trim(), // where I am ABOUT to look
    found_via: "", // where it actually came from, set by `mark`
    found_elsewhere: "", // the agent's own yes/no, required when the row is closed
    used: "",
    held: PENDING, // closed by `mark`, at the point of use
    reusable: "",
    re_asked: resolveEnum("re_asked", args.re_asked),
    marker: args.marker ? resolveEnum("marker", args.marker) : "NONE",
    applied: args.applied ? resolveEnum("applied", args.applied) : "N/A",
    note: String(args.note || "").trim(),
    warn: ctx.warn,
  };
  records.push(record);
  save(ctx.file, records);
  console.log("row " + record.row + " added at " + ctx.calls + " calls  [" + cls + " / " + backed + " / " + phase + "]  held=" + PENDING);
}

function cmdMark(args) {
  const ctx = context(args);
  const records = load(ctx.file);
  if (!records.length) die("nothing to mark: " + ctx.file + " has no rows yet");
  const n = Number(args.row);
  if (!Number.isInteger(n) || n < 1 || n > records.length) die("--row must be 1.." + records.length);
  if (!args.held && !args.used && !args.reusable && !args.marker && !args.applied && !args.note && !args.answer && !args.found_via) {
    die("mark needs at least one of --held / --answer / --found-via / --used / --reusable / --marker / --applied / --note");
  }
  const r = records[n - 1];
  if (args.answer) r.answer = String(args.answer).trim();
  /* `method` is where the row said it would look; `found_via` is where the answer actually
   * came from. The gap between them is the part of the work spent looking in the wrong place —
   * invisible if only the place of success is ever recorded. */
  if (args.found_via) r.found_via = String(args.found_via).trim();
  if (args.found_elsewhere) r.found_elsewhere = resolveEnum("found_elsewhere", args.found_elsewhere);
  if (args.held) {
    r.held = resolveEnum("held", args.held);
    /* An answered row knows whether the answer came from the place the row named. Required
     * here and nowhere else, because this is the only moment the caller can know it. */
    if (r.held !== "UNANSWERED" && !r.found_elsewhere && !args.found_elsewhere) {
      die("closing a row with --held " + r.held + " also needs --found-elsewhere yes|no — did" +
        " the answer come from the place --method named, or from somewhere else?");
    }
  }
  if (args.used) r.used = resolveEnum("used", args.used);
  if (args.reusable) r.reusable = resolveEnum("reusable", args.reusable);
  if (args.marker) r.marker = resolveEnum("marker", args.marker);
  if (args.applied) r.applied = resolveEnum("applied", args.applied);
  if (args.note) r.note = String(args.note).trim();
  /* held is decided at the point of USE, so `used` follows from it unless stated. */
  if (args.held && !args.used) r.used = (r.held === "NOT-USED" || r.held === "UNANSWERED") ? "no" : "yes";
  save(ctx.file, records);
  console.log("row " + n + " marked: held=" + r.held + " used=" + r.used + (r.reusable ? " reusable=" + r.reusable : ""));
}

function cmdRender(args) {
  const ctx = context({ ...args, no_log: "true" });
  const records = load(ctx.file);
  if (!records.length) return console.log("(no rows in " + ctx.file + ")");
  const cols = ["row", "class", "backed_by", "phase", "question", "answer", "method", "found_via", "found_elsewhere", "used", "held", "reusable", "re_asked", "marker", "applied", "calls"];
  const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  console.log("| " + cols.join(" | ") + " |");
  console.log("|" + cols.map(() => "---").join("|") + "|");
  for (const r of records) console.log("| " + cols.map((c) => esc(r[c])).join(" | ") + " |");
}

function cmdCheck(args) {
  const ctx = context({ ...args, no_log: "true" });
  const records = load(ctx.file);
  console.log("file:  " + ctx.file);
  console.log("rows:  " + records.length);
  if (!records.length) return;

  const problems = [];
  let prevCalls = 0;
  for (const r of records) {
    const calls = Number(r.calls);
    /* A claimed external lookup at an unchanged call count was never performed.
     *
     * ONE FALSE POSITIVE IS KNOWN, found by run 10 and diagnosed by it: two `kb deliver` calls
     * chained with `&&` inside one Bash invocation are ONE tool call, so the counter does not move
     * between the two rows they produce and the second reads as a method never performed. Both were
     * in the kb log, both really happened.
     *
     * Left as it is, deliberately. The check exists to catch a row claiming a lookup that never
     * occurred, which is the failure that quietly inflates every coverage number computed later;
     * relaxing it to accommodate shell chaining would cost that. The run noticed, said so on the
     * row, and the note is the right place for it -- this is a heuristic and it is allowed to be
     * wrong out loud. */
    if (NEEDS_A_CALL.includes(r.backed_by)) {
      if (r.warn === "NO-HOOK-LOG") {
        problems.push("row " + r.row + ": backed_by=" + r.backed_by + " but no ground-truth log was attached (warn=NO-HOOK-LOG)");
      } else if (Number.isFinite(calls) && calls === prevCalls) {
        problems.push(
          "row " + r.row + ": backed_by=" + r.backed_by + ' via "' + r.method + '" but the call count did not move (' + calls + ") - the method was very probably never performed",
        );
      }
    }
    if (r.held === PENDING) problems.push("row " + r.row + ": still " + PENDING + " - never confirmed or contradicted at a point of use");
    /* A closed row with no answer text is an omission; UNANSWERED is the legitimate way to
     * say the lookup produced nothing, and it is reported as a count, not as a problem. */
    if (r.held !== PENDING && r.held !== "UNANSWERED" && !String(r.answer).trim()) {
      problems.push("row " + r.row + ": held=" + r.held + " but `answer` is empty - set it with `mark --answer`, or say `--held UNANSWERED`");
    }
    if (r.held === "UNANSWERED" && !String(r.note).trim()) {
      problems.push("row " + r.row + ": UNANSWERED with no --note - say what was tried and what came back");
    }
    /* `applied` says whether LOADED knowledge matched the environment, so it is only meaningful
     * on a row whose answer came from something loaded: the prompt (INSTRUCTIONS) or a file that
     * was read (DOCS/CODE). A row answered by watching the system (LIVE) or by deciding it was
     * probably so (ASSUMED) has no loaded claim to match or contradict — an `applied` value there
     * means the field was misunderstood, and nothing used to say so. */
    const APPLIED_NEEDS_LOADED = ["INSTRUCTIONS", "DOCS", "CODE"];
    if (r.applied && r.applied !== "N/A" && !APPLIED_NEEDS_LOADED.includes(r.backed_by)) {
      problems.push("row " + r.row + ": applied=" + r.applied + " but backed_by=" + r.backed_by +
        " - `applied` compares LOADED knowledge against the environment, so it belongs only on a row backed by " +
        APPLIED_NEEDS_LOADED.join("/") + ". Leave it out, or fix backed_by");
    }
    /* A contradiction with no text is unusable: the whole value of the row is the pair "what the
     * artifact claimed" and "what was observed instead". */
    if (r.applied === "CONTRADICTED-BY-ENV" && !String(r.note).trim()) {
      problems.push("row " + r.row + ": CONTRADICTED-BY-ENV with no --note - record BOTH the claim and the observation, or the row cannot be acted on");
    }
    for (const f of ["class", "backed_by", "phase"]) {
      if (!ENUMS[f].includes(r[f])) problems.push("row " + r.row + ": " + f + '="' + r[f] + '" is outside the vocabulary');
    }
    if (Number.isFinite(calls)) prevCalls = calls;
  }

  const tally = (f) =>
    Object.entries(
      records.reduce((a, r) => {
        const k = r[f] || "(blank)";
        a[k] = (a[k] || 0) + 1;
        return a;
      }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => k + " " + v)
      .join(" · ");
  /* The agent's own judgment, tallied. Not a string diff - see the enum comment. */
  const answered = records.filter((r) => r.held !== PENDING && r.held !== "UNANSWERED");
  const elsewhere = answered.filter((r) => r.found_elsewhere === "yes").length;
  const unset = answered.filter((r) => !r.found_elsewhere).length;
  console.log("  " + "found elsewhere".padEnd(11) + " " + elsewhere + " of " + answered.length +
    " answered row(s)" + (unset ? "   (" + unset + " row(s) did not say)" : ""));
  for (const f of ["class", "backed_by", "held", "phase", "marker", "applied", "re_asked", "reusable"]) {
    console.log("  " + f.padEnd(11) + tally(f));
  }
  console.log("");
  if (!problems.length) {
    console.log("no problems found");
    return;
  }
  console.log(problems.length + " problem(s):");
  for (const p of problems) console.log("  - " + p);
  process.exitCode = 1;
}

const [, , cmd, ...rest] = process.argv;
const args = parseArgs(rest);
const commands = { add: cmdAdd, mark: cmdMark, render: cmdRender, check: cmdCheck };
if (!cmd || !commands[cmd]) die("usage: log-row.mjs <add|mark|render|check> [--flags]   (see the header of this file)");
commands[cmd](args);
