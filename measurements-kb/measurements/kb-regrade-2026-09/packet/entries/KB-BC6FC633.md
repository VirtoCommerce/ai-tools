---
id: KB-BC6FC633
subject: admin account role assignment is staged until save
plane: experiential
question: I assigned and removed roles on an account in the Admin SPA and the list updated - why did the change not take effect?
status: active
refutableBy: observation
appliesTo:
  - axis: surface
    value: admin-ui
anchors:
  - coordinate: "Admin SPA: Security > Users > <account> > Roles"
  - coordinate: PUT /api/platform/security/users
evidence:
  - method: observation
    deployment: vcptcore_stable
    at: 2026-09-11T08:52:00.802Z
---

In the Admin SPA, Assign and Remove on an account's Roles blade mutate only the blade's in-memory copy: the Assigned roles list redraws immediately and convincingly, but nothing is persisted until Save is pressed on the PARENT account blade. Navigating away offers 'The account has been modified. Do you want to save changes?' and answering No - or reloading the page, which asks nothing at all - discards the change silently, leaving the account on its old roles. The failure mode is nasty because every local signal says success: the widget count, the list, and the absence of any error. Confirm a role change by reloading the account and re-reading Assigned roles, never by trusting the blade, and treat any permission experiment built on an unsaved role change as void - it will read as a privilege escalation that is really just the old role still in force.
