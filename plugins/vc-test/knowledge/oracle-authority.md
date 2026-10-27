<!-- copy of .claude/knowledge/agents/qa/shared-instructions.md §5 (Live-Verification Policy) — keep in step; the repository copy is canonical here -->
### 5. Ground new-feature assertions live — never assert what you can't source

When authoring test cases, **every behavioral assertion must trace to a source of truth** and carries a
provenance tag (`test-case-template.md` → Assertions column): `{SPEC}` (tracker AC — Jira or Azure
Boards), `{BL}` (a real invariant), `{DOC}` (docs/source/i18n), or `{OBSERVED}` (seen live). An
untagged / `{HYPOTHESIS}` assertion is a guess and MUST be phrased as a question ("verify whether…"),
never a fact.

For a **brand-new feature** the source-first leg of check #4 is unavailable — there is no VirtoOZ doc
and often no source snapshot yet — so the **live DOM snapshot / behavior on the deployed build becomes
the primary ground truth.** Such assertions must be confirmed live (upgraded to `{OBSERVED}` via the
mandatory `/qa-review-tests --verify` pass) before the suite can be promoted `Draft → Reviewed`. Do not
invent literal message/validation strings — assert the semantic unless the exact string is grounded by
`{DOC}` or `{OBSERVED}`. This is the Dimension 10 (Assertion Grounding / GRD-*) gate.
