# Org-switcher search returns organizations that do not contain the search substring — P2

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368

## Summary
A partial-text search in the organization switcher returns organizations that do not contain the typed substring alongside the genuine matches. The `searchPhrase` is sent quote-wrapped, which defeats substring filtering so the backend effectively returns unrelated orgs.

## STR
1. Sign in as a multi-org user.
2. Open the organization switcher and type a partial term, e.g. `ACM`.
3. Review the results list.

## Expected vs Actual
- **Expected:** Only orgs whose name contains `ACM` (the ACME orgs).
- **Actual:** Non-matching orgs appear too — e.g. "(parentheses) Lone Star Outfitters" and "50% Off Redwood Provisions" — mixed in with the real ACME matches.

## Evidence
![Org search unrelated results](screenshots/B2C-ORG-007-CONFIRMED-org-search-unrelated-results.png)


## Re-verification 2026-08-26 — symptom still reproduces, but the ROOT CAUSE above is WRONG

Backlog triage, Platform `3.1061.0`. The user-visible symptom is unchanged — searching `ACM` still returns
**"(parentheses) Lone Star Outfitters"** and **"50% Off Redwood Provisions"**, the two orgs this draft named.
But the stated cause ("the `searchPhrase` is sent quote-wrapped, which defeats substring filtering") does
**not** survive testing.

### The quote-wrapping is real, and it changes nothing

`vc-frontend@dev` `client-app/shared/account/composables/useUserOrganizations.ts` still wraps the input:

```ts
const escaped = searchPhrase.value.replace(/"/g, '\\"');
return `"${escaped}"`;
```

A backend A/B on `POST /api/members/search {memberType:"Organization"}` returns **byte-identical results**
for `ACM` and `"ACM"` — same `totalCount: 13`, same rows, same 8 non-matches. So quoting is not the
mechanism.

### Filtering is not broken either

| `searchPhrase` | totalCount | non-matching by name |
|---|---:|---:|
| *(omitted)* | 232 | — |
| `ZZZQQQNOMATCH` | **0** | 0 |
| `TechFlow` | **1** | 0 |
| `ACM` | 13 | **8** |
| `ACME` | 13 | 8 |

A phrase that matches nothing returns nothing, and a specific phrase returns exactly one org. The filter works.

### What actually happens: the match is on `description`, which the switcher never shows

Every one of the 8 "unrelated" orgs matches on a field the UI does not render:

| Org name (shown) | `description` (not shown) |
|---|---|
| (parentheses) Lone Star Outfitters | **ACME** Lone Star Outfitters |
| 50% Off Redwood Provisions | **ACME** Redwood Provisions |
| [e2e] Aurora Market | **ACME** Aurora Market |
| ]test[ Harbor Supplies | **ACME** Harbor Supplies |
| C++ Corp Bayfront Traders | **ACME** Bayfront Traders |
| Company & Sons Lakeview Goods | **ACME** Lakeview Goods |
| Test #123 Sunrise Bazaar | **ACME** Sunrise Bazaar |
| Test* Desert Cove Market | **ACME** Desert Cove Market |

The backend searching name **and** description is reasonable, standard behaviour — not a defect. The defect is
that the switcher renders **only the name**, so a correct match looks arbitrary to the user.

### Consequences for this draft

- **Severity/impact stand** — a user typing `ACM` still sees rows with no visible `ACM`. Real, still current.
- **Fix routing changes.** This is not "stop quote-wrapping". It is a product decision: either scope the
  switcher's search to `name` only, or **surface the matched `description`** in the row so the match reads as
  deliberate. The second preserves a genuinely useful search.
- **Note on the evidence.** All 8 belong to one **special-character org-name fixture family** (`(parentheses)`,
  `50% Off`, `[e2e]`, `]test[`, `C++ Corp`, `Company & Sons`, `Test #123`, `Test*`) whose descriptions were
  all seeded as `ACME <name>`. So the dramatic-looking 8-of-13 ratio is partly a **test-data artifact**; a
  production catalogue would show this far less often. Worth weighing before prioritising.

**Still not filed to the tracker.** If it is filed, file it with the corrected cause — the original would
send a developer to delete two lines that are not the problem.

## Root cause (suspected)
The org-switcher search wraps the user input in quotes before sending `searchPhrase`, turning an intended substring/contains query into a phrase/exact form and defeating filtering.

## Fix Routing
- **Repo:** vc-frontend (org switcher search)
- **Kind:** frontend
