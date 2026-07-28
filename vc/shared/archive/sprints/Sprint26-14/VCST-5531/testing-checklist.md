# VCST-5531 — Testing Checklist

**Scope:** Admin SPA (AngularJS) — Customer / Contacts → member-detail blade dirty-check.
**Env:** vcst-qa Admin (`{BACK_URL}` = https://vcst-qa.govirto.com). Agent: qa-backend-expert / playwright-edge.
**Build note:** fix ships in Customer `3.1017.0-pr-310`; deploy PR vc-deploy-dev#6189 awaiting human merge.
Two passes: **(A) baseline/red** on live `3.1016.0` now; **(B) fix-verify/green** after the deploy lands.

## Setup
- Log into Admin at `{BACK_URL}` (admin / `Password1!` — memory `user_test_accounts`).
- Navigate: **Contacts** (Customer module) → open an **Organization that has several members** (≥3).
  Use an existing seeded org with members (e.g. an `AGENT-TEST-` org or any org with a members list).
  Resolve a real org live — do NOT hardcode IDs.

## Checklist

| ID | Condition | Steps | Expected (fixed build) | Baseline (3.1016.0) |
|----|-----------|-------|------------------------|---------------------|
| C1 | Fast-switch members during load → no false prompt | Open org members list → click member A, then immediately click member B (and C) before the detail blade finishes loading | No *"This contact has been modified…"* dialog | Expected to show the false dialog (bug present) |
| C2 | Double-click a member during load → no false prompt | In the members list, **double-click** a member row | No false save-changes dialog | Expected to show the false dialog (bug present) |
| C3 | Real edit still prompts on close (genuine dirty) | Open a member, wait for full load, change a field (e.g. First name), click the blade close (×)/back | Save-changes confirmation DOES appear | Should already prompt (unchanged) |
| C4 | Clean open+close, no edit → no prompt | Open a member, wait for full load, close without editing | No prompt | No prompt |
| C5 | Save / Reset semantics intact | Open member, edit a field → **Save** persists; re-edit → **Reset** reverts | Save & Reset both work | Works |

## Evidence policy
- Screenshot the false dialog when it appears (baseline C1/C2) — this is the "red".
- Screenshot the genuine save prompt for C3 (proves the guard didn't over-suppress).
- Console: capture any JS errors during blade open/close/switch. Network: 4xx/5xx on `members.get`.
- Follow `skills/qa-evidence/evidence-capture-policy.md`; screenshots → `reports/tickets/Sprint26-14/VCST-5531/screenshots/`.

## Always-on bug detection
Checklist is the floor. Report any incidental Admin-SPA defect seen in the Contacts area (verify before filing — disabled control / by-design are not bugs).
