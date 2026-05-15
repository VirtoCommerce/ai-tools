---
description: "[Testing] Design system consistency & UX heuristics: live-token audit, BL-UI invariants, Nielsen's 10, Figma comparison."
argument-hint: "component | page URL | flow name"
---

# /qa-design — Design & UX Evaluation

> **Terminal command:** `/qa-design <component | page | flow>` — see [.claude/commands/qa-design.md](../../../commands/qa-design.md). The command parses the argument, resolves audit scope from [critical-ui-scope.md](../../../agents/knowledge/critical-ui-scope.md), and dispatches `ui-ux-expert`; this file is the methodology library it consults.

Validate design system consistency and run UX heuristic evaluations against the active Coffee theme tokens, [BL-UI invariants](../../../agents/knowledge/business-logic.md#domain-15-ui-display--layout-stability-bl-ui), and Nielsen's 10 usability heuristics.

## Usage

```
/qa-design ProductCard               # Audit one component against the design system
/qa-design checkout flow             # UX heuristic evaluation of a flow
/qa-design https://figma.com/...     # Compare implementation vs Figma spec (see Figma section below)
```

## Pre-requisites — read these first

Before any design audit, the agent must already be aware of:

- [`business-logic.md` Domain 15 (BL-UI-001..006)](../../../agents/knowledge/business-logic.md#domain-15-ui-display--layout-stability-bl-ui) — the canonical UI invariants. A violation is a FAIL regardless of how the result looks.
- [`scripts/lib/measure-layout.ts`](../../../../scripts/lib/measure-layout.ts) — the helper that wraps every required measurement: CLS observer, spacing audit, alignment audit, overflow audit, touch-target audit, rect snapshot for shift detection, plus classifiers.
- [`048b-layout-stability.csv`](../../../../regression/suites/Frontend/cross-cutting/048b-layout-stability.csv) — the 18-case suite that drives BL-UI-001..006 against live storefront. Run via `SUITE_SELECTION=layout-stability npm run ci:regression`.
- [storefront-config-flags.md](../../../agents/knowledge/storefront-config-flags.md) — active theme preset + flags affecting which tokens render.

## Supporting Files

- **[design-system-consistency.md](design-system-consistency.md)** — Live-token extraction protocol (replaces the old hardcoded palette); spacing/color/typography/border/icon/animation audits; findings → filings decision tree. Pinned to BL-UI-002 and BL-UI-005.
- **[ux-heuristic-evaluation.md](ux-heuristic-evaluation.md)** — Nielsen's 10 with Coffee/B2B-specific examples; Nielsen 0–4 severity rubric; heuristic → BL-* / WCAG / ECL cross-reference table.

## Execution

Delegate to `ui-ux-expert` via the **Agent tool** (`subagent_type: ui-ux-expert`). The skill itself does not run measurements — the agent does, using the canonical helper.

### Design System Consistency Check

1. **Extract live tokens** from the page under test (NOT from hardcoded values in this skill):
   ```js
   // browser_evaluate snippet — see design-system-consistency.md for the full version
   const tokens = getRootCustomProperties();  // → { '--color-primary': '#…', '--spacing-md': '16px', … }
   ```
2. **Audit spacing** with `spacingAuditSnippet(selector)` from [measure-layout.ts](../../../../scripts/lib/measure-layout.ts), classify with `classifySpacing()`. Pin every finding to [BL-UI-002](../../../agents/knowledge/business-logic.md#bl-ui-002-spacing-grid-compliance-p2-ux).
3. **Audit alignment** with `alignmentAuditSnippet(selector)` + `classifyAlignment()`. Pin to [BL-UI-005](../../../agents/knowledge/business-logic.md#bl-ui-005-alignment-in-horizontal-groups-p2-ux).
4. **Audit color usage**: every brand-styled element must reference `var(--color-…)`, not a literal hex. Toggle the theme preset — literals don't move, tokens do.
5. **Audit typography**: same `font-family` family across surfaces, weights ∈ `{400, 500, 600, 700}`, body ≥ 14 px.
6. **Audit overflow + touch targets** with `LAYOUT_SNIPPETS.overflowAudit` + `LAYOUT_SNIPPETS.touchTargetAudit`. Pin to [BL-UI-004](../../../agents/knowledge/business-logic.md#bl-ui-004-content-boundary-p2-ux) and [BL-UI-006](../../../agents/knowledge/business-logic.md#bl-ui-006-touch-target-size-and-spacing-p1-data).
7. **Figma comparison** (optional) — see Figma section below.

### UX Heuristic Evaluation

1. **Navigate the target flow** using playwright-chrome / firefox / edge MCP — see [browser assignments](../../../rules/agents.md).
2. **Walk Nielsen's 10** — questions and concrete VC examples in [ux-heuristic-evaluation.md](ux-heuristic-evaluation.md).
3. **Rate severity 0–4** per finding using the rubric in `ux-heuristic-evaluation.md` (0 = not an issue, 4 = catastrophe). Promote one level on revenue-critical surfaces (checkout / payment / add-to-cart / registration).
4. **Cross-reference** each finding against BL-*, WCAG, or ECL where one applies — a citable rule beats a subjective complaint. See the cross-ref table in `ux-heuristic-evaluation.md`.

## Figma comparison

Figma MCP integration is shaky in this project — the configured `figma-remote-mcp` only exposes `authenticate` / `complete_authentication` tools right now. If you need to compare against a Figma frame:

- **If Figma MCP is fully connected** (post-OAuth, paid seat): use the official server's design-context fetch to read variables + frame layout, then diff against the live computed styles. Useful for component-level spec parity.
- **If not connected** (current default): treat Figma URLs as manual references — open in browser, capture screenshots, eyeball-compare against the implementation. Do NOT block the audit on missing Figma data; the BL-UI invariants stand on their own.
- **Free tier caveat:** Figma's Starter plan caps MCP at ~6 tool calls/month — unusable for QA. Either skip Figma comparison or budget a Dev/Full seat.

See "Recommended workflow" in the project conversation log (or ask `/claude-code-guide` for the current state of Claude Code ↔ Figma) for the up-to-date picture.

## Output

- **Design consistency report** — pass/fail per token category, each failure tagged with BL-UI-NNN and the computed-style evidence
- **UX heuristic scorecard** — Nielsen 0–4 rating per heuristic with specific issues, cross-referenced to BL-* / WCAG / ECL where applicable
- **Screenshots** — only for FAIL states (per `evidence-capture-policy.md`); not for passing checks

## Findings → Filings

Audits produce 0–N findings. Decision tree for what to file:

| Pattern | What to file |
|---------|--------------|
| One component, one violation | Individual bug via [/qa-bug](../../qa-methodology/qa-bug/SKILL.md) tagged with the violated `BL-UI-NNN` |
| One component, multiple violations | ONE bug per component listing all violations — don't fragment |
| Multiple components share the same violation (5+ components with off-token color, etc.) | ONE rollup bug describing the systemic drift. Title: `Design System Drift — [violation type] across [N] components`. Priority bumped to P1 |
| Token resolution itself is broken | P1 bug — the design system layer is broken, not the components |
| UX heuristic finding with severity 0–1 | Log in evaluation report, do not file individually |
| UX heuristic finding with severity 2 | File as P3 bug, include suggested improvement |
| UX heuristic finding with severity 3–4 | File as P0–P1 bug, escalate severity 4 to qa-lead-orchestrator |

## Rules

- **Read live tokens, never hardcode** — Coffee is multi-preset (6 light + 3 dark variants); a token's resolved value varies per preset. Hardcoded hex values in this skill or in audits will be wrong half the time.
- **Cite the BL / WCAG / ECL ID** for every finding where one applies. Findings without citations decay into vague design debate.
- **Audit at multiple viewports** — 375 / 768 / 1280 minimum; some tokens override at breakpoint boundaries.
- **UX heuristic findings ≥ 3** must be filed as bugs (P1 or higher).
- **Figma comparison is optional** — don't block an audit waiting for Figma access; BL-UI invariants are the authoritative contract.
- Delegate execution to `ui-ux-expert` via the **Agent tool** (`subagent_type: ui-ux-expert`) — this skill is a methodology library, not an executor.
