#!/usr/bin/env node
// gen-manifest.mjs — build a start-local custom package manifest for a local VC env.
//
// WHAT IT DOES
//   Takes the REAL deployed package manifest of an environment as a baseline
//   (default: vc-deploy-dev @ vcptcore-demo / backend/packages.json) and, when a
//   task needs different module versions, AUGMENTS it:
//     • released bump      → set/raise the version in the "GithubReleases" source
//     • PR pre-release pin → move the module to the "AzureBlob" (vc3prerelease)
//                            source and drop it from "GithubReleases" (no dup Id)
//     • platform bump      → raise top-level PlatformVersion
//   The output is a vc-build-compatible vc-package.json that start-local accepts
//   verbatim via:  build-VC-solution.ps1 -vcSolutionVersion custom -customPackagesJson <out>
//
// WHY A BASELINE FROM vc-deploy-dev
//   "Bring up the ACTUAL environment" = reproduce exactly what a deployed env runs.
//   The deploy branch's backend/packages.json is that single source of truth, and it
//   already carries the empty AzureBlob source pointing at the vc3prerelease blob —
//   the native install vector for per-PR pre-release packages.
//
// USAGE
//   node gen-manifest.mjs                              # baseline only (= vcptcore-demo)
//   node gen-manifest.mjs --branch vcst-demo           # baseline of another deploy env
//   node gen-manifest.mjs --baseline-file ./pkg.json   # offline: use a local baseline
//   node gen-manifest.mjs \                            # VCST-5173 augmentation:
//     --prerelease VirtoCommerce.XCart=3.1022.0-pr-122-972d \
//     --require    VirtoCommerce.Catalog=3.1028.0 \
//     --platform   3.1034.0 \
//     --out .local-env/packages.custom.json --print
//
//   --module Id=Version        set an EXACT released version in GithubReleases — raises OR LOWERS
//   --set Id=Version           alias of --module (exact set; use this for a version-switch test,
//                              e.g. --set VirtoCommerce.Datatrans=3.1001.0 to downgrade a leaf module)
//   --module Id=Version@blob   shorthand for --prerelease
//   --prerelease Id=Version    pin a PR build in the AzureBlob (vc3prerelease) source
//   --require Id=minVersion    raise to minVersion ONLY if the baseline is lower (no-op if already ≥)
//                              NB: the vcptcore-demo baseline usually already tracks the LATEST
//                              release, so --require rarely changes anything; for a deterministic
//                              version switch use --set (exact) or --prerelease (PR build).
//   --platform X.Y.Z           raise PlatformVersion to X.Y.Z if the baseline is lower
//   --branch <deploy-branch>   deploy branch in vc-deploy-dev (default vcptcore-demo)
//   --baseline-url <url>       explicit baseline manifest URL (overrides --branch)
//   --baseline-file <path>     read baseline from disk instead of fetching
//   --out <path>               output path (default <repo>/.local-env/packages.custom.json)
//   --print                    also print the resulting manifest to stdout
//
// Zero dependencies, Node 18+ (global fetch). Cross-platform.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
// .claude/skills/testing/qa-local-env → repo root is four levels up.
const REPO = resolve(SKILL_DIR, "..", "..", "..", "..");

const DEFAULTS = {
  deployRepo: "VirtoCommerce/vc-deploy-dev",
  branch: "vcptcore-demo",
  manifestPath: "backend/packages.json",
  ghSourceName: "GithubReleases",
  blob: {
    Name: "AzureBlob",
    Container: "packages",
    ServiceUri: "https://vc3prerelease.blob.core.windows.net",
    Modules: [],
  },
  out: resolve(REPO, ".local-env", "packages.custom.json"),
};

function printHelp() {
  // The leading banner of this file doubles as --help text.
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
}

function parseArgs(argv) {
  const o = {
    modules: [], prereleases: [], requires: [],
    branch: DEFAULTS.branch, baselineUrl: null, baselineFile: null,
    platform: null, out: DEFAULTS.out, print: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) { console.error(`Missing value after ${a}`); process.exit(2); }
      return v;
    };
    if (a === "--branch") o.branch = next();
    else if (a === "--baseline-url") o.baselineUrl = next();
    else if (a === "--baseline-file") o.baselineFile = next();
    else if (a === "--platform") o.platform = next();
    else if (a === "--module" || a === "--set") o.modules.push(next());
    else if (a === "--prerelease") o.prereleases.push(next());
    else if (a === "--require") o.requires.push(next());
    else if (a === "--out") o.out = resolve(next());
    else if (a === "--print") o.print = true;
    else if (a === "-h" || a === "--help") { printHelp(); process.exit(0); }
    else { console.error(`Unknown arg: ${a}  (try --help)`); process.exit(2); }
  }
  return o;
}

// "Id=Version" or "Id=Version@blob" / "@prerelease"
function parsePair(s) {
  const blob = /@(blob|prerelease)$/.test(s);
  const clean = s.replace(/@(blob|prerelease)$/, "");
  const idx = clean.indexOf("=");
  if (idx < 0) { console.error(`Bad pair "${s}" — expected Id=Version`); process.exit(2); }
  return { id: clean.slice(0, idx).trim(), version: clean.slice(idx + 1).trim(), blob };
}

// Compare dotted numeric versions; a pre-release ("-pr-…") of the same base ranks lower.
// Returns -1 if a<b, 0 if equal, 1 if a>b.
function cmpVersion(a, b) {
  const split = (v) => {
    const [base, ...pre] = String(v).split("-");
    return { nums: base.split(".").map((n) => parseInt(n, 10) || 0), pre: pre.join("-") };
  };
  const A = split(a), B = split(b);
  const len = Math.max(A.nums.length, B.nums.length);
  for (let i = 0; i < len; i++) {
    const d = (A.nums[i] || 0) - (B.nums[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (A.pre === B.pre) return 0;
  if (A.pre && !B.pre) return -1; // pre-release < release of same base
  if (!A.pre && B.pre) return 1;
  return A.pre < B.pre ? -1 : 1;
}

async function loadBaseline(o) {
  if (o.baselineFile) {
    return JSON.parse(readFileSync(resolve(o.baselineFile), "utf8"));
  }
  const url = o.baselineUrl ||
    `https://raw.githubusercontent.com/${DEFAULTS.deployRepo}/${o.branch}/${DEFAULTS.manifestPath}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Failed to fetch baseline manifest: ${res.status} ${res.statusText}\n  ${url}`);
    console.error(`  (private repo? pass --baseline-file with a local copy, or --baseline-url)`);
    process.exit(1);
  }
  return JSON.parse(await res.text());
}

function getGhSource(manifest) {
  manifest.Sources ||= [];
  let gh = manifest.Sources.find((s) => s.Name === DEFAULTS.ghSourceName);
  if (!gh) gh = manifest.Sources.find((s) => Array.isArray(s.Modules) && s.ModuleSources);
  if (!gh) { console.error(`Baseline has no "${DEFAULTS.ghSourceName}" source — unexpected manifest shape.`); process.exit(1); }
  gh.Modules ||= [];
  return gh;
}

function getBlobSource(manifest) {
  manifest.Sources ||= [];
  let blob = manifest.Sources.find(
    (s) => s.Name === DEFAULTS.blob.Name || (s.ServiceUri || "").includes("vc3prerelease"),
  );
  if (!blob) {
    blob = { ...DEFAULTS.blob, Modules: [] };
    manifest.Sources.push(blob);
  }
  blob.Modules ||= [];
  return blob;
}

function setModule(list, id, version) {
  const existing = list.find((m) => m.Id === id);
  if (existing) { const from = existing.Version; existing.Version = version; return from; }
  list.push({ Id: id, Version: version });
  return null;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const manifest = await loadBaseline(o);
  const gh = getGhSource(manifest);
  const blob = getBlobSource(manifest);
  const changes = [];

  // 1. Platform bump (only raise, never lower).
  if (o.platform) {
    if (!manifest.PlatformVersion || cmpVersion(manifest.PlatformVersion, o.platform) < 0) {
      changes.push(`platform ${manifest.PlatformVersion || "?"} → ${o.platform}`);
      manifest.PlatformVersion = o.platform;
      // PlatformImageTag is a deploy-only field; keep it aligned when present.
      if (manifest.PlatformImageTag) manifest.PlatformImageTag = o.platform;
    } else {
      changes.push(`platform ${manifest.PlatformVersion} already ≥ ${o.platform} (no change)`);
    }
  }

  // 2. --require: raise a released module only if baseline is lower.
  for (const raw of o.requires) {
    const { id, version } = parsePair(raw);
    const existing = gh.Modules.find((m) => m.Id === id);
    if (!existing) {
      setModule(gh.Modules, id, version);
      changes.push(`require ${id}: added ${version} (was absent)`);
    } else if (cmpVersion(existing.Version, version) < 0) {
      changes.push(`require ${id}: ${existing.Version} → ${version}`);
      existing.Version = version;
    } else {
      changes.push(`require ${id}: ${existing.Version} already ≥ ${version} (no change)`);
    }
  }

  // 3. --module / --set: set an EXACT released version in GithubReleases (raises OR lowers; +
  //    ensure not duplicated in blob). Unlike --require this is unconditional — the right tool
  //    for a deterministic version-switch test when the baseline already tracks latest.
  for (const raw of o.modules) {
    const { id, version, blob: toBlob } = parsePair(raw);
    if (toBlob) { o.prereleases.push(`${id}=${version}`); continue; }
    const from = setModule(gh.Modules, id, version);
    blob.Modules = blob.Modules.filter((m) => m.Id !== id);
    changes.push(`module ${id}: ${from ? `${from} → ` : "added "}${version} (GithubReleases)`);
  }

  // 4. --prerelease: pin a PR build in the AzureBlob source, remove from GithubReleases.
  //    An AzureBlobModuleItem is matched by BlobName (the artifact file name in the blob
  //    container), NOT Id/Version — vc-build's AzureBlobModuleInstaller reads ONLY m.BlobName
  //    (passing {Id,Version} alone makes BlobName null → NullReferenceException at install).
  //    VC CI publishes per-PR artifacts as "{Id}_{Version}.zip" (the PR body's Artifact URL),
  //    so the version string (e.g. 3.1022.0-pr-122-972d) yields the exact blob file name.
  for (const raw of o.prereleases) {
    const { id, version } = parsePair(raw);
    const blobName = `${id}_${version}.zip`;
    const removed = gh.Modules.find((m) => m.Id === id);
    gh.Modules = gh.Modules.filter((m) => m.Id !== id);
    const existing = blob.Modules.find((m) => m.Id === id);
    if (existing) { existing.Version = version; existing.BlobName = blobName; }
    else blob.Modules.push({ Id: id, Version: version, BlobName: blobName });
    changes.push(
      `prerelease ${id}: BlobName=${blobName} (AzureBlob/vc3prerelease)` +
      (removed ? ` — removed ${removed.Version} from GithubReleases` : ""),
    );
  }

  mkdirSync(dirname(o.out), { recursive: true });
  writeFileSync(o.out, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const baselineLabel = o.baselineFile ? o.baselineFile : `${DEFAULTS.deployRepo}@${o.branch}`;
  console.log(`gen-manifest :: baseline ${baselineLabel}`);
  console.log(`  PlatformVersion : ${manifest.PlatformVersion}`);
  console.log(`  GithubReleases  : ${gh.Modules.length} module(s)`);
  console.log(`  AzureBlob       : ${blob.Modules.length} pre-release pin(s)` +
    (blob.Modules.length ? ` [${blob.Modules.map((m) => m.BlobName || `${m.Id}@${m.Version}`).join(", ")}]` : ""));
  if (changes.length) {
    console.log(`  changes applied :`);
    for (const c of changes) console.log(`    • ${c}`);
  } else {
    console.log(`  changes applied : none (pure baseline)`);
  }
  console.log(`  → wrote ${o.out}`);
  if (o.print) console.log("\n" + JSON.stringify(manifest, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
