/**
 * Existencias y movimientos.
 * `movements` es de solo agregar: nunca se edita ni se borra una fila. La hoja `stock` es un resumen
 * que se actualiza en el mismo candado que el movimiento y se puede recalcular desde `movements`.
 */
var Stock = {
  map: function () {
    var rows = Db.rows('stock'), map = {};
    for (var i = 0; i < rows.length; i++) map[Util.str(rows[i].sku)] = rows[i];
    return map;
  },
  qty: function (sku) {
    var row = Stock.map()[sku];
    return row ? Util.int(row.qty) || 0 : 0;
  },

  /** Agrega movimientos ({sku, type, qty con signo, unitPrice?, ref?, note?, clientId?}) y actualiza `stock`. */
  record: function (items, user, bulk) {
    if (!items.length) return [];
    var year = Util.year(), now = Util.now();
    var first = Db.nextSeq('mov:' + year, items.length, function () { return Db.maxSuffix('movements', 'movement_id', 'M-' + year + '-'); });
    var rows = [], deltas = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      rows.push({ movement_id: 'M-' + year + '-' + Util.pad(first + i, 6), client_id: it.clientId || '', ts: now, sku: it.sku, type: it.type, qty: it.qty, unit_price_crc: it.unitPrice === undefined || it.unitPrice === null ? '' : it.unitPrice, ref: it.ref || '', user: user, note: it.note || '' });
      deltas[it.sku] = (deltas[it.sku] || 0) + it.qty;
    }
    Db._mem.movements = null; // no hace falta tener todo `movements` en memoria para agregar
    Db.append('movements', rows);
    var map = Stock.map(), fresh = [], skus = Object.keys(deltas);
    for (var s = 0; s < skus.length; s++) {
      var sku = skus[s], row = map[sku];
      if (row) { row.qty = (Util.int(row.qty) || 0) + deltas[sku]; row.updated_at = now; if (!bulk) Db.update('stock', row); }
      else fresh.push({ sku: sku, qty: deltas[sku], updated_at: now });
    }
    if (bulk) Db.replaceAll('stock', Db.rows('stock').concat(fresh));
    else Db.append('stock', fresh);
    Catalog.invalidate();
    return rows;
  },

  /** Entradas, ajustes, conteos, devoluciones, merma y testers (solo admin). */
  create: function (req, session) {
    var cid = Util.str(req.clientId);
    var cache = Util.cache();
    if (cid) { var done = cache.get('cid:' + cid); if (done) return JSON.parse(done); }
    var v = Catalog.variant(Util.str(req.sku));
    if (!v) throw new ApiError('NOT_FOUND', 'No encontramos ese producto.');
    var sku = Util.str(v.sku), type = Util.str(req.type);
    if (CONFIG.MANUAL_TYPES.indexOf(type) < 0) throw new ApiError('INVALID', 'Tipo de movimiento desconocido.');
    var current = Stock.qty(sku), n = Util.int(req.qty), delta;
    if (type === 'COUNT') {
      if (n === null || n < 0 || n > CONFIG.MAX_QTY) throw new ApiError('INVALID', 'Escribí cuántas unidades contaste.');
      delta = n - current;
    } else if (type === 'ADJUST') {
      if (n === null || n === 0 || Math.abs(n) > CONFIG.MAX_QTY) throw new ApiError('INVALID', 'Escribí la corrección (por ejemplo -1 o 2).');
      delta = n;
    } else {
      if (n === null || n <= 0 || n > CONFIG.MAX_QTY) throw new ApiError('INVALID', 'La cantidad tiene que ser mayor a cero.');
      delta = type === 'RECEIVE' || type === 'RETURN' ? n : -n;
    }
    if (current + delta < 0) throw new ApiError('STOCK', 'No alcanza: hay ' + current + ' y esto dejaría ' + (current + delta) + '.');
    var note = Util.str(req.note).slice(0, 200);
    if ((type === 'ADJUST' || type === 'WASTE') && !note) throw new ApiError('INVALID', 'Contanos el motivo en la nota.');
    var rows = [];
    if (delta !== 0 || type === 'COUNT') rows = Stock.record([{ sku: sku, type: type, qty: delta, ref: Util.str(req.ref).slice(0, 60), note: note, clientId: cid }], session.userId);
    if (type === 'COUNT') { v.counted_at = Util.now(); Db.update('variants', v); }
    var out = { sku: sku, stock: current + delta, movementId: rows.length ? rows[0].movement_id : null };
    if (cid) cache.put('cid:' + cid, JSON.stringify(out), 21600);
    return out;
  },

  /** Lee las últimas filas de `movements` (la hoja crece; el historial solo necesita lo reciente). */
  tail: function (limit) {
    var sh = Db.sheet('movements'), cols = SCHEMA.movements;
    var last = sh.getLastRow();
    if (last < 2) return [];
    var start = Math.max(2, last - limit + 1);
    var values = sh.getRange(start, 1, last - start + 1, cols.length).getValues();
    var out = [];
    for (var r = 0; r < values.length; r++) {
      if (Util.str(values[r][0]) === '') continue;
      var o = {};
      for (var k = 0; k < cols.length; k++) o[cols[k]] = values[r][k];
      out.push(o);
    }
    return out;
  },

  list: function (req, session) {
    var rows = Stock.tail(4000), out = [];
    var sku = Util.str(req.sku), from = Util.str(req.from), limit = Math.min(Util.int(req.limit) || 200, 500);
    for (var i = rows.length - 1; i >= 0 && out.length < limit; i--) {
      var m = rows[i];
      if (sku && Util.str(m.sku) !== sku) continue;
      if (from && Util.str(m.ts) < from) break;
      if (session.role !== 'admin' && Util.str(m.user) !== session.userId) continue;
      out.push({ id: Util.str(m.movement_id), ts: Util.str(m.ts), sku: Util.str(m.sku), type: Util.str(m.type), qty: Util.int(m.qty) || 0, unitPriceCrc: Util.int(m.unit_price_crc), ref: Util.str(m.ref), user: Util.str(m.user), note: Util.str(m.note) });
    }
    return out;
  },

  /** Recalcula la hoja `stock` sumando todos los movimientos. Devuelve cuántos SKU no cuadraban. */
  rebuild: function () {
    var movements = Db.rows('movements'), sums = {};
    for (var i = 0; i < movements.length; i++) { var sku = Util.str(movements[i].sku); sums[sku] = (sums[sku] || 0) + (Util.int(movements[i].qty) || 0); }
    var current = Stock.map(), now = Util.now(), rows = [], diffs = 0;
    var variants = Db.rows('variants');
    for (var v = 0; v < variants.length; v++) {
      var s = Util.str(variants[v].sku), qty = sums[s] || 0;
      var before = current[s] ? Util.int(current[s].qty) || 0 : 0;
      if (before !== qty) diffs++;
      rows.push({ sku: s, qty: qty, updated_at: before === qty && current[s] ? Util.str(current[s].updated_at) : now });
    }
    Db.replaceAll('stock', rows);
    Catalog.invalidate();
    if (diffs) Db.log('warn', 'stock.rebuild', '', diffs + ' SKU no cuadraban con movements');
    return diffs;
  }
};
