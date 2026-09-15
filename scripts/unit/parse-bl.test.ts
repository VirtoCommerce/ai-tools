// Unit tests for scripts/knowledge/lint-bl.ts — the deterministic BL-oracle
// parser + structural linter behind /qa-review-bl. Pure functions only
// (parseOracle / lint); no file I/O, no CLI (main() guards on isCli).
// Run: `npx tsx --test scripts/unit/parse-bl.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOracle, lint, extractReferencedBlIds, BLC_002_BASELINE } from "../knowledge/lint-bl.ts";

const ORACLE = `---
applicability: reference
---
# Business Logic Invariants

### Severity Tags
| Tag | Meaning |
|-----|---------|

## Domain 1: Pricing & Discounts (BL-PRICE)

### BL-PRICE-001: Discount stacking order \`[P0-revenue]\`
- **Rule:** Discounts apply in order.
- **Verify:** cart total reflects it.
- **Violation signal:** total too high.
- **Agents:** qa-frontend-expert

### BL-PRICE-003: Rounding \`[P0-revenue]\`
- **Rule:** Round half-up.
- **Verify:** two decimals.
- **Violation signal:** 3 decimals shown.
- **Agents:** ui-ux-expert

## Domain 6: B2B / Organization (BL-B2B)

### BL-B2B-001: Org switching isolates cart \`[P0-revenue]\`
- **Rule:** Each org has its own cart.
- **Verify:** switch org, cart differs.
- **Violation signal:** items leak across orgs.
- **Agents:** qa-frontend-expert

### BL-AUTH-007: Logout UX \`[P1-ux]\` \`[GOLDEN RULE]\`
- **Rule:** Popup only.
- **Verify:** no full page.
- **Violation signal:** navigates away.
- **Agents:** qa-frontend-expert
`;

const emptyCoverage = () => ({ byBl: new Map<string, string[]>(), referenced: new Set<string>() });

// ---- parseOracle ------------------------------------------------------------

test("parses every ### BL-* entry including a digit-in-domain id (BL-B2B)", () => {
  const inv = parseOracle(ORACLE);
  const ids = inv.map((i) => i.id);
  assert.deepEqual(ids, ["BL-PRICE-001", "BL-PRICE-003", "BL-B2B-001", "BL-AUTH-007"]);
  const b2b = inv.find((i) => i.id === "BL-B2B-001")!;
  assert.equal(b2b.domainPrefix, "BL-B2B");
  assert.equal(b2b.seq, 1);
});

test("extracts fields, severity, and clean title", () => {
  const price = parseOracle(ORACLE).find((i) => i.id === "BL-PRICE-001")!;
  assert.equal(price.severity, "P0-revenue");
  assert.equal(price.title, "Discount stacking order");
  assert.match(price.fields["Rule"], /Discounts apply/);
  assert.match(price.fields["Agents"], /qa-frontend-expert/);
});

test("picks the valid severity tag when a heading carries two bracket tags", () => {
  const auth = parseOracle(ORACLE).find((i) => i.id === "BL-AUTH-007")!;
  assert.equal(auth.severity, "P1-ux"); // not the trailing `[GOLDEN RULE]`
  assert.equal(auth.title, "Logout UX");
});

test("records the domain heading each entry sits under", () => {
  const price = parseOracle(ORACLE).find((i) => i.id === "BL-PRICE-001")!;
  assert.match(price.domain, /Domain 1: Pricing/);
});

// ---- lint -------------------------------------------------------------------

test("BLL-004 flags an entry whose prefix isn't declared by its domain heading", () => {
  // BL-AUTH-007 sits under the "Domain 6: B2B (BL-B2B)" heading in ORACLE.
  const findings = lint(parseOracle(ORACLE), emptyCoverage());
  const f = findings.find((x) => x.rule === "BLL-004" && x.id === "BL-AUTH-007");
  assert.ok(f, "expected BLL-004 for the misfiled BL-AUTH-007");
  assert.equal(f!.severity, "Medium");
});

test("BLL-001 Blocker on a duplicate BL id", () => {
  const dup = ORACLE + `\n### BL-PRICE-001: Dupe \`[P1-data]\`\n- **Rule:** x\n- **Verify:** x\n- **Violation signal:** x\n- **Agents:** x\n`;
  const findings = lint(parseOracle(dup), emptyCoverage());
  const f = findings.find((x) => x.rule === "BLL-001");
  assert.ok(f);
  assert.equal(f!.severity, "Blocker");
});

test("BLL-002 High when the severity tag is missing/malformed", () => {
  const noTag = ORACLE + `\n## Domain 9: Search (BL-SRCH)\n\n### BL-SRCH-001: No tag here\n- **Rule:** x\n- **Verify:** x\n- **Violation signal:** x\n- **Agents:** x\n`;
  const findings = lint(parseOracle(noTag), emptyCoverage());
  assert.ok(findings.some((x) => x.rule === "BLL-002" && x.id === "BL-SRCH-001" && x.severity === "High"));
});

test("BLL-003 High for a missing required field; qualified names still count", () => {
  const qualified = `## Domain 14: Profile (BL-PROFILE)

### BL-PROFILE-001: Dedup \`[P1-data]\`
- **Rule (write path — updateMemberAddresses):** dedup by key fields.
- **Verify (write path):** totalCount unchanged.
- **Violation signal:** duplicate row appears.
- **Agents:** qa-backend-expert
`;
  const findings = lint(parseOracle(qualified), emptyCoverage());
  // "Rule (write path…)" and "Verify (write path)" must satisfy the Rule/Verify requirement…
  assert.ok(!findings.some((x) => x.rule === "BLL-003"), "qualified field names should satisfy required-field check");
});

test("BLC-004 Medium for an uncovered P0/P1 invariant; Informational for P2", () => {
  const withP2 = ORACLE + `\n## Domain 15: UI (BL-UI)\n\n### BL-UI-001: Cosmetic \`[P2-ux]\`\n- **Rule:** x\n- **Verify:** x\n- **Violation signal:** x\n- **Agents:** ui-ux-expert\n`;
  const findings = lint(parseOracle(withP2), emptyCoverage());
  const p0 = findings.find((x) => x.rule === "BLC-004" && x.id === "BL-PRICE-001");
  const p2 = findings.find((x) => x.rule === "BLC-004" && x.id === "BL-UI-001");
  assert.equal(p0!.severity, "Medium");
  assert.equal(p2!.severity, "Informational");
});

test("BLC-002 High for a NEW dangling cite, and a real invariant stays clean", () => {
  // buildCoverage always keeps byBl and referenced consistent: every referenced id
  // has a byBl entry. BL-PRICE-001 is covered (by TC-002); BL-GHOST-001 is a ghost ref.
  //
  // BL-GHOST-001 is NOT in BLC_002_BASELINE, so it is new drift and reported High — the
  // ratchet added 2026-09-14. Medium is now reserved for the baselined backlog (below).
  const coverage = {
    byBl: new Map([["BL-GHOST-001", ["TC-001"]], ["BL-PRICE-001", ["TC-002"]]]),
    referenced: new Set(["BL-GHOST-001", "BL-PRICE-001"]),
  };
  const findings = lint(parseOracle(ORACLE), coverage);
  const ghost = findings.find((x) => x.rule === "BLC-002" && x.id === "BL-GHOST-001");
  assert.ok(ghost, "expected BLC-002 for the ghost reference");
  assert.equal(ghost!.severity, "High", "an id absent from BLC_002_BASELINE is NEW drift");
  // a real, referenced invariant must NOT produce BLC-002 or BLC-004
  assert.ok(!findings.some((x) => x.rule === "BLC-002" && x.id === "BL-PRICE-001"));
  assert.ok(!findings.some((x) => x.rule === "BLC-004" && x.id === "BL-PRICE-001"));
});

// The ratchet's other two arms. Driven off BLC_002_BASELINE itself rather than a
// transcribed id, so burning the backlog down to empty skips this test instead of
// breaking it (the baseline is meant to reach zero).
test("BLC-002 stays Medium at a baselined count and goes High when it grows", (t) => {
  const entry = Object.entries(BLC_002_BASELINE)[0];
  if (!entry) return t.skip("BLC_002_BASELINE is empty — the backlog is burned down");
  const [id, allowed] = entry;

  const at = Array.from({ length: allowed }, (_, i) => `TC-AT-${i}`);
  const atBaseline = lint(parseOracle(ORACLE), {
    byBl: new Map([[id, at]]),
    referenced: new Set([id]),
  }).find((x) => x.rule === "BLC-002" && x.id === id);
  assert.ok(atBaseline, `expected BLC-002 for the baselined ${id}`);
  assert.equal(atBaseline!.severity, "Medium", "pre-existing drift at its baselined count is Medium");

  const grown = lint(parseOracle(ORACLE), {
    byBl: new Map([[id, [...at, "TC-GREW"]]]),
    referenced: new Set([id]),
  }).find((x) => x.rule === "BLC-002" && x.id === id);
  assert.equal(grown!.severity, "High", "a baselined id may never grow");
});

test("extractReferencedBlIds skips PROPOSED- forward-refs but keeps bare cites (BLC-002 false-positive fix)", () => {
  // A cell mixing a real cite, a bare ghost cite, and a PROPOSED- forward-reference.
  const ids = extractReferencedBlIds("BL-PRICE-001; BL-GHOST-002; PROPOSED-BL-ORD-011");
  assert.deepEqual(ids, ["BL-PRICE-001", "BL-GHOST-002"], "PROPOSED-BL-ORD-011 must be excluded; bare cites kept");

  // The same bare id IS captured when it appears without the PROPOSED- prefix elsewhere,
  // so a genuine bare false-traceability cite still surfaces even if a PROPOSED- form also exists.
  assert.deepEqual(
    extractReferencedBlIds("PROPOSED-BL-SEC-001; BL-SEC-001"),
    ["BL-SEC-001"],
    "the bare BL-SEC-001 is kept; only the PROPOSED- form is skipped",
  );

  // Suffixed ids (e.g. BL-CFG-058A) and the prefix guard both hold.
  assert.deepEqual(extractReferencedBlIds("PROPOSED-BL-CART-015"), []);
});
