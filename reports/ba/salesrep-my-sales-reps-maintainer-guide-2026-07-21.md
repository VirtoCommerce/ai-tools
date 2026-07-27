# Viewing the Sales Reps Assigned to Your Company

### Introduction

If your organization works with a **Sales Rep**, you can see who they are and how to reach them without
contacting support. The **Sales reps** page lists everyone currently assigned to serve your company, with
their name, email, and phone number.

![Sales reps page showing the Corporate section and a populated Name/Email/Phone table](screenshots/salesrep-my-sales-reps/01-corporate-sales-reps-populated.png)
*The **Sales reps** entry sits in the **Corporate** section of your account sidebar, next to Company info and Company members.*

### Prerequisites

- You are signed in to a **corporate account** (a company/organization account, not a personal account).
- You are a member of an organization that a Sales Rep has been assigned to. If your company has no
  assigned rep yet, the page still opens but shows no results — see **Troubleshooting** below.

### Path 1 — Find your organization's sales reps

1. Sign in and open your account. Your account sidebar appears on the left.
2. Under **Corporate**, click **Sales reps**.
3. The page loads at a heading reading **"Sales reps"**, with a search box and a table.
4. Each row shows one rep's **Name**, **Email**, and **Phone**. Click a column header to sort by name.
5. Use the search box to filter by typing a name, email, or phone number and pressing **Enter** (or
   clicking the search button next to it).

!!! note "Who assigns my sales rep?"
    Your Sales Rep is set up by your provider's back-office team, not by you or anyone in your company.
    If you think the wrong person is listed, contact your provider's support team — this page is
    read-only contact information.

!!! note "I belong to more than one organization"
    The **Sales reps** page always reflects your **currently active organization**. If you manage more
    than one company, click your name in the top header, choose **Organizations**, and select the other
    company — the rep list updates to match.

!!! note "A rep is a special kind of team member"
    A Sales Rep may also appear in your **Company members** list with the Sales Representative role.
    They aren't a regular employee you manage day to day — they're your provider's point of contact,
    added there so they can act on your organization's behalf in the storefront.

### Troubleshooting

- **No "Sales reps" link under Corporate** — either your store doesn't have this feature turned on, or
  your organization doesn't have a rep assigned yet. Contact your provider's support team to confirm.
- **Page shows "No sales reps found"** — your organization currently has no active rep assigned. This is
  expected for a brand-new company and not an error.

  ![Sales reps page with the "No sales reps found" empty state](screenshots/salesrep-my-sales-reps/02-empty-state-no-reps.png)
  *A company with no rep assigned yet sees this message instead of a table.*

- **Searched and got no rows** — the page shows "No sales reps match your search" with a **Reset search**
  button; click it to see the full list again.
- **Phone column is blank for a rep** — the rep's phone number wasn't entered in their profile; this isn't
  a display error. Use the email address to reach them instead.

---

<div style="display: flex; justify-content: space-between;">
<a href="./company-members.md">← Company members</a>
<a href="./profile.md">Profile →</a>
</div>

*Sources: JIRA [VCST-5409](https://virtocommerce.atlassian.net/browse/VCST-5409) "[FE] [Organization member] My Sales Reps Contact Information" (Epic VCST-5142, Sales Rep Hub); sibling story [VCST-5469](https://virtocommerce.atlassian.net/browse/VCST-5469) "My customers" (sales-rep-facing view); screenshots captured live on `vcptcore-qa` ({{FRONT_URL}} = https://vcptcore-qa-storefront.govirto.com/) as organization maintainer `belovedushka@gmail.com`, Theme 2.54.0-pr-2383-f713, 2026-07-17 (`tests/Sprint-current/VCST-5409/screenshots/`).*
