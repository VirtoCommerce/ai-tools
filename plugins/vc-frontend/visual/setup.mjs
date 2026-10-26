#!/usr/bin/env node
// One-time setup of the PIXEL engine's packages for a repository that does not have them (a theme fork).
//
//   node setup.mjs [--with-browser]
//
// Installs the pinned packages below into lib.mjs's depsDir() — the repository's node_modules/.cache/vc-frontend-visual,
// or VC_VISUAL_DEPS — never into the fork's package.json or lockfile. The pins are written as that folder's own
// package.json `dependencies` before `npm install` runs there, so a second run never prunes what the first
// installed, and a changed pin (an installed version that differs from it) reinstalls that package. --with-browser also downloads
// Playwright's Chromium into Playwright's own cache (~/.cache/ms-playwright on Linux); a machine that already has it
// skips the download. A repository whose node_modules already resolves all three needs no setup: the engine loads
// them from there first.
//
// EXIT 0 installed (or already present) · 2 npm or the browser download failed.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { depsDir } from "./lib.mjs";

// Pinned: the engine was verified on these. A bump is a change to verify, not a drift to accept.
const PACKAGES = { playwright: "1.64.1", pixelmatch: "5.3.0", pngjs: "7.0.0" };

const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const dir = depsDir();
mkdirSync(dir, { recursive: true });
const manifest = join(dir, "package.json");
const declared = readJson(manifest)?.dependencies ?? {};
if (Object.keys(PACKAGES).some((p) => declared[p] !== PACKAGES[p]) || Object.keys(declared).length !== Object.keys(PACKAGES).length)
  writeFileSync(manifest, JSON.stringify({ name: "vc-frontend-visual-deps", private: true, dependencies: PACKAGES }, null, 2) + "\n");
// Stale = absent, or installed at a version other than its pin.
const stale = Object.keys(PACKAGES).filter((p) => readJson(join(dir, "node_modules", p, "package.json"))?.version !== PACKAGES[p]);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
try {
  if (stale.length) {
    console.log(`installing ${stale.map((p) => `${p}@${PACKAGES[p]}`).join(", ")} into ${dir}`);
    // A stale package's folder and npm's hidden lockfile go first: that lockfile can still claim the old version is
    // current. Naming the pins with --save-exact keeps the manifest exact, and every declared package stays installed.
    for (const p of stale) rmSync(join(dir, "node_modules", p), { recursive: true, force: true });
    rmSync(join(dir, "node_modules", ".package-lock.json"), { force: true });
    execFileSync(npm, ["install", "--no-audit", "--no-fund", "--save-exact", ...stale.map((p) => `${p}@${PACKAGES[p]}`)], { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
  } else {
    console.log(`packages present in ${dir}`);
  }
  if (process.argv.includes("--with-browser")) {
    const cli = join(dir, "node_modules", "playwright", "cli.js");
    execFileSync(process.execPath, [cli, "install", "chromium"], { cwd: dir, stdio: "inherit" });
  }
} catch (e) {
  console.error(`✗ setup failed: ${e.message.split("\n")[0]}`);
  process.exit(2);
}
console.log("visual engine ready");
