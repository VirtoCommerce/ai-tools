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
          "title": "Products",
          "url": "/products",
          "priority": 2,
          "childItems": [
            { "title": "Laptops", "url": "/products/laptops", "priority": 1 },
            { "title": "Phones", "url": "/products/phones", "priority": 2 },
            { "title": "Tablets", "url": "/products/tablets", "priority": 3 }
          ]
        },
        {
          "title": "About Us",
          "url": "/about",
          "priority": 3,
          "childItems": []
        },
        {
          "title": "Support",
          "url": "/support",
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
          "url": "/shop",
          "priority": 2,
          "childItems": [
            { "title": "Men", "url": "/shop/men", "priority": 1 },
            { "title": "Women", "url": "/shop/women", "priority": 2 },
            { "title": "Kids", "url": "/shop/kids", "priority": 3 }
          ]
        },
        {
          "title": "New Arrivals",
          "url": "/new-arrivals",
          "priority": 3,
          "childItems": []
        },
        {
          "title": "Contact",
          "url": "/contact",
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
