# Landing an upstream merge as a merge commit

Read by `merge-upstream` step 9. A squash or a rebase drops upstream as a parent, so the next merge replays
every upstream commit and conflict of this one. Whoever clicks Merge reads the PR, not the skill.

## The PR body's first line

```
⚠️ Merge with "Create a merge commit" — not squash or rebase. Squashing drops <ref> as a parent and the next upstream merge replays all of these conflicts.
```

## Before opening the PR: the repository's settings

Merge commits must be allowed and linear history off:

```bash
gh api repos/<owner>/<repo> --jq '{allow_merge_commit, allow_squash_merge, allow_rebase_merge}'
gh api repos/<owner>/<repo>/rules/branches/<base> --jq '[.[].type]'                          # rulesets
gh api repos/<owner>/<repo>/branches/<base>/protection --jq .required_linear_history.enabled  # a protected base
```

Without admin rights these read `null` or 404: unknown, not allowed — tell the user to check them. If merge
commits are not allowed, say so in the PR and to the user rather than squash. When squash is allowed too —
the usual case — the warning line is what prevents it.

## After the user merges

```bash
git fetch origin
git rev-list --parents -1 <merge sha on the base branch>   # the commit and its two parents
git merge-base --is-ancestor <ref> origin/<base> && echo merged
```

If it was squashed, say so at once: the fix is a fresh merge of `<ref>`, cheap while `rerere` and the log are
fresh.
