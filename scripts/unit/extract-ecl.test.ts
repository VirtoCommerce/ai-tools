// Unit tests for scripts/knowledge/extract-ecl.ts — the chapter-scoped ECL extractor, sibling of
// extract-bl.test.ts.
//
// Same first principle: PARITY WITH THE GATE. `ecl:lint` decides what an ECL section is, and an
// extract that silently dropped one would hand an agent a brief that looks complete and is not. So
// test one runs both parsers over the real library and compares id sets — no fixture, because a
// fixture cannot catch the library growing a shape the slicer mishandles.
//
// The rest pin the three behaviours that are specific to THIS oracle and would each fail silently:
// fenced illustration must not be sliced as a section, Appendix D cites rather than defines, and
// `--domain` unions chapter and section titles rather than preferring one (see the long comment on
// resolveDomainToken — the BL precedence would drop ECL-14.6 from a payment brief).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { parseLibrary } from "../knowledge/lint-ecl.ts";
import { ECL_PATH, renderMarkdown, selectSections, sliceLibrary, type EclSlice } from "../knowledge/extract-ecl.ts";

const text = readFileSync(ECL_PATH, "utf-8");
const slices = sliceLibrary(text);

test("the slicer sees exactly the sections the ecl:lint gate sees", () => {
  const fromGate = parseLibrary(text).sections.map((s) => s.id).sort();
  const fromSlicer = slices.map((s) => s.id).sort();
  assert.deepEqual(
    fromSlicer,
    fromGate,
    "extract-ecl and lint-ecl disagree about what an ECL section is — an extract would drop or invent one",
  );
  assert.ok(fromGate.length > 40, `expected the real library, got ${fromGate.length} sections`);
});

test("every slice is verbatim source text, not a re-rendering", () => {
  for (const s of slices) {
    assert.ok(text.includes(s.markdown), `${s.id}: slice is not a literal substring of the library`);
    assert.match(s.markdown, new RegExp(`^### ${s.chapter}\\.${s.seq}\\b`), `${s.id}: slice must start at its own heading`);
  }
});

test("slices carry no trailing blank padding and follow source order", () => {
  for (const s of slices) {
    assert.equal(s.markdown, s.markdown.replace(/\s+$/, ""), `${s.id}: trailing blank lines`);
  }
  const starts = slices.map((s) => text.indexOf(s.markdown));
  for (let i = 1; i < starts.length; i++) {
    assert.ok(starts[i] > starts[i - 1], `${slices[i].id} does not follow ${slices[i - 1].id} in source order`);
  }
});

test("a section's whole pattern table travels with it, header row included", () => {
  const withTable = slices.filter((s) => s.markdown.includes("| Pattern |"));
  assert.ok(withTable.length > 20, "most sections carry a pattern table; the slicer must keep it");
  for (const s of withTable) {
    assert.match(s.markdown, /\|\s*Pattern\s*\|.*\|\s*\n\s*\|[\s:|-]+\|/, `${s.id}: table header/separator was cut`);
  }
});

// --- domain and chapter selection -----------------------------------------------------------------

test("--chapter selects exactly that chapter", () => {
  const got = selectSections(slices, { chapters: [1] });
  assert.ok(got.length > 1);
  assert.ok(got.every((s) => s.chapter === 1), "a chapter filter leaked another chapter");
});

test("--domain unions chapter and section titles, so a VC-specific section is not dropped", () => {
  const got = selectSections(slices, { domains: ["payment"] }).map((s) => s.id);
  assert.ok(got.includes("ECL-14.6"), "the VC-specific payment section must be in a payment brief");
  assert.ok(got.some((id) => id.startsWith("ECL-1.")), "chapter 1 must be in a payment brief too");
  // The precondition that makes this test non-vacuous: 14.6 is reachable ONLY via its section title.
  // If chapter 14's heading ever gained the word, this assert fails and the test is rewritten rather
  // than passing for the wrong reason.
  const s146 = slices.find((s) => s.id === "ECL-14.6")!;
  assert.ok(!/\bpayment\b/i.test(s146.chapterTitle), "precondition: 14.6's CHAPTER heading must not contain 'payment'");
  assert.match(s146.title, /\bPayment\b/);
});

test("a token that names no chapter still resolves via section titles", () => {
  const got = selectSections(slices, { domains: ["loyalty"] });
  assert.ok(got.length > 0, "loyalty must resolve (there is no Loyalty chapter)");
  assert.ok(got.every((s) => /\bloyalty\b/i.test(s.title) || /\bloyalty\b/i.test(s.chapterTitle)));
});

test("whole-word matching — a token cannot match a longer word", () => {
  const got = selectSections(slices, { domains: ["bot"] });
  for (const s of got) {
    assert.ok(
      /\bbot\b/i.test(s.title) || /\bbot\b/i.test(s.chapterTitle),
      `${s.id}: 'bot' matched inside a longer word (${s.title})`,
    );
  }
});

test("filters union, and ids select independently of chapter", () => {
  const one = slices.find((s) => s.chapter === 15)!;
  const got = selectSections(slices, { chapters: [1], ids: [one.id] }).map((s) => s.id);
  assert.ok(got.includes(one.id), "an explicit --id must survive alongside a --chapter filter");
  assert.ok(got.some((id) => id.startsWith("ECL-1.")));
});

test("no filter means the whole library — an extract is never silently narrowed", () => {
  assert.equal(selectSections(slices, {}).length, slices.length);
});

test("an unknown filter selects nothing, so the CLI can refuse instead of emitting an empty brief", () => {
  assert.deepEqual(selectSections(slices, { domains: ["no-such-domain-xyz"] }), []);
  assert.deepEqual(selectSections(slices, { chapters: [999] }), []);
});

// --- the rendered brief ---------------------------------------------------------------------------

test("the rendered extract declares that it is a subset, and lists what it contains", () => {
  const selected = selectSections(slices, { chapters: [1] });
  const md = renderMarkdown(selected, "--chapter 1", slices.length);
  assert.match(md, /This is a SUBSET/, "an agent must be able to tell an extract from the whole library");
  assert.match(md, new RegExp(`extract \\(${selected.length} of ${slices.length}\\)`));
  // Assert on the HEADER, not the whole document: a body row contains "[OBSERVED]" anyway, so a
  // document-wide match would pass even if the header never explained what the tag means.
  const header = md.slice(0, md.indexOf("\n---\n"));
  assert.ok(header.includes("[OBSERVED]") && header.includes("[THEORETICAL]"),
    "the header must explain the status vocabulary — an agent that reads [THEORETICAL] as observed files a bug for a pattern nobody has seen");
  for (const s of selected) {
    assert.ok(md.includes(s.markdown), `${s.id}: body missing from the rendered extract`);
    assert.ok(md.includes(s.id), `${s.id}: not listed in the Included line`);
  }
});

test("a chapter extract is a small fraction of the library — the point of the script", () => {
  const md = renderMarkdown(selectSections(slices, { chapters: [1] }), "--chapter 1", slices.length);
  const ratio = md.length / text.length;
  assert.ok(ratio < 0.2, `--chapter 1 is ${(ratio * 100).toFixed(1)}% of the library; the slice is not saving enough to be worth the indirection`);
});

test("the output is deterministic — same filters, byte-identical text", () => {
  const a = renderMarkdown(selectSections(sliceLibrary(text), { chapters: [1] }), "--chapter 1", slices.length);
  const b = renderMarkdown(selectSections(sliceLibrary(text), { chapters: [1] }), "--chapter 1", slices.length);
  assert.equal(a, b);
});

// --- shape robustness -----------------------------------------------------------------------------
//
// The two library-specific traps. Both are silent: a fenced template sliced as a section ships a
// placeholder row to an agent as if it were an observed edge case, and collecting past Appendix D
// invents ids whose "body" is a citation row. `lint-ecl` guards both — measured, it once counted
// Appendix A's placeholder as a real pattern of §13.3 — so the slicer must guard them identically.

test("a `###` inside a fenced block is illustration, not a section", () => {
  const synthetic = [
    "## 1. Checkout & Payment Processing",
    "",
    "### 1.1 Payment Method Edge Cases",
    "| Pattern | Description |",
    "|---------|-------------|",
    "| **Real** | a real row |",
    "",
    "## Appendix A: Template",
    "",
    "```markdown",
    "### 99.1 Template Section",
    "| Pattern | Description |",
    "| **Placeholder** | not a real pattern |",
    "```",
    "",
    "## 2. Inventory & Stock Management",
    "",
    "### 2.1 Race Conditions",
    "| Pattern | Description |",
  ].join("\n");
  const got: EclSlice[] = sliceLibrary(synthetic);
  assert.deepEqual(got.map((s) => s.id), ["ECL-1.1", "ECL-2.1"], "the fenced template was sliced as a section");
  assert.ok(!got.some((s) => s.markdown.includes("Placeholder")), "placeholder text leaked into a slice");
  assert.ok(!got[0].markdown.includes("Appendix A"), "the appendix heading leaked into ECL-1.1");
});

test("collection stops at Appendix D — its rows cite sections, they do not define them", () => {
  const synthetic = [
    "## 1. Checkout & Payment Processing",
    "",
    "### 1.1 Payment Method Edge Cases",
    "| Pattern | Description |",
    "",
    "## Appendix D: Cross-Reference",
    "",
    "| Section | BL Invariant |",
    "| ECL-1.1 | BL-PAY-001 |",
    "",
    "### 77.7 Not A Real Section",
    "| Pattern | Description |",
  ].join("\n");
  const got = sliceLibrary(synthetic);
  assert.deepEqual(got.map((s) => s.id), ["ECL-1.1"], "a heading below Appendix D was sliced as a definition");
  assert.ok(!got[0].markdown.includes("Appendix D"), "the appendix leaked into the last real section");
});

test("a non-section `###` ends the entry instead of being absorbed", () => {
  const synthetic = [
    "## 1. Checkout & Payment Processing",
    "",
    "### 1.1 Payment Method Edge Cases",
    "| Pattern | Description |",
    "",
    "### Implementation notes",
    "",
    "prose that belongs to nobody",
    "",
    "### 1.2 Session & Timeout Issues",
    "| Pattern | Description |",
  ].join("\n");
  const got = sliceLibrary(synthetic);
  assert.deepEqual(got.map((s) => s.id), ["ECL-1.1", "ECL-1.2"], "only numbered sections are slices");
  assert.ok(!got[0].markdown.includes("belongs to nobody"), "unrelated prose shipped as part of the section");
});

// --- line endings -----------------------------------------------------------------------------------
//
// A Windows checkout (git autocrlf) hands the slicer CRLF. extract-bl's first implementation split on
// /\r?\n/ and re-joined with "\n", which rewrote every line ending and made the "verbatim" claim false
// on windows-latest while ubuntu passed. This slicer was written offset-based from the start; these
// tests keep it that way.

const CRLF = [
  "## 1. Checkout & Payment Processing",
  "",
  "### 1.1 Payment Method Edge Cases",
  "| Pattern | Description |",
  "|---------|-------------|",
  "| **Expired card** | it expired |",
  "",
  "### 1.2 Session & Timeout Issues",
  "| Pattern | Description |",
  "",
].join("\r\n");

test("a CRLF library yields slices that are still byte-identical substrings of the source", () => {
  const got = sliceLibrary(CRLF);
  assert.deepEqual(got.map((s) => s.id), ["ECL-1.1", "ECL-1.2"]);
  for (const s of got) {
    assert.ok(CRLF.includes(s.markdown), `${s.id}: slice is not a literal substring of the CRLF source`);
    assert.ok(s.markdown.includes("\r\n"), `${s.id}: line endings were rewritten to LF`);
  }
});

test("CRLF does not leak a carriage return into the parsed title or chapter heading", () => {
  const [first] = sliceLibrary(CRLF);
  assert.equal(first.title, "Payment Method Edge Cases", "a stray \\r would corrupt every brief heading");
  assert.equal(first.chapterTitle, "Checkout & Payment Processing", "a stray \\r in the chapter title breaks --domain");
  assert.equal(first.chapter, 1);
  assert.equal(first.seq, 1);
});

test("the same library in LF and CRLF selects the same ids", () => {
  const lf = sliceLibrary(CRLF.replace(/\r\n/g, "\n")).map((s) => s.id);
  const crlf = sliceLibrary(CRLF).map((s) => s.id);
  assert.deepEqual(crlf, lf, "line endings must not change which sections an extract contains");
});
