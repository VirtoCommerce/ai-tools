# QA Environment Snapshot — Configurable Products

**Environment:** QA (vcst-qa-storefront.govirto.com)
**Snapshot date:** 2026-03-13
**Store:** B2B-store

> This file contains environment-specific IDs (platform UUIDs, auto-generated SKUs).
> These values are NOT stable — they change when products are recreated.
> **Use slugs from `configurable-products.csv` for product lookup. Resolve IDs dynamically at runtime via `productConfiguration` query.**

---

## Product Platform IDs

| CSV ID | Product | Slug (stable) | Platform UUID | Auto-SKU |
|--------|---------|---------------|---------------|----------|
| CFG-001 | Configurable Hat | `configurable-hat` | `38dbe95c-3f46-48ff-bb9a-8bd96f475214` | YER-80407217 |
| CFG-002 | Custom T-shirt | `custom-t-shirt` | `50529b79-a018-4e84-93d5-860d7969b630` | AAW-59914334 |
| CFG-003 | Vintage Colorado Hoodie | `hoodie` | `4b1de1b0-b220-4092-9336-9ad462216719` | BAJ-18974454 |
| CFG-004 | Hoodie Base (File optional) | `physical` | `a04bbb3c-c3a0-4ab0-9b03-4e69e0ce5556` | FLN-31875514 |
| CFG-005 | Hoodie Base (File required) | `physical-1703` | `85b6f077-d59f-4a8f-8510-9920b9d64ee1` | OSW-31158373 |
| CFG-006 | Base product EN | `111111` | `de471c2c-eeb0-4367-9803-af5ffd75d8ba` | NIR-24861764 |
| CFG-007 | Product No variations | `product-no-variations` | `2b3d99f3-a6b5-4bc8-8e78-19d938aae295` | XYX-53490597 |
| CFG-008 | Product No B2C Layout | `product-no-b2c-layout-master` | `4ad2d643-641f-4948-ae17-20e73a305024` | NXU-15227254 |
| CFG-009 | Bike with options | `bike-with-options` | `f16d3e8f-6c86-4679-bcfd-100a0b164421` | ZER-64605169 |
| CFG-010 | Off-Road Bike | `off-road-bike` | `958d0762-404c-4a6f-a45a-46ed4943f5f0` | INN-69077289 |
| CFG-011 | Test Bike With Options | `test-bike-with-options` | `ad50e2b6-c6bd-4614-9caa-3b945a151917` | VCST4765-TESTBIKE |

## Configuration Section IDs

### Configurable Hat

| Section Name | Section UUID | Type | Required |
|-------------|-------------|------|----------|
| Select your fav color | `f8004e62-f820-4a00-8adb-774ab27c6011` | Product | No |
| Select print-ready cap | `45ab0a4b-740f-455a-829d-9856e7baa7f7` | Product | No |
| Customize text for your cap | `333e4dc4-9409-448d-9c13-593449b317d0` | Text | No |
| Add photo | `66941bf0-8268-463e-934c-31f6a464ed8f` | File | No |

**S1 Options:** Black hat `aa8116e5` $10, Beige hat `3cc2ab6e` $500, Green hat `59e78525` $18, Red hat `42ec462f` $14
**S2 Options:** NY `87833296` $8, H `10477f24` $10, P `72c8290f` $16, Bird `e5bd5735` $20, S `1ced56b0` $11

### Custom T-shirt

| Section Name | Section UUID | Type | Required |
|-------------|-------------|------|----------|
| Choose basic T-short | `e1d33e4e-581a-4745-b31b-f3048180d225` | Product | Yes |
| Select print | `d54c98d2-6c74-4175-93ff-0bc9c894429b` | Text | No |
| For couples | `fdbf3190-0472-431e-bdb0-d8e9fd045e88` | Product | No |
| Upload your picture | `4885b38d-f0ff-4f5d-8e82-b63e70b021b5` | File | No |

### Hoodie Base (File optional)

| Section Name | Section UUID | Type | Required |
|-------------|-------------|------|----------|
| Only File non required | `8b7559d7-873b-4291-98e0-f64a45edc7e2` | File | No |

### Hoodie Base (File required)

| Section Name | Section UUID | Type | Required |
|-------------|-------------|------|----------|
| only File req | `c356265f-2bdf-4afd-a820-105ead721465` | File | Yes |

### Base product EN

| Section Name | Section UUID | Type | Required |
|-------------|-------------|------|----------|
| File req | `4045b3ae-bb6c-4d36-a7df-d782d669c5e5` | File | Yes |
| Text required | `21d670eb-abec-460d-98e9-05f1b124a802` | Text | Yes |
| Product not required not description | `6a1018f9-e223-4814-aa3e-674f414f5e0a` | Product | Yes |

### Bike with options

| Section Name | Section UUID | Type | Required |
|-------------|-------------|------|----------|
| Text | `27ec399a-711a-495a-9c35-c1aacd65440d` | Text | No |
| Choose your bike variant | `2a995fe9-07a1-405c-bd6a-10211e4c151a` | Variation | No |
| Produts | `90816bc4-81e6-4c35-8158-8582819b21ce` | Product | Yes |

**S3 Options:** Pillow `7de77e67` $0, Foam mattress `f79bbf47` $0, Mattress cover `06f5c0ad` $0, Blanket `f35b3373` $0

### Test Bike With Options

| Section Name | Section UUID | Type | Required |
|-------------|-------------|------|----------|
| Select Upgrades | `42098756-d1a7-4277-9575-8cf8a92c4161` | Product | Yes |
| Custom Engraving -updated | `f3400ed1-35bb-47b1-bbb2-0c72198c0306` | Text | Yes |
| product12 | `93853d45-4922-4bf7-9fe8-970228e91642` | Product | Yes |

**S1 Options:** Comfort Seat `6dfc64d4` $0/$15, Rear Wheel `9459f539` $88/$126 qty2, Premium Pedals `2de46049` $14, Engine `3285a4c2` $225/$275
**S3 Options:** Seat `e5df66a5` $45 qty4, Rear wheel 26 `cabde383` $22

### Off-Road Bike

| Section Name | Section UUID | Type | Required |
|-------------|-------------|------|----------|
| Variations | `fc48d799-4e64-4ded-bfce-ff613f02da91` | Variation | No |
| Variation section2 | `d9d2fd29-4933-46bd-a358-c5bf569da62c` | Variation | No |
| Text1 | `b7c05532-c5cc-4ebb-b208-bcd36bea4e1a` | Text | No |

---

## How Agents Should Use This Data

1. **Product lookup:** Use slug from `configurable-products.csv` → resolve to platform ID via GraphQL `products(filter: "slug:configurable-hat")` query
2. **Section IDs:** Call `productConfiguration(configurableProductId: "<resolved-id>")` to get current section UUIDs
3. **This snapshot file:** Reference only, for quick lookup during interactive testing. Do NOT hardcode these IDs in automated test scripts.
