/**
 * Lirien Inventario · backend en Apps Script sobre Google Sheets.
 * JavaScript plano (V8), sin `??` ni `?.`: el mismo código corre en el arnés de Node (dev/).
 */
var CONFIG = {
  VERSION: '0.4.0',
  SESSION_HOURS: 12,
  PIN_LENGTH: 6,
  PIN_ITERATIONS: 150,
  MAX_FAILS: 5,
  LOCK_MINUTES: 15,
  GLOBAL_FAILS_PER_10_MIN: 40,
  ACTIVATION_HOURS: 72,
  CATALOG_CACHE_SECONDS: 300,
  CATEGORIES: ['Skincare', 'Maquillaje', 'Cabello', 'Cuerpo', 'Accesorios'],
  CHANNELS: ['kiosko', 'whatsapp', 'instagram'],
  METHODS: ['sinpe', 'tarjeta', 'efectivo'],
  MANUAL_TYPES: ['RECEIVE', 'ADJUST', 'COUNT', 'RETURN', 'WASTE', 'TESTER'],
  MAX_QTY: 999,
  MAX_PRICE: 2000000
};

/** Hojas y columnas. Las columnas nuevas van siempre a la derecha. */
var SCHEMA = {
  products: ['product_id', 'handle', 'title', 'vendor', 'category', 'description', 'status', 'option_name', 'created_at', 'updated_at', 'updated_by'],
  variants: ['sku', 'product_id', 'option_value', 'barcode', 'price_crc', 'compare_at_crc', 'min_stock', 'display_location', 'counted_at', 'active', 'legacy_name', 'note'],
  stock: ['sku', 'qty', 'updated_at'],
  movements: ['movement_id', 'client_id', 'ts', 'sku', 'type', 'qty', 'unit_price_crc', 'ref', 'user', 'note'],
  sales: ['sale_id', 'client_id', 'ts', 'user', 'channel', 'total_crc', 'voided_at', 'voided_by', 'void_note'],
  sale_payments: ['sale_id', 'method', 'amount_crc', 'tendered_crc'],
  users: ['user_id', 'name', 'role', 'active', 'pin_hash', 'salt', 'activation_hash', 'activation_expires', 'pin_set_at', 'created_at'],
  config: ['key', 'value'],
  log: ['ts', 'level', 'event', 'user', 'detail'],
  review: ['kind', 'line', 'legacy', 'message', 'resolved']
};

/** Columnas que se guardan como texto (códigos, fechas ISO, hashes) para que Sheets no las convierta. */
var TEXT_COLUMNS = {
  products: ['product_id', 'handle', 'title', 'vendor', 'description', 'option_name', 'created_at', 'updated_at'],
  variants: ['sku', 'product_id', 'option_value', 'barcode', 'display_location', 'counted_at', 'legacy_name', 'note'],
  stock: ['sku', 'updated_at'],
  movements: ['movement_id', 'client_id', 'ts', 'sku', 'ref', 'note'],
  sales: ['sale_id', 'client_id', 'ts', 'voided_at', 'void_note'],
  sale_payments: ['sale_id'],
  users: ['user_id', 'name', 'pin_hash', 'salt', 'activation_hash', 'activation_expires', 'pin_set_at', 'created_at'],
  config: ['key', 'value'],
  log: ['ts', 'detail'],
  review: ['legacy', 'message']
};
