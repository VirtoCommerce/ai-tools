# Notifications & Push Messages - Test Execution Report

**Date:** February 9, 2026
**Environment:** QA Storefront (`https://vcst-qa-storefront.govirto.com`)
**Admin:** QA Admin (`https://vcst-qa.govirto.com`)
**Browser:** Google Chrome (Playwright Chrome MCP)
**Store:** B2B-store
**Tester:** qa-frontend-expert (Claude Opus 4.6)
**Storefront Version:** 2.41.0-pr-2173-7738-7738784d
**User Account:** BMW-Group / Elena Mutykova (`mutykovaelena@gmail.com`)

---

## Executive Summary

Executed 27 notification and push message test cases (C410563-C410589) covering the bell icon popup and notifications archive/history functionality on the Virto Commerce B2B storefront.

**Overall Result: 22 PASSED / 2 SKIPPED / 2 N/A / 1 NOT TESTED**

- All critical notification flows work correctly
- Bell popup and archive page function as expected
- Mark read/unread, count tracking, filtering, pagination all working
- Clear all in popup correctly hides messages from popup only (archive retains them)
- WebSocket real-time delivery of push messages confirmed working
- No blocking issues found

---

## Test Data Setup

### Push Messages Created in Admin

8 push messages were created via Admin > Apps > Push Messages before test execution, plus 5 fresh messages were created during testing to trigger WebSocket delivery to the bell popup.

| # | Message Content | Recipient | Topic | Sent Time |
|---|----------------|-----------|-------|-----------|
| 1 | Welcome to the B2B store! Explore our full catalog... | BMW-Group | Welcome message | 2:01 PM |
| 2 | Special promotion: 20% off all electronics this week... | BMW-Group | Promo test | 1:59 PM |
| 3 | Your order #12345 has been shipped... | BMW-Group | Order update | 1:58 PM |
| 4 | New product available! Check out our latest arrivals... | BMW-Group | Product update | 1:57 PM |
| 5 | Important Update! Your account settings have been updated... | BMW-Group | Account update | 1:56 PM |
| 6 | Click here to view your order: Visit Storefront | BMW-Group | Link test | 1:55 PM |
| 7 | This is a simple text notification for testing | BMW-Group | Text test | 1:53 PM |
| 8 | Company-wide announcement: New B2B portal features... | BMW-Group (company-wide) | Company announcement | 2:03 PM |
| 9 | Fresh notification for bell badge test - C410565... | BMW-Group | Bell badge test C410565 | 2:27 PM |
| 10 | Second fresh notification - Mark read/unread test C410566... | BMW-Group | Mark read/unread test C410566 | 2:28 PM |
| 11 | Third notification with link - C410567. Visit our catalog: https://vcst-qa-storefront.govirto.com/printers | BMW-Group | Link test C410567 | 2:28 PM |
| 12 | Fourth notification - Count test. Your weekly summary is ready. | BMW-Group | Count test 4 | 2:29 PM |
| 13 | Fifth notification - Final count test. New products have been added... | BMW-Group | Count test 5 | 2:29 PM |

Total notifications in archive: 36 (including pre-existing messages from previous testing)

---

## Test Results Summary

| Test ID | Test Name | Priority | Status | Notes |
|---------|-----------|----------|--------|-------|
| **Bell and Pop-up Tests (C410563-C410577)** | | | | |
| C410563 | Anonymous user - Notifications hidden | Medium | PASSED | Bell icon not visible for anonymous users |
| C410564 | Empty pop-up | Medium | PASSED | Empty state message displayed correctly |
| C410565 | Mark read (single message) | Medium | PASSED | Blue dot removed, count decreased by 1 |
| C410566 | Mark unread (single message) | Medium | PASSED | Blue dot restored, count increased by 1 |
| C410567 | Click link in notification | Medium | PASSED | Link navigated to Printers page, auto-marked as read |
| C410568 | Mark all as read | Medium | PASSED | All messages marked read, count badge removed |
| C410569 | Mark all as unread | Medium | PASSED | All messages marked unread, count badge restored |
| C410570 | Count decrease one by one | Medium | PASSED | Count: 5 -> 4 -> 3 (verified step by step) |
| C410571 | Count increase one by one | Medium | PASSED | Count: 3 -> 4 -> 5 (verified step by step) |
| C410572 | Show unread only = ON | Medium | PASSED | Only unread messages shown in popup |
| C410573 | Show unread only = OFF | Medium | PASSED | All messages shown in popup (combined with C410572) |
| C410574 | Clear all | Medium | PASSED | Messages cleared from popup only, persist in archive |
| C410575 | Feature flag (push_messages_enabled) | Low | SKIPPED | Requires code-level change to settings_data.json |
| C410576 | Company-wide messages | Medium | PASSED | Company-wide message visible to organization member |
| C410577 | Login on behalf admin | Low | NOT TESTED | Test case has no steps/expected results defined |
| **Notifications Archive/History Tests (C410578-C410589)** | | | | |
| C410578 | Empty page | Medium | N/A | Cannot reproduce - user has pre-existing notifications |
| C410579 | View all notifications (from popup) | Medium | PASSED | "View all notifications" link navigates to /account/notifications |
| C410580 | Account navigation to Notifications | Medium | PASSED | Sidebar Dashboard -> Notifications link works |
| C410581 | Mark all as read (archive) | Medium | PASSED | Heading count removed, all buttons changed to "Mark as unread" |
| C410582 | Mark all as unread (archive) | Medium | PASSED | Heading count restored (36), all buttons changed to "Mark as read" |
| C410583 | Click link in archive notification | Medium | PASSED | Link in notification navigated to Printers page |
| C410584 | Count decrease one by one (archive) | Medium | PASSED | Count: 35 -> 34 -> 33 -> ... -> 26 (verified step by step) |
| C410585 | Count increase one by one (archive) | Medium | PASSED | Count: 26 -> 27 -> 28 -> 29 (verified step by step) |
| C410586 | Show unread only = ON (archive) | Medium | PASSED | Only unread messages shown, read messages hidden |
| C410587 | Show unread only = OFF (archive) | Medium | PASSED | All messages shown (read + unread mixed) |
| C410588 | Clear all in popup > Check archive | Medium | PASSED | Popup empty, archive retains all messages |
| C410589 | Pagination | Medium | PASSED | 4 pages, 10/page, Previous/Next buttons work |

---

## Detailed Test Execution

### C410563 - Anonymous User Notifications Hidden
**Status: PASSED**

Steps executed:
1. Signed out from the storefront
2. Verified the header navigation bar as anonymous user
3. Confirmed the Notifications bell icon is NOT visible in the header for anonymous users
4. Only visible header items: Bulk order, Compare, Lists, Cart

Evidence: `C410563-01-anonymous-no-bell.png` through `C410563-04-anonymous-catalog-no-bell.png`

### C410564 - Empty Pop-up
**Status: PASSED**

Steps executed:
1. Signed in as BMW-Group / Elena Mutykova
2. Cleared all messages from popup (if any)
3. Clicked the bell icon
4. Popup showed: "No new notifications at the moment. Stay tuned for updates and important messages."
5. "View all notifications" button present

Evidence: `C410564-01-empty-popup.png`

### C410565 - Mark Read (Single Message)
**Status: PASSED**

Steps executed:
1. Created 5 fresh push messages from Admin to populate bell popup
2. Bell badge showed "5" after WebSocket delivery
3. Opened popup - 5 notifications with blue dots (unread indicators)
4. Clicked "Mark as read" on first notification
5. Blue dot removed, count decreased from 5 to 4
6. Button text changed from "Mark as read" to "Mark as unread"

Evidence: `C410565-00-bell-badge-5.png`, `C410565-01-popup-5-unread.png`, `C410565-02-one-marked-read-count-4.png`

### C410566 - Mark Unread (Single Message)
**Status: PASSED**

Steps executed:
1. Clicked "Mark as unread" on the previously read notification
2. Blue dot restored, count increased from 4 back to 5
3. Button text changed back to "Mark as read"

### C410567 - Click Link in Notification
**Status: PASSED**

Steps executed:
1. Third notification contained link: `https://vcst-qa-storefront.govirto.com/printers`
2. Clicked the link in the notification
3. Browser navigated to Printers category page (30 results)
4. Popup closed automatically
5. Notification auto-marked as read (count decreased from 5 to 4)

Evidence: `C410567-01-link-navigated-printers.png`

### C410568 - Mark All as Read
**Status: PASSED**

Steps executed:
1. Opened three-dot menu in popup
2. Clicked "Mark all as read"
3. All blue dots removed
4. Count badge disappeared
5. Empty state shown (with "Show unread only" still active)

Evidence: `C410568-01-popup-before-mark-all.png`, `C410568-02-all-marked-read-empty.png`

### C410569 - Mark All as Unread
**Status: PASSED**

Steps executed:
1. Opened three-dot menu in popup
2. Clicked "Mark all as unread"
3. All blue dots restored
4. Count badge returned showing "5"
5. All buttons changed to "Mark as read"

Evidence: `C410569-01-all-marked-unread-count-5.png`

### C410570 - Count Decrease One by One (Popup)
**Status: PASSED**

Steps executed:
1. Starting count: 5
2. Marked first message as read -> count: 4
3. Marked second message as read -> count: 3
4. Count decreased by exactly 1 for each message marked as read

### C410571 - Count Increase One by One (Popup)
**Status: PASSED**

Steps executed:
1. Starting count: 3
2. Toggled "Show unread only" OFF to see all messages
3. Marked first read message as unread -> count: 4
4. Marked second read message as unread -> count: 5
5. Count increased by exactly 1 for each message marked as unread

### C410572/C410573 - Show Unread Only Toggle (Popup)
**Status: PASSED**

Steps executed:
1. Marked 1 message as read (count: 4)
2. Toggled "Show unread only" ON
3. Only 4 unread notifications shown, read notification hidden
4. Toggled OFF - all 5 notifications shown again (read + unread)

Evidence: `C410572-01-show-unread-only-on.png`

### C410574 - Clear All (Popup)
**Status: PASSED**

Steps executed:
1. Marked all as unread (count: 5)
2. Clicked "Clear all" in three-dot menu
3. Bell badge disappeared
4. Popup showed empty state
5. Navigated to /account/notifications (archive page)
6. All 36 notifications still present in archive
7. Confirmed: "Clear all" removes from popup only, NOT from history

Evidence: `C410574-01-clear-all-empty.png`, `C410574-02-archive-still-has-messages.png`

### C410575 - Feature Flag
**Status: SKIPPED**

Reason: This test requires modifying the `push_messages_enabled` setting in `settings_data.json` at the code level. Not executable through the UI. Requires developer intervention or deployment configuration change.

### C410576 - Company-Wide Messages
**Status: PASSED**

Steps executed:
1. Created company-wide push message targeting BMW-Group from Admin
2. Verified the message appeared in the notifications archive
3. Message content: "Company-wide announcement: New B2B portal features are now available..."

### C410577 - Login on Behalf Admin
**Status: NOT TESTED**

Reason: Test case has no defined steps, preconditions, or expected results in TestRail. Only the title exists: "Login on behalf admin > All messages remain unread". Low priority. Needs test case definition before execution.

### C410578 - Empty Archive Page
**Status: N/A**

Reason: Cannot reproduce empty state -- the user account has 36+ pre-existing notifications from previous test sessions. Would require deleting all notifications, which is not supported through the storefront UI.

### C410579 - View All Notifications (from Popup)
**Status: PASSED**

Steps executed:
1. Opened bell popup
2. Clicked "View all notifications" button
3. Navigated to `/account/notifications` page
4. Archive page displayed with heading, notifications list, and pagination

### C410580 - Account Navigation to Notifications
**Status: PASSED**

Steps executed:
1. Navigated to Account Dashboard
2. Clicked "Notifications" link in the sidebar navigation
3. Successfully navigated to `/account/notifications`

### C410581 - Mark All as Read (Archive)
**Status: PASSED**

Steps executed:
1. Opened three-dot dropdown on archive page
2. Clicked "Mark all as read"
3. Heading changed from "Notifications 36" to "Notifications" (no count badge)
4. All notification buttons changed to "Mark as unread"

Evidence: `C410581-01-archive-all-read.png`

### C410582 - Mark All as Unread (Archive)
**Status: PASSED**

Steps executed:
1. Opened three-dot dropdown on archive page
2. Clicked "Mark all as unread"
3. Heading returned to "Notifications 36" (count badge restored)
4. All notification buttons changed to "Mark as read"

### C410583 - Click Link in Archive Notification
**Status: PASSED**

Steps executed:
1. On archive page, found notification with link to `https://vcst-qa-storefront.govirto.com/printers`
2. Clicked the link
3. Browser navigated to Printers category page (30 results)

### C410584 - Count Decrease One by One (Archive)
**Status: PASSED**

Steps executed:
1. Starting count in archive heading: 35
2. Clicked "Mark as read" on notifications one by one
3. Count decreased: 35 -> 34 -> 33 -> 32 -> 31 -> 30 -> 29 -> 28 -> 27 -> 26
4. Marked all 10 notifications on page 1 as read (including 1 that was already read)
5. Count badge decreased by exactly 1 for each notification marked

Evidence: `C410584-01-archive-35-unread.png`, `C410584-02-archive-26-unread-page1-all-read.png`

### C410585 - Count Increase One by One (Archive)
**Status: PASSED**

Steps executed:
1. Starting count: 26 (after marking page 1 all as read)
2. Clicked "Mark as unread" on notifications one by one
3. Count increased: 26 -> 27 -> 28 -> 29
4. Count badge increased by exactly 1 for each notification marked as unread

Evidence: `C410585-01-archive-count-increased-29.png`

### C410586 - Show Unread Only = ON (Archive)
**Status: PASSED**

Steps executed:
1. Toggled "Show unread only" ON on archive page
2. Read notifications hidden from the list
3. Only unread notifications displayed (all with blue dots)
4. Pagination adjusted (4 pages -> 3 pages for 28 unread)
5. Marking a notification as read while filter ON caused it to disappear from the list

Evidence: `C410586-01-show-unread-only-on-archive.png`

### C410587 - Show Unread Only = OFF (Archive)
**Status: PASSED**

Steps executed:
1. Toggled "Show unread only" OFF on archive page
2. All notifications shown (both read and unread)
3. Read notifications have no blue dot, unread have blue dot
4. Pagination returned to 4 pages (36 total notifications)

Evidence: `C410587-01-show-unread-only-off-archive.png`

### C410588 - Clear All in Popup > Check Archive
**Status: PASSED**

Steps executed:
1. Bell popup was already empty (cleared previously in C410574)
2. Opened bell popup - showed "No new notifications at the moment"
3. Archive page (in background) still showed "Notifications 27" with all messages
4. Confirmed: Clear all in popup only hides from popup, archive retains all messages

Evidence: `C410588-01-popup-empty-archive-has-messages.png`

### C410589 - Pagination
**Status: PASSED**

Steps executed:
1. Archive page with 36 notifications across 4 pages (10 per page, 6 on last page)
2. Clicked page 2 -> loaded 10 different (older) notifications
3. Clicked page 3 -> loaded 10 more older notifications
4. Clicked page 4 -> loaded 6 remaining notifications (last page)
5. "Next" button disabled on last page (page 4)
6. Clicked "Previous" -> returned to page 3
7. "Previous" button disabled on first page (page 1)
8. Page numbers correctly highlighted for current page

Evidence: `C410589-01-pagination-page3.png`

---

## Observations and Notes

### Key Behavioral Findings

1. **Bell Popup vs Archive Separation:** The bell popup maintains a separate "cleared" state from the archive. Messages cleared from the popup (`Clear all`) do not disappear from `/account/notifications`. Only NEW push messages (sent after clearing) appear in the popup.

2. **WebSocket Real-Time Delivery:** Push messages sent from Admin are delivered to the storefront bell icon in real-time via WebSocket connection. The badge count updates without page refresh.

3. **Link Click Auto-Marks as Read:** Clicking a link inside a notification in the popup automatically marks that notification as read and decreases the count.

4. **Notification with Link in Archive - Navigation Issue:** When clicking "Mark as unread" on a notification that contains a link in the archive page, the click may navigate to the link destination instead of just toggling the read/unread state. This appears to be a click target overlap issue -- the "Mark as unread/read" button area overlaps with the notification body containing the link.

5. **Show Unread Only with Pagination:** When "Show unread only" is enabled, pagination dynamically adjusts to reflect only the unread message count (e.g., 4 pages -> 3 pages when some messages are read).

### Console Errors Observed

- `A bad HTTP response code (404) was received when fetching the script` - ServiceWorker registration failure. Not related to notifications functionality.
- No JavaScript errors related to notification functionality.

### Potential Bug (Minor)

**Title:** Clicking "Mark as unread" button on notification with link may trigger link navigation
**Severity:** Low
**Steps:** In archive page, click "Mark as unread" on a notification that contains a hyperlink
**Expected:** Only the read/unread state should toggle
**Actual:** Sometimes navigates to the link URL instead
**Impact:** Minor UX issue, workaround is to use "Mark all as unread" from the three-dot menu

---

## Screenshots Index

All screenshots saved to: `C:\Users\mutyk\My Projects\vc-mcp-testing-module\test-results\chrome\`

| File | Description |
|------|-------------|
| `C410563-01-anonymous-no-bell.png` | Anonymous user - no bell icon visible |
| `C410563-02-anonymous-header-detail.png` | Anonymous header detail |
| `C410563-03-anonymous-signed-out.png` | Signed out state |
| `C410563-04-anonymous-catalog-no-bell.png` | Anonymous catalog page |
| `C410564-01-empty-popup.png` | Empty popup state |
| `C410565-00-bell-badge-5.png` | Bell badge showing 5 |
| `C410565-01-popup-5-unread.png` | Popup with 5 unread notifications |
| `C410565-02-one-marked-read-count-4.png` | One marked read, count 4 |
| `C410567-01-link-navigated-printers.png` | Link navigation to Printers |
| `C410568-01-popup-before-mark-all.png` | Popup before mark all |
| `C410568-02-all-marked-read-empty.png` | All marked read, empty state |
| `C410569-01-all-marked-unread-count-5.png` | All marked unread, count 5 |
| `C410572-01-show-unread-only-on.png` | Show unread only ON in popup |
| `C410574-01-clear-all-empty.png` | Clear all - empty popup |
| `C410574-02-archive-still-has-messages.png` | Archive retains messages after clear |
| `C410581-01-archive-all-read.png` | Archive all marked read |
| `C410584-01-archive-35-unread.png` | Archive with 35 unread |
| `C410584-02-archive-26-unread-page1-all-read.png` | Page 1 all read, count 26 |
| `C410585-01-archive-count-increased-29.png` | Count increased to 29 |
| `C410586-01-show-unread-only-on-archive.png` | Show unread only ON in archive |
| `C410587-01-show-unread-only-off-archive.png` | Show unread only OFF in archive |
| `C410588-01-popup-empty-archive-has-messages.png` | Popup empty, archive has messages |
| `C410589-01-pagination-page3.png` | Pagination page 3 |

---

## Test Metrics

| Metric | Value |
|--------|-------|
| Total Test Cases | 27 |
| Passed | 22 |
| Failed | 0 |
| Skipped | 2 (C410575, C410577) |
| N/A | 2 (C410578, C410573 combined with C410572) |
| Not Tested | 1 (C410577) |
| Pass Rate | 100% (of executable tests) |
| Bugs Found | 0 critical, 0 high, 1 low (potential) |
| Execution Time | ~2 hours |
| Screenshots Captured | 23 |

---

## Verdict

**APPROVED** - All executable notification and push message test cases pass. The notification system (bell popup + archive page) functions correctly for the B2B storefront. No blocking issues found. The 2 skipped tests require either code-level changes (C410575) or test case definition (C410577) and do not impact the overall quality assessment.
