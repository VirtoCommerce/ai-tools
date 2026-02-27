# Frontend Test Cases: Responsive, Cross-Browser & Performance

> Extracted from qa-frontend-expert agent. Read on demand during cross-browser or performance testing.

---

## Responsive & Mobile Testing

### Critical Viewport Sizes
| Viewport | Device | Width |
|----------|--------|-------|
| Mobile Small | iPhone SE | 320px |
| Mobile Medium | iPhone 13 | 375px |
| Mobile Large | iPhone 14 Pro Max | 428px |
| Tablet Portrait | iPad | 768px |
| Tablet Landscape | iPad Pro | 1024px |
| Desktop Small | — | 1280px |
| Desktop Large | — | 1920px |

### Flows to Test on Mobile
Catalog, Search, PDP, Add to Cart, Cart, Full Checkout (CRITICAL), Payment, Order Confirmation, Account Login, Account Dashboard

### Mobile-Specific Checks
- No horizontal scrolling (unless intentional carousel)
- Text readable without zoom (min 16px)
- Touch targets min 44x44px
- Forms usable with mobile keyboard
- Navigation accessible (hamburger menu)
- Images scale appropriately
- Modals/overlays work on mobile
- Sticky headers/footers correct
- No zoom on input focus

### Mobile Performance
- Pages load < 5s on 3G
- Images optimized (responsive)
- No unnecessary assets on mobile
- Smooth scrolling (60fps)

### Gestures
- Swipe image galleries
- Pull to refresh (if implemented)
- Pinch to zoom on product images
- Tap to close modals

---

## Cross-Browser Testing

### Browser Compatibility Matrix

**Desktop (last 2 versions):**
| Browser | Engine | Priority | MCP Server |
|---------|--------|----------|------------|
| Chrome | Chromium | PRIMARY | playwright-chrome |
| Edge | Chromium | HIGH | playwright-edge |
| Safari/WebKit | WebKit | CRITICAL | playwright-webkit |
| Firefox | Gecko | HIGH | playwright-firefox |

**Mobile:**
| Device | Browser | Priority |
|--------|---------|----------|
| iPhone 16/17/18 | Safari iOS | CRITICAL |
| iPhone (older) | Safari iOS | HIGH |
| Android (last 3) | Chrome | HIGH |

### Cross-Browser Execution Strategy

1. **Primary (Chrome):** Full suite, establish baseline, capture screenshots
2. **Critical Path (All Browsers):** Homepage, nav, search, PDP, add to cart, checkout (CRITICAL), payment, confirmation
3. **Visual Regression (All):** Compare screenshots, check layout shifts, fonts, icons, breakpoints

### Per-Browser Checklist
```
- Homepage loads < 3s
- Navigation works (desktop + mobile hamburger)
- Search and autocomplete works
- Filters and sorting work
- Add to cart works
- Cart persistence works
- Checkout flow end-to-end
- Payment form accepts input
- Form validation displays properly
- No console errors
- CSS renders correctly (flexbox, grid, animations)
- JavaScript without errors
- Touch interactions (mobile)
- Scroll behavior correct
```

### Known Browser-Specific Issues

**Safari/WebKit:** Date input handling, flexbox gap (older), position:sticky in modals, backdrop-filter, form auto-zoom on focus

**iOS Safari (CRITICAL):** position:fixed with keyboard, 100vh includes address bar, momentum scrolling in overflow, safe area insets, web audio autoplay

**Firefox:** Grid subgrid support, scrollbar styling, animation timing, form input appearance

**Edge:** Generally compatible (Chromium), PWA differences, legacy Edge (if supporting)

### Parallel Cross-Browser Testing
Run simultaneously using different MCP servers:
- Session 1: playwright-chrome
- Session 2: playwright-firefox
- Session 3: playwright-webkit (not on Windows)
- Session 4: playwright-edge

### BrowserStack (Real Devices)
Use `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY` for actual iPhone/Android testing beyond WebKit emulation.

---

## Performance Testing (TC_PERFORMANCE_001)

### Core Web Vitals Targets
| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| FCP | < 1.5s | 1.5-3s | > 3s |
| LCP | < 2.5s | 2.5-4s | > 4s |
| TTI | < 3.5s | 3.5-7.3s | > 7.3s |
| CLS | < 0.1 | 0.1-0.25 | > 0.25 |
| FID | < 100ms | 100-300ms | > 300ms |

### Lighthouse Audit Targets
- Performance > 90
- Accessibility > 90
- Best Practices > 90
- SEO > 90

### Page-Specific Performance
1. **Homepage:** < 3s, hero optimized, no render-blocking
2. **Product Listing:** Progressive render, lazy images, instant filters (< 300ms)
3. **Product Detail:** Main image priority, gallery lazy-loads, reviews async
4. **Checkout:** Each step < 1s, validation < 300ms, no unnecessary API calls

### Network Analysis
- Total weight < 2MB initial
- Total requests < 50 initial
- No failed requests
- API responses < 500ms
- Modern image formats (WebP, AVIF)
- CSS/JS minified and compressed
- CDN for static assets

### Performance Budget
Set limits for: total page weight, request count, largest image, total JS size, total CSS size
