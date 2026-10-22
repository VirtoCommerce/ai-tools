// plugins/vc-test/lib/benchmark.mjs — a blind benchmark's definition and its build check (spec U67, O8).
// A benchmark pins the build a ticket is re-run on; before each run the stand is checked against it with the same
// read-only `npm run deploy:pr -- <KEY> --verify`, and a different version on any line voids the run.
// CLI: node plugins/vc-test/lib/benchmark.mjs --key <KEY>   → { ok, moved, unverified, run_dir, before, hide, hide_pending }, exit 2 when moved.
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
// the image tag) and `Artifact Pinned Live Verdict`. `live` is the live module version, or the Platform image tag /
// Theme file name when the row is LIVE or PINNED; null where the check could not read it. `live_source` says which.
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
    const named = artifact === "Platform" || artifact === "Theme";
    const pinnedValue = pinned === "yes" ? (pins.get(artifact) || null) : null;
    const read = named ? (verdict === "LIVE" || verdict === "PINNED" ? pinnedValue : null) : (UNKNOWN.has(live) ? null : live);
    return { artifact, pinned: pinned === "yes", verdict, live: read, live_source: named || UNKNOWN.has(live) ? "pin" : "live", pin: pinnedValue };
  });
}

// What the definition expects of one artifact: the image tag for Platform, the leading version otherwise. A value
// "(the release that contains …)" is a release, not a pre-release: the row's MISSING (no PR build pinned) is accepted.
function expectation(artifact, value) {
  const v = String(value);
  if (artifact === "Platform") return { want: /image\s+(\S+)/.exec(v)?.[1] ?? v.split(/\s+/)[0], release: false };
  return { want: v.split(/\s+/)[0], release: /\(the release\b/.test(v) };
}

export function compareBuild(def, rows) {
  const moved = [], unverified = [];
  for (const [artifact, value] of Object.entries(def.build)) {
    const { want, release } = expectation(artifact, value);
    const row = rows.find((r) => r.artifact === artifact);
    if (release && (!row || row.verdict === "MISSING")) continue;
    let seen = row ? (row.live ?? row.pin) : null;
    if (release && row?.live == null) continue;
    if (row && row.live == null && seen) unverified.push(artifact);
    if (seen !== want) moved.push({ artifact, pinned: want, live: seen ?? null });
  }
  return { ok: moved.length === 0, moved, unverified };
}

export const benchRunDir = (runDir, n) => join(runDir, `bench-${n}`);

function nextBench(dir) {
  const used = existsSync(dir) ? readdirSync(dir).map((d) => /^bench-(\d+)$/.exec(d)?.[1]).filter(Boolean).map(Number) : [];
  return (used.length ? Math.max(...used) : 0) + 1;
}

function main(argv) {
  const key = argOf(argv, "key");
  if (!key) { console.error("usage: benchmark.mjs --key <KEY>"); return 64; }
  const def = loadBenchmark(key);
  const r = spawnSync(`npm run deploy:pr -- ${key} --verify`, { shell: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw r.error;
  const { ok, moved, unverified } = compareBuild(def, parseVerify(`${r.stdout}\n${r.stderr}`));
  const dir = workDir(key);
  const issues = def.hide?.jira_issues ?? [];
  console.log(JSON.stringify({
    ok, moved, unverified,
    run_dir: benchRunDir(dir, nextBench(dir)),
    before: def.move_aside_before_run?.paths ?? [],
    hide: issues.filter((i) => KEY_RE.test(i)),
    hide_pending: issues.filter((i) => !KEY_RE.test(i)),
  }, null, 2));
  return ok ? 0 : 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
