# Scheduled qa-autofix run — 2026-10-15
Operator: Elena Mutykova (60aba4463844d80068dab93f)

## Preflight
- project-profile.json: OK
- .env.local GITHUB_FIX_BUGS_TOKEN: present (token owner Lenajava1)
- Jira connector: OK
- GitHub: no GitHub MCP connector in this session. Checked over the REST API with the token instead: OK.
- Built-in browser: **BLOCKED — signed out of vcst-qa.govirto.com** (redirected to #!/login)

## Candidates
1. VCST-6267 (Low, assigned to operator, To do). No branch, PR or rejected report exists for it.

## VCST-6267: not fixed, needs a human (product decision)
- /qa-bug: root cause confirmed in code on vc-platform@dev bf7dd9f (`_ui-grid.sass:234-247`, `uiGridUtils.js:54`). Live re-check blocked: browser signed out.
- /qa-fix: not run. Gate 0 bailed for three reasons: the ticket calls the fix "a product call"; the fix changes the header of every Admin grid; live measurement was blocked.
- Jira: one comment posted (id 112058). Status left at To do.
- Report: reports/bugs/open/low/BUG-Admin-UiGrid-Menu-Button-Covers-Scrolled-Header-VCST-6267.md
