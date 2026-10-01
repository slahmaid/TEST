# Crimping pliers — implementation plan

**Date:** 2026-09-07  
**Spec:** `docs/superpowers/specs/2026-09-07-PE-design.md`

## Files

- Create `PE/` from `moka/` template (CSS/JS structure)
- `PE/index.html` — product copy, 269/299, noindex, placeholders
- `PE/thank-you/index.html` — product-specific thank-you
- `PE/js/orders-sheet.js` — dedicated `ORDERS_SCRIPT_URL`
- `google-apps-script/PE-orders.gs` — orders-only script (reference)
- Do **not** edit `index.html` catalog or `js/thank-you-recommendations.js`

## Tasks

1. Scaffold folder + placeholder images  
2. Wire sheet URL + product source label  
3. Replace landing copy/prices/SKU/pixels  
4. Update thank-you page  
5. Verify unlisted + smoke-check form fields  

## Verify

- Grep repo: no `PE` href from homepage/recommendations  
- `orders-sheet.js` URL matches the dedicated `/exec`  
- Page meta has `noindex`
