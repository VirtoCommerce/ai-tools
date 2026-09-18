#!/usr/bin/env node
// ONE-OFF: `captured/` (the old tree) -> `v2/` (PLAN §10). Run once, reviewed, then kept for the
// record -- not part of any pipeline.
//
// WHAT IT DOES AND DOES NOT DO. It reads a CHECKOUT of vc-knowledge, takes the entries whose
// `status` is `active`, rewrites their frontmatter and emits `v2/kb.json`, `v2/index.json` and
// `v2/entries/KB-*.md` into an output directory. It pushes nothing and deletes nothing: the old
// tree is untouched, so the 12 retired entries that do not come along are not lost, they simply
// stay where they are.
//
// AUTHORING IS NOT READING. Decision 1 -- "no local copy of the base" -- governs how an agent READS
// knowledge while working, and this is not that. Writing 89 files in one commit from a temporary
// clone is authoring, and a clone is the simplest correct way to do it. The runtime write path
// (blobs -> tree -> commit -> ref compare-and-swap) is a different thing for a different job.
//
// THE TRANSFORM IS MECHANICAL, AND THAT IS THE POINT. Frontmatter in, frontmatter out; the prose
// body is copied byte for byte and never touched. The bodies are the value of this corpus and
// hand-editing 89 of them is precisely the work that introduces errors -- so the script does not
// offer itself the opportunity.
//
// THE ID GATE. For every entry, `mintId(subject)` must equal the id it already carries. The id is
// derived from the subject, so a mismatch means that subject was edited after the id was minted --
// and re-minting would silently change the address every existing citation points at. There is no
// repair for that here: it STOPS and reports, because the right fix is a human decision about
// which of the two the base should keep.

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { mintId } from './core/canonical.mjs';
import { parseEntry, stringifyFrontmatter } from './core/frontmatter.mjs';
import { buildIndex, buildManifest, buildRow, countEvidence, entryPath } from './core/index-build.mjs';

/**
 * The fields that survive, in the order the writer emits them (PLAN §10).
 *
 * `refutableBy` is dropped: measured across all 101 it is `observation` 99, `anchor` 1,
 * `artifact` 1 -- 98% one value, which is a constant impersonating a field.
 *
 * `arrivesAt` is KEPT, and the plan does not mention it either way. It is on 9 of the 89, it is a
 * declared field of the schema the writer already knows, nothing computes it and nothing could
 * regenerate it, so dropping it would destroy hand-written data to satisfy a list that was drawn up
 * before the field existed. Keeping it costs nine lines and no behaviour: no index row reads it.
 *
 * `supersededBy` is absent from the migrated set by arithmetic rather than by choice -- all 10
 * entries carrying it are retired, and retired entries do not come along.
 */
const KEEP = ['id', 'subject', 'plane', 'question', 'status', 'supersededBy', 'appliesTo', 'anchors', 'arrivesAt', 'evidence'];

const DROP = ['refutableBy'];

/** Read every `captured/*.md` out of a checkout, parsed, with the raw text kept for comparison. */
async function readCaptured(sourceDir) {
  const dir = join(sourceDir, 'captured');
  const names = (await readdir(dir)).filter((n) => n.endsWith('.md')).sort();
  const out = [];
  for (const name of names) {
    const text = await readFile(join(dir, name), 'utf8');
    const { data, body } = parseEntry(text, name);
    out.push({ name, text, data, body });
  }
  return out;
}

/** Frontmatter in, frontmatter out. The body is not passed through here at all -- by construction. */
export function transform(data) {
  const out = {};
  for (const key of KEEP) if (key in data && data[key] !== undefined) out[key] = data[key];
  return out;
}

/**
 * Everything that must be true before this is allowed near a shared repository.
 *
 * Checked on the OUTPUT rather than trusted from the input: an assertion that reads the same
 * variable the writer wrote is a statement about the program's intentions, not about its result.
 */
function audit({ active, emitted, index, entriesOnDisk }) {
  const problems = [];
  const say = (c, why) => { if (!c) problems.push(why); };

  say(emitted.length === active.length, `${active.length} entries in, ${emitted.length} out`);
  say(index.count === active.length, `index count ${index.count} != ${active.length}`);
  say(index.entries.length === index.count, `index declares ${index.count} rows but holds ${index.entries.length}`);

  const onDisk = new Set(entriesOnDisk);
  for (const row of index.entries) {
    say(onDisk.has(row.path), `index row ${row.id} names ${row.path}, which was not written`);
    const src = emitted.find((e) => e.id === row.id);
    if (!src) { problems.push(`index row ${row.id} has no emitted entry`); continue; }
    const { trust, disputed } = countEvidence(src.data.evidence);
    say(row.trust === trust, `${row.id}: index trust ${row.trust} != ${trust} from evidence[]`);
    say(row.disputed === disputed, `${row.id}: index disputed ${row.disputed} != ${disputed}`);
    say(row.status === 'active', `${row.id} is ${row.status}, not active`);
    say(row.anchors.length > 0, `${row.id} has no anchors — it would be unfindable and unidentifiable`);
    say(row.scope.length > 0, `${row.id} has no scope — a storefront fact would be applied to admin`);
  }
  say(new Set(index.entries.map((r) => r.id)).size === index.entries.length, 'the index holds a duplicate id');
  say(onDisk.size === index.entries.length, `${onDisk.size} entry files written for ${index.entries.length} rows`);
  return problems;
}

export async function migrate({ sourceDir, outDir, generated = new Date().toISOString() }) {
  const captured = await readCaptured(sourceDir);
  const active = captured.filter((e) => e.data.status === 'active');

  // ── THE ID GATE ─────────────────────────────────────────────────────────────────────────────
  const drifted = active
    .map((e) => ({ id: String(e.data.id), minted: mintId(String(e.data.subject)), name: e.name }))
    .filter((x) => x.id !== x.minted);
  if (drifted.length) {
    return {
      ok: false,
      stopped: 'id-gate',
      why: `${drifted.length} entr(ies) whose id is not mintId(subject). A changed id silently breaks `
        + 'every citation pointing at it, so this is not re-minted here — a human decides which of '
        + 'the two the base keeps.',
      drifted,
    };
  }

  // ── the transform ───────────────────────────────────────────────────────────────────────────
  const emitted = [];
  for (const e of active) {
    const data = transform(e.data);
    const text = `${stringifyFrontmatter(data)}\n${e.body}`;

    // The round trip is checked per entry, not sampled: re-reading what we just wrote must give
    // back the same frontmatter and the SAME BODY BYTES. A writer that silently re-quotes a value
    // or eats a trailing newline is exactly the kind of defect that survives a spot check of three
    // files and is discovered months later in the one entry nobody opened.
    const back = parseEntry(text, e.name);
    if (back.body !== e.body) throw new Error(`${e.name}: body changed in the round trip`);
    for (const key of Object.keys(data)) {
      if (JSON.stringify(back.data[key]) !== JSON.stringify(data[key])) {
        throw new Error(`${e.name}: ${key} did not round-trip`);
      }
    }
    for (const gone of DROP) {
      if (gone in back.data) throw new Error(`${e.name}: ${gone} survived the transform`);
    }

    emitted.push({ id: String(data.id), path: entryPath(String(data.id)), data, text });
  }

  const index = buildIndex(emitted.map((e) => buildRow(e.data, e.path)), { generated });
  const manifest = buildManifest();

  // ── write ───────────────────────────────────────────────────────────────────────────────────
  const root = resolve(outDir);
  await rm(root, { recursive: true, force: true });
  await mkdir(join(root, 'entries'), { recursive: true });
  for (const e of emitted) await writeFile(join(root, e.path), e.text, 'utf8');
  await writeFile(join(root, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  await writeFile(join(root, 'kb.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const entriesOnDisk = (await readdir(join(root, 'entries'))).sort().map((n) => `entries/${n}`);
  const problems = audit({ active, emitted, index, entriesOnDisk });

  return {
    ok: problems.length === 0,
    problems,
    root,
    read: captured.length,
    retired: captured.length - active.length,
    migrated: emitted.length,
    bytes: emitted.reduce((n, e) => n + Buffer.byteLength(e.text), 0),
    keptArrivesAt: emitted.filter((e) => 'arrivesAt' in e.data).length,
    droppedField: DROP.join(', '),
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`
  || process.argv[1]?.endsWith('migrate-captured.mjs')) {
  const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? fallback : process.argv[i + 1];
  };
  const sourceDir = arg('source');
  const outDir = arg('out');
  if (!sourceDir || !outDir) {
    process.stderr.write('usage: node scripts/kb/migrate-captured.mjs --source <vc-knowledge checkout> --out <dir for v2>\n');
    process.exitCode = 2;
  } else {
    const r = await migrate({ sourceDir, outDir, generated: arg('generated', undefined) });
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    process.exitCode = r.ok ? 0 : 1;
  }
}
