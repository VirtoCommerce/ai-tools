# Run 03 — conditions

Written while the run is in flight, not reconstructed afterwards. Runs 01 and 02 have no such page,
which is why two of the three differences below were noticed late or not at all.

Run 03 is `MEASUREMENT/*-95777cf8.*`. Brief: `RUN-BRIEF-unprompted.md`. Task: `TASK-run-03.md`.

## Three ways it differs from runs 01 and 02

**1. It is not told to consult the base.** Intended, and the reason the run exists. Step 2 of the
protocol states that the base is there and what the verbs do, and explicitly declines to instruct.
See `docs/ADOPTION.md`.

**2. The editorial guidance reaches it through `kb capture --help` rather than through the brief.**
Intended, added in `c19adb2`. The brief's "what to record" section is now a pointer. Close to
orthogonal to (1) — being told to *read* the base does not plausibly change how well you *write* to
it — but it is a second variable and run 03's capture quality has to be read with that in mind.

**3. It ran in auto mode against a permission allow-list holding exactly one browser tool.** NOT
intended, and not noticed until the run stopped. Runs 01 and 02 were approved interactively, with
the operator present; run 03 met a classifier. `.claude/settings.local.json` allowed
`browser_snapshot` and nothing else, so the run filled the Admin SPA sign-in form correctly — typing
the secret NAME, never a value — and was then refused both the Log in click and the Enter key.
Every part of the task sits behind that form.

The run did the right thing twice over: it did not try to work around the refusal, and it could not
edit its own permission file (self-escalation, correctly blocked). Neither could the authoring
session, for the same reason. The operator applied the change by hand, mid-run, at
`2026-09-11T11:24Z` — the twelve interaction tools plus hover and navigate-back.

`browser_network_request` (singular) was deliberately left out. That is the tool that returned the
sign-in POST body in plaintext in run 02. The run had not asked for it.

## What (3) means, and what it does not

It does not contaminate the comparison: after the change the browser lane behaves as it did in runs
01 and 02, and nothing had happened on the deployment before the block. The measurement lost time,
not validity.

It is a finding about adoption rather than about the platform, so it belongs here and not in the
knowledge base — the brief is explicit that a run records nothing about its own tooling. Stated
plainly: **the permission allow-list is project configuration, on the same footing as which MCP
servers are enabled.** An agentic QA run in auto mode cannot sign in to anything until the browser
lane's interaction tools are allowed, and discovering that mid-task costs a session. It belongs in
the same place `.mcp.json` and the environment layers do, set once.

## A second log in MEASUREMENT/

The authoring session's own PostToolUse hook writes to the same `VC_MEASURE_OUT`, so fixing (3)
put a second `tool-log-*.jsonl` beside the run's. `resolveSession` then refuses to guess which
session the rows belong to — by design; it is a refusal, not a coin toss. The run was told to set
`VC_MEASURE_SESSION=95777cf8`, which is the documented way out and is named in the refusal text
itself.

Archive both logs together. The run's rows are the ones stamped `95777cf8`.
