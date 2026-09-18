// The migration `captured/` -> `v2/` (scripts/kb/migrate-captured.mjs, PLAN §10).
//
// NOT ONE NETWORK CALL IN THIS FILE. The source is a small hand-built `captured/` directory in a
// temp dir, not a clone — what is under test is the TRANSFORM, and a clone would only make the
// test slow and dependent on a repository that keeps changing.
//
// WHY A ONE-OFF SCRIPT IS TESTED AT ALL. It runs once, against a corpus whose 89 prose bodies are
// irreproducible: each carries evidence with a deployment, a platform version and a timestamp that
// nothing regenerates and that would have to be re-earned by hand on a live deployment. A silent
// defect here — a body that loses its trailing newline, a field that does not survive a round trip,
// an id quietly re-minted — is discovered after the old tree has stopped being the place anyone
// looks. So the properties below are the ones that cannot be checked by reading the output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mintId } from '../kb/core/canonical.mjs';
import { parseEntry } from '../kb/core/frontmatter.mjs';
import { migrate, transform } from '../kb/migrate-captured.mjs';

/** One `captured/` entry, with an id that genuinely derives from its subject. */
function entryText({ subject, status = 'active', extra = '', body = '\nThe claim, in prose.\n' }) {
  return `---\nid: ${mintId(subject)}\nsubject: ${subject}\nplane: experiential\n`
    + `question: why ${subject}?\nstatus: ${status}\nrefutableBy: observation\n`
    + 'appliesTo:\n  - axis: surface\n    value: storefront-ui\n'
    + 'anchors:\n  - coordinate: GET /company/members\n'
    + extra
    + 'evidence:\n  - method: observation\n    deployment: vcptcore_stable\n    at: 2026-09-11T00:00:00Z\n'
    + `---\n${body}`;
}

/** A throwaway `captured/` tree plus an output directory. */
async function withSource(entries, fn) {
  const root = mkdtempSync(join(tmpdir(), 'kb-migrate-'));
  mkdirSync(join(root, 'captured'), { recursive: true });
  for (const [name, text] of Object.entries(entries)) writeFileSync(join(root, 'captured', name), text);
  try {
    return await fn({ sourceDir: root, outDir: join(root, 'v2') });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const active = (subject, over = {}) => [`${mintId(subject)}.md`, entryText({ subject, ...over })];

// ─── what migrates ────────────────────────────────────────────────────────────────────────────

test('only the active entries migrate; the retired ones stay in the old tree', async () => {
  // PLAN §10: the old tree is not deleted, so a retired entry left behind is not lost — and the
  // new base starts without records we would never want returned.
  await withSource(Object.fromEntries([
    active('a first fact'),
    active('a second fact'),
    active('a retired fact', { status: 'retired' }),
  ]), async (dirs) => {
    const r = await migrate({ ...dirs, generated: 'T' });
    assert.equal(r.ok, true, r.problems?.join('; '));
    assert.equal(r.read, 3);
    assert.equal(r.retired, 1);
    assert.equal(r.migrated, 2);
    assert.equal(readdirSync(join(dirs.outDir, 'entries')).length, 2);
    assert.equal(JSON.parse(readFileSync(join(dirs.outDir, 'index.json'), 'utf8')).count, 2);
  });
});

test('refutableBy is dropped — 98% one value is a constant impersonating a field', async () => {
  await withSource(Object.fromEntries([active('a fact')]), async (dirs) => {
    await migrate({ ...dirs, generated: 'T' });
    const [file] = readdirSync(join(dirs.outDir, 'entries'));
    const text = readFileSync(join(dirs.outDir, 'entries', file), 'utf8');
    assert.ok(!text.includes('refutableBy'), 'refutableBy must not survive');
    assert.ok(!('refutableBy' in parseEntry(text, file).data));
  });
});

test('arrivesAt survives — it is hand-written, nothing regenerates it, and no list ruled it out', async () => {
  // The plan's field table does not mention `arrivesAt` in either direction; it was drawn up before
  // the field existed. Dropping a field on the strength of a list that never considered it would
  // destroy data to satisfy an omission.
  await withSource(Object.fromEntries([
    active('a fact with a delivery address', { extra: 'arrivesAt:\n  - coordinate: /sign-in\n' }),
  ]), async (dirs) => {
    const r = await migrate({ ...dirs, generated: 'T' });
    assert.equal(r.keptArrivesAt, 1);
    const [file] = readdirSync(join(dirs.outDir, 'entries'));
    assert.deepEqual(parseEntry(readFileSync(join(dirs.outDir, 'entries', file), 'utf8'), file).data.arrivesAt,
      [{ coordinate: '/sign-in' }]);
  });
});

test('transform keeps the fields the plan names and nothing else', () => {
  const out = transform({
    id: 'KB-1', subject: 's', plane: 'experiential', question: 'q', status: 'active',
    refutableBy: 'observation', appliesTo: [], anchors: [], evidence: [],
  });
  assert.deepEqual(Object.keys(out), ['id', 'subject', 'plane', 'question', 'status', 'appliesTo', 'anchors', 'evidence']);
});

// ─── the body is the value ────────────────────────────────────────────────────────────────────

test('the prose body is copied byte for byte, including the exact whitespace around it', async () => {
  // The bodies ARE the corpus. Hand-editing 89 of them is the work that introduces errors, so the
  // script must not offer itself the opportunity — and a body that gains or loses one newline is
  // the kind of change no reviewer would spot across 89 files.
  const bodies = [
    '\nOne paragraph.\n',
    '\nTwo\n\nparagraphs, and a trailing blank line.\n\n',
    '\nA body with --- a horizontal rule lookalike --- inside it.\n',
    '\n  indented\n\ttabbed\n',
    '\nNo trailing newline at all.',
  ];
  const entries = Object.fromEntries(bodies.map((body, i) => active(`fact number ${i}`, { body })));
  await withSource(entries, async (dirs) => {
    const r = await migrate({ ...dirs, generated: 'T' });
    assert.equal(r.ok, true, r.problems?.join('; '));
    for (const [name, text] of Object.entries(entries)) {
      const src = parseEntry(text, name);
      const out = parseEntry(readFileSync(join(dirs.outDir, 'entries', name), 'utf8'), name);
      assert.equal(out.body, src.body, `${name}: body changed`);
    }
  });
});

// ─── the id gate ──────────────────────────────────────────────────────────────────────────────

test('an id that is not mintId(subject) STOPS the whole migration', async () => {
  // A changed id silently breaks every citation pointing at it, and re-minting would make that
  // breakage the migration's own doing. Which of the two the base should keep is a human decision,
  // so the script refuses to have an opinion — and it stops rather than skipping the one entry,
  // because a partial migration is the state nobody can reason about afterwards.
  const good = active('a sound fact');
  const bad = ['KB-DEADBEEF.md', entryText({ subject: 'a subject edited after its id was minted' })
    .replace(/^id: KB-[0-9A-F]{8}$/m, 'id: KB-DEADBEEF')];
  await withSource(Object.fromEntries([good, bad]), async (dirs) => {
    const r = await migrate({ ...dirs, generated: 'T' });
    assert.equal(r.ok, false);
    assert.equal(r.stopped, 'id-gate');
    assert.equal(r.drifted.length, 1);
    assert.equal(r.drifted[0].id, 'KB-DEADBEEF');
    assert.ok(!existsDir(dirs.outDir), 'nothing may be written when the gate fails');
  });
});

test('a retired entry with a drifted id does not stop anything — it is not migrating', async () => {
  const bad = ['KB-DEADBEEF.md', entryText({ subject: 'a retired subject', status: 'retired' })
    .replace(/^id: KB-[0-9A-F]{8}$/m, 'id: KB-DEADBEEF')];
  await withSource(Object.fromEntries([active('a sound fact'), bad]), async (dirs) => {
    const r = await migrate({ ...dirs, generated: 'T' });
    assert.equal(r.ok, true, r.problems?.join('; '));
    assert.equal(r.migrated, 1);
  });
});

function existsDir(p) {
  try { readdirSync(p); return true; } catch { return false; }
}

// ─── the audit, run on the output rather than on the intention ────────────────────────────────

test('the index agrees with the entries it points at', async () => {
  await withSource(Object.fromEntries([active('a fact'), active('another fact')]), async (dirs) => {
    const r = await migrate({ ...dirs, generated: 'T' });
    assert.deepEqual(r.problems, []);
    const index = JSON.parse(readFileSync(join(dirs.outDir, 'index.json'), 'utf8'));
    for (const row of index.entries) {
      const text = readFileSync(join(dirs.outDir, row.path), 'utf8');
      const { data } = parseEntry(text, row.path);
      assert.equal(row.id, data.id);
      assert.equal(row.subject, data.subject);
      assert.equal(row.trust, data.evidence.filter((e) => !e.contradicts).length);
      assert.equal(row.status, 'active');
    }
  });
});

test('a manifest is written, and it declares the index the rows are in', async () => {
  await withSource(Object.fromEntries([active('a fact')]), async (dirs) => {
    await migrate({ ...dirs, generated: 'T' });
    const manifest = JSON.parse(readFileSync(join(dirs.outDir, 'kb.json'), 'utf8'));
    assert.equal(manifest.schema, 1);
    assert.deepEqual(manifest.indexes, { experiential: 'index.json' });
  });
});

test('running it twice produces the same base — it is not additive', async () => {
  // The output directory is rebuilt, not merged into. A migration that accumulated would leave an
  // entry behind after a correction, and the leftover would be indistinguishable from a real one.
  await withSource(Object.fromEntries([active('a fact')]), async (dirs) => {
    await migrate({ ...dirs, generated: 'T' });
    const first = readFileSync(join(dirs.outDir, 'index.json'), 'utf8');
    await migrate({ ...dirs, generated: 'T' });
    assert.equal(readFileSync(join(dirs.outDir, 'index.json'), 'utf8'), first);
    assert.equal(readdirSync(join(dirs.outDir, 'entries')).length, 1);
  });
});
