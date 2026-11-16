// GENERATED from scripts/layout/design-import.ts, scripts/lib/sync-stdio.mjs by npm run vc-test:design — do not edit; the TypeScript is canonical
// scripts/lib/sync-stdio.mjs
for (const stream of [process.stdout, process.stderr]) {
  try {
    const handle = (
      /** @type {{ setBlocking?: (b: boolean) => void } | undefined} */
      stream._handle
    );
    if (handle && typeof handle.setBlocking === "function") handle.setBlocking(true);
  } catch {
  }
}

// scripts/layout/design-import.ts
import { execFileSync } from "child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, join, resolve } from "path";
var UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function parseDesignRef(input) {
  const s = input.trim();
  if (/^https?:\/\//i.test(s)) {
    let url;
    try {
      url = new URL(s);
    } catch {
      return null;
    }
    const m2 = url.pathname.match(/\/design\/p\/([^/]+)/);
    if (!m2 || !UUID.test(m2[1]) || m2[1].length !== 36) return null;
    const file = url.searchParams.get("file");
    const anchor = url.hash.replace(/^#/, "");
    return { projectId: m2[1].toLowerCase(), file: file || null, anchor: anchor || null };
  }
  const m = s.match(UUID);
  return m && m[0].length === s.length ? { projectId: s.toLowerCase(), file: null, anchor: null } : null;
}
var psq = (s) => `'${s.replace(/'/g, "''")}'`;
function unzip(zip) {
  const dir = mkdtempSync(join(tmpdir(), "design-import-"));
  const sysTar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  const tries = process.platform === "win32" ? [
    [sysTar, ["-xf", zip, "-C", dir]],
    ["powershell", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath ${psq(zip)} -DestinationPath ${psq(dir)} -Force`]]
  ] : [
    ["unzip", ["-q", "-o", zip, "-d", dir]],
    ["bsdtar", ["-xf", zip, "-C", dir]]
  ];
  for (const [cmd, args] of tries) {
    try {
      execFileSync(cmd, args, { stdio: "ignore" });
      if (readdirSync(dir).length > 0) return dir;
    } catch {
    }
  }
  rmSync(dir, { recursive: true, force: true });
  throw new Error(`cannot unpack ${zip} (tried tar and unzip) \u2014 unpack it yourself and pass the folder`);
}
function findProjectRoot(dir, file) {
  const entries = readdirSync(dir).filter((e) => !e.startsWith(".") && e !== "__MACOSX");
  const lone = entries.length === 1 && statSync(join(dir, entries[0])).isDirectory() ? join(dir, entries[0]) : null;
  if (file) {
    if (existsSync(join(dir, file))) return dir;
    if (lone && existsSync(join(lone, file))) return lone;
    return null;
  }
  return lone ?? dir;
}
function countFiles(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? countFiles(join(dir, e.name)) : 1;
  return n;
}
function main(argv) {
  let force = false;
  let fileOpt = null;
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") force = true;
    else if (a === "--file") fileOpt = argv[++i] ?? null;
    else if (a.startsWith("--")) {
      console.error(`design:import \u2014 unknown option ${a}`);
      return 1;
    } else pos.push(a);
  }
  if (pos.length !== 2) {
    console.error('Usage: npm run design:import -- "<claude.ai/design/p/\u2026 link from the ticket>" <export.zip | folder> [--force]');
    return 1;
  }
  const ref = parseDesignRef(pos[0]);
  if (!ref) {
    console.error(`design:import \u2014 not a claude.ai/design/p/<uuid> link or a project uuid: ${pos[0]}`);
    return 1;
  }
  if (fileOpt) ref.file = fileOpt;
  const src = resolve(pos[1]);
  if (!existsSync(src)) {
    console.error(`design:import \u2014 no such file or folder: ${src}`);
    return 1;
  }
  const dest = resolve(".design-source", ref.projectId);
  if (existsSync(dest) && readdirSync(dest).length > 0 && !force) {
    console.error(`design:import \u2014 ${dest} already holds a copy; pass --force to replace it`);
    return 1;
  }
  let tmp = null;
  try {
    let from = src;
    if (statSync(src).isFile()) {
      if (!/\.zip$/i.test(src)) {
        console.error(`design:import \u2014 ${basename(src)} is a file but not a .zip; pass the export zip or its folder`);
        return 1;
      }
      tmp = unzip(src);
      from = tmp;
    }
    const root = findProjectRoot(from, ref.file);
    if (!root) {
      console.error(
        `design:import \u2014 the copy does not contain ${ref.file}, the artboard the ticket's link names. It is a copy of another project, or of a revision where that artboard moved; nothing was written.`
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
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      from: basename(src),
      files
    };
    writeFileSync(join(dest, ".source.json"), JSON.stringify(record, null, 2) + "\n");
    console.log(`design:import \u2014 ${files} file(s) of project ${ref.projectId} \u2192 ${dest}`);
    if (ref.file) console.log(`design:import \u2014 artboard: ${join(dest, ref.file)}${ref.anchor ? ` (#${ref.anchor})` : ""}`);
    return 0;
  } catch (e) {
    console.error(`design:import \u2014 ${e.message}`);
    return 1;
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}
if (process.argv[1]?.endsWith("design-import.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
export {
  findProjectRoot,
  parseDesignRef
};
