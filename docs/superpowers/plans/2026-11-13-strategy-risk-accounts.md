# Strategy: an account per risk — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every strategy risk names the account it is checked as, and a change that checks access must carry a risk checked as a member without that permission — enforced by `floors.mjs` (F13) and `check-strategy.mjs` (clause 15).

**Architecture:** the logic lives in code, not prompt text. `floors.mjs` gains floor F13 (fires on an access signal; doubt fires it like F10). `check-strategy.mjs` gains clause 15 (account form, `deny:` risk for F13, `P-n` cross-check) and adds F13 to 6f. The account is a third `·` segment of the Approach table's `Lane · agent` cell, so no column is added and clause 8 / `trace.mjs` (which read only segment 0) are untouched.

**Tech Stack:** Node ESM (`.mjs`), `node:test` for temporary tests.

**Spec:** `docs/superpowers/specs/2026-11-13-strategy-risk-accounts-design.md`

## Global Constraints

- Work on a branch, never `main`: `git switch -c feat/strategy-risk-accounts`. The tree has unrelated modified files (`scripts/seed-data/sales-rep/*`, `test-data/aliases.virtostart.json`) — never stage them; `git add` named paths only.
- **NO CODE ⇒ NO UNIT TEST; where there is code the test is TEMPORARY** (`.claude/knowledge/execution/when-to-write-a-test.md`). Every `*.tmp.test.mjs` below is deleted before its task's commit; `scripts/unit/` gains nothing.
- `plugins/vc-test/skills/qa-test-strategy/SKILL.md` body is 18,906 chars (BUDGET-004 cap 19,000). After Task 4 it must be **≤ 18,906**. F13 is not named in `SKILL.md`.
- Account cell grammar (the one definition; every task uses it): segment 2 of the lane cell, split on `·`, trimmed. Valid forms:
  - `KEY` — `/^[A-Z][A-Z0-9_]*$/` (a test-user key: `ORG_USER`, `SALES_REP`)
  - `guest`
  - `deny:<permission> <KEY|P-n>` — `/^deny:\S+\s+(?:[A-Z][A-Z0-9_]*|P\d+)$/`
  - `P-n` as `P\d+` — the stand has no such account; the id must be on the `Project risks:` line
- A lane whose segment 0 is `none` is exempt from clause 15a. A cell containing `TBD — strategy agent` is left to clause 14 (15a skips it).

## Review Focus

1. **A permission entry phrased as "no change"** ("No permissions added or changed") must not fire F13 — the existing `NEGATIVE` rule applies. Test in Task 1.
2. **An AC actor alone ("As a buyer I want…") must not fire F13** — every story has one. Test in Task 1.
3. **An old-format row carried into round ≥ 2** (`rounds.mjs` copies the previous Approach row verbatim, two segments) must fail 15a with a message naming the row, not crash. Test in Task 2.
4. **A risk carrying both `floor:F10` and `floor:F13`** must fail 6f (one floor, one risk). Test in Task 2.
5. **Over-firing is the safe direction:** a settings entry that merely mentions "permission" fires F13. Leave it; do not add negative heuristics beyond `NEGATIVE`.

---

### Task 1: Floor F13 — access is checked

**Files:**
- Modify: `plugins/vc-test/skills/qa-test-strategy/lib/floors.mjs` (header comment line 1; constants near `ORG` line 27; `baseFloors` after `f10` line 186; the returned `floors` list)
- Modify: `plugins/vc-test/skills/qa-test-strategy/floors.md` (title `F1–F12` → `F1–F13`; table row after F12; §How floors.mjs reads the bundle: "F3, F10, F11" → "F3, F10, F11, F13" in both places)
- Test (temporary): `plugins/vc-test/skills/qa-test-strategy/lib/f13.tmp.test.mjs`

**Interfaces:**
- Produces: `computeFloors(...)` result's `floors` gains `{ id: "F13", fired, signal, requires }`, placed after F12. `requires` when fired: `["a risk with Source floor:F13 whose account is deny:<permission> <KEY|P-n> — derive the roles by skills/qa-design/personas.md §1"]`.
- Produces: `export const ACCESS_GUARD` (RegExp) in `floors.mjs` — reused by nobody else yet, exported for the test.

- [ ] **Step 1: Write the failing test** `f13.tmp.test.mjs` with a `bundle(overrides)` helper building `{ schema: "ticket-context/1", fields: { type: "Story", priority: "Medium" }, acs: [], gaps: [], known: {}, change: { prs: [{ repo: "o/r", number: 1, layers: { backend: ["src/A.cs"] }, settings: [], operations: [], endpoints: [], hotspots: [], claims: [] }] } }` and `f13 = (b, cm) => computeFloors(b, { changeMap: cm ?? null }).floors.find((f) => f.id === "F13")`:
  - `settings: ["Permission added: order:approve"]` ⇒ `fired === true`, `signal` starts `permission:`
  - hotspot `{ source: "o/r:src/A.cs:12", risk: "[Authorize(ModuleConstants.Security.Permissions.Approve)] dropped" }` ⇒ fired, `signal` starts `access guard:`
  - claim text `v-if="isOrganizationMaintainer"` ⇒ fired
  - change map `{ hotspots: [{ id: "H-2", zone: "access" }] }` ⇒ fired, `signal` contains `H-2`
  - `settings: ["No permissions added or changed"]`, nothing else ⇒ `fired === false`
  - `acs: [{ id: "AC-1", text: "As a buyer I want to approve" }]`, nothing else ⇒ `fired === false`
  - `gaps: [{ where: "pr:o/r#1:diff", reason: "truncated" }]` ⇒ fired, `signal` starts `doubt:`
  - `change.prs: []` ⇒ `fired === false`, `signal === "no product PR"`
  - fired ⇒ `requires[0]` contains `deny:` and `personas.md §1`

- [ ] **Step 2: Run it, expect FAIL** — `node --test plugins/vc-test/skills/qa-test-strategy/lib/f13.tmp.test.mjs` → fails: no F13 in floors.

- [ ] **Step 3: Implement F13 in `baseFloors`** with `diffFloor("F13", positive, "no access check in the diff surface", requires)`. `positive`, first match wins:
  1. a non-`NEGATIVE` settings entry matching `/permission/i` ⇒ `permission: <entry, first 60 chars>`
  2. `surface.match(ACCESS_GUARD)` ⇒ `access guard: <match>`
  3. a change-map hotspot with `zone === "access"` ⇒ `access hotspot: <ids, up to 5>`

  `ACCESS_GUARD = /\[Authorize\b|\bPermissions?\.[A-Z]\w*|\bhas(?:Any)?Permissions?\b|\bcheckPermissions?\b|\bisAuthorized\b|\$can\(|\bv-if="[^"]*\b(?:role|permission|isCorporateMember|isOrganizationMaintainer)/i`. Append `f13` after `f12` in the returned list. No `ARTIFACTS_FOR` entry (F13 needs no artifact).

- [ ] **Step 4: Run it, expect PASS** — same command.

- [ ] **Step 5: floors.md** — title; F13 table row: signal = "a permission added or changed (a settings entry), a role/permission guard in the diff surface (`[Authorize`, `Permissions.`, `hasPermission`, `checkPermissions`, a `v-if` on a role), or a change-map hotspot in zone `access`. An AC actor is not a signal"; floor = "a risk whose Source carries `floor:F13` and whose account is `deny:<permission> <KEY|P-n>` (clause 15b); roles by [`personas.md`](../qa-design/personas.md) §1". Add F13 to the F9 doubt bullet.

- [ ] **Step 6: Delete the temporary test, commit**
```bash
rm plugins/vc-test/skills/qa-test-strategy/lib/f13.tmp.test.mjs
git add plugins/vc-test/skills/qa-test-strategy/lib/floors.mjs plugins/vc-test/skills/qa-test-strategy/floors.md
git commit -m "vc-test: floor F13 — the change checks access"
```

### Task 2: Gate clause 15 and F13 in 6f

**Files:**
- Modify: `plugins/vc-test/skills/qa-test-strategy/lib/check-strategy.mjs` (6f at line ~182; new clause 15 before the `tbd` check ~line 244)
- Modify: `plugins/vc-test/skills/qa-test-strategy/floors.md` (§Clause 11 heading → "Clause 11 — every strategy; clauses 12–13 — vc-test runs; clause 15 — every strategy"; new `### 15 — an account on every risk` with the grammar from Global Constraints, 15a–c, 4–6 lines)
- Test (temporary): `plugins/vc-test/skills/qa-test-strategy/lib/c15.tmp.test.mjs`

**Interfaces:**
- Consumes: F13 from Task 1 (`floors.floors` entry `F13`).
- Produces: `checkStrategy` errors prefixed `15a:`, `15b:`, `15c:`; messages name the row and the fix:
  - `15a: R1 lane cell has no account — add '· <KEY | guest | deny:<permission> <KEY|P-n> | P-n>' (floors.md §15)`
  - `15a: R1 account "<cell>" is not KEY, guest, deny:<permission> <KEY|P-n> or P-n`
  - `15b: F13 fired but no risk carries floor:F13 with a deny:<permission> account`
  - `15c: R1 account names P3, which is not on the 'Project risks:' line`
- 6f's own-floor list becomes `[...Object.keys(MODEL_RISK_FOR), "F13"]`.

- [ ] **Step 1: Write the failing test** with a `strategy(rows, projectLine = "Project risks: none.")` helper producing a `## Round 1` section with `### Risks` (R, What, Source, L×I, Level), `### Approach per risk` (six cells), `### Artifacts`, `### Out of scope`, and a bundle helper as in Task 1. Assert on `errors.filter((e) => /^(15|6f)/.test(e))`:
  - lane `chrome · qa-frontend-expert` ⇒ one `15a:` error naming R1 (also the carried-row case of Review Focus 3)
  - lane `chrome · qa-frontend-expert · ORG_USER` ⇒ none
  - lane `chrome · qa-frontend-expert · org user` ⇒ one `15a:` "is not KEY"
  - lane `none · BLOCKED — no reproduction recorded` ⇒ none
  - lane `chrome · qa-frontend-expert · TBD — strategy agent` ⇒ no `15a:` (clause 14 owns it)
  - bundle with `settings: ["Permission added: order:approve"]`, no `floor:F13` risk ⇒ `15b:`
  - same bundle, R2 Source `AC-1 · floor:F13`, lane `… · ORG_USER` (not deny) ⇒ `15b:`
  - same bundle, R2 Source `AC-1 · floor:F13`, lane `… · deny:order:approve ORG_USER` ⇒ no `15b:`
  - lane `… · P3` with `Project risks: P1 stand lacks a rep.` ⇒ `15c:` naming P3; with `Project risks: P3 no approver account → accepted.` ⇒ none
  - lane `… · deny:order:approve P3` without P3 on the line ⇒ `15c:`
  - R1 Source `floor:F10 · floor:F13` ⇒ one `6f:` error

- [ ] **Step 2: Run it, expect FAIL** — `node --test plugins/vc-test/skills/qa-test-strategy/lib/c15.tmp.test.mjs`.

- [ ] **Step 3: Implement clause 15 in `checkStrategy`** — reads `approach[].lane` (`split("·")`, segment 2), `risks[].source`, the existing `projectLine`, and `fired`. Clause-15c's P-ids are parsed the way clause 11 parses `Project risks:` items. Update 6f's list.

- [ ] **Step 4: Run it, expect PASS.**

- [ ] **Step 5: floors.md §15** as in Files.

- [ ] **Step 6: Delete the temporary test, commit**
```bash
rm plugins/vc-test/skills/qa-test-strategy/lib/c15.tmp.test.mjs
git add plugins/vc-test/skills/qa-test-strategy/lib/check-strategy.mjs plugins/vc-test/skills/qa-test-strategy/floors.md
git commit -m "vc-test: strategy gate clause 15 — an account on every risk"
```

### Task 3: The account segment in the template and in `rounds.mjs`

**Files:**
- Modify: `plugins/vc-test/skills/qa-test-strategy/template.md` (Approach header and example row; one comment line with the grammar)
- Modify: `plugins/vc-test/lib/rounds.mjs:488` (`APPROACH_HEAD`), `:495-496` (`proofOf` lanes)

**Interfaces:**
- Produces: header `| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent · account | Effort |`. Example row lane `chrome · qa-frontend-expert · USER`. Comment: `<!-- account: a test-user KEY · guest · deny:<permission> <KEY|P-n> — the member without that permission (F13) · P-n when the stand has none (clause 15). -->`
- `proofOf`: `spec` lane `node · playwright test · ${TBD}`, `package` lane `chrome · qa-frontend-expert · ${TBD}`; the `none` lane unchanged (exempt).

- [ ] **Step 1: Edit both files.**
- [ ] **Step 2: Verify** — `node -e "import('./plugins/vc-test/lib/rounds.mjs').then(()=>console.log('ok'))"` prints `ok`; `grep -c "Lane · agent · account" plugins/vc-test/lib/rounds.mjs plugins/vc-test/skills/qa-test-strategy/template.md` gives 1 and 1.
- [ ] **Step 3: Commit**
```bash
git add plugins/vc-test/skills/qa-test-strategy/template.md plugins/vc-test/lib/rounds.mjs
git commit -m "vc-test: Lane · agent · account in the strategy template and round append"
```

### Task 4: Prompt text — net ≤ 0

**Files:**
- Modify: `plugins/vc-test/skills/qa-test-strategy/SKILL.md` step 6 (line ~84) and §Gate (lines 149–153)
- Modify: `plugins/vc-test/commands/qa-ticket.md:118`
- Modify: `plugins/vc-test/briefs/scenario-run.md:40-41` (the Browser line)

- [ ] **Step 1: SKILL.md step 6** — replace "F2 fired ⇒ a purpose risk, F10 ⇒ an org-context risk, F11 ⇒ a configuration risk, each with technique `MODEL` and **its own row**: its Source carries `floor:F10`, and no risk carries two `floor:` tokens — the model gates each group separately (M10)." with "Each fired floor's required risk is in the `floors.mjs` output (`requires`), each **its own row**: Source carries `floor:<id>`, and no risk carries two `floor:` tokens (M10)."
- [ ] **Step 2: SKILL.md §Gate** — "10–14" → "10–15"; in the model-owned list add ", that a `deny:` account names the permission the diff checks".
- [ ] **Step 3: Measure** — `node -e "const s=require('fs').readFileSync('plugins/vc-test/skills/qa-test-strategy/SKILL.md','utf8');console.log(s.length)"` ⇒ ≤ 18906. If over, shorten the Step 1 sentence further; never move the overage into another always-read file.
- [ ] **Step 4: qa-ticket.md:118** — "the role the approved scenarios on that surface sign in as" → "the account of the risk the approved scenarios on that surface cite".
- [ ] **Step 5: scenario-run.md Browser line** — after "Sign in through the lane's secrets by bare key name, never a password value." add "Sign in as the account your risk's Approach row names (`Lane · agent · account`); `deny:<permission> <KEY>` means that KEY, which lacks the permission."
- [ ] **Step 6: Gate** — `npm run context:check` ⇒ exit 0, no BUDGET-004 breach, no dangling path.
- [ ] **Step 7: Commit**
```bash
git add plugins/vc-test/skills/qa-test-strategy/SKILL.md plugins/vc-test/commands/qa-ticket.md plugins/vc-test/briefs/scenario-run.md
git commit -m "vc-test: strategy prompt points at the floors output; scenarios sign in as their risk's account"
```

### Task 5: Dry run and version

**Files:**
- Modify: `plugins/vc-test/.claude-plugin/plugin.json` (`version` `0.16.0` → `0.17.0`) and whatever else `docs/release-process.md` §Step 1 lists for a plugin bump (read it; the tag is a release step, not this task)

- [ ] **Step 1: Dry run on a real strategy** — pick a recent `test-strategy.md` with its bundle (`npm run run:dir -- --all` lists run folders). Run `node plugins/vc-test/skills/qa-test-strategy/lib/check-strategy.mjs --strategy <file> --bundle <bundle>`: expect every error not already reported on `main` to be `15a:` (old rows have no account) or `15b:` (if F13 fires on that bundle). Then add `· USER` to each lane cell in a scratch copy and re-run: no `15a:`.
- [ ] **Step 2: Bump the version** per `docs/release-process.md` §Step 1.
- [ ] **Step 3: Confirm no temporary test is left** — `git ls-files --others --exclude-standard | grep tmp.test` prints nothing.
- [ ] **Step 4: Commit**
```bash
git add plugins/vc-test/.claude-plugin/plugin.json
git commit -m "vc-test 0.17.0: an account on every strategy risk (F13, clause 15)"
```
