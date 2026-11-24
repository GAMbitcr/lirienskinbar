import { useEffect, useRef, useState } from 'preact/hooks';
import { Empty, Field, Icon, Lily, Sheet } from '../components/ui';
import { cameraError, startScanner } from '../lib/scanner';
import { crc, fold, variantName } from '../lib/format';
import { useNav } from '../nav';
import { useStore, type Found } from '../store';
import { BarcodeDialog } from './inventory';

/** Vista de la cámara que avisa cada código leído. */
export function CameraScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const handler = useRef(onCode);
  handler.current = onCode;
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stop: (() => void) | null = null, cancelled = false;
    if (video.current) startScanner(video.current, (c) => handler.current(c)).then((s) => { if (cancelled) s(); else stop = s; }).catch((e) => setError(cameraError(e)));
    return () => { cancelled = true; stop?.(); };
  }, []);
  if (error) return <div class="notice notice--warn">{error}</div>;
  return (
    <div class="camera">
      <video ref={video} class="camera__video" muted playsInline />
      <div class="camera__frame" aria-hidden="true" />
      <span class="camera__hint">Acercá el código de barras al recuadro</span>
    </div>
  );
}

/** Qué hacer con un código leído (cámara, lector USB o escrito): agregar a la venta, abrir la ficha o asociarlo. */
export function useCodeHandler(mode: 'sale' | 'open' = 'sale') {
  const { byBarcode, bySku, cartAdd, notify, isAdmin } = useStore();
  const { openProduct } = useNav();
  const [unknown, setUnknown] = useState<string | null>(null);
  const handle = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const found = byBarcode.get(code) ?? bySku.get(code.toUpperCase());
    if (!found) { if (isAdmin) setUnknown(code); else notify(`No conocemos el código ${code}. Buscá el producto por nombre.`, 'error'); return; }
    if (mode === 'open') { openProduct(found.product.id); return; }
    if (cartAdd(found.variant.sku)) { notify(`${variantName(found.product, found.variant)} · ${crc(found.variant.priceCrc)}`); if (navigator.vibrate) navigator.vibrate(40); }
  };
  return { handle, unknown, clearUnknown: () => setUnknown(null) };
}

export function Scan() {
  const [mode, setMode] = useState<'sale' | 'open'>('sale');
  const [camera, setCamera] = useState(true);
  const [typed, setTyped] = useState('');
  const { handle, unknown, clearUnknown } = useCodeHandler(mode);
  const { cartUnits, cartTotal } = useStore();
  const { openCheckout } = useNav();
  return (
    <div class="page page--narrow">
      <header class="page__head"><div><span class="eyebrow"><Lily size={14} /> Cámara, lector o código escrito</span><h1 class="h1">Escanear</h1></div></header>
      <div class="chips" role="group" aria-label="Qué hacer al leer un código">
        <button class="chip" aria-pressed={mode === 'sale'} onClick={() => setMode('sale')}>Agregar a la venta</button>
        <button class="chip" aria-pressed={mode === 'open'} onClick={() => setMode('open')}>Abrir la ficha</button>
      </div>
      {camera ? <CameraScanner onCode={handle} /> : <button class="btn btn--secondary" onClick={() => setCamera(true)}><Icon name="scan" size={18} /> Encender la cámara</button>}
      {camera && <button class="link-btn" onClick={() => setCamera(false)}>Apagar la cámara</button>}
      <form class="inline-form" onSubmit={(e) => { e.preventDefault(); handle(typed); setTyped(''); }}>
        <Field label="Código de barras o SKU"><input class="input" inputMode="numeric" placeholder="8809679698493" value={typed} onInput={(e) => setTyped((e.target as HTMLInputElement).value)} /></Field>
        <button class="btn btn--secondary" type="submit" disabled={!typed.trim()}>Buscar</button>
      </form>
      {cartUnits > 0 && <button class="btn btn--primary btn--block" onClick={openCheckout}>Cobrar · {cartUnits} {cartUnits === 1 ? 'producto' : 'productos'} · {crc(cartTotal)}</button>}
      {unknown && <LinkUnknown code={unknown} onClose={clearUnknown} />}
    </div>
  );
}

/** Código que todavía no está asociado: la admin elige a qué producto pertenece. */
export function LinkUnknown({ code, onClose }: { code: string; onClose: () => void }) {
  const { products } = useStore();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Found | null>(null);
  const words = fold(query).split(/\s+/).filter(Boolean);
  const matches: Found[] = [];
  if (words.length) {
    for (const product of products) {
      if (product.status !== 'active') continue;
      const hay = fold(`${product.vendor} ${product.title}`);
      if (!words.every((w) => hay.includes(w))) continue;
      for (const variant of product.variants) if (variant.active) matches.push({ product, variant });
      if (matches.length > 30) break;
    }
  }
  if (picked) return <BarcodeDialog product={picked.product} variant={picked.variant} initial={code} onClose={onClose} />;
  return (
    <Sheet title="Código nuevo" eyebrow={code} onClose={onClose}>
      <p class="muted">Este código todavía no está asociado. Buscá el producto al que pertenece y lo guardamos para la próxima.</p>
      <Field label="Producto"><input class="input" autoFocus placeholder="Marca o nombre" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} /></Field>
      {words.length > 0 && !matches.length && <Empty title="No encontramos ese producto.">Si es nuevo, crealo desde Inventario → Nuevo producto.</Empty>}
      <ul class="picklist">
        {matches.slice(0, 30).map((f) => (
          <li><button class="picklist__item" onClick={() => setPicked(f)}><Lily size={16} /><span>{variantName(f.product, f.variant)}</span><span class="muted">{f.variant.barcode ? 'ya tiene código' : crc(f.variant.priceCrc)}</span></button></li>
        ))}
      </ul>
    </Sheet>
  );
}
