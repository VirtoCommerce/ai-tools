// The kb entry contract (VCST-5818). Guards the frontmatter parser and the closed
// vocabularies that every other kb module trusts.
//
// The parser is hand-rolled because the toolchain ships with zero external dependencies
// (it runs in a client brain repo's CI, where the parent repo's node_modules does not
// exist). A hand-rolled parser is exactly the kind of thing that fails SILENTLY — the
// VCST-5807 defect was a YAML reader abandoning a whole frontmatter block over an
// unquoted ": " and reporting empty metadata — so these tests care as much about the
// ERRORS being raised as about the happy path parsing.
//
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KB_FIXTURES, kbModule } from "./_kb-helpers.mjs";

const { parseEntry, parseFrontmatter, parseRelation, validateEntry, serializeEntry, KINDS, SCOPES, STATUSES } =
  await kbModule("entry.mjs");

const codes = (errors) => errors.map((e) => e.code);

const VALID = [
  "---",
  "id: BL-CART-010",
  "title: Cart total excludes tax until an address is known",
  "scope: platform",
  "kind: invariant",
  'appliesTo: ">=3.800.0 <4.0.0"',
  "relation: new",
  "status: active",
  "tags: [cart, tax]",
  "audited:",
  "  date: 2026-08-28",
  "  source: live",
  "  ref: REG-2026-08-28/SMK-004",
  "---",
  "",
  "The displayed cart total excludes tax.",
  "",
].join("\n");

/** Build a variant of VALID with `line` replaced (or appended when `find` is absent). */
function variant(find, replace) {
  if (!find) return VALID.replace("---\n\nThe displayed", replace + "\n---\n\nThe displayed");
  return VALID.replace(find, replace);
}

test("a well-formed entry parses with no findings", () => {
  const { entry, errors } = parseEntry(VALID, { file: "BL-CART-010.md" });
  assert.deepEqual(errors, []);
  assert.equal(entry.id, "BL-CART-010");
  assert.equal(entry.kind, "invariant");
  assert.deepEqual(entry.tags, ["cart", "tax"]);
  assert.deepEqual(entry.audited, { date: "2026-08-28", source: "live", ref: "REG-2026-08-28/SMK-004" });
  assert.deepEqual(entry.relationParsed, { verb: "new", target: null });
  assert.match(entry.body, /excludes tax/);
  assert.equal(entry.valid, true);
});

test("line numbers point at the body, so the index can cite a range", () => {
  const { entry } = parseEntry(VALID, { file: "x.md" });
  const lines = VALID.split("\n");
  assert.equal(lines[entry.startLine - 1], "");
  assert.match(lines[entry.startLine], /displayed cart total/);
  assert.ok(entry.endLine >= entry.startLine);
});

test("the closed vocabularies are enforced, not merely documented", () => {
  assert.deepEqual(KINDS, ["invariant", "flow", "locator", "quirk", "module"]);
  assert.deepEqual(SCOPES, ["platform", "client"]);
  assert.ok(STATUSES.includes("superseded"));

  assert.ok(codes(parseEntry(variant("kind: invariant", "kind: heuristic")).errors).includes("KBE-002"));
  assert.ok(codes(parseEntry(variant("scope: platform", "scope: partner")).errors).includes("KBE-002"));
  assert.ok(codes(parseEntry(variant("status: active", "status: probably")).errors).includes("KBE-002"));
});

test("the schema is closed — an unknown field is an error, not a silently kept extra", () => {
  const errs = parseEntry(variant("status: active", "status: active\nconfidence: high")).errors;
  const unknown = errs.filter((e) => e.code === "KBE-011");
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].field, "confidence");
});

test("a missing required field is reported per field", () => {
  const noTitle = VALID.replace("title: Cart total excludes tax until an address is known\n", "");
  const errs = parseEntry(noTitle).errors.filter((e) => e.code === "KBE-001");
  assert.deepEqual(errs.map((e) => e.field), ["title"]);
});

test("relation grammar: new takes no target, the other three require one", () => {
  assert.deepEqual(parseRelation("new"), { verb: "new", target: null });
  assert.deepEqual(parseRelation("override BL-AUTH-004"), { verb: "override", target: "BL-AUTH-004" });
  assert.equal(parseRelation("new BL-AUTH-004"), null);
  assert.equal(parseRelation("override"), null);
  assert.equal(parseRelation("replaces BL-AUTH-004"), null);
  assert.ok(codes(parseEntry(variant("relation: new", "relation: replaces BL-AUTH-004")).errors).includes("KBE-003"));
});

test("a platform entry may not override, extend or suppress — that is the client delta", () => {
  const errs = parseEntry(variant("relation: new", "relation: override BL-AUTH-004")).errors;
  assert.ok(codes(errs).includes("KBE-003"));
  assert.ok(errs.some((e) => /CLIENT delta/.test(e.message)));
});

test("an override without quotes fails — the quote is the drift sensor, not decoration", () => {
  const withoutQuotes = VALID
    .replace("scope: platform", "scope: client")
    .replace("id: BL-CART-010", "id: CL-CART-001")
    .replace("relation: new", "relation: override BL-CART-010");
  const errs = parseEntry(withoutQuotes).errors;
  assert.ok(codes(errs).includes("KBE-004"));

  const withQuotes = withoutQuotes.replace("status: active", "status: active\nquotes: |\n  the platform wording");
  assert.ok(!codes(parseEntry(withQuotes).errors).includes("KBE-004"));
});

test("a suppress without a reason fails — a hidden rule and a lost rule must not look alike", () => {
  const suppress = VALID
    .replace("scope: platform", "scope: client")
    .replace("id: BL-CART-010", "id: CL-CART-002")
    .replace("relation: new", "relation: suppress BL-CART-010");
  assert.ok(codes(parseEntry(suppress).errors).includes("KBE-005"));
  const withReason = suppress.replace("status: active", "status: active\nreason: this deployment has no cart");
  assert.ok(!codes(parseEntry(withReason).errors).includes("KBE-005"));
});

test("malformed id, appliesTo and audited each get their own rule id", () => {
  assert.ok(codes(parseEntry(variant("id: BL-CART-010", "id: bl-cart-10")).errors).includes("KBE-006"));
  assert.ok(codes(parseEntry(variant('appliesTo: ">=3.800.0 <4.0.0"', "appliesTo: recent-ish")).errors).includes("KBE-007"));
  assert.ok(codes(parseEntry(variant("  ref: REG-2026-08-28/SMK-004", "  ref: ")).errors).includes("KBE-008"));
  assert.ok(codes(parseEntry(variant("  date: 2026-08-28", "  date: last tuesday")).errors).includes("KBE-008"));
  assert.ok(codes(parseEntry(variant("  source: live", "  source: vibes")).errors).includes("KBE-008"));
});

test("a missing or unterminated frontmatter fence is an error, never a partial parse", () => {
  assert.ok(codes(parseFrontmatter("no fence here\n").errors).includes("KBE-009"));
  assert.ok(codes(parseFrontmatter("---\nid: X-1\nnever closed\n").errors).includes("KBE-009"));
  assert.equal(parseFrontmatter("---\nid: X-1\n").data, null);
});

test("an empty body is an error — the frontmatter is the contract, the body is the knowledge", () => {
  const empty = VALID.replace("The displayed cart total excludes tax.", "");
  assert.ok(codes(parseEntry(empty).errors).includes("KBE-010"));
});

test("a superseded entry is retained and fully readable — supersede never deletes", () => {
  const text = readFileSync(join(KB_FIXTURES, "platform", "confirmed", "BL-CART-011.md"), "utf8");
  const { entry, errors } = parseEntry(text, { file: "BL-CART-011.md" });
  assert.deepEqual(errors, []);
  assert.equal(entry.status, "superseded");
  assert.equal(entry.supersededBy, "BL-CART-012");
  assert.match(entry.body, /minimum order quantity/i);
});

test("status:draft is legal only in the draft profile, and required there", () => {
  assert.ok(codes(parseEntry(variant("status: active", "status: draft")).errors).includes("KBE-002"));
  const draft = {
    kind: "quirk", scope: "client", subject: "checkout", claim: "a claim",
    fingerprint: "abc123", status: "active",
    evidence: { method: "live", at: "2026-08-28", ref: "run/1" },
  };
  assert.ok(codes(validateEntry(draft, { profile: "draft" })).includes("KBE-002"));
  draft.status = "draft";
  assert.deepEqual(validateEntry(draft, { profile: "draft" }), []);
});

test("a draft needs its capture-time evidence block", () => {
  const draft = { kind: "quirk", scope: "client", subject: "checkout", claim: "a claim", fingerprint: "abc123", status: "draft" };
  assert.ok(codes(validateEntry(draft, { profile: "draft" })).includes("KBE-001"));
  draft.evidence = { method: "live", at: "2026-08-28" };
  assert.ok(codes(validateEntry(draft, { profile: "draft" })).includes("KBE-012"));
});

test("serialization round-trips byte-stably, including multi-line and comma-bearing values", () => {
  const { entry } = parseEntry(VALID, { file: "x.md" });
  entry.quotes = "first line, with a comma\nsecond line";
  entry.tags = ["cart", "tax"];
  const once = serializeEntry(entry);
  const reparsed = parseEntry(once, { file: "x.md" });
  assert.deepEqual(reparsed.errors, []);
  assert.equal(reparsed.entry.quotes, entry.quotes);
  assert.equal(serializeEntry(reparsed.entry), once, "a second serialization must be byte-identical");
});

test("a list item containing a comma survives the round trip", () => {
  const { entry } = parseEntry(VALID, { file: "x.md" });
  const out = serializeEntry(Object.assign({}, entry, { tags: ["one, with comma", "two"] }));
  const back = parseEntry(out, { file: "x.md" });
  assert.deepEqual(back.entry.tags, ["one, with comma", "two"]);
});
