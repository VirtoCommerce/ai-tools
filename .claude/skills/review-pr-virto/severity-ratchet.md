# Severity moves both ways

Read at `SKILL.md` Step 6, before promoting or re-ranking a finding, and whenever a prerelease
version pin appears in the diff.

**Severity moves both ways, or it is a ratchet.** Before promoting a finding, check whether a decision
about its subject is already recorded — in the PR, its threads, or earlier in this review. A decision
has no artifact in the diff, so a re-derivation always arrives with fresher evidence than the decision
it would override — and fresh evidence that the mechanism is real is not evidence that the decision
was wrong.

The standing case is a **prerelease version pin in a coordinated multi-repo change**: a companion PR
pins a dependency to a prerelease build of another PR in the same change (`-alpha.`, `-beta.`,
`-rc.`, `-pr-` in a `.csproj` or `module.manifest`). That pin is scaffolding so the PR builds before
its dependency releases; it is re-pinned at release and never reaches the base branch as-is. It is
**not a finding at any severity, not a blocking item, and not a request to re-pin to a newer build.**
At most, one merge-order line: the companions' green CI validated against the pinned build's API
surface, so the build against the released version is the one that must be re-run after the re-pin.
If the author has not said which release the pin becomes, ask that as a question. Every technical fact about the pin can be true (NU5104, an older build, exact
prerelease resolution) and none of them bears on whether it is a defect.

| Thought | Reality |
|---|---|
| "The helper's facts are correct, so it's at least minor" | Correct facts wearing the wrong severity is the hard case: verification passes and returns you to the same conclusion. The facts do not bear on whether the pin is a defect. |
| "The pinned build is stale — ask them to re-pin now" | Re-pinning happens at release. The merge-order note already says what green CI did and did not validate. |
| "I'll make it a blocking checklist item instead of a finding" | A blocking item is a severity under another name. |
