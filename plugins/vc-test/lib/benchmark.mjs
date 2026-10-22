// plugins/vc-test/lib/benchmark.mjs — a blind benchmark's definition and its build check (spec U67, O8).
// A benchmark pins the build a ticket is re-run on; before each run the stand is checked against it with the same
// read-only `npm run deploy:pr -- <KEY> --verify`, and a different version on any line voids the run.
// CLI: node plugins/vc-test/lib/benchmark.mjs --key <KEY>   → { ok, moved, unverifiable, pin_only, run_dir, before (the cutoff ISO), move_aside (run-folder globs), hide, hide_pending };
// exit 2 when moved, 3 when a module's live version cannot be read, 1 on a bad definition (e.g. no parsable cutoff).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { KEY_RE, argOf, workDir } from "./paths.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const UNKNOWN = new Set(["?", "—", "-", ""]);
const cols = (line) => line.trim().split(/\s{2,}/);

export function loadBenchmark(key) {
  if (!KEY_RE.test(String(key))) throw new Error(`not a ticket key: "${key}"`);
  const file = join(HERE, "..", "benchmarks", `${key}.json`);
  if (!existsSync(file)) throw new Error(`no benchmark defined for ${key} (${file})`);
  return JSON.parse(readFileSync(file, "utf8"));
}

// Both tables of the deploy:pr output: `Artifact Current Proposed` (what the branch pins — the Platform line carries
// the image tag) and `Artifact Pinned Live Verdict`. Row = { artifact, pinned, verdict, live, pin }. `live` is a MODULE's
// live version (null when the column reads `?`/`—`); Platform and Theme are never read live, so their `live` is always
// null and `pin` is all there is (the value the env branch pins). `pin` is null for an unpinned row.
export function parseVerify(text) {
  const lines = String(text).split(/\r?\n/);
  const section = (header) => {
    const i = lines.findIndex((l) => header.test(l));
    if (i < 0) return [];
    const rows = []; let rules = 0;
    for (const l of lines.slice(i + 1)) {
      if (/^─{10,}/.test(l)) { if (++rules === 2) break; continue; }
      if (l.trim()) rows.push(cols(l));
    }
    return rows;
  };
  const pins = new Map(section(/^Artifact\s+Current\s+Proposed/).map(([a, cur = ""]) => {
    const tag = /→ tag (\S+)/.exec(cur)?.[1];
    return [a, tag ?? cur.replace(/\s*\([^)]*\)\s*$/, "")];
  }));
  const table = section(/^Artifact\s+Pinned\s+Live\s+Verdict/);
  if (!table.length) throw new Error("no Verify table in the deploy:pr output");
  return table.map(([artifact, pinned, live = "", ...rest]) => {
    const verdict = rest.join(" ").split(/\s+/)[0] ?? "";
    // live: only a MODULE's Live column is a live read (/api/platform/modules). Platform's "healthy" and Theme's "—" are
    // not versions: deploy:pr's Platform LIVE = pinned + /health ok, Theme PINNED = a branch-file check. Their `pin` is
    // the value the branch pins, nothing more.
    const pinValue = pinned === "yes" ? (pins.get(artifact) || null) : null;
    const isModule = artifact !== "Platform" && artifact !== "Theme";
    return { artifact, pinned: pinned === "yes", verdict, live: isModule && !UNKNOWN.has(live) ? live : null, pin: pinValue };
  });
}

// What the definition expects of one artifact: the image tag for Platform, the leading version otherwise (Customer's
// "3.1030.0 (the release that contains …)" is the release version its live column must show).
function expectation(artifact, value) {
  const v = String(value);
  return artifact === "Platform" ? (/image\s+(\S+)/.exec(v)?.[1] ?? v.split(/\s+/)[0]) : v.split(/\s+/)[0];
}

// ok only when every module was READ live and matches. Platform and Theme are `pin_only`: the branch pin is compared
// (a mismatch is `moved`), but nothing live was read, so they never count as live-verified. An unreadable module is
// `unverifiable` and makes ok false — no fallback to the pin for the pass decision.
export function compareBuild(def, rows) {
  const moved = [], unverifiable = [], pin_only = [];
  for (const [artifact, value] of Object.entries(def.build)) {
    const want = expectation(artifact, value);
    const row = rows.find((r) => r.artifact === artifact);
    if (artifact === "Platform" || artifact === "Theme") {
      pin_only.push(artifact);
      if ((row?.pin ?? null) !== want) moved.push({ artifact, pinned: want, live: null, pin: row?.pin ?? null });
    } else if (!row || row.live == null) unverifiable.push(artifact);
    else if (row.live !== want) moved.push({ artifact, pinned: want, live: row.live });
  }
  return { ok: moved.length === 0 && unverifiable.length === 0, moved, unverifiable, pin_only };
}

// The instant a blind run reads "before" (everything the ticket accrued after it is hidden): the definition's `cutoff`.
export function cutoffOf(def) {
  if (typeof def?.cutoff !== "string" || !Number.isFinite(Date.parse(def.cutoff))) throw new Error(`benchmark ${def?.ticket ?? "?"}: cutoff is missing or not a date: ${JSON.stringify(def?.cutoff)}`);
  return def.cutoff;
}

export const benchRunDir =(runDir, n) => join(runDir, `bench-${n}`);

function nextBench(dir) {
  const used = existsSync(dir) ? readdirSync(dir).map((d) => /^bench-(\d+)$/.exec(d)?.[1]).filter(Boolean).map(Number) : [];
  return (used.length ? Math.max(...used) : 0) + 1;
}

// Exit codes: 0 build confirmed, 2 moved (a different version is live), 3 cannot confirm (a module's live version unreadable).
function main(argv) {
  const key = argOf(argv, "key");
  if (!key) { console.error("usage: benchmark.mjs --key <KEY>"); return 64; }
  const def = loadBenchmark(key);
  const before = cutoffOf(def); // fail before the 60 s verify, not after
  const win = process.platform === "win32"; // npm is npm.cmd there, which only spawns through a shell; the key is KEY_RE-checked
  const r = spawnSync(win ? "npm.cmd" : "npm", ["run", "deploy:pr", "--", key, "--verify"], { shell: win, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw r.error;
  const text = [r.stdout, r.stderr].join("\n");
  let rows;
  try { rows = parseVerify(text); }
  catch (e) { throw new Error([`${e.message}; npm run exited ${r.status}, output tail:`, ...text.trim().split(/\r?\n/).slice(-8)].join("\n")); }
  const { ok, moved, unverifiable, pin_only } = compareBuild(def, rows);
  const dir = workDir(key);
  const issues = def.hide?.jira_issues ?? [];
  console.log(JSON.stringify({
    ok, moved, unverifiable, pin_only,
    run_dir: benchRunDir(dir, nextBench(dir)),
    before, // the cutoff instant (ISO) — what /ticket-context prepare --before takes
    move_aside: def.move_aside_before_run?.paths ?? [], // run-folder globs to move out before the run, never a cutoff
    hide: issues.filter((i) => KEY_RE.test(i)),
    hide_pending: issues.filter((i) => !KEY_RE.test(i)),
  }, null, 2));
  return moved.length ? 2 : unverifiable.length ? 3 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error(`benchmark: ${e.message}`); process.exitCode = 1; }
}
