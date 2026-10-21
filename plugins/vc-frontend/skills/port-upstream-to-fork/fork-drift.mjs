#!/usr/bin/env node
// Finds upstream vc-frontend changes that a theme fork does not receive through a merge: changes to code
// upstream renders and the fork does not, and to components the fork renders in fewer places than
// upstream does. It builds both trees with the repository's own Vite config and compares the module
// graphs Rollup produces — resolution, Vue compilation and tree-shaking are Vite's, not guessed.
//
//   node fork-drift.mjs --to <upstream ref> [--from <ref>] [--fork <ref>] [--map <file>] [--json] [--rebuild]
//
// --to       the upstream side: upstream/dev, a release tag, or M^2 for a merge commit M (with --fork M)
// --from     start of the upstream range whose commits are listed (default: merge-base of --fork and --to)
// --fork     the fork's commit to analyse (default: HEAD — committed state; uncommitted edits are ignored)
// --map      the fork map (default: fork-map.json in the repository root, when present; read from the working tree)
// --rebuild  ignore cached graphs
//
// Each tree is built once per commit in a temporary worktree under the OS temp folder; graphs are cached
// under node_modules/.cache/fork-drift/, by commit and by this script's version. A build takes about a minute.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) continue;
  const next = argv[i + 1];
  args[argv[i].slice(2)] = next === undefined || next.startsWith("--") ? true : next;
}

// Every git call runs at the repository root: path arguments (client-app, pathspecs) are relative to the cwd.
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 }).trim();
const out = (line = "") => process.stdout.write(line + "\n");

if (typeof args.to !== "string") {
  console.error("usage: node fork-drift.mjs --to <upstream ref> [--from <ref>] [--fork <ref>] [--map <file>] [--json] [--rebuild]");
  process.exit(2);
}

const FORK = git("rev-parse", `${typeof args.fork === "string" ? args.fork : "HEAD"}^{commit}`);
const TO = git("rev-parse", `${args.to}^{commit}`);
const FROM = typeof args.from === "string" ? git("rev-parse", `${args.from}^{commit}`) : git("merge-base", FORK, TO);
// An empty range lists no commits, and every section would read "None changed upstream".
if (FROM === TO) {
  const hint = typeof args.from === "string" ? "" : ` — ${args.to} is already in the fork's history; right after a merge commit M pass --from "$(git merge-base M^1 M^2)"`;
  console.error(`fork-drift: the range ${FROM.slice(0, 9)}..${TO.slice(0, 9)} is empty${hint}`);
  process.exit(2);
}
const MAP_PATH = typeof args.map === "string" ? path.resolve(args.map) : path.join(ROOT, "fork-map.json");
if (!existsSync(path.join(ROOT, "node_modules", "vite", "bin", "vite.js"))) {
  console.error(`fork-drift: no node_modules in ${ROOT} — run \`corepack yarn install\` there first`);
  process.exit(2);
}
const CACHE = path.join(ROOT, "node_modules", ".cache", "fork-drift");
// Outside the repository: Vite treats any path containing node_modules as a dependency and leaves its
// template-literal imports (locales, sign-in providers) unexpanded.
// realpath: Windows can report the temp folder by its 8.3 short name, which Vite expands, so ids would not match the root.
const WORKTREES = path.join(realpathSync.native(tmpdir()), `fork-drift-${createHash("sha1").update(ROOT).digest("hex").slice(0, 8)}`);
// Each run builds in its own folder, so two runs on one checkout never remove each other's worktrees.
const RUN = path.join(WORKTREES, `run-${process.pid}`);
const BUILD_ID = createHash("sha1").update(readFileSync(fileURLToPath(import.meta.url))).update(readFileSync(path.join(HERE, "graph.vite.config.mjs"))).digest("hex").slice(0, 8);
const NOT_RENDERED = /^client-app\/(core-api|public)\//;

// ---------- building the graphs ----------

// Unlink the borrowed node_modules first: a recursive delete that follows the link (a junction on Windows)
// would empty the checkout's own node_modules. Node's rmSync never follows one; prune drops the registration.
function removeWorktree(wt) {
  const link = path.join(wt, "node_modules");
  if (lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(link);
  rmSync(wt, { recursive: true, force: true, maxRetries: 5 });
  git("worktree", "prune");
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};

// A killed run (closed terminal, kill -9, a timeout) leaves its worktree and link behind; remove those of every
// run that is gone before building. A temp folder emptied by a reboot leaves worktrees registered, and
// `worktree add` refuses the path.
function removeLeftovers() {
  git("worktree", "prune");
  if (!existsSync(WORKTREES)) return;
  for (const d of readdirSync(WORKTREES)) {
    const run = /^run-(\d+)$/.exec(d);
    if (run && alive(Number(run[1]))) continue;
    const dir = path.join(WORKTREES, d);
    // A run folder holds its worktrees; earlier versions kept them directly here, as wt-<sha>.
    if (run) for (const wt of readdirSync(dir)) removeWorktree(path.join(dir, wt));
    removeWorktree(dir);
  }
}

// Ctrl+C, and a timeout that kills the process tree, reach the build too. With a listener Node is not killed,
// the build returns, and the finally block in buildGraph cleans up. `kill -9` and `taskkill /F` cannot be
// caught: the next run removes what they leave.
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]]) process.on(signal, () => process.exit(code));

function buildGraph(sha) {
  const graphPath = path.join(CACHE, `graph-${BUILD_ID}-${sha}.json`);
  if (existsSync(graphPath) && !args.rebuild) return JSON.parse(readFileSync(graphPath, "utf8"));
  mkdirSync(CACHE, { recursive: true });
  // Written under its own name and moved into place only once the build passed: an interrupted or failed
  // build never leaves a graph that a later run would reuse.
  const pending = `${graphPath}.${process.pid}.tmp`;
  mkdirSync(RUN, { recursive: true });
  const wt = path.join(RUN, `wt-${sha.slice(0, 12)}`);
  git("worktree", "add", "--detach", wt, sha);

  try {
    // Reuse the checkout's node_modules when the commit locks the same dependencies; install otherwise.
    // Compared as git blobs: with core.autocrlf the checkout has CRLF and the commit LF.
    const lockAt = (spec) => {
      try {
        return git("rev-parse", spec);
      } catch {
        return null;
      }
    };
    const sameLock = existsSync(path.join(ROOT, "yarn.lock")) && lockAt(`${sha}:yarn.lock`) === git("hash-object", path.join(ROOT, "yarn.lock"));
    // "junction": a Windows directory link that needs no admin rights; ignored elsewhere.
    if (sameLock) symlinkSync(path.join(ROOT, "node_modules"), path.join(wt, "node_modules"), "junction");
    else {
      process.stderr.write(`fork-drift: ${sha.slice(0, 9)} locks different dependencies — running yarn install in its worktree\n`);
      // Through corepack, which runs the Yarn the commit pins (a global Yarn 1 refuses it), and through a shell,
      // so Windows finds corepack.cmd. Its output goes to stderr: stdout carries the report (--json).
      const install = spawnSync("corepack yarn install --immutable", { cwd: wt, shell: true, stdio: ["ignore", 2, 2] });
      if (install.status !== 0) throw new Error(`yarn install failed for ${sha.slice(0, 9)}`);
    }

    copyFileSync(path.join(HERE, "graph.vite.config.mjs"), path.join(wt, ".fork-drift.vite.config.mjs"));
    process.stderr.write(`fork-drift: building ${sha.slice(0, 9)}…\n`);
    const build = spawnSync(process.execPath, [path.join(wt, "node_modules", "vite", "bin", "vite.js"), "build", "--config", ".fork-drift.vite.config.mjs"], {
      cwd: wt,
      env: { ...process.env, GRAPH_OUT: pending, GRAPH_DIST: path.join(wt, ".fork-drift-dist") },
      encoding: "utf8",
      maxBuffer: 1 << 28,
    });
    if (build.status !== 0 || !existsSync(pending)) {
      if (build.signal) throw new Error(`build of ${sha.slice(0, 9)} interrupted (${build.signal})`);
      throw new Error(`vite build failed for ${sha.slice(0, 9)}\n${(build.stderr || build.stdout).slice(-4000)}`);
    }
    renameSync(pending, graphPath);
  } finally {
    rmSync(pending, { force: true });
    removeWorktree(wt);
  }
  return JSON.parse(readFileSync(graphPath, "utf8"));
}

// ---------- reading a graph ----------

function analyse(graph) {
  const prefix = graph.root + "/";
  const file = (id) => id.slice(prefix.length).split("?")[0];
  const isStyle = (id) => /[?&]type=style\b|\.(s?css|sass)(\?|$)/.test(id);
  const modules = graph.modules;

  // A file renders when any non-style part of it survived tree-shaking.
  const rendered = new Set();
  for (const [id, m] of Object.entries(modules)) if (m.rendered > 0 && !isStyle(id)) rendered.add(file(id));
  const present = new Set(Object.keys(modules).map(file));
  // Stylesheets reach the build through Sass, not Rollup: compiled means rendered.
  const styles = new Set((graph.watched ?? []).map(file).filter((f) => /\.(s?css|sass)$/.test(f)));
  for (const [id] of Object.entries(modules)) if (/\.(s?css|sass)$/.test(file(id))) styles.add(file(id));

  // Which modules actually provide `name` when it is imported from `id`.
  function provider(id, name, seen = new Set()) {
    const key = `${id}#${name}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const m = modules[id];
    if (!m) return [id];
    if (name === "*") return [id, ...m.reexports.filter((r) => r.id).flatMap((r) => provider(r.id, r.imported === "*" ? "*" : r.imported, seen))];
    const direct = m.reexports.find((r) => r.exported === name && r.id);
    if (direct) return direct.imported === "*" ? provider(direct.id, "*", seen) : provider(direct.id, direct.imported, seen);
    // `export *` never forwards `default`.
    if (name !== "default") {
      for (const star of m.reexports.filter((r) => r.exported === "*" && r.id)) {
        if (exportsName(star.id, name)) return provider(star.id, name, seen);
      }
    }
    return [id];
  }

  // Rollup lists each `export *` in `exports` as "*", not the names behind it, so follow the chain.
  function exportsName(id, name, seen = new Set()) {
    if (seen.has(id)) return false;
    seen.add(id);
    const m = modules[id];
    if (!m) return false;
    return m.exports.includes(name) || m.reexports.some((r) => r.exported === "*" && r.id && exportsName(r.id, name, seen));
  }

  // users: file -> Set(rendered files that use it by name)
  const users = new Map();
  const unresolved = [];
  const add = (target, user) => {
    const t = file(target);
    if (t === user) return;
    if (!users.has(t)) users.set(t, new Set());
    users.get(t).add(user);
  };
  for (const [id, m] of Object.entries(modules)) {
    if (!(m.rendered > 0) || isStyle(id)) continue;
    const user = file(id);
    const named = new Set();
    for (const imp of m.imports) {
      if (!imp.id) {
        if (/^(\.|@\/)/.test(imp.source)) unresolved.push(`${user} → ${imp.source}`);
        continue;
      }
      named.add(imp.id);
      for (const n of imp.names) for (const p of provider(imp.id, n)) add(p, user);
    }
    const reexported = new Set(m.reexports.map((r) => r.id));
    // Edges Vite added that the AST did not name (globs, template-literal imports): the whole module.
    for (const extra of [...m.importedIds, ...m.dynamicallyImportedIds]) {
      if (named.has(extra) || reexported.has(extra) || !extra.startsWith(prefix)) continue;
      for (const p of provider(extra, "*")) add(p, user);
    }
  }
  return { rendered, present, users, unresolved, styles };
}

// ---------- report ----------

// One `git log` for the whole range: a process per file takes minutes on a tree of thousands of files.
const commitsByFile = new Map();
for (const entry of git("-c", "core.quotePath=false", "log", "--format=%x00%h %s", "--name-only", `${FROM}..${TO}`).split("\0").slice(1)) {
  const [subject, ...files] = entry.split("\n");
  for (const f of files.filter(Boolean)) commitsByFile.set(f, [...(commitsByFile.get(f) ?? []), subject]);
}
const upstreamCommits = (f) => commitsByFile.get(f) ?? [];

const map = existsSync(MAP_PATH) ? JSON.parse(readFileSync(MAP_PATH, "utf8")) : { replacements: [], ignored: [] };
const isPaths = (v) => v === undefined || (Array.isArray(v) && v.every((p) => typeof p === "string"));
const mapError = !Array.isArray(map.replacements ?? []) || !Array.isArray(map.ignored ?? [])
  ? "replacements and ignored must be lists"
  : [
      ...(map.replacements ?? []).map((r, i) => (r && isPaths(r.fork) && isPaths(r.upstream) ? "" : `replacements[${i}]: fork and upstream must be lists of paths`)),
      ...(map.ignored ?? []).map((g, i) => (typeof g?.upstream === "string" ? "" : `ignored[${i}]: upstream must be a path`)),
    ].find(Boolean);
if (mapError) {
  console.error(`fork-drift: ${MAP_PATH}: ${mapError}`);
  process.exit(2);
}
// A hand-edited entry may leave out either list.
const replacements = (map.replacements ?? []).map((r) => ({ ...r, fork: r.fork ?? [], upstream: r.upstream ?? [] }));
const mappedUpstream = new Map();
for (const r of replacements) for (const u of r.upstream) mappedUpstream.set(u, r);
const ignored = new Map((map.ignored ?? []).map((i) => [i.upstream, i.reason]));
const status = (f) => (ignored.has(f) ? `ignored: ${ignored.get(f)}` : mappedUpstream.has(f) ? `mapped → ${mappedUpstream.get(f).fork.join(", ")}` : "NOT in the map");

removeLeftovers();
// Graphs from another version of this script are never read again.
if (existsSync(CACHE)) for (const f of readdirSync(CACHE)) if (!f.startsWith(`graph-${BUILD_ID}-`)) rmSync(path.join(CACHE, f), { force: true });
let fork, up;
try {
  fork = analyse(buildGraph(FORK));
  up = analyse(buildGraph(TO));
} finally {
  try {
    rmdirSync(RUN);
  } catch {}
}
const forkTree = new Set(git("ls-tree", "-r", "--name-only", FORK, "client-app").split("\n"));
const fromTree = new Set(git("ls-tree", "-r", "--name-only", FROM, "client-app").split("\n"));
const upTree = new Set(git("ls-tree", "-r", "--name-only", TO, "client-app").split("\n"));
const reportable = (f) => !NOT_RENDERED.test(f) && f.startsWith("client-app/");

// A. Upstream renders it, the fork does not.
// Sorted throughout: the build's module order varies, and two reports of the same range should diff clean.
const notRendered = [...up.rendered].sort()
  .filter((f) => reportable(f) && !fork.rendered.has(f))
  .map((f) => ({
    file: f,
    why: !forkTree.has(f)
      ? fromTree.has(f) ? "deleted or moved by the fork" : "new upstream, not merged into the fork yet"
      : fork.present.has(f) ? "in the fork's build, all of it tree-shaken away" : "in the fork's tree, imported by nothing it renders",
    commits: upstreamCommits(f),
    status: status(f),
  }));

// A2. Stylesheets upstream compiles and the fork does not.
const notCompiled = [...up.styles].sort()
  .filter((f) => reportable(f) && !fork.styles.has(f))
  .map((f) => ({
    file: f,
    why: !forkTree.has(f) ? (fromTree.has(f) ? "deleted or moved by the fork" : "new upstream, not merged into the fork yet") : "in the fork's tree, compiled by nothing",
    commits: upstreamCommits(f),
    status: status(f),
  }));

// B. Both render it, but upstream renders it from places the fork no longer does.
const droppedSites = [...up.rendered].sort()
  .filter((f) => reportable(f) && fork.rendered.has(f))
  .map((f) => {
    const forkUsers = fork.users.get(f) ?? new Set();
    // A user the fork's tree lacks and never had is new upstream code not merged yet — not a dropped site.
    const lost = [...(up.users.get(f) ?? [])].filter((u) => !forkUsers.has(u) && (forkTree.has(u) || fromTree.has(u)));
    return { file: f, lostUsers: lost.sort(), forkUsers: [...forkUsers].sort(), commits: upstreamCommits(f), status: status(f) };
  })
  .filter((d) => d.lostUsers.length);

// C. Upstream changes to files the map says the fork replaced.
const portCandidates = [...mappedUpstream.entries()]
  .map(([f, r]) => ({ file: f, forkTargets: r.fork, note: r.note ?? "", commits: upstreamCommits(f) }))
  .filter((c) => c.commits.length);

// D. Fork-only rendered files not in the map, with the upstream files they share the most with.
// The sources of many files through one `git cat-file --batch`, not a `git show` each.
function sources(ref, files) {
  const batch = spawnSync("git", ["cat-file", "--batch"], { cwd: ROOT, input: files.map((f) => `${ref}:${f}\n`).join(""), maxBuffer: 1 << 30 });
  const buf = batch.stdout;
  const result = new Map();
  let at = 0;
  for (const f of files) {
    const eol = buf.indexOf(10, at);
    const header = buf.toString("utf8", at, eol);
    at = eol + 1;
    if (!/ blob \d+$/.test(header)) {
      result.set(f, "");
      continue;
    }
    const size = Number(header.split(" ").pop());
    result.set(f, buf.toString("utf8", at, at + size));
    at += size + 1;
  }
  return result;
}
function signals(src) {
  const s = new Set();
  for (const m of src.matchAll(/from\s+["'](@\/(?!ui-kit)[^"']+)["']/g)) s.add(`import ${m[1]}`);
  for (const m of src.matchAll(/\bt\(\s*["']([\w.]+)["']/g)) s.add(`i18n ${m[1]}`);
  for (const m of src.matchAll(/\b(use[A-Z]\w+)\(/g)) s.add(`${m[1]}()`);
  for (const m of src.matchAll(/\bdata-(?!test-id)([a-z-]+)=/g)) s.add(`data-${m[1]}`);
  return s;
}
const mappedFork = new Set(replacements.flatMap((r) => r.fork));
const forkOnly = [...fork.rendered].filter((f) => reportable(f) && /\.(vue|ts)$/.test(f) && !upTree.has(f) && !fromTree.has(f) && !mappedFork.has(f));
const upstreamFiles = forkOnly.length ? [...up.rendered].filter((f) => reportable(f) && /\.(vue|ts)$/.test(f)) : [];
const upstreamSources = sources(TO, upstreamFiles);
const forkSources = sources(FORK, forkOnly);
const upstreamSignals = upstreamFiles.map((f) => [f, signals(upstreamSources.get(f))]);
const unmapped = forkOnly.map((f) => {
  const own = signals(forkSources.get(f));
  const matches = upstreamSignals
    .map(([u, theirs]) => {
      const shared = [...own].filter((s) => theirs.has(s));
      return { upstream: u, score: shared.reduce((n, s) => n + (s.startsWith("import ") ? 1 : 2), 0), shared, renderedInFork: fork.rendered.has(u) };
    })
    .filter((m) => m.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  return { fork: f, matches };
});

// E. Map entries naming missing files.
const stale = replacements.flatMap((r) => [
  ...r.fork.filter((f) => !forkTree.has(f)).map((f) => `fork: ${f}`),
  ...r.upstream.filter((f) => !upTree.has(f)).map((f) => `upstream: ${f}`),
]);

const report = {
  fork: FORK, from: FROM, to: TO, map: existsSync(MAP_PATH) ? MAP_PATH : null,
  counts: { forkRendered: fork.rendered.size, upstreamRendered: up.rendered.size },
  unresolved: { fork: fork.unresolved, upstream: up.unresolved },
  notRendered, notCompiled, droppedSites, portCandidates, unmapped, stale,
};

if (args.json) {
  out(JSON.stringify(report, null, 2));
} else {
  const changedFirst = (items, render) => {
    const changed = items.filter((i) => i.commits.length && !ignored.has(i.file));
    if (!changed.length) out("None changed upstream in this range.");
    for (const i of changed) {
      out(render(i));
      for (const c of i.commits) out(`    ${c}`);
    }
    const rest = items.filter((i) => !changed.includes(i));
    if (rest.length) {
      out(`  Not changed upstream in this range, or ignored by the map (${rest.length}):`);
      for (const i of rest) out(`  · ${i.file}${i.why ? ` — ${i.why}` : ""}${ignored.has(i.file) ? ` (${status(i.file)})` : ""}`);
    }
  };

  out(`# Fork drift — fork ${FORK.slice(0, 9)}, upstream ${FROM.slice(0, 9)}..${TO.slice(0, 9)}`);
  out(`Map: ${report.map ?? "none — section D is the starting point for one"}`);
  out(`Rendered app files: fork ${fork.rendered.size}, upstream ${up.rendered.size}. Unresolved local imports: fork ${fork.unresolved.length}, upstream ${up.unresolved.length}.`);
  out();
  out("## A. Upstream renders it, the fork does not");
  changedFirst(notRendered, (i) => `- ${i.file} — ${i.why} (${i.status})`);
  out();
  out("## A2. Stylesheets upstream compiles, the fork does not");
  changedFirst(notCompiled, (i) => `- ${i.file} — ${i.why} (${i.status})`);
  out();
  out("## B. Rendered by both, but from fewer places in the fork");
  changedFirst(droppedSites, (i) => `- ${i.file} (${i.status})\n    used upstream by, not in the fork: ${i.lostUsers.join(", ")}\n    used in the fork by: ${i.forkUsers.join(", ") || "—"}`);
  out();
  out("## C. Upstream changes to files the fork replaced (map)");
  if (!portCandidates.length) out("None in this range.");
  for (const c of portCandidates) {
    out(`- ${c.file} → ${c.forkTargets.join(", ")}${c.note ? `  — ${c.note}` : ""}`);
    for (const commit of c.commits) out(`    ${commit}`);
  }
  out();
  out("## D. Fork-only rendered files not in the map");
  if (!unmapped.length) out("None.");
  for (const u of unmapped) {
    out(`- ${u.fork}`);
    if (!u.matches.length) out("    (nothing upstream shares enough with it to suggest a match)");
    for (const m of u.matches) out(`    ${m.score}  ${m.upstream}${m.renderedInFork ? "" : " (not rendered by the fork)"}  [${m.shared.slice(0, 5).join(", ")}]`);
  }
  if (stale.length) {
    out();
    out("## E. Map entries naming missing files");
    for (const s of stale) out(`- ${s}`);
  }
  if (fork.unresolved.length || up.unresolved.length) {
    out();
    out("## Unresolved local imports (edges the graph may be missing)");
    for (const g of fork.unresolved) out(`- fork: ${g}`);
    for (const g of up.unresolved) out(`- upstream: ${g}`);
  }
}
