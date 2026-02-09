# CI Regression Testing with Claude Agent SDK

Run Claude Code agents for regression testing in GitHub Actions using Docker.

## Architecture

```
GitHub Actions (workflow_dispatch)
  └── Docker container (Playwright image + Claude Agent SDK)
        └── ci/run-regression.ts (orchestrator)
              ├── Reads suite CSV from regression/suites/
              ├── Reads agent definition from ci/agents/
              ├── Calls Agent SDK query() with Playwright MCP
              └── Saves reports to reports/regression/
```

## Quick Start

### Run locally with Docker

```bash
# Build the image
docker build -t vc-regression -f ci/Dockerfile .

# Run smoke tests
docker run --rm \
  --shm-size=2gb \
  --env-file .env \
  -e ANTHROPIC_API_KEY=your-key \
  -e SUITE_SELECTION=smoke \
  -e TEST_ENVIRONMENT=qa \
  -e MAX_BUDGET_USD=5.0 \
  -v $(pwd)/test-results:/app/test-results \
  -v $(pwd)/reports:/app/reports \
  vc-regression
```

### Run via GitHub Actions

1. Go to the **Actions** tab in GitHub
2. Select **Regression Tests** workflow
3. Click **Run workflow**
4. Configure:
   - **Suite selection**: `smoke`, `full`, `critical`, `sprint`, or comma-separated IDs (`01,02,03`)
   - **Environment**: `dev`, `qa`, or `staging`
   - **Max budget**: USD limit for the run
   - **Max turns**: Maximum agent turns per suite
   - **Model**: `claude-sonnet-4-5-20250929` (default) or `claude-opus-4-6`

## Suite Selection Options

| Selection | Suites | Estimated Cost | Estimated Time |
|-----------|--------|---------------|----------------|
| `smoke` | 01 | ~$2-5 | ~30 min |
| `critical` | 01, 06, 08 | ~$10-15 | ~2 hrs |
| `sprint` | 01-06, 08 | ~$20-35 | ~4 hrs |
| `full` | All 14 suites | ~$40-80 | ~8 hrs |
| `01,04,06` | Custom selection | Varies | Varies |

## Environment Variables

### Required (GitHub Secrets)

| Secret | Description |
|--------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `VCST_FRONT_URL` | Frontend URL |
| `VCST_BACK_URL` | Backend URL |
| `ADMIN` / `ADMIN_PASSWORD` | Admin credentials |
| `USER_EMAIL` / `USER_PASSWORD` | Test user credentials |
| `STORE_ID` | Store identifier |

### Optional (for specific suites)

Payment secrets (suite 06): `SKYFLOW_*`, `CYBERSOURCE_*`, `AUTHORIZNET_*`, `DATATRANCE_*`

## File Structure

```
ci/
├── Dockerfile                         # Docker image definition
├── run-regression.ts                  # Main orchestrator script
├── tsconfig.json                      # TypeScript config
├── agents/                            # CI agent definitions
│   ├── qa-testing-expert.md
│   ├── qa-frontend-expert.md
│   └── qa-backend-expert.md
├── config/
│   └── mcp-playwright-chrome.ci.json  # Headless Chrome config
└── README.md                          # This file
```

## Cost Optimization

- Default model is Sonnet (5x cheaper than Opus)
- Budget caps enforced per run via `MAX_BUDGET_USD`
- Turn limits per suite via `MAX_TURNS`
- Sequential execution avoids API rate limits
- Start with `smoke` to validate setup before running `full`
