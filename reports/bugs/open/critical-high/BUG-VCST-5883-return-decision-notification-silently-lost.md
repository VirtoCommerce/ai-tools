# The buyer is sometimes never notified of a return decision — the notification job "succeeds" and sends nothing

- **Severity:** High
- **Provenance:** IN-SCOPE — VCST-5883 (vc-module-return PR #27 @`51fc4cc`: `ReturnStatusChangedEvent` email + push handlers)
- **Environment:** vcptcore-qa1 · Return `3.1003.0-pr-27-51fc` · Notifications `3.1014.0` · PushMessages `3.1006.0-pr-28-2027`
- **Found by:** `/qa-test VCST-5883` — checklist B2 (RET260928-00008) and C1 regression case ORD-RET-012 (RET260928-00034); 2 of ~12 decisions
- **Evidence:** `reports/regression/REG-2026-09-28-2251/screenshots/ORD-RET-012-FAIL-missing-approved-notification.png` · `reports/tickets/Sprint26-19/VCST-5883/screenshots/4a-be-B2-hangfire-job-succeeded-no-email-00008.png`

## Steps to reproduce

1. A buyer submits a return (Registered email + push arrive).
2. An agent decides it (`POST /api/return/{id}/authorize`) → 200, status Approved / PartiallyApproved.
3. Check `POST /api/notifications/journal` (tenant = the return id) and the buyer's push messages.
4. Repeat for ~10 decisions.

## Expected

Every status change sends exactly one email and one push (ticket §Notifications: → Approved /
PartiallyApproved / Rejected each notify the buyer).

## Actual

Intermittently nothing is sent for the decision:

| Return | Decided | Journal | Push |
|---|---|---|---|
| RET260928-00034 | Approved 2026-09-28 23:14:39Z | only `ReturnRegisteredEmailNotification` (23:13) — no Approved message 10+ min later | only "received" |
| RET260928-00008 | PartiallyApproved 21:51:47Z | nothing; Hangfire jobs #359527 (email) and #359526 (push) **Succeeded in ~14 ms** | nothing |

Requeueing the 00008 jobs from the Hangfire dashboard, with no data change, sent both (email
`abf5dc04…`, push `858aafec…`). Sibling returns decided in the same session were notified normally.

## Why it happens (hypothesis — not proven)

`ReturnStatusNotificationHandlerBase.PrepareAsync` re-reads the return via `IReturnService.GetAsync` and, if
the current status maps to a different notification type, logs "out of date" at Information level and
returns nothing. A stale (cached / pre-commit) read of the return with status `Requested` would make the
Approved job silently skip itself — which matches the 14 ms "Succeeded" jobs and the successful requeue.

## Impact

The story's purpose is to tell the buyer where their return stands without logging in. When it fails the
buyer is never told, the job reports success, and only an Information-level log line records it.
