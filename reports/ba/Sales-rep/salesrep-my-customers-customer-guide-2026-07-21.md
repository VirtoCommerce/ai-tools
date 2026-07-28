# Viewing Your Customer Portfolio as a Sales Rep

### Introduction
If your storefront account has sales rep access, your account sidebar shows a **Sales Rep hub** section with a **My customers** view — a table of every customer organization you're responsible for, plus the last order you placed on their behalf. Use it to check in on your accounts without leaving the storefront.

![Sales Rep hub section above Purchasing in the account sidebar, with My customers showing a badge of 4](screenshots/salesrep-my-customers/01-dashboard-sales-rep-hub-sidebar.png)
*The Sales Rep hub sits above the Purchasing section in your account sidebar. The number on My customers is how many customers you currently serve.*

### Prerequisites
- You're signed in to the storefront with a corporate account that has sales rep access.
- Your administrator has linked you to at least one customer organization. If you don't see a **Sales Rep hub** section, or **My customers** sends you back to the dashboard, you likely don't serve any organizations yet — ask your administrator.

### View your customer list
1. Go to `{{FRONT_URL}}/sign-in` and sign in with your email and password.
2. In the account sidebar, find the **Sales Rep hub** section at the top and click **My customers**. The badge next to it (**4** in this example) is your total customer count.
3. The page loads with the heading **My customers** and a table with two columns: **Customer** and **My last order**.

![My customers table listing four organizations with their last order date and order number, or a dash when there's no order yet](screenshots/salesrep-my-customers/02-my-customers-table.png)
*Each row shows the organization name and account number/location; the right column shows the last order you placed for that customer, or a dash if there isn't one yet.*

!!! note "Why does one of my customers show a dash instead of a date?"
    A dash (**—**) means there's no order attributed to *you* for that customer yet — even if the organization has ordered before through another rep or channel. **My last order** only counts orders placed under your name.

### Open a customer's last order
1. In the **My last order** column, click the order number link (for example **#CO260716-00001**).
2. The order detail page opens in a new tab with the full order — items, totals, and status.

![Order detail page opened from the My customers table, showing the customer's most recent order](screenshots/salesrep-my-customers/03-customer-order-details-opened.png)
*Opening a customer's last order from your portfolio view takes you straight to their order — no separate search required.*

!!! tip
    Clicking the organization name itself (rather than the order link) opens that customer's own detail page — useful if you need more than just the last order.

### Search and sort your customers
1. Type part of an organization's name into the **Search by name** box and press **Enter** or click the search icon.
2. Click the **Customer** column header to sort your list alphabetically.
3. If you serve more than 10 customers, use the pager at the bottom of the table to move between pages (10 customers per page).

![My customers table filtered to organizations matching "Acme"](screenshots/salesrep-my-customers/04-search-filtered-acme.png)
*Searching by name narrows the table to matching organizations — useful once your portfolio grows past a handful of accounts.*

### Troubleshooting
- **I don't see a Sales Rep hub in my sidebar** — your account doesn't have sales rep access. Ask your administrator to check your role.
- **Clicking My customers sends me back to the dashboard** — you have sales rep access but aren't yet linked to any customer organization; ask your administrator to assign you at least one.
- **My last order shows a dash for a customer I know has ordered** — that order wasn't placed under your name. Only your own orders for that customer count here.

********
<div style="display: flex; justify-content: space-between;">
<a href="https://docs.virtocommerce.org/storefront/user-guide/account/company-info">← Company info</a>
<a href="https://docs.virtocommerce.org/storefront/user-guide/account/orders">Orders →</a>
</div>

Sources: [Dashboard](https://docs.virtocommerce.org/storefront/user-guide/account/dashboard) · [Personal and Corporate Accounts](https://docs.virtocommerce.org/storefront/user-guide/account/overview) · [Company Info](https://docs.virtocommerce.org/storefront/user-guide/account/company-info) (StorefrontUserGuide — the Sales Rep hub itself is not yet published there).
