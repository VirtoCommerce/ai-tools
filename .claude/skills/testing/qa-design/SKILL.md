---
description: "[Testing] Design system consistency & UX heuristics: Figma comparison, tokens, Nielsen's 10."
argument-hint: "component | page URL | flow name"
disable-model-invocation: true
---

# /qa-design — Design & UX Evaluation

Validate design system consistency and run UX heuristic evaluations against Figma specs and Nielsen's 10 usability heuristics.

## Usage
```
/qa-design ProductCard               # Check component against design system
/qa-design checkout flow             # UX heuristic evaluation of checkout
/qa-design https://figma.com/...     # Compare implementation vs Figma design
```

## Supporting Files

- **design-system-consistency.md** — Checklist for design system compliance: colors, typography, spacing, border radius, icons, shadows, z-index, responsive tokens, component states
- **ux-heuristic-evaluation.md** — Nielsen's 10 usability heuristics adapted for e-commerce: visibility of system status, match with real world, user control, consistency, error prevention, recognition, flexibility, aesthetic design, error recovery, help/docs

## Execution

### Design System Consistency Check
1. **Load design tokens** from Figma or design system docs
2. **Delegate to ui-ux-expert** via Task tool (`subagent_type: ui-ux-expert`)
3. **Inspect computed CSS** via Chrome DevTools MCP for:
   - Colors match design system palette (not arbitrary hex)
   - Typography uses approved font families, sizes, weights
   - Spacing follows 4px/8px grid system
   - Border radius, shadows, z-index use design tokens
   - Component states (hover, focus, active, disabled) all styled
4. **Figma comparison** (if URL provided):
   - Fetch Figma design via Figma MCP (`get_design_context`)
   - Side-by-side visual comparison
   - Flag deviations in spacing, color, layout

### UX Heuristic Evaluation
1. **Navigate the target flow/page** using Playwright MCP
2. **Evaluate each of Nielsen's 10 heuristics:**
   - System status visibility (loading states, progress indicators)
   - Real-world match (familiar language, logical order)
   - User control (undo, back, cancel available)
   - Consistency (patterns reused across site)
   - Error prevention (validation, confirmations)
   - Recognition over recall (visible options, breadcrumbs)
   - Flexibility (keyboard shortcuts, bulk actions)
   - Aesthetic/minimal design (no clutter, clear hierarchy)
   - Error recovery (clear messages, suggested fixes)
   - Help/documentation (tooltips, contextual help)
3. **Rate severity** per heuristic: 0 (not a problem) to 4 (catastrophe)

## Output
- Design consistency report: pass/fail per token category
- UX heuristic scorecard: rating per heuristic with specific issues
- Screenshots of deviations or UX problems
- Prioritized improvement recommendations

## Rules
- Always check computed CSS values, not just visual appearance
- Compare against the actual design system, not assumptions
- UX issues rated ≥3 should be flagged as high priority
- Figma comparison requires the Figma MCP server to be configured
