# Runbook: Restore vcst-qa Product Table via Azure SQL Point-In-Time Restore

## Status: READY_FOR_OPS

**Severity:** P0 (production-like QA env is non-functional)
**Date:** 2026-05-16
**Author:** QA Agent (drafted from forensic findings)
**Executor:** Azure subscription owner / DBA / DevOps with SQL admin rights on the hidden hosting subscription
**Estimated time:** 30–60 minutes

## Context

On **2026-05-15T22:48:15Z UTC**, an 83-second SQL DELETE storm wiped all products from the vcst-qa platform's `CatalogItem` / `Item` table. Forensic evidence:
- App Insights `operation_Id=16342aad2cd5a87d12cf72b48c4de8d8` — 81 batches of `DELETE … FROM Item WHERE I.Id IN (@p0..@p19) OR I.ParentId IN (@p0..@p19)`
- Pattern matches `/qa-seed-data teardown` script preamble (DeleteRoles → DeleteMembers → DeletePricelists → mass product DELETE), suggesting a teardown invoked with too-broad selector
- Bulk EF-Core path bypassed module cascade — inventory rows survived as orphans (e.g., 2 rows still exist for product GUID `b3f5bd0c-45e4-46dc-8f2d-ad089718fc32`)
- Caller: `user_AuthenticatedId=admin`, `client_IP=0.0.0.0` (cluster-internal — call originated from inside Azure VNET)

Current state (verified 2026-05-16T~01:30Z):
- ✅ 29 catalogs intact (`POST /api/catalog/catalogs/search` → totalCount=29)
- ✅ 3,690 categories intact (`POST /api/catalog/listentries` `objectTypes:['Category']`)
- ✅ 7 stores intact, store→catalog bindings unchanged
- ✅ Inventory rows still exist (orphaned, awaiting cleanup post-restore)
- ❌ **0 products globally** (`POST /api/catalog/listentries` `objectTypes:['CatalogProduct']` → totalCount=0)
- ❌ All known product GUIDs return 404 on singular `GET /api/catalog/products/{id}`
- ❌ Storefront, xAPI, admin product blades all show empty catalog

## Prerequisites for the executor

| Item | Where to find |
|---|---|
| Azure subscription that hosts vcst-qa's SQL Server | Owned by ops/DevOps (NOT visible in subscription `973d0b8c-44bf-438d-a4b7-1c4162d3ccba` / `VirtoCommerce Development`). Likely separate VirtoCommerce Infrastructure / Production sub. |
| Azure SQL Server name (FQDN) | The Platform connection string in vcst-qa's app settings, KeyVault `vcst` (secret name likely `ConnectionStrings--VirtoCommerce` or similar), or the deploy repo `vc-deploy-dev` config |
| Source database name | Same source; typical name: `vcst-qa-platform`, `vcst-qa-db`, `VirtoCommerceDatabase`, etc. |
| SQL admin or `dbmanager` role | DBA / subscription owner |
| Connectivity to SQL Server (firewall rule) | DBA can add temporary rule for executor's IP |
| `sqlcmd` / SSMS / Azure Data Studio | For the table-copy phase |
| Azure CLI logged in as a user with restore rights on the hosting subscription | `az login` then `az account set --subscription "<sub-id>"` |

## Restore strategy

**Azure SQL Database does NOT support partial-table restore directly.** Standard pattern:

1. **PITR the prod DB to a NEW sidecar DB** at a timestamp **before** `2026-05-15T22:48:15Z` (use `2026-05-15T22:47:00Z` to be safe)
2. **Extract** product rows + dependent rows (catalog SEO, images, properties, prices) from the sidecar
3. **Insert** them back into the production DB
4. **Verify** counts match the sidecar
5. **Cleanup** orphaned inventory rows (optional — if you don't want to re-link them, leave alone)
6. **Delete** the sidecar DB
7. **Trigger a reindex** via Admin SPA → Settings → Indexed search → Build (Product documentType) so storefront/xAPI sees the restored products

## Step-by-step

### Step 1 — Discover SQL server + DB names

```bash
# Replace with the actual hosting subscription ID
HOSTING_SUB="<hosting-sub-id>"
az account set --subscription "$HOSTING_SUB"

# List all SQL servers in the hosting subscription
az sql server list --query "[].{name:name, rg:resourceGroup, fqdn:fullyQualifiedDomainName, location:location}" -o table

# Identify the server hosting vcst-qa-platform (look for vcst- or vcst-qa- prefix)
# Set these variables for the rest of the runbook:
SQL_SERVER="<server-name>"           # e.g. vcst-sql-server
SQL_RG="<sql-resource-group>"        # e.g. vcst-data
SOURCE_DB="<prod-db-name>"           # e.g. vcst-qa-platform
SIDECAR_DB="vcst-qa-platform-restore-20260516"
RESTORE_TIME="2026-05-15T22:47:00Z"  # 1m 15s before the deletion at 22:48:15Z
```

### Step 2 — Confirm the restore point is within retention

```bash
# Azure SQL retains automatic backups for 7-35 days (default 7)
# Confirm our target time is restorable:
az sql db show \
  --resource-group "$SQL_RG" \
  --server "$SQL_SERVER" \
  --name "$SOURCE_DB" \
  --query "{earliestRestorePoint:earliestRestorePoint, currentSku:currentSku.name, sizeGB:maxSizeBytes}" \
  -o json

# earliestRestorePoint MUST be <= 2026-05-15T22:47:00Z
# If earliestRestorePoint is after that timestamp, PITR is no longer available — escalate to backup team
```

### Step 3 — Perform the point-in-time restore to a sidecar DB

```bash
az sql db restore \
  --resource-group "$SQL_RG" \
  --server "$SQL_SERVER" \
  --name "$SOURCE_DB" \
  --dest-name "$SIDECAR_DB" \
  --time "$RESTORE_TIME"

# This is async — wait for completion (~5–20 min depending on DB size):
az sql db show \
  --resource-group "$SQL_RG" \
  --server "$SQL_SERVER" \
  --name "$SIDECAR_DB" \
  --query "status" -o tsv
# Wait until status == "Online"
```

### Step 4 — Open SQL connectivity from executor's machine

```bash
# Add temporary firewall rule for executor's public IP (omit if already on VNET):
MY_IP=$(curl -s ifconfig.me)
az sql server firewall-rule create \
  --resource-group "$SQL_RG" \
  --server "$SQL_SERVER" \
  --name "TempRestore-$(date +%s)" \
  --start-ip-address "$MY_IP" \
  --end-ip-address "$MY_IP"

# Note: ALSO check the SIDECAR_DB inherits the same firewall (it does by default — sidecar shares server)
```

### Step 5 — Validate the sidecar has the products

Connect to the sidecar DB via `sqlcmd`, SSMS, or Azure Data Studio:

```
Server:   <SQL_SERVER>.database.windows.net
Database: vcst-qa-platform-restore-20260516
Auth:     SQL admin login OR Microsoft Entra
```

Run validation queries:

```sql
-- Confirm sidecar HAS products
SELECT COUNT(*) AS ProductCount
FROM [Item]
WHERE [ParentId] IS NULL;  -- main products (variations have ParentId)

-- Sanity check by catalog
SELECT TOP 10 CatalogId, COUNT(*) AS ProductCount
FROM [Item]
WHERE [ParentId] IS NULL
GROUP BY CatalogId
ORDER BY ProductCount DESC;

-- Verify specific known GUIDs that were probed earlier:
SELECT Id, Name, Code, CatalogId, ParentId
FROM [Item]
WHERE Id IN (
  'b3f5bd0c-45e4-46dc-8f2d-ad089718fc32',  -- Canvas Pencil Case (STD-001)
  'f1b26974-1170-4f8a-b94c-23a8c97aa14b',  -- LG TV
  '217be9f3-1170-4f8a-b94c-23a8c97aa14b'   -- VIZIO TV (if exists)
);
```

Expected: thousands of products returned. If sidecar is also empty → PITR window was wrong, repeat Step 3 with an earlier timestamp.

### Step 6 — Validate the prod DB is missing products (sanity check before copy)

Connect to `$SOURCE_DB` and run:
```sql
SELECT COUNT(*) AS ProductCount FROM [Item] WHERE [ParentId] IS NULL;
-- Expected: 0
```

If prod has products, **STOP** — the situation has changed since this runbook was drafted (maybe someone already restored).

### Step 7 — Copy products + dependent rows from sidecar to prod

**⚠️ Run inside a transaction. Take a snapshot of the prod DB first if your tier supports it.**

The SQL DELETE that wiped products targeted these tables based on the forensic evidence:
- `[Item]` — main products + variations (via `OR I.ParentId IN (...)`)
- `[CatalogSeoInfo]` — SEO records joined via `INNER JOIN Item I ON I.Id = SEO.ItemId`
- Likely also: `[CatalogImage]`, `[PropertyValue]`, `[CategoryItemRelation]` (or whatever join table is used), `[EditorialReview]`, `[ItemLocalizedName]`, `[Price]` (if VC's Pricing module shares the DB)

**Run these in order.** Adjust table names if the actual schema differs — use `sp_help <table>` to confirm structure.

```sql
USE [<SOURCE_DB>];  -- start in prod
GO

-- Set up linked-server or cross-DB reference to the sidecar
-- Easiest: use 3-part naming if both DBs are on the same server (they are, since PITR creates on same server):
-- [<SIDECAR_DB>].[dbo].[TableName]

BEGIN TRANSACTION RestoreProducts;

-- 7a. Insert products (parents first, then variations)
SET IDENTITY_INSERT [dbo].[Item] ON;  -- only if Id is identity; skip if Id is uniqueidentifier
INSERT INTO [dbo].[Item] (Id, Name, Code, CatalogId, ParentId, /* ... all columns ... */)
SELECT Id, Name, Code, CatalogId, ParentId, /* ... */
FROM [<SIDECAR_DB>].[dbo].[Item] src
WHERE src.ParentId IS NULL  -- parents first
  AND NOT EXISTS (SELECT 1 FROM [dbo].[Item] dst WHERE dst.Id = src.Id);
SET IDENTITY_INSERT [dbo].[Item] OFF;

-- Then variations:
SET IDENTITY_INSERT [dbo].[Item] ON;
INSERT INTO [dbo].[Item] (Id, Name, Code, CatalogId, ParentId, /* ... */)
SELECT Id, Name, Code, CatalogId, ParentId, /* ... */
FROM [<SIDECAR_DB>].[dbo].[Item] src
WHERE src.ParentId IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM [dbo].[Item] dst WHERE dst.Id = src.Id);
SET IDENTITY_INSERT [dbo].[Item] OFF;

-- 7b. SEO records (only for items we just restored)
INSERT INTO [dbo].[CatalogSeoInfo] (Id, ItemId, SemanticUrl, /* ... */)
SELECT src.Id, src.ItemId, src.SemanticUrl, /* ... */
FROM [<SIDECAR_DB>].[dbo].[CatalogSeoInfo] src
INNER JOIN [dbo].[Item] dst ON dst.Id = src.ItemId
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[CatalogSeoInfo] s WHERE s.Id = src.Id);

-- 7c. Images
INSERT INTO [dbo].[CatalogImage] (Id, ItemId, Url, /* ... */)
SELECT src.Id, src.ItemId, src.Url, /* ... */
FROM [<SIDECAR_DB>].[dbo].[CatalogImage] src
INNER JOIN [dbo].[Item] dst ON dst.Id = src.ItemId
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[CatalogImage] i WHERE i.Id = src.Id);

-- 7d. Property values
INSERT INTO [dbo].[PropertyValue] (Id, ItemId, PropertyId, /* ... */)
SELECT src.Id, src.ItemId, src.PropertyId, /* ... */
FROM [<SIDECAR_DB>].[dbo].[PropertyValue] src
INNER JOIN [dbo].[Item] dst ON dst.Id = src.ItemId
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[PropertyValue] pv WHERE pv.Id = src.Id);

-- 7e. Category-Item relations (if separate table)
-- Look up exact table name via sys.tables LIKE '%Category%Item%' or '%Item%Categor%'
-- Skip if categories store ItemIds inline

-- 7f. Editorial reviews / descriptions
INSERT INTO [dbo].[EditorialReview] (Id, ItemId, Content, /* ... */)
SELECT src.Id, src.ItemId, src.Content, /* ... */
FROM [<SIDECAR_DB>].[dbo].[EditorialReview] src
INNER JOIN [dbo].[Item] dst ON dst.Id = src.ItemId
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[EditorialReview] er WHERE er.Id = src.Id);

-- 7g. Localized names
INSERT INTO [dbo].[ItemLocalizedName] (Id, ItemId, LanguageCode, Name)
SELECT src.Id, src.ItemId, src.LanguageCode, src.Name
FROM [<SIDECAR_DB>].[dbo].[ItemLocalizedName] src
INNER JOIN [dbo].[Item] dst ON dst.Id = src.ItemId
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[ItemLocalizedName] iln WHERE iln.Id = src.Id);

-- 7h. Prices (if VC.Pricing module shares this DB)
INSERT INTO [dbo].[Price] (Id, ProductId, PricelistId, List, Sale, /* ... */)
SELECT src.Id, src.ProductId, src.PricelistId, src.List, src.Sale, /* ... */
FROM [<SIDECAR_DB>].[dbo].[Price] src
INNER JOIN [dbo].[Item] dst ON dst.Id = src.ProductId
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[Price] p WHERE p.Id = src.Id);

-- VERIFY counts before commit
SELECT 'Item' AS TableName, COUNT(*) AS RestoredCount FROM [dbo].[Item]
UNION ALL SELECT 'CatalogSeoInfo', COUNT(*) FROM [dbo].[CatalogSeoInfo]
UNION ALL SELECT 'CatalogImage', COUNT(*) FROM [dbo].[CatalogImage]
UNION ALL SELECT 'PropertyValue', COUNT(*) FROM [dbo].[PropertyValue]
UNION ALL SELECT 'EditorialReview', COUNT(*) FROM [dbo].[EditorialReview];

-- COMPARE to sidecar:
SELECT 'Item' AS TableName, COUNT(*) AS SidecarCount FROM [<SIDECAR_DB>].[dbo].[Item]
UNION ALL SELECT 'CatalogSeoInfo', COUNT(*) FROM [<SIDECAR_DB>].[dbo].[CatalogSeoInfo]
-- etc.

-- If counts match (or are intentionally different — e.g., new categories created since), COMMIT.
-- If counts wrong, ROLLBACK and investigate.

COMMIT TRANSACTION RestoreProducts;
-- or:
-- ROLLBACK TRANSACTION RestoreProducts;
```

### Step 8 — Cleanup orphaned inventory (optional but recommended)

After product restore, the orphaned `InventoryEntity` rows now have matching products again — they "rejoin" the parent record naturally. No action needed unless inventory data has drifted in the meantime.

If you want to verify:
```sql
-- Should now return inventory rows AND matching product rows
SELECT i.Id AS InventoryId, p.Id AS ProductId, p.Name
FROM [dbo].[InventoryEntity] i
LEFT JOIN [dbo].[Item] p ON p.Id = i.Sku  -- adjust join key per schema
WHERE i.Sku IN ('b3f5bd0c-45e4-46dc-8f2d-ad089718fc32');
```

### Step 9 — Trigger Elasticsearch reindex

After SQL restore, the Elasticsearch Product index is still empty. Two paths:

**Path A — Via Admin SPA UI (recommended for visual confirmation):**
1. Log into `https://vcst-qa.govirto.com` as admin
2. Navigate to **Settings → Indexed search**
3. Find `Product` documentType row
4. Click **Build** (or "Rebuild index")
5. Wait for completion (status changes to "Idle", `indexedDocumentsCount` matches restored product count)

**Path B — Via REST:**
```bash
TOKEN="<admin-bearer-token>"  # OAuth2 grant per .claude/agents/knowledge/api-auth.md

curl -X POST "https://vcst-qa.govirto.com/api/search/indexing/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"documentType":"Product","rebuild":true,"deleteExistingIndex":false}'

# Poll:
curl "https://vcst-qa.govirto.com/api/search/indexes/Product" -H "Authorization: Bearer $TOKEN"
```

⚠️ **Caveat** — per prior investigation, the VCST-4456 alias-write-index fix was rolled back in commit `e37de57e` on 2026-05-15T09:48Z (`vc-deploy-dev` branch `vcst-qa`). If that rollback affects the Product index alias binding, the reindex may write to an empty alias. Consider either:
- Re-applying VCST-4456 (revert `e37de57e`) **before** triggering reindex
- Or: verifying via `/api/search/indexes` after rebuild that `indexedDocumentsCount > 0` for Product

### Step 10 — Verify end-to-end via QA env

```bash
# 1. SQL count matches expectation
# 2. Search alias has documents:
curl https://vcst-qa.govirto.com/api/search/indexes -H "Authorization: Bearer $TOKEN" | jq '.[] | select(.documentType=="Product")'
# Expected: indexedDocumentsCount > 0, lastIndexationDate recent

# 3. xAPI returns products:
curl https://vcst-qa.govirto.com/graphql -H "Content-Type: application/json" -d '{
  "query": "query { products(storeId: \"B2B-store\" currencyCode: \"USD\" first: 1) { totalCount items { id name } } }"
}' | jq

# 4. Storefront loads:
curl -I https://vcst-qa.govirto.com/catalog
```

### Step 11 — Cleanup sidecar DB

```bash
az sql db delete \
  --resource-group "$SQL_RG" \
  --server "$SQL_SERVER" \
  --name "$SIDECAR_DB" \
  --yes
```

### Step 12 — Remove temporary firewall rule

```bash
az sql server firewall-rule delete \
  --resource-group "$SQL_RG" \
  --server "$SQL_SERVER" \
  --name "TempRestore-<timestamp>"
```

## Rollback / abort plan

- If Step 7 (INSERT INTO prod) fails or counts don't match → `ROLLBACK TRANSACTION RestoreProducts;`
- The sidecar DB (Step 3) is untouched throughout — it remains available for re-attempt
- If you need to abort the entire operation, only Step 11 (sidecar delete) is destructive on Azure — everything else is reversible

## Post-restore safety actions (separate workstream)

1. **Identify the triggering call** for `operation_Id=16342aad2cd5a87d12cf72b48c4de8d8` — App Insights `requests` table didn't capture the parent. Investigate Hangfire dashboard for jobs that ran in the window, scheduled tasks, or external automation.
2. **Audit `/qa-seed-data teardown` script** (`.claude/skills/testing/qa-seed-data/SKILL.md`) and the underlying Postman collection to ensure its selector cannot match non-`AGENT-TEST-` prefixed products. The forensic preamble (DeleteRoles + DeleteMembers + DeletePricelists) matches the skill's teardown sequence — confirm scope was correct.
3. **Add a guardrail** at the Catalog module level: bulk product DELETE that doesn't go through `IProductService.DeleteAsync` (i.e., direct EF batch delete) should be either forbidden or trigger a `CatalogProductBulkDeleted` event that also cleans `InventoryEntity` (per business-logic.md cart/inventory invariants).
4. **Document the incident** as a separate bug ticket — file in VCST project as a P0 retrospective.

## What was NOT done in drafting this runbook

I did NOT:
- Execute any SQL operation
- Execute any Azure CLI command against any subscription
- Modify any test data, alias, CSV, or deploy config
- File any JIRA ticket
- Trigger any reindex
- Touch the prod DB or sidecar

This runbook is **drafts and queries only**. The executor with subscription access must adapt placeholder names, confirm schema column lists via `sp_help`, and run interactively with rollback ready.

## Open question for the executor

If you cannot identify the hosting subscription / SQL server quickly, the fastest alternative path is:

**Restore from a manual backup** — many VC installations keep weekly/daily `.bacpac` exports in a storage account. Check:
- `vcstprivate` storage account (resource group `vcst`)
- `vcstblob` storage account (resource group `vcst`)
- Any `*-backup` container

If a recent .bacpac exists from before the deletion, importing it to a sidecar DB is faster than discovering the source server.
