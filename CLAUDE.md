# Instrucciones del proyecto · Lirien Skin Bar

Construimos la plataforma digital de **Lirien Skin Bar**, un kiosko de skincare coreano y maquillaje multimarca en Santa Ana Town Center, Costa Rica.
**Antes de cualquier tarea, leé `LIRIEN.md` (contexto, marca, voz, paleta, logo) y `PLAN.md` (arquitectura, modelo de datos, fases)** en los docs del proyecto.

## Rumbo
- **Shopify es la base de datos final:** tienda en línea con theme propio, Shopify POS en el kiosko e inventario único.
- **Fase actual: app de inventario puente.** Google Sheets (datos) + API en Apps Script + frontend Vite/Preact/TS publicado como Worker de Cloudflare de solo estáticos. Es **temporal**: se retira cuando el POS de Shopify esté operando. Se construye lo mínimo.
- **El código vive en GitHub** (`GAMbitcr/lirienskinbar`). Cloudflare publica desde `main` (root `apps/inventario/web`).
- Lo que sí tiene que quedar impecable es el **catálogo** (SKU, código de barras, tamaño, tono, precio), porque se exporta a Shopify.

## Idioma y tono
- Hablamos con Gabriel en **español**.
- Código, identificadores, columnas del Sheet y commits en **inglés** (`snake_case` en columnas, `camelCase` en JS/TS).
- UI y contenido en **español de Costa Rica con voseo** ("Escaneá", "Guardá", "Agregá a la venta"). Nunca tuteo.

## Reglas de datos (no negociables)
1. **Nunca escribir en el Sheet de producción** durante el desarrollo. Se trabaja contra la API local (`npm run serve`, hojas en memoria) o un Sheet `DEV`.
2. **`movements` es append-only.** El stock se deriva de los movimientos. Una venta errónea se corrige con `VOID`; una diferencia de inventario (incluida la importación de Excel) con `COUNT`. Nunca se borra ni se edita.
3. **Stock total por variante.** La urna (`display_location`) es solo un dato de ubicación.
4. **Roles:** `admin` (dueños) puede todo; `staff` solo consulta y registra ventas. Los permisos se validan **en la API**, no solo en la UI.
5. Toda escritura va dentro de `LockService` (`withLock`) y lleva un `clientId` (UUID) para que un reintento no duplique.
6. El **SKU interno** (`LIR-00001`) es la clave y nunca cambia.
7. Variantes: `MINI/GRANDE` = **Tamaño** · tonos = **Tono** · `INDIVIDUAL/CAJA` = **Presentación**. `CON/SIN CAJA` **no** es variante (se unifica).
8. Campos de `products`/`variants` compatibles con el **CSV de Shopify**.
9. Precios como **enteros en CRC**, mostrados como `₡12.900` con `crc()`. No usar `Intl` `es-CR` (pone espacio).
10. Zona horaria `America/Costa_Rica`; timestamps ISO 8601 con offset `-06:00`.

## Acceso
- **PIN de 6 dígitos** que crea cada persona. Un admin (o los dueños desde el menú del Sheet) genera un **código de activación** de 8 dígitos, de un solo uso y con vencimiento a 72 h.
- PIN y código se guardan con hash (sal por persona + pimienta en Script Properties). Nunca en claro, nunca en logs.
- 5 intentos fallidos bloquean 15 min; freno general contra intentos masivos; sesiones de 12 h guardadas como hash.

## Apps Script (`apps/inventario/apps-script`)
- JavaScript plano (V8), **sin `??` ni `?.`** (hay una prueba que lo verifica).
- Todo llega por **POST** con `Content-Type: text/plain` y cuerpo JSON `{ action, token, ... }`. Respuestas `{ ok, data }` o `{ ok:false, error:{ code, message, details } }`.
- Productos: `product.upsert` y `product.archive`. **Nunca se borran** productos ni variantes.
- Importación: `import.preview` (no escribe) e `import.apply`. Empareja por SKU o por `legacy_name`.
- Misma URL `/exec`: actualizar con **Gestionar implementaciones → Nueva versión**.
- El Sheet y el proyecto de Apps Script pertenecen a la **cuenta de Google del negocio**.

## Frontend (`apps/inventario/web`)
- Mobile-first (celular del kiosko), accesible (AA mínimo, objetivos táctiles ≥ 44 px).
- Colores y tipografía **solo** desde `brand/tokens.css`. Un solo botón de color (Vino). Rubor, Polen y Travertino van en fondos, categorías y estados, como en el mockup del sitio.
- El **lirio de tres pétalos** (`<Lily />`) es la viñeta y el detalle decorativo.
- Logo: los SVG de `brand/logo/` (heredan `color`). No redibujar ni deformar.
- Escaneo: `BarcodeDetector` + respaldo ZXing (iPhone). La cámara exige HTTPS.

## Comandos
```bash
cd apps/inventario/apps-script
npm test          # pruebas del backend con hojas simuladas (correr antes de cada cambio)
npm run serve     # API local que imita /exec · Karol y Fiorella con PIN 246813
npm run bundle    # dist/Lirien.gs para pegar en el editor de Apps Script
npm run seed      # regenera src/96_SeedData.js desde data/

cd apps/inventario/web
npm run dev       # http://localhost:5173 contra la API local (.env.local)
npm run build     # tsc + vite build
npm run deploy    # build + wrangler deploy (requiere VITE_API_URL en .env.production.local)
```
Puesta en marcha completa: `PUESTA-EN-MARCHA.md`.

## Al terminar una tarea
Marcar el hito en `PLAN.md §2.13` y, si cambió algo del negocio, actualizar `LIRIEN.md`.
