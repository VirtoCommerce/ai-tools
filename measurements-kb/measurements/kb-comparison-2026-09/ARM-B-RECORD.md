# Arm B — what actually happened

**Not a grade.** Grading waits until every arm has run; knowing one arm's score changes how the next
arm's report reads. This page is the independent record only.

## The run

| | |
|---|---|
| working directory | `vc-mcp-testing-module` @ `fb69350e`, on `main` — `plugins/vc-kb/` absent, verified before the start |
| base | none |
| log | `_arena/logs/arm-B/tool-log-38fdb567.jsonl` |
| **tool calls** | **149 of a 150 cap** — no batch parts, so lines and calls are the same number |
| wall clock | **13 minutes** (08:12:35 → 08:25:20 UTC) |
| failed calls in the log | 0 |
| report | `_arena/logs/arm-B/report.md`, 144 lines |

**The arm reported "~130 of 150". The log says 149.** It finished one call short of its cap and did
not know it. A 13% under-count in a self-reported budget is the reason the independent log exists,
and it is worth carrying into the write-up: an arm's own account of how much it spent is not
evidence.

Tool mix: `browser_click` 42, `browser_snapshot` 26, `browser_take_screenshot` 21, `Read` 19,
`browser_navigate` 13, `Bash` 11.

### The aborted first attempt

`_arena/logs/arm-B/tool-log-d35fad13.jsonl` — **25 calls, 7 minutes**, stopped when the brief turned
out to be impossible (one identity where the task needs two, and no browser permissions). Nothing was
created on the deployment. Kept rather than deleted: it is the evidence for the apparatus defect
recorded in `CONDITIONS.md`, and the arm reported "about 20" against a logged 25 — the same
under-count, on a second sample.

## Deployment state afterwards, read over REST rather than taken on trust

* `CO260915-00001` — **Cancelled**, total 1371.02. Cleanup done as asked.
* `PI260915-00001` — Cancelled.
* **`SH260915-00001` — still `New`.** The arm reported this itself as its finding F3. It matches the
  three shipments left `New` by runs 07–11, so it is a platform behaviour rather than this arm's
  omission.
* `KB-LAB run13 disposable 15pct off cart` — **disabled, not deleted**, as instructed.
* The four earlier `KB-LAB` promotions are still disabled and untouched; the eight pre-existing
  active promotions are unchanged.

**Eight unrelated promotions were ACTIVE throughout.** The arm noticed and watched for stacking; the
order carried exactly one discount line, from its own promotion. Every arm meets the same condition,
so it is a shared condition rather than a confound — but it is worth stating, because an order under
a 15% promotion on a deployment with eight other live promotions is not a self-evidently clean
measurement.

## Where the report went, and why that took looking for

The arm said "Report: order-verification-CO260915-00001.md". It is not in the working directory —
it wrote it to its own session scratchpad, and the tool log shows the filename **redacted**, because
the name it chose collided with a secret's value and the logger blanked it by value rather than by
keyword. That is the redaction working as designed, and it also means a log cannot always tell you
where an artifact went. Recovered by path from the one `Write` call in the log.

## What it read

Eleven `Bash` calls, including `cat .env.vcptcore_stable` and a names-only read of
`.env.playwright.local` (`grep -oE '^[A-Za-z0-9_]+'`). Both are inside its working directory and
within scope, and the second is the careful form. No secret value appears in its report.

## Two environment notes the arm raised

**`browser_evaluate` is blocked** by this repository's real-user-interaction hook, so everything went
through UI interaction. The arm read the REST surface by navigating the browser to the API URL, which
the platform session authorises by cookie. Arms A and C run in the arena, which has no such hook —
**so this is not a condition all three arms share**, and it has to be said in the write-up rather
than quietly averaged away.

**Only the `playwright-chrome` lane was connected**, so both identities ran in one browser across
separate tabs. Safe here only because the storefront and the platform are different hosts.

## Residue this arm added

`reports/bugs/screenshots/_incoming/` refilled — **108 files, 4.9 MB** in thirteen minutes. The
folder is still not ignored; the rule that would have covered it was proposed and withdrawn earlier
today as out of scope. At this rate the question will come back on its own.

## Restored

`vc-mcp-testing-module/.claude/settings.local.json` is back to its original contents — the
measurement wiring removed, the token untouched.
