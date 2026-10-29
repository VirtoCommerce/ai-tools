# qa-suite-sync — Phase 2, sync and update

Supporting file for [`qa-suite-sync`](SKILL.md). Read it at Phase 2 — the subagent reads it; you pass its path in the brief.

### Phase 2 — SYNC & UPDATE (Fix Stale Cases)

**Runs when:** Phase 1 found a change source (PR, ticket, module, diff, changelog). Skipped for `suite` / `domain` inputs.

Dispatch `test-management-specialist` with the change inventory to assess and update existing cases.

#### 2a. Map Changes to Cases

Use `.claude/knowledge/execution/module-suite-map.md` to route changes to specific test cases:

1. **Direct mapping** — for each changed module, look up "Must Run" suites
2. **Dependency mapping** — look up "Should Run" suites (downstream dependencies)
3. **Page mapping** — cross-reference `.claude/knowledge/domain/sitemap.md`
4. **API mapping** — find cases exercising affected API endpoints

For each affected suite, identify specific cases referencing changed areas and classify:

| Impact Type | Meaning |
|---|---|
| `POTENTIALLY_STALE` | Case references a changed page/API/field — may need updates |
| `LIKELY_BROKEN` | Case references a removed/renamed element or deprecated API |
| `NEW_NEEDED` | New feature/endpoint with no test coverage |
| `UNAFFECTED` | Case in an affected suite but doesn't reference changed areas |

#### 2b. Assess via the kb, then VirtoOZ

For each endpoint / GraphQL operation / page path the change inventory names, ask the base first —
`mcp__kb__kb_ask` (CLI: `npm run kb -- ask "<coordinate> <question>"`); it holds what the platform was
observed to DO (`CLAUDE.md` §Essential Rules → *Product context*). Then query VirtoOZ (`/vc-docs`;
Context7 fallback) for each changed module's documented behavior:
- API response schemas, required fields, validation rules
- GraphQL query/mutation signatures
- Module configuration options
- Compare documented behavior against test case assertions

Reclassify each case:

| Original | Finding | New Classification |
|---|---|---|
| POTENTIALLY_STALE | Element/field still matches | `VALID` — no update |
| POTENTIALLY_STALE | Element renamed/moved | `STALE` — update steps/assertions |
| POTENTIALLY_STALE | New behavior not captured | `INCOMPLETE` — add assertions |
| LIKELY_BROKEN | Page/element/API removed | `BROKEN` — rewrite or deprecate |
| LIKELY_BROKEN | Still works, false positive | `VALID` — no update |

#### 2c. Update Stale Cases

**For STALE cases:**
1. Read current test case from suite CSV
   - **KB:** `mcp__kb__kb_ask` "<coordinate> …" (CLI: `npm run kb -- ask`) before asserting behaviour; confirm/dispute/capture after (`CLAUDE.md` §Essential Rules → *Product context*).
2. Query VirtoOZ (Context7 fallback) for current behavior
3. Update Steps and Assertions to match new behavior
4. Preserve: case ID, Title (update if feature name changed), Section, Priority, Business_Rule, Edge_Case_Refs
5. **Leave `Automation_Status` alone.** The legal values are exactly `Draft` | `Reviewed` | `Automated` |
   `Manual` | `Semi-Automated` | `Deprecated` (`AUTOMATION_STATUSES` in `scripts/test-cases/lint-test-cases.ts`, enforced by
   `suites:review` **S-006**; meanings: `.claude/skills/qa-test-cases-generator/test-case-template.md` §Automation_Status). There is no `synced` state — a sync is recorded in `References`, not in the
   status column. Nothing in this skill moves a case into or out of `Draft`: promotion is
   `qa-case-promotion`'s and is never automatic (zero GRD-001 + human approval).
6. Add to References: `"Synced: {source} ({date})"` — append; never clobber an existing
   `Audited:` / `Corrected:` stamp on that row (the `Audited:` stamp is the Dim-11 rotation state)

**For INCOMPLETE cases:**
- Add new assertions for changed/added behavior
- Add new Cross_Layer_Checks if change spans layers
- Update Failure_Signals for new failure modes

**For BROKEN cases:**
- Feature removed → **remove** the case (the default — suites only ever grew), or **deprecate** it when it must
  stay visible (a case another suite or a report still cites)
- Feature replaced → rewrite for replacement
- Feature split → generate separate cases
- **Always confirm with user** before removing, deprecating or rewriting — from the subagent, that means returning
  the item in `pendingApprovals[]` unwritten, as `action: remove` (the default), `deprecate` or `rewrite` (`briefs.md`). After approval the orchestrator writes it, never by hand:
  `npx tsx .claude/skills/qa-suite-sync/scripts/retire.ts remove <suite.csv> --ids <A,B>` (or `deprecate … --reason "<why>"`),
  dry run first, then `--apply`; snapshot the suite first (`flip.ts snapshot`, see SKILL.md §Writes). A removed ID is
  retired — never allocate it again. `retire.ts remove` refuses (exit 2, nothing written) an ID that is the highest
  of its prefix in the corpus, because `tc:alloc` would hand that number out again; deprecate that case instead and
  say so in the report.

**After updates:**
- Re-run structural validation (CSV format, required fields, ID uniqueness)
- Update `config/test-suites.json` testCount if cases were added/removed

**BL staleness detection (always):**
- For each BL-* whose expectation a STALE/BROKEN case contradicts, record `{id, observedBehavior, affectedCases, bug}` for Phase 4c: a mismatch with a `DECLARED` rule is a **bug candidate** (`.claude/knowledge/execution/cases-that-catch-bugs.md` §2), and 4c marks the rule `SUSPECT` until the Jira decision.
- Phase 2 never edits a rule or its YAML; the behaviour it saw is not a source.

**Phase 2 output:**
```
Cases in scope: 145
  - VALID (no change): 131
  - STALE → updated: 8
  - INCOMPLETE → enriched: 3
  - BROKEN → proposed for removal/deprecation/rewrite: 1
  - NEW_NEEDED → forwarded to Phase 3: 5
```

---
