# Crimping pliers product page — design

**Date:** 2026-09-07  
**Status:** Approved — implement

## Goal

Unlisted COD landing for **بانس** (crimping pliers), same Prumysl product template as existing landings, reachable only by direct URL.

## Decisions

| Item | Choice |
|------|--------|
| Path | `/PE/` (+ `/PE/thank-you/`) |
| Visibility | Not linked from homepage, nav, footer, or thank-you recommendations |
| SEO | `robots: noindex, nofollow` |
| Price | 269 MAD sale; compare-at 299 MAD; free delivery + cash on delivery |
| Product name (AR) | بانس |
| Orders sheet | Dedicated Apps Script: `https://script.google.com/macros/s/AKfycbxipqw5BU47MnNPHIUqF4iM6D5D2pCYs_0yGcUpY_5zyCqe7M_m6LT7EShsn-zbmZo/exec` |
| Images | Placeholder paths under `PE/images/` until real assets arrive |
| Template | Clone of single-product landing (`moka`-style): top bar, hero, order form, features, reviews, FAQ, bottom order, thank-you |

## Out of scope

- Homepage / catalog listing
- Admin inventory SKU wiring (unless already automatic via sheet)
- Real product photography
- Separate Ads campaign toggles beyond existing pixel wiring

## Success criteria

1. `https://prumysl.cc/PE/` loads with Prumysl look-and-feel.
2. Order form posts to the dedicated sheet URL only.
3. Price shows 269 Dh with struck 299 Dh; free delivery messaging present.
4. No links to this URL from public site surfaces.
5. Page is `noindex`.
