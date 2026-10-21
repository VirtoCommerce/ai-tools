#!/usr/bin/env node
// vc-run-shim.mjs — the stable path $VC_RUN points at; copied to
// ~/.claude/plugins/data/vc-init-ai-tools/vc-run.mjs by scripts/install-bridge.mjs.
//
// Why a pointer and not the bridge itself: the vc-secrets task declarations that start the bridge's
// inner side (`node <this file> --inner <group>`) are reviewed and TRUSTED by the operator once, and
// vc-secrets refuses a task whose argv changed since. Plugin files live in a cache directory whose path
// carries the version, so a declaration naming the bridge there would need re-trusting on every plugin
// update — and a copy of the bridge at a stable path would silently keep running an old version. So
// the stable path holds this pointer, which resolves the CURRENT vc-init install on every call and
// hands over to its bridge/run.mjs. Same design, and the same resolution rules, as the vc-secrets
// shim (plugins/vc-secrets/vc-secrets-shim.mjs).
//
// Deliberately NOT honoured: any environment variable naming where vc-init lives. The inner side runs
// with tokens in its environment, and the caller sets the environment; letting it pick the code
// would let it pick what runs with the token.
//
// Copied alone, so it imports nothing but Node built-ins. When its contract changes SHIM_CONTRACT goes
// up and the bridge can tell an old copy from a new one.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHIM_CONTRACT = 1;
const PLUGIN_KEY = "vc-init@ai-tools";
const ENTRY = path.join("bridge", "run.mjs");
const [PLUGIN_NAME, MARKETPLACE] = PLUGIN_KEY.split("@");
// The home from the OS account, not os.homedir(): that one follows HOME / USERPROFILE, and the inner
// side is started by vc-secrets with the caller's environment — a caller could point it at a "vc-init"
// of its own making. os.userInfo() reads the account database (passwd; the profile of the process token
// on Windows), which the environment does not change.
let accountHome;
try {
    accountHome = os.userInfo().homedir;
} catch {
    accountHome = os.homedir();
}
const HOME = accountHome;
// The inner side (`--inner`, `--playwright`) runs with secrets in its environment: the caller's cwd
// may not pick between installs there either — it takes the newest one.
const INNER = ["--inner", "--playwright"].includes(process.argv[2]);
const CACHE_ROOTS = [path.join(HOME, ".claude", "plugins", "cache"), path.join(HOME, ".codex", "plugins", "cache")];

function fail(message) {
    fs.writeSync(2, `vc-run: ${message}\n`);
    process.exit(69);
}

const entryIn = (dir) => (typeof dir === "string" && dir !== "" && fs.existsSync(path.join(dir, ENTRY)) ? path.join(dir, ENTRY) : null);

// Version order: numeric segments, a missing segment is 0, a release outranks its own prerelease.
const versionKey = (v) => {
    const raw = typeof v === "string" ? v : "";
    const dash = raw.indexOf("-");
    const core = dash === -1 ? raw : raw.slice(0, dash);
    return { core: core.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : -1)), release: dash === -1 };
};
const newer = (a, b) => {
    const [x, y] = [versionKey(a.version), versionKey(b.version)];
    for (let i = 0; i < Math.max(x.core.length, y.core.length); i += 1) {
        const [m, n] = [x.core[i] ?? 0, y.core[i] ?? 0];
        if (m !== n) {
            return m > n;
        }
    }
    if (x.release !== y.release) {
        return x.release;
    }
    return String(a.lastUpdated ?? "") > String(b.lastUpdated ?? "");
};
const pick = (rs) => rs.reduce((best, r) => (newer(r, best) ? r : best), rs[0]);

// 1. Claude Code's install registry — the only source that knows per-project installs. Nearest
//    project containing the cwd first, then the highest version.
let records = [];
try {
    const registry = JSON.parse(fs.readFileSync(path.join(HOME, ".claude", "plugins", "installed_plugins.json"), "utf8"));
    records = (Array.isArray(registry?.plugins?.[PLUGIN_KEY]) ? registry.plugins[PLUGIN_KEY] : [])
        .filter((r) => r !== null && typeof r === "object" && entryIn(r.installPath));
} catch {
    // absent or unreadable — the cache walk below covers it
}
let entry = null;
if (records.length > 0 && INNER) {
    entry = entryIn(pick(records).installPath);
} else if (records.length > 0) {
    const cwd = path.resolve(process.cwd());
    const matches = records.filter((r) => typeof r.projectPath === "string"
        && (cwd === path.resolve(r.projectPath) || cwd.startsWith(path.resolve(r.projectPath) + path.sep)));
    const longest = Math.max(0, ...matches.map((r) => path.resolve(r.projectPath).length));
    const nearest = matches.filter((r) => path.resolve(r.projectPath).length === longest);
    entry = entryIn(pick(nearest.length > 0 ? nearest : records).installPath);
}

// 2. The plugin cache, this marketplace only — a same-named plugin from another marketplace is a
//    different publisher's code and is never run.
if (!entry) {
    const own = [];
    for (const root of CACHE_ROOTS) {
        const dir = path.join(root, MARKETPLACE, PLUGIN_NAME);
        let versions = [];
        try {
            versions = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() || d.isSymbolicLink());
        } catch {
            continue;
        }
        for (const v of versions) {
            if (entryIn(path.join(dir, v.name))) {
                own.push({ version: v.name, installPath: path.join(dir, v.name) });
            }
        }
    }
    if (own.length > 0) {
        entry = entryIn(pick(own).installPath);
    }
}

if (!entry) {
    fail(`plugin ${PLUGIN_KEY} is not installed — looked in the install registry and in ${CACHE_ROOTS.join(", ")}. Install it (/plugin install vc-fix@ai-tools pulls it in), then re-run /project-init`);
}

let mod;
try {
    mod = await import(pathToFileURL(entry).href);
} catch (e) {
    fail(`cannot load ${entry}: ${e.message}`);
}
if (typeof mod.runBridge !== "function") {
    fail(`${entry} does not export runBridge — this shim is newer than the plugin; update vc-init`);
}
await mod.runBridge(process.argv.slice(2), { shimContract: SHIM_CONTRACT });
