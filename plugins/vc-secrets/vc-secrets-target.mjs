// vc-secrets-target.mjs — decides which process a renewed token is delivered into.
//
// Imported by the preload (inside the server process), by config validation and by the launcher, so it
// has NO top-level action of any kind. The preload's guarded receiver lives in its own module for that
// reason: were it here, importing this would run the receiver's guard inside the launcher, leaving only
// the entry-path check between it and a channel whose variables the launcher's own environment carries
// whenever it is itself a child of a wrapped server.
import { VcSecretsError } from "./vc-secrets-error.mjs";

// The declaration names a package, never a pattern: this gate decides which process receives a
// credential, and a caller-supplied regex is a user-widened boundary. One copy of each grammar --
// loadConfig refuses a declaration with the same expression this module builds from.
const PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
// Declared separately because a bin name is not a function of the package name: @azure-devops/mcp
// ships the bin mcp-server-azuredevops, and node_modules/.bin/<bin> is the ordinary npx entry.
const BIN_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

const SEP = "[\\\\/]";
const escapeForPath = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").split("/").join(SEP);

function targetEntryPattern(packageName, binName = null) {
    // typeof before the grammar, never String(): undefined and null stringify to names it accepts.
    if (typeof packageName !== "string" || !PACKAGE_NAME_RE.test(packageName)) {
        throw new VcSecretsError(`invalid target package name "${packageName}"`);
    }
    if (binName !== null && binName !== "" && (typeof binName !== "string" || !BIN_NAME_RE.test(binName))) {
        throw new VcSecretsError(`invalid target bin name "${binName}"`);
    }
    // Anchored on the package AND on its entry file: "dist/index.js" alone belongs to most packages on
    // disk, and the package path alone matches every file under its tree.
    const alternatives = [`${SEP}${escapeForPath(packageName)}${SEP}dist${SEP}index\\.js$`];
    if (binName) {
        alternatives.push(`${SEP}${escapeForPath(binName)}(\\.cmd)?$`);
    }

    return new RegExp(alternatives.join("|"), "i");
}

// Never throws, unlike the builder. The preload calls this at the top level of a module loaded through
// NODE_OPTIONS into every node process below the launcher, npx included, and a throw there ends the
// process before its own code runs (measured on node 22: exit 1, the entry script never starts). A
// malformed target would then cost the launch rather than a renewal. The loud refusal belongs to
// loadConfig, which checks the same grammar before anything is spawned.
function isTargetEntry(entry, packageName, binName = null) {
    if (typeof entry !== "string") {
        return false;
    }
    let pattern;
    try {
        pattern = targetEntryPattern(packageName, binName);
    } catch {
        return false;
    }

    return pattern.test(entry);
}

export { PACKAGE_NAME_RE, BIN_NAME_RE, targetEntryPattern, isTargetEntry };
