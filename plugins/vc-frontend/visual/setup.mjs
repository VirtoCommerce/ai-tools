#!/usr/bin/env node
// One-time setup of the PIXEL engine's packages for a repository that does not have them (a theme fork).
//
//   node setup.mjs [--with-browser]
//
// Installs the pinned packages below into lib.mjs's depsDir() — the repository's node_modules/.cache/vc-frontend-visual,
// or VC_VISUAL_DEPS — never into the fork's package.json. --with-browser also downloads Playwright's Chromium into
// Playwright's own cache (~/.cache/ms-playwright on Linux); a machine that already has it skips the download.
// A repository whose node_modules already resolves all three needs no setup: the engine loads them from there.
//
// EXIT 0 installed (or already present) · 2 npm or the browser download failed.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { depsDir } from "./lib.mjs";

// Pinned: the engine was verified on these. A bump is a change to verify, not a drift to accept.
const PACKAGES = { playwright: "1.64.1", pixelmatch: "5.3.0", pngjs: "7.0.0" };

const dir = depsDir();
const missing = Object.keys(PACKAGES).filter((p) => !existsSync(join(dir, "node_modules", p)));
mkdirSync(dir, { recursive: true });
if (!existsSync(join(dir, "package.json"))) writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "vc-frontend-visual-deps", private: true }, null, 2));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
try {
  if (missing.length) {
    console.log(`installing ${missing.map((p) => `${p}@${PACKAGES[p]}`).join(", ")} into ${dir}`);
    execFileSync(npm, ["install", "--no-audit", "--no-fund", "--no-save", ...missing.map((p) => `${p}@${PACKAGES[p]}`)], { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
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
