# Seed Agent Pool Users — Personal Accounts

Creates 3 personal (non-org) user accounts on the QA platform, one per browser slot.
These users are **dedicated to parallel agent testing** — each browser slot gets its own isolated user to prevent session/cart/order state conflicts.

**Prerequisites:** Admin token from `POST /connect/token`

---

## Step 1: Create Contacts (no organization)

Personal users need a Contact record without an `organizations[]` link.

```bash
# Slot 1 — Chrome agent
curl -sk -X POST "{{BACK_URL}}/api/members" \
  -H "Authorization: Bearer {{TOKEN}}" \
  -H "Content-Type: application/json" \
  -d '{
    "memberType": "Contact",
    "firstName": "Agent",
    "lastName": "Chrome",
    "fullName": "Agent Chrome",
    "emails": ["qa-agent-slot1@virtocommerce.com"],
    "phones": ["+1-555-0201"],
    "addresses": [{
      "addressType": "BillingAndShipping",
      "firstName": "Agent", "lastName": "Chrome",
      "line1": "100 QA Lane", "city": "New York",
      "regionId": "NY", "regionName": "New York",
      "postalCode": "10001", "countryCode": "US", "countryName": "United States"
    }],
    "defaultLanguage": "en-US",
    "currencyCode": "USD"
  }'
# → Save returned "id" as CONTACT_ID_SLOT1

# Slot 2 — Firefox agent
curl -sk -X POST "{{BACK_URL}}/api/members" \
  -H "Authorization: Bearer {{TOKEN}}" \
  -H "Content-Type: application/json" \
  -d '{
    "memberType": "Contact",
    "firstName": "Agent",
    "lastName": "Firefox",
    "fullName": "Agent Firefox",
    "emails": ["qa-agent-slot2@virtocommerce.com"],
    "phones": ["+1-555-0202"],
    "addresses": [{
      "addressType": "BillingAndShipping",
      "firstName": "Agent", "lastName": "Firefox",
      "line1": "200 QA Lane", "city": "Los Angeles",
      "regionId": "CA", "regionName": "California",
      "postalCode": "90001", "countryCode": "US", "countryName": "United States"
    }],
    "defaultLanguage": "en-US",
    "currencyCode": "USD"
  }'
# → Save returned "id" as CONTACT_ID_SLOT2

# Slot 3 — Edge agent
curl -sk -X POST "{{BACK_URL}}/api/members" \
  -H "Authorization: Bearer {{TOKEN}}" \
  -H "Content-Type: application/json" \
  -d '{
    "memberType": "Contact",
    "firstName": "Agent",
    "lastName": "Edge",
    "fullName": "Agent Edge",
    "emails": ["qa-agent-slot3@virtocommerce.com"],
    "phones": ["+1-555-0203"],
    "addresses": [{
      "addressType": "BillingAndShipping",
      "firstName": "Agent", "lastName": "Edge",
      "line1": "300 QA Lane", "city": "Chicago",
      "regionId": "IL", "regionName": "Illinois",
      "postalCode": "60601", "countryCode": "US", "countryName": "United States"
    }],
    "defaultLanguage": "en-US",
    "currencyCode": "USD"
  }'
# → Save returned "id" as CONTACT_ID_SLOT3
```

## Step 2: Create Security Accounts

```bash
# Slot 1
curl -sk -X POST "{{BACK_URL}}/api/platform/security/users/create" \
  -H "Authorization: Bearer {{TOKEN}}" \
  -H "Content-Type: application/json" \
  -d '{
    "userName": "qa-agent-slot1@virtocommerce.com",
    "email": "qa-agent-slot1@virtocommerce.com",
    "password": "TestAgent1!",
    "storeId": "B2B-store",
    "memberId": "{{CONTACT_ID_SLOT1}}",
    "isAdministrator": false,
    "userType": "Customer",
    "emailConfirmed": true
  }'

# Slot 2
curl -sk -X POST "{{BACK_URL}}/api/platform/security/users/create" \
  -H "Authorization: Bearer {{TOKEN}}" \
  -H "Content-Type: application/json" \
  -d '{
    "userName": "qa-agent-slot2@virtocommerce.com",
    "email": "qa-agent-slot2@virtocommerce.com",
    "password": "TestAgent2!",
    "storeId": "B2B-store",
    "memberId": "{{CONTACT_ID_SLOT2}}",
    "isAdministrator": false,
    "userType": "Customer",
    "emailConfirmed": true
  }'

# Slot 3
curl -sk -X POST "{{BACK_URL}}/api/platform/security/users/create" \
  -H "Authorization: Bearer {{TOKEN}}" \
  -H "Content-Type: application/json" \
  -d '{
    "userName": "qa-agent-slot3@virtocommerce.com",
    "email": "qa-agent-slot3@virtocommerce.com",
    "password": "TestAgent3!",
    "storeId": "B2B-store",
    "memberId": "{{CONTACT_ID_SLOT3}}",
    "isAdministrator": false,
    "userType": "Customer",
    "emailConfirmed": true
  }'
```

## Step 3: Verify Login

```bash
# Test each user can authenticate
for SLOT in 1 2 3; do
  curl -sk -X POST "{{BACK_URL}}/connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password&scope=offline_access&username=qa-agent-slot${SLOT}@virtocommerce.com&password=TestAgent${SLOT}!&storeId=B2B-store"
  echo ""
done
# Each should return an access_token
```

## Step 4: Update agent-user-pool.csv

After seeding, update `test-data/users/agent-user-pool.csv`:
- Set `seeded` column to `true` for all 3 rows

## Teardown

```bash
# Delete users (by userName)
curl -sk -X DELETE "{{BACK_URL}}/api/platform/security/users/qa-agent-slot1@virtocommerce.com" -H "Authorization: Bearer {{TOKEN}}"
curl -sk -X DELETE "{{BACK_URL}}/api/platform/security/users/qa-agent-slot2@virtocommerce.com" -H "Authorization: Bearer {{TOKEN}}"
curl -sk -X DELETE "{{BACK_URL}}/api/platform/security/users/qa-agent-slot3@virtocommerce.com" -H "Authorization: Bearer {{TOKEN}}"

# Delete contacts
curl -sk -X DELETE "{{BACK_URL}}/api/members?ids={{CONTACT_ID_SLOT1}}&ids={{CONTACT_ID_SLOT2}}&ids={{CONTACT_ID_SLOT3}}" -H "Authorization: Bearer {{TOKEN}}"
```
