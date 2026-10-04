// Doctor layer: the diagnostic report, keystore write probe, doctor verb; imports only from lower layers.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { VcSecretsError } from "../vc-secrets-error.mjs";

import { canonicalPath, forTerminal, isAbsentPathError, jsonForTerminal, pathForTerminal, readFailureReason } from "./util.mjs";
import { commandOnPath } from "./spawn.mjs";
import { CONFIG_HINT_PATH, LEGACY_ENV_VARS, USER_SCOPE, authorizationFor, crossingProblem, crossingSource,
    parseReference } from "./config.mjs";
import { SECURITY_LINE_LIMIT, WCM_BLOB_LIMIT, buildLocalWrite, deleteEntryIo, detectLocalBackend, keyFor,
    makeSecretResolver, psCommand, readLegacyLocalValue, readOversizeMarker, writeSecretValue } from "./keystore.mjs";
import { LAUNCHABLE_KINDS, isNamespaceDecl, namespaceDeclarations, namespaceTrustProblem, readTrustState,
    trustAssessment } from "./trust.mjs";
import { oauthEntryKeys, oauthKeyClashes, oauthLaunchDeps } from "./oauth-token.mjs";
import { oauthReferences, oauthStatusFrom, oauthTenantChecks } from "./oauth-checks.mjs";
import { childNodeProbes, childNodeRefusal, childNodeSupportsImport } from "./launch.mjs";

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
    // cmdLogin's refusal promises exists -- see the rule stated above authorizationRefusal (lib/config.mjs).
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

// deps: the suite drives doctor in-process -- it otherwise performs real keystore io, reads the
// developer's own client configs, and exits the process on a FAIL.
async function cmdDoctor(cfg, flags = [], deps = {}) {
    // An unrecognized flag used to be ignored, so `doctor --al` printed the same SKIP as a run
    // with no flag at all -- output indistinguishable from "checked it and skipped". A diagnostic
    // that silently drops what it doesn't understand reports a state that was never checked.
    const unknown = flags.filter((f) => !DOCTOR_FLAGS.includes(f));
    if (unknown.length > 0) {
        throw new VcSecretsError(`doctor: unknown argument "${unknown[0]}" (expected only ${DOCTOR_FLAGS.join(", ")})`);
    }
    const env = deps.env ?? process.env;
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
        path.join(env.HOME || os.homedir(), ".claude.json"),
        claudeDir ? path.dirname(claudeDir) : null,
        wiringProblems,
        clientConfigsSeen);
    // The other clients' configs, in their resolvable form. These are NOT clients.json's configFiles:
    // those are display templates for a human ("<repo>/.mcp.json") and handing one to fs is the mistake
    // that contract exists to prevent. The two lists agree by review, which is why this comment is here.
    const home = env.HOME || os.homedir();
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
        localBackend = "backend" in deps ? deps.backend : detectLocalBackend();
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
                trustStateRead = { state: readTrustState(env) };
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

    const resolver = deps.resolver ?? makeSecretResolver(cfg);
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
                    if ((await (deps.readLegacyLocalValue ?? readLegacyLocalValue)(localBackend, name, env)) !== null) {
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
    const toolsMissing = [...backendTools, ...(needsAz ? ["az"] : [])].filter((t) => !(deps.commandOnPath ?? commandOnPath)(t));

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
        : await (deps.probeKeystoreWrite ?? probeKeystoreWrite)({ backend: localBackend, cfg, namespaceTrusted: probeNamespaceTrusted() });

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
        const marker = readOversizeMarker(oauthEntryKeys(name, decl, cfg).access, env);
        if (marker) {
            oauthOversize[name] = marker;
        }
        try {
            // cfg passed through (unlike the source's two-argument call): oauthEntryKeys needs it to
            // build a project-scope key -- keyFor reads cfg.projectId whenever decl.scope is not
            // "user". Drop it and a project-scope entry throws before the read ever reaches the
            // keystore; caught below, but reported as an opaque "Cannot read properties of undefined"
            // instead of the sign-in state a developer could act on.
            oauthStatus[name] = oauthStatusFrom(await (deps.oauthLaunchDeps ?? oauthLaunchDeps)(name, decl, cfg).readCache());
        } catch (e) {
            oauthStatus[name] = e?.message ?? "unreadable";
        }
    }

    const references = oauthReferences(cfg);
    const tenantChecks = await (deps.oauthTenantChecks ?? oauthTenantChecks)(cfg, references);

    // Only where an oauth reference exists: before the switch no child needs --import at all, and a
    // FAIL about a flag nothing uses would be a diagnostic inventing its own problem.
    const childNodes = (deps.childNodeProbes ?? childNodeProbes)(cfg, references, { refused: trust.problems });

    const lines = doctorReport(cfg, {
        env, platform: process.platform, enableLists, resolvable, skipped, notRead,
        toolsMissing, wired, configDirOverride: Boolean(env.VC_SECRETS_CONFIG_DIR), legacyOnly,
        shimContract: deps.shimContract ?? null, wiringProblems, clientConfigsSeen,
        writeProbe, oauthStatus, oauthOversize, tenantChecks, childNodes, trustFindings, namespaceNotRead,
    });
    // sync write: stderr is async on a POSIX pipe and on a Windows console, and process.exit drops pending writes
    (deps.write ?? ((text) => fs.writeSync(2, text)))(lines.join("\n") + "\n");
    if (lines.some((l) => l.startsWith("FAIL"))) {
        (deps.exit ?? process.exit)(1);
    }
}

// Raised only when the shim's own contract changes. `doctor` compares it against what the shim
// reported so a stale shim says so itself -- the failure it would otherwise cause (an old pointer to a
// launcher whose entry contract moved) surfaces as a missing export, which reads like a broken install.
const REQUIRED_SHIM_CONTRACT = 2;

export {
    readEnableLists, readWiredServers, readWiredElsewhere, doctorReport, WRITE_PROBE_NAME,
    writeProbeValue, WRITE_PROBED_BACKENDS, probeKeystoreWrite, consumedSecrets, cmdDoctor, REQUIRED_SHIM_CONTRACT,
};
