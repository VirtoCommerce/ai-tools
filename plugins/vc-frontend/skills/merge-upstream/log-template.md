# <upstream ref> into <fork branch> — <YYYY-MM-DD>

- Range: `<merge base sha>`..`<upstream sha>` (<N> upstream commits)
- Merge commit: `<sha>`; ports: `<sha>` …
- PR: <link, once opened> — lands as a merge commit, never squash or rebase

## Decisions that carry forward

Rules a later merge must keep, each with its reason. The next merge reads this section before its brief.

- <rule> — <why; what breaks if it is undone>

## Conflicts

| File(s) | Fork | Upstream | Resolution | Decided by |
|---|---|---|---|---|
| <file> | <one line> | <one line> (<PR>) | <one line> | obvious / user / earlier log |

## Clean merges checked

- <file> — <the risk looked at, and what was found>

## Ports (vc-frontend:port-upstream-to-fork)

| Upstream change | Verdict | Fork file / evidence |
|---|---|---|
| <ticket> (<PR>) | port / already / n/a / lost feature | <file:line, or why it does not apply> |

Map changes: <entries added or changed in fork-map.json, or "none">

## Lost features and deferrals

- <upstream feature> — <where upstream renders it>; <decision: deferred / declined / brought back>; <when to ask again>

## Checks

| Check | Result |
|---|---|
| validate:types / lint / test:unit / check-locales / build-only | <pass, or the failure and whether both parents have it> |

New tests: <`*.upstream.test.ts` files, and the mutation each was checked with>

## Smoke

- Backend: <APP_BACKEND_URL>
- Checked: <pages and states, one line each>
- Not reachable: <what needed data, a role, a setting or a device — it went to QA>

## Follow-ups

- <work spun off, with its link>
