# Storybook / UI Kit Testing

This folder contains component-based testing artifacts for the Virto Commerce UI Kit (Storybook).

## Folder Structure

```
storybook/
├── atoms/           # Basic building blocks (VcBadge, VcCheckbox, VcIcon, etc.)
├── molecules/       # Composed components (VcButton, VcAlert, VcChip, etc.)
├── organisms/       # Complete features (VcProductCard, VcTable, VcAddToCart, etc.)
└── design-system/   # Cross-component design system audits
```

## Component Folder Contents

Each component folder (e.g., `atoms/VcBadge/`) contains:

| File | Purpose |
|------|---------|
| `baselines/` | Visual regression baseline screenshots |
| `accessibility-audit.md` | WCAG 2.1 AA audit results |
| `test-report.md` | Component test execution report |

## Screenshot Naming Convention

```
{story-name}-{viewport}.png

Examples:
- basic-desktop.png        (1280px)
- basic-tablet.png         (768px)
- basic-mobile.png         (375px)
- hover-state-desktop.png
- disabled-desktop.png
- coffee-theme-desktop.png
```

## Storybook URLs

| Environment | URL |
|-------------|-----|
| Dev | https://vcst-dev-storybook.govirto.com |
| QA | https://vcst-qa-storybook.govirto.com |

**Theme Presets:** Default, Coffee

## Usage

When testing a component:

1. Navigate to component folder: `storybook/{tier}/{VcComponentName}/`
2. Save baseline screenshots to `baselines/`
3. Document accessibility findings in `accessibility-audit.md`
4. Record test results in `test-report.md`
5. Link results in JIRA ticket if applicable

## Related Documentation

- Agent: `.claude/agents/ui-ux-expert.md`
- Testing Guide: `docs/guides/how-to-test-storybook.md`
- Prompt Template: `docs/prompts/storybook-testing.md`
