# Test Runner Agent — failure trace file

Cited by `.claude/agents/test-runner-agent.md`; read it only for a real FAIL (Phase 2 step 8b).

### Failure trace file (real FAIL only — Phase 2 step 8b)

Written to `reports/regression/{{RUN_ID}}/traces/{TC-ID}-FAIL-trace.json`, referenced by the case's `trace` field, gitignored (secrets-redacted; the repo is public). Shape:

```json
{
  "caseId": "SMK-008", "suiteId": "{{SUITE_ID}}", "runId": "{{RUN_ID}}",
  "capturedAt": "<ISO>", "url": "<page URL at failure>",
  "failedAssertion": "[MATH] line total = unit price × quantity",
  "networkFailures": [
    {
      "method": "POST", "url": "/graphql (SearchProducts)", "status": 500,
      "requestBodySnippet": "{\"query\":\"…\"}",
      "responseBodySnippet": "{\"errors\":[{\"message\":\"…\"}]}",
      "graphqlErrors": ["Object reference not set to an instance of an object"]
    }
  ],
  "consoleErrors": [
    {
      "level": "error",
      "message": "TypeError: Cannot read property 'price' of undefined",
      "stack": ["at ProductCard.vue:47:12", "at renderList (runtime-core.esm.js:2233)", "…"]
    }
  ]
}
```

Only real FAILs get a trace — a `BLOCKED`/`SKIPPED`/`AMBIGUOUS` row never sets `trace`.
