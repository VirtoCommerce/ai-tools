---
description: "[VC Knowledge] Module analysis: test suite mapping, dependencies, API surface, admin UI sections."
argument-hint: "module name | suite ID"
---

# /vc-module — Module Analysis & Test Mapping

Analyze a Virto Commerce module to understand its test coverage, dependencies, admin UI sections, and API surface. Maps modules to regression test suites.

## Usage
```
/vc-module catalog                   # Analyze the Catalog module
/vc-module pricing                   # Analyze the Pricing module
/vc-module suite 20                  # What module does Suite 20 test?
/vc-module orders                    # Analyze the Orders module
```

## Supporting Files

- **module-suite-map.md** — Mapping of all VC modules to regression test suites, admin UI sections, API endpoints, and xAPI queries. Quick reference for scoping test impact.

## Execution

1. **Identify the module:**
   - If module name: look up in `module-suite-map.md`
   - If suite ID: reverse-lookup from suite to module

2. **Gather module information:**
   - Read `module-suite-map.md` for suite mappings, UI sections, API surface
   - Query Context7 (`/virtocommerce/vc-docs`) for module architecture and configuration
   - Check `regression/suites/` for the module's test suite CSV files

3. **Produce analysis:**
   - **Module overview:** Purpose, core entities, key features
   - **Test suite mapping:** Which suites cover this module (IDs, names, test counts)
   - **Admin UI sections:** What admin pages/blades this module adds
   - **API surface:** REST endpoints and GraphQL xAPI queries/mutations
   - **Dependencies:** Other modules this depends on or is depended upon by
   - **Test coverage assessment:** Gaps between module capabilities and existing test cases

4. **Output to user:**
   - Structured module analysis
   - List of regression suites to run when this module changes
   - Suggested test cases for any coverage gaps

## Rules
- Always cross-reference with actual suite CSVs in `regression/suites/`
- Use Context7 for authoritative module documentation
- Flag any module capabilities not covered by existing test suites
- Dependencies matter: if module A depends on module B, changes to B may require testing A
