# Storefront PDP/category pages missing canonical link, meta description, and JSON-LD — P3

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368

## Summary
Site-wide SEO head tags are missing on the storefront. PDP `<head>` lacks `link[rel=canonical]`, `meta[name=description]`, and `og:description`; category pages lack `link[rel=canonical]` and the JSON-LD `BreadcrumbList` structured data. Slug resolution and routing themselves work correctly.

## STR
1. Open any product PDP and inspect the document `<head>`.
2. Open any category page and inspect `<head>` and inline `<script type="application/ld+json">`.

## Expected vs Actual
- **Expected:** PDP has `link[rel=canonical]`, `meta[name=description]`, and `og:description`; category pages have `link[rel=canonical]` and a `BreadcrumbList` JSON-LD block.
- **Actual:**
  - PDP: `og:title` / `og:image` / `og:url` present, but `link[rel=canonical]`, `meta[name=description]`, and `og:description` are **absent**.
  - Category pages: `link[rel=canonical]` and `BreadcrumbList` JSON-LD are **absent**.

## Root cause (suspected)
The PDP and category head/meta templates omit the canonical link and description tags, and the category template does not emit the breadcrumb structured-data script.

## Fix Routing
- **Repo:** vc-frontend (SEO head tags / structured data)
- **Kind:** frontend
