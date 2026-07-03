# White Labeling Test Data - GraphQL Queries & Mutations

## 1. Verify White Labeling Settings Query (New mainMenuLinks field)

```graphql
query GetWhiteLabelingSettings($storeId: String!, $cultureName: String) {
  whiteLabelingSettings(storeId: $storeId, cultureName: $cultureName) {
    labelingSetting {
      logoUrl
      secondLogoUrl
      faviconUrl
      themePresetName
      footerLinkListName
      mainMenuLinkListName
    }
    mainMenuLinks {
      title
      url
      priority
      childItems {
        title
        url
        priority
      }
    }
    footerLinks {
      title
      url
      priority
      childItems {
        title
        url
        priority
      }
    }
  }
}
```

**Variables (Electronics Org):**
```json
{
  "storeId": "B2B-store",
  "cultureName": "en-US"
}
```

## 2. Query Without mainMenuLinks (Backward Compatibility)

```graphql
query GetWhiteLabelingSettingsLegacy($storeId: String!, $cultureName: String) {
  whiteLabelingSettings(storeId: $storeId, cultureName: $cultureName) {
    labelingSetting {
      logoUrl
      faviconUrl
      themePresetName
      footerLinkListName
    }
    footerLinks {
      title
      url
      priority
    }
  }
}
```

## 3. Query With Organization Context

```graphql
query GetWhiteLabelingForOrg($storeId: String!, $cultureName: String, $organizationId: String) {
  whiteLabelingSettings(
    storeId: $storeId
    cultureName: $cultureName
    organizationId: $organizationId
  ) {
    labelingSetting {
      mainMenuLinkListName
      footerLinkListName
    }
    mainMenuLinks {
      title
      url
      priority
      childItems {
        title
        url
        priority
      }
    }
    footerLinks {
      title
      url
      priority
    }
  }
}
```

**Variables (Switch between orgs):**

Electronics Org:
```json
{
  "storeId": "B2B-store",
  "cultureName": "en-US",
  "organizationId": "<ELECTRONICS_ORG_ID>"
}
```

Fashion Org:
```json
{
  "storeId": "B2B-store",
  "cultureName": "en-US",
  "organizationId": "<FASHION_ORG_ID>"
}
```

Default Org (no config - expect fallback):
```json
{
  "storeId": "B2B-store",
  "cultureName": "en-US",
  "organizationId": "<DEFAULT_ORG_ID>"
}
```

## 4. Expected Responses

### Electronics Org - mainMenuLinks
```json
{
  "data": {
    "whiteLabelingSettings": {
      "mainMenuLinks": [
        {
          "title": "Home",
          "url": "/",
          "priority": 1,
          "childItems": []
        },
        {
          "title": "Brands",
          "url": "/brands",
          "priority": 2,
          "childItems": [
            { "title": "Laptops", "url": "/search?q=laptop", "priority": 1 },
            { "title": "Phones", "url": "/search?q=phone", "priority": 2 },
            { "title": "Tablets", "url": "/search?q=tablet", "priority": 3 }
          ]
        },
        {
          "title": "Company",
          "url": "/contacts",
          "priority": 3,
          "childItems": []
        },
        {
          "title": "Support",
          "url": "/search?q=support",
          "priority": 4,
          "childItems": []
        }
      ]
    }
  }
}
```

### Fashion Org - mainMenuLinks
```json
{
  "data": {
    "whiteLabelingSettings": {
      "mainMenuLinks": [
        {
          "title": "Home",
          "url": "/",
          "priority": 1,
          "childItems": []
        },
        {
          "title": "Shop",
          "url": "/brands",
          "priority": 2,
          "childItems": [
            { "title": "Men", "url": "/search?q=men", "priority": 1 },
            { "title": "Women", "url": "/search?q=women", "priority": 2 },
            { "title": "Kids", "url": "/search?q=kids", "priority": 3 }
          ]
        },
        {
          "title": "New Arrivals",
          "url": "/catalog",
          "priority": 3,
          "childItems": []
        },
        {
          "title": "Contact",
          "url": "/contacts",
          "priority": 4,
          "childItems": []
        }
      ]
    }
  }
}
```

### Default Org (No Config) - mainMenuLinks
```json
{
  "data": {
    "whiteLabelingSettings": {
      "mainMenuLinks": []
    }
  }
}
```

### Electronics Org - footerLinks

The footer is **hierarchical** (two-level), same as the main menu: each top-level entry is a
**section header** (rendered as a non-clickable column title in `footer-links.vue`), and its
`childItems` are the actual clickable links. A flat footer list (top-level entries with empty
`childItems`) renders as empty header columns — bold text on desktop, an accordion that reveals
nothing on mobile — which is a **test-data structure error, not a product bug**.

```json
{
  "data": {
    "whiteLabelingSettings": {
      "footerLinks": [
        {
          "title": "Legal",
          "url": "/search?q=legal",
          "priority": 1,
          "childItems": [
            { "title": "Privacy Policy", "url": "/search?q=privacy", "priority": 1 },
            { "title": "Terms of Service", "url": "/search?q=terms", "priority": 2 }
          ]
        },
        {
          "title": "Help",
          "url": "/search?q=help",
          "priority": 2,
          "childItems": [
            { "title": "Support", "url": "/search?q=support", "priority": 1 },
            { "title": "Warranty", "url": "/search?q=warranty", "priority": 2 }
          ]
        }
      ]
    }
  }
}
```

### Fashion Org - footerLinks

```json
{
  "data": {
    "whiteLabelingSettings": {
      "footerLinks": [
        {
          "title": "Customer Service",
          "url": "/search?q=service",
          "priority": 1,
          "childItems": [
            { "title": "Shipping Info", "url": "/search?q=shipping", "priority": 1 },
            { "title": "Returns & Exchanges", "url": "/search?q=returns", "priority": 2 },
            { "title": "Size Guide", "url": "/search?q=size", "priority": 3 }
          ]
        },
        {
          "title": "Our Company",
          "url": "/contacts",
          "priority": 2,
          "childItems": [
            { "title": "Contact Us", "url": "/contacts", "priority": 1 }
          ]
        }
      ]
    }
  }
}
```

## 5. Performance Testing Query (Measure Response Time)

```graphql
query PerfTestWhiteLabeling($storeId: String!, $cultureName: String) {
  whiteLabelingSettings(storeId: $storeId, cultureName: $cultureName) {
    labelingSetting {
      logoUrl
      secondLogoUrl
      faviconUrl
      themePresetName
      footerLinkListName
      mainMenuLinkListName
    }
    mainMenuLinks {
      title
      url
      priority
      childItems {
        title
        url
        priority
      }
    }
    footerLinks {
      title
      url
      priority
      childItems {
        title
        url
        priority
      }
    }
  }
}
```

**Acceptance criteria:** Average response time < 500ms over 10 iterations.
