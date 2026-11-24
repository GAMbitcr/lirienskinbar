/**
 * Catálogo base: la migración del Sheet "INVENTARIO" del 8 de noviembre de 2026 (518 productos, 531 SKU).
 * Los datos están en 96_SeedData.js (generado con `node dev/seed.mjs` desde data/catalogo-2026-11-08.json).
 * Se carga una sola vez, con las hojas vacías. Después el inventario se pone al día importando el archivo actualizado.
 */
var Seed = {
  load: function () {
    if (Db.rows('products').length || Db.rows('variants').length) throw new ApiError('CONFLICT', 'El catálogo ya tiene productos. La carga base solo se hace una vez, con las hojas vacías.');
    var now = Util.now(), countedAt = SEED_DATA.date + 'T00:00:00-06:00';
    var products = [], variants = [], moves = [], units = 0;
    for (var i = 0; i < SEED_DATA.products.length; i++) {
      var p = SEED_DATA.products[i];
      products.push({ product_id: p[0], handle: p[1], vendor: p[2], title: p[3], category: p[4], description: '', status: 'active', option_name: p[5] || '', created_at: now, updated_at: now, updated_by: 'migracion' });
      for (var k = 0; k < p[6].length; k++) {
        var v = p[6][k];
        variants.push({ sku: v[0], product_id: p[0], option_value: v[1] || '', barcode: '', price_crc: v[2], compare_at_crc: v[3] === null ? '' : v[3], min_stock: v[5], display_location: v[6], counted_at: v[7] ? countedAt : '', active: true, legacy_name: v[8], note: v[9] || '' });
        if (v[4] > 0) { moves.push({ sku: v[0], type: 'INITIAL', qty: v[4], note: 'Migración del Sheet del ' + SEED_DATA.date }); units += v[4]; }
      }
    }
    Db.replaceAll('products', products);
    Db.replaceAll('variants', variants);
    Stock.record(moves, 'migracion', true);
    Stock.rebuild();
    var review = [];
    for (var r = 0; r < SEED_DATA.review.length; r++) review.push({ kind: SEED_DATA.review[r][0], line: SEED_DATA.review[r][1], legacy: SEED_DATA.review[r][2], message: SEED_DATA.review[r][3], resolved: false });
    Db.append('review', review);
    Db.log('info', 'seed.load', 'menu', products.length + ' productos · ' + variants.length + ' variantes · ' + units + ' unidades');
    return { products: products.length, variants: variants.length, units: units };
  }
};
