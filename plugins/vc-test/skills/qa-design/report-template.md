# /qa-design — the report templates (Step 4)

A supporting file of [`SKILL.md`](SKILL.md): the templates of its Step 4, moved here verbatim. `SKILL.md` Step 4 says where `report.md` is written.

**Component targets (dual eval)** — two result columns highlight isolation-only vs integration-only failures:

```markdown
# /qa-design — {Component}

**Date:** YYYY-MM-DD
**Target type:** Component
**Target:** {name}
**Matrix scope:** {covering test IDs from critical-ui-scope.md, or "off-matrix — heuristic scope"}
**Storybook story:** {URL or "not found — storefront-only"}
**Storefront URL:** {URL}
**Viewports:** 375 / 768 / 1280

## Invariant Results

| Invariant | Storybook | Storefront | Diagnosis |
|-----------|-----------|------------|-----------|
| BL-UI-002 spacing-grid | PASS | FAIL | Integration-only — passes in isolation, fails in real page |
| BL-UI-003 state-shift  | FAIL | FAIL | Component-level bug |
| BL-UI-006 touch targets | PASS | PASS | OK |

## Findings
- [BL-UI-NNN] short description — phase, computed-style snippet, screenshot path
```

**Diagnosis legend:**
- Storybook PASS + Storefront FAIL → **integration-only bug** (component fine alone, broken in real page context — e.g., parent overrides, real data overflows).
- Storybook FAIL + Storefront FAIL → **component-level bug** (broken at the base; fix at the component, not the page).
- Storybook FAIL + Storefront PASS → **rare** — likely bad story props or stale baseline; verify the story.
- Storybook PASS + Storefront PASS → OK.

**Page or flow targets (storefront only)** — single column:

```markdown
| Invariant | Result | Evidence |
|-----------|--------|----------|
| BL-UI-001 CLS | PASS / FAIL | path |
| ...           | ...        | ...  |
```

**Design spec section (always present — verdicts, or `SKIPPED` + reason)** — appended to the report:

```markdown
## Design Spec Diff — {project} / {artboard}

**Axis verdict:** {summarizeDesignFindings line}   **Unresolved spec entries:** {n}

| Subject | Axis | Spec | Live | Verdict |
|---------|------|------|------|---------|
| --color-primary-500 | token | #e52121 | rgb(229,33,33) | CONFIRMED |
| cart | icon | shopping-cart | shopping-bag | DRIFT |
| logout | icon | log-out | (nothing drawable) | MISSING |
```

`UNSPEC` rows are listed but never counted as failures. When the source was unreachable the whole
table is replaced by one line — `SKIPPED — <reason>` — and the axis is never reported as PASS. When
`--design` was not passed, say `Design axis: not requested` so a reader can tell that apart from a skip.

**Off-Matrix Note (if applicable):** "{Target} is not in critical-ui-scope.md. Consider promoting it." Same applies when a Storybook story is missing for an off-matrix component.
