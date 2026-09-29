#!/usr/bin/env node
// Blocks agent writes to what decides which command receives which secret, and to what then handles
// it: a declaration file, the trust record that lets a repository's declaration run at all, the
// installed shim every launch goes through, and this package's own files --
// all of them except the test files, which are how the package is worked on, and `README.md`, which
// grants nothing. `vc-secrets-probe.mjs` reads like a third exception and is not one: nothing on the run
// path imports it, which is the tempting reason, and that answers who imports the probe rather than who
// RUNS it -- `skills/doctor/SKILL.md`, guarded here, tells an agent to execute it, and it imports the
// launcher, so the launcher's whole export surface is one line away from a file nobody was watching.
//
// The names this package cannot claim on a whole machine -- `clients.*`, `hooks/targets.mjs`, the
// client manifests and the skill files -- are guarded only INSIDE the package directory, a smaller
// guarantee than the rest, stated as such where it is implemented. (`hooks-cursor.json` is in that
// group for a different reason: it travels with `hooks.json`, not because the name is contested.)
//
// This is a speed bump, not a boundary: it sees the client's write tools only, so the same write
// through a shell command goes past it untouched. The block message says so on purpose — a guard that
// reads as "protected" invites someone to build a security argument on top of it, and this one cannot
// carry it.
//
// Protocol, verified on both clients that read this: the tool call arrives as JSON on stdin; exit 2
// WITH a non-empty reason on stderr denies the call, exit 0 allows it. Exit 2 with an EMPTY stderr is
// treated as a failure and the call proceeds, so the reason is part of the contract, not decoration.
//
// It takes no --client: the hook file is shared, so it has one command string, and the payload's own
// tool_name is what says which shape this is.

import fs, { readFileSync } from "node:fs";

import { targetsFrom } from "./targets.mjs";

// `(^|\/)` and not a bare `\/`: a leading slash was safe only while every payload carried an absolute
// path, which was true of the one client that used to send them. Patch headers are workspace-RELATIVE
// by construction, so requiring the slash made this guard match nothing at all on that client — at
// exit 0, with no notice, which is the one outcome this file is written to avoid. The anchor stays,
// because dropping it entirely would match a directory merely ending in ".claude".
const DECLARATION_RE = /(^|\/)\.claude\/vc-secrets(\.local)?\.json$/i;
const SHIM_RE = /(^|\/)plugins\/data\/[^/]+\/vc-secrets-shim\.mjs$/i;
// The record of which repository declarations a person has read and approved to run. An agent that could
// write it would trust its own repository, which is the gate this file backs. It lives under the config
// base (`~/.config/vc-secrets/trust.json`, or `$XDG_CONFIG_HOME/...`), so it is matched by its
// directory and name -- `vc-secrets/` is the one segment no other file of that name is likely to sit
// under. The pending `.tmp` file `trust` writes before its rename is not matched: the rename is what
// makes it a record, and a stray one is never read.
const TRUST_FILE_RE = /(^|\/)vc-secrets\/trust\.json$/i;
// This package's own code. Three ways in, and a file needs only one of them: it is LOADED INTO a
// process that holds a token, it RELAXES WHAT AN AGENT MAY DO WITHOUT A HUMAN -- switching this guard
// off is the extreme of that, and a skill's `disable-model-invocation` the ordinary case -- or it
// DECIDES THE CONTENT of a file that does either. Not "does this file touch a token", and not "is it
// code" or "is it prose": each of those readings certified files harmless on their appearance, and each
// was wrong. The question is what an edit to the file can DO.
//
// The first way is an import. ESM runs an imported module at evaluation time, so everything the
// launcher imports executes in the process that reads the keystore, and everything the preload imports
// executes inside the MCP server process, which holds the token in its environment: `vc-secrets-error.mjs`
// is in BOTH -- directly in the launcher, and in the server process by way of `vc-secrets-target.mjs`
// -- while reading like the most harmless file here. The
// second way is this file, `targets.mjs`, and the hook registrations below -- and the registrations are
// the cheapest of the three, one key -- and the client manifests below are cheaper still, since one of
// them is the only thing pointing a client at a registration file. The third is `install-shim.mjs`,
// which writes the shim, together with `vc-secrets-shim.mjs`, whose bytes are what it writes.
//
// Matched by file rather than by directory. A directory-scoped pattern can reach the checkout and the
// plugin cache -- `PACKAGE_FILE_RE` below is one, and it needs an extra segment to do it -- but not a
// workspace rooted AT this package, which is how the package is ordinarily worked on. Matching the file
// buys that case and pays machine-wide matching for it: a same-named file in an unrelated repository is
// refused, which is pinned by a test as
// accepted rather than left to be discovered. `(^|\/)` for the same reason the two patterns above carry
// it, and its bare alternative is not decoration -- a package-rooted workspace sends `vc-secrets.mjs`
// with no directory at all. The `$` keeps `vc-secrets.mjs.bak` out. The test files are out for a
// different reason -- `.test.mjs` cannot match `(-…)?\.mjs` -- and freezing them would stop all work on
// this package, the fastest way to get a guard switched off wholesale.
const MODULE_RE = /(^|\/)(vc-secrets(-(oauth|cache|preload|target|shim|error|probe|teardown))?|guard-declarations|install-shim|shim-path)\.mjs$/i;
// The same package, scoped to its directory rather than matched by file. `clients.*`, `targets.mjs`,
// `hooks.json`, `plugin.json`, `SKILL.md` and `openai.yaml` are names half the repositories on this
// machine also use, and this hook runs in all of them, so matching those by file would refuse edits that
// have nothing to do with us. `hooks-cursor.json` is the exception inside the exception: nothing else
// uses that name, and it is here because it travels with `hooks.json` -- keeping the pair in one pattern
// beats a third pattern for one file. Scoping covers the checkout and, through the version segment
// below, the installed copy; it gives up the package-rooted workspace, which is the trade the paragraph
// above makes in the other direction.
//
// `clients.json` is here because `clients.mjs` reads it at module-evaluation time, so it arrives in the
// launcher's process as data the guarded module acts on. The hook registrations because either one turns
// this guard off in a single edit. The skill files because a client reads them as policy rather than as
// prose, and the three are here for two different reasons: `install` and `migrate` carry
// `disable-model-invocation: true`, which is what keeps a verb that copies a file and a verb that
// rewrites keystore entries human-invoked (`install` additionally carries `allowed-tools`, a standing
// permission grant; and `skills/install/agents/openai.yaml` and `skills/migrate/agents/openai.yaml` say
// the invocation half of the same thing to another client with `allow_implicit_invocation: false` --
// a restriction, not a grant, and doctor has no such file on purpose); `doctor` carries
// neither and is here for the opposite reason -- it is the one skill a model may invoke unprompted, and
// its body is the command that then runs. All of them read like documentation, which is the whole reason
// they are named here rather than left to be judged on sight.
//
// KNOWN AND OUT OF SCOPE: this repository's own `.claude-plugin/marketplace.json`, at the repo root
// rather than in this package, is what makes the package a plugin at all -- so it is an off switch this
// guard does not cover and cannot, since the name is not the package's to claim. It is the off switch
// inside the repository; the client's own enable flag and, on Codex, an untrusted hook are two more
// outside it. Recorded rather than left to be rediscovered.
// The three client manifests are here on the second prong too, and they are the CHEAPEST entry on it:
// `.cursor-plugin/plugin.json` carries `"hooks": "./hooks/hooks-cursor.json"` and is the only thing that
// POINTS a client at that file, so repointing one key makes the registration inert without touching it.
// (A test pins that value, so the repointing is not silent -- it is still cheaper than editing the
// registration, and the detector is a suite somebody has to run.) Each manifest is also what makes this
// plugin exist for its client at all, so deleting one takes the hook with it. Guarding the registrations
// while leaving the files that POINT at them writable is the same mistake one level up.
//
// The optional segment after `vc-secrets/` is the INSTALLED copy's version directory. The cache layout
// is `<root>/<marketplace>/<plugin>/<version>/`, measured and encoded in `vc-secrets-shim.mjs` -- the
// shim exists BECAUSE that path carries a version. Without this group the pattern covered the checkout
// and missed every installed copy, which is the copy `CLAUDE_PLUGIN_ROOT` points at and the only one a
// non-developer machine has. It is `[^/]+` and not a version shape, because "version directory" is not
// a shape: measured on one machine's cache, the names include `0.3.0`, the composite
// `0.9.0-89c71c99b8da`, bare hashes led by a letter, and one directory called `unknown`. Anything
// narrower misses some of them, and the ones it misses are the installs nobody thinks to check.
const PACKAGE_FILE_RE = /(^|\/)vc-secrets\/(?:[^/]+\/)?(clients\.(mjs|json)|hooks\/(targets\.mjs|hooks(-cursor)?\.json)|\.(claude|codex|cursor)-plugin\/plugin\.json|skills\/[^/]+\/(SKILL\.md|agents\/openai\.yaml))$/i;

let input;
try {
    input = JSON.parse(readFileSync(0, "utf8"));
} catch (e) {
    // Exit 0 stays: refusing every edit because this guard cannot read its own input blocks work
    // over a fault that is ours, and that is the decided answer. The LINE is what the decision was
    // missing. The `targets.readable` fail-open already says "not inspected" out loud for the same
    // class, and two things reach here: stdin that is not JSON at all -- a framing or encoding
    // change, or a truncated write -- and an fd 0 that cannot be read, which answers with an errno
    // (`0< /tmp` gives EISDIR). That second one is why the reason is not simply the word JSON. (A
    // payload whose SHAPE changed is still valid JSON and reaches targetsFrom.) Nobody in this
    // repository causes either and nobody would otherwise learn about them, because a guard that
    // stops inspecting silently reads exactly like one that inspected and allowed.
    //
    // The reason carries no part of V8's message. That message is built from a window of the input,
    // and on this fd the input is the client's tool payload -- the file content about to be written,
    // which is how a PAT in a .env reaches this line. jsonSyntaxWhere makes the same refusal in the
    // launcher and keeps the positional triple; here even that is dropped, because a position into
    // a transient stdin frame points at nothing the developer can open. This guard cannot import
    // jsonSyntaxWhere: targets.mjs imports nothing on purpose, and the launcher that holds it is
    // ~200 KB loaded once per tool call.
    const why = e instanceof SyntaxError ? "not valid JSON" : e.code ?? e.name;
    fs.writeSync(2, `vc-secrets guard: could not read its input (${why}) -- not inspected\n`);
    process.exit(0);
}

let targets;
try {
    targets = targetsFrom(input);
} catch (e) {
    // Nothing in targetsFrom throws today. The catch stays because exiting 1 from an unexpected throw
    // would ALLOW the call: refusing an edit is recoverable, letting a declaration edit through is not.
    fs.writeSync(2, `BLOCK: vc-secrets guard failed to read this payload -- ${e.message}\n`);
    process.exit(2);
}

if (!targets.readable) {
    // This used to be indistinguishable from "I found nothing". It stays rare by construction: a tool
    // that is not a write tool reports readable: true, so this fires only for a write whose payload
    // this guard could not parse — which is exactly the case worth saying out loud.
    const what = typeof input.tool_name === "string" && input.tool_name ? input.tool_name : "unnamed tool";
    fs.writeSync(2, `vc-secrets guard: unrecognised ${what} payload -- not inspected\n`);
    process.exit(0);
}

for (const raw of targets.paths) {
    const filePath = raw.replace(/\\/g, "/");
    // Covers all three homes: <repo>/.claude/vc-secrets.json, its .local. sibling, and
    // ~/.claude/vc-secrets.json
    if (DECLARATION_RE.test(filePath)) {
        fs.writeSync(2,
            "BLOCK: a vc-secrets declaration decides which command receives which secret -- change it via a human PR, not an in-session edit. "
            + "(This guard sees the client's write tools only; it is a speed bump, not a security boundary.)\n");
        process.exit(2);
    }
    // Not the declaration's remedy: the record changes only through `vc-secrets trust`, which asks a person
    // at a terminal -- a PR cannot reach it, and an in-session edit would skip the question.
    if (TRUST_FILE_RE.test(filePath)) {
        fs.writeSync(2,
            "BLOCK: the vc-secrets trust file records which repository declarations you approved to run -- change it with \"vc-secrets trust\" or \"vc-secrets untrust\" in your own terminal, not an in-session edit. "
            + "(This guard sees the client's write tools only; it is a speed bump, not a security boundary.)\n");
        process.exit(2);
    }
    // The shim is what every server launch runs, and — unlike the launcher in the plugin cache — a
    // plugin update never overwrites it, so an edit here survives indefinitely.
    if (SHIM_RE.test(filePath)) {
        fs.writeSync(2,
            "BLOCK: the vc-secrets shim is on the path of every server launch -- reinstall it with the vc-secrets install skill instead of editing it.\n");
        process.exit(2);
    }
    // Checked AFTER the shim, and the order is load-bearing: this pattern matches the installed shim
    // too, so testing it first would answer an installed-copy edit with "open a PR" when the fix there
    // is a reinstall. Both remedies are right in one place and useless in the other.
    //
    // The launcher is the reason this block exists at all -- it holds the keystore io and the login
    // verb, so an edit here changes what READS a token, where a declaration only names one. The rest
    // of the package qualifies through the three ways stated where MODULE_RE is defined.
    if (MODULE_RE.test(filePath) || PACKAGE_FILE_RE.test(filePath)) {
        fs.writeSync(2,
            "BLOCK: this is vc-secrets' own code on the path that handles a token -- change it through a human PR, not an in-session edit. "
            + "(This guard sees the client's write tools only; it is a speed bump, not a security boundary.)\n");
        process.exit(2);
    }
}

process.exit(0);
