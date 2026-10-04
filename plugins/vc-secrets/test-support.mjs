// Helpers shared by this package's test files. Not a test file itself (the runner's glob is
// `*.test.mjs`), and outside lib/, so the declarations guard leaves it writable like the tests.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
// Not a parser: a `/` is read as a regex or a division from the previous token alone, so a regex after
// `)` (`if (x) /re/.test(y)`) or a division after `++` (`i++ / 2`) is read the wrong way round.
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
// two shapes it reads wrongly). A shebang line is kept. Not a parser, so a change to it is checked by
// comparing its output with the comment ranges a JavaScript parser reports for every module here.
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
