/* Acceptance tests for log-row.mjs. Each case names the failure mode it closes. */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { fileURLToPath } from "node:url";
import { dirname, join as pjoin } from "node:path";
/* Resolve the tool next to this test, so the package works wherever it is unzipped. */
const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = pjoin(HERE, "log-row.mjs");
const work = mkdtempSync(join(tmpdir(), "logrow-"));
const SID = "abcd1234";
const hookLog = join(work, "tool-log-" + SID + ".jsonl");
const csv = join(work, "questions-" + SID + ".csv");

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass += 1; console.log("  PASS  " + name); }
  else { fail += 1; console.log("  FAIL  " + name + (detail ? "  ->  " + detail : "")); }
};

const run = (...argv) =>
  spawnSync(process.execPath, [TOOL, ...argv], { encoding: "utf8", env: { ...process.env, VC_MEASURE_OUT: work } });

const calls = (n) => {
  writeFileSync(hookLog, "");
  for (let i = 0; i < n; i += 1) appendFileSync(hookLog, JSON.stringify({ tool: "Bash", target: "x" + i }) + "\n");
};

/* A real csv parser, written independently of the tool's — a line-splitting reader cannot verify
 * a round trip that contains a newline, which is how the first version of this helper was wrong. */
const parseCsv = (text) => {
  const out = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); out.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); out.push(row); }
  return out;
};
const rows = () => {
  if (!existsSync(csv)) return [];
  const g = parseCsv(readFileSync(csv, "utf8"));
  if (!g.length) return [];
  const head = g[0];
  return g.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
};
const last = () => rows()[rows().length - 1];

const ADD = ["add", "--class", "KNOWLEDGE", "--backed-by", "LIVE", "--phase", "locate", "--re-asked", "no", "--method", "GET /api/x"];

console.log("`answer` is NOT required at add — it cannot be known before the lookup");
calls(1);
let r = run(...ADD, "--question", "q1");
check("add succeeds with no --answer", r.status === 0, JSON.stringify(r.stderr.slice(0, 120)));
check("answer starts empty, not the literal 'pending'", rows()[0].answer === "", JSON.stringify(rows()[0].answer));
check("held starts pending", rows()[0].held === "(pending)", rows()[0].held);
r = run("mark", "--row", "1", "--answer", "the store id is required", "--held", "HELD", "--found-via", "seed-sales-rep.mjs:59", "--found-elsewhere", "yes");
check("mark sets the answer", rows()[0].answer === "the store id is required", rows()[0].answer);
check("mark sets found_via", rows()[0].found_via === "seed-sales-rep.mjs:59", rows()[0].found_via);

console.log("--re-asked is REQUIRED and no longer defaulted");
r = run("add", "--class", "KNOWLEDGE", "--backed-by", "LIVE", "--phase", "locate", "--method", "m", "--question", "q");
check("refuses without --re-asked", r.status === 1 && /--re-asked/.test(r.stderr), JSON.stringify(r.stderr.slice(0, 100)));
check("wrote nothing", rows().length === 1, "rows " + rows().length);
r = run(...ADD, "--question", "q2", "--re-asked", "yes");
check("--re-asked yes is recorded", last().re_asked === "yes", last().re_asked);

console.log("the closing mark must carry the found-elsewhere JUDGMENT, not prose we diff");
check("found_elsewhere recorded from the closing mark", rows()[0].found_elsewhere === "yes", JSON.stringify(rows()[0].found_elsewhere));
calls(4);
run(...ADD, "--question", "qFE", "--method", "the place I named");
const iFE = rows().length;
r = run("mark", "--row", String(iFE), "--answer", "a", "--held", "HELD");
check("refuses to close a row without --found-elsewhere", r.status === 1 && /--found-elsewhere/.test(r.stderr), JSON.stringify(r.stderr.slice(0, 120)));
check("the row stayed open", rows()[iFE - 1].held === "(pending)", rows()[iFE - 1].held);
r = run("mark", "--row", String(iFE), "--answer", "a", "--held", "HELD", "--found-elsewhere", "no");
check("closes once the judgment is given", r.status === 0 && rows()[iFE - 1].held === "HELD");
r = run("check");
check("check tallies the judgment, not a string diff", /found elsewhere\s+\d+ of \d+ answered row/.test(r.stdout), JSON.stringify((r.stdout.match(/found elsewhere.*/) || [""])[0]));

console.log("UNANSWERED is a first-class outcome, so a blocked question is visible in the data");
calls(6);
run(...ADD, "--question", "can I get a storefront token?", "--method", "POST /connect/token, several bodies");
const n3 = rows().length;
r = run("mark", "--row", String(n3), "--held", "UNANSWERED");
check("UNANSWERED needs a --note", r.status === 0, JSON.stringify(r.stderr.slice(0, 100)));
r = run("check");
check("check flags UNANSWERED with no note", /UNANSWERED with no --note/.test(r.stdout), JSON.stringify((r.stdout.match(/row \d+: UNANSWERED.*/) || [""])[0]));
r = run("mark", "--row", String(n3), "--note", "every password-grant body returned login_failed");
check("with a note it is accepted", rows()[n3 - 1].held === "UNANSWERED" && rows()[n3 - 1].note.length > 0);
check("UNANSWERED derives used=no", rows()[n3 - 1].used === "no", rows()[n3 - 1].used);
r = run("check");
check("an UNANSWERED row is not reported as a problem", !/row 3.*problem/.test(r.stdout));

console.log("`applied` belongs only on a row that read something LOADED");
calls(40);
run(...ADD, "--question", "qAP", "--method", "observed it happen");
const iAP = rows().length;
run("mark", "--row", String(iAP), "--answer", "a", "--held", "HELD", "--found-elsewhere", "no", "--applied", "MATCHED");
r = run("check");
check("applied on a LIVE row is flagged", new RegExp("row " + iAP + ": applied=MATCHED but backed_by=LIVE").test(r.stdout), JSON.stringify((r.stdout.match(new RegExp("row " + iAP + ":.*")) || [""])[0]));
calls(44);
run("add", "--class", "KNOWLEDGE", "--backed-by", "DOCS", "--phase", "orient", "--re-asked", "no", "--method", "some/file.md", "--question", "qAP2");
const iAP2 = rows().length;
run("mark", "--row", String(iAP2), "--answer", "a", "--held", "HELD", "--found-elsewhere", "no", "--applied", "MATCHED");
r = run("check");
check("applied on a DOCS row is NOT flagged", !new RegExp("row " + iAP2 + ": applied=").test(r.stdout));
calls(48);
run("add", "--class", "KNOWLEDGE", "--backed-by", "CODE", "--phase", "diagnose", "--re-asked", "no", "--method", "src/thing.ts", "--question", "qAP3");
const iAP3 = rows().length;
run("mark", "--row", String(iAP3), "--answer", "a", "--held", "HELD", "--found-elsewhere", "no", "--applied", "CONTRADICTED-BY-ENV");
r = run("check");
check("CONTRADICTED-BY-ENV with no note is flagged", new RegExp("row " + iAP3 + ": CONTRADICTED-BY-ENV with no --note").test(r.stdout), JSON.stringify((r.stdout.match(new RegExp("row " + iAP3 + ": CONTRA.*")) || [""])[0]));
run("mark", "--row", String(iAP3), "--note", "the file claims X; the deployment does Y");
r = run("check");
check("with both sides recorded it is accepted", !new RegExp("row " + iAP3 + ": CONTRADICTED-BY-ENV").test(r.stdout));

console.log("a closed row with no answer text is an omission");
calls(9);
run(...ADD, "--question", "q4", "--method", "GET /api/y");
const n4 = rows().length;
run("mark", "--row", String(n4), "--held", "HELD", "--found-elsewhere", "no");
r = run("check");
check("check flags held-without-answer", new RegExp("row " + n4 + ": held=HELD but .answer. is empty").test(r.stdout), JSON.stringify((r.stdout.match(new RegExp("row " + n4 + ":.*")) || [""])[0]));

console.log("a transposed enum value is rejected AND told where it belongs");
r = run("add", "--class", "LIVE", "--backed-by", "KNOWLEDGE", "--phase", "locate", "--re-asked", "no", "--question", "q");
check("rejects the swap", r.status === 1, "status " + r.status);
check("points at the real field", /belongs to --backed-by/.test(r.stderr), JSON.stringify(r.stderr.slice(0, 140)));

console.log("(enum ergonomics) case-insensitive, so validation is not friction");
calls(12);
r = run("add", "--class", "knowledge", "--backed-by", "live", "--phase", "LOCATE", "--re-asked", "NO", "--method", "GET /api/x", "--question", "q5");
check("accepted and normalised", r.status === 0 && last().class === "KNOWLEDGE" && last().backed_by === "LIVE" && last().phase === "locate" && last().re_asked === "no", JSON.stringify(last()));

console.log("(method) an external lookup must name where it is about to look");
r = run("add", "--class", "VALUE", "--backed-by", "DOCS", "--phase", "orient", "--re-asked", "no", "--question", "q");
check("refuses DOCS without --method", r.status === 1 && /--method is required/.test(r.stderr), JSON.stringify(r.stderr.slice(0, 110)));

console.log("LATE-ENTRY and REPAIRED stay distinct");
calls(15);
run(...ADD, "--question", "q6", "--marker", "LATE-ENTRY");
const iLate = rows().length;
calls(18);
run(...ADD, "--question", "q7", "--marker", "REPAIRED");
check("both markers preserved", rows()[iLate - 1].marker === "LATE-ENTRY" && last().marker === "REPAIRED", rows().map((x) => x.marker).join("/"));
r = run(...ADD, "--question", "q", "--marker", "LATE_REPAIR");
check("an invented marker is rejected", r.status === 1 && /--marker cannot be/.test(r.stderr));

console.log("a claimed lookup at an unchanged call count is flagged");
run("add", "--class", "VALUE", "--backed-by", "LIVE", "--phase", "verify", "--re-asked", "no", "--method", "curl -I http://x", "--question", "q8");
const iFlat = rows().length;
r = run("check");
check("flagged as never performed", new RegExp("row " + iFlat + ": backed_by=LIVE .* did not move").test(r.stdout), JSON.stringify((r.stdout.match(new RegExp("row " + iFlat + ":.*")) || [""])[0]));
run("add", "--class", "KNOWLEDGE", "--backed-by", "INSTRUCTIONS", "--phase", "orient", "--re-asked", "no", "--question", "q9");
const iInstr = rows().length;
r = run("check");
check("INSTRUCTIONS at a flat count is not flagged", !new RegExp("row " + iInstr + ": backed_by=INSTRUCTIONS").test(r.stdout));

console.log("(v2) the found-elsewhere divergence is reported");
r = run("check");
check("check reports the divergence count", /found elsewhere\s+\d+ of \d+/.test(r.stdout), JSON.stringify((r.stdout.match(/found elsewhere.*/) || [""])[0]));

console.log("(attribution) two concurrent sessions must not be resolved by guessing");
const second = join(work, "tool-log-ffff9999.jsonl");
writeFileSync(second, JSON.stringify({ tool: "Read", target: "y" }) + "\n");
r = run(...ADD, "--question", "q");
check("refuses with two candidate logs", r.status === 1 && /Refusing to guess/.test(r.stderr), JSON.stringify(r.stderr.slice(0, 100)));
check("names both candidates", /abcd1234/.test(r.stderr) && /ffff9999/.test(r.stderr));
const before = rows().length;
r = run(...ADD, "--question", "q10", "--session", SID);
check("--session disambiguates into OUR file", r.status === 0 && rows().length === before + 1 && last().session === SID, JSON.stringify(r.stderr.slice(0, 100)));
rmSync(second);

console.log("(no instrument) refuses rather than writing an unverifiable row");
const bare = mkdtempSync(join(tmpdir(), "logrow-bare-"));
const bareRun = (...a) => spawnSync(process.execPath, [TOOL, ...a], { encoding: "utf8", env: { ...process.env, VC_MEASURE_OUT: bare } });
r = bareRun(...ADD, "--question", "q");
check("refuses with no hook log", r.status === 1 && /no ground-truth log found/.test(r.stderr), JSON.stringify(r.stderr.slice(0, 80)));
r = bareRun(...ADD, "--question", "q", "--no-log");
const bareCsv = readdirSync(bare).find((f) => f.endsWith(".csv"));
check("--no-log accepted", r.status === 0 && Boolean(bareCsv), JSON.stringify(r.stderr.slice(0, 80)));
check("gap recorded as warn=NO-HOOK-LOG, not silently", readFileSync(join(bare, bareCsv), "utf8").includes("NO-HOOK-LOG"));
r = bareRun("check");
check("check flags the unattached row", /no ground-truth log was attached/.test(r.stdout), JSON.stringify(r.stdout.slice(-160)));
rmSync(bare, { recursive: true, force: true });

console.log("(round trip) commas, quotes and newlines survive the CSV");
calls(30);
const nasty = 'it, "quoted", and a\nsecond line';
run(...ADD, "--question", nasty, "--method", 'grep -n "x,y" f');
const iNasty = rows().length;
run("mark", "--row", String(iNasty), "--answer", nasty, "--held", "HELD", "--found-elsewhere", "no");
check("question round-tripped byte for byte", rows()[iNasty - 1].question === nasty, JSON.stringify(rows()[iNasty - 1].question));
check("answer round-tripped byte for byte", rows()[iNasty - 1].answer === nasty, JSON.stringify(rows()[iNasty - 1].answer));
check("row count intact after the nasty write", rows().length === iNasty, "got " + rows().length);

console.log("(render) the table is produced by the tool, not by hand");
r = run("render");
const body = r.stdout.trim().split("\n");
check("header + separator + one line per row", body.length === 2 + rows().length, "got " + body.length + " for " + rows().length + " rows");
check("newline in a cell did not break the table", body.every((l) => l.startsWith("|")), JSON.stringify(body.find((l) => !l.startsWith("|"))));
check("found_via is a rendered column", /\| found_via \|/.test(r.stdout));

console.log("");
console.log("passed " + pass + ", failed " + fail);
rmSync(work, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
