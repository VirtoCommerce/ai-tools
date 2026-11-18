// Git access and diff parsing. Parsers take git's text so they can be checked without a repository.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { escapeRe } from "./globs.mjs";
import { FIX_SUBJECT, FIX_WINDOW_DAYS, MAX_BLAME_RUNS, VERSION_LINE } from "./zones.mjs";

export function git(argv) {
  return execFileSync("git", argv, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

export function gitShow(spec) {
  try {
    return git(["show", spec]);
  } catch {
    return "";
  }
}

// Files matching a pattern: the word form `(<|\b)(A|B)\b` for component names, or a raw regex.
export function gitGrep(words, dir, globs, raw) {
  const pattern = raw ?? `(<|\\b)(${words.map(escapeRe).join("|")})\\b`;
  const scope = globs.length ? globs.map((g) => `${dir}/**/${g}`) : ["."];
  try {
    const out = execFileSync("git", ["grep", "-l", "-E", pattern, "--", ...scope], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// The files that contain each of several fixed strings, in one `git grep -o`: every match comes back
// as `path:match`. `word` matches whole words only. Missing candidates map to an empty set.
export function grepHits(cands, { word = false, scope = ["."] } = {}) {
  const files = new Map(cands.map((c) => [c, new Set()]));
  if (!cands.length) return files;
  let out = "";
  try {
    out = execFileSync("git", ["grep", "-o", "-F", "-I", ...(word ? ["-w"] : []), ...cands.flatMap((c) => ["-e", c]), "--", ...scope], {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    /* no match at all */
  }
  for (const line of out.split("\n")) {
    const i = line.indexOf(":");
    const hit = i > 0 && files.get(line.slice(i + 1));
    if (hit) hit.add(line.slice(0, i));
  }
  return files;
}

// Working-tree reads: the graph, consumers, styles and tokens all read the same files again and again.
const headCache = new Map();
export function readHead(p) {
  if (headCache.has(p)) return headCache.get(p);
  let text = "";
  try {
    text = readFileSync(p, "utf8");
  } catch {
    /* missing or deleted: empty */
  }
  headCache.set(p, text);
  return text;
}

export function defaultBase() {
  for (const ref of ["origin/dev", "origin/main", "origin/master"]) {
    try {
      git(["rev-parse", "--verify", "--quiet", ref]);
      return ref;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

export function changedFiles(mb) {
  return parseChanges({
    nameStatus: git(["diff", "--name-status", "--no-renames", mb, "HEAD"]),
    numstat: git(["diff", "--numstat", "--no-renames", mb, "HEAD"]),
    diff: git(["diff", "--no-renames", "-U0", mb, "HEAD"]),
  });
}

// One entry per path from `--name-status`, line counts from `--numstat`, and from the `-U0` diff the
// text and line number of every added and removed line. `hunks` maps a path to its hunks' changed
// lines and position, kept out of the file objects so the JSON stays as it is.
export function parseChanges({ nameStatus, numstat, diff }) {
  const byPath = new Map();
  for (const line of nameStatus.split("\n").filter(Boolean)) {
    const [status, p] = line.split("\t");
    byPath.set(p, { path: p, status: status[0], added: 0, deleted: 0, addedText: [], deletedText: [], addedLines: [], deletedLines: [] });
  }
  for (const line of numstat.split("\n").filter(Boolean)) {
    const [a, d, p] = line.split("\t");
    const f = byPath.get(p);
    if (f) Object.assign(f, { added: a === "-" ? 0 : Number(a), deleted: d === "-" ? 0 : Number(d) });
  }
  const hunks = new Map();
  let current = null;
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      current = byPath.get(line.split(" b/").pop()) ?? null;
      hunk = null;
    } else if (line.startsWith("+++ ") || line.startsWith("--- ")) continue;
    else if (line.startsWith("@@")) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))?/);
      if (m) [oldLine, newLine] = [Number(m[1]), Number(m[3])];
      if (current) {
        // Where the hunk sits: the impact map finds the code around it by these.
        hunk = { added: [], deleted: [], oldStart: oldLine, oldCount: m?.[2] === undefined ? 1 : Number(m[2]), newStart: newLine, newCount: m?.[4] === undefined ? 1 : Number(m[4]) };
        if (!hunks.has(current.path)) hunks.set(current.path, []);
        hunks.get(current.path).push(hunk);
      }
    } else if (current && line.startsWith("+")) {
      current.addedText.push(line.slice(1));
      current.addedLines.push(newLine++);
      hunk?.added.push(line.slice(1));
    } else if (current && line.startsWith("-")) {
      current.deletedText.push(line.slice(1));
      current.deletedLines.push(oldLine++);
      hunk?.deleted.push(line.slice(1));
    }
  }
  return { files: [...byPath.values()], hunks };
}

// Exact renames (`R100`): moved, not edited. The classified diff still lists both sides, as a delete
// and an add.
export function exactRenames(mb) {
  return parseRenames(git(["diff", "-M100%", "--name-status", mb, "HEAD"]));
}

export function parseRenames(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const [status, from, to] = line.split("\t");
    if (status === "R100") out.push({ from, to });
  }
  return out;
}

// Paths whose whole change is whitespace: `git diff -w` counts no line for them.
export function whitespaceOnly(mb) {
  return parseWhitespaceOnly(git(["diff", "-w", "--numstat", "--no-renames", mb, "HEAD"]));
}

export function parseWhitespaceOnly(text) {
  const out = new Set();
  for (const line of text.split("\n").filter(Boolean)) {
    const [a, d, p] = line.split("\t");
    if (a === "0" && d === "0") out.add(p);
  }
  return out;
}

// One `git blame` for all ranges; range by range only if that fails, skipping the ranges that fail.
function blame(rev, p, ranges) {
  const run = (rs) => git(["blame", "--porcelain", ...rs.flatMap(([a, b]) => ["-L", `${a},${b}`]), rev, "--", p]);
  try {
    return [run(ranges)];
  } catch {
    return ranges.flatMap((r) => {
      try {
        return [run([r])];
      } catch {
        return [];
      }
    });
  }
}

// Blobs at a revision in one `git cat-file --batch`: `rev:path` → text, "" when missing.
export function showMany(rev, paths) {
  const out = new Map();
  if (!paths.length) return out;
  const buf = execFileSync("git", ["cat-file", "--batch"], { input: paths.map((p) => `${rev}:${p}`).join("\n") + "\n", maxBuffer: 1024 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  let pos = 0;
  for (const p of paths) {
    const eol = buf.indexOf(10, pos);
    const header = buf.toString("utf8", pos, eol).split(" ");
    pos = eol + 1;
    // `<sha> <type> <size>` is followed by the object; `<spec> missing` is not.
    const size = header.length === 3 ? Number(header[2]) : -1;
    out.set(p, header[1] === "blob" ? buf.toString("utf8", pos, pos + size) : "");
    if (size >= 0) pos += size + 1;
  }
  return out;
}

export function versionOnly(f) {
  const changed = [...f.addedText, ...f.deletedText].filter((l) => l.trim());
  return changed.length > 0 && changed.every((l) => VERSION_LINE.test(l));
}

// Removed lines that a fix, hotfix or revert wrote within the year before HEAD. Fixes of fixes are about a
// tenth of all fixes here, in chains of four to six: code that was just repaired is fragile.
export function rewrittenFix(ctx, f) {
  if (!f.deletedLines.length || f.status === "A") return null;
  const runs = [];
  for (const n of f.deletedLines) {
    const last = runs.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  const shas = new Set();
  const ranges = runs.slice(0, MAX_BLAME_RUNS);
  for (const out of blame(ctx.mergeBase, f.path, ranges)) for (const m of out.matchAll(/^([0-9a-f]{40}) \d+ \d+/gm)) shas.add(m[1]);
  ctx.headTime ??= Number(git(["log", "-1", "--format=%ct", "HEAD"]).trim());
  const unknown = [...shas].filter((sha) => !ctx.commits.has(sha));
  if (unknown.length) {
    for (const line of git(["log", "--no-walk=unsorted", "--format=%H%x09%s%x09%ct", ...unknown]).split("\n").filter(Boolean)) {
      const [sha, subject, time] = line.split("\t");
      ctx.commits.set(sha, { subject, time: Number(time) });
    }
  }
  for (const sha of shas) {
    const c = ctx.commits.get(sha);
    if (FIX_SUBJECT.test(c.subject) && ctx.headTime - c.time < FIX_WINDOW_DAYS * 86400) return `${sha.slice(0, 9)} "${c.subject.slice(0, 70)}"`;
  }
  return null;
}
