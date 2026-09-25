# Sales-rep test data — the `fixtures` / `demo` profile pair

**This file is the single source of truth for the sales-rep provisioning layer.** The domain map
([`.claude/knowledge/domain/sales-rep.md`](../../knowledge/domain/sales-rep.md) §11) cites it and
states none of it; the enforcement row for the drift guard lives in
[`test-data-authoring.md`](../../knowledge/execution/test-data-authoring.md) §Where this rule is
enforced. Read this before seeding, tearing down or switching sales-rep data on any environment.

It lives with `/qa-seed-data` rather than in the domain map because none of it is a finding about the
FEATURE — it is how this repo *provisions* the feature, which is the skill's business.

---

## 1. Two profiles, one surface

| Profile | What it is | Who consumes it |
|---|---|---|
| `fixtures` (default) | The `AGENT-TEST` regression family: deterministic, prefix-marked, every name obviously synthetic | The 9 sales-rep suites (`domain/sales-rep.md` §7) |
| `demo` | Presentation-grade: real company names, real street addresses, real orders against real catalog products, real document titles backed by real openable files — **no `AGENT-TEST` string on any surface a viewer can see** | A live demo in front of a customer |

Correct for QA is unusable in front of a customer, and the reverse. The demo's presentation contract
is enforced by the spec module's own `demoProblems()` gate, which the seeder runs **before any
write** and `td:validate:sales-rep-demo` runs statically.

**They cannot coexist on one environment.** There is one rep list, one GLOBAL document library and
one served-org graph (`domain/sales-rep.md` §2a / §2b / §1 L2). Seeding either over a live other
yields a mixture that is neither a clean fixture set nor a credible demo: a demo document in the same
library as sixteen `AGENT-TEST-*` rows, or a demo rep's *Organizations served* field carrying both
real customers and paging-fixture orgs.

---

## 2. Switching profiles

```bash
TEST_ENV=<env> npm run seed:sales-rep-family -- --teardown            # tear down what is live now
TEST_ENV=<env> npm run seed:sales-rep-family -- --profile demo        # or --profile fixtures (default)
```

The live profile is recorded in `_meta.dataset_profile` of `test-data/aliases.<env>.json`
(`sales-rep-demo` / `sales-rep-fixtures`). The bracketing is deliberately **asymmetric**: stamped
**before** the chain runs, so a run that dies halfway still blocks the other profile; cleared only
**after** a fully clean teardown. `assertProfileFree()` in `seed-sales-rep-family.mjs` refuses to
seed one profile over a live other and prints the teardown command rather than interleaving them.

> **The stamp is written by the FAMILY ENTRYPOINT ONLY.** `seed-sales-rep-demo.mjs` run directly
> writes the id ledger but **not** the stamp — so `assertProfileFree()` reads `null` and allows
> anything, and `td:reconcile` check [12] stays on the fixtures branch. Always switch profiles
> through `seed:sales-rep-family`. A direct run leaves the guard disarmed, which is how a routine
> `seed:bootstrap` could drop the fixture family onto a live demo.

`seed-bootstrap.mjs` registers the family at priority **142** (after orders, before quotes) and as
the **first** `TEARDOWN_STEPS` entry — the family is the most dependent domain, so it must release
everything before `company-users` deletes the orgs its memberships point at. Consequence worth
announcing on any shared env: **`bootstrap --teardown` now destroys the sales-rep fixture family,
which it previously did not.**

---

## 3. `npm run sr:inventory` — what a per-CSV teardown structurally cannot do

`inventory-sales-rep.mjs` enumerates **every** sales-rep entity on an environment, whatever created
it, and classifies each into four buckets:

| Bucket | Test | Recreatable |
|---|---|---|
| `protected` | email ∈ `SR_DEMO_PROTECTED_EMAILS` — a real person's reused account | never deleted; their ORDERS are excluded from the sweep too |
| `repo-seeded` | matches a committed CSV / spec row | yes — `npm run seed:sales-rep*` |
| `repo-family` | carries `AGENT-TEST` or `DEMO-SR`, no current CSV/spec row — an orphan | only by re-adding the row |
| `foreign` | carries neither — hand-made in the Admin UI | **no** |

It exists because a per-CSV or per-ledger teardown can only see what it itself declared. A rep
created by hand, or a document whose CSV row was deleted since, is invisible to it — so it reports a
clean sweep over a surface that is still populated.

Two-phase, confirm-token-gated:

```bash
TEST_ENV=<env> npm run sr:inventory                     # read-only: report + a sha256-derived token
TEST_ENV=<env> npm run sr:inventory:delete -- --token <t> --env-confirm <env> \
                                              [--include-foreign] [--include-orgs]
```

The delete phase re-enumerates, recomputes the token and **aborts if it differs** — the environment
moved since the report was read, so the prior approval no longer covers this set. `--delete`
additionally requires `--env-confirm <TEST_ENV>`, which is what keeps the overlay prune away from
another environment's alias file. The Phase-A plan JSON is the **only record that the `foreign`
entities ever existed** — archive it before deleting.

---

## 4. Why the demo needs a marker and a ledger, and why one is not enough

`AGENT-TEST-` is not decoration — it is the delete mechanism. Dropping it from every visible field
is the whole point of the demo, so two other handles replace it.

**Hidden marker.** `demoMarker(type, key)` → `` `DEMO-SR:<type>:<key>` `` is stamped into `outerId`
on every globally-enumerable entity (`Member`, `CustomerOrder` — both `IHasOuterId`). No storefront
fragment and no Admin grid column renders `outerId`. The prefix is deliberately **not**
`AGENT-TEST`, or `sweepAgentTestMembers()` in `user-provision.mjs` could reach the demo set during an
unrelated b2b teardown.

**Id ledger.** The `_`-prefixed overlay key `_demo_sales_rep_ledger` in `test-data/aliases.<env>.json`
covers the two entity types with no spare field at all: a sales-rep document's create body is closed
(`fileId/category/name/summary/pageCount/previewUrl`, every one of which renders) and a task's five
inputs are all list/filter/detail fields. The leading underscore is load-bearing —
`selectProbeTargets()` in `overlay-specs.mjs` skips `_` keys, which is the only thing keeping
`td:reconcile` check [11] from member-probing every order and file GUID in the ledger and reporting
each as STALE. The key is exported once as `DEMO_LEDGER_KEY` from `sales-rep-demo-specs.mjs`; the
seeder, reconcile and the drift guard all import it.

**Neither layer alone is sufficient.** A ledger cannot survive an interrupted run or a reverted
overlay; a marker cannot reach a document or a task. Teardown therefore reads the ledger first and
sweeps by marker for orphans.

**Verified live 2026-09-23**, not assumed: `npm run sr:probe-markers` (`probe-demo-markers.mjs`) is a
self-cleaning create→GET→PUT→GET round trip over three throwaway rows. `Organization`, `Contact` and
`CustomerOrder` `outerId` all round-trip through **create AND update**. That second half is the one
that matters — a field the platform accepts on `POST` but drops on `Patch` would make the orphan
sweep a silent no-op that *reports success*. Re-run this probe after a platform upgrade.

---

## 5. Reusing a real person's account as a rep

The demo's two reps are real colleagues. Three rules follow, and the seeder enforces all three:

1. **Never `POST /api/sales-rep` for them.** It is a CREATE shape carrying `password`, and
   `ensureRep()` in `seed-sales-rep.mjs` calls `resetSecurityPassword()` on every reseed of an
   existing rep — pointing it at a real account resets that person's password. The demo seeder's
   only rep write is `PUT /api/sales-rep` with a longer `organizations` list.
2. **A rep who is not already a rep is SKIPPED**, never created. `resolveReps()` reports
   `SKIP … not-a-rep` and the rest of the dataset seeds around them.
3. **Roles are asserted, never forced.** `DEMO_REPS[].salesRepRole` is checked against the rep's live
   `roleName`; the seeder never mutates a role it did not create.

**Promoting an existing account to rep (the manual step 2 leaves to a human).** The documented
mechanism is the **global account role** — `PlatformUserGuide` §Sales Rep overview: *"A **global
role** marks a user as a rep without tying them to any specific customer"*, and *"**Reuse existing
data**: Model a rep from a contact, a login account, and a role, with no new data structures."*
`{DOC}`. So for an account that already has a contact and a login, the safe promotion is a
GET-merge-PUT on `/api/platform/security/users` adding the role — that endpoint carries **no
password field at all**. Verified live 2026-09-23 on `oleg@virtoworks.com`: adding
`Advanced Sales Representative` made `GET /api/sales-rep/{memberId}` resolve with
`hasGlobalSalesRepRole: true` and put him in `POST /api/sales-rep/search`, with no second Contact
created (the rep id is his existing contact id).

**Which role matters.** Per `domain/sales-rep.md` §3b, a plain `Sales Representative` gets **no
Document library** — no sidebar link, no dashboard widget. A demo rep who must show documents needs
`Advanced Sales Representative`.

**Passwords.** `SR_DEMO_REP_{VOLKOVA,ZHUK}_PASSWORD_<ENV>` in `.env.local` are only ever **read**, to
mint a rep-scoped token for tasks, rep carts and the four Customer-scoped shared lists (tasks are
private to their owner, so there is no admin REST surface for them). Without them every one of those
steps falls back to an operator's login-on-behalf (the chain below); only when no operator works
either does the seed skip them. Verified live on vcst 2026-09-24: all 12 tasks seeded with no rep
password and render on the hub's **Calendar** page and the dashboard's *Tasks & due dates* widget.

**Active carts are the BUYERS', not the reps'.** `DEMO_CARTS` gives each buyer contact one non-empty
cart, created with that buyer's own token inside their organization (`SR_DEMO_BUYER_PASSWORD`, no rep
password needed). The seeder skips any pool product the cart refuses (`CART_PRODUCT_UNAVAILABLE`,
`PRODUCT_PRICE_INVALID`), because the pool is discovered for admin-POSTed orders, which never check
whether a product can be bought. These carts do **not** move the rep dashboard's *Active carts*
tile: cart statistics are creator-scoped (BL-SR-002 half b), so the tile counts only carts the rep
created.

**The tile is fed by `DEMO_REP_CARTS` instead** — one default cart per (rep, served org), built with a
token acting as the rep inside that org. With no rep password the seeder logs in on behalf of the rep
through the first configured operator: `SR_DEMO_OPERATOR_*`, then `IMPERSONATION_ADMIN_*`, then
`USER2_*`. USER2 usually lacks `platform:security:loginOnBehalf` — on vcst it does, and that is why
the Customer-scoped lists were skipped before this fallback existed. `unselect` switches off that many
of the smallest-quantity **non-gift** lines, so the tile's "not for checkout" figure is non-zero.
Verified live on vcst 2026-09-24: the tile read exactly the seeded sums (44 items, 6 not for
checkout). Two things to know when reading it: an env cart promotion adds a **gift** line to every
cart, which the tile's item figures include and the header cart badge does not; and an org's
`productMatch` word can occur in an unrelated product's name ("…without printer"), which is what
the per-org `productExclude` is for. The `_<ENV>`
suffix must match `TEST_ENV` exactly — a re-arranged name is never promoted and the miss is silent.

---

### One Contact can have TWO login accounts — and only one of them is the rep

**The trap that will cost the most time, measured live on virtostart 2026-09-23.** A Contact carries a
list of emails, and the platform will hold a **separate `ApplicationUser` per email** pointing at that
same Contact. Only one of them is the account the **sales-rep record** uses (`rep.userId`), and
**organization memberships hang off that account**.

`SalesRepOrganizationAccessService.GetGrantingMembershipsAsync()` filters by the **authenticated user
id** (`domain/sales-rep.md` §10 A3). So a session signed in as the *other* email gets a token that
carries `sales-rep:access` — the hub renders in full, Document library and all — over **zero granting
memberships**: no customers, no orders, every counter 0, and **no error anywhere**. It reads exactly
like broken seed data.

Measured on the contact *Alla Volkova*, who has both:

| Account | userId | Org memberships | `salesRepCustomers` |
|---|---|---|---|
| `alla.volkova@virtoway.com` | `db222b30…` | **0** | **0** |
| `Alla.Volkova@virtoworks.com` | `27b89463…` = `rep.userId` | **6** | **6** (+ 8 orders) |

Both tokens carry `sales-rep:access`. The only difference is which account the memberships are on.

**Two teeth, because this is invisible from every screen:**

1. `SR_DEMO_REP_*_EMAIL` must name the account the rep record points at, and the seeder **WARNs**
   when the declared email disagrees with the rep's own `userName`.
2. Rep lookup matches **every** address a rep answers to (`emails[]`, `email`, `userName`), not just
   the one the search row happens to surface — a single-key match reported a rep who was plainly
   there as *"not a sales rep on this environment"*, which sends the reader off to create an account
   for a real person.

**How to settle it on any environment**, without needing the rep's password: mint an operator token
for an account holding `platform:security:loginOnBehalf`, `POST /connect/token` with
`grant_type=impersonate` and `user_id=<the rep's userId>`, then call `salesRepCustomers(storeId:)` on
the impersonated token. Zero on one account and six on the other is the whole diagnosis. (Do not write
either token to disk.)

Related and often confused with it — `domain/sales-rep.md` §10 **A4**: `checkPermissions()`
short-circuits `true` for `isAdministrator`, so **an admin renders the entire hub over empty data**
too. Same symptom, different cause; check which account the session is actually authenticated as
before concluding anything about the data.

## 5a. The document library's files are GENERATED, not borrowed

`test-data/uploads/` holds assets collected for other fixtures — logos, a webp, two mp4s, a photo of
paper straws. Pointing the demo at them produced documents whose titles, sizes and page counts were
right and whose CONTENTS were not: *2026 Industrial Catalog* opened a two-page status summary,
*Memphis Distribution Centre* opened the paper straws, and two files had to be reused twice because
there was no third PDF. A demo document nobody opens is fine until somebody opens it.

So the bytes are built from the same declarations that describe the documents:

```bash
npm run sr:gen-doc-assets          # write test-data/uploads/sales-rep-demo/
npm run sr:gen-doc-assets:check    # regenerate in memory, report drift, write nothing
```

`generate-demo-doc-assets.mjs` emits a real 148-page catalog, a 22-page GHS safety data sheet, a
9-page volume pricing agreement, a 6-page terms document, a 2-page site plan drawn with PDF vector
primitives, a 45-row XLSX price list with tier columns, and two multi-section DOCX forms. **Page
counts are read from `DEMO_DOCUMENTS[].pageCount`, never restated** — a PDF whose metadata claims 148
pages and whose body holds 12 is the mismatch a viewer notices first. Output is deterministic (no
clock, no randomness), which is what makes `--check` meaningful and keeps a re-run out of the diff.

The assets are **committed**, so a fresh clone seeds real documents with no generation step, and
`demoProblems()` fails when a document's `sourceFile` stops matching its `fileName` — otherwise a
rename silently falls back to a 562-byte stub. Verified live 2026-09-23: all 8 documents are served
from the library **byte-identical** to the committed assets.

One deliberate change of type: the Memphis document is a PDF **site plan**, not a photograph. Nothing
in this repo is an industrial photo, and a readable facility plan is something a rep would actually
open in front of a customer.

## 6. Constraints the data cannot design around

**Order dates cannot be backdated.** `createdDate` is server-assigned and silently ignored on `POST`
and `PUT`. So the demo narrative is *"a day in the life of two reps"*, never *"this quarter"* — which
also makes every placed-today / new-this-week dashboard counter read non-zero, a better demo than an
empty widget. Relative recency is controlled the only way it can be: **POST order**, latest last
(`ordersInPostOrder()`, keyed on each order's declared `seq`). **The demo script must never narrate
an absolute date.**

**Catalog products are discovered, never created.** The demo creates zero catalog entities;
`discoverProductPools()` claims live products per org, globally de-duplicated so each org's set is
disjoint (which is what makes a top-sellers ranking meaningful rather than decorative).
`EXCLUDED_PRODUCT_RE` rejects anything carrying a fixture prefix — the catalog still serves
`AGENT-TEST-Cordless Drill` and friends, and a line item's name is copied into the order at POST, so
discovery is the only place that can be caught.

---

## 7. Guards

| Command | Covers |
|---|---|
| `npm run td:validate:sales-rep-demo` | Static: the spec's own `demoProblems()` contract, no GUID literal, ledger not in the base `aliases.json`, document `sourceFile`s resolve, password is a `{{VAR}}` token, `EXCLUDED_PRODUCT_RE` still rejects what is live, ledger key keeps its `_` |
| `npm run sr:probe-markers` | Live: the `outerId` round trip that the whole sweep rests on. Re-run after a platform upgrade |
| `npm run td:reconcile` | Check **[12]** is profile-aware — under `sales-rep-demo` it asserts the ledger's `rep-attachment` rows against the live reps instead of the fixture CSV, and **announces** the substitution rather than skipping silently |
| `scripts/unit/sales-rep-demo-specs.test.mjs` | Derivations only — `splitTotal` remainder arithmetic, marker round-trip, `buildDemoOrderBody`, order sequencing. The declaration tables get no test by design (`.claude/rules/test-data.md` FOURTH RULE) |

---

## 8. State — virtostart, 2026-09-23

- Holds **neither** profile. The sales-rep surface was swept via `sr:inventory:delete` (14 reps, 31
  orders, 16 documents, 14 organizations, 2 roles) and the demo has not been seeded live yet.
- **Alla Volkova** — `Advanced Sales Representative`, a rep here since 2022. `protected`.
- **Oleg Zhuk** — `Advanced Sales Representative` as of 2026-09-23 (promoted by the §5 global-role
  path). His Contact `status` is `New` where both other reps are `Approved` — noted, not changed; it
  is a real person's record and `New` is not the platform's known sign-in blocker (`Invited` is).
- **Maria Smith** — a colleague actively placing orders, not part of the demo. `protected`.
- Outstanding before a full demo seed: both `SR_DEMO_REP_*_PASSWORD_VIRTOSTART` values, without which
  nothing is skipped any more — the operator fallback covers tasks, rep carts and Customer lists.
