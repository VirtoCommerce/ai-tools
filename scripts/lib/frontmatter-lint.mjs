// Detects YAML frontmatter values that a parser will mis-read, for the markdown components the
// plugins (and this repo's own `.claude/` surface) ship. See scripts/unit/plugin-frontmatter.test.mjs
// for the guard that runs it over the tree, and for the failure this exists to prevent (VCST-5807).
//
// WHAT THIS IS, AND IS NOT. It is NOT a YAML parse: no YAML library is a dependency of this repo
// (verified — nothing in package-lock.json provides one), and adding one to lint ~180 frontmatter
// blocks is not worth the supply-chain surface. It is a scan for the specific constructs that make a
// frontmatter value ambiguous or silently lossy — the failure class that actually occurred, plus its
// close relatives. So:
//
//   caught      — a plain (unquoted) value containing `: ` / `:<TAB>`, ending in `:`, opening with a
//                 YAML indicator, or containing ` #` (which silently truncates the value at a
//                 comment); the same three separator traps on a WRAPPED continuation line of a plain
//                 scalar; and a quoted value that is unterminated or closes early on an unescaped
//                 delimiter.
//   NOT caught  — indentation errors, duplicate keys, tabs used for indentation, a malformed
//                 multi-line BLOCK scalar body, nested/indented keys (the key regex is anchored at
//                 column 0 by design — see `ambiguousPlainScalars`), missing required keys.
//                 `claude plugin validate` is the thorough check; the unit-test workflow does not
//                 install the `claude` CLI (`ci/Dockerfile` does, but that image is the regression
//                 runner, not the PR gate), so this is the cheap always-on half.

/** A leading YAML indicator makes a plain scalar mean something other than text. */
const INDICATOR = /^[[\]{}&*!|>%@`#,]/;

/**
 * `key: >` / `key: |` introduces a BLOCK SCALAR — valid YAML, and the idiomatic way to write a long
 * multi-line description (`vc-perf`'s perf-loop SKILL.md does exactly this and validates clean).
 *
 * The header may carry an indent digit (1-9) and a chomp indicator (`+`/`-`) IN EITHER ORDER — `|2-`
 * and `|-2` are both valid. The first cut of this pattern hardcoded chomp-then-indent (`[+-]?\d*`),
 * so it rejected `|2-` / `>2-` / `|2+` and then flagged them via INDICATOR: a false positive on valid
 * YAML. That is the same over-match defect this guard's own review caught once already — and the fix
 * for a noisy detector is always to teach it the legitimate shape, never to delete the check.
 */
const BLOCK_SCALAR = /^[|>](?:[+-][1-9]?|[1-9][+-]?)?$/;

/** The separator/truncation traps. Applied to a plain scalar's first line AND its continuations. */
function plainScalarTrap(value) {
  if (/:[ \t]/.test(value)) {
    return { code: "COLON_SEPARATOR", why: "unquoted value contains a colon followed by a space or tab, which YAML reads as a key/value separator" };
  }
  if (value.endsWith(":")) {
    return { code: "TRAILING_COLON", why: "unquoted value ends in a colon, which YAML reads as an empty mapping key" };
  }
  if (/\s#/.test(value)) {
    return { code: "COMMENT_START", why: "unquoted value contains a space-hash, which starts a YAML comment — everything after it is silently dropped" };
  }
  return null;
}

/**
 * A quoted value is exempt from the plain-scalar traps — quoting IS the fix — but only if the quoting
 * itself is well-formed. An unterminated quote, or an unescaped delimiter that closes the scalar
 * early, is a parse error the plain-scalar rules would never see, so the guard would otherwise be
 * blind to a regression in its own remedy. A trailing ` # comment` after the closing quote is legal.
 */
function quotedTrap(value) {
  const q = value[0];
  const backslashEscapes = q === '"';
  let i = 1;
  let closed = false;
  for (; i < value.length; i++) {
    const c = value[i];
    if (backslashEscapes && c === "\\") { i++; continue; }
    if (c !== q) continue;
    if (!backslashEscapes && value[i + 1] === q) { i++; continue; } // '' is an escaped ' in YAML
    closed = true;
    break;
  }
  const name = backslashEscapes ? "double" : "single";
  if (!closed) return { code: "UNTERMINATED_QUOTE", why: `${name}-quoted value is not terminated` };
  const rest = value.slice(i + 1);
  if (rest.trim() === "" || /^\s+#/.test(rest)) return null; // end of value, or a trailing comment
  return {
    code: "UNESCAPED_QUOTE",
    why: backslashEscapes
      ? 'double-quoted value contains an unescaped " that closes it early (escape it: \\")'
      : "single-quoted value contains an unescaped ' that closes it early (double it: '')",
  };
}

/**
 * Frontmatter values whose form is ambiguous or lossy to a YAML parser. Pure — so the guard can prove
 * it flags the real defect and, just as importantly, does NOT flag the fix.
 *
 * Keys are matched anchored at column 0: a nested/indented `key: value` belongs to a mapping this
 * scan deliberately does not model. An indented line following a PLAIN scalar is treated instead as
 * that scalar's wrapped continuation, because a `: ` there is the same fatal error one line lower.
 *
 * @param {string} markdown
 * @returns {Array<{key: string, code: string, why: string}>} at most one finding per key
 */
export function ambiguousPlainScalars(markdown) {
  const src = markdown.replace(/^﻿/, ""); // a BOM would hide the `---` and skip the file entirely
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(src);
  if (!m) return []; // no frontmatter at all — nothing to judge

  const problems = [];
  const seen = new Set();
  const push = (key, trap) => {
    if (seen.has(key)) return; // one finding per key: the first is the one to fix
    seen.add(key);
    problems.push({ key, code: trap.code, why: trap.why });
  };

  let openPlain = null; // key of a plain scalar that may wrap onto following indented lines
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(line);
    if (!kv) {
      if (openPlain && /^\s+\S/.test(line)) {
        const trap = plainScalarTrap(line.trim());
        if (trap) push(openPlain, { code: "CONTINUATION", why: `${trap.why} — on a wrapped continuation line` });
      }
      continue;
    }
    openPlain = null;
    const [, key, rawValue] = kv;
    const value = rawValue.trim();
    if (!value) continue; // empty, or a nested/block value on the following lines
    if (/^["']/.test(value)) {
      const trap = quotedTrap(value);
      if (trap) push(key, trap);
      continue; // quoted: the plain-scalar traps do not apply, and it cannot wrap
    }
    if (BLOCK_SCALAR.test(value)) continue; // `key: >` / `key: |` — a block scalar, the other valid answer
    const trap = plainScalarTrap(value);
    if (trap) push(key, trap);
    else if (INDICATOR.test(value)) push(key, { code: "INDICATOR", why: `unquoted value starts with the YAML indicator '${value[0]}'` });
    openPlain = key; // a plain scalar: its continuation lines still need checking
  }
  return problems;
}
