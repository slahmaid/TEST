# MMPM300 Bundle Landing Page — Design Spec

**Date:** 2026-07-14  
**Status:** Approved for implementation planning  
**URL:** `https://prumysl.cc/MMPM300/`

## Goal

Create a dedicated conversion landing page for a fixed bundle:

| Included | Unit price |
|----------|------------|
| كاميرا موكا الذكية (`MOKA-4G-DUAL`) | 599 Dh |
| بروجيكتور شمسي 300W (`PROJECTOR-300W`) | 699 Dh |
| **Separate total** | **1298 Dh** |
| **Bundle price** | **1249.00 Dh** |

Customers order the full package in one submission (cash on delivery), same theme/template as existing Prumysl product landings.

## Approach

**Approach 1 — Full conversion landing** (approved): clone the Moka landing structure (hero → order → content → retarget → thank-you), with a clear “what’s included” block for both products.

## URL & files

| Item | Value |
|------|--------|
| Public path | `/MMPM300/` |
| Folder | `MMPM300/` |
| Thank-you | `/MMPM300/thank-you/` |
| Redirects | Add clean-URL rules in `_redirects` for landing + thank-you |

```
MMPM300/
  index.html
  thank-you/index.html
  css/          # cloned from moka (style, brand, desktop-landing)
  js/           # order-conversion + load-orders-backend stack (like moka)
  images/       # optional; prefer reusing ../moka and ../projectors assets
```

**Out of scope (v1):** linking from homepage product grid (can add later).

## Page sections (landing)

1. Top bar + header (logo, call / WhatsApp) — match site theme  
2. Hero — Moka + 300W projector visuals  
3. **Primary order form** `#order` — ~~1298~~ → **1249 درهم**, name / city / phone, COD CTA, urgency style like landings  
4. What’s included — two cards (Moka specs + 300W projector specs)  
5. Features — security monitoring + outdoor solar lighting together  
6. Gallery — mix of moka + projector images  
7. FAQ — delivery, COD, package contents, Moka SIM/4G, projector solar install  
8. **Retarget order form** — same fixed bundle @ 1249  
9. Footer + WhatsApp float  

## Order payload

| Field | Value |
|-------|--------|
| Sheet / Firebase `product` | `باقة موكا + بروجيكتور 300W` |
| SKU (`product_sku`) | `BUNDLE-MOKA-300W` |
| `product_name` | `Moka + Projector 300W Bundle` |
| `landing_page` | `MMPM300` |
| `quantity` | `1` |
| `price` | `1249` |
| Pending source key | `mmpm300` |

- Use same Google Sheet endpoint and Firebase path as existing landings (`submitOrderToSheet` / `submitOrderToFirebase`).  
- Morocco phone validation via `PrumyslPhone`.  
- Redirect after submit (~450ms):  

`thank-you/?ordered=1&name={name}&product=bundle&quantity=1&price=1249`

## Thank-you page

- Dedicated page under `MMPM300/thank-you/`.  
- Success card + order summary (bundle name + 1249 Dh).  
- WhatsApp / call CTAs; optional shared `thank-you-recommendations` block.  
- Meta **Purchase** event with `value: 1249`, `currency: MAD`, content id `BUNDLE-MOKA-300W`, gated by `prumyslSetOrderPending('mmpm300')` + `?ordered=1` (same one-time confirmation pattern as other products).

## Tracking (Meta Pixel)

Same Meta Pixel ID as landings (`740114099139411`):

| Event | When | Value / IDs |
|-------|------|-------------|
| PageView | Load | — |
| ViewContent | Load | `BUNDLE-MOKA-300W`, 1249 |
| AddToCart + InitiateCheckout | First focus on name/city/phone (once per form) | 1249 |
| Purchase | Thank-you confirmed | 1249 |

TikTok pixel may follow the same landing pattern as Moka if present on the cloned template; Purchase confirmation remains Meta-first as required.

## Price presentation

- Always show strike-through **1298 درهم** next to highlighted **1249 درهم** (red animated pill style used on site).  
- Fixed quantity (no model picker, no qty stepper).

## Assets

**Reuse (no need to re-upload unless missing):**

- Moka: `../moka/images/Moka-hero.jpeg`, `../images/Home-Moka.jpeg`, feature/gallery under `moka/images/`  
- Projector: `../projectors/images/300W.webp`, plus holding/remote as needed for gallery/features  

## Errors & edge cases

- Invalid phone → alert + stay on form; do not redirect.  
- Backend not ready → still set pending + redirect after delay (same as landings; sheet uses `keepalive`/`no-cors`).  
- Reduced motion → disable price pulse animation.  
- Duplicate Purchase → prevented by pending consume + thank-you done key.

## Success criteria

- Live at `prumysl.cc/MMPM300/` with site theme and full landing sections.  
- Orders appear in the shared sheet/admin with clear bundle product label and price 1249.  
- Thank-you fires Purchase once at 1249 for confirmed orders.  
- Main + retarget forms both submit the same bundle offer.

## Non-goals

- Selling Moka or 300W separately from this page.  
- Changing prices on existing Moka or Projectors pages.  
- New Ads Manager catalog setup (content id is enough for events).
