# Bug-Evidence Collections — an OPTIONAL artifact for a narrow class of defect

A Postman collection attached to a bug ticket, which reproduces the defect end to end and **flips
green when the defect is fixed**. Not a report (it is not one of the ten categories in
[`reports.md`](../../rules/reports.md) §1) and not a regression suite — a third thing, with a
different audience and a shorter life than either.

**This step is optional.** Skip it and nothing downstream breaks; the bug report and the regression
carrier still stand on their own.

---

## 1. When it applies — and mostly it does not

Build one only when **both** hold:

- the defect is reachable over HTTP (platform REST or GraphQL xAPI), **and**
- the finding is a **disagreement**, or needs **two or more controls** before it means anything.

That second clause is the whole test. If one request demonstrates the bug, paste a `curl` in the
report and stop — a collection adds ceremony and a maintenance surface for nothing.

**Does not apply to:** UI, visual, storefront-journey or Admin-SPA defects (most bugs); anything
needing browser state or a live session; anything a single request shows.

Realistically this is about one bug in ten. Applied wider, it becomes a tax on every filing.

## 2. Why it is worth building for that class

**It crosses the repo boundary.** The developer who has to fix a `vc-module-*` defect does not have
this repo — no `@td()` resolver, no layered env loader, no suite runner. A collection plus
`newman run` is reproducible with a Node install and three environment variables. Our normal
evidence is written in our tooling's dialect and is unrunnable by exactly the person who needs it.

## 3. The two gates — the Postman MCP is NOT required

| Step | Requires |
|---|---|
| Author the collection JSON, run it with Newman, attach it to the ticket | nothing beyond this repo |
| Publish a copy into the Postman workspace | Postman MCP, or `POSTMAN_API_KEY` for the REST fallback |

The evidence is the file and the run. **The workspace-hosted copy is the optional half of an
optional step** — build and attach the collection even where the MCP is unavailable.

## 4. Anatomy — the shape that makes it evidence rather than a script

Ordered, because the order is usually forced by the platform rather than by taste:

1. **SETUP — establish the precondition over the API,** so no seeder is a dependency. Read the
   entity id back rather than hardcoding it; ids are platform-assigned and change on re-seed.
2. **SETUP — READ BACK and prove the precondition took.** A `200` is not proof: some platform
   endpoints return `200` with a null body on an unknown id instead of `404`. Without this gate, a
   silently-failed setup leaves every later request returning `200` and the run passes while
   proving nothing.
3. **The defect request** — and it **asserts the CORRECT expectation, never the measured
   behaviour**. It fails while the bug is open; that failure *is* the evidence, and it goes green on
   the fix. This is what makes the collection a `/qa-verify-fix` instrument instead of an exhibit.
4. **The controls** — each one killing a specific alternative explanation. State in each request's
   `description` which explanation it eliminates, or a later reader will delete it as redundant.
5. **CLEANUP — teardown, then a final READ-BACK proving the fixture is at rest.** A teardown that is
   not verified is not a teardown.

**Never run one of these with `--bail`.** It stops at the failing defect request — which is expected
to fail — and skips the teardown, leaving shared fixture state mutated. Say so in the collection
description, because the next person's instinct is to add it.

**Do not assert which side is wrong** when the finding is a disagreement between two reads. That is
a product decision, and it usually determines which repo changes. Assert only that the two agree.

## 5. Secrets — the one non-negotiable rule

- The environment ships with every credential field **empty** and `type: "secret"`. A team-workspace
  environment syncs to the Postman cloud and is visible to the whole team; `type: "secret"` only
  *masks* a value in the UI, it does not stop it being stored or shared.
- Inject at run time: `--env-var "adminPassword=$ADMIN_PASSWORD_VCST"`. Resolve through
  `process.env` after importing `config.js`, never a literal ([`test-data.md`](../../rules/test-data.md)).
- **Never attach the raw Newman JSON report.** It embeds full request and response bodies, so every
  token grant lands in it — a VCST-5933 run produced 46 JWTs and two live passwords in one file.
  Attach a redacted capture: withhold the token responses, keep the assertion outcomes and the
  non-auth bodies, and state at the top what was removed. Scan the artifact against the literal
  values in `process.env` before it goes anywhere, then re-scan the copy the tracker serves back.

## 6. Relationship to the regression carrier — state it or they drift

A collection and a CSV suite case can assert the same thing without duplicating, but only if the
roles are written down:

| Artifact | Role | Lifetime |
|---|---|---|
| Suite case in `regression/suites/` | durable coverage, runs in CI, resolves data via `@td()` ([`regression.md`](../../rules/regression.md)) | permanent |
| Bug-evidence collection | portable handoff to the owning repo's developer, and the verify-fix instrument | ticket-scoped |

The collection is **not maintained after the ticket closes** — the ticket attachment is its archive,
and the suite case is what lives on. A local mirror under `test-data/postman/` is a working copy, not
a deliverable; regenerate it from the workspace in the same turn you edit either one, or they diverge
silently.

## 7. Running and verifying

```bash
npx newman run <collection.json> -e <environment.json> \
  --env-var "adminPassword=$ADMIN_PASSWORD_VCST" \
  --env-var "b2bUserPassword=$DEFAULT_TEST_PASSWORD" \
  --reporters cli,json --reporter-json-export results.json
# no --bail, ever (§4)
```

Expected outcome while the defect is open: every request executes, and **exactly one assertion
fails** — the defect request. Any other failure means the collection is broken, not the product.

Audit the collection before handing it off with the checklist in [execution.md](execution.md) §2.
