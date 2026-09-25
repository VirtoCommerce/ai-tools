# Review dimensions — what `/prompt-review` collects and checks

Step 1 of [`SKILL.md`](SKILL.md) runs the Collect section below; Step 3 applies the severity scale,
the dimensions and the Verdict section.

## Collect

Run all three blocks in one batch. `T` is the space-separated list of the unit's files. Nothing is
written to disk.

**Facts** — BUDGET-004 status, the cap itself (never transcribe it), baseline entry, DOC findings:
```bash
npm run -s context:report | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);
console.log("cap",r.BUDGET.promptBodyChars,"| linter scans CLAUDE.md + .claude/** only");
for(const f of process.argv.slice(1)){const o=r.prompts.over.find(x=>x.file===f);
 console.log(f,o?`OVER: ${o.chars} (allowed ${o.allowed})`:"not over (or not scanned: plugins/*)",
  r.promptBaseline[f]?"| in baseline":"",
  r.findings.filter(x=>x.file===f).map(x=>`| ${x.code}:${x.line} ${x.detail}`).join(" "))}})' $T
wc -c $T
```

**Grep pack** — candidates only; confirm each before it becomes a finding (a grep with no hits exits 1 — that is not an error):
```bash
grep -nE '\b(feedback|reference|project)_[a-z0-9_]{3,}' $T                        # D5 memory slugs
grep -nE '~?\b[0-9]{2,}\+?[- ](suites?|test cases?|cases?|agents?|skills?|commands?|files?|dimensions?|class(es)?|groups?)\b' $T  # D3 counts
grep -nE '\bdefault(s| is| of)? [0-9]+\b|\(default [0-9]+\)' $T                    # D3 transcribed defaults
grep -nE 'https?://[A-Za-z0-9.-]+\.(azurewebsites\.net|virtocommerce\.(com|cloud)|govirto\.com)' $T  # D4 hosts
grep -nE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' $T        # D4 GUIDs
grep -nE 'reports/tickets/Sprint[0-9]' $T                                          # D4 evidence paths
grep -nE -- '--secrets.*\{\{|\{\{[A-Z_]*PASSWORD\}\}.*(browser_type|fill)' $T       # D4 secrets
grep -nE 'merge_pull_request|gh pr merge|auto-?merge' $T                           # D7 — a PROHIBITION is fine
grep -nE '~/\.claude|settings\.local\.json|[A-Z]:\\|/Users/' $T                    # D5 per-user paths
```

**Citation sweep** — resolves markdown links and backticked file names relative to the citing
file, the repo root, `.claude/` and (for `plugins/*`) the plugin root; checks `file.md §Heading` (first two words); skips fenced code; flags a bare
`§N` with no file; prints each `BL-*` id's real title so you can check it backs the claim:
```bash
node -e '
const fs=require("fs"),path=require("path"),all=require("child_process").execSync("git ls-files",{encoding:"utf8"}).split("\n");
const bl=fs.readFileSync(".claude/knowledge/oracles/business-logic.md","utf8");
const heads=f=>{try{return fs.readFileSync(f,"utf8").split("\n").filter(l=>/^#+ /.test(l)).map(l=>l.replace(/^#+\s*/,"").toLowerCase())}catch{return null}};
for(const f of process.argv.slice(1)){const plug=(f.match(/^plugins\/[^/]+\//)||[""])[0];
 const resolve=r=>[path.join(path.dirname(f),r),r,plug&&path.join(plug,r),path.join(".claude",r)].find(p=>p&&fs.existsSync(p));
 let fence=false;fs.readFileSync(f,"utf8").split("\n").forEach((l,i)=>{const at=`${f}:${i+1}`;if(/^```/.test(l)){fence=!fence;return}if(fence)return;
  const bare=l.replace(/\[[^\]]*\]\([^)]*\)/g,"");const refs=[...l.matchAll(/\]\(([^)#\s]+)/g),...bare.matchAll(/`([^`\s]+\.(?:md|mjs|ts|js|json|yml|csv))`/g)].map(m=>m[1]);
  for(const r of refs){if(/^https?:|[<*{$]|XX|\.\.\./.test(r))continue;
   if(!resolve(r)){const hit=all.filter(p=>p.endsWith("/"+path.basename(r)));console.log(`${at}  UNRESOLVED ${r}${hit.length?"  (same name at: "+hit.slice(0,2).join(", ")+")":""}`)}}
  for(const m of l.matchAll(/`([^`\s]+\.md)`\s*§\s*([A-Za-z0-9][^`,;.)*—(]{2,40})/g)){const p=resolve(m[1]);const h=p&&heads(p);const want=m[2].replace(/[^\w\s-]/g," ").trim().toLowerCase().split(/\s+/).slice(0,2).join(" ");
   if(h&&!h.some(x=>x.includes(want)))console.log(`${at}  §MISSING ${m[1]} §${m[2].trim()}`)}
  if(/(^|[^`\w])§\s*\d/.test(l)&&!/\.md/.test(l))console.log(`${at}  §-with-no-file: ${l.trim().slice(0,70)}`);
  for(const id of new Set(l.match(/\bBL-[A-Z]+-\d+\b/g)||[])){const m=bl.match(new RegExp("^#+ "+id+":?\\s*(.*)$","m"));console.log(`${at}  ${id} = ${m?m[1].slice(0,60):"NOT IN business-logic.md"}`)}
 })}' $T
```
An UNRESOLVED name with a "same name at" hint is usually a bare filename that should carry its
path; one with no hint is dangling. The sweep cannot tell whether a cited file actually **says**
what the prompt claims — for citations on a step's critical path, open the target and check.

---

## Severities

- **BLOCKER** — following the prompt produces an unsafe or wrong **outward** effect (an ungated
  write to a tracker/GitHub/env, a secret leak, a merge), or a step cannot execute at all.
- **MAJOR** — a run is likely to go wrong, silently: a contradiction whose either reading changes
  what gets done, a dangling citation on a critical path, a drifted restatement, over-budget,
  mis-triggering, a caller that cannot invoke it.
- **MINOR** — correct today, but will rot: a restatement identical to its owner, a transcribed
  count/default, a slug-only citation, an unsourced illustrative claim.
- **NIT** — wording, ordering, formatting. Never block on a NIT.

## D1 — Frontmatter & triggering

- `name` = directory / file name; `argument-hint` matches `## Usage` and what the steps parse.
- `.claude/skills/` descriptions lead with a `[Category]` tag (`.claude/skills/README.md`), except
  the root-level skills listed there.
- **Model-invocable** (no `disable-model-invocation`): the `description` is always in context and
  decides triggering — it must say what, when, and *not for X (use Y)* for its nearest neighbours.
  Overlap with no disambiguation → MAJOR.
- **`disable-model-invocation: true`**: the description is not in the model's context, so trigger
  tuning is moot; check instead that no caller needs to invoke it (D10).
- The flag belongs on anything that itself performs an outward write without its own confirmation
  gate; missing there → BLOCKER. A methodology skill whose *command* holds the flag and the gates,
  but which is itself model-invocable → MAJOR (it can run with no gate).
- Agents: `model` and `tools` present and sufficient for what the body asks.

## D2 — Size & loading tier

- Loaded-whole files are capped by BUDGET-004 (`CLAUDE.md` §Where the rules live; cap from
  §Collect). Over the cap and not in the baseline → BLOCKER under `.claude/` (the build fails); in
  the baseline → MAJOR, overage is the number to cut. **`plugins/*` is not gated** by the linter —
  over the cap there is MAJOR and must be checked with `wc -c`.
- A conditional block (a mode, a recovery path, a long example, a schema, history) of ~2K chars or
  more in a loaded-whole file is a move-down candidate **even under the cap** → MINOR.
- An agent definition is paid on every dispatch — weigh its bytes above a command's.
- A baseline entry for a file now under the cap, or renamed away, must be deleted → MINOR.

## D3 — Single source of truth

- A rule, list or table restated from its owner (`CLAUDE.md` §Detailed References names owners)
  instead of cited: drifted → MAJOR, identical today → MINOR.
- A transcribed count, default, budget number, version or model id → MINOR (the fix is the command
  or constant that holds it).
- A command and its skill carrying the same step list or table → MAJOR once they differ.

## D4 — No hardcode

`.claude/rules/test-data.md` §GOLDEN RULE applies to prompts: a hardcoded env URL → MAJOR; a
literal password/token → BLOCKER; `{{VAR}}` passed to Playwright `--secrets` instead of the bare key
(`.claude/rules/agents.md` §MCP servers) → BLOCKER; an evidence OUTPUT path with a sprint/ticket in
it (THIRD RULE) → MAJOR.

## D5 — Portability

- A memory slug that **carries** a claim rather than trailing one stated in full → MINOR, or MAJOR
  when a step acts on the claim (`CLAUDE.md` §What reaches a teammate).
- A per-user path (`~/.claude/…`, `settings.local.json`, an absolute OS path) → MAJOR.
- Plugin prompts: bare relative paths are a documented limitation (`CLAUDE.md` §Project Overview).
  Flag only a **new** instance, or one without the documented mitigation (a script resolving off
  `import.meta.url` / `pluginRoot()`) → MINOR.

## D6 — Step executability

Read the steps as the executing agent would, with no other context.

- Each step names inputs, action, output and stop condition; missing on a step that can fail →
  MAJOR.
- Every cited path, `§`, script, agent name and argument resolves (the citation sweep, plus a manual
  check that the cited text says what is claimed).
- Branches are exhaustive: missing tool, MCP down, empty input, user declines, an intermediate state
  (e.g. a stalled run).
- Ordering: nothing consumes what a later step produces.
- Two instructions that contradict → MAJOR; BLOCKER only when one reading causes an outward effect.

## D7 — Write safety

- Every outward write (tracker comment/transition, GitHub push/PR/comment, env deploy, Teams) is
  gated — confirmation, `--dry-run`, or a documented authority. Ungated → BLOCKER.
- An **instruction to merge** → BLOCKER. A prohibition of merging is correct — not a finding.
- A write described as "nothing" / "report only" that in fact writes (a tracked file, a store) →
  MAJOR — list the real writes.
- Tracker comments: one per run (`.claude/rules/reports.md` §0); status transitions only via
  `qa-lead-orchestrator` (`.claude/rules/agents.md`); files written go to one of the ten categories
  (`.claude/rules/reports.md` §1) or a declared owner path.
- A delegated flow that can itself write outward (e.g. a callee that asks "create a ticket?") must be
  told to stop before that step → MAJOR if not.

## D8 — Delegation

Judge each dispatch against `.claude/rules/agents.md` §Agent Delegation and §Parallel Execution
(cite them; do not restate). Also: the dispatched agent type exists (`.claude/agents/` or a harness
type), the brief carries every fact the subagent needs, a pool is sized, and the brief never tells a
subagent to prefer a doc over the artifact it edits.

## D9 — Product grounding

Claims a step acts on are sourced (`{DOC}`, `{BL}`, `{OBSERVED}`, `{SPEC}`) or cite a knowledge
file; unsourced → MAJOR. A cited `BL-*`/`ECL-*` id whose title does not match the claim → MINOR in an
example, MAJOR in a rule. Exact UI strings cited as `{DOC}` → MINOR (they are `{OBSERVED}`).

## D10 — Integration & contracts

- Callers (SKILL.md Step 2) still match name, arguments and outputs; a mismatch → MAJOR.
- **`disable-model-invocation: true` + a caller that invokes it by name** (a pipeline phase, a CI
  workflow) → MAJOR: the Skill tool cannot run it; a model falling back to reading the `SKILL.md`
  is an unreliable workaround, not a pass.
- Listed in `.claude/skills/README.md` and, if user-facing, `.claude/ROUTING.md` → MINOR if missing.
- `.claude/` ↔ `plugins/vc-fix/` copies: a difference is reported and asked about, not judged;
  self-diagnostics containment files that are not byte-identical → MAJOR (SKILL.md Step 0, item 4).
- Artifacts other flows consume (`summary.json`, a CSV, a fingerprint store) keep their schema.

---

## Verdict

- **HEALTHY** — no BLOCKER, no MAJOR.
- **NEEDS HEALING** — no BLOCKER; every MAJOR has a concrete fix in `healing-playbook.md` (SAFE or
  PROPOSE) that does not need restructuring the prompt.
- **NEEDS REDESIGN** — a BLOCKER, or a MAJOR whose fix means restructuring the steps or changing
  the prompt's arguments/outputs that callers rely on. A MAJOR settled by one PROPOSE recipe (e.g.
  H10, flip a flag) is still NEEDS HEALING — the decision is the user's, the fix is local.
