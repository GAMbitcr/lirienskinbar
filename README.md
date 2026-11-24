# Lirien Skin Bar · Plataforma digital

Kiosko de skincare coreano y maquillaje multimarca en Santa Ana Town Center (Costa Rica).

| Carpeta | Qué es |
|---|---|
| `apps/inventario/apps-script/` | Backend de la app de inventario: API en Google Apps Script sobre Google Sheets (la base de datos) |
| `apps/inventario/web/` | App web (Vite + Preact + TypeScript). Se publica como Worker de Cloudflare de solo archivos estáticos |
| `brand/` | Logo vectorizado y `tokens.css` (colores y tipografía) |
| `data/` | Fotos del catálogo con fecha, solo lectura |

- **Para instalarla y publicarla:** [`PUESTA-EN-MARCHA.md`](PUESTA-EN-MARCHA.md)
- **Reglas para trabajar en el repo:** [`CLAUDE.md`](CLAUDE.md)
- Contexto del negocio (`LIRIEN.md`) y plan (`PLAN.md`): en los docs del proyecto de Claude.

La app de inventario es un puente temporal: se retira cuando Shopify POS esté operando en el kiosko.
