# vc-frontend

**Keeps a Virto Commerce frontend fork up to date with upstream, without losing the fork's look.**

> The fork owns how it looks. Upstream owns how it behaves.

> [!WARNING]
> **The skills can make mistakes.** They resolve conflicts, port code and write tests on their own
> judgement, and a passing build or test run does not prove the result is right. Every change they make —
> the merge, each port, the map, the log — has to be reviewed by a person before it is merged. The person
> who merges the PR owns the result.

## Install

```
/plugin marketplace add VirtoCommerce/ai-tools
/plugin install vc-frontend@ai-tools
/reload-plugins
```

## Which skill, when

| You want to… | Run |
|---|---|
| Bring upstream into the fork (`upstream/dev`, a release tag, or `origin/dev` into a redesign branch) | `/vc-frontend:merge-upstream <ref>` |
| Find upstream fixes the fork never got, because it renders its own component instead | `/vc-frontend:port-upstream-to-fork` |

`merge-upstream` runs `port-upstream-to-fork` itself. Run the second one alone only to audit a fork.

## What happens in a merge

1. **It maps every conflict.** Nothing is changed yet.
2. **⏸ You answer a brief.** One block per conflict, with a recommendation. Only the real decisions are questions.
3. It resolves them, then runs types, lint, tests, locales and the build.
4. **It checks nothing upstream got lost**, line by line, and in components the fork replaced.
5. It writes tests for ported code nothing covered, and proves each one fails when the port is removed.
6. **⏸ A second brief, if needed:** fixes to port into the fork's own components.
7. It smoke-tests the built app against a backend you name.
8. **⏸ You say when to push.** It opens the PR with a QA checklist.

## The rules that matter

- 🔀 **Merge the PR with "Create a merge commit".** Never squash, never rebase. Either one makes the
  next upstream merge replay every conflict again.
- 📓 **Every merge leaves a log** in the fork: `upstream-merges/<date>-<ref>.md`. The next merge reads
  it first, so decisions aren't asked twice.
- 🗺 **`fork-map.json`** (fork root) says which upstream files the fork's components replace. Use
  `ignored` rarely: it hides a file from every future report.
- 🔁 **`git rerere`** is a safety net for a merge that has to be redone: it replays a resolution only
  for the identical conflict, never stages it, and every replay is still reviewed in the brief.
- 🧪 **`*.upstream.test.ts`** files guard upstream behavior inside the fork's markup. Keep them green.

## What it needs

- A clone of the fork, with its history shared with upstream (not a copy).
- Node and Yarn, as the fork uses them.
- A reachable backend for the smoke test (`APP_BACKEND_URL` in `.env.local`).
- `gh`, for the repo settings check and the PR.

Full details: [`skills/merge-upstream/SKILL.md`](skills/merge-upstream/SKILL.md) and
[`skills/port-upstream-to-fork/SKILL.md`](skills/port-upstream-to-fork/SKILL.md).
