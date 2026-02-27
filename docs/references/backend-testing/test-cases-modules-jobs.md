# Module Testing & Background Jobs Test Cases

> Reference file for qa-backend-expert agent. Read when testing module settings, RBAC permissions, or Hangfire background jobs.

## 1. MODULE TESTING (Suite 17 - Platform Core)

**QA Environment runs Edge/Alpha versions of modules, not Stable releases.**
Always check `${BACK_URL}/#!/workspace/systeminfo` for the actual deployed versions before testing.

### Module Installation & System Info

```markdown
Steps:
1. Login to Admin: ${BACK_URL} (from .env)
2. Navigate to ${BACK_URL}/#!/workspace/systeminfo → verify platform version
3. Navigate to ${BACK_URL}/#!/workspace/modules → check installed modules
4. Navigate to ${BACK_URL}/#!/workspace/developer-tools → check Hangfire/diagnostics

Key Checks:
✅ All expected modules listed — note Edge/Alpha version numbers
✅ Module status: "Active" for each (watch for "Error" or "Disabled" on Edge builds)
✅ No errors in application logs after module install
✅ Module dependencies resolved (Edge modules may have newer dependency requirements)
✅ Module APIs accessible via Swagger at ${BACK_URL}/docs/index.html
✅ GraphQL schema includes new types/mutations from Edge modules

Edge/Alpha-Specific Validation:
□ Compare module version against previous QA deployment — note what changed
□ Check for breaking API changes (new required fields, renamed endpoints)
□ Verify backward compatibility with existing test data
□ Watch for deprecation warnings in logs
□ Test new features introduced in Edge version
```

### Module Settings Testing Pattern

```markdown
Pattern observed across all modules (Pricing, Inventory, Orders, etc.):

Common Setting Tests:
□ Enable/disable feature toggle → verify behavior changes
□ Tooltip show/hide behavior → one tooltip unfolded at a time, folds on switch
□ Export/Import page size → change value, verify progress bar uses it
□ Event-based indexation enable/disable → verify reindex triggers (or not)
□ Log changes enable/disable → verify PlatformOperationLog rows added (or not)
□ Number template configuration → {0} datetime, {1} sequential, CO{1:D5} padded

Real Examples:
• PRICE-043/044: Enable/disable event-based indexation for pricing entities
• PRICE-045/046: Enable/disable log pricing changes → check PlatformOperationLog
• INV-042/043: Enable/disable event-based indexation for inventory entities
• INV-040/041: Enable/disable log inventory changes
• ORD-044/045/046: Order number template with datetime/sequential/padded/weekly reset
• ORD-061: Enable/disable notifications for orders
• ORD-062: Enable/disable adjust inventory for orders (stock on cancel)
```

### Module Permission Testing Pattern (RBAC)

```markdown
Every module follows the same permission matrix test pattern:

| Permission | Effect |
|-----------|--------|
| module:access | Module visible in navigation, blade opens |
| module:read | Can open entities, view details (read-only) |
| module:create | Add button visible and clickable |
| module:update | Save button works on existing entities |
| module:delete | Delete button visible, deletion succeeds |
| module:export | Export button visible, file download works |

Real Examples:
• PRICE-053 to 058: Pricing permissions (access/read/export/create/update/delete)
• INV-031 to 037: Inventory permissions (access/read/create/update/delete/FFC edit/delete via Store)
• ORD-050 to 058: Order permissions (access/read/create/update/delete/read_prices/update_shipments)
• ORD-058: API delete with assigned/unassigned/non-existent order combinations
```

## 2. BACKGROUND JOBS TESTING

### Hangfire Dashboard

```markdown
Access: Configuration → Hangfire
URL: ${BACK_URL}/hangfire
DevTools: ${BACK_URL}/#!/workspace/developer-tools
```

### Search Indexing Jobs (SRCH-007, SRCH-019, PRICE-048)

```markdown
Job: "IndexingJobs.IndexChangesJob"
Access: Search > Index page > Build Index

Test:
□ Trigger manual build → status shows completed (SRCH-007)
□ Full indexation via Elastic Search module (SRCH-019)
□ Cancel indexation task in progress (SRCH-011, SRCH-017)
□ Blue-green: rebuild both indices, swap, verify (SRCH-008, SRCH-010)
□ Verify "Pricing indexation date and time" field updates (PRICE-048)
□ Event-based indexation: price change triggers reindex (PRICE-043)
□ Event-based indexation: inventory change triggers reindex (INV-042)
□ Schedule indexing jobs with cron expression (SRCH-038)
```

### Export Jobs (PRICE-008, PRICE-031, PRICE-042, INV-039)

```markdown
Job: Export to CSV/JSON

Test:
□ Export price lists → download file, verify content (PRICE-008)
□ Export price list assignments → download, verify (PRICE-031)
□ Export/Import page size setting → progress bar respects value (PRICE-042, INV-039)
□ Monitor job progress in Hangfire dashboard
□ Validate exported data accuracy
```

### Notification Jobs (ORD-047 to ORD-049)

```markdown
Job: Email/notification dispatch

Test:
□ Order paid/sent notification triggers (ORD-048)
□ Payment/shipment status change notification (ORD-049)
□ Resend notification from Notifications widget (ORD-047)
□ Disabled notification setting → no notification sent
```

### Inventory Adjustment Jobs (ORD-028, ORD-062)

```markdown
Job: Stock adjustment on order cancellation

Test:
□ Cancel order → stock increases (when 'Adjust inventory' enabled)
□ Cancel order → stock unchanged (when setting disabled)
□ Multiple FFCs stock adjusted correctly (ORD-029)
```
