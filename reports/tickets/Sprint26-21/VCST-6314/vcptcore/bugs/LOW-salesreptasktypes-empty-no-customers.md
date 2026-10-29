# [Sales Rep Hub] A rep with no served customers gets an empty task-type list, so New task has no Type
Severity: Low · Provenance: PRE-EXISTING (introduced by VCST-5732, vc-module-sales-rep #16 commit 630919c2; PR #26 does not touch it) · Not filed (below severity floor)
Env: vcptcore-qa, SalesRep 3.1016.0-pr-26-92d4 · Account: @td(SR_REP_NOCUSTOMERS)
Steps: sign in as a sales rep serving zero organizations → /company/tasks → New task.
Actual: no Type select; `salesRepTaskTypes` returns `[]` on /graphql and /graphql/sales-rep (PRIMARY gets 9 types incl. Call).
Expected: open question — a rep can still create tasks, so either the type list should be available, or the form should explain why typing is unavailable.
Cause (source): SalesRepTaskTypesQueryHandler returns [] unless CanReadAsync → IsSalesRepAsync needs ≥1 granting org membership.
Evidence: screenshots/3x-nocustomers-rep-new-task-no-type.png · kb KB-F22F1997, KB-5FC22406
