# Sharing a List with One of Your Customers

### Introduction
As a sales rep you can build a list of products in the storefront and share it with one of the customer organizations you serve. Your customer opens the list from the link you send, sets quantities, and adds the items to their cart.

![Lists page with four lists, one carrying a Shared with customer badge](../screenshots/salesrep-list-publish-clean/01-rep-lists-with-badges.png)
*Your **Lists** page shows the sharing state of every list. A badge reads **Private**, **Shared**, or **Shared with customer** — the last one means it has gone out to a customer.*

### Prerequisites
- You are signed in to the storefront with a corporate account that has sales rep access.
- Your administrator has linked you to at least one customer organization. If your sidebar has no **Sales Rep hub** section, you do not serve any customers yet.
- You know which products you want to recommend.

### Create a list and share it as you go
1. In the account sidebar, under **Purchasing**, click **Lists**. If you have never made one, you see "You have not created any lists yet".
2. Click **Create list**. The **New List** dialog opens.
3. Fill in **List name**. Keep it short — names longer than 25 characters are rejected with "This field must not contain more than 25 characters".
4. Optionally add a **Description**. The counter under the box starts at **0 / 250**.
5. Under **Sharing options**, change **Private** to **Customer**.

   ![List settings with Sharing options set to Customer, showing the Link field and the Customer field](../screenshots/salesrep-list-publish-clean/02-list-settings-customer-scope.png)
   *Choosing **Customer** reveals the share **Link** with a copy button and a searchable **Customer** field.*

6. Open the **Customer** picker and choose the organization you want to share with. The picker searches the organizations you serve.
7. Once a customer is chosen, a **Message** box appears with the counter **0 / 907**, plus a **Send via** group. **Email** and **Push notification** are both ticked for you.
8. Type an optional message to your customer, and leave at least one channel ticked.
9. Click **Create list**.

![List settings ready to publish: a customer chosen, a message typed, and both Email and Push notification ticked](../screenshots/salesrep-list-publish-clean/03-list-settings-filled.png)
*The filled dialog: the customer, your message, and the two **Send via** channels that carry the link.*

!!! note "Can I share with a specific person?"
    No. You share with a customer *organization* you serve, and everyone in that organization who can see lists can open it. The picker lists organizations, not people.

!!! warning "Leave at least one channel ticked"
    Nothing stops you from unticking both **Email** and **Push notification**. The share still saves, but your customer gets no email and no notification — and the list does not appear anywhere in their account. The link becomes unreachable for them. If you untick both, copy the **Link** and send it yourself.

!!! warning "Confirm your customer received the link"
    The dialog closes as a success whether or not the notification actually went out, and your message and channel choices are not kept. There is no way to check afterwards, so confirm with your customer that they received the link.

### Share a list you already made
1. Open **Lists** and click the list you want to share.
2. Click **List settings** at the top of the list page.
3. Change **Sharing options** to **Customer**, pick the organization, and add a message.
4. Click **Save**.
5. The dialog simply closes — there is no confirmation message. Go back to **Lists**: the list now carries a **Shared with customer** badge next to its date. That badge is your only confirmation.

![Close-up of a list row carrying the Shared with customer badge](../screenshots/salesrep-list-publish-clean/04-shared-with-customer-badge.png)
*The badge on the list row is how you confirm the share saved.*

!!! note "Where is the Share option in the list menu?"
    There isn't one. The list's own menu offers only **Edit** and **Delete**. Sharing always happens in **List settings** on the list's page, or in the **New List** dialog while you create it.

!!! tip
    **Delete** asks you to confirm first: a **Confirm Delete** dialog reads "Are you sure you want to remove the "&lt;name&gt;" list?".

!!! warning "Only one customer at a time"
    The **Customer** picker takes a single organization. If you pick a second one it replaces the first, and the earlier customer loses access. The dialog warns you about this before you save. Use the clear button (**×**) if you want to stop sharing instead.

!!! note "Why can't I see the message I sent?"
    Reopen **List settings** and the customer and the sharing option are still there, but the **Message** box and the whole **Send via** group are gone. You cannot review what was sent. Keep your own note if you need a record.

### Add products to a list
1. Browse the catalog and find a product you want to recommend.
2. On the product card, click **Add to list**. The **Please select list** dialog opens.
3. Pick an existing list, or click **Add new list** to make one on the spot, then click **Save**.
4. Open the list from **Lists** to check quantities, then click **Save changes**.

!!! tip
    From the list page you can also use **Add all to cart** or **Buy now** to order the whole list yourself — handy when you place the order on the customer's behalf.

### What your customer receives
Your customer gets your message with the link to the list on each channel you left ticked.

![Customer notification carrying the rep's message and the link to the shared list](../screenshots/salesrep-list-publish-clean/05-buyer-notification-with-link.png)
*Your message reaches your customer exactly as you typed it, with the link to the list.*

Two things are worth telling your customer up front, because neither is obvious:

- **Adding a row to the cart shows no confirmation.** There is no message and no dialog. The only sign it worked is on the row itself: **Add to cart** relabels to **Update cart** and an **in Cart** count appears beside it.
- **The Subtotal in the Order summary is the list's own total**, not their cart's. It adds up the rows at the quantities shown and does not move when they add something to the cart. Their cart total lives in the cart.

### Troubleshooting
- **My customer says no email or notification arrived** — reopen **List settings**, tick the channel you want, retype your message and save again. If it still does not arrive, copy the **Link** and send it to them directly.
- **My customer says they get "Access denied"** — they are signed in under a different organization. Ask them to switch their active organization in their account menu, then reopen the link.
- **The list disappeared from my customer's view** — you shared the same list with another customer afterwards, which replaced the first one. Share it with them again, or make a separate list per customer.
- **Save fails** — the customer sharing option may not be enabled for your store. Ask your administrator.
- **I don't see a Lists section** — your account may not have permission to manage lists. Ask your administrator.
- **The name is rejected** — list names are limited to 25 characters.

********
<div style="display: flex; justify-content: space-between;">
<a href="https://docs.virtocommerce.org/storefront/user-guide/account/lists">← Lists</a>
<a href="https://docs.virtocommerce.org/storefront/user-guide/account/orders">Orders →</a>
</div>

Sources: [Lists](https://docs.virtocommerce.org/storefront/user-guide/account/lists) · [Personal and Corporate Accounts](https://docs.virtocommerce.org/storefront/user-guide/account/overview) · [Dashboard](https://docs.virtocommerce.org/storefront/user-guide/account/dashboard) (StorefrontUserGuide — sharing a list with a customer is not yet published there) · live storefront verification, 2026-08-11.
