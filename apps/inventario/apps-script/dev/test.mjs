// Pruebas del backend con hojas simuladas: node dev/test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackend } from './gas.mjs';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const PIN = '246813';

/** Backend nuevo con catálogo base, una admin (Karol) y una colaboradora (Fiorella) ya activadas. */
function setup({ seed = true, clock } = {}) {
  const be = createBackend(clock ? { now: () => clock.t } : {});
  be.context.Db.setup();
  if (seed) be.context.Seed.load();
  const mk = (name, role) => {
    const u = be.context.Auth.createUser({ name, role }, null);
    const s = be.call({ action: 'auth.activate', userId: u.userId, code: u.activationCode, pin: PIN });
    assert.equal(s.ok, true, JSON.stringify(s.error));
    return s.data.token;
  };
  const admin = mk('Karol', 'admin');
  const staff = mk('Fiorella', 'staff');
  const api = (token) => (action, body = {}) => be.call({ action, token, ...body });
  return { be, admin: api(admin), staff: api(staff), anon: api(''), adminToken: admin };
}
const ok = (r) => { assert.equal(r.ok, true, r.error ? `${r.error.code}: ${r.error.message}` : ''); return r.data; };
const fail = (r, code) => { assert.equal(r.ok, false, 'esperaba un error'); assert.equal(r.error.code, code, r.error.message); return r.error; };
const cid = () => 'c-' + Math.random().toString(36).slice(2);
const stockOf = (ctx, sku) => ok(ctx.admin('catalog')).products.flatMap((p) => p.variants).find((v) => v.sku === sku).stock;
const withStock = (ctx, min = 2) => ok(ctx.admin('catalog')).products.flatMap((p) => p.variants.map((v) => ({ ...v, p }))).filter((v) => v.stock >= min);

/* ---------- Instalación y catálogo ---------- */
test('configurar hojas crea todas las hojas con sus encabezados y no borra datos', () => {
  const { be } = setup();
  for (const name of Object.keys(be.context.SCHEMA)) assert.deepEqual(be.ss.getSheetByName(name).data[0].join(), be.context.SCHEMA[name].join());
  const before = be.ss.table('variants').length;
  be.context.Db.setup();
  assert.equal(be.ss.table('variants').length, before);
});
test('la carga base trae 518 productos, 531 SKU y 763 unidades, una sola vez', () => {
  const { be } = setup();
  assert.equal(be.ss.table('products').length, 518);
  assert.equal(be.ss.table('variants').length, 531);
  assert.equal(be.ss.table('stock').reduce((n, r) => n + r.qty, 0), 763);
  assert.equal(be.ss.table('movements').every((m) => m.type === 'INITIAL'), true);
  assert.throws(() => be.context.Seed.load(), (e) => e.code === 'CONFLICT');
});
test('el catálogo trae variantes con stock y sale igual desde la caché (en trozos de menos de 100 KB)', () => {
  const ctx = setup();
  const a = ok(ctx.staff('catalog'));
  assert.equal(a.products.length, 518);
  assert.ok([...ctx.be.cache.keys()].filter((k) => k.startsWith('cat:')).length >= 3);
  ctx.be.ss.getSheetByName('products').data.length = 1; // aunque la hoja cambie, la caché responde
  assert.equal(ok(ctx.staff('catalog')).products.length, 518);
});
test('códigos de barras y SKU se guardan como texto', () => {
  const ctx = setup();
  const v = withStock(ctx)[0];
  ok(ctx.admin('barcode.link', { sku: v.sku, barcode: '0880967969849' }));
  const row = ctx.be.ss.table('variants').find((r) => r.sku === v.sku);
  assert.equal(row.barcode, '0880967969849');
  assert.equal(typeof row.price_crc, 'number');
});

/* ---------- Ingreso, PIN y activación ---------- */
test('sin sesión no se ve el catálogo; la lista pública no expone hashes', () => {
  const ctx = setup();
  fail(ctx.anon('catalog'), 'AUTH');
  const pub = ok(ctx.anon('users.public')).users;
  assert.deepEqual(Object.keys(pub[0]).sort(), ['hasPin', 'name', 'role', 'userId']);
});
test('una persona nueva crea su PIN de 6 dígitos con el código de activación (un solo uso)', () => {
  const ctx = setup();
  const u = ok(ctx.admin('user.create', { name: 'Neisy', role: 'admin' }));
  assert.match(u.activationCode, /^\d{8}$/);
  assert.equal(ok(ctx.anon('users.public')).users.find((x) => x.userId === 'neisy').hasPin, false);
  fail(ctx.anon('auth.login', { userId: 'neisy', pin: PIN }), 'NEEDS_ACTIVATION');
  const s = ok(ctx.anon('auth.activate', { userId: 'neisy', code: u.activationCode, pin: '905172' }));
  assert.equal(s.role, 'admin');
  fail(ctx.anon('auth.activate', { userId: 'neisy', code: u.activationCode, pin: '905173' }), 'INVALID');
  ok(ctx.anon('auth.login', { userId: 'neisy', pin: '905172' }));
  const row = ctx.be.ss.table('users').find((r) => r.user_id === 'neisy');
  assert.equal(row.activation_hash, '');
  assert.match(row.pin_hash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(ctx.be.ss.table('users')).includes('905172'), false);
});
test('el PIN tiene que ser de 6 dígitos y no puede ser obvio', () => {
  const ctx = setup();
  for (const pin of ['1234', '12345a', '1234567', '111111', '123456', '654321', '121212']) {
    const u = ok(ctx.admin('user.create', { name: 'Persona ' + pin, role: 'staff' }));
    fail(ctx.anon('auth.activate', { userId: u.userId, code: u.activationCode, pin }), 'INVALID');
  }
});
test('el código de activación vence a las 72 horas', () => {
  const clock = { t: Date.parse('2026-11-24T10:00:00-06:00') };
  const ctx = setup({ clock });
  const u = ok(ctx.admin('user.create', { name: 'Ana', role: 'staff' }));
  clock.t += 73 * 3600 * 1000;
  assert.equal(ok(ctx.anon('users.public')).users.some((x) => x.userId === 'ana'), false);
  fail(ctx.anon('auth.activate', { userId: 'ana', code: u.activationCode, pin: '905172' }), 'INVALID');
});
test('5 PIN incorrectos bloquean 15 minutos, también con el PIN correcto', () => {
  const clock = { t: Date.parse('2026-11-24T10:00:00-06:00') };
  const ctx = setup({ clock });
  for (let i = 0; i < 5; i++) fail(ctx.anon('auth.login', { userId: 'fiorella', pin: '000001' }), 'AUTH');
  fail(ctx.anon('auth.login', { userId: 'fiorella', pin: PIN }), 'LOCKED');
  ok(ctx.anon('auth.login', { userId: 'karol', pin: PIN })); // el bloqueo es por persona
  clock.t += 16 * 60 * 1000;
  ok(ctx.anon('auth.login', { userId: 'fiorella', pin: PIN }));
});
test('el freno general corta los intentos masivos contra muchas personas', () => {
  const ctx = setup();
  for (let i = 0; i < 12; i++) {
    const u = ok(ctx.admin('user.create', { name: 'Masiva ' + i, role: 'staff' }));
    for (let k = 0; k < 4; k++) ctx.anon('auth.activate', { userId: u.userId, code: '00000000', pin: '905172' });
  }
  fail(ctx.anon('auth.login', { userId: 'karol', pin: '000001' }), 'LOCKED');
});
test('la sesión dura 12 horas y cerrar sesión la invalida', () => {
  const clock = { t: Date.parse('2026-11-24T10:00:00-06:00') };
  const ctx = setup({ clock });
  const s = ok(ctx.anon('auth.login', { userId: 'karol', pin: PIN }));
  const mine = (action) => ctx.be.call({ action, token: s.token });
  ok(mine('catalog'));
  ok(mine('auth.logout'));
  fail(mine('catalog'), 'AUTH');
  clock.t += 13 * 3600 * 1000;
  fail(ctx.admin('catalog'), 'AUTH');
});
test('cambiar el PIN pide el actual y cierra las otras sesiones', () => {
  const ctx = setup();
  fail(ctx.staff('auth.changePin', { currentPin: '000001', newPin: '905172' }), 'AUTH');
  fail(ctx.staff('auth.changePin', { currentPin: PIN, newPin: PIN }), 'INVALID');
  const s = ok(ctx.staff('auth.changePin', { currentPin: PIN, newPin: '905172' }));
  fail(ctx.staff('catalog'), 'AUTH');
  ok(ctx.be.call({ action: 'catalog', token: s.token }));
  ok(ctx.anon('auth.login', { userId: 'fiorella', pin: '905172' }));
});
test('restablecer: el PIN viejo deja de servir y hay código nuevo', () => {
  const ctx = setup();
  const r = ok(ctx.admin('user.resetPin', { userId: 'fiorella' }));
  fail(ctx.staff('catalog'), 'AUTH');
  fail(ctx.anon('auth.login', { userId: 'fiorella', pin: PIN }), 'NEEDS_ACTIVATION');
  ok(ctx.anon('auth.activate', { userId: 'fiorella', code: r.activationCode, pin: '905172' }));
});
test('solo admin gestiona personas; siempre queda una admin activa', () => {
  const ctx = setup();
  fail(ctx.staff('user.create', { name: 'X Y', role: 'staff' }), 'FORBIDDEN');
  fail(ctx.staff('users.list'), 'FORBIDDEN');
  fail(ctx.admin('user.update', { userId: 'karol', role: 'staff' }), 'INVALID');
  fail(ctx.admin('user.update', { userId: 'karol', active: false }), 'INVALID');
  fail(ctx.admin('user.create', { name: 'Fiorella', role: 'staff' }), 'CONFLICT');
  ok(ctx.admin('user.update', { userId: 'fiorella', active: false }));
  fail(ctx.staff('catalog'), 'AUTH');
  fail(ctx.anon('auth.login', { userId: 'fiorella', pin: PIN }), 'AUTH');
  assert.equal(ok(ctx.admin('users.list')).find((u) => u.userId === 'fiorella').active, false);
});

/* ---------- Ventas ---------- */
test('venta de varios productos con pago dividido: descuenta stock y registra todo', () => {
  const ctx = setup();
  const [a, b] = withStock(ctx, 2);
  const total = a.priceCrc * 2 + b.priceCrc;
  const r = ok(ctx.staff('sale.checkout', { clientId: cid(), channel: 'kiosko', lines: [{ sku: a.sku, qty: 2 }, { sku: b.sku, qty: 1 }], payments: [{ method: 'sinpe', amountCrc: 5000 }, { method: 'efectivo', amountCrc: total - 5000, tenderedCrc: total }] }));
  assert.match(r.saleId, /^V-2026-00001$/);
  assert.equal(r.totalCrc, total);
  assert.equal(stockOf(ctx, a.sku), a.stock - 2);
  assert.equal(stockOf(ctx, b.sku), b.stock - 1);
  const moves = ctx.be.ss.table('movements').filter((m) => m.ref === r.saleId);
  assert.deepEqual(moves.map((m) => [m.type, m.qty, m.user]), [['SALE', -2, 'fiorella'], ['SALE', -1, 'fiorella']]);
  assert.equal(ctx.be.ss.table('sale_payments').filter((p) => p.sale_id === r.saleId).reduce((n, p) => n + p.amount_crc, 0), total);
});
test('reintentar la misma venta (mala señal) no la duplica', () => {
  const ctx = setup();
  const a = withStock(ctx)[0];
  const body = { clientId: cid(), lines: [{ sku: a.sku, qty: 1 }], payments: [{ method: 'tarjeta', amountCrc: a.priceCrc }] };
  const first = ok(ctx.staff('sale.checkout', body));
  const second = ok(ctx.staff('sale.checkout', body));
  assert.equal(second.saleId, first.saleId);
  assert.equal(second.duplicate, true);
  assert.equal(stockOf(ctx, a.sku), a.stock - 1);
  assert.equal(ctx.be.ss.table('sales').length, 1);
});
test('no se vende más de lo que hay, ni con pagos que no suman', () => {
  const ctx = setup();
  const a = withStock(ctx)[0];
  const err = fail(ctx.staff('sale.checkout', { clientId: cid(), lines: [{ sku: a.sku, qty: a.stock + 1 }], payments: [{ method: 'sinpe', amountCrc: a.priceCrc * (a.stock + 1) }] }), 'STOCK');
  assert.equal(err.details[0].available, a.stock);
  fail(ctx.staff('sale.checkout', { clientId: cid(), lines: [{ sku: a.sku, qty: 1 }], payments: [{ method: 'sinpe', amountCrc: a.priceCrc - 1 }] }), 'INVALID');
  fail(ctx.staff('sale.checkout', { clientId: cid(), lines: [{ sku: a.sku, qty: 1 }], payments: [{ method: 'tarjeta', amountCrc: a.priceCrc, tenderedCrc: a.priceCrc }] }), 'INVALID');
  fail(ctx.staff('sale.checkout', { clientId: cid(), lines: [{ sku: a.sku, qty: 1 }], payments: [{ method: 'efectivo', amountCrc: a.priceCrc, tenderedCrc: a.priceCrc - 100 }] }), 'INVALID');
  fail(ctx.staff('sale.checkout', { clientId: cid(), lines: [{ sku: a.sku, qty: 0 }], payments: [] }), 'INVALID');
  assert.equal(stockOf(ctx, a.sku), a.stock);
  assert.equal(ctx.be.ss.table('sales').length, 0);
});
test('anular una venta devuelve las unidades con movimientos VOID y no borra nada (solo admin)', () => {
  const ctx = setup();
  const a = withStock(ctx)[0];
  const sale = ok(ctx.staff('sale.checkout', { clientId: cid(), lines: [{ sku: a.sku, qty: 2 }], payments: [{ method: 'sinpe', amountCrc: a.priceCrc * 2 }] }));
  const before = ctx.be.ss.table('movements').length;
  fail(ctx.staff('sale.void', { saleId: sale.saleId, note: 'error' }), 'FORBIDDEN');
  fail(ctx.admin('sale.void', { saleId: sale.saleId }), 'INVALID');
  ok(ctx.admin('sale.void', { saleId: sale.saleId, note: 'Se cobró dos veces' }));
  fail(ctx.admin('sale.void', { saleId: sale.saleId, note: 'otra vez' }), 'CONFLICT');
  assert.equal(stockOf(ctx, a.sku), a.stock);
  const all = ctx.be.ss.table('movements');
  assert.equal(all.length, before + 1);
  assert.deepEqual([all.at(-1).type, all.at(-1).qty, all.at(-1).ref], ['VOID', 2, sale.saleId]);
  assert.ok(ctx.be.ss.table('sales')[0].voided_at);
});
test('historial de ventas: la colaboradora ve las suyas y la admin todas, con productos y pagos', () => {
  const ctx = setup();
  const [a, b] = withStock(ctx);
  ok(ctx.staff('sale.checkout', { clientId: cid(), lines: [{ sku: a.sku, qty: 1 }], payments: [{ method: 'efectivo', amountCrc: a.priceCrc, tenderedCrc: a.priceCrc + 1000 }] }));
  ok(ctx.admin('sale.checkout', { clientId: cid(), channel: 'whatsapp', lines: [{ sku: b.sku, qty: 1 }], payments: [{ method: 'sinpe', amountCrc: b.priceCrc }] }));
  const mine = ok(ctx.staff('sales'));
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0].lines, [{ sku: a.sku, qty: 1, unitPriceCrc: a.priceCrc }]);
  assert.deepEqual(mine[0].payments, [{ method: 'efectivo', amountCrc: a.priceCrc, tenderedCrc: a.priceCrc + 1000 }]);
  assert.equal(ok(ctx.admin('sales')).length, 2);
  assert.equal(ok(ctx.admin('sales', { from: '2020-01-01', to: '2020-01-02' })).length, 0);
});

/* ---------- Movimientos manuales ---------- */
test('entradas, conteos y correcciones solo las hace admin y cuadran el stock', () => {
  const ctx = setup();
  const a = withStock(ctx)[0];
  fail(ctx.staff('movement.create', { sku: a.sku, type: 'RECEIVE', qty: 3 }), 'FORBIDDEN');
  assert.equal(ok(ctx.admin('movement.create', { sku: a.sku, type: 'RECEIVE', qty: 3, ref: 'Factura 12', clientId: cid() })).stock, a.stock + 3);
  assert.equal(ok(ctx.admin('movement.create', { sku: a.sku, type: 'COUNT', qty: 1 })).stock, 1);
  assert.ok(ctx.be.ss.table('variants').find((r) => r.sku === a.sku).counted_at);
  fail(ctx.admin('movement.create', { sku: a.sku, type: 'ADJUST', qty: -1 }), 'INVALID'); // falta el motivo
  fail(ctx.admin('movement.create', { sku: a.sku, type: 'WASTE', qty: 5, note: 'se quebró' }), 'STOCK');
  assert.equal(ok(ctx.admin('movement.create', { sku: a.sku, type: 'TESTER', qty: 1 })).stock, 0);
  const c = cid();
  ok(ctx.admin('movement.create', { sku: a.sku, type: 'RETURN', qty: 1, clientId: c }));
  ok(ctx.admin('movement.create', { sku: a.sku, type: 'RETURN', qty: 1, clientId: c })); // reintento
  assert.equal(stockOf(ctx, a.sku), 1);
  const list = ok(ctx.admin('movements', { sku: a.sku }));
  assert.deepEqual(list.map((m) => m.type), ['RETURN', 'TESTER', 'COUNT', 'RECEIVE', 'INITIAL']);
});
test('recalcular stock corrige una hoja editada a mano', () => {
  const ctx = setup();
  const a = withStock(ctx)[0];
  const sheet = ctx.be.ss.getSheetByName('stock');
  sheet.data.find((r) => r[0] === a.sku)[1] = 99;
  ctx.be.context.Db.reset();
  assert.equal(ctx.be.context.Stock.rebuild(), 1);
  assert.equal(stockOf(ctx, a.sku), a.stock);
});

/* ---------- Productos ---------- */
test('crear un producto con variantes y stock inicial; editarlo; archivarlo', () => {
  const ctx = setup();
  fail(ctx.staff('product.upsert', { product: {} }), 'FORBIDDEN');
  const body = { vendor: 'TIRTIR', title: 'Prueba Cushion', category: 'Maquillaje', description: '', optionName: 'Tono', variants: [
    { optionValue: '17N Vanilla', priceCrc: 15500, compareAtCrc: null, barcode: '8809679698493', displayLocation: 'URNA 2', minStock: 2, active: true, initialStock: 3 },
    { optionValue: '21N Ivory', priceCrc: 15500, compareAtCrc: 17000, barcode: '', displayLocation: 'URNA 2', minStock: 1, active: true },
  ] };
  const { id } = ok(ctx.admin('product.upsert', { product: body }));
  assert.equal(id, 'P-0519');
  let p = ok(ctx.admin('catalog')).products.find((x) => x.id === id);
  assert.deepEqual(p.variants.map((v) => [v.sku, v.stock, v.compareAtCrc]), [['LIR-00532', 3, null], ['LIR-00533', 0, 17000]]);
  assert.equal(ctx.be.ss.table('movements').at(-1).note, 'Alta de producto');
  fail(ctx.admin('product.upsert', { product: { ...body, title: 'Otro', variants: [{ ...body.variants[0] }] } }), 'CONFLICT'); // código repetido
  fail(ctx.admin('product.upsert', { product: { ...body, optionName: '', variants: body.variants.map((v) => ({ ...v, barcode: '' })) } }), 'INVALID');
  fail(ctx.admin('product.upsert', { product: { ...body, variants: [{ ...body.variants[1], compareAtCrc: 100 }] } }), 'INVALID');
  ok(ctx.admin('product.upsert', { product: { id, ...body, title: 'Prueba Cushion 2', variants: [{ sku: 'LIR-00532', ...body.variants[0], priceCrc: 16000, initialStock: 50 }, { sku: 'LIR-00533', ...body.variants[1], active: false }] } }));
  p = ok(ctx.admin('catalog')).products.find((x) => x.id === id);
  assert.equal(p.handle, 'tirtir-prueba-cushion-2');
  assert.deepEqual(p.variants.map((v) => [v.priceCrc, v.stock, v.active]), [[16000, 3, true], [15500, 0, false]]);
  ok(ctx.admin('product.archive', { id }));
  fail(ctx.staff('sale.checkout', { clientId: cid(), lines: [{ sku: 'LIR-00532', qty: 1 }], payments: [{ method: 'sinpe', amountCrc: 16000 }] }), 'INVALID');
  ok(ctx.admin('product.archive', { id, archived: false }));
  assert.equal(ctx.be.ss.table('products').length, 519);
});
test('asociar código de barras: único, y solo admin', () => {
  const ctx = setup();
  const [a, b] = withStock(ctx);
  fail(ctx.staff('barcode.link', { sku: a.sku, barcode: '8809679698493' }), 'FORBIDDEN');
  ok(ctx.admin('barcode.link', { sku: a.sku, barcode: '8809679698493' }));
  assert.match(fail(ctx.admin('barcode.link', { sku: b.sku, barcode: '8809679698493' }), 'CONFLICT').message, new RegExp(a.p.vendor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  fail(ctx.admin('barcode.link', { sku: b.sku, barcode: '!!' }), 'INVALID');
});

/* ---------- Importación ---------- */
const legacy = (ctx) => ctx.be.ss.table('variants').flatMap((v) => {
  const qty = ctx.be.ss.table('stock').find((s) => s.sku === v.sku).qty;
  const names = v.legacy_name.split(' / ');
  const compare = v.compare_at_crc === '' ? null : v.compare_at_crc;
  return names.map((name, i) => ({ name, price: String(compare ?? v.price_crc).replace(/(\d)(?=(\d{3})+$)/g, '$1 '), stock: i === 0 ? qty : 0, location: v.display_location, offer: compare === null ? '' : v.price_crc }));
});
test('importar el mismo Sheet no cambia nada (empareja las 536 filas por nombre)', () => {
  const ctx = setup();
  const rows = legacy(ctx);
  assert.equal(rows.length, 536);
  const p = ok(ctx.admin('import.preview', { rows }));
  assert.deepEqual([p.summary.matched, p.summary.priceChanges, p.summary.stockChanges, p.summary.newItems, p.summary.missing], [531, 0, 0, 0, 0]);
});
test('vista previa: precios, oferta, stock, urna, productos nuevos y faltantes; no escribe nada', () => {
  const ctx = setup();
  const rows = legacy(ctx);
  const before = JSON.stringify([ctx.be.ss.table('variants'), ctx.be.ss.table('stock'), ctx.be.ss.table('movements').length]);
  rows[0].price = '99 900';                       // cambio de precio
  rows[1].stock = Number(rows[1].stock) + 4;      // diferencia de stock
  rows[2].offer = 500; rows[2].price = '20 000';  // oferta
  rows[3].location = '3 urna 5 INV';              // urna + inventariado
  const removed = rows.splice(10, 1)[0];          // ya no viene en el archivo
  rows.push({ name: 'COSRX PRUEBA NUEVA ESSENCE 100ML', price: '14 500', stock: 2, location: 'URNA 1', offer: '' });
  rows.push({ name: 'MARCANUEVA GLOW SERUM MINI', price: '8 000', stock: 1, location: '', offer: '' });
  rows.push({ name: 'COSRX SIN PRECIO', price: '', stock: 1, location: '', offer: '' });
  const p = ok(ctx.admin('import.preview', { rows }));
  assert.equal(p.summary.priceChanges, 2);
  assert.equal(p.summary.stockChanges, 1);
  assert.equal(p.summary.stockUnitsDelta, 4);
  assert.equal(p.summary.newItems, 2);
  assert.equal(p.summary.missing, 1);
  assert.equal(p.missing[0].name.length > 0 && !!removed, true);
  const cosrx = p.news.find((n) => n.vendor === 'COSRX');
  assert.deepEqual([cosrx.title, cosrx.category, cosrx.price, cosrx.stock], ['Prueba Nueva Essence 100 ml', 'Skincare', 14500, 2]);
  const nueva = p.news.find((n) => n.vendor === 'Marcanueva');
  assert.deepEqual([nueva.title, nueva.optionName, nueva.optionValue], ['Glow Serum', 'Tamaño', 'Mini']);
  assert.ok(p.warnings.some((w) => w.kind === 'marca'));
  assert.ok(p.warnings.some((w) => w.kind === 'precio' && /nuevo sin precio/.test(w.message)));
  assert.deepEqual(p.changes.find((c) => c.location).location.to, 'URNA 5');
  assert.equal(JSON.stringify([ctx.be.ss.table('variants'), ctx.be.ss.table('stock'), ctx.be.ss.table('movements').length]), before);
  fail(ctx.staff('import.preview', { rows }), 'FORBIDDEN');
});
test('aplicar: actualiza precios, registra COUNT por las diferencias y crea lo nuevo sin tocar movimientos viejos', () => {
  const ctx = setup();
  const rows = legacy(ctx);
  const target = ctx.be.ss.table('variants').find((v) => v.legacy_name === rows[1].name);
  const oldQty = ctx.be.ss.table('stock').find((s) => s.sku === target.sku).qty;
  rows[0].price = '99 900';
  rows[1].stock = oldQty + 4;
  rows.push({ name: 'COSRX PRUEBA NUEVA ESSENCE 100ML', price: '14 500', stock: 2, location: 'URNA 1', offer: '' });
  const movesBefore = ctx.be.ss.table('movements');
  const c = cid();
  const r = ok(ctx.admin('import.apply', { rows, clientId: c }));
  assert.deepEqual(r.applied, { variantsUpdated: 2, productsCreated: 1, variantsCreated: 1, movements: 2 });
  ok(ctx.admin('import.apply', { rows, clientId: c })); // reintento: no duplica
  const moves = ctx.be.ss.table('movements');
  assert.deepEqual(moves.slice(0, movesBefore.length), movesBefore);
  assert.deepEqual(moves.slice(movesBefore.length).map((m) => [m.type, m.qty, m.user]), [['COUNT', 4, 'karol'], ['INITIAL', 2, 'karol']]);
  assert.equal(stockOf(ctx, target.sku), oldQty + 4);
  const created = ok(ctx.admin('catalog')).products.find((p) => p.title === 'Prueba Nueva Essence 100 ml');
  assert.deepEqual([created.id, created.variants[0].sku, created.variants[0].stock, created.variants[0].priceCrc], ['P-0519', 'LIR-00532', 2, 14500]);
  const again = ok(ctx.admin('import.preview', { rows }));
  assert.deepEqual([again.summary.priceChanges, again.summary.stockChanges, again.summary.newItems], [0, 0, 0]);
  assert.equal(ctx.be.context.Stock.rebuild(), 0); // la hoja stock cuadra con movements
});
test('una fila MINI de un producto existente se agrega como variante de tamaño', () => {
  const ctx = setup();
  const single = ok(ctx.admin('catalog')).products.find((p) => p.variants.length === 1 && !p.optionName && p.vendor === 'Anua');
  const legacyName = ctx.be.ss.table('variants').find((v) => v.sku === single.variants[0].sku).legacy_name;
  ok(ctx.admin('import.apply', { rows: [{ name: legacyName + ' MINI', price: 5000, stock: 1 }], options: { stock: true }, clientId: cid() }));
  const p = ok(ctx.admin('catalog')).products.find((x) => x.id === single.id);
  assert.equal(p.optionName, 'Tamaño');
  assert.deepEqual(p.variants.map((v) => v.optionValue), ['Estándar', 'Mini']);
});
test('lo que exporta la app se vuelve a importar sin cambios, y los cambios por SKU se aplican', () => {
  const ctx = setup();
  const exported = ok(ctx.admin('export')).rows;
  assert.equal(exported.length, 531);
  const rows = exported.map((r) => ({ sku: r.sku, name: `${r.vendor} ${r.title} ${r.option}`.trim(), price: r.price, stock: r.stock, location: r.location, offer: r.offer ?? '' }));
  const same = ok(ctx.admin('import.preview', { rows }));
  assert.deepEqual([same.summary.priceChanges, same.summary.stockChanges, same.summary.newItems, same.summary.missing], [0, 0, 0, 0]);
  rows[5].name = 'Nombre cambiado a mano';
  rows[5].stock += 2;
  const p = ok(ctx.admin('import.preview', { rows, options: { prices: false } }));
  assert.deepEqual([p.summary.stockChanges, p.summary.newItems, p.changes[0].sku], [1, 0, rows[5].sku]);
  fail(ctx.staff('export'), 'FORBIDDEN');
});

/* ---------- Menú del Sheet y robustez ---------- */
test('menú: agregar persona muestra el código y restablecer genera otro', () => {
  const { be } = setup();
  be.ui.answers.push('José Pablo', 'YES');
  be.context.menuAddUser();
  const code = /(\d{4}) (\d{4})/.exec(be.ui.alerts.at(-1));
  assert.ok(code);
  assert.equal(be.call({ action: 'auth.activate', userId: 'jose-pablo', code: code[1] + code[2], pin: '905172' }).data.role, 'admin');
  be.ui.answers.push('josé pablo');
  be.context.menuResetPin();
  assert.match(be.ui.alerts.at(-1), /\d{4} \d{4}/);
});
test('menú: importar desde la pestaña "legacy" con confirmación', () => {
  const ctx = setup();
  const sheet = ctx.be.ss.insertSheet('legacy');
  const rows = legacy(ctx);
  sheet.data = [['ƒ', 'Precio final', 'Existencias', '', 'Precio oferta'], ...rows.map((r) => [r.name, r.price, r.stock, r.location, r.offer])];
  sheet.data[1][2] = Number(sheet.data[1][2]) + 1;
  ctx.be.ui.answers.push('YES');
  ctx.be.context.menuImportLegacy();
  assert.match(ctx.be.ui.alerts.at(-2), /1 diferencias de stock \(\+1 unidades\)/);
  assert.match(ctx.be.ui.alerts.at(-1), /1 movimientos registrados/);
});
test('aviso diario: recalcula y manda correo solo si hay últimas unidades', () => {
  const { be } = setup();
  be.context.Util.props().setProperty('ALERT_EMAIL', 'karol@example.com');
  be.context.dailyDigest();
  assert.equal(be.mails.length, 1);
  assert.match(be.mails[0].subject, /últimas unidades/);
});
test('solicitudes inválidas responden con error legible y los errores internos no filtran detalles', () => {
  const ctx = setup();
  assert.equal(JSON.parse(ctx.be.raw('esto no es json')).error.code, 'INVALID');
  fail(ctx.admin('accion.que.no.existe'), 'INVALID');
  ctx.be.ss.getSheetByName('variants').data[0][0] = 'otra_cosa';
  ctx.be.cache.clear();
  fail(ctx.admin('catalog'), 'SETUP');
  ctx.be.context.Catalog.build = () => { throw new Error('secreto interno'); };
  ctx.be.ss.getSheetByName('variants').data[0][0] = 'sku';
  const e = fail(ctx.admin('catalog'), 'SERVER');
  assert.equal(e.message.includes('secreto'), false);
  assert.ok(ctx.be.ss.table('log').some((l) => l.level === 'error'));
});
test('el código es compatible con el arnés: sin `??` ni `?.` en src/', () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  for (const f of readdirSync(src).filter((x) => x.endsWith('.js') && x !== '96_SeedData.js')) {
    const code = readFileSync(join(src, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').replace(/'(?:[^'\\]|\\.)*'/g, "''");
    assert.equal(/\?\?|\?\./.test(code), false, f);
  }
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('  ✓ ' + t.name); } catch (e) { failed++; console.log('  ✗ ' + t.name + '\n    ' + String(e && e.message ? e.message : e).split('\n').slice(0, 6).join('\n    ')); }
}
console.log(`\n${tests.length - failed} de ${tests.length} pruebas pasaron`);
process.exit(failed ? 1 : 0);
