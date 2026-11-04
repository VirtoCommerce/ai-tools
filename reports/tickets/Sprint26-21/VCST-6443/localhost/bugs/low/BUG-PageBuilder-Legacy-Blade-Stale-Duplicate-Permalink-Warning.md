# [Low] Legacy page blade keeps a stale "Other pages have the same permalink" warning once the format is invalid

**Env:** localhost · PageBuilderModule 3.1036.0-pr-178-e4ff · Admin SPA, Edge
**Provenance:** IN-SCOPE (PR #178) · Below the 5-file severity floor, so not filed

**Summary:** after a duplicate permalink is changed to a value with an invalid format, the blade shows the format error and also keeps the old duplicate warning, although the new value is no longer a duplicate.

**Steps to reproduce:**
1. Publish a page with permalink `/X`.
2. In a new Design page, type `/X`. The duplicate warning appears.
3. Change the permalink to `/unrelated?x`.

**Expected:** only the format error.
**Actual:** the format error, plus the stale "Other pages have the same permalink: <page>" for a value that is no longer a duplicate.

**Root cause:** AngularJS skips the async duplicate validator while the new sync `permalinkFormat` validator fails, so the old warning is never cleared.

![Format error plus stale duplicate warning](../../screenshots/4a-be-cl27-blade-format-error-plus-stale-duplicate.png)

Refs: checklist CL-27 · KB-A7CA895E
