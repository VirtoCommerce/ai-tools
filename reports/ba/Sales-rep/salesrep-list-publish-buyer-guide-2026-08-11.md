# Ordering from a List Your Sales Rep Shared with You

### Introduction
When your sales representative recommends products, they can send you a ready-made list. You open it from the link they send, set the quantities you need, and add the items to your cart like any other product.

![Notification carrying the message from the sales rep together with the link to the shared list](../screenshots/salesrep-list-publish-clean/05-buyer-notification-with-link.png)
*Your rep's message arrives exactly as they typed it, with the link to the list.*

### Prerequisites
- You are signed in to the storefront with your corporate account.
- Your sales representative has shared a list with your organization and sent you the link.
- If you belong to more than one organization, the organization the list was shared with is your active one. See the troubleshooting section if you are unsure.

### Open the list your rep sent you
1. Open the link in the email or notification from your rep.
2. If you are not signed in yet, the storefront asks you to sign in first. Sign in at `{{FRONT_URL}}/sign-in`, then the list opens.
3. At the top of the list you see **"Recommended by your sales representative"**, confirming who sent it.

![Shared list with the banner "Recommended by your sales representative" above three priced product rows, with the Order summary card alongside](../screenshots/salesrep-list-publish-clean/06-buyer-shared-list-banner.png)
*The banner tells you the list came from your rep. There are no list-wide buttons — you add items one row at a time.*

!!! note "The list is not in my own Lists page — is that normal?"
    Yes. A list your rep shared with you does not appear under **Lists** in your account, and it is not added to your notifications as a list entry. The link your rep sent is the only way in, so keep that email or notification.

!!! tip
    Bookmark the link. You can come back to the list as often as you like, and order only part of it each time.

### Order the products
1. For each row, check **Product**, **Properties** and **Price per item**. A row marked **In stock** is available to order now.
2. Type the quantity you want in the quantity box on that row.
3. Click **Add to cart**.
4. **Nothing pops up — and that is normal.** There is no message and no dialog. The only sign it worked is on the row itself: the button relabels from **Add to cart** to **Update cart**, and an **in Cart** count appears next to it showing the quantity now in your cart.
5. Use **Update cart** after changing a quantity, and repeat for any other rows you want.

![Shared list row after adding it: the button now reads Update cart with an in Cart count, with the Order summary Subtotal alongside](../screenshots/salesrep-list-publish-clean/07-buyer-item-added.png)
*Once a row is in your cart its button reads **Update cart** and carries an **in Cart** count.*

6. When you have everything you need, open your cart and check out as usual.

!!! note "There's no checkout button on the list — where do I pay?"
    You add the rows you want, then check out from your cart in the normal way. The **Subtotal** in the **Order summary** card is the **list's own** total — it adds up the rows at the quantities shown, so it tells you what the whole list would cost. It does **not** change when you add a row to your cart. Your cart total is in the cart.

!!! note "Do I have to order the whole list?"
    No. Add only the rows you need and leave the rest. The list stays available at the same link for next time.

### Troubleshooting
- **I see "Access denied"** — you are signed in, but your active organization is not the one the list was shared with. The page shows **403 · Access denied** with the message "You do not have permissions to access the requested page" and only a **Home page** link. Open your account menu, switch to the organization your rep shared with, then open the same link again. The list then loads normally.

- **The link asks me to sign in** — shared lists are private to your organization, so the storefront always signs you in first. Sign in and the list opens straight away.
- **I lost the link** — ask your rep to send it again. The list is not listed anywhere in your own account, so the link is the only way to reach it.
- **I got no email or notification** — your rep may have turned that channel off when they shared. Ask them to resend, or to send you the link directly.
- **The list stopped opening** — your rep can share a list with only one customer at a time, so sharing it onward removes your access. Ask them for a copy of your own.
- **There are no buttons to add everything at once** — that is expected on a shared list. Add each row you want with its own **Add to cart** button.

********
<div style="display: flex; justify-content: space-between;">
<a href="https://docs.virtocommerce.org/storefront/user-guide/account/lists">← Lists</a>
<a href="https://docs.virtocommerce.org/storefront/user-guide/cart">Cart →</a>
</div>

Sources: [Lists](https://docs.virtocommerce.org/storefront/user-guide/account/lists) · [Cart](https://docs.virtocommerce.org/storefront/user-guide/cart) · [Personal and Corporate Accounts](https://docs.virtocommerce.org/storefront/user-guide/account/overview) (StorefrontUserGuide — lists shared by a sales representative are not yet published there) · live storefront verification, 2026-08-11.
