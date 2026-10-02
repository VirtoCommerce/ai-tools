# Scheduled qa-autofix run — 2026-10-01 07:10 UTC

**Headline:** VCST-6096 + VCST-6100: 2 PRs opened, review messages ready

| Ticket | Result | PR | CI | Jira |
|---|---|---|---|---|
| VCST-6096 (VcButton loading has no accessible name) | reproduced → fixed | https://github.com/VirtoCommerce/vc-frontend/pull/2528 | in progress (cla/Sonar/CodeQL/Semgrep/OSV green, `ci` running) | In review |
| VCST-6100 (search_bar view_item_list on page load) | reproduced → fixed | https://github.com/VirtoCommerce/vc-frontend/pull/2529 | in progress (cla/Sonar/CodeQL/Semgrep/OSV green, `ci` running) | In review |

Skipped: none (2 candidates in queue, both taken). Blocked: none — the built-in browser was not signed out (only anonymous storefront pages were needed).

Notes
- The connected folder is `ai-tools` (origin VirtoCommerce/ai-tools), not `vc-mcp-testing-module` as the task prompt says; it was used as the project root.
- vc-fix skills were not listed; the command files `plugins/vc-fix/commands/qa-bug.md` / `qa-fix.md` were followed directly.
- Jira REST (attachments) is not reachable from Elena's device shell, so the render screenshots for VCST-6096 were not attached; the comment says why.
- The requested reviewer list on both PRs is empty, so `@{reviewer}` is left as is.
- No requested reviewers; Teams chat checked — neither PR link posted yet.

## Teams — VCST-6096

```
На ревью фикс VCST-6096: у VcButton в состоянии loading пропадало доступное имя (кнопка «Browse files» в модалке сканера штрихкода)
https://github.com/VirtoCommerce/vc-frontend/pull/2528

• Что: в vc-button.vue контент при loading скрывается через opacity-0 вместо invisible (текст остаётся в дереве доступности) + aria-busy="true"
• CI: в процессе
• Jira: https://virtocommerce.atlassian.net/browse/VCST-6096 (In review)

@{reviewer} посмотри пожалуйста
```

## Teams — VCST-6100

```
На ревью фикс VCST-6100: событие view_item_list для search_bar уходило при загрузке страницы с ?q= без открытого дропдауна
https://github.com/VirtoCommerce/vc-frontend/pull/2529

• Что: в search-dropdown.vue импрешн search_bar отправляется только когда дропдаун visible
• CI: в процессе
• Jira: https://virtocommerce.atlassian.net/browse/VCST-6100 (In review)

@{reviewer} посмотри пожалуйста
```

Chat: https://teams.microsoft.com/l/chat/19:meeting_OTFjYzM1Y2ItODc2ZS00YzNkLTk2MTctMjM1MGNmZTg0NTA3@thread.v2/conversations?context=%7B%22contextType%22%3A%22chat%22%7D
