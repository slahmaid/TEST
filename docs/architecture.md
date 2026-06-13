# Prumysl site architecture

**tldraw:** Open the tldraw panel in Cursor, then run `docs/tldraw-architecture.js` via the tldraw **exec** MCP tool (canvas must be visible — otherwise exec times out).

**SVG fallback:** See [architecture.svg](./architecture.svg).

```mermaid
flowchart TB
    Hub[index.html — prumysl.cc hub]
    Moka[moka/ landing]
    ProMax[moka-pro-max/ landing]
    Saqr[saqr/ landing]
    Proj[projectors/ landing]
    Firebase[orders-firebase.js]
    Sheets[orders-sheet.js]
    GAS[google-apps-script/]
    Admin[admin/ dashboard]

    Hub --> Moka
    Hub --> ProMax
    Hub --> Saqr
    Hub --> Proj
    Moka --> Firebase
    Moka --> Sheets
    ProMax --> Sheets
    Saqr --> Sheets
    Proj --> Sheets
    Sheets --> GAS
    Sheets --> Admin
```

Product landings share `css/brand.css`, `js/scroll-reveal.js`, and order backends configured per product.
