import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import tty from "node:tty";

import { VcSecretsError } from "../vc-secrets-error.mjs";

import { forTerminal, isAbsentPathError, jsonForTerminal, pathForTerminal, readFailureReason } from "./util.mjs";
import { CONFIG_HINT_PATH, SERVER_DECL_KEYS, USER_SCOPE, configPaths, own, parseReference, trustRootKey } from "./config.mjs";
import { secretsDir } from "./keystore.mjs";

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

export {
    LAUNCHABLE_KINDS, trustFilePath, launchShape, trustDifferences, isNamespaceDecl,
    namespaceDeclarations, trustGateOf, gatedLaunchables, namespaceTrustProblem, trustProblem, trustRefusal,
    namespaceStoreRefusal, requireNamespaceTrust, readTrustState, writeTrustState, trustAssessment, trustNotes,
    openControllingTerminal, cmdTrust, cmdUntrust,
};
