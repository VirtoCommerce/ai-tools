// Unit tests for scripts/knowledge/bl-yaml.ts — BL 2.0: the YAML records are the oracle's only source and
// business-logic.md is their render (M4).
//
// Everything tested here is a DERIVATION: markdown and a coverage table computed from records, and gate
// verdicts computed from both. The first tests run over the real oracle, because a fixture cannot catch a
// record shape the renderer mishandles; the gate tests break one thing at a time, because a gate that
// compares a text with itself passes on any renderer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseOracle } from "../knowledge/lint-bl.ts";
import {
  BL_PATH,
  checkBl,
  fromYaml,
  loadBl,
  oracleText,
  readAgentRoster,
  renderBl,
  renderSummary,
  schemaValidator,
  toYaml,
  type BlDomainFile,
  type BlOracle,
  type BlRule,
} from "../knowledge/bl-yaml.ts";

const oracle = loadBl();
const roster = readAgentRoster();
const validate = schemaValidator();

test("the real oracle passes the --check gate: valid YAML, a clean index, and business-logic.md is its render", () => {
  const view = existsSync(BL_PATH) ? readFileSync(BL_PATH, "utf-8") : null;
  assert.deepEqual(checkBl(oracle, view, roster, validate), []);
});

test("the render shows bl:lint every record once, in index order, with the fields it requires", () => {
  const records = oracle.domains.flatMap((d) => d.file.rules.map((r) => ({ ...r, heading: d.file.domain.heading })));
  const invs = parseOracle(oracleText());
  assert.deepEqual(invs.map((i) => i.id), records.map((r) => r.id));
  for (const [i, inv] of invs.entries()) {
    assert.equal(inv.domain, records[i].heading, `${inv.id}: domain`);
    assert.equal(inv.severity, records[i].priority, `${inv.id}: severity`);
    for (const req of ["Rule", "Verify", "Violation signal", "Agents", "Trust"]) assert.ok(inv.fields[req] !== undefined, `${inv.id} lost **${req}**`);
  }
});

test("every record survives YAML serialisation unchanged", () => {
  for (const { slug, file } of oracle.domains) assert.deepEqual(fromYaml(toYaml(file)), file, slug);
});

test("the schema refuses DECLARED without a human source and SUSPECT without a reason", () => {
  const base = oracle.domains.find((d) => d.file.rules.length)!.file;
  const one = (r: Partial<BlRule>): BlDomainFile => ({ ...base, rules: [{ ...base.rules[0], trust: "INFERRED", status: "ACTIVE", suspect_reason: undefined, ...r }] });
  assert.ok(validate(one({})), JSON.stringify(validate.errors));
  assert.equal(validate(one({ trust: "DECLARED", source: [{ kind: "code", ref: "x.cs" }] })), false);
  assert.ok(validate(one({ trust: "DECLARED", source: [{ kind: "ac", ref: "VCST-1" }] })));
  assert.equal(validate(one({ status: "SUSPECT" })), false);
  assert.ok(validate(one({ status: "SUSPECT", suspect_reason: "PR #1 changed code_ref" })));
  assert.equal(validate(one({ check: { kind: "executable" } })), false);
});

const rule = (id: string, priority: string, extra: Partial<BlRule> = {}): BlRule => ({
  id,
  title: `Title ${id}`,
  rule: `${id} holds.`,
  priority,
  trust: "INFERRED",
  source: [],
  check: { kind: "manual", ref: "Look." },
  violation_signal: "It does not.",
  status: "ACTIVE",
  ...extra,
});

const ONE: BlDomainFile = {
  domain: { heading: "Domain 1: One (BL-ONE)", prefixes: ["BL-ONE"], agents: ["qa-backend-expert"] },
  rules: [
    rule("BL-ONE-001", "P0-revenue", { trust: "DECLARED", source: [{ kind: "ac", ref: "VCST-1 AC #1" }] }),
    rule("BL-ONE-003", "P1-data", { status: "SUSPECT", suspect_reason: "VCST-2 disputes it" }),
  ],
};
const TWO: BlDomainFile = {
  domain: { heading: "Domain 2: Two (BL-TWO)", prefixes: ["BL-TWO"], agents: ["qa-frontend-expert"], intro: "About two." },
  rules: [rule("BL-TWO-001", "P2-ux", { check: { kind: "executable", ref: "scripts/invariants/x.ts", steps: "By hand." } })],
};
const EMPTY: BlDomainFile = { domain: { heading: "Domain 3: Empty (BL-EMPTY)", prefixes: ["BL-EMPTY"], agents: [] }, rules: [] };
const fixture = (domains = [ONE, TWO, EMPTY]): BlOracle => ({
  preamble: "# Oracle\n\nRead me.\n",
  domains: domains.map((file, i) => ({ slug: ["one", "two", "empty"][i], file })),
  problems: [],
});

test("the coverage table is counted from the records, an empty domain included", () => {
  const table = renderSummary(fixture().domains);
  assert.match(table, /\| One \| BL-ONE-001–003 \| 2 \| 1 \| 1 \| 0 \| 1 \| 1 \|/);
  assert.match(table, /\| Two \| BL-TWO-001 \| 1 \| 0 \| 0 \| 1 \| 0 \| 0 \|/);
  assert.match(table, /\| Empty \| — \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \|/);
  assert.match(table, /\| \*\*Total\*\* \| \| \*\*3\*\* \| \*\*1\*\* \| \*\*1\*\* \| \*\*1\*\* \| \*\*1\*\* \| \*\*1\*\* \|/);
});

test("the whole render puts the preamble, each domain in order and the table between --- separators", () => {
  const text = renderBl(fixture());
  const heads = [...text.matchAll(/^#{1,2} .*$/gm)].map((m) => m[0]);
  assert.deepEqual(heads, ["# Oracle", "## Domain 1: One (BL-ONE)", "## Domain 2: Two (BL-TWO)", "## Domain 3: Empty (BL-EMPTY)", "## Invariant Coverage Summary"]);
  assert.equal(text.split("\n\n---\n\n").length, 5);
  assert.match(text, /- \*\*Verify:\*\* Executable check: `scripts\/invariants\/x\.ts`\. By hand: By hand\./);
  assert.match(text, /- \*\*Lifecycle:\*\* SUSPECT — VCST-2 disputes it/);
});

test("the gate fails a hand edit, a missing view, an invalid record, a duplicate id and an unknown agent", () => {
  const good = fixture();
  const view = renderBl(good);
  assert.deepEqual(checkBl(good, view, roster, validate), []);
  assert.deepEqual(checkBl(good, view.replace(/\n/g, "\r\n"), roster, validate), [], "CRLF on checkout is not an edit");
  assert.match(checkBl(good, view.replace("BL-ONE-001 holds.", "BL-ONE-001 holds, edited by hand."), roster, validate).join("\n"), /is not the render/);
  assert.match(checkBl(good, null, roster, validate).join("\n"), /is missing/);
  const bad = fixture([{ ...ONE, rules: [{ ...ONE.rules[0], priority: "P9" }] }, TWO, EMPTY]);
  assert.match(checkBl(bad, renderBl(bad), roster, validate).join("\n"), /bl\/one\.yaml: schema/);
  const dupe = fixture([ONE, { ...TWO, rules: [ONE.rules[0]] }, EMPTY]);
  assert.match(checkBl(dupe, renderBl(dupe), roster, validate).join("\n"), /BL-ONE-001 is in both bl\/one\.yaml and bl\/two\.yaml/);
  const stranger = fixture([{ ...ONE, domain: { ...ONE.domain, agents: ["no-such-agent"] } }, TWO, EMPTY]);
  assert.match(checkBl(stranger, renderBl(stranger), roster, validate).join("\n"), /agents not on the roster: no-such-agent/);
});

test("the index must list every domain file exactly once", () => {
  const dir = mkdtempSync(join(tmpdir(), "bl-index-"));
  writeFileSync(join(dir, "one.yaml"), toYaml(ONE));
  writeFileSync(join(dir, "two.yaml"), toYaml(TWO));
  writeFileSync(join(dir, "_oracle.yaml"), "preamble: |\n  # Oracle\ndomains:\n  - two\n  - gone\n  - two\n");
  const loaded = loadBl(dir);
  assert.deepEqual(loaded.domains.map((d) => d.slug), ["two", "one"], "listed first, then the unlisted file");
  assert.equal(loaded.preamble, "# Oracle\n");
  const problems = loaded.problems.join("\n");
  assert.match(problems, /lists "gone" but there is no bl\/gone\.yaml/);
  assert.match(problems, /lists two more than once/);
  assert.match(problems, /bl\/one\.yaml is not listed/);
});
