/**
 * Importación del inventario desde Excel o Google Sheets (el archivo se lee en la app y acá llegan las filas).
 * Acepta el formato del Sheet de siempre (Nombre · Precio final · Existencias · Urna · Precio oferta)
 * y el archivo que exporta la app (con columna SKU).
 *
 * `preview` no escribe nada: devuelve qué cambiaría. `apply` vuelve a calcular y escribe:
 * precios y urnas en `variants`, productos nuevos, y las diferencias de stock como movimientos COUNT
 * (nada se edita ni se borra en `movements`).
 */
var Import = {
  UPPER: ['SPF', 'PDRN', 'AHA', 'BHA', 'PHA', 'LHA', 'UV', 'BB', 'CC', 'ML', 'OZ', 'XL', 'AI', 'TXA', 'PA', 'HD', 'DNA', 'NAD', 'EGF', 'II', 'III'],
  SIZES: { MINI: 'Mini', GRANDE: 'Grande', PEQUENO: 'Pequeño', MEDIANO: 'Mediano' },
  PACKS: { INDIVIDUAL: 'Individual', CAJA: 'Caja' },

  /** "URNA 2", "22 urna 1", "INV", "URNA 1, URNA 2 · FALTA 1" → { location, counted, note } */
  parseLocation: function (text) {
    var t = Util.str(text), urnas = [], m, re = /URNAS?\s*(\d)/gi;
    while ((m = re.exec(t))) { var u = 'URNA ' + m[1]; if (urnas.indexOf(u) < 0) urnas.push(u); }
    var counted = /(^|[^A-Z])INV([^A-Z]|$)/i.test(t);
    var note = t.replace(/\d*\s*URNAS?\s*\d/gi, ' ').replace(/(^|[^A-Z])INV([^A-Z]|$)/gi, ' ').replace(/[,;·\-\/]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { location: urnas.sort().join(', '), counted: counted, note: note };
  },

  titleCase: function (text) {
    var words = Util.str(text).split(/\s+/), out = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i], up = w.toUpperCase();
      if (!w) continue;
      if (/\d/.test(w) || Import.UPPER.indexOf(up) >= 0) out.push(/^\d+(ML|G|OZ)$/i.test(w) ? w.toLowerCase().replace(/(\d)([a-z])/, '$1 $2') : up);
      else out.push(up.charAt(0) + up.slice(1).toLowerCase());
    }
    return out.join(' ');
  },

  /** Normaliza una fila cruda del archivo. */
  parseRow: function (raw, index) {
    var name = Util.str(raw.name).replace(/\s+/g, ' ');
    var row = { line: Util.int(raw.line) || index + 1, sku: Util.str(raw.sku).toUpperCase(), name: name, price: Util.int(raw.price), stock: Util.int(raw.stock), compareAt: null, location: '', counted: false, note: '', warnings: [] };
    var loc = Import.parseLocation(raw.location);
    var offerText = Util.str(raw.offer), offer = /^[\d\s.,₡]+$/.test(offerText) ? Util.int(offerText) : null;
    if (offerText && offer === null) {
      var extra = Import.parseLocation(offerText);
      if (extra.location) loc.location = loc.location ? loc.location + ', ' + extra.location : extra.location;
      if (extra.counted) loc.counted = true;
      if (extra.note) loc.note = loc.note ? loc.note + ' · ' + extra.note : extra.note;
    }
    if (offer !== null && offer > 0) {
      if (offer < 500) row.warnings.push({ kind: 'oferta', message: '"Precio oferta" = ' + offer + ' (no parece precio).' });
      else if (row.price !== null && offer < row.price) { row.compareAt = row.price; row.price = offer; }
      else if (row.price !== null && offer > row.price) row.warnings.push({ kind: 'oferta', message: 'El precio de oferta (' + Util.crc(offer) + ') es mayor al precio final (' + Util.crc(row.price) + '). Se dejó el precio final.' });
    }
    row.location = loc.location; row.counted = loc.counted; row.note = loc.note;
    if (row.note) row.warnings.push({ kind: 'nota', message: 'Nota del archivo: "' + row.note + '". Confirmar en el conteo.' });
    if (row.price === null || row.price <= 0) { row.price = null; row.warnings.push({ kind: 'precio', message: 'Sin precio en el archivo.' }); }
    else if (row.price > CONFIG.MAX_PRICE) { row.price = null; row.warnings.push({ kind: 'precio', message: 'El precio no parece válido.' }); }
    if (row.stock === null) row.stock = 0;
    if (row.stock < 0 || row.stock > CONFIG.MAX_QTY) { row.warnings.push({ kind: 'existencias', message: 'Existencias fuera de rango (' + row.stock + '). Se tomó 0.' }); row.stock = 0; }
    return row;
  },

  /** Índices del catálogo actual para emparejar filas. */
  index: function () {
    var products = Db.rows('products'), variants = Db.rows('variants');
    var pById = {}, byKey = {}, bySku = {}, productByKey = {}, aliases = {}, vendorCats = {};
    var i;
    for (i = 0; i < products.length; i++) {
      var p = products[i];
      pById[Util.str(p.product_id)] = p;
      productByKey[Util.key(p.vendor + ' ' + p.title)] = p;
      var vk = Util.key(p.vendor);
      aliases[vk] = Util.str(p.vendor);
      aliases[vk.replace(/ /g, '')] = Util.str(p.vendor);
      var cats = (vendorCats[Util.str(p.vendor)] = vendorCats[Util.str(p.vendor)] || {});
      cats[Util.str(p.category)] = (cats[Util.str(p.category)] || 0) + 1;
    }
    for (i = 0; i < variants.length; i++) {
      var v = variants[i], sku = Util.str(v.sku), prod = pById[Util.str(v.product_id)];
      bySku[sku] = v;
      var names = Util.str(v.legacy_name).split(' / ');
      for (var n = 0; n < names.length; n++) {
        var k = Util.key(names[n]);
        if (!k) continue;
        if (!byKey[k]) byKey[k] = [];
        if (byKey[k].indexOf(sku) < 0) byKey[k].push(sku); // un nombre repetido en el Sheet apunta a varias variantes, en orden
        if (prod) { // alias de marca tal como se escribe en el Sheet ("ELF", "D ALBA", "LOREAL")
          var tokens = k.split(' '), compact = Util.key(prod.vendor).replace(/ /g, ''), acc = '';
          for (var t = 0; t < Math.min(4, tokens.length); t++) {
            acc += tokens[t];
            if (acc === compact) { aliases[tokens.slice(0, t + 1).join(' ')] = Util.str(prod.vendor); break; }
          }
          if (compact.indexOf(tokens[0]) === 0 && tokens[0].length >= 4 && !aliases[tokens[0]]) aliases[tokens[0]] = Util.str(prod.vendor);
        }
      }
      if (prod) {
        var label = Util.key(prod.vendor + ' ' + prod.title + ' ' + Util.str(v.option_value));
        if (!byKey[label]) byKey[label] = [sku];
      }
    }
    return { pById: pById, byKey: byKey, bySku: bySku, productByKey: productByKey, aliases: aliases, vendorCats: vendorCats };
  },

  /** Fila que no existe en el catálogo → marca, nombre y variante propuestos. */
  parseNew: function (name, idx) {
    var key = Util.key(name.replace(/\b(CON|SIN)\s+CAJA\b/gi, ' '));
    var tokens = key.split(' '), optionName = '', optionValue = '';
    var last = tokens[tokens.length - 1];
    if (tokens.length > 1 && Import.SIZES[last]) { optionName = 'Tamaño'; optionValue = Import.SIZES[last]; tokens.pop(); }
    else if (tokens.length > 1 && Import.PACKS[last]) { optionName = 'Presentación'; optionValue = Import.PACKS[last]; tokens.pop(); }
    var vendor = '', used = 0;
    for (var n = Math.min(4, tokens.length - 1); n >= 1; n--) {
      var cand = idx.aliases[tokens.slice(0, n).join(' ')];
      if (cand) { vendor = cand; used = n; break; }
    }
    var known = !!vendor;
    if (!known) { vendor = Import.titleCase(tokens[0]); used = tokens.length > 1 ? 1 : 0; }
    var title = Import.titleCase(tokens.slice(used).join(' ')) || Import.titleCase(tokens.join(' '));
    return { vendor: vendor, vendorKnown: known, title: title, optionName: optionName, optionValue: optionValue, productKey: Util.key(vendor + ' ' + title) };
  },

  /** Calcula qué cambiaría. No escribe. */
  plan: function (rawRows, options) {
    if (!rawRows || !rawRows.length) throw new ApiError('INVALID', 'El archivo no trae filas con productos.');
    if (rawRows.length > 4000) throw new ApiError('INVALID', 'El archivo trae demasiadas filas (máximo 4.000).');
    var opt = { prices: !options || options.prices !== false, stock: !options || options.stock !== false, create: !options || options.create !== false };
    var idx = Import.index(), stock = Stock.map();
    var matched = {}, order = [], fresh = {}, freshOrder = [], warnings = [], rowsUsed = 0, keyUse = {};
    var byName = function (name) {
      var k = Util.key(name), list = idx.byKey[k];
      if (!list) return '';
      var n = keyUse[k] || 0;
      keyUse[k] = n + 1;
      return list[Math.min(n, list.length - 1)];
    };
    var i, r;
    for (i = 0; i < rawRows.length; i++) {
      r = Import.parseRow(rawRows[i], i);
      if (!r.name && !r.sku) continue;
      if (!r.name && r.sku && !idx.bySku[r.sku]) { warnings.push({ kind: 'fila', line: r.line, legacy: r.sku, message: 'El SKU ' + r.sku + ' no existe y la fila no trae nombre.' }); continue; }
      rowsUsed++;
      var boxless = /\bSIN\s+CAJA\b/i.test(r.name);
      var sku = r.sku && idx.bySku[r.sku] ? r.sku : (byName(r.name) || byName(r.name.replace(/\b(CON|SIN)\s+CAJA\b/gi, ' ')));
      for (var w = 0; w < r.warnings.length; w++) warnings.push({ kind: r.warnings[w].kind, line: r.line, legacy: r.name || r.sku, message: r.warnings[w].message });
      var bucket;
      if (sku) {
        bucket = matched[sku];
        if (!bucket) { bucket = matched[sku] = { rows: 0, stock: 0, price: null, compareAt: null, locations: [], counted: false, names: [] }; order.push(sku); }
      } else {
        var parsed = Import.parseNew(r.name, idx);
        var fk = parsed.productKey + '|' + Util.key(parsed.optionValue);
        bucket = fresh[fk];
        if (!bucket) { bucket = fresh[fk] = { rows: 0, stock: 0, price: null, compareAt: null, locations: [], counted: false, names: [], parsed: parsed, line: r.line }; freshOrder.push(fk); }
      }
      bucket.rows++;
      bucket.stock += r.stock;
      if (r.price !== null && (bucket.price === null || !boxless)) {
        if (bucket.price !== null && bucket.price !== r.price) warnings.push({ kind: 'con-sin-caja', line: r.line, legacy: r.name, message: 'Hay filas del mismo producto con precio distinto (' + Util.crc(bucket.price) + ' y ' + Util.crc(r.price) + '). Se tomó ' + Util.crc(r.price) + '.' });
        bucket.price = r.price; bucket.compareAt = r.compareAt;
      }
      var locs = r.location ? r.location.split(', ') : [];
      for (var l = 0; l < locs.length; l++) if (bucket.locations.indexOf(locs[l]) < 0) bucket.locations.push(locs[l]);
      if (r.counted) bucket.counted = true;
      bucket.names.push(r.name);
    }
    if (!rowsUsed) throw new ApiError('INVALID', 'No encontramos productos en el archivo. Revisá que la primera columna tenga los nombres.');

    var changes = [], unchanged = 0;
    for (i = 0; i < order.length; i++) {
      var s = order[i], b = matched[s], v = idx.bySku[s];
      var prod = idx.pById[Util.str(v.product_id)];
      var c = { sku: s, name: (prod ? Util.str(prod.vendor) + ' ' + Util.str(prod.title) : s) + (Util.str(v.option_value) ? ' · ' + Util.str(v.option_value) : ''), price: null, compareAt: null, stock: null, location: null, counted: b.counted && !Util.str(v.counted_at) };
      var curPrice = Util.int(v.price_crc) || 0, curCompare = Util.int(v.compare_at_crc), curStock = stock[s] ? Util.int(stock[s].qty) || 0 : 0;
      if (opt.prices && b.price !== null) {
        if (b.price !== curPrice) c.price = { from: curPrice, to: b.price };
        if (b.compareAt !== curCompare) c.compareAt = { from: curCompare, to: b.compareAt };
      }
      if (opt.stock && b.stock !== curStock) c.stock = { from: curStock, to: b.stock };
      var loc = b.locations.sort().join(', ');
      if (loc && loc !== Util.str(v.display_location)) c.location = { from: Util.str(v.display_location), to: loc };
      if (c.price || c.compareAt || c.stock || c.location || c.counted) changes.push(c); else unchanged++;
    }

    var news = [];
    for (i = 0; i < freshOrder.length && opt.create; i++) {
      var f = fresh[freshOrder[i]], pz = f.parsed;
      var existing = idx.productByKey[pz.productKey];
      if (f.price === null) { warnings.push({ kind: 'precio', line: f.line, legacy: f.names[0], message: 'Producto nuevo sin precio: no se crea hasta que tenga precio.' }); continue; }
      if (!pz.vendorKnown) warnings.push({ kind: 'marca', line: f.line, legacy: f.names[0], message: 'Marca nueva o no reconocida: se propuso "' + pz.vendor + '". Revisar.' });
      var cats = idx.vendorCats[pz.vendor], category = 'Skincare', best = 0;
      if (cats) for (var ck in cats) if (cats[ck] > best) { best = cats[ck]; category = ck; }
      news.push({ line: f.line, legacy: f.names.join(' / '), vendor: pz.vendor, title: pz.title, category: category, categoryGuessed: !cats, optionName: pz.optionName, optionValue: pz.optionValue, price: f.price, compareAt: f.compareAt, stock: opt.stock ? f.stock : 0, location: f.locations.sort().join(', '), counted: f.counted, productId: existing ? Util.str(existing.product_id) : '', productKey: pz.productKey });
    }

    var missing = [], variants = Db.rows('variants');
    for (i = 0; i < variants.length; i++) {
      var mv = variants[i], msku = Util.str(mv.sku);
      if (matched[msku] || !Util.bool(mv.active)) continue;
      var mp = idx.pById[Util.str(mv.product_id)];
      if (mp && Util.str(mp.status) === 'archived') continue;
      var mq = stock[msku] ? Util.int(stock[msku].qty) || 0 : 0;
      missing.push({ sku: msku, name: (mp ? Util.str(mp.vendor) + ' ' + Util.str(mp.title) : msku) + (Util.str(mv.option_value) ? ' · ' + Util.str(mv.option_value) : ''), stock: mq });
    }

    var priceChanges = 0, stockChanges = 0, units = 0;
    for (i = 0; i < changes.length; i++) { if (changes[i].price || changes[i].compareAt) priceChanges++; if (changes[i].stock) { stockChanges++; units += changes[i].stock.to - changes[i].stock.from; } }
    return {
      summary: { rows: rowsUsed, matched: order.length, unchanged: unchanged, priceChanges: priceChanges, stockChanges: stockChanges, stockUnitsDelta: units, newItems: news.length, missing: missing.length, missingWithStock: missing.filter(function (m) { return m.stock > 0; }).length, warnings: warnings.length },
      changes: changes, news: news, missing: missing, warnings: warnings, _matched: matched, _idx: idx
    };
  },

  strip: function (plan, limit) {
    var cut = function (list) { return list.slice(0, limit); };
    return { summary: plan.summary, changes: cut(plan.changes), news: cut(plan.news), missing: cut(plan.missing.sort(function (a, b) { return b.stock - a.stock; })), warnings: cut(plan.warnings) };
  },

  preview: function (req) { return Import.strip(Import.plan(req.rows, req.options), 300); },

  apply: function (req, session) {
    var cid = Util.str(req.clientId), cache = Util.cache();
    if (cid) { var done = cache.get('cid:' + cid); if (done) return JSON.parse(done); }
    var plan = Import.plan(req.rows, req.options), idx = plan._idx, now = Util.now(), user = session ? session.userId : 'menu';
    var tag = 'Importación ' + now.slice(0, 10);
    var moves = [], i, touched = false;

    for (i = 0; i < plan.changes.length; i++) {
      var c = plan.changes[i], v = idx.bySku[c.sku];
      if (c.price) { v.price_crc = c.price.to; touched = true; }
      if (c.compareAt) { v.compare_at_crc = c.compareAt.to === null ? '' : c.compareAt.to; touched = true; }
      if (c.location) { v.display_location = c.location.to; touched = true; }
      if (c.counted) { v.counted_at = now; touched = true; }
      if (c.stock) moves.push({ sku: c.sku, type: 'COUNT', qty: c.stock.to - c.stock.from, note: tag, clientId: cid });
    }

    var newProducts = [], newVariants = [], createdByKey = {}, productsTouched = false;
    var skus = plan.news.length ? Catalog.nextSkus(plan.news.length) : [];
    for (i = 0; i < plan.news.length; i++) {
      var n = plan.news[i];
      var product = n.productId ? idx.pById[n.productId] : createdByKey[n.productKey];
      if (!product) {
        product = { product_id: Catalog.nextProductId(), handle: '', title: n.title, vendor: n.vendor, category: n.category, description: '', status: 'active', option_name: n.optionName, created_at: now, updated_at: now, updated_by: user };
        product.handle = Catalog.uniqueHandle(n.vendor, n.title, product.product_id);
        createdByKey[n.productKey] = product;
        newProducts.push(product);
        Db.rows('products').push(product); // para que uniqueHandle vea los que se van creando
      } else if (!Util.str(product.option_name)) {
        // Producto existente de una sola variante que ahora tiene tamaños: la original pasa a "Estándar"
        product.option_name = n.optionName || 'Tamaño';
        product.updated_at = now; product.updated_by = user;
        productsTouched = true;
        var all = Db.rows('variants');
        for (var a = 0; a < all.length; a++) if (Util.str(all[a].product_id) === Util.str(product.product_id) && !Util.str(all[a].option_value)) { all[a].option_value = 'Estándar'; touched = true; }
      }
      var sku = skus.shift();
      newVariants.push({ sku: sku, product_id: product.product_id, option_value: n.optionValue || (n.productId ? 'Nuevo' : ''), barcode: '', price_crc: n.price, compare_at_crc: n.compareAt === null ? '' : n.compareAt, min_stock: 1, display_location: n.location, counted_at: n.counted ? now : '', active: true, legacy_name: n.legacy, note: '' });
      if (n.stock > 0) moves.push({ sku: sku, type: 'INITIAL', qty: n.stock, note: tag, clientId: cid });
    }

    if (newProducts.length || productsTouched) Db.replaceAll('products', Db.rows('products'));
    if (touched || newVariants.length) Db.replaceAll('variants', Db.rows('variants').concat(newVariants));
    if (moves.length) Stock.record(moves, user, true);
    if (plan.warnings.length) {
      var review = [];
      for (i = 0; i < plan.warnings.length && i < 500; i++) review.push({ kind: plan.warnings[i].kind, line: plan.warnings[i].line, legacy: plan.warnings[i].legacy, message: plan.warnings[i].message, resolved: false });
      Db.append('review', review);
    }
    Catalog.invalidate();
    Db.log('info', 'import.apply', user, JSON.stringify(plan.summary));
    var out = { summary: plan.summary, applied: { variantsUpdated: plan.changes.length, productsCreated: newProducts.length, variantsCreated: newVariants.length, movements: moves.length } };
    if (cid) cache.put('cid:' + cid, JSON.stringify(out), 21600);
    return out;
  },

  /** Inventario completo en el formato que la app vuelve a aceptar. */
  exportRows: function () {
    var idx = Import.index(), stock = Stock.map(), variants = Db.rows('variants'), out = [];
    for (var i = 0; i < variants.length; i++) {
      var v = variants[i], p = idx.pById[Util.str(v.product_id)], sku = Util.str(v.sku);
      if (!p) continue;
      var compare = Util.int(v.compare_at_crc), price = Util.int(v.price_crc) || 0;
      out.push({ sku: sku, vendor: Util.str(p.vendor), title: Util.str(p.title), option: Util.str(v.option_value), category: Util.str(p.category), price: compare !== null ? compare : price, offer: compare !== null ? price : null, stock: stock[sku] ? Util.int(stock[sku].qty) || 0 : 0, location: Util.str(v.display_location), barcode: Util.str(v.barcode), status: Util.str(p.status) === 'archived' || !Util.bool(v.active) ? 'archivado' : 'activo' });
    }
    return { rows: out, generatedAt: Util.now() };
  }
};
