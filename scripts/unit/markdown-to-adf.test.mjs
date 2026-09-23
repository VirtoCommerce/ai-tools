// Unit tests for scripts/tracker/markdown-to-adf.mjs
//
// This tests a DERIVATION (markdown -> ADF), not a declaration, so it belongs here rather than in a
// drift guard (.claude/knowledge/execution/when-to-write-a-test.md §7a). A wrong implementation
// emits a structure no human wrote down, which is exactly the class a unit test catches.
//
// The bug being pinned: `tracker:comment --amend` sent markdown as a raw STRING to Jira REST v3,
// which accepts ADF only, so every amend returned
// `400 {"errors":{"comment":"Comment body is not valid!"}}`. Because tracker-ops.md §0 routes every
// correction through --amend, that pushed callers toward posting a second comment — the precise
// failure the GOLDEN RULE exists to prevent.

import test from "node:test";
import assert from "node:assert/strict";
import { markdownToAdf, inlineNodes } from "../tracker/markdown-to-adf.mjs";

const kinds = (doc) => doc.content.map((n) => n.type);
const firstOf = (doc, type) => doc.content.find((n) => n.type === type);

test("always returns a valid ADF doc envelope", () => {
  const doc = markdownToAdf("hello");
  assert.equal(doc.type, "doc");
  assert.equal(doc.version, 1);
  assert.ok(Array.isArray(doc.content));
});

test("empty input still yields a valid doc — ADF refuses an empty content array", () => {
  for (const input of ["", null, undefined, "   \n\n  "]) {
    const doc = markdownToAdf(input);
    assert.equal(doc.type, "doc");
    assert.ok(doc.content.length >= 1, `empty content for ${JSON.stringify(input)}`);
  }
});

test("headings carry their level", () => {
  const doc = markdownToAdf("# One\n\n## Two\n\n### Three");
  assert.deepEqual(kinds(doc), ["heading", "heading", "heading"]);
  assert.deepEqual(doc.content.map((h) => h.attrs.level), [1, 2, 3]);
  assert.equal(doc.content[1].content[0].text, "Two");
});

test("inline marks: strong, em, code, link", () => {
  const n = inlineNodes("a **b** c *d* e `f` g [h](https://x.test)");
  const byMark = (m) => n.find((x) => x.marks?.some((k) => k.type === m));
  assert.equal(byMark("strong").text, "b");
  assert.equal(byMark("em").text, "d");
  assert.equal(byMark("code").text, "f");
  const link = byMark("link");
  assert.equal(link.text, "h");
  assert.equal(link.marks.find((k) => k.type === "link").attrs.href, "https://x.test");
});

test("no empty text nodes are emitted — ADF rejects them", () => {
  const doc = markdownToAdf("**bold**\n\n`code`\n\n# H");
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === "object") {
      if (n.type === "text") assert.notEqual(n.text, "", "empty text node emitted");
      Object.values(n).forEach(walk);
    }
  };
  walk(doc);
});

test("a table becomes a rectangular ADF table with a header row", () => {
  const doc = markdownToAdf("| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |");
  const t = firstOf(doc, "table");
  assert.ok(t, "no table emitted");
  assert.equal(t.content.length, 3); // header + 2 rows
  assert.equal(t.content[0].content[0].type, "tableHeader");
  assert.equal(t.content[1].content[0].type, "tableCell");
  for (const row of t.content) assert.equal(row.content.length, 2, "ragged table row");
});

test("a short table row is padded to the header width — ADF requires a rectangle", () => {
  const doc = markdownToAdf("| A | B | C |\n| --- | --- | --- |\n| 1 |");
  const t = firstOf(doc, "table");
  assert.equal(t.content[1].content.length, 3);
});

test("bullet and ordered lists are distinguished", () => {
  const b = markdownToAdf("- one\n- two");
  const o = markdownToAdf("1. one\n2. two");
  assert.equal(firstOf(b, "bulletList").content.length, 2);
  assert.equal(firstOf(o, "orderedList").content.length, 2);
  assert.equal(firstOf(b, "bulletList").content[0].type, "listItem");
});

test("horizontal rule and fenced code block", () => {
  const doc = markdownToAdf("---\n\n```js\nconst a = 1;\n```");
  assert.ok(kinds(doc).includes("rule"));
  const code = firstOf(doc, "codeBlock");
  assert.equal(code.attrs.language, "js");
  assert.equal(code.content[0].text, "const a = 1;");
});

test("a code fence containing markdown is NOT re-parsed", () => {
  const doc = markdownToAdf("```\n# not a heading\n| not | a table |\n```");
  assert.deepEqual(kinds(doc), ["codeBlock"]);
  assert.match(firstOf(doc, "codeBlock").content[0].text, /# not a heading/);
});

test("blockquote consumes consecutive quoted lines", () => {
  const doc = markdownToAdf("> one\n> two\n\nafter");
  assert.deepEqual(kinds(doc), ["blockquote", "paragraph"]);
});

test("terminates on pathological input — no infinite loop", () => {
  const doc = markdownToAdf("|\n|\n|||\n\n\n#\n>\n");
  assert.equal(doc.type, "doc");
});

test("round-trips the shape of a real tracker comment", () => {
  const md = [
    "## QA re-test — round 1",
    "",
    "**Verdict: PASS WITH NOTES.** See `summary.json`.",
    "",
    "| # | Verdict | Evidence |",
    "| --- | --- | --- |",
    "| **F1** reliability | **FIXED** | 17/17 restores |",
    "",
    "---",
    "",
    "- **A finding** with `code` and a [link](https://x.test)",
    "- Another",
    "",
    "*Evidence: reports/tickets/…*",
  ].join("\n");
  const doc = markdownToAdf(md);
  const k = kinds(doc);
  assert.deepEqual(k, ["heading", "paragraph", "table", "rule", "bulletList", "paragraph"]);
  // the exact failure this module fixes: the payload must be an object, never a string
  assert.equal(typeof doc, "object");
  assert.notEqual(typeof doc, "string");
});
