# Testing Checklist — VCST-4792: Add Storybook Stories (Molecules & Organisms)

## Scope
- **PR:** VirtoCommerce/vc-frontend#2216
- **Type:** New Storybook stories only (no component code changes)
- **Storybook URL:** https://vcst-qa-storybook.govirto.com

## Components Under Test

### Molecules (13)
| # | Component | Story Path | Stories to Verify |
|---|-----------|------------|-------------------|
| 1 | VcCarousel | Components/Molecules/VcCarousel | Default, WithNavigation, WithPagination, FullFeatured |
| 2 | VcCopyText | Components/Molecules/VcCopyText | Default, CustomText |
| 3 | VcDialogContent | Components/Molecules/VcDialogContent | Default, WithLongContent |
| 4 | VcDialogFooter | Components/Molecules/VcDialogFooter | Default, CustomActions |
| 5 | VcDialogHeader | Components/Molecules/VcDialogHeader | Default, WithCloseButton, WithIcon |
| 6 | VcEmptyPage | Components/Molecules/VcEmptyPage | Default, WithAction, CustomImage |
| 7 | VcExpansionPanel | Components/Molecules/VcExpansionPanel | Default, InitiallyOpen, Disabled |
| 8 | VcItemPriceCatalog | Components/Molecules/VcItemPriceCatalog | Default, WithDiscount, OutOfStock |
| 9 | VcList | Components/Molecules/VcList | Default, WithIcons |
| 10 | VcLoaderOverlay | Components/Molecules/VcLoaderOverlay | Default, WithText |
| 11 | VcLoaderWithText | Components/Molecules/VcLoaderWithText | Default, CustomMessage |
| 12 | VcSteps | Components/Molecules/VcSteps | Default, ActiveStep, CompletedSteps |
| 13 | VcTextarea | Components/Molecules/VcTextarea | Default, WithPlaceholder, Disabled, Error, MaxLength |

### Organisms (2)
| # | Component | Story Path | Stories to Verify |
|---|-----------|------------|-------------------|
| 14 | VcModal | Components/Organisms/VcModal | Default, Sizes, WithForm, Scrollable |
| 15 | VcConfirmationModal | Components/Organisms/VcConfirmationModal | Default, Danger, CustomButtons |

## Verification Criteria

### Per-Story Checks
- [ ] Story appears in Storybook sidebar under correct category (Molecules/Organisms)
- [ ] Story renders without errors (no console errors)
- [ ] All declared args/controls are visible in Controls panel
- [ ] Controls modify the component as expected (interactive)
- [ ] Component is visually correct (no layout breaks, no overflow)
- [ ] All story variants render correctly

### Cross-Cutting Checks
- [ ] No Storybook build errors or warnings in console
- [ ] Navigation between stories works smoothly
- [ ] Stories follow Atomic Design naming convention (Molecules/Organisms)
- [ ] Dark mode compatibility (if theme switcher available)
- [ ] Component descriptions/docs visible in Docs tab (if autodocs enabled)

### Accessibility Spot-Check (per component)
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Interactive elements are keyboard focusable
- [ ] Appropriate ARIA labels present
