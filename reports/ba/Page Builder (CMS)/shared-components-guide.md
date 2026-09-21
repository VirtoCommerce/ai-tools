# Page Builder — Shared Components

Guide for the surface VCST-4933 moved. Verified on vcptcore-qa, 2026-09-17, verdict PASS WITH NOTES.
Audiences derived from `summary.json.layer` = `cross-layer`: the outermost surface with an actual
delta is the back office (administrators), and the contract moved too (developers). There is no
shopper section — a shopper sees the same ordinary blocks as before, so there is no delta to document.

Shared Components let a content manager turn a group of page sections into one reusable element.
Insert it on as many pages as you like, edit it once, and every linked placement updates — no manual
repetition, and no copy that quietly drifts out of date.

---

## For administrators

### Create one from a page you already have

1. Open the page in **Designer**.
2. Hover the **type icon** at the left of a section row — it turns into a **checkbox**. Click it.
   (This is the only way to select a section: an ordinary click opens the section editor instead.)
3. Select the **adjacent** sections you want to reuse together.
4. Open the **page-level menu** (the `tune` icon in the panel header) → **Save selected as Shared Component**.
5. Give it a name and confirm.

The selected rows collapse into a single **Shared** row. Sections you did not select keep their
position and order. You will see `Shared Component "<name>" created`.

**Two selections are refused, and neither changes your page:**

| You selected | You get |
|---|---|
| sections that are not next to each other | *Select adjacent sections to create a Shared Component* |
| a selection that already contains a Shared Component | *Select only independent sections to create a Shared Component* |

### Put it on another page

**Add block** → the **SHARED BLOCKS LIBRARY** group at the top of the panel (your ordinary blocks are
still below it). Pick your component, then choose:

| Choice | What you get |
|---|---|
| **Insert shared instance** | stays linked — later edits to the original reach this page too |
| **Create independent copy** | a standalone copy with its own ids; it never changes again when the original does |

The usage count only moves **when you save the page**.

### Edit the original, and know what you are about to affect

Select a Shared row. The panel names the component, shows a **Shared** badge with its usage count, a
**Where used** list of the pages that reference it, and this warning before you commit:

> Editing will update all 3 pages using it.

**Edit original** opens the component's own section tree. Save, and every linked placement follows.

### Detach one page from the original

**Detach** turns that one placement back into ordinary sections with fresh ids. They become editable
immediately, and later edits to the original no longer reach them. **There is no re-attach** — if you
want the link back, insert the component again.

### Delete a component

Deletion is refused while the component is still used anywhere, and the message names the pages holding
it. Remove or detach every placement, **save those pages**, and deletion then succeeds.

### Two things that will otherwise surprise you

- **The usage count includes the page the component was created from**, and it counts a page whose
  *draft* still holds the reference. So after detaching on a published page, the count drops only once
  you **re-publish** that page.
- **Open the workspace from inside the product**, not by typing its URL. Reached directly it reports
  *Store context is missing* and offers no way forward.

---

## For developers

**Route:** `/api/page-builder-shared-components` (`SharedComponent` / `SharedComponents` in code).
Note the ticket's Q&A thread and the delivery comment both use the older name `LinkedComponent` — the
deployed route and the persistence model are `SharedComponent`, and that is the one to build against.

### The placement marker

A linked placement is a **top-level page-content item with exactly three keys**:

```json
{ "id": "agsc-pb-sc-consumer-a-ref01", "type": "componentRef", "componentRef": "f409bb4f7d5847c0b26eea623c628f50" }
```

It is matched on `type == "componentRef"` **and** a key count of exactly 3. A `type: "section"` item
that merely carries a `componentRef` *property* is an ordinary section — the server ignores the
property, creates no reference and indexes nothing. Build negatives with the wrong shape and every one
of them returns `204`, which looks like a missing validation layer rather than your own bad payload.

### What the storefront receives

Authoring keeps the compact marker. **Page Builder expands it before Pages indexing**, so the delivered
document contains **zero `componentRef`** and the storefront never calls the Shared Components API.
Expanded ids are namespaced per placement as `lc<hex(placementId)>sectionN`, so two placements of the
same component on one page cannot collide.

```
POST {{FRONT_URL}}/graphql
{"query":"query($p:String!,$s:String!,$c:String!){slugInfo(permalink:$p,storeId:$s,cultureName:$c){entityInfo{id}}}",
 "variables":{"p":"/agent-test-sc-consumer-a","s":"B2B-store","c":"en-US"}}

POST {{FRONT_URL}}/graphql
{"query":"query($id:String!){pageDocument(id:$id){content}}","variables":{"id":"<entityInfo.id>"}}
```

`pageDocument` takes **`id` only** — passing `storeId` or `cultureName` is a schema error.
The authoring form is at `GET {{BACK_URL}}/api/page-builder-pages/grouped/{groupId}/content?draft=true`.

### Validation you can rely on

Every one of these is a deterministic `400` with nothing persisted: a marker with an extra or missing
field, a wrong `type`, a dangling component id, a duplicate placement id, a placement id colliding with
a sibling, a nested marker, a component whose own content contains a marker, a self-reference, a
cross-store reference, and `PUT /{id}` attempting to change `storeId`. Name validation rejects empty,
whitespace-only and over-128-character names.

### Permissions

`builder:shared-components:{read,create,update,delete}`, each gating exactly its own verb. The
undocumented `/{id}/content` sub-resource is gated identically — `read` on `GET`, `update` on
`PUT`/`POST`. Saving page content that contains a `componentRef` additionally requires
`shared-components:read`, even though the route itself declares only `builder:update`.

**Store scoping precedes all of it:** a non-Administrator gets `403` on every store-scoped Page Builder
route unless `user.StoreId` matches. Before concluding that permission gating is broken, call an
unrelated route the token demonstrably has rights for — if that `403`s too, you are looking at store
scoping, not a gating defect.

### Two contract notes for test authors

- `usageCount` counts **distinct pages, not placements**, includes the originating page, and counts a
  reference held in either the published **or** the draft version.
- A Designer save rewrites a text block's `text` from a plain string to `{markdown, html}`. Seeded
  content uses the string form, so any assertion comparing that field by shape depends on which path
  last wrote it.

---

*Known limitations at the time of writing: the Designer actions menu requires browser `clipboard-read`
permission to render at all, and is therefore unavailable in Firefox (VCST-6011); concurrent saves of
one page are last-writer-wins with no conflict signal (VCST-6009); the Designer section tree is not
keyboard-reachable (VCST-6012).*
