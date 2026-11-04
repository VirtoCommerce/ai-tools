# Tracking Your Follow-Ups on the Tasks Page

*Updated for VCST-6077 (the page formerly called "Calendar" is now "Tasks"); originally written for VCST-5732.*

### Introduction
As a sales rep, you can keep your follow-ups — a call to make, a quote to chase — on one **Tasks** page,
see which days are busy on the **Due dates** calendar, and mark a task complete with a single click.

![The Tasks page: scope chips, task list and Due dates calendar](../regression/REG-2026-10-08-1137/screenshots/SR-TK-011-PASS-r2-chip-closed-today.png)
*The Tasks page for a day: the scope chips on top, the task list on the left, the Due dates calendar on the right.*

### Prerequisites
- You are signed in to the storefront as a Sales Rep and your **Sales Rep hub** is available. Users who
  are not sales reps are sent to their account dashboard instead of the Tasks page.
- Your administrator has the Task module enabled — if you do not see **Tasks** in the hub menu, ask them
  to check this first.

### Open the Tasks page
1. In the account menu, open the **Sales Rep hub** section.
2. Click **Tasks**.

You can also click **All tasks** in the Tasks widget on your hub **Dashboard**.

!!! note "Where did the Calendar page go?"
    The page that used to be called **Calendar** is now **Tasks**, and the dashboard link formerly named
    "Full calendar" is now **All tasks**. An old bookmark to the Calendar page no longer opens — use
    **Tasks** from the hub menu. The header **Today** and **Add task** buttons are gone; **New task** is
    the one button for creating a task.

### Add a follow-up task
1. On the Tasks page, click **New task**.
2. Enter a **Title** and pick a **Due date** — both are required.
3. Optionally set a **Priority** and a **Type**, and add up to 1000 characters of **Notes** (a counter
   under the field shows how much room you have left).
4. Click **Save**.

The form closes and your new task appears in the list for its due date — no page reload needed.

!!! note "Why can't I save without a title or a due date?"
    Every task needs both so it can show up in the right place on your calendar and in the right list.

### Find your tasks by date or status
Above the list you see **scope chips**, each with a count: **Today**, **All**, **Upcoming**, **Overdue**
and **Completed**. The count on a chip is the number of tasks in that list.

- Click **Today** to see what is due today — it also clears any other view and returns the calendar to
  the current month.
- Click **All** to see every task; click **Upcoming**, **Overdue** or **Completed** to see all of your
  tasks in that status, across every date.
- On the **Due dates** calendar, click any day to see just that day's tasks. A chip with the date and an
  **×** appears next to the scope chips.
  A small coloured dot marks a day that has tasks — blue for upcoming, red for overdue, green for
  completed, as the legend under the calendar shows.
- Click **×** on the date chip to leave the day view. You land back on **Today**; if you clicked **All**
  or a status chip after picking the day, closing the date chip keeps that view instead.
- A link such as the dashboard's **"N overdue tasks"** opens the Tasks page already on **Overdue**.

!!! note "A day I picked shows no tasks"
    A day with nothing due reads **"Nothing due on this day"**. Under **All**, an empty list reads
    **"No tasks in this tab"**. If you have no tasks at all, only **Today** and **All** are shown —
    **Upcoming**, **Overdue** and **Completed** appear once you have tasks.

![Empty All view when you have no tasks](../regression/REG-2026-10-08-1151/screenshots/SR-TK-023-PASS-r2-empty-all.png)
*With no tasks, only Today and All are shown; the list says "No tasks in this tab".*

### Complete a task, or reopen it
1. In the task's row, click **Mark as complete** in the **Actions** column.
2. The task's status changes to **Completed**, its title is struck through, and the action in that row
   becomes **Reopen**. Your chip counts update without a refresh.
3. Changed your mind? Click **Reopen** — the task goes back to **Upcoming** or **Overdue**, whichever its
   due date says.

Each row has one action. A task whose status is **Canceled** has no action.

![Spanish storefront with the same task list](../regression/REG-2026-10-08-1137/screenshots/SR-TK-022-PASS-r2-es.png)
*The action is a single short verb in every language the storefront offers — for example "Completar" and "Reabrir" in Spanish.*

### Edit or delete a task
1. Click the task's **title** (or focus it and press **Enter**) to open **Edit task**.
2. Change any field and click **Save** — the fields you did not touch stay as they were. Or click
   **Delete** and confirm in the dialog that appears.

!!! warning
    Deleting a task removes it for good. There is no way to bring it back — if you are unsure, edit it
    instead of deleting it.

### Long titles and notes
Titles and notes that don't fit are shown clipped on two lines. On a desktop browser, hover over a
clipped **title** or **note** to see the rest of it.

!!! note "What about a long note I can't fully read?"
    Hovering with a mouse reveals the full text of both a clipped **title** and a clipped **note**. The
    title is also available if you are using a keyboard or a screen reader; the **note is not** — on a
    touchscreen, or without a mouse, there is currently no way to reveal it. If you need the whole note,
    open the task to edit it; the full text is there in the Notes field.

### Using Tasks on a phone
On a narrow screen each task is shown as a card that carries its own **Mark as complete** / **Reopen**
action, and the page does not scroll sideways.

### Adjusting how many tasks the dashboard widget shows
The Tasks widget on your dashboard has its own **Max rows** setting, from 1 to 10 (5 by default). When
rows are hidden because of this setting, the widget's count tells you, for example "4 tasks (1 shown)".
Click the widget's **"N overdue tasks"** link to jump straight to your **Overdue** list.

### Troubleshooting
- **A task I just added isn't where I expected it** — check its due date and whether it is marked
  complete; completed tasks show under **Completed** (and on their due day), not under Upcoming.
- **The calendar's week starts on a different day than I expect** — this follows your store's language
  and region setting, not a fixed weekday.
- **Tasks aren't sorted the way I expect** — your list is ordered by due date (soonest first); it does
  not follow when a task was created or last edited.

---
*VCST-6077 · verified on the PR #2536 build (local container, backend vcst-qa); not yet on a shared environment ·
verdict round 1 FAIL → round 2 PASS WITH NOTES (ticket Tested) ·
Not documented: keyboard focus after a task action (VCST-6203, focus returns to the top of the page — use the
mouse or re-tab to your row); the overdue notice's contrast on the dashboard widget in the dark coffee theme
(VCST-6204); day boundaries for browsers at UTC−5 (BLOCKED — no timezone emulation); contrast in the red dark
theme (inconclusive); how a day with only canceled tasks is marked, canceled tasks due today, mobile day-pick
scrolling, and what **All** counts versus the other chips (open product questions, not documented as behaviour);
the width of the Due dates panel (open design question) ·
Evidence: `reports/tickets/Sprint26-20/VCST-6077/` · Audiences derived from layer `storefront`*
