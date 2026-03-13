# EP — Configurable Section Inputs

Each configurable section type has distinct input domains. EP identifies the partitions for each.

## Text Section (CFG-006: Base product EN — Custom1, Custom2, Custom3)

| Partition | Class | Representative | Expected | BL Ref |
|-----------|-------|----------------|----------|--------|
| Valid custom text | Valid | "Happy Birthday John" | Accepted, shown in config summary | — |
| Empty text (required section) | Invalid | "" | Blocked — "This field is required" | — |
| Empty text (optional section) | Valid | "" / select "None" | Accepted, section skipped | — |
| Max-length text | Edge | 256-char string | Accepted or truncated gracefully | — |
| Special characters | Edge | `<script>alert(1)</script>` | Sanitized, no XSS | BL-SEC |
| Unicode / emoji | Edge | "Подарок 🎁" | Displayed correctly in cart + order | — |
| Predefined value selected | Valid | Select from dropdown list | Value stored exactly as predefined | — |

## File Section (CFG-004 optional, CFG-005 required)

| Partition | Class | Representative | Expected | BL Ref |
|-----------|-------|----------------|----------|--------|
| Valid image (PNG) | Valid | logo.png (500KB) | Uploaded, preview shown | — |
| Valid PDF | Valid | design.pdf (2MB) | Uploaded, filename shown | — |
| No file (required section) | Invalid | Skip upload | Blocked — "File is required" | — |
| No file (optional section) | Valid | Select "None" | Accepted, section skipped | — |
| Oversized file | Invalid | 50MB image | Rejected with size limit error | — |
| Invalid MIME type | Invalid | malware.exe | Rejected — unsupported file type | BL-SEC |
| Zero-byte file | Edge | empty.png (0 bytes) | Rejected or accepted with warning | — |
| Long filename | Edge | 255-char-filename.png | Truncated in display, upload succeeds | — |

## Product Section (CFG-001: Configurable Hat, CFG-010: Test Bike)

| Partition | Class | Representative | Expected | BL Ref |
|-----------|-------|----------------|----------|--------|
| Select required option | Valid | Pick "Engine Upgrade" from radio | Price updated, option shown in summary | BL-PRICE-001 |
| No selection (required) | Invalid | Skip selection | Blocked — "Select an option" | — |
| Select "None" (optional) | Valid | Pick "None" for Engine Upgrade | Base price only, no add-on | — |
| Select out-of-stock option | Invalid | Option with stock=0 | Option disabled/greyed, cannot select | BL-CART-002 |

## Variation Section (CFG-009: Bike with options)

| Partition | Class | Representative | Expected | BL Ref |
|-----------|-------|----------------|----------|--------|
| Select valid variation | Valid | BIKE-RED-M | Variation price applied, properties shown | — |
| Select alternate variation | Valid | BIKE-BLUE-L | Different price/properties | — |
| No selection (required) | Invalid | Skip | Blocked — must select variant | — |
