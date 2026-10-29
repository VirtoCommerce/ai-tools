# [Sales Rep xAPI] updateSalesRepTask returns the pre-save modifiedDate
Severity: Low · Provenance: PRE-EXISTING (probable — PR #26 did not change the handler's return path; not confirmed on a base build) · Not filed (below severity floor)
Env: vcptcore-qa, SalesRep 3.1016.0-pr-26-92d4 · Account: @td(SR_REP_PRIMARY)
Steps: createSalesRepTask → updateSalesRepTask (any change) → read the mutation's modifiedDate → salesRepTask(id).modifiedDate.
Actual: the mutation response carries the previous write's modifiedDate (e.g. 10:41:15.966Z, the create time); the read-back right after shows 10:41:16.535Z. Seen on every update.
Expected: the mutation echoes the persisted document, including the fresh modifiedDate (cf. BL-SR-018 for layouts).
Evidence: scratchpad raw log of 4a-be C-28d (not committed)
