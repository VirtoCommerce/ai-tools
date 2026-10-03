// Which files is this tool about to write? One reader per PAYLOAD SHAPE, chosen by the payload's own
// tool_name — not by a flag, because the hook file that invokes this is shared between two clients and
// therefore has one command string to say it with.
//
// This module imports nothing on purpose. It is loaded by a process spawned once per edit; the launcher
// is ~200 KB and clients.json costs a file read, and neither is needed to answer the question above.

// Four headers name a path. `*** Environment ID:` also has a filename production in the upstream
// grammar but names an environment, so it is excluded deliberately rather than by omission — and the
// upstream constant has no trailing space, so it would not match this pattern anyway.
const PATCH_PATH_HEADER_RE = /^\*\*\* (?:Add File|Delete File|Update File|Move to): (.+)$/;

// The tools that write a file, across all three clients. Claude Code sends Edit / Write / NotebookEdit;
// Cursor documents the same tool_input shape and spells its write tools the same way; Codex sends the
// canonical `apply_patch` (Write and Edit exist there only as MATCHER aliases and never reach a
// payload, which is what makes dispatching on this field safe). `MultiEdit` is in the set but in no
// client's list and not in the shared matcher below, so nothing reaches here under that name today --
// kept because widening the matcher must not also require remembering to widen this.
const PATH_FIELD_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const PATCH_TOOL = "apply_patch";

// A note the shared hook file cannot carry, because it is JSON. That file's matcher is
// `Edit|Write|NotebookEdit` and does NOT list apply_patch, so this reader is reached only because the
// client sending apply_patch matches on ALIASES of those names while the payload keeps its canonical
// one. That is a load-bearing assumption about a client, taken from its source and not verifiable
// from this repository — so it is written down rather than left implicit, and if it is ever wrong the
// symptom is total: the guard never runs there, silently. The detector is the manual probe the README
// prescribes for that client — attempt an edit to a declaration and see it refused. Nothing automated
// here can catch it, which is exactly why the README makes it a setup step rather than a suggestion.

function fromPathFields(input) {
    // NotebookEdit carries notebook_path rather than file_path. A notebook is never a declaration, so
    // reading it costs nothing and keeps a routine edit out of the unreadable bucket.
    const paths = [input.file_path, input.notebook_path].filter((p) => typeof p === "string" && p !== "");
    // A write tool that yielded no path is UNREADABLE, not "writes nothing". This is the one place the
    // tool name does more than dispatch, and it exists for a specific unknown: if a client spells its
    // path key differently from its documentation, this is the payload that arrives, and calling it
    // readable would exit 0 in silence.
    return { paths, readable: paths.length > 0 };
}

function fromPatch(text) {
    const paths = [];
    for (const raw of text.split("\n")) {
        // Trailing whitespace only — \s already covers \r. Leading whitespace is what distinguishes a
        // header from a context line whose content happens to start with `*** `: the grammar prefixes a
        // context line with one of "+", "-", " ", and the upstream parser preserves that space inside a
        // hunk for exactly this reason. A whitespace-only line collapses to "" and matches nothing.
        const hit = PATCH_PATH_HEADER_RE.exec(raw.replace(/\s+$/, ""));
        if (hit) {
            paths.push(hit[1].trim());
        }
    }

    // Same rule as fromPathFields, and for the same reason: a patch always names at least one file, so
    // yielding none means this reader did not understand it. Returning readable:true here would turn
    // any upstream change in header spelling into silence instead of the notice.
    return { paths, readable: paths.length > 0 };
}

function targetsFrom(payload) {
    const p = payload || {};
    const input = p.tool_input;
    const name = typeof p.tool_name === "string" ? p.tool_name : "";

    if (name === PATCH_TOOL) {
        // The patch text arrives under `command`, not under `input`.
        const text = input && typeof input.command === "string" ? input.command : null;

        return text === null ? { paths: [], readable: false } : fromPatch(text);
    }

    if (PATH_FIELD_TOOLS.has(name)) {
        if (!input || typeof input !== "object") {
            return { paths: [], readable: false };
        }

        return fromPathFields(input);
    }

    // A payload that names no tool AT ALL still gets its path fields read. Dispatching on a name that
    // is not there must not turn a path-bearing write into "not a write tool" — that reintroduces, for
    // a different payload shape, exactly the silent pass this reader exists to remove. Unlike a NAMED
    // write tool, a missing name cannot make "no path" mean unreadable, because nothing here asserts
    // this was a write at all; so the no-path case stays silent rather than becoming a notice.
    if (name === "" && input && typeof input === "object") {
        return { paths: fromPathFields(input).paths, readable: true };
    }

    // Not a write tool as far as this guard knows. Reported as read-and-nothing-to-do rather than as a
    // failure, because on a client whose hook has no matcher this is most of the traffic. The guard's
    // stated scope has always been a subset of writes; a tool nobody here has seen stays in that gap
    // rather than turning every unrelated call into a notice.
    return { paths: [], readable: true };
}

export { targetsFrom };
