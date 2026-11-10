/**
 * `design:import` — put a ticket's Claude Design project on disk where the `vs. DESIGN` axis looks for
 * it: `.design-source/<project-uuid>/`, with a `.source.json` that says which project and which
 * artboard the copy is of.
 *
 * WHY THIS EXISTS
 * ---------------
 * A QA run cannot fetch a claude.ai/design project itself: the one tool that reads one (`DesignSync`)
 * is restricted by its own description to the user-started `/design-sync` skill, and a run does not
 * call it (`claude-design-verification.md` §1). So the copy comes from a person — a download or
 * "Send to Claude Code" — and before this script it then had to be unpacked by hand into a folder
 * named after a UUID buried in the ticket's link. Nobody did, and every design axis came back
 * SKIPPED. This makes the person's part one command, and checks the one thing that makes a copy
 * usable: the artboard the ticket's `file=` names is in it. A copy without that artboard is a copy
 * of the wrong revision or the wrong project, and a run against it yields confident findings about
 * a design nobody was auditing (§The source is named, not discovered).
 *
 * USAGE
 *   npm run design:import -- "<design link from the ticket>" <export.zip | folder> [--force]
 *   npm run design:import -- <project-uuid> <export.zip | folder> [--file <artboard path>] [--force]
 *
 * EXIT
 *   0  imported (the path to give `design:extract` is printed)
 *   1  usage, unreadable source, or the target exists without --force
 *   2  the copy does not contain the artboard the link names — nothing is written
 */
import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { execFileSync } from "child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, join, resolve } from "path";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export interface DesignRef {
  projectId: string;
  /** The artboard the ticket treats as authoritative (`file=`), or null when the link names none. */
  file: string | null;
  /** The in-page anchor (`#rep-hub`), or null. */
  anchor: string | null;
}

/** Parse a `claude.ai/design/p/<uuid>?file=…#anchor` link, or a bare project uuid. */
export function parseDesignRef(input: string): DesignRef | null {
  const s = input.trim();
  if (/^https?:\/\//i.test(s)) {
    let url: URL;
    try {
      url = new URL(s);
    } catch {
      return null;
    }
    const m = url.pathname.match(/\/design\/p\/([^/]+)/);
    if (!m || !UUID.test(m[1]) || m[1].length !== 36) return null;
    const file = url.searchParams.get("file");
    const anchor = url.hash.replace(/^#/, "");
    return { projectId: m[1].toLowerCase(), file: file || null, anchor: anchor || null };
  }
  const m = s.match(UUID);
  return m && m[0].length === s.length ? { projectId: s.toLowerCase(), file: null, anchor: null } : null;
}

/** A PowerShell single-quoted literal: nothing inside it expands. */
const psq = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/**
 * Unpack a zip into a fresh temp dir with what the OS ships. On Windows the system bsdtar by full path —
 * a bare `tar` from Git Bash is GNU tar, which cannot read a zip — then PowerShell; elsewhere `unzip`, then bsdtar.
 */
function unzip(zip: string): string {
  const dir = mkdtempSync(join(tmpdir(), "design-import-"));
  const sysTar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  const tries: [string, string[]][] =
    process.platform === "win32"
      ? [
          [sysTar, ["-xf", zip, "-C", dir]],
          ["powershell", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath ${psq(zip)} -DestinationPath ${psq(dir)} -Force`]],
        ]
      : [
          ["unzip", ["-q", "-o", zip, "-d", dir]],
          ["bsdtar", ["-xf", zip, "-C", dir]],
        ];
  for (const [cmd, args] of tries) {
    try {
      execFileSync(cmd, args, { stdio: "ignore" });
      if (readdirSync(dir).length > 0) return dir;
    } catch {
      /* try the next one */
    }
  }
  rmSync(dir, { recursive: true, force: true });
  throw new Error(`cannot unpack ${zip} (tried tar and unzip) — unpack it yourself and pass the folder`);
}

/**
 * The folder that holds the project's own paths. An export often wraps everything in one top-level
 * folder; when the artboard is known, the root is wherever it resolves, else a lone wrapper is stripped.
 */
export function findProjectRoot(dir: string, file: string | null): string | null {
  const entries = readdirSync(dir).filter((e) => !e.startsWith(".") && e !== "__MACOSX");
  const lone = entries.length === 1 && statSync(join(dir, entries[0])).isDirectory() ? join(dir, entries[0]) : null;
  if (file) {
    if (existsSync(join(dir, file))) return dir;
    if (lone && existsSync(join(lone, file))) return lone;
    return null;
  }
  return lone ?? dir;
}

function countFiles(dir: string): number {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? countFiles(join(dir, e.name)) : 1;
  return n;
}

function main(argv: string[]): number {
  let force = false;
  let fileOpt: string | null = null;
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") force = true;
    else if (a === "--file") fileOpt = argv[++i] ?? null;
    else if (a.startsWith("--")) {
      console.error(`design:import — unknown option ${a}`);
      return 1;
    } else pos.push(a);
  }
  if (pos.length !== 2) {
    console.error('Usage: npm run design:import -- "<claude.ai/design/p/… link from the ticket>" <export.zip | folder> [--force]');
    return 1;
  }
  const ref = parseDesignRef(pos[0]);
  if (!ref) {
    console.error(`design:import — not a claude.ai/design/p/<uuid> link or a project uuid: ${pos[0]}`);
    return 1;
  }
  if (fileOpt) ref.file = fileOpt;

  const src = resolve(pos[1]);
  if (!existsSync(src)) {
    console.error(`design:import — no such file or folder: ${src}`);
    return 1;
  }
  const dest = resolve(".design-source", ref.projectId);
  if (existsSync(dest) && readdirSync(dest).length > 0 && !force) {
    console.error(`design:import — ${dest} already holds a copy; pass --force to replace it`);
    return 1;
  }

  let tmp: string | null = null;
  try {
    let from = src;
    if (statSync(src).isFile()) {
      if (!/\.zip$/i.test(src)) {
        console.error(`design:import — ${basename(src)} is a file but not a .zip; pass the export zip or its folder`);
        return 1;
      }
      tmp = unzip(src);
      from = tmp;
    }
    const root = findProjectRoot(from, ref.file);
    if (!root) {
      console.error(
        `design:import — the copy does not contain ${ref.file}, the artboard the ticket's link names. ` +
          `It is a copy of another project, or of a revision where that artboard moved; nothing was written.`,
      );
      return 2;
    }
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    cpSync(root, dest, { recursive: true });
    const files = countFiles(dest);
    const record = {
      projectId: ref.projectId,
      link: /^https?:\/\//i.test(pos[0]) ? pos[0].trim() : null,
      file: ref.file,
      anchor: ref.anchor,
      importedAt: new Date().toISOString(),
      from: basename(src),
      files,
    };
    writeFileSync(join(dest, ".source.json"), JSON.stringify(record, null, 2) + "\n");
    console.log(`design:import — ${files} file(s) of project ${ref.projectId} → ${dest}`);
    if (ref.file) console.log(`design:import — artboard: ${join(dest, ref.file)}${ref.anchor ? ` (#${ref.anchor})` : ""}`);
    return 0;
  } catch (e) {
    console.error(`design:import — ${(e as Error).message}`);
    return 1;
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("design-import.ts")) {
  process.exit(main(process.argv.slice(2)));
}
