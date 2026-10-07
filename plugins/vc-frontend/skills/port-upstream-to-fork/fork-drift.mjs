#!/usr/bin/env node
// Finds upstream vc-frontend changes that a theme fork does not receive through a merge: changes to code
// upstream renders and the fork does not, and to components the fork renders in fewer places than
// upstream does. It builds both trees with the repository's own Vite config and compares the module
// graphs Rollup produces — resolution, Vue compilation and tree-shaking are Vite's, not guessed.
//
//   node fork-drift.mjs --to <upstream ref> [--from <ref>] [--fork <ref>] [--map <file>] [--json] [--rebuild]
//
// --to       the upstream side: upstream/dev, a release tag, or HEAD^2 right after a merge commit
// --from     start of the upstream range whose commits are listed (default: merge-base of --fork and --to)
// --fork     the fork's commit to analyse (default: HEAD — committed state; uncommitted edits are ignored)
// --map      the fork map (default: fork-map.json in the repository root, when present)
// --rebuild  ignore cached graphs
//
// Each tree is built once per commit in a temporary worktree; graphs are cached under
// node_modules/.cache/fork-drift/. A build takes about a minute.

import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
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

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 }).trim();
const out = (line = "") => process.stdout.write(line + "\n");

if (typeof args.to !== "string") {
  console.error("usage: node fork-drift.mjs --to <upstream ref> [--from <ref>] [--fork <ref>] [--map <file>] [--json] [--rebuild]");
  process.exit(2);
}

const ROOT = git("rev-parse", "--show-toplevel");
const FORK = git("rev-parse", `${typeof args.fork === "string" ? args.fork : "HEAD"}^{commit}`);
const TO = git("rev-parse", `${args.to}^{commit}`);
const FROM = typeof args.from === "string" ? git("rev-parse", `${args.from}^{commit}`) : git("merge-base", FORK, TO);
const MAP_PATH = typeof args.map === "string" ? path.resolve(args.map) : path.join(ROOT, "fork-map.json");
const CACHE = path.join(ROOT, "node_modules", ".cache", "fork-drift");
const NOT_RENDERED = /^client-app\/(core-api|public)\//;

// ---------- building the graphs ----------

function buildGraph(sha) {
  const graphPath = path.join(CACHE, `graph-${sha}.json`);
  if (existsSync(graphPath) && !args.rebuild) return JSON.parse(readFileSync(graphPath, "utf8"));
  mkdirSync(CACHE, { recursive: true });
  const wt = path.join(CACHE, `wt-${sha.slice(0, 12)}`);
  if (existsSync(wt)) git("worktree", "remove", "--force", wt);
  git("worktree", "add", "--detach", wt, sha);

  // Reuse the checkout's node_modules when the commit locks the same dependencies; install otherwise.
  const sameLock = existsSync(path.join(ROOT, "yarn.lock")) && git("show", `${sha}:yarn.lock`) === readFileSync(path.join(ROOT, "yarn.lock"), "utf8").trim();
  if (sameLock) symlinkSync(path.join(ROOT, "node_modules"), path.join(wt, "node_modules"));
  else {
    process.stderr.write(`fork-drift: ${sha.slice(0, 9)} locks different dependencies — running yarn install in its worktree\n`);
    const install = spawnSync("yarn", ["install", "--immutable"], { cwd: wt, stdio: ["ignore", "inherit", "inherit"] });
    if (install.status !== 0) throw new Error(`yarn install failed in ${wt}`);
  }

  copyFileSync(path.join(HERE, "graph.vite.config.mjs"), path.join(wt, ".fork-drift.vite.config.mjs"));
  process.stderr.write(`fork-drift: building ${sha.slice(0, 9)}…\n`);
  const build = spawnSync(process.execPath, [path.join(wt, "node_modules", "vite", "bin", "vite.js"), "build", "--config", ".fork-drift.vite.config.mjs"], {
    cwd: wt,
    env: { ...process.env, GRAPH_OUT: graphPath, GRAPH_DIST: path.join(wt, ".fork-drift-dist") },
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  if (build.status !== 0 || !existsSync(graphPath)) {
    throw new Error(`vite build failed for ${sha.slice(0, 9)} — worktree kept at ${wt}\n${(build.stderr || build.stdout).slice(-4000)}`);
  }
  git("worktree", "remove", "--force", wt);
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
    for (const star of m.reexports.filter((r) => r.exported === "*" && r.id)) {
      if (modules[star.id]?.exports.includes(name)) return provider(star.id, name, seen);
    }
    return [id];
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
  return { rendered, present, users, unresolved, styles, hasWatched: Array.isArray(graph.watched) };
}

// ---------- report ----------

const commitCache = new Map();
function upstreamCommits(f) {
  if (!commitCache.has(f)) {
    const log = git("log", "--format=%h %s", `${FROM}..${TO}`, "--", f);
    commitCache.set(f, log ? log.split("\n") : []);
  }
  return commitCache.get(f);
}

const map = existsSync(MAP_PATH) ? JSON.parse(readFileSync(MAP_PATH, "utf8")) : { replacements: [], ignored: [] };
const mappedUpstream = new Map();
for (const r of map.replacements ?? []) for (const u of r.upstream) mappedUpstream.set(u, r);
const ignored = new Map((map.ignored ?? []).map((i) => [i.upstream, i.reason]));
const status = (f) => (ignored.has(f) ? `ignored: ${ignored.get(f)}` : mappedUpstream.has(f) ? `mapped → ${mappedUpstream.get(f).fork.join(", ")}` : "NOT in the map");

const fork = analyse(buildGraph(FORK));
const up = analyse(buildGraph(TO));
const forkTree = new Set(git("ls-tree", "-r", "--name-only", FORK, "client-app").split("\n"));
const fromTree = new Set(git("ls-tree", "-r", "--name-only", FROM, "client-app").split("\n"));
const upTree = new Set(git("ls-tree", "-r", "--name-only", TO, "client-app").split("\n"));
const reportable = (f) => !NOT_RENDERED.test(f) && f.startsWith("client-app/");

// A. Upstream renders it, the fork does not.
const notRendered = [...up.rendered]
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
const notCompiled = [...up.styles]
  .filter((f) => reportable(f) && !fork.styles.has(f))
  .map((f) => ({
    file: f,
    why: !forkTree.has(f) ? (fromTree.has(f) ? "deleted or moved by the fork" : "new upstream, not merged into the fork yet") : "in the fork's tree, compiled by nothing",
    commits: upstreamCommits(f),
    status: status(f),
  }));

// B. Both render it, but upstream renders it from places the fork no longer does.
const droppedSites = [...up.rendered]
  .filter((f) => reportable(f) && fork.rendered.has(f))
  .map((f) => {
    const forkUsers = fork.users.get(f) ?? new Set();
    // A user the fork's tree lacks and never had is new upstream code not merged yet — not a dropped site.
    const lost = [...(up.users.get(f) ?? [])].filter((u) => !forkUsers.has(u) && (forkTree.has(u) || fromTree.has(u)));
    return { file: f, lostUsers: lost, forkUsers: [...forkUsers], commits: upstreamCommits(f), status: status(f) };
  })
  .filter((d) => d.lostUsers.length);

// C. Upstream changes to files the map says the fork replaced.
const portCandidates = [...mappedUpstream.entries()]
  .map(([f, r]) => ({ file: f, forkTargets: r.fork, note: r.note ?? "", commits: upstreamCommits(f) }))
  .filter((c) => c.commits.length);

// D. Fork-only rendered files not in the map, with the upstream files they share the most with.
const source = (ref, f) => {
  try {
    return git("show", `${ref}:${f}`);
  } catch {
    return "";
  }
};
function signals(src) {
  const s = new Set();
  for (const m of src.matchAll(/from\s+["'](@\/(?!ui-kit)[^"']+)["']/g)) s.add(`import ${m[1]}`);
  for (const m of src.matchAll(/\bt\(\s*["']([\w.]+)["']/g)) s.add(`i18n ${m[1]}`);
  for (const m of src.matchAll(/\b(use[A-Z]\w+)\(/g)) s.add(`${m[1]}()`);
  for (const m of src.matchAll(/\bdata-(?!test-id)([a-z-]+)=/g)) s.add(`data-${m[1]}`);
  return s;
}
const mappedFork = new Set((map.replacements ?? []).flatMap((r) => r.fork));
const forkOnly = [...fork.rendered].filter((f) => reportable(f) && /\.(vue|ts)$/.test(f) && !upTree.has(f) && !fromTree.has(f) && !mappedFork.has(f));
const upstreamSignals = forkOnly.length ? [...up.rendered].filter((f) => reportable(f) && /\.(vue|ts)$/.test(f)).map((f) => [f, signals(source(TO, f))]) : [];
const unmapped = forkOnly.map((f) => {
  const own = signals(source(FORK, f));
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
const stale = (map.replacements ?? []).flatMap((r) => [
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
  if (!fork.hasWatched || !up.hasWatched) out("Unknown: a cached graph predates style tracking — rerun with --rebuild.");
  else changedFirst(notCompiled, (i) => `- ${i.file} — ${i.why} (${i.status})`);
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
