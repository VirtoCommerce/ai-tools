# ba-system-analyzer — output format

> Cited by `.claude/agents/ba-system-analyzer.md` (§Output Format). Read it before composing your final structured JSON report.

## Output Format

Return a structured JSON object:

```json
{
  "existing_functionality": {
    "$comment": "STEP 0 OUTPUT — MANDATORY, and it comes FIRST because the rest of this report is only",
    "$comment2": "meaningful against it. Establish what the scope ALREADY DOES, before this ticket, and say",
    "$comment3": "where each claim came from. A gap analysis with no baseline is a wish list.",
    "scope_domain": "the manifest domain (config/test-suites.json) this surface belongs to",
    "current_behaviour": [
      {
        "$comment": "One entry per capability the surface has TODAY — not what the ticket proposes. A claim lifted from a prior report is a HYPOTHESIS: it is dated, the product moved after it, and repeating it unchecked is worse than not reading it because it arrives with a deliverable's authority.",
        "behaviour": "what it does now, one line",
        "source": "prior-doc | release-doc | live | code",
        "verdict": "CONFIRMED | DRIFT | MISSING | UNVERIFIED",
        "checked_against": ["release-ledger rows since the prior doc's date, and/or the live URL + what was observed"]
      }
    ],
    "release_delta": ["release-ledger rows for this component since the newest prior doc's date — released upstream, NOT necessarily deployed; non-exhaustive, so a miss is not absence; carries no behaviour, so it raises a staleness suspicion and never settles one"],
    "live_check": "what you actually exercised on the running env to settle the baseline, or the reason you could not (an UNVERIFIED baseline is honest; a silent one is not)",
    "prior_art_read": ["reports/ba/... paths actually opened — and the literal string \"none\" when the domain has no prior analysis, which is a different starting position and must be visible"],
    "prior_model": "the prior test-model.md path to AMEND, or null",
    "already_settled": ["facts the prior analysis established — do not re-derive these"],
    "new_in_this_analysis": ["what this pass adds or contradicts, and on what evidence"],
    "existing_coverage": ["suite ids from the map that already exercise this surface"]
  },
  "test_object": {
    "$comment": "The object under test — from the map's Test object block PLUS whatever you established this run. You cannot design an experiment on an object whose properties you do not know; without this you can only walk screens, which is the measured Loyalty Missions failure (127 cases, 71 placing zero orders, mechanism end-to-end at 11%). Where the map reads UNDECLARED, establish it or say you could not. NEVER invent a purpose: it becomes context every later run trusts.",
    "purpose": "the value chain in the user's words — trigger -> effect -> persisted state -> the surface the user sees it on -> what it unlocks. Or UNDECLARED + why you could not establish it",
    "operations": ["what can be DONE to it — GraphQL ops / REST endpoints / UI actions, grounded"],
    "properties": ["what can be OBSERVED or VARIED — fields, states, computed values"],
    "variants": ["what changes its behaviour without changing its code — config flags, store settings, roles, currency/locale"],
    "constraints": ["the BL-*/ECL-* it must satisfy, with what a violation costs"],
    "reverse_edges": ["every forward effect on money / points / stock / entitlement, and whether it undoes — ABSENT IN PRODUCT is a finding, not a blank"]
  },
  "system_overview": {
    "vc_version": "string",
    "frontend_type": "vue-storefront | storefront-net | headless | custom",
    "modules": ["list of module names"],
    "module_versions": { "module_name": "version from manifest" },
    "custom_extensions": ["list of customizations"],
    "integrations": ["payment gateways, ERP, CRM, etc."]
  },
  "github_analysis": {
    "repos_searched": ["VirtoCommerce/vc-module-*"],
    "extension_points_found": ["domain events, handlers, abstract factories"],
    "customization_gaps": ["areas where standard modules could be extended but aren't"]
  },
  "ui_analysis": {
    "storefront": {
      "navigation_structure": "mermaid sitemap or list",
      "page_count": 0,
      "responsive_issues": ["list"],
      "console_errors": ["list"],
      "screenshots": ["paths to captured screenshots"]
    },
    "admin_panel": {
      "menu_structure": "sidebar menu tree",
      "installed_modules": ["visible in admin"],
      "blade_issues": ["list"],
      "screenshots": ["paths to captured screenshots"]
    }
  },
  "user_flows": {
    "b2c": [{ "name": "string", "steps": ["array"], "source": "code | ui | both", "issues": ["array"] }],
    "b2b": [{ "name": "string", "steps": ["array"], "source": "code | ui | both", "issues": ["array"] }],
    "admin": [{ "name": "string", "steps": ["array"], "source": "code | ui | both", "issues": ["array"] }]
  },
  "pain_points": [
    {
      "location": "file, module, or UI page",
      "source": "code | ui | github | docs",
      "issue": "description",
      "severity": "High | Medium | Low",
      "recommendation": "what to do",
      "screenshot": "path or null"
    }
  ],
  "unused_platform_features": ["features available but not used"],
  "architecture_diagram": "mermaid flowchart string",
  "security_flags": ["any security concerns found"],
  "bl_proposals": {
    "new": [
      {
        "proposedId": "PROPOSED-BL-<DOMAIN>-<NNN>",
        "title": "short human-readable title",
        "severity": "P0-revenue | P1-data | P2-ux",
        "rule": "declarative invariant statement",
        "verify": ["step 1", "step 2"],
        "violationSignal": "observable failure symptom",
        "agents": ["qa-frontend-expert", "qa-backend-expert"],
        "source": "the human source: VCST-1234 AC #2 / VC docs §X / Jira resolution of VCST-1234",
        "triggeredBy": "ba-analyze scope or pain_point id that exposed it"
      }
    ],
    "stale": [
      {
        "id": "BL-<DOMAIN>-<NNN>",
        "currentRule": "Rule text as written today",
        "observedBehavior": "what the live system / code / docs actually show",
        "source": "the bug key or the observation (case id + run id)",
        "suggestedAction": "mark-suspect | retire-proposed"
      }
    ]
  }
}
```

Both `bl_proposals.new[]` and `bl_proposals.stale[]` MAY be empty arrays — empty is a valid success signal (indicates the scope you analyzed is already well-covered by existing invariants).
