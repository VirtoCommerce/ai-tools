// Bottom layer: path, JSON-error-reason and terminal-text helpers; imports from no other lib/ module.

import fs from "node:fs";
import path from "node:path";

import { VcSecretsError } from "../vc-secrets-error.mjs";

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

// A JSON.parse failure is the one error in the JSON readers (config.mjs parseConfigFile;
// doctor.mjs readEnableLists, readWiredServers; trust.mjs readTrustState) whose message carries FILE CONTENT. V8
// builds it out of a window of the source around the error position, in three shapes: a window with text elided on
// both sides, a window anchored at the start, and -- for an input short enough -- the whole text. Every file parsed
// through here is one a credential sits in: .mcp.json and settings.local.json carry env blocks, and the config
// file carries the secrets map. The messages reach `doctor`, whose output is what a developer pastes into an issue.
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

// A path is context, not approved content, so it stays readable -- but it is a directory name somebody
// chose, and one carrying ESC or CR would rewrite the line it sits on. Escaped without truncating.
const pathForTerminal = (value) => forTerminal(value, Infinity);

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

export {
    canonicalPath, isAbsentPathError, pathPresent, jsonSyntaxWhere, readFailureReason, pathForTerminal,
    forTerminal, jsonForTerminal,
};
