# Crimping pliers — implementation plan

**Date:** 2026-09-07  
**Spec:** `docs/superpowers/specs/2026-09-07-crimping-pliers-design.md`

## Files

- Create `crimping-pliers/` from `moka/` template (CSS/JS structure)
- `crimping-pliers/index.html` — product copy, 269/299, noindex, placeholders
- `crimping-pliers/thank-you/index.html` — product-specific thank-you
- `crimping-pliers/js/orders-sheet.js` — dedicated `ORDERS_SCRIPT_URL`
- `google-apps-script/crimping-pliers-orders.gs` — orders-only script (reference)
- Do **not** edit `index.html` catalog or `js/thank-you-recommendations.js`

## Tasks

1. Scaffold folder + placeholder images  
2. Wire sheet URL + product source label  
3. Replace landing copy/prices/SKU/pixels  
4. Update thank-you page  
5. Verify unlisted + smoke-check form fields  

## Verify

- Grep repo: no `crimping-pliers` href from homepage/recommendations  
- `orders-sheet.js` URL matches the dedicated `/exec`  
- Page meta has `noindex`
