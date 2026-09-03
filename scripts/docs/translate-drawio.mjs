#!/usr/bin/env node
/**
 * scripts/docs/translate-drawio.mjs — publish the Russian reading copy of a .drawio diagram.
 *
 * DIRECTION, and it was reversed on 2026-09-03 — read this before editing anything.
 * The **English** diagram under docs/adr/ is now the SOURCE: it is hand-edited in the
 * draw.io editor, it is what git tracks, and it is what the team reviews and ratifies.
 * The Russian file under the gitignored docs/ru/ is a **generated reading copy** for
 * Russian-speaking colleagues — a convenience, never an input.
 *
 * It used to run the other way (Russian hand-edited, English published), which put the
 * only editable copy in a gitignored directory with no history. That went exactly as you
 * would expect: the source was overwritten once and survived only because this memory is
 * invertible, and a "revised" diagram was produced by editing the *published* English
 * file and back-translating it, leaving 40 labels half in each language. A source you
 * cannot review in a PR is not a source. Now the tracked file is the one you edit.
 *
 * Geometry, styles, ids and edges are copied verbatim — only label text is touched.
 *
 * It FAILS rather than publish a half-translated page: if any label still carries an
 * English word after substitution, and that word is not in ALLOW_LATIN below, the run
 * exits non-zero and names every string that has no entry. This is the mirror of the
 * leftover-Cyrillic check the old direction used, and it is weaker in exactly one way:
 * Cyrillic in an English file is unambiguous, whereas Latin in a Russian file is often
 * deliberate (KB-*, GitHub Issue, MiniSearch, status: draft). Hence the allowlist —
 * keep it short, and add a phrase to the memory rather than a word to the allowlist
 * whenever the phrase is really prose.
 *
 * The translation memory (docs/ru/labels.map.json, **en → ru**) stays beside the Russian
 * copy in gitignored docs/ru/, because it necessarily contains Russian. Losing it costs
 * the reading copy and nothing else — the source is in git now.
 *
 * Usage — defaults cover the KB v3 overview:
 *   node scripts/docs/translate-drawio.mjs
 *   node scripts/docs/translate-drawio.mjs --in <en.drawio> --map <map.json> --out <ru.drawio>
 *   node scripts/docs/translate-drawio.mjs --check      # verify, write nothing
 *
 * Zero dependencies.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const IN = resolve(ROOT, arg("--in", "docs/adr/adr-knowledge-base-v3-overview.drawio"));
const MAP = resolve(ROOT, arg("--map", "docs/ru/labels.map.json"));
const OUT = resolve(ROOT, arg("--out", "docs/ru/adr-knowledge-base-v3-overview.ru.drawio"));
const CHECK = process.argv.includes("--check");

/* Latin that is MEANT to survive into the Russian copy: proper nouns, identifiers, and
 * the status vocabulary the entries themselves use. Everything else must come from the
 * memory. Deliberately a list of tokens, not a regex over "looks technical". */
const ALLOW_LATIN = [
  "KB", "KB-C", "GitHub", "Issue", "MiniSearch", "AST", "CI", "QA", "Knowledge", "Resolver",
  "Engine", "State", "Machine", "kb", "promote", "ingest-issues", "drafts", "catalog", "md",
  "json", "push", "status", "draft", "entry", "overlay", "pinned", "disputed", "superseded",
  "retired", "confirmed", "unconfirmed", "refutableBy", "Draft", "Unconfirmed", "Confirmed",
  "Disputed", "Pinned", "Superseded", "Retired", "Tombstone", "Evidence", "Drafts", "nbsp",
  "br", "span", "style", "font", "size", "weight", "normal", "px", "b",
  "Virto", "Pin", "Dispute", "Retire", "successor", "KB-",
];

for (const [what, path] of [["source", IN], ["translation memory", MAP]]) {
  if (!existsSync(path)) {
    process.stderr.write(`no ${what}: ${path}\n`);
    process.exit(2);
  }
}

const xml = readFileSync(IN, "utf8");
const map = JSON.parse(readFileSync(MAP, "utf8"));

/* Longest first: a phrase must not be eaten by a shorter key that overlaps it —
 * a block title is often a prefix of the longer caption underneath it. */
const keys = Object.keys(map).sort((a, b) => b.length - a.length);

/* Only the three markup entities are decoded — a label carries `<br>`/`<span>` as
 * escaped markup, and the phrases in the memory are written the same way. `&` is left
 * alone so the `&nbsp;` the bullets use survives the round trip untouched. */
const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
const encode = (s) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ONE left-to-right pass over an alternation of every phrase, longest first — never a
 * key-by-key loop over the whole string. The loop let a short key match text a longer
 * key had just produced: with "asks the reference desk before starting" rewritten
 * first, the bare "reference desk" entry then fired inside the *result* and published
 * "asks the The Knowledge Resolver" — eleven times, silently, because both halves were
 * legal English. A single pass cannot re-enter what it has already written.
 *
 * A phrase is replaced only where it stands as a whole: a key that happens to be a
 * prefix of a longer word must not be swapped inside it (the "редко"/"редкое" bug of
 * the previous direction). The lookarounds are on letters only, so a key that starts
 * or ends with a digit or punctuation still anchors correctly. */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PHRASES = new RegExp(`(?<!\\p{L})(?:${keys.map(escapeRe).join("|")})(?!\\p{L})`, "gu");

const translate = (raw) => encode(decode(raw).replace(PHRASES, (m) => map[m]));

/* `value=` carries every visible label; the page tab is the <diagram> tag. Its `id` is
 * NOT translated: ids are Latin in the source and every edge references them by that
 * string — renaming one here would silently detach an edge in the reading copy. */
const out = xml
  .replace(/value="([^"]*)"/g, (m, v) => `value="${translate(v)}"`)
  .replace(/<diagram([^>]*)>/g, (m, attrs) =>
    `<diagram${attrs.replace(/\bname="([^"]*)"/g, (a, v) => `name="${translate(v)}"`)}>`);

/* Fail-closed on the labels, not on the whole document: styles and ids are Latin by
 * construction, so the scan is over `value=`/`name=` only, with markup and the
 * allowlist removed before anything is judged. */
const allow = new Set(ALLOW_LATIN.map((w) => w.toLowerCase()));
const leftovers = new Set();
for (const [, v] of [...out.matchAll(/value="([^"]*)"/g), ...out.matchAll(/<diagram[^>]*\bname="([^"]*)"/g)]) {
  const text = decode(v).replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ");
  for (const w of text.match(/[A-Za-z][A-Za-z-]{2,}/g) || []) {
    if (!allow.has(w.toLowerCase())) leftovers.add(`${w}   — in: ${text.trim().slice(0, 90)}`);
  }
}
if (leftovers.size) {
  process.stderr.write(`untranslated (${leftovers.size}) — add each phrase to ${MAP}:\n`);
  for (const l of leftovers) process.stderr.write(`  ${l}\n`);
  process.exit(1);
}

if (CHECK) {
  const same = existsSync(OUT) && readFileSync(OUT, "utf8") === out;
  process.stdout.write(same ? "up to date\n" : "OUT OF DATE — re-run without --check\n");
  process.exit(same ? 0 : 1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out, "utf8");
process.stdout.write(`translated ${keys.length} phrases\n  ${IN}\n  → ${OUT}\n`);
