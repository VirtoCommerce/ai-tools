#!/usr/bin/env node
/**
 * scripts/docs/translate-drawio.mjs — publish the English copy of a .drawio diagram.
 *
 * The diagram itself is edited by hand in the draw.io editor: it IS the source, nothing
 * derives it, and a generator in between only cost hand edits (twice) and turned every
 * one-word change into a patch script. This tool does the one thing the editor cannot:
 * it swaps the labels of a finished Russian diagram for their English counterparts, so
 * the repository stays English-only while the work happens in the working language.
 *
 * Geometry, styles, ids and edges are copied verbatim — only label text is touched.
 *
 * It FAILS rather than publish a half-translated page: if any Cyrillic survives the
 * substitution, the run exits non-zero and names every string that has no entry. A
 * partially-translated diagram looks finished and is the failure nobody notices.
 *
 * The translation memory (docs/ru/labels.map.json, ru → en) lives beside the Russian
 * source in the gitignored docs/ru/, because it necessarily contains Russian; the
 * English wording it produces is committed inside the published .drawio.
 *
 * Usage — defaults cover the KB v3 overview:
 *   node scripts/docs/translate-drawio.mjs
 *   node scripts/docs/translate-drawio.mjs --in <ru.drawio> --map <map.json> --out <en.drawio>
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

const IN = resolve(ROOT, arg("--in", "docs/ru/adr-knowledge-base-v3-overview.ru.drawio"));
const MAP = resolve(ROOT, arg("--map", "docs/ru/labels.map.json"));
const OUT = resolve(ROOT, arg("--out", "docs/adr/adr-knowledge-base-v3-overview.drawio"));
const CHECK = process.argv.includes("--check");

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

/* A phrase is replaced only where it stands as a whole: a key that happens to be a
 * prefix of a longer word must not be swapped inside it. Without this, "редко" turned
 * "редкое" into "rarelyе" — caught by the Cyrillic check downstream, but only after the
 * fact, and a Latin-only collision would have passed silently. */
const LETTER = /\p{L}/u;
const whole = (s, k, at) =>
  !LETTER.test(s[at - 1] || "") && !LETTER.test(s[at + k.length] || "");

const translate = (raw) => {
  let s = decode(raw);
  for (const k of keys) {
    let at = s.indexOf(k);
    while (at !== -1) {
      if (whole(s, k, at)) {
        s = s.slice(0, at) + map[k] + s.slice(at + k.length);
        at = s.indexOf(k, at + map[k].length);
      } else {
        at = s.indexOf(k, at + 1);
      }
    }
  }
  return encode(s);
};

/* `value=` carries every visible label; the page tab is the <diagram> tag, whose `id`
 * is often the same string and would otherwise smuggle Russian into the published file. */
let out = xml
  .replace(/value="([^"]*)"/g, (m, v) => `value="${translate(v)}"`)
  .replace(/<diagram([^>]*)>/g, (m, attrs) =>
    `<diagram${attrs.replace(/(id|name)="([^"]*)"/g, (a, k, v) => `${k}="${translate(v)}"`)}>`);

/* The editor derives cell ids from the page name, so a Russian page leaves Russian ids
 * behind — invisible on the canvas, but real text in a published file. They are names,
 * not labels: transliterate them and re-point every reference in one pass. */
const TRANSLIT = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
const translit = (s) => [...s].map((c) => {
  const low = c.toLowerCase();
  if (!TRANSLIT[low]) return c;
  const t = TRANSLIT[low];
  return c === low ? t : t.charAt(0).toUpperCase() + t.slice(1);
}).join("");

for (const id of [...new Set((out.match(/id="([^"]*[А-Яа-яЁё][^"]*)"/g) || []))]) {
  const raw = id.slice(4, -1);
  for (const attr of ["id", "source", "target", "parent"]) {
    out = out.split(`${attr}="${raw}"`).join(`${attr}="${translit(raw)}"`);
  }
}

/* Fail-closed on the WHOLE document, not just the attributes we set out to translate:
 * a label the memory does not know must stop the publish, wherever it hides. */
const leftovers = [...new Set((out.match(/[^"<>]*[А-Яа-яЁё][^"<>]*/g) || []))];
if (leftovers.length) {
  process.stderr.write(`untranslated (${leftovers.length}) — add each to ${MAP}:\n`);
  for (const l of leftovers) process.stderr.write(`  ${decode(l).trim()}\n`);
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
