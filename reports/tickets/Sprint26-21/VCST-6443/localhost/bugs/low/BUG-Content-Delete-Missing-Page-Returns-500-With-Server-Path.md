# [Low] Content API DELETE of a missing page returns 500 exposing the server file path

**Env:** localhost · Platform 3.1089.0 · Content module (as deployed)
**Provenance:** OUT-OF-SCOPE incidental (not caused by PR #178) · Below the 5-file severity floor, so not filed

**Summary:** deleting a Content page file that does not exist fails the whole request with a 500 and returns the absolute server path.

**Steps to reproduce:** call `DELETE /api/content/pages/B2B-store?urls=<file that does not exist>.page`, alone or as one URL in a batch.

**Expected:** 404, or the missing entry is skipped.
**Actual:** 500 "Could not find file '/opt/…/cms-content/Pages/…'". The whole batch fails, and the absolute server path is returned to the caller.

Evidence: notes from the 4a backend lane and the CMS-242 investigation (VCST-6443 run, 2026-10-22).
