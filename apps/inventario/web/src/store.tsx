import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api, ApiError, loadSession, saveSession, setExpiredHandler, type Product, type Session, type Variant } from './api';

export interface Toast { id: number; text: string; tone: 'ok' | 'error' | 'info' }
export interface Found { product: Product; variant: Variant }

interface Store {
  session: Session | null;
  isAdmin: boolean;
  signIn: (s: Session) => void;
  signOut: (message?: string) => void;
  products: Product[];
  loading: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;
  bySku: Map<string, Found>;
  byBarcode: Map<string, Found>;
  /** Ajusta el stock en pantalla mientras llega la respuesta del servidor. */
  patchStock: (deltas: Record<string, number>) => void;
  cart: Map<string, number>;
  cartAdd: (sku: string, qty?: number) => boolean;
  cartSet: (sku: string, qty: number) => void;
  cartClear: () => void;
  cartUnits: number;
  cartTotal: number;
  toasts: Toast[];
  notify: (text: string, tone?: Toast['tone']) => void;
  /** Muestra el mensaje de un error de la API (o uno genérico). */
  fail: (e: unknown) => void;
}

const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = (): Store => useContext(Ctx);

export function StoreProvider({ children }: { children: ComponentChildren }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const loadSeq = useRef(0);

  const notify = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = ++toastId.current;
    setToasts([{ id, text, tone }]); // uno a la vez: el más reciente reemplaza al anterior
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3200);
  }, []);
  const fail = useCallback((e: unknown) => notify(e instanceof ApiError ? e.message : 'Algo falló. Probá de nuevo.', 'error'), [notify]);

  const signOut = useCallback((message?: string) => {
    saveSession(null);
    setSession(null);
    setProducts([]);
    setCart(new Map());
    if (message) notify(message, 'info');
  }, [notify]);
  const signIn = useCallback((s: Session) => { saveSession(s); setSession(s); }, []);
  useEffect(() => { setExpiredHandler((message) => signOut(message)); }, [signOut]);

  const refresh = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const data = await api.catalog();
      if (seq !== loadSeq.current) return;
      setProducts(data.products);
      setLoadError(null);
    } catch (e) {
      if (seq === loadSeq.current) setLoadError(e instanceof ApiError ? e.message : 'No pudimos cargar el inventario.');
    } finally { if (seq === loadSeq.current) setLoading(false); }
  }, []);

  // Carga al entrar, al volver a la app y cada 5 minutos (otra persona pudo vender desde otro dispositivo).
  useEffect(() => {
    if (!session) return;
    void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 5 * 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(timer); };
  }, [session?.token]);

  const { bySku, byBarcode } = useMemo(() => {
    const sku = new Map<string, Found>(), bar = new Map<string, Found>();
    for (const product of products) for (const variant of product.variants) {
      sku.set(variant.sku, { product, variant });
      if (variant.barcode) bar.set(variant.barcode, { product, variant });
    }
    return { bySku: sku, byBarcode: bar };
  }, [products]);

  const patchStock = useCallback((deltas: Record<string, number>) => {
    setProducts((list) => list.map((p) => (p.variants.some((v) => deltas[v.sku]) ? { ...p, variants: p.variants.map((v) => (deltas[v.sku] ? { ...v, stock: v.stock + deltas[v.sku] } : v)) } : p)));
  }, []);

  const cartSet = useCallback((sku: string, qty: number) => {
    setCart((c) => { const next = new Map(c); if (qty <= 0) next.delete(sku); else next.set(sku, qty); return next; });
  }, []);
  const cartAdd = useCallback((sku: string, qty = 1) => {
    const found = bySku.get(sku);
    if (!found) return false;
    const have = cart.get(sku) ?? 0;
    if (found.product.status !== 'active' || !found.variant.active) { notify('Ese producto está archivado.', 'error'); return false; }
    if (have + qty > found.variant.stock) { notify(found.variant.stock <= 0 ? 'Está agotado.' : `Solo ${found.variant.stock === 1 ? 'queda 1' : 'quedan ' + found.variant.stock}.`, 'error'); return false; }
    cartSet(sku, have + qty);
    return true;
  }, [bySku, cart, cartSet, notify]);
  const cartClear = useCallback(() => setCart(new Map()), []);

  const { cartUnits, cartTotal } = useMemo(() => {
    let units = 0, total = 0;
    for (const [sku, qty] of cart) { const f = bySku.get(sku); if (f) { units += qty; total += qty * f.variant.priceCrc; } }
    return { cartUnits: units, cartTotal: total };
  }, [cart, bySku]);

  const value: Store = { session, isAdmin: session?.role === 'admin', signIn, signOut, products, loading, loadError, refresh, bySku, byBarcode, patchStock, cart, cartAdd, cartSet, cartClear, cartUnits, cartTotal, toasts, notify, fail };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
