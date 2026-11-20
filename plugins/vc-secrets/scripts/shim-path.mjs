import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// This module only DEFINES. It is imported by install-shim.mjs, which has side effects, and by the
// launcher's emit-config, which must have none — so the shared values cannot live in the installer.
const SHIM = "vc-secrets-shim.mjs";
const CANONICAL_DATA_ID = "vc-secrets-ai-tools";

// Each client keeps its plugins under its own directory in the user's home, keyed here by the name
// clients.json gives the client: <home>/plugins/cache/<marketplace>/<plugin>/<version>/ for installs and,
// beside it, <home>/plugins/data/ for this plugin's stable files. Cursor's layout was measured with
// cursor-agent 2026.11.19. The shim carries the same table as CLIENT_HOMES -- it is installed alone and
// cannot import this module -- and a test holds the two equal.
const CLIENT_HOME_DIRS = { "claude-code": ".claude", codex: ".codex", cursor: ".cursor" };

// The documented default, and only the default. Where --data-dir was honoured the installed path
// differs, and nothing outside the installer can know that it was.
//
// One per client, because a client's data directory is its own: Claude Code deletes
// ~/.claude/plugins/data/<id>/ when the plugin is uninstalled there, so a Codex or Cursor entry naming a shim
// in it broke on an uninstall in another client. Claude Code stays the default argument -- it is what every
// existing caller and every pasted settings entry names.
//
// Three levels, three functions, because two different callers want two different levels: the
// installer reports the data home in its own message and creates the plugin directory, while a config
// generator wants the file. Exporting only the deepest one pushes dirname() arithmetic back out to
// every caller, which is the duplication this module was extracted to end.
function defaultDataHome(env = process.env, client = "claude-code") {
    const dir = CLIENT_HOME_DIRS[client];
    if (!dir) {
        throw new Error(`unknown client "${client}"`);
    }

    return path.join(env.HOME || os.homedir(), dir, "plugins", "data");
}

function defaultShimDir(env = process.env, client = "claude-code") {
    return path.join(defaultDataHome(env, client), CANONICAL_DATA_ID);
}

function defaultShimPath(env = process.env, client = "claude-code") {
    return path.join(defaultShimDir(env, client), SHIM);
}

// Which client's tree a file sits in, or null when it sits in none -- a repository checkout, a copy made by
// hand. `local` marks Cursor's ~/.cursor/plugins/local, where a plugin is a directory the developer put
// there and updates in place, so its path carries no version.
// Every spelling the home can arrive in: the environment's and the OS's (they differ on Windows, where HOME
// can be set beside USERPROFILE), each also with its links resolved. A file's own location comes from
// import.meta.url, which Node resolves, so a home reached through a link (macOS's /var -> /private/var, a
// linked home directory) matched nothing and a Codex or Cursor copy read as no client's. The shim compares the
// same spellings for the same reason.
function homeSpellings(env) {
    const homes = new Set();
    for (const home of [env.HOME, os.homedir()]) {
        if (!home) {
            continue;
        }
        homes.add(home);
        try {
            homes.add(fs.realpathSync(home));
        } catch {
            // An unreadable home keeps the spelling it was given.
        }
    }

    return [...homes];
}

function clientOwning(filePath, env = process.env) {
    for (const home of homeSpellings(env)) {
        for (const [client, dir] of Object.entries(CLIENT_HOME_DIRS)) {
            const plugins = path.join(home, dir, "plugins");
            if (filePath.startsWith(plugins + path.sep)) {
                return { client, local: filePath.startsWith(path.join(plugins, "local") + path.sep) };
            }
        }
    }

    return null;
}

export { SHIM, CANONICAL_DATA_ID, CLIENT_HOME_DIRS, defaultDataHome, defaultShimDir, defaultShimPath, clientOwning };
