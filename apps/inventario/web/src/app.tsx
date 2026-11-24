import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon, Lily, Logo } from './components/ui';
import { crc, initials, liveVariants, variantStatus } from './lib/format';
import { listenKeyboardScanner } from './lib/scanner';
import { NavCtx, useNav, type Nav, type Tab } from './nav';
import { More, ProductEditor } from './screens/admin';
import { CartPanel, Checkout } from './screens/checkout';
import { Alerts, History } from './screens/history';
import { Inventory, ProductSheet } from './screens/inventory';
import { Login } from './screens/login';
import { LinkUnknown, Scan, useCodeHandler } from './screens/scan';
import { StoreProvider, useStore } from './store';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'inventory', label: 'Inventario', icon: 'box' },
  { id: 'scan', label: 'Escanear', icon: 'scan' },
  { id: 'cart', label: 'Venta', icon: 'bag' },
  { id: 'alerts', label: 'Alertas', icon: 'bell' },
  { id: 'history', label: 'Historial', icon: 'clock' },
  { id: 'more', label: 'Más', icon: 'more' },
];

function Toasts() {
  const { toasts } = useStore();
  return <div class="toasts" aria-live="polite">{toasts.map((t) => <div class={`toast toast--${t.tone}`} key={t.id}>{t.tone === 'ok' && <Lily size={16} tone="lirio" />}{t.text}</div>)}</div>;
}

/** Lector USB/Bluetooth: funciona en cualquier pantalla y agrega el producto a la venta. */
function GlobalScanner() {
  const { handle, unknown, clearUnknown } = useCodeHandler('sale');
  useEffect(() => listenKeyboardScanner(handle), [handle]);
  return unknown ? <LinkUnknown code={unknown} onClose={clearUnknown} /> : null;
}

function Shell() {
  const { session, products, cartUnits, cartTotal } = useStore();
  const [tab, setTab] = useState<Tab>('inventory');
  const [productId, setProductId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ id: string | null } | null>(null);
  const [checkout, setCheckout] = useState(false);
  const nav: Nav = useMemo(() => ({ tab, go: (t) => { setTab(t); window.scrollTo(0, 0); }, openProduct: setProductId, openEditor: (id) => { setProductId(null); setEditor({ id }); }, openCheckout: () => setCheckout(true) }), [tab]);
  // Al entrar (o cambiar de persona) siempre se arranca en Inventario, sin paneles abiertos.
  useEffect(() => { setTab('inventory'); setProductId(null); setEditor(null); setCheckout(false); }, [session?.userId]);
  const alerts = useMemo(() => products.reduce((n, p) => n + (p.status === 'active' ? liveVariants(p).filter((v) => variantStatus(v) === 'low').length : 0), 0), [products]);

  if (!session) return <><Login /><Toasts /></>;
  return (
    <NavCtx.Provider value={nav}>
      <div class="app">
        <nav class="rail" aria-label="Secciones">
          <div class="rail__brand"><Logo class="rail__logo" /><span class="rail__name">Inventario</span></div>
          <ul class="rail__list">
            {TABS.map((t) => (
              <li class={`rail__li rail__li--${t.id}`}>
                <button class="rail__item" aria-current={tab === t.id ? 'page' : undefined} onClick={() => nav.go(t.id)}>
                  <span class="rail__icon"><Icon name={t.icon} />{t.id === 'cart' && cartUnits > 0 && <span class="badge">{cartUnits}</span>}{t.id === 'alerts' && alerts > 0 && <span class="badge badge--low">{alerts > 99 ? '99+' : alerts}</span>}</span>
                  <span class="rail__label">{t.label}</span>
                </button>
              </li>
            ))}
          </ul>
          <button class="rail__user" onClick={() => nav.go('more')} aria-label={`Tu cuenta: ${session.name}`}><span class={`avatar avatar--${session.role}`}>{initials(session.name)}</span><span class="rail__label">{session.name}</span></button>
        </nav>
        <main class="app__main">
          {tab === 'inventory' && <Inventory />}
          {tab === 'scan' && <Scan />}
          {tab === 'cart' && <CartPanel />}
          {tab === 'alerts' && <Alerts />}
          {tab === 'history' && <History />}
          {tab === 'more' && <More />}
        </main>
        <aside class="app__cart" aria-label="Venta actual"><CartPanel compact /></aside>
        {cartUnits > 0 && tab !== 'cart' && !checkout && <FloatingCart units={cartUnits} total={cartTotal} />}
      </div>
      {productId && <ProductSheet productId={productId} onClose={() => setProductId(null)} />}
      {editor && <ProductEditor productId={editor.id} onClose={() => setEditor(null)} />}
      {checkout && <Checkout onClose={() => setCheckout(false)} />}
      <GlobalScanner />
      <Toasts />
    </NavCtx.Provider>
  );
}

function FloatingCart({ units, total }: { units: number; total: number }) {
  const { openCheckout, go } = useNav();
  return (
    <div class="floatbar">
      <button class="floatbar__info" onClick={() => go('cart')}><Lily size={18} tone="lirio" /><span>Venta en curso · {units} {units === 1 ? 'producto' : 'productos'}</span></button>
      <button class="floatbar__pay" onClick={openCheckout}>Cobrar {crc(total)}</button>
    </div>
  );
}

export const App = () => <StoreProvider><Shell /></StoreProvider>;
