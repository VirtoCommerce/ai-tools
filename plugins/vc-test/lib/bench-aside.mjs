// plugins/vc-test/lib/bench-aside.mjs — a blind benchmark's file moves (spec U67), and the two copies a run's agents
// read instead of /ticket-context's own files. Renames and copies only: nothing here deletes data. The only removal is
// a non-recursive rmdir of a folder this script emptied.
//
//   aside   --key <KEY> [--globs <g,g>]   move every folder the benchmark's move_aside globs name (the part before
//            `/**`, `*` within a segment) to .vc-fix/bench-aside/<KEY>/earlier/<its path>, so the run starts from none
//            of them. Default globs: the definition's move_aside_before_run.paths. bench-aside/<KEY>/ already there ⇒
//            exit 2 before any rename (an earlier benchmark did not restore; never restore over it).
//   restore --key <KEY> [--run-dir <dir>]   with --run-dir: move what the globs name now (this run's folders) to
//            bench-aside/<KEY>/run/, rename every earlier folder back, then move run/ to <dir> (benchmark.mjs's
//            run_dir) with the manifest beside it. Without --run-dir: only the earlier folders go back (a failed aside).
//   blind   --bundle <file> --out <file>   the bundle without known.kb and known.prior_runs.
//   keep-prepare --prepare <prepare.json> --key <KEY>   copy prepare.json and its prs[].diff_path files to
//            <WORK>/prepare/ (any run, not only a benchmark), the paths rewritten to the copies; prints the copy's path.
// Exit: 0 done; 1 usage or a glob that leaves the output root; 2 refused (aside already there, nothing set aside, a
// name already taken); 3 a rename failed part-way (the manifest lists what moved: `restore` without --run-dir).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { KEY_RE, argOf, outputRoot, workDir } from "./paths.mjs";

const ASIDE = [".vc-fix", "bench-aside"];
const fwd = (p) => p.split(sep).join("/");

// A glob's folder part as path segments; `**` is allowed only as the trailing "/**".
export function globSegments(glob) {
  const g = String(glob).trim().replace(/\\/g, "/").replace(/\/\*\*$/, "");
  const segs = g.split("/").filter(Boolean);
  if (!g || isAbsolute(g) || /^[A-Za-z]:/.test(g) || segs.some((s) => s === ".." || s === "." || s.includes("**"))) {
    throw new Error(`not a folder glob inside the output root: "${glob}"`);
  }
  return segs;
}

// Every existing path (relative, `/`-separated) a glob names under root — never anything under bench-aside itself.
export function expand(root, glob) {
  let found = [""];
  for (const seg of globSegments(glob)) {
    const re = new RegExp(`^${seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
    found = found.flatMap((base) => {
      const dir = join(root, base);
      if (!seg.includes("*")) return existsSync(join(dir, seg)) ? [base ? `${base}/${seg}` : seg] : [];
      let names = [];
      try { names = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; }
      return names.filter((n) => re.test(n)).map((n) => (base ? `${base}/${n}` : n));
    });
  }
  const aside = ASIDE.join("/");
  return found.filter((p) => p && p !== aside && !p.startsWith(`${aside}/`) && !aside.startsWith(`${p}/`));
}

const uniq = (xs) => [...new Set(xs)].sort();
const move = (from, to) => { mkdirSync(dirname(to), { recursive: true }); renameSync(from, to); };

// Remove the folders under dir that are empty, bottom-up, never recursively: rmdir fails on anything left inside.
function pruneEmpty(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
  for (const d of readdirSync(dir, { withFileTypes: true })) if (d.isDirectory()) pruneEmpty(join(dir, d.name));
  try { rmdirSync(dir); } catch { /* not empty: it keeps what it holds */ }
}

export function aside({ key, globs, root = outputRoot() }) {
  const base = join(root, ...ASIDE, key);
  if (existsSync(base)) return { code: 2, out: { status: "refused", reason: `${fwd(relative(root, base))} exists — an earlier benchmark did not restore; restore it by hand first` } };
  const paths = uniq(globs.flatMap((g) => expand(root, g)));
  const manifest = { key, globs, at: new Date().toISOString(), earlier: [] };
  mkdirSync(base, { recursive: true });
  const save = () => writeFileSync(join(base, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  save();
  for (const p of paths) {
    try { move(join(root, p), join(base, "earlier", p)); } catch (e) {
      return { code: 3, out: { status: "partial", failed: p, reason: e.code ?? e.message, moved: manifest.earlier } };
    }
    manifest.earlier.push(p); save();
  }
  return { code: 0, out: { status: "aside", moved: manifest.earlier } };
}

export function restore({ key, runDir, root = outputRoot() }) {
  const base = join(root, ...ASIDE, key);
  const mf = join(base, "manifest.json");
  if (!existsSync(mf)) return { code: 2, out: { status: "refused", reason: `nothing set aside for ${key}` } };
  const manifest = JSON.parse(readFileSync(mf, "utf8"));
  const run = [], back = [], taken = [];
  if (runDir) {
    for (const p of uniq(manifest.globs.flatMap((g) => expand(root, g)))) { move(join(root, p), join(base, "run", p)); run.push(p); }
  }
  for (const p of manifest.earlier) {
    if (existsSync(join(root, p))) { taken.push(p); continue; } // never over a folder that is there now
    move(join(base, "earlier", p), join(root, p)); back.push(p);
  }
  let archived = null;
  if (runDir && !taken.length) {
    const dest = resolve(root, runDir);
    if (existsSync(dest)) taken.push(fwd(relative(root, dest)));
    else {
      mkdirSync(join(base, "run"), { recursive: true });
      renameSync(mf, join(base, "run", "bench-aside.json"));
      move(join(base, "run"), dest);
      archived = fwd(relative(root, dest));
    }
  } else if (!runDir && !taken.length) { // a failed aside put back: the manifest is kept beside, never deleted
    archived = fwd(join(...ASIDE, `${key}-restored-${Date.now()}.json`));
    renameSync(mf, join(root, archived));
  }
  pruneEmpty(base);
  const out = { status: taken.length ? "refused" : "restored", run, back, archived, ...(taken.length ? { taken, reason: "a name is already taken — those stay in bench-aside for a human" } : {}) };
  return { code: taken.length ? 2 : 0, out };
}

export function blind(bundle) {
  const b = structuredClone(bundle);
  if (b.known) { delete b.known.kb; delete b.known.prior_runs; }
  return b;
}

export function keepPrepare({ prepare, dir }) {
  const p = JSON.parse(readFileSync(prepare, "utf8"));
  mkdirSync(dir, { recursive: true });
  for (const pr of p.prs ?? []) {
    if (!pr.diff_path) continue;
    const to = join(dir, basename(pr.diff_path));
    copyFileSync(resolve(pr.diff_path), to);
    pr.diff_path = to;
  }
  const out = join(dir, "prepare.json");
  writeFileSync(out, JSON.stringify(p, null, 1));
  return out;
}

async function main(argv) {
  const [cmd] = argv;
  const key = argOf(argv, "key");
  if (key && !KEY_RE.test(key)) throw new Error(`not a ticket key: "${key}"`); // never workDir() here: it creates a folder aside/restore would move
  const say = (o) => console.log(JSON.stringify(o));
  if (cmd === "aside" && key) {
    let globs = argOf(argv, "globs")?.split(",").map((g) => g.trim()).filter(Boolean);
    if (!globs) globs = (await import("./benchmark.mjs")).loadBenchmark(key).move_aside_before_run?.paths ?? [];
    globs.forEach(globSegments);
    const r = aside({ key, globs }); say(r.out); return r.code;
  }
  if (cmd === "restore" && key) { const r = restore({ key, runDir: argOf(argv, "run-dir") }); say(r.out); return r.code; }
  if (cmd === "blind" && argOf(argv, "bundle") && argOf(argv, "out")) {
    writeFileSync(argOf(argv, "out"), JSON.stringify(blind(JSON.parse(readFileSync(argOf(argv, "bundle"), "utf8")))));
    say({ path: argOf(argv, "out") }); return 0;
  }
  if (cmd === "keep-prepare" && key && argOf(argv, "prepare")) { say({ path: keepPrepare({ prepare: argOf(argv, "prepare"), dir: join(workDir(key), "prepare") }) }); return 0; }
  console.error("usage: bench-aside.mjs aside --key <KEY> [--globs <g,g>] | restore --key <KEY> [--run-dir <dir>] | blind --bundle <f> --out <f> | keep-prepare --prepare <f> --key <KEY>");
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (e) { console.error(`bench-aside: ${e.message}`); process.exitCode = 1; }
}
