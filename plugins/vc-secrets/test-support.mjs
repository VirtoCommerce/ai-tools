// Helpers shared by this package's test files: the source scanners (stripComments, codeOnly,
// callArguments), the launcher source readers, the one tmpDirs list with its after() cleanup, and the
// node:test wrappers socketTest, lockTest and channelTest with the bind probes that gate them and
// stubChannelPath, the socket path the channel probe and the stub channels bind. Not a test file itself:
// it declares no tests, and the CI step does not name it. (Node's default `node --test` discovery may
// still load it and finds nothing to run.) It sits outside lib/, so the declarations guard leaves it
// writable like the tests.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, after } from "node:test";
import net from "node:net";
import * as cache from "./vc-secrets-cache.mjs";

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url));

// A `/` opens a regex literal, not a division, after one of these characters or words. It is a
// decision on the previous token, because telling the two apart exactly takes a parser.
const REGEX_AFTER_CHARS = new Set("(,=:[!&|?{};+-*%<>~^");
const REGEX_AFTER_WORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "void", "throw", "new", "delete", "yield", "await"]);

const isWordChar = (c) => /[A-Za-z0-9_$]/.test(c);
const isSpace = (c) => /\s/.test(c);

// The last non-space character of `out`, and the identifier that ends there ("" if it is not one).
function previousToken(out) {
    let end = out.length - 1;
    while (end >= 0 && isSpace(out[end])) {
        end -= 1;
    }
    if (end < 0) {
        return { char: "", word: "" };
    }
    let start = end;
    while (start >= 0 && isWordChar(out[start])) {
        start -= 1;
    }

    return { char: out[end], word: out.slice(start + 1, end + 1) };
}

function regexAllowedAfter(out) {
    const { char, word } = previousToken(out);
    if (char === "") {
        return true;
    }

    return word === "" ? REGEX_AFTER_CHARS.has(char) : REGEX_AFTER_WORDS.has(word);
}

// The ONE scanner both exports below are built on. It walks `src` as code, drops `//` and block
// comments (a block comment leaves the newlines it held, so line numbers still match the source), and
// copies every literal through: a quoted string, a template literal whose `${}` expressions are code
// again, nested to any depth, and a regex literal. `blank` replaces the content of each literal with
// spaces, newlines kept, and keeps its delimiters (a regex keeps its flags); a quoted string directly
// after `from` or `import` is a module specifier and is the one literal left alone.
// Not a parser: a `/` is read as a regex or a division from the previous token alone, so some shapes are
// read the wrong way round, for example a regex after `)` (`if (x) /re/.test(y)`), or a division after
// `++` (`i++ / 2`), after `}`, or after a keyword-named property (`x.of / 2`).
function scanSource(src, blank) {
    let out = "";
    const hide = (text) => (blank ? text.replace(/[^\n]/g, " ") : text);

    // From the opening quote at `i`; returns the index after the closing one.
    function quoted(i) {
        const quote = src[i];
        let j = i + 1;
        while (j < src.length && src[j] !== quote) {
            j += src[j] === "\\" ? 2 : 1;
        }
        const end = Math.min(j, src.length);
        const specifier = blank && quote !== "`" && /^(?:from|import)$/.test(previousToken(out).word);
        out += quote + (specifier ? src.slice(i + 1, end) : hide(src.slice(i + 1, end)));
        if (end < src.length) {
            out += quote;
        }

        return end + 1;
    }

    // From the opening backtick at `i`; returns the index after the closing one.
    function template(i) {
        out += "`";
        let j = i + 1;
        let text = j;
        const flush = (to) => {
            out += hide(src.slice(text, to));
        };
        while (j < src.length && src[j] !== "`") {
            if (src[j] === "\\") {
                j += 2;
            } else if (src[j] === "$" && src[j + 1] === "{") {
                flush(j);
                out += "${";
                j = code(j + 2, true);
                if (src[j] === "}") {
                    out += "}";
                    j += 1;
                }
                text = j;
            } else {
                j += 1;
            }
        }
        flush(Math.min(j, src.length));
        if (j < src.length) {
            out += "`";
        }

        return j + 1;
    }

    // From the opening slash at `i`; returns the index after the flags. An unterminated one ends at
    // the line, which is where the parser would have failed.
    function regex(i) {
        let j = i + 1;
        let inClass = false;
        while (j < src.length && src[j] !== "\n") {
            const c = src[j];
            if (c === "\\") {
                j += 2;
                continue;
            }
            if (inClass) {
                inClass = c !== "]";
            } else if (c === "[") {
                inClass = true;
            } else if (c === "/") {
                break;
            }
            j += 1;
        }
        const body = Math.min(j, src.length);
        out += "/" + hide(src.slice(i + 1, body));
        if (src[body] !== "/") {
            return body;
        }
        let end = body + 1;
        while (end < src.length && /[A-Za-z]/.test(src[end])) {
            end += 1;
        }
        out += src.slice(body, end);

        return end;
    }

    // Code from `i`. Inside a `${}` it stops at the `}` that closes it and returns that index.
    function code(start, inTemplate) {
        let i = start;
        let depth = 0;
        while (i < src.length) {
            const c = src[i];
            const two = src.slice(i, i + 2);
            if (two === "//") {
                const newline = src.indexOf("\n", i);
                if (newline < 0) {
                    return src.length;
                }
                i = newline;
            } else if (two === "/*") {
                const close = src.indexOf("*/", i + 2);
                const stop = close < 0 ? src.length : close + 2;
                out += src.slice(i, stop).replace(/[^\n]/g, "");
                i = stop;
            } else if (c === '"' || c === "'") {
                i = quoted(i);
            } else if (c === "`") {
                i = template(i);
            } else if (c === "/" && regexAllowedAfter(out)) {
                i = regex(i);
            } else {
                if (inTemplate && c === "{") {
                    depth += 1;
                } else if (inTemplate && c === "}") {
                    if (depth === 0) {
                        return i;
                    }
                    depth -= 1;
                }
                out += c;
                i += 1;
            }
        }

        return i;
    }

    // A shebang is the one `#` line a module may open with; its `/` is not code.
    let start = 0;
    if (src.startsWith("#!")) {
        const newline = src.indexOf("\n");
        start = newline < 0 ? src.length : newline;
        out = src.slice(0, start);
    }
    code(start, false);

    return out;
}

// `src` with its comments removed and every newline kept, so a line of the result is the same line of
// the source. For any module's source, not only a function's toString(): a source-text assertion that
// matches a stripped body cannot be satisfied by a comment or a disabled line quoting the same
// identifier. Understands `//` and block comments, quoted strings, template literals with nested
// `${}` expressions, and regex literals (decided from the previous token, so see scanSource for the
// shapes it reads wrongly, for example a regex after `)` or a division after `++`). A shebang line is
// kept. Not a parser, and its parity with one is a procedure, not a standing check: after changing it,
// compare its output with the comment ranges a JavaScript parser reports for every module here.
export function stripComments(src) {
    return scanSource(src, false);
}

// `src` as code alone: comments removed, and the content of every string, template and regex literal
// blanked, newlines kept. A word in a literal (`--import "${x}"`) is then not a token, and a layering
// check that looks for `import` or a name finds code only. The exception is a module specifier, a
// quoted string directly after `from` or `import`, which is what such a check reads.
export function codeOnly(src) {
    return scanSource(src, true);
}

// The text between the `(` that `openIndex` follows and its matching `)`, for a call found in
// `stripped` (a stripComments result, so line numbers still match the source). Parentheses are counted
// on the codeOnly view of the same text, where a string, template or regex literal is blanks and so
// cannot hold one; the arguments are sliced from `stripped` itself. The two have the same length
// (blanking replaces characters one for one), which is what lets one index serve both. A caller
// scanning many calls in one file passes `blanked` so the view is made once, not once per call.
// A call written inside any literal (a script a test writes out and runs as a template, a string or
// a regex) is blanks in that view, its closing `)` with it, so the count would run on past the
// literal. That call is read as the code it is: the view is rebuilt from the text that follows it.
// That re-scan cannot tell the literal's own escapes and comment openers from code, so a call whose
// arguments hold a backslash, `//` or `/*`, or whose end the re-scan cannot find, is refused rather
// than read wrongly.
export function callArguments(stripped, openIndex, blanked = codeOnly(stripped)) {
    if (blanked.length !== stripped.length) {
        throw new Error("callArguments needs the stripComments result: codeOnly of it must have the same length");
    }
    const inLiteral = blanked[openIndex - 1] !== "(";
    const view = inLiteral ? codeOnly(stripped.slice(openIndex)) : blanked;
    const offset = inLiteral ? openIndex : 0;
    const unreadable = `the call opened before index ${openIndex} sits inside a literal and cannot be read reliably`;
    let depth = 1;
    for (let i = inLiteral ? 0 : openIndex; i < view.length; i += 1) {
        if (view[i] === "(") {
            depth += 1;
        } else if (view[i] === ")") {
            depth -= 1;
            if (depth === 0) {
                const args = stripped.slice(openIndex, offset + i);
                if (inLiteral && /\\|\/\/|\/\*/.test(args)) {
                    throw new Error(`${unreadable}: its arguments hold a backslash or a comment opener`);
                }

                return args;
            }
        }
    }

    // A backslash that escapes a backtick can make the re-scan open a literal of its own and miss the end,
    // or reach a `)` past it, which the backslash check above then refuses.
    throw new Error(inLiteral
        ? `${unreadable}: no closing parenthesis found, as when its arguments hold an escaped backtick`
        : `no closing parenthesis for the call opened before index ${openIndex}`);
}

// The launcher is the entry file plus everything under lib/. A test that reads the launcher as text
// reads all of it: a check scoped to the entry passes on a thin entry and covers nothing.
export function launcherSourceFiles() {
    const lib = path.join(PACKAGE_DIR, "lib");
    const moved = fs.existsSync(lib)
        ? fs.readdirSync(lib).filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs")).sort()
            .map((f) => path.join(lib, f))
        : [];

    return [path.join(PACKAGE_DIR, "vc-secrets.mjs"), ...moved];
}

export function launcherSource() {
    return launcherSourceFiles().map((f) => fs.readFileSync(f, "utf8")).join("\n");
}

export const tmpDirs = [];

after(() => {
    for (const dir of tmpDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

// Measured on this machine: a bind that is refused does NOT throw from listen() — it emits
// an 'error' event, and an unattached one aborts the whole process instead of failing one test.
// So the probe attaches a handler, which makes it async, which is why the skip decision happens
// inside each test rather than in a module-level constant.
//
// Adapted from the source's unix-domain-socket probe: the capability under test here is a
// loopback TCP bind, covering httpsPostForm's socket-drop behaviour, so the probe binds one
// instead of a unix socket — probing the wrong permission would answer confidently either way.
// The lock-file tests that need a real unix-socket bind get their own gate and probe further
// down (canBindLocks/lockTest), because they exercise a different privilege than this one.
let bindProbe = null;

function canBindSockets() {
    bindProbe ??= new Promise((resolve) => {
        const probe = net.createServer();
        probe.once("error", () => resolve(false));
        probe.once("listening", () => probe.close(() => resolve(true)));
        probe.listen(0, "127.0.0.1");
    });

    return bindProbe;
}

// This is the only coverage httpsPostForm's socket-drop behaviour has. Measured on this machine:
// a loopback TCP bind is permitted both inside and outside the Claude Code sandbox — it is the
// unix-socket bind the sandbox refuses, which is what the source's probe tested and why this one
// was changed. So the expected outcome here is RUN, not skip: a run reporting it skipped means a
// broken probe or an unusually restricted host, and either way the skip is a signal.
export const socketTest = (name, fn) => test(name, async (t) => {
    if (!(await canBindSockets())) {
        t.skip("needs an environment that permits a loopback TCP bind");

        return;
    }
    await fn(t);
});

// acquireLock binds a UNIX socket (abstract on linux, a filesystem path on darwin) — a different
// privilege from socketTest's loopback TCP probe above. Measured on this sandbox: TCP loopback
// bind is permitted, both an abstract AND a filesystem unix-socket bind are EPERM. So reusing
// socketTest here would answer "can bind" and every lockTest case would then fail EPERM, reading as
// a regression rather than a sandbox restriction — a probe of the wrong privilege answers
// confidently either way.
let lockBindProbe = null;

function canBindLocks() {
    lockBindProbe ??= new Promise((resolve) => {
        const probe = net.createServer();
        probe.once("error", () => resolve(false));
        probe.once("listening", () => probe.close(() => resolve(true)));
        probe.listen(cache.lockPathFor("selftest-" + process.pid, "proj",
            { platform: process.platform, env: process.env }));
    });

    return lockBindProbe;
}

// Unlike socketTest, a skip here is NOT a signal that the probe is broken — it is the expected
// outcome in the Claude Code sandbox, where a unix-domain-socket bind IS refused (EPERM). All
// four lockTest cases skip there, and a green in-sandbox run proves less than it looks like:
// measured, a mutation where release() never closes the server is fully green in-sandbox and
// only dies when the suite runs outside it.
export const lockTest = (name, fn) => test(name, async (t) => {
    if (!(await canBindLocks())) {
        t.skip("needs an environment that permits a unix-domain-socket bind");

        return;
    }
    await fn(t);
});

// The path/pipe a stub channel binds to. Named pipes on Windows have no filesystem lifetime to
// clean up, so only the POSIX branch registers a tmpDir for the `after()` sweep.
let pipeSeq = 0;

export function stubChannelPath() {
    if (process.platform === "win32") {
        return `\\\\.\\pipe\\vcs-t16-${process.pid}-${pipeSeq++}`;
    }
    // /tmp rather than os.tmpdir(): a socket path is limited to sun_path's ~104-108 bytes, which a
    // redirected TMPDIR can exceed -- measured on Linux, the bind then lands silently at a truncated path.
    const dir = fs.mkdtempSync("/tmp/vcs-t16-");
    tmpDirs.push(dir);

    return path.join(dir, "c.sock");
}

// The preload's net.connect uses a filesystem socket / named pipe -- neither socketTest's TCP bind
// nor lockTest's abstract-namespace bind -- and a probe of the wrong privilege answers confidently
// either way (the file's own comment above lockTest records that defect once already).
let channelBindProbe = null;

function canBindChannel() {
    channelBindProbe ??= new Promise((resolve) => {
        let probePath;
        try {
            probePath = stubChannelPath();
        } catch {
            resolve(false);

            return;
        }
        const probe = net.createServer();
        probe.once("error", () => resolve(false));
        probe.once("listening", () => probe.close(() => resolve(true)));
        probe.listen(probePath);
    });

    return channelBindProbe;
}

export const channelTest = (name, fn) => test(name, async (t) => {
    if (!(await canBindChannel())) {
        t.skip("needs an environment that permits a filesystem-socket bind");

        return;
    }
    await fn(t);
});
