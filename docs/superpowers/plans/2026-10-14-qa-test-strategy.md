# /qa-test-strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone `/qa-test-strategy <TICKET>` that gathers the context with `/ticket-context`, computes the floors F1–F11 by script, writes `test-strategy.md`, checks it with a script gate, asks the user to approve it once, and stops — the strategy step the single `/qa-test` will call later.

**Architecture:** The prototype's method (closed PR #416, branch `claude/test-strategy-step` @ `f2140a85`) is taken over almost as written: `SKILL.md`, `floors.md`, `rounds.md` and the template. What changes is where determinism lives. Two scripts in the skill's `lib/` do what the prototype left to the model: `floors.mjs` reads the bundle and says which floors fired and why (R2: "a gate rule, never a model judgment"), and `check-strategy.mjs` checks the written file against the bundle and the floors. The model still chooses risks, techniques and oracles — the part that needs judgment. The bundle gains the ticket's own fields first, because F1 reads the priority and F7 the type.

**Tech Stack:** Node ESM (`node:` built-ins only), Markdown prompts, `node --test` for temporary tests.

**Specs:**
- [`docs/superpowers/specs/2026-10-09-qa-test-strategy-redesign.md`](../specs/2026-10-09-qa-test-strategy-redesign.md) — §6 (strategy, floors F1–F9, rounds, method rules, approval), §9 (D1–D12). The strategy's integration into `/qa-test` (§4 steps 0, 3–5, §7) is the **next** plan, not this one.
- [`docs/superpowers/specs/2026-10-09-qa-test-model-redesign.md`](../specs/2026-10-09-qa-test-model-redesign.md) — §6 row 1 only: F10, F11, the M1 guard, `MODEL` as a technique token, the stand's setting values in Inputs. The `/qa-test-model` changes (§4, §6 rows 2–6) are a later plan.
- [`docs/superpowers/specs/2026-10-08-ticket-context-design.md`](../specs/2026-10-08-ticket-context-design.md) — the bundle the strategy reads.

## Global Constraints

- **BUDGET-004:** `SKILL.md` and every command/agent ≤ 19,000 chars (`npm run context:check`); `agents/qa-lead-orchestrator.md` is over the cap with a shrink-only baseline — any edit to it is net-shrink.
- **NO CODE ⇒ NO UNIT TEST; code ⇒ a TEMPORARY unit test, deleted before commit.** No new `scripts/unit/` file is committed.
- **The orchestrator writes the strategy inline — never a subagent** (spec §6 "Who chooses"). Scripts compute signals and check the file; they never choose a risk or a technique.
- **Floors may be added to, never gone under; F9 resolves doubt upward** (spec §6). A script that cannot read a signal reports the floor **fired** with `doubt: <what was missing>`.
- **One file per ticket, one `## Round N` section per round, ≤ 120 lines per section** (D7, D9).
- **Every strategy is approved by the user; `--yes` is the only way past the question; no human and no `--yes` ⇒ STOP with the file as output** (D4).
- **At most three rounds; a fourth is refused before any work** (D6).
- **No case authoring, no tracker write, no status transition** in this skill (D2; the tracker comment belongs to the run's close-out).
- **The bundle is never copied, never edited** (ticket-context S3); the strategy cites its path.
- **Prompt files cite, never restate** (`CLAUDE.md` §Where the rules live).

## Review Focus

1. **A ticket with no PR found** (`change.prs` has no product PR) — F3, F5, F8, F10, F11 have no diff to read. They must come out **not fired with `signal: "no product PR"`** only when the bundle's `change` gap is `not-found`; when it is `no-credential`/`access-denied`/`unreadable` the diff was never read, so they fire as `doubt` (F9). (Task 2 test.)
2. **`DEPLOYMENT UNKNOWN` vs `NOT DEPLOYED`** — F6 fires only on a `NOT DEPLOYED:` blocker line; `UNKNOWN` enters as "deployment unverified". (Task 2 test.)
3. **A blanket `cases_at_risk`** — `known.cases_at_risk` can list 30+ suites from a repo-wide `regression:select` (VCST-5097: 33, of which 3 mattered). F5 then fires on nearly every storefront ticket; the strategy narrows it through the staleness check and the Artifacts row. Measured in Task 5, not fixed here.
4. **A strategy that names a risk but no approach row for it, or an approach row for a risk it does not register** — both must fail the gate. (Task 3 test.)
5. **A round section over 120 lines in a file that holds two rounds** — the cap is per section, so the checker must count only the current round's lines. (Task 3 test.)

---

### Task 1: The bundle carries the ticket's own fields

The floors need the priority (F1) and the type (F2, F7); the approval question shows the summary. The bundle has none of them today, and `ticket.json` is deleted with the run dir.

**Files:**
- Modify: `.claude/skills/ticket-context/lib/fetch.mjs` (add `fieldText` to `CAPS`)
- Modify: `.claude/skills/ticket-context/lib/jira.mjs:6-7` (add `priority` to `BASE_FIELDS`)
- Modify: `.claude/skills/ticket-context/lib/inventory.mjs` (add `adfText`, `ticketFields`)
- Modify: `.claude/skills/ticket-context/lib/cli.mjs` (prepare writes `fields`)
- Modify: `.claude/skills/ticket-context/lib/compose.mjs` (bundle gains `fields`)
- Modify: `.claude/skills/ticket-context/bundle.schema.json` (`$defs.fields`, `bundle.required`, `bundle.properties`)
- Modify: `.claude/skills/ticket-context/SKILL.md` (one phrase in `description:`)
- Temporary: `scripts/unit/ticket-context-fields.test.mjs` — deleted before commit

**Interfaces:**
- Produces: `adfText(node) → string`; `ticketFields(issue, acFieldIds: string[]) → { fields, gaps }`; `bundle.fields = { summary: string, type: string|null, status: string|null, priority: string|null, components: string[], labels: string[], fix_versions: string[], description: string, acceptance: string }`; `CAPS.fieldText = 20000`.

- [ ] **Step 1: Write the temporary failing test**

```js
// scripts/unit/ticket-context-fields.test.mjs — TEMPORARY, delete before commit
import { test } from "node:test";
import assert from "node:assert/strict";
import { adfText, ticketFields } from "../../.claude/skills/ticket-context/lib/inventory.mjs";
import { CAPS } from "../../.claude/skills/ticket-context/lib/fetch.mjs";

const adf = (...paras) => ({ type: "doc", content: paras.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })) });

test("adfText: text joined, a newline per block, a mention is not a name", () => {
  const doc = { type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Hello " }, { type: "mention", attrs: { text: "@Jane Doe" } }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }] },
  ] };
  assert.equal(adfText(doc), "Hello @mention\none\n\n");
  assert.equal(adfText(null), "");
  assert.equal(adfText("plain"), "plain");
});

test("ticketFields reads an ADF and a plain-string AC field", () => {
  const issue = { fields: { summary: "S", issuetype: { name: "Story" }, status: { name: "In QA" }, priority: { name: "High" },
    components: [{ name: "Cart" }], labels: ["x"], fixVersions: [{ name: "3.1" }], description: adf("Desc"),
    customfield_1: adf("AC one"), customfield_2: "AC two" } };
  const { fields, gaps } = ticketFields(issue, ["customfield_1", "customfield_2"]);
  assert.deepEqual(fields, { summary: "S", type: "Story", status: "In QA", priority: "High", components: ["Cart"], labels: ["x"],
    fix_versions: ["3.1"], description: "Desc", acceptance: "AC one\n\nAC two" });
  assert.deepEqual(gaps, []);
});

test("an empty ticket: empty strings and nulls, never undefined", () => {
  assert.deepEqual(ticketFields({ fields: {} }, []).fields, { summary: "", type: null, status: null, priority: null,
    components: [], labels: [], fix_versions: [], description: "", acceptance: "" });
});

test("a description over the cap is cut with an over-cap gap", () => {
  const { fields, gaps } = ticketFields({ fields: { description: "x".repeat(CAPS.fieldText + 5) } }, []);
  assert.equal(fields.description.length, CAPS.fieldText);
  assert.deepEqual(gaps.map((g) => [g.where, g.reason]), [["fields.description", "over-cap"]]);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test scripts/unit/ticket-context-fields.test.mjs`
Expected: FAIL — `adfText` is not exported.

- [ ] **Step 3: Implement**

`lib/fetch.mjs`, inside `CAPS` after `comments: 500, commentPage: 100,`:

```js
  fieldText: 20000, // chars kept of the description and of the AC-field text in the bundle's `fields`; the rest is an over-cap gap
```

`lib/jira.mjs`:

```js
export const BASE_FIELDS = Object.freeze(["summary", "description", "comment", "status", "issuetype", "priority", "labels", "components",
  "attachment", "issuelinks", "parent", "subtasks", "updated", "fixVersions"]);
```

`lib/inventory.mjs`: add `import { CAPS } from "./fetch.mjs";` under the existing imports, then append:

```js
// The ticket's own fields, for consumers that need the story as written and for the strategy's floors
// (priority → F1, type → F2/F7). ticket.json is deleted with the run dir, so the bundle carries them. Plain
// text only; untrusted data (S1).
const ADF_BLOCKS = new Set(["paragraph", "heading", "listItem", "blockquote", "codeBlock", "rule", "tableRow", "panel"]);
export function adfText(node) {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "mention") return "@mention"; // a person's name is not testing context
  const inner = (node.content ?? []).map(adfText).join(node.type === "tableRow" ? " | " : "");
  return ADF_BLOCKS.has(node.type) ? `${inner}\n` : inner;
}

export function ticketFields(issue, acFieldIds = []) {
  const f = issue.fields ?? {};
  const gaps = [];
  const capped = (where, s) => {
    const t = String(s ?? "").replace(/\n{3,}/g, "\n\n").trim();
    if (t.length <= CAPS.fieldText) return t;
    gaps.push(gap(where, "over-cap", `${t.length} chars; the first ${CAPS.fieldText} kept`));
    return t.slice(0, CAPS.fieldText);
  };
  return { gaps, fields: {
    summary: f.summary ?? "", type: f.issuetype?.name ?? null, status: f.status?.name ?? null, priority: f.priority?.name ?? null,
    components: (f.components ?? []).map((c) => c.name), labels: f.labels ?? [], fix_versions: (f.fixVersions ?? []).map((v) => v.name),
    description: capped("fields.description", adfText(f.description)),
    acceptance: capped("fields.acceptance", acFieldIds.map((id) => adfText(f[id]).trim()).filter(Boolean).join("\n\n")),
  } };
}
```

`lib/cli.mjs` `prepare`: add `ticketFields` to the existing `./inventory.mjs` import; right after `const inv = buildInventory({...});` add

```js
  const tf = ticketFields(issue, acFields.map((f) => f.id));
  gaps.push(...tf.gaps);
```

and add `fields: tf.fields,` to the object written to `prepare.json` (the one with `fetched_at, ticket_updated, freshness_key, ticket_json, …`).

`lib/compose.mjs`, in the returned bundle after `tracker: prep.tracker,`: `fields: prep.fields,`

`bundle.schema.json`, new `$defs.fields` (plain string arrays on purpose: `$defs/strings` is `minLength: 1`, and one empty component name would fail the gate):

```json
"fields": {
  "type": "object", "additionalProperties": false,
  "required": ["summary", "type", "status", "priority", "components", "labels", "fix_versions", "description", "acceptance"],
  "properties": {
    "summary": { "type": "string" }, "type": { "type": ["string", "null"] }, "status": { "type": ["string", "null"] },
    "priority": { "type": ["string", "null"] },
    "components": { "type": "array", "items": { "type": "string" } }, "labels": { "type": "array", "items": { "type": "string" } },
    "fix_versions": { "type": "array", "items": { "type": "string" } },
    "description": { "type": "string" }, "acceptance": { "type": "string" }
  }
}
```

and in `$defs.bundle`: `"fields"` into `required` after `"tracker"`, `"fields": { "$ref": "#/$defs/fields" }` into `properties`.

`SKILL.md` `description:` — after "One gated context bundle for one tracker ticket:" insert "the ticket's own fields (summary, type, status, priority, components, description, AC-field text),".

- [ ] **Step 4: Run the test, then a live prepare (read-only)**

Run: `node --test scripts/unit/ticket-context-fields.test.mjs` → Expected: 4 pass.
Run: `node .claude/skills/ticket-context/lib/cli.mjs prepare VCST-5097 --fresh`; open the printed `prepare_path`, confirm `fields.summary` is non-empty and `fields.priority` is the ticket's real priority name; then `node .claude/skills/ticket-context/lib/cli.mjs abort --prepare <prepare_path>`.

- [ ] **Step 5: Delete the temporary test, gates, commit**

```bash
rm scripts/unit/ticket-context-fields.test.mjs
npm run context:check && npm test
git add .claude/skills/ticket-context/
git commit -m "feat(ticket-context): the bundle carries the ticket's own fields (VCST-6249)"
```

---

### Task 2: `floors.mjs` — F1–F11 computed from the bundle

**Files:**
- Create: `.claude/skills/qa-test-strategy/lib/floors.mjs`
- Temporary: `scripts/unit/qa-test-strategy-floors.test.mjs` — deleted before commit

**Interfaces:**
- Consumes: a bundle (Task 1 shape), optionally the domain-map file text.
- Produces: `computeFloors(bundle, { domainMapText }) → { floors: Array<{ id: "F1".."F11", fired: boolean, signal: string, requires: string[] }>, product_prs: number }`. CLI: `node <skill>/lib/floors.mjs --bundle <path>` prints that JSON; it reads the domain map from `bundle.known.domain_map.path` itself when the file exists.
- F1 here is the **priority half only** (`P0/P1`); the "any High/Critical risk" half is enforced by `check-strategy.mjs` (Task 3), because the register does not exist yet when floors run.

- [ ] **Step 1: Write the temporary failing test**

```js
// scripts/unit/qa-test-strategy-floors.test.mjs — TEMPORARY, delete before commit
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFloors } from "../../.claude/skills/qa-test-strategy/lib/floors.mjs";

const pr = (layers, extra = {}) => ({ repo: "VirtoCommerce/vc-frontend", number: 1, context_only: false, layers, operations: [], endpoints: [],
  settings: [], hotspots: [], claims: [], ...extra });
const bundle = (over = {}) => ({ fields: { type: "Story", priority: "Medium", summary: "", components: [], labels: [], description: "", acceptance: "" },
  acs: [], domains_guess: { value: [] }, change: { prs: [], hidden_behaviour: [] }, known: { cases_at_risk: [], domain_map: { state: "ABSENT" } },
  gaps: [], blockers: [], ...over });
const f = (res, id) => res.floors.find((x) => x.id === id);

test("F1 fires on High priority, not on Medium", () => {
  assert.equal(f(computeFloors(bundle({ fields: { ...bundle().fields, priority: "High" } })), "F1").fired, true);
  assert.equal(f(computeFloors(bundle()), "F1").fired, false);
});

test("F3 fires on a .vue file, not on a .cs file", () => {
  assert.equal(f(computeFloors(bundle({ change: { prs: [pr({ storefront: ["client-app/a.vue"] })], hidden_behaviour: [] } })), "F3").fired, true);
  assert.equal(f(computeFloors(bundle({ change: { prs: [pr({ module: ["src/A.cs"] })], hidden_behaviour: [] } })), "F3").fired, false);
});

test("F6 fires on NOT DEPLOYED only", () => {
  assert.equal(f(computeFloors(bundle({ blockers: ["NOT DEPLOYED: x#1 — live 1.0, expected 1.1"] })), "F6").fired, true);
  assert.equal(f(computeFloors(bundle({ blockers: ["DEPLOYMENT UNKNOWN: x#1 — no-live-source"] })), "F6").fired, false);
});

test("F7 fires on a Review task", () => {
  assert.equal(f(computeFloors(bundle({ fields: { ...bundle().fields, type: "Review task" } })), "F7").fired, true);
});

test("F8 fires on a ui-kit token partial", () => {
  assert.equal(f(computeFloors(bundle({ change: { prs: [pr({ storefront: ["client-app/ui-kit/styles/_colors.scss"] })], hidden_behaviour: [] } })), "F8").fired, true);
});

test("F10 fires on a sales-rep permission; F11 on a changed setting", () => {
  const b = bundle({ change: { prs: [pr({ module: ["src/X.cs"] }, { settings: ["sales-rep:read", "Cart.EnableSharing (default false)"] })], hidden_behaviour: [] } });
  assert.equal(f(computeFloors(b), "F10").fired, true);
  assert.equal(f(computeFloors(b), "F11").fired, true);
});

test("F2 fires for a Story on an UNDECLARED purpose", () => {
  const b = bundle({ known: { cases_at_risk: [], domain_map: { state: "PRESENT", path: "x.md" } } });
  assert.equal(f(computeFloors(b, { domainMapText: "**Purpose: `UNDECLARED`.** none" }), "F2").fired, true);
  assert.equal(f(computeFloors(b, { domainMapText: "**Purpose: sells things.**" }), "F2").fired, false);
});

test("no product PR: diff floors are not fired when the search ran, doubt when it never ran", () => {
  const ran = computeFloors(bundle({ gaps: [{ where: "change", reason: "not-found" }] }));
  assert.equal(f(ran, "F3").fired, false);
  const never = computeFloors(bundle({ gaps: [{ where: "change", reason: "no-credential" }] }));
  assert.equal(f(never, "F3").fired, true);
  assert.match(f(never, "F3").signal, /^doubt/);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test scripts/unit/qa-test-strategy-floors.test.mjs` → Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/floors.mjs`**

```js
// .claude/skills/qa-test-strategy/lib/floors.mjs — the floors F1–F11, computed from the /ticket-context bundle.
// R2 of the /qa-test redesign: a floor is a gate rule, never a model judgment. This script reads signals; it
// never chooses a risk. F9 (doubt ⇒ the floor applies) is built in: a signal that cannot be read fires its floor.
// Specs: docs/superpowers/specs/2026-10-09-qa-test-strategy-redesign.md §6 (F1–F9),
//        docs/superpowers/specs/2026-10-09-qa-test-model-redesign.md §5, §5a (F10, F11).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The tracker's names for P0/P1 (this site: Highest/High). A name not listed reads as P2+; extend it, never guess.
const P01 = /^(p0|p1|highest|high|blocker|critical)$/i;
// qa-test/visual-axis.md §1 source 1 — a rendering file.
const VISUAL = /\.(vue|scss|css|html)$|\/Scripts\/.*\.html$|\/icons?\/|design-tokens?|_tokens?\.scss$/i; // not a bare "token": TokenService.cs is not a rendering file
// ticket-routing.md §5c — the change IS the design system.
const UI_KIT = /client-app\/ui-kit\/|_ui-kit-tokens\.scss$|\/_colors\.scss$|\/_dark\.scss$|\/preflight\.scss$|client-app\/assets\/presets\/[^/]+\.json$|\.storybook\/|storybook-styles\/|\.stories\./i;
// F4 — revenue-critical flows.
const REVENUE = /\b(cart|checkout|payment|pric(e|ing)|orders?|quote)\b/i;
// F10 — B2B org context (test-model redesign §5).
const ORG = /organizationId|organization_id|xapi:my_organization|my_organization|\/organizations?\b|sales-rep|salesrep|loginOnBehalf|CanImpersonate|impersonat/i;
// F11 — configuration (test-model redesign §5a, layers 1–3).
const CONFIG = /ModuleConstants\.Settings|settingsManager|SettingsManager|store\.settings|\$cfg\./;

const floor = (id, fired, signal, requires = []) => ({ id, fired, signal, requires: fired ? requires : [] });

export function computeFloors(bundle, { domainMapText = null } = {}) {
  const fields = bundle.fields ?? {};
  const prs = (bundle.change?.prs ?? []).filter((p) => !p.context_only && !p.gap);
  const paths = prs.flatMap((p) => Object.values(p.layers ?? {}).flat());
  const surface = [
    ...paths, ...prs.flatMap((p) => [...(p.operations ?? []), ...(p.endpoints ?? []), ...(p.settings ?? []),
      ...(p.hotspots ?? []).flatMap((h) => [h.source, h.risk]), ...(p.claims ?? []).map((c) => c.text)]),
  ].join("\n");
  const changeGap = (bundle.gaps ?? []).find((g) => g.where === "change" || g.where.startsWith("change."));
  // No product PR: when the search ran and found nothing, diff floors are "not fired"; when it never ran, doubt (F9).
  const diffUnread = !prs.length && changeGap && changeGap.reason !== "not-found" ? `doubt: diff not read (${changeGap.reason})` : null;
  const noPr = !prs.length ? "no product PR" : null;
  const diffFloor = (id, re, label, requires) => {
    if (diffUnread) return floor(id, true, diffUnread, requires);
    if (noPr) return floor(id, false, noPr);
    const hit = surface.match(re);
    return floor(id, !!hit, hit ? `${label}: ${hit[0]}` : `no ${label} in the diff surface`, requires);
  };

  const pri = fields.priority;
  const f1 = pri == null ? floor("F1", true, "doubt: no priority in the bundle", ["test model", "exploratory"])
    : floor("F1", P01.test(pri), `priority ${pri}${P01.test(pri) ? " (P0/P1)" : ""}; the High/Critical-risk half is checked on the register`, ["test model", "exploratory"]);

  const isStory = /^story$/i.test(fields.type ?? "");
  const dm = bundle.known?.domain_map ?? {};
  const f2 = !isStory ? floor("F2", false, `type ${fields.type ?? "unknown"}, not a Story`)
    : dm.state !== "PRESENT" || domainMapText == null ? floor("F2", true, `doubt: domain map ${dm.state ?? "unknown"} — purpose not readable`, ["test model", "exploratory"])
    : floor("F2", /\*\*Purpose:[^*]*UNDECLARED/i.test(domainMapText), "domain map §1 Purpose", ["test model", "exploratory"]);

  const visualPaths = paths.filter((p) => VISUAL.test(p));
  const f3 = diffUnread ? floor("F3", true, diffUnread, ["visual lane"])
    : noPr ? floor("F3", false, noPr)
    : floor("F3", visualPaths.length > 0, visualPaths.length ? `rendering files: ${visualPaths.slice(0, 3).join(", ")}` : "no rendering file in the diff", ["visual lane"]);

  const revenueText = [...paths, ...(fields.components ?? []), ...(bundle.domains_guess?.value ?? [])].join("\n");
  const rev = revenueText.match(REVENUE);
  const f4 = floor("F4", !!rev, rev ? `revenue-critical: ${rev[0]}` : "no revenue-critical flow named", ["no risk on it below Medium"]);

  const atRisk = bundle.known?.cases_at_risk ?? [];
  const f5 = floor("F5", atRisk.length > 0, `${atRisk.length} suite(s) at risk${atRisk.length ? `: ${atRisk.slice(0, 5).map((c) => c.suite).join(", ")}` : ""}`, ["coverage triage + regression after the staleness check"]);

  const notDeployed = (bundle.blockers ?? []).filter((b) => /^NOT DEPLOYED:/.test(b));
  const f6 = floor("F6", notDeployed.length > 0, notDeployed[0] ?? "no NOT DEPLOYED blocker", ["BLOCKED before any browser opens"]);

  const f7 = floor("F7", /^review task$/i.test(fields.type ?? ""), `type ${fields.type ?? "unknown"}`, ["oracles from the diff only", "F5 on"]);

  const kit = paths.filter((p) => UI_KIT.test(p));
  const f8 = diffUnread ? floor("F8", false, `${diffUnread} — F8 fails closed (ticket-routing §5c)`)
    : floor("F8", kit.length > 0, kit.length ? `ui-kit files: ${kit.slice(0, 3).join(", ")}` : "no ui-kit file", ["visual lane", "token audit"]);

  const f10 = diffFloor("F10", ORG, "org context", ["an org-context risk with technique MODEL"]);
  const hb = (bundle.change?.hidden_behaviour ?? []).filter((r) => r.answer === "yes" && /feature-flags|default-values/.test(r.item));
  const settingsChanged = prs.some((p) => (p.settings ?? []).length > 0);
  const f11 = diffUnread ? floor("F11", true, diffUnread, ["a configuration risk with technique MODEL", "stand values in Inputs"])
    : settingsChanged || hb.length ? floor("F11", true, settingsChanged ? "the PR changes settings" : `hidden behaviour: ${hb.map((r) => r.item).join(", ")}`, ["a configuration risk with technique MODEL", "stand values in Inputs"])
    : diffFloor("F11", CONFIG, "setting read", ["a configuration risk with technique MODEL", "stand values in Inputs"]);

  return { product_prs: prs.length, floors: [f1, f2, f3, f4, f5, f6, f7, f8,
    floor("F9", false, "doubt rule — applied inside every floor above"), f10, f11] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--bundle");
  if (i < 0 || !process.argv[i + 1]) { console.error("usage: floors.mjs --bundle <bundle.json>"); process.exit(1); }
  const bundle = JSON.parse(readFileSync(process.argv[i + 1], "utf8"));
  const dmPath = bundle.known?.domain_map?.path;
  const domainMapText = dmPath && existsSync(dmPath) ? readFileSync(dmPath, "utf8") : null;
  console.log(JSON.stringify(computeFloors(bundle, { domainMapText }), null, 2));
}
```

Note on the F10 test: `"sales-rep:read"` matches `sales-rep`; `"Cart.EnableSharing (default false)"` is a setting the PR changes, so F11 fires through `settingsChanged`.

- [ ] **Step 4: Run the test; run the CLI on a real bundle**

Run: `node --test scripts/unit/qa-test-strategy-floors.test.mjs` → Expected: all pass.
Run: `node .claude/skills/qa-test-strategy/lib/floors.mjs --bundle "<Phase 2 r2 bundle of VCST-5925>"` (the round-2 bundles are in the Phase 2 scratchpad; any bundle from a fresh `/ticket-context` run works). Expected: F10 fired (sales-rep / sharing scope), F4 fired (cart), F5 fired; every floor has a signal.

- [ ] **Step 5: Delete the temporary test, commit**

```bash
rm scripts/unit/qa-test-strategy-floors.test.mjs
npm test
git add .claude/skills/qa-test-strategy/lib/floors.mjs
git commit -m "feat(qa-test-strategy): floors F1–F11 computed from the bundle (VCST-6249)"
```

---

### Task 3: `check-strategy.mjs` — the script half of the gate

**Files:**
- Create: `.claude/skills/qa-test-strategy/lib/check-strategy.mjs`
- Temporary: `scripts/unit/qa-test-strategy-check.test.mjs` — deleted before commit

**Interfaces:**
- Consumes: the strategy markdown (Task 4's template shape), the bundle, Task 2's floors JSON.
- Produces: `checkStrategy(md, bundle, floors) → { round: number, errors: string[] }`. CLI: `node <skill>/lib/check-strategy.mjs --strategy <md> --bundle <json> --floors <json>` prints `{round, errors}`; exit 1 when `errors` is non-empty.
- Checks the **last** `## Round N` section only. Clauses it owns (numbering = SKILL.md §Gate): **1** round ≤ 3 · **2** every bundle `AC-n` appears in a Risks `Source` cell or in Out of scope · **3** every product-PR hotspot `source` appears in a Risks `Source` cell or in Out of scope · **4** every `R-n` in Risks has an Approach row with technique, oracle, lane and effort ∈ low|medium|high, and no Approach row names an unregistered `R-n` · **5** no `{HYPOTHESIS}` oracle on a row whose technique is not `EXPLORE` or `MODEL` · **6** every fired floor appears on the `Floors fired:` line, and its required artifact is not `SKIP` (F1/F2 → Test model + Exploratory; F3/F8 → Visual lane; F5 → Coverage triage + regression; F10/F11 → Test model and a `MODEL` risk) · **6b** F1's register half: a High/Critical risk ⇒ Test model and Exploratory not `SKIP` · **6c** M1: a High/Critical risk on a `{HYPOTHESIS}` oracle ⇒ technique contains `MODEL` · **6d** F6 fired ⇒ the header says `Deployed: NO` · **8** distinct lanes in Approach ≤ 3, or a `Lanes sequenced:` line · **10** the section ≤ 120 lines. Clauses 7 (project-risk mitigations) and 9 (observable exit criteria) stay the model's inline check.

- [ ] **Step 1: Write the temporary failing test**

```js
// scripts/unit/qa-test-strategy-check.test.mjs — TEMPORARY, delete before commit
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkStrategy } from "../../.claude/skills/qa-test-strategy/lib/check-strategy.mjs";

const bundle = { acs: [{ id: "AC-1" }, { id: "AC-2" }], change: { prs: [{ context_only: false, hotspots: [{ source: "vc-frontend:src/a.ts:10", risk: "x" }] }] } };
const floors = { floors: [{ id: "F3", fired: true }, { id: "F1", fired: false }] };
const good = `# Test strategy — VCST-1

## Round 1 of 3 — 2026-10-14

Status: DRAFT · Depth label: standard (computed)
Build: vc-frontend#1 @ abc · Stand: vcst · Deployed: yes · Previous: none
Floors fired: F3 (rendering files) · not fired: F1, F2

### Risks
| R | What a customer would see if this is wrong | Source | L×I | Level |
|---|---|---|---|---|
| R1 | total wrong | AC-1 · vc-frontend:src/a.ts:10 | 6 | Medium |

### Approach per risk
| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent | Effort |
|---|---|---|---|---|---|
| R1 | FLOW | AC-1 {SPEC} | storefront · Playwright | chrome · qa-frontend-expert | medium |

### Artifacts
| Artifact | Decision |
|---|---|
| Test model | SKIP — no High risk |
| Exploratory | SKIP — no hypothesis |
| Visual lane | RUN (F3) |
| Coverage triage + regression | SKIP — F5 not fired |

### Out of scope
- AC-2 — owned by VCST-2 — residual risk Low
`;

test("a complete strategy passes", () => assert.deepEqual(checkStrategy(good, bundle, floors).errors, []));

test("an AC with no risk and no out-of-scope line fails clause 2", () => {
  const md = good.replace("- AC-2 — owned by VCST-2 — residual risk Low", "");
  assert.ok(checkStrategy(md, bundle, floors).errors.some((e) => e.startsWith("2:")));
});

test("a fired floor whose artifact is SKIP fails clause 6", () => {
  const md = good.replace("| Visual lane | RUN (F3) |", "| Visual lane | SKIP — not needed |");
  assert.ok(checkStrategy(md, bundle, floors).errors.some((e) => e.startsWith("6:")));
});

test("a risk without an approach row fails clause 4", () => {
  const md = good.replace("| R1 | FLOW | AC-1 {SPEC} | storefront · Playwright | chrome · qa-frontend-expert | medium |", "");
  assert.ok(checkStrategy(md, bundle, floors).errors.some((e) => e.startsWith("4:")));
});

test("a HYPOTHESIS oracle on a FLOW row fails clause 5", () => {
  const md = good.replace("AC-1 {SPEC}", "guess {HYPOTHESIS}");
  assert.ok(checkStrategy(md, bundle, floors).errors.some((e) => e.startsWith("5:")));
});

test("round 4 fails clause 1", () => {
  assert.ok(checkStrategy(good.replace("## Round 1 of 3", "## Round 4 of 3"), bundle, floors).errors.some((e) => e.startsWith("1:")));
});

test("only the last round section counts toward the 120-line cap", () => {
  const filler = Array.from({ length: 110 }, (_, i) => `- old line ${i}`).join("\n");
  const twoRounds = good.replace("## Round 1 of 3 — 2026-10-14", `## Round 1 of 3 — 2026-10-01\n${filler}\n\n## Round 2 of 3 — 2026-10-14`);
  assert.deepEqual(checkStrategy(twoRounds, bundle, floors).errors.filter((e) => e.startsWith("10:")), []);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test scripts/unit/qa-test-strategy-check.test.mjs` → Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/check-strategy.mjs`**

```js
// .claude/skills/qa-test-strategy/lib/check-strategy.mjs — the script half of SKILL.md §Gate. Reads the LAST
// "## Round N" section of test-strategy.md and checks it against the bundle and floors.mjs's output. The clauses
// that need judgment (7 project-risk mitigations, 9 observable exit criteria) stay the model's inline check.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CAP = 120; // lines per round section (D9)
const lastRound = (md) => { const i = md.lastIndexOf("\n## Round "); return i < 0 ? "" : md.slice(i + 1); };
const block = (sec, heading) => { const m = new RegExp(`### ${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n### |$)`).exec(sec); return m ? m[1] : ""; };
const rows = (text) => text.split("\n").filter((l) => /^\|\s*[^-|\s]/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim())).slice(1);
const ARTIFACTS_FOR = { F1: ["Test model", "Exploratory"], F2: ["Test model", "Exploratory"], F3: ["Visual lane"], F8: ["Visual lane"],
  F5: ["Coverage triage + regression"], F10: ["Test model"], F11: ["Test model"] };

export function checkStrategy(md, bundle, floors) {
  const errors = [];
  const sec = lastRound(md);
  const head = /^## Round (\d+)/.exec(sec);
  const round = head ? Number(head[1]) : 0;
  if (!head) return { round, errors: ["1: no '## Round N' section"] };
  if (round > 3) errors.push(`1: round ${round} — a fourth round is refused (D6)`);

  const risks = rows(block(sec, "Risks")).map(([r, what, source, , level]) => ({ r, what, source: source ?? "", level: level ?? "" }));
  const approach = rows(block(sec, "Approach per risk")).map(([r, technique, oracle, layer, lane, effort]) => ({ r, technique: technique ?? "", oracle: oracle ?? "", lane: lane ?? "", effort: effort ?? "" }));
  const artifacts = new Map(rows(block(sec, "Artifacts")).map(([name, decision]) => [name, decision ?? ""]));
  const outOfScope = block(sec, "Out of scope");
  const cited = risks.map((x) => x.source).join("\n") + "\n" + outOfScope;

  for (const ac of bundle.acs ?? []) if (!new RegExp(`\\b${ac.id}\\b`).test(cited)) errors.push(`2: ${ac.id} maps to no risk and is not out of scope`);
  for (const p of (bundle.change?.prs ?? []).filter((x) => !x.context_only && !x.gap))
    for (const h of p.hotspots ?? []) if (!cited.includes(h.source)) errors.push(`3: hotspot ${h.source} maps to no risk and is not out of scope`);

  const registered = new Set(risks.map((x) => x.r));
  for (const x of risks) {
    const a = approach.find((y) => y.r === x.r);
    if (!a) { errors.push(`4: ${x.r} has no approach row`); continue; }
    if (!a.technique || !a.oracle || !a.lane) errors.push(`4: ${x.r} approach row lacks a technique, oracle or lane`);
    if (!/^(low|medium|high)$/i.test(a.effort)) errors.push(`4: ${x.r} effort "${a.effort}" is not low|medium|high`);
  }
  for (const a of approach) if (!registered.has(a.r)) errors.push(`4: approach row ${a.r} names no registered risk`);
  for (const a of approach) if (/\{HYPOTHESIS\}/.test(a.oracle) && !/\b(EXPLORE|MODEL)\b/.test(a.technique)) errors.push(`5: ${a.r} decides on a {HYPOTHESIS} oracle`);

  const firedLine = (/^Floors fired:([^\n]*)/m.exec(sec)?.[1] ?? "").split("not fired:")[0];
  const fired = (floors.floors ?? []).filter((f) => f.fired).map((f) => f.id);
  const skipped = (name) => /^SKIP/i.test(artifacts.get(name) ?? "SKIP");
  for (const id of fired) {
    if (!new RegExp(`\\b${id}\\b`).test(firedLine)) errors.push(`6: ${id} fired but is not on the 'Floors fired:' line`);
    for (const name of ARTIFACTS_FOR[id] ?? []) if (skipped(name)) errors.push(`6: ${id} fired but '${name}' is SKIP or missing`);
    if ((id === "F10" || id === "F11") && !approach.some((a) => /\bMODEL\b/.test(a.technique))) errors.push(`6: ${id} fired but no risk has technique MODEL`);
  }
  const high = risks.filter((x) => /^(high|critical)$/i.test(x.level));
  if (high.length && (skipped("Test model") || skipped("Exploratory"))) errors.push(`6b: ${high.map((x) => x.r).join(", ")} High/Critical ⇒ Test model and Exploratory run (F1)`);
  for (const x of high) { const a = approach.find((y) => y.r === x.r); if (a && /\{HYPOTHESIS\}/.test(a.oracle) && !/\bMODEL\b/.test(a.technique)) errors.push(`6c: ${x.r} High/Critical on {HYPOTHESIS} needs MODEL (M1)`); }
  if (fired.includes("F6") && !/Deployed:\s*NO/.test(sec)) errors.push("6d: F6 fired but the header does not say 'Deployed: NO'");

  const lanes = new Set(approach.map((a) => a.lane.split("·")[0].trim()).filter(Boolean));
  if (lanes.size > 3 && !/^Lanes sequenced:/m.test(sec)) errors.push(`8: ${lanes.size} browser lanes and no 'Lanes sequenced:' line`);
  const lines = sec.trimEnd().split("\n").length;
  if (lines > CAP) errors.push(`10: round section is ${lines} lines (cap ${CAP})`);
  return { round, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? null : process.argv[i + 1]; };
  if (!arg("strategy") || !arg("bundle") || !arg("floors")) { console.error("usage: check-strategy.mjs --strategy <md> --bundle <json> --floors <json>"); process.exit(1); }
  const res = checkStrategy(readFileSync(arg("strategy"), "utf8"), JSON.parse(readFileSync(arg("bundle"), "utf8")), JSON.parse(readFileSync(arg("floors"), "utf8")));
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.errors.length ? 1 : 0);
}
```

- [ ] **Step 4: Run the test**

Run: `node --test scripts/unit/qa-test-strategy-check.test.mjs` → Expected: all pass. If the table parser misreads a row, fix `rows()` — not the fixtures; the fixture is the Task 4 template's shape.

- [ ] **Step 5: Delete the temporary test, commit**

```bash
rm scripts/unit/qa-test-strategy-check.test.mjs
npm test
git add .claude/skills/qa-test-strategy/lib/check-strategy.mjs
git commit -m "feat(qa-test-strategy): script gate for the strategy file (VCST-6249)"
```

---

### Task 4: The skill, from the prototype

**Files:**
- Create from `git show f2140a85:<path>`, then edit: `.claude/skills/qa-test-strategy/SKILL.md`, `.claude/skills/qa-test-strategy/floors.md`, `.claude/skills/qa-test-strategy/rounds.md`, `.claude/templates/test-strategy.md`
- Modify: `.claude/knowledge/execution/reports-policy.md` (§2 cap row), `.claude/rules/reports.md` (§2 cap list), `.claude/ROUTING.md` (one row), `.claude/agents/qa-lead-orchestrator.md` (one sentence, net shrink), `.claude/skills/README.md` (regenerated)
- Modify: `docs/superpowers/specs/2026-10-09-qa-test-strategy-redesign.md` (status line), `docs/superpowers/specs/2026-10-09-qa-test-model-redesign.md` (§6 row 1 status)

No new code ⇒ no unit test. Gates: `context:check`, `docs:index:check`.

- [ ] **Step 1: Bring the prototype files over**

```bash
mkdir -p .claude/skills/qa-test-strategy
for f in .claude/skills/qa-test-strategy/SKILL.md .claude/skills/qa-test-strategy/floors.md .claude/skills/qa-test-strategy/rounds.md .claude/templates/test-strategy.md; do git show f2140a85:$f > $f; done
```

- [ ] **Step 2: `SKILL.md` — standalone, bundle-fed, scripts in the loop**

Edit, keeping everything else as the prototype wrote it:
1. `description:` — replace "the strategy step of /qa-test-fast (the prototype of the single /qa-test), or standalone to plan a run before paying for it" with "standalone, to plan a run before paying for it — and later the strategy step of the single /qa-test"; "floors F1–F9" → "floors F1–F11".
2. `argument-hint:` → `"<TICKET> [--domain <slug>] [--yes] | reconcile <TICKET>"`.
3. **Standalone** paragraph → "**Standalone (today the only entry):** `/preflight ticket --ticket <KEY>` (no `--expect`: deployment is the bundle's) for the sprint, env health and kb hits → `/ticket-context <KEY> --domain <slug> --kb-hits <ids>` → the procedure below → approval → STOP. A `/ticket-context` STOP is this skill's STOP, quoted verbatim. `--domain` absent ⇒ the bundle's first `domains_guess` value that `npm run bl:extract -- --has-domain <slug>` accepts."
4. **Inputs** → "The `/ticket-context` bundle (its path; never copied, never edited), the floors JSON, the kb hit ids, prior artifacts for the ticket, and — from round 2 — the previous round's section of this file."
5. New procedure step between 1 and 2: "**Floors.** `node <skill>/lib/floors.mjs --bundle <bundle> > <scratchpad>/floors.json`. Each floor comes back fired or not, with its signal; you may add to a floor, never go under it. **F6 fired ⇒ the strategy is written with `Deployed: NO` and its Status line `BLOCKED (F6)`, and the run stops after approval.** **F11 fired ⇒** run `npm run store:caps -- --settings` and `-- --store`, and record the stand's value of each setting the diff reads under Inputs → Project environment."
6. Step 5 (Risk register): append "F10 fired ⇒ the register holds an org-context risk; F11 fired ⇒ a configuration risk; both with technique `MODEL`."
7. Step 7 (Approach): add `MODEL` to the technique tokens — "`MODEL` (the risk is expanded by `/qa-test-model`)". Add the M1 guard: "A High/Critical risk on a `{HYPOTHESIS}` oracle takes `MODEL`."
8. **Gate** — prefix the clause list with: "Run `node <skill>/lib/check-strategy.mjs --strategy <file> --bundle <bundle> --floors <floors.json>`; it checks clauses 1–6d, 8 and 10 and exits 1 with the failing clause numbers. Clauses 7 and 9 are yours." Add clause **6b** (F1's register half), **6c** (M1) and **6d** (F6 header) to the list, one line each, as in the script's header.
9. **Approval** step 1 — the verifier brief carries "the strategy path, the bundle path and the floors JSON path".
10. Every "`/qa-test-fast`" mention → "the single `/qa-test` (next plan)" or delete where it only named the caller.

Run `npm run context:check` → `SKILL.md` ≤ 19,000.

- [ ] **Step 3: `floors.md` — F10, F11, the script**

1. First paragraph: "Each reads a signal from the run context or the `/ticket-context` bundle" → "Each is computed by `lib/floors.mjs` from the `/ticket-context` bundle; this table is what the script implements and what a reviewer checks it against. F1's register half (a High/Critical risk) is checked by `lib/check-strategy.mjs`, because the register is written after the floors run."
2. F5 row's signal → "the bundle's `known.cases_at_risk` is non-empty (`/ticket-context` block 4 ran `regression:select` over the changed files)".
3. Append two rows:

```markdown
| F10 | the change surface names org context: an `organizationId`-style argument, `xapi:my_organization:*`, an org route or list, `/graphql/sales-rep` or a `sales-rep:*` permission, `loginOnBehalf` / `CanImpersonate` / `/account/impersonate` ([`../../../docs/superpowers/specs/2026-10-09-qa-test-model-redesign.md`](../../../docs/superpowers/specs/2026-10-09-qa-test-model-redesign.md) §5) | an org-context risk with technique `MODEL` |
| F11 | the PR adds or changes a setting, a hidden-behaviour row answers `yes` for `feature-flags` / `default-values`, or the diff reads one (`ModuleConstants.Settings`, `settingsManager`, `store.settings`, `$cfg.`) (§5a) | a configuration risk with technique `MODEL` + the stand's values in Inputs (`npm run store:caps -- --settings` / `--store`) |
```

- [ ] **Step 4: `rounds.md`** — unchanged except: the worked-example sentence stays (it names a branch, not a path in this tree).

- [ ] **Step 5: the template**

In `.claude/templates/test-strategy.md`: the header line `Floors fired:` stays; in the Approach table's example row keep `FLOW, DT`, and add under the table: `<!-- Technique tokens: test-design-techniques.md §0 + EXPLORE · VISUAL · CONTRACT · REGRESSION · MODEL (expanded by /qa-test-model). -->`; in Inputs → Project environment add "· setting values (F11)". Status line options gain `BLOCKED (F6)`.

- [ ] **Step 6: shared files**

- `reports-policy.md` §2 table: add the row `| Test strategy (\`test-strategy.md\`, in the ticket folder) — **per round section** | **40–90** | **120** (inputs · risks · mix · approach per risk · artifacts · data · out of scope · criteria · reconciliation; reference oracles and items by id, never inline them) |`, and in §1's ticket-folder line add `test-strategy.md` after `summary.json`.
- `.claude/rules/reports.md` §2: insert "test strategy 120 per round ·" before "testing checklist 160".
- `.claude/ROUTING.md`: `| **Choose a ticket's test strategy before running anything** (risks, mix, technique + oracle per risk, artifacts, criteria; one approval) | \`/qa-test-strategy <ticket-key> [--domain <slug>] [--yes]\` · \`reconcile <ticket-key>\` | Skill |`
- `.claude/agents/qa-lead-orchestrator.md`: in the paragraph beginning "Steps 1, 2, 4, 5-verdict … self-check inline." add "**Outside `/qa-test`:** `/qa-test-strategy` dispatches you when a risk is Critical — re-derive its §Gate from the strategy, the bundle and the floors JSON; a hard STOP before the user is asked." Shrink the same file by at least as much: the prototype cut the 3-exec row to "The doer self-checks it; not dispatched on purpose, because it releases execution" and dropped the `compute-metrics.ts` invocation sentence — apply both cuts (`git diff 71ccaa40 f2140a85 -- .claude/agents/qa-lead-orchestrator.md` shows them).
- `npm run docs:index` (regenerates `.claude/skills/README.md`).

- [ ] **Step 7: spec status lines**

- Strategy redesign spec, status block: append "**2026-10-14:** `/qa-test-strategy` lands standalone (plan `docs/superpowers/plans/2026-10-14-qa-test-strategy.md`), with floors and the gate as scripts; the single `/qa-test` is the next plan."
- Test-model redesign spec §6 row 1: append "— **done 2026-10-14** (`floors.mjs`, `check-strategy.mjs`)".

- [ ] **Step 8: Gates and commit**

```bash
npm run context:check && npm run docs:index:check && npm test
npm run context:check:baseline   # records the qa-lead-orchestrator shrink
git add .claude/skills/qa-test-strategy .claude/templates/test-strategy.md .claude/knowledge/execution/reports-policy.md .claude/rules/reports.md .claude/ROUTING.md .claude/agents/qa-lead-orchestrator.md .claude/skills/README.md scripts/maintenance/.prompt-size-baseline.json docs/superpowers/specs/
git commit -m "feat(qa-test-strategy): standalone strategy skill with script floors and gate (VCST-6249)"
```

---

### Task 5: Validation on real tickets, then the PR

The strategy redesign spec §8 and the test-model spec §7 name the tickets. Here only the strategy step runs: nothing is executed in a browser.

**Files:** none committed besides the spec status line; figures go to VCST-6249, not the repo (the repo is public).

- [ ] **Step 1: run `/qa-test-strategy` on three tickets**

`VCST-5884` (round 3 in the prototype's dry run; F10 expected), `VCST-5628` (F10 expected; the recorded miss was `scope: ORGANIZATION`), `VCST-5097` (no ACs; the oracle is the PR body). Answer the approval question with *Approve* unless the strategy is wrong — then *Change*, and count the edit.

- [ ] **Step 2: compare and record**

Per ticket: floors fired vs expected; recorded Medium-or-higher findings covered by a risk (direct / partial / missed); `check-strategy` errors on the first draft and how many re-drafts it took; edits at approval; wall time and tokens of context + strategy together, against the prototype dry run's 15–30 min of manual context gathering (strategy spec §13); F5 suite count vs the suites that mattered (Review Focus 3).

- [ ] **Step 3: post the figures to VCST-6249 (one comment, after the user approves the text), then the PR**

```bash
git push -u origin HEAD
gh pr create --base main --title "feat(qa-test-strategy): standalone strategy step — floors F1–F11 and the gate as scripts (VCST-6249)"
```

The PR body lists the five tasks, the prototype it builds on (#416 @ `f2140a85`), the scripts' clause coverage, the BUDGET-004 deltas, and the validation figures as a link to the VCST-6249 comment. It stacks on VirtoCommerce/ai-tools#443 (Task 1 touches the same `compose.mjs`); rebase onto `main` once #443 merges.
