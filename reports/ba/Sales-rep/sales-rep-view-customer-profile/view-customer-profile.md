# View a customer's profile

### Introduction

As a **sales representative**, the customer profile page gives you a single, at-a-glance view of one of the organizations you serve — its recent orders, key account figures, and contact details — so you can prepare for a call or follow up on an order without leaving the storefront. You open it from the **My customers** list in the Sales Rep hub.

![The customer profile page for one of your organizations, showing the sales widgets, recent orders, and customer information.](screenshots/customer-profile-overview.png)
*The customer profile opens with the organization's KPIs across the top, its recent **Orders** on the left, and a **Customer information** panel on the right.*

!!! note "Who sees this page?"
    The customer profile is part of the **Sales Rep hub** and is visible only to signed-in users who are assigned as a sales representative for the organization. Regular buyers and reps who do not serve the organization cannot reach it.

### Prerequisites

- You are signed in with a storefront account that has the **sales representative** role.
- The **Sales Rep hub** appears in the left-hand menu (it is enabled for your store).
- You are opening the profile of an organization **you are assigned to serve** — your **My customers** list shows only those organizations.

### Open a customer profile

1. In the left-hand menu, under **Sales Rep hub**, click **My customers**.
2. The **My customers** list shows every organization you serve, with its **Last order** date and number.
   ![The My customers list with one row per served organization.](screenshots/my-customers-list.png)
   *Each row is one of your customers; the badge next to **My customers** shows how many you serve.*
3. Click the customer's **name** in the row you want to open.
4. The customer profile page opens at `/company/my-customers/{customer}`. You will see the organization's name and account type in the header, followed by the sales widgets, **Orders**, and **Customer information** sections.

!!! tip "Find a customer fast"
    Use the **Search by name or account ID** box at the top of the **My customers** list to filter to the organization you need before opening it.

### What the profile shows

The page is organized into the sections below. Everything on it is scoped to the selected organization.

#### Header

The top of the page shows the organization's **name**, its **account type** (for example, *Industrial Distribution*), and its **location**. A breadcrumb trail — **Home / Account / Sales Rep hub / My customers / {customer}** — lets you step back to the list at any time.

#### Sales widgets

A row of key account figures for the organization, such as year-to-date purchases, open balance, average order value, and orders year-to-date. Use them for a quick read on the account's health before you reach out.

!!! note "About the widget figures"
    The sales widgets give you a snapshot of the account. Their detailed behavior and calculations are covered in the separate **Sales widgets** guide.

#### Orders

The organization's orders, **most recent first**. Each row shows the **order number**, **date**, **item count**, **status**, and **total**. Amounts and status labels are shown in your current storefront language and currency.

1. Click an **order number** to open that order's details in a new tab.
2. If the organization has not placed any orders yet, the section shows a **"No orders yet"** empty state instead of a table.

#### Customer information

The organization's contact card:

- **Primary contact** — the main person at the organization.
- **Phone** — the contact's phone number.
- **Account type** — the organization's business category.
- **Ship-to** — the organization's shipping location.

### On a mobile device

On a narrow screen the page rearranges itself so everything stays readable: the widgets and sections stack into a single column, the orders table becomes a compact card per order, and the left menu collapses into a hamburger button.

![The customer profile stacked into a single column on a mobile viewport.](screenshots/customer-profile-mobile.png)
*On mobile, the sections stack top to bottom and each order renders as its own card.*

### Troubleshooting

- **The Sales Rep hub / My customers menu is missing** — your account is not assigned the sales representative role, or the hub is not enabled for your store. Contact your store administrator.
- **A customer you expect is not in the list** — you are assigned only to the organizations shown in **My customers**. If one is missing, ask your administrator to assign you to it.
- **Opening a customer link shows "Customer not found"** — you can only view the profiles of organizations you serve. Opening any other organization's profile shows a not-found message and no data.
- **The "All orders" link shows my own orders** — the **All orders** link in the Orders header opens your account's own order history, not a customer-scoped list. To see a specific customer order, click its **order number** in the profile's Orders section.

---
*Related: **View your sales representatives** · **Sales widgets***

<div style="display: flex; justify-content: space-between;">
<a href="#">← My customers</a>
<a href="#">Sales widgets →</a>
</div>

<!--
Sources / grounding:
- JIRA VCST-5308 "[BFE] [Sales Rep] View customer profile" (parent: Sales Rep Hub) + dev comments (salesRepCustomer / salesRepOrders contract).
- Live behavior verified on vcptcore-qa @ sales-rep xAPI pr-2, Theme vc-theme-b2b-vue 2.54.0-pr-2383 (regression REG-2026-07-17-0519, suite 091).
- Screenshots captured live as the sales rep serving AGENT-TEST-Org-AcmeCorp.
- Out of scope for this page (documented elsewhere): sales-widget value reconciliation (VCST-5309), top products purchased (VCST-5368), drag & drop (VCST-5367). Order status-filter chips are not part of this feature.
-->
