# Verify pitfalls — GitHub Actions additions to the dismissal table

Read at `SKILL.md` §Verify, then consolidate, together with the dismissal table of
`../review-pr-virto/SKILL.md` §Verify, then consolidate. Each row is a thought that drops or
downgrades a finding without evidence; the right column is what to do instead.

| Thought | Reality |
|---|---|
| "CI is green, so the workflow works" | Green shows the path that ran on this event. Name the events that did not fire on this PR; for those there is no runtime evidence. |
| "Only maintainers can trigger it" | Name the trigger and read who can fire it in the docs. `issue_comment`, `pull_request_target` and `workflow_run` fire on things outsiders do; an `if:` on the actor is the guard to read, not assume. |
| "The secret is masked in logs" | Masking is exact-string, and an artifact or cache is not masked at all (`checklist/security.md` §Secrets). |
| "The gate passed, so pinning / injection is fine" | The gate checks the patterns its config names. Read the config the PR runs under — and whether the PR changes it. |
| "Everyone pins to `@master` here" | A claim about a population: count it with the census, or don't invoke it. |
