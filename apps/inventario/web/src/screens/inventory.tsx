import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api, type Movement, type MovementType, type Product, type Variant } from '../api';
import { Empty, Field, Icon, Lily, Pill, Sheet, Spinner, Stepper, catClass } from '../components/ui';
import { CATEGORIES, MOVES, crc, fold, liveVariants, productStatus, productStock, uuid, variantName, variantStatus, when, type StockStatus } from '../lib/format';
import { useNav } from '../nav';
import { useStore } from '../store';
import { CameraScanner } from './scan';

type StatusFilter = 'all' | StockStatus | 'archived';

export function Inventory() {
  const { products, loading, loadError, refresh, cartAdd, isAdmin, notify } = useStore();
  const { openProduct, openEditor } = useNav();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [limit, setLimit] = useState(60);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) { e.preventDefault(); searchRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => setLimit(60), [query, category, status]);

  const active = useMemo(() => products.filter((p) => p.status === 'active'), [products]);
  const stats = useMemo(() => {
    let units = 0, ok = 0, low = 0, out = 0;
    for (const p of active) for (const v of liveVariants(p)) { units += v.stock; const s = variantStatus(v); if (s === 'ok') ok++; else if (s === 'low') low++; else out++; }
    return { units, ok, low, out };
  }, [active]);

  const list = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return products.filter((p) => {
      if (status === 'archived' ? p.status !== 'archived' : p.status !== 'active') return false;
      if (category && p.category !== category) return false;
      if (status !== 'all' && status !== 'archived' && productStatus(p) !== status) return false;
      if (!words.length) return true;
      const hay = fold(`${p.vendor} ${p.title} ${p.variants.map((v) => `${v.optionValue ?? ''} ${v.sku} ${v.barcode ?? ''}`).join(' ')}`);
      return words.every((w) => hay.includes(w));
    });
  }, [products, query, category, status]);

  const quickAdd = (p: Product) => {
    const live = liveVariants(p);
    if (live.length === 1) { if (cartAdd(live[0].sku)) notify(`${p.title} agregado a la venta`); } else openProduct(p.id);
  };

  return (
    <div class="page">
      <header class="page__head">
        <div><span class="eyebrow"><Lily size={14} /> Kiosko · Santa Ana Town Center</span><h1 class="h1">Inventario</h1></div>
        <div class="page__actions">
          <button class="icon-btn" aria-label="Actualizar" onClick={() => void refresh()} disabled={loading}><Icon name="refresh" /></button>
          {isAdmin && <button class="btn btn--secondary btn--sm" onClick={() => openEditor(null)}><Icon name="plus" size={18} /> Nuevo producto</button>}
        </div>
      </header>

      <div class="stats" role="group" aria-label="Resumen del inventario">
        <button class={`stat stat--units ${status === 'all' ? 'is-on' : ''}`} onClick={() => setStatus('all')}><span class="stat__n">{stats.units}</span><span class="stat__l">unidades</span></button>
        <button class={`stat stat--ok ${status === 'ok' ? 'is-on' : ''}`} onClick={() => setStatus(status === 'ok' ? 'all' : 'ok')}><span class="stat__n">{stats.ok}</span><span class="stat__l">en stock</span></button>
        <button class={`stat stat--low ${status === 'low' ? 'is-on' : ''}`} onClick={() => setStatus(status === 'low' ? 'all' : 'low')}><span class="stat__n">{stats.low}</span><span class="stat__l">últimas unidades</span></button>
        <button class={`stat stat--out ${status === 'out' ? 'is-on' : ''}`} onClick={() => setStatus(status === 'out' ? 'all' : 'out')}><span class="stat__n">{stats.out}</span><span class="stat__l">agotados</span></button>
      </div>

      <div class="search">
        <Icon name="search" size={20} />
        <input ref={searchRef} class="search__input" type="search" placeholder="Buscá por marca, producto o código" aria-label="Buscar en el inventario" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        {query && <button class="icon-btn icon-btn--sm" aria-label="Limpiar búsqueda" onClick={() => setQuery('')}><Icon name="close" size={18} /></button>}
      </div>

      <div class="chips" role="group" aria-label="Categoría">
        <button class="chip" aria-pressed={category === ''} onClick={() => setCategory('')}>Todo</button>
        {CATEGORIES.map((c) => <button class={`chip ${catClass(c)}`} aria-pressed={category === c} onClick={() => setCategory(category === c ? '' : c)}><span class="chip__dot" />{c}</button>)}
        {isAdmin && <button class="chip" aria-pressed={status === 'archived'} onClick={() => setStatus(status === 'archived' ? 'all' : 'archived')}>Archivados</button>}
      </div>

      {loadError && <div class="notice notice--warn">{loadError} <button class="link-btn" onClick={() => void refresh()}>Reintentar</button></div>}
      {loading && !products.length ? <Spinner label="Cargando el inventario…" /> : !list.length ? (
        <Empty title={products.length ? 'No encontramos productos con ese filtro.' : 'El inventario está vacío.'}>{products.length ? 'Probá con otra palabra o quitá los filtros.' : 'Cargá el catálogo base desde el Sheet o importá un archivo en Más → Importar.'}</Empty>
      ) : (
        <>
          <p class="count">{list.length === 1 ? '1 producto' : `${list.length} productos`}</p>
          <ul class="rows">
            {list.slice(0, limit).map((p) => {
              const live = liveVariants(p), st = productStatus(p), qty = productStock(p);
              const prices = live.map((v) => v.priceCrc), min = Math.min(...prices), max = Math.max(...prices);
              const sale = live.some((v) => v.compareAtCrc !== null);
              return (
                <li class="row" key={p.id}>
                  <button class="row__main" onClick={() => openProduct(p.id)}>
                    <span class={`row__thumb ${catClass(p.category)}`}><Lily size={20} tone="lirio" /></span>
                    <span class="row__text">
                      <span class="row__vendor">{p.vendor}</span>
                      <span class="row__title">{p.title}</span>
                      <span class="row__meta">{live.length > 1 ? `${live.length} variantes` : live[0]?.optionValue ?? p.category}{live.length === 1 && live[0].displayLocation ? ` · ${live[0].displayLocation.replace(/URNA/g, 'Urna')}` : ''}</span>
                    </span>
                    <span class="row__side">
                      <span class={`row__price ${sale ? 'is-sale' : ''}`}>{live.length ? (min === max ? crc(min) : `Desde ${crc(min)}`) : '—'}</span>
                      {p.status === 'archived' ? <span class="pill pill--info">Archivado</span> : <Pill status={st} qty={qty} />}
                    </span>
                  </button>
                  <button class="row__add" aria-label={`Agregar ${p.vendor} ${p.title} a la venta`} disabled={st === 'out' || p.status !== 'active'} onClick={() => quickAdd(p)}><Icon name="plus" /></button>
                </li>
              );
            })}
          </ul>
          {list.length > limit && <button class="btn btn--secondary btn--block" onClick={() => setLimit(limit + 80)}>Ver más ({list.length - limit})</button>}
        </>
      )}
    </div>
  );
}

/* ---------- Ficha de producto ---------- */
export function ProductSheet({ productId, onClose }: { productId: string; onClose: () => void }) {
  const { products, cart, cartAdd, isAdmin, notify, fail, refresh } = useStore();
  const { openEditor } = useNav();
  const product = products.find((p) => p.id === productId);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [action, setAction] = useState<{ variant: Variant; mode: 'receive' | 'adjust' | 'barcode' | 'history' } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!product) return null;
  const archived = product.status === 'archived';

  const add = (v: Variant) => { if (cartAdd(v.sku, qty[v.sku] ?? 1)) { notify('Agregado a la venta'); setQty({ ...qty, [v.sku]: 1 }); } };
  const toggleArchive = async () => {
    setBusy(true);
    try { await api.archiveProduct(product.id, !archived); notify(archived ? 'Producto restaurado' : 'Producto archivado'); await refresh(); if (!archived) onClose(); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <Sheet title={product.title} eyebrow={product.vendor} onClose={onClose}
      footer={isAdmin ? (
        <div class="btn-row">
          <button class="btn btn--secondary" onClick={() => openEditor(product.id)}><Icon name="edit" size={18} /> Editar</button>
          <button class="btn btn--ghost" disabled={busy} onClick={toggleArchive}><Icon name="archive" size={18} /> {archived ? 'Restaurar' : 'Archivar'}</button>
        </div>
      ) : undefined}>
      <div class="tags"><span class={`tag ${catClass(product.category)}`}><Lily size={14} tone="lirio" /> {product.category}</span>{archived && <span class="pill pill--info">Archivado</span>}</div>
      {product.description && <p class="muted">{product.description}</p>}
      <ul class="variants">
        {product.variants.filter((v) => v.active || isAdmin).map((v) => {
          const st = variantStatus(v), inCart = cart.get(v.sku) ?? 0, left = v.stock - inCart;
          return (
            <li class={`variant ${v.active ? '' : 'is-off'}`} key={v.sku}>
              <div class="variant__top">
                <div class="variant__name">
                  <span class="variant__option">{v.optionValue ?? 'Única presentación'}</span>
                  <span class="variant__price">{v.compareAtCrc !== null && <s>{crc(v.compareAtCrc)}</s>} <strong class={v.compareAtCrc !== null ? 'is-sale' : ''}>{crc(v.priceCrc)}</strong></span>
                </div>
                {v.active ? <Pill status={st} qty={v.stock} /> : <span class="pill pill--info">Desactivada</span>}
              </div>
              <ul class="facts">
                <li><Lily size={14} /> {v.displayLocation ? v.displayLocation.replace('URNA', 'Urna') : 'Sin urna asignada'}</li>
                <li><Lily size={14} /> {v.barcode ? `Código ${v.barcode}` : 'Sin código de barras'}</li>
                <li><Lily size={14} /> {v.sku}{v.countedAt ? ' · contado' : ''}{inCart ? ` · ${inCart} en la venta` : ''}</li>
              </ul>
              {v.active && !archived && (
                <div class="variant__buy">
                  <Stepper value={Math.min(qty[v.sku] ?? 1, Math.max(1, left))} min={1} max={Math.max(1, left)} onChange={(n) => setQty({ ...qty, [v.sku]: n })} label="Cantidad" />
                  <button class="btn btn--primary" disabled={left <= 0} onClick={() => add(v)}>{left <= 0 ? (v.stock <= 0 ? 'Agotado' : 'Ya está todo en la venta') : 'Agregá a la venta'}</button>
                </div>
              )}
              {isAdmin && (
                <div class="variant__admin">
                  <button class="btn btn--secondary btn--sm" onClick={() => setAction({ variant: v, mode: 'receive' })}>Entró</button>
                  <button class="btn btn--secondary btn--sm" onClick={() => setAction({ variant: v, mode: 'adjust' })}>Ajustar</button>
                  <button class="btn btn--secondary btn--sm" onClick={() => setAction({ variant: v, mode: 'barcode' })}>{v.barcode ? 'Cambiar código' : 'Asociar código'}</button>
                  <button class="btn btn--ghost btn--sm" onClick={() => setAction({ variant: v, mode: 'history' })}>Movimientos</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {action && action.mode !== 'history' && action.mode !== 'barcode' && <StockDialog product={product} variant={action.variant} mode={action.mode} onClose={() => setAction(null)} />}
      {action?.mode === 'barcode' && <BarcodeDialog product={product} variant={action.variant} onClose={() => setAction(null)} />}
      {action?.mode === 'history' && <MovementsDialog product={product} variant={action.variant} onClose={() => setAction(null)} />}
    </Sheet>
  );
}

const ADJUST: { type: MovementType; label: string; help: string }[] = [
  { type: 'COUNT', label: 'Conteo', help: 'Escribí cuántas unidades hay en total. La app calcula la diferencia.' },
  { type: 'ADJUST', label: 'Corrección', help: 'Sumá o restá unidades (por ejemplo -1). Contanos el motivo.' },
  { type: 'WASTE', label: 'Merma', help: 'Unidades dañadas o vencidas. Contanos el motivo.' },
  { type: 'TESTER', label: 'Tester', help: 'Unidades que pasan a ser de muestra.' },
  { type: 'RETURN', label: 'Devolución', help: 'Unidades que vuelven al stock.' },
];

function StockDialog({ product, variant, mode, onClose }: { product: Product; variant: Variant; mode: 'receive' | 'adjust'; onClose: () => void }) {
  const { fail, notify, refresh, patchStock } = useStore();
  const [type, setType] = useState<MovementType>(mode === 'receive' ? 'RECEIVE' : 'COUNT');
  const [text, setText] = useState(mode === 'receive' ? '1' : '');
  const [note, setNote] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const clientId = useMemo(uuid, []);
  const n = /^-?\d+$/.test(text.trim()) ? Number(text.trim()) : null;
  const after = n === null ? null : type === 'COUNT' ? n : type === 'ADJUST' ? variant.stock + n : type === 'RECEIVE' || type === 'RETURN' ? variant.stock + n : variant.stock - n;
  const needsNote = type === 'ADJUST' || type === 'WASTE';
  const valid = n !== null && after !== null && after >= 0 && (type === 'COUNT' ? n >= 0 : type === 'ADJUST' ? n !== 0 : n > 0) && (!needsNote || note.trim() !== '');
  const save = async () => {
    if (!valid || n === null || after === null) return;
    setBusy(true);
    try {
      await api.move(variant.sku, type, n, note.trim(), ref.trim(), clientId);
      patchStock({ [variant.sku]: after - variant.stock });
      notify(`Listo: ahora hay ${after}`);
      void refresh();
      onClose();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <Sheet title={mode === 'receive' ? 'Entró mercadería' : 'Ajustar existencias'} eyebrow={variantName(product, variant)} onClose={onClose}
      footer={<button class="btn btn--primary btn--block" disabled={!valid || busy} onClick={save}>{busy ? 'Guardando…' : 'Guardá'}</button>}>
      <p class="muted">Hoy hay <strong>{variant.stock}</strong>.{after !== null && after !== variant.stock && after >= 0 ? <> Va a quedar en <strong>{after}</strong>.</> : null}{after !== null && after < 0 ? <span class="is-sale"> No puede quedar en negativo.</span> : null}</p>
      {mode === 'adjust' && (
        <>
          <div class="chips" role="group" aria-label="Tipo de ajuste">{ADJUST.map((a) => <button class="chip" aria-pressed={type === a.type} onClick={() => { setType(a.type); setText(''); }}>{a.label}</button>)}</div>
          <p class="hint"><Lily size={14} /> {ADJUST.find((a) => a.type === type)?.help}</p>
        </>
      )}
      <Field label={type === 'COUNT' ? 'Unidades contadas' : type === 'ADJUST' ? 'Corrección (+ o −)' : 'Cantidad'}>
        <input class="input input--big" inputMode={type === 'ADJUST' ? 'text' : 'numeric'} autoFocus value={text} onInput={(e) => setText((e.target as HTMLInputElement).value.replace(type === 'ADJUST' ? /[^\d-]/g : /\D/g, '').slice(0, 4))} />
      </Field>
      {mode === 'receive' && <Field label="Factura o referencia (opcional)"><input class="input" value={ref} maxLength={60} onInput={(e) => setRef((e.target as HTMLInputElement).value)} /></Field>}
      <Field label={needsNote ? 'Motivo' : 'Nota (opcional)'}><input class="input" value={note} maxLength={200} onInput={(e) => setNote((e.target as HTMLInputElement).value)} /></Field>
    </Sheet>
  );
}

export function BarcodeDialog({ product, variant, initial = '', onClose }: { product: Product; variant: Variant; initial?: string; onClose: () => void }) {
  const { fail, notify, refresh } = useStore();
  const [code, setCode] = useState(initial || variant.barcode || '');
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.linkBarcode(variant.sku, code.trim()); notify('Código asociado'); await refresh(); onClose(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Código de barras" eyebrow={variantName(product, variant)} onClose={onClose}
      footer={<button class="btn btn--primary btn--block" disabled={busy || code.trim().length < 4} onClick={save}>{busy ? 'Guardando…' : 'Asociá el código'}</button>}>
      <p class="muted">Escaneá el código de fábrica de la caja o escribilo. Se hace una sola vez por producto.</p>
      {camera ? <CameraScanner onCode={(c) => { setCode(c); setCamera(false); }} /> : <button class="btn btn--secondary" onClick={() => setCamera(true)}><Icon name="scan" size={18} /> Usar la cámara</button>}
      <Field label="Código"><input class="input input--big" inputMode="numeric" value={code} maxLength={32} onInput={(e) => setCode((e.target as HTMLInputElement).value)} /></Field>
    </Sheet>
  );
}

function MovementsDialog({ product, variant, onClose }: { product: Product; variant: Variant; onClose: () => void }) {
  const [list, setList] = useState<Movement[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { api.movements(variant.sku).then(setList).catch(() => setError(true)); }, []);
  return (
    <Sheet title="Movimientos" eyebrow={variantName(product, variant)} onClose={onClose}>
      {error ? <div class="notice notice--warn">No pudimos cargar los movimientos.</div> : !list ? <Spinner /> : !list.length ? <Empty title="Todavía no hay movimientos recientes." /> : (
        <ul class="moves">{list.map((m) => <MovementRow m={m} key={m.id} />)}</ul>
      )}
    </Sheet>
  );
}

export function MovementRow({ m, name }: { m: Movement; name?: string }) {
  const def = MOVES[m.type];
  return (
    <li class="move">
      <span class={`move__type move__type--${def.tone}`}>{def.label}</span>
      <span class="move__text">{name && <span class="move__name">{name}</span>}<span class="move__meta">{when(m.ts)} · {m.user}{m.ref ? ` · ${m.ref}` : ''}{m.note ? ` · ${m.note}` : ''}</span></span>
      <span class={`move__qty ${m.qty < 0 ? 'is-minus' : ''}`}>{m.qty > 0 ? '+' : ''}{m.qty}</span>
    </li>
  );
}
