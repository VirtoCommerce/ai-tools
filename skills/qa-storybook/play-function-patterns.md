# `play` Function Patterns

> Reference file for ui-ux-expert + qa-testing-expert. Canonical patterns for interaction tests inside stories. All imports from `storybook/test` (SB 9 — no `@` prefix).

## Anatomy

A `play` function runs after the story renders. It receives `{ canvasElement, args, step, ... }`. Wrap groups of actions in `step()` so the Interactions panel and CI logs read like a checklist.

```ts
import type { Meta, StoryObj } from '@storybook/vue3'
import { expect, userEvent, within, fn } from 'storybook/test'
import VcButton from './VcButton.vue'

const meta: Meta<typeof VcButton> = { component: VcButton }
export default meta
type Story = StoryObj<typeof VcButton>

export const FiresClickOnce: Story = {
  args: { label: 'Add to cart', onClick: fn() },
  play: async ({ canvasElement, args, step }) => {
    const canvas = within(canvasElement)

    await step('Click the button', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /add to cart/i }))
    })

    await step('Handler fires exactly once', async () => {
      await expect(args.onClick).toHaveBeenCalledTimes(1)
    })
  },
}
```

## Pattern 1 — Disabled state blocks events (BL-UI invariant)

```ts
export const DisabledIgnoresClick: Story = {
  args: { label: 'Add to cart', disabled: true, onClick: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: /add to cart/i })

    await expect(button).toBeDisabled()
    await userEvent.click(button)
    await expect(args.onClick).not.toHaveBeenCalled()
  },
}
```

## Pattern 2 — Async loading state

```ts
import { waitFor } from 'storybook/test'

export const ShowsSpinnerWhileLoading: Story = {
  args: { loading: true },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)

    await step('Spinner renders', async () => {
      await expect(canvas.getByRole('status')).toBeInTheDocument()
    })

    await step('Button is busy', async () => {
      await expect(canvas.getByRole('button')).toHaveAttribute('aria-busy', 'true')
    })
  },
}
```

## Pattern 3 — Form validation (typed input + error toast)

```ts
export const RejectsInvalidEmail: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)

    await step('Type invalid email', async () => {
      await userEvent.type(canvas.getByLabelText(/email/i), 'not-an-email')
      await userEvent.tab()
    })

    await step('Inline error appears', async () => {
      await expect(await canvas.findByText(/valid email/i)).toBeVisible()
    })

    await step('Submit button stays disabled', async () => {
      await expect(canvas.getByRole('button', { name: /submit/i })).toBeDisabled()
    })
  },
}
```

## Pattern 4 — Keyboard-only flow (a11y invariant)

```ts
export const ClosableWithEscape: Story = {
  args: { open: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('dialog')).toBeVisible()

    await userEvent.keyboard('{Escape}')
    await expect(args.onClose).toHaveBeenCalledTimes(1)
  },
}
```

## Pattern 5 — Continuing from another story (compose, don't duplicate)

```ts
import { FiresClickOnce } from './VcButton.stories'

export const ClickThenDisabled: Story = {
  args: { ...FiresClickOnce.args },
  play: async (context) => {
    await FiresClickOnce.play(context)
    const canvas = within(context.canvasElement)
    await expect(canvas.getByRole('button')).toBeDisabled()
  },
}
```

## Rules

1. **One behavior per story.** If `play` needs more than ~3 `step()` blocks, split the story.
2. **Always use roles, names, labels** — `getByRole`/`getByLabelText`/`findByText`. Avoid `getByTestId` unless there's no accessible alternative; tests should fail when a11y breaks.
3. **Use `fn()` for spies** — don't import `vi.fn()` or jest stubs. `storybook/test` re-exports a working spy that renders in the Actions panel.
4. **Prefer `findBy*` over `getBy*` for async** — `findBy*` retries with a timeout; `waitFor` is the escape hatch for non-DOM assertions.
5. **Never use `setTimeout` to wait.** Use `findBy*` / `waitFor`. Timeouts are the #1 source of CI flake.
6. **Don't assert outside the canvas** — `within(canvasElement)` scopes queries. Portals (modals/tooltips) render to `document.body`; use `within(document.body)` or `screen` deliberately.
7. **Stories with `play` should still render meaningfully without it** — don't make the visual baseline depend on the play function completing.

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `getByRole('button')` returns multiple | Component renders nested buttons or the story includes a wrapper button | Scope with `within(specificElement)` or narrow by name regex |
| Flake on hover/focus | CSS transition not paused | Set `parameters.chromatic.pauseAnimationAtEnd: true` or disable transitions in preview |
| Element exists in DOM but `not.toBeVisible()` fails | Hidden by CSS, not by `display:none` | Use `toHaveAttribute('hidden')` or check computed style explicitly |
| Spy from `fn()` resets between stories unexpectedly | `args` is re-declared per story | Expected — each story is an isolated test |
| Works in Storybook UI, fails in Vitest addon | Missing global decorator | Add `setProjectAnnotations()` call in Vitest setup file (imports from `@storybook/your-framework`) |

## When `play` is the wrong tool

- Multi-page flows (login → catalog → cart → checkout) → Playwright E2E.
- Pure logic (price formatter, coupon validator) → Vitest unit test against the composable/function directly.
- Visual-only assertion ("this looks right") → visual regression, not `play`.

`play` shines for: state transitions inside one component, a11y invariants (focus, keyboard, ARIA states), event-emission contracts, and form validation rules.
