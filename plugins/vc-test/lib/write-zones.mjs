// plugins/vc-test/lib/write-zones.mjs — at close, every file a /vc-test:qa-ticket run changed lies inside the `writes`
// globs of the artifacts that ran (spec §8), or the run is BLOCKED. `writes` is relative to <run>; the orchestrator's
// own files are `orchestrator.writes` in artifacts.json; `.vc-fix/**` (working state) is always allowed.
// A file is "changed" by comparing two snapshots of content hashes, so a file already dirty before the run and left
// alone is not blamed on it, while a second edit to it is.
// What it cannot see: (1) a write to a git-IGNORED path outside the run folder and .vc-fix (e.g. .env.local,
// project-profile.json) — git does not list it and only the run folder is walked; (2) which agent wrote a file —
// the orchestrator's zone is run-wide, so a stray file inside it is attributed to no one; (3) a directory git lists as
// one entry (a nested repository, a submodule) is not looked into; (4) a symlink inside the run folder is skipped.
// Keys are in git's own spelling (its `--show-prefix` of the root), never the filesystem's, so a root reached through a
// junction, a symlink or an 8.3 short name still keys every git path.
// CLI: node plugins/vc-test/lib/write-zones.mjs snapshot --key <KEY> --run-dir <RUN_DIR>        (before the first wave)
//      node plugins/vc-test/lib/write-zones.mjs check --key <KEY> --run-dir <RUN_DIR> --run-plan <run-plan.json>
//   check prints { outside, registryErrors, gitScope, reason }. exit 0: none outside; 2: a file outside every zone
//   (BLOCKED; wins over 3); 3: not checkable — git could not be asked (gitScope false, so nothing outside the run
//   folder was looked at) or --run-dir is outside the output root; never a clean pass. 1: usage, no snapshot, or a
//   registry error. snapshot exits 0 and records gitScope; 3 only for a run folder outside the root.
//   `--env <env>` selects the work dir's env (default: the current one).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf, currentEnv, outputRoot, workDir } from "./paths.mjs";
import { loadProfile, testBlock } from "./profile.mjs";
import { loadRegistry } from "./strategy-artifacts.mjs";

const posix = (p) => p.split("\\").join("/");
const sha1 = (file) => createHash("sha1").update(readFileSync(file)).digest("hex");

/** A `writes` glob that names a literal run folder, or neither <run> nor <store>: the registry is wrong, not the run. */
export function registryErrors(registry) {
  const globs = [...registry.artifacts.flatMap((e) => (e.writes ?? []).map((g) => [e.id, g])), ...(registry.orchestrator?.writes ?? []).map((g) => ["orchestrator", g])];
  const errors = [];
  for (const [owner, g] of globs) {
    if (g.includes("reports/tickets/")) errors.push(`${owner}: writes "${g}" spells a literal reports/tickets/ path — write <run>/… (spec §5.1)`);
    else if (!g.startsWith("<run>/") && !g.startsWith("<store>/")) errors.push(`${owner}: writes "${g}" starts with neither <run>/ nor <store>/`);
  }
  return errors;
}

// `**` any depth including none, `*` inside one segment, the rest literal; anchored.
function globRe(glob, ci) {
  let re = "";
  for (let i = 0; i < glob.length;) {
    if (glob.startsWith("**/", i)) { re += "(?:.*/)?"; i += 3; }
    else if (glob.startsWith("**", i)) { re += ".*"; i += 2; }
    else if (glob[i] === "*") { re += "[^/]*"; i += 1; }
    else { re += glob[i].replace(/[.+?^${}()|[\]\\]/g, "\\$&"); i += 1; }
  }
  return new RegExp(`^${re}$`, ci ? "i" : "");
}

/** The zones of what ran: `ran` is the entry ids that were dispatched (`scenario:S-n` is an instance of the scenario template). */
export function zonesFor({ registry, ran, runDir, store = null, root = outputRoot(), platform = process.platform }) {
  const ci = platform === "win32";
  const rel = (p) => posix(relative(root, isAbsolute(p) ? p : resolve(root, p))).replace(/\/+$/, "");
  const runRel = rel(runDir);
  const storeRel = store ? rel(store) : null;
  const zones = [];
  const add = (owner, globs, instance) => {
    for (const g of globs) {
      const s = instance ? g.replaceAll("S-n", instance) : g;
      let path;
      if (s.startsWith("<run>/")) path = `${runRel}/${s.slice(6)}`;
      else if (s.startsWith("<store>/")) { if (storeRel === null || storeRel.startsWith("..")) continue; path = `${storeRel}/${s.slice(8)}`; }
      else continue; // registryErrors reports it; it never grants a zone
      zones.push({ owner, re: globRe(path, ci) });
    }
  };
  for (const id of ran) {
    const m = /^scenario:(S-\d+)$/.exec(id);
    const entry = m ? registry.artifacts.find((e) => e.per === "scenario") : registry.artifacts.find((e) => e.id === id && !e.per);
    if (entry) add(id, entry.writes ?? [], m?.[1]);
  }
  add("orchestrator", registry.orchestrator?.writes ?? []);
  zones.push({ owner: "working-state", re: globRe(".vc-fix/**", ci) });
  return zones;
}

// lstat, so a symlink (a loop included) is never followed; an entry that vanishes mid-walk is skipped.
function walk(dir, out) {
  let names;
  try { names = readdirSync(dir); } catch { return; }
  for (const name of names) {
    const f = join(dir, name);
    let st;
    try { st = lstatSync(f); } catch { continue; }
    if (st.isDirectory()) walk(f, out);
    else if (st.isFile()) out.push(f);
  }
}

const gitReason = (e, what) => `${what}: ${(e.code === "ENOENT" ? "git is not on PATH" : String(e.stderr || e.message).split("\n")[0]).trim().slice(0, 160)}`;

// `git status --porcelain=v1 -z`: "XY path\0", and for a rename or copy "XY new\0old\0"; paths are relative to the repo's
// top. `paths` are keyed relative to `root` by git's own prefix for it; a path outside `root` is not this run's.
// ok:false (with a reason) when git cannot be asked — the caller must never read that as "nothing changed".
function dirtyPaths(root) {
  const ask = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });
  let prefix, raw;
  try { prefix = ask("rev-parse", "--show-prefix").trim(); } catch (e) { return { ok: false, reason: gitReason(e, "git rev-parse failed"), paths: [] }; }
  try { raw = ask("status", "--porcelain=v1", "-z", "--untracked-files=all"); } catch (e) { return { ok: false, reason: gitReason(e, "git status failed"), paths: [] }; }
  const parts = raw.split("\0");
  const paths = [];
  const keep = (p) => { if (p.startsWith(prefix)) paths.push(p.slice(prefix.length)); };
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    keep(e.slice(3));
    if (/[RC]/.test(e.slice(0, 2))) { i += 1; if (parts[i]) keep(parts[i]); }
  }
  return { ok: true, paths };
}

/** The reason a run folder cannot be checked (it is outside the output root), else null. */
export function runDirProblem({ root = outputRoot(), runDir }) {
  const rel = relative(root, resolve(root, runDir));
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) ? "run folder outside the output root: not checkable" : null;
}

/** Every file under runDir and every path git lists as changed, each with the SHA-1 of its bytes ("deleted" when it is gone).
 *  gitScope is false (with a reason) when git could not be asked: then only the run folder was seen. */
export function snapshot({ root = outputRoot(), runDir }) {
  const git = dirtyPaths(root);
  const keys = new Set(git.paths);
  if (existsSync(runDir)) {
    // The run folder's key is its place under the root, both resolved alike, so it agrees with git's keys.
    let runKey;
    try { runKey = posix(relative(realpathSync.native(root), realpathSync.native(runDir))); } catch { runKey = null; }
    if (runKey === null || runKey === ".." || runKey.startsWith("../") || isAbsolute(runKey)) runKey = posix(relative(root, runDir));
    const found = [];
    walk(runDir, found);
    for (const f of found) { const r = posix(relative(runDir, f)); keys.add(runKey ? `${runKey}/${r}` : r); }
  }
  const files = {};
  for (const key of keys) {
    if (key.startsWith("../") || key === "..") continue;
    const f = join(root, key);
    try { files[key] = statSync(f).isFile() ? sha1(f) : "deleted"; } catch { files[key] = "deleted"; }
  }
  return { at: new Date().toISOString(), gitScope: git.ok, ...(git.ok ? {} : { reason: git.reason }), files };
}

/** Paths added, removed or with a different hash between two snapshots. */
export function changed(before, after) {
  const paths = new Set([...Object.keys(before.files), ...Object.keys(after.files)]);
  return [...paths].filter((p) => before.files[p] !== after.files[p]).sort();
}

export const outside = (changedPaths, zones) => changedPaths.filter((p) => !zones.some((z) => z.re.test(p)));

function storeOf(root) {
  try { return testBlock(loadProfile({ root })).knowledgeStore; } catch { return null; }
}

function main() {
  const [cmd] = process.argv.slice(2);
  const key = argOf(process.argv, "key");
  const runDir = argOf(process.argv, "run-dir");
  const planPath = argOf(process.argv, "run-plan");
  const usage = () => { console.error("usage: write-zones.mjs snapshot --key <KEY> --run-dir <RUN_DIR> | check --key <KEY> --run-dir <RUN_DIR> --run-plan <p> [--env <env>]"); process.exit(1); };
  if (!["snapshot", "check"].includes(cmd) || !key || !runDir || (cmd === "check" && !planPath)) usage();
  const root = outputRoot();
  const problem = runDirProblem({ root, runDir });
  if (problem) { console.log(JSON.stringify({ outside: [], registryErrors: [], gitScope: false, reason: problem })); process.exit(3); }
  let work;
  try { work = workDir(key, { env: argOf(process.argv, "env") ?? currentEnv(), root }); } catch (e) { console.error(e.message); process.exit(1); }
  const snapFile = join(work, "zones-snapshot.json");
  const runAbs = resolve(root, runDir);
  if (cmd === "snapshot") {
    const snap = snapshot({ root, runDir: runAbs });
    writeFileSync(snapFile, JSON.stringify(snap));
    console.log(JSON.stringify({ snapshot: snapFile, files: Object.keys(snap.files).length, gitScope: snap.gitScope, ...(snap.reason ? { reason: snap.reason } : {}) }));
    process.exit(0);
  }
  if (!existsSync(snapFile)) { console.error(`no ${snapFile} — run "snapshot" before the first wave`); process.exit(1); }
  if (!existsSync(planPath)) { console.error(`no run plan at ${planPath}`); process.exit(1); }
  const registry = loadRegistry();
  const errs = registryErrors(registry);
  if (errs.length) { console.log(JSON.stringify({ outside: [], registryErrors: errs })); process.exit(1); }
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const ran = (plan.waves ?? []).flat().filter((e) => !e.missing).map((e) => e.id);
  const zones = zonesFor({ registry, ran, runDir: runAbs, store: storeOf(root), root });
  const before = JSON.parse(readFileSync(snapFile, "utf8"));
  const after = snapshot({ root, runDir: runAbs });
  const stray = outside(changed(before, after), zones);
  const gitScope = before.gitScope !== false && after.gitScope;
  const reason = gitScope ? undefined : after.reason ?? before.reason ?? "git scope was not available when the snapshot was taken";
  console.log(JSON.stringify({ outside: stray, registryErrors: [], gitScope, ...(reason ? { reason } : {}) }));
  process.exit(stray.length ? 2 : gitScope ? 0 : 3);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try { main(); } catch (e) { console.error(`write-zones: ${e.message}`); process.exit(1); }
}
