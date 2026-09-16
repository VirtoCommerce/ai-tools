---
id: KB-6CC1EFE6
subject: deleting a security account leaves the contact behind
plane: experiential
question: How do I fully remove a test member, and why can I not find the leftover afterwards?
status: active
refutableBy: observation
appliesTo:
  - axis: surface
    value: admin-ui
anchors:
  - coordinate: DELETE /api/platform/security/users
evidence:
  - method: observation
    deployment: vcptcore_stable
    at: 2026-09-11T18:06:58.509Z
---

A contact and its security account are two records with two delete paths, and neither cascades to the other. Deleting the account under Security > Users names only '1 account(s)' in its confirmation and leaves the contact intact; deleting the contact under Companies and contacts names only '1 contact(s)'. Removing someone completely therefore takes both deletes, in either order. The trap is verifying it: a contact created by an invitation is often not in the member search index, so the 'Companies and contacts' keyword box returns a clean 'No data' for a contact that is still there - the same index behaviour recorded separately for member keyword search. Do not read 'No data' as proof of deletion. Sort the unfiltered list by Name instead: a contact created by an invite has an empty name and sorts to the top, and opening it puts its member id in the URL so you can match it against the id you are chasing. Security > Users does not go through the index, so it is the reliable check for the account half.
