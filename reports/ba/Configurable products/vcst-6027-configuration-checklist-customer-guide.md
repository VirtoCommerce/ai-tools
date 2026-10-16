# Use the configuration checklist on a configurable product

### Introduction
When you customize a product such as a cake, the **Price and delivery** block now lists every option you still need to look at. Each row tells you whether an option is done, required or optional, and links you straight to it. This is part of the upcoming storefront release.

![Checklist on first load: required rows are red, optional rows are yellow](../../tickets/Sprint26-20/VCST-6027/screenshots/VCST-6027-4a-alltypes-load-1920.png)
*The checklist when you first open a configurable product.*

### Prerequisites
- You are on the page of a configurable product. Simple products and products with variations have no checklist.
- You do not need to sign in to see the checklist.

### What the rows mean
| Row | Meaning |
|---|---|
| Green | The option is done. |
| Red, ends with "required" | You must fill this option in before you can add the product to your cart. |
| Yellow, ends with "optional" | You can skip this option. |

Each optional option has its own row and its own **Review** link. Options that depend on another option have no row until you choose that option.

### Complete the configuration
1. Open the configurable product page and find the checklist in the **Price and delivery** block, below **Add to cart**.
2. Click the link on a red row:
   - **Fill it in** for a text option.
   - **Upload a file** for a file option.
   - **Check it out** for an option where you pick a product.
   The option opens, even if you had collapsed it, and the page scrolls to it.
3. Fill in the option. When you finish a required option, its row turns green and "required" disappears.
4. Click **Review** on a yellow row if you want to look at an optional option.
5. Repeat until no row is red. **Add to cart** then becomes available.
   ![Every required row is green](../../tickets/Sprint26-20/VCST-6027/screenshots/VCST-6027-ff-c1-journey-final-checklist.png)
   *All required rows are done.*
6. Click **Add to cart**. The components in your cart line match the green rows.

!!! note "Why did a new row appear after I chose an option?"
    Some options depend on another option. When you choose the option they depend on, they appear in the list. If you clear that choice, they disappear again.

!!! note "I'm on my phone. Where is the checklist?"
    On a phone the checklist is in the **Share & Actions** block. The links work the same way.

   ![Checklist on a phone](../../tickets/Sprint26-20/VCST-6027/screenshots/VCST-6027-4a-e2-e3-mobile-375-share-actions.png)

### Edit a configured product from your cart
1. Open the cart and edit the configured product.
2. The same checklist is shown, already green for the options you chose.
3. If you clear a required option, its row turns red and the update button is unavailable until you fill it in again.

### Not documented
- What a finished **Text** or **File** row displays. Under review (VCST-6188): the requirement says name and value, the build shows the name only.
- Which other buttons the checklist also covers, and where it sits on a phone relative to the bottom bar. Open product-owner questions.

*QA verdict: FAIL — AC-1/AC-3.1 not met for Text and File rows (VCST-6188). Only verified paths are described above.*
