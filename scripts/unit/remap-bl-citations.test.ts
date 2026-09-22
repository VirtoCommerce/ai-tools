// Unit tests for scripts/knowledge/remap-bl-citations.ts — the WRITE half of the BL citation
// contract (`npm run bl:remap`). Covers the two DERIVATIONS only: BOM separation and the
// parse→serialize round trip. The CLI itself is guarded by `isCli`, so importing is inert.
// Run: `npx tsx --test scripts/unit/remap-bl-citations.test.ts` / `npm test`.
//
// Both tests are regressions for defects measured 2026-09-19, and both bugs had the same
// shape: the tool was WRONG about a file while reporting nothing at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, ser, readSuite } from "../knowledge/remap-bl-citations.ts";

const BOM = "﻿";
const H = `"ID","Title","Business_Rule"`;

function withTempFile(contents: string, fn: (p: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "bl-remap-"));
  const file = join(dir, "suite.csv");
  writeFileSync(file, contents, "utf8");
  try { fn(file); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("readSuite separates a UTF-8 BOM so column lookup on the first header cell works", () => {
  // THE BUG: readFileSync(f, "utf8") does not strip a BOM, so the first header cell parsed as
  // "﻿ID", header.indexOf("ID") returned -1, and the `ci < 0 || ii < 0` guard dropped all
  // 13 BOM-carrying suites SILENTLY — bl:lint saw 4 BL-CFG-003 citations in 072e where this
  // tool reported "0 case(s) in 0 file(s)".
  withTempFile(BOM + H + "\r\n", (file) => {
    const { text, bom } = readSuite(file);
    assert.equal(bom, BOM, "the BOM must be captured, not discarded — writes have to restore it");
    const header = parse(text).rows[0];
    assert.equal(header[0], "ID", "first header cell must not carry the BOM");
    assert.equal(header.indexOf("ID"), 0);
    assert.equal(header.indexOf("Business_Rule"), 2);
  });
});

test("readSuite leaves a BOM-less file untouched", () => {
  withTempFile(H + "\r\n", (file) => {
    const { text, bom } = readSuite(file);
    assert.equal(bom, "", "no BOM must not synthesise one — that would be a byte change");
    assert.equal(parse(text).rows[0][0], "ID");
  });
});

test("parse records per-cell quoting so ser reproduces the source byte-for-byte", () => {
  // THE BUG: ser() re-quoted MINIMALLY, so it stripped the quotes from every cell that did not
  // strictly need them. The corpus quotes every cell, so a 14-cell edit to 072e rewrote 111 of
  // 111 lines and dropped 1,140 bytes from columns the tool promises never to touch. The
  // post-write check compared PARSED values, which were identical, so it saw nothing.
  const src = [
    `"ID","Title","Business_Rule"`,
    `"CFG-001","Quoted title","BL-CFG-003"`,
    `BARE-002,bare title,BL-CFG-004`,                       // genuinely unquoted cells stay bare
    `"CFG-003","has, comma","BL-CFG-003; BL-CFG-007"`,
    `"CFG-004","has ""escaped"" quotes","BL-CFG-008"`,
    `"CFG-005","line one\r\nline two","BL-CFG-003"`,        // embedded CRLF inside a quoted cell
  ].join("\r\n") + "\r\n";

  const parsed = parse(src);
  assert.equal(ser(parsed, "\r\n") + "\r\n", src, "an untouched round trip must be the identity");

  // Mixed quoting survives independently per cell, which is the property that broke.
  assert.deepEqual(parsed.quoted[1], [true, true, true]);
  assert.deepEqual(parsed.quoted[2], [false, false, false]);

  // Embedded CRLF belongs to the cell VALUE, not to the record separator.
  assert.equal(parsed.rows[5][1], "line one\r\nline two");
  assert.equal(parsed.rows.length, 6, "a quoted newline must not split a record");
});

test("editing one cell changes only that cell's bytes", () => {
  // The whole point of the quoting fix: a suite CSV has one author per change and a conflict in
  // one is never resolved with git, so the diff footprint IS a correctness property here.
  const src = [
    `"ID","Title","Business_Rule"`,
    `"CFG-001","Untouched","BL-CFG-003"`,
    `BARE-002,Untouched bare,BL-CFG-004`,
  ].join("\r\n") + "\r\n";

  const parsed = parse(src);
  parsed.rows[1][2] = "PROPOSED-BL-CFG-003";
  const out = ser(parsed, "\r\n") + "\r\n";

  const before = src.split("\r\n"), after = out.split("\r\n");
  const changed = before.map((l, i) => (l === after[i] ? null : i)).filter((i) => i !== null);
  assert.deepEqual(changed, [1], "exactly one line may differ");
  assert.equal(after[1], `"CFG-001","Untouched","PROPOSED-BL-CFG-003"`);
  assert.equal(after[2], `BARE-002,Untouched bare,BL-CFG-004`, "a bare row must not gain quotes");
  assert.equal(out.length - src.length, "PROPOSED-".length, "no byte may move but the edit itself");
});

test("a newly-quote-requiring value gains quotes even if its cell was bare", () => {
  // Preserving source quoting must never win over CORRECTNESS: a bare cell that acquires a
  // comma has to be quoted, or the file stops parsing as the same table.
  const parsed = parse(`ID,Business_Rule\r\nA-1,BL-X-001\r\n`);
  parsed.rows[1][1] = "BL-X-001, BL-X-002";
  assert.equal(ser(parsed, "\r\n"), `ID,Business_Rule\r\nA-1,"BL-X-001, BL-X-002"`);
});

test("LF-only files keep LF (075-loyalty.csv is the one in the corpus)", () => {
  const src = `ID,Business_Rule\nA-1,BL-X-001\n`;
  const parsed = parse(src);
  assert.equal(ser(parsed, "\n") + "\n", src);
  assert.equal(parsed.rows.length, 2);
});
