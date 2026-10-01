#!/usr/bin/env node
// vc-secrets-shim.mjs — the stable path an MCP entry points at.
//
// Why an indirection exists at all: a repo's committed .mcp.json cannot name the launcher's real
// location, because plugin files live in a cache directory whose path carries the plugin version and
// therefore changes on every update. Copying the launcher to a stable path instead would go stale
// silently — the plugin's commands would update while the launcher kept running an old version, and
// the launcher's own version diagnostics would then blame the plugin. So the stable path holds a
// POINTER: this file resolves the plugin's current location per launch — from the install registry
// where a client maintains one, and otherwise from the client's own plugin cache, whose layout
// carries the version in the path.
//
// Installed by the vc-secrets install skill. Rarely changes; when its contract does, SHIM_CONTRACT below goes
// up and `doctor` tells the developer to re-run install.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHIM_CONTRACT = 1;
const PLUGIN_KEY = "vc-secrets@ai-tools";
const REGISTRY_SCHEMA = 2;
const LAUNCHER = "vc-secrets.mjs";
const [PLUGIN_NAME] = PLUGIN_KEY.split("@");

// Only one of the three clients maintains an install registry, so resolution has two stages. The
// registry is preferred where it exists because it is the only source that knows about per-project
// installs. Everywhere else the cache layout is the source: measured as
// <root>/<marketplace>/<plugin>/<version>/ on both clients available to measure. The marketplace
// segment is globbed rather than named, because whoever registered the marketplace chose its name.
//
// Cursor has no entry yet. That is deliberate: an unmeasured root would be a guess, and a wrong one
// resolves to nothing in exactly the same way as an absent one while implying it was checked. When
// its layout is established it becomes one more line here.
const CACHE_ROOTS = [
    path.join(os.homedir(), ".claude", "plugins", "cache"),
    path.join(os.homedir(), ".codex", "plugins", "cache"),
];

// readdirSync does not follow links, so Dirent.isDirectory() is FALSE for a symlink to a directory —
// measured. Filtering on it alone silently skips a linked install, which either picks an older real
// directory or reports a plugin that is installed as missing. Loading a plugin from a local directory
// is a documented route on one of these clients, so linked entries are ordinary here. Whether the
// target is really usable is settled inside installsInCaches, by looking for the launcher in it.
const isDirLike = (entry) => entry.isDirectory() || entry.isSymbolicLink();

function installsInCaches() {
    const found = [];
    for (const root of CACHE_ROOTS) {
        let marketplaces;
        try {
            marketplaces = fs.readdirSync(root, { withFileTypes: true });
        } catch (e) {
            // ENOENT is a client that is not installed: it contributes nothing and that is not an
            // error. Anything else is a root that EXISTS and could not be read, and collapsing the
            // two reports an installed client as absent -- after which this shim resolves to an
            // older install without a word, which is the one outcome the whole indirection exists
            // to prevent.
            if (e.code !== "ENOENT") {
                fs.writeSync(2, `vc-secrets: ${root} could not be read (${e.code ?? e.message})`
                    + " -- skipping it; any install under it is invisible to this launch\n");
            }

            continue;
        }
        for (const marketplace of marketplaces.filter(isDirLike)) {
            const pluginDir = path.join(root, marketplace.name, PLUGIN_NAME);
            let versions;
            try {
                versions = fs.readdirSync(pluginDir, { withFileTypes: true });
            } catch (e) {
                // The same line one level down: a marketplace that does not carry this plugin is the
                // ordinary case, an unreadable one is not.
                if (e.code !== "ENOENT") {
                    fs.writeSync(2, `vc-secrets: ${pluginDir} could not be read (${e.code ?? e.message})`
                        + " -- skipping it; any install under it is invisible to this launch\n");
                }

                continue;
            }
            for (const version of versions.filter(isDirLike)) {
                const installPath = path.join(pluginDir, version.name);
                // A version directory with no launcher in it is a partial or abandoned install. Ranking
                // it would hand the newest slot to a directory whose launch then fails on a missing
                // file, naming a path nobody chose.
                if (fs.existsSync(path.join(installPath, LAUNCHER))) {
                    found.push({ version: version.name, installPath });
                }
            }
        }
    }

    return found;
}

function fail(message) {
    // sync write: stderr is async on a POSIX pipe and on a Windows console, and process.exit drops pending writes
    fs.writeSync(2, `vc-secrets: ${message}\n`);
    process.exit(1);
}

const registryPath = path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json");
let registry = null;
let registryProblem = null;
try {
    registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
} catch (e) {
    // No longer fatal. This file belongs to one client, and the plugin is meant to run under three —
    // failing here is what made every generated config entry naming this shim useless on the other
    // two. The cache walk covers them, and the failure at the end names every root that was tried.
    //
    // Absent and CORRUPT are not the same answer, though, and the failure at the end stated the
    // absent one for both: "plugin is not installed" sends a developer to reinstall something this
    // file may record perfectly well, under a parse error nothing mentioned. ENOENT is ordinary —
    // two of the three clients keep no registry at all — so only the rest is worth carrying.
    //
    // A SyntaxError has no `.code`, so before the SyntaxError arm below this reported V8's message
    // -- which it builds from a window of the source, i.e. of the REGISTRY's bytes -- onto the
    // launched server's stderr. The launcher makes the same refusal in jsonSyntaxWhere and keeps the
    // positional triple; the shim cannot import it, being copied to the data dir alone, and a
    // position into a registry nobody is about to open buys nothing here.
    if (e.code !== "ENOENT") {
        registryProblem = e.code ?? (e instanceof SyntaxError ? "not valid JSON" : e.message);
    }
}
// A field of the client's registry, for a message. The hostile-shape rule stated at `records` below
// covers what gets PRINTED as much as what gets read: a template literal joins an array's elements,
// so a field of the wrong type put the file's own content on the launched server's stderr. Only the
// type the field is meant to have is shown; anything else is described. Length is deliberately not
// bounded -- a projectPath is the client's legitimate data and can be long, and the rule is about
// shape, the way the `records` filter is.
function registryField(value, type, absent) {
    if (value === undefined || value === null) {
        return absent;
    }

    return typeof value === type ? String(value) : `(not a ${type})`;
}

// This file is owned by the client, so a schema change arrives with a Claude Code upgrade — no user
// action at all. Refusing to launch would take every wrapped server down at once, and the message lands
// on a server's stderr, which surfaces only as "server failed to start" — pointing away from here. So
// warn and continue. Only `installPath` fails legibly if it moves: no launcher is found and the failure
// at the end names every root tried. The three ranking fields below degrade SILENTLY -- a moved
// `projectPath` empties the nearest-project match and falls back to every record, and a moved `version`
// ties them all at the bottom so `lastUpdated` decides, which is the staleness this shim exists to stop.
if (registry && registry.version !== REGISTRY_SCHEMA) {
    fs.writeSync(2, `vc-secrets: ${registryPath} is schema version ${registryField(registry.version, "number", "unknown")}, this shim was written for ${REGISTRY_SCHEMA} -- continuing, but update the plugin\n`);
}

// Drop anything that is not an object before reading fields off it: the file is the client's, and a
// hostile or truncated shape must produce this function's own message rather than a raw TypeError.
const records = (Array.isArray(registry?.plugins?.[PLUGIN_KEY]) ? registry.plugins[PLUGIN_KEY] : [])
    .filter((r) => r !== null && typeof r === "object");

// One plugin can be installed several times (per project, plus user scope). Prefer the record whose
// project contains the current directory.
const cwd = path.resolve(process.cwd());
const matches = records.filter((r) => typeof r.projectPath === "string"
    && (cwd === path.resolve(r.projectPath) || cwd.startsWith(path.resolve(r.projectPath) + path.sep)));
// With nested projects several records match; the NEAREST one owns this directory, so the longest
// matching projectPath wins before version is consulted. Ranking all matches by version instead would
// hand a child project its parent's launcher whenever the parent happened to be newer.
const longest = Math.max(0, ...matches.map((r) => path.resolve(r.projectPath).length));
const byProject = matches.filter((r) => path.resolve(r.projectPath).length === longest);
const candidates = byProject.length > 0 ? byProject : records;

// When cwd belongs to none of them — a git worktree or a scratch directory often sits outside every
// registered project path — the tiebreak must be the VERSION. `lastUpdated` is refreshed
// independently of any version change, so ordering by it can select an older launcher against newer
// declarations: exactly the staleness this shim exists to prevent, and silent when it happens.
// The suffix after the first dash is split off rather than parsed with the rest: a prerelease tag
// ("1.0.0-rc.1") or a registry's commit stamp ("0.9.0-89c71c99b8da") is not part of the number. A
// prerelease's dotted parts, parsed as segments, outrank an absent one — a release candidate once beat
// its own release that way and ran against production declarations, silently. It is kept OUT of the
// number array rather than appended to it, because an appended sentinel sits at an index that moves
// with the segment count, which would then decide between two spellings of the same version.
// A segment is a number only when it is all digits. parseInt reads a numeric PREFIX, so a bare commit
// hash — what a registry records as the version of a plugin that declares none — would key as
// whatever digits it starts with. A hash made of digits alone still reads as a number: nothing in
// the string tells it from a version, and only a heuristic about its length would.
// The ranking reads two fields of each record as text. String() on the client's value calls that
// value's own toString, which a hostile record can make a non-function -- a raw TypeError before
// anything launches, the exact outcome the `records` rule forbids. A field of any other type ranks
// as absent: junk keeps losing to any real version, and an unstamped record to any stamped one.
const rankText = (value) => (typeof value === "string" ? value : "");
const versionKey = (r) => {
    const raw = rankText(r.version);
    const dash = raw.indexOf("-");
    const core = dash === -1 ? raw : raw.slice(0, dash);

    return {
        core: core.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : -1)),
        release: dash === -1,
    };
};
const newer = (a, b) => {
    const [va, vb] = [versionKey(a), versionKey(b)];
    for (let i = 0; i < Math.max(va.core.length, vb.core.length); i += 1) {
        // A missing segment is ZERO, not "below everything": 1.0 and 1.0.0 are the same version, and
        // ranking by segment count is not a rule anyone writing a version number expects. An
        // unparseable segment is still -1, so junk keeps losing to any real version.
        const [x, y] = [va.core[i] ?? 0, vb.core[i] ?? 0];
        if (x !== y) {
            return x > y;
        }
    }
    if (va.release !== vb.release) {
        return va.release;   // equal cores: the release outranks a prerelease of itself
    }

    return rankText(a.lastUpdated) > rankText(b.lastUpdated);
};
const pick = (rs) => rs.reduce((best, r) => (newer(r, best) ? r : best), rs[0]);

const launcherIn = (r) => {
    if (typeof r?.installPath !== "string" || r.installPath === "") {
        return null;
    }
    const candidate = path.join(r.installPath, LAUNCHER);

    return fs.existsSync(candidate) ? candidate : null;
};

// Usability is part of the ranking, not a check after it. A stale entry — the ordinary result of a
// manual removal or a half-finished update — must not win and then fail: with a healthy sibling
// record in the same registry that produced "the record points nowhere" while the healthy one sat
// beside it. The nearest-project set is preferred, and a broken record there falls back to the wider
// set before the caches, because a registry record still knows things a cache walk cannot.
const usable = candidates.filter(launcherIn);
const fromRegistry = usable.length > 0 ? usable : records.filter(launcherIn);

let record;
if (fromRegistry.length > 0) {
    record = pick(fromRegistry);
    if (byProject.length === 0 && records.length > 1) {
        fs.writeSync(2, `vc-secrets: this directory belongs to none of the ${records.length} installs; using version ${registryField(record.version, "string", "unknown")} from ${registryField(record.projectPath, "string", "user scope")}\n`);
    }
} else {
    // Either the registry knew nothing — ordinary on a client that does not maintain one — or every
    // record it holds points at a directory with no launcher in it. installsInCaches returns only
    // directories that DO hold one, so anything it finds is usable by construction.
    const cached = installsInCaches();
    if (cached.length === 0 && records.length > 0) {
        fail(`no usable install of ${PLUGIN_KEY} -- every record in ${registryPath} points at a directory holding no ${LAUNCHER}, and no plugin cache holds one either. `
            + "Reinstall it from the marketplace, then run the vc-secrets install skill");
    }
    if (cached.length === 0) {
        // An absent registry and an unparseable one both arrive here with no records, and they need
        // different words. "Not installed" is a claim this shim cannot support when the file that
        // would have said otherwise is the one it could not read -- and it prescribes an install
        // that will not fix a corrupt registry.
        fail(registryProblem
            ? `could not determine whether ${PLUGIN_KEY} is installed -- ${registryPath} could not be read `
                + `(${registryProblem}), and no plugin cache in ${CACHE_ROOTS.join(", ")} holds a ${LAUNCHER}. `
                + "Repair or remove that file, or install the plugin from the marketplace, then run the vc-secrets install skill"
            : `plugin ${PLUGIN_KEY} is not installed -- looked in ${registryPath} and in ${CACHE_ROOTS.join(", ")}. `
                + "Install it from the marketplace, then run the vc-secrets install skill");
    }
    record = pick(cached);
    if (records.length > 0) {
        fs.writeSync(2, `vc-secrets: no record in ${registryPath} points at a usable install; using version ${record.version ?? "unknown"} from the plugin cache\n`);
    }
}

const launcher = launcherIn(record);

// Everything up to runCli happens before the launcher installs its own handlers, so a failure here
// would otherwise surface as a raw Node stack trace from a cache path — unreadable, and it names the
// wrong component.
let mod;
try {
    mod = await import(pathToFileURL(launcher).href);
} catch (e) {
    fail(`cannot load ${launcher}: ${e.message}`);
}
if (typeof mod.runCli !== "function") {
    fail(`${launcher} does not export runCli -- this shim is older than the plugin, re-run the vc-secrets install skill`);
}

await mod.runCli(process.argv.slice(2), { shimContract: SHIM_CONTRACT });
