# Customer Test Authoring — Writing Your Own Suites

> **Audience:** Customer QA leads writing suites for their own custom features. Not the shipped reference suites — those live under `regression/suites/Frontend/` and `Backend/` and stay maintained by VC. You write *your* suites under `regression/suites/customer/`.
>
> **Time:** First suite ~1–2 hours. After 3–5 suites you'll be productive in 15–30 min each.
>
> **Prereq:** Plugin installed, `npm run plugin:check` green, you've run at least one `/qa-smoke` successfully.

## What you write vs what the plugin ships

| Scenario | Where it lives | Who writes it |
|----------|---------------|---------------|
| Standard cart, checkout, login flows | `regression/suites/Frontend/...` | VC ships, you configure via `@td()` |
| Standard admin module surfaces | `regression/suites/Backend/...` | VC ships, you configure via `MODULES_ENABLED` |
| **Your custom module** | `regression/suites/customer/modules/<your-module>/` | **You** |
| **Your custom checkout flow** | `regression/suites/customer/checkout/` | **You** |
| **Your custom theme / branded UI assertions** | `regression/suites/customer/ui/` | **You** |
| **Your business-specific BL invariants** | Your `aliases.json` + `regression/suites/customer/<domain>/` | **You** |

**Three rules:**
1. Don't edit shipped reference suites — plugin updates will overwrite your changes. If a reference suite is wrong for your deployment, fork it into `regression/suites/customer/` and adapt the copy.
2. Use the same Enriched CSV format and `@td()` resolver as the reference suites. The orchestrator and agents won't recognize anything else.
3. Track your suites in `config/test-suites.json` like the shipped ones (you'll add entries for your customer suites — see § 5 below).

## Section 1 — The Enriched CSV Format (15 columns)

Every test case is a row in a `.csv` file. Same format VC's internal team uses for the shipped suites.

```
ID,Title,Section,Priority,Business_Rule,Edge_Case_Refs,Preconditions,Test_Data,Steps,Assertions,Cross_Layer_Checks,Failure_Signals,Cleanup,References,Automation_Status
```

| Column | What goes in it | Example |
|--------|----------------|---------|
| `ID` | Unique per-suite case ID. Convention: `{DOMAIN}-{N}` | `MYCHECKOUT-001` |
| `Title` | One-line description in test-doc style | `Place order with custom gift-wrap option, verify wrap-fee on receipt` |
| `Section` | Logical grouping within suite | `Custom Checkout > Gift Wrap` |
| `Priority` | `P0`, `P1`, `P2`, `P3` | `P1` |
| `Business_Rule` | BL invariant ID this validates (yours or VC's) | `BL-CHK-006` (VC) or `BL-MYCO-GIFTWRAP-001` (yours) |
| `Edge_Case_Refs` | ECL invariant IDs if applicable | `ECL-1.2` |
| `Preconditions` | State that must exist before the test runs | `[PRE:SIGNIN_AS:USER_DEFAULT]<br>[PRE:RESET_CART]<br>Gift-wrap option enabled in Store Settings` |
| `Test_Data` | Env vars + `@td()` aliases the test uses | `url={{FRONT_URL}},sku=@td(TEST_PRODUCT_SIMPLE.sku),wrap_fee=@td(MYCO_GIFTWRAP.fee)` |
| `Steps` | Numbered, agent-readable steps with tags | `1. [NAV] Open /cart with item present<br>2. [ACT] Select "Add gift wrap" checkbox<br>3. [WAIT] Wait for cart re-totaling<br>4. [ACT] Proceed to checkout, complete order` |
| `Assertions` | What must be true at the end | `[DOM] Order confirmation page shows gift-wrap line item<br>[FORMAT] Wrap fee equals @td(MYCO_GIFTWRAP.fee)<br>[API] Order total = subtotal + wrap_fee + shipping + tax` |
| `Cross_Layer_Checks` | Validations across UI + API + DB | `[API] order.items[] includes gift-wrap line<br>[CONSOLE] no uncaught JS errors` |
| `Failure_Signals` | Symptoms of test failure | `Wrap fee not added; order total wrong; gift-wrap line missing from API response` |
| `Cleanup` | What to undo after the test | `cancel order; remove from cart` |
| `References` | JIRA tickets, docs, source links | `JIRA: MYCO-1234; spec: docs/gift-wrap-flow.md` |
| `Automation_Status` | `Draft`, `Ready`, `Stable`, `Flaky`, `Quarantined` | `Draft` (until proven) |

**Tag reference for `Steps` and `Assertions`:** see `.claude/agents/knowledge/test-runner-tags.md` (shipped with the plugin). Common tags:
- Steps: `[NAV]` navigate, `[ACT]` interact, `[WAIT]` wait for condition, `[ASSERT]` inline check, `[SETUP]` precondition action
- Assertions: `[DOM]` DOM state, `[FORMAT]` formatted value match, `[STATE]` derived state, `[API]` REST/GraphQL response, `[CONSOLE]` console log/error

## Section 2 — The `@td()` Resolver

Test cases never hardcode IDs/SKUs/emails/prices. Everything goes through one of:

| Layer | Syntax | Example | When to use |
|-------|--------|---------|-------------|
| Env var | `{{VAR}}` | `{{FRONT_URL}}` | Per-env constants (URLs, credentials). Set in `.env.${TEST_ENV}` or `.env.local`. |
| Alias from `aliases.json` | `@td(ALIAS.field)` | `@td(TEST_PRODUCT_SIMPLE.sku)` | Specific entities you assert against. Same value across envs, OR per-env override via `aliases.${TEST_ENV}.json`. |
| Live discovery | (use `scripts/lib/live-discover.ts` in custom helpers) | `discoverFirstCart()` | Any matching entity; assert shape not exact values. For things that drift between seeds. |
| Random data | (use `scripts/lib/random-data.ts`) | `randomEmail("AGENT-TEST-")` | Unique inputs you don't assert on (registration emails, org names). |

**Decision tree:**
- Is this a per-env config (URL, password)? → `{{VAR}}` from env files.
- Is this a specific entity you assert against by name? → `@td(ALIAS.field)`, add to `aliases.json`.
- Could it be any entity of a type? → `live-discover`.
- Is it ephemeral and never asserted? → `random-data`.

**Adding your own aliases** — edit `test-data/aliases.json` (or `test-data/aliases.${TEST_ENV}.json` for env-specific overrides). Two forms:

```json
"MYCO_GIFTWRAP": {
  "_inline": true,
  "_comment": "Custom gift-wrap fee structure for MyCo's storefront",
  "fee": "5.99",
  "tax_rate": "0.08",
  "max_per_order": "3"
}

"MYCO_VIP_CUSTOMER": {
  "file": "users/customer-vip",
  "filter": { "tier": "platinum" },
  "fields": {
    "email": "email",
    "discount_pct": "loyalty_discount"
  }
}
```

Validate after editing: `npx tsx scripts/validate-td-refs.ts` (catches unresolvable `@td()` calls in any suite).

## Section 3 — Where to Put Your Suites

```
regression/suites/customer/                       ← all customer-authored suites live here
├── modules/                                       ← custom modules
│   ├── giftwrap/
│   │   ├── 100-giftwrap-pdp.csv
│   │   └── 101-giftwrap-checkout.csv
│   └── loyalty-custom/
│       └── 110-loyalty-tier-discounts.csv
├── checkout/                                      ← custom checkout customizations
│   └── 120-multi-step-checkout-custom-validation.csv
├── ui/                                            ← branded theme assertions
│   └── 130-myco-header-branding.csv
└── README.md                                      ← convention reminder (you maintain)
```

**Numbering convention:** start customer suite IDs at `100` to leave room for future shipped reference suites (current ceiling: `080`). Use sub-prefixes by domain: `1xx` for modules, `12x` for checkout, `13x` for UI, etc.

**Per-suite file size:** keep CSVs under 50 test cases. Split larger surfaces into multiple suites (a/b/c suffixes work well — see VC's `072` / `072b` / `072c`).

## Section 4 — Writing Your Own BL Invariants

Use the same `BL-{DOMAIN}-{NNN}` ID convention as VC, but **namespace your BL IDs** with a customer prefix so they don't collide with VC's:

| VC ships | You author |
|----------|-----------|
| `BL-CHK-006`, `BL-CART-001`, `BL-PRICE-003` | `BL-MYCO-GIFTWRAP-001`, `BL-MYCO-LOYALTY-002` |

Document your BLs in your own knowledge file (suggested: `regression/suites/customer/business-logic.md` or as inline comments in suite CSVs via the `Business_Rule` column).

VC's BLs in `.claude/agents/knowledge/business-logic.md` are the standard for VC platform behavior — don't modify or override them. If you think VC's BL is wrong on your deployment, that's a discussion with VC support, not a local override.

## Section 5 — Register Your Suite in `config/test-suites.json`

After authoring a CSV, add an entry so the orchestrator can find + filter it:

```json
{
  "id": "100",
  "name": "Custom Gift Wrap PDP",
  "file": "regression/suites/customer/modules/giftwrap/100-giftwrap-pdp.csv",
  "domain": "purchase-flow",
  "layer": "frontend",
  "concern": "functional",
  "priority": "P1",
  "testCount": 12,
  "estimatedMinutes": 8,
  "agent": "qa-frontend-expert",
  "tags": ["customer-authored", "myco", "giftwrap"],
  "storefrontProfile": ["b2c", "hybrid"],
  "requiresModules": ["giftwrap-myco"],
  "envRiskGate": "staging"
}
```

Validate: `npm run suites:lint`. The schema is in `config/test-suites.schema.json`.

**Custom module name in `requiresModules`:** use whatever your team calls the module. The plugin doesn't validate against a fixed list — your env's `MODULES_ENABLED` declares what you have, and the orchestrator matches.

## Section 6 — Running Your Suites

Once registered:

```bash
# Run a single customer suite
npx tsx ci/run-regression.ts -- 100

# Run all customer-authored suites (via a tag selector — add a selection rule first):
# In config/test-suites.json under "selections":
#   "customer-only": { "where": { "tag": "customer-authored" } }
# Then:
npm run ci:regression -- customer-only

# Or mix VC reference suites with yours
npm run ci:critical          # VC-shipped P0 selection
TEST_ENV=qa SUITE_SELECTION=100,101,110 npm run ci:regression   # comma-separated IDs
```

Your suites run with the same multi-env filters as VC's:
- `MODULES_ENABLED=giftwrap-myco` to enable suites tagged `requiresModules: ["giftwrap-myco"]`
- `STOREFRONT_PROFILE=b2c` to skip B2B-only customer suites
- `ENV_RISK=production` to skip your write-tagged customer suites (unless you pass `--allow-admin-writes-on-prod`)

## Section 7 — Cloning a Reference Suite

Easiest way to start writing: find the closest VC reference suite, copy it into `customer/`, adapt.

```bash
# Example: building gift-wrap-checkout, adapt from VC's standard checkout
cp regression/suites/Frontend/checkout/011-checkout-flow.csv \
   regression/suites/customer/checkout/101-myco-giftwrap-checkout.csv
```

Then:
1. Edit IDs (`CHK-001` → `MYCO-CHK-001`)
2. Replace `@td(TEST_PRODUCT_SIMPLE.sku)` references with your custom-product aliases
3. Insert your custom step (e.g., "Select gift-wrap option")
4. Update assertions to validate your custom behavior
5. Register in `config/test-suites.json` with a new ID (start at 100+)
6. Run + iterate

The reference suite's tag patterns (`[NAV]`, `[ACT]`, `[ASSERT]`, etc.) all keep working in your copy — same agents, same orchestrator.

## Section 8 — Reviewing Your Own Suites

VC ships `/qa-review-tests` skill with 8 quality dimensions. Use it on your customer suites:

```
/qa-review-tests file regression/suites/customer/modules/giftwrap/100-giftwrap-pdp.csv
```

Dimensions checked: structure, determinism, completeness, testability, data validity, BL/ECL coverage, duplication, env verification.

## Section 9 — Maintaining Your Suites Across Plugin Updates

The plugin auto-updates (per `docs/distribution.md`). Plugin updates can change:
- The Enriched CSV format (Tier A frozen at v1.0 — won't break)
- The `@td()` resolver syntax (Tier A frozen at v1.0 — won't break)
- The orchestrator filter behavior (Tier B — semver minor bumps may add new filters with safe defaults)
- The shipped reference suites under `regression/suites/Frontend/` and `Backend/` (Tier C — mutates freely)

**What stays yours forever:** everything under `regression/suites/customer/`, your `aliases.json` entries you added, your custom BL IDs (namespaced with your prefix).

**What might break across major versions:** any custom BL ID that accidentally collides with a VC BL ID (avoid by namespacing). Any suite that references a Tier B internal helper that got renamed (rare; migration guide will document).

See `docs/versioning.md` for the full stability contract.

## Section 10 — Common Customer-Authored Suite Examples

Quick patterns to start from. None of these ship — they're suggestions for what your team might author.

| If your storefront has... | Your suite covers... |
|---------------------------|----------------------|
| Custom checkout step (e.g., "Pre-order date picker") | Adds case to checkout flow asserting the picker appears, validates input, blocks invalid dates |
| Custom payment processor (not Skyflow/CyberSource/AuthorizeNet/Datatrance) | Clone suite 040, adapt for your processor's iframe/redirect/SDK contract |
| Custom B2B approval workflow | Test the threshold, approver assignment, post-approval order placement |
| Custom catalog model (e.g., subscription products) | Test product browse, add-to-cart with subscription terms, subscription-aware checkout |
| Branded theme with custom CSS | Visual regression suite (clone from `qa-design` patterns); assert key brand elements present |
| Custom Admin SPA blade | Test the blade renders, fields validate, save persists |
| Custom GraphQL resolver | Test query shape, response correctness, error cases |

## Section 11 — Running in CI

The plugin ships a customer CI template at `.github/workflows/customer-template.yml`.

**To use it in YOUR repo:**

1. Copy the template file into your own repo's `.github/workflows/regression.yml`
2. Set the secrets it references in your repo's Settings → Secrets and variables → Actions:
   - **Required:** `ANTHROPIC_API_KEY`, `VC_FRONT_URL`, `VC_BACK_URL`, `VC_ADMIN_USER`, `VC_ADMIN_PASSWORD`, `VC_STORE_ID`, `VC_TEST_USER_EMAIL`, `VC_TEST_USER_PASSWORD`
   - **Optional:** B2B user, payment-processor cards, Teams webhook (see template header for the full list)
3. Run the workflow manually from your Actions tab. The `workflow_dispatch` inputs let you pick suite selection, env risk, modules, etc. for each run.

**What the template does for you:**

| Step | Why |
|------|-----|
| Checks out the `vc-mcp-testing-module` repo as a subdir | You don't copy the plugin code into your repo — you pull the released version |
| Pins to `main` by default | **Change this to a release tag** (`ref: v1.0.0`) once we publish a v1.x release for stability |
| Runs `npm run verify:multi-env` before any LLM spend | Confirms the filter pipeline works against this version of the manifest BEFORE you burn tokens |
| Runs `npm run env:check` | Catches missing-secret problems before the regression starts |
| Reads `summary.json` and posts a GitHub Step Summary | Pass rate + cost visible without digging into artifacts |
| Uploads `test-results/` + `reports/regression/` + `reports/bugs/` as a 30-day artifact | Evidence retained per run |

**Multi-env safety:**

- `env_risk: production` (the default-blocking tier) BLOCKS all 45 write-heavy suites unless you also pass `allow_admin_writes_on_prod: true`
- `modules_enabled` lets you say "only test catalog + orders" if your deployment doesn't have marketing/loyalty/etc.
- `storefront_profile` lets B2C-only customers skip B2B suites entirely
- `payment_processors_enabled` lets you skip payment suites for processors you don't use

**Schedule a daily smoke:**

Uncomment the `schedule` block in the template and edit the cron:

```yaml
schedule:
  - cron: '0 6 * * 1-5'  # 6 AM UTC Mon-Fri
```

The workflow will run with the default inputs (smoke selection, ENV_RISK=test).

**Cost estimate per smoke run:**

- Smoke (≈26 cases): **$3-5**, ~18 min wall clock
- Critical (≈P0 suites): **$8-12**, ~45 min wall clock
- Full (all applicable): **$60-80**, 4-6 hours wall clock

These are LLM token costs only — GitHub Actions minutes are separate (and free for public repos / cheap for private).

## References

- Plugin entry point: [`docs/onboarding.md`](onboarding.md)
- Test-data resolver rule: [`../.claude/rules/test-data.md`](../.claude/rules/test-data.md)
- Report standards: [`../.claude/rules/reports.md`](../.claude/rules/reports.md)
- Enriched CSV template + 15-column spec: [`../.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md`](../.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md)
- Tag reference for Steps/Assertions: [`../.claude/agents/knowledge/test-runner-tags.md`](../.claude/agents/knowledge/test-runner-tags.md)
- Stability contract: [`./versioning.md`](versioning.md)
- Marketing one-pager (high-level positioning): [`./marketing-onepager.md`](marketing-onepager.md)
- Customer CI template: [`../.github/workflows/customer-template.yml`](../.github/workflows/customer-template.yml)
- Multi-env filter verification: [`../reports/multi-env-verification/`](../reports/multi-env-verification/) (generated by `npm run verify:multi-env:report`)
