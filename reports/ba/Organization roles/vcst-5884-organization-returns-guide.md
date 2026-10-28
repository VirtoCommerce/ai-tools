# Organization returns — guide (VCST-5884)

A colleague who may view your organization's returns can now see them on the storefront, read-only, in one place. Administrators control who that is with one permission. Integrators read the same list through one xAPI query and one REST criterion.

Sections: [Customer](#for-shoppers) · [Admin](#for-administrators) · [Developer](#for-developers) · [Not documented](#not-documented). Run verdict: **PASS WITH NOTES**. Every step below maps to a `PASS` row of `reports/tickets/Sprint26-20/VCST-5884/testing-checklist.md` (round 3).

---

## For shoppers

### See your organization's returns

![Organization tab on the Returns page, listing colleagues' returns](../tickets/Sprint26-20/VCST-5884/screenshots/r3-4a-A-A1-org-tab-b-listed-a-absent.png)
*The Returns page for a contact who may view the organization's returns: the second tab carries the organization's name.*

#### Prerequisites
- You are signed in to a company account.
- Your administrator has given your role the permission to view organization returns. Without it you see **My returns** only, and nothing else changes for you.

#### Steps
1. Click **Returns** under **Purchasing** in your account menu.
2. Click the tab named after your organization, next to **My returns**.
3. Read the list. Each row shows **RMA**, **Date**, **Buyer name**, **Status** and **Qty**. The list covers the returns your colleagues have submitted, and your own.
4. To find one return, type its RMA number in the search box and press the search button.
5. To narrow the list, click **Filters** and tick a status, then click **Apply**.

![Filters panel on the organization tab: Created date, Status, Reset and Apply](../tickets/Sprint26-20/VCST-5884/screenshots/r3-3x-04-org-filter-status-options.png)
*The status list is the one your store defines. It never offers Draft.*

6. Click a row to open the return.

#### Open a colleague's return

![A colleague's return: Summary with Requested by, and the Items table, with no Cancel button](../tickets/Sprint26-20/VCST-5884/screenshots/r3-4a-A-A5-colleague-return-readonly.png)
*A colleague's return opens for reading only. **Requested by** names the colleague.*

A colleague's return shows its status, date, order number, **Requested by**, and the requested and approved quantities of each item. It has no **Cancel** or **Edit** action. A return you raised yourself keeps **Cancel**, also when you open it from the organization tab.

!!! note "Why can't I see a colleague's draft?"
    A return appears only after the colleague submits it. A draft that was cancelled before it was ever submitted stays private, and a direct link to it shows **"This return was not found"**. A return that was submitted and then cancelled is listed with the status **Cancelled**.

!!! note "Why is there no organization tab for me?"
    The tab appears only for a contact whose role holds the view permission in the organization you are working in. If you belong to several organizations, the tab follows the organization you have selected, and shows only that organization's returns.

!!! note "A page number in the link does not work"
    A page number below 1, or one that is not a number, opens the first page. The list never shows the empty message for it.

#### On a phone or a narrow window
Below 1024 px the table becomes cards, one card per return, with the same five details.

![Organization tab as cards at 375 px width](../tickets/Sprint26-20/VCST-5884/screenshots/r3-4v-coffee-org-tab-375.png)
*The organization tab on a small screen.*

#### Your own returns
**My returns** works as before. A return you submit there appears on the organization tab without reloading the page, and cancelling one from its details shows **Cancelled** in both lists after you go back.

### Troubleshooting
- **The tab is missing.** Ask your administrator whether your role holds the permission to view organization returns.
- **A colleague's return is not in the list.** It is still a draft, or it was cancelled before it was submitted.

---

## For administrators

Returns raised by buyers of an organization are listed for the contacts you choose. You choose them by role.

### Let a role view the organization's returns
1. Click **Security** in the main menu, then **Roles**.
2. Search the list and open the role.
3. Open the **Permissions** widget and expand the group **XAPI**.
4. Tick **View organization returns** (`xapi:my_organization:return:view`) and save the role.

| Permission | What it does | Example |
|---|---|---|
| `xapi:my_organization:return:view` ("View organization returns") | Lets a contact list and open the submitted returns of an organization they belong to. Read-only. | The purchasing lead in the **Organization maintainer** role |
| `xapi:my_organization:return:submit` ("Submit organization returns") | Registered, but nothing checks it. Granting it changes nothing. | — |

!!! note "No stock role holds the view permission"
    The **Organization maintainer** role of the sample data does not hold it. Add it to that role, or create a role for it.

The permission counts in an organization when the role is assigned to the contact globally, on the organization, or on the contact's membership in it. A contact whose membership is locked, invited, rejected or removed is refused, whatever the role. Revoking it refuses the contact on their next request, and granting it again restores access.

!!! warning "Refusal is not an empty list"
    A contact without the permission, and a request for an organization the contact does not belong to, are refused. They never receive an empty list.

### Find the organization on a return
1. Click **Returns** in the main menu (under **More** if it is not pinned).
2. In the **Return list** blade, read the **Organization** column. It is one of the seven default columns: **Return number**, **Order number**, **Customer**, **Organization**, **Return status**, **Create date**, **Item count**.
3. Click the grid menu button at the right of the header and tick **Modify date** or **Created by** to add them.

Headers show whole and the sort arrows stay visible at 1920 px.

### Store setting
| Setting | What it does | Default |
|---|---|---|
| `Return.NotifyOrganizationEmail` | Store setting that controls organization copies of return e-mails. | Off |

A return an administrator creates in the Admin sends no e-mail to the buyer and none to the organization, and the notification journal stays empty for it.

!!! note
    How the copy behaves when the setting is on is not described here. See *Not documented*.

---

## For developers

An organization's submitted returns are available to a permitted contact through one xAPI query, and to back-office integrations through one REST criterion. Hosts are `{{BACK_URL}}`.

### Prerequisites
- A contact token holding `xapi:my_organization:return:view` for the organization (storefront query), or an administrator token (REST).
- The `storeId` and the `organizationId` of the organization.

### Step 1: get a token
```bash
curl -X POST "{{BACK_URL}}/connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&scope=offline_access&username={{USERNAME}}&password={{PASSWORD}}&storeId={{STORE_ID}}"
```
Use `access_token` as `Authorization: Bearer {{ACCESS_TOKEN}}`.

### Step 2: list the organization's returns (xAPI)
`Query.organizationReturns(storeId: String!, organizationId: String!, first, after, keyword, sort, statuses, startDate, endDate)`.

```bash
curl -X POST "{{BACK_URL}}/graphql" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{ACCESS_TOKEN}}" \
  -d '{"query":"query($o:String!,$s:String!,$k:String){ organizationReturns(storeId:$s, organizationId:$o, first:10, keyword:$k){ totalCount items{ id number status customerName organizationId organizationName } } }","variables":{"o":"{{ORGANIZATION_ID}}","s":"{{STORE_ID}}","k":"RET261012-00044"}}'
```
Response (abridged; ids and names replaced):
```json
{
  "data": { "organizationReturns": {
    "totalCount": 1,
    "items": [ {
      "id": "{{RETURN_ID}}",
      "number": "RET261012-00044",
      "status": "Cancelled",
      "customerName": "{{BUYER_NAME}}",
      "organizationId": "{{ORGANIZATION_ID}}",
      "organizationName": "{{ORGANIZATION_NAME}}"
    } ]
  } },
}
```
This return was submitted and then cancelled, so it is listed. A draft, and a draft cancelled before submit, are never listed: the same keyword returns `"totalCount": 0`, and `return(id: …)` for it returns `null`. The query is read-only for colleagues' returns: `createReturn`, `updateReturn`, `submitReturn` and `cancelReturn` on a colleague's return or order answer `RETURN_NOT_FOUND` / `ORDER_NOT_FOUND` and persist nothing.

### Step 3: handle the refusal
A contact without the permission gets the same answer whether they ask for their own organization, an empty id or an unknown one, and never an empty list. A locked, invited, rejected or removed membership is refused too. HTTP status is 200, so read `errors[]`:
```json
{
  "data": { "organizationReturns": null },
  "errors": [ {
    "message": "The organization's returns are not available to this contact.",
    "path": [ "organizationReturns" ],
    "extensions": { "code": "Forbidden", "codes": [ "Forbidden" ] }
  } ]
}
```

### Step 4: search by organization (REST)
`POST /api/return/search` takes `organizationId` and `submittedOnly`.
```bash
curl -X POST "{{BACK_URL}}/api/return/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{ACCESS_TOKEN}}" \
  -d '{"organizationId":"{{ORGANIZATION_ID}}","storeId":"{{STORE_ID}}","submittedOnly":true,"sort":"createdDate:desc","skip":0,"take":1}'
```
Response (abridged to one row and its key fields):
```json
{
  "totalCount": 47,
  "results": [ {
    "number": "RET261012-00065",
    "status": "Cancelled",
    "organizationId": "{{ORGANIZATION_ID}}",
    "organizationName": "{{ORGANIZATION_NAME}}",
    "submittedDate": "2026-10-12T09:34:10.2032228Z",
    "createdDate": "2026-10-12T09:33:54.0313034Z",
    "id": "{{RETURN_ID}}"
  } ]
}
```

| Option | Description | Default |
|---|---|---|
| `organizationId` | Keeps the returns raised for one organization. | none |
| `submittedOnly` | `true` keeps only returns that have a `submittedDate`, drafts and never-submitted cancelled drafts excluded. The id set equals the xAPI list of a permitted contact. | `false` |
| `excludeDrafts` | No longer a criterion. Sending it has no effect: the result equals sending nothing. | — |

### `submittedDate`
| Case | `submittedDate` |
|---|---|
| Draft cancelled before submit | `null` |
| Submitted, then cancelled | kept after the cancel |
| Submitted | set at submit, not at create |
| `PUT /api/return` creating a `New` return | set; the return is visible to holders |
| `PUT /api/return` with an old `submittedDate` in the body | ignored |
| `PUT /api/return` comment-only edit omitting the field | kept |

`PUT /api/return` refuses (HTTP 400) an edit that sets the status to `Draft` or `Requested`, or moves `Cancelled` back to `New`. Send the cancelled spelling your `Return.Status` dictionary offers.

!!! note "Why does `excludeDrafts` do nothing?"
    It was renamed to `submittedOnly` inside the same unreleased change, so no released contract moved.

Sources: `docs/return-module-guide.md` @ VirtoCommerce/vc-module-return `fb4fc43` (Permissions, Search); `.claude/knowledge/api/graphql-schema.md` (`organizationReturns`); runner evidence `RET-ORG-001`, `-042` and a read-only `POST /api/return/search` of this round.

---

## Not documented

| What | Reason |
|---|---|
| Organization e-mail copy (`Return.NotifyOrganizationEmail` on: recipients, CC/BCC, retries), AC-4 | Unratified, product-owner question; not re-run this round (the leg needs a shared-setting write) |
| `xapi:my_organization:return:submit` | Registered, checked by nothing |
| Where the organization view sits (a tab, AC-2) | Product-owner question |
| Returns cancelled before this module version was installed | Hidden from organizations (the submitted state was not recorded then). Whether that is intended is a product-owner question |
| Ordering by created date | The list, its **Date** column and its sort use the created date; a `submittedDate` sort is silently ignored. Product-owner question |
| Administrator who is not a member of the organization | Refused by `organizationReturns` (recorded; whether that "no bypass" is intended is a product-owner question) |
| Store on a return link | `return(id)` does not compare the store. Product-owner question |
| Draft in the **My returns** status filter | `FAIL` on this environment: the status list has no Draft (KB-16A03137), and a lower-case `status=draft` link is VCST-6262 |
| Sorting, buyer-name search and date filter on the organization tab | Not exercised by this round's checklist |
| Line-item attachments | UNCOVERED: no `return-attachments` upload scope on this environment |
| Returns of a legacy store-less holder | UNCOVERED: fixture gap |

No screenshot of the Admin Return list is embedded: its rows carry real customer names.

---
*VCST-5884 · verified on vcst · verdict PASS WITH NOTES · Evidence: `reports/tickets/Sprint26-20/VCST-5884/` · Audiences derived from layer `cross-layer` (customer, developer; admin added for a permission and a store setting)*
