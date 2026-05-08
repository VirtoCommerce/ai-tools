# B2B Test Data Seed Report — VirtoStart — 20260508

**Platform:** https://virtostart-demo-admin.govirto.com
**Store:** B2B-store (group: B2B-store)
**Date:** 2026-05-08T13:44:50.413Z
**Method:** REST API via admin token (`/api/members`, `/api/platform/security/users/create`)
**Naming Convention:** `AGENT-TEST-*-20260508` prefix

## Summary

| Entity | Count |
|--------|-------|
| Organizations | 4 |
| Contacts | 10 |
| User Accounts | 10 |

## Organizations

| Key | Name | ID | Parent | Groups |
|-----|------|-----|--------|--------|
| AcmeCorp | AGENT-TEST-Org-AcmeCorp-20260508 | `8a64d782-d3f5-4f3f-835a-525b8b41b496` | — | Premium Customers, B2B-store |
| TechFlow | AGENT-TEST-Org-TechFlow-20260508 | `a0422c9c-6238-495e-9888-e7ccfdf36f6a` | — | Standard Customers, B2B-store |
| BuildRight | AGENT-TEST-Org-BuildRight-20260508 | `523a2597-2823-4a60-8f65-563fd4d9f57e` | — | Standard Customers, B2B-store |
| AcmeWest | AGENT-TEST-Org-AcmeWest-20260508 | `d2aed33b-cd31-4556-9196-739393926385` | AcmeCorp | B2B-store |

## Contacts

| Name | Org | Role | Email | Contact ID |
|------|-----|------|-------|------------|
| John Mitchell-20260508 | AcmeCorp | Organization maintainer | test-john.mitchell-20260508@test-agent.com | `08f73abb-3a81-4531-be3b-2718259519d3` |
| Sarah Chen-20260508 | AcmeCorp | Purchasing agent | test-sarah.chen-20260508@test-agent.com | `9c212ea9-f3f1-44d2-b623-fba04837dc35` |
| Mike Torres-20260508 | AcmeCorp | Organization employee | test-mike.torres-20260508@test-agent.com | `673d18a9-5383-466d-a5fb-ba69722950fb` |
| Lisa Wang-20260508 | AcmeCorp | Purchasing agent | test-lisa.wang-20260508@test-agent.com | `1cabcaaa-cd5d-42f8-b984-58a1f9a71d68` |
| Emily Johnson-20260508 | TechFlow | Organization maintainer | test-emily.johnson-20260508@test-agent.com | `12744e94-8d3d-4b15-9de4-28fb1689fe98` |
| David Kim-20260508 | TechFlow | Purchasing agent | test-david.kim-20260508@test-agent.com | `66164f87-0c9b-4183-bc24-d8875c29eaff` |
| Carlos Rodriguez-20260508 | BuildRight | Organization maintainer | test-carlos.rodriguez-20260508@test-agent.com | `0951bbdc-6a1f-43d2-8c1c-60017d96208b` |
| Angela Foster-20260508 | BuildRight | Purchasing agent | test-angela.foster-20260508@test-agent.com | `18fb9c11-b539-429f-b4eb-4ce9f2deb789` |
| Robert Lee-20260508 | AcmeWest | Organization maintainer | test-robert.lee-20260508@test-agent.com | `08612f2f-860d-4ca1-892a-74d36b527522` |
| Hans Mueller-20260508 | AcmeCorp | Organization maintainer | test-hans.mueller-20260508@test-agent.com | `24c06adf-efda-457b-807d-6c8f6df2abac` |

## Users

| Username | Role | User ID | Contact ID |
|----------|------|---------|------------|
| test-john.mitchell-20260508@test-agent.com | Organization maintainer | `f2f838d8-2195-4a36-8d8d-01de34ae66c3` | `08f73abb-3a81-4531-be3b-2718259519d3` |
| test-sarah.chen-20260508@test-agent.com | Purchasing agent | `06bc32c7-81ff-40c6-8da5-fb9755048023` | `9c212ea9-f3f1-44d2-b623-fba04837dc35` |
| test-mike.torres-20260508@test-agent.com | Organization employee | `26f6281e-451d-4ea9-9312-1921fe0bf944` | `673d18a9-5383-466d-a5fb-ba69722950fb` |
| test-lisa.wang-20260508@test-agent.com | Purchasing agent | `265a95ee-4e88-4f22-b083-9f1397f1fcdc` | `1cabcaaa-cd5d-42f8-b984-58a1f9a71d68` |
| test-emily.johnson-20260508@test-agent.com | Organization maintainer | `ca09bd21-f7a9-4b5d-a701-08c2e5531450` | `12744e94-8d3d-4b15-9de4-28fb1689fe98` |
| test-david.kim-20260508@test-agent.com | Purchasing agent | `cd3ae458-2a2c-437a-8c6b-88b2af2ea3cb` | `66164f87-0c9b-4183-bc24-d8875c29eaff` |
| test-carlos.rodriguez-20260508@test-agent.com | Organization maintainer | `c1503865-9d46-4947-a70f-c3fdbf7b5e74` | `0951bbdc-6a1f-43d2-8c1c-60017d96208b` |
| test-angela.foster-20260508@test-agent.com | Purchasing agent | `a8e8f3a3-1411-4537-8c39-b235975209e9` | `18fb9c11-b539-429f-b4eb-4ce9f2deb789` |
| test-robert.lee-20260508@test-agent.com | Organization maintainer | `da3bff53-866b-432d-b3ac-c776369362c3` | `08612f2f-860d-4ca1-892a-74d36b527522` |
| test-hans.mueller-20260508@test-agent.com | Organization maintainer | `a12f9a2a-73be-444e-b27a-85a21ee756b3` | `24c06adf-efda-457b-807d-6c8f6df2abac` |

**Password (all users):** `TestPass123!`
