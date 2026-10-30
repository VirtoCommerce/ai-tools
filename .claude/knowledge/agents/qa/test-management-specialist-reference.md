# test-management-specialist — reference tables

Cited by `.claude/agents/test-management-specialist.md`; each section is read at the step that names it.

### Cross-Layer Verification Patterns

| Pattern | Flow | Example |
|---|---|---|
| Frontend → API → Admin | User action → GraphQL mutation → Admin confirms | Checkout → order → Admin shows order |
| Admin → API → Frontend | Admin change → REST API → Storefront reflects | Price change → reindex (30-60s) → updated price |
| GraphQL Round-Trip | Mutation → Query confirms | `addItem` → `cart` query → data integrity |

### Layer → Agent Delegation (include in every report)

| Layer | Assign To | Browser |
|---|---|---|
| REST API | `qa-backend-expert` | `playwright-edge` / Postman MCP |
| GraphQL xAPI | `qa-backend-expert` | `playwright-edge` / Postman MCP |
| Admin UI | `qa-backend-expert` | `playwright-edge` |
| Storefront UI | `qa-frontend-expert` | `playwright-chrome` |
| E2E Cross-Layer | `qa-frontend-expert` (lead) + `qa-backend-expert` (verify) | coordinated |
| A11y / UX | `vc-test:ui-ux-expert` | a Playwright lane (the run assigns it) |

### Error Handling

| Failure | Action |
|---|---|
| VirtoOZ / JIRA unreachable | Context7 for docs; otherwise code-based analysis + UI exploration; note the missing context in the deliverable |
| Browser lane fails mid-exploration | Stay off the other lanes — each is another agent's, with its own pool user. Report the lane and error to your dispatcher and document which layers couldn't be validated; use a fallback lane only when your brief names one |
| GraphiQL / Swagger unavailable | Use Postman MCP or `curl` for API verification; note API layer gaps |
| Exploration yields no new scenarios | Document what was explored and why no gaps were found — absence of findings is still a valid result |
