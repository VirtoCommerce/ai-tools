// vc-secrets.mjs — secrets launcher: runs a declared process (an MCP server, or a task) with its secrets.
// Resolves the secrets a declared child needs from the OS credential store at launch time and
// injects them into that one child only. README.md carries the declaration schema, the three
// declaration homes and their precedence.
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import tty from "node:tty";
import { fileURLToPath, pathToFileURL } from "node:url";

import { VcSecretsError } from "./vc-secrets-error.mjs";
import { clientNames, clientDescriptor, MIN_VERSION_UNKNOWN } from "./clients.mjs";
import { defaultDataHome, defaultShimDir, defaultShimPath } from "./scripts/shim-path.mjs";
import * as cache from "./vc-secrets-cache.mjs";     // entries, expiry, the cross-process refresh lock
import * as oauth from "./vc-secrets-oauth.mjs";     // the Entra protocol
import { PACKAGE_NAME_RE, BIN_NAME_RE } from "./vc-secrets-target.mjs"; // the one copy of the target grammar
import { severingClose } from "./vc-secrets-teardown.mjs"; // the one teardown, for all three servers

const CONFIG_NAME = "vc-secrets.json";

// The user file as a message names it -- a hint a human reads and acts on, never a path this code
// opens, which is why it is a literal rather than a path.join. `~` is a POSIX shell convention with no
// Windows spelling at all, so joining it with the platform separator produces `~\.claude\...`: half one
// idiom and half the other, and different advice on different machines for the same mistake.
const CONFIG_HINT_PATH = `~/.claude/${CONFIG_NAME}`;
const LOCAL_CONFIG_NAME = "vc-secrets.local.json";
const KEY_PREFIX = "vc-secrets";
const LEGACY_KEY_PREFIX = "mcpw";
const USER_SCOPE = "user";
// Bump when a declaration gains a shape an older launcher cannot honour. Refusing by version beats
// silently ignoring half a declaration — the reason unknown TOP-LEVEL keys are only a warning is
// that this field, not the key check, is what reports a genuine skew.
const SCHEMA_VERSION = 1;
const BACKENDS = ["local", "keyvault"];
const TOP_LEVEL_KEYS = ["schemaVersion", "projectId", "secrets", "servers", "tasks", "vaults", "oauth", "registrations"];
const SECRET_DECL_KEYS = ["backend", "vault", "secret", "format", "authorized"];
const SERVER_DECL_KEYS = ["command", "args", "env"];
const OAUTH_DECL_KEYS = ["tenantId", "clientId", "scopes", "targetPackage", "binName", "authorized"];

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

// grammar: ("secret" | "oauth") ":" name [ "." field ]; name [a-z0-9-]+, field [A-Za-z0-9_]+
const REF_RE = /^(secret|oauth):([a-z0-9-]+)(?:\.([A-Za-z0-9_]+))?$/;
const REF_PREFIXES = ["secret:", "oauth:"];
// A secret's declared name must be referenceable, so it obeys the same charset REF_RE does.
const SECRET_NAME_RE = /^[a-z0-9-]+$/;
// Launchable names are looser (they mirror MCP server names, which do carry dots and capitals), but a
// path separator or a control character in one has no legitimate use and several bad ones.
const LAUNCHABLE_NAME_RE = /^[A-Za-z0-9._-]+$/;
// The class forTerminal flattens: C0, DEL and C1. Not global, so `test` carries no lastIndex between calls.
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f-\u009f]/;
// Azure AD tenant ids are GUIDs, and arrive mixed-case.
const TENANT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Azure's own rules for a Key Vault name (3-24 characters, starts with a letter, ends with a letter or a
// digit, hyphens allowed but never two in a row) and for a secret name (1-127 characters of letters,
// digits and hyphens). The `--` rule is a second test because the charset cannot say it.
const KEYVAULT_VAULT_NAME_RE = /^[A-Za-z][A-Za-z0-9-]{1,22}[A-Za-z0-9]$/;
const KEYVAULT_SECRET_NAME_RE = /^[0-9A-Za-z-]{1,127}$/;

function parseReference(value) {
    if (typeof value !== "string" || !REF_PREFIXES.some((prefix) => value.startsWith(prefix))) {
        return null;
    }
    const match = REF_RE.exec(value);
    if (!match) {
        throw new VcSecretsError(`invalid reference syntax: "${value}"`);
    }
    const [, kind, name, field = null] = match;
    if (kind === "oauth" && field !== null) {
        throw new VcSecretsError(`invalid reference "${value}": an oauth entry has no fields to select`);
    }

    return { kind, name, field };
}

// Every env value carries its kind. The alternative — "anything that is not a `secret:` reference is a
// literal" — makes a pasted credential indistinguishable from an intended constant, which is the one
// thing a declaration must never be ambiguous about: it is the file this tool exists to keep free of
// values. It also ends a family of near-misses (`secrets:` with the plural, `Secret:`) by construction,
// since an unprefixed value no longer has a meaning to fall back to.
const LITERAL_PREFIX = "literal:";

function parseLiteral(value) {
    return typeof value === "string" && value.startsWith(LITERAL_PREFIX) ? value.slice(LITERAL_PREFIX.length) : null;
}

// realpath, not resolve: an aliased .claude — a symlinked home, a bind mount — is one file under two
// strings, and comparing the strings makes every same-file check miss. Falls back to resolve for a path
// that does not exist yet, where realpath cannot answer.
//
// The catch is wider than that reason -- EACCES and ELOOP take the same fallback, and where a caller
// has established presence first ENOENT cannot even reach it. Narrowing it to ENOENT was weighed and
// rejected: it makes this throw at call sites that never have to, to close a gap that needs the two
// sides of one comparison to fail ASYMMETRICALLY. When both fall back, both yield the same resolved
// string and the comparison still answers correctly.
function canonicalPath(p) {
    try {
        return fs.realpathSync(p);
    } catch {
        return path.resolve(p);
    }
}

// The only stat failures that mean "nothing is there". ENOTDIR belongs with ENOENT: a path running
// through a regular FILE cannot name anything, and it is the ordinary answer when configPaths' walk
// meets a repository whose `.claude` is a file -- refusing there would stop every launch in it.
function isAbsentPathError(e) {
    return e?.code === "ENOENT" || e?.code === "ENOTDIR";
}

// existsSync answers false for a file that IS there and cannot be stat'd -- an ancestor that lost its
// search bit, an ACL change above it -- and a caller reads that false as "there is nothing to read".
// For a declaration that is a launch without its servers; for a keystore file it is a developer
// retyping a secret that never left the disk. Neither has anything to continue with, so the ambiguous
// answer is an error that names the path, not a false.
function pathPresent(p, what) {
    try {
        fs.statSync(p);

        return true;
    } catch (e) {
        if (isAbsentPathError(e)) {
            return false;
        }
        throw new VcSecretsError(`${what} could not be examined (${e.code ?? e.message})`);
    }
}

const keystoreFilePresent = (p) => pathPresent(p, `the keystore file "${p}"`);

// Where each scope's declarations live. The project root is found by walking up from cwd rather
// than assuming it: the client spawns a server with cwd at the project, but a task or a hand-run
// `doctor` can start anywhere below it.
//
// `root` is the repository the declarations belong to, which is what a trust record is keyed by. It is
// the parent of the `.claude` directory the walk stopped at, and null when the walk found no project.
function configPaths(env = process.env, cwd = process.cwd()) {
    const home = env.HOME || os.homedir();
    const override = env.VC_SECRETS_CONFIG_DIR;
    // The override stands in for a PROJECT, not for every scope: a test needs project-scope
    // declarations to be project-scoped, or `projectId` and the keystore namespace go untested. A test
    // that wants user scope points HOME at a fixture instead.
    //
    // Its root is the directory itself, and it is gated like any repository: an exemption would let
    // anything able to set this variable name a directory of its own and skip the gate. It is not the
    // only such input -- the launcher's whole environment is outside what the gate defends (README,
    // Scope of the protection).
    if (override) {
        return { user: null, project: path.join(override, CONFIG_NAME), local: path.join(override, LOCAL_CONFIG_NAME), root: override };
    }
    let dir = path.resolve(cwd);
    let projectDir = null;
    // ~/.claude is the USER scope's home. The walk passes through it for any cwd under $HOME, and
    // accepting it as the project would make one file both scopes: the dedupe below then drops it, and
    // `doctor` loses its anchor for settings.local.json and .mcp.json — reporting a wired server's
    // leftover plaintext token as "still required", the opposite of the truth.
    const userClaude = canonicalPath(path.join(home, ".claude"));
    for (;;) {
        const claude = path.join(dir, ".claude");
        const declared = (name) => {
            const file = path.join(claude, name);

            return pathPresent(file, `the declaration "${file}"`);
        };
        if (pathPresent(claude, `the directory "${claude}"`) && canonicalPath(claude) !== userClaude
            && (declared(CONFIG_NAME) || declared(LOCAL_CONFIG_NAME))) {
            projectDir = claude;
            break;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }

    return {
        user: path.join(home, ".claude", CONFIG_NAME),
        project: projectDir ? path.join(projectDir, CONFIG_NAME) : null,
        local: projectDir ? path.join(projectDir, LOCAL_CONFIG_NAME) : null,
        root: projectDir ? path.dirname(projectDir) : null,
    };
}

// A project declaration that merely NAMES a user-scope secret grants itself the credential, and no gate
// above catches it: what the MCP client approves is `node $VC_SECRETS run <name>`, one level above the
// declaration that decides what `<name>` actually runs. Rewrite the command behind an already-approved
// name and every existing check still passes. So the owner of the secret authorizes the SHAPE that may
// receive it, in the user file, which no repository can carry — and a change to that shape stops the
// launch instead of riding along.
function consumerShape(launchable) {
    return { command: launchable.command, args: [...launchable.args], envKeys: Object.keys(launchable.env).sort() };
}

// The differences, in the words the reader needs to decide; null when the shapes agree.
function shapeDifferences(authorized, actual) {
    // Each value is a repository's declared text on its way to a terminal -- whole, not cut: this is what
    // the reader decides on. See jsonForTerminal for why escaped rather than flattened.
    const shown = (value) => jsonForTerminal(value);
    const diffs = [];
    if (authorized.command !== actual.command) {
        diffs.push(`command is ${shown(actual.command)}, authorized ${shown(authorized.command)}`);
    }
    if (JSON.stringify(authorized.args) !== JSON.stringify(actual.args)) {
        diffs.push(`args are ${shown(actual.args)}, authorized ${shown(authorized.args)}`);
    }
    const wanted = [...authorized.envKeys].sort();
    if (JSON.stringify(wanted) !== JSON.stringify(actual.envKeys)) {
        diffs.push(`env keys are ${shown(actual.envKeys)}, authorized ${shown(wanted)}`);
    }

    return diffs.length === 0 ? null : diffs;
}

function validateVaults(vaults) {
    if (vaults === undefined) {
        return;
    }
    if (typeof vaults !== "object" || vaults === null || Array.isArray(vaults)) {
        throw new VcSecretsError(`"vaults" must be an object keyed by vault name`);
    }
    for (const [vault, secrets] of Object.entries(vaults)) {
        if (typeof secrets !== "object" || secrets === null || Array.isArray(secrets)) {
            throw new VcSecretsError(`vaults."${vault}" must be an object keyed by secret name`);
        }
        for (const [secret, block] of Object.entries(secrets)) {
            // Same validator as a secret's own `authorized` block: one shape rule, so a change to one
            // cannot leave the other authorizing something it no longer understands.
            validateAuthorized(`vaults."${vault}"."${secret}"`, block);
        }
    }
}

function validateRegistrations(registrations) {
    if (registrations === undefined) {
        return;
    }
    if (typeof registrations !== "object" || registrations === null || Array.isArray(registrations)) {
        throw new VcSecretsError(`"registrations" must be an object keyed by tenant id`);
    }
    // Canonicalising to lower case (the merge in loadConfig, and the lookup in authorizationFor) would
    // otherwise collapse two spellings of the same tenant into one key and silently drop whichever
    // grant loses the collision — refuse it here instead, while both spellings are still visible.
    const seenTenantIds = new Map();
    for (const [tenantId, clients] of Object.entries(registrations)) {
        const lower = tenantId.toLowerCase();
        const prior = seenTenantIds.get(lower);
        if (prior !== undefined) {
            throw new VcSecretsError(`registrations has both "${prior}" and "${tenantId}" -- tenant ids are matched without regard to case, so pick one spelling`);
        }
        seenTenantIds.set(lower, tenantId);
        if (typeof clients !== "object" || clients === null || Array.isArray(clients)) {
            throw new VcSecretsError(`registrations."${tenantId}" must be an object keyed by client id`);
        }
        for (const [clientId, block] of Object.entries(clients)) {
            // Same validator as a secret's own `authorized` block: one shape rule, so a change to one
            // cannot leave the other authorizing something it no longer understands.
            validateAuthorized(`registrations."${tenantId}"."${clientId}"`, block);
        }
    }
}

function validateAuthorized(label, authorized) {
    if (authorized === undefined) {
        return;
    }
    if (typeof authorized !== "object" || authorized === null || Array.isArray(authorized)) {
        throw new VcSecretsError(`${label}: "authorized" must be an object`);
    }
    for (const [kind, entries] of Object.entries(authorized)) {
        if (kind !== "servers" && kind !== "tasks") {
            throw new VcSecretsError(`${label}: authorized "${kind}" is not a kind (expected servers/tasks)`);
        }
        if (typeof entries !== "object" || entries === null || Array.isArray(entries)) {
            throw new VcSecretsError(`${label}: authorized.${kind} must be an object keyed by name`);
        }
        for (const [name, shape] of Object.entries(entries)) {
            if (typeof shape !== "object" || shape === null || Array.isArray(shape)) {
                throw new VcSecretsError(`${label}: authorized.${kind}."${name}" must be an object`);
            }
            if (typeof shape.command !== "string" || !shape.command) {
                throw new VcSecretsError(`${label}: authorized.${kind}."${name}" needs a "command" string`);
            }
            if (!Array.isArray(shape.args) || !shape.args.every((a) => typeof a === "string")) {
                throw new VcSecretsError(`${label}: authorized.${kind}."${name}" needs "args" as an array of strings`);
            }
            if (!Array.isArray(shape.envKeys) || !shape.envKeys.every((k) => typeof k === "string")) {
                throw new VcSecretsError(`${label}: authorized.${kind}."${name}" needs "envKeys" as an array of strings`);
            }
        }
    }
}

// null when the reference needs no authorization; otherwise what is wrong with it, ready to be reported by
// `doctor` or thrown at launch. Both callers must agree, so the decision lives in one place.
// The condition is "nothing in the repository authorizes this read", which covers four cases and not a
// fifth. A user-scope declaration — secret or oauth — needs no help: the value, or the delegated grant, is
// yours, so the authorization sits on the declaration itself (only the `where` pointer differs by kind). A
// keyvault declaration at ANY scope: the read is paid for by whatever identity `az` is logged in as, which
// the repository does not own — while the vault and the secret name it reads DO come from the repository, so
// the authorization cannot live there either and is keyed by that pair in the user file. A project-scope
// oauth declaration is the same shape: the token is minted against whatever identity the developer signs in
// as, which the repository does not own — while the tenantId and clientId it signs in against DO come from
// the repository, so the authorization is keyed by that pair in the user file too. A project-declared
// `local` secret needs no AUTHORIZATION: its key is namespaced to the project (keyFor), so what you `set`
// cannot be read by another project — the namespacing itself is what stands in for authorization. It does
// need this checkout's trust when the consumer is a user-scope launchable (trustGateOf): the namespace is
// the repository's projectId claim, and only the trust record, keyed by the root, pins it. A sign-in is
// not namespaced that way: the token it mints is not confined to one project, so it cannot stand in for
// a per-project grant the way a namespaced keystore entry can.
// Every lookup below reads parsed JSON, except the registrations outer level, which the merge rebuilds
// null-prototype while canonicalising its keys — the client level under it is still parsed JSON, which is
// where `own` earns its place. And a
// launchable may legally be named `toString` or `constructor` (LAUNCHABLE_NAME_RE allows both). A plain
// bracket read would return the inherited builtin instead of undefined, which then reaches
// shapeDifferences as an object with no envKeys and throws where a refusal belongs. Measured: one such
// name in a project file took down the whole doctor report, not just its own line.
function own(map, key) {
    return map !== null && typeof map === "object" && Object.hasOwn(map, key) ? map[key] : undefined;
}

function authorizationFor(cfg, decl) {
    if (decl.kind === "oauth" && decl.home === USER_SCOPE) {
        return { block: decl.authorized, where: `oauth."${decl.declaredName}".authorized` };
    }
    if (decl.home === USER_SCOPE) {
        return { block: decl.authorized, where: `secrets."${decl.declaredName}".authorized` };
    }
    if (decl.backend === "keyvault") {
        return {
            block: own(own(cfg.vaults, decl.vault), decl.secret),
            where: `vaults."${decl.vault}"."${decl.secret}"`,
        };
    }
    if (decl.kind === "oauth") {
        // tenantId is folded to the same lower case the merge canonicalises registrations keys to
        // (TENANT_ID_RE matches it case-insensitively, which is what licenses this). clientId is NOT
        // folded: it is validated only as a non-empty string, so its case may carry meaning a GUID's
        // cannot, and lower-casing it would destroy a distinction the declaration is allowed to make.
        const tenantId = decl.tenantId.toLowerCase();

        return {
            block: own(own(cfg.registrations, tenantId), decl.clientId),
            where: `registrations."${tenantId}"."${decl.clientId}"`,
        };
    }

    return null;
}

// Where the authorization for a reference lives, or null when none is needed. The condition is "the
// launchable and the declaration it consumes are not both yours": two user-home sides need nothing (you
// wrote both), and every other pairing goes through authorizationFor. A user-home launchable is NOT
// exempt on its own -- the merge lets a repository's declaration replace a user-scope one of the same
// name, so a server you approved can find that the secret behind `secret:pat` is now a Key Vault read the
// repository chose, paid for by your `az` login. It is authorized exactly as a project launchable would be
// (the `vaults` / `registrations` block names the consumer by kind and name; no separate block format).
// Shared by crossingProblem and doctorReport's crossing loop so that the two cannot disagree about
// which pairs are checked.
function crossingSource(cfg, launchable, decl, refName) {
    if (!launchable || !decl || (launchable.home === USER_SCOPE && decl.home === USER_SCOPE)) {
        return null;
    }
    // An oauth declaration already carries its own declaredName (stamped where cfg.oauth is built),
    // so re-stamping it here is a no-op rather than a correction -- unlike a secret's, which needs it
    // added because the secret merge does not stamp one. Kept as one uniform call rather than a
    // branch on the kind, since the two forms cannot produce different results.
    return authorizationFor(cfg, { ...decl, declaredName: refName });
}

// The ONE predicate that decides whether a crossing reference -- a launchable consuming a secret OR an
// oauth entry declared in a home other than its own (or by the repository, for a user-home launchable) --
// is authorized, and if not, what block would authorize it. Both resolveEnvEntries (which refuses an
// unauthorized launch) and doctorReport's crossing loop (which reports the same finding without launching
// anything) call this. Splitting it into two bodies is what let an oauth refusal drift out of doctor's
// report the first time, while the secret refusal stayed covered -- but a single predicate does not by
// itself stop that from recurring: restoring one kind filter inside the crossing loop reproduces the drift
// with this function untouched. What stops it is two tests in vc-secrets.test.mjs, not the shape of
// this function: "an authorization refusal names the doctor command, and doctor's own report
// names the same where", and "doctorReport: an oauth crossing is reported, and a
// launchable naming both kinds gets a line for each" -- restoring the kind filter reddens both.
// `refKind` defaults to "secret"; an oauth reference passes "oauth" explicitly.
function crossingProblem(cfg, kind, name, refName, refKind = "secret") {
    const launchable = own(cfg[kind], name);
    const decl = refKind === "oauth" ? own(cfg.oauth, refName) : own(cfg.secrets, refName);
    const source = crossingSource(cfg, launchable, decl, refName);
    if (source === null) {
        return null;
    }
    const actual = consumerShape(launchable);
    const authorized = own(own(source.block, kind), name);
    if (authorized === undefined) {
        return { actual, where: source.where, reason: "not authorized" };
    }
    const diffs = shapeDifferences(authorized, actual);

    return diffs === null
        ? null
        : { actual, where: source.where, reason: `authorized for a different shape: ${diffs.join("; ")}` };
}

// Servers and tasks are validated identically — same declaration shape, same env rules, same refusal
// of code-injection env keys. Kept as one function so a rule added for one kind cannot silently apply
// to only that one.
function validateLaunchables(label, map) {
    for (const [name, srv] of Object.entries(map)) {
        if (!LAUNCHABLE_NAME_RE.test(name)) {
            throw new VcSecretsError(`${label} "${name}": name must match ${LAUNCHABLE_NAME_RE.source}`);
        }
        if (!srv || typeof srv !== "object") {
            throw new VcSecretsError(`${label} "${name}": declaration must be an object`);
        }
        for (const key of Object.keys(srv)) {
            if (!SERVER_DECL_KEYS.includes(key)) {
                throw new VcSecretsError(`${label} "${name}": unknown key "${key}" (expected only ${SERVER_DECL_KEYS.join("/")})`);
            }
        }
        if (typeof srv.command !== "string" || !Array.isArray(srv.args) || typeof srv.env !== "object" || srv.env === null) {
            throw new VcSecretsError(`${label} "${name}": requires string "command", array "args", object "env"`);
        }
        if (srv.command.trim() === "") {
            throw new VcSecretsError(`${label} "${name}": "command" must not be empty`);
        }
        if (!srv.args.every((a) => typeof a === "string")) {
            throw new VcSecretsError(`${label} "${name}": every args element must be a string`);
        }
        // On Windows a .cmd/.bat shim is run through `cmd.exe /d /v:off /s /c "…"` with verbatim arguments, and
        // that line is built by wrapping each element in quotes. An embedded quote would close it and let
        // the rest be read as cmd syntax. Nothing legitimate needs one here, so it is refused at the
        // declaration rather than escaped at the seam.
        for (const value of [srv.command, ...srv.args]) {
            if (value.includes('"')) {
                throw new VcSecretsError(`${label} "${name}": a double quote in "command"/"args" is not allowed (it would break argument quoting on Windows)`);
            }
        }
        // Nothing legitimate needs a control character in a command or an env key, and both are printed --
        // by the trust review, by the refusal lines and by `doctor` -- where such a byte is a terminal
        // command rather than text (see forTerminal). Those surfaces neutralise what they print; refusing
        // here keeps such a declaration from being launchable at all. `args` is not refused: it is printed
        // as escaped JSON (jsonForTerminal), and a multi-line `sh -c` script is an ordinary argument.
        // The message does not echo the value, for the reason it is refused.
        if (CONTROL_CHAR_RE.test(srv.command)) {
            throw new VcSecretsError(`${label} "${name}": a control character in "command" is not allowed (nothing legitimate needs one, and the trust review, refusal lines and doctor all print it)`);
        }
        if (!Object.values(srv.env).every((v) => typeof v === "string")) {
            throw new VcSecretsError(`${label} "${name}": every env value must be a string`);
        }
        for (const [envKey, value] of Object.entries(srv.env)) {
            if (CONTROL_CHAR_RE.test(envKey)) {
                throw new VcSecretsError(`${label} "${name}": an env key with a control character is not allowed (nothing legitimate needs one, and the trust review, refusal lines and doctor all print it)`);
            }
            if (isDangerousEnvKey(envKey)) {
                throw new VcSecretsError(`${label} "${name}": env key "${envKey}" is not allowed (code-injection vector)`);
            }
            if (!REF_PREFIXES.some((prefix) => value.startsWith(prefix)) && parseLiteral(value) === null) {
                throw new VcSecretsError(`${label} "${name}": env ${envKey} must be "secret:<name>", "oauth:<name>" or "literal:<value>" -- an unprefixed value cannot be told apart from a pasted credential`);
            }
        }
    }
}

// A JSON.parse failure is the one error in these readers whose message carries FILE CONTENT. V8
// builds it out of a window of the source around the error position, in three shapes: a window with
// text elided on both sides, a window anchored at the start, and -- for an input short enough -- the
// whole text. Every file parsed through here is one a credential sits in: .mcp.json and
// settings.local.json carry env blocks, and the config file carries the secrets map. The messages
// reach `doctor`, whose output is what a developer pastes into an issue.
//
// So the reason is rebuilt from the part that is provably content-free -- the positional triple,
// which is digits -- rather than filtered out of V8's prose. A filter has to anticipate every shape
// V8 emits, including on Node versions this will run on but was never tested against, and the
// whole-text shape is what missing one costs. An allowlist of digits cannot leak a shape it has
// never met. Nothing becomes unavailable by this: the developer holds the file, and an editor or a
// `node -e` one-liner reports the detail there, where it does not travel.
function jsonSyntaxWhere(e) {
    return /at position \d+ \(line \d+ column \d+\)/.exec(e.message)?.[0] ?? "position not reported";
}

// For the readers that wrap the read and the parse in one try. An fs failure passes through: ENOENT,
// EACCES and EISDIR describe the file rather than its contents, and they ARE the diagnosis.
function readFailureReason(e) {
    return e instanceof SyntaxError ? `not valid JSON, ${jsonSyntaxWhere(e)}` : e.code ?? e.message;
}

function parseConfigFile(file, warnings) {
    let raw;
    let cfg;
    // The read and the parse are two failures wearing one label. Wrapped together, a config the
    // developer cannot READ -- wrong owner after an edit under sudo, a directory where a file is
    // expected, a broken symlink -- was announced as malformed JSON, and the remedy that implies is
    // to go fix the syntax of a file that is either perfectly valid or not a file at all. The code
    // is carried instead of the message here because EACCES and EISDIR ARE the diagnosis.
    try {
        raw = fs.readFileSync(file, "utf8");
    } catch (e) {
        throw new VcSecretsError(`config could not be read: ${file} (${e.code ?? e.message})`);
    }
    try {
        cfg = JSON.parse(raw);
    } catch (e) {
        throw new VcSecretsError(`config is not valid JSON: ${file} (${jsonSyntaxWhere(e)})`);
    }
    if (typeof cfg.schemaVersion === "number" && cfg.schemaVersion > SCHEMA_VERSION) {
        throw new VcSecretsError(`${file}: schemaVersion ${cfg.schemaVersion} needs a newer vc-secrets (this one speaks ${SCHEMA_VERSION}) -- update the plugin`);
    }
    cfg.secrets ??= {};
    cfg.servers ??= {};
    cfg.tasks ??= {};
    cfg.oauth ??= {};
    for (const key of ["secrets", "servers", "tasks", "oauth"]) {
        if (typeof cfg[key] !== "object" || cfg[key] === null || Array.isArray(cfg[key])) {
            throw new VcSecretsError(`${file}: "${key}" must be an object`);
        }
    }
    // An unknown key at the TOP level is a version skew, not a typo: the launcher and the
    // declarations now ship on separate clocks (plugin install vs git pull), so throwing here would
    // turn any forward-looking declaration into a total launch failure on older installs.
    // schemaVersion above reports real skew; inside declarations the check stays strict.
    for (const key of Object.keys(cfg)) {
        if (!TOP_LEVEL_KEYS.includes(key)) {
            warnings.push(`${file}: unknown key "${key}" ignored (this launcher speaks ${TOP_LEVEL_KEYS.join("/")})`);
        }
    }
    for (const [name, decl] of Object.entries(cfg.secrets)) {
        // The NAME was never validated here, only the declaration's values — and it reaches a keystore
        // key, a `security -s` argument, an env var, and two file paths. KEY_RE blocks the read and the
        // write, but `unlock` would still hand pinentry an arbitrary .gpg path, and `doctor` would still
        // try to decrypt one. Same charset REF_RE requires, so nothing legal is lost.
        if (!SECRET_NAME_RE.test(name)) {
            throw new VcSecretsError(`secret "${name}": name must match ${SECRET_NAME_RE.source}`);
        }
        if (!decl || typeof decl !== "object") {
            throw new VcSecretsError(`secret "${name}": declaration must be an object`);
        }
        for (const key of Object.keys(decl)) {
            if (!SECRET_DECL_KEYS.includes(key)) {
                throw new VcSecretsError(`secret "${name}": unknown key "${key}" (expected only ${SECRET_DECL_KEYS.join("/")})`);
            }
        }
        if (!BACKENDS.includes(decl.backend)) {
            throw new VcSecretsError(`secret "${name}": unknown backend "${decl.backend}" (expected ${BACKENDS.join("|")})`);
        }
        if (decl.format !== undefined && decl.format !== "json") {
            throw new VcSecretsError(`secret "${name}": unsupported format "${decl.format}" (only "json")`);
        }
        if (decl.backend === "keyvault" && (!decl.vault || !decl.secret)) {
            throw new VcSecretsError(`secret "${name}": keyvault backend requires "vault" and "secret"`);
        }
        // Both reach `az` as arguments, from a file the repository wrote, so the charset is Azure's own
        // rather than a blacklist. A `/` in the vault redirects az's request host: it builds
        // `https://{vault}{suffix}` from the string unvalidated and disables the challenge-domain check, so
        // the bearer token az minted goes wherever the name points. `%VAR%` is expanded by cmd.exe inside
        // the quotes of a .cmd shim on Windows (`az` is one), and a quote closes them -- see the quoting
        // note in validateLaunchables. The message does not echo the value: it is repository-controlled
        // text bound for a terminal.
        if (decl.backend === "keyvault") {
            const vaultOk = typeof decl.vault === "string" && KEYVAULT_VAULT_NAME_RE.test(decl.vault) && !decl.vault.includes("--");
            if (!vaultOk) {
                throw new VcSecretsError(`secret "${name}": "vault" is not a valid Azure Key Vault vault name `
                    + "(3-24 characters: letters, digits and hyphens; starts with a letter, ends with a letter or digit, no two hyphens in a row)");
            }
            if (typeof decl.secret !== "string" || !KEYVAULT_SECRET_NAME_RE.test(decl.secret)) {
                throw new VcSecretsError(`secret "${name}": "secret" is not a valid Azure Key Vault secret name `
                    + "(1-127 characters: letters, digits and hyphens)");
            }
        }
        validateAuthorized(`secret "${name}"`, decl.authorized);
    }
    for (const [name, decl] of Object.entries(cfg.oauth)) {
        // Same reasoning as the secret name check above: this reaches a keystore key
        // ("oauth-<name>-refresh"/"-access", see oauthEntryKeys) — the secret charset, not the
        // looser launchable one, which admits dots and capitals a keystore key cannot round-trip.
        if (!SECRET_NAME_RE.test(name)) {
            throw new VcSecretsError(`oauth "${name}": name must match ${SECRET_NAME_RE.source}`);
        }
        if (!decl || typeof decl !== "object") {
            throw new VcSecretsError(`oauth "${name}": declaration must be an object`);
        }
        for (const key of Object.keys(decl)) {
            if (!OAUTH_DECL_KEYS.includes(key)) {
                throw new VcSecretsError(`oauth "${name}": unknown key "${key}" (expected only ${OAUTH_DECL_KEYS.join("/")})`);
            }
        }
        // One operand, not two: the config comes from JSON.parse, and `test` coerces every value JSON
        // can produce — number, null, object, array — to a string that cannot match. A typeof guard
        // beside this one would look undeletable and decide nothing.
        if (!TENANT_ID_RE.test(decl.tenantId)) {
            throw new VcSecretsError(`oauth "${name}": tenantId must be a GUID matching ${TENANT_ID_RE.source}`);
        }
        if (typeof decl.clientId !== "string" || decl.clientId.trim() === "") {
            throw new VcSecretsError(`oauth "${name}": clientId must be a non-empty string`);
        }
        if (!Array.isArray(decl.scopes) || decl.scopes.length === 0 || !decl.scopes.every((s) => typeof s === "string" && s.trim() !== "")) {
            throw new VcSecretsError(`oauth "${name}": scopes must be a non-empty array of non-empty strings (a bare "/.default" still needs "offline_access" to refresh)`);
        }
        // Required, not optional: a preload that reads this to decide what to prime needs every input
        // before it acts. Left optional, a declaration missing it produces a preload that silently does
        // nothing and a session that loses its token at the one-hour boundary with nothing red anywhere.
        if (typeof decl.targetPackage !== "string" || !PACKAGE_NAME_RE.test(decl.targetPackage)) {
            throw new VcSecretsError(`oauth "${name}": targetPackage is required and must match ${PACKAGE_NAME_RE.source}`);
        }
        if (decl.binName !== undefined && (typeof decl.binName !== "string" || !BIN_NAME_RE.test(decl.binName))) {
            throw new VcSecretsError(`oauth "${name}": binName must match ${BIN_NAME_RE.source}`);
        }
        validateAuthorized(`oauth "${name}"`, decl.authorized);
    }
    validateLaunchables("server", cfg.servers);
    validateLaunchables("task", cfg.tasks);
    validateVaults(cfg.vaults);
    validateRegistrations(cfg.registrations);

    return cfg;
}

// Precedence local > project > user, mirroring settings.local.json over settings.json. Every entry
// keeps the scope it came from: that is what decides its keystore key, so losing it here would
// silently send a project secret to the user namespace.
const SCOPE_ORDER = [USER_SCOPE, "project", "local"];

// Precedence follows the client's own, documented for MCP servers as local, then project, then user —
// "the definition from the highest-precedence source" — and whole entries win, fields are never merged
// across scopes. Same names in several scopes are therefore normal, including across the user boundary:
// a tool living inside Claude Code that invented its own scope rules would be an exception every reader
// has to remember. What ambiguity that leaves is answered the way the client answers it — by showing the
// effective set: every collision is reported by `doctor` with the home that won.
function loadConfig(paths = configPaths()) {
    const warnings = [];
    // Null-prototype: a declaration named `__proto__` would otherwise assign the prototype instead of an
    // entry, so the name would vanish from the map with no error and no diagnostic.
    const secrets = Object.create(null);
    const servers = Object.create(null);
    const tasks = Object.create(null);
    const oauth = Object.create(null);
    const collisions = [];
    const files = {};
    let projectId = null;
    let projectIdFrom = null;

    // Two scopes can point at the same file — the test override does it deliberately, an aliased home
    // does it in the wild. Compared by realpath rather than by string: read twice, one file becomes two
    // homes, so its entries are attributed to the wrong scope (and a secret to the wrong keystore
    // namespace) and every name in it collides with itself.
    const seen = new Set();
    let vaults = Object.create(null);
    let registrations = Object.create(null);
    for (const scope of SCOPE_ORDER) {
        const file = paths[scope];
        if (!file || !pathPresent(file, `the declaration "${file}"`)) {
            continue;
        }
        const realFile = canonicalPath(file);
        if (seen.has(realFile)) {
            continue;
        }
        seen.add(realFile);
        files[scope] = file;
        let cfg;
        try {
            cfg = parseConfigFile(file, warnings);
        } catch (e) {
            throw e instanceof VcSecretsError && !e.message.startsWith(file) ? new VcSecretsError(`${file}: ${e.message}`, e.exitCode) : e;
        }
        if (cfg.projectId !== undefined) {
            if (typeof cfg.projectId !== "string" || !SECRET_NAME_RE.test(cfg.projectId)) {
                throw new VcSecretsError(`${file}: projectId must match ${SECRET_NAME_RE.source}`);
            }
            // "user" is the user scope's own namespace segment. A project claiming it would read and
            // overwrite personal secrets under keys indistinguishable from theirs.
            if (cfg.projectId === USER_SCOPE) {
                throw new VcSecretsError(`${file}: projectId "${USER_SCOPE}" is reserved for the user scope -- pick another`);
            }
            if (scope === USER_SCOPE) {
                warnings.push(`${file}: projectId is meaningless at user scope -- ignored`);
            } else if (projectId !== null && projectId !== cfg.projectId) {
                throw new VcSecretsError(`projectId disagrees: "${projectId}" in ${projectIdFrom}, "${cfg.projectId}" in ${file} -- they key the same secrets, so one of them is wrong`);
            } else {
                projectId = cfg.projectId;
                projectIdFrom = file;
            }
        }
        if (cfg.vaults !== undefined) {
            if (scope === USER_SCOPE) {
                vaults = cfg.vaults;
            } else {
                // A repository authorizing the vault reads it asks for would be the grant written by the
                // party requesting it. The same rule governs `registrations` and `authorized` below.
                warnings.push(`${file}: "vaults" only authorizes at user scope -- ignored`);
            }
        }
        if (cfg.registrations !== undefined) {
            if (scope === USER_SCOPE) {
                // Canonicalise the tenant key to lower case, matching the lookup in authorizationFor —
                // otherwise a declaration and a grant spelling the same GUID in different case fail to
                // match, and the failure is invisible: authorizationFor's `where` pointer prints the
                // declaration's own casing, so the key it tells the user to add looks identical to the
                // one already in their file. validateRegistrations has already refused two tenant keys
                // that differ only by case, so this cannot silently drop a grant.
                registrations = Object.create(null);
                for (const [tenantId, clients] of Object.entries(cfg.registrations)) {
                    registrations[tenantId.toLowerCase()] = clients;
                }
            } else {
                // Same rule as `vaults` above, applied to the app registration this names.
                warnings.push(`${file}: "registrations" only authorizes at user scope -- ignored`);
            }
        }
        for (const [name, decl] of Object.entries(cfg.secrets)) {
            if (secrets[name]) {
                collisions.push({ kind: "secret", name, from: secrets[name].home, to: scope });
            }
            // `scope` is the keystore namespace (local shares the project's); `home` is which file
            // declared it. They differ for a local declaration, which is what keyFor and the crossing
            // report each need to read.
            if (decl.authorized !== undefined && scope !== USER_SCOPE) {
                // Same rule as `vaults` above: the block's point is that its author owns the secret, so a
                // project authorizing its own access writes the very grant it is meant to require.
                warnings.push(`${file}: secret "${name}": "authorized" only authorizes at user scope -- ignored`);
            }
            secrets[name] = { ...decl, scope: scope === "local" ? "project" : scope, home: scope };
        }
        for (const [name, srv] of Object.entries(cfg.servers)) {
            if (servers[name]) {
                collisions.push({ kind: "server", name, from: servers[name].home, to: scope });
            }
            servers[name] = { ...srv, scope, home: scope };
        }
        for (const [name, task] of Object.entries(cfg.tasks)) {
            if (tasks[name]) {
                collisions.push({ kind: "task", name, from: tasks[name].home, to: scope });
            }
            tasks[name] = { ...task, scope, home: scope };
        }
        for (const [name, decl] of Object.entries(cfg.oauth)) {
            if (oauth[name]) {
                collisions.push({ kind: "oauth", name, from: oauth[name].home, to: scope });
            }
            if (decl.authorized !== undefined && scope !== USER_SCOPE) {
                // Same rule the secret merge states: authorizationFor honours the block only at user
                // scope, so accepting one here in silence leaves a grant that reads as effective and
                // is not.
                warnings.push(`${file}: oauth "${name}": "authorized" only authorizes at user scope -- ignored`);
            }
            // `declaredName` is stamped here (unlike the secret merge above) because authorizationFor
            // needs the name to build its `where` pointer, and unlike secrets there is no ad-hoc call
            // site that already adds it.
            oauth[name] = { ...decl, kind: "oauth", scope: scope === "local" ? "project" : scope, home: scope, declaredName: name };
        }
    }

    if (Object.keys(files).length === 0) {
        throw new VcSecretsError(`no declaration file found -- looked for ${[paths.user, paths.project, paths.local].filter(Boolean).join(", ")}`);
    }
    // Demanded whenever a project-scope secret or oauth declaration exists at all, including Key Vault
    // secrets that do not touch the keystore: a rule that only bites once someone adds a local-backend
    // declaration would fail late, in a repo that had been working. For oauth specifically: without
    // projectId, keyFor's fallback stringifies a missing projectId into the literal segment "null" —
    // four characters that all satisfy SECRET_NAME_RE — so the refresh/access tokens would land in a
    // namespace shared by every project on the machine that also omits it, with no guard, test, or log
    // line noticing.
    if (projectId === null
        && (Object.values(secrets).some((d) => d.scope === "project") || Object.values(oauth).some((d) => d.scope === "project"))) {
        throw new VcSecretsError(`a project-scope secret or oauth declaration is declared but projectId is not -- add "projectId" to ${files.project ?? files.local} (it namespaces the keystore entries, so it cannot be derived)`);
    }

    // A project-declared server MAY reference a user-scope secret: one personal PAT used from several
    // repos is the ordinary case, and forbidding it would force a copy of that credential into every
    // project's namespace — three copies to rotate instead of one, which is worse than what the ban
    // bought. What replaces the ban is visibility: `doctor` reports each crossing, so it is a fact the
    // developer can see rather than one nobody mentions.

    // Where a trust record for this repository is keyed. Hand-built `paths` (a test's, mostly) carry no
    // `root`, so it falls back to the `.claude/` layout configPaths produces -- declarations sit one
    // directory below the root -- which keeps both routes landing on the same key for the same files in
    // that layout. It does not hold for the VC_SECRETS_CONFIG_DIR layout: there configPaths's root is
    // the directory itself, and the fallback would give its parent. That route always carries `root`.
    const declaredFile = paths.project ?? paths.local;
    const root = paths.root ?? (declaredFile ? path.dirname(path.dirname(declaredFile)) : null);
    const projectRoot = root ? trustRootKey(root) : null;

    return { secrets, servers, tasks, oauth, vaults, registrations, projectId, projectRoot, collisions, warnings, files };
}

// The scope half of a keystore key. Project and local declarations share one namespace on purpose —
// they are the same project, so a locally declared server may use the project's secrets.
//
// Everything that has to agree with keyFor about which entries are the same project's calls this:
// the token lock and the renewal channel both serialise on it, and a second spelling that drifts
// serialises against nothing while each copy still reads as correct.
function scopeKeyFor(decl, cfg) {
    return decl.scope === USER_SCOPE ? USER_SCOPE : cfg.projectId;
}

// The keystore key.
function keyFor(name, decl, cfg) {
    return `${KEY_PREFIX}:${scopeKeyFor(decl, cfg)}:${name}`;
}

// The two variable segments back out again. One parse rather than one per reader: the same key is
// taken apart for a secret's path, for its oversize-marker path and for the messages a developer
// reads, and separate spellings of one grammar can disagree about a key neither of them validated
// while each still looks right where it stands.
function keyParts(key) {
    const [, scope, name] = key.split(":");

    return { scope, name };
}

// The bare name, for messages only: mapResolveError and the "treating as absent" notice read as
// advice about a keystore entry, not about a three-segment internal key. Not called entryName --
// oauthLaunchDeps already binds that to the oauth entry ("ado-dev"), where this yields the key's
// last segment ("oauth-ado-dev-refresh"); two values a message must not confuse.
function nameFromKey(key) {
    return keyParts(key).name;
}

function oauthEntryKeys(name, decl, cfg) {
    return {
        refresh: keyFor(`oauth-${name}-refresh`, decl, cfg),
        access: keyFor(`oauth-${name}-access`, decl, cfg),
    };
}

function oauthKeyClashes(cfg) {
    const secretKeys = new Map();
    for (const [secretName, decl] of Object.entries(cfg.secrets)) {
        // Only a local secret has a keystore slot: cmdSet refuses others, cmdMigrate and unlockTargets skip them.
        if (decl.backend !== "local") {
            continue;
        }
        secretKeys.set(keyFor(secretName, decl, cfg), secretName);
    }
    const clashes = [];
    for (const [name, decl] of Object.entries(cfg.oauth ?? {})) {
        for (const [role, key] of Object.entries(oauthEntryKeys(name, decl, cfg))) {
            const secretName = secretKeys.get(key);
            if (secretName !== undefined) {
                clashes.push(`oauth "${name}" ${role} entry and secret "${secretName}" resolve to the `
                    + `same keystore key ${key} -- one overwrites the other`);
            }
        }
    }

    return clashes;
}

// The remedy is appended unconditionally, for both kinds: doctor's crossing loop reports an oauth
// reference exactly as it reports a secret's (crossingProblem is the one predicate behind both), so
// every refusal this constructs can truthfully send the reader to "vc-secrets doctor" for the block
// to paste. Enforced by "an authorization refusal names the doctor command, and doctor's own
// report names the same where" in vc-secrets.test.mjs.
function authorizationRefusal(envVar, kind, refName, { reason, where }) {
    return new VcSecretsError(`env ${envVar}: this ${kind === "tasks" ? "task" : "server"} is `
        + `${reason} to receive "${refName}" -- the authorization for it lives at `
        + `${where} in ${CONFIG_HINT_PATH}${DOCTOR_REMEDY}`);
}

// Unconditional for the reason stated above authorizationRefusal.
const DOCTOR_REMEDY = '; run "vc-secrets doctor" for the block to add';

// --- Repository trust ---------------------------------------------------------------------------
//
// What `authorized` cannot cover: it guards a secret CROSSING, so a repository declaration that names
// no secret is never checked -- and the client only ever approved `node "$VC_SECRETS" run gh`, one
// level above the declaration that decides what `gh` runs. Any repository opened could therefore make an
// entry approved once (usually at user scope) run its own command, unprompted. A launchable whose
// winning entry sits in a project or local file is refused until the person has read its argv and env and
// said so; what they said is recorded here, per repository, and compared at every launch.
//
// `local` is gated with `project`. The two differ by whether git tracks the file, and telling them apart
// would mean running git inside the very repository that has not been trusted yet.
// secrets/oauth/vaults declarations are not gated as such: they execute nothing. What guards them is the
// authorization a CONSUMER needs to receive one (crossingProblem) -- the `vaults` / `registrations` /
// `authorized` block in the user file -- and `doctor` reads a repository's Key Vault secret only for a
// consumer that has passed both this gate and that authorization.
//
// One exception is gated on top of that authorization: a user-scope launchable, which is the person's own
// and so needs no trust of its own, that reads a repository-declared `local` secret or oauth entry. Those
// keystore entries are keyed by the repository's projectId (keyFor), and a repository can claim any id --
// including another project's, whose entries the launch would then read, and for an oauth entry exchange
// and rewrite. The trust record is keyed by the repository ROOT, which it cannot claim, and pins the id,
// so the launch requires a record for this root whose projectId is the one in play. The `local`-backend
// exemption in authorizationFor is unaffected: that is about authorization, this is about the checkout.

const TRUST_FILE_NAME = "trust.json";
const TRUST_SCHEMA_VERSION = 1;

// The keys a record's maps are found under are the `kind` values cmdLaunch and doctor already pass
// around, so a lookup needs no translation between them.
const LAUNCHABLE_KINDS = ["servers", "tasks"];

// The trust file sits beside the keystore's `secrets` directory, the way the oversize markers' `state`
// directory does, so one config base holds everything this tool keeps on the machine.
function trustFilePath(env = process.env) {
    return path.join(path.dirname(secretsDir(env)), TRUST_FILE_NAME);
}

// The most links followed while resolving a path that no longer exists: of the order of the kernels' own
// limits on a symlink chain (ELOOP -- 40 on Linux, fewer on macOS), since a loop of dangling ones must end.
const MAX_LINK_HOPS = 40;

// The key a repository is recorded under. realpath, so a symlinked checkout and its target are one
// repository; lower-cased on win32, whose file system is case-insensitive and would otherwise record the
// same directory twice under two spellings of it. `platform`, `realpath`, `lstat` and `readlink` are seams
// because none of it can be exercised on another platform's machine otherwise.
//
// `untrust <path>` must still find a record for a checkout that has since been deleted, and a record made
// through a link is keyed by the target. realpath fails once the path is gone, and resolving the plain
// string would key `/link/repo` where the record says `/real/repo`. So when realpath fails:
//   - the NEAREST EXISTING ANCESTOR is resolved and the missing tail joined onto it, which covers a link
//     above the part that was deleted (`/link -> /real`, `/real/repo` gone);
//   - and a component that is itself a DANGLING link is followed before climbing past it: it is read with
//     readlink, its target resolved against the link's own directory as the kernel sees it (realpath'd,
//     so a `..` in the target crosses a linked parent the way the kernel would), and the whole
//     computation restarted on `target + remaining tail`. That covers a link that IS the checkout (`~/work/repo -> /data/repo`, the
//     target deleted, so the link dangles) and one with a tail beyond it.
// At most MAX_LINK_HOPS links are followed. Where nothing resolves -- no ancestor, a loop, or a chain longer
// than that -- the plain resolve is the answer, as in canonicalPath.
function trustRootKey(root, { platform = process.platform, realpath = fs.realpathSync.native,
    lstat = fs.lstatSync, readlink = fs.readlinkSync } = {}) {
    const P = platform === "win32" ? path.win32 : path.posix;
    const resolveMissing = (start) => {
        let current = start;
        for (let hops = 0; hops <= MAX_LINK_HOPS; hops += 1) {
            const tail = [];
            let followed = null;
            for (let ancestor = current; followed === null;) {
                try {
                    return P.join(realpath(ancestor), ...tail);
                } catch { /* gone: a dangling link, or a plain absence */ }
                let target = null;
                try {
                    if (lstat(ancestor).isSymbolicLink()) {
                        target = readlink(ancestor);
                    }
                } catch { /* not a link, or unreadable: climb */ }
                if (target !== null) {
                    // Against the link's PHYSICAL directory, as the kernel resolves it: `..` in a relative
                    // target applies after any link in the parent path, so a lexical resolve would climb out
                    // of the wrong directory. The parent exists -- lstat just read the link inside it.
                    let base = P.dirname(ancestor);
                    try {
                        base = realpath(base);
                    } catch { /* unreadable parent: the lexical path is the best left */ }
                    followed = P.join(P.resolve(base, target), ...tail);
                    break;
                }
                const parent = P.dirname(ancestor);
                if (parent === ancestor) {
                    return undefined;
                }
                tail.unshift(P.basename(ancestor));
                ancestor = parent;
            }
            current = followed;
        }

        return undefined;
    };
    let canonical;
    try {
        canonical = realpath(root);
    } catch {
        canonical = resolveMissing(P.resolve(root)) ?? P.resolve(root);
    }

    return platform === "win32" ? canonical.toLowerCase() : canonical;
}

// How much of a declared string a trust refusal line shows (trustDifferences, envDifferences) -- they reach
// fail() and a client's log. forTerminal's default of 200 would cut an ordinary command line short; where
// a cut remains it ends in "..." so it reads as one. The interactive review is NOT limited by this: it is
// what a person approves, and they must not approve an argv or a literal whose tail they never saw, so it
// escapes without truncating. Neither is shapeDifferences, for the same reason: its lines are what a
// person reads to decide an authorization.
const TRUST_TEXT_LIMIT = 4096;

// The declared values, not the resolved ones: trust is about what the repository asks to run, and an
// env value resolves to a secret nobody may see. Built from SERVER_DECL_KEYS so that a key the schema
// gains later is recorded and compared without anyone remembering to touch this.
function launchShape(entry) {
    const shape = {};
    for (const key of SERVER_DECL_KEYS) {
        shape[key] = structuredClone(entry[key]);
    }

    return shape;
}

function plainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Env keys and how each differs. The VALUE is never printed: these lines reach fail() and `doctor`,
// whose output travels into a client's logs and into pasted issues, and a literal is exactly the kind of
// text that turns out to be a pasted credential. The interactive review in cmdTrust is the one surface
// that shows a literal, because it is what the person approves. The key is declared text, so it goes
// through forTerminal like everything else that reaches a terminal from a declaration.
function envDifferences(trusted, actual) {
    const before = plainObject(trusted) ? trusted : {};
    const after = plainObject(actual) ? actual : {};
    const diffs = [];
    for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
        const shown = forTerminal(key, TRUST_TEXT_LIMIT);
        if (!Object.hasOwn(before, key)) {
            diffs.push(`env ${shown} added`);
        } else if (!Object.hasOwn(after, key)) {
            diffs.push(`env ${shown} removed`);
        } else if (before[key] !== after[key]) {
            diffs.push(`env ${shown} changed`);
        }
    }

    return diffs;
}

// The differences between a recorded shape and the one declared now, in the words shapeDifferences
// uses; an empty list when they agree. `command` names both sides because the reader has to decide
// whether the new one is acceptable; `args` and any key the schema adds say only that they changed,
// since a changed argv is read in the declaration itself, where the whole of it is visible.
function trustDifferences(trusted, actual) {
    const diffs = [];
    for (const key of SERVER_DECL_KEYS) {
        if (key === "command") {
            if (trusted.command !== actual.command) {
                diffs.push(`command is ${forTerminal(JSON.stringify(actual.command), TRUST_TEXT_LIMIT)}, `
                    + `trusted ${forTerminal(JSON.stringify(trusted.command), TRUST_TEXT_LIMIT)}`);
            }
        } else if (key === "env") {
            diffs.push(...envDifferences(trusted.env, actual.env));
        } else if (JSON.stringify(trusted[key]) !== JSON.stringify(actual[key])) {
            diffs.push(`${key} changed`);
        }
    }

    return diffs;
}

// Whether a declaration stores its value in the keystore namespace a repository chose: a `local` secret or
// an oauth entry whose winning declaration is not the person's own. `kind` is the reference kind ("secret"
// or "oauth"). The one definition behind every question about that namespace -- who reads it
// (namespaceReads), what it holds (namespaceDeclarations), and the verbs that write or remove an entry.
function isNamespaceDecl(kind, decl) {
    return decl !== undefined && decl.home !== USER_SCOPE && (kind === "oauth" || decl.backend === "local");
}

// What a user-scope launchable reads out of the namespace a repository chose: every `secret:` reference
// whose winning declaration is a repository's `local` one, and every `oauth:` reference whose entry is a
// repository's. Both are keyed by `cfg.projectId` (keyFor), and that id is the repository's own claim --
// nothing stops it naming another project's. A declaration in the LOCAL file counts like a project one:
// the launcher cannot tell a tracked file from an untracked one without running git in the very
// repository that is not trusted yet. A Key Vault secret is not here: it does not touch the keystore, and
// the `vaults` grant keyed by vault and secret name already decides it.
function namespaceReads(cfg, launchable) {
    const found = [];
    const seen = new Set();
    for (const value of Object.values(launchable?.env ?? {})) {
        let ref = null;
        try {
            ref = parseReference(value);
        } catch { /* a malformed reference is reported where it is validated */ }
        if (ref === null) {
            continue;
        }
        const decl = ref.kind === "oauth" ? own(cfg.oauth, ref.name) : own(cfg.secrets, ref.name);
        if (isNamespaceDecl(ref.kind, decl) && !seen.has(`${ref.kind}:${ref.name}`)) {
            seen.add(`${ref.kind}:${ref.name}`);
            found.push({ kind: ref.kind, name: ref.name });
        }
    }

    return found;
}

// Everything the repository declares into that namespace, whether or not a launchable reads it: the
// entries `set`, `login` and `logout` write or remove and `doctor` would read. A repository that declares
// any is recorded by `trust` for its projectId, because the verbs that store an entry need that record
// (namespaceTrustProblem) and nothing else would ever ask the person for it.
function namespaceDeclarations(cfg) {
    const found = [];
    for (const [name, decl] of Object.entries(cfg.secrets ?? {})) {
        if (isNamespaceDecl("secret", decl)) {
            found.push({ kind: "secret", name });
        }
    }
    for (const [name, decl] of Object.entries(cfg.oauth ?? {})) {
        if (isNamespaceDecl("oauth", decl)) {
            found.push({ kind: "oauth", name });
        }
    }

    return found;
}

// The ONE predicate for whether a launch needs this checkout's trust, and why; null when it does not.
// Tagged, because the two reasons are recorded and shown differently:
//   repository -- the winning entry is a repository's: it decides what runs, so its shape is recorded.
//   namespace  -- the entry is the person's own, but it reads a keystore namespace the repository chose
//                 (namespaceReads). What it runs is not in question; which project's secrets it is handed
//                 is, and that rests on the repository's projectId. Trust is what pins that id, and the
//                 record is keyed by the repository ROOT, which a repository cannot claim.
// cmdLaunch, trustAssessment, trustNotes and cmdTrust all ask this, so they cannot disagree on what is gated.
function trustGateOf(cfg, launchable) {
    if (launchable.home !== USER_SCOPE) {
        return { via: "repository" };
    }
    const reads = namespaceReads(cfg, launchable);

    return reads.length === 0 ? null : { via: "namespace", reads };
}

// Every launchable the gate applies to, each carrying its trustGateOf tag.
function gatedLaunchables(cfg) {
    const found = [];
    for (const kind of LAUNCHABLE_KINDS) {
        for (const [name, launchable] of Object.entries(cfg[kind] ?? {})) {
            const gate = trustGateOf(cfg, launchable);
            if (gate !== null) {
                found.push({ kind, name, launchable, ...gate });
            }
        }
    }

    return found;
}

// Whether the winning entry replaced one from the user file. A chain user -> project -> local records
// two collisions, and either one starting at the user scope is enough: the name is one the person's own
// file declared.
function shadowsUserScope(cfg, kind, name) {
    const singular = kind === "tasks" ? "task" : "server";

    return (cfg.collisions ?? []).some((c) => c.kind === singular && c.name === name && c.from === USER_SCOPE);
}

// The projectId half of a record, shared by both kinds of gate: it decides which project's namespace a
// project-scope `secret:<name>` of a trusted entry resolves in (a user-scope one resolves under `user`,
// whatever the id): a change of it alone would point a trusted server at another project's secrets.
// A record without the field differs from every config, null included. An absent field is said to be
// absent: rendered as null it would read as a recorded "no projectId" and produce "projectId is null,
// trusted null" for a record that predates the field.
function projectIdDifference(repository, cfg) {
    if (repository.projectId === cfg.projectId) {
        return null;
    }
    const trustedId = repository.projectId === undefined ? "(not recorded)" : JSON.stringify(repository.projectId);

    return `projectId is ${JSON.stringify(cfg.projectId ?? null)}, trusted ${trustedId}`;
}

// Whether this checkout may use the keystore namespace its projectId names: a trust record for THIS root
// whose projectId is the one in play. The id is the repository's own claim -- another project's included --
// and the record is keyed by the root, which a repository cannot claim, so the record is what pins it.
// `reads` is carried into the problem to name what put the namespace in play: the references a user-scope
// launchable reads (trustProblem), or the one entry a verb stores or removes (requireNamespaceTrust).
// Null when trusted. Pure, as trustProblem is: the state is handed in.
function namespaceTrustProblem(cfg, state, reads) {
    const repository = own(state.repositories, cfg.projectRoot);
    if (repository === undefined) {
        return { reason: "untrusted", reads };
    }
    const difference = projectIdDifference(repository, cfg);

    return difference === null ? null : { reason: "changed", differences: [difference], reads };
}

// The ONE predicate behind the launch gate, `doctor` and `emit-config`. Pure: the state is handed in,
// so a caller reads the file only once it knows a gated launchable exists.
//
// `shadowsUser` is reported because it is the case a person is least able to see: the approved name is
// theirs, the file that now decides what it runs is not.
//
// A user-scope launchable that reads a repository's namespace (trustGateOf) is held to the record's
// projectId alone: there is no shape to compare, since the person wrote the entry. The problem carries
// the `reads` that put it under the gate, which is what tells the refusal wording apart from a
// repository launchable's.
function trustProblem(cfg, kind, name, state) {
    const launchable = own(cfg[kind], name);
    if (launchable === undefined) {
        return null;
    }
    const gate = trustGateOf(cfg, launchable);
    if (gate === null) {
        return null;
    }
    if (gate.via === "namespace") {
        const problem = namespaceTrustProblem(cfg, state, gate.reads);

        return problem === null ? null : { ...problem, home: launchable.home, shadowsUser: false };
    }
    const repository = own(state.repositories, cfg.projectRoot);
    const shadowsUser = shadowsUserScope(cfg, kind, name);
    const recorded = own(own(repository, kind), name);
    if (recorded === undefined) {
        return { reason: "untrusted", home: launchable.home, shadowsUser };
    }
    const differences = trustDifferences(recorded, launchShape(launchable));
    const difference = projectIdDifference(repository, cfg);
    if (difference !== null) {
        differences.unshift(difference);
    }

    return differences.length === 0 ? null : { reason: "changed", differences, home: launchable.home, shadowsUser };
}

// A path is context, not approved content, so it stays readable -- but it is a directory name somebody
// chose, and one carrying ESC or CR would rewrite the line it sits on. Escaped without truncating.
const pathForTerminal = (value) => forTerminal(value, Infinity);

// `secret "pat", oauth "ado"` -- the references a user-scope launchable reads from a repository's namespace.
function namespaceReadsText(reads) {
    return reads.map((r) => `${r.kind} "${r.name}"`).join(", ");
}

// Carries the root because the verb acts on the CURRENT directory's repository, and this text is read
// out of a client's log where the current directory is not the reader's.
function trustRemedy(problem, cfg) {
    return `review it, then run "vc-secrets trust"${problem.reason === "changed" ? " again" : ""} in ${pathForTerminal(cfg.projectRoot)}`;
}

// A single line: it travels through fail() and doctor, and the probe classifies a launcher refusal by
// its last line.
function trustRefusal(kind, name, problem, cfg) {
    const label = `${kind === "tasks" ? "task" : "server"} "${name}"`;
    if (problem.reads !== undefined) {
        // A user-scope launchable: it is the person's own, so nothing is said about a declaring file --
        // what the repository decides is the namespace its secrets are read from.
        return `${label} (user) reads ${namespaceReadsText(problem.reads)} from namespace ${JSON.stringify(cfg.projectId)}, `
            + (problem.reason === "changed"
                ? `and the projectId changed since you trusted this checkout: ${problem.differences.join("; ")}`
                : "which this repository declares, and this checkout is not trusted")
            + ` -- ${trustRemedy(problem, cfg)}`;
    }
    if (problem.reason === "changed") {
        return `${label} changed since you trusted it: ${problem.differences.join("; ")} -- ${trustRemedy(problem, cfg)}`;
    }
    const file = pathForTerminal(cfg.files?.[problem.home] ?? problem.home);
    const shadow = problem.shadowsUser ? ` (it shadows your user-scope "${name}")` : "";

    return `${label} is declared by ${file}${shadow} and is not trusted -- ${trustRemedy(problem, cfg)}`;
}

// The refusal of a verb that stores or removes an entry in a repository's namespace (`set`, `login`,
// `logout`), from namespaceTrustProblem's answer for that one entry. One line, for the reasons
// trustRefusal's is, and it names the trust remedy only: the probe reads a "vc-secrets login" in a
// launcher refusal as a sign-in problem, and this is not one.
function namespaceStoreRefusal(problem, cfg) {
    return `${namespaceReadsText(problem.reads)} is stored in namespace ${JSON.stringify(cfg.projectId)}, `
        + (problem.reason === "changed"
            ? `and the projectId changed since you trusted this checkout: ${problem.differences.join("; ")}`
            : "which this repository declares, and this checkout is not trusted")
        + ` -- ${trustRemedy(problem, cfg)}`;
}

// The gate `set`, `login` and `logout` stand behind for a target the repository declared: before any
// keystore access, sign-in or prompt for a value. The key they write or delete is
// `vc-secrets:<projectId>:<name>`, and a repository chooses that projectId -- Y can claim X's, and the
// person's `set` would then overwrite X's secret, their `login` replace X's sign-in, their `logout` delete
// it. The same predicate as the launch's (namespaceTrustProblem). A person's own declaration is stored
// under `user`, whatever any repository claims, so it never depends on the trust file -- an unreadable one
// cannot stop the person managing what they wrote. `trustState`: the seam for a test; the file otherwise.
function requireNamespaceTrust(cfg, kind, name, trustState = null) {
    const decl = kind === "oauth" ? own(cfg.oauth, name) : own(cfg.secrets, name);
    if (!isNamespaceDecl(kind, decl)) {
        return;
    }
    const problem = namespaceTrustProblem(cfg, trustState ?? readTrustState(process.env), [{ kind, name }]);
    if (problem !== null) {
        throw new VcSecretsError(namespaceStoreRefusal(problem, cfg));
    }
}

function emptyTrustState() {
    return { schemaVersion: TRUST_SCHEMA_VERSION, repositories: {} };
}

// Why a parsed document is not a trust state, or null. Every level a lookup passes through is checked,
// because a hand-edited file that fails halfway would otherwise surface as a TypeError from deep inside
// a launch.
function trustStateProblem(doc) {
    if (!plainObject(doc)) {
        return "not an object";
    }
    if (doc.schemaVersion !== TRUST_SCHEMA_VERSION) {
        return `schemaVersion is ${JSON.stringify(doc.schemaVersion)}, this vc-secrets speaks ${TRUST_SCHEMA_VERSION}`;
    }
    if (!plainObject(doc.repositories)) {
        return '"repositories" is not an object';
    }
    for (const [root, record] of Object.entries(doc.repositories)) {
        if (!plainObject(record) || typeof record.trustedAt !== "string") {
            return `the record for ${root} is malformed`;
        }
        // Absent is allowed and reads as a different projectId (trustProblem), so a record from before the
        // field existed refuses its launches one by one instead of making the whole file unusable.
        if (record.projectId !== undefined && record.projectId !== null && typeof record.projectId !== "string") {
            return `the record for ${root} has a malformed "projectId"`;
        }
        for (const kind of LAUNCHABLE_KINDS) {
            if (!plainObject(record[kind]) || !Object.values(record[kind]).every(plainObject)) {
                return `the record for ${root} has a malformed "${kind}"`;
            }
        }
    }

    return null;
}

// A missing file is an empty state: nothing is trusted yet. Anything else that keeps the file from
// being read as one THROWS instead -- a corrupt file that read as empty would silently un-trust every
// repository, and one that read as trusted would be the gate failing open.
function readTrustState(env = process.env) {
    const file = trustFilePath(env);
    let doc;
    try {
        doc = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
        if (isAbsentPathError(e)) {
            return emptyTrustState();
        }
        throw new VcSecretsError(`the trust file ${file} could not be read (${readFailureReason(e)}) -- fix or delete it, `
            + "then run \"vc-secrets trust\" again in each repository; until then repository declarations are refused");
    }
    const problem = trustStateProblem(doc);
    if (problem !== null) {
        throw new VcSecretsError(`the trust file ${file} is unusable (${problem}) -- fix or delete it, `
            + "then run \"vc-secrets trust\" again in each repository; until then repository declarations are refused");
    }

    return doc;
}

// Atomic for the reason writeLocalValue's gpg branch is: a launch reading while `trust` writes must see
// the old file or the new one, never half of either.
function writeTrustState(env, state) {
    const file = trustFilePath(env);
    const tmp = `${file}.${process.pid}.tmp`;
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
        fs.renameSync(tmp, file);
    } catch (e) {
        try {
            fs.rmSync(tmp, { force: true });
        } catch { /* best-effort cleanup -- the original error is what matters */ }
        throw new VcSecretsError(`the trust file ${file} could not be written (${e.code ?? e.message})`);
    }
}

// What doctor and emit-config need to know about every gated launchable, computed once: the problem
// it would meet at launch, keyed by "<kind>/<name>". The file is read only when a gated launchable
// exists. An unreadable one is `unreadable` -- reported once, as itself -- and every gated launchable
// then counts as refused, because that is what a launch would do.
function trustAssessment(cfg, readState = () => readTrustState(process.env)) {
    const gated = gatedLaunchables(cfg);
    const problems = new Map();
    const findings = [];
    if (gated.length === 0) {
        return { problems, findings, unreadable: null };
    }
    let state;
    try {
        state = readState();
    } catch (e) {
        for (const { kind, name } of gated) {
            problems.set(`${kind}/${name}`, null);
        }

        return { problems, findings: [e.message], unreadable: e.message };
    }
    for (const { kind, name } of gated) {
        const problem = trustProblem(cfg, kind, name, state);
        if (problem !== null) {
            problems.set(`${kind}/${name}`, problem);
            findings.push(trustRefusal(kind, name, problem, cfg));
        }
    }

    return { problems, findings, unreadable: null };
}

// emit-config still emits every server -- the entry is only a call to the launcher -- and says, on the
// stream that is not pasted, which of them the launcher will refuse until trusted.
function trustNotes(cfg, { problems, unreadable }) {
    const notes = unreadable === null ? [] : [unreadable];
    for (const { kind, name } of gatedLaunchables(cfg)) {
        const problem = problems.get(`${kind}/${name}`);
        if (kind !== "servers" || !problem) {
            continue;
        }
        if (problem.reads !== undefined) {
            // The references and the namespace are named in both: the note is read on its own, away from the
            // refusal, and "a namespace" does not say which one is in question. A changed id carries both
            // ids, as the refusal does.
            const from = `reads ${namespaceReadsText(problem.reads)} from namespace ${JSON.stringify(cfg.projectId)}`;
            notes.push(problem.reason === "changed"
                ? `${name}: ${from}, and the projectId changed since you trusted this checkout: ${problem.differences.join("; ")} -- run "vc-secrets trust" again before starting it`
                : `${name}: ${from}, which this repository declares and is not trusted yet -- run "vc-secrets trust" before starting it`);
            continue;
        }
        notes.push(problem.reason === "changed"
            ? `${name}: changed since you trusted it -- run "vc-secrets trust" again before starting it`
            : `${name}: declared by this repository and not trusted yet -- run "vc-secrets trust" before starting it`);
    }

    return notes;
}

// The one refusal for a name nothing declares, shared by the launch gate and the resolver: the gate has
// to ask BEFORE it can look the winner up, and the resolver stays callable on its own.
function requireLaunchable(kind, name, cfg) {
    if (!Object.hasOwn(cfg[kind], name)) {
        throw new VcSecretsError(`unknown ${kind === "tasks" ? "task" : "server"} "${name}" -- not declared in ${CONFIG_NAME}`);
    }

    return cfg[kind][name];
}

// `kind` is "servers" or "tasks". Both are launchables with the same declaration shape; the only
// difference is who starts them — the MCP client, or a person running `task`.
//
// `prefetch`, when given, is called once, after every reference has passed validation and before the
// first read, with every secret reference's name and declaration -- and, as a second argument, the oauth
// entries the launchable references, which are validated and authorized by then; it returns a Map of what
// it already read -- a name to its value, or to the error reading it produced -- and the loop takes those
// instead of calling resolveSecret. An error is thrown where that name's entry is reached, so a launch
// fails on the same entry, with the same message, as it does without a prefetch. The oauth entries are
// for the prefetch to read ahead and keep; nothing about them comes back through the Map. cmdLaunch passes
// one on Windows.
async function resolveEnvEntries(name, cfg, resolveSecret, kind = "servers", { prefetch } = {}) {
    const server = requireLaunchable(kind, name, cfg);
    // validate every reference BEFORE contacting any backend
    const entries = [];
    const oauthEntries = [];
    for (const [envVar, value] of Object.entries(server.env)) {
        const ref = parseReference(value);
        if (ref === null) {
            // loadConfig refuses any other shape, so this cannot be a bare value reaching the child.
            entries.push({ envVar, literal: parseLiteral(value) });
            continue;
        }
        if (ref.kind === "oauth") {
            // Before the secrets lookup, not after: the two kinds share one name space and nothing
            // refuses a name held by both, so falling through would resolve the same-named secret and
            // hand its value to a variable that asked for a token.
            if (!Object.hasOwn(cfg.oauth ?? {}, ref.name)) {
                throw new VcSecretsError(`env ${envVar}: undeclared oauth entry "${ref.name}" -- declare it in the "oauth" section of ${CONFIG_NAME}`);
            }
            const oauthDecl = cfg.oauth[ref.name];
            const problem = crossingProblem(cfg, kind, name, ref.name, "oauth");
            if (problem !== null) {
                throw authorizationRefusal(envVar, kind, ref.name, problem);
            }
            // The declaration travels so the launcher needs no cfg of its own to acquire the token.
            oauthEntries.push({ envVar, name: ref.name, decl: oauthDecl });
            continue;
        }
        if (!Object.hasOwn(cfg.secrets, ref.name)) {
            throw new VcSecretsError(`env ${envVar}: undeclared secret "${ref.name}"`);
        }
        const problem = crossingProblem(cfg, kind, name, ref.name);
        if (problem !== null) {
            throw authorizationRefusal(envVar, kind, ref.name, problem);
        }
        const decl = cfg.secrets[ref.name];
        if (ref.field !== null && decl.format !== "json") {
            throw new VcSecretsError(`env ${envVar}: field access on "${ref.name}" requires format: "json"`);
        }
        entries.push({ envVar, ref, decl });
    }

    const rawCache = new Map();
    if (prefetch !== undefined) {
        const refs = entries.filter((x) => x.literal === undefined).map((x) => ({ name: x.ref.name, decl: x.decl }));
        for (const [secretName, outcome] of await prefetch(refs, oauthEntries)) {
            rawCache.set(secretName, outcome);
        }
    }
    // Key Vault reads are independent round trips to the network, so they all start here, together, rather
    // than one per entry as the loop below reaches it. Here and not earlier: every reference has been
    // authorized (the loop above refuses before any read), and prefetch has resolved -- on win32 the `az`
    // processes must start inside the job it has just bound. One read per distinct name; local-backend
    // names keep the sequential path below, because they are one keystore and one prompt at a time.
    //
    // Each read is settled into a tagged result the moment it is created: a rejection nobody has awaited
    // yet would be unhandled, and the tag is a wrapper rather than the Error itself so that a rejection
    // that is not an Error -- a string, say -- can never be mistaken for the value it replaced. The loop
    // consumes them in entry order and throws the first entry's error, which is the error a sequential
    // run reports. The cost: a launch that fails may have performed every authorized Key Vault read.
    const keyvaultReads = new Map();
    for (const { ref, decl, literal } of entries) {
        if (literal === undefined && decl.backend === "keyvault" && !rawCache.has(ref.name) && !keyvaultReads.has(ref.name)) {
            keyvaultReads.set(ref.name, (async () => {
                try {
                    return { v: await resolveSecret(ref.name, decl) };
                } catch (e) {
                    return { e };
                }
            })());
        }
    }
    const jsonCache = new Map();
    const result = {};
    for (const entry of entries) {
        if (entry.literal !== undefined) {
            result[entry.envVar] = entry.literal;
            continue;
        }
        const { ref, decl } = entry;
        if (!rawCache.has(ref.name)) {
            if (keyvaultReads.has(ref.name)) {
                const settled = await keyvaultReads.get(ref.name);
                if ("e" in settled) {
                    throw settled.e;
                }
                rawCache.set(ref.name, settled.v);
            } else {
                rawCache.set(ref.name, await resolveSecret(ref.name, decl));
            }
        }
        const raw = rawCache.get(ref.name);
        if (raw instanceof Error) {
            throw raw;
        }
        if (ref.field === null) {
            result[entry.envVar] = raw;
            continue;
        }
        if (!jsonCache.has(ref.name)) {
            try {
                jsonCache.set(ref.name, JSON.parse(raw));
            } catch {
                throw new VcSecretsError(`secret "${ref.name}": content is not valid JSON`);
            }
        }
        const parsed = jsonCache.get(ref.name);
        // `null` is valid JSON and indexing it throws a raw TypeError, which reaches the operator as an
        // internal launcher failure instead of the diagnostic below. The other scalars do not throw --
        // they reach "missing string field", which is true but names the wrong problem when the content
        // is not an object at all. One predicate covers both, so a wrong-shaped secret is always told
        // what is wrong with its shape. Arrays stay on the field path: indexing one is harmless.
        if (parsed === null || (typeof parsed !== "object")) {
            throw new VcSecretsError(`secret "${ref.name}": content is valid JSON but not an object, so field `
                + `"${ref.field}" cannot be selected from it`);
        }
        if (typeof parsed[ref.field] !== "string") {
            throw new VcSecretsError(`secret "${ref.name}": missing string field "${ref.field}"`);
        }
        result[entry.envVar] = parsed[ref.field];
    }

    return { env: result, oauth: oauthEntries };
}

const TIMEOUT_LOCAL_MS = 10_000;
const TIMEOUT_AZ_MS = 20_000;
// Bounded, because a host that completes the handshake and then says nothing -- captive portal,
// half-up VPN, intercepting proxy -- is not a connect failure: undici waits out its 300s headers
// timeout, and doctor prints NOTHING until every check has finished. Measured against a server that
// accepts and never answers: the request was still pending past 73s. A diagnostic that looks hung is
// worse than one that reports "unknown".
const TIMEOUT_TENANT_MS = 5_000;
const LOCAL_BACKENDS = ["wcm", "keychain", "gpg"];
const VALUE_ON_STDIN = "<VALUE_ON_STDIN>";
// The whole command goes on stdin, not just the value: `security` has no stdin path for a password, but
// its interactive mode reads COMMANDS there, which keeps the value out of argv. spec.stdinCommand builds
// the line from the value runTool is handed.
const COMMAND_ON_STDIN = "<COMMAND_ON_STDIN>";
// security(1) reads that command line into a fixed buffer and, past the limit, SPLITS rather than
// refusing: the first half stores a TRUNCATED value and the tail runs as a second command whose name
// is escaped fragments of the value, echoed in stderr where runTool's whole-value redaction cannot
// match them. On a refresh Entra has already invalidated the previous token by that point, so the
// truncated entry is a signed-out state. The wcm path needs no twin of this -- its own script refuses
// at WCM_BLOB_LIMIT bytes (exit 4) -- and gpg has no command line to overflow.
const SECURITY_LINE_LIMIT = 4095;
// CRED_MAX_CREDENTIAL_BLOB_SIZE, 5 * 512, measured by bisection and matching the documented value.
// This is the BLOB -- the stored value -- not the value plus its name. The PowerShell write script
// below reads this constant: the script is a JS template literal, so it interpolates like any
// other, and the number is stated here once rather than in both places.
const WCM_BLOB_LIMIT = 2560;

// Quoting for `security -i`'s own tokenizer: double quotes with backslash escapes. A newline cannot be
// quoted into it at all — it ends the command — so the caller must not offer one.
function quoteForSecurityInteractive(value) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function detectLocalBackend(platform = process.platform, env = process.env) {
    const override = env.VC_SECRETS_LOCAL_BACKEND;
    if (override !== undefined) {
        if (!LOCAL_BACKENDS.includes(override)) {
            throw new VcSecretsError(`VC_SECRETS_LOCAL_BACKEND="${override}" -- expected ${LOCAL_BACKENDS.join("|")}`);
        }
        return override;
    }
    if (platform === "win32") {
        return "wcm";
    }
    if (platform === "darwin") {
        return "keychain";
    }

    return "gpg";
}

function redactSecrets(text, values) {
    let out = text;
    for (const value of [...values].sort((a, b) => b.length - a.length)) {
        if (value) {
            out = out.split(value).join("***");
        }
    }

    return out;
}

// Where both storage layouts live, current and legacy. cmdUnlock walks the two in one loop, so a
// second spelling that drifts surfaces as "nothing to unlock" rather than as an error.
function configBase(env) {
    return env.XDG_CONFIG_HOME || path.join(env.HOME || os.homedir(), ".config");
}

function secretsDir(env = process.env) {
    return path.join(configBase(env), KEY_PREFIX, "secrets");
}

// Keys are "vc-secrets:<scope>:<name>" (see keyFor) — a directory per scope is clearer than
// colons in filenames, even though the latter would be legal on Linux; the gpg backend is
// Linux/WSL-only, so there is no Windows-path angle to weigh here.
function keyToPath(key, env = process.env) {
    const { scope, name } = keyParts(key);

    return path.join(secretsDir(env), scope, `${name}.gpg`);
}

// Only an absent path means "no entry", and existsSync could not say so: its false for a file that
// cannot be stat'd was read by every caller as "nothing is stored". The bill is the same one
// PS_CRED_READ's ERROR_NOT_FOUND rule prevents on Windows: an interactive sign-in that spends an
// authorization code and rotates a live refresh token, or a developer retyping a secret that never
// left the disk. newKeyPresent's own comment demands this distinction outright; gpg was the backend
// where it did not hold.
function gpgEntryPresent(key, env = process.env) {
    return pathPresent(keyToPath(key, env), `the keystore entry "${key}"`);
}

// Pre-rename storage layout, read-only: cmdMigrate copies a value forward from here into the
// new namespaced key, but nothing ever writes to this path again.
function legacyKeyToPath(name, env = process.env) {
    return path.join(configBase(env), LEGACY_KEY_PREFIX, "secrets", `${name}.gpg`);
}

// Where a keystore write that CANNOT come right on its own is recorded.
//
// On Credential Manager an oversize value fails deterministically: the value is larger than the
// backend's ceiling, so the identical write fails identically at every launch and every renewal,
// forever. Without this, that failure prints one line to fd 2 and is gone; the next tick repeats it
// and nothing accumulates. The system still works -- each launch pays a token exchange instead of
// reading a stored token -- but Entra rotates the refresh token on every exchange, so it pays a
// rotation too, and nothing says so.
//
// A FILE, not a keystore entry, because the keystore is the thing that failed. A sibling of the
// secrets directory rather than a child, so nothing that walks the keystore mistakes it for an
// entry; split per scope the same way keyToPath splits the keys -- the scheme, not the directory --
// so two projects on one machine cannot collide on one entry name.
//
// And it is CURRENT STATE, not an event log: a successful write for the same key deletes it. Without
// that half, doctor would keep reporting a condition the next successful write had already fixed --
// a diagnostic that is wrong in the reassuring direction, which is worse than none.
function oversizeMarkerPath(key, env = process.env) {
    const { scope, name } = keyParts(key);

    return path.join(path.dirname(secretsDir(env)), "state", scope, `${name}.oversize.json`);
}

// Not one byte of the value. `bytes` is measured from what the caller tried to write rather than
// scraped out of the backend's stderr the way mapResolveError does it: the number is already in hand
// at both call sites, and parsing a message for it would be a second, independent way to be wrong
// about the same quantity.
function recordOversizeMarker(key, { backend, bytes, limit, env = process.env, at = Date.now() }) {
    const file = oversizeMarkerPath(key, env);
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        fs.writeFileSync(file, JSON.stringify({ key, backend, bytes, limit, at }), { mode: 0o600 });
    } catch (e) {
        // Both call sites stand inside a catch that has already decided this failure will not fail
        // the operation -- cmdLogin says so in as many words, because failing there costs an
        // interactive sign-in. A throw from here escapes that catch and rejects a login whose
        // refresh token is already stored, sending the developer to sign in again and rotate away
        // the token they just obtained. The state directory is exactly where that happens: a
        // read-only profile, a file where the directory should be, or a full disk.
        //
        // clearOversizeMarker draws this line on the success path for the same reason.
        fs.writeSync(2, `vc-secrets: the oversize marker for "${key}" could not be written`
            + ` (${e.code ?? e.message}) -- "vc-secrets doctor" will not report the ceiling\n`);
    }
}

function clearOversizeMarker(key, env = process.env) {
    try {
        fs.rmSync(oversizeMarkerPath(key, env));
    } catch (e) {
        // Absent is the ordinary case: every successful write on a machine that never overflowed
        // clears nothing. Anything else is reported but not thrown -- this runs on the SUCCESS path
        // of a login or a renewal, and failing either over a leftover diagnostic file would trade a
        // working sign-in for a tidy report.
        if (e.code !== "ENOENT") {
            fs.writeSync(2, `vc-secrets: a stale oversize marker for "${key}" could not be removed`
                + ` (${e.code ?? e.message}) -- "vc-secrets doctor" may report a problem that is fixed\n`);
        }
    }
}

function readOversizeMarker(key, env = process.env) {
    try {
        return JSON.parse(fs.readFileSync(oversizeMarkerPath(key, env), "utf8"));
    } catch {
        // Absent and unreadable collapse deliberately, unlike the keystore reads where that collapse
        // is a defect: this decides whether doctor prints one advisory line, not whether a token
        // exists. A marker that cannot be read is not a finding of its own -- inventing one would
        // send a developer to diagnose the diagnostic.
        return null;
    }
}

// PowerShell 5.1 P/Invoke for Credential Manager (no built-in cmdlets exist).
// Passed via -EncodedCommand: immune to Windows argv re-quoting; -ExecutionPolicy Bypass
// covers restricted policies; if Constrained Language Mode blocks Add-Type, set
// VC_SECRETS_POWERSHELL=pwsh — record it in README.md when hit.
// The keystore key arrives via env var VC_SECRETS_NAME; the value (write path) arrives on stdin.
//
// 1168 is ERROR_NOT_FOUND, and on this path too it is the ONLY code that may read as "no such
// entry" — the rule PS_CRED_DELETE states below, applied to the read. Four call sites consume exit
// 3 as authoritative absence, newKeyPresent's comment among them ("everything else is an unreadable
// store"). A Credential Manager that cannot be read — a logon session left locked after an RDP
// reconnect, a policy-restricted context — is then indistinguishable from an empty one, so the
// developer is sent through an interactive sign-in nothing had invalidated: it spends a single-use
// authorization code and rotates a live refresh token away.
const PS_CRED_READ = `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class CredMan {
  [DllImport("advapi32", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment;
    public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
}
'@
$ptr=[IntPtr]::Zero
if(-not [CredMan]::CredRead("$env:VC_SECRETS_NAME",1,0,[ref]$ptr)){
  $e=[System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if($e -eq 1168){ exit 3 }
  [Console]::Error.Write("CredRead failed win32err=$e"); exit 1
}
$c=[System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr,[type][CredMan+CREDENTIAL])
$n=$c.CredentialBlobSize
$b=New-Object byte[] $n
[System.Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob,$b,0,$n)
[Console]::Out.Write((($b | ForEach-Object { $_.ToString("x2") }) -join ''))
`;

// Everything a Windows launch needs from PowerShell, in ONE process: every Credential Manager name the
// launch reads, and the job object that binds the launch's process tree to the launcher.
//
// One process because each one costs a powershell.exe start and an Add-Type compile -- the bulk of a wcm
// read -- and the launch used to pay that once per name, sequentially. The read half is PS_CRED_READ's,
// per name: the same CredRead declaration, the same blob copied out as hex, which decodeCredBlobHex
// turns back into the value. What changes is the reporting: a failed CredRead is reported as its raw
// win32 code instead of an exit status, and readWcmBatch applies PS_CRED_READ's rule to it -- 1168
// (ERROR_NOT_FOUND) alone is "absent", every other code an unreadable store. Names arrive as a JSON
// array of keystore keys in VC_SECRETS_NAMES; an empty array is the bind alone. The output is one JSON
// object, {"creds":{"<key>":{"ok":"<hex>"}|{"err":<win32 code>}},"job":"ok"|<win32 code>}, built by hand
// rather than with ConvertTo-Json: every key has passed assertKeyShape ([a-z0-9:-]) and every value is
// hex or an integer, so nothing in it needs escaping.
//
// The bind, and why it exists. An MCP client stops a server with child.kill(), which on Windows is
// TerminateProcess: no handler in the launcher runs. libuv puts the launcher's DIRECT children in a
// kill-on-close job of its own, but one that lets their descendants slip out of it silently (libuv
// src/win/process.c, uv__init_global_job_handle), so the processes that hold the secrets -- `npx.cmd`
// -> cmd.exe -> node, the server -- outlive a launcher killed that way. A job created WITHOUT any
// breakaway permission, holding the launcher, catches every process created after the assignment: with
// nested jobs a process escapes only up to the first job that forbids it, and libuv never asks to
// escape at all (it does not pass CREATE_BREAKAWAY_FROM_JOB). KILL_ON_JOB_CLOSE then ends that whole
// tree when the job's last handle closes -- and the only handle left is the one duplicated into the
// launcher, so any end of the launcher, a TerminateProcess included, ends its tree. The duplicate is not
// inheritable: a child holding one would keep the job open after the launcher died.
//
// THE ORDER IS LOAD-BEARING: the handle is duplicated into the launcher BEFORE the launcher is assigned.
// Assigned first, a failed duplicate would leave this PowerShell process the job's only holder, and its
// exit -- moments later -- would close the job and KILL_ON_JOB_CLOSE would kill the launcher. Duplicated
// first, a failed duplicate leaves an empty job that dies harmlessly with this process, and a failed
// assignment after a good duplicate leaves the launcher holding a handle to a job it is not in, which
// costs nothing. Either failure is reported as its win32 code and the launch goes on unbound.
//
// The reads run before the bind, so a read that throws ends the script before any bind was attempted
// and the caller's "could not bind" is true. The pid comes from VC_SECRETS_LAUNCHER_PID. The names are
// parsed into a variable and enumerated with foreach, not wrapped in @(...): Windows PowerShell 5.1
// emits a parsed array as ONE pipeline object, which @() would wrap into an array holding the array.
const PS_CRED_READ_MANY = `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class CredManLaunch {
  [DllImport("advapi32", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment;
    public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
  [StructLayout(LayoutKind.Sequential)]
  public struct JOBOBJECT_BASIC_LIMIT_INFORMATION { public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit;
    public int LimitFlags; public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public int ActiveProcessLimit;
    public UIntPtr Affinity; public int PriorityClass; public int SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)]
  public struct IO_COUNTERS { public ulong ReadOperationCount; public ulong WriteOperationCount; public ulong OtherOperationCount;
    public ulong ReadTransferCount; public ulong WriteTransferCount; public ulong OtherTransferCount; }
  [StructLayout(LayoutKind.Sequential)]
  public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION { public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
    public IO_COUNTERS IoInfo; public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed; }
  [DllImport("kernel32", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32", SetLastError=true)]
  static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, int size);
  [DllImport("kernel32", SetLastError=true)]
  static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  [DllImport("kernel32")]
  static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32", SetLastError=true)]
  static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr source, IntPtr targetProcess, out IntPtr target,
    int access, bool inherit, int options);
  [DllImport("kernel32", SetLastError=true)]
  static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32", SetLastError=true)]
  static extern bool CloseHandle(IntPtr handle);
  const int JobObjectExtendedLimitInformation = 9;
  const int JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
  const int PROCESS_TERMINATE = 0x0001, PROCESS_DUP_HANDLE = 0x0040, PROCESS_SET_QUOTA = 0x0100;
  const int DUPLICATE_SAME_ACCESS = 0x2;
  static int LastError() { int e = Marshal.GetLastWin32Error(); return e == 0 ? -1 : e; }
  public static int Bind(int pid) {
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    if (job == IntPtr.Zero) { return LastError(); }
    try {
      JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
      info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
      if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, ref info, Marshal.SizeOf(info))) { return LastError(); }
      IntPtr launcher = OpenProcess(PROCESS_DUP_HANDLE | PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid);
      if (launcher == IntPtr.Zero) { return LastError(); }
      try {
        IntPtr held;
        if (!DuplicateHandle(GetCurrentProcess(), job, launcher, out held, 0, false, DUPLICATE_SAME_ACCESS)) { return LastError(); }
        if (!AssignProcessToJobObject(job, launcher)) { return LastError(); }
        return 0;
      } finally { CloseHandle(launcher); }
    } finally { CloseHandle(job); }
  }
}
'@
$out=New-Object System.Text.StringBuilder
[void]$out.Append('{"creds":{')
$sep=''
$names=ConvertFrom-Json $env:VC_SECRETS_NAMES
foreach($k in $names){
  [void]$out.Append($sep+'"'+$k+'":'); $sep=','
  $ptr=[IntPtr]::Zero
  if(-not [CredManLaunch]::CredRead($k,1,0,[ref]$ptr)){
    $e=[System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    [void]$out.Append('{"err":'+$e+'}'); continue
  }
  $c=[System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr,[type][CredManLaunch+CREDENTIAL])
  $n=$c.CredentialBlobSize
  $b=New-Object byte[] $n
  [System.Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob,$b,0,$n)
  [void]$out.Append('{"ok":"'+(($b | ForEach-Object { $_.ToString("x2") }) -join '')+'"}')
}
$j=[CredManLaunch]::Bind([int]$env:VC_SECRETS_LAUNCHER_PID)
[void]$out.Append('},"job":'+$(if($j -eq 0){'"ok"'}else{$j})+'}')
[Console]::Out.Write($out.ToString())
`;

// 1168 is ERROR_NOT_FOUND, and ONLY that may read as "already absent". Exiting 3 for every
// failure would let logout report success while the refresh token is still in the store —
// the single outcome logout exists to prevent.
const PS_CRED_DELETE = `
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class CredManDel {
  [DllImport("advapi32", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredDelete(string target, int type, int flags);
}
'@
if(-not [CredManDel]::CredDelete("$env:VC_SECRETS_NAME",1,0)){
  $e=[System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if($e -eq 1168){ exit 3 }
  [Console]::Error.Write("CredDelete failed win32err=$e"); exit 1
}
`;

// No TrimEnd on the value, and that is the opposite of what runTool does when it READS. The two are
// not inconsistent: `security -w` and the PowerShell reader append a line ending of their own, so
// stripping one on the way out removes the tool's artifact. Nothing appends anything on the way in
// -- runTool writes `child.stdin.write(stdinValue)` and ReadToEnd returns exactly those bytes -- so
// a TrimEnd here deleted the CALLER's, and every one of them rather than a single line ending.
//
// Reachable through cmdMigrate, the one caller whose value can legitimately end in a newline: the
// other two write paths are a token's JSON and a secret typed at a prompt, where Enter is the
// terminator. Migrate exists to move a value the user CANNOT retype, which is why its gpg read opts
// out of the same strip with keepTrailingNewline -- Windows was quietly doing what that opt-out was
// added to prevent.
const PS_CRED_WRITE = `
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[System.Text.Encoding]::UTF8
$value=[Console]::In.ReadToEnd()
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class CredManW {
  [DllImport("advapi32", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredWrite(ref CREDENTIAL cred, int flags);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment;
    public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
}
'@
$bytes=[System.Text.Encoding]::UTF8.GetBytes($value)
$blob=[System.Runtime.InteropServices.Marshal]::AllocCoTaskMem($bytes.Length)
[System.Runtime.InteropServices.Marshal]::Copy($bytes,0,$blob,$bytes.Length)
$c=New-Object CredManW+CREDENTIAL
$c.Type=1; $c.TargetName="$env:VC_SECRETS_NAME"; $c.UserName=$env:USERNAME; $c.Persist=2
$c.CredentialBlob=$blob; $c.CredentialBlobSize=$bytes.Length
if(-not [CredManW]::CredWrite([ref]$c,0)){
  $e=[System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if($e -eq 1783){ [Console]::Error.Write("value too large for Credential Manager ($($bytes.Length) bytes; limit ${WCM_BLOB_LIMIT})"); exit 4 }
  [Console]::Error.Write("CredWrite failed win32err=$e"); exit 3
}
`;

function psEncode(script) {
    return Buffer.from(script, "utf16le").toString("base64");
}

function psCommand(env = process.env) {
    return env.VC_SECRETS_POWERSHELL || "powershell.exe";
}

function psArgs(script) {
    return ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", psEncode(script)];
}

// A value written by the pre-UTF-8 launcher is UTF-16LE, and tokens are ASCII — checked against the
// real credentials in use, not inferred from the format — so every second byte is zero. The premise
// is load-bearing and its limit is pinned by a test: above U+00FF the odd byte stops being zero and
// the value decodes as UTF-8, mojibake, with no error. Detecting rather than versioning keeps `run`
// read-only: a developer whose secret exists only in the keystore cannot re-enter it, so we must
// read what is there.
function decodeCredBlobHex(hex) {
    const bytes = Buffer.from(hex.replace(/\s+/g, ""), "hex");
    const utf16 = bytes.length >= 2 && bytes.length % 2 === 0
        && bytes.every((b, i) => (i % 2 === 1 ? b === 0 : b !== 0));

    return utf16
        ? { encoding: "utf16le", value: bytes.toString("utf16le") }
        : { encoding: "utf8", value: bytes.toString("utf8") };
}

// grammar: "vc-secrets:" scope ":" name; scope and name both [a-z0-9-]+ (scope is "user" or a
// projectId — see keyFor).
// Built from KEY_PREFIX so the constant stays the single source of the key shape — a literal here
// would keep validating the old prefix after a rename, and every read would look correct.
const KEY_RE = new RegExp(`^${KEY_PREFIX}:[a-z0-9-]+:[a-z0-9-]+$`);

// Every builder below puts the key into a command line, so each checks the shape first. The check
// lives here rather than once per builder: nothing in a builder's signature says it is mandatory,
// and a new builder that omits it is the failure this guards against.
function assertKeyShape(key) {
    if (!KEY_RE.test(key)) {
        throw new VcSecretsError(`invalid secret key "${key}" -- expected vc-secrets:<scope>:<name>`);
    }
}

// The account `security` is addressed with. Read, write and delete have to agree on it, or an entry
// is written where it cannot be read back.
function keychainAccount(env) {
    return env.USER || os.userInfo().username;
}

// What a backend says when the entry is simply not there: the PowerShell branch exits 3 by
// construction, security(1) answers 44. gpg is absent from this list on purpose — its entries are
// files, so gpgEntryPresent settles that case before a read is attempted at all.
//
// One home for the rule because both ways of getting it wrong are silent. A store that merely could
// not be read, taken for absent, costs an interactive sign-in that spends an authorization code and
// rotates a live refresh token; a genuinely empty store, taken for broken, refuses to sign in.
// deleteEntryIo states the same rule for the delete path, in the terms that path needs.
function isAbsentEntry(backend, e) {
    return (backend === "wcm" && e.toolExitCode === 3) || (backend === "keychain" && e.toolExitCode === 44);
}

function buildLocalRead(backend, key, env = process.env) {
    assertKeyShape(key);
    if (backend === "wcm") {
        return { cmd: psCommand(env), args: psArgs(PS_CRED_READ),
            extraEnv: { VC_SECRETS_NAME: key }, timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: true };
    }
    if (backend === "keychain") {
        return { cmd: "security", args: ["find-generic-password", "-a", keychainAccount(env), "-s", key, "-w"],
            timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: true };
    }

    // --pinentry-mode cancel (GnuPG >= 2.1): a cold agent fails fast instead of popping pinentry,
    // which the 10s kill timer would otherwise interrupt mid-typing. Interactive unlock (cmdUnlock)
    // builds its own args without this flag — that is the only place pinentry may appear.
    return { cmd: "gpg", args: ["--quiet", "--batch", "--pinentry-mode", "cancel", "--decrypt", keyToPath(key, env)],
        timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: true, keepTrailingNewline: true };
}

// The launch's one PowerShell call (PS_CRED_READ_MANY): the keys to read, possibly none, and the pid to
// bind. Every key is shape-checked like any other builder's, and here it also keeps the hand-built
// JSON the script prints free of anything that would need escaping.
function buildCredReadMany(keys, pid, env = process.env) {
    for (const key of keys) {
        assertKeyShape(key);
    }

    return { cmd: psCommand(env), args: psArgs(PS_CRED_READ_MANY),
        extraEnv: { VC_SECRETS_NAMES: JSON.stringify(keys), VC_SECRETS_LAUNCHER_PID: String(pid) },
        timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: true };
}

// Runs it and returns the parsed object. A call that fails as a whole -- PowerShell missing, Add-Type
// refused, a timeout, output that is not the object -- throws a VcSecretsError, and the message never
// carries the output: on success that holds every value read, hex-encoded.
async function credReadManyIo({ keys, pid, env = process.env, redactValues = [] }) {
    const stdout = await runTool(buildCredReadMany(keys, pid, env), { redactValues });
    let result = null;
    try {
        result = JSON.parse(stdout);
    } catch { /* reported below, without the text */ }
    if (result === null || typeof result !== "object" || result.creds === null || typeof result.creds !== "object") {
        throw new VcSecretsError(`${psCommand(env)} did not print the batched read's result`);
    }

    return result;
}

// What a single PS_CRED_READ would have thrown for a key the batched call reported as `{ err: code }`: 1168
// (ERROR_NOT_FOUND) is its exit 3 with nothing on stderr, any other code its exit 1 naming it -- and runTool's
// message for a non-zero exit, which mapResolveError rewrites for exit 3 and passes through for exit 1. One
// copy because the secret reads and the oauth reads must both stay exactly what the single read says.
function batchedReadError(cmd, code) {
    const exit = code === 1168 ? 3 : 1;
    const stderr = exit === 3 ? "" : `CredRead failed win32err=${code}`;

    return Object.assign(new VcSecretsError(`${cmd} exited ${exit}: ${stderr}`), { toolExitCode: exit });
}

function buildLocalWrite(backend, key, env = process.env, { tmp = false, value = undefined } = {}) {
    assertKeyShape(key);
    if (backend === "wcm") {
        return { cmd: psCommand(env), args: psArgs(PS_CRED_WRITE),
            extraEnv: { VC_SECRETS_NAME: key }, stdinData: VALUE_ON_STDIN, timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: false };
    }
    if (backend === "keychain") {
        const account = keychainAccount(env);
        // Three shapes, and the differences are load-bearing. `set`: `-w` with no value makes security
        // prompt on the TTY, so the plaintext never passes through this process at all.
        if (value === undefined) {
            return { cmd: "security", args: ["add-generic-password", "-U", "-a", account, "-s", key, "-w"],
                interactive: true, timeoutMs: null, captureStdout: false };
        }
        // `migrate`: there IS no value to type — the point is to copy one the user cannot read — and
        // `security` takes no password on stdin. Its interactive mode takes the whole COMMAND there, which
        // is what keeps the value out of argv and out of this machine's process list.
        if (!/[\r\n]/.test(value)) {
            return { cmd: "security", args: ["-i"], stdinData: COMMAND_ON_STDIN,
                stdinCommand: (v) => {
                    const line = `add-generic-password -U -a ${quoteForSecurityInteractive(account)} `
                        + `-s ${quoteForSecurityInteractive(key)} -w ${quoteForSecurityInteractive(v)}\n`;
                    if (Buffer.byteLength(line) > SECURITY_LINE_LIMIT) {
                        throw new VcSecretsError(`value too large for the keychain: entry "${key}" needs `
                            + `${Buffer.byteLength(line)} bytes on one command line; limit ${SECURITY_LINE_LIMIT}`);
                    }

                    return line;
                },
                timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: false };
        }

        // A line ending cannot be quoted into that command — it ends it — so this one value takes the
        // older route and its exposure is reported rather than hidden. Refusing instead would strand the
        // secret: migrate exists for values the user cannot retype.
        return { cmd: "security", args: ["add-generic-password", "-U", "-a", account, "-s", key, "-w", value],
            argvExposesValue: true, timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: false };
    }
    const recipientArgs = env.VC_SECRETS_GPG_RECIPIENT
        ? ["--recipient", env.VC_SECRETS_GPG_RECIPIENT, "--trust-model", "always"]
        : ["--default-recipient-self"];
    // Write to a `.tmp` sibling first so a mid-write crash/kill can never leave
    // a half-encrypted `<name>.gpg` in place of a previously-valid secret — cmdSet renames it in
    // after gpg exits 0.
    const target = `${keyToPath(key, env)}${tmp ? ".tmp" : ""}`;

    return { cmd: "gpg", args: ["--quiet", "--batch", "--yes", ...recipientArgs, "--encrypt", "-o", target],
        stdinData: VALUE_ON_STDIN, timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: false };
}

function buildLocalDelete(backend, key, env = process.env) {
    assertKeyShape(key);
    if (backend === "wcm") {
        return { cmd: psCommand(env), args: psArgs(PS_CRED_DELETE),
            extraEnv: { VC_SECRETS_NAME: key }, timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: false };
    }
    if (backend === "keychain") {
        return { cmd: "security", args: ["delete-generic-password", "-a", keychainAccount(env), "-s", key],
            timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: false };
    }
    // gpg entries are files, removed by deleteEntryIo directly. Falling through to the keychain
    // command would answer a Linux caller with "security: not found on PATH" instead of the
    // truth, which reads as a broken machine rather than a builder used on the wrong backend.
    throw new VcSecretsError(`no delete command for backend "${backend}"`);
}

// One meaning of "already absent" for logout to check, assembled here because each backend
// signals it differently: the PowerShell branch exits 3 by construction, security(1) answers 44,
// and gpg entries are files whose absence is a path error (isAbsentPathError) rather than any exit
// code at all -- the same test gpgEntryPresent applies, so logout and a presence check agree.
function deleteEntryIo(backend = detectLocalBackend(), env = process.env, { run = runTool, rm = fs.rmSync } = {}) {
    return async (key) => {
        if (backend === "gpg") {
            assertKeyShape(key);
            try {
                rm(keyToPath(key, env));
            } catch (e) {
                if (isAbsentPathError(e)) {
                    throw Object.assign(new VcSecretsError(`no stored entry "${key}"`), { toolExitCode: 3 });
                }
                throw new VcSecretsError(`could not remove "${key}": ${e.code ?? e.message}`);
            }

            return;
        }
        try {
            await run(buildLocalDelete(backend, key, env));
        } catch (e) {
            if (backend === "keychain" && e.toolExitCode === 44) {
                throw Object.assign(e, { toolExitCode: 3 });
            }
            throw e;
        }
    };
}

// Shared by cmdSet's non-interactive branch and cmdMigrate: runs a write `spec` built with a
// value already in hand. gpg gets an atomic tmp-then-rename so a reader never observes a
// partially-written or empty file; the other backends write in one shot.
async function writeLocalValue(backend, key, spec, value, env = process.env, run = runTool) {
    if (backend !== "gpg") {
        try {
            await run(spec, { stdinValue: value, redactValues: [value] });
        } catch (e) {
            // Only the size error. mapResolveError reads wcm exit 3 as "not found — run set", a
            // READ-path diagnosis: on a write it names a failure that did not happen and
            // prescribes the command that just failed. Name segment, not the whole key: the
            // message it builds says `secret "X"`, and X is what the declaration calls it.
            if (e.toolExitCode !== 4) {
                throw e;
            }
            throw mapResolveError(backend, nameFromKey(key), e);
        }

        return;
    }
    fs.mkdirSync(path.dirname(keyToPath(key, env)), { recursive: true, mode: 0o700 });
    const finalPath = keyToPath(key, env);
    const tmpPath = `${finalPath}.tmp`;
    try {
        await run(spec, { stdinValue: value, redactValues: [value] });
        fs.chmodSync(tmpPath, 0o600);
        fs.renameSync(tmpPath, finalPath);
    } catch (e) {
        try {
            if (fs.existsSync(tmpPath)) {
                fs.unlinkSync(tmpPath);
            }
        } catch { /* best-effort cleanup — the original error is what matters */ }
        throw e;
    }
}

// Callers must not build their own write spec for a value already in hand: for the keychain
// backend, buildLocalWrite's `value === undefined` branch is the INTERACTIVE `security -w` one
// cmdSet's own TTY prompt uses -- routing a renewal or a login through it does not fail, it hangs,
// waiting for a typist that is never there. Passing `value` here is what selects buildLocalWrite's
// non-interactive `security -i` branch instead, the same choice cmdMigrate makes at its own call
// site for the same reason: the value is already in hand and there is nothing to prompt
// for. This is the source's buildKeychainWrite/buildLocalWrite split, expressed here as the `value`
// option rather than as two separate builders. The split only: the source's composeStdin also carried
// a line-length refusal, restored in buildLocalWrite above, because this package's three-segment key
// is longer than the source's two-segment one and eats most of the margin the source measured.
async function writeSecretValue(key, value, { backend = detectLocalBackend(), env = process.env,
    run = runTool } = {}) {
    if (!value) {
        // The invariant belongs here rather than only in cmdSet: a renewal and a login can both be
        // handed an empty string by a response that parsed, and an empty entry is worse than a
        // missing one — it reads back as "backend returned empty value", which sends a developer to
        // retype a secret this tool just erased.
        throw new VcSecretsError(`refusing to store an empty value for "${key}"`);
    }
    const spec = buildLocalWrite(backend, key, env, { tmp: backend === "gpg", value });
    // Composed once here purely to validate. The runner composes it only AFTER spawning, so without
    // this call an oversize value leaves an orphaned `security -i` waiting on a stdin that never
    // arrives, until the runner's own timeout kills it -- and the refusal would hold only for
    // whichever runner is wired in. The result is discarded: the builder is pure and the runner
    // composes it again for real.
    if (spec.stdinCommand) {
        spec.stdinCommand(value);
    }

    return writeLocalValue(backend, key, spec, value, env, run);
}

function buildKeyvaultRead(decl) {
    return { cmd: "az", args: ["keyvault", "secret", "show", "--vault-name", decl.vault, "--name", decl.secret, "--query", "value", "-o", "tsv"],
        timeoutMs: TIMEOUT_AZ_MS, captureStdout: true };
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

// Reported by `doctor` as "a legacy plaintext value is still present" — everything a pre-vc-secrets
// setup could have held in a server's env block, credentials and identifiers alike.
const LEGACY_ENV_VARS = ["ADO_MCP_AUTH_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN", "AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"];
// Deleted from the child's env by cmdLaunch before injection — the narrower list, because a
// tenant/client ID is an identifier, not a secret: a server that legitimately inherits one from the
// ambient shell must not be made to fail with an auth error naming nothing related to this tool.
// Only the actual credentials are stripped so a stale plaintext token cannot leak into the child.
const LEGACY_SECRET_ENV_VARS = ["ADO_MCP_AUTH_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN", "AZURE_CLIENT_SECRET"];

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

// Pure mapping so the advice contract can be unit-tested without spawning real
// backends: wcm "not found" (exit 3) / keychain "not found" (exit 44) both point at "vc-secrets set";
// wcm exit 4 is the oversize write, and carries the measured size out of the script's stderr;
// any other gpg failure gets the "vc-secrets unlock" hint (file exists but decrypt failed, e.g. cold agent);
// everything else passes through unchanged.
// Read AND write reach this: writeLocalValue routes exit 4 here and nothing else, because the two
// "not found" rewrites above are advice for a read.
function mapResolveError(backend, name, e) {
    // Every branch that rewrites the message returns a NEW error, and a new error carries no
    // toolExitCode -- so improving a message for a human silently stripped the classification the
    // code downstream needs. The two are not alternatives, and the loss is invisible: the caller
    // still gets an error, just one that no longer answers "which failure was this". The oversize
    // marker reads exit 4 off an error that has already passed through here. The fall-through at
    // the end returns the original untouched, so it needs no keep().
    const keep = (mapped) => Object.assign(mapped, { toolExitCode: e.toolExitCode });
    if (backend === "wcm" && e.toolExitCode === 3) {
        return keep(new VcSecretsError(`secret "${name}" not found in Credential Manager -- run "vc-secrets set ${name}"`));
    }
    if (backend === "wcm" && e.toolExitCode === 4) {
        // Keep the measured size, drop win32err=1783: the number a developer can act on is
        // how far over the limit the value is, not the API's code for "too big".
        const size = /(\d+) bytes/.exec(e.message)?.[1];
        const measured = size ? ` (${size} bytes)` : "";

        return keep(new VcSecretsError(`secret "${name}" is too large for Credential Manager${measured} -- the blob limit is ${WCM_BLOB_LIMIT} bytes`));
    }
    if (backend === "keychain" && e.toolExitCode === 44) {
        return keep(new VcSecretsError(`secret "${name}" not found in Keychain -- run "vc-secrets set ${name}"`));
    }
    if (backend === "gpg") {
        return keep(new VcSecretsError(`${e.message} -- if the gpg agent is locked, run "vc-secrets unlock" in a terminal`));
    }

    return e;
}

const LOCK_POLL_MS = 250;
const LOCK_POLL_CEILING_MS = 2_000;
// A backstop on acquireTokenLock's wait, never the thing that ends it -- the reasoning is at the
// loop. 64 polls of a backoff that doubles to LOCK_POLL_CEILING_MS run to 123.75 s -- measured by
// driving the loop against a clock that never advances, not derived on paper -- versus a 45 s
// LOCK_WAIT_MS. Nearly three times the deadline, so under any advancing clock the deadline is
// crossed first and this cap never fires.
const MAX_LOCK_POLLS = 64;

// The one place the mutex name is built. Three writers share the same pair of keystore entries —
// a renewal, a login and a logout — and a lock any of them takes on a different name serialises
// against nothing while every one of the three still reads as correct. Built here once rather than
// at each call site for that reason.
//
// The lock and the keystore entries it guards have to agree on what "the same project" means, which
// is why the scope comes from scopeKeyFor rather than from `decl.scope` — that string is "project"
// for a local declaration too, so a lock keyed on it would serialise two separate projects against
// each other and fail to serialise one project against itself.
function tokenLockFor(entryName, decl, cfg, { platform = process.platform, env = process.env } = {}) {
    const scopeKey = scopeKeyFor(decl, cfg);

    return () => cache.acquireLock(cache.lockPathFor(entryName, scopeKey, { platform, env }));
}

// Waits out whoever holds the token mutex — the one all three writers to the entry pair take —
// and DECIDES NOTHING about failing to get it. Its two callers are the login and logout verbs,
// both ported. They want opposite things from a failure and each words its own message at its
// own call site, so a message written here would be right for at most one of them.
//
// The window being waited out is not the one ensureFreshToken already closed between its two cache
// reads. It is the width of the exchange, where the holder sits on the network with a token it
// will write the instant Entra answers.
//
// A wedged holder costs the ceiling below and a report of "busy"; a DEAD one costs nothing, for
// the reasons lockPathFor sets out per platform — the kernel frees the abstract name and the pipe,
// and acquireLock probes and unlinks the darwin path.
async function acquireTokenLock({ acquireLock, now, sleep, log }) {
    let sawHolder = false;
    // Classified in ONE place. Written twice, it is free to drift, and the safe reading of "the
    // bind stopped working after a holder was seen" is that the holder is still there.
    const classify = (lock, error) => {
        if (lock !== null && lock !== cache.HELD_BY_OTHER) {
            return { lock };
        }
        if (lock === cache.HELD_BY_OTHER || sawHolder) {
            return { lock: null, reason: "busy" };
        }

        return { lock: null, reason: "unbindable", error };
    };
    let failure = null;
    const attempt = async () => {
        try {
            return await acquireLock();
        } catch (e) {
            if (e.code !== "EPERM" && e.code !== "EACCES") {
                // Narrow on purpose. The carve-out exists for ONE measured condition, and a wide
                // catch launders every other failure — a TypeError from broken wiring, an EMFILE
                // under fd exhaustion — into "the sandbox refused the bind". Callers then act on a
                // diagnosis nobody made. ensureFreshToken does not catch at all.
                throw e;
            }
            failure = e;

            return null;
        }
    };
    let lock = await attempt();
    if (lock !== cache.HELD_BY_OTHER) {
        return classify(lock, failure);
    }
    sawHolder = true;
    log(`vc-secrets: waiting for an in-flight token renewal\n`);
    // Deliberately the same ceiling and the same backoff as ensureFreshToken's waiter, because the
    // critical section being waited out is the same one. Tuning either loop alone reintroduces the
    // asymmetry the shared constants exist to prevent, and nothing but these two names connects the
    // loops — so each is driven separately and its own observed sleep sequence asserted.
    const deadline = now() + cache.LOCK_WAIT_MS;
    let backoff = LOCK_POLL_MS;
    // Bounded by polls as WELL as by the clock, because the deadline is enforced by an INJECTED
    // `now`: a frozen stub would spin here forever, and the login verb reaches this line with a
    // single-use authorization code already spent, so a hang there costs the code itself. The cap
    // is the backstop and the clock is the mechanism — under any advancing clock the deadline is
    // crossed first.
    // ensureFreshToken's identical loop has no cap on purpose: it has spent nothing and a launch
    // that hangs is a launch that failed, which is visible.
    for (let poll = 0; poll < MAX_LOCK_POLLS && now() < deadline; poll += 1) {
        await sleep(backoff);
        backoff = Math.min(backoff * 2, LOCK_POLL_CEILING_MS);
        lock = await attempt();
        if (lock !== cache.HELD_BY_OTHER) {
            return classify(lock, failure);
        }
    }

    return { lock: null, reason: "busy" };
}

// The single path the pre-spawn launch and the mid-session renewal both go through. Every
// dependency is injected for the same reason resolveEnvEntries takes its resolver: what is worth
// testing here is the ORDER — who exchanges, who waits, and what is released when it throws.
async function ensureFreshToken({ serverName, readCache, writeCache, exchange, acquireLock,
    now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    if (typeof serverName !== "string" || serverName === "") {
        // Loud at the wiring seam: without the name every message below sends the developer to
        // `vc-secrets login undefined`, and a remedy naming the wrong verb is worse than none.
        throw new VcSecretsError("ensureFreshToken needs the name of the oauth entry it is refreshing");
    }
    const signIn = `no usable token for "${serverName}" -- run "vc-secrets login ${serverName}"`;
    const first = await readCache();
    if (first.state === "valid") {
        return first.accessToken;
    }
    if (first.state !== "needs-refresh") {
        throw new VcSecretsError(signIn);
    }
    let lock = await acquireLock();
    if (lock === cache.HELD_BY_OTHER) {
        // What this launcher needs is a valid access token, and the WINNER writes one — so it
        // waits for the cache rather than for the lock, and fails naming the neighbour rather
        // than suggesting a sign-in that would rotate the refresh token a second time.
        const deadline = now() + cache.LOCK_WAIT_MS;
        let backoff = LOCK_POLL_MS;
        while (now() < deadline) {
            await sleep(backoff);
            // Backed off rather than a flat 250 ms: on Credential Manager every readCache is a
            // PowerShell P/Invoke worth one to three seconds, so a fixed fast poll is really
            // "start powershell.exe as fast as it will start" for the length of the wait.
            backoff = Math.min(backoff * 2, LOCK_POLL_CEILING_MS);
            const again = await readCache();
            if (again.state === "valid") {
                return again.accessToken;
            }
            // The lock is retried, not only the cache. A neighbour can finish WITHOUT publishing
            // a usable access entry — that write is best-effort by design, and its exchange may
            // have failed outright — and waiting on the cache alone then burns the whole deadline
            // and blames a neighbour that released seconds after taking it, for a token this
            // launcher could have exchanged itself.
            lock = await acquireLock();
            if (lock !== cache.HELD_BY_OTHER) {
                break;
            }
        }
        if (lock === cache.HELD_BY_OTHER) {
            throw new VcSecretsError(`another vc-secrets is still refreshing the token for "${serverName}" -- it did not finish in time`);
        }
    }
    try {
        const again = await readCache();   // it may have finished while we waited on the bind
        if (again.state === "valid") {
            return again.accessToken;
        }
        if (again.state !== "needs-refresh") {
            // Re-checked rather than assumed still refreshable: a logout landing between the two
            // reads would otherwise hand `undefined` to the exchange, and Entra's answer to that
            // names nothing a developer can act on.
            throw new VcSecretsError(signIn);
        }
        let fresh;
        try {
            fresh = await exchange(again.refreshToken);
        } catch (e) {
            // A refusal means the refresh token is dead and signing in again is the remedy. A
            // timeout or an unreachable endpoint is not, and the same advice there sends the
            // developer to a browser that cannot help either.
            throw e?.refused ? new VcSecretsError(`${e.message} -- run "vc-secrets login ${serverName}"`, e.exitCode) : e;
        }
        await writeCache(fresh);

        return fresh.accessToken;
    } finally {
        // The load-bearing line: the error table promises the launcher survives a failed renewal,
        // and that is exactly the case where a leaked holder would never be released — blocking
        // every other session on this machine until someone reboots.
        await lock.release();
    }
}

// The tail both token writers share -- cmdLogin after an interactive sign-in, writeCache after a
// renewal. Best effort throughout: losing the access entry costs one exchange on the next launch,
// where failing the whole operation would cost an interactive sign-in.
//
// ONLY exit 4 records a marker. It is the one failure that cannot come right on its own -- the value
// is over the backend's ceiling, so the identical write fails identically forever. A transient
// failure that left a marker behind would report a permanent condition that the very next successful
// write disproves, and that distinction is the whole point of the file. Credential Manager is the
// only backend that produces it (gpg has no ceiling to cross, keychain does not signal size this
// way), so WCM_BLOB_LIMIT is the limit recorded; `backend` goes in the marker too, because a reader
// should not have to infer which store refused from the value of a number.
//
// Cleared on success because the marker is current state, not a log; the reason is on
// oversizeMarkerPath. Four coupled rules in one body rather than two, so a fifth writer gets them
// by calling rather than by copying.
async function storeAccessEntry(key, value, { write, marker, log, backend, note = "" }) {
    try {
        await write(key, value);
        marker.clear(key);
    } catch (e) {
        if (e.toolExitCode === 4) {
            marker.record(key, { backend, limit: WCM_BLOB_LIMIT, bytes: Buffer.byteLength(value) });
        }
        log(`vc-secrets: ${note}the access entry could not be stored (${e.message}); `
            + "the next launch will exchange one\n");
    }
}

// Once the refresh token has rotated, both stored entries are lies: the stored one cannot be
// redeemed, and the access token that went with it keeps working until it expires, at which point
// the session dies mid-use with nothing to renew from. Clearing both makes the state unambiguously
// signed-out. Best effort, because the write failure is the actionable one and a delete's error must
// not displace it.
async function clearEntryPair(remove, keys) {
    for (const stale of keys) {
        try {
            await remove(stale);
        } catch { /* best effort — the write failure is what the developer must see */ }
    }
}

// The real backends behind ensureFreshToken's seams. Nothing here decides anything: the storage
// rules live in vc-secrets-cache.mjs and the protocol in vc-secrets-oauth.mjs.
//
// entryName/decl/cfg go to oauthEntryKeys rather than to cache.entryNames (which the source used):
// oauthEntryKeys already fills that role for this package (it is what keyFor/buildLocalRead agree
// on — see the comment beside its own test), and it returns FULL three-segment keystore keys
// ("vc-secrets:<scope>:<name>"), never a bare entry name. Every read/write below is built from one
// of those full keys.
//
// `seed`: raw outcomes of the launch's one batched Credential Manager call (readWcmBatch's `outcomes`), by
// full key -- or null. It exists to save the first readCache of a launch its PowerShell round trips and
// answers nothing else: readCache takes it and drops it before its first read, so the re-read under the
// lock, every poll while another launcher holds it and every renewal tick read the store itself. That is
// what the refresh token's safety rests on -- the exchange spends the token it read under the lock, never
// one batched before the lock was asked for, which a neighbour may have rotated since. An outcome is
// interpreted only when consumed, by the same branches as a read that ran then.
function oauthLaunchDeps(entryName, decl, cfg, { backend = detectLocalBackend(), env = process.env,
    run = runTool, write = writeSecretValue, remove = null, seed = null } = {}) {
    const keys = oauthEntryKeys(entryName, decl, cfg);
    // `= null` in the parameter list and resolved here, the way cmdLogin and cmdLogout resolve their
    // own locks: the default needs `backend`, `env` and `run`, and reading sibling parameters out of
    // one destructuring pattern relies on evaluation order that is easy to break by reordering the
    // list. A seam at all because the default DELETES — on gpg it is an `fs.rmSync` of a real file in
    // the developer's keystore — and a test that reaches this path without injecting it would do
    // that from a run that looks entirely green. That has happened once already, to cmdLogin's
    // equivalent seam; the note is on loginDeps in the test file.
    const removeEntry = remove ?? deleteEntryIo(backend, env, { run });
    // The raw read: what the backend printed for `key`, or what it threw. A batched outcome stands in for the
    // run when there is one, and throws the very error that run would have -- so everything past this point,
    // absent-versus-failure included, is one code path for both.
    const fetchRaw = (key, batched) => {
        const outcome = backend === "wcm" ? batched?.get(key) : undefined;
        if (outcome === undefined) {
            return run(buildLocalRead(backend, key, env));
        }
        if (typeof outcome.ok === "string") {
            return outcome.ok;
        }

        throw batchedReadError(psCommand(env), outcome.err);
    };
    const readEntry = async (key, batched = null) => {
        // keyToPath (not the source's flat `${name}.gpg`) — this package's gpg layout already
        // namespaces entries by scope, so the file this key resolves to is the one keyToPath
        // computes everywhere else, not a hand-built path that skips the scope directory.
        if (backend === "gpg" && !gpgEntryPresent(key, env)) {
            return undefined;
        }
        const keyName = nameFromKey(key);
        let raw;
        try {
            raw = await fetchRaw(key, batched);
        } catch (e) {
            if (isAbsentEntry(backend, e)) {
                return undefined;   // not stored: "sign in", not a tool failure
            }
            throw mapResolveError(backend, keyName, e);
        }
        try {
            const entry = cache.parseEntry(backend === "wcm" ? decodeCredBlobHex(raw).value : raw);
            if (entry === null) {
                // Both cases are named on fd 2, and this one most of all: a version skew is a
                // thing a developer can reason about, a keystore entry that has been damaged is
                // not.
                //
                // parseEntry returns null rather than throwing because node embeds the first ten
                // characters of its input in a JSON SyntaxError, and that input is a keystore blob.
                // The notice is therefore built HERE, out of the key alone, so nothing of the value
                // travels with it.
                fs.writeSync(2, `vc-secrets: the stored entry for "${keyName}" is not readable JSON`
                    + " -- treating it as absent; the next launch will sign in or exchange\n");
            }

            return entry ?? undefined;
        } catch (e) {
            // An entry written by a NEWER vc-secrets is named once and then treated as absent: the
            // next step is a sign-in either way, and refusing to launch over a cache this build
            // cannot read helps nobody.
            fs.writeSync(2, `vc-secrets: ${e.message} -- treating "${keyName}" as absent\n`);

            return undefined;
        }
    };

    return {
        readCache: async () => {
            // Taken and dropped before anything can throw: only this call may see the batch.
            const s = seed;
            seed = null;
            const refresh = await readEntry(keys.refresh, s);
            if (refresh?.refreshToken === undefined) {
                // Short-circuited before the second read: deciding "no token can be obtained
                // without interaction" is the path with a latency budget on it, and on Credential
                // Manager each read is a PowerShell P/Invoke worth one to three seconds.
                return { state: "absent" };
            }
            const status = cache.cacheStatus({ refresh, access: await readEntry(keys.access, s) },
                decl, Date.now(), os.uptime());

            // The refresh token rides back with the verdict: cacheStatus deliberately returns a
            // state and nothing else, and the exchange needs the token that state was decided on.
            return status.state === "needs-refresh" ? { ...status, refreshToken: refresh.refreshToken } : status;
        },
        writeCache: async (fresh) => {
            // RFC 6749 section 6 makes refresh_token optional on the refresh grant. Writing the
            // entry regardless would serialise `undefined` over a LIVE refresh token, and the
            // next launch would demand a sign-in that nothing had actually invalidated.
            if (fresh.refreshToken !== undefined) {
                try {
                    await write(keys.refresh, cache.serializeRefresh({ refreshToken: fresh.refreshToken,
                        tenantId: decl.tenantId, clientId: decl.clientId, scopes: decl.scopes }), { backend, env });
                } catch (e) {
                    // Both entries go, exactly as cmdLogin's identical branch does — and the reason
                    // is STRONGER here, because nobody is watching. What is on disk after this
                    // failure is a dead refresh token beside an access token that keeps working
                    // until it expires. In `login` a human reads the throw and signs in again; here
                    // the renewal timer catches it into one line on fd 2 and keeps ticking, so every
                    // later tick spends the same dead token again. Cleared, the next tick reads the
                    // entry as absent and says so.
                    //
                    // Certainly dead, not probably: this branch is reached only with a NEW refresh
                    // token in hand, so Entra has rotated and what is stored cannot be redeemed.
                    await clearEntryPair(removeEntry, [keys.access, keys.refresh]);
                    // The one irreversible step: Entra invalidated the previous refresh token the
                    // moment it issued this one, so a failure here IS a signed-out state and must
                    // name the entry and the remedy rather than the tool that refused.
                    throw new VcSecretsError(`the renewed refresh token could not be stored in "${keys.refresh}" `
                        + `(${e.message}) -- run "vc-secrets login ${entryName}"`);
                }
            }
            // The renewal path is where an oversize entry HURTS, which is why it records the marker
            // at all. RENEWAL_TICK_MS fires every five minutes and the tick decides from the store,
            // so an access entry that never lands means an exchange -- and a refresh-token rotation
            // -- every five minutes, indefinitely, reported as one fd-2 line each time and never as
            // a condition.
            await storeAccessEntry(keys.access, cache.serializeAccess(fresh), {
                write: (k, v) => write(k, v, { backend, env }),
                marker: {
                    clear: (k) => clearOversizeMarker(k, env),
                    record: (k, meta) => recordOversizeMarker(k, { ...meta, env }),
                },
                log: (s) => fs.writeSync(2, s),
                backend,
            });
        },
        exchange: (refreshToken) => oauth.exchange(decl.tenantId, oauth.buildTokenBody({ kind: "refresh",
            clientId: decl.clientId, refreshToken, scopes: decl.scopes })),
        acquireLock: tokenLockFor(entryName, decl, cfg, { env }),
    };
}

// The per-launch delivery channel a mid-session renewal uses to hand a fresh token into the
// server process it is already running -- the launcher's other half of ensureFreshToken's
// contract. Nothing here decides WHEN to renew; cmdLaunch owns the timer and calls push() on it.
const CHANNEL_GREETING_MAX = 4096;

// NOT the lock's namespace, and the asymmetry is deliberate: the lock binds an abstract socket
// precisely because nothing secret crosses it, and a token crosses this one. An abstract name has
// no filesystem entry and therefore no mode bits at all, so the channel is a filesystem socket at
// 0600 -- gated by uid AND by the nonce. On Windows a named pipe takes no mode bits either, which
// is what makes the nonce mandatory rather than defence in depth.
// On Windows the pipe name is the channel's ENTIRE identity: a named pipe takes no mode bits, so
// nothing else separates one developer's channel from another's, or one launch from a concurrent
// one. Per LAUNCH rather than per server -- two sessions may run the same server at once -- so the
// pid belongs in the name rather than in every caller's memory. Extracted for the same reason
// lockPathFor is: the collision properties are worth asserting, and an inlined name cannot be.
function channelPipeName(name, scopeKey, { env = process.env, pid = process.pid } = {}) {
    return `\\\\.\\pipe\\vc-secrets-ch-${cache.sanitize(env.USERNAME || "user")}-${cache.sanitize(scopeKey)}-${cache.sanitize(name)}-${pid}`;
}

async function createChannel({ name, scopeKey, nonce, onRefusal = () => {}, chmod = fs.chmodSync,
    rm = (dir) => fs.rmSync(dir, { recursive: true, force: true }) }) {
    // /tmp rather than os.tmpdir(): sun_path is ~104 bytes, and a redirected TMPDIR can be long
    // enough to overflow it. An overflowing path still BINDS -- libuv truncates it rather than
    // refusing it -- so where the cut lands decides what happens next: measured here, the chmod
    // below can throw ENOENT because nothing exists at the full path, or the bind can land on a
    // path already in use (EADDRINUSE), or truncation can place the socket outside this
    // directory entirely. lockPathFor's own darwin branch makes the same call for the same reason.
    const dir = process.platform === "win32" ? null : fs.mkdtempSync(path.join("/tmp", "vc-secrets-ch-"));
    const channelPath = process.platform === "win32" ? channelPipeName(name, scopeKey) : path.join(dir, "c.sock");
    const nonceDigest = crypto.createHash("sha256").update(String(nonce)).digest();
    const clients = new Set();
    // The last token pushed, handed to a client that authenticates later. A push reaching only
    // the sockets connected at that instant is lost with no error anywhere when the server has
    // not finished starting, and the session then runs to the expiry of its env token -- the very
    // failure the channel exists to prevent, reintroduced by the delivery mechanism.
    let latest = null;
    const frameOf = (token) => JSON.stringify({ token }) + "\n";
    const server = net.createServer((sock) => {
        let greeting = "";
        const refuse = (why) => {
            onRefusal(why);
            fs.writeSync(2, `vc-secrets: channel client refused (${why})\n`);
            sock.destroy();
        };
        const onData = (buf) => {
            greeting += buf.toString("utf8");
            if (greeting.length > CHANNEL_GREETING_MAX) {
                refuse("oversize");

                return;
            }
            const nl = greeting.indexOf("\n");
            if (nl < 0) {
                return;   // a stream socket may deliver the greeting in pieces
            }
            sock.off("data", onData);
            let ok = false;
            try {
                const presented = JSON.parse(greeting.slice(0, nl)).nonce;
                // Digests, because timingSafeEqual throws on unequal lengths: comparing the raw
                // values would make a wrong-LENGTH nonce distinguishable from a wrong-value one.
                ok = crypto.timingSafeEqual(crypto.createHash("sha256").update(String(presented)).digest(), nonceDigest);
            } catch {
                ok = false;
            }
            if (!ok) {
                refuse("nonce");

                return;
            }
            clients.add(sock);
            if (latest !== null) {
                sock.write(frameOf(latest));
            }
        };
        sock.on("data", onData);
        sock.on("close", () => clients.delete(sock));
        sock.on("error", () => { clients.delete(sock); sock.destroy(); });
    });
    // `clients` above is the PUSH set -- who gets the next token -- and is not the teardown's
    // bookkeeping. Keeping them separate is deliberate: a teardown that depended on the push set
    // would silently weaken whenever that set's membership rules changed.
    const severedClose = severingClose(server);
    try {
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(channelPath, resolve);
        });
        if (dir !== null) {
            chmod(channelPath, 0o600);
        }
    } catch (e) {
        // The directory exists from mkdtempSync above and the server may already be bound. A
        // caller that CATCHES this would otherwise hang on a live listener and leave the
        // directory behind.
        try {
            server.close();
        } catch { /* never listened */ }
        if (dir !== null) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
        throw e;
    }
    // A successful listen does NOT remove the once("error", reject) above -- a `once` listener is
    // removed only when it FIRES, and that promise already resolved without one. So an error
    // emitted after this point would still reach that stale, already-settled `reject`: a silent
    // no-op, reported nowhere. What actually keeps the channel from dying is the reporter added
    // below -- a net.Server with NO listener at all for "error" throws, straight into
    // process.on("uncaughtException") and out through fail(). removeAllListeners here only clears
    // the stale reject before adding the reporter, so the two do not both run on one emit for no
    // reason; it is the reporter, not this call, that stands between an error and a crash.
    server.removeAllListeners("error");
    server.on("error", (e) => fs.writeSync(2, `vc-secrets: channel error: ${e.code ?? e.message}\n`));
    server.unref();   // the channel must not keep the launcher alive
    const removeSync = () => {
        if (dir !== null) {
            try {
                rm(dir);
            } catch { /* best effort: an exit handler has nowhere to report to */ }
        }
    };

    return {
        path: channelPath,
        push: (token) => {
            latest = token;
            let delivered = 0;
            for (const sock of clients) {
                sock.write(frameOf(token));
                delivered += 1;
            }

            return delivered;
        },
        // How many receivers are attached right now, which push() can only answer by sending
        // something. The renewal timer asks this on every tick, and a tick that exchanges nothing
        // still needs the answer: whether anything is listening is a property of the channel, not of
        // the token.
        peers: () => clients.size,
        removeSync,
        close: () => severedClose().then(removeSync),
    };
}

// The preload side of the same channel, entered inside the child via NODE_OPTIONS=--import. It
// must be resolved beside THIS file, never against process.argv[1]: the launcher is normally
// entered through vc-secrets-shim.mjs, so argv[1] is the shim in the plugin DATA dir while the
// preload sits beside this module in the versioned plugin CACHE -- anchoring on argv[1] yields a
// path that exists, is wrong, and produces a child that starts fine and never renews.
const PRELOAD_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "vc-secrets-preload.mjs");

function buildChildEnv(base, { token, envVar, channelPath, nonce, preloadPath, targetPackage, binName }) {
    const env = sanitizeEnv(base);   // drops any inherited NODE_OPTIONS first
    env[envVar] = token;
    env.VC_SECRETS_TOKEN_CHANNEL = channelPath;
    env.VC_SECRETS_CHANNEL_NONCE = nonce;
    // The preload reads the variable name from here, not from the socket payload: the process
    // holding the credential should not take instructions about where to put it.
    env.VC_SECRETS_TOKEN_ENV = envVar;
    env.VC_SECRETS_TARGET_PACKAGE = targetPackage;
    env.VC_SECRETS_TARGET_BIN = binName;
    // The one place this package's env-sanitization decision is reversed, and the bound is this
    // line: the value is composed HERE, from a path derived from this file's own location, after
    // the inherited one has been dropped. Configuration still cannot express it (loadConfig
    // rejects the key) and backend tools still never see it (runTool sanitizes unconditionally).
    env.NODE_OPTIONS = `--import "${pathToFileURL(preloadPath).href}"`;

    return env;
}

const NODE_IMPORT_FLOOR = [18, 18, 0];

// Shared with the two refusal messages: they must distinguish "read a version, and it is too old"
// from "could not read one at all", and a second copy of this pattern would let the two drift into
// disagreeing about which case a given string is.
const NODE_VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)/;

function childNodeSupportsImport(version) {
    const match = NODE_VERSION_RE.exec(String(version ?? ""));
    if (match === null) {
        // Refused rather than assumed: an unrecognised NODE_OPTIONS flag makes node abort at
        // startup, so guessing "new enough" trades a named error here for a server that does not
        // start behind a message pointing at the flag instead of at us.
        return false;
    }
    const parts = [Number(match[1]), Number(match[2]), Number(match[3])];
    for (const [i, floor] of NODE_IMPORT_FLOOR.entries()) {
        if (parts[i] !== floor) {
            return parts[i] > floor;
        }
    }

    return true;
}

// The one wording for "this node cannot take a renewal", shared by the launch refusal and doctor's
// FAIL. They measure the same thing and used to hedge differently, which reads as two findings about
// two subjects; and a declaration whose command is not node reached a sentence calling the PATH node
// "the closest probe", which is not close to anything when nothing below `dnx` is node at all.
//
// `declared` is whether `command` is the binary that was probed. When it is not, which node runs the
// server is not knowable from the declaration -- NODE_OPTIONS reaches every node below the launcher,
// and a wrapper may resolve any of them or none -- so the sentence reports the PATH node as the thing
// measured and does not promise what the launch will do.
function childNodeRefusal({ launchableName, command, declared, version }) {
    const subject = declared
        ? `the node that runs "${launchableName}" (${command})`
        : `the node on PATH -- "${launchableName}" launches through "${command}", so which node runs it `
            + `is not knowable from the declaration --`;
    // "predates" is a version comparison, so it may only be said where a version was read. A probe
    // that could not run returns its reason here, and calling that reason old asserts a comparison
    // nothing performed -- sending the reader to upgrade a node that answered perfectly well.
    const verdict = NODE_VERSION_RE.test(String(version ?? ""))
        ? `predates --import (${NODE_IMPORT_FLOOR.join(".")})`
        : `is not a version to compare against --import (${NODE_IMPORT_FLOOR.join(".")})`;

    return `${subject} reports ${version || "no version"}, which ${verdict} -- a renewed token `
        + `could not be delivered through it`;
}

// The environment a launched child starts from, before the launchable's own values are merged in: the
// inherited one without the code-injection variables (sanitizeEnv) and without the legacy plaintext
// credentials. Every spelling of those goes, not only the canonical one, for the reason isDangerousEnvKey
// folds case: on Windows a name differing only by case is the same variable, and the result is a plain
// object that no longer folds anything, so deleting AZURE_CLIENT_SECRET leaves `Azure_Client_Secret`
// standing. Unconditional, because keeping one spelling while the declaration adds another would hand the
// child both and let the platform pick -- the merge runs after this, so whatever the launchable declares
// wins there. A stale session token must not leak into the child. Shared with the version probe, so the
// two cannot drift on what is scrubbed.
function inheritedChildEnv(env) {
    const out = sanitizeEnv(env);
    for (const key of Object.keys(out)) {
        if (LEGACY_SECRET_ENV_VARS.includes(key.toUpperCase())) {
            delete out[key];
        }
    }

    return out;
}

// The environment a node version probe resolves its command in and runs under: the inherited one, scrubbed
// as the launch's child is (inheritedChildEnv), merged with the launchable's DECLARED `literal:` values and
// nothing else. A `secret:` or `oauth:` value is left out because it would put a credential into a process
// that only has to print a version, and doctor could not resolve one without spending it. What that means
// for resolution: PATH and PATHEXT decide which binary is found, and either one declared as a `literal:`
// is seen here while one declared as `secret:` is not and stays the inherited one -- so the probe
// searches what the spawn searches only where both are literal or undeclared. One builder for the launch and for
// doctor, so the two cannot drift on what the probe is given.
function probeEnvFor(launchable, base = process.env, platform = process.platform) {
    const declaredLiterals = {};
    for (const [envVar, value] of Object.entries(launchable.env)) {
        const literal = parseLiteral(value);
        if (literal !== null) {
            declaredLiterals[envVar] = literal;
        }
    }

    return mergeDeclaredEnv(inheritedChildEnv(base), declaredLiterals, platform);
}

// What doctor asks about every oauth launchable's node, as data rather than as a side effect. Pure
// but for `probe`, which is the seam: cmdDoctor around it performs real keystore io and cannot be
// driven from a test, so leaving this inline meant the only available check was grepping the source
// -- and a grep for the presence of a guard passes against a guard that has been disabled, which was
// measured here rather than supposed.
//
// Two dedups, because oauthReferences yields one entry per ENV VAR, not per launchable.
// `seenLaunchables` keeps the report honest: a launchable naming two oauth entries is one machine
// fact and must be one finding, or doctor prints the same sentence twice and the reader goes looking
// for a second problem. (cmdLaunch refuses such a declaration, but only at launch, so doctor is where
// it is seen at all.) `probedVersions` is the cheaper one: it saves a duplicate `--version` spawn
// where several launchables resolve to the same binary. Its key is what will be probed AND the PATH it
// is looked up on -- on win32 PATHEXT too, which decides the file as much as PATH does: a declaration
// may set its own, and two launchables commanding the same name under different ones are two binaries.
// Every wrapper on the same PATH still collapses onto the one PATH entry; two spellings of one node are
// still probed twice, which costs a process and no correctness.
//
// The probe mirrors cmdLaunch, so doctor's verdict and the launch's are answers about the same binary
// rather than about two different ones -- as far as the declaration names one: a wrapper command is
// probed as `node`, and the message says so. The environment it resolves in is built by probeEnvFor for
// both: a PATH or PATHEXT declared as a `literal:` is seen, one declared as `secret:` is not and stays the
// inherited one, so the two agree except where only a credential store can supply it.
//
// `refused` is trustAssessment's problems, keyed the way `seen` is. A launchable in it is skipped: the
// probe SPAWNS the declared command, and for a repository's launchable nobody has trusted that is the
// execution the launch gate exists to refuse. The skip lives here rather than in the caller so that a
// caller cannot forget it -- which only holds while `refused` has no default: an empty one would let the
// omission pass silently, so leaving it out throws instead, and a caller with nothing refused says so
// with `new Map()`.
function childNodeProbes(cfg, references, { probe = childNodeVersionIo, platform = process.platform, env = process.env, refused } = {}) {
    if (!(refused instanceof Map)) {
        throw new Error("childNodeProbes needs `refused`, a Map of the launchables the trust gate refuses -- "
            + "probing one would run a command nobody has approved");
    }
    const probedVersions = new Map();
    const seenLaunchables = new Set();
    const out = [];
    for (const { kind, launchableName } of references) {
        const seen = `${kind}/${launchableName}`;
        if (seenLaunchables.has(seen) || refused.has(seen)) {
            continue;
        }
        seenLaunchables.add(seen);
        const { command } = cfg[kind][launchableName];
        const probed = isNodeCommand(command, { platform }) ? command : "node";
        const probeEnv = probeEnvFor(cfg[kind][launchableName], env, platform);
        // NUL cannot occur in any part, so no combination can spell another's key. PATHEXT is part of the
        // key on win32 only, where it decides which extensions the lookup tries.
        const pathValue = (platform === "win32" ? windowsEnvValue(probeEnv, "PATH") : probeEnv.PATH) ?? "";
        const memoKey = platform === "win32"
            ? `${probed}\0${pathValue}\0${windowsEnvValue(probeEnv, "PATHEXT") ?? ""}`
            : `${probed}\0${pathValue}`;
        if (!probedVersions.has(memoKey)) {
            probedVersions.set(memoKey, probe({ command: probed, env: probeEnv }));
        }
        out.push({ launchableName, command, declared: probed === command,
            version: probedVersions.get(memoKey) });
    }

    return out;
}

// Whether a declared `command` names a node binary, so its own version can be probed. A declaration
// reaches its server through `npx`, a `.bin` shim or a wrapper just as often, and for those the node
// that ends up running the entry file is not knowable from the declaration: NODE_OPTIONS reaches every
// node below the launcher, so a wrapper that ends in `exec node` delivers a renewal perfectly well --
// which node it picked is simply not something the declaration says. `dnx` is the case that genuinely
// cannot receive one, because nothing below it is node at all.
function isNodeCommand(command, { platform = process.platform } = {}) {
    if (typeof command !== "string" || command === "") {
        return false;
    }
    const P = platform === "win32" ? path.win32 : path.posix;
    const base = P.basename(command).toLowerCase();

    return base === "node" || (platform === "win32" && base === "node.exe");
}

// The node that runs the server need not be the one running this launcher — so the gate reads the
// CHILD's version. Reading our own would pass happily on a machine where the server cannot start.
//
// `command` is the binary this launch will actually spawn, when that binary is a node. A declaration
// naming an absolute node -- or any node other than the one first on PATH -- is measured by the wrong
// probe otherwise, and the error it produces is wrong in both directions: an old PATH node refuses a
// server that would have started, and a new one passes a child that then aborts on --import. Callers
// that cannot name a node (a declaration commanding `npx`, a wrapper, or anything not node at all)
// pass the literal "node" and get the PATH one, which is a proxy rather than an answer -- so the
// message built from it must say which of the two it holds. See isNodeCommand and childNodeRefusal.
//
// `env` is what `command` is resolved against and what the probe runs under: built by probeEnvFor, so that
// a PATH the declaration sets as a literal is the one searched, as it is for the spawn, and no resolved
// secret is in it. It defaults to this process's for a caller with no launchable to speak of.
//
// `run` is a seam only so the FAILURE path can be driven: the success path needs no help, but a
// probe that cannot run is the case this function now has to describe, and arranging a real spawn
// failure portably means breaking PATH resolution, whose rules differ per platform and node version.
function childNodeVersionIo({ command = "node", platform = process.platform, env = process.env, run = spawnSync,
    existsSync = fs.existsSync } = {}) {
    let invocation;
    try {
        invocation = buildSpawnInvocation(resolveSpawnCommand(command, { platform, env, existsSync }), ["--version"]);
    } catch (e) {
        // A node the resolver cannot find is a probe that could not run, which is the failure return
        // below and not an exception: both consumers turn this string into a refusal that names the
        // reason, and a throw here would escape them as an uncaught error from `doctor`.
        return `no usable version (${e.message})`;
    }
    const r = run(invocation.cmd, invocation.args,
        // Sanitized like runTool's and cmdLaunch's children, and last so no invocation option can
        // put a loader back. What this seam can actually show is the loud failure: node validates
        // NODE_OPTIONS even for --version, so an inherited value it rejects leaves the probe empty
        // and the launcher refuses a server that would have started. Measured: --version exits
        // before any preload runs, so an inherited `--require` does not execute in THIS child; it
        // would in any child that runs code, which is why this call sanitizes on the same rule
        // rather than on a weaker per-site judgement.
        { encoding: "utf8", timeout: TIMEOUT_LOCAL_MS, windowsHide: true, ...invocation.opts,
            env: sanitizeEnv(env) });
    if (r.error || r.status !== 0) {
        // The reason rides out in the RETURN VALUE, because both consumers turn this into a refusal
        // AND a message, and both were handed "". A node missing from PATH, a node killed by the
        // timeout, and a node that aborted because it rejected an inherited NODE_OPTIONS all read as
        // "no version" -- and that last one is the case this probe was added to catch, so it was the
        // one indistinguishable from the others. Any non-version string still fails
        // childNodeSupportsImport's match, so what happens next is unchanged; only what the
        // developer is told changes. A child killed by a signal carries no status at all, so the
        // signal is the part that names it. The OOM killer on a loaded machine reaches this branch;
        // `TIMEOUT_LOCAL_MS` does not, because spawnSync reports that one as ETIMEDOUT on `error`,
        // which is both earlier here and the more precise of the two answers.
        return `no usable version (${r.error?.code ?? r.error?.message
            ?? (r.signal ? `killed by ${r.signal}` : `exit ${r.status}`)})`;
    }

    return (r.stdout ?? "").trim();
}

// The interactive sign-in callback surface: the loopback listener that receives Entra's redirect,
// the leaf that decides what a given request means, the two tiny pages the browser ends up
// looking at, and the browser opener. No storage, no mutex — that is `login`'s job, not this one's.

// Root, not a descriptive path like "/callback". Entra matches the redirect URI as a string, and
// the app registration carries the bare `http://localhost` — a registered URI with no path segment
// matches only a request that has none. A path here is refused with AADSTS50011 while every local
// test still passes, because nothing local knows what Entra was told.
const REDIRECT_PATH = "/";
const MAX_ERROR_PARAMS = 20;
// The tab title says WHICH sign-in this was, because a machine can hold more than one: entries are
// named per organisation now, so two projects can each have a tab open and "vc-secrets" on both of
// them is the one thing a developer cannot use to tell them apart. Escaped although the name is
// validated `[a-z0-9-]+` at load -- the page should not depend on a check made somewhere else.
function closeTabPage(entryName = null) {
    const who = entryName ? `Signed in - ${escapeHtml(entryName)}` : "Signed in";

    return `<!doctype html><meta charset=utf-8><title>${who}</title>`
        + "<p>Signed in. You can close this tab.";
}
// The browser is where the developer is looking. Telling them "Signed in" after Entra refused
// them sends them away from the terminal that holds the AADSTS code naming what went wrong —
// which is the very thing handleCallback's error branch exists to surface.

// Everything Entra put in the redirect is in THIS request, so asking the developer to read their own
// address bar was asking them to fetch what we already hold. `access_denied` measured with no
// `error_description` at all — and a one-word reason is not something anyone can act on.
// The terminal is a second sink with a different alphabet and the same sender. A control byte there
// is a command, not text: CSI can move the cursor and overwrite what is already on screen, and OSC
// reaches the window title or, on some terminals, the clipboard. Escaping the HTML sink and leaving
// this one raw would have been protecting the cheaper of the two.
function forTerminal(value, limit = 200) {
    // "?" and not U+FFFD: the replacement has to survive the console this is sanitising FOR. The
    // replacement character is itself non-ASCII, so on the code page that turned an em dash into
    // mojibake it would arrive as mojibake too -- a sanitiser producing the thing it exists to remove.
    const flattened = String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, "?");

    return flattened.length > limit ? `${flattened.slice(0, limit)}...` : flattened;
}

// JSON for a terminal, where it may also be pasted back. JSON.stringify escapes C0 itself but leaves DEL
// and C1 raw, and C1 holds the 8-bit CSI; it also leaves raw the characters that print as nothing or
// reorder what is around them -- the soft hyphen, the Arabic letter mark, the Mongolian vowel separator,
// the zero-width and directional marks (U+200B-U+200F), the line and paragraph separators and the bidi
// embeddings and overrides (U+2028-U+202E), the invisible operators and bidi isolates (U+2060-U+206F) and
// the byte-order mark. A right-to-left override in an argument makes a review read as something it is not.
// The list is the common offenders, not every character that renders as nothing: tag characters,
// variation selectors and a few fillers still pass. All of them are written as \u escapes rather
// than flattened to "?" the way forTerminal does: the text stays inert on the screen AND still parses to
// the declared bytes, so a shape the reader pastes into an authorization matches the declaration it was
// printed from.
const JSON_ESCAPED_RE = /[\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;

function jsonForTerminal(value, space) {
    return JSON.stringify(value, null, space)
        .replace(JSON_ESCAPED_RE, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Escaped, not because the values are trusted but because they are not: anything that can reach the
// loopback port during a sign-in chooses them, and an unescaped one would execute as script on this
// page's own origin.
function failedPage({ error, description, extras = [] }, entryName = null) {
    const rows = [["error", error]].concat(description ? [["error_description", description]] : [], extras)
        .map(([k, v]) => `<tr><td>${escapeHtml(k)}<td>${escapeHtml(v)}`).join("");

    // "Sign-in failed", never "signed in" -- in the title here and in the body below alike: either is
    // read at a glance, and a test pins that this page cannot be mistaken for the success one.
    const who = entryName ? `Sign-in failed - ${escapeHtml(entryName)}` : "Sign-in failed";

    return `<!doctype html><meta charset=utf-8><title>${who}</title>`
        + "<style>body{font:14px system-ui;margin:2rem}td{padding:.2rem .6rem;vertical-align:top}"
        + "td:first-child{color:#666;white-space:nowrap}</style>"
        + "<p><strong>Sign-in failed.</strong> The same reason is printed in the terminal where you ran"
        + " <code>vc-secrets login</code>."
        + `<table>${rows}</table>`
        + "<p>An <code>access_denied</code> with no description usually means the browser carried no work"
        + " account, and its sign-in page asked for one to be added to the browser profile instead."
        + " The other two causes are a declined consent prompt and an account not assigned to this"
        + " application -- so check which account the browser used.";
}

// Binds an ephemeral port on the loopback interface only, and resolves `next()` with the first
// request that is actually a callback. Everything else is answered 404 and waited past, so a
// browser fetching /favicon.ico cannot abort a sign-in that is about to succeed.
function listenForCallback(expectedState, { entryName = null,
    log = (line) => process.stderr.write(line) } = {}) {
    return new Promise((resolve, reject) => {
        let settle = null;
        const arrived = new Promise((r) => { settle = r; });
        const server = http.createServer((req, res) => {
            const verdict = handleCallback(req, expectedState, REDIRECT_PATH);
            if (verdict.ignore) {
                if (verdict.notice) {
                    // Said out loud, because the alternative is a sign-in that waits with no reason
                    // given. Repeatable by whoever sent it, which is why it is a notice and not a
                    // failure.
                    log(`vc-secrets: ${verdict.notice}\n`);
                }
                res.writeHead(404).end();

                return;
            }
            res.writeHead(verdict.error ? 400 : 200, { "content-type": "text/html; charset=utf-8" })
                .end(verdict.error ? failedPage(verdict, entryName) : closeTabPage(entryName));
            settle(verdict);
        });
        const severedClose = severingClose(server);
        // `reject` rejects the BIND, and is inert once listen has resolved -- after that a server
        // error would vanish while next() waited forever. Settling as well makes a listener that dies
        // mid-sign-in end the wait with a reason instead of hanging. createChannel's own
        // `server.on("error", ...)` is the counterpart for the same shape there -- it reports
        // rather than settles, because by the time that listener fires createChannel has already
        // returned and left no pending caller to settle.
        server.once("error", (e) => {
            reject(e);
            settle({ error: "listener_failed", description: e.code ?? e.message });
        });
        // 127.0.0.1 explicitly, never 0.0.0.0: the authorization code arrives in this request,
        // and a listener on every interface would accept it from the network.
        server.listen(0, "127.0.0.1", () => resolve({
            port: server.address().port,
            next: () => arrived,
            close: severedClose,
        }));
    });
}

// Spread spec.opts rather than ignoring it: the win32 spec needs windowsVerbatimArguments, and the
// previous inline default silently dropped whatever the builder asked for. A spec field nothing reads
// is worse than no field -- the builder looks correct and the launch is not.
function openBrowser(spec, { spawnProcess = spawn, log = (line) => process.stderr.write(line) } = {}) {
    const child = spawnProcess(spec.cmd, spec.args,
        { stdio: "ignore", detached: true, windowsHide: true, ...spec.opts });
    // A missing opener fails ASYNCHRONOUSLY, so the caller's try/catch is long gone by then and an
    // unhandled `error` would end the sign-in on a stack trace. Losing the browser is a degradation:
    // the URL is already printed and the listener is already waiting.
    child.on("error", (e) => log(`vc-secrets: could not open a browser (${e.code ?? e.message})`
        + " -- open the sign-in URL above by hand\n"));
    // `error` covers a spawn that never happened; this covers one that happened and then failed,
    // which is the commoner shape and was invisible. wslview with interop off, xdg-open on a
    // headless host and a policy-blocked powershell all spawn cleanly and exit non-zero, so the
    // sign-in went on waiting for a browser that was never going to appear with nothing said.
    //
    // Falsy rather than `!== 0`, because it must also pass over the null a signal gives: an opener
    // the developer killed, or one that execs into a browser and dies with it, is not the opener
    // reporting a failure of its own.
    child.on("close", (code) => {
        if (code) {
            log(`vc-secrets: the browser opener exited with code ${code}`
                + " -- open the sign-in URL above by hand\n");
        }
    });

    return child.unref();
}

function buildBrowserCommand(platform, env, url, onPath = commandOnPath,
    resolveCommand = (command) => resolveSpawnCommand(command, { platform, env })) {
    if (platform === "darwin") {
        return { cmd: "open", args: [url] };
    }
    if (platform === "win32") {
        // The empty string is a title placeholder: `start <url>` would consume the URL as the
        // window title and open nothing.
        //
        // Verbatim, with the URL quoted, because cmd.exe does not use the argv it was handed. It
        // re-parses everything after /c as one string, where a bare & separates commands -- and node
        // does not quote an argument that has no spaces, so an authorize URL arrives with every &
        // exposed. Measured on Windows: the browser received the URL truncated at `client_id`, and
        // Entra answered `AADSTS900144` naming the `scope` it was never sent. The argv-element form
        // this replaced was green in a test that asserted the element, which is not the property
        // cmd.exe reads. Same technique buildSpawnInvocation already uses for a .cmd shim.
        if (url.includes('"')) {
            // Cannot arrive from the outside today -- the URL is built here from guids, base64url and
            // configured scopes -- so this is an invariant made checkable rather than a guess about
            // input. Thrown before the browser opens, so no authorization code is at stake.
            throw new VcSecretsError("refusing to open a URL containing a double quote");
        }

        // Resolved to an absolute path, never the bare name libuv would look up in the cwd first. An
        // unresolvable cmd.exe is "no opener" rather than an error: sign-in still completes by hand
        // from the URL cmdLogin has already printed.
        let shell;
        try {
            shell = resolveCommand("cmd.exe").cmd;
        } catch (e) {
            if (e instanceof VcSecretsError) {
                return null;
            }
            throw e;
        }

        return { cmd: shell, args: [`/c start "" "${url}"`], opts: { windowsVerbatimArguments: true } };
    }
    // Named to match this package's own override convention (VC_SECRETS_LOCAL_BACKEND,
    // VC_SECRETS_POWERSHELL), not the source's launcher-prefixed spelling -- the public-repo rule
    // is that the source tool's own name must not survive into this one, env vars included.
    if (env.VC_SECRETS_WSL_NO_INTEROP === "1") {
        return null;
    }
    // Interop first, and deliberately ahead of xdg-open: inside WSL, xdg-open reaches for a Linux
    // browser that may not be installed, while these two hand the URL to the Windows default
    // browser — which is the one the developer is already signed into.
    if (onPath("wslview")) {
        return { cmd: "wslview", args: [url] };
    }
    if (onPath("powershell.exe")) {
        // Quoted for the same reason the win32 branch quotes, in the other shell's syntax: everything
        // after -Command is joined back into script text, and & is an argument-mode metacharacter
        // anywhere in a token, not only between commands (about_Parsing, "Handling special
        // characters"). Measured on Windows PowerShell 5.1: the unquoted form does not truncate the
        // URL, it does not parse at all -- exit 1, nothing on stdout, "The ampersand (&) character is
        // not allowed" -- so no browser opens and the developer is left with the by-hand fallback.
        // A single-quoted literal interpolates nothing, and arrived whole in the same measurement.
        if (url.includes("'")) {
            // Same shape as the double-quote guard above: the URL is built here, so this is an
            // invariant made checkable rather than a guess about input, and it throws before the
            // browser opens, with no authorization code at stake.
            throw new VcSecretsError("refusing to open a URL containing a single quote");
        }

        return { cmd: "powershell.exe", args: ["-NoProfile", "-Command", "Start-Process", `'${url}'`] };
    }
    if (onPath("xdg-open")) {
        return { cmd: "xdg-open", args: [url] };
    }

    return null;
}

// Filters before it interprets. Only a code or an error ends the wait; anything else is answered
// 404 and the listener keeps waiting.
function handleCallback(req, expectedState, redirectPath) {
    if (req.method !== "GET") {
        return { ignore: true };
    }
    const parsed = new URL(req.url, "http://127.0.0.1");
    if (parsed.pathname !== redirectPath) {
        return { ignore: true };   // favicon, or any path that is not the callback
    }
    // The path stopped discriminating when the callback moved to "/" to match the registered bare
    // `http://localhost`: every stray loopback GET now reaches this far. A real redirect carries
    // state and either a code or an error, so a request with none of the three is not a response to
    // this sign-in. Without this branch such a request falls into the state check below and ends the
    // wait with "state_mismatch" — aborting the sign-in and telling the developer they are under
    // attack, when a port scanner or the browser asking for "/" is the whole story. Reachable from
    // Windows under WSL, where loopback spans the boundary and the port is reachable from processes
    // outside this kernel — by port forwarding under nat, by a shared stack under mirrored.
    if (!parsed.searchParams.has("code") && !parsed.searchParams.has("error")
        && !parsed.searchParams.has("state")) {
        return { ignore: true };
    }
    // AFTER the state check, and this reverses an earlier decision here. The old order read `error`
    // first so that a genuine Entra failure showed its AADSTS code instead of a mismatch warning --
    // a good goal, kept below, because an error with a MATCHING state is still reported before the
    // code is looked at.
    //
    // What the old order also allowed: anything able to reach this port sends `?error=whatever` with
    // no state and ends the sign-in, repeatedly, with a message naming a cause the developer does not
    // have. The abort is cheap -- `login` is retryable -- but the false diagnosis is not. So a
    // request whose state does not match this sign-in decides nothing, and says so rather than
    // vanishing: if Entra ever does redirect an error without echoing state, the notice is what keeps
    // that visible instead of hanging silently.
    if (parsed.searchParams.get("state") !== expectedState) {
        return { ignore: true,
            notice: "a request reached the callback port carrying a state that is not this sign-in's"
                + " -- ignored, still waiting" };
    }
    const error = parsed.searchParams.get("error");
    if (error) {
        // Every remaining parameter, because the useful one is whichever Entra chose to send: a
        // measured `access_denied` carried no description, and reporting two fixed fields threw the
        // rest away unseen. `code` is excluded rather than trusted absent — it has no business on an
        // error redirect, and echoing one into a page or a log is the single thing this must not do.
        // Bounded here rather than at each sink, so the page and the terminal inherit one limit. A
        // real redirect carries a handful; anything that can reach this port can send thousands.
        const extras = [...parsed.searchParams.entries()]
            .filter(([k]) => !["error", "error_description", "code"].includes(k))
            .slice(0, MAX_ERROR_PARAMS);

        return { error, description: parsed.searchParams.get("error_description") ?? "", extras };
    }
    const code = parsed.searchParams.get("code");

    return code ? { code } : { error: "no_code" };
}

// Generous on purpose. Its job is to end a HANG, not to hurry a human through MFA, a password
// change or a first-time consent prompt -- anyone actually signing in returns long before it, and
// anyone who is not gets the URL and a reason instead of a cursor. Nothing in the protocol bounds
// this wait: the authorization code does not exist until the callback arrives, so its own short
// lifetime constrains what happens after, never how long we may wait for it.
const LOGIN_WAIT_MS = 10 * 60 * 1000;

// Races a promise against a timer that is ALWAYS cleared. A bare Promise.race leaves the timer
// pending on the winning path too, and node keeps the process alive until it fires -- so a sign-in
// that completed in ten seconds would hold the CLI open for the remaining ten minutes, looking
// exactly like the hang the deadline was added to prevent.
function withDeadline(promise, ms, onTimeout) {
    let timer = null;
    const expiry = new Promise((resolve) => { timer = setTimeout(() => resolve(onTimeout()), ms); });

    return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

async function cmdLogin(serverName, cfg, {
    listen = listenForCallback,
    open = openBrowser,
    browser = buildBrowserCommand,
    exchange = oauth.exchange,
    writeEntry = (name, value) => writeSecretValue(name, value),
    removeEntry = null,
    randomState = () => crypto.randomBytes(32).toString("base64url"),
    log = (line) => process.stderr.write(line),
    backend = detectLocalBackend(),
    acquireLock = null,
    now = Date.now,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    waitMs = LOGIN_WAIT_MS,
    oversize = null,
    trustState = null,
} = {}) {
    const decl = (cfg.oauth ?? {})[serverName];
    if (!decl) {
        throw new VcSecretsError(`unknown oauth entry "${serverName}" -- not declared in ${CONFIG_NAME}`);
    }
    // Refused on policy here: before the capability check below, and before anything is bound or
    // opened. Minting is the privileged act — consent happens in a browser and the refresh token it
    // yields outlives the session, so a repository that names an app registration would otherwise
    // cause a delegated token to be minted against it. resolveEnvEntries polices which launchable
    // may CONSUME a token, which is a different question from whether the token may exist at all.
    // The order also matters: telling someone who is not allowed to sign in that their machine has
    // no keystore sends them to fix the wrong thing.
    //
    // Keyed on `home`, not on the returned block: a user-scope declaration carrying no `authorized`
    // yields an absent block too, and refusing on that would demand a second opt-in in the file
    // that IS the opt-in. And `=== undefined` rather than a truthy test, because validateAuthorized
    // rejects every non-object at this leaf when the config loads — absent is the only other state
    // a real config reaches, so a truthy test would be a proxy for what the loader guarantees.
    if (decl.home !== USER_SCOPE) {
        const source = authorizationFor(cfg, decl);
        if (source.block === undefined) {
            // Carries DOCTOR_REMEDY like every other authorization refusal, because doctor now reports
            // an absent registration block through TWO paths: the crossing loop, when a project- or
            // local-scope launchable already names the entry (crossingProblem's own comment); and the
            // loop below it otherwise, for a declaration nothing references or that only a user-scope
            // launchable does. Either way naming the command here is true. Enforced by the rule
            // stated above authorizationRefusal.
            throw new VcSecretsError(`"vc-secrets login ${serverName}" is not authorized -- the app`
                + ` registration it names must be acknowledged at ${source.where} in`
                + ` ${CONFIG_HINT_PATH}${DOCTOR_REMEDY}`);
        }
        // The acknowledgement above says the person accepts this app registration; it says nothing about
        // WHICH project's sign-in this entry replaces. The keys are namespaced by the repository's own
        // projectId, so a repository claiming another project's id would have this login overwrite that
        // project's tokens. Trust is what pins the id. Still before the capability check, the browser and
        // the listener.
        requireNamespaceTrust(cfg, "oauth", serverName, trustState);
    }
    if (!LOCAL_BACKENDS.includes(backend)) {
        // Checked before anything is bound or opened. The alternative is to discover it at the
        // very end: the developer signs in, the exchange spends the authorization code, and only
        // then does the store fail — and a code is single-use, so that ordering turns a missing
        // capability into a sign-in that cannot even be retried cleanly.
        throw new VcSecretsError(`"vc-secrets login" has no keystore on backend "${backend}" -- nothing could store the token`);
    }
    // Resolved here rather than defaulted in the parameter list: tokenLockFor needs `decl` and
    // `cfg` (this package's keystore keys are scoped per project — see tokenLockFor's own
    // comment), neither of which exists until the guard above has run. The parameter list still
    // carries a bare `acquireLock = null` in the source's position so that cmdLoginSeams' parse of
    // this function's own text keeps finding it as a seam.
    const acquire = acquireLock ?? tokenLockFor(serverName, decl, cfg);
    const removeStale = removeEntry ?? deleteEntryIo(backend);
    // A seam for the same reason removeEntry is one: the default TOUCHES THE FILESYSTEM under the
    // developer's own config directory, and a test that reaches either path without injecting it
    // does that from a run that reports nothing but a pass.
    const marker = oversize ?? { record: recordOversizeMarker, clear: clearOversizeMarker };
    const { verifier, challenge } = oauth.createPkcePair();
    const state = randomState();
    const server = await listen(state, { entryName: serverName });
    try {
        // `localhost` although the listener binds 127.0.0.1, and the two must NOT be harmonised:
        // this string is matched against the app registration, which carries `http://localhost`,
        // and Entra ignores the port only for that host. 127.0.0.1 is a different registered URI —
        // one the portal cannot even add over http, so it is not the one an administrator created.
        //
        // The port comes from the listener rather than a guess for the mirror reason: Entra would
        // redirect the browser to a port nothing is listening on, and the sign-in hangs silently.
        const redirectUri = `http://localhost:${server.port}${REDIRECT_PATH}`;
        const url = oauth.buildAuthorizeUrl({ tenantId: decl.tenantId, clientId: decl.clientId,
            scopes: decl.scopes, redirectUri, state, challenge });
        // Printed on EVERY path, and before the opener rather than instead of it. The URL carries
        // the tenant, the client, the redirect and the PKCE CHALLENGE; the verifier never leaves
        // this process, pinned by "cmdLogin: the verifier never leaves the process, only its digest
        // does". So it is not a secret, and every degradation that can follow points at it:
        // openBrowser's two failure lines say "open the sign-in URL above by hand", and
        // withDeadline's timeout verdict says the same. Printed only when there was no opener, that
        // advice named something the developer had never been shown.
        log(`vc-secrets: open this URL to sign in to "${serverName}":\n${url}\n`);
        const spec = browser(process.platform, process.env, url);
        if (spec) {
            open(spec);
            log("vc-secrets: a browser is being opened on it\n");
        }
        // `next()` resolves only when the callback arrives, and every way a browser fails to reach
        // it is silent, so the wait needs a bound of its own. It resolves to a VERDICT rather than
        // throwing, so the `verdict.error` branch below reports a deadline exactly as it reports
        // any other failed sign-in -- declawing included.
        const verdict = await withDeadline(server.next(), waitMs, () => ({ error: "timed_out",
            description: `nothing reached the callback within ${Math.round(waitMs / 1000)}s`
                + " -- if no browser opened, sign in with the URL above and run this again" }));
        if (verdict.error) {
            // The extras carry whatever Entra chose to send instead of a description; without them
            // an `access_denied` reaches the developer as one word they can do nothing with.
            const extras = (verdict.extras ?? [])
                .map(([k, v]) => `${forTerminal(k, 40)}=${forTerminal(v)}`).join(", ");
            throw new VcSecretsError(`sign-in for "${serverName}" failed: ${forTerminal(verdict.error, 60)}`
                + (verdict.description ? ` -- ${forTerminal(verdict.description, 400)}` : "")
                + (extras ? ` (${extras})` : "")
                + (verdict.description ? "" : " -- no description was sent; the usual causes are a"
                    + " declined consent prompt or an account not assigned to the application"));
        }
        const parsed = await exchange(decl.tenantId, oauth.buildTokenBody({ kind: "code",
            clientId: decl.clientId, redirectUri, code: verdict.code, verifier, scopes: decl.scopes }));
        const names = oauthEntryKeys(serverName, decl, cfg);
        // Taken HERE and not before the browser: one mutex serialises every renewal on this
        // machine, and a sign-in waits on a human, so holding it across that would stall every
        // launch for minutes. What it does cover is the window between the exchange and the writes,
        // where a renewal finishing first would have its own write land second and replace the
        // token this sign-in just obtained. This matters MORE here than in the source: entries are
        // keyed per project (oauthEntryKeys, not a bare server name), so one machine routinely
        // holds several of them signed in at once, each a login of its own.
        //
        // What the late placement LEAVES OPEN, and no mutex can close: a logout that runs while
        // this sign-in is still at the browser takes the lock uncontended, deletes both entries,
        // and reports a removal — then these writes land and the credential is back. The two never
        // overlap, so it is an ordering, not a race; closing it needs an epoch a logout bumps and
        // a login re-checks here. Deliberately not built: the shape of it is "a human left a tab
        // open across a logout", and the cost is a third entry plus a write on every logout.
        // Every failure to get the lock is caught, including the ones acquireTokenLock rethrows.
        // Past this line the authorization code is SPENT: an exception here stores nothing, clears
        // nothing, and leaves the previous login's entries in exactly the lying state the fatal
        // write branch below exists to prevent — and the developer cannot retry with the same code.
        // A reason of its own, not acquireTokenLock's "unbindable". That function classifies
        // deliberately and RETHROWS what it refuses to classify -- a TypeError from broken wiring,
        // an EMFILE under fd exhaustion -- with its own comment calling a wide catch exactly the
        // mistake this used to make: relabelling them here put them back under "the sandbox refused
        // the bind", a diagnosis nobody had made, and the reader went to check their sandbox.
        // Only the label changes HERE; storing the token anyway is unchanged and deliberate. The
        // wording that goes with it is at the `lock-failed` branch.
        const { lock, reason, error } = await acquireTokenLock({ acquireLock: acquire, now, sleep, log })
            .catch((e) => ({ lock: null, reason: "lock-failed", error: e }));
        if (reason === "busy") {
            // Waited the full ceiling and gave up. Worded as "was still holding" rather than "is":
            // the latch that got us here remembers a holder was SEEN, not that one is there now.
            // Stored anyway, which is deliberate for every unserialised reason here — but a holder
            // that later wakes and completes will overwrite this, and the developer would otherwise
            // meet that only as an unexplained request to sign in again.
            //
            // A sign-in under a DIFFERENT principal is the case the advice has to name, because it
            // is the one that stays SILENT. This path deletes the access entry while the previous
            // principal's refresh entry is still readable, so a renewal that wakes inside that
            // window exchanges it and stores that principal's pair. Nothing then asks for anything:
            // reads serve the previous account until its access token expires. cmdLogout is the
            // remedy rather than a second sign-in because it removes BOTH entries, leaving a waking
            // renewal nothing to exchange; a second sign-in re-opens this very window, since it too
            // leaves the previous refresh entry readable until it overwrites it.
            //
            // cmdLogout takes this same lock and refuses while the holder is still wedged, so the
            // advice can bounce once. Not named in the line: its refusal is loud and says what to do
            // ("find the vc-secrets run that is still refreshing it"), and the whole reason this
            // advisory exists is that the outcome is otherwise silent. A caveat here would lengthen
            // it for a case that already speaks for itself.
            log(`vc-secrets: a token renewal for "${serverName}" was still holding the lock -- storing the new`
                + " token anyway; if the next launch asks you to sign in, run this again."
                + ` If this sign-in was for a DIFFERENT account, run "vc-secrets logout ${serverName}"`
                + " and sign in again: the renewal can still store the previous account's tokens, and"
                + " reads serve that account until its access token expires\n");
        }
        if (reason === "unbindable") {
            log(`vc-secrets: the token lock could not be taken (${error?.code ?? error?.name}) -- this sign-in`
                + " is NOT serialised against an in-flight renewal\n");
        }
        if (reason === "lock-failed") {
            // Stored anyway, exactly as the two branches above store: past the exchange the
            // authorization code is SPENT, so refusing would charge the developer a fresh
            // interactive sign-in for a fault that is ours. The wording is the only thing that
            // separates this from the `unbindable` message -- "could not be taken" describes a lock
            // that was unavailable, and this is not that; nothing was wrong with the lock.
            log(`vc-secrets: taking the token lock FAILED (${error?.code ?? error?.name}) -- not a busy lock`
                + " and not a sandbox refusal, so please report it; this sign-in is NOT serialised"
                + " against an in-flight renewal\n");
        }
        try {
            // The previous login's access entry goes first, and the refresh write follows it;
            // both failures are fatal and share one clearing branch.
            //
            // The order is the whole point. An access entry carries no identity — serializeAccess
            // stores none — so cacheStatus checks the declaration against the REFRESH entry and then
            // serves whatever access token sits beside it. Sign in as a different account, store the
            // new refresh token, then fail to store the new access token, and the previous account's
            // token is still there and still inside its lifetime: the next read returns it and the
            // server runs as that principal. Deleting first makes the worst case an access entry
            // that is MISSING, which costs one exchange. Adding the identity to serializeAccess
            // instead does not close it — two people signing in on one declaration share tenant,
            // client and scopes, so the fields would match.
            //
            // Only on this path. A renewal cannot change identity, so an access entry that survives
            // there belongs to the same account and using it is correct.
            //
            // The refresh write is the single step in the design that cannot be retried: Entra kills
            // the old refresh token the moment it issues this one, so an access entry stored beside
            // a refresh token that never landed describes a session that works for an hour and then
            // cannot be renewed by anything.
            try {
                try {
                    await removeStale(names.access);
                } catch (e) {
                    // Only exit 3 means "there was no entry", which is every first login. Any other
                    // failure leaves the previous entry readable — the state this delete exists to
                    // prevent — so it takes the clearing branch below instead of being swallowed.
                    // cmdLogout draws this same line, for the mirror reason.
                    if (e.toolExitCode !== 3) {
                        throw e;
                    }
                }
                await writeEntry(names.refresh, cache.serializeRefresh({ refreshToken: parsed.refreshToken,
                    tenantId: decl.tenantId, clientId: decl.clientId, scopes: decl.scopes }));
            } catch (e) {
                // Entra has already invalidated whatever refresh token was there, so a PREVIOUS
                // login's entries are now lies: the old refresh token is dead and the old access
                // token keeps working until it expires, at which point the session dies mid-use with
                // nothing to renew from. Clearing both makes the state unambiguously signed-out.
                await clearEntryPair(removeStale, [names.access, names.refresh]);
                throw e;
            }
            // "signed in, but": the sign-in itself succeeded and the refresh entry landed, so the
            // line must not read as a failed login.
            await storeAccessEntry(names.access, cache.serializeAccess(parsed), {
                write: writeEntry, marker, log, backend, note: "signed in, but ",
            });
        } finally {
            // Covers the stale-clearing path too: that branch deletes the very entries a waiting
            // renewal is about to read, and releasing before it would let the renewal see one of
            // the two halves mid-clear.
            await lock?.release();
        }

        return { serverName };
    } finally {
        // An abandoned listener holds its port for the life of the process, and on a failure
        // path there is nobody watching to notice.
        await server.close();
    }
}

// Unlike cmdLogin, this verb carries NO authorization/policy gate: minting a credential is the privileged
// act, removing one is not, and refusing a removal on policy would leave the refresh token on disk — the
// one outcome logout exists to prevent. The one refusal it does make is the namespace's: a repository's
// entry lives under a projectId the repository chose, which may be another project's, and removing that
// sign-in is not removing the person's own. The remedy is the trust a person gives the checkout, after
// which the removal runs.
async function cmdLogout(serverName, cfg, { deleteEntry = null,
    backend = detectLocalBackend(),
    acquireLock = null, now = Date.now,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    log = (line) => process.stderr.write(line),
    trustState = null } = {}) {
    const decl = (cfg.oauth ?? {})[serverName];
    if (!decl) {
        // Before any deletion: a typo must not remove a different server's tokens, and there is
        // no way to tell afterwards which name was meant.
        throw new VcSecretsError(`unknown oauth entry "${serverName}" -- not declared in ${CONFIG_NAME}`);
    }
    // Before the lock is taken and before any deletion.
    requireNamespaceTrust(cfg, "oauth", serverName, trustState);
    // Resolved here rather than defaulted in the parameter list, for the same reason cmdLogin
    // resolves its own lock here: tokenLockFor needs `decl` and `cfg` (this package's keystore
    // keys are scoped per project), neither of which exists until the guard above has run. The
    // source's `main` wires this verb's lock itself and refuses a missing one at the call
    // site — that does not port here, because it would force this
    // package's `main` to resolve `decl` itself, duplicating the guard above AND running it before
    // it, inverting the ordering this guard guarantees. The parameter list still carries a bare
    // `acquireLock = null` -- NOT in the source's position, since `backend` precedes it here -- so
    // that cmdLogoutSeams' parse of this function's text keeps finding it as a seam. That parse is
    // cmdLogout's own: cmdLoginSeams reads cmdLogin and nothing else.
    const acquire = acquireLock ?? tokenLockFor(serverName, decl, cfg);
    const remove = deleteEntry ?? deleteEntryIo(backend);
    const names = Object.values(oauthEntryKeys(serverName, decl, cfg));
    const removed = [];
    const alreadyAbsent = [];
    const { lock, reason, error } = await acquireTokenLock({ acquireLock: acquire, now, sleep, log });
    if (reason === "busy") {
        // Refused rather than deleted anyway: a retryable logout is a far weaker failure than a
        // credential the developer has been told is gone and which is in fact back on disk.
        throw new VcSecretsError(`another vc-secrets is still refreshing the token for "${serverName}" -- logout did not get`
            + " the lock in time; retry, or find the \"vc-secrets run\" that is still refreshing it");
    }
    if (reason === "unbindable") {
        // Not a holder, and not a reason to refuse: this is EPERM in the sandbox agents run in, and
        // failing here would leave a credential that cannot be revoked from the session that needs
        // it revoked. The removal goes ahead saying out loud what it could not promise.
        log(`vc-secrets: the token lock could not be taken (${error?.code}) -- this removal is NOT`
            + " serialised against an in-flight renewal\n");
    }
    try {
        for (const name of names) {
            try {
                await remove(name);
                removed.push(name);
            } catch (e) {
                // Only exit 3 means "no such entry". Treating every failure as success would report
                // a logout that left the refresh token on disk, which is the one thing logout is for.
                if (e.toolExitCode !== 3) {
                    // What the loop already removed leaves WITH the error. Thrown bare, the return
                    // value died with the stack and the developer read "logout failed" over a state
                    // where one of the two entries is in fact gone -- and the two halves fail
                    // differently. A refresh token removed with the access token left behind keeps
                    // working for up to an hour and then cannot renew; the reverse is merely an
                    // extra exchange. The retry is the same command either way, so this is about
                    // what the developer believes is on disk, not about what to do next.
                    const partial = removed.length > 0
                        ? ` -- this logout is HALF done, "${removed.join('", "')}" already removed`
                        : "";

                    throw Object.assign(new VcSecretsError(`${e.message}${partial}`),
                        { toolExitCode: e.toolExitCode, removed: [...removed] });
                }
                alreadyAbsent.push(name);
            }
        }
    } finally {
        await lock?.release();
    }
    // The one thing that can undo this removal, said where the developer can still act on it. A
    // sign-in that was already waiting on a human takes the lock only when the browser comes back,
    // so it lands after this and writes a live token — the reasoning is at cmdLogin's lock. No
    // mutex closes that, and nothing else reports it, so deleting this line silently restores a
    // logout that can be reversed without a trace.
    //
    // Unconditional on purpose: a removal that found nothing is exactly the case where a pending
    // sign-in is the likely cause.
    log(`vc-secrets: a sign-in for "${serverName}" already open in a browser will still complete and store`
        + " a token -- close any such tab\n");

    return { removed, alreadyAbsent };
}

function makeSecretResolver(cfg, env = process.env) {
    const resolvedValues = [];
    // One copy: readWcmBatch below has to produce exactly what a single read throws.
    const emptyValueError = (name) => new VcSecretsError(`secret "${name}": backend returned empty value -- run "vc-secrets set ${name}" (or check az login)`);
    const resolver = async (name, decl) => {
        const key = keyFor(name, decl, cfg);
        const backend = decl.backend === "keyvault" ? "keyvault" : detectLocalBackend(process.platform, env);
        if (backend === "gpg" && !gpgEntryPresent(key, env)) {
            throw new VcSecretsError(`secret "${name}" not set -- run "vc-secrets set ${name}"`);
        }
        const spec = backend === "keyvault" ? buildKeyvaultRead(decl) : buildLocalRead(backend, key, env);
        let value;
        try {
            value = await runTool(spec, { redactValues: resolvedValues });
        } catch (e) {
            throw mapResolveError(backend, name, e);
        }
        if (backend === "wcm") {
            // Decode before the empty check and before resolvedValues: that list is what
            // redacts secrets out of later tool output, so holding the hex there would make
            // redaction search for a string the output never contains.
            value = decodeCredBlobHex(value).value;
        }
        if (value === "") {
            throw emptyValueError(name);
        }
        resolvedValues.push(value);
        return value;
    };
    resolver.resolvedValues = resolvedValues;
    // Windows launches only (cmdLaunch's prefetch): every Credential Manager name in `refs` read in the
    // one PowerShell call that also binds the launch's tree to `pid`. Returns `seeded`, a Map from secret
    // name to what the resolver above would have returned for it -- the value -- or thrown -- the very
    // error, built the way runTool and mapResolveError build it from PS_CRED_READ's exit status -- and
    // `job`: "ok", the bind's win32 code, or, when the call failed as a whole, the reason as a string.
    // Nothing is seeded then, and every name takes the resolver above, which meets the same failure and
    // reports it as it always has.
    //
    // Each value joins resolvedValues here, before this returns: the later reads in the same launch --
    // a Key Vault secret, an oauth exchange -- print their tool's stderr through that list.
    //
    // `extraKeys`: further full keystore keys for the same call -- the launch's oauth entries. Their
    // outcomes come back apart, in `outcomes`, a Map from the full key to the raw `{ ok }` / `{ err }` the
    // script reported, and are neither decoded, nor turned into an error, nor added to resolvedValues, nor
    // keyed by a secret's name: what an oauth entry's outcome means is decided where it is consumed
    // (oauthLaunchDeps), and a secret that happens to share a name with an entry must not receive it. A key
    // the script did not report is simply absent from the Map.
    resolver.readWcmBatch = async (refs, { pid, run = credReadManyIo, extraKeys = [] }) => {
        const wanted = new Map();
        const localRefs = refs.filter(({ decl }) => decl.backend !== "keyvault");
        // The local backend is consulted only when a reference needs it, as the resolver above does: a
        // bad VC_SECRETS_LOCAL_BACKEND must not refuse a launch whose env holds only literals and Key
        // Vault entries, which ran before the batch existed. When it does throw, nothing is seeded and
        // the bind still runs with an empty key list; the resolver then raises the error at the first
        // entry that needs the backend, the same entry and message as without a prefetch.
        let localBackend = null;
        if (localRefs.length > 0) {
            try {
                localBackend = detectLocalBackend(process.platform, env);
            } catch (e) {
                if (!(e instanceof VcSecretsError)) {
                    throw e;
                }
            }
        }
        if (localBackend === "wcm") {
            for (const { name, decl } of localRefs) {
                wanted.set(name, keyFor(name, decl, cfg));
            }
        }
        let result;
        try {
            result = await run({ keys: [...new Set([...wanted.values(), ...extraKeys])], pid, env,
                redactValues: resolvedValues });
        } catch (e) {
            if (!(e instanceof VcSecretsError)) {
                throw e;
            }

            return { seeded: new Map(), job: e.message, outcomes: new Map() };
        }
        const cmd = psCommand(env);
        const seeded = new Map();
        for (const [name, key] of wanted) {
            const outcome = Object.hasOwn(result.creds, key) ? result.creds[key] : null;
            if (typeof outcome?.ok === "string") {
                const value = decodeCredBlobHex(outcome.ok).value;
                if (value === "") {
                    seeded.set(name, emptyValueError(name));
                    continue;
                }
                resolvedValues.push(value);
                seeded.set(name, value);
            } else if (Number.isInteger(outcome?.err)) {
                seeded.set(name, mapResolveError("wcm", name, batchedReadError(cmd, outcome.err)));
            }
            // Anything else -- a key the script did not report -- is left unseeded, and its read goes
            // through the resolver above.
        }
        const outcomes = new Map();
        for (const key of extraKeys) {
            const outcome = Object.hasOwn(result.creds, key) ? result.creds[key] : null;
            if (typeof outcome?.ok === "string" || Number.isInteger(outcome?.err)) {
                outcomes.set(key, outcome);
            }
        }
        const job = result.job === "ok" || Number.isInteger(result.job) ? result.job : "the bind reported no result";

        return { seeded, job, outcomes };
    };

    return resolver;
}

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

// Pre-rename storage: wcm/keychain credential name was `mcpw:<name>` (no scope, no projectId —
// see legacyKeyToPath for the gpg equivalent). Returns null for "not found", never throws for it,
// so cmdMigrate can tell "nothing to migrate" from "backend actually failed".
async function readLegacyLocalValue(backend, name, env = process.env) {
    if (backend === "gpg") {
        const legacyPath = legacyKeyToPath(name, env);
        if (!keystoreFilePresent(legacyPath)) {
            return null;
        }

        return await runTool({ cmd: "gpg", args: ["--quiet", "--batch", "--pinentry-mode", "cancel", "--decrypt", legacyPath],
            timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: true, keepTrailingNewline: true });
    }
    const legacyName = `${LEGACY_KEY_PREFIX}:${name}`;
    const spec = backend === "wcm"
        ? { cmd: psCommand(env), args: psArgs(PS_CRED_READ), extraEnv: { VC_SECRETS_NAME: legacyName }, timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: true }
        : { cmd: "security", args: ["find-generic-password", "-a", keychainAccount(env), "-s", legacyName, "-w"],
            timeoutMs: TIMEOUT_LOCAL_MS, captureStdout: true };
    try {
        const value = await runTool(spec);

        return backend === "wcm" ? decodeCredBlobHex(value).value : value;
    } catch (e) {
        if (isAbsentEntry(backend, e)) {
            return null;
        }
        throw e;
    }
}

// "Is the new key already populated?" has to distinguish ABSENT from UNREADABLE. Treating every read
// failure as absence is what turns migrate into "write the pre-rotation value over the current one":
// a cold gpg agent, a timeout, or a decrypt to the wrong recipient all fail here, and the legacy read
// that follows succeeds — so the overwrite is committed and reported as a successful migration.
async function newKeyPresent(backend, key, env = process.env) {
    if (backend === "gpg") {
        return gpgEntryPresent(key, env);
    }
    try {
        await runTool(buildLocalRead(backend, key, env));

        return true;
    } catch (e) {
        if (isAbsentEntry(backend, e)) {
            return false;
        }
        throw e;
    }
}

async function cmdMigrate(cfg) {
    const backend = detectLocalBackend();
    const lines = [];
    let migrated = 0;
    let failed = 0;
    for (const [name, decl] of Object.entries(cfg.secrets)) {
        if (decl.backend !== "local") {
            continue;
        }
        // The legacy entry carried no scope, so what it holds is the person's own value. Copying it under
        // a repository's namespace would hand it to every server that repository declares and has had
        // trusted, which is the grant the README says trusting a server does not make. Only a user-scope
        // declaration is a place the person's own value belongs; a repository's secret is set for that
        // repository, deliberately.
        if (decl.scope !== USER_SCOPE) {
            lines.push(`${name}: declared by this repository -- a legacy entry is personal, so it is not moved into a repository's namespace; run "vc-secrets set ${name}" if the repository should have its own`);
            continue;
        }
        const key = keyFor(name, decl, cfg);
        let present;
        try {
            present = await newKeyPresent(backend, key, process.env);
        } catch (e) {
            failed += 1;
            lines.push(`${name}: cannot tell whether it is already migrated, refusing to touch it -- ${e.message}`);
            continue;
        }
        if (present) {
            lines.push(`${name}: already present`);
            continue;
        }

        let legacyValue;
        try {
            legacyValue = await readLegacyLocalValue(backend, name, process.env);
        } catch (e) {
            failed += 1;
            lines.push(`${name}: migration failed -- ${e.message}`);
            continue;
        }
        if (legacyValue === null) {
            lines.push(`${name}: no legacy entry -- run "vc-secrets set ${name}"`);
            continue;
        }

        try {
            const spec = buildLocalWrite(backend, key, process.env, { tmp: backend === "gpg", value: legacyValue });
            if (spec.argvExposesValue) {
                lines.push(`${name}: the value contains a line ending, so it passed through the command line of a `
                    + `short-lived process -- visible to anything reading this machine's process list during the write`);
            }
            await writeLocalValue(backend, key, spec, legacyValue, process.env);
            if (backend === "keychain") {
                // Read back and compare. `security -i` reports a failed sub-command through an exit code
                // this loop cannot check on a machine without macOS, and a store that accepted something
                // other than what was handed to it must not be reported as a migration. gpg is left out:
                // its read needs a warm agent, so a cold one would fail a write that in fact succeeded.
                const stored = await runTool(buildLocalRead(backend, key, process.env), { redactValues: [legacyValue] });
                if (stored !== legacyValue) {
                    // The wrong value is now sitting under the new key, and newKeyPresent asks only whether
                    // the key EXISTS: left there, the next migrate reports "already present", doctor says OK
                    // and a launch hands the server a value nobody wrote. This branch is reached only
                    // after newKeyPresent answered false, so the delete cannot remove an entry that was
                    // there before this run.
                    const removeSpec = buildLocalDelete(backend, key, process.env);
                    try {
                        await runTool(removeSpec);
                    } catch {
                        const command = [removeSpec.cmd, ...removeSpec.args]
                            .map((x) => (/^[\w.:@/=+-]+$/.test(x) ? x : `'${x.replaceAll("'", "'\\''")}'`)).join(" ");
                        throw new VcSecretsError(`the store returned a different value than was written, and the new entry could not be removed -- it now holds a wrong value; remove it with \`${command}\`. The legacy entry is untouched`);
                    }
                    throw new VcSecretsError("the store returned a different value than was written; the new entry was removed -- the legacy entry is untouched, migrate it by hand");
                }
            }
            migrated += 1;
            lines.push(`${name}: migrated`);
        } catch (e) {
            failed += 1;
            lines.push(`${name}: migration failed -- ${e.message}`);
        }
    }
    // Deliberately no per-collision advice. project↔local collisions share one namespace, so there is no
    // second key to mention. A user↔project collision leaves the user-scope key unwritten: the
    // repository's entry is the one that wins, it is skipped above with a line of its own, and doctor's
    // legacyOnly probe is user-scope only, so it does not name it either. Nothing is lost -- the legacy
    // entry stays in place, and migrate run from a directory where no repository declares the name moves it.
    lines.push(`vc-secrets: migrate -- ${migrated} migrated, ${failed} failed`);
    // sync write: stderr is async on a POSIX pipe and on a Windows console, and process.exit drops pending writes
    fs.writeSync(2, lines.join("\n") + "\n");
    if (failed > 0) {
        process.exit(1);
    }
}

function readEnableLists(file, problems = []) {
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
        // Reported unless the file is absent, exactly as readWiredServers reports its own, and for the
        // same reason: the empty lists returned below are indistinguishable from a file that
        // genuinely enables nothing. They decide which servers count as consuming a secret and
        // which env keys the file contributes, so an unreadable settings.local.json makes doctor
        // quietly answer both questions wrong rather than say it could not look.
        //
        // Absent stays silent -- most projects have no settings.local.json, and a missing optional
        // file is not a fault. Decided from the read's own error, not a second probe: existsSync
        // calls a file it cannot stat absent, which silenced exactly the case this reports.
        if (!isAbsentPathError(e)) {
            problems.push(`${file}: cannot be read (${readFailureReason(e)}) -- treating it as no enable/disable lists,`
                + " so the servers reported as consuming a secret may be wrong");
        }

        return { enabled: [], disabled: [], envKeys: [] };
    }

    const env = parsed.env;
    const hasEnvObject = env !== null && typeof env === "object" && !Array.isArray(env);

    return {
        enabled: Array.isArray(parsed.enabledMcpjsonServers) ? parsed.enabledMcpjsonServers : [],
        disabled: Array.isArray(parsed.disabledMcpjsonServers) ? parsed.disabledMcpjsonServers : [],
        envKeys: hasEnvObject ? Object.keys(env) : [],   // names only; values are never read
    };
}

// Which servers already launch through this tool. Reading the project's .mcp.json alone was not enough:
// a personal server is wired with `claude mcp add-json --scope user|local`, which writes ~/.claude.json,
// so for a user-scope-only setup nothing looked wired — and `doctor` then advised keeping a plaintext
// token that is already dead. Both files are read, and ~/.claude.json carries per-project blocks too.
function readWiredServers(mcpJsonPath, userJsonPath = null, projectRoot = null, problems = [], seen = []) {
    const wired = new Set();
    // Case-insensitive, and across `command` too. The documented entry carries `${VC_SECRETS}` — which
    // does not contain the lowercase string — so a case-sensitive args-only match failed on exactly the
    // configuration this plugin tells people to write, leaving `wired` empty and the legacy-token advice
    // stuck at "still required".
    // `(?![A-Z_])` for the reason WIRED_MARKER_RE carries the same lookahead and calls it
    // load-bearing: without it a server that merely sets a documented knob -- VC_SECRETS_TIMING,
    // VC_SECRETS_LOCAL_BACKEND -- reads as wired through us. That is the false POSITIVE direction,
    // and it flips the legacy-token line from "still required" to "remove it": advice to delete a
    // credential that is still live. `${VC_SECRETS}` still matches, because `}` is not [A-Z_].
    //
    // The lowercase branch needs no such guard: the knobs spell it `VC_SECRETS_`, with an
    // underscore, and this branch looks for the hyphenated `vc-secrets`. It stays broader than
    // WIRED_MARKER_RE on purpose -- a launcher invoked as a bare `vc-secrets` on PATH carries no
    // .mjs for the stricter grammar to find, and missing THAT is the cheap direction to be wrong in.
    const mentionsLauncher = (v) => typeof v === "string"
        && (v.toLowerCase().includes("vc-secrets") || /VC_SECRETS(?![A-Z_])/.test(v.toUpperCase()));
    const collect = (mcpServers) => {
        for (const [name, entry] of Object.entries(mcpServers ?? {})) {
            const fields = [entry?.command, ...(Array.isArray(entry?.args) ? entry.args : [])];
            if (fields.some(mentionsLauncher)) {
                wired.add(name);
            }
        }
    };
    // An unreadable file is not "nothing is wired": that answer silently restores the advice this
    // function exists to correct, and `doctor` is where an unreadable input must be said out loud.
    const load = (file) => {
        try {
            return JSON.parse(fs.readFileSync(file, "utf8"));
        } catch (e) {
            if (!isAbsentPathError(e)) {
                problems.push(`${file}: cannot be read (${readFailureReason(e)}) -- treating it as no wiring, so advice about leftover tokens may be wrong`);
            }

            return null;
        }
    };

    if (mcpJsonPath) {
        const doc = load(mcpJsonPath);
        if (doc) {
            // Only a file that was actually read counts as inspected. An absent or unreadable one must
            // not, because the caller uses this list to decide whether it may claim anything at all
            // about the switch — and a path that was merely attempted supports no claim.
            seen.push(mcpJsonPath);
            collect(doc.mcpServers);
        }
    }
    const userJson = userJsonPath ? load(userJsonPath) : null;
    if (userJson) {
        seen.push(userJsonPath);
        collect(userJson.mcpServers);   // --scope user really is machine-wide
        // Per-project blocks are NOT. Collecting all of them made "wired" machine-global, and `wired`
        // is what flips the legacy-token line from "still required" to "remove it" — so a repo wired
        // here would make `doctor` advise deleting a plaintext token that a DIFFERENT, unmigrated repo
        // still needs. Server names like `github` collide across repos by convention, so this is the
        // ordinary case, not a corner: only the block for the project being diagnosed is read.
        for (const [dir, project] of Object.entries(userJson.projects ?? {})) {
            if (projectRoot && canonicalPath(dir) === canonicalPath(projectRoot)) {
                collect(project?.mcpServers);
            }
        }
    }

    return wired;
}

// Detection, not parsing. The question is only "does any entry in this file route through our
// launcher", and answering it by text search keeps a TOML parser out of a diagnostic's dependency
// list — one client's config is TOML and nothing else here reads TOML.
//
// `(?![A-Z_])` excludes the documented knobs (VC_SECRETS_TIMING, VC_SECRETS_LOCAL_BACKEND, ...). The
// asymmetry matters: a false NEGATIVE costs one diagnostic line, while a false POSITIVE flips the
// legacy-token line from "still required" to "remove it" — advice to delete a credential that is
// still live.
const WIRED_MARKER_RE = /vc-secrets(-shim)?\.(mjs|js)|VC_SECRETS(?![A-Z_])/;

// A TOML table header: `[mcp_servers.name]` or `[mcp_servers."dotted.name"]`. Not a TOML parser — it
// locates the KEY, which is the one thing a substring search cannot do.
const TOML_SERVER_TABLE_RE = /^mcp_servers\.(?:"([^"]+)"|([A-Za-z0-9_.-]+))\]/;

function wiredNamesInJson(doc) {
    const names = new Set();
    for (const [name, entry] of Object.entries(doc?.mcpServers ?? {})) {
        const fields = [entry?.command, ...(Array.isArray(entry?.args) ? entry.args : [])];
        if (fields.some((v) => typeof v === "string" && WIRED_MARKER_RE.test(v))) {
            names.add(name);
        }
    }

    return names;
}

function wiredNamesInToml(text) {
    const names = new Set();
    // Split on table headers so the marker is looked for inside ONE server's table. Testing the whole
    // file instead is what let a neighbour's wiring vouch for an unwired server.
    for (const chunk of text.split(/^[ \t]*\[/m)) {
        const hit = TOML_SERVER_TABLE_RE.exec(chunk);
        if (hit && WIRED_MARKER_RE.test(chunk)) {
            names.add(hit[1] ?? hit[2]);
        }
    }

    return names;
}

// Returns SERVER NAMES, not file paths, because the set it feeds is read two ways: `.size` decides a
// message, and `.has(serverName)` decides which secrets a run actually consumes. Contributing paths
// type-checks and satisfies every size-based assertion while making a server wired only through this
// route look unconsumed -- so its Key Vault secret is reported SKIP and never checked.
//
// The name has to come from the file's own server KEY. A substring test over the file text marked
// every declared name that merely occurred anywhere -- and the baked shim path alone contains "data",
// "plugins", "tools", "claude", "run" and "node", so a server named any of those was wired by the
// path string itself. Worse, one config file holds ALL of a user's servers and only some route
// through the launcher, so a single wired neighbour vouched for every plaintext one beside it. That
// drops the SKIP that keeps a teammate's doctor from FAILing on a Key Vault secret they cannot reach.
function readWiredElsewhere(paths, seen = [], problems = []) {
    const names = new Set();
    for (const p of paths) {
        if (!p) {
            continue;
        }
        let text;
        try {
            text = fs.readFileSync(p, "utf8");
        } catch (e) {
            if (isAbsentPathError(e)) {
                continue;   // a client that is not installed has no config file
            }
            // Reported, not swallowed -- the sibling reader does the same for the same condition. A
            // file counted as inspected while nobody could read it makes the advice that rests on it
            // confident and wrong.
            problems.push(`${p}: cannot be read (${e.message}) -- treating it as no wiring, so advice about leftover tokens may be wrong`);
            continue;
        }
        seen.push(p);
        let doc = null;
        try {
            doc = JSON.parse(text);
        } catch {
            doc = null;   // not JSON, so it is the TOML client's file
        }
        for (const name of doc ? wiredNamesInJson(doc) : wiredNamesInToml(text)) {
            names.add(name);
        }
    }

    return names;
}

// A verdict, never the object carrying it. cacheStatus returns the access token beside its state, so
// handing that object to the report is the one path by which a token could reach a printed line --
// the mapping simply has no way to carry it, which is stronger than remembering to redact.
function oauthStatusFrom(status) {
    if (status.state === "valid") {
        return "ok";
    }
    if (status.state === "needs-refresh") {
        return "needs-refresh";
    }
    if (status.state === "identity-mismatch") {
        // Same remedy as a first sign-in, different cause. A developer who signed in yesterday and is
        // asked again needs to know the DECLARATION moved, or the tool looks like it lost the token it
        // was trusted with.
        return "identity-changed";
    }
    if (status.state === "absent") {
        return "signin-required";
    }
    // Not a catch-all: a state added to cacheStatus later would otherwise arrive here as the QUIETEST
    // verdict this function can return, and a new failure mode would report as INFO.
    throw new VcSecretsError(`unknown cache state "${status.state}"`);
}

// Every oauth reference in the config, with the launchable kind and name that carry it, and the env
// var. Pure, because two callers need it -- the tenant check and the node-floor check -- and neither
// should resolve a secret to find out. Servers AND tasks: a task carries the same env references a
// server does, and doctor's own "declared" loop already checks both for the identical reason.
function oauthReferences(cfg) {
    const found = [];
    for (const [kind, map] of [["servers", cfg.servers], ["tasks", cfg.tasks ?? {}]]) {
        for (const [launchableName, launchable] of Object.entries(map)) {
            for (const [envVar, value] of Object.entries(launchable.env)) {
                let ref = null;
                try {
                    ref = parseReference(value);
                } catch {
                    continue;   // a malformed reference is already its own finding
                }
                if (ref?.kind === "oauth") {
                    found.push({ kind, launchableName, envVar, name: ref.name });
                }
            }
        }
    }

    return found;
}

// The organisation the launchable is run against, read from the argv that already carries it.
// Declaring it a second time in the oauth block would be the same fact in two places with nothing
// keeping them in agreement -- and the divergence would make doctor compare the declared tenant
// against the wrong organisation and report agreement.
// The server defines three options that take a value -- `--authentication`/`-a`, `--tenant`/`-t`,
// `--domains`/`-d` -- and the long forms are what its own README tells an operator to write. `--auth`
// is not one of them; it stays because it costs nothing until that exact token appears, and consuming
// a value after it is still the better guess if it ever does.
const ORG_FLAGS_WITH_VALUE = ["-a", "--auth", "--authentication", "-t", "--tenant"];

// `--domains` is declared to yargs as an ARRAY, so it swallows every following token up to the next
// flag -- the organisation included. Measured against the server's own option definitions: `--domains
// all myorg` and `--domains repositories builds myorg` both die at "Not enough non-option arguments",
// while `myorg --domains repositories builds` starts. So an argv naming domains before the
// organisation cannot launch at all, and answering null -- "could not determine", a reported state --
// is what keeps this parser's answer and the server's behaviour in step. Returning the first domain
// as the organisation instead would send doctor to compare a tenant against a name nobody launched.
const ORG_FLAGS_WITH_VALUES = ["-d", "--domains"];

function organisationFromArgs(args) {
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (ORG_FLAGS_WITH_VALUE.includes(arg)) {
            i += 1;   // named rather than assumed: a generic "every flag takes a value" rule
            continue;  // swallows the organisation whenever a valueless flag precedes it
        }
        if (ORG_FLAGS_WITH_VALUES.includes(arg)) {
            while (i + 1 < args.length && !args[i + 1].startsWith("-")) {
                i += 1;
            }
            continue;
        }
        if (arg.startsWith("-")) {
            continue;
        }
        if (arg.includes("@") || arg.includes("/") || arg.includes("\\")) {
            continue;   // the package spec, or a path
        }

        return arg;
    }

    return null;   // unreadable: reported as "could not determine", never guessed
}

// One unauthenticated HEAD, with no fallback to any previously-resolved value on failure: caching the
// last answer across calls would let doctor report agreement from a stale tenant on a network hiccup
// -- the diagnostic passing while the very mismatch it exists to catch stays invisible.
async function resolveOrgTenant(org, { request = fetch } = {}) {
    try {
        const res = await request(`https://vssps.dev.azure.com/${encodeURIComponent(org)}`,
            { method: "HEAD", signal: AbortSignal.timeout(TIMEOUT_TENANT_MS) });

        // `|| null` rather than `??`: an EMPTY header is not an answer either, and letting "" through
        // renders a mismatch against a blank organisation tenant.
        return res.headers.get("x-vss-resourcetenant") || null;
    } catch {
        return null;   // unreachable, or too slow to be worth waiting for: "unknown", never a match
    }
}

// resolveOrgTenant reads an Azure DevOps endpoint's binding header, so the tenant check means
// something only for a token issued against that resource -- for any other resource there is no
// organisation tenant to compare against, and running the check anyway would either print a WARN
// that can never clear or, on a coincidental match, FAIL a correctly-configured entry. The App ID
// GUID and the URL form are both Microsoft's own public identifiers for the Azure DevOps resource
// (documented at learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/
// service-principal-managed-identity), not a client identifier or app registration -- carrying it
// here does not violate the "no tenant id, client id, organisation or app-registration name
// hardcoded" constraint.
//
// Lowercase, matching the .toLowerCase() comparison below: a marker added here in mixed case would
// silently never match, so keep every entry already lowercase rather than relying on the call site.
const AZURE_DEVOPS_RESOURCE_MARKERS = ["499b84ac-1321-427f-aa17-267ca6975798", "app.vssps.visualstudio.com"];

function isAzureDevOpsScoped(scopes) {
    return scopes.some((scope) => AZURE_DEVOPS_RESOURCE_MARKERS.some((marker) => scope.toLowerCase().includes(marker)));
}

// Extracted from cmdDoctor so applicability -- which consumer answers for an oauth entry, if any,
// whether its declaration is even for the right resource, and whether its argv could be read -- has a
// test surface that needs no keystore access. cmdDoctor calls this with no third argument, so the
// real resolveOrgTenant comes from the parameter's own default; a test passes a stub instead, to
// avoid a network call.
async function oauthTenantChecks(cfg, references, { resolveOrgTenant: resolve = resolveOrgTenant } = {}) {
    const checks = [];
    const bindings = [];
    for (const [name, decl] of Object.entries(cfg.oauth ?? {})) {
        // Driven by the DECLARATION, not by the reference: the reference only appears with the
        // switch, and a tenant-binding mistake is worth catching at setup, before the switch lands.
        // The reference wins when one exists (it is authoritative); otherwise the consuming
        // launchable is found by the "vc-secrets login <name>" convention -- a SERVER whose name
        // equals the entry's, never a task, since nothing launches a task by that convention.
        const ref = references.find((r) => r.name === name);
        const consumerKind = ref ? ref.kind : (Object.hasOwn(cfg.servers, name) ? "servers" : null);
        const consumerName = ref ? ref.launchableName : (consumerKind === "servers" ? name : null);
        const hasConsumer = consumerKind !== null;
        const adoScoped = isAzureDevOpsScoped(decl.scopes);
        // Not applicable, not a WARN that can never pass -- and the causes must not collapse into one
        // line: "nothing launches it" (no consumer at all -- there is no argv to read in the first
        // place) is a different fact from "a consumer exists but its token is not for Azure DevOps"
        // (nothing for resolveOrgTenant to check), and both differ again from "a consumer exists, is
        // ADO-scoped, and its argv could not be read" (the WARN doctorReport prints below).
        const applicable = hasConsumer && adoScoped;
        const org = applicable ? organisationFromArgs(cfg[consumerKind][consumerName].args) : null;
        const check = { name, org, declared: decl.tenantId, applicable, bound: null };
        if (!applicable) {
            check.reason = hasConsumer ? "not-ado-scope" : "no-consumer";
        }
        checks.push(check);
        // Started here, awaited together below. Each is one unauthenticated HEAD that may burn the
        // whole TIMEOUT_TENANT_MS, and doctor prints nothing until every check has finished -- so
        // awaiting inside the loop makes a developer wait for their sum rather than for the slowest.
        // They are independent by construction: resolveOrgTenant answers null rather than rejecting.
        bindings.push(org === null ? null : resolve(org));
    }
    const bound = await Promise.all(bindings);
    for (const [i, tenant] of bound.entries()) {
        checks[i].bound = tenant;
    }

    return checks;
}

function doctorReport(cfg, { env, platform, enableLists, resolvable, skipped, notRead = [], toolsMissing, wired, configDirOverride, legacyOnly = [], shimContract = null, wiringProblems = [], clientConfigsSeen = [], writeProbe = null, oauthStatus = {}, oauthOversize = {}, tenantChecks = [], childNodes = [], trustFindings = [], namespaceNotRead = [] }) {
    const lines = [];
    const loadedFiles = Object.entries(cfg.files ?? {}).map(([scope, file]) => `${scope}=${pathForTerminal(file)}`).join(", ");
    if (loadedFiles) {
        lines.push(`INFO config files loaded: ${loadedFiles}`);
    }
    for (const warning of cfg.warnings ?? []) {
        // A warning embeds the declaration file's path, a directory name somebody chose.
        lines.push(`WARN ${forTerminal(warning, Infinity)}`);
    }
    for (const collision of cfg.collisions ?? []) {
        lines.push(`WARN ${collision.kind} "${collision.name}" declared in both ${collision.from} and ${collision.to} -- ${collision.to} wins`);
    }
    for (const clash of oauthKeyClashes(cfg)) {
        lines.push(`WARN ${clash}`);
    }
    let backend = null;
    try {
        backend = detectLocalBackend(platform, env);
    } catch (e) {
        lines.push(`FAIL ${e.message}`);   // report, never crash the diagnostic tool
    }
    if (configDirOverride) {
        lines.push("WARN VC_SECRETS_CONFIG_DIR is set -- vc-secrets is reading a non-default config");
    }
    for (const problem of wiringProblems) {
        lines.push(`WARN ${problem}`);
    }
    // settings.local.json is where a stale token actually lives; the session env only carries it
    // when something exported it. Reporting the file is what makes the message actionable --
    // `doctor` run from a plain terminal never sees the file's env block in its own process.
    const fileEnvKeys = enableLists.envKeys ?? [];
    for (const varName of LEGACY_ENV_VARS) {
        let where = null;
        if (fileEnvKeys.includes(varName)) {
            where = "settings.local.json env";
        } else if (varName in env) {
            where = "session env";
        }
        if (where === null) {
            continue;
        }
        if (wired.size > 0) {
            lines.push(`WARN ${varName} present in ${where} -- remove it (servers now read via vc-secrets)`);
        } else if (clientConfigsSeen.length > 0) {
            lines.push(`INFO ${varName} present in ${where} -- still required until the vc-secrets switch lands`);
        } else {
            // Naming what was inspected, not which clients exist. A message that says it looked for three
            // clients while reading two files is a false statement inside the diagnostic.
            lines.push(`INFO ${varName} present in ${where} -- no MCP config was inspected, so whether the switch has landed is unknown`);
        }
    }
    for (const tool of toolsMissing) {
        lines.push(`FAIL required tool "${tool}" not found on PATH`);
    }
    const legacyOnlySet = new Set(legacyOnly);
    for (const [name, status] of Object.entries(resolvable)) {
        if (status === true) {
            lines.push(`OK secret "${name}" resolvable`);
        } else if (legacyOnlySet.has(name)) {
            // Not a FAIL: the secret exists, just not yet under the new key -- migrate resolves it.
            lines.push(`WARN secret "${name}" is only under the legacy key -- run "vc-secrets migrate"`);
        } else if (typeof status === "string") {
            // A missing "az"/"gpg"/etc. already produced its own "required tool ... not found on PATH"
            // FAIL above; repeating it once per secret that needs the same tool is noise, not signal.
            // Not anchored at the end: mapResolveError appends backend-specific advice for gpg, so a
            // trailing anchor matched every backend except the one Linux and WSL actually use.
            const missingTool = /^(\S+): not found on PATH/.exec(status)?.[1];
            if (missingTool && toolsMissing.includes(missingTool)) {
                continue;
            }
            lines.push(`FAIL secret "${name}" not resolvable -- ${status}`);
        } else {
            lines.push(`FAIL secret "${name}" not resolvable -- run "vc-secrets set ${name}" (local) or check az login (keyvault)`);
        }
    }
    for (const name of skipped) {
        lines.push(`SKIP secret "${name}" (keyvault) -- no enabled server consumes it; use --all to force`);
    }
    for (const name of notRead) {
        lines.push(`SKIP secret "${name}" not read -- declared by the repository, and no trusted, authorized consumer uses it`);
    }
    for (const { kind, name } of namespaceNotRead) {
        lines.push(`SKIP ${kind} "${name}" not read -- this checkout is not trusted for namespace ${JSON.stringify(cfg.projectId)}`);
    }
    if (writeProbe === "ok") {
        // The probe writes a value of exactly WCM_BLOB_LIMIT bytes, so it proves only that the store
        // accepts a write of that size through the non-interactive path. Whether the entry THIS
        // machine produces fits under it is a different question -- the measured access entry was
        // 2536 of a 2560-byte ceiling, growing about forty bytes per group membership -- so a
        // machine one group over passes this probe and then fails every real write. The oversize
        // WARN above is what answers that question.
        lines.push(`OK ${backend ?? "the keystore"} accepts a write at the size limit`
            + " -- login and renewal can reach the store; whether the token they produce fits under"
            + " that limit is answered only by storing one");
    } else if (writeProbe !== null && typeof writeProbe === "object") {
        // Two verdicts, because they send the reader to different places. Only the first is about the
        // ceiling; the second covers a locked keychain, a sandbox, a timeout -- causes whose remedy
        // has nothing to do with size. The distinction is the probe's, made where the exit code was.
        lines.push(writeProbe.oversize
            ? `FAIL ${backend ?? "the keystore"} rejected a write at the size limit`
                + ` -- "vc-secrets login" may not be able to store a token: ${writeProbe.message}`
            : `FAIL ${backend ?? "the keystore"} refused a write`
                + ` -- "vc-secrets login" may not be able to store a token: ${writeProbe.message}`);
    }
    for (const [name, status] of Object.entries(oauthStatus)) {
        // The home is part of the verdict, not decoration: cfg.oauth merges config scopes (user,
        // project, local) into one entry per name -- loadConfig overwrites, it does not accumulate --
        // so there is exactly one verdict to print per name, and it is printed the way the crossing
        // lines below already print a home.
        const home = cfg.oauth?.[name]?.home;
        if (status === "ok") {
            lines.push(`OK oauth "${name}" (${home}) signed in`);
        } else if (status === "needs-refresh") {
            // Not a finding: doctor does not exchange, so the honest report is that the next launch
            // will. Calling it a problem sends a developer to log in again for a state that needs
            // nothing from them.
            lines.push(`OK oauth "${name}" (${home}) signed in -- the access token is stale and the next launch will renew it`);
        } else if (status === "signin-required") {
            lines.push(`INFO oauth "${name}" (${home}) not signed in -- run "vc-secrets login ${name}"`);
        } else if (status === "identity-changed") {
            lines.push(`INFO oauth "${name}" (${home}): the declaration changed since sign-in (tenant, client or scopes) -- run "vc-secrets login ${name}"`);
        } else {
            lines.push(`FAIL oauth "${name}" (${home}) cache could not be read -- ${status}`);
        }
        // Renewal replaces the token in the environment of a launch it supervises; it cannot reach into a
        // server that copied the variable at startup. That limit belongs on the report itself, not only in
        // the skill text that explains the report: it is the one fact that decides whether signing in
        // once is enough. Names only -- the variable is identified, never its value.
        for (const ref of oauthReferences(cfg)) {
            if (ref.name === name) {
                const kind = ref.kind === "tasks" ? "task" : "server";
                lines.push(`INFO oauth "${name}": a renewed token reaches ${kind} "${ref.launchableName}" only if it reads ${ref.envVar}`
                    + " from its environment at each use -- one that keeps its startup copy runs on it until it expires");
            }
        }
        // Printed beside the status rather than instead of it, because the two are independent: the
        // entry above usually reads "needs-refresh", which is an OK line and honestly so -- the next
        // launch WILL renew. What that line cannot say is that it will do so every single time, and
        // pay a refresh-token rotation for it.
        //
        // WARN and not FAIL. Nothing is broken and nothing is lost; a FAIL exits 1 and would redden
        // every run on an affected machine for a condition the developer cannot act on. The line
        // exists to be seen when the contingency it names is finally worth building.
        const oversize = oauthOversize[name];
        if (oversize) {
            // The store named in words, not as the internal backend id: "wcm" tells a developer
            // nothing, and this line is read by whoever has to decide what to do about it.
            const store = oversize.backend === "wcm" ? "Credential Manager" : oversize.backend;
            lines.push(`WARN oauth "${name}": the access entry does not fit ${store}`
                + ` (${oversize.bytes} bytes, limit ${oversize.limit}).`);
            lines.push("     Every launch and every renewal now pays a token exchange, and each rotates the refresh token.");
            lines.push("     Nothing to change locally -- this is the design's DPAPI contingency, and this line is its trigger.");
        }
    }
    // A list rather than one verdict: with two oauth entries a single variable reports only the last,
    // and the line would not say which entry it belonged to.
    for (const { name, org, declared, bound, applicable = true, reason } of tenantChecks) {
        if (!applicable) {
            // Reported, not silently skipped over: silence here reads as "checked, nothing to say".
            // Two distinct lines, not one -- "nothing launches it" and "not scoped for Azure DevOps"
            // are different facts about why there is nothing to check, and collapsing them into one
            // wording would also collapse them with the WARN below (a consumer that DOES apply, but
            // whose argv could not be read), which is the one case that must stay a visible finding.
            // Branched over the known reasons rather than defaulted, so a third reason added later --
            // or a producer that forgets to set one -- reports itself as unrecognised instead of
            // silently printing whichever wording the default happened to pick.
            if (reason === "no-consumer") {
                lines.push(`INFO oauth "${name}": nothing launches it -- the tenant check is not applicable`);
            } else if (reason === "not-ado-scope") {
                lines.push(`INFO oauth "${name}": its scopes are not for Azure DevOps -- the tenant check is not applicable`);
            } else {
                lines.push(`FAIL oauth "${name}": not applicable for an unrecognised reason "${reason}" -- this is a bug in the check itself`);
            }
            continue;
        }
        if (bound === null) {
            // Reported rather than skipped: silence here reads as a pass, and the whole value of the
            // check is turning a tenant-binding mistake into a named finding at setup instead of an
            // opaque authorization failure weeks later.
            //
            // The ORGANISATION is named because it is the value that separates the two causes: a
            // mistyped organisation answers with no binding header at all, which is otherwise
            // indistinguishable from a network outage -- measured, an organisation that does not exist
            // returns 404 with the header absent, exactly as an unreachable host does.
            lines.push(`WARN oauth "${name}": could not determine the tenant of organisation `
                + `"${org ?? "(its consumer's argv did not name one)"}" -- the declared tenantId is unverified`);
        } else if (bound.toLowerCase() !== declared.toLowerCase()) {
            lines.push(`FAIL oauth "${name}": declared tenantId ${declared} is not the tenant organisation `
                + `"${org}" is bound to (${bound}) -- delegated tokens only work where the two agree`);
        }
    }
    // One entry per oauth launchable -- the caller dedupes to that, since each declares its own
    // command and one launchable is one machine fact however many references it carries. A single
    // PATH probe standing for all of them fails the case the launch path was just taught to get
    // right: a declaration naming its own node is judged here by a binary it never runs, and doctor
    // exits 1 on any FAIL -- so the setup gate the README prescribes refuses a machine whose launch
    // works.
    for (const probe of childNodes) {
        if (!childNodeSupportsImport(probe.version)) {
            lines.push(`FAIL ${childNodeRefusal(probe)}`);
        }
    }
    // Tasks carry the same env references as servers, so an unchecked task would be the one place a
    // typo'd or undeclared reference survives until someone actually runs it.
    for (const [label, map] of [["server", cfg.servers], ["task", cfg.tasks ?? {}]]) {
        for (const [srvName, srv] of Object.entries(map)) {
            for (const [envVar, value] of Object.entries(srv.env)) {
                try {
                    const ref = parseReference(value);
                    const declared = ref === null || Object.hasOwn(ref.kind === "oauth" ? cfg.oauth ?? {} : cfg.secrets, ref.name);
                    if (!declared) {
                        lines.push(`FAIL ${label} "${srvName}" env ${envVar}: undeclared ${ref.kind} "${ref.name}"`);
                    }
                } catch (e) {
                    lines.push(`FAIL ${label} "${srvName}" env ${envVar}: ${e.message}`);
                }
            }
        }
    }
    // A repository's launchable that has not been trusted, or has changed since it was: the launch would
    // refuse it, so the diagnostic that says the setup works must not pass it. The text is the launch's
    // own refusal, so the two cannot describe different remedies.
    for (const finding of trustFindings) {
        lines.push(`FAIL ${finding}`);
    }
    // Crossing from a project declaration to a personal secret OR sign-in is allowed and often
    // intended, but it is the one relationship a reader of either file alone cannot see: the
    // project file names something it did not declare, and the user file has no idea who consumes
    // it. Secret and oauth references share this loop because they share the rule crossingProblem
    // decides -- reporting one kind and not the other is the defect that rule exists to remove.
    const reportedWheres = new Set();
    for (const [kind, map] of [["servers", cfg.servers], ["tasks", cfg.tasks ?? {}]]) {
        const label = kind === "tasks" ? "task" : "server";
        for (const [name, decl] of Object.entries(map)) {
            const reported = new Set();
            for (const value of Object.values(decl.env)) {
                let ref = null;
                try {
                    ref = parseReference(value);
                } catch { /* reported as a FAIL above */ }
                // Keyed on kind AND name, not name alone: the two kinds share one name space, so a
                // launchable referencing both "secret:ado" and "oauth:ado" needs a line for each.
                if (ref === null || reported.has(`${ref.kind}:${ref.name}`)) {
                    continue;
                }
                const refDecl = ref.kind === "oauth" ? cfg.oauth?.[ref.name] : cfg.secrets[ref.name];
                // Only references that need authorizing are worth a line: a project-declared `local`
                // secret is namespaced to the project, and an undeclared reference is already a FAIL
                // above -- either way there is no grant to report.
                // No branch on ref.kind here either, for the same reason crossingProblem's own
                // declaredName comment gives: an oauth declaration already carries its own
                // declaredName, so re-stamping it is a no-op rather than a correction.
                // crossingSource, not authorizationFor: a user-home launchable consuming a user-home
                // declaration is "you wrote both sides" and has no grant to report, while one whose
                // declaration the repository replaced does -- the same split launch makes.
                const source = crossingSource(cfg, decl, refDecl, ref.name);
                if (source === null) {
                    continue;
                }
                reported.add(`${ref.kind}:${ref.name}`);
                reportedWheres.add(source.where);
                const problem = crossingProblem(cfg, kind, name, ref.name, ref.kind);
                if (problem === null) {
                    lines.push(`INFO ${label} "${name}" (${decl.home}) is authorized to receive "${ref.name}"`);
                    continue;
                }
                // The block, not advice about the block: what stands between the reader and a working
                // launch is one paste, and asking them to translate a diff into JSON adds a way to get it
                // wrong. A shape they can read is also a shape they can refuse.
                // Escaped, whole and pasteable: see jsonForTerminal.
                const shape = jsonForTerminal({ [name]: problem.actual }, 2).split("\n")
                    .map((l) => `       ${l}`).join("\n");
                // The kind is named here, not just the name: a launchable naming both "secret:ado"
                // and "oauth:ado" gets two FAIL lines whose headlines would otherwise be
                // byte-identical apart from the where on the continuation line.
                lines.push(`FAIL ${label} "${name}" (${decl.home}) wants ${ref.kind} "${ref.name}" and is ${problem.reason}.`
                    + `\n     Read the command below; if you want it to have that, put this under`
                    + ` ${problem.where}.${kind} in ${CONFIG_HINT_PATH}:\n${shape}`);
            }
        }
    }
    // A non-user-scope oauth declaration the loop above never named: nothing references it (a user-home
    // launchable that does is named above, since the repository's declaration is not yours). Its own
    // authorization is still worth reporting when the block is absent, because that is the report
    // cmdLogin's refusal promises exists -- see the rule stated above authorizationRefusal.
    for (const [oauthName, oauthDecl] of Object.entries(cfg.oauth ?? {})) {
        if (oauthDecl.home === USER_SCOPE) {
            continue;
        }
        const source = authorizationFor(cfg, oauthDecl);
        if (source === null || source.block !== undefined || reportedWheres.has(source.where)) {
            continue;
        }
        lines.push(`INFO oauth "${oauthName}" (${oauthDecl.home}): no registration block yet --`
            + ` add {} under ${source.where} in ${CONFIG_HINT_PATH} so "vc-secrets login ${oauthName}" will run`);
    }
    if (typeof shimContract === "number" && shimContract < REQUIRED_SHIM_CONTRACT) {
        lines.push(`WARN the installed shim speaks contract ${shimContract}, this launcher expects ${REQUIRED_SHIM_CONTRACT} -- re-run the vc-secrets install skill`);
    }
    if (backend !== null && lines.length === 0) {
        lines.push(`OK platform=${platform} backend=${backend} -- nothing to report`);
    }

    return lines;
}

const WRITE_PROBE_NAME = "vc-secrets-writeprobe";

// The write probe's own throwaway key. Always this name -- distinct from any real secret or oauth
// entry -- so the probe can never collide with, and therefore never clobbers, a live value. Scoped to
// the project when one is declared (mirroring where a real local secret would actually live), or to
// the user otherwise, so the key stays syntactically valid (vc-secrets:<scope>:<name>) even with no
// project configured at all.
//
// The project scope is that namespace's key, and a repository chooses its projectId -- another project's
// included. Where this checkout is not trusted for it (`namespaceTrusted` false), the probe writes and
// then DELETES under whatever that other project stored there, so it is keyed under the user scope
// instead: the probe answers a question about the keystore, which any key answers alike.
function writeProbeKey(cfg, namespaceTrusted = true) {
    return keyFor(WRITE_PROBE_NAME, { scope: cfg?.projectId && namespaceTrusted ? "project" : USER_SCOPE }, cfg);
}

// Rehearses at the LIMIT, not with a token-shaped string, and the two backends fail at different
// places. On macOS/keychain the constraint is the length of the command line `security` receives, so
// the value is sized to put that line exactly at its limit. On Windows the constraint is the blob
// itself, so the value IS the limit. Either way a probe that writes something small passes on
// precisely the machine where a real entry would not fit.
function writeProbeValue(cfg, env = process.env, backend = "keychain", namespaceTrusted = true) {
    if (backend === "wcm") {
        return "p".repeat(WCM_BLOB_LIMIT);
    }
    // Sized from the key the probe actually writes under, which is what puts the composed line at
    // exactly the limit -- the limit is a property of the LINE, not of the key, so every key sized
    // this way rehearses the same thing. Sizing from some other key (a real oauth entry's, say)
    // breaks that: the value is then padded for a different overhead, and where the other key is
    // the shorter one the probe overflows its own budget and reports a FAIL on a healthy machine.
    const key = writeProbeKey(cfg, namespaceTrusted);
    const overhead = Buffer.byteLength(buildLocalWrite("keychain", key, env, { value: "" }).stdinCommand(""));

    return "p".repeat(Math.max(1, SECURITY_LINE_LIMIT - overhead));
}

// macOS is the only platform whose non-interactive write differs from the one `vc-secrets set`
// exercises: `set` types into a TTY, while login and the mid-session renewal go through
// `security -i`. That path has no other rehearsal, so doctor rehearses it -- a throwaway entry
// written and immediately removed. Without this the first proof that it works is a token
// rotation in the middle of a session, which is the worst possible place to find out.
const WRITE_PROBED_BACKENDS = ["keychain", "wcm"];

// Windows was added because that is where the ceiling is: `doctor` was silent about whether a token
// could be STORED on the one platform whose store refuses an oversize value, and the refusal arrives
// after the authorization code is spent, which cannot be retried. gpg stays out for now: there the
// write is a file, and a probe there answers a different question (a directory that reads but does
// not write) worth its own decision.
async function probeKeystoreWrite({ backend, write = writeSecretValue, remove = null, cfg = null, namespaceTrusted = true }) {
    if (!WRITE_PROBED_BACKENDS.includes(backend)) {
        return null;
    }
    if (cfg && Object.hasOwn(cfg.secrets ?? {}, WRITE_PROBE_NAME)) {
        // A declared secret of this name can be overwritten with the probe value and then deleted --
        // a diagnostic destroying the thing it was asked to check on. The test is on the NAME while
        // the probe writes a scoped KEY, so it is deliberately wider than the collision: a secret at
        // project or local scope does collide and is caught, and a user-scoped one while a projectId
        // is declared does not, yet is refused anyway. Wider is the safe direction here -- the cost
        // is a doctor run silently missing one line, and the alternative risks the entry itself.
        return null;
    }
    const key = writeProbeKey(cfg, namespaceTrusted);
    const removeEntry = remove ?? deleteEntryIo(backend);
    try {
        await write(key, writeProbeValue(cfg, process.env, backend, namespaceTrusted), { backend });
    } catch (e) {
        // Classified here, where the error still carries its exit code, and narrowly: exit 4 is the
        // Credential Manager helper's own code for an oversize blob and means nothing on any other
        // backend, so a `security` exiting 4 for an unrelated reason must not be read as a ceiling.
        // The keychain cannot reach this branch over its size at all -- writeProbeValue sizes the
        // probe so the composed line lands exactly ON the limit and the guard is strictly greater --
        // so it is only wcm that has a size verdict to report. Everything else is an ordinary refusal
        // (a locked keychain, a sandbox, a timeout), and calling those the ceiling sends the reader
        // after a size that was never the problem.
        return { oversize: backend === "wcm" && e.toolExitCode === 4, message: e.message };
    } finally {
        // Best effort, and deliberately also on the success path: a probe entry left behind is
        // clutter in the developer's keychain that nothing else would ever clean up.
        try {
            await removeEntry(key);
        } catch (e) {
            // The verdict is about the write, not the cleanup -- but a diagnostic that silently
            // leaves a stray entry behind has told the developer something untrue by omission.
            if (e.toolExitCode !== 3) {
                // sync write: stderr is async on a POSIX pipe and on a Windows console, and
                // process.exit drops pending writes. This is the finally, so the line can appear on a
                // successful probe as easily as a failed one -- and doctor writes its whole report
                // before exiting(1) on any FAIL in it, long after this line was queued.
                fs.writeSync(2, `vc-secrets: could not remove the write probe "${key}" (${e.message})\n`);
            }
        }
    }

    return "ok";
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

const DOCTOR_FLAGS = ["--all"];

// Which secrets does an ENABLED (or wired) launchable actually consume? A task has no enable list --
// it is run on purpose -- so anything it references counts as consumed, otherwise a Key Vault secret
// used only by a task would be reported SKIP and never checked. Servers and tasks are iterated
// separately so a task cannot mark a same-named SERVER enabled merely by existing -- that would drop
// the SKIP that keeps a teammate's `doctor` from FAILing on a Key Vault secret they cannot reach.
// The kind filter carries the same weight in the other direction: an oauth reference shares the
// reference grammar but declares no secret, and counting one as consumed un-skips a same-named
// Key Vault entry.
function consumedSecrets(cfg, enableLists, wired) {
    const consumed = new Set();
    const addConsumed = (srv, enabled) => {
        for (const value of Object.values(srv.env)) {
            try {
                const ref = parseReference(value);
                if (ref?.kind === "secret" && (enabled || cfg.secrets[ref.name]?.backend === "local")) {
                    consumed.add(ref.name);
                }
            } catch { /* reported by doctorReport */ }
        }
    };
    for (const [srvName, srv] of Object.entries(cfg.servers)) {
        addConsumed(srv, enableLists.enabled.includes(srvName) || wired.has(srvName));
    }
    for (const task of Object.values(cfg.tasks ?? {})) {
        addConsumed(task, true);
    }

    return consumed;
}

// Whether some launchable that references `secret:<name>` would be allowed to receive it: not refused by
// the trust gate (`trustProblems` is trustAssessment's map, keyed "<kind>/<name>"; a user-home launchable
// is in it only for a repository-namespace reader, which a Key Vault secret never makes it) and not
// refused by the authorization crossingProblem decides. Both calls are the
// launch's own, so this answers "would a launch read this?" -- which is what `doctor` must ask before it
// reads a secret the repository chose: a Key Vault read is paid for by the developer's `az` login, and an
// untrusted or unauthorized consumer is exactly the one whose launch would have been refused first.
// Every launchable counts as a consumer here, enabled or not; a task is never in an enable list at all.
function hasTrustedAuthorizedConsumer(cfg, secretName, trustProblems) {
    for (const kind of LAUNCHABLE_KINDS) {
        for (const [name, launchable] of Object.entries(cfg[kind] ?? {})) {
            const references = Object.values(launchable.env).some((value) => {
                try {
                    const ref = parseReference(value);

                    return ref?.kind === "secret" && ref.name === secretName;
                } catch {
                    return false;   // a malformed reference is its own FAIL in doctorReport
                }
            });
            if (references && !trustProblems.has(`${kind}/${name}`) && crossingProblem(cfg, kind, name, secretName) === null) {
                return true;
            }
        }
    }

    return false;
}

async function cmdDoctor(cfg, flags = []) {
    // An unrecognized flag used to be ignored, so `doctor --al` printed the same SKIP as a run
    // with no flag at all -- output indistinguishable from "checked it and skipped". A diagnostic
    // that silently drops what it doesn't understand reports a state that was never checked.
    const unknown = flags.filter((f) => !DOCTOR_FLAGS.includes(f));
    if (unknown.length > 0) {
        throw new VcSecretsError(`doctor: unknown argument "${unknown[0]}" (expected only ${DOCTOR_FLAGS.join(", ")})`);
    }
    const checkAll = flags.includes("--all");
    // .claude/vc-secrets.json's directory anchors both files: settings.local.json is its sibling,
    // .mcp.json is one directory above. No project declaration -> nothing to anchor on, so both
    // checks are skipped rather than guessed at -- a missing project is not itself a fault.
    const projectFile = cfg.files.project ?? cfg.files.local;
    const claudeDir = projectFile ? path.dirname(projectFile) : null;
    // Declared before the enable-list read rather than beside the wiring read: both inputs are
    // optional files that doctor must not silently substitute defaults for, so they report through
    // one channel.
    const wiringProblems = [];
    const enableLists = claudeDir
        ? readEnableLists(path.join(claudeDir, "settings.local.json"), wiringProblems)
        : { enabled: [], disabled: [], envKeys: [] };
    const clientConfigsSeen = [];
    const wired = readWiredServers(
        claudeDir ? path.join(claudeDir, "..", ".mcp.json") : null,
        path.join(process.env.HOME || os.homedir(), ".claude.json"),
        claudeDir ? path.dirname(claudeDir) : null,
        wiringProblems,
        clientConfigsSeen);
    // The other clients' configs, in their resolvable form. These are NOT clients.json's configFiles:
    // those are display templates for a human ("<repo>/.mcp.json") and handing one to fs is the mistake
    // that contract exists to prevent. The two lists agree by review, which is why this comment is here.
    const home = process.env.HOME || os.homedir();
    const projectRoot = claudeDir ? path.dirname(claudeDir) : null;
    const elsewhere = readWiredElsewhere([
        projectRoot ? path.join(projectRoot, ".cursor", "mcp.json") : null,
        path.join(home, ".cursor", "mcp.json"),
        path.join(home, ".codex", "config.toml"),
    ], clientConfigsSeen, wiringProblems);
    for (const marker of elsewhere) {
        wired.add(marker);
    }

    const consumed = consumedSecrets(cfg, enableLists, wired);

    let localBackend = null;
    try {
        localBackend = detectLocalBackend();
    } catch { /* reported via doctorReport */ }

    // Before the loop below, which needs it: a repository's Key Vault secret is read only on behalf of a
    // consumer the launch itself would let through.
    //
    // The trust file is read at most once however many questions put to it, and only when one is asked: a
    // gated launchable (trustAssessment), or an entry the repository stores in its namespace (below). An
    // unreadable file is one finding, not one per question.
    let trustStateRead = null;
    const readState = () => {
        if (trustStateRead === null) {
            try {
                trustStateRead = { state: readTrustState(process.env) };
            } catch (e) {
                trustStateRead = { error: e };
            }
        }
        if (trustStateRead.error !== undefined) {
            throw trustStateRead.error;
        }

        return trustStateRead.state;
    };
    const trust = trustAssessment(cfg, readState);
    // What this checkout may not read: the `local` secrets and oauth entries a repository declares, while no
    // record pins its projectId to this root (namespaceTrustProblem). Not read at all -- `doctor` is not a
    // launch, but a repository claiming another project's id would have the diagnostic read that project's
    // secret and its sign-in cache, and print the failure text. A user-scope declaration is never here.
    const trustFindings = [...trust.findings];
    const namespaceDeclared = namespaceDeclarations(cfg);
    let namespaceBlocked = false;
    if (namespaceDeclared.length > 0) {
        try {
            namespaceBlocked = namespaceTrustProblem(cfg, readState(), namespaceDeclared) !== null;
        } catch (e) {
            // Unreadable counts as not trusted, as it does for a launch; named once.
            namespaceBlocked = true;
            if (trust.unreadable === null) {
                trustFindings.push(e.message);
            }
        }
    }
    const namespaceNotRead = [];

    const resolver = makeSecretResolver(cfg);
    const resolvable = {};
    const skipped = [];
    const notRead = [];
    const legacyOnly = [];
    for (const [name, decl] of Object.entries(cfg.secrets)) {
        if (decl.backend === "keyvault" && !checkAll && !consumed.has(name)) {
            skipped.push(name);   // opt-in servers must not turn the team's doctor red
            continue;
        }
        // Not gated by --all: that flag widens which of YOUR secrets get checked, and this one is not
        // yours. `doctor` is not a launch, but it runs `az` with the vault and secret name the repository
        // wrote, so an untrusted repository whose task names the secret would otherwise get its read
        // performed -- and its failure text printed -- by the diagnostic alone.
        if (decl.backend === "keyvault" && decl.home !== USER_SCOPE && !hasTrustedAuthorizedConsumer(cfg, name, trust.problems)) {
            notRead.push(name);
            continue;
        }
        if (namespaceBlocked && isNamespaceDecl("secret", decl)) {
            namespaceNotRead.push({ kind: "secret", name });
            continue;
        }
        try {
            await resolver(name, decl);
            resolvable[name] = true;
        } catch (e) {
            // A throw is a FAILURE, and the advice for a secret that was simply never set is the
            // wrong advice for a resolver that blew up: `false` reaches doctorReport's "run
            // vc-secrets set ... or check az login" line, sending the developer to repair a
            // configuration that may be perfectly correct. An error carrying no message is rare and
            // is still a failure, so it gets a reason of its own rather than the absent-secret one.
            resolvable[name] = e?.message || "the resolver threw without naming a reason";
            // User scope only: migrate skips a repository's secret (a legacy entry is the person's own),
            // so advising it there would send the reader to a verb that does nothing for this name.
            if (decl.backend === "local" && localBackend !== null && decl.scope === USER_SCOPE) {
                try {
                    if ((await readLegacyLocalValue(localBackend, name, process.env)) !== null) {
                        legacyOnly.push(name);
                    }
                } catch { /* a broken legacy probe doesn't change this secret's own FAIL */ }
            }
        }
    }
    resolver.resolvedValues.length = 0;

    const backendTools = localBackend === "wcm" ? [psCommand()] : localBackend === "keychain" ? ["security"] : localBackend === "gpg" ? ["gpg"] : [];
    // A secret doctor declined to read needs no `az`: reporting the tool missing for a read that was never
    // going to happen would be a FAIL about nothing.
    const needsAz = Object.entries(cfg.secrets)
        .some(([name, d]) => d.backend === "keyvault" && !notRead.includes(name) && (checkAll || consumed.has(name)));
    const toolsMissing = [...backendTools, ...(needsAz ? ["az"] : [])].filter((t) => !commandOnPath(t));

    // Under the user scope when this checkout is not trusted for the repository's namespace: the probe
    // writes and deletes its key, and the repository's projectId may name another project's.
    const probeNamespaceTrusted = () => {
        if (!cfg.projectId || !WRITE_PROBED_BACKENDS.includes(localBackend)) {
            return true;
        }
        try {
            return namespaceTrustProblem(cfg, readState(), []) === null;
        } catch {
            // Unreadable counts as not trusted, as it does for a launch. Not a finding of its own: the
            // file is named where an entry or a launchable is held to it, and the probe is correct either way.
            return false;
        }
    };

    // cfg passed, because the probe's own guard is worthless without it: it refuses to run when a
    // DECLARED secret carries the probe name, and a caller not handing it the config would check
    // nothing. A guard nothing feeds is a comment.
    //
    // Skipped when the backend's own tool is missing, the same suppression the secret loop above
    // makes: the line naming the missing tool is already printed, and running the probe anyway added
    // a SECOND FAIL for that one cause plus a cleanup warning about an entry that was never written.
    const writeProbe = localBackend === null || backendTools.some((t) => toolsMissing.includes(t))
        ? null
        : await probeKeystoreWrite({ backend: localBackend, cfg, namespaceTrusted: probeNamespaceTrusted() });

    // Read, never exchanged: proving a token is refreshable would rotate the refresh token as a side
    // effect of a diagnostic -- and Entra rotates on use, which signs out every session but one.
    const oauthStatus = {};
    const oauthOversize = {};
    for (const [name, decl] of Object.entries(cfg.oauth ?? {})) {
        if (namespaceBlocked && isNamespaceDecl("oauth", decl)) {
            namespaceNotRead.push({ kind: "oauth", name });
            continue;
        }
        // Read, never recomputed. doctor holds no fresh token and must not exchange for one, so it
        // cannot measure what an access entry WOULD weigh -- and an entry that exceeded the ceiling
        // was never stored, so there is nothing in the keystore to measure either. The marker a
        // failed write left behind is the only place this fact survives.
        const marker = readOversizeMarker(oauthEntryKeys(name, decl, cfg).access);
        if (marker) {
            oauthOversize[name] = marker;
        }
        try {
            // cfg passed through (unlike the source's two-argument call): oauthEntryKeys needs it to
            // build a project-scope key -- keyFor reads cfg.projectId whenever decl.scope is not
            // "user". Drop it and a project-scope entry throws before the read ever reaches the
            // keystore; caught below, but reported as an opaque "Cannot read properties of undefined"
            // instead of the sign-in state a developer could act on.
            oauthStatus[name] = oauthStatusFrom(await oauthLaunchDeps(name, decl, cfg).readCache());
        } catch (e) {
            oauthStatus[name] = e?.message ?? "unreadable";
        }
    }

    const references = oauthReferences(cfg);
    const tenantChecks = await oauthTenantChecks(cfg, references);

    // Only where an oauth reference exists: before the switch no child needs --import at all, and a
    // FAIL about a flag nothing uses would be a diagnostic inventing its own problem.
    const childNodes = childNodeProbes(cfg, references, { refused: trust.problems });

    const lines = doctorReport(cfg, {
        env: process.env, platform: process.platform, enableLists, resolvable, skipped, notRead,
        toolsMissing, wired, configDirOverride: Boolean(process.env.VC_SECRETS_CONFIG_DIR), legacyOnly,
        shimContract: activeShimContract, wiringProblems, clientConfigsSeen,
        writeProbe, oauthStatus, oauthOversize, tenantChecks, childNodes, trustFindings, namespaceNotRead,
    });
    // sync write: stderr is async on a POSIX pipe and on a Windows console, and process.exit drops pending writes
    fs.writeSync(2, lines.join("\n") + "\n");
    if (lines.some((l) => l.startsWith("FAIL"))) {
        process.exit(1);
    }
}

// killProcessTree's follow-up SIGKILL: how long after the signal, and whether the timer keeps the process
// alive to deliver it. The default is for a caller that exits on its own.
const DEFAULT_KILL_ESCALATION = { afterMs: 5000, ref: false };

// The launcher's own escalation. It has to be SHORTER than the client's shutdown window, or it never
// runs: the MCP TypeScript SDK's stdio transport closes a server by ending stdin, waiting 2 s, sending
// SIGTERM, waiting 2 s, then SIGKILL (packages/client/src/client/stdio.ts in
// modelcontextprotocol/typescript-sdk). SIGKILL cannot be handled, so a launcher still waiting on a
// direct child that traps SIGTERM dies without running any handler, and the group -- which holds the
// secrets in its environment -- outlives it. The same file on the SDK's main branch also has an internal
// _dispose() for a version-negotiation probe sibling, which sends SIGTERM and then SIGKILL after only
// 1000 ms. The escalation must finish inside that shorter window, so it is half of it. Whether released
// clients ship that path was not verified, and the figure is chosen for the case where they do. That
// window is an MCP client's, so it binds servers only: a task is started by a person from a terminal,
// nothing SIGKILLs the launcher behind it, and so short a window is too little for a run that writes
// its summary or rolls back on Ctrl-C -- a task keeps the grace the default always gave it. Ref'd in
// both cases so that firing does not depend on some other handle keeping the loop alive -- today the
// child's own handle does, but this timer is the whole guarantee and should not lean on that.
const LAUNCH_KILL_ESCALATION = {
    servers: { afterMs: 500, ref: true },
    tasks: { afterMs: 5000, ref: true },
};

// How long a server's group is given to leave on its own once the client has closed the launcher's stdin,
// before the launcher tears it down. The client's shutdown is "end stdin, wait 2 s, SIGTERM, wait 2 s,
// SIGKILL" (see LAUNCH_KILL_ESCALATION), and the point of relaying stdin is to act inside that first 2 s:
// a launcher that waits for the SIGTERM may never get one (the client died), and a SIGKILL runs nothing.
// A server that reads stdin to EOF and exits is not hurried -- it has this long, and its close ends the
// launcher through the ordinary path. What has to fit inside the 2 s is this grace plus the server
// escalation that follows it (1000 + 500 ms).
const LAUNCH_STDIN_CLOSE_GRACE_MS = 1000;

// A signal reaches the direct child only. On Windows that leaves a grandchild running: `dnx` spawns
// dotnet.exe, which survives, orphans, and keeps a lock on the package file it was reading -- so the
// NEXT run fails with "the process cannot access the file" instead of the clean timeout it deserved.
//
// SYNCHRONOUS on the win32 branch on purpose: a caller that kills and exits on the next line races its
// own teardown, and an async spawn loses. The POSIX path needs no such care -- kill(2) has been
// delivered on return.
//
// Two follow-up timers exist, and they serve different callers. The default is unref'd, so it can never
// hold a process open: it is for a caller that stays alive after the kill. Every caller here except
// cmdLaunch exits on the next line and takes that timer with it, so for them it is inert. cmdLaunch is
// the caller whose survival is the point -- it passes LAUNCH_KILL_ESCALATION for its kind, ref'd, because a
// direct child that traps the signal keeps the launcher running and nothing else would end it. The
// "exit" handler in cmdLaunch covers every way the launcher leaves ON ITS OWN; only the ref'd timer makes
// it leave.
//
// The child must have been spawned DETACHED, or `-child.pid` names a group it is not in: usually
// absent, but a recycled pid makes it someone else's, and that group takes the SIGKILL follow-up.
// cmdLaunch and vc-secrets-probe.mjs both spawn detached.
//
// Returns the SIGKILL follow-up timer so a caller that later stands its handlers down can clear it, or
// null where none was armed: on win32, where taskkill /T /F is already forced, and when `escalation` is
// null, which is how a caller that forwards several signals arms it once.
function killProcessTree(child, signal, { platform = process.platform, spawnSyncProcess = spawnSync,
    killProcess = (pid, sig) => process.kill(pid, sig),
    resolveCommand = (command) => resolveSpawnCommand(command, { platform }),
    escalation = DEFAULT_KILL_ESCALATION } = {}) {
    if (platform === "win32") {
        let taskkill;
        try {
            // Absolute, because a bare `taskkill` is looked up in the cwd first and this runs from the
            // project checkout.
            taskkill = resolveCommand("taskkill.exe").cmd;
        } catch (e) {
            if (!(e instanceof VcSecretsError)) {
                throw e;
            }
            // The direct child only, which is what a plain kill reaches; a tree left running beats
            // running whatever a lookup in the cwd would have found.
            child.kill(signal);

            return null;
        }
        spawnSyncProcess(taskkill, ["/PID", String(child.pid), "/T", "/F"],
            { stdio: "ignore", windowsHide: true });

        return null;
    }
    let group = true;
    try {
        killProcess(-child.pid, signal);   // the group, which is why both callers spawn detached
    } catch {
        // No group of its own, so escalating to the group below would signal a pgid this child is not
        // in -- and pids are recycled, so in principle somebody else's.
        group = false;
        child.kill(signal);
    }
    if (escalation === null) {
        return null;
    }
    const timer = setTimeout(() => {
        try {
            if (group) {
                killProcess(-child.pid, "SIGKILL");
            } else {
                child.kill("SIGKILL");
            }
        } catch { /* already gone */ }
    }, escalation.afterMs);
    if (!escalation.ref) {
        timer.unref();
    }

    return timer;
}

// The signals a launcher (and the probe, which spawns one) takes over from the child it detached. SIGQUIT
// is left out on win32: libuv's Windows signal support is limited, and whether `process.on("SIGQUIT")`
// is accepted there was not verified -- if it threw, it would abort every Windows launch before the child
// started, to guard a Unix keystroke (Ctrl-\). A parameter so a test
// can say what win32 gets without being on it.
function forwardedSignalsFor(platform = process.platform) {
    return platform === "win32" ? ["SIGINT", "SIGTERM", "SIGHUP"] : ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"];
}

// A repeating interval rather than one timer aimed at the margin: a timer that long fires late after
// a host suspend, and a late wake costs a window of 401s nothing will retry, because the launcher is
// not in the data path and cannot see one.
//
// BOUNDED FROM ABOVE by MARGIN_MS (vc-secrets-cache.mjs): entering the margin is noticed up to one
// tick late, so this granularity spends the same budget the margin holds for the renewal's two
// keystore writes, an exchange and a wrong clock. Raising it past that budget breaks nothing
// observable, which is why a test ties the two together across the modules the terms live in
// (vc-secrets-oauth.test.mjs).
const RENEWAL_TICK_MS = 5 * 60 * 1000;

// One launch path for both kinds. A `task` is not an MCP server, but everything that matters here is
// the same: resolve, strip the inherited legacy vars, inject into this child only, forward stdio, and
// take the whole process group down on a signal. Giving tasks their own copy of this is how the two
// would drift on the parts that are security-relevant.
async function cmdLaunch(kind, name, cfg, deps = {}) {
    // The gate stands before anything that could prompt or spend a credential: a repository nobody has
    // trusted must not cost even a keystore unlock, and refusing after resolution would have already
    // handed it that. The trust file is read only when trustGateOf says the launch is gated: the winning
    // entry is a repository's, or it is the person's own but reads a namespace the repository declares.
    // Every other user-scope launch never depends on the file -- an unreadable one cannot take down the
    // servers you wrote yourself.
    if (trustGateOf(cfg, requireLaunchable(kind, name, cfg)) !== null) {
        const problem = trustProblem(cfg, kind, name, deps.trustState ?? readTrustState(process.env));
        if (problem !== null) {
            throw new VcSecretsError(trustRefusal(kind, name, problem, cfg));
        }
    }
    const startedAt = process.hrtime.bigint();
    const resolver = makeSecretResolver(cfg);
    // On win32 the launch's tree is bound to this process with a job object, so that a TerminateProcess of
    // the launcher -- how an MCP client stops a server there -- ends the server and everything under it;
    // the reasoning is at PS_CRED_READ_MANY. For servers and tasks alike, as the POSIX "exit" handler below
    // kills the group for both. It has to happen BEFORE the spawn, because only a process created after the
    // assignment is in the job, and it rides in the same PowerShell call as the Credential Manager reads,
    // which resolveEnvEntries makes before its first read -- after validation, so a refused launch starts
    // no PowerShell at all. With no wcm name to read, the call is the bind alone.
    //
    // A bind that fails -- a restricted context can deny the job calls -- leaves the launch where it was
    // before this existed: it runs, and says once that a client stop may leave its tree behind. Refusing
    // to launch over it would trade a working server for a guarantee the platform would not give.
    //
    // The oauth entries' two keys ride in that same call when oauthLaunchDeps will read the Credential
    // Manager, which saves the launch two more PowerShell round trips. What comes back is held apart
    // (oauthSeed) and handed to oauthLaunchDeps, whose first readCache alone may use it. It is not part of
    // the Map prefetch returns, which is keyed by a secret's name: an entry and a secret may share one.
    let oauthSeed = null;
    const prefetch = (deps.bindPlatform ?? process.platform) === "win32"
        ? async (refs, oauthRefs) => {
            // The backend oauthLaunchDeps defaults to. An invalid VC_SECRETS_LOCAL_BACKEND is not raised here:
            // it is raised where it is today, by the read that needs it.
            let oauthBackend = null;
            if (oauthRefs.length > 0) {
                try {
                    oauthBackend = deps.backend ?? detectLocalBackend();
                } catch (e) {
                    if (!(e instanceof VcSecretsError)) {
                        throw e;
                    }
                }
            }
            const extraKeys = oauthBackend === "wcm"
                ? oauthRefs.flatMap(({ name: entryName, decl }) => Object.values(oauthEntryKeys(entryName, decl, cfg)))
                : [];
            const { seeded, job, outcomes } = await resolver.readWcmBatch(refs,
                { pid: process.pid, extraKeys, ...(deps.credReadMany ? { run: deps.credReadMany } : {}) });
            oauthSeed = outcomes.size > 0 ? outcomes : null;
            if (job !== "ok") {
                // A whole-call failure carries PowerShell's stderr, which can span lines; the warning is one.
                const why = Number.isInteger(job) ? `win32 error ${job}` : job.replace(/\s*\r?\n\s*/g, " ");
                fs.writeSync(2, `vc-secrets: could not bind the launch's process tree to this launcher (${why})`
                    + " -- a client stop may leave it running\n");
            }

            return seeded;
        }
        : undefined;
    const entries = await resolveEnvEntries(name, cfg, resolver, kind, { prefetch });
    if (process.env.VC_SECRETS_TIMING === "1") {
        const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
        process.stderr.write(`vc-secrets: resolve phase took ${ms.toFixed(0)} ms\n`);   // budget measurement
    }
    if (entries.oauth.length > 1) {
        // One launch carries one token, one channel and one VC_SECRETS_TOKEN_ENV. Two references
        // would silently renew whichever the last write won, so refuse where the cause is still visible.
        throw new VcSecretsError(`${kind === "tasks" ? "task" : "server"} "${name}" references ${entries.oauth.length} `
            + `oauth entries (${entries.oauth.map((x) => x.envVar).join(", ")}) -- a launch can renew only one`);
    }
    const server = cfg[kind][name];
    let childEnv = mergeDeclaredEnv(inheritedChildEnv(process.env), entries.env);

    // Only a launchable with an oauth reference goes through what follows. Every other one takes
    // the plain spawn path -- routing them all through this would widen the NODE_OPTIONS carve-out
    // past the child it was authorised for.
    const [oauthEntry] = entries.oauth;
    let channel = null;
    let launchDeps = null;
    let token = null;
    let renewalTimer = null;
    const cleanup = () => {
        if (renewalTimer !== null) {
            clearInterval(renewalTimer);
        }
        channel?.removeSync();
    };
    if (oauthEntry !== undefined) {
        launchDeps = { serverName: oauthEntry.name,
            ...oauthLaunchDeps(oauthEntry.name, oauthEntry.decl, cfg, { ...deps, seed: oauthSeed }), ...deps };
        oauthSeed = null;   // oauthLaunchDeps holds the only reference that may be used, and drops it at its first read
        token = await ensureFreshToken(launchDeps);
        // Probe the declared binary when it is a node; otherwise the PATH node, which is a guess at
        // what the wrapper will resolve. The message distinguishes the two, because a refusal naming
        // a node the reader never declared is one they cannot act on.
        const probed = isNodeCommand(server.command) ? server.command : "node";
        // A declaration that sets PATH as a literal would otherwise be judged by the node this process's PATH
        // finds, and the launch run another. Not childEnv itself -- that holds the resolved secrets, and a
        // version probe has no use for them; a PATH or PATHEXT declared as `secret:` is therefore what the
        // probe cannot see (see probeEnvFor).
        const version = (deps.childNodeVersion ?? childNodeVersionIo)({ command: probed, env: probeEnvFor(server) });
        if (!childNodeSupportsImport(version)) {
            throw new VcSecretsError(childNodeRefusal({ launchableName: name, command: server.command,
                declared: probed === server.command, version }));
        }
        const nonce = crypto.randomBytes(32).toString("base64url");
        // "exit" is where this process actually leaves: the normal path is child.on("close") ->
        // process.exit and a thrown error is fail() -> process.exit, neither of which runs a
        // signal handler. A filesystem socket outlives its process unless something removes it.
        //
        // Registered BEFORE the channel exists, because everything in between is a window where a
        // throw leaks the directory -- resolving the spawn command and the spawn itself both live
        // there, and fail() runs only the handlers already installed. With a null channel the
        // handler is a no-op, so registering early costs nothing and closes the window entirely.
        process.on("exit", cleanup);
        const scopeKey = scopeKeyFor(oauthEntry.decl, cfg);
        channel = await (deps.createChannel ?? createChannel)({ name, scopeKey, nonce });
        childEnv = buildChildEnv(childEnv, { token, envVar: oauthEntry.envVar,
            channelPath: channel.path, nonce, preloadPath: PRELOAD_PATH,
            targetPackage: oauthEntry.decl.targetPackage, binName: oauthEntry.decl.binName });
    }

    // Looked up against the CHILD's environment, because that is the PATH its own spawn would search:
    // a declaration may set PATH (it is not denylisted), and resolving against this process's would
    // find a different binary than the one Node then fails to, or does, run.
    const invocation = buildSpawnInvocation(
        (deps.resolveCommand ?? resolveSpawnCommand)(server.command, { env: childEnv }), server.args);
    // With "inherit" the client's stdin reaches the SERVER, and its EOF reaches only the server: the MCP
    // SDK's stdio transport has no end handler, so a server holding the event loop (an interval, a socket,
    // a child) never leaves, and if the client died no SIGTERM ever comes -- the launcher and the detached
    // group holding the secrets live on. So a server's stdin goes through the launcher, which can act on
    // the EOF. A task keeps the terminal itself (Ctrl-C, prompts); win32 keeps "inherit" too, where the
    // group is bound to the launcher another way; and a TTY is a person at a keyboard, not a client that
    // closes a pipe. The stream is looked up only once the others are ruled out, so a task never touches
    // process.stdin.
    const stdin = kind === "servers" && process.platform !== "win32" ? deps.stdin ?? process.stdin : null;
    const relayStdin = stdin !== null && !stdin.isTTY;
    const child = (deps.spawnFn ?? spawn)(invocation.cmd, invocation.args, {
        stdio: relayStdin ? ["pipe", "inherit", "inherit"] : "inherit",
        env: childEnv,
        detached: process.platform !== "win32",   // own process group -> we can kill the whole tree
        ...invocation.opts,
    });
    resolver.resolvedValues.length = 0;   // shrink the in-heap window

    let unattachedTicks = 0;
    let everAttached = false;
    let renewing = false;
    if (channel !== null) {
        renewalTimer = setInterval(() => {
            // Asked every tick, and before the exchange, because "is anything attached" is a property
            // of the channel rather than of the token. Counting it on the renewal instead made the
            // warning wait for a NEW token: ensureFreshToken returns the cached one while it is still
            // valid, so the first line arrived at the first mid-life refresh -- about 48 minutes into
            // a 60-minute token -- and the escalation only at the rotation after that, half an hour
            // after the token the server started with had expired. The text promised ticks; the
            // counter counted rotations.
            if (channel.peers() > 0) {
                everAttached = true;
                unattachedTicks = 0;   // whatever the count was about is over, and its claim with it
            } else {
                unattachedTicks += 1;
                // The first is ordinary and its promise is true: a server still starting has not
                // connected yet, and the handover does happen when it does. A SECOND means another
                // RENEWAL_TICK_MS passed with nothing attached, and by then the likely cause is that
                // no process ever matched the declared target -- at which point repeating the first
                // message would be asserting a future that will not arrive.
                //
                // That diagnosis is only available while nothing has EVER attached. A client can drop
                // while the launcher lives (the channel deletes it from the push set on close or
                // error), and then the count starts over from zero -- so without everAttached the
                // second tick after a drop would state, of a process that did match and did receive
                // tokens, that none ever matched. Resetting the count alone only delayed that by two
                // ticks; it is the CLAIM that has to be withdrawn, not the timer restarted.
                //
                // The preload cannot report this from its own side: NODE_OPTIONS reaches every node
                // process the server spawns, so failing isTargetEntry is the ordinary case there and
                // a line per miss would bury the one that matters.
                //
                // Silent from the third on: while nothing attaches the condition does not change, so
                // a line every tick would be noise -- but latching at ONE was what let the false
                // promise stand as the last word.
                if (unattachedTicks === 1) {
                    fs.writeSync(2, "vc-secrets: nothing is connected to the token channel; a renewed token "
                        + "will be handed over when a process connects\n");
                } else if (unattachedTicks === 2 && !everAttached) {
                    fs.writeSync(2, "vc-secrets: still nothing connected to the token channel -- no process has"
                        + ` matched the declared target (targetPackage "${oauthEntry.decl.targetPackage}"`
                        + `${oauthEntry.decl.binName ? `, binName "${oauthEntry.decl.binName}"` : ""}),`
                        + " so the server is running on the token it started with and will lose access when"
                        + " that one expires\n");
                }
            }
            // A tick can outlast its own interval -- the contended wait alone runs to 45 s -- and
            // overlapping ticks cannot double-exchange (the bind is process-wide) but do multiply
            // the poll load on the backend least able to absorb it.
            if (renewing) {
                return;
            }
            renewing = true;
            // Through the same locked path as the launch: every concurrent launcher computes its
            // schedule from the same expiry, so without the lock they all wake together and all
            // exchange -- and Entra rotates on use, which signs out every session but one.
            ensureFreshToken(launchDeps).then((fresh) => {
                if (fresh === token) {
                    return;
                }
                token = fresh;
                // The delivery count is not read here: a push reaching nobody is the same condition
                // the tick above already counted, on the same tick, and reporting it twice would put
                // the warning back on the rotation clock it was moved off.
                channel.push(fresh);
            }).catch((e) => {
                // Loud on fd 2 and nowhere else: the stdio channel is the client's, and the
                // server keeps serving on the token it already has until that token expires.
                fs.writeSync(2, `vc-secrets: renewal failed: ${e.message}\n`);
            }).finally(() => {
                renewing = false;
            });
        }, deps.renewalTickMs ?? RENEWAL_TICK_MS);
        renewalTimer.unref();   // must not keep the launcher alive after the child is gone
    }

    // The escalation is armed by the FIRST signal only: a second one (a client's SIGINT after its own
    // SIGTERM) re-signals the group but must not restart the clock the first one set.
    let escalationTimer = null;
    let stdinGraceTimer = null;
    const onSignal = (signal) => {
        // A signal has already started the teardown the grace timer would start; left armed, it would
        // signal the group a second time after the first one's escalation has been running.
        clearTimeout(stdinGraceTimer);
        const timer = killProcessTree(child, signal,
            { escalation: escalationTimer === null ? LAUNCH_KILL_ESCALATION[kind] : null });
        escalationTimer ??= timer;
    };
    // SIGHUP as well: it is what a closing terminal delivers, and the child is detached into a group of
    // its own, so without a handler the launcher dies of it (129) and the whole group lives on. SIGQUIT
    // is the same door from a keyboard: Ctrl-\ in a task's terminal reaches only the launcher, because the
    // child sits in its own session, and the default action kills the launcher without running its
    // "exit" handlers -- the group is left standing. (Not on win32: see forwardedSignalsFor.)
    const forwardedSignals = forwardedSignalsFor(deps.signalPlatform);
    for (const signal of forwardedSignals) {
        process.on(signal, onSignal);
    }
    // The one place every way this process leaves ON ITS OWN passes: the child's close, a spawn error,
    // fail(), an uncaught exception. Not a SIGKILL of the launcher itself (the MCP client's last step, or
    // the OOM killer) -- nothing runs then, which is why a forwarded signal also arms the short
    // escalation above, and a launcher killed before it fires still leaves the group. A group member
    // that traps SIGTERM outlives the direct child (see
    // killProcessTree), and it holds the secrets in its environment. SIGKILL rather than a signal it
    // can trap, without a grace period: nothing after "exit" runs, and the MCP client's own shutdown
    // SIGKILLs this process within seconds anyway. ESRCH -- the group already empty -- is the normal
    // case. A pid-less child is a spawn that never happened, which names no group.
    const onExit = () => {
        try {
            process.kill(-child.pid, "SIGKILL");
        } catch { /* already gone */ }
    };
    if (process.platform !== "win32" && Number.isInteger(child.pid)) {
        process.on("exit", onExit);
    }
    // Named, because dispose() has to detach them: they end the PROCESS, and a caller holding a
    // handle it has already disposed would otherwise have the whole CLI exit under it when the
    // child it no longer owns happens to close.
    const onChildError = (e) => {
        // sync write: stderr is async on a POSIX pipe and on a Windows console, and process.exit drops pending writes
        fs.writeSync(2, `vc-secrets: failed to spawn ${server.command}: ${e.message}\n`);
        process.exit(1);
    };
    const onChildClose = (code, signal) => {
        clearTimeout(stdinGraceTimer);
        process.exit(signal ? 1 : (code ?? 1));   // signal collapse to 1 is accepted
    };
    child.on("error", onChildError);
    child.on("close", onChildClose);

    // The relay. EOF on the launcher's stdin means the client has closed the transport; the child gets
    // the EOF (end:false: the end and the grace timer start from one place), and a child that does not
    // leave on it within the grace is torn down through the same path a SIGTERM takes, escalation
    // included. A child that closes first ends the launcher through onChildClose. A child without a stdin
    // (the suite's fakes) has nothing to relay to. An unexpected error on either stream is thrown, which
    // the uncaught-exception path turns into the "exit" handler above killing the group -- loud, and not a
    // leak.
    const onChildStdinError = (e) => {
        if (e?.code !== "EPIPE" && e?.code !== "ERR_STREAM_DESTROYED") {
            throw e;
        }
        // The child has stopped reading, not necessarily exited: a server may close its stdin and keep its
        // event loop, and then no close is on the way. pipe() detaches on this error and leaves the
        // launcher's stdin paused, so the client's EOF -- queued behind whatever it wrote last -- would
        // never be read and the grace timer never armed. Keep draining; onStdinEnd still gets the EOF.
        stdin.unpipe(child.stdin);
        stdin.resume();
    };
    const onStdinEnd = () => {
        // The stream may already be destroyed by the error above; ending it again has nothing to do.
        if (!child.stdin.destroyed) {
            child.stdin.end();
        }
        // A signal that got here first has begun the teardown and armed the escalation; a grace timer
        // behind it would only signal the group again.
        if (escalationTimer === null) {
            stdinGraceTimer = setTimeout(() => onSignal("SIGTERM"), LAUNCH_STDIN_CLOSE_GRACE_MS);
        }
    };
    const relaying = relayStdin && child.stdin != null;
    if (relaying) {
        child.stdin.on("error", onChildStdinError);
        stdin.on("end", onStdinEnd);
        stdin.pipe(child.stdin, { end: false });
        // A stdin that has already ended will not emit "end" again.
        if (stdin.readableEnded) {
            onStdinEnd();
        }
    }

    // A launch outlives this call in production -- the process exits from the handlers above -- so
    // the handle exists for callers that must end one without ending the process: the suite, and
    // any later verb that launches a server to ask it something.
    return {
        child,
        channel,
        dispose: async () => {
            process.off("exit", cleanup);
            process.off("exit", onExit);
            for (const signal of forwardedSignals) {
                process.off(signal, onSignal);
            }
            child.removeListener("error", onChildError);
            child.removeListener("close", onChildClose);
            clearTimeout(stdinGraceTimer);
            if (relaying) {
                stdin.removeListener("end", onStdinEnd);
                stdin.unpipe(child.stdin);
                child.stdin.removeListener("error", onChildStdinError);
            }
            if (renewalTimer !== null) {
                clearInterval(renewalTimer);
            }
            if (escalationTimer !== null) {
                clearTimeout(escalationTimer);
            }
            await channel?.close();
        },
    };
}

function cmdRun(serverName, cfg, deps = {}) {
    return cmdLaunch("servers", serverName, cfg, deps);
}

// The declared-task counterpart of `run`. There is deliberately no verb that takes a command from the
// caller: a task's argv lives in the declaration, so it is reviewed in a PR like a server's, and the
// tool still has no way to print a secret or route one into something chosen at the call site.
function cmdTask(taskName, cfg, deps = {}) {
    return cmdLaunch("tasks", taskName, cfg, deps);
}

// The controlling terminal, opened for reading and for writing. Not stdin/stderr: those can be a pipe
// or a file whatever the process was started from, while /dev/tty is the terminal of the session the
// process belongs to -- and opening it fails (ENXIO) for a process that has none. The caller treats any
// failure to open it as a refusal, never as a fallback to stdin, which would be the very thing this
// replaces.
function openControllingTerminal() {
    let readFd = null;
    let writeFd = null;
    try {
        readFd = fs.openSync("/dev/tty", "r");
        writeFd = fs.openSync("/dev/tty", "w");
    } catch (e) {
        for (const fd of [readFd, writeFd]) {
            if (fd !== null) {
                fs.closeSync(fd);
            }
        }
        throw e;
    }
    const input = new tty.ReadStream(readFd);
    const output = new tty.WriteStream(writeFd);

    return { input, output, close: () => { input.destroy(); output.destroy(); } };
}

// One line from `terminal`, for a question that has no default worth taking. EOF before an answer is an
// empty one, which the caller reads as "no".
function askLine(question, terminal = { input: process.stdin, output: process.stderr }) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: terminal.input, output: terminal.output });
        rl.once("close", () => resolve(""));
        rl.question(question, (answer) => {
            resolve(answer);
            rl.close();
        });
    });
}

const logToStderr = (text) => fs.writeSync(2, text);

// Records what this repository's declarations ask to run, after the person has read it -- and, for a
// repository that declares no launchable of its own, that its projectId may be trusted as the namespace of
// the secrets and sign-ins it declares: the ones the person's own user-scope launchables read from it, and
// the ones `set`, `login` and `logout` store and remove.
//
// The terminal requirement is a CONFIRMATION OF INTENT, not a security boundary. The guard hook sees
// only the client's write tools, so the record is reachable through a shell, and this verb refuses to
// be driven by a pipe, a redirected stream, a script or an agent's plain shell tool: it needs stdin AND
// stderr to be terminals (stderr because that is where the review is shown), and on POSIX it reads the
// answer from /dev/tty rather than from stdin. A process that deliberately allocates a pseudo-terminal
// gets past every one of those -- `script`, `expect`, a pty library on any OS, ConPTY or winpty on
// Windows -- and nothing here can tell it from a person. On win32 there is no /dev/tty to open, so the
// answer is still read from stdin and only the stdin/stderr check stands.
//
// A trust record REPLACES the previous one for the repository, so an entry that is gone from the
// declarations is gone from the record too, rather than staying approved for a later re-declaration.
async function cmdTrust(cfg, { isTTY = process.stdin.isTTY === true, isErrTTY = process.stderr.isTTY === true,
    platform = process.platform, openTerminal = openControllingTerminal, ask = askLine, env = process.env,
    now = () => new Date(), log = logToStderr } = {}) {
    const root = cfg.projectRoot;
    const gated = gatedLaunchables(cfg);
    // Entries the repository stores in its namespace count with the launchables: `set`, `login` and `logout`
    // need this checkout's record for them (requireNamespaceTrust), so a repository that declares one is
    // recorded even when nothing launches it. The same notion decides the exit below and the record's removal.
    const declared = namespaceDeclarations(cfg);
    if (gated.length === 0 && declared.length === 0) {
        // An old record for a repository that declares nothing gated any more would be trust waiting for
        // the next declaration to inherit, so it goes -- the safe direction, which is why this needs no
        // terminal.
        if (root !== null) {
            const state = readTrustState(env);
            if (Object.hasOwn(state.repositories, root)) {
                delete state.repositories[root];
                writeTrustState(env, state);
                log(`vc-secrets: nothing in ${pathForTerminal(root)} needs trust -- removed its trust record\n`);

                return;
            }
        }
        log(`vc-secrets: nothing in ${root === null ? "this repository" : pathForTerminal(root)} needs trust\n`);

        return;
    }
    const refusal = new VcSecretsError("vc-secrets trust requires an interactive terminal -- it confirms what this "
        + "repository may run, and a pipe or a script cannot answer it for you");
    // Every refusal comes before the review is printed, not after: the review is where a literal's value
    // appears, and a caller that cannot answer -- an agent's shell, a pipe, a pty with no controlling
    // terminal -- must not be handed the text it would have approved.
    if (!isTTY || !isErrTTY) {
        throw refusal;
    }
    // It throws on an unreadable or corrupt record BEFORE the person is asked, and before the terminal is
    // opened, so a refusal here leaves nothing to close. The review reads the other roots' projectIds from
    // it; what is written is read again after the answer, below.
    const current = readTrustState(env);
    let terminal;
    if (platform === "win32") {
        terminal = { input: process.stdin, output: process.stderr, close: () => {} };
    } else {
        try {
            terminal = openTerminal();
        } catch {
            throw refusal;
        }
    }
    const review = [];
    for (const { kind, name, launchable } of gated.filter((x) => x.via === "repository")) {
        const file = pathForTerminal(cfg.files?.[launchable.home] ?? launchable.home);
        const shadow = shadowsUserScope(cfg, kind, name) ? ` -- shadows your user-scope "${name}"` : "";
        // What the person approves is printed as JSON, each part on its own line: unambiguous where a joined
        // list is not (a literal holding `, X=literal:y` reads as two declarations there and as one string
        // here) and lossless where flattening to "?" is not (the record keeps the byte the screen hides).
        // Whole, never cut. The values are shown -- a literal such as PATH decides which binary runs -- and
        // only here: the refusal lines, `doctor` and `emit-config` notes stay value-free (see
        // envDifferences), because they travel into a client's log.
        review.push(`${kind === "tasks" ? "task" : "server"} "${name}" (${launchable.home}, ${file})${shadow}`,
            `    command: ${jsonForTerminal(launchable.command)}`,
            `    args: ${jsonForTerminal(launchable.args)}`,
            `    env: ${Object.keys(launchable.env).length === 0 ? "(none)" : jsonForTerminal(launchable.env)}`);
    }
    // A user-scope launchable is the person's own, so there is no command to read -- what is approved is
    // which project's keystore namespace it is handed, and that is the repository's claim. One line per
    // reference, in every review that has any.
    const readers = gated.filter((x) => x.via === "namespace");
    for (const { kind, name, reads } of readers) {
        for (const read of reads) {
            review.push(`${kind === "tasks" ? "task" : "server"} "${name}" (user) will read ${read.kind} "${read.name}" from namespace ${JSON.stringify(cfg.projectId)}`);
        }
    }
    // What the repository stores in the namespace, named once: it is what `set`, `login` and `logout` act on.
    if (declared.length > 0) {
        review.push(`${namespaceReadsText(declared)} ${declared.length === 1 ? "is" : "are"} stored in namespace ${JSON.stringify(cfg.projectId)}`);
    }
    // Another root already recorded under this projectId is what a worktree of this repository looks like,
    // and equally what a different repository claiming the same id looks like -- the two cannot be told
    // apart from here, so the person is shown the fact and the reading that applies to each.
    const sharing = readers.length === 0 && declared.length === 0 ? [] : Object.entries(current.repositories)
        .filter(([other, record]) => other !== root && record.projectId === cfg.projectId)
        .map(([other]) => pathForTerminal(other));
    if (sharing.length > 0) {
        review.push(`INFO namespace ${JSON.stringify(cfg.projectId)} is already recorded for ${sharing.join(", ")} -- `
            + "expected for a worktree of this repository, not for another repository");
    }
    // The effective projectId, once: it is what a project-scope `secret:<name>` in the review resolves
    // under (a user-scope one resolves under `user`), and it is part of what the record pins.
    review.push(`projectId: ${cfg.projectId ?? "(none)"}`);
    let answer;
    try {
        log(`${review.join("\n")}\n`);
        answer = String(await ask(`Trust these for ${pathForTerminal(root)}? [y/N] `, terminal)).trim().toLowerCase();
    } finally {
        terminal.close();
    }
    if (answer !== "y" && answer !== "yes") {
        log("vc-secrets: not trusted -- nothing recorded\n");

        return;
    }
    const record = { trustedAt: now().toISOString(), projectId: cfg.projectId ?? null };
    // The shape is recorded for a repository's launchables only. A user-scope reader has none to pin; the
    // record's existence and its projectId are what it is held to (trustProblem).
    for (const kind of LAUNCHABLE_KINDS) {
        record[kind] = Object.fromEntries(gated.filter((x) => x.via === "repository" && x.kind === kind)
            .map((x) => [x.name, launchShape(x.launchable)]));
    }
    // Read AGAIN: the person took as long as they took, and an `untrust` (or a trust of another
    // repository) that landed meanwhile is in the file now and not in a copy read before the prompt.
    const state = readTrustState(env);
    state.repositories[root] = record;
    writeTrustState(env, state);
    const recordedCount = Object.keys(record.servers).length + Object.keys(record.tasks).length;
    const readerLine = readers.length === 0 ? ""
        : `vc-secrets: ${readers.length} user-scope launchable(s) may now read namespace ${JSON.stringify(cfg.projectId)} from ${pathForTerminal(root)}\n`;
    const storeLine = declared.length === 0 ? ""
        : `vc-secrets: ${namespaceReadsText(declared)} may now be stored and removed in namespace ${JSON.stringify(cfg.projectId)} from ${pathForTerminal(root)}\n`;
    log((recordedCount === 0
        ? `vc-secrets: recorded ${pathForTerminal(root)} as the source of namespace ${JSON.stringify(cfg.projectId)} -- it declares no server or task of its own to run\n`
        : `vc-secrets: trusted ${Object.keys(record.servers).length} server(s) and ${Object.keys(record.tasks).length} task(s) for ${pathForTerminal(root)}\n`)
        + readerLine
        + storeLine
        + `vc-secrets: a secret crossing still needs its own authorization in ${CONFIG_HINT_PATH} -- "vc-secrets doctor" reports each one\n`);
}

// The way back. No terminal and no declaration needed: removing trust only ever makes launches stricter.
async function cmdUntrust(pathArg, { env = process.env, cwd = process.cwd(), log = logToStderr } = {}) {
    const root = trustRootKey(pathArg ?? configPaths(env, cwd).root ?? cwd);
    const state = readTrustState(env);
    if (!Object.hasOwn(state.repositories, root)) {
        log(`vc-secrets: ${pathForTerminal(root)} has no trust record -- nothing to remove\n`);

        return;
    }
    delete state.repositories[root];
    writeTrustState(env, state);
    log(`vc-secrets: removed the trust record for ${pathForTerminal(root)}\n`);
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

// Raised only when the shim's own contract changes. `doctor` compares it against what the shim
// reported so a stale shim says so itself -- the failure it would otherwise cause (an old pointer to a
// launcher whose entry contract moved) surfaces as a missing export, which reads like a broken install.
const REQUIRED_SHIM_CONTRACT = 2;
let activeShimContract = null;

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

async function main(argv) {
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
        await cmdDoctor(cfg, argv.slice(1));
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

// The single entry point, used both by direct invocation below and by the shim -- which cannot rely on
// the gate at the bottom, because when the shim runs it is argv[1], not this file. Two entry paths
// diverging is how the wrapped and unwrapped invocations start behaving differently.
async function runCli(argv, { shimContract } = {}) {
    if (typeof shimContract === "number") {
        activeShimContract = shimContract;
    }
    hardenSpawnEnv(process.env, process.platform);
    process.on("uncaughtException", fail);
    process.on("unhandledRejection", fail);

    return main(argv).catch(fail);
}

// "Was this file started as the program?" -- the gate that keeps importing the module from running its CLI.
// Node resolves symlinks for import.meta.url but process.argv[1] stays as typed, so a plain
// path.resolve comparison is false whenever the plugin is reached through a symlinked directory (a
// marketplace cache entry, a linked checkout) and the CLI then exits 0 having done nothing -- no usage
// line, no error. Both sides are canonicalised, not only argv[1]: under `node --preserve-symlinks-main`
// import.meta.url of the entry file keeps the link path, so realpathing one side alone would leave the
// two apart again. The JS realpathSync, not `.native`: it is the resolution Node's own loader applies to
// the module URL, so the two sides agree (canonicalPath, with the same resolve fallback). import.meta.main
// would be simpler but is absent on older Node.
function isDirectRun(moduleUrl, argv1 = process.argv[1]) {
    if (!argv1) {
        return false;
    }

    return canonicalPath(fileURLToPath(moduleUrl)) === canonicalPath(argv1);
}

export {
    isDirectRun,
    runCli, REQUIRED_SHIM_CONTRACT,
    VcSecretsError, REF_RE, parseReference, parseLiteral, LITERAL_PREFIX, CONFIG_NAME, LOCAL_CONFIG_NAME, KEY_PREFIX,
    SCHEMA_VERSION, SCOPE_ORDER, configPaths, parseConfigFile, loadConfig, keyFor, keyToPath, legacyKeyToPath,
    jsonSyntaxWhere, readFailureReason,
    oauthEntryKeys, oauthKeyClashes, oauthStatusFrom, oauthReferences, oauthTenantChecks,
    ORG_FLAGS_WITH_VALUE, ORG_FLAGS_WITH_VALUES, organisationFromArgs, resolveOrgTenant, TIMEOUT_TENANT_MS,
    resolveEnvEntries, detectLocalBackend, redactSecrets, secretsDir, psEncode, psCommand, PS_CRED_READ, PS_CRED_WRITE,
    oversizeMarkerPath, recordOversizeMarker, clearOversizeMarker, readOversizeMarker,
    PS_CRED_DELETE, decodeCredBlobHex, buildLocalRead, buildLocalWrite, buildLocalDelete, deleteEntryIo,
    PS_CRED_READ_MANY, buildCredReadMany, credReadManyIo,
    probeKeystoreWrite, WRITE_PROBE_NAME, writeProbeValue, WRITE_PROBED_BACKENDS,
    buildKeyvaultRead, TIMEOUT_LOCAL_MS, TIMEOUT_AZ_MS, VALUE_ON_STDIN, SECURITY_LINE_LIMIT, WCM_BLOB_LIMIT,
    COMMAND_ON_STDIN, quoteForSecurityInteractive, writeSecretValue,
    tokenLockFor, acquireTokenLock, ensureFreshToken, oauthLaunchDeps,
    CHANNEL_GREETING_MAX, channelPipeName, createChannel, PRELOAD_PATH, buildChildEnv,
    childNodeSupportsImport, childNodeVersionIo, isNodeCommand, childNodeRefusal, childNodeProbes,
    REDIRECT_PATH, MAX_ERROR_PARAMS, closeTabPage, forTerminal, escapeHtml, failedPage, listenForCallback,
    openBrowser, buildBrowserCommand, handleCallback, cmdLogin, cmdLogout, withDeadline, LOGIN_WAIT_MS,
    runTool, resolveSpawnCommand, buildSpawnInvocation, hardenSpawnEnv, commandOnPath, mergeDeclaredEnv,
    LAUNCH_KILL_ESCALATION, LAUNCH_STDIN_CLOSE_GRACE_MS,
    makeSecretResolver, cmdRun, cmdTask, cmdLaunch, killProcessTree, forwardedSignalsFor, failureLine,
    RENEWAL_TICK_MS,
    validateLaunchables, LEGACY_ENV_VARS, LEGACY_SECRET_ENV_VARS,
    mapResolveError, applyKeystrokes, promptHidden, cmdSet, cmdUnlock, unlockTargets, cmdDoctor, cmdMigrate, newKeyPresent, readLegacyLocalValue,
    SECRET_NAME_RE, LAUNCHABLE_NAME_RE, PACKAGE_NAME_RE, BIN_NAME_RE, doctorReport,
    readEnableLists, readWiredServers, readWiredElsewhere, consumedSecrets, DANGEROUS_ENV_VARS, sanitizeEnv,
    consumerShape, shapeDifferences, validateAuthorized, validateVaults, authorizationFor, crossingProblem, own,
    emitConfig, cmdEmitConfig, SERVER_DECL_KEYS,
    trustFilePath, trustRootKey, launchShape, trustDifferences, trustProblem, trustRefusal, trustAssessment, trustNotes,
    gatedLaunchables, namespaceDeclarations, namespaceTrustProblem, namespaceStoreRefusal, readTrustState, writeTrustState, cmdTrust, cmdUntrust, openControllingTerminal,
    // Re-exported so the test file reaches them through the namespace import it already uses.
    clientNames, clientDescriptor, MIN_VERSION_UNKNOWN, defaultDataHome, defaultShimDir, defaultShimPath,
};

if (isDirectRun(import.meta.url)) {
    runCli(process.argv.slice(2));
}
