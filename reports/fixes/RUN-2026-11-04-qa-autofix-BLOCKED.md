# qa-autofix scheduled run — 2026-11-04 — BLOCKED (preflight)

Operator: Elena Mutykova (60aba4463844d80068dab93f)
Environment: vcst — FRONT_URL https://vcst-qa-storefront.govirto.com, BACK_URL https://vcst-qa.govirto.com

## Preflight
- project-profile.json: OK
- .env.vcst with FRONT_URL/BACK_URL: OK
- .env.local GITHUB_FIX_BUGS_TOKEN: OK (GitHub API /user → 200)
- Jira connector: FAIL — searchJiraIssuesUsingJql on cloudId d65ef426-… returns 403 "The app is not installed on this instance" (also with virtocommerce.atlassian.net). atlassianUserInfo works; getAccessibleAtlassianResources lists the site with empty scopes.

## Result
Run stopped. No tickets queried, claimed, reproduced or fixed. No Jira changes, no branches, no PRs.
