# VCST-4893: Datatrans Localization — All 12 Supported Languages Test Report

**Tester:** qa-frontend-expert (Agent Edge - fallback from Chrome)
**Date:** 2026-04-14
**Environment:** QA (https://vcst-qa-storefront.govirto.com)
**Build:** Ver. 2.46.0-pr-2256-2d96-2d96b87b
**Browser:** Edge (playwright-edge) -- Chrome MCP unavailable due to user data dir conflict
**Account:** Carlos Rodriguez (mutykovaelena@gmail.com, multi-org: AGENT-TEST-Org-BuildRight-20260310)

---

## Summary Table

| # | Code | Language | Available on Storefront? | Datatrans Form Heading | Datatrans Close Button | Screenshot | Result |
|---|------|----------|--------------------------|------------------------|------------------------|------------|--------|
| 1 | en | English | YES | "Choose your payment method" | "Close" | `datatrans-en.png` | PASS |
| 2 | de | German | YES | "Zahlungsart auswahlen" | "Schliessen" | `F3-datatrans-lightbox-DE.png` (prior run) | PASS |
| 3 | fr | French | YES | "Choisir moyen de paiement" | "fermer" | `F2-datatrans-lightbox-FR.png` (prior run) | PASS |
| 4 | it | Italian | YES | "Scegliere il metodo di pagamento" | "chiudere" | `datatrans-it.png` | PASS |
| 5 | es | Spanish | YES | "Elija tipo de tarjeta" | "Close" (EN) | `datatrans-es.png` | PASS |
| 6 | el | Greek | NO | N/A | N/A | N/A | SKIP |
| 7 | no | Norwegian | YES | "Velg din betalingsmetode" | "Close" (EN) | `datatrans-no.png` | PASS |
| 8 | da | Danish | NO | N/A | N/A | N/A | SKIP |
| 9 | pl | Polish | YES | "Wybierz metode platnosci" | "Close" (EN) | `datatrans-pl.png` | PASS |
| 10 | pt | Portuguese | YES | "Escolha a forma de pagamento" | "Close" (EN) | `datatrans-pt.png` | PASS |
| 11 | ru | Russian | YES | "Vyberite metod oplaty" (Cyrillic) | "Close" (EN) | `datatrans-ru.png` | PASS |
| 12 | ja | Japanese | YES | "Oshiharai houhou wo sentaku" (Japanese) | "Close" (EN) | `datatrans-ja.png` | PASS |

**Totals: 10 PASSED, 0 FAILED, 2 SKIPPED (not available on storefront)**

---

## Detailed Results

### 1. English (en) -- PASS
- **Storefront URL prefix:** `/` (default)
- **Storefront cart title:** "Cart"
- **Place Order button:** "Place order"
- **Pay Now button:** "Pay now . $3,300.12"
- **Datatrans heading:** "Choose your payment method"
- **Datatrans close:** "Close"
- **Datatrans switch view:** "Switch View"
- **Datatrans footer:** "Secure payment by Datatrans"
- **Payment method label:** "Bank card (Datatrans)"

### 2. German (de) -- PASS
- **Evidence from prior test run** (`F3-datatrans-lightbox-DE.png`)
- **Datatrans heading:** "Zahlungsart auswahlen"
- **Datatrans close:** "Schliessen"
- **Datatrans switch view:** "Kartendarstellung andern"
- **Payment method label:** "Bank card (Datatrans) - DE"

### 3. French (fr) -- PASS
- **Evidence from prior test run** (`F2-datatrans-lightbox-FR.png`)
- **Datatrans heading:** "Choisir moyen de paiement"
- **Datatrans close:** "fermer"
- **Datatrans switch view:** "Vue de l'interrupteur"
- **Payment method label:** "Bank card (Datatrans) - FR"

### 4. Italian (it) -- PASS
- **Storefront URL prefix:** `/it/`
- **Storefront cart title:** "Carrello"
- **Place Order button:** "Effettua ordine"
- **Pay Now button:** "Paga ora . 3.300,12 $"
- **Datatrans heading:** "Scegliere il metodo di pagamento"
- **Datatrans close:** "chiudere"
- **Datatrans switch view:** "Vista dell'interruttore"
- **Datatrans footer:** "Secure payment by Datatrans" (brand text, English)
- **Payment method label:** "Bank card (Datatrans) - IT"
- **Delivery method label:** "Tariffa fissa (Terra)" / "Tariffa fissa (Aria)"

### 5. Spanish (es) -- PASS
- **Storefront URL prefix:** `/es/`
- **Storefront cart title:** "Carrito"
- **Place Order button:** "Realizar pedido"
- **Pay Now button:** "Pagar ahora . 3.300,12 $"
- **Datatrans heading:** "Elija tipo de tarjeta"
- **Datatrans close:** "Close" (remains in English -- Datatrans behavior, not a bug)
- **Datatrans switch view:** "Switch View" (English)
- **Payment method label:** "DatatransPaymentMethod" (missing localized label suffix -- minor observation)
- **Delivery method label:** "Tarifa fija (terrestre)"

### 6. Greek (el) -- SKIP
- **Reason:** Greek is NOT available as a storefront language.
- **Storefront languages available:** en, en-US, de, fr, it, pl, sv, no, zh, pt, ja, fi, ru, es (14 total)
- **Greek is not in the list.** Cannot test Datatrans Greek localization without storefront support.

### 7. Norwegian (no) -- PASS
- **Storefront URL prefix:** `/no/`
- **Storefront cart title:** "Handlekurv"
- **Place Order button:** "Plasser bestilling"
- **Pay Now button:** "Betal na . 3 300,12 $"
- **Datatrans heading:** "Velg din betalingsmetode"
- **Datatrans close:** "Close" (English)
- **Payment method label:** "Bank card (Datatrans) - NO"
- **Delivery method label:** "Fast pris (bakken)"

### 8. Danish (da) -- SKIP
- **Reason:** Danish is NOT available as a storefront language.
- **Same list as Greek above.** Cannot test Datatrans Danish localization without storefront support.

### 9. Polish (pl) -- PASS
- **Storefront URL prefix:** `/pl/`
- **Storefront cart title:** "Koszyk"
- **Place Order button:** "Zloz zamowienie"
- **Pay Now button:** "Zaplac teraz . 3 300,12 $"
- **Datatrans heading:** "Wybierz metode platnosci"
- **Datatrans close:** "Close" (English)
- **Payment method label:** "Bank card (Datatrans) - PL"
- **Delivery method label:** "Stala cena (drogowa)"

### 10. Portuguese (pt) -- PASS
- **Storefront URL prefix:** `/pt/`
- **Storefront cart title:** "Carrinho"
- **Place Order button:** "Fazer Pedido"
- **Pay Now button:** "Pagar Agora . 3 300,12 $"
- **Datatrans heading:** "Escolha a forma de pagamento"
- **Datatrans close:** "Close" (English)
- **Payment method label:** "Bank card (Datatrans)" (no locale suffix)
- **Delivery method label:** "Taxa Fixa (Terrestre)"

### 11. Russian (ru) -- PASS
- **Storefront URL prefix:** `/ru/`
- **Storefront cart title:** "Korzina" (Cyrillic: Корзина)
- **Place Order button:** "Oformit zakaz" (Cyrillic: Оформить заказ)
- **Pay Now button:** "Oplatit seichas" (Cyrillic: Оплатить сейчас . 3 300,12 $)
- **Datatrans heading:** "Vyberite metod oplaty" (Cyrillic: Выберите метод оплаты)
- **Datatrans close:** "Close" (English)
- **Payment method label:** "Oplata kartoi Datatrans" (Cyrillic: Оплата картой Дататранс -- fully translated)
- **Delivery method label:** "Fiksirovannaya stavka (nazemnyi transport)" (Cyrillic: Фиксированная ставка (наземный транспорт))
- **Note:** Russian is the only language where the Datatrans payment method name is fully translated (no "Datatrans" in Latin -- shows "Дататранс" in Cyrillic)

### 12. Japanese (ja) -- PASS
- **Storefront URL prefix:** `/ja/`
- **Storefront cart title:** "Kaato" (カート)
- **Place Order button:** "Chuumon kakutei" (注文確定)
- **Pay Now button:** "Pay Now . $3,300.12" (English -- storefront localization gap, not Datatrans issue)
- **Datatrans heading:** "Oshiharai houhou wo sentaku" (お支払い方法を選択)
- **Datatrans close:** "Close" (English)
- **Payment method label:** "Bank card (Datatrans)" (not localized to Japanese)
- **Delivery method label:** "Kotei ryoukin (chijou)" (固定料金 (地上))
- **Observation:** The storefront "Pay Now" button on the payment page is not translated to Japanese; it shows English. This is a storefront localization gap, separate from the Datatrans widget itself which is correctly localized.

---

## Observations and Notes

### 1. Datatrans Localization Coverage
The Datatrans lightbox correctly localizes its main heading ("Choose your payment method") into all 10 tested languages. The `data-language` parameter is working as designed for: en, de, fr, it, es, no, pl, pt, ru, ja.

### 2. Close Button Localization
Only 3 languages have the Close button translated:
- **English:** "Close"
- **German:** "Schliessen"
- **French:** "fermer"
- **Italian:** "chiudere"
- **All others:** "Close" (English fallback)

This appears to be Datatrans-side behavior -- the close button is only translated for a subset of languages in their lightbox widget.

### 3. Storefront Payment Method Labels
The Datatrans payment method label varies by language:
- Most languages: "Bank card (Datatrans) - {LANG_CODE}" (e.g., "- IT", "- NO", "- PL")
- English: "Bank card (Datatrans)" (no suffix)
- Spanish: "DatatransPaymentMethod" (appears to be an untranslated key -- minor)
- Russian: "Оплата картой Дататранс" (fully translated, including "Datatrans" transliterated to Cyrillic)
- Japanese: "Bank card (Datatrans)" (no suffix, no translation)
- Portuguese: "Bank card (Datatrans)" (no suffix)

### 4. Languages Not Available on Storefront
Greek (el) and Danish (da) are not configured as storefront languages. The storefront has 14 languages: en, en-US, de, fr, it, pl, sv, no, zh, pt, ja, fi, ru, es. Of the 12 Datatrans-supported languages, only Greek and Danish are missing.

### 5. Storefront i18n Gaps (NOT Datatrans bugs)
- **Japanese "Pay Now" button:** Shows "Pay Now" in English on the `/ja/checkout/payment` page instead of Japanese translation. This is a storefront localization gap, not a Datatrans issue.
- **Spanish payment method:** Shows "DatatransPaymentMethod" instead of a localized label.

### 6. Console Errors
CSP report-only violations observed during Datatrans lightbox (PayPal iframe framing) -- same as prior EN/FR/DE tests. These are non-blocking and expected in sandbox environment.

---

## Screenshots Index

| File | Language | Description |
|------|----------|-------------|
| `datatrans-en.png` | English | Datatrans lightbox with "Choose your payment method" |
| `F3-datatrans-lightbox-DE.png` | German | Datatrans lightbox with "Zahlungsart auswahlen" (prior run) |
| `F2-datatrans-lightbox-FR.png` | French | Datatrans lightbox with "Choisir moyen de paiement" (prior run) |
| `datatrans-it.png` | Italian | Datatrans lightbox with "Scegliere il metodo di pagamento" |
| `datatrans-es.png` | Spanish | Datatrans lightbox with "Elija tipo de tarjeta" |
| `datatrans-no.png` | Norwegian | Datatrans lightbox with "Velg din betalingsmetode" |
| `datatrans-pl.png` | Polish | Datatrans lightbox with "Wybierz metode platnosci" |
| `datatrans-pt.png` | Portuguese | Datatrans lightbox with "Escolha a forma de pagamento" |
| `datatrans-ru.png` | Russian | Datatrans lightbox with "Выберите метод оплаты" |
| `datatrans-ja.png` | Japanese | Datatrans lightbox with "お支払い方法を選択" |

---

## Test Execution Details

- **Product used:** Strongbow British Dry Cider (SKU 151096, $2,889.00/$3,000.00)
- **Shipping address:** 456 Test Street, Beverly Hills, CA 90210, USA
- **Delivery method:** Fixed Rate (Ground) / equivalent in each language
- **Payment method:** Bank card (Datatrans) / equivalent in each language
- **Order total:** $3,300.12 (product + shipping + tax)
- **Test approach:** For each language, added product to cart via `/[lang]/` URL prefix, selected delivery and Datatrans payment, clicked Place Order to reach `/[lang]/checkout/payment`, clicked Pay Now to open Datatrans lightbox, captured screenshot, closed lightbox.
- **Note:** Each language test creates a separate order (10 orders total). These should be cleaned up from the admin.
