# UX Heuristic Evaluation Guide

> Reference file for ui-ux-expert agent. Read when performing UX evaluations.

## Nielsen's 10 Usability Heuristics

```markdown
Test Case: TC_UX_EVALUATION_001
Title: UX evaluation for [Feature/Flow]

1. Visibility of System Status
   [] Is user always informed about what's happening?
   Questions to ask:
   - Does loading state show during processing?
   - Does progress indicator show which step user is on?
   - Do success/error messages appear clearly?
   - Is there feedback for every action?

   Issues to identify:
   - "Place Order" button click has no loading indicator
   - User unsure if payment is processing
   - No confirmation that email was sent

   Recommendations:
   - Add spinner to "Place Order" button
   - Show "Processing payment..." message
   - Show "Email sent!" confirmation

2. Match Between System and Real World
   [] Does it use familiar language and concepts?
   Questions to ask:
   - Are labels clear and use common terms?
   - Are icons recognizable?
   - Is flow logical (matches real-world process)?

   Issues:
   - Button says "Submit" (generic) instead of "Place Order"
   - Shipping method called "Method A" (meaningless)

   Recommendations:
   - Use "Place Order" (clear action)
   - Use "Standard Shipping (5-7 days)" (descriptive)

3. User Control and Freedom
   [] Can users undo mistakes?
   Questions:
   - Can user go back and edit previous steps?
   - Can user cancel action?
   - Is there "emergency exit" (close modal)?

   Issues:
   - Can't go back to edit shipping address after choosing shipping method
   - No cancel button in checkout
   - Modal has no close button (must complete or refresh page)

   Recommendations:
   - Add "Edit" links to previous steps
   - Add "Cancel Checkout" button
   - Add X close button to modal

4. Consistency and Standards
   [] Is behavior consistent with platform conventions?
   Questions:
   - Do similar actions work the same way?
   - Are patterns consistent across pages?
   - Do colors/icons mean same thing throughout?

   Issues:
   - Red button is "Delete" on one page, "Cancel" on another (inconsistent meaning)
   - Some forms validate on blur, others on submit (inconsistent timing)

   Recommendations:
   - Red = destructive actions (delete, remove) consistently
   - Orange/gray = cancel/back consistently
   - Validate all forms the same way

5. Error Prevention
   [] Does system prevent errors before they occur?
   Questions:
   - Are constraints clear upfront?
   - Do confirmations appear for critical actions?
   - Are helpful defaults provided?

   Issues:
   - User can enter invalid zip code (no validation until submit)
   - No confirmation before deleting saved address
   - Quantity field allows negative numbers

   Recommendations:
   - Validate zip code in real-time (as user types)
   - Show "Are you sure?" before delete
   - Set minimum quantity = 1, reject negative

6. Recognition Rather Than Recall
   [] Are options visible?
   Questions:
   - Is information displayed (not hidden)?
   - Is context provided (user doesn't need to remember)?
   - Are previous selections shown?

   Issues:
   - User must remember cart items (not shown during checkout)
   - Shipping address not shown at payment step

   Recommendations:
   - Show cart summary in sidebar during entire checkout
   - Show shipping address at payment step (for confirmation)

7. Flexibility and Efficiency of Use
   [] Are there shortcuts for frequent users?
   Questions:
   - Can power users accomplish tasks faster?
   - Are there keyboard shortcuts?
   - Can users save preferences?

   Opportunities:
   - Saved addresses for returning customers
   - One-click reorder
   - Quick order form for B2B (paste multiple SKUs)
   - Keyboard shortcuts (Enter to submit, Esc to close)

8. Aesthetic and Minimalist Design
   [] Is every element necessary?
   Questions:
   - Is there unnecessary information?
   - Is focus clear?
   - Is hierarchy obvious?

   Issues:
   - Checkout form has 15 optional fields (overwhelming)
   - Product page has 3 "Add to Cart" buttons (confusing)
   - Too much text in promo banner (user ignores)

   Recommendations:
   - Hide optional fields behind "More options" link
   - One clear "Add to Cart" button, prominent
   - Shorter, punchier promo text

9. Help Users Recognize, Diagnose, and Recover from Errors
   [] Are error messages helpful?
   Questions:
   - Is error clearly identified?
   - Is explanation provided?
   - Is solution suggested?

   Issues:
   - Error: "Invalid input" (what input? why?)
   - Error: "Error 400" (technical, unhelpful)
   - No suggestion for fixing error

   Recommendations:
   - "Email address is invalid. Please include @."
   - "This credit card is declined. Please try another card."
   - "ZIP code doesn't match city. ZIP for New York should start with 1."

10. Help and Documentation
    [] Is help available when needed?
    Questions:
    - Is help contextual (right place, right time)?
    - Is help easy to find?
    - Is help searchable?

    Opportunities:
    - Tooltip on "CVV": "3-digit code on back of card"
    - Link: "What's my order status?" near order tracking
    - Chatbot available during checkout
    - FAQ link in footer (easy to find)
```

## UX Testing Methods

```markdown
1. Think-Aloud Testing (Manual):
   [] Perform task while narrating thoughts
   Example: "I want to checkout... I click this button... now I'm confused,
   do I click 'Continue' or 'Submit'?"
   [] Document friction points

2. Five-Second Test:
   [] Show page for 5 seconds
   [] Hide it
   [] Ask: "What was the page about? What could you do?"
   [] If user can't answer, layout/hierarchy issue

3. First-Click Test:
   [] Give user a task: "Add this product to cart"
   [] Where do they click first?
   [] If wrong element, layout/labeling issue

4. User Journey Mapping:
   [] Map the entire flow (Browse > Cart > Checkout > Confirmation)
   [] Identify:
     - Moments of delight
     - Moments of frustration
     - Moments of confusion
   [] Recommend improvements for friction points

5. Cognitive Walkthrough:
   [] For each step in flow, ask:
     - Will user know what to do?
     - Can user see how to do it?
     - Will user understand feedback?
     - Will user know they succeeded?
   [] If NO to any, that's a usability issue
```

## UX Issue Bug Report Format

```markdown
Summary: UX: [Feature] - [Pain Point] - [Issue]
Example: "UX: Checkout - Unclear Shipping Options - Users confused about delivery"

Description:
**Feature:** Checkout Flow
**Step:** Shipping Method Selection
**Issue Type:** UX / Usability

**User Pain Point:**
Users are confused about when their order will arrive because shipping options
don't clearly indicate delivery timeframes.

**Current State:**
Shipping options displayed as:
- Standard Shipping - $5.99
- Express Shipping - $12.99
- Next Day - $24.99

**User Confusion:**
- What does "Standard" mean? 3 days? 5 days? A week?
- No estimated delivery date shown
- Users hesitate at this step

**Impact:**
- Cart abandonment at shipping step
- Increased support calls
- User frustration
- Lost sales

**Heuristic Violated:**
Nielsen Heuristic #1: Visibility of System Status

**Suggested Improvement:**
Include delivery timeframe and estimated arrival date:
- Standard Shipping (5-7 business days) - Arrives by [date] - $5.99
- Express Shipping (2-3 business days) - Arrives by [date] - $12.99
- Next Day (order by 2pm) - Arrives by [date] - $24.99

**Additional Recommendations:**
1. Highlight cheapest option (help decision)
2. Highlight fastest option (if needed urgently)
3. Show "Most popular" badge (social proof)
4. Calculate estimated delivery based on current date (dynamic)

**Business Impact:**
- Expected to reduce shipping-step abandonment
- Reduce support calls
- Improve user confidence
- Increase conversion rate

Severity: Medium (affects UX and conversion)
Priority: P1 (UX improvements are valuable)
Type: UX Improvement
Labels: ux, usability, checkout, shipping, clarity
```
