// Process layer: child spawning, env sanitising, redaction, command lookup; imports only from lower layers.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { VcSecretsError } from "../vc-secrets-error.mjs";

// Env vars that inject code/libraries into any child process we spawn — must never
// reach a tool we invoke, whether inherited from the operator's shell (sanitizeEnv, below, less
// INHERITED_ENV_KEPT) or declared in vc-secrets.json as a server env key (loadConfig rejects these
// keys outright — closing the gap for both literal and secret-resolved values, since it's the KEY
// that matters).
// A launcher's own hook counts too. Stripping NODE_OPTIONS is undone by `npm exec`, which writes
// npm_config_node_options back into the node it starts -- and does the same for a `node-options` line
// in whichever rc file npm_config_userconfig or npm_config_globalconfig names; npm_config_script_shell
// runs a script of the caller's choosing for a bare `npx` -- all measured. The .NET runtime runs the
// assemblies DOTNET_STARTUP_HOOKS names, and loads a profiler when CORECLR_ENABLE_PROFILING is set,
// before any of the tool's own code. A denylist claims no completeness, and one channel is beyond any
// env key: the `.npmrc` of the project npm finds from the server's working directory -- the nearest
// ancestor holding a package.json -- is read the same way, so it stays open here.
const DANGEROUS_ENV_VARS = ["NODE_OPTIONS", "LD_PRELOAD", "LD_AUDIT", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH",
    "NPM_CONFIG_NODE_OPTIONS", "NPM_CONFIG_USERCONFIG", "NPM_CONFIG_GLOBALCONFIG", "NPM_CONFIG_SCRIPT_SHELL",
    "DOTNET_STARTUP_HOOKS", "CORECLR_ENABLE_PROFILING"];

// Refused when declared, kept when inherited. These keys do not carry code, they point at rc files --
// which is also where a scope's registry mapping and a private registry's auth live. When the mapping
// lives only there, stripping it sends `npx <private-pkg>` to the public registry, which runs whatever
// is published there under that name: dependency confusion, created by the strip. Keeping them opens
// nothing new: whatever sets the inherited environment already sets NODE_OPTIONS for this launcher's
// own node, which applies it before sanitizeEnv runs. The declaration is the one channel the list can
// close, and loadConfig closes it.
const INHERITED_ENV_KEPT = ["NPM_CONFIG_USERCONFIG", "NPM_CONFIG_GLOBALCONFIG"];

// Matched without regard to case on every platform, not only where the environment is case-insensitive.
// A declaration is written once and travels: on Windows `node_options` reaches the child as NODE_OPTIONS,
// so a case-sensitive comparison would pass the exact key the list exists to refuse.
function isDangerousEnvKey(key) {
    return DANGEROUS_ENV_VARS.includes(key.toUpperCase());
}

function sanitizeEnv(env) {
    const out = {};
    for (const [key, value] of Object.entries(env)) {
        if (!isDangerousEnvKey(key) || INHERITED_ENV_KEPT.includes(key.toUpperCase())) {
            out[key] = value;
        }
    }

    return out;
}

// On Windows a declared key replaces every inherited spelling of it, not only an identical one: the
// environment is case-insensitive there, but a plain object is not, so assigning a declared PATH beside
// the inherited Path hands the child both and lets the platform pick -- and resolveSpawnCommand, which
// searches the child's PATH, would read the inherited one and ignore the declaration.
function mergeDeclaredEnv(base, declared, platform = process.platform) {
    const out = { ...base };
    if (platform === "win32") {
        const declaredKeys = new Set(Object.keys(declared).map((key) => key.toUpperCase()));
        for (const key of Object.keys(out)) {
            if (declaredKeys.has(key.toUpperCase())) {
                delete out[key];
            }
        }
    }

    return Object.assign(out, declared);
}

const VALUE_ON_STDIN = "<VALUE_ON_STDIN>";

// The whole command goes on stdin, not just the value: `security` has no stdin path for a password, but
// its interactive mode reads COMMANDS there, which keeps the value out of argv. spec.stdinCommand builds
// the line from the value runTool is handed.
const COMMAND_ON_STDIN = "<COMMAND_ON_STDIN>";

function redactSecrets(text, values) {
    let out = text;
    for (const value of [...values].sort((a, b) => b.length - a.length)) {
        if (value) {
            out = out.split(value).join("***");
        }
    }

    return out;
}

function runTool(spec, { stdinValue, redactValues = [] } = {}) {
    return new Promise((resolve, reject) => {
        // Backend tools need the same .cmd-shim handling cmdRun gives the server command: on Windows
        // `az` exists only as az.cmd, and a shell-less spawn cannot execute a batch shim. Without this
        // the ENOENT below surfaces as "not found on PATH", misreading a working `az` as absent.
        // A name the resolver cannot find throws here, inside the executor, so it rejects with the
        // same "not found on PATH" text a spawn ENOENT would have produced.
        const invocation = buildSpawnInvocation(resolveSpawnCommand(spec.cmd), spec.args);
        const child = spawn(invocation.cmd, invocation.args, {
            env: sanitizeEnv({ ...process.env, ...(spec.extraEnv || {}) }),
            stdio: spec.interactive ? "inherit" : ["pipe", spec.captureStdout ? "pipe" : "ignore", "pipe"],
            windowsHide: true,
            ...invocation.opts,
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        // SIGKILL reaches the direct child and not its descendants. killProcessTree is the mechanism
        // for that and is deliberately NOT reused here: it requires a child spawned DETACHED, and its
        // own comment gives the reason -- a group kill against a child that is not names a pgid the
        // child is not in, which a recycled pid makes somebody else's, and that group takes the follow-up
        // SIGKILL. Spawning every tool this runs detached would change signal and terminal delivery on
        // the path every secret read takes, the interactive write included, which inherits stdio
        // precisely so pinentry gets the TTY. And there is nothing to collect: no spec routed
        // through here leaves a durable grandchild, the one that raises a long-lived UI carries
        // timeoutMs: null and never arms this timer, and pinentry is gpg-agent's child, not gpg's.
        const timer = (!spec.interactive && typeof spec.timeoutMs === "number")
            ? setTimeout(() => {
                settled = true;
                child.kill("SIGKILL");
                reject(new VcSecretsError(`${spec.cmd} timed out after ${spec.timeoutMs} ms`));
            }, spec.timeoutMs)
            : null;
        const clear = () => {
            if (timer !== null) {
                clearTimeout(timer);
            }
        };

        child.on("error", (e) => {
            clear();
            if (!settled) {
                settled = true;
                reject(new VcSecretsError(`${spec.cmd}: ${e.code === "ENOENT" ? "not found on PATH" : e.message}`));
            }
        });
        if (child.stdout) {
            child.stdout.setEncoding("utf8");
            child.stdout.on("error", () => {});   // abrupt pipe teardown on SIGKILL (e.g. Windows ECONNRESET)
            child.stdout.on("data", (d) => { stdout += d; });
        }
        if (child.stderr) {
            child.stderr.setEncoding("utf8");
            child.stderr.on("error", () => {});   // abrupt pipe teardown on SIGKILL (e.g. Windows ECONNRESET)
            child.stderr.on("data", (d) => { stderr += d; });
        }
        if (!spec.interactive && child.stdin) {
            child.stdin.on("error", () => {});   // EPIPE if the tool dies before reading — surfaced via exit code
            if (spec.stdinData === VALUE_ON_STDIN && stdinValue !== undefined) {
                child.stdin.write(stdinValue);
            } else if (spec.stdinData === COMMAND_ON_STDIN && stdinValue !== undefined) {
                child.stdin.write(spec.stdinCommand(stdinValue));
            }
            child.stdin.end();
        }
        child.on("close", (code) => {
            clear();
            if (settled) {
                return;
            }
            settled = true;
            if (code !== 0) {
                const err = new VcSecretsError(`${spec.cmd} exited ${code}: ${redactSecrets(stderr.trim(), redactValues)}`);
                err.toolExitCode = code;
                reject(err);
                return;
            }
            // gpg --decrypt emits exactly the stored bytes, so stripping there would silently change a
            // value that really ends in a newline — fatal for migrate, which reads and then rewrites.
            // security -w and the PowerShell reader add their own line ending, so those keep the strip.
            resolve(spec.keepTrailingNewline ? stdout : stdout.replace(/\r?\n$/, ""));
        });
    });
}

// On win32 a bare command name is looked up by libuv in the CURRENT DIRECTORY before PATH, and this
// launcher runs with the project checkout as its cwd -- so a repository that commits a `powershell.exe`
// or a `cmd.exe` would have it executed with the secrets in its environment. Passing an absolute path
// to spawn is the only lookup that never consults the cwd, hence: on win32 every name is resolved here,
// against PATH entries that are themselves absolute (a relative entry such as `.` is a cwd lookup by
// another name), and a name that is not found is an error rather than a fallback to libuv's search.
// POSIX execvp does not search the cwd for a bare name either, unless PATH itself holds an empty element
// or `.`; the INHERITED PATH is outside what this protects (README, Scope of the protection), so the bare
// name is left to it there. A PATH the declaration sets is part of the trusted shape, and a relative one in
// it resolves to files in the repository -- the gap the same section describes for the files a declaration
// names.
// Looked up without regard to case: the environment is case-insensitive on Windows, but the child's env
// is a plain object, and a declaration may spell it `path` -- mergeDeclaredEnv has already made that the
// only spelling, so a fixed-case read would find nothing and report a working tool missing.
function windowsEnvValue(env, key) {
    const found = Object.keys(env).find((x) => x.toUpperCase() === key);

    return found === undefined ? undefined : env[found];
}

// Splits a Windows PATH the way libuv's search_path does (src/win/process.c, v1.x): a slice that opens
// with a double OR a single quote runs to the matching closing quote, so a `;` inside belongs to the
// directory, and it ends at the next `;` after that. Quotes are stripped from the slice afterwards, and
// independently at each end: a leading one if the slice starts with either kind, then a trailing one if
// what is left ends with either kind -- so an unterminated `"C:\a` still loses its opening quote and a
// mismatched pair loses both. Stripping per piece after a plain split on `;` would cut `"C:\a;b"` in
// two and report a tool that is there as missing. Empty slices are dropped. libuv skips only a slice that is
// empty BEFORE the quotes come off; one that is empty after (`""`) it searches as the cwd. Here it is dropped
// too, because a relative entry, and the cwd with it, is never searched -- findOnWindowsPath's filter.
function splitWindowsPath(value) {
    const isQuote = (c) => c === '"' || c === "'";
    const entries = [];
    let start = 0;
    for (;;) {
        let end = start;
        if (isQuote(value[start])) {
            const close = value.indexOf(value[start], start + 1);
            end = close === -1 ? value.length : close;
        }
        const semicolon = value.indexOf(";", end);
        end = semicolon === -1 ? value.length : semicolon;
        let entry = value.slice(start, end);
        if (isQuote(entry[0])) {
            entry = entry.slice(1);
        }
        if (isQuote(entry.at(-1))) {
            entry = entry.slice(0, -1);
        }
        if (entry !== "") {
            entries.push(entry);
        }
        if (end >= value.length) {
            return entries;
        }
        start = end + 1;
    }
}

function findOnWindowsPath(name, env, existsSync) {
    const P = path.win32;
    const dirs = splitWindowsPath(windowsEnvValue(env, "PATH") || "").filter((x) => P.isAbsolute(x));
    // libuv's name_has_ext: the file name (after the last `\`, `/` or `:`) holds a `.` that is not its last
    // character -- the FIRST dot, so `.bashrc` has one and `foo.` does not, which path.extname says the
    // other way round on both.
    const base = name.slice(Math.max(name.lastIndexOf("\\"), name.lastIndexOf("/"), name.lastIndexOf(":")) + 1);
    const dot = base.indexOf(".");
    const nameHasExt = dot !== -1 && dot + 1 < base.length;
    // libuv's rule for a name that has an extension: that exact file first, then `com` and `exe` appended
    // -- `python3.12` is `python3.12.exe`, and the extension it already has is not a reason to stop
    // looking. It never reads PATHEXT. A name without one is what PATHEXT is for here, since it is how a
    // `.cmd` shim is found at all.
    const suffixes = nameHasExt
        ? ["", ".com", ".exe"]
        : (windowsEnvValue(env, "PATHEXT") || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
    for (const dir of dirs) {
        for (const suffix of suffixes) {
            // libuv adds the dot between name and extension only if the name does not already end in one.
            const candidate = P.join(dir, name.endsWith(".") && suffix.startsWith(".") ? name + suffix.slice(1) : name + suffix);
            if (existsSync(candidate)) {
                return candidate;
            }
        }
    }

    return null;
}

// A command with a path is not searched for -- it is the file -- but the kind of file still decides how it
// is run: Node refuses to spawn a `.cmd`/`.bat` without a shell (EINVAL), so a pathful one goes through the
// same cmd.exe invocation a bare-name shim does, with cmd.exe itself looked up the same way. A pathful
// `.exe` or an extension-less name stays direct.
function resolveSpawnCommand(command, { platform = process.platform, env = process.env, existsSync = fs.existsSync } = {}) {
    if (platform !== "win32") {
        return { kind: "direct", cmd: command };
    }
    let found = command;
    if (!/[\\/]/.test(command)) {
        found = findOnWindowsPath(command, env, existsSync);
        if (found === null) {
            // The text runTool already produced for ENOENT and doctor parses with /^(\S+): not found on PATH/.
            throw new VcSecretsError(`${command}: not found on PATH`);
        }
    }
    const lower = path.win32.extname(found).toLowerCase();
    if (lower !== ".cmd" && lower !== ".bat") {
        return { kind: "direct", cmd: found };
    }
    // A shell-less spawn cannot run a .cmd shim, and the shell that does is looked up the same way.
    const shell = findOnWindowsPath("cmd.exe", env, existsSync);
    if (shell === null) {
        throw new VcSecretsError("cmd.exe: not found on PATH");
    }

    return { kind: "cmd-shim", cmd: found, shell };
}

function buildSpawnInvocation(resolved, args) {
    if (resolved.kind !== "cmd-shim") {
        return { cmd: resolved.cmd, args, opts: {} };
    }
    // cmd.exe /d /v:off /s /c ""<exe>" "<arg>"…" — verbatim line sidesteps cmd's outer-quote stripping
    //
    // Two things quoting alone does not settle, and both apply only on this branch -- a direct spawn
    // hands each argument to the program untouched:
    //  - cmd.exe expands %VAR% inside double quotes, from the CHILD's environment, which is where the
    //    resolved secrets live; a CR or LF ends the command line there and starts another. None of the
    //    three can be quoted away, so an argument holding one is refused here and not at load: a
    //    URL-encoded argument is legitimate on every direct path.
    //  - A trailing `\` is refused too. The program's own parser (MSVCRT) reads a backslash run before a
    //    quote as escaping it, so left alone it would swallow the closing quote and run the rest of the
    //    line into the argument. Doubling the run repairs that for a wrapper that forwards to an
    //    MSVCRT-parsed program (npx.cmd, az.cmd) but corrupts it for a batch file that reads the argument
    //    itself (%~1), and the same argv cannot be told apart from here. A refusal is the one answer that
    //    keeps what runs identical to what the trust review showed, for every .cmd/.bat.
    // The position is named, never the value: an argument can carry a token.
    //
    // The command sits on the same line inside its own quotes, so cmd.exe expands a `%` in it from the same
    // environment. A CR or LF in it is already refused when the declaration loads (CONTROL_CHAR_RE on
    // `command`), so only the `%` is checked here. "The command" is named and its text is not, as with an
    // argument's position above.
    if (resolved.cmd.includes("%")) {
        throw new VcSecretsError("the command contains %, which cmd.exe interprets inside the quotes of a .cmd/.bat shim -- it cannot be run through one on Windows");
    }
    const quoted = args.map((a, i) => {
        if (/[%\r\n]/.test(a)) {
            throw new VcSecretsError(`argument ${i + 1} contains %, CR or LF, which cmd.exe interprets inside the quotes of a .cmd/.bat shim -- it cannot be passed through one on Windows`);
        }

        if (a.endsWith("\\")) {
            throw new VcSecretsError(`argument ${i + 1} ends with a backslash, which a .cmd/.bat shim cannot pass on unchanged -- drop the trailing backslash`);
        }

        return `"${a}"`;
    });
    const line = [`"${resolved.cmd}"`, ...quoted].join(" ");

    // `/v:off` because delayed expansion can be switched on for every cmd.exe by the registry default
    // (HKCU\Software\Microsoft\Command Processor\DelayedExpansion), and `!NAME!` is then expanded from the
    // CHILD's environment -- where the resolved secrets live -- even inside quotes. The switch on the
    // command line overrides that default. Refusing `!` instead would reject arguments that are legitimate
    // on every direct path. A shim that runs `setlocal EnableDelayedExpansion` itself is outside what this
    // switch can cover.
    return { cmd: resolved.shell, args: [`/d /v:off /s /c "${line}"`], opts: { windowsVerbatimArguments: true } };
}

// Through the resolver on win32 rather than `where`: a bare `where` is itself looked up in the cwd
// first, and answering by the same lookup the launch will use keeps "doctor says present" and "run
// finds it" from disagreeing.
function commandOnPath(tool, { platform = process.platform, env = process.env, existsSync = fs.existsSync } = {}) {
    if (platform === "win32") {
        try {
            return existsSync(resolveSpawnCommand(tool, { platform, env, existsSync }).cmd);
        } catch (e) {
            if (e instanceof VcSecretsError) {
                return false;
            }
            throw e;
        }
    }

    return spawnSync("which", [tool], { stdio: "ignore", windowsHide: true }).status === 0;
}

export {
    DANGEROUS_ENV_VARS, isDangerousEnvKey, sanitizeEnv, mergeDeclaredEnv, VALUE_ON_STDIN,
    COMMAND_ON_STDIN, redactSecrets, runTool, windowsEnvValue, resolveSpawnCommand, buildSpawnInvocation,
    commandOnPath,
};
