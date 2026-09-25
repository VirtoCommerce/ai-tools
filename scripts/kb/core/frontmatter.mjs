// A hand-rolled frontmatter reader/writer for the declared subset, zero-dep.
//
// The subset is: scalars, and lists of FLAT objects one level deep whose values are scalars.
// That is exactly what anchors[] and evidence[] need and no more -- the whole lifecycle rests
// on those two fields, and a parser that cannot represent them is not a parser for this schema.
//
// Two disciplines, both load-bearing:
//   * errors, never partial parses. A frontmatter this reader half-understands would produce an
//     entry that half-exists, and nothing downstream would be able to tell.
//   * byte-stable output. The corpus is gated by a byte comparison, so the field order is fixed
//     and the escaping rule is total: a value is written one way and only one way.

export const FIELD_ORDER = [
  'id',
  'subject',
  'plane',
  'question',
  'status',
  // Where a retired entry's fact went. A FIELD and not prose, because the refusal a writer meets
  // has to be able to follow it: a message that names a retired entry and cannot say what replaced
  // it sends the writer to a file nothing serves.
  'supersededBy',
  'refutableBy',
  'appliesTo',
  'anchors',
  // WHERE THE FACT IS NEEDED, which is not where it is ABOUT. `anchors` answers "what is this a
  // claim concerning" -- it carries the entry's identity, it is what the cross-plane check compares
  // against the contract, and it is what `reanchor` corrects. That made it serve two masters: the
  // password-hash finding belongs to `GET /api/members/{id}` by subject, and is needed by somebody
  // standing on `/sign-in`.
  //
  // Measured 2026-09-16 before this field existed: agents landed on `/sign-in` 19 times across the
  // archived logs and nothing ever arrived, while four entries that answer sign-in questions sat in
  // the corpus anchored elsewhere.
  //
  // WHAT NINE DELIVERY ADDRESSES ACTUALLY BOUGHT: NOTHING MEASURABLE, so far. Raw arrivals over
  // the 22 archived logs went 295 -> 316, and that is the number this comment used to quote. The
  // replay's own honesty rule counts only entries that existed BEFORE the run being replayed, and
  // by that rule the figure is 244 -> 244: every one of the 21 new arrivals is on an entry written
  // the same afternoon. The second independent review found this. The idea may still be right --
  // a fact is needed where you meet the symptom, not where it is about -- but nothing has yet been
  // shown to arrive by delivery address that would not have arrived anyway.
  //
  // It is deliberately NOT part of the fingerprint. Identity is (anchors, scope); a delivery address
  // must never be able to collide two facts, or the cheapest possible improvement -- saying where a
  // fact is wanted -- would start refusing entries.
  'arrivesAt',
  'evidence',
];

const SAFE_BARE = /^[^\s"'#\-\[\]{}][^\n]*$/;

function writeScalar(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (s === '') return '""';
  // A bare value must not be ambiguous with the syntax around it, and must round-trip exactly.
  if (SAFE_BARE.test(s) && !s.includes(': ') && s.trim() === s) return s;
  return JSON.stringify(s);
}

function readScalar(raw, where) {
  const s = raw.trim();
  if (s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s.startsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      throw new Error(`frontmatter: unterminated quoted value at ${where}`);
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

export function stringifyFrontmatter(obj) {
  const unknown = Object.keys(obj).filter((k) => !FIELD_ORDER.includes(k));
  if (unknown.length) {
    // The schema is closed: an unknown field is an error, not a field we quietly carry.
    throw new Error(`frontmatter: unknown field(s) ${unknown.join(', ')}`);
  }
  const lines = ['---'];
  for (const key of FIELD_ORDER) {
    if (!(key in obj) || obj[key] === undefined) continue;
    const v = obj[key];
    if (Array.isArray(v)) {
      lines.push(`${key}:`);
      for (const item of v) {
        if (item === null || typeof item !== 'object' || Array.isArray(item)) {
          throw new Error(`frontmatter: ${key}[] must hold flat objects`);
        }
        const entries = Object.entries(item).filter(([, x]) => x !== undefined);
        if (!entries.length) throw new Error(`frontmatter: ${key}[] holds an empty object`);
        entries.forEach(([k, x], i) => {
          if (x !== null && typeof x === 'object') {
            throw new Error(`frontmatter: ${key}[].${k} is nested; the subset is one level deep`);
          }
          lines.push(`${i === 0 ? '  - ' : '    '}${k}: ${writeScalar(x)}`);
        });
      }
    } else {
      lines.push(`${key}: ${writeScalar(v)}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

export function parseEntry(text, where = '<entry>') {
  // CRLF IS NORMALISED AWAY BEFORE ANYTHING ELSE LOOKS AT THE TEXT, because whether this reader
  // sees one is decided by the READER'S git config, not by the corpus. A clone made with
  // `core.autocrlf=true` -- the Windows default -- hands every entry back with CRLF, and every
  // check below is written against `\n`: the opener test fails first, so the file does not
  // half-parse, it fails entirely. Measured 2026-09-18 on a fresh clone: 90 entries, 90
  // problems, 0 read, and `kb reindex --base <clone>` proposing to empty the index.
  //
  // A `.gitattributes` carrying `* -text` also prevents this and the base no longer ships one,
  // but that is the weaker guard either way: it protects only clones of THAT repository, while
  // this protects the reader wherever the bytes came from. Output is unaffected --
  // `stringifyFrontmatter` still emits `\n` and the byte shape is unchanged.
  text = String(text).replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) throw new Error(`${where}: no frontmatter opener`);
  const end = text.indexOf('\n---\n', 3);
  if (end === -1) throw new Error(`${where}: no frontmatter terminator`);
  const head = text.slice(4, end);
  const body = text.slice(end + 5);

  const data = {};
  let listKey = null;
  let current = null;
  const lineNo = (i) => `${where}:${i + 2}`;
  const lines = head.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') throw new Error(`${lineNo(i)}: blank line in frontmatter`);

    const item = /^  - ([A-Za-z_][A-Za-z0-9_]*): (.*)$/.exec(line);
    if (item) {
      if (!listKey) throw new Error(`${lineNo(i)}: list item outside a list`);
      current = { [item[1]]: readScalar(item[2], lineNo(i)) };
      data[listKey].push(current);
      continue;
    }
    const cont = /^    ([A-Za-z_][A-Za-z0-9_]*): (.*)$/.exec(line);
    if (cont) {
      if (!current) throw new Error(`${lineNo(i)}: continuation without a list item`);
      current[cont[1]] = readScalar(cont[2], lineNo(i));
      continue;
    }
    const open = /^([A-Za-z_][A-Za-z0-9_]*):$/.exec(line);
    if (open) {
      listKey = open[1];
      current = null;
      data[listKey] = [];
      continue;
    }
    const scalar = /^([A-Za-z_][A-Za-z0-9_]*): (.*)$/.exec(line);
    if (scalar) {
      listKey = null;
      current = null;
      data[scalar[1]] = readScalar(scalar[2], lineNo(i));
      continue;
    }
    throw new Error(`${lineNo(i)}: unparseable frontmatter line: ${JSON.stringify(line)}`);
  }

  const unknown = Object.keys(data).filter((k) => !FIELD_ORDER.includes(k));
  if (unknown.length) throw new Error(`${where}: unknown field(s) ${unknown.join(', ')}`);

  return { data, body };
}
