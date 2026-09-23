// Unit tests for scripts/knowledge/extract-bl.ts — the domain-scoped BL extractor that lets an
// orchestrator hand an agent the invariants it needs as TEXT instead of a 386 KB file path.
//
// The property that matters most is PARITY WITH THE GATE: `bl:lint` decides what a BL invariant is,
// and an extract that silently drops one would hand an agent a brief that looks complete and is not.
// So the first test runs both parsers over the real oracle and compares id sets — no fixture, because
// a fixture cannot catch the oracle growing a shape the slicer mishandles.
//
// The rest pin the two behaviours that were wrong in the first draft and would silently regress:
// domain precision (`--domain cart` must not drag in "Loyalty & Mixed Cart") and the refusal to emit
// an empty extract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { parseOracle } from "../knowledge/lint-bl.ts";
import {
  BL_PATH,
  listDomains,
  matchDomainToken,
  renderMarkdown,
  selectSlices,
  sliceOracle,
  type Slice,
} from "../knowledge/extract-bl.ts";

const text = readFileSync(BL_PATH, "utf-8");
const slices = sliceOracle(text);

test("the slicer sees exactly the invariants the bl:lint gate sees", () => {
  const fromGate = parseOracle(text).map((i) => i.id).sort();
  const fromSlicer = slices.map((s) => s.id).sort();
  assert.deepEqual(
    fromSlicer,
    fromGate,
    "extract-bl and lint-bl disagree about what a BL entry is — an extract would drop or invent an invariant",
  );
  assert.ok(fromGate.length > 150, `expected the real oracle, got ${fromGate.length} invariants`);
});

test("every slice is verbatim source text, not a re-rendering", () => {
  for (const s of slices.slice(0, 40)) {
    assert.ok(text.includes(s.markdown), `${s.id}: slice is not a literal substring of the oracle`);
    assert.match(s.markdown, new RegExp(`^### ${s.id}\\b`), `${s.id}: slice must start at its own heading`);
  }
});

test("slices carry no leading/trailing blank padding and do not overlap", () => {
  for (const s of slices) {
    assert.equal(s.markdown, s.markdown.replace(/\s+$/, ""), `${s.id}: trailing blank lines`);
  }
  const starts = slices.map((s) => text.indexOf(s.markdown));
  for (let i = 1; i < starts.length; i++) {
    assert.ok(starts[i] > starts[i - 1], `${slices[i].id} does not follow ${slices[i - 1].id} in source order`);
  }
});

// --- domain precision ---------------------------------------------------------------------------

test("an exact id-prefix wins over a heading word: --domain cart excludes Loyalty & Mixed Cart", () => {
  const got = selectSlices(slices, { domains: ["cart"] });
  assert.ok(got.length > 0, "cart must match something");
  assert.ok(
    got.every((s) => s.domainPrefix === "BL-CART"),
    `--domain cart leaked other domains: ${[...new Set(got.map((s) => s.domainPrefix))].join(", ")}`,
  );
  // The regression this pins: the loose substring match returned BL-LOY too, because that domain
  // heading contains the word "Cart".
  assert.ok(
    slices.some((s) => /cart/i.test(s.domain) && s.domainPrefix !== "BL-CART"),
    "precondition: some non-CART domain heading contains 'cart' — otherwise this test proves nothing",
  );
});

test("a token with no id prefix falls back to a whole-word heading match", () => {
  const got = selectSlices(slices, { domains: ["pricing"] });
  assert.ok(got.length > 0, "pricing must resolve via the heading (there is no BL-PRICING prefix)");
  assert.ok(got.every((s) => s.domainPrefix === "BL-PRICE"), "pricing must resolve to exactly one domain");
});

test("filters union, and ids/severities select independently of domain", () => {
  const cart = selectSlices(slices, { domains: ["cart"] }).map((s) => s.id);
  const one = slices.find((s) => s.domainPrefix === "BL-PRICE")!;
  const both = selectSlices(slices, { domains: ["cart"], ids: [one.id] }).map((s) => s.id);
  assert.deepEqual(both, [...new Set([...cart, one.id])].sort((a, b) =>
    slices.findIndex((s) => s.id === a) - slices.findIndex((s) => s.id === b)),
    "union must keep source order and add the extra id");

  const p0 = selectSlices(slices, { severities: ["P0-revenue"] });
  assert.ok(p0.length > 0 && p0.every((s) => s.severity === "P0-revenue"));
});

test("no filter means the whole oracle — an extract is never silently narrowed", () => {
  assert.equal(selectSlices(slices, {}).length, slices.length);
});

test("an unknown domain selects nothing, so the CLI can refuse instead of emitting an empty brief", () => {
  assert.deepEqual(selectSlices(slices, { domains: ["no-such-domain-xyz"] }), []);
});

// --- the rendered brief -------------------------------------------------------------------------

test("the rendered extract declares that it is a subset, and lists what it contains", () => {
  const selected = selectSlices(slices, { domains: ["cart"] });
  const md = renderMarkdown(selected, "--domain cart", slices.length);
  assert.match(md, /This is a SUBSET/, "an agent must be able to tell an extract from the whole oracle");
  assert.match(md, new RegExp(`extract \\(${selected.length} of ${slices.length}\\)`));
  for (const s of selected) {
    assert.ok(md.includes(s.markdown), `${s.id}: body missing from the rendered extract`);
    assert.ok(md.includes(s.id), `${s.id}: not listed in the Included line`);
  }
});

test("a domain extract is a small fraction of the oracle — the point of the script", () => {
  const md = renderMarkdown(selectSlices(slices, { domains: ["cart"] }), "--domain cart", slices.length);
  const ratio = md.length / text.length;
  assert.ok(ratio < 0.2, `--domain cart is ${(ratio * 100).toFixed(1)}% of the oracle; the slice is not saving enough to be worth the indirection`);
});

test("the output is deterministic — same filters, byte-identical text", () => {
  const a = renderMarkdown(selectSlices(sliceOracle(text), { domains: ["cart"] }), "--domain cart", slices.length);
  const b = renderMarkdown(selectSlices(sliceOracle(text), { domains: ["cart"] }), "--domain cart", slices.length);
  assert.equal(a, b);
});

// --- shape robustness ----------------------------------------------------------------------------

test("a `##` heading that is not a Domain still closes the preceding entry", () => {
  const synthetic = [
    "## Domain 1: Cart (BL-CART)",
    "",
    "### BL-CART-001: First `[P0-revenue]`",
    "- **Rule:** one",
    "",
    "## Appendix",
    "",
    "not an invariant",
  ].join("\n");
  const got: Slice[] = sliceOracle(synthetic);
  assert.equal(got.length, 1);
  assert.ok(!got[0].markdown.includes("Appendix"), "the appendix leaked into the invariant body");
  assert.ok(!got[0].markdown.includes("not an invariant"));
});

// A NON-BL `###` inside a domain must end the entry too. Today the oracle's only such heading sits in
// the preamble, so this is latent — and it is exactly the kind of latent bug that ships borrowed prose
// inside `BL-X`'s body the first time someone adds a note under an invariant. A brief cannot tell the
// difference, so the slicer must.
test("a non-BL `###` subheading ends the entry instead of being absorbed", () => {
  const synthetic = [
    "## Domain 1: Cart (BL-CART)",
    "",
    "### BL-CART-001: First `[P0-revenue]`",
    "- **Rule:** one",
    "",
    "### Implementation notes",
    "",
    "prose that belongs to nobody",
    "",
    "### BL-CART-002: Second `[P1-data]`",
    "- **Rule:** two",
  ].join("\n");
  const got = sliceOracle(synthetic);
  assert.deepEqual(got.map((s) => s.id), ["BL-CART-001", "BL-CART-002"], "only BL entries are slices");
  assert.ok(!got[0].markdown.includes("Implementation notes"), "the subheading leaked into BL-CART-001");
  assert.ok(!got[0].markdown.includes("belongs to nobody"), "unrelated prose shipped as part of the invariant");
  assert.equal(got[0].markdown, "### BL-CART-001: First `[P0-revenue]`\n- **Rule:** one");
});

// --- line endings ---------------------------------------------------------------------------------
//
// A Windows checkout (git autocrlf) hands the slicer CRLF. The first implementation split on
// /\r?\n/ and re-joined with "\n", which silently rewrote every line ending: the "verbatim" claim
// became false and `text.includes(slice)` matched 0 of 216 entries. CI caught it on the windows-latest
// job while ubuntu passed — the exact asymmetry this test now pins on every platform.

const CRLF = [
  "## Domain 1: Cart (BL-CART)",
  "",
  "### BL-CART-001: First `[P0-revenue]`",
  "- **Rule:** one",
  "- **Verify:** check it",
  "",
  "### BL-CART-002: Second `[P1-data]`",
  "- **Rule:** two",
  "",
].join("\r\n");

test("a CRLF oracle yields slices that are still byte-identical substrings of the source", () => {
  const got = sliceOracle(CRLF);
  assert.deepEqual(got.map((s) => s.id), ["BL-CART-001", "BL-CART-002"]);
  for (const s of got) {
    assert.ok(CRLF.includes(s.markdown), `${s.id}: slice is not a literal substring of the CRLF source`);
    assert.ok(s.markdown.includes("\r\n"), `${s.id}: line endings were rewritten to LF`);
  }
});

test("CRLF does not leak a carriage return into the parsed title or severity", () => {
  const [first] = sliceOracle(CRLF);
  assert.equal(first.title, "First", "a stray \\r in the title would corrupt every brief heading");
  assert.equal(first.severity, "P0-revenue", "a stray \\r would make the severity tag unmatchable");
  assert.ok(!first.domain.includes("\r"), "domain heading kept its carriage return");
});

test("the same oracle in LF and CRLF selects the same ids", () => {
  const lf = sliceOracle(CRLF.replace(/\r\n/g, "\n")).map((s) => s.id);
  const crlf = sliceOracle(CRLF).map((s) => s.id);
  assert.deepEqual(crlf, lf, "line endings must not change which invariants an extract contains");
});

// --- declared vs populated, added 2026-09-23 --------------------------------------------------
//
// `--list` was built from SLICES, so a domain the oracle declares but has not filled in yet did not
// appear at all, and `--domain <its token>` exited 2 with "matched no invariant" — which reads as an
// unknown token. `/qa-domain-map` Step 0 validates a slug against that listing and STOPs on unknown,
// so the gate refused a legitimate refresh of the UCP map: Domain 25 is declared, holds zero
// invariants by design (the map's own G5), and `ucp` was the one heading of 27 that `--list` omitted.
//
// The asymmetry is the point. An oracle gap and a typo are different facts with different fixes, and
// the domains with no invariants yet are exactly the ones a map is most needed for — so the
// validator failed hardest where it mattered most. These tests pin BOTH directions: an empty domain
// is listed and accepted as a slug, AND `--domain` still refuses to emit an empty extract.

test("listDomains returns every DECLARED heading, including one holding no invariant", () => {
  const declared = listDomains(text);
  const headings = text
    .split("\n")
    .map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l))
    .filter((l) => /^##\s+Domain\s+\S+\s*:/.test(l));
  assert.equal(
    declared.length,
    headings.length,
    "a declared domain must never be dropped just because nothing sits under it"
  );
});

test("a declared-but-empty domain reports n = 0 rather than going missing", () => {
  const ucp = listDomains(text).find((d) => d.token === "ucp");
  assert.ok(ucp, "Domain 25 (BL-UCP) is declared in the oracle and must be listed");
  assert.equal(ucp.n, 0, "it deliberately holds no invariant yet — that is the case under test");
  assert.equal(ucp.domainPrefix, "BL-UCP");
});

test("every populated domain's count agrees with the slices — the listing did not change meaning", () => {
  for (const d of listDomains(text)) {
    const mine = slices.filter((s) => s.domain === d.domain);
    assert.equal(d.n, mine.length, d.domain);
  }
  assert.equal(
    listDomains(text).reduce((a, d) => a + d.n, 0),
    slices.length,
    "the per-domain counts must still sum to the whole oracle"
  );
});

test("slug validation accepts an empty domain; an unknown token still resolves to nothing", () => {
  const declared = listDomains(text);
  assert.equal(matchDomainToken(declared, "ucp").length, 1, "declared-but-empty is a VALID slug");
  assert.equal(matchDomainToken(declared, "cart").length, 1);
  assert.equal(matchDomainToken(declared, "wibble").length, 0, "a genuine typo must still fail");
  assert.equal(matchDomainToken(declared, "").length, 0);
});

test("--domain still extracts NOTHING for an empty domain — the refusal is unchanged", () => {
  // The listing got more permissive; the extractor must not. An agent handed zero invariants
  // reports "no rule applies", which is a false clean — that is why the exit-2 refusal exists, and
  // widening the slug validator must not quietly turn it into an empty success.
  assert.equal(selectSlices(slices, { domains: ["ucp"] }).length, 0);
});

test("one precedence rule serves both callers: heading match mirrors slice match", () => {
  // `matchDomainToken` is shared by --has-domain (over headings) and --domain (over slices), so a
  // token can never be valid to one and unknown to the other. Two copies of the rule is how a
  // validator comes to reject what the extractor accepts.
  const declared = listDomains(text);
  for (const token of ["cart", "loy", "pricing", "b2b", "a11y"]) {
    const viaHeading = matchDomainToken(declared, token);
    const viaSlices = selectSlices(slices, { domains: [token] });
    assert.equal(viaHeading.length, 1, `heading match for "${token}"`);
    assert.ok(viaSlices.length > 0, `slice match for "${token}"`);
    assert.ok(
      viaSlices.every((s) => s.domain === viaHeading[0].domain),
      `"${token}" must resolve to the SAME domain on both paths, got ${viaHeading[0].domain}`
    );
  }
});
