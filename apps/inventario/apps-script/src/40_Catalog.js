/** Catálogo (productos → variantes) con existencias, y gestión de productos (solo admin). */
var Catalog = {
  CHUNK: 90000,

  build: function () {
    var stock = Stock.map();
    var byProduct = {};
    var variants = Db.rows('variants');
    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      var pid = Util.str(v.product_id);
      var sku = Util.str(v.sku);
      (byProduct[pid] = byProduct[pid] || []).push({
        sku: sku,
        optionValue: Util.str(v.option_value) || null,
        barcode: Util.str(v.barcode) || null,
        priceCrc: Util.int(v.price_crc) || 0,
        compareAtCrc: Util.int(v.compare_at_crc),
        minStock: Util.int(v.min_stock) === null ? 1 : Util.int(v.min_stock),
        displayLocation: Util.str(v.display_location),
        countedAt: Util.str(v.counted_at) || null,
        active: Util.bool(v.active),
        note: Util.str(v.note),
        stock: stock[sku] ? Util.int(stock[sku].qty) || 0 : 0
      });
    }
    var products = Db.rows('products'), out = [];
    for (var p = 0; p < products.length; p++) {
      var r = products[p];
      var id = Util.str(r.product_id);
      out.push({
        id: id, handle: Util.str(r.handle), vendor: Util.str(r.vendor), title: Util.str(r.title),
        category: Util.str(r.category), description: Util.str(r.description),
        status: Util.str(r.status) === 'archived' ? 'archived' : 'active',
        optionName: Util.str(r.option_name) || null,
        variants: byProduct[id] || []
      });
    }
    return out;
  },

  /** Devuelve el catálogo como texto JSON (se guarda en caché en trozos de 90 KB). */
  json: function () {
    var cache = Util.cache();
    var n = parseInt(cache.get('cat:n') || '0', 10);
    if (n > 0) {
      var keys = [];
      for (var i = 0; i < n; i++) keys.push('cat:' + i);
      var got = cache.getAll(keys), parts = [];
      for (var k = 0; k < n; k++) { if (got[keys[k]] === undefined || got[keys[k]] === null) { parts = null; break; } parts.push(got[keys[k]]); }
      if (parts) return parts.join('');
    }
    var json = JSON.stringify({ products: Catalog.build(), generatedAt: Util.now(), version: CONFIG.VERSION });
    try {
      var chunks = {}, count = 0;
      for (var pos = 0; pos < json.length; pos += Catalog.CHUNK) chunks['cat:' + (count++)] = json.substr(pos, Catalog.CHUNK);
      cache.putAll(chunks, CONFIG.CATALOG_CACHE_SECONDS);
      cache.put('cat:n', String(count), CONFIG.CATALOG_CACHE_SECONDS);
    } catch (e) { /* sin caché igual funciona */ }
    return json;
  },
  invalidate: function () { Util.cache().remove('cat:n'); },

  variant: function (sku) {
    var rows = Db.rows('variants');
    for (var i = 0; i < rows.length; i++) if (Util.str(rows[i].sku) === sku) return rows[i];
    return null;
  },
  product: function (id) {
    var rows = Db.rows('products');
    for (var i = 0; i < rows.length; i++) if (Util.str(rows[i].product_id) === id) return rows[i];
    return null;
  },
  label: function (v) {
    var p = Catalog.product(Util.str(v.product_id));
    var name = p ? Util.str(p.vendor) + ' ' + Util.str(p.title) : Util.str(v.sku);
    return Util.str(v.option_value) ? name + ' · ' + Util.str(v.option_value) : name;
  },

  nextProductId: function () { return 'P-' + Util.pad(Db.nextSeq('product', 1, function () { return Db.maxSuffix('products', 'product_id', 'P-'); }), 4); },
  nextSkus: function (count) {
    var first = Db.nextSeq('sku', count, function () { return Db.maxSuffix('variants', 'sku', 'LIR-'); });
    var out = [];
    for (var i = 0; i < count; i++) out.push('LIR-' + Util.pad(first + i, 5));
    return out;
  },
  uniqueHandle: function (vendor, title, exceptId) {
    var base = Util.slug(vendor + ' ' + title) || 'producto', handle = base, n = 2;
    var rows = Db.rows('products'), taken = {};
    for (var i = 0; i < rows.length; i++) if (Util.str(rows[i].product_id) !== exceptId) taken[Util.str(rows[i].handle)] = true;
    while (taken[handle]) handle = base + '-' + (n++);
    return handle;
  },
  barcodeOwner: function (barcode, exceptSku) {
    var rows = Db.rows('variants');
    for (var i = 0; i < rows.length; i++) if (Util.str(rows[i].barcode) === barcode && Util.str(rows[i].sku) !== exceptSku) return rows[i];
    return null;
  },
  cleanBarcode: function (value, exceptSku) {
    var b = Util.str(value).replace(/\s+/g, '');
    if (b === '') return '';
    if (!/^[0-9A-Za-z-]{4,32}$/.test(b)) throw new ApiError('INVALID', 'El código de barras "' + b + '" no parece válido.');
    var owner = Catalog.barcodeOwner(b, exceptSku);
    if (owner) throw new ApiError('CONFLICT', 'Ese código ya está asociado a ' + Catalog.label(owner) + '.');
    return b;
  },

  /** Crea o edita un producto con sus variantes. Nada se borra: las variantes se desactivan. */
  upsert: function (req, session) {
    var input = req.product || {};
    var vendor = Util.str(input.vendor).replace(/\s+/g, ' '), title = Util.str(input.title).replace(/\s+/g, ' ');
    if (!vendor) throw new ApiError('INVALID', 'Escribí la marca.');
    if (!title) throw new ApiError('INVALID', 'Escribí el nombre del producto.');
    if (CONFIG.CATEGORIES.indexOf(input.category) < 0) throw new ApiError('INVALID', 'Elegí una categoría.');
    var list = input.variants || [];
    if (!list.length) throw new ApiError('INVALID', 'El producto necesita al menos una variante.');
    var optionName = Util.str(input.optionName);
    var isNew = !input.id;
    var product = isNew ? null : Catalog.product(Util.str(input.id));
    if (!isNew && !product) throw new ApiError('NOT_FOUND', 'No encontramos ese producto.');

    var seen = {}, barcodes = {}, activeCount = 0, clean = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var sku = Util.str(it.sku);
      var existing = sku ? Catalog.variant(sku) : null;
      if (sku && (!existing || isNew || Util.str(existing.product_id) !== Util.str(product.product_id))) throw new ApiError('INVALID', 'La variante ' + sku + ' no pertenece a este producto.');
      var price = Util.int(it.priceCrc);
      if (price === null || price <= 0 || price > CONFIG.MAX_PRICE) throw new ApiError('INVALID', 'Revisá el precio de cada variante.');
      var compare = Util.int(it.compareAtCrc);
      if (compare !== null && compare <= price) throw new ApiError('INVALID', 'El precio "antes" tiene que ser mayor al precio actual.');
      var minStock = Util.int(it.minStock);
      if (minStock === null || minStock < 0 || minStock > CONFIG.MAX_QTY) minStock = 1;
      var active = it.active !== false;
      var value = Util.str(it.optionValue);
      if (active) {
        activeCount++;
        var vk = Util.key(value);
        if (seen[vk]) throw new ApiError('INVALID', 'Hay dos variantes con el mismo nombre ("' + (value || 'sin nombre') + '").');
        seen[vk] = true;
      }
      var barcode = Catalog.cleanBarcode(it.barcode, sku);
      if (barcode) { if (barcodes[barcode]) throw new ApiError('INVALID', 'Dos variantes tienen el mismo código de barras.'); barcodes[barcode] = true; }
      var initial = Util.int(it.initialStock) || 0;
      if (existing) initial = 0;
      if (initial < 0 || initial > CONFIG.MAX_QTY) throw new ApiError('INVALID', 'Revisá el stock inicial.');
      clean.push({ existing: existing, value: value, price: price, compare: compare, minStock: minStock, active: active, barcode: barcode, location: Util.str(it.displayLocation), initial: initial });
    }
    if (activeCount === 0) throw new ApiError('INVALID', 'Dejá al menos una variante activa (o archivá el producto).');
    if (activeCount > 1) {
      if (!optionName) throw new ApiError('INVALID', 'Con varias variantes, indicá qué las distingue (Tamaño, Tono o Presentación).');
      for (var c = 0; c < clean.length; c++) if (clean[c].active && !clean[c].value) throw new ApiError('INVALID', 'Poné el nombre de cada variante (por ejemplo "Mini" o "21N Ivory").');
    }

    var now = Util.now();
    if (isNew) {
      product = { product_id: Catalog.nextProductId(), handle: '', title: title, vendor: vendor, category: input.category, description: Util.str(input.description), status: 'active', option_name: optionName, created_at: now, updated_at: now, updated_by: session.userId };
      product.handle = Catalog.uniqueHandle(vendor, title, product.product_id);
      Db.append('products', [product]);
    } else {
      if (Util.key(product.vendor + ' ' + product.title) !== Util.key(vendor + ' ' + title)) product.handle = Catalog.uniqueHandle(vendor, title, Util.str(product.product_id));
      product.title = title; product.vendor = vendor; product.category = input.category; product.description = Util.str(input.description);
      product.option_name = optionName; product.updated_at = now; product.updated_by = session.userId;
      Db.update('products', product);
    }
    var fresh = [];
    for (var n = 0; n < clean.length; n++) if (!clean[n].existing) fresh.push(clean[n]);
    var skus = fresh.length ? Catalog.nextSkus(fresh.length) : [];
    var toAppend = [], initials = [];
    for (var j = 0; j < clean.length; j++) {
      var cv = clean[j];
      if (cv.existing) {
        var row = cv.existing;
        row.option_value = cv.value; row.barcode = cv.barcode; row.price_crc = cv.price; row.compare_at_crc = cv.compare === null ? '' : cv.compare;
        row.min_stock = cv.minStock; row.display_location = cv.location; row.active = cv.active;
        Db.update('variants', row);
      } else {
        var newSku = skus.shift();
        toAppend.push({ sku: newSku, product_id: product.product_id, option_value: cv.value, barcode: cv.barcode, price_crc: cv.price, compare_at_crc: cv.compare === null ? '' : cv.compare, min_stock: cv.minStock, display_location: cv.location, counted_at: '', active: cv.active, legacy_name: '', note: '' });
        if (cv.initial > 0) initials.push({ sku: newSku, type: 'RECEIVE', qty: cv.initial, note: 'Alta de producto' });
      }
    }
    Db.append('variants', toAppend);
    if (initials.length) Stock.record(initials, session.userId);
    Catalog.invalidate();
    Db.log('info', isNew ? 'product.create' : 'product.update', session.userId, Util.str(product.product_id) + ' · ' + vendor + ' ' + title);
    return { id: Util.str(product.product_id) };
  },

  archive: function (req, session) {
    var product = Catalog.product(Util.str(req.id));
    if (!product) throw new ApiError('NOT_FOUND', 'No encontramos ese producto.');
    product.status = req.archived === false ? 'active' : 'archived';
    product.updated_at = Util.now();
    product.updated_by = session.userId;
    Db.update('products', product);
    Catalog.invalidate();
    Db.log('info', 'product.' + product.status, session.userId, Util.str(product.product_id));
    return { id: Util.str(product.product_id), status: product.status };
  },

  linkBarcode: function (req, session) {
    var v = Catalog.variant(Util.str(req.sku));
    if (!v) throw new ApiError('NOT_FOUND', 'No encontramos ese producto.');
    var barcode = Catalog.cleanBarcode(req.barcode, Util.str(v.sku));
    if (!barcode) throw new ApiError('INVALID', 'Escaneá o escribí el código de barras.');
    v.barcode = barcode;
    Db.update('variants', v);
    Catalog.invalidate();
    Db.log('info', 'barcode.link', session.userId, Util.str(v.sku) + ' ← ' + barcode);
    return { sku: Util.str(v.sku), barcode: barcode };
  }
};
