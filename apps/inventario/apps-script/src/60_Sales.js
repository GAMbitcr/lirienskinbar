/** Ventas de uno o varios productos, con pago dividido (SINPE Móvil, tarjeta, efectivo con vuelto). */
var Sales = {
  byClientId: function (cid) {
    if (!cid) return null;
    var rows = Db.rows('sales');
    for (var i = rows.length - 1; i >= 0; i--) if (Util.str(rows[i].client_id) === cid) return rows[i];
    return null;
  },
  find: function (id) {
    var rows = Db.rows('sales');
    for (var i = rows.length - 1; i >= 0; i--) if (Util.str(rows[i].sale_id) === id) return rows[i];
    return null;
  },

  checkout: function (req, session) {
    var cid = Util.str(req.clientId);
    if (!cid) throw new ApiError('INVALID', 'Falta el identificador de la venta.');
    var dup = Sales.byClientId(cid);
    if (dup) return { saleId: Util.str(dup.sale_id), totalCrc: Util.int(dup.total_crc) || 0, duplicate: true };

    var channel = Util.str(req.channel) || 'kiosko';
    if (CONFIG.CHANNELS.indexOf(channel) < 0) throw new ApiError('INVALID', 'Elegí el canal de la venta.');
    var lines = req.lines || [];
    if (!lines.length) throw new ApiError('INVALID', 'Agregá al menos un producto a la venta.');

    var merged = {}, order = [];
    for (var i = 0; i < lines.length; i++) {
      var sku = Util.str(lines[i].sku), qty = Util.int(lines[i].qty);
      if (qty === null || qty <= 0 || qty > CONFIG.MAX_QTY) throw new ApiError('INVALID', 'Revisá las cantidades de la venta.');
      if (!merged[sku]) { merged[sku] = 0; order.push(sku); }
      merged[sku] += qty;
    }
    var total = 0, items = [], short = [];
    for (var k = 0; k < order.length; k++) {
      var s = order[k], v = Catalog.variant(s);
      if (!v) throw new ApiError('NOT_FOUND', 'Uno de los productos ya no existe. Actualizá el inventario.');
      var p = Catalog.product(Util.str(v.product_id));
      if (!Util.bool(v.active) || (p && Util.str(p.status) === 'archived')) throw new ApiError('INVALID', Catalog.label(v) + ' está archivado y no se puede vender.');
      var have = Stock.qty(s);
      if (have < merged[s]) short.push({ sku: s, name: Catalog.label(v), available: have, requested: merged[s] });
      var price = Util.int(v.price_crc) || 0;
      total += price * merged[s];
      items.push({ sku: s, type: 'SALE', qty: -merged[s], unitPrice: price });
    }
    if (short.length) {
      var first = short[0];
      throw new ApiError('STOCK', short.length === 1 ? 'No alcanza ' + first.name + ': ' + (first.available === 0 ? 'está agotado.' : 'solo ' + (first.available === 1 ? 'queda 1.' : 'quedan ' + first.available + '.')) : 'No alcanza el stock de ' + short.length + ' productos.', short);
    }

    var payments = req.payments || [], paid = 0, payRows = [];
    if (!payments.length) throw new ApiError('INVALID', 'Agregá al menos un pago.');
    if (payments.length > 3) throw new ApiError('INVALID', 'Se puede dividir el pago en 3 métodos como máximo.');
    for (var j = 0; j < payments.length; j++) {
      var pay = payments[j], method = Util.str(pay.method), amount = Util.int(pay.amountCrc), tendered = Util.int(pay.tenderedCrc);
      if (CONFIG.METHODS.indexOf(method) < 0) throw new ApiError('INVALID', 'Elegí el método de cada pago.');
      if (amount === null || amount <= 0) throw new ApiError('INVALID', 'Cada pago tiene que ser mayor a ₡0.');
      if (tendered !== null) {
        if (method !== 'efectivo') throw new ApiError('INVALID', 'El vuelto solo aplica a pagos en efectivo.');
        if (tendered < amount) throw new ApiError('INVALID', 'Lo recibido en efectivo no alcanza para ese pago.');
      }
      paid += amount;
      payRows.push({ sale_id: '', method: method, amount_crc: amount, tendered_crc: tendered === null ? '' : tendered });
    }
    if (paid !== total) throw new ApiError('INVALID', 'Los pagos suman ' + Util.crc(paid) + ' y la venta es de ' + Util.crc(total) + '.');

    var year = Util.year();
    var id = 'V-' + year + '-' + Util.pad(Db.nextSeq('sale:' + year, 1, function () { return Db.maxSuffix('sales', 'sale_id', 'V-' + year + '-'); }), 5);
    Db.append('sales', [{ sale_id: id, client_id: cid, ts: Util.now(), user: session.userId, channel: channel, total_crc: total, voided_at: '', voided_by: '', void_note: '' }]);
    for (var r = 0; r < payRows.length; r++) payRows[r].sale_id = id;
    Db.append('sale_payments', payRows);
    for (var m = 0; m < items.length; m++) items[m].ref = id;
    Stock.record(items, session.userId);
    return { saleId: id, totalCrc: total, duplicate: false };
  },

  /** Anula la venta completa: no borra nada, agrega un VOID por producto y devuelve las unidades. */
  voidSale: function (req, session) {
    var sale = Sales.find(Util.str(req.saleId));
    if (!sale) throw new ApiError('NOT_FOUND', 'No encontramos esa venta.');
    if (Util.str(sale.voided_at)) throw new ApiError('CONFLICT', 'Esa venta ya estaba anulada.');
    var note = Util.str(req.note).slice(0, 200);
    if (!note) throw new ApiError('INVALID', 'Contanos por qué se anula la venta.');
    var id = Util.str(sale.sale_id), items = [];
    var collect = function (movements) {
      for (var i = 0; i < movements.length; i++) {
        var m = movements[i];
        if (Util.str(m.ref) === id && Util.str(m.type) === 'SALE') items.push({ sku: Util.str(m.sku), type: 'VOID', qty: -(Util.int(m.qty) || 0), unitPrice: Util.int(m.unit_price_crc), ref: id, note: note });
      }
    };
    collect(Stock.tail(8000));
    if (!items.length) collect(Db.rows('movements')); // venta vieja: buscar en toda la hoja
    if (!items.length) throw new ApiError('NOT_FOUND', 'No encontramos los productos de esa venta.');
    sale.voided_at = Util.now(); sale.voided_by = session.userId; sale.void_note = note;
    Db.update('sales', sale);
    Stock.record(items, session.userId);
    Db.log('info', 'sale.void', session.userId, id + ' · ' + note);
    return { saleId: id };
  },

  /** Ventas de un rango de fechas (YYYY-MM-DD, hora de Costa Rica) con productos y pagos. */
  list: function (req, session) {
    var today = Util.now().slice(0, 10);
    var from = Util.str(req.from) || today, to = Util.str(req.to) || today;
    var sales = Db.rows('sales'), picked = [], ids = {};
    for (var i = sales.length - 1; i >= 0 && picked.length < 500; i--) {
      var s = sales[i], day = Util.str(s.ts).slice(0, 10);
      if (day < from) break;
      if (day > to) continue;
      if (session.role !== 'admin' && Util.str(s.user) !== session.userId) continue;
      var o = { saleId: Util.str(s.sale_id), ts: Util.str(s.ts), user: Util.str(s.user), channel: Util.str(s.channel), totalCrc: Util.int(s.total_crc) || 0, voided: Util.str(s.voided_at) ? { at: Util.str(s.voided_at), by: Util.str(s.voided_by), note: Util.str(s.void_note) } : null, lines: [], payments: [] };
      ids[o.saleId] = o;
      picked.push(o);
    }
    if (!picked.length) return [];
    var pays = Db.rows('sale_payments');
    for (var p = 0; p < pays.length; p++) {
      var sale = ids[Util.str(pays[p].sale_id)];
      if (sale) sale.payments.push({ method: Util.str(pays[p].method), amountCrc: Util.int(pays[p].amount_crc) || 0, tenderedCrc: Util.int(pays[p].tendered_crc) });
    }
    var moves = Stock.tail(6000);
    for (var m = 0; m < moves.length; m++) {
      var mv = moves[m];
      if (Util.str(mv.type) !== 'SALE') continue;
      var target = ids[Util.str(mv.ref)];
      if (target) target.lines.push({ sku: Util.str(mv.sku), qty: -(Util.int(mv.qty) || 0), unitPriceCrc: Util.int(mv.unit_price_crc) || 0 });
    }
    return picked;
  }
};
