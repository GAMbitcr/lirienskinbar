import { useMemo, useState } from 'preact/hooks';
import { api, ApiError, type Channel, type Method, type Payment } from '../api';
import { Empty, Field, Icon, Lily, Money, Sheet, Stepper } from '../components/ui';
import { CHANNELS, METHODS, crc, uuid, variantName } from '../lib/format';
import { useNav } from '../nav';
import { useStore } from '../store';

/** Productos de la venta en curso, con cantidades. */
export function CartLines() {
  const { cart, bySku, cartSet } = useStore();
  return (
    <ul class="lines">
      {[...cart].map(([sku, qty]) => {
        const f = bySku.get(sku);
        if (!f) return null;
        return (
          <li class="line" key={sku}>
            <div class="line__text"><span class="line__name">{variantName(f.product, f.variant)}</span><span class="line__meta">{crc(f.variant.priceCrc)} c/u{f.variant.displayLocation ? ` · ${f.variant.displayLocation.replace('URNA', 'Urna')}` : ''}</span></div>
            <Stepper value={qty} min={0} max={f.variant.stock} onChange={(n) => cartSet(sku, n)} label={`Cantidad de ${f.product.title}`} />
            <span class="line__total">{crc(qty * f.variant.priceCrc)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Pestaña "Venta" (celular) o panel fijo a la derecha (pantallas grandes). */
export function CartPanel({ compact = false }: { compact?: boolean }) {
  const { cartUnits, cartTotal, cartClear } = useStore();
  const { openCheckout, go } = useNav();
  return (
    <div class={compact ? 'cart cart--panel' : 'page page--narrow'}>
      <header class="page__head"><div><span class="eyebrow"><Lily size={14} /> Venta en curso</span><h1 class={compact ? 'h2' : 'h1'}>{cartUnits ? `${cartUnits} ${cartUnits === 1 ? 'producto' : 'productos'}` : 'Venta'}</h1></div>{cartUnits > 0 && <button class="link-btn" onClick={cartClear}>Vaciar</button>}</header>
      {!cartUnits ? (
        <Empty title="Todavía no hay productos en la venta.">Tocá el + de un producto o escaneá su código.{!compact && <><br /><button class="link-btn" onClick={() => go('inventory')}>Ir al inventario</button></>}</Empty>
      ) : (
        <>
          <CartLines />
          <div class="cart__total"><span>Total</span><strong>{crc(cartTotal)}</strong></div>
          <button class="btn btn--primary btn--block" onClick={openCheckout}>Cobrar {crc(cartTotal)}</button>
        </>
      )}
    </div>
  );
}

interface PayRow { id: string; method: Method; amount: number | null; tendered: number | null }
const row = (method: Method): PayRow => ({ id: uuid(), method, amount: null, tendered: null });
const BILLS = [1000, 2000, 5000, 10000, 20000];

/** Cobro: un método por defecto; "Dividir el pago" permite hasta 3 y el último calcula solo el resto. */
export function Checkout({ onClose }: { onClose: () => void }) {
  const { cart, cartTotal, cartUnits, cartClear, patchStock, refresh, notify } = useStore();
  const [channel, setChannel] = useState<Channel>('kiosko');
  const [rows, setRows] = useState<PayRow[]>([row('sinpe')]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ saleId: string; total: number; change: number } | null>(null);
  const clientId = useMemo(uuid, []);

  const total = cartTotal;
  const fixed = rows.slice(0, -1).reduce((n, r) => n + (r.amount ?? 0), 0);
  // El último pago es siempre "el resto": no se escribe, se calcula.
  const amounts = rows.map((r, i) => (i === rows.length - 1 ? Math.max(0, total - fixed) : r.amount ?? 0));
  const over = fixed > total;
  const set = (id: string, patch: Partial<PayRow>) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const change = rows.reduce((n, r, i) => n + (r.method === 'efectivo' && r.tendered !== null ? Math.max(0, r.tendered - amounts[i]) : 0), 0);
  const cashShort = rows.some((r, i) => r.method === 'efectivo' && r.tendered !== null && r.tendered < amounts[i]);
  const valid = cartUnits > 0 && !over && amounts.every((a) => a > 0) && !cashShort;

  const pay = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    const lines = [...cart].map(([sku, qty]) => ({ sku, qty }));
    const payments: Payment[] = rows.map((r, i) => ({ method: r.method, amountCrc: amounts[i], ...(r.method === 'efectivo' && r.tendered !== null ? { tenderedCrc: r.tendered } : {}) }));
    try {
      const sale = await api.checkout(lines, payments, channel, clientId);
      patchStock(Object.fromEntries(lines.map((l) => [l.sku, -l.qty])));
      setDone({ saleId: sale.saleId, total: sale.totalCrc, change });
      cartClear();
      void refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos registrar la venta. Probá de nuevo.');
      if (e instanceof ApiError && e.code === 'STOCK') void refresh();
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Sheet title="Venta registrada" eyebrow={done.saleId} onClose={onClose} footer={<button class="btn btn--primary btn--block" onClick={() => { notify('Lista para la siguiente venta'); onClose(); }}>Nueva venta</button>}>
        <div class="receipt">
          <Lily size={56} />
          <span class="receipt__total">{crc(done.total)}</span>
          {done.change > 0 ? <p class="receipt__change">Vuelto: <strong>{crc(done.change)}</strong></p> : <p class="muted">Quedó guardada en el historial.</p>}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Cobrar" eyebrow={`${cartUnits} ${cartUnits === 1 ? 'producto' : 'productos'}`} onClose={onClose} wide
      footer={<button class="btn btn--primary btn--block" disabled={!valid || busy} onClick={pay}>{busy ? 'Registrando…' : `Confirmá la venta · ${crc(total)}`}</button>}>
      {!cartUnits ? <Empty title="La venta está vacía." /> : (
        <div class="checkout">
          <section class="checkout__col" aria-label="Productos">
            <h3 class="h3">Productos</h3>
            <CartLines />
            <Field label="Canal de venta">
              <div class="chips">{(Object.keys(CHANNELS) as Channel[]).map((c) => <button type="button" class="chip" aria-pressed={channel === c} onClick={() => setChannel(c)}>{CHANNELS[c]}</button>)}</div>
            </Field>
          </section>
          <section class="checkout__col" aria-label="Pago">
            <h3 class="h3">Pago</h3>
            {rows.map((r, i) => {
              const last = i === rows.length - 1;
              return (
                <div class="pay" key={r.id}>
                  <div class="pay__head">
                    <div class="chips" role="group" aria-label={`Método del pago ${i + 1}`}>{(Object.keys(METHODS) as Method[]).map((m) => <button type="button" class="chip" aria-pressed={r.method === m} onClick={() => set(r.id, { method: m, tendered: null })}>{METHODS[m]}</button>)}</div>
                    {rows.length > 1 && <button class="icon-btn icon-btn--sm" aria-label="Quitar este pago" onClick={() => setRows(rows.filter((x) => x.id !== r.id))}><Icon name="close" size={18} /></button>}
                  </div>
                  {rows.length > 1 && (last
                    ? <p class="pay__rest">El resto: <strong>{crc(amounts[i])}</strong></p>
                    : <Field label="Monto de este pago"><Money value={r.amount} onChange={(n) => set(r.id, { amount: n })} label={`Monto del pago ${i + 1}`} /></Field>)}
                  {r.method === 'efectivo' && (
                    <div class="cash">
                      <Field label="Recibido en efectivo (opcional)"><Money value={r.tendered} onChange={(n) => set(r.id, { tendered: n })} label="Recibido en efectivo" placeholder={String(amounts[i])} /></Field>
                      <div class="chips">{[amounts[i], ...BILLS.filter((b) => b > amounts[i]).slice(0, 3)].map((b, k) => <button type="button" class="chip" onClick={() => set(r.id, { tendered: b })}>{k === 0 ? 'Exacto' : crc(b)}</button>)}</div>
                      {r.tendered !== null && r.tendered >= amounts[i] && <p class="cash__change">Vuelto: <strong>{crc(r.tendered - amounts[i])}</strong></p>}
                      {r.tendered !== null && r.tendered < amounts[i] && <p class="is-sale">Lo recibido no alcanza para este pago.</p>}
                    </div>
                  )}
                </div>
              );
            })}
            {rows.length < 3 && <button class="link-btn" onClick={() => setRows([...rows.slice(0, -1), { ...rows[rows.length - 1], amount: null }, row(rows.some((r) => r.method === 'efectivo') ? 'tarjeta' : 'efectivo')])}><Icon name="plus" size={18} /> Dividir el pago</button>}
            {over && <div class="notice notice--warn">Los pagos suman más que el total ({crc(total)}).</div>}
            {error && <div class="notice notice--warn" role="alert">{error}</div>}
            <div class="cart__total"><span>Total</span><strong>{crc(total)}</strong></div>
          </section>
        </div>
      )}
    </Sheet>
  );
}
