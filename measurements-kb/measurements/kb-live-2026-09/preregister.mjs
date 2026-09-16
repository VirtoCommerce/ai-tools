#!/usr/bin/env node
/**
 * Pre-registration that a run cannot read, and anybody can verify afterwards.
 *
 * WHY THIS EXISTS. Predictions lived in the commit message from run 08, on the reasoning that a run
 * does not read `git log` -- verified over runs 07 to 11, 1,144 calls, no git access at all. Run 12
 * read `git log --oneline -5` at tool call 3 of 230 and `git log -1 --format=%B` at call 4, during
 * ordinary orientation, and so read all four predictions about itself before doing anything. It
 * disclosed this in its own report and said the affected observation should not be counted.
 *
 * The convention was safe for five runs by HABIT, not by construction. An instruction not to read
 * git log would be one more thing to remember, and this project's whole record says that fails --
 * run 05 carried a prefix 25 times out of 25 and the mechanism still had to be built.
 *
 * So: the prediction text lives OUTSIDE both repositories, and the commit carries only its hash.
 * Unreadable before, verifiable after, and nothing has to be remembered by anyone.
 *
 *   node preregister.mjs seal  <file>   -> prints the line to paste into the commit message
 *   node preregister.mjs verify <file> <hash>
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [, , cmd, file, expected] = process.argv;
const digest = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);

if (cmd === 'seal' && file) {
  console.log(`PRE-REGISTERED: sha256:${digest(file)} — the predictions for this run, sealed`);
  console.log('outside both repositories. Published beside the result; verify with');
  console.log(`\`node measurements/kb-live-2026-09/preregister.mjs verify <file> ${digest(file)}\`.`);
} else if (cmd === 'verify' && file && expected) {
  const got = digest(file);
  console.log(got === expected ? `OK — ${file} is what was sealed (${got})` : `MISMATCH — sealed ${expected}, this file is ${got}`);
  process.exit(got === expected ? 0 : 1);
} else {
  console.error('usage: preregister.mjs seal <file> | verify <file> <hash>');
  process.exit(2);
}
