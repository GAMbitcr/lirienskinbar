import { useEffect, useMemo, useState } from 'preact/hooks';
import { api, type Method, type Movement, type Sale } from '../api';
import { Empty, Field, Icon, Lily, Pill, Sheet, Spinner } from '../components/ui';
import { CHANNELS, METHODS, crc, dayCR, liveVariants, variantName, variantStatus, when } from '../lib/format';
import { useNav } from '../nav';
import { useStore, type Found } from '../store';
import { MovementRow } from './inventory';

/* ---------- Alertas: últimas unidades y agotados ---------- */
export function Alerts() {
  const { products } = useStore();
  const { openProduct } = useNav();
  const { low, out } = useMemo(() => {
    const low: Found[] = [], out: Found[] = [];
    for (const product of products) {
      if (product.status !== 'active') continue;
      for (const variant of liveVariants(product)) { const s = variantStatus(variant); if (s === 'low') low.push({ product, variant }); else if (s === 'out') out.push({ product, variant }); }
    }
    return { low, out };
  }, [products]);
  const [tab, setTab] = useState<'low' | 'out'>('low');
  const list = tab === 'low' ? low : out;
  return (
    <div class="page page--narrow">
      <header class="page__head"><div><span class="eyebrow"><Lily size={14} /> Para reponer</span><h1 class="h1">Alertas</h1></div></header>
      <div class="stats stats--two">
        <button class={`stat stat--low ${tab === 'low' ? 'is-on' : ''}`} onClick={() => setTab('low')}><span class="stat__n">{low.length}</span><span class="stat__l">últimas unidades</span></button>
        <button class={`stat stat--out ${tab === 'out' ? 'is-on' : ''}`} onClick={() => setTab('out')}><span class="stat__n">{out.length}</span><span class="stat__l">agotados</span></button>
      </div>
      {!list.length ? <Empty title={tab === 'low' ? 'Nada en últimas unidades.' : 'No hay agotados.'}>Todo bien por acá.</Empty> : (
        <ul class="lily-list">
          {list.map(({ product, variant }) => (
            <li key={variant.sku}><button class="lily-list__item" onClick={() => openProduct(product.id)}>
              <Lily size={18} tone={tab === 'low' ? 'polen' : 'vino'} />
              <span class="lily-list__text"><span>{variantName(product, variant)}</span><span class="muted">{variant.displayLocation ? variant.displayLocation.replace('URNA', 'Urna') : 'Sin urna'} · mínimo {variant.minStock}</span></span>
              <Pill status={tab} qty={variant.stock} />
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Historial: ventas con cuadre de caja, y movimientos ---------- */
const RANGES = [{ id: 'today', label: 'Hoy', from: 0, to: 0 }, { id: 'yesterday', label: 'Ayer', from: -1, to: -1 }, { id: 'week', label: '7 días', from: -6, to: 0 }] as const;

export function History() {
  const { isAdmin, bySku, fail, notify, refresh } = useStore();
  const [view, setView] = useState<'sales' | 'moves'>('sales');
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('today');
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [moves, setMoves] = useState<Movement[] | null>(null);
  const [error, setError] = useState(false);
  const [voiding, setVoiding] = useState<Sale | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setError(false);
    if (view === 'sales') {
      setSales(null);
      const r = RANGES.find((x) => x.id === range)!;
      api.sales(dayCR(r.from), dayCR(r.to)).then(setSales).catch(() => setError(true));
    } else {
      setMoves(null);
      api.movements().then(setMoves).catch(() => setError(true));
    }
  }, [view, range, tick]);

  const box = useMemo(() => {
    const by: Record<Method, number> = { sinpe: 0, tarjeta: 0, efectivo: 0 };
    let total = 0, count = 0;
    for (const s of sales ?? []) { if (s.voided) continue; count++; total += s.totalCrc; for (const p of s.payments) by[p.method] += p.amountCrc; }
    return { by, total, count };
  }, [sales]);
  const name = (sku: string) => { const f = bySku.get(sku); return f ? variantName(f.product, f.variant) : sku; };

  return (
    <div class="page page--narrow">
      <header class="page__head"><div><span class="eyebrow"><Lily size={14} /> {isAdmin ? 'Todo el kiosko' : 'Tus ventas'}</span><h1 class="h1">Historial</h1></div><button class="icon-btn" aria-label="Actualizar" onClick={() => setTick(tick + 1)}><Icon name="refresh" /></button></header>
      <div class="tabs" role="tablist">
        <button role="tab" class="tab" aria-selected={view === 'sales'} onClick={() => setView('sales')}>Ventas</button>
        <button role="tab" class="tab" aria-selected={view === 'moves'} onClick={() => setView('moves')}>Entradas y ajustes</button>
      </div>
      {error && <div class="notice notice--warn">No pudimos cargar el historial. <button class="link-btn" onClick={() => setTick(tick + 1)}>Reintentar</button></div>}
      {view === 'sales' ? (
        <>
          <div class="chips">{RANGES.map((r) => <button class="chip" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>)}</div>
          {!sales ? (!error && <Spinner />) : (
            <>
              <section class="box" aria-label="Cuadre de caja">
                <div class="box__total"><span class="eyebrow">Cuadre de caja · {box.count} {box.count === 1 ? 'venta' : 'ventas'}</span><strong>{crc(box.total)}</strong></div>
                <ul class="box__methods">{(Object.keys(METHODS) as Method[]).map((m) => <li class={`box__method box__method--${m}`}><span>{METHODS[m]}</span><strong>{crc(box.by[m])}</strong></li>)}</ul>
              </section>
              {!sales.length ? <Empty title="No hay ventas en ese período." /> : (
                <ul class="sales">
                  {sales.map((s) => (
                    <li class={`sale ${s.voided ? 'is-void' : ''}`} key={s.saleId}>
                      <div class="sale__head"><span class="sale__id">{s.saleId}</span><span class="muted">{when(s.ts)} · {s.user} · {CHANNELS[s.channel] ?? s.channel}</span><strong class="sale__total">{crc(s.totalCrc)}</strong></div>
                      <ul class="sale__lines">{s.lines.map((l) => <li><Lily size={14} /> <span>{l.qty} × {name(l.sku)}</span><span>{crc(l.qty * l.unitPriceCrc)}</span></li>)}</ul>
                      <div class="sale__foot">
                        <span class="muted">{s.payments.map((p) => `${METHODS[p.method]} ${crc(p.amountCrc)}${p.tenderedCrc !== null && p.tenderedCrc > p.amountCrc ? ` (vuelto ${crc(p.tenderedCrc - p.amountCrc)})` : ''}`).join(' · ')}</span>
                        {s.voided ? <span class="pill pill--out">Anulada · {s.voided.note}</span> : isAdmin && <button class="link-btn" onClick={() => setVoiding(s)}>Anular</button>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      ) : !moves ? (!error && <Spinner />) : !moves.length ? <Empty title="Todavía no hay movimientos." /> : (
        <ul class="moves">{moves.map((m) => <MovementRow m={m} name={name(m.sku)} key={m.id} />)}</ul>
      )}
      {voiding && <VoidDialog sale={voiding} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); notify('Venta anulada: las unidades volvieron al stock'); setTick(tick + 1); void refresh(); }} onFail={fail} />}
    </div>
  );
}

function VoidDialog({ sale, onClose, onDone, onFail }: { sale: Sale; onClose: () => void; onDone: () => void; onFail: (e: unknown) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await api.voidSale(sale.saleId, note.trim()); onDone(); } catch (e) { onFail(e); } finally { setBusy(false); } };
  return (
    <Sheet title="Anular la venta" eyebrow={`${sale.saleId} · ${crc(sale.totalCrc)}`} onClose={onClose}
      footer={<button class="btn btn--primary btn--block" disabled={busy || !note.trim()} onClick={go}>{busy ? 'Anulando…' : 'Anulá la venta'}</button>}>
      <p class="muted">La venta no se borra: queda marcada como anulada y las unidades vuelven al stock.</p>
      <Field label="Motivo"><input class="input" autoFocus maxLength={200} value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} placeholder="Por ejemplo: se cobró dos veces" /></Field>
    </Sheet>
  );
}
