// THE PAGES ARE NOT A PLANE, AND THIS IS NOT A SEARCH — it is the other half of `kb show`.
//
// `knowledge/` is the fourth store in this base and deliberately not a plane: the oracles, the
// domain maps and the API references are PAGES a person wrote, not entries with evidence rows, and
// nothing here gives them a confirmation count or a trust level they have not earned.
//
// But they carry ids, and the rest of the world cites them. `ECL-13.3` appears 3,095 times in this
// project's regression suites and `VC-CART-001` in a handful of prompts, and those citations are a
// CONTRACT — `ecl:lint` proves each one names a real section, and no section is ever renumbered
// because of it. Until now the tool could not open one: `kb show BL-CART-003` resolved (a rule is
// an entry) while `kb show ECL-13.3` answered "not in this base", which is false — the base holds
// it, one directory over, and the door simply did not look there. An agent on a client machine has
// the base and the tool and nothing else; for it, a cited id that the tool cannot open is a dead
// reference.
//
// A PAGE SAYS WHAT ITS SECTIONS ARE CITED AS, in its own front matter — `citedAs: ECL`. That was
// not the first design and the measurement is why it is this one. Matching on the heading alone,
// prefix ignored, indexed 354 sections and left FIVE ids answered by two pages: `virto-doc-style.md`
// numbers its own sections 9.1, 10.1, 10.2, 10.3 and so does the ECL library — and `ECL-10.2` is
// the second most cited id in the corpus, at 252 citations. A blind resolver refuses exactly the
// ids most worth opening. The prefix carries the answer and discarding it was the bug.
//
// It lives in the PAGE rather than in `kb.json` for the reason a banner does: the fact belongs to
// the page, travels with it when it is renamed, and is visible to whoever is editing it. A central
// registry of which page owns which prefix is a second place to keep in step, and the one that
// rots. A base whose pages declare nothing still resolves an id written into its headings whole —
// `VC-CART-001` — because the scan is the fallback, not the mechanism.
//
// WHY IT IS NOT IN `kb ask`. Measured on the derived plane and written up in the address-book
// change of 2026-09-16: a wide table of rows is a plausible answer to almost any question asked in
// ordinary words, so putting one in a ranked list displaces the entries that actually answer. An
// ECL section IS a wide table of rows. What it is uniquely good for is being opened by the id
// somebody already has, and that is what this does.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** The base's page store. Not a plane — see the header. */
export const PAGES_DIR = 'knowledge';

/** ``` or ~~~ opening or closing a fenced block. */
const FENCE = /^\s*(?:```|~~~)/;
const HEADING = /^(#{1,6})\s+(\S+)\s*(.*)$/;

/**
 * A heading's first token is an ID only in these two shapes, and the narrowness is the point.
 *
 * Measured over the live base before it was narrowed: indexing every first token gave 986 headings
 * and 94 ids answered by more than one page — `Platform`, `Using`, `Cart`, `GraphQL`, each of them
 * simply the first WORD of a title, and the bare chapter numbers `1`–`7`, which 11 pages carry.
 * None of those is cited anywhere and every one of them is a way to answer the wrong question.
 *
 *   `13.3`, `14.10`   a dotted section number — the ECL shape. A dot is REQUIRED: a bare `1` is a
 *                     chapter number in eleven pages, and no suite has ever cited one.
 *   `VC-CART-001`     an id written into the heading whole, letters + digits + at least one hyphen.
 */
const NUMERIC_ID = /^\d+(?:\.\d+)+$/;
const TOKEN_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9.]+)+$/;
const looksLikeId = (token) => NUMERIC_ID.test(token) || TOKEN_ID.test(token);

/**
 * Canonical form of an id's numeric segments: `05.1` and `5.1` are the SAME section written two
 * ways, and the suites contain both — 5 of the 56 distinct ECL citations are zero-padded.
 *
 * Lifted deliberately from `lint-ecl.ts`'s `canon`, whose comment explains what comparing the raw
 * strings did: it reported every padded citation as dangling, which buries real dangling refs under
 * noise. A resolver that refused `ECL-05.1` while the gate passed it would be the same bug in the
 * other direction — the gate says the citation is good and the door says it leads nowhere.
 */
export function canonId(token) {
  return String(token ?? '')
    .split('.')
    .map((seg) => (/^\d+$/.test(seg) ? String(Number(seg)) : seg))
    .join('.');
}

/**
 * The forms a cited id can take at the page: the id itself, and its tail after a leading prefix.
 *
 * `VC-CART-001` is written into its heading whole; `ECL-13.3` is not — the page numbers its
 * sections `### 13.3 …` and the `ECL-` prefix lives in the citation, not in the document. Both are
 * tried, canonicalised, so neither page has to be told about.
 */
export function idForms(cited) {
  const id = String(cited ?? '').trim();
  const forms = [canonId(id)];
  // The tail is tried ONLY when it is a section number. `VC-CART-001` minus its prefix is
  // `CART-001`, which is id-shaped and could match a heading in some other page that has nothing
  // to do with the bug catalog; `ECL-13.3` minus its prefix is `13.3`, which is the only way the
  // ECL library writes it. One of those is a lookup and the other is a coincidence waiting.
  const tail = canonId(id.replace(/^[A-Za-z][A-Za-z0-9]*-/, ''));
  if (NUMERIC_ID.test(tail)) forms.push(tail);
  return [...new Set(forms)].filter(Boolean);
}

/**
 * The prefix a page declares its sections are cited by — `citedAs: ECL` — or null.
 *
 * Read leniently and by hand rather than through `parseEntry`: that one is the ENTRY parser, it
 * throws on a file with no front matter, and most pages have none. A page that does not declare is
 * the normal case, not an error.
 */
export function citedAs(text) {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const m = /^citedAs:\s*["']?([A-Za-z][A-Za-z0-9]*)["']?\s*$/m.exec(text.slice(0, end));
  return m ? m[1].toUpperCase() : null;
}

function pageFiles(dir, root = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...pageFiles(full, root));
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}

/**
 * Every addressable heading in the base's pages.
 *
 * FENCED LINES ARE NOT HEADINGS. The ECL library's Appendix A carries a fenced TEMPLATE whose body
 * contains `###` lines and table rows that are illustration, not definition; `lint-ecl` skips fences
 * for exactly this reason, having once counted a placeholder row as a real pattern. A resolver that
 * did not would hand somebody a template when they asked for a section.
 *
 * @returns {{id:string, title:string, level:number, page:string, line:number}[]}
 */
export function pageSections(base) {
  const root = join(base, PAGES_DIR);
  const out = [];
  for (const file of pageFiles(root)) {
    const page = `${PAGES_DIR}/${relative(root, file).split(sep).join('/')}`;
    const text = readFileSync(file, 'utf8');
    const prefix = citedAs(text);
    let fenced = false;
    text.split(/\r?\n/).forEach((line, i) => {
      if (FENCE.test(line)) { fenced = !fenced; return; }
      if (fenced) return;
      const m = HEADING.exec(line);
      if (!m) return;
      const token = m[2].replace(/[.:]$/, '');
      if (!looksLikeId(token)) return;
      out.push({
        id: canonId(token),
        // `### VC-CART-001 — Apollo cache stale` separates its id from its title with a dash, and
        // `### BL-PRICE-001: …` with the colon already stripped off the token. Neither belongs in
        // a title printed on its own line.
        title: m[3].replace(/^[—–:-]\s*/, '').trim(),
        level: m[1].length,
        page,
        prefix,
        line: i + 1,
      });
    });
  }
  return out;
}

/**
 * Open one section by the id somebody cited.
 *
 * @returns {{id:string, title:string, page:string, line:number, text:string}
 *          | {ambiguous:{page:string, line:number}[]}
 *          | null}
 */
export function findSection(base, cited) {
  const wanted = new Set(idForms(cited));
  const all = pageSections(base);
  // THE PREFIX DECIDES WHICH PAGE, when a page has claimed it. Without this, `ECL-10.2` — 252
  // citations — is ambiguous between the ECL library and a BA style guide that numbers its own
  // sections the same way. Where nothing claims the prefix the whole store is searched, which is
  // what resolves an id a heading carries in full.
  const prefix = (String(cited ?? '').match(/^([A-Za-z][A-Za-z0-9]*)-/) ?? [])[1]?.toUpperCase() ?? null;
  const claimed = prefix ? all.filter((s) => s.prefix === prefix) : [];
  const hits = (claimed.length ? claimed : all).filter((s) => wanted.has(s.id));
  if (!hits.length) return null;
  // TWO PAGES ANSWERING TO ONE ID IS A REFUSAL, not a pick. Section numbering is per page, so
  // `3.1` is a legitimate heading in any of them; the cited prefix is what says which page was
  // meant, and this tool deliberately does not know that mapping. Printing one of two and calling
  // it the answer is the failure a keyed lookup exists to prevent.
  if (hits.length > 1) return { ambiguous: hits.map(({ page, line, title }) => ({ page, line, title })) };
  const hit = hits[0];
  return { ...hit, text: sliceSection(join(base, ...hit.page.split('/')), hit.line, hit.level) };
}

/**
 * A section runs from its heading to the next heading of the SAME OR HIGHER level — its
 * subsections travel with it, its siblings do not.
 */
export function sliceSection(file, line, level) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  let fenced = false;
  let end = lines.length;
  for (let n = line; n < lines.length; n += 1) {
    if (FENCE.test(lines[n])) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = HEADING.exec(lines[n]);
    if (m && m[1].length <= level) { end = n; break; }
  }
  return lines.slice(line - 1, end).join('\n').replace(/\s+$/, '');
}
