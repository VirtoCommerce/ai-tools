# VCST-5707 list sharing — below-floor findings (Low, not filed) — 2026-09-29

**Env:** vcptcore-qa · theme 2.59.0-pr-2476-0604 · XCart pr-141 · Cart pr-194 · SalesRep pr-21 · **Found by:** /qa-test VCST-5707 (3x / 4a / 4v / C1 REG-2026-09-29-1506)
Kept as the durable record per the 5-file severity floor; promote to the tracker only on a human request or recurrence.

| # | Finding | Evidence |
|---|---|---|
| L1 | Every sharing `INVALID_OPERATION` returns the generic "Error trying to resolve field 'changeWishlist'." — the specific server message (empty set, add+remove same id, message > 1024) never reaches the caller | `screenshots/4a-be-E3-empty-set.json` |
| L2 | `addSharedWithIds` / `removeSharedWithIds` sent without `scope` → HTTP 200, no errors, nothing written (also with an unserved org id) — a silent no-op | `screenshots/4a-be-E9-delta-without-scope.json`; C1 WISH-043 |
| L3 | No success toast after Stop sharing, after saving Anyone with link, or after saving My organization (Specific customers saves show one) | 4a D-section |
| L4 | List card says "Shared" for both Anyone-with-link and My-organization lists — the two cannot be told apart | `screenshots/4a-fe-lists-cards-status.png` |
| L5 | The saved share message is not rendered on the recipient's `/shared-list/<key>` page (API returns it; it only reaches the recipient via push) | `screenshots/4a-fe-reader-acme-shared-list-view.png`; C1 B2C-LIST-079 |
| L6 | Picker count ignores the singular: "1 items selected" (also fr/es/ru) | C1 B2C-LIST-060 |
| L7 | Notification language follows the SENDER's UI culture (a German-UI rep sends German text to an English-UI buyer) | C1 B2C-LIST-080 |
| L8 | "My organization" scope never names which organization — the rep is a member of 4 (active org is used implicitly) | 3x, 4a D6 |
| L9 | "Show all / Show less" has no `aria-expanded`; empty-set hint and "Cleared · N / Undo" not confirmed as live regions | `design-report.md` F5 |
