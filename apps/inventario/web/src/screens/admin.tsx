import { useEffect, useMemo, useState } from 'preact/hooks';
import { api, ApiError, type Activation, type AdminUser, type Category, type ImportOptions, type ImportPreview, type ImportResult, type ImportRow, type Product, type ProductInput, type Role, type VariantInput } from '../api';
import { Empty, Field, Icon, Lily, Money, Sheet, Spinner } from '../components/ui';
import { CATEGORIES, LOCATIONS, crc, dayCR, fold, initials, uuid, when } from '../lib/format';
import { downloadInventory, readInventoryFile } from '../lib/sheetFile';
import { useNav } from '../nav';
import { useStore } from '../store';

/* ---------- Pestaña "Más": cuenta y administración ---------- */
export function More() {
  const { session, isAdmin, signOut, fail, notify } = useStore();
  const { openEditor } = useNav();
  const [dialog, setDialog] = useState<'pin' | 'users' | 'import' | null>(null);
  const [exporting, setExporting] = useState(false);
  if (!session) return null;
  const logout = () => { void api.logout().catch(() => {}); signOut(); };
  const exportFile = async () => {
    setExporting(true);
    try { const data = await api.exportRows(); await downloadInventory(data.rows, dayCR()); notify('Inventario descargado'); } catch (e) { fail(e); } finally { setExporting(false); }
  };
  return (
    <div class="page page--narrow">
      <header class="page__head"><div><span class="eyebrow"><Lily size={14} /> Tu cuenta</span><h1 class="h1">Más</h1></div></header>
      <section class="card card--tint">
        <span class={`avatar avatar--lg avatar--${session.role}`}>{initials(session.name)}</span>
        <div class="card__text"><strong class="card__title">{session.name}</strong><span class="muted">{isAdmin ? 'Admin · puede corregir existencias y gestionar personas' : 'Colaboradora · consulta y registra ventas'}</span></div>
      </section>
      <ul class="menu">
        <li><button class="menu__item" onClick={() => setDialog('pin')}><Icon name="key" /><span>Cambiar mi PIN</span></button></li>
        {isAdmin && <>
          <li><button class="menu__item" onClick={() => setDialog('users')}><Icon name="users" /><span>Personas y códigos de activación</span></button></li>
          <li><button class="menu__item" onClick={() => openEditor(null)}><Icon name="plus" /><span>Nuevo producto</span></button></li>
          <li><button class="menu__item" onClick={() => setDialog('import')}><Icon name="upload" /><span>Importar inventario (Excel o Sheets)</span></button></li>
          <li><button class="menu__item" disabled={exporting} onClick={exportFile}><Icon name="download" /><span>{exporting ? 'Preparando el archivo…' : 'Descargar inventario en Excel'}</span></button></li>
        </>}
        <li><button class="menu__item" onClick={logout}><Icon name="logout" /><span>Cerrar sesión</span></button></li>
      </ul>
      <p class="muted small">Lirien Inventario · sesión hasta {when(session.expiresAt)}</p>
      {dialog === 'pin' && <ChangePin onClose={() => setDialog(null)} />}
      {dialog === 'users' && <Users onClose={() => setDialog(null)} />}
      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

function PinInput({ label, value, onChange, autoFocus = false }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return <Field label={label}><input class="input input--pin" type="password" inputMode="numeric" autoComplete="off" maxLength={6} autoFocus={autoFocus} value={value} onInput={(e) => onChange((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6))} /></Field>;
}

function ChangePin({ onClose }: { onClose: () => void }) {
  const { signIn, notify } = useStore();
  const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const mismatch = again.length === 6 && again !== next;
  const save = async () => {
    setBusy(true); setError(null);
    try { signIn(await api.changePin(current, next)); notify('PIN cambiado'); onClose(); } catch (e) { setError(e instanceof ApiError ? e.message : 'No pudimos cambiar el PIN.'); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Cambiar mi PIN" onClose={onClose} footer={<button class="btn btn--primary btn--block" disabled={busy || current.length !== 6 || next.length !== 6 || again !== next} onClick={save}>{busy ? 'Guardando…' : 'Guardá el PIN nuevo'}</button>}>
      <PinInput label="PIN actual" value={current} onChange={setCurrent} autoFocus />
      <PinInput label="PIN nuevo (6 dígitos)" value={next} onChange={setNext} />
      <PinInput label="Repetí el PIN nuevo" value={again} onChange={setAgain} />
      {mismatch && <p class="is-sale">Los dos PIN no coinciden.</p>}
      {error && <div class="notice notice--warn" role="alert">{error}</div>}
      <p class="hint"><Lily size={14} /> Al cambiarlo se cierran tus otras sesiones abiertas.</p>
    </Sheet>
  );
}

/* ---------- Personas y códigos de activación ---------- */
function Users({ onClose }: { onClose: () => void }) {
  const { session, fail, notify } = useStore();
  const [list, setList] = useState<AdminUser[] | null>(null);
  const [name, setName] = useState(''), [role, setRole] = useState<Role>('staff');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<Activation | null>(null);
  const load = () => api.users().then(setList).catch(fail);
  useEffect(() => { void load(); }, []);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); await load(); } catch (e) { fail(e); } finally { setBusy(false); } };
  const create = () => run(async () => { setCode(await api.createUser(name.trim(), role)); setName(''); });
  return (
    <Sheet title="Personas" eyebrow="Quién puede entrar a la app" onClose={onClose} wide>
      {code && (
        <div class="code" role="status">
          <span class="eyebrow">Código de activación de {code.name}</span>
          <strong class="code__value">{code.activationCode.slice(0, 4)} {code.activationCode.slice(4)}</strong>
          <p>Dáselo en persona: con este código {code.name} crea su PIN de 6 dígitos al entrar a la app. Sirve una sola vez, no se vuelve a mostrar y vence el {when(code.activationExpires).toLowerCase()}</p>
          <button class="btn btn--secondary btn--sm" onClick={() => { void navigator.clipboard?.writeText(code.activationCode).then(() => notify('Código copiado')).catch(() => {}); }}>Copiar</button>
          <button class="link-btn" onClick={() => setCode(null)}>Ya lo anoté</button>
        </div>
      )}
      <form class="inline-form" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) void create(); }}>
        <Field label="Agregar persona"><input class="input" placeholder="Nombre" maxLength={40} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></Field>
        <div class="chips" role="group" aria-label="Rol"><button type="button" class="chip" aria-pressed={role === 'staff'} onClick={() => setRole('staff')}>Colaboradora</button><button type="button" class="chip" aria-pressed={role === 'admin'} onClick={() => setRole('admin')}>Admin</button></div>
        <button class="btn btn--primary" type="submit" disabled={busy || name.trim().length < 2}>Generá el código</button>
      </form>
      {!list ? <Spinner /> : (
        <ul class="people people--admin">
          {list.map((u) => (
            <li class={`person person--static ${u.active ? '' : 'is-off'}`} key={u.userId}>
              <span class={`avatar avatar--${u.role}`}>{initials(u.name)}</span>
              <span class="person__text"><span class="person__name">{u.name}{u.userId === session?.userId ? ' (vos)' : ''}</span><span class="person__role">{u.role === 'admin' ? 'Admin' : 'Colaboradora'} · {!u.active ? 'Desactivada' : u.hasPin ? 'PIN creado' : u.activationPending ? 'Código pendiente de usar' : 'Sin PIN: generá un código'}</span></span>
              <span class="person__actions">
                {u.active && <button class="btn btn--secondary btn--sm" disabled={busy} onClick={() => run(async () => setCode(await api.resetPin(u.userId)))}>{u.hasPin ? 'Restablecer PIN' : 'Código nuevo'}</button>}
                {u.userId !== session?.userId && <button class="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => api.updateUser(u.userId, { role: u.role === 'admin' ? 'staff' : 'admin' }))}>{u.role === 'admin' ? 'Pasar a colaboradora' : 'Hacer admin'}</button>}
                {u.userId !== session?.userId && <button class="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => api.updateUser(u.userId, { active: !u.active }))}>{u.active ? 'Desactivar' : 'Reactivar'}</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/* ---------- Importar inventario con vista previa ---------- */
function ImportDialog({ onClose }: { onClose: () => void }) {
  const { refresh } = useStore();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [options, setOptions] = useState<ImportOptions>({ prices: true, stock: true, create: true });
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'changes' | 'news' | 'missing' | 'warnings'>('changes');
  const clientId = useMemo(uuid, [rows]);
  const say = (e: unknown, fallback: string) => setError(e instanceof ApiError || e instanceof Error ? e.message : fallback);

  const loadPreview = async (r: ImportRow[], o: ImportOptions) => {
    setBusy(true); setError(null); setPreview(null);
    try { const p = await api.importPreview(r, o); setPreview(p); setTab(p.changes.length ? 'changes' : p.news.length ? 'news' : p.warnings.length ? 'warnings' : 'missing'); } catch (e) { say(e, 'No pudimos leer el archivo.'); } finally { setBusy(false); }
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setResult(null); setFileName(file.name);
    try { const parsed = await readInventoryFile(file); setRows(parsed.rows); await loadPreview(parsed.rows, options); } catch (e) { setRows(null); say(e, 'No pudimos leer el archivo.'); }
  };
  const toggle = (key: keyof ImportOptions) => { const o = { ...options, [key]: !options[key] }; setOptions(o); if (rows) void loadPreview(rows, o); };
  const apply = async () => {
    if (!rows) return;
    setBusy(true); setError(null);
    try { setResult(await api.importApply(rows, options, clientId)); void refresh(); } catch (e) { say(e, 'No pudimos aplicar los cambios.'); } finally { setBusy(false); }
  };
  const s = preview?.summary;
  const nothing = !!s && s.priceChanges + s.stockChanges + s.newItems === 0 && !preview!.changes.length;

  if (result) {
    return (
      <Sheet title="Inventario actualizado" onClose={onClose} footer={<button class="btn btn--primary btn--block" onClick={onClose}>Listo</button>}>
        <div class="receipt"><Lily size={56} /><p class="receipt__change">Se aplicaron los cambios del archivo.</p></div>
        <ul class="lily-list lily-list--plain">
          <li><Lily size={16} /> {result.applied.variantsUpdated} productos actualizados</li>
          <li><Lily size={16} /> {result.applied.variantsCreated} productos o variantes nuevas</li>
          <li><Lily size={16} /> {result.applied.movements} movimientos de conteo registrados</li>
          {result.summary.warnings > 0 && <li><Lily size={16} tone="polen" /> {result.summary.warnings} avisos quedaron en la hoja «review» del Sheet</li>}
        </ul>
      </Sheet>
    );
  }
  return (
    <Sheet title="Importar inventario" eyebrow="Excel (.xlsx) o CSV" onClose={onClose} wide
      footer={preview ? <button class="btn btn--primary btn--block" disabled={busy || nothing} onClick={apply}>{busy ? 'Aplicando…' : nothing ? 'No hay cambios que aplicar' : 'Aplicá los cambios'}</button> : undefined}>
      <p class="muted">Subí el inventario actualizado. Desde Google Sheets: <strong>Archivo → Descargar → Microsoft Excel</strong>. Sirve el Sheet de siempre o el archivo que descarga esta app. Primero ves qué cambiaría; nada se aplica hasta que confirmés.</p>
      <label class="drop">
        <Icon name="upload" size={26} />
        <span class="drop__title">{fileName || 'Elegí el archivo'}</span>
        <span class="muted">{rows ? `${rows.length} filas leídas · tocá para cambiarlo` : '.xlsx o .csv'}</span>
        <input class="drop__input" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => void onFile((e.target as HTMLInputElement).files?.[0])} />
      </label>
      <div class="chips" role="group" aria-label="Qué actualizar">
        <button class="chip" aria-pressed={options.prices} onClick={() => toggle('prices')}>Precios</button>
        <button class="chip" aria-pressed={options.stock} onClick={() => toggle('stock')}>Existencias</button>
        <button class="chip" aria-pressed={options.create} onClick={() => toggle('create')}>Productos nuevos</button>
      </div>
      {error && <div class="notice notice--warn" role="alert">{error}</div>}
      {busy && !preview && <Spinner label="Comparando con el inventario…" />}
      {preview && s && (
        <>
          <div class="stats stats--four">
            <button class={`stat stat--units ${tab === 'changes' ? 'is-on' : ''}`} onClick={() => setTab('changes')}><span class="stat__n">{preview.summary.priceChanges + preview.summary.stockChanges}</span><span class="stat__l">cambios de precio o stock</span></button>
            <button class={`stat stat--ok ${tab === 'news' ? 'is-on' : ''}`} onClick={() => setTab('news')}><span class="stat__n">{s.newItems}</span><span class="stat__l">nuevos</span></button>
            <button class={`stat stat--info ${tab === 'missing' ? 'is-on' : ''}`} onClick={() => setTab('missing')}><span class="stat__n">{s.missing}</span><span class="stat__l">no vienen en el archivo</span></button>
            <button class={`stat stat--low ${tab === 'warnings' ? 'is-on' : ''}`} onClick={() => setTab('warnings')}><span class="stat__n">{s.warnings}</span><span class="stat__l">avisos</span></button>
          </div>
          <p class="hint"><Lily size={14} /> {s.rows} filas · {s.matched} reconocidas · {s.stockChanges} diferencias de stock ({s.stockUnitsDelta >= 0 ? '+' : ''}{s.stockUnitsDelta} unidades). Las diferencias quedan como movimientos de conteo.</p>
          {tab === 'changes' && (!preview.changes.length ? <Empty title="Sin cambios de precio ni de stock." /> : (
            <ul class="diff">{preview.changes.map((c) => (
              <li class="diff__row" key={c.sku}>
                <span class="diff__name">{c.name}</span>
                <span class="diff__vals">
                  {c.price && <span class="diff__val">Precio {crc(c.price.from)} → <strong>{crc(c.price.to)}</strong></span>}
                  {c.compareAt && <span class="diff__val">{c.compareAt.to === null ? 'Sin oferta' : `Oferta (antes ${crc(c.compareAt.to)})`}</span>}
                  {c.stock && <span class={`diff__val ${c.stock.to < c.stock.from ? 'is-minus' : 'is-plus'}`}>Stock {c.stock.from} → <strong>{c.stock.to}</strong></span>}
                  {c.location && <span class="diff__val">{c.location.to.replace(/URNA/g, 'Urna')}</span>}
                  {c.counted && <span class="diff__val">Contado</span>}
                </span>
              </li>))}</ul>))}
          {tab === 'news' && (!preview.news.length ? <Empty title="No hay productos nuevos." /> : (
            <ul class="diff">{preview.news.map((n) => (
              <li class="diff__row" key={n.line + n.legacy}>
                <span class="diff__name"><span class="row__vendor">{n.vendor}</span>{n.title}{n.optionValue ? ` · ${n.optionValue}` : ''}</span>
                <span class="diff__vals"><span class="diff__val">{crc(n.price)}</span><span class="diff__val is-plus">Stock {n.stock}</span><span class="diff__val">{n.category}{n.categoryGuessed ? ' (por confirmar)' : ''}</span></span>
              </li>))}</ul>))}
          {tab === 'missing' && (!preview.missing.length ? <Empty title="Todo el catálogo viene en el archivo." /> : (
            <>
              <p class="muted">Están en la app pero no en el archivo. No se tocan: si ya no se venden, archivalos desde su ficha.</p>
              <ul class="diff">{preview.missing.map((m) => <li class="diff__row" key={m.sku}><span class="diff__name">{m.name}</span><span class="diff__vals"><span class="diff__val">Stock {m.stock}</span></span></li>)}</ul>
            </>))}
          {tab === 'warnings' && (!preview.warnings.length ? <Empty title="Sin avisos." /> : (
            <ul class="diff">{preview.warnings.map((w, i) => <li class="diff__row" key={i}><span class="diff__name">{w.legacy}<span class="muted"> · fila {w.line}</span></span><span class="diff__vals"><span class="diff__val">{w.message}</span></span></li>)}</ul>))}
        </>
      )}
    </Sheet>
  );
}

/* ---------- Crear o editar un producto ---------- */
interface VRow { key: string; sku?: string; optionValue: string; price: number | null; compareAt: number | null; barcode: string; location: string; minStock: string; active: boolean; initial: string }
const emptyRow = (): VRow => ({ key: uuid(), optionValue: '', price: null, compareAt: null, barcode: '', location: '', minStock: '1', active: true, initial: '' });

export function ProductEditor({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const { products, refresh, notify } = useStore();
  const { openProduct } = useNav();
  const original: Product | undefined = productId ? products.find((p) => p.id === productId) : undefined;
  const [vendor, setVendor] = useState(original?.vendor ?? '');
  const [title, setTitle] = useState(original?.title ?? '');
  const [category, setCategory] = useState<Category | ''>(original?.category ?? '');
  const [description, setDescription] = useState(original?.description ?? '');
  const [optionName, setOptionName] = useState(original?.optionName ?? '');
  const [rows, setRows] = useState<VRow[]>(() => original ? original.variants.map((v) => ({ key: v.sku, sku: v.sku, optionValue: v.optionValue ?? '', price: v.priceCrc, compareAt: v.compareAtCrc, barcode: v.barcode ?? '', location: v.displayLocation, minStock: String(v.minStock), active: v.active, initial: '' })) : [emptyRow()]);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);

  const vendors = useMemo(() => [...new Set(products.map((p) => p.vendor))].sort((a, b) => a.localeCompare(b)), [products]);
  const suggestions = vendor.trim() && !vendors.includes(vendor.trim()) ? vendors.filter((v) => fold(v).includes(fold(vendor))).slice(0, 6) : [];
  const set = (key: string, patch: Partial<VRow>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const many = rows.filter((r) => r.active).length > 1;
  const valid = vendor.trim() !== '' && title.trim() !== '' && category !== '' && rows.every((r) => r.price !== null && r.price > 0) && (!many || optionName !== '');
  const chosen: Category | null = category === '' ? null : category;

  const save = async () => {
    if (!valid || chosen === null) return;
    setBusy(true); setError(null);
    const variants: VariantInput[] = rows.map((r) => ({ ...(r.sku ? { sku: r.sku } : {}), optionValue: r.optionValue.trim(), priceCrc: r.price ?? 0, compareAtCrc: r.compareAt, barcode: r.barcode.trim(), displayLocation: r.location, minStock: Number(r.minStock || '1'), active: r.active, ...(r.sku ? {} : { initialStock: Number(r.initial || '0') }) }));
    const input: ProductInput = { ...(productId ? { id: productId } : {}), vendor: vendor.trim(), title: title.trim(), category: chosen, description: description.trim(), optionName, variants };
    try {
      const saved = await api.saveProduct(input);
      await refresh();
      notify(productId ? 'Producto actualizado' : 'Producto creado');
      onClose();
      if (!productId) openProduct(saved.id);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'No pudimos guardar el producto.'); } finally { setBusy(false); }
  };

  return (
    <Sheet title={productId ? 'Editar producto' : 'Nuevo producto'} eyebrow={productId ?? 'Catálogo'} onClose={onClose} wide
      footer={<button class="btn btn--primary btn--block" disabled={!valid || busy} onClick={save}>{busy ? 'Guardando…' : 'Guardá el producto'}</button>}>
      <div class="form-grid">
        <Field label="Marca">
          <input class="input" value={vendor} maxLength={60} onInput={(e) => setVendor((e.target as HTMLInputElement).value)} placeholder="Por ejemplo: Medicube" />
          {suggestions.length > 0 && <div class="chips">{suggestions.map((v) => <button type="button" class="chip" onClick={() => setVendor(v)}>{v}</button>)}</div>}
        </Field>
        <Field label="Nombre del producto"><input class="input" value={title} maxLength={120} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} placeholder="Nombre oficial, sin la marca" /></Field>
      </div>
      <Field label="Categoría"><div class="chips">{CATEGORIES.map((c) => <button type="button" class="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div></Field>
      <Field label="Descripción (opcional)"><textarea class="input input--area" rows={2} maxLength={500} value={description} onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} /></Field>
      <Field label="¿Qué distingue a las variantes?" hint="Solo hace falta si el producto tiene varias (tamaños, tonos o presentaciones).">
        <div class="chips">{['', 'Tamaño', 'Tono', 'Presentación'].map((o) => <button type="button" class="chip" aria-pressed={optionName === o} onClick={() => setOptionName(o)}>{o || 'Una sola'}</button>)}</div>
      </Field>
      <h3 class="h3">Variantes</h3>
      <ul class="vrows">
        {rows.map((r, i) => (
          <li class={`vrow ${r.active ? '' : 'is-off'}`} key={r.key}>
            <div class="vrow__head"><span class="eyebrow">{r.sku ?? `Nueva variante ${i + 1}`}</span>
              {r.sku ? <button type="button" class="link-btn" onClick={() => set(r.key, { active: !r.active })}>{r.active ? 'Desactivar' : 'Reactivar'}</button> : rows.length > 1 && <button type="button" class="link-btn" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>Quitar</button>}
            </div>
            <div class="form-grid form-grid--3">
              {(many || r.optionValue !== '' || optionName !== '') && <Field label={optionName || 'Variante'}><input class="input" value={r.optionValue} maxLength={60} placeholder={optionName === 'Tono' ? '21N Ivory' : optionName === 'Tamaño' ? 'Mini · 30 ml' : 'Caja'} onInput={(e) => set(r.key, { optionValue: (e.target as HTMLInputElement).value })} /></Field>}
              <Field label="Precio"><Money value={r.price} onChange={(n) => set(r.key, { price: n })} label="Precio" /></Field>
              <Field label="Precio antes (oferta)"><Money value={r.compareAt} onChange={(n) => set(r.key, { compareAt: n })} label="Precio antes de la oferta" placeholder="—" /></Field>
              <Field label="Urna"><select class="input" value={r.location} onChange={(e) => set(r.key, { location: (e.target as HTMLSelectElement).value })}><option value="">Sin asignar</option>{[...new Set([...LOCATIONS, r.location].filter(Boolean))].map((l) => <option value={l}>{l.replace(/URNA/g, 'Urna')}</option>)}</select></Field>
              <Field label="Código de barras"><input class="input" inputMode="numeric" value={r.barcode} maxLength={32} onInput={(e) => set(r.key, { barcode: (e.target as HTMLInputElement).value })} /></Field>
              <Field label="Avisar cuando queden"><input class="input" inputMode="numeric" value={r.minStock} maxLength={3} onInput={(e) => set(r.key, { minStock: (e.target as HTMLInputElement).value.replace(/\D/g, '') })} /></Field>
              {!r.sku && <Field label="Stock inicial"><input class="input" inputMode="numeric" value={r.initial} maxLength={3} placeholder="0" onInput={(e) => set(r.key, { initial: (e.target as HTMLInputElement).value.replace(/\D/g, '') })} /></Field>}
            </div>
          </li>
        ))}
      </ul>
      <button type="button" class="btn btn--secondary" onClick={() => setRows([...rows, emptyRow()])}><Icon name="plus" size={18} /> Agregar variante</button>
      {many && !optionName && <p class="is-sale">Con varias variantes, indicá qué las distingue.</p>}
      {error && <div class="notice notice--warn" role="alert">{error}</div>}
      {productId && <p class="hint"><Lily size={14} /> Las existencias no se editan acá: usá «Entró» o «Ajustar» en la ficha.</p>}
    </Sheet>
  );
}
