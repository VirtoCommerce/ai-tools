#!/usr/bin/env node
// install-shim.mjs — puts the shim at a stable path and prints the settings entry and the commands
// that use it.
//
// This exists as a script rather than as prose in the command file because the three operations are
// exact: resolve one directory, copy one file, print the entry and the commands. Prose would have the
// agent re-derive them on every run, and a script can be tested.
//
// It never writes settings.json: that belongs to the developer, and a tool that edits it unasked is a
// tool nobody trusts twice. It prints; the human pastes. The commands it prints for `set`/`unlock`/
// `migrate`/`doctor` use the shim's literal path, so nothing needs writing to a shell's own startup
// file either — there is no second file in this story.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SHIM, defaultDataHome, defaultShimDir } from "./shim-path.mjs";

function fail(message) {
    // sync write: stderr is async on a POSIX pipe and on a Windows console, and process.exit drops pending writes
    fs.writeSync(2, `install-shim: ${message}\n`);
    process.exit(1);
}

function flag(name) {
    // Both spellings, because a silently dropped argument is the worst outcome here: an unmatched
    // `--data-dir=X` would install into the computed default and report that as the choice. For the same
    // reason two of them are refused rather than resolved by precedence.
    const joined = process.argv.find((a) => a.startsWith(`${name}=`));
    const at = process.argv.indexOf(name);
    if (joined !== undefined) {
        if (at >= 0) {
            fail(`${name} was given twice, as ${JSON.stringify(joined)} and as a separate value -- pass it once`);
        }

        return joined.slice(name.length + 1);
    }
    if (at < 0) {
        const misspelt = process.argv.find((a) => a.startsWith(name));
        if (misspelt !== undefined) {
            fail(`unrecognised argument ${JSON.stringify(misspelt)} -- write ${name} <value> or ${name}=<value>`);
        }

        return null;
    }
    const value = process.argv[at + 1];
    if (value === undefined || value.startsWith("--")) {
        fail(`${name} needs a value`);
    }

    return value;
}

// Derived from this file's own location and nothing else. The script always sits at <root>/scripts/,
// so the derivation cannot be wrong, while an inherited CLAUDE_PLUGIN_ROOT names whichever plugin's
// context reached this process -- the `--data-dir` check records a measured leak of exactly that
// shape for the sibling variable. Preferring the variable made a foreign root holding a file of this name
// install THAT file and exit 0, which is the silent half; the loud half was an install that aborted
// because the root it was handed contains no shim at all.
const pluginRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));   // scripts/ -> plugin root
const source = path.join(pluginRoot, SHIM);
if (!fs.existsSync(source)) {
    fail(`${source} not found -- this is not a complete plugin install`);
}

// The data directory survives plugin updates; the cache path carries the version and does not, which is
// the whole reason the shim exists. Its location arrives through `--data-dir`, which the plugin's own
// command fills from `${CLAUDE_PLUGIN_DATA}`: Claude Code substitutes that placeholder in the command's
// content, with the value belonging to the plugin that owns the file.
//
// The received value is still checked against this plugin's name, and the check is the load-bearing part
// of this block. The command line is a SHELL line: when Claude Code does not substitute the placeholder,
// the shell expands it from the inherited environment instead — and the environment variable of that name
// is exported to hook and MCP/LSP processes and inherited onward, so a script reached through the Bash
// tool sees whichever plugin's context set it. Measured: `…/data/codex-openai-codex`, an absolute path
// that every syntactic check accepts. Substitution and shell expansion are indistinguishable here, so
// arriving as an argument buys nothing on its own; only the name does.
//
// Getting it wrong is silent and its consequence is remote: uninstalling THAT plugin deletes its data
// directory, which would take this plugin's shim with it, long after the developer pasted the path into
// settings.json.
//
// With no usable value the id is the baked `CANONICAL_DATA_ID`, derived by rule rather than searched
// for: `<plugin>@<marketplace>` with non-alphanumerics dashed, both names from manifests this repo
// ships. The rule is written down because the constant alone cannot say how to rebuild it.
const dataHome = defaultDataHome();
const declared = flag("--data-dir");
if (declared !== null && declared !== "" && !path.isAbsolute(declared)) {
    fail(`--data-dir must be an absolute path, got ${JSON.stringify(declared)} -- a value still shaped like a placeholder means the command ran where Claude Code does not substitute it`);
}
let target = declared || null;
let how = "--data-dir";
let ignored = null;
if (target && !path.basename(target).toLowerCase().startsWith("vc-secrets")) {
    const because = path.basename(target) === ""
        ? "it names a filesystem root rather than a plugin directory"
        : "it names another plugin's directory, so the placeholder was not substituted";
    fs.writeSync(2, `install-shim: ignoring --data-dir=${target} -- ${because}\n`);
    ignored = target;
    target = null;
}
if (!target) {
    let why = "";
    if (ignored) {
        why = ` (--data-dir named ${path.basename(ignored)})`;
    } else if (declared === "") {
        why = " (--data-dir arrived empty)";
    }
    target = defaultShimDir();
    how = `the documented default under ${dataHome}${why}`;
}

const destination = path.join(target, SHIM);
let replaced = "installed";
try {
    fs.mkdirSync(target, { recursive: true });
    if (fs.existsSync(destination)) {
        // "a different copy", not "an older copy": a byte comparison settles that the two differ and
        // nothing about which way, so a downgrade read as an upgrade. Inside the try because these
        // reads fail exactly where the copy fails -- an unreadable destination belongs in "cannot
        // write the shim", not in a crash from the line that composes the report about it.
        replaced = fs.readFileSync(destination, "utf8") === fs.readFileSync(source, "utf8")
            ? "already up to date"
            : "replaced a different copy";
    }
    fs.copyFileSync(source, destination);
} catch (e) {
    fail(`cannot write ${destination}: ${e.message}`);
}

const lines = [
    `shim: ${destination} (${replaced}; directory chosen via ${how})`,
    "",
    "Add this to ~/.claude/settings.json -- a wrapped MCP server reads it, and picks it up only after a",
    "restart. Merge it into the existing \"env\" object if there is one; this file is not written for you.",
    "",
    `  {"env": {"VC_SECRETS": ${JSON.stringify(destination)}}}`,
    "",
    "Run these directly when working with vc-secrets by hand -- no other setup needed:",
    "",
    `  node ${JSON.stringify(destination)} set <name>`,
    `  node ${JSON.stringify(destination)} login <name>`,
    `  node ${JSON.stringify(destination)} unlock`,
    `  node ${JSON.stringify(destination)} migrate`,
    "",
    `Then verify:  node ${JSON.stringify(destination)} doctor`,
];
fs.writeSync(1, lines.join("\n") + "\n");
