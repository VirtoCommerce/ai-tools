# View a customer's profile

### Introduction

As a **sales representative**, the customer profile page gives you a single, at-a-glance view of one of the organizations you serve — its key account figures, recent orders, best-selling products, and contact details — so you can prepare for a call or follow up on an order without leaving the storefront. You open it from the **My customers** list in the **Sales Rep hub**.

![The customer profile page for one of your organizations, showing the metric cards, recent orders, quick actions, and customer information.](screenshots/doc-customer-profile-overview.png)
*The profile opens with the organization's metric cards across the top, **Recent orders** and **Top sellers** on the left, and **Quick actions** plus **Customer information** on the right.*

!!! note "Who sees this page?"
    The customer profile is part of the **Sales Rep hub** and is visible only to signed-in users assigned as a sales representative for the organization. Regular buyers, and reps who do not serve the organization, cannot reach it.

### Prerequisites

- You are signed in with a storefront account that has the **sales representative** role.
- The **Sales Rep hub** appears at the top of the account menu on the left (it is enabled for your store).
- You are opening the profile of an organization **you are assigned to serve** — your **My customers** list shows only those organizations.

### Open a customer profile

1. In the left-hand menu, under **Sales Rep hub**, click **My customers**. The badge next to the link is the number of customers you serve.
2. The **My customers** list shows one row per organization you serve:

    | Column | What it shows |
    |--------|---------------|
    | **Customer** | The organization's name, with its postal code, city, and state underneath |
    | **YTD purchases** | Total purchased this year to date, and the number of orders behind it |
    | **Last year** | The same total for the previous year, for comparison |
    | **My last order** | The date and number of the most recent order you placed for this customer |
    | **Actions** | A **Send email** button for messaging the organization |

    ![The My customers list with one row per served organization.](screenshots/doc-my-customers-list.png)
    *Each row is one of your customers. Click **Customer**, **YTD purchases**, or **My last order** in the header to re-sort the list.*

3. Click the customer's **name** to open its profile.
4. The profile page opens with the organization's name, account type, and location in the header, followed by the metric cards, **Recent orders**, **Top sellers**, **Quick actions**, and **Customer information**.

!!! tip "Find a customer fast"
    Use the **Search by name** box above the list to filter down to the organization you need before opening it.

### What the profile shows

Everything on the page is scoped to the selected organization.

#### Header

The organization's **name**, its **account type** (for example, *Industrial Distribution*), and its **location**. A breadcrumb trail — **Home / Account / Sales Rep hub / My customers / {customer}** — takes you back to the list.

#### Metric cards

A row of key figures for the account. Use them for a quick read on the account's health before you reach out.

| Card | What it tells you |
|------|-------------------|
| **New orders** | How many orders are still new, their combined value, and how many were placed today |
| **Active cart** | The value of what the customer currently has in its cart but has not ordered |
| **Purchased · MTD** | Spend so far this month, and what share of the year-to-date total that is |
| **Orders placed · YTD** | Order count this year to date, with the total spend underneath |
| **Avg order value** | Average value per order, year to date |

!!! note "Where do these figures come from?"
    The cards are calculated from the customer's real orders and cart in your store, in your current currency. An organization with no activity yet shows zeros rather than blanks. Their detailed behavior is covered in the separate **Sales widgets** guide.

#### Recent orders

The organization's orders, **most recent first**. Each row shows the **order number**, **date**, **items** count, **status**, and **total**, in your current storefront language and currency.

1. Click a **status chip** above the table — **All**, **Completed**, **Pending**, **Cancelled**, and so on — to show only orders in that state.
2. Click **Date** or **Total** in the header to re-sort the table.
3. Click an **order number** to open that order's details.
4. If the organization has not placed any orders yet, the section shows a **"No orders yet"** empty state instead of a table.

#### Top sellers

The products this customer buys most, ranked, with the **units** bought and the **revenue** they generated. Click a **category chip** to narrow the ranking to one category, or **Units** / **Revenue** in the header to switch the ranking basis. Click a product name to open its page.

#### Quick actions

**Send email** opens a **Send a message** dialog that reaches every member of the organization:

1. Enter a **Title** and a **Message**.
2. Under **Send via**, choose **Email**, **Push notification**, or both.
3. Click **SEND**.

![The Send a message dialog, addressed to every member of the organization.](screenshots/doc-send-email.png)
*The dialog states which organization it reaches. **Message** and **Send via** are required.*

!!! note "Actions that are not available yet"
    **Order on behalf**, **Create quote**, and **Schedule call** appear in the panel but are not enabled yet.

#### Customer information

The organization's contact card: **Primary contact**, **Phone**, **Account type**, and **Ship-to** location.

### Rearrange the page

Click **Edit layout** below the left-hand column to move, reorder, or hide the sections of the profile, and your arrangement is remembered the next time you open a customer. See the separate **Customize your layout** guide for the full walkthrough.

### On a mobile device

On a narrow screen everything stacks into a single column — the metric cards one per row, each order as its own card — and the left menu collapses into a hamburger button.

![The customer profile stacked into a single column on a mobile viewport.](screenshots/doc-customer-profile-mobile.png)
*On mobile the sections stack top to bottom, in the same order as the desktop layout.*

### Troubleshooting

- **The Sales Rep hub / My customers menu is missing** — your account is not assigned the sales representative role, or the hub is not enabled for your store. Contact your store administrator.
- **A customer you expect is not in the list** — you see only the organizations you are assigned to. Ask your administrator to assign you to the missing one.
- **Opening a customer link shows "Customer not found"** — you can only view the profiles of organizations you serve. Any other organization's profile shows a not-found message and no data.
- **The "All orders" link shows my own orders** — the **All orders** link in the **Recent orders** header opens your own account's order history, not a customer-scoped list. To open a specific customer order, click its **order number** in the table.
- **Clicking "Sales Rep hub" in the breadcrumb does nothing** — that step is a label, not a link. Use **My customers** in the breadcrumb or the left-hand menu instead.

---
*Related: **View your sales representatives** · **Sales widgets** · **Customize your layout***

<div style="display: flex; justify-content: space-between;">
<a href="#">← My customers</a>
<a href="#">Sales widgets →</a>
</div>

<!--
Sources / grounding:
- JIRA VCST-5308 "[BFE] [Sales Rep] View customer profile" (Story, Done; parent Epic VCST-5142 Sales Rep Hub) + dev comments (salesRepCustomer / salesRepOrders contract) + the QA run comment of 2026-07-17.
- Live re-verified 2026-08-06 on vcptcore-qa (B2B-store), Theme vc-theme-b2b-vue 2.55.0-pr-2400, signed in as the seeded rep SR_REP_PRIMARY (@td(SR_REP_PRIMARY.email)), profile of @td(ORG_ACME) — 4 served orgs, 6 orders.
- Screenshots captured live in that session (playwright-chrome; firefox clicks are unreliable on this env).
- Revised vs the 2026-07-20 draft, which predated the statistics/top-sellers/layout builds. Changes: metric cards are named and live (were described as generic "sales widgets"); the My customers list gained YTD purchases / Last year / My last order / Actions columns; Recent orders gained status-filter chips + Date/Total sorting (the old draft said no status filter exists); Top sellers, Quick actions, and Edit layout are new sections; the search box is labeled "Search by name" (not "…or account ID").
- Cross-referenced, documented elsewhere: sales-widget calculations (VCST-5309), top products purchased (VCST-5368), drag & drop layout (VCST-5367), customer communication (VCST-5310).
- Known behaviors kept in Troubleshooting rather than presented as features: the "All orders" link scope and the inert "Sales Rep hub" breadcrumb step (both raised on VCST-5308, still present).
-->
