# Ozon Express — Fix “credentials missing”

The admin panel calls your **Google Apps Script** URL. Ozon keys must be stored **inside that Apps Script project** (not in GitHub).

## Option A — Script properties (recommended)

1. Open your **Google Sheet** (orders) → **Extensions → Apps Script**.
2. Confirm the code matches `google-apps-script/all-orders.gs` from this repo → **Save**.
3. Click **Project Settings** (gear on the left).
4. Under **Script properties** → **Add script property**:

| Property | Value |
|----------|--------|
| `OZON_CLIENT_ID` | Your Ozon client ID (e.g. `85582`) |
| `OZON_API_KEY` | Your API key from Ozon → Compte → Generate API key |

5. **Save** script properties.
6. **Deploy → Manage deployments** → open your Web app → **Edit** → **New version** → **Deploy** (same URL is fine).
7. In the admin, click **اختبار API** again.

## Option B — Run a function once

1. In Apps Script, open `all-orders.gs`.
2. Find `saveOzonCredentialsNow` and set:

```javascript
var CLIENT_ID = '85582';
var API_KEY = 'paste-your-api-key-here';
```

3. In the toolbar, select **saveOzonCredentialsNow** → **Run** → authorize if asked.
4. Check **Execution log**: should say credentials saved.
5. **Clear** `CLIENT_ID` and `API_KEY` back to `''` and **Save** the file.
6. Redeploy the web app (step 6 in Option A).

## Verify

Open in the browser (replace with your `/exec` URL):

`https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=ozon_test`

You should see JSON like:

`{"status":"ok","message":"Ozon API reachable. Client ID 85582. Cities: ..."}`

## Stock vs ramassage

- **راماساج** (`parcel-stock = 0`) — default. You pack and hand the parcel to Ozon. No `products` field.
- **مخزون Ozon** (`parcel-stock = 1`) — only if you use Ozon warehouse stock. Requires `products` with SKUs from your Ozon account.

If you see *"Products data required for stock parcels"*, choose **راماساج** in the admin form.

## Ozon page (admin)

The admin **Ozon Express** view lists orders with `ozonTracking` or `ozonPushedAt`. Use **تحديث** or **تحديث حالات Ozon** to sync status via `?action=ozon_parcel_status&tracking=...`.

**If refresh shows a JSON error or “Prumysl orders endpoint OK”:** your live deployment is missing this action. Paste the latest `all-orders.gs`, then **Deploy → Manage deployments → Edit → New version → Deploy** (same `/exec` URL).

Test in the browser (replace `YOUR_TRACKING`):

`https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=ozon_parcel_status&tracking=YOUR_TRACKING`

You should see JSON like `{"status":"ok",...}` or `{"status":"error","message":"..."}` — not plain text `Prumysl orders endpoint OK`.

## Still failing?

- Credentials are stored **per Apps Script project**. A **new** deployment URL on a **new** project needs properties set again.
- After changing properties, **deploy a new version** of the web app.
- Do not put the API key in `admin-app.js` or GitHub.
