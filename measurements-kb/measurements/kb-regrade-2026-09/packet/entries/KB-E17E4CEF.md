---
id: KB-E17E4CEF
subject: admin account Status picker cannot represent the values it displays
plane: experiential
question: Why does the Admin account Status field show a value that is not in its own dropdown?
status: active
refutableBy: observation
appliesTo:
  - axis: surface
    value: admin-ui
anchors:
  - coordinate: GET /api/platform/security/users
evidence:
  - method: observation
    deployment: vcptcore_stable
    at: 2026-09-11T18:01:19.199Z
---

The Status control on the Admin security account blade is a fixed four-item picker offering Approved, Deleted, New and Rejected, but the underlying field is a free string and the platform writes values into it that the picker does not contain - Locked and PendingApproval were both observed rendered in that same control on live accounts. The consequence is a one-way door: an operator who opens the picker on an account whose status is Locked or PendingApproval cannot put the original value back, because it is not among the four, and the control gives no sign that the current value is outside its own list. Treat this field as display-only unless you intend one of the four; to change whether an account can sign in, use the Lock/Unlock account toolbar button, which writes the lockout and leaves Status alone. Note also that a freshly invited account has this field empty, showing the 'Select ...' placeholder rather than any status.
