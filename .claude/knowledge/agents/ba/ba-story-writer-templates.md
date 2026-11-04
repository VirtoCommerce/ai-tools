# ba-story-writer — epic structure and story templates

Cited by `.claude/agents/ba-story-writer.md` §Epic Structure, §Virto Commerce Story Templates and §2 The Story Statement; read it when `story_type` is `epic`, when a story matches a Template A–E domain, or when choosing the actor (Mode A only). Moved verbatim from the agent definition.

## Epic Structure

When a feature is too large for one story, break it into an **Epic + Child Stories**:

```markdown
# EPIC: [Epic Title]
**Goal:** [What business outcome does completing this epic achieve]
**Success Metric:** [How we'll know it's done]

## Stories in this Epic:
1. [EPIC-01] [Story title] — [S/M/L]
2. [EPIC-02] [Story title] — [S/M/L]
3. [EPIC-03] [Story title] — [S/M/L]

## Epic Acceptance Criteria:
- [ ] [High-level outcome 1]
- [ ] [High-level outcome 2]
```

**Epic splitting heuristics for VC projects:**
- Split by user type (guest vs. registered vs. B2B)
- Split by happy path vs. edge cases
- Split by frontend vs. backend (spike first if uncertain)
- Split by device/channel (desktop → mobile → app)
- Split by phase (MVP → enhanced → optimized)

---

## Virto Commerce Story Templates

Pre-built templates for the most common VC story types. Use these as starting points:

### Template A — Catalog / Product Feature
```
As a [shopper type],
I want to [find/filter/view/configure products],
So that [I can make an informed purchase decision / find what I need quickly].
```
Key ACs to always include: search relevance, filter persistence, mobile layout, empty results state.

### Template B — Cart & Checkout
```
As a [registered customer | guest shopper],
I want to [add/modify/proceed with my cart],
So that [I can complete my purchase with minimal friction].
```
Key ACs to always include: cart persistence across sessions, price recalculation, inventory validation at checkout, payment error recovery.

### Template C — B2B Quote Flow
```
As a B2B purchasing agent,
I want to [request/negotiate/convert a quote],
So that [my company gets the correct pricing and my order is processed accurately].
```
Key ACs to always include: quote expiry handling, approval workflow states, price list override, bulk line items.

### Template D — Admin / Back-Office
```
As a [catalog manager | order specialist | store admin],
I want to [manage X in the admin panel],
So that [business operations run smoothly without needing developer assistance].
```
Key ACs to always include: validation, bulk actions, audit log entry, role-based access.

### Template E — Integration / API
```
As an integration engineer,
I want to [consume/trigger/sync X via the API],
So that [external systems stay in sync with the VC platform].
```
Key ACs to always include: idempotency, error responses with meaningful codes, pagination, webhook event coverage.

---

## Story Statement — actor guidelines (§2 of the story anatomy)

**Actor guidelines — be specific, never generic:**

| ❌ Too vague | ✅ Specific |
|---|---|
| "a user" | "a registered B2C customer" |
| "an admin" | "a catalog manager" |
| "a person" | "a B2B purchasing agent" |
| "someone" | "a guest shopper" |

**Common Virto Commerce actors:**
- Guest shopper
- Registered B2C customer
- B2B purchasing agent
- B2B company administrator
- Catalog manager
- Order fulfillment specialist
- Store administrator
- Finance manager
- Content editor
- API developer / integration engineer
