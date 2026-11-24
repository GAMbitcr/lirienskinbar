# Puesta en marcha · App de inventario Lirien

Guía para dejar la app funcionando de verdad. Son tres partes y toma unos 40 minutos.

```
Celular / tablet / compu ──HTTPS──▶ App (Worker de Cloudflare) ──▶ Apps Script (API) ──▶ Google Sheet "Lirien · Inventario"
```

- **Los datos viven en el Google Sheet** de la cuenta del negocio y se actualizan solo a través de Apps Script.
- **El Worker de Cloudflare solo sirve las pantallas.** No guarda datos.
- **El código está en GitHub** (`GAMbitcr/lirienskinbar`).

**Antes de empezar**
- La Parte A se hace con la **cuenta de Google del negocio** (la de Karol). El Sheet y el script le pertenecen a esa cuenta.
- Tené a mano el **Sheet del inventario actualizado** (se sube al final, en la Parte D).

---

## Parte A · Google Sheet + Apps Script (≈ 15 min)

1. **Crear el Sheet.** En Google Drive: Nuevo → Hojas de cálculo. Nombralo `Lirien · Inventario`.
2. **Pegar el código.** En el Sheet: **Extensiones → Apps Script**.
   - Borrá lo que tenga `Código.gs` y pegá el contenido completo de [`apps/inventario/apps-script/dist/Lirien.gs`](apps/inventario/apps-script/dist/Lirien.gs).
   - ⚙️ **Configuración del proyecto** → activá **"Mostrar el archivo de manifiesto appsscript.json"**. Volvé al editor, abrí `appsscript.json` y reemplazalo por el de [`apps/inventario/apps-script/src/appsscript.json`](apps/inventario/apps-script/src/appsscript.json).
   - Guardá (💾).
3. **Configurar las hojas.** Volvé al Sheet y recargá la página: aparece el menú **Lirien**. Usá **Lirien → 1. Configurar hojas**.
   - Google pide autorización. Como el script es propio, muestra **"Google no verificó esta app"**: tocá **Configuración avanzada → Ir a … (no seguro) → Permitir**. Solo da acceso a este Sheet.
4. **Cargar el catálogo.** **Lirien → 2. Cargar catálogo base (8 nov 2026)**. Trae los 518 productos ya ordenados (marca, nombre, variantes, urnas) con las existencias de ese día. En la Parte D se pone al día.
5. **Crear la primera persona.** **Lirien → 3. Agregar persona y generar código**. Escribí el nombre, indicá si es admin, y anotá el **código de activación de 8 dígitos** que aparece (se muestra una sola vez y vence en 72 horas).
6. **Publicar la API.** En Apps Script: **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
   - **Implementar** → copiá la **URL que termina en `/exec`**.
   - Para probar, abrila en el navegador: tiene que responder `{"ok":true,...}`.

> "Cualquier persona" es necesario para que la app pueda llamar a la API. La protección está adentro: sin PIN no se ve ni se cambia nada, cada persona se bloquea 15 minutos tras 5 intentos fallidos, hay un freno general contra intentos masivos y las sesiones duran 12 horas.

## Parte B · Publicar la app como Worker desde GitHub (≈ 10 min)

En el panel de Cloudflare, **dentro de la cuenta de Lirien**:

1. **Workers & Pages → Create → Import a repository** y elegí `GAMbitcr/lirienskinbar` (la primera vez pide conectar GitHub).
2. Configuración del proyecto:

   | Campo | Valor |
   |---|---|
   | Nombre del Worker | `lirien-inventario` (tiene que ser igual al `name` de `wrangler.jsonc`) |
   | Root directory | `apps/inventario/web` |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` |
   | Build variable | `VITE_API_URL` = la URL `/exec` de la Parte A |

3. **Deploy.** Al terminar muestra la dirección: `https://lirien-inventario.<subdominio>.workers.dev`. Cada `git push` a `main` vuelve a publicar solo.

**Alternativa desde la Terminal** (sin conectar GitHub):

```bash
cd apps/inventario/web
printf 'VITE_API_URL=https://script.google.com/macros/s/PEGAR_ID/exec\n' > .env.production.local   # no se versiona
npm install
npx wrangler login      # elegí la cuenta de Lirien
npm run deploy
```

Si la app abre con el aviso **"Falta configurar la app"**, falta `VITE_API_URL`: agregala y volvé a publicar.

## Parte C · Primer ingreso y personas

1. Abrí la dirección de la app. Aparece la persona creada en el paso A5 como **"Pendiente de activar"**.
2. Tocá su nombre, escribí el **código de activación** y creá el **PIN de 6 dígitos** (se pide dos veces). El PIN lo elige cada persona; nadie más lo ve.
3. Ya adentro, como admin: **Más → Personas y códigos de activación** para agregar al resto (Karol, José Pablo, Neisy como admin; Fiorella y las demás como colaboradoras). Cada una recibe su código y crea su propio PIN.
4. Si alguien olvida el PIN: **Restablecer PIN** genera un código nuevo. El PIN anterior deja de servir en el momento.
5. En el celular o tablet del kiosko: **Compartir → Agregar a pantalla de inicio** (iPhone) o **Instalar app** (Android).

| Rol | Puede |
|---|---|
| **Admin** (dueños) | Todo: ventas, entradas, ajustes y conteos, productos, personas, importar y exportar, anular ventas |
| **Colaboradora** | Buscar y escanear, registrar ventas, ver sus ventas del día, cambiar su PIN |

## Parte D · Poner el inventario al día

El catálogo base es del 8 de noviembre. Para actualizarlo hay dos caminos; los dos usan las mismas reglas:

- **Desde la app (cualquier admin):** **Más → Importar inventario**. Subí el Sheet actualizado descargado como Excel (**Archivo → Descargar → Microsoft Excel**) o un CSV. La app muestra qué cambiaría (precios, existencias, productos nuevos, lo que no viene en el archivo y los avisos) y **no aplica nada hasta que confirmés**.
- **Desde el Sheet (nosotros):** copiá la pestaña del inventario actualizado dentro de `Lirien · Inventario`, renombrala a **`legacy`** y usá **Lirien → Importar inventario desde la hoja "legacy"**.

Cómo empareja las filas: por **SKU** si el archivo lo trae (el que descarga la app), y si no por el **nombre tal como está en el Sheet de siempre**. Las diferencias de existencias quedan registradas como movimientos de **conteo**; nunca se borra ni se edita un movimiento. Los productos nuevos se crean con marca y nombre propuestos y quedan anotados en la hoja `review` para revisarlos.

Después conviene el **conteo de arranque** en el kiosko (urna por urna: escanear, asociar el código la primera vez y ajustar con **Ajustar → Conteo**) y fijar el **día de corte**: desde ese día el Sheet viejo queda solo de consulta.

---

## Cómo se actualiza

| Qué | Cómo |
|---|---|
| **La app** (pantallas, textos) | `git push` a `main` (Cloudflare publica solo) o `npm run deploy` |
| **El backend** (Apps Script) | `cd apps/inventario/apps-script && npm test && npm run bundle` → pegar `dist/Lirien.gs` en Apps Script → **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. Así la URL `/exec` **no cambia**. Una implementación nueva cambia la URL y hay que actualizar `VITE_API_URL` |
| **Productos, precios, urnas** | Desde la app (admins: **Nuevo producto** / **Editar**) o importando un Excel |
| **Stock** | Solo desde la app (ventas, Entró, Ajustar, importación). Si alguna vez no cuadra: **Lirien → Recalcular hoja de stock** |

## Qué queda en el Sheet

| Hoja | Qué tiene | ¿Se edita a mano? |
|---|---|---|
| `products` · `variants` | Catálogo (marca, nombre, categoría, variantes, precios, códigos, urnas) | Mejor desde la app. Si se edita, no mover columnas y usar **Lirien → Refrescar datos de la app** |
| `stock` | Existencias por SKU | No, la calcula la app |
| `movements` | Cada venta, entrada, ajuste y anulación, con quién y cuándo | **Nunca** |
| `sales` · `sale_payments` | Ventas y sus pagos (SINPE, tarjeta, efectivo con vuelto) | No |
| `users` | Personas, rol y estado. El PIN y el código están cifrados | Solo `name`, `role` y `active`; el PIN nunca |
| `review` · `log` | Pendientes de la migración e importaciones, y registro de errores y cambios | Solo lectura |

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| "Falta configurar la app" | Falta la variable `VITE_API_URL` en el build de Cloudflare |
| "Falta la hoja …" / "Las columnas … cambiaron de orden" | **Lirien → 1. Configurar hojas**. No mover columnas; las nuevas van a la derecha |
| "Tu sesión terminó" | Pasaron 12 horas, se cambió el rol o se restableció el PIN. Volver a entrar |
| "Demasiados intentos" | Esperar 15 minutos o pedir un código nuevo a un admin |
| No aparece una persona en el ingreso | Está desactivada, o no tiene PIN y su código venció: generá uno nuevo |
| Nadie puede entrar como admin | Desde el Sheet: **Lirien → Generar código nuevo para una persona** |
| La cámara no abre | Revisar el permiso de cámara del navegador. Escribir el código o usar un lector USB siempre funciona |

**Respaldo:** Google Sheets guarda versiones (Archivo → Historial de versiones). Además, **Más → Descargar inventario en Excel** baja una copia que se puede volver a importar.

## Para desarrollo (sin tocar Google)

```bash
cd apps/inventario/apps-script
npm test                 # 33 pruebas del backend con hojas simuladas
npm run serve            # API local en http://localhost:8787/exec · Karol y Fiorella con PIN 246813

cd ../web
npm install
cp .env.example .env.local
npm run dev              # http://localhost:5173 contra la API local
```
