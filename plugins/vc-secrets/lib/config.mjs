import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { VcSecretsError } from "../vc-secrets-error.mjs";
import { PACKAGE_NAME_RE, BIN_NAME_RE } from "../vc-secrets-target.mjs";  // the one copy of the target grammar

import { canonicalPath, jsonForTerminal, jsonSyntaxWhere, pathPresent } from "./util.mjs";
import { isDangerousEnvKey } from "./spawn.mjs";

const CONFIG_NAME = "vc-secrets.json";

// The user file as a message names it -- a hint a human reads and acts on, never a path this code
// opens, which is why it is a literal rather than a path.join. `~` is a POSIX shell convention with no
// Windows spelling at all, so joining it with the platform separator produces `~\.claude\...`: half one
// idiom and half the other, and different advice on different machines for the same mistake.
const CONFIG_HINT_PATH = `~/.claude/${CONFIG_NAME}`;

const LOCAL_CONFIG_NAME = "vc-secrets.local.json";

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

// Reported by `doctor` as "a legacy plaintext value is still present" — everything a pre-vc-secrets
// setup could have held in a server's env block, credentials and identifiers alike.
const LEGACY_ENV_VARS = ["ADO_MCP_AUTH_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN", "AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"];

// Deleted from the child's env by cmdLaunch before injection — the narrower list, because a
// tenant/client ID is an identifier, not a secret: a server that legitimately inherits one from the
// ambient shell must not be made to fail with an auth error naming nothing related to this tool.
// Only the actual credentials are stripped so a stale plaintext token cannot leak into the child.
const LEGACY_SECRET_ENV_VARS = ["ADO_MCP_AUTH_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN", "AZURE_CLIENT_SECRET"];

export {
    CONFIG_NAME, CONFIG_HINT_PATH, LOCAL_CONFIG_NAME, USER_SCOPE, SCHEMA_VERSION, SERVER_DECL_KEYS,
    REF_RE, SECRET_NAME_RE, LAUNCHABLE_NAME_RE, parseReference, LITERAL_PREFIX, parseLiteral, configPaths,
    consumerShape, shapeDifferences, validateVaults, validateAuthorized, own, authorizationFor, crossingSource,
    crossingProblem, validateLaunchables, parseConfigFile, SCOPE_ORDER, loadConfig, DOCTOR_REMEDY, trustRootKey,
    requireLaunchable, resolveEnvEntries, LEGACY_ENV_VARS, LEGACY_SECRET_ENV_VARS,
};
