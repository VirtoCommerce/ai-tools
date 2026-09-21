# Reusing the same content block across many pages

*For the person who manages content on your site. No technical knowledge needed.*

## What this lets you do

If the same block appears on many pages — a delivery-promise bar, trust badges, a seasonal banner, a
legal disclaimer — you no longer have to edit each page by hand. Save it once as a **Shared Component**,
place it wherever you need it, and when you change the original, every page using it changes with it.

Nothing changes for your shoppers. They see the same ordinary page they always did; the reuse happens
entirely on your side.

## Before you start

- You need access to **Page Builder** and permission to edit content.
- The page you want to work on should already exist and be published.
- Decide which blocks genuinely belong together. A Shared Component is a **group of whole sections**,
  taken from the page in the order they already appear.

## Creating your first Shared Component

1. Open the page in **Designer**.
2. In the left panel, **hover over the small icon at the left of a section row**. It turns into a
   checkbox — click it to select that section.
   *This is the part people miss: an ordinary click opens the section for editing instead of selecting
   it. You must hover the icon.*
3. Select the sections you want to reuse. They must be **next to each other**.
4. Open the menu at the top of the panel and choose **Save selected as Shared Component**.
5. Give it a name you will recognise later — "Free delivery bar", not "Block 3".

Your selected sections collapse into a single row marked **Shared**. Everything you did not select
stays exactly where it was.

**If it refuses you, it will say why:**

| Message | What it means |
|---|---|
| *Select adjacent sections to create a Shared Component* | the sections you picked are not next to each other |
| *Select only independent sections to create a Shared Component* | your selection already contains a Shared Component, and they cannot be nested |

Neither refusal changes your page, so you can simply adjust the selection and try again.

## Placing it on another page

Open the other page in Designer, click **Add block**, and you will find **Shared Blocks Library** at the
top of the panel — your normal blocks are still underneath it. Choose your component, and then make the
one decision that matters:

| Choose | When |
|---|---|
| **Insert shared instance** | you want this page to follow the original. Edit the original later and this page updates too. This is what you want for a delivery bar, a promo banner, a disclaimer. |
| **Create independent copy** | you want a starting point you can then change freely. It is a copy from this moment on and will never follow the original again. |

If you are unsure, pick **Insert shared instance** — you can always detach it later, but you cannot
turn a copy back into a linked one.

**Remember to save the page.** The component does not count this page as "used" until you do.

## Editing the original

Click a **Shared** row and the panel tells you what you are dealing with: the component's name, how many
pages use it, and a **Where used** list you can click through. Before you commit a change it warns you
plainly, for example:

> Editing will update all 3 pages using it.

Take that seriously — it means exactly what it says. **Edit original** opens the component itself; save,
and every linked page follows. There is no undo across pages and no version history, so if you are
making a large change, check the **Where used** list first and make sure you are happy for all of those
pages to change.

## Breaking the link for one page

If one page needs to differ, open it and choose **Detach** on that row. It becomes ordinary sections you
can edit freely, and later changes to the original no longer reach it.

Detaching is **one-way** — there is no "re-attach". If you want the link back, delete those sections and
insert the component again.

## Deleting a component

You cannot delete a Shared Component while any page still uses it, and the message names the pages that
are holding it. Remove or detach it from each of those pages, **save them**, and the component can then
be deleted.

Two things worth knowing so the count does not confuse you:

- The count **includes the page you originally created it from**, if that page still shows it.
- If you detach on a **published** page, the count drops only once you **publish that page again** — the
  live version still contains it until then.

## If something looks wrong

- **The menu opens but it is empty, or the actions are greyed out.** Two different things. If the actions
  are greyed out, you probably have nothing selected — remember the hover-the-icon step. If the menu is
  completely empty, your browser is blocking clipboard access; this is a known issue
  (**VCST-6011**) and it affects Firefox in particular. Use Chrome or Edge for now.
- **You opened the Shared Components list and it says "Store context is missing".** You reached it by a
  direct link. Go back and open it from inside Page Builder instead.
- **Two people editing the same page at once.** Avoid it for now. There is currently no warning if a
  colleague saves the same page while you are working on it, and the last save wins (**VCST-6009**).

---

*Written 2026-09-17 against the Page Builder build verified on vcptcore-qa. Behaviour described here was
observed live, not taken from the specification.*
