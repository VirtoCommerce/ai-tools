#!/usr/bin/env -S npx tsx
/**
 * release-diff — which components of a stable bundle actually changed CODE since the previous one.
 *
 *   npm run release:diff -- --from v15 --to v16
 *   npm run release:diff -- --from v15 --to v16 --to-ref feat/VCST-6042-stable-16-bundle
 *   npm run release:diff -- --from v15 --to v16 --suites --out regression/releases/stable-16/module-diff.json
 *
 * WHY IT EXISTS. A release regression is scoped by what changed between two bundles, and a version
 * bump is not a change: most modules in a stable bundle are re-released only to align the platform
 * or third-party packages. Deciding that by hand for ~60 modules took most of the Stable 16 planning
 * day, and the decision is mechanical — compare the two release tags in the module's repo and look at
 * which files moved. This prints the facts; `/qa-test-plan stable <N>` makes the judgement calls (functional
 * vs technical change, which wave) on top of them.
 *
 * WHAT COUNTS AS CODE. A changed file is code unless it is a project/manifest/version file
 * (`*.csproj`, `module.manifest`, `Directory.Build.props`, `*.sln`), CI (`.github/**`), docs (`*.md`),
 * a lock file, or a test (`tests/`, `*.Tests/`, `*.test.*`, `*.spec.*`). A component whose compare
 * holds no code file is `REBUILD` — out of regression scope.
 *
 * STATUS per component: `NEW` (only in --to) · `REMOVED` (only in --from) · `SAME` (same version) ·
 * `REBUILD` (versions differ, no code file) · `CODE` (versions differ, code changed) ·
 * `UNRESOLVED` (no repo mapping, or the compare failed — read `note`).
 *
 * --suites asks `regression:select` (the deterministic change→suite mapper) for the candidate suites
 * of every CODE component, from its changed code files. Candidates, not the plan: a release plan
 * also covers NEW modules and cross-cutting suites the file paths cannot name.
 *
 * Repos come from `config/module-repo-map.json` (the same map `bundle:check` uses). Token: GIT_TOKEN /
 * GITHUB_TOKEN from `.env.local`; without one GitHub allows 60 calls an hour, which a full diff exceeds.
 *
 * Exit codes: 0 diff produced · 1 bad usage · 2 a bundle could not be read or GitHub refused.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail
import { parse as parseDotenv } from "dotenv";
import { classifyLane } from "../../ci/lib/lane-classifier.js";
import { firefoxClickOk, loadManifest } from "../../ci/lib/suite-manifest.js";
import { resolveSuiteSource } from "../test-cases/suite-source-map.js";
import { selectSuites, type SelectableSuite } from "../lib/suite-selection.js";

const OWNER = "VirtoCommerce";
const BUNDLE_REPO = "vc-modules";
const REPO_ROOT = resolve(import.meta.dirname, "../..");

interface Args {
  from: string;
  to: string;
  fromRef: string;
  toRef: string;
  out: string | null;
  suites: boolean;
  json: boolean;
}

interface Component {
  id: string;
  name: string;
  kind: "module" | "platform" | "theme";
  repo: string | null;
  from: string | null;
  to: string | null;
}

interface DiffEntry extends Component {
  status: "NEW" | "REMOVED" | "SAME" | "REBUILD" | "CODE" | "UNRESOLVED";
  files?: number;
  codeFiles?: string[];
  truncated?: boolean;
  commits?: string[];
  tickets?: string[];
  suites?: string[];
  note?: string;
}

function usage(msg?: string): never {
  if (msg) console.error(`release-diff: ${msg}`);
  console.error("usage: release:diff -- --from <vN> --to <vN> [--from-ref <ref>] [--to-ref <ref>] [--suites] [--out <file>] [--json]");
  process.exit(1);
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = { from: "", to: "", fromRef: "master", toRef: "master", out: null, suites: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    const next = () => argv[++i] ?? usage(`${v} needs a value`);
    if (v === "--from") a.from = next();
    else if (v === "--to") a.to = next();
    else if (v === "--from-ref") a.fromRef = next();
    else if (v === "--to-ref") a.toRef = next();
    else if (v === "--out") a.out = next();
    else if (v === "--suites") a.suites = true;
    else if (v === "--json") a.json = true;
    else usage(`unknown argument '${v}'`);
  }
  if (!/^v\d+$/.test(a.from) || !/^v\d+$/.test(a.to)) usage("--from and --to are bundle folders, e.g. v15 and v16");
  return a;
}

function loadToken(): string | undefined {
  // Same layered read as bundle:check: config.js is not imported because its validator exits on
  // test-only variables this script does not need.
  for (const f of [".env.defaults", ".env.local"]) {
    const p = join(REPO_ROOT, f);
    if (!existsSync(p)) continue;
    for (const [k, v] of Object.entries(parseDotenv(readFileSync(p)))) if (!process.env[k]) process.env[k] = v;
  }
  return process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
}

const TOKEN = loadToken();
function headers(accept = "application/vnd.github+json"): Record<string, string> {
  const h: Record<string, string> = { Accept: accept, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "vc-release-diff" };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function getJson(url: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url, { headers: headers() });
  if (res.status === 403 || res.status === 429) {
    throw new Error(`GitHub refused (HTTP ${res.status}, remaining=${res.headers.get("x-ratelimit-remaining")})${TOKEN ? "" : " — set GIT_TOKEN in .env.local"}`);
  }
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}

async function readBundle(folder: string, ref: string): Promise<any> {
  const url = `https://api.github.com/repos/${OWNER}/${BUNDLE_REPO}/contents/bundles/${folder}/package.json?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, { headers: headers("application/vnd.github.raw") });
  if (res.status !== 200) throw new Error(`bundles/${folder}/package.json @ ${ref}: HTTP ${res.status}`);
  return JSON.parse(await res.text());
}

interface RepoMap { platformRepo: string; themeRepo: string; modules: Record<string, string> }

function components(bundle: any, map: RepoMap): Map<string, Omit<Component, "from" | "to"> & { version: string }> {
  const out = new Map<string, Omit<Component, "from" | "to"> & { version: string }>();
  for (const src of Array.isArray(bundle.Sources) ? bundle.Sources : []) {
    for (const m of Array.isArray(src?.Modules) ? src.Modules : []) {
      if (!m?.Id || !m?.Version) continue;
      out.set(m.Id, { id: m.Id, name: m.Id.replace(/^VirtoCommerce\./, ""), kind: "module", repo: map.modules[m.Id] ?? null, version: String(m.Version) });
    }
  }
  if (bundle.PlatformVersion) {
    out.set("Platform", { id: "Platform", name: "Platform", kind: "platform", repo: map.platformRepo, version: String(bundle.PlatformVersion) });
  }
  // The theme version is embedded in its release-download URL: …/releases/download/2.59.0/…
  const theme = /\/releases\/download\/([^/]+)\//.exec(String(bundle.ThemeB2BVue ?? ""))?.[1];
  if (theme) out.set("Theme", { id: "Theme", name: "Theme", kind: "theme", repo: map.themeRepo, version: theme });
  return out;
}

const NON_CODE: readonly RegExp[] = [
  /\.csproj$/i, /(^|\/)module\.manifest$/i, /(^|\/)Directory\.(Build|Packages)\.props$/i, /\.sln$/i,
  /^\.github\//, /\.md$/i,
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|packages\.lock\.json)$/i,
  /(^|\/)tests?\//i, /\.Tests?\//, /\.(test|spec)\.[a-z]+$/i,
];
/**
 * A `package.json` whose diff changes nothing but its `"version"` line is a release bump, not code.
 * Any other change (a dependency, a script) is code: a dependency bump in a storefront is a real change.
 */
const versionBumpOnly = (path: string, patch: string | undefined) => {
  if (!/(^|\/)package\.json$/.test(path) || !patch) return false;
  const changed = patch.split("\n").filter((l) => /^[+-](?![+-])/.test(l));
  return changed.length > 0 && changed.every((l) => /^[+-]\s*"version"\s*:/.test(l));
};
const isCode = (path: string, patch?: string) => !NON_CODE.some((re) => re.test(path)) && !versionBumpOnly(path, patch);
const TICKET = /\b[A-Z][A-Z0-9]+-\d+\b/g;
const MAX_FILES = 300; // the compare API's file-list cap
const MAX_COMMITS = 250; // …and its commit-list cap

async function compare(c: Component): Promise<DiffEntry> {
  if (!c.repo) return { ...c, status: "UNRESOLVED", note: "no repo in config/module-repo-map.json" };
  const { status, body } = await getJson(`https://api.github.com/repos/${OWNER}/${c.repo}/compare/${c.from}...${c.to}`);
  if (status !== 200) return { ...c, status: "UNRESOLVED", note: `compare ${c.from}...${c.to} → HTTP ${status} (missing tag?)` };
  const raw: { filename: string; patch?: string }[] = (body.files ?? []).map((f: any) => ({ filename: String(f.filename), patch: f.patch }));
  const commits: string[] = (body.commits ?? []).map((k: any) => String(k.commit?.message ?? "").split("\n")[0]);
  const codeFiles = raw.filter((f) => isCode(f.filename, f.patch)).map((f) => f.filename);
  const tickets = [...new Set(commits.join("\n").match(TICKET) ?? [])].sort();
  const truncated = raw.length >= MAX_FILES || commits.length >= MAX_COMMITS;
  const entry: DiffEntry = { ...c, status: codeFiles.length > 0 ? "CODE" : "REBUILD", files: raw.length, codeFiles, truncated, commits, tickets };
  // Past either cap the lists are a sample. A sample with code is still CODE; a sample WITHOUT code
  // proves nothing about the files GitHub did not list, so it is not allowed to read as REBUILD.
  if (truncated && codeFiles.length === 0) {
    entry.status = "UNRESOLVED";
    entry.note = `compare lists only the first ${MAX_FILES} files / ${MAX_COMMITS} commits and none of those is code — check the repo by hand`;
  } else if (truncated) {
    entry.note = `compare truncated (${raw.length} files, ${commits.length} commits): file and ticket lists are a lower bound`;
  }
  return entry;
}

/**
 * The suites `regression:select` maps a component's changed code files to. Only `change` reasons
 * are kept: the selector also tops a selection up with the risk floor and a staleness rotation,
 * which are right for one PR and noise for a per-module release table. Built the way
 * `select-suites.ts` builds its input, so the two cannot disagree about a suite.
 */
function makeSuiteMapper(): (e: DiffEntry) => string[] {
  const manifest = loadManifest();
  const suites: SelectableSuite[] = manifest.suites.map((s) => {
    const raw = s as unknown as Record<string, unknown>;
    return {
      id: s.id, name: s.name, file: s.file,
      domain: raw.domain as string | undefined, layer: raw.layer as string | undefined,
      priority: raw.priority as string | undefined, tags: raw.tags as string[] | undefined,
      testCount: s.testCount, estimatedMinutes: raw.estimatedMinutes as number | undefined,
      requiresModules: raw.requiresModules as string[] | undefined, clickDriven: raw.clickDriven as boolean | undefined,
      runner: raw.runner as string | undefined, preferredBrowser: raw.preferredBrowser as string | undefined,
      lane: classifyLane({ file: s.file, runner: raw.runner as string | undefined }),
    };
  });
  const suiteRepos = new Map<string, readonly string[]>();
  for (const s of manifest.suites) {
    const req = ((s as unknown as Record<string, unknown>).requiresModules as string[] | undefined) ?? [];
    suiteRepos.set(s.id, resolveSuiteSource(s.id, req).repos);
  }
  return (e) => {
    if (e.status !== "CODE" || !e.repo || !e.codeFiles?.length) return [];
    const r = selectSuites({
      suites, suiteRepos, history: [], rotation: [], rotationCount: 0, targetMinutes: null,
      changed: e.codeFiles.map((path) => ({ repo: e.repo!, path })),
      concurrency: { browser: 3, fastpath: 4, deterministic: 2 },
      firefoxClickOk: firefoxClickOk(manifest),
    });
    return r.selected.filter((s) => s.reasons.some((x) => x.kind === "change")).map((s) => s.id);
  };
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

async function main(): Promise<number> {
  const a = parseArgs(process.argv.slice(2));
  const map = JSON.parse(readFileSync(join(REPO_ROOT, "config/module-repo-map.json"), "utf-8")) as RepoMap;
  let fromB: any, toB: any;
  try {
    [fromB, toB] = await Promise.all([readBundle(a.from, a.fromRef), readBundle(a.to, a.toRef)]);
  } catch (e) {
    console.error(`release-diff: ${(e as Error).message}`);
    return 2;
  }
  const F = components(fromB, map), T = components(toB, map);
  const all: Component[] = [...new Set([...F.keys(), ...T.keys()])].map((id) => {
    const base = T.get(id) ?? F.get(id)!;
    return { id, name: base.name, kind: base.kind, repo: base.repo, from: F.get(id)?.version ?? null, to: T.get(id)?.version ?? null };
  });

  let entries: DiffEntry[];
  try {
    entries = await pool(all, 6, async (c): Promise<DiffEntry> => {
      if (!c.from) return { ...c, status: "NEW" };
      if (!c.to) return { ...c, status: "REMOVED" };
      if (c.from === c.to) return { ...c, status: "SAME" };
      return compare(c);
    });
  } catch (e) {
    console.error(`release-diff: ${(e as Error).message}`);
    return 2;
  }
  if (a.suites) {
    const mapSuites = makeSuiteMapper();
    for (const e of entries) if (e.status === "CODE") e.suites = mapSuites(e);
  }

  const order = { platform: 0, theme: 1, module: 2 } as const;
  entries.sort((x, y) => order[x.kind] - order[y.kind] || x.name.localeCompare(y.name));
  const result = { from: `${a.from}@${a.fromRef}`, to: `${a.to}@${a.toRef}`, generatedAt: new Date().toISOString(), components: entries };

  if (a.out) {
    mkdirSync(dirname(resolve(a.out)), { recursive: true });
    writeFileSync(a.out, JSON.stringify(result, null, 1) + "\n");
  }
  if (a.json) {
    console.log(JSON.stringify(result, null, 1));
  } else {
    const count = (s: DiffEntry["status"]) => entries.filter((e) => e.status === s).length;
    console.log(`${a.from} → ${a.to}: ${entries.length} components · CODE ${count("CODE")} · NEW ${count("NEW")} · REBUILD ${count("REBUILD")} · SAME ${count("SAME")} · REMOVED ${count("REMOVED")} · UNRESOLVED ${count("UNRESOLVED")}`);
    for (const e of entries.filter((x) => x.status !== "SAME" && x.status !== "REBUILD")) {
      const extra = e.status === "CODE" ? ` · ${e.codeFiles!.length} code files${e.truncated ? " (truncated)" : ""} · ${e.tickets!.slice(0, 6).join(" ")}${e.suites ? ` · suites ${e.suites.join(" ") || "—"}` : ""}` : e.note ? ` · ${e.note}` : "";
      console.log(`  ${e.status.padEnd(10)} ${e.name.padEnd(28)} ${e.from ?? "—"} → ${e.to ?? "—"}${extra}`);
    }
    if (a.out) console.log(`written: ${a.out}`);
  }
  // UNRESOLVED is reported, not fatal: one unmapped repo should not hide the other 58 answers.
  return 0;
}

main().then((code) => { process.exitCode = code; });
