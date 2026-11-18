## Documentation — VCST-6157: Filter Sales Rep Hub tasks by customer and priority

### What's new
On the **Tasks** page of the Sales Rep Hub you can now narrow your task list by **customer** and by
**priority**. The **Customers** filter lists only the organizations you serve, and you see only your own
tasks for them. Filters combine: a task must match every filter you set. The list has new **Priority**
and **Customer** columns, and you can link any task to a customer in the **New task** and **Edit task**
dialogs.
Shipped in: VirtoCommerce.SalesRep@3.1018.0-pr-33-ff13 · VirtoCommerce.TaskManagement@3.1007.0-pr-33-14ff · platform@3.1094.0 · theme@2.62.0-pr-2637-02f2-02f26436

### How to set it up
- **Modules:** deploy Sales Rep and Task Management together, at the versions in *Shipped in*. The run
  verified the filters on that pair.
- **Sales Rep in the store:** in the back office, click **Stores**, select the store, open the
  **Settings** widget and turn **Sales rep enabled** on.
- **Customers of the rep:** in **Sales Reps**, open the rep and select the organizations they serve.
  Those organizations are what the **Customers** filter and the **Customer** field offer.

### How it works

#### Find a customer's tasks
1. In the account menu, open **Sales Rep Hub**, then **Tasks**. The page opens on today's tasks, with a
   **Due today** chip.

   ![Tasks page with the Customers, Status and Priorities filters](../../tickets/Sprint26-22/VCST-6157/vcst/screenshots/docs/doc-01-tasks-page.png)
2. Click **×** on the **Due today** chip to see tasks for every date. Then click **All customers**. The
   list shows only the customers you serve.

   ![The Customers list](../../tickets/Sprint26-22/VCST-6157/vcst/screenshots/docs/doc-02-customers-open.png)
3. Check a customer. A chip with its name appears. The list and the **Due dates** calendar show only
   that customer's tasks.

   ![One customer picked: 2 tasks](../../tickets/Sprint26-22/VCST-6157/vcst/screenshots/docs/doc-03-customer-picked.png)

Check several customers to see the tasks of any of them.

![Walkthrough: find a customer's tasks](../../tickets/Sprint26-22/VCST-6157/vcst/screenshots/docs/VCST-6157-filter-by-customer.gif)

#### Narrow by priority
1. Click **All priorities**. It offers **Lowest**, **Low**, **Normal**, **High** and **Highest**.

   ![The Priorities list](../../tickets/Sprint26-22/VCST-6157/vcst/screenshots/docs/doc-04-priorities-open.png)
2. Check **Highest**. The list keeps only the tasks that match the customer **and** the priority.

   ![Customer and priority together: 1 task](../../tickets/Sprint26-22/VCST-6157/vcst/screenshots/docs/doc-05-priority-picked.png)
3. To drop one filter, click **×** on its chip.

![Walkthrough: narrow by priority](../../tickets/Sprint26-22/VCST-6157/vcst/screenshots/docs/VCST-6157-filter-by-priority.gif)

!!! tip
    Priority names match exactly: **High** never shows **Highest** tasks, and **Low** never shows
    **Lowest** ones.

#### Link a task to a customer
1. Click **New task**. The **Customer** field starts empty, with **No customer**.

   ![The New task dialog](../../tickets/Sprint26-22/VCST-6157/vcst/screenshots/docs/doc-06-new-task.png)
2. Enter a **Title**, then open **Customer**. It lists the customers you serve.

   ![The Customer list in the dialog](../../tickets/Sprint26-22/VCST-6157/vcst/screenshots/docs/doc-07-customer-list.png)
3. Pick one customer, fill in the other fields, and click **Save**.

   ![A customer picked](../../tickets/Sprint26-22/VCST-6157/vcst/screenshots/docs/doc-08-customer-set.png)
4. The task shows the customer in the **Customer** column, and that customer's filter finds it at once.

   ![The saved task under its customer](../../tickets/Sprint26-22/VCST-6157/vcst/screenshots/docs/doc-09-task-with-customer.png)

![Walkthrough: link a task to a customer](../../tickets/Sprint26-22/VCST-6157/vcst/screenshots/docs/VCST-6157-task-customer.gif)

!!! note
    **Edit task** has the same **Customer** field. Changing other fields keeps the customer; a task with
    no customer shows **—** in the **Customer** column. **Schedule call** on a customer's page opens
    with that customer already picked.

Video: VCST-6157-tasks-by-customer.mp4 (attached to this ticket).

Not documented: the run's FAIL and BLOCKED rows — picking a customer while **Due today** is on can show 0 tasks (SC-12.8, product question), two **Edit task** dialogs open on one task can clear a customer (SC-8.1, product question), the REST task search with `priority` beside an empty `priorities` list (SC-12.7) · not decided by a look in round 1: the search box inside **Customers**, **Reset filters**, the Customer field for every task type (C-9, C-10, C-11) · letter case on PostgreSQL (SC-2.3, stand runs SQL Server) · the selects read "1 items selected" (Low, ui-kit) · round 1 tested SalesRep pr-33-04e4; the full customer names and the wrapping filter row (VCST-6701, VCST-6702) were verified on pr-33-ff13 by a re-check with no checklist, and the frames were captured on ff13
Verified on vcst · run qa-ticket round 1 + fix re-check pr-33-ff13 (REG-2026-11-05-1651) · verdict PASS WITH NOTES · captured 2026-11-05 · versions capture

Sources: [Sales Rep Hub](https://docs.virtocommerce.org/storefront/user-guide/account/sales-rep-hub) · [Enable Sales Rep App](https://docs.virtocommerce.org/platform/user-guide/sales-rep/enabling-sales-rep) · [Manage Sales Reps](https://docs.virtocommerce.org/platform/user-guide/sales-rep/managing-sales-reps) · [vc-module-sales-rep#33](https://github.com/VirtoCommerce/vc-module-sales-rep/pull/33) · [vc-module-task-management#33](https://github.com/VirtoCommerce/vc-module-task-management/pull/33) · `SalesRepTasksQuery.cs:43`
