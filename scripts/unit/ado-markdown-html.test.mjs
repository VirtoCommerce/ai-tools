// Unit tests for the Markdown -> HTML safety net in the SHIPPED plugin copy
// (plugins/vc-fix/skills/qa-fix-routing/ado.mjs) — Azure Boards Description/ReproSteps/comments
// are HTML fields; this net converts Markdown that slips through instead of authoring HTML
// directly. Pure — no env, no network. Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
//
// NOTE: `ensureAzureHtml`/`mdToHtml`/`buildBugFields`/`isHtmlField` now live in ONE shared
// module (plugins/vc-fix/skills/qa-fix-routing/ado-html.mjs); both the CLI (ado.mjs) and the
// TS tracker (trackers/azure-tracker.ts) import it, so these tests cover both consumers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureAzureHtml, mdToHtml } from "../../plugins/vc-fix/skills/qa-fix-routing/ado.mjs";
import { buildBugFields, isHtmlField } from "../../plugins/vc-fix/skills/qa-fix-routing/ado-html.mjs";

test("ensureAzureHtml: author HTML passes through untouched", () => {
  const html = "<h3>Preconditions:</h3>\n<ol><li>User is logged in</li></ol>";
  assert.equal(ensureAzureHtml(html), html);
});

test("ensureAzureHtml: empty/whitespace stays empty", () => {
  assert.equal(ensureAzureHtml(""), "");
  assert.equal(ensureAzureHtml("   \n  "), "");
});

test("mdToHtml: plain paragraph, heading, ordered + unordered list, table", () => {
  assert.equal(mdToHtml("Just a line."), "<p>Just a line.</p>");
  assert.equal(mdToHtml("### Actual Result"), "<h5>Actual Result</h5>");
  assert.equal(mdToHtml("1. first\n2. second"), "<ol>\n<li>first</li>\n<li>second</li>\n</ol>");
  assert.equal(mdToHtml("- one\n- two"), "<ul>\n<li>one</li>\n<li>two</li>\n</ul>");
  assert.equal(
    mdToHtml("| A | B |\n|---|---|\n| 1 | 2 |"),
    '<table border="1" style="border-collapse:collapse;"><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
  );
});

test("mdToHtml: Markdown image syntax converts to <img>, not a bare text link", () => {
  const out = mdToHtml("![Screenshot](https://dev.azure.com/org/_apis/wit/attachments/abc?fileName=BUG.png)");
  assert.equal(out, '<p><img src="https://dev.azure.com/org/_apis/wit/attachments/abc?fileName=BUG.png" alt="Screenshot"></p>');
  assert.ok(!out.includes("<a "), "must not degrade to a text link");
  assert.ok(!out.startsWith("<p>!"), "must not leave a stray '!' before the tag");
});

test("mdToHtml: image with unsafe scheme drops the tag, keeps alt text", () => {
  const out = mdToHtml("![x](javascript:top.location='//evil.example')");
  assert.equal(out, "<p>x</p>");
});

test("mdToHtml: a raw <img> line isolated by blank lines passes through verbatim", () => {
  const out = mdToHtml('Before.\n\n<img src="https://example.com/a.png" width="700">\n\nAfter.');
  assert.equal(out, '<p>Before.</p>\n<img src="https://example.com/a.png" width="700">\n<p>After.</p>');
});

test("mdToHtml: a raw <img> line embedded mid-paragraph (no blank-line separator) still passes through verbatim, not escaped", () => {
  const out = mdToHtml('Actual: something broke here\n<img src="https://example.com/a.png" width="700">\nMore text after the image.');
  assert.equal(
    out,
    '<p>Actual: something broke here</p>\n<img src="https://example.com/a.png" width="700">\n<p>More text after the image.</p>',
  );
  assert.ok(!out.includes("&lt;img"), "the embed must not be HTML-escaped into visible text");
});

test("mdToHtml: a standalone <br/> line between two ordered-list items is preserved verbatim", () => {
  const out = mdToHtml("1. Open the page\n<br/>\n2. Click Save and see the error below.");
  assert.ok(out.includes("<br/>"));
  assert.ok(!out.includes("&lt;br"));
});

test("inline Markdown: bold, italic, code, link with disallowed scheme neutralized", () => {
  assert.equal(mdToHtml("**bold** and *italic* and `code`"), "<p><b>bold</b> and <i>italic</i> and <code>code</code></p>");
  const out = mdToHtml("[click me](javascript:top.location='//evil.example')");
  assert.equal(out, "<p>click me</p>");
  const safe = mdToHtml("[ticket](https://dev.azure.com/org/_workitems/edit/123)");
  assert.equal(safe, '<p><a href="https://dev.azure.com/org/_workitems/edit/123">ticket</a></p>');
});

// ── buildBugFields / isHtmlField (the HTML-over-match fix + JSON-Patch shape) ──────────
test("isHtmlField: exact allowlist only — no suffix over-match", () => {
  assert.ok(isHtmlField("System.Description"));
  assert.ok(isHtmlField("Microsoft.VSTS.TCM.ReproSteps"));
  assert.ok(isHtmlField("Microsoft.VSTS.TCM.SystemInfo"));
  // the bug the fix targets: a plaintext custom ending in a magic word must NOT match
  assert.ok(!isHtmlField("Custom.ProblemDescription"));
  assert.ok(!isHtmlField("Custom.EnvSystemInfo"));
  assert.ok(!isHtmlField("System.History"));
});

test("buildBugFields: HTML fields converted, plaintext custom sent verbatim", () => {
  const ops = buildBugFields({
    title: "Cart total wrong",
    description: "**bad** total",
    fields: { "Custom.ProblemDescription": "**keep me literal**" },
  });
  const get = (p) => ops.find((o) => o.path === p);
  assert.equal(get("/fields/System.Title").value, "Cart total wrong");
  // System.Description is an HTML field → markdown-converted
  assert.equal(get("/fields/System.Description").value, "<p><b>bad</b> total</p>");
  // the custom field is NOT in the allowlist → value passes through verbatim (the fix)
  assert.equal(get("/fields/Custom.ProblemDescription").value, "**keep me literal**");
});

test("buildBugFields: parent link is an org-scoped Hierarchy-Reverse relation", () => {
  const ops = buildBugFields({ title: "x", parentId: 967, orgUrl: "https://dev.azure.com/acme" });
  const rel = ops.find((o) => o.path === "/relations/-");
  assert.equal(rel.value.rel, "System.LinkTypes.Hierarchy-Reverse");
  assert.equal(rel.value.url, "https://dev.azure.com/acme/_apis/wit/workItems/967");
});

test("buildBugFields: title is required (fails loudly)", () => {
  assert.throws(() => buildBugFields({ description: "no title" }), /title is required/);
});
