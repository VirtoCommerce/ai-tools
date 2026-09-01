# GraphQL Fixture Library

Schema-validated xAPI operations — queries in [`queries/`](queries/), mutations in
[`mutations/`](mutations/) — plus the registry [`index.json`](index.json), whose `totalFixtures`
is the current count.

> **Not to be confused with `scripts/fixtures/graphql/`** — that is a 5-file set of
> *deliberately broken* operations that tests the runner's own validator. This directory
> is the curated golden set.

## What a fixture is for

**Nothing executes these files.** Only
[`validate-graphql-fixtures.ts`](../../scripts/graphql/validate-graphql-fixtures.ts) and
[`update-graphql-fixtures.ts`](../../scripts/graphql/update-graphql-fixtures.ts) read the
directory. A fixture earns its place two ways:

1. **A copy-paste source of a known-correct operation body** — the real field names, the
   `command:` wrapper, the `MoneyType` shape, the args that exist. The runner's CSV grammar has
   no fixture-reference tag; a case carries its operation inline under `[GQL-OP <label>]`, so the
   fixture is what you copy *from*.
2. **A drift canary.** Every body is validated against live introspection, so a backend rename
   turns a fixture red *before* a suite blames the product for it. The `used-by:` header line
   records which case IDs copied that body — that is the blast radius when one goes red.

Fixtures are validated for **shape, not for data**. They are never POSTed. Whether the operation
returns anything on a given environment is a suite's job.

## Using one

```bash
grep -n '"category": "cart"' index.json     # find by domain
cat mutations/addItem.graphql
```

The header is the calling contract — read `required-vars`, `optional-vars` and `runner-note`
before you copy the body. Then wire the inputs, per
[`graphql-test-cases-runner.md`](../../.claude/knowledge/api/graphql-test-cases-runner.md):

| Input kind | How |
|---|---|
| Env context (`STORE_ID`, `CULTURE_NAME`) | `{{VAR}}` |
| A named entity (SKU, org, coupon) | `@td(ALIAS.field)` — never a literal |
| Something an earlier op returned | `[GQL-CAPTURE setup_me.data.me.id → USER_ID]` |
| **Non-string scalars** (Int, Boolean, DateTime, enums, input objects) | a real GraphQL `$var` + `[GQL-VARS label] {"qty": 3}` |

That last row is the one that bites. `{{}}` substitution is textual, so `quantity: {{QTY}}`
produces an unquoted-but-still-wrong token. Fixtures that need it declare `gqlVars` +
`exampleVars` in `index.json` — see `currentOrganizationAddresses` and `loyaltyMissionProgress`.

Embedded quotes double inside a CSV cell (`""B2B-store""`).

## Adding one

**1. Write the file** in `queries/` or `mutations/`, named for the operation. Header block,
blank line, body. The validator parses the header and rejects a fixture without one:

```
# name: <operation>
# category: <domain — reuse an existing value from index.json>
# role: ORG_USER
# purpose: What it returns and why the fixture exists
# required-vars: STORE_ID (String)
# optional-vars: FIRST (Int — via $first)
# last-validated: (pending)
# known-issues: (none)
# used-by: (none yet)
# runner-note: <only when a caller can get it wrong — e.g. a non-string scalar>
```

Leave `last-validated` as a placeholder; step 3 stamps it.

**2. Register it in `index.json`** under `queries` or `mutations` (`path`, `category`, `role`,
`requiredVars`, plus optional `gqlVars` / `exampleVars` / `runnerNote` / `semantics` / `usedBy`)
**and bump `totalFixtures`**.

Both are manual and **neither is gate-enforced**: the updater only regex-bumps the top-level
`lastValidated`, and the validator never opens `index.json`. So an unregistered fixture still
passes validation and is simply undiscoverable. Keep `totalFixtures` equal to the file count.

> `index.json` is **CRLF**. A script that splices lines into it must split on `/\r?\n/` and
> re-join with `\r\n`, or it will silently produce a mixed-ending file — the same tolerant-matching
> rule the suite CSVs follow.

**3. Validate, then stamp:**

```bash
npm run graphql:fixtures:validate:refresh                    # re-introspects, then validates all
npx tsx scripts/graphql/update-graphql-fixtures.ts --refresh # stamps last-validated
```

Never type the `last-validated` date by hand — it is derived state, and a hand-written one claims
a validation that never ran.

## Maintenance

| Command | Does |
|---|---|
| `npm run graphql:fixtures:validate` | validate all against the cached schema; writes `reports/graphql-fixtures-validation.md`, **exits non-zero on any failure** |
| `npm run graphql:fixtures:validate:refresh` | same, re-introspecting live first |
| `npm run graphql:fixtures:update` | bump stamps + apply unambiguous `Did you mean "X"?` renames |
| `npm run graphql:fixtures:update:dry` | preview the above |
| `npm run graphql:fixtures:bump` | stamps only |
| `npm run graphql:fixtures:rename` | renames only |

Run the validator after any fixture edit **and after any backend deploy**. When a rename hint is
unambiguous the updater rewrites the field at the exact line/column and only commits the change if
the fixture then validates cleanly; anything ambiguous is left red for a human.

Related: [`graphql-schema.md`](../../.claude/knowledge/api/graphql-schema.md) (the introspected
schema reference, `npm run schema:refresh`) and
[`graphql-test-cases-runner.md`](../../.claude/knowledge/api/graphql-test-cases-runner.md) (the
CSV authoring grammar these bodies get pasted into).
