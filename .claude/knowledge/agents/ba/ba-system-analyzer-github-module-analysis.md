# ba-system-analyzer — GitHub module source analysis

> Cited by `.claude/agents/ba-system-analyzer.md` (§2). Read it when you analyze a VirtoCommerce module through GitHub (search patterns, standard module repo table, module reading order).

### 2. GitHub Module Source Analysis

Search VirtoCommerce GitHub repositories to understand module internals, APIs, and extension points. This is critical for analyzing modules you don't have locally.

**GitHub MCP tools to use:**
- `mcp__github__search_code` — search across VirtoCommerce org repos for specific classes, interfaces, APIs
- `mcp__github__search_repositories` — find module repos (`VirtoCommerce/vc-module-*`)
- `mcp__github__get_file_contents` — read specific files (manifests, controllers, models, permissions)

**Key search patterns:**
```
# Find a module's repo and structure
org:VirtoCommerce vc-module-{name}

# Search for API controllers in a module
org:VirtoCommerce repo:VirtoCommerce/vc-module-{name} filename:Controller.cs

# Find permission definitions (= feature map)
org:VirtoCommerce repo:VirtoCommerce/vc-module-{name} path:Permissions

# Find domain models and entities
org:VirtoCommerce repo:VirtoCommerce/vc-module-{name} path:Core/Models

# Find module manifest (version, dependencies, settings)
org:VirtoCommerce repo:VirtoCommerce/vc-module-{name} filename:module.manifest

# Search for specific business logic across all modules
org:VirtoCommerce "IOrderService" language:csharp
org:VirtoCommerce "AbstractTypeFactory" language:csharp

# Find extension points and events
org:VirtoCommerce repo:VirtoCommerce/vc-module-{name} "IDomainEvent"
org:VirtoCommerce repo:VirtoCommerce/vc-module-{name} "IHandler"
```

**Standard VC module repos to check**:

| Module | Repo |
|---|---|
| Platform | `VirtoCommerce/vc-platform` |
| Catalog | `VirtoCommerce/vc-module-catalog` |
| Orders | `VirtoCommerce/vc-module-orders` |
| Cart | `VirtoCommerce/vc-module-cart` |
| Customer | `VirtoCommerce/vc-module-customer` |
| Pricing | `VirtoCommerce/vc-module-pricing` |
| Marketing | `VirtoCommerce/vc-module-marketing` |
| Search | `VirtoCommerce/vc-module-search` |
| Inventory | `VirtoCommerce/vc-module-inventory` |
| Payment | `VirtoCommerce/vc-module-payment` |
| Shipping | `VirtoCommerce/vc-module-shipping` |
| Notifications | `VirtoCommerce/vc-module-notifications` |
| Quote | `VirtoCommerce/vc-module-quote` |
| BOPIS | `VirtoCommerce/vc-module-bopis` |
| CMS | `VirtoCommerce/vc-module-cms` |
| Returns | `VirtoCommerce/vc-module-returns` |
| Channels | `VirtoCommerce/vc-module-channels` |
| Loyalty | `VirtoCommerce/vc-module-loyalty` |
| SEO | `VirtoCommerce/vc-module-seo` |
| Image-Tools | `VirtoCommerce/vc-module-image-tools` |
| Push Messages | `VirtoCommerce/vc-module-push-messages` |
| Import/Export | `VirtoCommerce/vc-module-export` / `vc-module-import` |
| xAPI (storefront-facing GraphQL) | `VirtoCommerce/vc-module-x-api` |
| xPurchase | `VirtoCommerce/vc-module-x-purchase` |
| xMarketing | `VirtoCommerce/vc-module-x-marketing` |
| Frontend (Vue 3 + TS) | `VirtoCommerce/vc-frontend` |
| Admin Shell | `VirtoCommerce/vc-shell` |

For unknown/extension modules, use `mcp__github__search_repositories` with `org:VirtoCommerce vc-module-<keyword>` rather than guessing the slug — repo names are not always the module's marketing name (e.g., `vc-module-customer`, NOT `vc-module-customer-module`).

When analyzing a module:
1. Read `module.manifest` for version, dependencies, and settings definitions
2. Scan `*.Web/*Controller*.cs` for the API surface
3. Check `*.Core/Models/` for domain models
4. Check `*.Core/Events/` for domain events and extension points
5. Check `*.Data/Migrations/` for schema evolution
6. Review `README.md` for module documentation
