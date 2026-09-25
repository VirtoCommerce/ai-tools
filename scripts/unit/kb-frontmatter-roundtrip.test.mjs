// Copied verbatim from the lab tool (origin/claude/kb-tool:plugins/vc-kb/test/
// frontmatter-roundtrip.test.mjs), with only the import path changed. It comes with
// frontmatter.mjs per PLAN §12: the round-trip is fiddly, easy to get subtly wrong, and rewriting
// it buys nothing while risking 89 migrated entries.
//
// AN ENTRY READ AND WRITTEN BACK UNCHANGED MUST BE THE SAME BYTES.
//
// Two migrations have now been written against `stringifyFrontmatter`, and both got the join wrong.
// One passed the body as a second argument, which the function ignores, and wrote a file that was
// frontmatter and nothing else â€” while printing `written:`. The other used `stringify(data) + body`,
// which silently drops one newline, because `parseEntry` returns a body starting at the character
// after the closing `---\n` and `stringify` ends without a trailing newline. That one would have
// eaten a blank line out of every entry it touched, in a corpus under version control where the
// diff would have read as eleven files changed.
//
// The function's contract is easy to misread and the cost of misreading it is a rewritten corpus,
// so the join belongs in a test rather than in each migration's head.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseEntry, stringifyFrontmatter } from '../kb/core/frontmatter.mjs';

const ENTRY = [
  '---',
  'id: KB-00000001',
  'subject: a claim',
  'plane: experiential',
  'status: active',
  'evidence:',
  '  - method: observation',
  '    deployment: somewhere',
  '    at: 2026-09-16T12:00:00.000Z',
  '---',
  '',
  'The body, which has its own blank line above it.',
  '',
].join('\n');

test('parse then stringify reproduces the file byte for byte', () => {
  const parsed = parseEntry(ENTRY);
  const rebuilt = stringifyFrontmatter(parsed.data) + String.fromCharCode(10) + parsed.body;
  assert.equal(rebuilt, ENTRY, 'a migration that changes nothing must write nothing new');
});

test('the two joins that were actually shipped are both wrong', () => {
  const parsed = parseEntry(ENTRY);

  // What the relabel migration had: loses the newline that ends the frontmatter terminator line.
  assert.notEqual(stringifyFrontmatter(parsed.data) + parsed.body, ENTRY);

  // What this session first wrote: the second argument is ignored, so the body disappears and the
  // result will not even parse.
  const dropped = stringifyFrontmatter(parsed.data, parsed.body);
  assert.notEqual(dropped, ENTRY);
  assert.throws(() => parseEntry(dropped), /terminator/,
    'the corrupt form must fail loudly on the next read, which is how it was caught');
});

// ─── line endings ─────────────────────────────────────────────────────────────────────────────

test('an entry checked out with CRLF parses identically — the reader does not depend on git config', () => {
  // Whether this reader ever sees a CR is decided by the READER'S git config, not by the corpus:
  // a clone made with `core.autocrlf=true`, the Windows default, hands back every entry with CRLF.
  // Every check in parseEntry is written against LF and the opener test runs first, so before this
  // was handled a CRLF entry did not half-parse -- it failed entirely. Measured 2026-09-18 on a
  // fresh clone of the base: 90 entries, 90 problems, 0 read, and `kb reindex --base <clone>`
  // proposing to empty the index of a base that was perfectly intact.
  const data = {
    id: 'KB-11111111',
    subject: 'a fact with a CRLF checkout',
    plane: 'experiential',
    question: 'does it parse?',
    status: 'active',
    appliesTo: [{ axis: 'surface', value: 'storefront-ui' }],
    anchors: [{ coordinate: '/company/members' }, { coordinate: 'Query.organizationContacts' }],
    evidence: [{ method: 'observation', deployment: 'vcst_qa', at: '2026-09-18T00:00:00Z', by: 'session:abcd1234' }],
  };
  const lf = `${stringifyFrontmatter(data)}\nThe claim, in prose.\n`;
  const crlf = lf.replace(/\n/g, '\r\n');

  const a = parseEntry(lf, 'lf.md');
  const b = parseEntry(crlf, 'crlf.md');
  assert.deepEqual(b.data, a.data);
  assert.equal(b.body, a.body, 'and the prose carries no stray CR either');

  // The WRITER is untouched: output stays LF, so the byte shape a push uploads does not move.
  assert.equal(stringifyFrontmatter(b.data), stringifyFrontmatter(a.data));
  assert.equal(stringifyFrontmatter(b.data).includes('\r'), false);
});
