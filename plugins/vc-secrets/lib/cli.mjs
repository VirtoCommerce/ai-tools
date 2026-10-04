// CLI layer: prompts, set/unlock/emit-config verbs, the entry point runCli; imports only from lower layers.

import fs from "node:fs";

import { VcSecretsError } from "../vc-secrets-error.mjs";
import { clientNames, clientDescriptor, MIN_VERSION_UNKNOWN } from "../clients.mjs";
import { defaultShimPath } from "../scripts/shim-path.mjs";

import { forTerminal } from "./util.mjs";
import { runTool } from "./spawn.mjs";
import { CONFIG_NAME, loadConfig } from "./config.mjs";
import { buildLocalWrite, cmdMigrate, detectLocalBackend, keyFor, keyToPath, keystoreFilePresent, legacyKeyToPath,
    nameFromKey, writeLocalValue } from "./keystore.mjs";
import { cmdTrust, cmdUntrust, isNamespaceDecl, namespaceDeclarations, namespaceTrustProblem, readTrustState,
    requireNamespaceTrust, trustAssessment, trustNotes } from "./trust.mjs";
import { oauthEntryKeys } from "./oauth-token.mjs";
import { cmdLogin, cmdLogout } from "./oauth-login.mjs";
import { cmdRun, cmdTask } from "./launch.mjs";
import { cmdDoctor } from "./doctor.mjs";

function applyKeystrokes(state, chunk) {
    let { value } = state;
    for (const c of chunk) {
        if (c === "\r" || c === "\n" || c === "\u0004") {
            return { value, done: true, cancelled: false };
        }
        if (c === "\u0003") {
            return { value: "", done: true, cancelled: true };
        }
        if (c === "\u007f" || c === "\b") {
            value = value.slice(0, -1);
            continue;
        }
        if (c < " ") {
            continue;   // other control chars
        }
        value += c;
    }

    return { value, done: false, cancelled: false };
}

function promptHidden(question) {
    return new Promise((resolve, reject) => {
        if (!process.stdin.isTTY) {
            reject(new VcSecretsError("vc-secrets set requires an interactive terminal"));
            return;
        }
        process.stderr.write(question);
        const wasRaw = process.stdin.isRaw;
        process.stdin.setRawMode(true);
        process.stdin.resume();
        let state = { value: "" };
        const onData = (chunk) => {
            state = applyKeystrokes(state, chunk.toString("utf8"));
            if (!state.done) {
                return;
            }
            process.stdin.setRawMode(wasRaw);
            process.stdin.off("data", onData);
            process.stdin.pause();
            process.stderr.write("\n");
            if (state.cancelled) {
                process.exit(130);
            }
            resolve(state.value);
        };
        process.stdin.on("data", onData);
    });
}

async function cmdSet(name, cfg, { trustState = null } = {}) {
    const decl = cfg.secrets[name];
    if (!decl) {
        throw new VcSecretsError(`unknown secret "${name}" -- declare it in ${CONFIG_NAME} first`);
    }
    if (decl.backend !== "local") {
        throw new VcSecretsError(`secret "${name}" is backend "${decl.backend}" -- set it in its own store, not via vc-secrets`);
    }
    // Before the backend is consulted and before the value is asked for: a person must not type a secret
    // for a checkout that has not earned the namespace it would be stored in.
    requireNamespaceTrust(cfg, "secret", name, trustState);
    const key = keyFor(name, decl, cfg);
    const backend = detectLocalBackend();
    const spec = buildLocalWrite(backend, key, process.env, { tmp: backend === "gpg" });
    if (spec.interactive) {
        await runTool(spec);                 // macOS: security prompts on the TTY; no timer
    } else {
        const value = await promptHidden(`value for "${name}" (hidden): `);
        if (!value) {
            throw new VcSecretsError("empty value -- nothing stored");
        }
        await writeLocalValue(backend, key, spec, value, process.env);
    }
    process.stderr.write(`vc-secrets: stored "${name}" (${decl.scope}) in ${backend}\n`);
}

// Two sources feed the list: a sign-in's cache entries live beside the declared secrets and never
// appear in `cfg.secrets`. Sign-ins have no legacy path — they never existed under the old naming.
//
// Legacy paths count for declared secrets. `migrate` documents `unlock` as its prerequisite, and
// before a migration NO secret exists under a new key — so looking only there left the agent cold,
// and migrate then failed on the very run it was supposed to enable. One decrypt warms the agent for
// all of them; the first file that exists is enough.
//
// `includeNamespace` false leaves out what a repository declares into its own namespace
// (isNamespaceDecl): an existence check and a test decrypt of `vc-secrets:<projectId>:<name>` tells a
// checkout that is not trusted for that id -- possibly another project's -- which of its entries exist.
function unlockTargets(cfg, exists = keystoreFilePresent, includeNamespace = true) {
    const files = [];
    for (const [name, decl] of Object.entries(cfg.secrets)) {
        if (decl.backend !== "local" || (!includeNamespace && isNamespaceDecl("secret", decl))) {
            continue;
        }
        const current = keyToPath(keyFor(name, decl, cfg));
        const legacy = legacyKeyToPath(name);
        if (exists(current)) {
            files.push({ name, file: current });
        } else if (exists(legacy)) {
            files.push({ name: `${name} (legacy)`, file: legacy });
        }
    }
    for (const [name, decl] of Object.entries(cfg.oauth ?? {})) {
        if (!includeNamespace && isNamespaceDecl("oauth", decl)) {
            continue;
        }
        for (const key of Object.values(oauthEntryKeys(name, decl, cfg))) {
            const entryName = nameFromKey(key);
            const file = keyToPath(key);
            if (exists(file)) {
                files.push({ name: entryName, file });
            }
        }
    }

    return files;
}

async function cmdUnlock(cfg, opts = {}) {
    // exists: unlockTargets' default. trustState: the seam for a test; the file otherwise.
    const { exists, run = runTool, write = (s) => process.stderr.write(s), trustState = null } = opts;
    if (detectLocalBackend() !== "gpg") {
        write("vc-secrets: unlock is a no-op on this platform\n");
        return;
    }
    if (!process.env.GPG_TTY) {
        // Guarded form on purpose: in a non-interactive shell `tty` prints "not a tty", and exporting
        // that hands gpg a bogus terminal path instead of leaving the variable unset.
        write("vc-secrets: GPG_TTY is not set -- pinentry may fail; add `if [ -t 0 ]; then export GPG_TTY=$(tty); fi` to your shell rc\n");
    }
    // What this checkout may not examine: the entries a repository declares into its namespace while no
    // record pins its projectId to this root (namespaceTrustProblem), the rule `doctor` reads them under.
    // Only a repository that declares any asks, so a user-only config never opens the trust file.
    const declared = namespaceDeclarations(cfg);
    let includeNamespace = true;
    if (declared.length > 0) {
        try {
            includeNamespace = namespaceTrustProblem(cfg, trustState ?? readTrustState(process.env), declared) === null;
        } catch (e) {
            // Unreadable counts as not trusted, as it does for a launch; the file is named once.
            includeNamespace = false;
            write(`vc-secrets: ${e?.message ?? "the trust file could not be read"}\n`);
        }
        if (!includeNamespace) {
            for (const { kind, name } of declared) {
                write(`SKIP ${kind} "${name}" not checked -- this checkout is not trusted for namespace ${JSON.stringify(cfg.projectId)}\n`);
            }
        }
    }
    const files = unlockTargets(cfg, exists, includeNamespace);
    if (files.length === 0) {
        write("vc-secrets: nothing stored on the gpg backend to unlock\n");
        return;
    }
    for (const { file } of files) {
        // interactive: pinentry gets the TTY; -o /dev/null: plaintext never enters vc-secrets or the terminal
        await run({ cmd: "gpg", args: ["--quiet", "--decrypt", "-o", "/dev/null", file],
            interactive: true, timeoutMs: null, captureStdout: false });
    }
    // A count, not the names: the agent is warm for everything on this key, and naming a single
    // entry read as "only that one was affected".
    write(`vc-secrets: gpg agent warmed (${files.length} ${files.length === 1 ? "entry" : "entries"})\n`);
}

// --- CLI entry ---
function failureLine(e) {
    // One PHYSICAL line, which "no stack" alone did not achieve: a backend tool's own stderr is
    // embedded in the message with its newlines intact, and the probe decides whose failure this was
    // by reading the LAST stderr line. Three lines from a locked gpg agent left that last line
    // looking like the server's, and "server exited before responding" is the one outcome the doctor
    // skill reads as a broken binary -- so the launcher's own refusal was reported as the server's.
    // U+2028/2029 count as line ends too: forTerminal does not flatten them, and the probe's line match
    // does not cross them, so either would split this into a line the probe reads as someone else's.
    const folded = String(e?.message ?? e).replace(/\s*[\n\u2028\u2029]\s*/g, " ");

    // Then what is left of the control range is flattened, whole: a message embeds declaration paths and a
    // tool's own output, and an ESC in either is a terminal command. After the fold, so a line ending still
    // becomes one space and not a question mark -- and no other byte can make a second line.
    return `vc-secrets: ${forTerminal(folded, Infinity)}\n`;
}

function fail(e) {
    // sync write: stderr is async on a POSIX pipe and on a Windows console, and process.exit drops pending writes
    fs.writeSync(2, failureLine(e));
    process.exit(e instanceof VcSecretsError ? e.exitCode : 1);
}

// TOML bare keys are [A-Za-z0-9_-]+; anything else must be a quoted key, or the dots in the name
// become table separators.
const TOML_BARE_KEY_RE = /^[A-Za-z0-9_-]+$/;

function tomlKey(name) {
    return TOML_BARE_KEY_RE.test(name) ? name : JSON.stringify(name);
}

function emitConfig(cfg, clientName) {
    const client = clientDescriptor(clientName);
    const names = Object.keys(cfg.servers ?? {});
    const notes = [];

    // A client that expands nothing in its own config needs a literal path, and the shim is it. No
    // caveat rides along any more: the shim resolves the current install from whichever client's
    // registry or plugin cache is present, so the emitted entry does not depend on any one client
    // being installed. The alternative that stays disqualified is a path into the versioned plugin
    // cache -- it keeps resolving after an update and silently runs an OLD launcher.
    let launcher = client.launcherRef;
    if (!launcher) {
        launcher = defaultShimPath();
        notes.push(`${client.displayName} expands no variables in its config, so this entry names the shim by path -- `
            + "the shim resolves the current plugin install per launch, so an ordinary update needs no re-emit");
    }

    if (client.minVersion === MIN_VERSION_UNKNOWN) {
        notes.push(`${client.displayName}: version floor not established -- this entry is untested on any specific version`);
    } else if (client.minVersion) {
        notes.push(`${client.displayName}: requires ${client.minVersion} or newer`);
    }
    // One note per scope. Joining the templates into one sentence after "paste into one of:" produced
    // the literal instruction "paste into one of: … not by pasting", because a template carries its own
    // guidance for the scope that is NOT pasted.
    for (const [scope, where] of Object.entries(client.configFiles)) {
        notes.push(`${scope} scope -> ${where}`);
    }
    // A resolved path, never client.launcherRef: that token is expanded by the CLIENT inside its own
    // config file and is not a path in a shell. Measured -- `bash -c 'echo node "${env:VC_SECRETS}"'`
    // prints an empty word, so the instruction would silently become `node "" doctor`.
    notes.push(`then verify with: node ${JSON.stringify(defaultShimPath())} doctor`);

    if (client.format === "toml") {
        const lines = [];
        for (const name of names) {
            lines.push(`[${client.serversKey}.${tomlKey(name)}]`, `command = "node"`,
                `args = ${JSON.stringify([launcher, "run", name])}`, "");
        }

        return { body: lines.join("\n"), notes };
    }

    const servers = {};
    for (const name of names) {
        servers[name] = { command: "node", args: [launcher, "run", name] };
    }

    return { body: JSON.stringify({ [client.serversKey]: servers }, null, 2) + "\n", notes };
}

async function cmdEmitConfig(cfg, argv) {
    const name = argv[0];
    if (!name) {
        throw new VcSecretsError(`emit-config: name a client (${clientNames().join(", ")})`);
    }
    const { body, notes } = emitConfig(cfg, name);
    notes.push(...trustNotes(cfg, trustAssessment(cfg)));
    // Notes to fd 2, body to fd 1: stdout is exactly what gets pasted into a strict-JSON or TOML file,
    // so a redirect produces a valid file and a terminal still shows the guidance.
    fs.writeSync(2, notes.map((n) => `emit-config: ${n}\n`).join(""));
    fs.writeSync(1, body);
}

const VERBS = ["run", "task", "set", "unlock", "login", "logout", "doctor", "migrate", "emit-config", "trust", "untrust"];

const USAGE = `usage: vc-secrets <${VERBS.join("|")}> [name]`;

async function main(argv, { shimContract } = {}) {
    const [command, arg] = argv;
    // Usage and the diagnostic must survive a machine with no declarations at all: `doctor` is what
    // you reach for when nothing works, so it reports the missing file as a FAIL instead of dying on
    // it. Every other verb genuinely needs a declaration and fails as before.
    if (!VERBS.includes(command)) {
        throw new VcSecretsError(USAGE);
    }
    // Before loadConfig, because it removes a record and needs no declaration to exist -- the checkout may
    // be gone, or the file deleted, and the record is exactly what is left behind. trustRootKey is what
    // finds it: a path that is gone keys the way it did while it existed, whether a link sits above the deleted part or is the checkout itself.
    if (command === "untrust") {
        await cmdUntrust(arg);
        return;
    }
    let cfg;
    try {
        cfg = loadConfig();
    } catch (e) {
        if (command !== "doctor") {
            throw e;
        }
        fs.writeSync(2, `FAIL ${e.message}\n`);
        process.exit(1);
    }
    if (command === "run" && arg) {
        await cmdRun(arg, cfg);
        return;
    }
    if (command === "set" && arg) {
        await cmdSet(arg, cfg);
        return;
    }
    if (command === "task" && arg) {
        await cmdTask(arg, cfg);
        return;
    }
    if (command === "unlock") {
        await cmdUnlock(cfg);
        return;
    }
    if (command === "login" && arg) {
        await cmdLogin(arg, cfg);
        return;
    }
    if (command === "logout" && arg) {
        const report = await cmdLogout(arg, cfg);
        // Names and counts only -- never a value. Deliberately does NOT restate the serialisation
        // warning: that line is printed the moment the lock is refused, immediately above this one
        // in the same stream, and a second copy here would be a mirror no test can reach.
        fs.writeSync(2, `vc-secrets: removed ${report.removed.length} (${report.removed.join(", ") || "none"}), `
            + `already absent ${report.alreadyAbsent.length}\n`);
        return;
    }
    if (command === "doctor") {
        await cmdDoctor(cfg, argv.slice(1), { shimContract });
        return;
    }
    if (command === "migrate") {
        await cmdMigrate(cfg);
        return;
    }
    if (command === "emit-config") {
        await cmdEmitConfig(cfg, argv.slice(1));
        return;
    }
    if (command === "trust") {
        await cmdTrust(cfg);
        return;
    }
    throw new VcSecretsError(USAGE);   // a known verb reached here missing its required argument
}

// Turns off libuv's cwd-first lookup for a bare command name, for this process and -- through
// sanitizeEnv, which does not strip it -- for every child that inherits it. resolveSpawnCommand already
// hands spawn an absolute path, so this is the second layer: it holds for a spawn that ever bypasses
// the resolver, and for whatever a wrapper like npx looks up on its own. Read from the calling
// process's environment, which is why it is set here and not only in the child's. Mutates `env` in
// place because process.env cannot be replaced; returns it for the caller's convenience.
function hardenSpawnEnv(env, platform) {
    if (platform === "win32") {
        env.NoDefaultCurrentDirectoryInExePath = "1";
    }

    return env;
}

// The single entry point, used both by the direct-run gate in vc-secrets.mjs and by the shim -- which
// cannot rely on that gate, because when the shim runs it is argv[1], not vc-secrets.mjs. Two entry
// paths diverging is how the wrapped and unwrapped invocations start behaving differently.
async function runCli(argv, { shimContract } = {}) {
    hardenSpawnEnv(process.env, process.platform);
    process.on("uncaughtException", fail);
    process.on("unhandledRejection", fail);

    return main(argv, { shimContract: typeof shimContract === "number" ? shimContract : undefined }).catch(fail);
}

export {
    applyKeystrokes, promptHidden, cmdSet, unlockTargets, cmdUnlock, failureLine, emitConfig,
    cmdEmitConfig, hardenSpawnEnv, runCli,
};
