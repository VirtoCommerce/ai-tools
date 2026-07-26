# Org-switcher search returns organizations that do not contain the search substring — P2

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368

## Summary
A partial-text search in the organization switcher returns organizations that do not contain the typed substring alongside the genuine matches. The `searchPhrase` is sent quote-wrapped, which defeats substring filtering so the backend effectively returns unrelated orgs.

## STR
1. Sign in as a multi-org user.
2. Open the organization switcher and type a partial term, e.g. `ACM`.
3. Review the results list.

## Expected vs Actual
- **Expected:** Only orgs whose name contains `ACM` (the ACME orgs).
- **Actual:** Non-matching orgs appear too — e.g. "(parentheses) Lone Star Outfitters" and "50% Off Redwood Provisions" — mixed in with the real ACME matches.

## Evidence
![Org search unrelated results](screenshots/B2C-ORG-007-CONFIRMED-org-search-unrelated-results.png)

## Root cause (suspected)
The org-switcher search wraps the user input in quotes before sending `searchPhrase`, turning an intended substring/contains query into a phrase/exact form and defeating filtering.

## Fix Routing
- **Repo:** vc-frontend (org switcher search)
- **Kind:** frontend
