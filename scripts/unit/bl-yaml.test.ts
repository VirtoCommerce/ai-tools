// Unit tests for scripts/knowledge/bl-yaml.ts — BL 2.0 migration stage M1 (the md ⇄ YAML converter).
//
// Everything tested here is a DERIVATION: records computed from prose, prose re-rendered from records.
// The first three tests run over the real oracle rather than a fixture, because a fixture cannot catch
// the oracle growing an entry shape the converter mishandles. The comparator gets its own test with a
// deliberately broken render: a round trip that compares a text with itself would pass on any converter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { parseOracle } from "../knowledge/lint-bl.ts";
import { BL_PATH, sliceOracle } from "../knowledge/extract-bl.ts";
import {
  checkOracle,
  classifySource,
  compareOracles,
  convertOracle,
  fromYaml,
  readAgentRoster,
  readMigrated,
  renderDomain,
  renderOracle,
  roundTrip,
  schemaValidator,
  toYaml,
  type BlDomainFile,
  type BlRule,
} from "../knowledge/bl-yaml.ts";

const text = readFileSync(BL_PATH, "utf-8");
const roster = readAgentRoster();
const domains = convertOracle(text, roster);
const parsed = parseOracle(text);
const validate = schemaValidator();

test("the real oracle passes the --check gate: migrated sections match their YAML, the rest round-trip", () => {
  assert.deepEqual(checkOracle(text, roster, readMigrated(), validate), []);
});

test("the rendered markdown still has every field bl:lint requires", () => {
  const rendered = domains.map((d) => renderDomain(d.file)).join("\n");
  const invs = parseOracle(rendered);
  assert.equal(invs.length, parsed.length);
  for (const inv of invs) {
    for (const req of ["Rule", "Verify", "Violation signal", "Agents"]) {
      assert.ok(inv.fields[req] !== undefined, `${inv.id} lost **${req}**`);
    }
    assert.ok(inv.severity, `${inv.id} lost its severity tag`);
  }
});

test("no line of an entry is dropped silently: each lands in a record field or in its leftover", () => {
  const rules = new Map<string, BlRule>();
  const hist = new Map<string, string>();
  for (const d of domains) {
    for (const r of d.file.rules) rules.set(r.id, r);
    for (const h of d.leftover) hist.set(h.id, h.text);
  }
  for (const s of sliceOracle(text)) {
    const r = rules.get(s.id)!;
    const hay = [r.title, `\`[${r.priority}]\``, r.rule, r.check.ref ?? "", r.violation_signal, ...r.source.map((x) => x.ref), hist.get(s.id) ?? ""].join("\n");
    // The heading too: every word of its title, severity tag and note must land somewhere.
    const tail = s.markdown.split("\n")[0].replace(/\r$/, "").replace(/^###\s+BL-[A-Z0-9]+-\d+[A-Z]?\s*:\s*/, "");
    for (const word of tail.split(/\s+/).filter(Boolean)) assert.ok(hay.includes(word), `${s.id}: heading word not carried over: ${word}`);
    for (const raw of s.markdown.split("\n").slice(1)) {
      const line = raw.replace(/\r$/, "");
      if (!line.trim() || line.trim() === "---") continue;
      const content = line.replace(/^- \*\*.+?:\*\*\s?/, "");
      assert.ok(hay.includes(content), `${s.id}: line not carried over: ${line.slice(0, 100)}`);
    }
  }
});

test("the comparator catches a changed rule text, a dropped rule and a changed severity", () => {
  const cart = domains.find((d) => d.slug === "cart")!.file;
  const good = renderDomain(cart);
  const [first, second, ...rest] = cart.rules;
  const reworded: BlDomainFile = { ...cart, rules: [{ ...first, rule: first.rule + " Also." }, second, ...rest] };
  const dropped: BlDomainFile = { ...cart, rules: [first, ...rest] };
  const regraded: BlDomainFile = { ...cart, rules: [{ ...first, priority: first.priority === "P2-ux" ? "P1-ux" : "P2-ux" }, second, ...rest] };
  assert.deepEqual(compareOracles(good, good), []);
  assert.match(compareOracles(good, renderDomain(reworded)).join("\n"), new RegExp(`${first.id}: Rule text differs`));
  assert.match(compareOracles(good, renderDomain(dropped)).join("\n"), /ids or their order differ/);
  assert.match(compareOracles(good, renderDomain(regraded)).join("\n"), new RegExp(`${first.id}: severity`));
});

const FIXTURE = `## Domain 1: Things (BL-THING)

Prose about the domain.

### BL-THING-001: A → B holds \`[P0-revenue]\` → superseded by BL-THING-002
- **Rule (write path — \`save\`):** Writes keep A.
  - including drafts
- **Rule (read path — \`load\`):** Reads return A.
- **Verify:** Save, then load.
- **Violation signal:** Load returns B.
- **Agents:** qa-backend-expert (API), qa-frontend-expert (UI)
- **Docs:** N/A — not documented
- **Source:** vc-module-thing \`ThingService.cs\`
- **Promoted:** 2026-07-01
---
`;

test("a qualified Rule pair, a heading note, a no-doc Docs line and dropped fields convert as designed", () => {
  const [d] = convertOracle(FIXTURE, roster);
  assert.equal(d.slug, "thing");
  assert.equal(d.file.domain.intro, "Prose about the domain.");
  assert.deepEqual(d.file.domain.agents, ["qa-backend-expert", "qa-frontend-expert"]);
  const [r] = d.file.rules;
  assert.equal(r.title, "A → B holds");
  assert.equal(r.priority, "P0-revenue");
  assert.equal(r.rule, "(write path — `save`) Writes keep A.\n  - including drafts\n(read path — `load`) Reads return A.");
  assert.deepEqual(r.check, { kind: "manual", ref: "Save, then load." });
  assert.deepEqual(r.source, [{ kind: "code", ref: "vc-module-thing `ThingService.cs`" }]);
  assert.equal(r.trust, "UNREVIEWED");
  assert.equal("history" in r, false);
  const h = d.leftover[0].text;
  for (const kept of ["superseded by BL-THING-002", "qa-backend-expert (API)", "N/A — not documented", "**Promoted:** 2026-07-01"]) {
    assert.ok(h.includes(kept), `leftover lost: ${kept}`);
  }
  assert.deepEqual(compareOracles(FIXTURE, renderDomain(fromYaml(toYaml(d.file)))), []);
});

const EDGES = `## Domain 1: Things (BL-THING)

### BL-THING-001: Foo \`[DEPRECATED]\`
- **Rule:** A.
- **Verify:** B.
- **Violation signal:** C.
- **Agents:** qa-backend-expert

### BL-THING-002: Bar \`[P1-data]\` (amended 2026-10-01)
- **Rule:** A.
- **Verify:** B.
- **Violation signal:** C.
- **Source (read-side anchor, re-read 2026-09-14):** \`ThingController.cs\`

### Note
- **Aside:** belongs to no rule.
`;

test("no severity tag, a note after the tag, a qualified Source and a ### Note are kept and round-trip", () => {
  const [d] = convertOracle(EDGES, roster);
  const [untagged, noted] = d.file.rules;
  const hist = (id: string) => d.leftover.find((h) => h.id === id)?.text ?? "";
  assert.equal(untagged.title, "Foo");
  assert.equal(untagged.priority, "");
  assert.match(hist(untagged.id), /Heading note:\*\* `\[DEPRECATED\]`/);
  assert.equal(noted.title, "Bar");
  assert.match(hist(noted.id), /Heading note:\*\* \(amended 2026-10-01\)/);
  assert.deepEqual(noted.source, [{ kind: "code", ref: "(read-side anchor, re-read 2026-09-14) `ThingController.cs`" }]);
  assert.match(d.file.domain.intro ?? "", /### Note\n- \*\*Aside:\*\* belongs to no rule\./);
  assert.ok(!hist(noted.id).includes("Aside"), "the ### Note leaked into the rule above it");
  // The note after the tag is not a title change; the missing severity is a schema problem, not a crash.
  const problems = roundTrip([d], EDGES, validate);
  assert.ok(!problems.some((p) => /title|text differs/.test(p)), problems.join("\n"));
  assert.ok(problems.some((p) => /schema/.test(p)), problems.join("\n"));
});

test("sources are classified by their wording", () => {
  assert.equal(classifySource("VCST-1234 AC #2"), "ac");
  // The real BL-SR-014 shape: "access" is not "AC", so a code-only source stays code.
  assert.equal(classifySource("`SalesRepController.cs`, `ModuleConstants.cs` (sales-rep:access). VCST-5293."), "code");
  assert.equal(classifySource("VCST-1 the account is active"), "other");
  assert.equal(classifySource("vc-frontend `useCart.ts`"), "code");
  assert.equal(classifySource("live 2026-09-01 on vcst"), "live");
  assert.equal(classifySource("team decision"), "other");
});

test("the schema refuses DECLARED without a human source and SUSPECT without a reason", () => {
  const base = domains.find((d) => d.file.rules.length)!.file;
  const one = (r: Partial<BlRule>): BlDomainFile => ({ ...base, rules: [{ ...base.rules[0], ...r }] });
  assert.ok(validate(one({})), JSON.stringify(validate.errors));
  assert.equal(validate(one({ trust: "DECLARED", source: [{ kind: "code", ref: "x.cs" }] })), false);
  assert.ok(validate(one({ trust: "DECLARED", source: [{ kind: "ac", ref: "VCST-1" }] })));
  assert.equal(validate(one({ status: "SUSPECT" })), false);
  assert.ok(validate(one({ status: "SUSPECT", suspect_reason: "PR #1 changed code_ref" })));
  assert.equal(validate(one({ check: { kind: "executable" } })), false);
});

const TWO_DOMAINS = [
  "# Oracle",
  "",
  "## Domain 1: One (BL-ONE)",
  "",
  "### BL-ONE-001: First `[P1-data]`",
  "- **Rule:** One holds.",
  "- **Verify:** Look.",
  "- **Violation signal:** It does not.",
  "- **Agents:** qa-backend-expert",
  "",
  "---",
  "",
  "## Domain 2: Two (BL-TWO)",
  "",
  "### BL-TWO-001: Second `[P2-ux]`",
  "- **Rule:** Two holds.",
  "- **Verify:** Look.",
  "- **Violation signal:** It does not.",
  "- **Agents:** qa-frontend-expert",
  "",
].join("\n");

test("renderOracle regenerates only the migrated section and keeps separators and line endings", () => {
  const [one] = convertOracle(TWO_DOMAINS, roster);
  const owned: BlDomainFile = { ...one.file, rules: [{ ...one.file.rules[0], trust: "INFERRED" }] };
  const out = renderOracle(TWO_DOMAINS, [owned]).text;
  assert.match(out, /- \*\*Trust:\*\* INFERRED/);
  assert.ok(out.includes("\n---\n\n## Domain 2: Two (BL-TWO)\n\n### BL-TWO-001: Second `[P2-ux]`\n- **Rule:** Two holds."), "domain 2 or the separator changed");
  assert.equal(renderOracle(out, [owned]).text, out, "rendering is idempotent");
  const crlf = TWO_DOMAINS.split("\n").join("\r\n");
  assert.equal(renderOracle(crlf, [owned]).text, out.split("\n").join("\r\n"));
  assert.deepEqual(renderOracle(TWO_DOMAINS, [{ ...owned, domain: { ...owned.domain, heading: "Domain 9: Gone (BL-GONE)" } }]).missing, ["Domain 9: Gone (BL-GONE)"]);
});

test("checkOracle fails a hand edit to a migrated section and an invalid YAML record", () => {
  const [one] = convertOracle(TWO_DOMAINS, roster);
  const owned = new Map([["one", { ...one.file, rules: [{ ...one.file.rules[0], trust: "INFERRED" as const }] }]]);
  const current = renderOracle(TWO_DOMAINS, owned.values()).text;
  assert.deepEqual(checkOracle(current, roster, owned, validate), []);
  assert.match(checkOracle(current.replace("One holds.", "One holds, edited by hand."), roster, owned, validate).join("\n"), /section of one is not the render of its YAML/);
  const bad = new Map([["one", { ...owned.get("one")!, rules: [{ ...owned.get("one")!.rules[0], trust: "DECLARED" as const, source: [] }] }]]);
  assert.match(checkOracle(renderOracle(TWO_DOMAINS, bad.values()).text, roster, bad, validate).join("\n"), /bl\/one\.yaml: schema/);
});
