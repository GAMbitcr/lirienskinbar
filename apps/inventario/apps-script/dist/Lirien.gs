// Lirien Inventario · backend v0.4.0 · generado desde apps-script/src (no editar acá: editar src/ y volver a generar)

// ===== 00_Config.js =====
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

// ===== 10_Util.js =====
/** Error con código y mensaje para la persona (en español, con voseo). */
function ApiError(code, message, details) {
  this.isApi = true;
  this.code = code;
  this.message = message;
  this.details = details || null;
}

var Util = {
  /** Fecha y hora de Costa Rica (UTC-6, sin horario de verano) en ISO 8601 con offset. */
  iso: function (date) {
    var d = date || new Date();
    return new Date(d.getTime() - 6 * 3600 * 1000).toISOString().slice(0, 19) + '-06:00';
  },
  now: function () { return Util.iso(new Date()); },
  year: function () { return Util.now().slice(0, 4); },

  str: function (v) {
    if (v === null || v === undefined) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return Util.iso(v);
    return String(v).trim();
  },
  /** Entero o null. Acepta "15 500", "₡15.500", 15500. */
  int: function (v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
    var s = String(v).replace(/[^\d-]/g, '');
    if (!s || s === '-') return null;
    var n = parseInt(s, 10);
    return isNaN(n) ? null : n;
  },
  bool: function (v) { return v === true || String(v).toUpperCase() === 'TRUE' || v === 1 || v === '1'; },
  pad: function (n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; },

  /** Clave de comparación: mayúsculas, sin tildes ni signos, espacios simples. */
  key: function (s) {
    return Util.str(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9%+]+/g, ' ').trim();
  },
  slug: function (s) {
    return Util.str(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  },

  sha256: function (text) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
      hex += (b < 16 ? '0' : '') + b.toString(16);
    }
    return hex;
  },
  randomHex: function () { return Util.sha256(Utilities.getUuid() + Utilities.getUuid() + new Date().getTime()); },
  randomDigits: function (n) {
    var out = '';
    while (out.length < n) {
      var hex = Util.randomHex();
      for (var i = 0; i < hex.length && out.length < n; i += 2) {
        var v = parseInt(hex.substr(i, 2), 16);
        if (v < 250) out += String(v % 10); // descarta 250–255 para no sesgar
      }
    }
    return out;
  },
  crc: function (n) { return '₡' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); },
  props: function () { return PropertiesService.getScriptProperties(); },
  cache: function () { return CacheService.getScriptCache(); }
};

// ===== 20_Db.js =====
/**
 * Acceso a las hojas. Cada hoja se lee una sola vez por ejecución (getValues) y se escribe en bloque.
 * `_row` es el número de fila en la hoja (para actualizar esa fila).
 */
var Db = {
  _ss: null,
  _mem: {},

  reset: function () { Db._mem = {}; },

  ss: function () {
    if (Db._ss) return Db._ss;
    var id = Util.props().getProperty('SHEET_ID');
    Db._ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
    if (!Db._ss) throw new ApiError('SERVER', 'No encuentro el Sheet del inventario. Configurá SHEET_ID en las propiedades del script.');
    return Db._ss;
  },

  sheet: function (name) {
    var sh = Db.ss().getSheetByName(name);
    if (!sh) throw new ApiError('SETUP', 'Falta la hoja "' + name + '". Corré Lirien → 1. Configurar hojas.');
    return sh;
  },

  rows: function (name) {
    if (Db._mem[name]) return Db._mem[name];
    var cols = SCHEMA[name];
    var values = Db.sheet(name).getDataRange().getValues();
    var header = values.length ? values[0] : [];
    for (var c = 0; c < cols.length; c++) {
      if (Util.str(header[c]) !== cols[c]) {
        throw new ApiError('SETUP', 'Las columnas de la hoja "' + name + '" cambiaron de orden (esperaba "' + cols[c] + '" en la columna ' + (c + 1) + '). Corré Lirien → 1. Configurar hojas.');
      }
    }
    var out = [];
    for (var r = 1; r < values.length; r++) {
      if (Util.str(values[r][0]) === '') continue;
      var o = { _row: r + 1 };
      for (var k = 0; k < cols.length; k++) o[cols[k]] = values[r][k];
      out.push(o);
    }
    Db._mem[name] = out;
    return out;
  },

  _toRow: function (name, obj) {
    var cols = SCHEMA[name];
    var row = [];
    for (var i = 0; i < cols.length; i++) {
      var v = obj[cols[i]];
      row.push(v === undefined || v === null ? '' : v);
    }
    return row;
  },

  append: function (name, objs) {
    if (!objs.length) return;
    var sh = Db.sheet(name);
    var cached = Db._mem[name];
    var start = sh.getLastRow() + 1;
    var data = [];
    for (var i = 0; i < objs.length; i++) {
      data.push(Db._toRow(name, objs[i]));
      objs[i]._row = start + i;
      if (cached) cached.push(objs[i]);
    }
    sh.getRange(start, 1, data.length, SCHEMA[name].length).setValues(data);
  },

  update: function (name, obj) {
    Db.sheet(name).getRange(obj._row, 1, 1, SCHEMA[name].length).setValues([Db._toRow(name, obj)]);
  },

  /** Reescribe todas las filas de datos de una hoja (para cambios masivos: importación, recalcular stock). */
  replaceAll: function (name, objs) {
    var sh = Db.sheet(name);
    var n = SCHEMA[name].length;
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, n).clearContent();
    var data = [];
    for (var i = 0; i < objs.length; i++) { data.push(Db._toRow(name, objs[i])); objs[i]._row = i + 2; }
    if (data.length) sh.getRange(2, 1, data.length, n).setValues(data);
    Db._mem[name] = objs;
  },

  /** Consecutivo guardado en las propiedades del script. Si no existe, se calcula desde la hoja. */
  nextSeq: function (key, count, initFn) {
    var props = Util.props();
    var cur = props.getProperty('seq:' + key);
    var n = cur === null || cur === undefined || cur === '' ? initFn() : parseInt(cur, 10);
    props.setProperty('seq:' + key, String(n + count));
    return n + 1;
  },
  maxSuffix: function (name, col, prefix) {
    var rows = Db.rows(name), max = 0;
    for (var i = 0; i < rows.length; i++) {
      var v = Util.str(rows[i][col]);
      if (v.indexOf(prefix) === 0) { var n = parseInt(v.slice(prefix.length), 10); if (n > max) max = n; }
    }
    return max;
  },

  log: function (level, event, user, detail) {
    try {
      Db.append('log', [{ ts: Util.now(), level: level, event: event, user: user || '', detail: typeof detail === 'string' ? detail : JSON.stringify(detail || '') }]);
    } catch (e) { /* el registro nunca debe romper la operación */ }
  },

  /** Crea las hojas que falten, pone encabezados y formato de texto. No borra datos. */
  setup: function () {
    var ss = Db.ss();
    var names = Object.keys(SCHEMA);
    for (var i = 0; i < names.length; i++) {
      var name = names[i], cols = SCHEMA[name];
      var sh = ss.getSheetByName(name) || ss.insertSheet(name);
      var header = sh.getRange(1, 1, 1, cols.length);
      header.setValues([cols]);
      header.setFontWeight('bold');
      sh.setFrozenRows(1);
      var text = TEXT_COLUMNS[name] || [];
      for (var t = 0; t < text.length; t++) {
        sh.getRange(1, cols.indexOf(text[t]) + 1, sh.getMaxRows(), 1).setNumberFormat('@');
      }
    }
    var props = Util.props();
    if (!props.getProperty('PEPPER')) props.setProperty('PEPPER', Util.randomHex());
    Db.reset();
  }
};

// ===== 30_Auth.js =====
/**
 * Personas, PIN de 6 dígitos, códigos de activación y sesiones.
 * - El PIN lo crea cada persona con un código de activación de un solo uso que genera un admin.
 * - PIN y código se guardan con hash (sal por persona + pimienta en las propiedades del script).
 * - 5 intentos fallidos bloquean a esa persona 15 minutos; hay un freno general contra intentos masivos.
 */
var Auth = {
  WEAK: ['123456', '654321', '012345', '543210', '234567', '345678', '456789', '987654', '876543', '765432', '121212', '123123', '112233', '102030'],

  hash: function (secret, salt) {
    var pepper = Util.props().getProperty('PEPPER') || '';
    var h = Util.sha256(salt + '|' + secret + '|' + pepper);
    for (var i = 1; i < CONFIG.PIN_ITERATIONS; i++) h = Util.sha256(h + salt);
    return h;
  },

  validatePin: function (pin) {
    pin = Util.str(pin);
    if (!/^\d{6}$/.test(pin)) throw new ApiError('INVALID', 'El PIN tiene que ser de 6 dígitos.');
    if (/^(\d)\1{5}$/.test(pin) || Auth.WEAK.indexOf(pin) >= 0) throw new ApiError('INVALID', 'Ese PIN es muy fácil de adivinar. Elegí otro.');
    return pin;
  },

  user: function (userId) {
    var rows = Db.rows('users');
    for (var i = 0; i < rows.length; i++) if (Util.str(rows[i].user_id) === userId) return rows[i];
    return null;
  },
  activeUser: function (userId) {
    var u = Auth.user(Util.str(userId));
    if (!u || !Util.bool(u.active)) throw new ApiError('AUTH', 'No encontramos a esa persona. Pedile a un admin que revise tu usuario.');
    return u;
  },
  activationPending: function (u) {
    return Util.str(u.activation_hash) !== '' && Util.str(u.activation_expires) > Util.now();
  },

  /** Lista para la pantalla de ingreso: solo nombre y estado, nunca hashes. */
  publicUsers: function () {
    var rows = Db.rows('users'), out = [];
    for (var i = 0; i < rows.length; i++) {
      var u = rows[i];
      if (!Util.bool(u.active)) continue;
      var hasPin = Util.str(u.pin_hash) !== '';
      if (!hasPin && !Auth.activationPending(u)) continue; // sin PIN ni código vigente: no puede entrar
      out.push({ userId: Util.str(u.user_id), name: Util.str(u.name), role: Util.str(u.role), hasPin: hasPin });
    }
    return out;
  },

  /* --- Bloqueo por intentos --- */
  checkThrottle: function (userId) {
    var cache = Util.cache();
    if (parseInt(cache.get('fail:' + userId) || '0', 10) >= CONFIG.MAX_FAILS) {
      throw new ApiError('LOCKED', 'Demasiados intentos. Esperá ' + CONFIG.LOCK_MINUTES + ' minutos o pedile a un admin un código nuevo.');
    }
    if (parseInt(cache.get('fail:all') || '0', 10) >= CONFIG.GLOBAL_FAILS_PER_10_MIN) {
      throw new ApiError('LOCKED', 'Hay demasiados intentos fallidos en este momento. Probá de nuevo en unos minutos.');
    }
  },
  fail: function (userId, message) {
    var cache = Util.cache();
    var n = parseInt(cache.get('fail:' + userId) || '0', 10) + 1;
    cache.put('fail:' + userId, String(n), CONFIG.LOCK_MINUTES * 60);
    cache.put('fail:all', String(parseInt(cache.get('fail:all') || '0', 10) + 1), 600);
    Db.log('warn', 'auth.fail', userId, 'intento ' + n);
    var left = CONFIG.MAX_FAILS - n;
    throw new ApiError('AUTH', left > 0 ? message + ' Te quedan ' + left + (left === 1 ? ' intento.' : ' intentos.') : 'Demasiados intentos. Esperá ' + CONFIG.LOCK_MINUTES + ' minutos o pedile a un admin un código nuevo.');
  },

  /* --- Sesiones (en las propiedades del script, con el token guardado como hash) --- */
  startSession: function (u) {
    var props = Util.props();
    var all = props.getProperties();
    var now = new Date().getTime();
    for (var k in all) {
      if (k.indexOf('sess:') === 0 && parseInt(String(all[k]).split('|')[3], 10) < now) props.deleteProperty(k);
    }
    var token = Util.randomHex() + Util.randomHex().slice(0, 16);
    var exp = now + CONFIG.SESSION_HOURS * 3600 * 1000;
    props.setProperty('sess:' + Util.sha256(token), [Util.str(u.user_id), Util.str(u.role), Util.str(u.name), exp].join('|'));
    Util.cache().remove('fail:' + Util.str(u.user_id));
    return { token: token, expiresAt: Util.iso(new Date(exp)), userId: Util.str(u.user_id), name: Util.str(u.name), role: Util.str(u.role) };
  },
  requireSession: function (token) {
    token = Util.str(token);
    var raw = token ? Util.props().getProperty('sess:' + Util.sha256(token)) : null;
    if (raw) {
      var p = String(raw).split('|');
      if (parseInt(p[3], 10) > new Date().getTime()) return { userId: p[0], role: p[1], name: p[2] };
    }
    throw new ApiError('AUTH', 'Tu sesión terminó. Ingresá de nuevo con tu PIN.');
  },
  endSessions: function (userId) {
    var props = Util.props();
    var all = props.getProperties();
    for (var k in all) if (k.indexOf('sess:') === 0 && String(all[k]).split('|')[0] === userId) props.deleteProperty(k);
  },

  /* --- Acciones --- */
  login: function (req) {
    var u = Auth.activeUser(req.userId);
    var id = Util.str(u.user_id);
    Auth.checkThrottle(id);
    if (Util.str(u.pin_hash) === '') throw new ApiError('NEEDS_ACTIVATION', 'Todavía no creaste tu PIN. Usá el código de activación que te dio un admin.');
    if (Auth.hash(Util.str(req.pin), Util.str(u.salt)) !== Util.str(u.pin_hash)) Auth.fail(id, 'PIN incorrecto.');
    Db.log('info', 'auth.login', id, '');
    return Auth.startSession(u);
  },

  /** Primer ingreso (o PIN restablecido): código de activación + PIN nuevo. */
  activate: function (req) {
    var u = Auth.activeUser(req.userId);
    var id = Util.str(u.user_id);
    Auth.checkThrottle(id);
    if (!Auth.activationPending(u)) throw new ApiError('INVALID', 'Ese código ya no sirve. Pedile a un admin uno nuevo.');
    var code = Util.str(req.code).replace(/\D/g, '');
    if (Auth.hash(code, 'act:' + id) !== Util.str(u.activation_hash)) Auth.fail(id, 'El código de activación no coincide.');
    var pin = Auth.validatePin(req.pin);
    u.salt = Util.randomHex().slice(0, 32);
    u.pin_hash = Auth.hash(pin, u.salt);
    u.activation_hash = '';
    u.activation_expires = '';
    u.pin_set_at = Util.now();
    Db.update('users', u);
    Auth.endSessions(id);
    Db.log('info', 'auth.activate', id, '');
    return Auth.startSession(u);
  },

  changePin: function (req, session) {
    var u = Auth.activeUser(session.userId);
    Auth.checkThrottle(session.userId);
    if (Auth.hash(Util.str(req.currentPin), Util.str(u.salt)) !== Util.str(u.pin_hash)) Auth.fail(session.userId, 'Tu PIN actual no coincide.');
    var pin = Auth.validatePin(req.newPin);
    if (pin === Util.str(req.currentPin)) throw new ApiError('INVALID', 'El PIN nuevo tiene que ser distinto al actual.');
    u.salt = Util.randomHex().slice(0, 32);
    u.pin_hash = Auth.hash(pin, u.salt);
    u.pin_set_at = Util.now();
    Db.update('users', u);
    Auth.endSessions(session.userId);
    Db.log('info', 'auth.changePin', session.userId, '');
    return Auth.startSession(u);
  },

  logout: function (req) {
    var token = Util.str(req.token);
    if (token) Util.props().deleteProperty('sess:' + Util.sha256(token));
    return { ok: true };
  },

  /* --- Gestión de personas (admin, o los dueños desde el menú del Sheet) --- */
  listUsers: function () {
    var rows = Db.rows('users'), out = [];
    for (var i = 0; i < rows.length; i++) {
      var u = rows[i];
      var hasPin = Util.str(u.pin_hash) !== '';
      out.push({ userId: Util.str(u.user_id), name: Util.str(u.name), role: Util.str(u.role), active: Util.bool(u.active), hasPin: hasPin, activationPending: Auth.activationPending(u), activationExpires: Auth.activationPending(u) ? Util.str(u.activation_expires) : null, pinSetAt: Util.str(u.pin_set_at) || null });
    }
    return out;
  },

  _newCode: function (u) {
    var code = Util.randomDigits(8);
    u.activation_hash = Auth.hash(code, 'act:' + Util.str(u.user_id));
    u.activation_expires = Util.iso(new Date(new Date().getTime() + CONFIG.ACTIVATION_HOURS * 3600 * 1000));
    return code;
  },
  _role: function (role) {
    role = Util.str(role);
    if (role !== 'admin' && role !== 'staff') throw new ApiError('INVALID', 'El rol tiene que ser admin o colaboradora.');
    return role;
  },
  _countAdmins: function (exceptId) {
    var rows = Db.rows('users'), n = 0;
    for (var i = 0; i < rows.length; i++) if (Util.str(rows[i].role) === 'admin' && Util.bool(rows[i].active) && Util.str(rows[i].user_id) !== exceptId) n++;
    return n;
  },

  createUser: function (req, session) {
    var name = Util.str(req.name).replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 40) throw new ApiError('INVALID', 'Escribí el nombre de la persona (2 a 40 letras).');
    var role = Auth._role(req.role);
    var base = Util.slug(name) || 'persona', id = base, n = 2;
    while (Auth.user(id)) id = base + '-' + (n++);
    var rows = Db.rows('users');
    for (var i = 0; i < rows.length; i++) if (Util.key(rows[i].name) === Util.key(name) && Util.bool(rows[i].active)) throw new ApiError('CONFLICT', 'Ya hay una persona activa con ese nombre.');
    var u = { user_id: id, name: name, role: role, active: true, pin_hash: '', salt: '', activation_hash: '', activation_expires: '', pin_set_at: '', created_at: Util.now() };
    var code = Auth._newCode(u);
    Db.append('users', [u]);
    Db.log('info', 'user.create', session ? session.userId : 'menu', id + ' · ' + role);
    return { userId: id, name: name, role: role, activationCode: code, activationExpires: u.activation_expires };
  },

  updateUser: function (req, session) {
    var u = Auth.user(Util.str(req.userId));
    if (!u) throw new ApiError('NOT_FOUND', 'No encontramos a esa persona.');
    var id = Util.str(u.user_id);
    if (req.role !== undefined) {
      var role = Auth._role(req.role);
      if (role !== 'admin' && Util.str(u.role) === 'admin' && Auth._countAdmins(id) === 0) throw new ApiError('INVALID', 'Tiene que quedar al menos una persona admin.');
      u.role = role;
    }
    if (req.active !== undefined) {
      var active = !!req.active;
      if (!active && Util.str(u.role) === 'admin' && Auth._countAdmins(id) === 0) throw new ApiError('INVALID', 'Tiene que quedar al menos una persona admin activa.');
      if (!active && session && session.userId === id) throw new ApiError('INVALID', 'No podés desactivar tu propio usuario.');
      u.active = active;
    }
    if (req.name !== undefined) {
      var name = Util.str(req.name).replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 40) throw new ApiError('INVALID', 'Escribí el nombre de la persona (2 a 40 letras).');
      u.name = name;
    }
    Db.update('users', u);
    Auth.endSessions(id); // el rol y el nombre viajan en la sesión: tiene que volver a entrar
    Db.log('info', 'user.update', session ? session.userId : 'menu', id);
    return { ok: true };
  },

  /** Código nuevo de un solo uso. El PIN anterior deja de servir y se cierran sus sesiones. */
  resetPin: function (req, session) {
    var u = Auth.user(Util.str(req.userId));
    if (!u || !Util.bool(u.active)) throw new ApiError('NOT_FOUND', 'No encontramos a esa persona o está desactivada.');
    var id = Util.str(u.user_id);
    var code = Auth._newCode(u);
    u.pin_hash = '';
    u.salt = '';
    Db.update('users', u);
    Auth.endSessions(id);
    Util.cache().remove('fail:' + id);
    Db.log('info', 'user.resetPin', session ? session.userId : 'menu', id);
    return { userId: id, name: Util.str(u.name), activationCode: code, activationExpires: u.activation_expires };
  }
};

// ===== 40_Catalog.js =====
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

// ===== 50_Stock.js =====
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

// ===== 60_Sales.js =====
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

// ===== 70_Import.js =====
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

// ===== 80_Router.js =====
/**
 * API web. Todo llega por POST con Content-Type text/plain y cuerpo JSON: { action, token, ... }.
 * (Apps Script no responde el preflight de CORS ni deja leer headers, por eso el token va en el cuerpo.)
 * Respuesta: { ok: true, data } o { ok: false, error: { code, message, details } }.
 */
var ACTIONS = {
  'ping': { role: 'public', fn: function () { return { app: 'lirien-inventario', version: CONFIG.VERSION, ts: Util.now() }; } },
  'users.public': { role: 'public', fn: function () { return { users: Auth.publicUsers(), version: CONFIG.VERSION }; } },
  'auth.login': { role: 'public', write: true, fn: function (req) { return Auth.login(req); } },
  'auth.activate': { role: 'public', write: true, fn: function (req) { return Auth.activate(req); } },
  'auth.logout': { role: 'staff', fn: function (req) { return Auth.logout(req); } },
  'auth.changePin': { role: 'staff', write: true, fn: function (req, s) { return Auth.changePin(req, s); } },
  'catalog': { role: 'staff', raw: true, fn: function () { return Catalog.json(); } },
  'sale.checkout': { role: 'staff', write: true, fn: function (req, s) { return Sales.checkout(req, s); } },
  'sales': { role: 'staff', fn: function (req, s) { return Sales.list(req, s); } },
  'movements': { role: 'staff', fn: function (req, s) { return Stock.list(req, s); } },
  'sale.void': { role: 'admin', write: true, fn: function (req, s) { return Sales.voidSale(req, s); } },
  'movement.create': { role: 'admin', write: true, fn: function (req, s) { return Stock.create(req, s); } },
  'product.upsert': { role: 'admin', write: true, fn: function (req, s) { return Catalog.upsert(req, s); } },
  'product.archive': { role: 'admin', write: true, fn: function (req, s) { return Catalog.archive(req, s); } },
  'barcode.link': { role: 'admin', write: true, fn: function (req, s) { return Catalog.linkBarcode(req, s); } },
  'users.list': { role: 'admin', fn: function () { return Auth.listUsers(); } },
  'user.create': { role: 'admin', write: true, fn: function (req, s) { return Auth.createUser(req, s); } },
  'user.update': { role: 'admin', write: true, fn: function (req, s) { return Auth.updateUser(req, s); } },
  'user.resetPin': { role: 'admin', write: true, fn: function (req, s) { return Auth.resetPin(req, s); } },
  'import.preview': { role: 'admin', fn: function (req) { return Import.preview(req); } },
  'import.apply': { role: 'admin', write: true, fn: function (req, s) { return Import.apply(req, s); } },
  'export': { role: 'admin', fn: function () { return Import.exportRows(); } }
};

/** Corre una función con el candado del script (una escritura a la vez). */
function withLock(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) { throw new ApiError('BUSY', 'El sistema está ocupado. Probá de nuevo en unos segundos.'); }
  try { return fn(); } finally { lock.releaseLock(); }
}

function handle(req) {
  Db.reset();
  try {
    if (!req || typeof req !== 'object') throw new ApiError('INVALID', 'Solicitud inválida.');
    var def = ACTIONS[Util.str(req.action)];
    if (!def) throw new ApiError('INVALID', 'Acción desconocida.');
    var session = null;
    if (def.role !== 'public') {
      session = Auth.requireSession(req.token);
      if (def.role === 'admin' && session.role !== 'admin') throw new ApiError('FORBIDDEN', 'Eso solo lo puede hacer una persona admin.');
    }
    var data = def.write ? withLock(function () { return def.fn(req, session); }) : def.fn(req, session);
    return def.raw ? '{"ok":true,"data":' + data + '}' : JSON.stringify({ ok: true, data: data });
  } catch (err) {
    if (err && err.isApi) return JSON.stringify({ ok: false, error: { code: err.code, message: err.message, details: err.details } });
    Db.log('error', 'server', '', String(err && err.stack ? err.stack : err).slice(0, 900));
    return JSON.stringify({ ok: false, error: { code: 'SERVER', message: 'Algo falló de nuestro lado. Probá de nuevo.', details: null } });
  }
}

function respond(json) {
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var req = null;
  try { req = JSON.parse(e && e.postData ? e.postData.contents : '{}'); } catch (err) { req = null; }
  return respond(handle(req));
}

/** GET solo sirve para comprobar que la API está viva (…/exec?action=ping). */
function doGet() {
  return respond(handle({ action: 'ping' }));
}

// ===== 90_Menu.js =====
/** Menú "Lirien" dentro del Sheet: instalación y tareas de los dueños. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Lirien')
    .addItem('1. Configurar hojas', 'menuSetup')
    .addItem('2. Cargar catálogo base (8 nov 2026)', 'menuSeed')
    .addItem('3. Agregar persona y generar código', 'menuAddUser')
    .addSeparator()
    .addItem('Importar inventario desde la hoja "legacy"', 'menuImportLegacy')
    .addItem('Generar código nuevo para una persona', 'menuResetPin')
    .addItem('Recalcular hoja de stock', 'menuRebuildStock')
    .addItem('Refrescar datos de la app', 'menuRefresh')
    .addItem('Activar aviso diario de stock bajo', 'menuInstallDigest')
    .addToUi();
}

function menuRun_(fn) {
  var ui = SpreadsheetApp.getUi();
  Db.reset();
  try {
    var message = withLock(fn);
    if (message) ui.alert('Lirien', message, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Lirien', err && err.isApi ? err.message : 'Algo falló: ' + err, ui.ButtonSet.OK);
  }
}

function menuSetup() {
  menuRun_(function () { Db.setup(); return 'Hojas listas. Siguiente paso: "2. Cargar catálogo base" y luego "3. Agregar persona".'; });
}

function menuSeed() {
  menuRun_(function () { var r = Seed.load(); return 'Catálogo cargado: ' + r.products + ' productos, ' + r.variants + ' variantes y ' + r.units + ' unidades (foto del 8 de noviembre). Subí el inventario actualizado desde la app (Admin → Importar) para ponerlo al día.'; });
}

function menuAddUser() {
  var ui = SpreadsheetApp.getUi();
  var name = ui.prompt('Lirien · Agregar persona', 'Nombre (como va a aparecer en la app):', ui.ButtonSet.OK_CANCEL);
  if (name.getSelectedButton() !== ui.Button.OK) return;
  var role = ui.alert('Lirien · Rol', '¿' + name.getResponseText() + ' es admin (dueños)?\n\nSí = admin · No = colaboradora (solo consulta y ventas)', ui.ButtonSet.YES_NO_CANCEL);
  if (role === ui.Button.CANCEL) return;
  menuRun_(function () {
    var r = Auth.createUser({ name: name.getResponseText(), role: role === ui.Button.YES ? 'admin' : 'staff' }, null);
    return 'Código de activación de ' + r.name + ': ' + r.activationCode.slice(0, 4) + ' ' + r.activationCode.slice(4) + '\n\nEs de un solo uso y vence en ' + CONFIG.ACTIVATION_HOURS + ' horas. Con ese código, ' + r.name + ' crea su PIN de 6 dígitos en la app. No queda guardado: anotalo ahora.';
  });
}

function menuResetPin() {
  var ui = SpreadsheetApp.getUi();
  var who = ui.prompt('Lirien · Código nuevo', 'Nombre de la persona (tal como está en la hoja users):', ui.ButtonSet.OK_CANCEL);
  if (who.getSelectedButton() !== ui.Button.OK) return;
  menuRun_(function () {
    var rows = Db.rows('users'), key = Util.key(who.getResponseText()), found = null;
    for (var i = 0; i < rows.length; i++) if (Util.key(rows[i].name) === key || Util.str(rows[i].user_id) === Util.str(who.getResponseText())) found = rows[i];
    if (!found) throw new ApiError('NOT_FOUND', 'No encontramos a esa persona en la hoja users.');
    var r = Auth.resetPin({ userId: Util.str(found.user_id) }, null);
    return 'Código de activación de ' + r.name + ': ' + r.activationCode.slice(0, 4) + ' ' + r.activationCode.slice(4) + '\n\nSu PIN anterior ya no sirve. El código vence en ' + CONFIG.ACTIVATION_HOURS + ' horas.';
  });
}

/** Lee la pestaña "legacy" (copia del Sheet de siempre: A nombre, B precio final, C existencias, D urna, E oferta). */
function legacyRows_() {
  var sh = Db.ss().getSheetByName('legacy');
  if (!sh) throw new ApiError('SETUP', 'No hay una pestaña llamada "legacy". Copiá ahí el inventario actualizado.');
  var values = sh.getDataRange().getValues(), rows = [];
  for (var i = 0; i < values.length; i++) {
    var name = Util.str(values[i][0]);
    if (!name || name === 'ƒ' || /^(nombre|producto)$/i.test(name) || /precio final/i.test(Util.str(values[i][1]))) continue;
    rows.push({ line: i + 1, name: name, price: values[i][1], stock: values[i][2], location: values[i][3], offer: values[i][4] });
  }
  return rows;
}

function menuImportLegacy() {
  var ui = SpreadsheetApp.getUi();
  var plan = null;
  Db.reset();
  try { plan = Import.plan(legacyRows_(), null); } catch (err) { ui.alert('Lirien', err && err.isApi ? err.message : String(err), ui.ButtonSet.OK); return; }
  var s = plan.summary;
  var ok = ui.alert('Lirien · Importar inventario', s.rows + ' filas leídas.\n\n• ' + s.priceChanges + ' cambios de precio\n• ' + s.stockChanges + ' diferencias de stock (' + (s.stockUnitsDelta >= 0 ? '+' : '') + s.stockUnitsDelta + ' unidades)\n• ' + s.newItems + ' productos o variantes nuevas\n• ' + s.missing + ' del catálogo no vienen en el archivo (no se tocan)\n• ' + s.warnings + ' avisos para revisar (quedan en la hoja review)\n\n¿Aplicar?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  menuRun_(function () { var r = Import.apply({ rows: legacyRows_() }, null); return 'Listo: ' + r.applied.variantsUpdated + ' variantes actualizadas, ' + r.applied.variantsCreated + ' nuevas y ' + r.applied.movements + ' movimientos registrados.'; });
}

function menuRebuildStock() {
  menuRun_(function () { var d = Stock.rebuild(); return d ? 'Stock recalculado: ' + d + ' SKU no cuadraban y se corrigieron (quedó anotado en log).' : 'Stock recalculado: todo cuadraba.'; });
}

function menuRefresh() {
  menuRun_(function () { Catalog.invalidate(); return 'Listo. La app va a mostrar los datos nuevos al actualizar.'; });
}

function menuInstallDigest() {
  var ui = SpreadsheetApp.getUi();
  var mail = ui.prompt('Lirien · Aviso diario', 'Correo que recibe el aviso de stock bajo (cada día a las 8 a. m.):', ui.ButtonSet.OK_CANCEL);
  if (mail.getSelectedButton() !== ui.Button.OK) return;
  menuRun_(function () {
    var email = Util.str(mail.getResponseText());
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError('INVALID', 'Ese correo no parece válido.');
    Util.props().setProperty('ALERT_EMAIL', email);
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) if (triggers[i].getHandlerFunction() === 'dailyDigest') ScriptApp.deleteTrigger(triggers[i]);
    ScriptApp.newTrigger('dailyDigest').timeBased().everyDays(1).atHour(8).create();
    return 'Aviso activado para ' + email + '.';
  });
}

/** Disparador diario: recalcula el stock y manda el resumen de agotados y últimas unidades. */
function dailyDigest() {
  Db.reset();
  var email = Util.props().getProperty('ALERT_EMAIL');
  var data = withLock(function () { Stock.rebuild(); return Catalog.build(); });
  if (!email) return;
  var low = [], out = [];
  for (var i = 0; i < data.length; i++) {
    var p = data[i];
    if (p.status !== 'active') continue;
    for (var k = 0; k < p.variants.length; k++) {
      var v = p.variants[k];
      if (!v.active) continue;
      var name = p.vendor + ' ' + p.title + (v.optionValue ? ' · ' + v.optionValue : '');
      if (v.stock <= 0) out.push(name); else if (v.stock <= v.minStock) low.push(name + ' (' + v.stock + ')');
    }
  }
  if (!low.length) return; // los agotados no cambian de un día a otro: solo se avisa si hay últimas unidades
  MailApp.sendEmail(email, 'Lirien · ' + low.length + ' productos en últimas unidades', 'Últimas unidades:\n- ' + low.join('\n- ') + '\n\nAgotados: ' + out.length + '\n\nMirá el detalle en la app, pestaña Alertas.');
}

// ===== 95_Seed.js =====
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

// ===== 96_SeedData.js =====
// GENERADO por dev/seed.mjs. No editar a mano.
var SEED_DATA = {"date":"2026-11-08","products":[["P-0001","arencia-vitamin-c-booster-shot","Arencia","Vitamin C Booster Shot","Skincare","",[["LIR-00001","",14500,null,0,1,"",0,"ARENCIA VITAMIN C BOOSTER SHOT",""]]],["P-0002","arencia-pdrn-hyaluronic-deep-hydration-pad","Arencia","PDRN Hyaluronic Deep Hydration Pad","Skincare","",[["LIR-00002","",13900,null,1,1,"URNA 3",0,"ARENCIA PDRN HYALURONIC DEEP HYDRATION PAD",""]]],["P-0003","arencia-retinal-booster-shot","Arencia","Retinal Booster Shot","Skincare","",[["LIR-00003","",14500,null,1,1,"URNA 3",0,"ARENCIA RETINAL BOOSTER SHOT",""]]],["P-0004","amuse-ultrafine-brow-pencil","Amuse","Ultrafine Brow Pencil","Maquillaje","",[["LIR-00004","",2000,null,1,1,"",0,"AMUSE ULTRAFINE BROW PENCIL",""]]],["P-0005","anastasia-beverly-hills-crystal-lip-gloss","Anastasia Beverly Hills","Crystal Lip Gloss","Maquillaje","",[["LIR-00005","",12900,null,1,1,"",0,"ANASTASIA CRYTAL LIP GLOSS",""]]],["P-0006","anua-retinol-caffeine-eye-cream","Anua","Retinol Caffeine Eye Cream","Skincare","",[["LIR-00006","",13500,null,1,1,"",0,"ANUA RETINOL CAFFEINE EYE CREAM",""]]],["P-0007","anua-hyaluronic-acid-8-panthenol-foaming-cleanser","Anua","Hyaluronic Acid 8 +panthenol Foaming Cleanser","Skincare","",[["LIR-00007","",14000,null,1,1,"URNA 1",0,"ANUA HYALURONIC ACID 8 +PANTHENOL FOAMING CLEANSER",""]]],["P-0008","anua-rice-7-serum","Anua","Rice 7+ Serum","Skincare","",[["LIR-00008","",13500,null,0,1,"",0,"ANUA RICE 7+ SERUM",""]]],["P-0009","anua-rice-70-moisturizing-milk","Anua","Rice 70 Moisturizing Milk","Skincare","",[["LIR-00009","",16900,null,1,1,"URNA 2",0,"ANUA RICE 70 MOISTURING MILK",""]]],["P-0010","anua-rice-70-glow-milky-toner","Anua","Rice 70 Glow Milky Toner","Skincare","",[["LIR-00010","",15500,null,0,1,"",0,"ANUA RICE 70 GLOW MILKY TONER",""]]],["P-0011","anua-pdrn-hialuron-hydrating-capsule-mist-grande","Anua","PDRN + Hialuron Hydrating Capsule Mist Grande","Skincare","",[["LIR-00011","",17900,null,0,1,"",0,"ANUA PDRN + HIALURON HYDRATING CAPSULE MIST GRANDE",""]]],["P-0012","anua-green-lemon-vita-c-serum","Anua","Green Lemon Vita C Serum","Skincare","",[["LIR-00012","",15000,null,1,1,"",0,"ANUA GREEN LEMON VITA C SERUM",""]]],["P-0013","anua-pdrn-hialuron-acid-100-moisturizing-cream","Anua","PDRN +hialuron Acid 100 Moisturizing Cream","Skincare","",[["LIR-00013","",15900,null,1,1,"URNA 2",0,"ANUA PDRN +HIALURON ACID 100 MOISTURIZING CREAM",""]]],["P-0014","anua-heartleaf-70-daily-lotion","Anua","Heartleaf 70 Daily Lotion","Skincare","",[["LIR-00014","",16900,null,0,1,"",0,"ANUA HEARTLEAF 70 DAILY LOTION",""]]],["P-0015","anua-heartleaf-pore-control-cleansing-oil","Anua","Heartleaf Pore Control Cleansing Oil","Skincare","",[["LIR-00015","",15500,null,2,1,"URNA 1",0,"ANUA HEARTLEAF PORE CONTROL CLEASING OIL",""]]],["P-0016","anua-peach-70-niacin-serum-mask","Anua","Peach 70 + Niacin Serum Mask","Skincare","",[["LIR-00016","",2000,null,0,1,"",0,"ANUA PEACH 70 + NIACIN SERUM MASK",""]]],["P-0017","anua-heartleaf-70-soothing-cream","Anua","Heartleaf 70 Soothing Cream","Skincare","",[["LIR-00017","",15500,null,1,1,"URNA 2",0,"ANUA HEARTLEAF 70 SOOTHING CREAM",""]]],["P-0018","anua-azelaic-acid-3-cica-toner","Anua","Azelaic Acid 3 Cica Toner","Skincare","",[["LIR-00018","",15000,null,2,1,"",0,"ANUA AZELAIC  ACID 3 CICA  TONER",""]]],["P-0019","anua-azelaic-acid-15-cica-intense-calming-serum","Anua","Azelaic Acid 15. Cica Intense Calming Serum","Skincare","",[["LIR-00019","",14900,null,0,1,"",0,"ANUA AZELAIC ACID 15. CICA INTENSE CALMING SERUM",""]]],["P-0020","anua-azelaic-10-hyaluron","Anua","Azelaic 10 Hyaluron","Skincare","",[["LIR-00020","",14900,null,1,1,"",0,"ANUA AZELAIC 10 HYALURON",""]]],["P-0021","anua-pdrn-hyaluron-capsule-mist-mini","Anua","PDRN Hyaluron Capsule Mist Mini","Skincare","",[["LIR-00021","",14900,null,2,1,"",0,"ANUA PDRN HYALURON CAPSULE MIST MINI",""]]],["P-0022","anua-10-niacinamide-txa-4-dark-spot-correcting-serum","Anua","10+ Niacinamide TXA 4 Dark Spot Correcting Serum","Skincare","",[["LIR-00022","",17000,null,3,1,"",0,"ANUA 10+ NIACINAMIDE TXA 4 DARK SPOT CORRECTING SERUM",""]]],["P-0023","anua-heartleaf-quercetinol-pore-deep-cleansing-foam","Anua","Heartleaf Quercetinol Pore Deep Cleansing Foam","Skincare","",[["LIR-00023","",14500,null,1,1,"URNA 1",0,"ANUA HEARTLEAF QUERCETINOL PORE DEEP CLEANSING FOAM",""]]],["P-0024","anua-heartleaf-soothing-toner-77","Anua","Heartleaf Soothing Toner 77%","Skincare","",[["LIR-00024","",15500,null,1,1,"",0,"ANUA HEARTLEAF SOOTHING TONER 77%",""]]],["P-0025","anua-100-pdrn-hyaluron-acid-capsule-serum","Anua","100+ PDRN + Hyaluron Acid Capsule Serum","Skincare","",[["LIR-00025","",14900,null,0,1,"",0,"ANUA 100+ PDRN + HYALURON ACID CAPSULE SERUM",""]]],["P-0026","anua-10-azelaic-acid-hyaluron","Anua","10+ Azelaic Acid Hyaluron","Skincare","",[["LIR-00026","",14900,null,1,1,"",0,"ANUA 10+ AZELAIC ACID HYALURON",""]]],["P-0027","anua-glow-skin-discovery-set","Anua","Glow Skin Discovery Set","Skincare","",[["LIR-00027","",21900,null,1,1,"URNA 1",0,"ANUA GLOW SKIN DISCOVERY SET",""]]],["P-0028","anua-heartleaf-bha-quercetinol-foam-cleansing","Anua","Heartleaf BHA Quercetinol Foam Cleansing","Skincare","",[["LIR-00028","",14500,null,1,1,"",0,"ANUA HEARTLEAF BHA QUERCETINOLFOAM CLEASING",""]]],["P-0029","axis-y-dark-spot-correcting-glow-serum","Axis-Y","Dark Spot Correcting Glow Serum","Skincare","",[["LIR-00029","",14500,null,1,1,"URNA 2",0,"AXIS-Y DARK SPOT CORRECTING GLOW SERUM",""]]],["P-0030","amika-frizz-fighting-treatment","Amika","Frizz Fighting Treatment","Cabello","",[["LIR-00030","",17900,null,1,1,"URNA 1",0,"AMIKA FRIZZ FIGHTING TREATMENT",""]]],["P-0031","australian-gold-hot","Australian Gold","Hot","Cuerpo","",[["LIR-00031","",26900,null,1,1,"URNA 3",0,"ASUSTRALAIAN GOLD  HOT",""]]],["P-0032","bath-and-body-works-alcohol-en-gel","Bath & Body Works","Alcohol En Gel","Cuerpo","",[["LIR-00032","",2500,null,4,1,"",0,"BATH & BODY WORKS ALCOHOL EN GEL",""]]],["P-0033","bareminerals-complexion-rescue-35-ml","bareMinerals","Complexion Rescue 35 ml","Skincare","",[["LIR-00033","",24900,null,1,1,"",0,"BAREMINERALS COMPLEXION RESCUE 35 ML",""]]],["P-0034","beilingmei-golden-peel-off-mask-98-4","Beilingmei","Golden Peel Off Mask 98.4","Skincare","",[["LIR-00034","",11900,null,1,1,"URNA 3",0,"BEILING ME GOLDEN  PEEL OFF MASL 98.4",""]]],["P-0035","beau-visage-delineador-con-color","Beau Visage","Delineador con Color","Maquillaje","",[["LIR-00035","",1500,null,7,1,"URNA 3",0,"BEAU USAGE DELINEADOR CON COLOR",""]]],["P-0036","beau-visage-kit-girly-basic-hair-accessories","Beau Visage","Kit Girly Basic Hair Accessories","Accesorios","",[["LIR-00036","",3000,null,0,1,"",0,"BEAU VISAGE KIT GIRLY BASIC HAIR ACCESORIES",""]]],["P-0037","benefit-pore-primer","Benefit","Pore Primer","Maquillaje","",[["LIR-00037","",21000,null,0,1,"",0,"BENEFIT PORE PRIMER",""]]],["P-0038","benefit-cookie-iluminador","Benefit","Cookie Iluminador","Maquillaje","",[["LIR-00038","",21000,null,0,1,"",0,"BENEFIT COOKIE ILUMINADOR",""]]],["P-0039","benefit-kit-mascara","Benefit","Kit Mascara","Maquillaje","",[["LIR-00039","",16900,null,0,1,"",0,"BENEFIT KIT MASCARA",""]]],["P-0040","benefit-bang-waterproof-volumizing-mascara","Benefit","Bang! Waterproof Volumizing Mascara","Maquillaje","",[["LIR-00040","",16500,null,0,1,"",0,"BENEFIT BANG!  WATERPROOF VOLUMIZING MASCARA",""]]],["P-0041","benefit-rollin-with-benetint","Benefit","Rollin´ With Benetint","Maquillaje","",[["LIR-00041","",26900,null,0,1,"",0,"BENEFIT ROLLIN´ WITH BENETINT",""]]],["P-0042","benefit-fan-fest-mascara","Benefit","Fan Fest Mascara","Maquillaje","",[["LIR-00042","",7000,null,2,1,"URNA 1",0,"BENEFIT FAN FEST MASCARA",""]]],["P-0043","benefit-mighty-fine-brow-pen","Benefit","Mighty Fine Brow Pen","Maquillaje","",[["LIR-00043","",18900,null,1,1,"URNA 3",0,"BENEFIT MIGHTY FINE BROW PEN",""]]],["P-0044","biodance-refreshing-sea-kelp-real-deep-mask","Biodance","Refreshing Sea Kelp Real Deep Mask","Skincare","",[["LIR-00044","",3750,null,0,1,"",0,"BIODANCE REFRESHING SEA KELP REAL DEEP MASK",""]]],["P-0045","biodance-rosada-bio-collagen-real-deep-mask","Biodance","Rosada Bio Collagen Real Deep Mask","Skincare","",[["LIR-00045","",4000,null,17,1,"URNA 3",0,"BIODANCE ROSADA BIO COLLAGEN REAL DEEP MASK",""]]],["P-0046","biodance-rejuvenating-caviar-pdrn-real-deep-mask-morada","Biodance","Rejuvenating Caviar PDRN Real Deep Mask Morada","Skincare","",[["LIR-00046","",4000,null,1,1,"URNA 1",0,"BIODANCE REJUVENATING CAVIAR PDRN REAL DEEP MASK MORADA",""]]],["P-0047","biodance-collagen-gel-toner-pads","Biodance","Collagen Gel Toner Pads","Skincare","",[["LIR-00047","",16900,null,1,1,"URNA 4",0,"BIODANCE COLLAGEN GEL TONER PADS",""]]],["P-0048","biodance-4-paquetes-de-biodance-rosado","Biodance","4 Paquetes de Biodance Rosado","Skincare","",[["LIR-00048","",13900,null,4,1,"",0,"BIODANCE 4 PAQUETES DE BIODANCE ROSADO",""]]],["P-0049","bioaqua-mask-individual","Bioaqua","Mask Individual","Skincare","",[["LIR-00049","",900,null,13,1,"",0,"BIOAQUA MASK INDIVIDUAL",""]]],["P-0050","bioaqua-rice-raw-pulp","Bioaqua","Rice Raw Pulp","Skincare","",[["LIR-00050","",900,null,10,1,"",0,"BIOAQUA RICE RAW PULP",""]]],["P-0051","bubble-brightening-skincare-routine","Bubble","Brightening Skincare Routine","Skincare","",[["LIR-00051","",34000,null,0,1,"",0,"BUBBLE BRIGHTENING SKINCARE ROUTINE",""]]],["P-0052","beauty-creations-locion-corporal-doble-capa","Beauty Creations","Locion Corporal Doble Capa","Cuerpo","",[["LIR-00052","",5500,null,3,1,"",0,"BEAUTY CREATIONS LOCION CORPORAL DOBLE CAPA",""]]],["P-0053","beauty-creations-nude-x-lipliner","Beauty Creations","Nude X Lipliner","Maquillaje","",[["LIR-00053","",3500,null,2,1,"",1,"BEAUTY CREATIONS NUDE X LIPLINER",""]]],["P-0054","beauty-creations-tinted-lip-oil","Beauty Creations","Tinted Lip Oil","Maquillaje","",[["LIR-00054","",2500,null,2,1,"URNA 2",0,"BEAUTY CREATIONS TINTED LIP OIL",""]]],["P-0055","beauty-creations-king-of-screams-lip-oil-disney","Beauty Creations","King Of Screams Lip Oil Disney","Maquillaje","",[["LIR-00055","",3000,null,4,1,"URNA 2",0,"BEAUTY CREATIONS KING OF SCREAMS LIP OIL DISNEY",""]]],["P-0056","beauty-creations-setting-powder","Beauty Creations","Setting Powder","Maquillaje","",[["LIR-00056","",3500,null,1,1,"",0,"BEAUTY CREATIONS SETTING POWDER",""]]],["P-0057","beauty-creations-pink-halo-hands-sanitizer","Beauty Creations","Pink Halo Hands Sanitizer","Cuerpo","",[["LIR-00057","",2900,null,1,1,"",0,"BEAUTY CREATIONS PINK HALO HANDS SANITAZER",""]]],["P-0058","beilingmei-golden-peel-off-mask","Beilingmei","Golden Peel Off Mask","Skincare","",[["LIR-00058","",11900,null,1,1,"",1,"BEILINGMEI GOLDEN PEEL OFF MASK",""]]],["P-0059","carla-secret-concealer-and-blush","Carla Secret","Concealer & Blush","Maquillaje","",[["LIR-00059","",15900,null,0,1,"URNA 2",0,"CARLA SECRET CONCEALER & BLUSH",""]]],["P-0060","celimax-retinal-shot-tightening-booster","Celimax","Retinal Shot Tightening Booster","Skincare","",[["LIR-00060","",14500,null,2,1,"",1,"CELIMAX RETINAL SHOT TIGHTENING BOOSTER",""]]],["P-0061","celimax-pore-dark-spot-sunscreen","Celimax","Pore + Dark Spot Sunscreen","Skincare","",[["LIR-00061","",14000,null,0,1,"",0,"CELIMAX PORE + DARK SPOT SUNSCREAM",""]]],["P-0062","celimax-retinol-shot-tightening-serum","Celimax","Retinol Shot Tightening Serum","Skincare","",[["LIR-00062","",15900,null,1,1,"",0,"CELIMAX RETINOL SHOT TIGHTENING SERUM",""]]],["P-0063","celimax-pore-dark-spot-brightening-cream-mask","Celimax","Pore + Dark Spot Brightening Cream Mask","Skincare","",[["LIR-00063","",3000,null,4,1,"URNA 1, URNA 2",0,"CELIMAX PORE + DARK SPOT BRIGHTENING CREAM MASK",""]]],["P-0064","celimax-pore-dark-spot-brightening-cream","Celimax","Pore + Dark Spot Brightening Cream","Skincare","",[["LIR-00064","",11900,null,6,1,"URNA 2",0,"CELIMAX PORE + DARK SPOT BRIGHTENING CREAM",""]]],["P-0065","charlotte-tilbury-powder","Charlotte Tilbury","Powder","Maquillaje","",[["LIR-00065","",27900,null,11,1,"Varias urnas",0,"CHARLOTTE TILBURY POWDER",""]]],["P-0066","charlotte-tilbury-concealer","Charlotte Tilbury","Concealer","Maquillaje","",[["LIR-00066","",29900,null,1,1,"",1,"CHARLOTTE TILBURY CONCEALER",""]]],["P-0067","charlotte-tilbury-setting-spray","Charlotte Tilbury","Setting Spray","Maquillaje","Tamaño",[["LIR-00067","Estándar",20000,null,0,1,"",0,"CHARLOTTE TILBURY SETTING SPRAY",""],["LIR-00068","Grande",30000,null,0,1,"",0,"CHARLOTTE TILBURY SETTING SPRY GRANDE",""]]],["P-0068","charlotte-tilbury-pillow-talk-glossy-lip-kit","Charlotte Tilbury","Pillow Talk Glossy Lip Kit","Maquillaje","",[["LIR-00069","",21750,null,0,1,"",0,"CHARLOTTE TILBURY PILLOW TALK GLOSSY LIP KIT",""]]],["P-0069","charlotte-tilbury-foundation","Charlotte Tilbury","Foundation","Maquillaje","",[["LIR-00070","",27500,null,1,1,"",1,"CHARLOTTE FOUNDATION",""]]],["P-0070","charlotte-tilbury-unreal-lips-healthy-glow-nectar-oil","Charlotte Tilbury","Unreal Lips Healthy Glow Nectar Oil","Maquillaje","",[["LIR-00071","",17000,null,1,1,"URNA 1",0,"CHARLOTTE TILBURY UNREAL LIPS HEALTHY GLOW NECTAR OIL",""]]],["P-0071","clinique-moisture-surge-lip","Clinique","Moisture Surge Lip","Skincare","",[["LIR-00072","",13000,null,1,1,"",0,"CLINIQUE MOISTURE SURGE LIP",""]]],["P-0072","coco-and-eve-sunny-honey-prolonging-peptide-body-oil","Coco & Eve","Sunny Honey Prolonging Peptide Body Oil","Cuerpo","",[["LIR-00073","",22900,null,1,1,"",0,"COCO & EVE SUNNY HONEY PROLONGING PEPTIDE BODY OIL",""]]],["P-0073","coco-and-eve-sunny-honey-bronzing-foam","Coco & Eve","Sunny Honey Bronzing Foam","Cuerpo","",[["LIR-00074","",26900,null,1,1,"",0,"COCO & EVE SUNNY HONEY BRONZING FOAM",""]]],["P-0074","cosrx-kit","COSRX","Kit","Skincare","",[["LIR-00075","",16900,null,0,1,"",0,"COSRX KIT",""]]],["P-0075","cosrx-aha-bha-clarifying-treatment-toner","COSRX","Aha/bha Clarifying Treatment Toner","Skincare","",[["LIR-00076","",15000,null,1,1,"",1,"COSRX AHA/BHA CLARIFYING TREATMENT TONER",""]]],["P-0076","cosrx-low-ph-good-morning-gel-cleanser","COSRX","Low PH Good Morning Gel Cleanser","Skincare","",[["LIR-00077","",13500,null,1,1,"URNA 1",0,"COSRX LOW PH GOOD MORNING GEL CLEANSER",""]]],["P-0077","cosrx-salicylic-acid-daily-gentle-cleanser","COSRX","Salicylic Acid Daily Gentle Cleanser","Skincare","",[["LIR-00078","",14000,null,1,1,"URNA 1",0,"COSRX SALICYLIC ACID DAILY GENTLE CLEANSER","URNA 1 actualizado"]]],["P-0078","cosrx-aha-7-whitehead-power-liquid","COSRX","AHA 7 Whitehead Power Liquid","Skincare","",[["LIR-00079","",16000,null,1,1,"",1,"COSRX AHA 7 WHITEHEAD POWER LIQUID",""]]],["P-0079","cosrx-advanced-snail-mucin-gel-cleanser","COSRX","Advanced Snail Mucin Gel Cleanser","Skincare","",[["LIR-00080","",16900,null,1,1,"URNA 1",0,"COSRX  ADVANCED SNAIL MUCIN GEL CLEANSER",""]]],["P-0080","cosrx-aloe-soothing-sun-cream","COSRX","Aloe Soothing Sun Cream","Skincare","",[["LIR-00081","",14500,null,2,1,"URNA 2",0,"COSRX ALOE SOOTHING SUN CREAM",""]]],["P-0081","cosrx-advanced-snail-peptide-eye-cream","COSRX","Advanced Snail Peptide Eye Cream","Skincare","",[["LIR-00082","",14500,null,0,1,"",0,"COSRX ADVANCED SNAIL PEPTIDE EYE CREAM",""]]],["P-0082","cosrx-advanced-snail-92-all-in-one-cream","COSRX","Advanced Snail 92 All In One Cream","Skincare","",[["LIR-00083","",17000,null,1,1,"",1,"COSRX ADVANCED SNAIL 92 ALL IN ONE CREAM",""]]],["P-0083","cosrx-hyaluronic-acid-intensive-cream","COSRX","Hyaluronic Acid Intensive Cream","Skincare","",[["LIR-00084","",15000,null,1,1,"URNA 2",0,"COSRX HYALURONIC ACID INTENSIVE CREAM",""]]],["P-0084","cosrx-advanced-snail-96-mucin-power-essence","COSRX","Advanced Snail 96 Mucin Power Essence","Skincare","",[["LIR-00085","",16900,null,0,1,"",0,"COSRX ADVANCED SNAIL 96 MUCIN POWER ESSENCE","URNA actualizado"]]],["P-0085","cosrx-hyaluronic-acid-hydra-power-essence","COSRX","Hyaluronic Acid Hydra Power Essence","Skincare","",[["LIR-00086","",14900,null,0,1,"",0,"COSRX HYALURONIC ACID HYDRA POWER ESSENCE",""]]],["P-0086","cosrx-ultimate-nourishing-rice-overnight-spa-mask","COSRX","Ultimate Nourishing Rice Overnight Spa Mask","Skincare","",[["LIR-00087","",13900,null,1,1,"",1,"COSRX ULTIMATE NOURISHING RICE OVERNIGHT SPA MASK",""]]],["P-0087","cosrx-advanced-the-vitamin-c-23-hyaluronic-acid","COSRX","Advanced The Vitamin C 23 Hyaluronic Acid","Skincare","",[["LIR-00088","",15900,null,0,1,"",0,"COSRX ADVANCED THE VITAMIN C 23 HYALURONIC ACID",""]]],["P-0088","cosrx-all-about-snail-kit","COSRX","All About Snail Kit","Skincare","",[["LIR-00089","",16900,null,1,1,"URNA 1",0,"COSRX ALL ABOUT SNAIL KIT",""]]],["P-0089","cosrx-vitamin-e-vitalizing-sunscreen","COSRX","Vitamin E Vitalizing Sunscreen","Skincare","",[["LIR-00090","",14900,null,2,1,"URNA 2",0,"COSRX VITAMIN E VITALIZING SUNSCREEN",""]]],["P-0090","cosrx-blemish-pore-clear-pad","COSRX","Blemish Pore Clear Pad","Skincare","",[["LIR-00091","",17900,null,1,1,"",0,"COSRX BLEMISH PORE CLEAR PAD",""]]],["P-0091","cosrx-pdrn-exosome-skinplaning-glaze-mask","COSRX","PDRN Exosome Skinplaning Glaze Mask","Skincare","",[["LIR-00092","",15900,null,1,1,"",0,"COSRX PDRN EXOSOME SKINPLANING GLAZE MASK",""]]],["P-0092","cosrx-the-peptide-eye-patch","COSRX","The Peptide Eye Patch","Skincare","",[["LIR-00093","",16900,null,2,1,"",0,"COSRX THE PEPTIDE EYE PATCH",""]]],["P-0093","cosrx-advanced-snail-eye-patch","COSRX","Advanced Snail Eye Patch","Skincare","",[["LIR-00094","",16900,null,1,1,"",0,"COSRX ADVANCED SANIL EYE PATCH",""]]],["P-0094","cosrx-advanced-snail-mucin-mask-por-unidad","COSRX","Advanced Snail Mucin Mask Por Unidad","Skincare","",[["LIR-00095","",2500,null,5,1,"",0,"COSRX ADVANCED SNAIL MUCIN MASK POR UNIDAD",""]]],["P-0095","covergirl-eye-pencil","CoverGirl","Eye Pencil","Maquillaje","",[["LIR-00096","",5500,null,2,1,"",1,"COVER GIRL EYE PENCIL",""]]],["P-0096","chique-3pc-complexion-kit","Chique","3PC Complexion Kit","Maquillaje","",[["LIR-00097","",6000,null,2,1,"",1,"CHIQUE 3PC COMPLEXION KIT",""]]],["P-0097","d-alba-aromatic-spray-serum","d'Alba","Aromatic Spray Serum","Skincare","",[["LIR-00098","",12000,null,2,1,"",0,"D ALBA AROMATIC SPRAY SERUM",""]]],["P-0098","d-alba-cream","d'Alba","Cream","Skincare","",[["LIR-00099","",0,null,0,1,"",0,"D ALBA CREAM",""]]],["P-0099","dermablend-concealer","Dermablend","Concealer","Maquillaje","",[["LIR-00100","",17900,null,1,1,"",0,"DERMABLEND  CONCEALER",""]]],["P-0100","disney-lip-oil","Disney","Lip Oil","Maquillaje","",[["LIR-00101","",2000,null,6,1,"",0,"DISNEY LIP OIL",""]]],["P-0101","disney-lip-oil-mas-llavero","Disney","Lip Oil Mas Llavero","Maquillaje","",[["LIR-00102","",3500,null,1,1,"",0,"DISNEY LIP OIL MAS LLAVERO",""]]],["P-0102","dr-althea-345-relief-cream-mist","Dr. Althea","345 Relief Cream Mist","Skincare","Tamaño",[["LIR-00103","60 ml",13000,null,2,1,"URNA 2",0,"DR ALTHEA 345 REFLIEF CREAM MIST 60 ml",""],["LIR-00104","100 ml",15900,null,0,1,"",0,"DR ALTHEA 345 RELIEF CREAM MIST 100 ml",""]]],["P-0103","dr-althea-345-relief-serum","Dr. Althea","345 Relief Serum","Skincare","Tamaño",[["LIR-00105","50 ml",16900,null,0,1,"",0,"DR ALTHEA 345 RELIEF SERUM  50 ML",""],["LIR-00106","30 ml",15900,null,2,1,"",1,"DR ALTHEA 345 RELIEF SERUM 30 ml",""]]],["P-0104","dr-althea-345-relief-cream-50-ml","Dr. Althea","345 Relief Cream 50 ml","Skincare","",[["LIR-00107","",16900,null,1,1,"",1,"DR ALTHEA 345 RELIEF CREAM 50 ml",""]]],["P-0105","dr-althea-soft-melting-lip-balm","Dr. Althea","Soft Melting Lip Balm","Skincare","",[["LIR-00108","",6500,null,1,1,"URNA 2",0,"DR ALTHEA SOFT MELTING LIP BALM",""]]],["P-0106","dr-althea-vitamin-c-boosting-serum","Dr. Althea","Vitamin C Boosting Serum","Skincare","",[["LIR-00109","",15000,null,1,1,"",1,"DR.ALTHEA VITAMIN C BOOSTING SERUM",""]]],["P-0107","dr-althea-gentle-vitamin-c-serum","Dr. Althea","Gentle Vitamin C Serum","Skincare","",[["LIR-00110","",15000,null,0,1,"",0,"DR.ALTHEA GENTLE VITAMIN C SERUM",""]]],["P-0108","dr-althea-retinol-flat-iron-eye-roller","Dr. Althea","Retinol Flat Iron Eye Roller","Skincare","",[["LIR-00111","",14900,null,0,1,"",1,"DR ALTHEA RETINOL FLAT IRON EYE ROLLER",""]]],["P-0109","dr-althea-aqua-blue-hydration-mask","Dr. Althea","Aqua Blue Hydration Mask","Skincare","",[["LIR-00112","",3000,null,1,1,"",1,"DR ALTHEA AQUA BLUE HYDRATION MASK",""]]],["P-0110","dr-althea-345-mask","Dr. Althea","345 Mask","Skincare","",[["LIR-00113","",3500,null,0,1,"",0,"DR ALTHEA 345 MASK",""]]],["P-0111","dr-althea-lash-boost-serum","Dr. Althea","Lash Boost Serum","Skincare","",[["LIR-00114","",9000,null,0,1,"",0,"DR ALTHEA LASH BOOST SERUM",""]]],["P-0112","dr-althea-147-barrier-cream","Dr. Althea","147 Barrier Cream","Skincare","",[["LIR-00115","",16900,null,2,1,"URNA 2",0,"DR ALTHEA 147 BARRIER CREAM",""]]],["P-0113","dokdo-cleansing-tissue-1025","Dokdo","Cleansing Tissue 1025","Skincare","",[["LIR-00116","",3000,null,0,1,"",1,"DOKDO CLEANSING TISSUE 1025",""]]],["P-0114","donna-karan-cashmere-mist-deodorant","Donna Karan","Cashmere Mist Deodorant","Cuerpo","",[["LIR-00117","",20900,null,1,1,"",0,"DONNA KARAN CASHMERE MIST DEODORANT",""]]],["P-0115","dr-melaxin-calcium-volume-multi-balm","Dr. Melaxin","Calcium Volume Multi Balm","Skincare","",[["LIR-00118","",17900,null,2,1,"",1,"DR. MELAXIN CALCIUM VOLUME MULTI BALM",""]]],["P-0116","dr-melaxin-calcium-volume-eye-patch","Dr. Melaxin","Calcium Volume Eye Patch","Skincare","",[["LIR-00119","",17900,null,0,1,"",1,"DR. MELAXIN CALCIUM VOLUME EYE PATCH",""]]],["P-0117","dr-melaxin-exfoliating-kojic-acid-turmeric-spray","Dr. Melaxin","Exfoliating Kojic Acid Turmeric Spray","Skincare","",[["LIR-00120","",22500,null,0,1,"",1,"DR. MELAXIN EXFOLIATING KOJIC ACID TUMERIC SPRAY",""]]],["P-0118","dove-body-wash","Dove","Body Wash","Cuerpo","",[["LIR-00121","",12500,null,0,1,"",0,"DOVE BODY WASH",""]]],["P-0119","e-l-f-clear-brow-and-lash-mascara-solo","e.l.f.","Clear Brow & Lash Mascara Solo","Maquillaje","",[["LIR-00122","",4900,null,0,1,"",0,"ELF CLEAR BROW & LASH MASCARA SOLO",""]]],["P-0120","e-l-f-clear-brow-and-lash-mascara-duo","e.l.f.","Clear Brow & Lash Mascara Duo","Maquillaje","",[["LIR-00123","",6900,null,0,1,"",0,"ELF CLEAR BROW & LASH MASCARA DUO","FALTA 1"]]],["P-0121","e-l-f-instant-lift-brow-pencil-waterproof","e.l.f.","Instant Lift Brow Pencil Waterproof","Maquillaje","",[["LIR-00124","",5500,null,0,1,"",1,"ELF INSTANT LIFT BROW PENCIL WATERPROOF",""]]],["P-0122","e-l-f-instant-lift-brow-pencil","e.l.f.","Instant Lift Brow Pencil","Maquillaje","",[["LIR-00125","",5500,null,0,1,"",1,"ELF INSTANT LIFT BROW PENCIL",""]]],["P-0123","e-l-f-hydrating-camo-concealer","e.l.f.","Hydrating Camo Concealer","Maquillaje","",[["LIR-00126","",7000,null,1,1,"",1,"ELF HYDRATING CAMO CONCEALER","FALTA 1"]]],["P-0124","e-l-f-power-grip-dewy-setting-spray","e.l.f.","Power Grip Dewy Setting Spray","Maquillaje","",[["LIR-00127","",11900,null,0,1,"",1,"ELF POWER GRIP DEWY SETTING SPRAY",""]]],["P-0125","e-l-f-lip-plumping-pen","e.l.f.","Lip Plumping Pen","Maquillaje","",[["LIR-00128","",4000,null,1,1,"",0,"ELF LIP PLUMPING PEN",""]]],["P-0126","e-l-f-power-grip-primer-rosado","e.l.f.","Power Grip Primer Rosado","Maquillaje","",[["LIR-00129","",10500,null,0,1,"",0,"ELF POWER GRIP PRIMER ROSADO",""]]],["P-0127","e-l-f-power-grip-primer-verde","e.l.f.","Power Grip Primer Verde","Maquillaje","",[["LIR-00130","",10500,null,0,1,"",1,"ELF POWER GRIP PRIMER VERDE",""]]],["P-0128","e-l-f-power-grip-matte-primer","e.l.f.","Power Grip Matte Primer","Maquillaje","",[["LIR-00131","",10800,null,0,1,"",1,"ELF POWE GRIP MATTE PRIMER",""]]],["P-0129","e-l-f-camo-liquid-blush","e.l.f.","Camo Liquid Blush","Maquillaje","",[["LIR-00132","",7900,null,2,1,"URNA 2",0,"ELF CAMO LIQUID BLUSH",""]]],["P-0130","e-l-f-ultra-precise-brow-pencil","e.l.f.","Ultra Precise Brow Pencil","Maquillaje","",[["LIR-00133","",8500,9000,0,1,"",0,"ELF ULTRA PRECISE BROW PENCIL",""]]],["P-0131","e-l-f-monochromatic-multi-stick","e.l.f.","Monochromatic Multi-stick","Maquillaje","",[["LIR-00134","",6000,null,0,1,"",0,"ELF MONOCHROMATIC MULTI-STICK",""]]],["P-0132","e-l-f-glow-reviver-lip-oil","e.l.f.","Glow Reviver Lip Oil","Maquillaje","",[["LIR-00135","",8500,null,4,1,"URNA 2",0,"ELF GLOW REVIVER LIP OIL",""]]],["P-0133","e-l-f-putty-blush","e.l.f.","Putty Blush","Maquillaje","",[["LIR-00136","",8900,null,0,1,"URNA 2",0,"ELF PUTTY BLUSH",""]]],["P-0134","e-l-f-matte-fusion-pressed-powder","e.l.f.","Matte Fusion Pressed Powder","Maquillaje","",[["LIR-00137","",9000,10000,0,1,"",0,"ELF MATTE FUSION PRESSED POWDER",""]]],["P-0135","e-l-f-halo-glow-liquid-filter","e.l.f.","Halo Glow Liquid Filter","Maquillaje","",[["LIR-00138","",13500,null,0,1,"",0,"ELF HALO GLOW LIQUID FILTER",""]]],["P-0136","e-l-f-brow-lift-applicator","e.l.f.","Brow Lift Applicator","Maquillaje","",[["LIR-00139","",2000,null,0,1,"",0,"ELF BROW LIFT APPLICATOR",""]]],["P-0137","e-l-f-instant-lift-brow-pencil-set-of-2","e.l.f.","Instant Lift Brow Pencil Set Of 2","Maquillaje","",[["LIR-00140","",7900,null,0,1,"",0,"ELF INSTANT LIFT BROW PENCIL SET OF 2",""]]],["P-0138","e-l-f-cream-glide-lip-liner","e.l.f.","Cream Glide Lip Liner","Maquillaje","",[["LIR-00141","",5900,null,1,1,"URNA 1",0,"ELF CREAM GLIDE LIP LINER",""]]],["P-0139","e-l-f-sheer-for-it-blush-tint","e.l.f.","Sheer For It Blush Tint","Maquillaje","",[["LIR-00142","",9900,null,0,1,"URNA 2",0,"ELF SHEER FOR IT BLUSH TINT",""]]],["P-0140","e-l-f-holystrokes-fine-brow-pen-delineador-liquido-cejas","e.l.f.","Holystrokes Fine Brow Pen Delineador Liquido Cejas","Maquillaje","",[["LIR-00143","",9900,null,1,1,"URNA 3",1,"ELF HOLYSTROKES FINE BROW PEN  DELINEADOR LIQUIDO CEJAS",""]]],["P-0141","e-l-f-flawless-face-and-eye-brush-set","e.l.f.","Flawless Face & Eye Brush Set","Accesorios","",[["LIR-00144","",14900,null,1,1,"URNA 2",0,"ELF FLAWLESS FACE & EYE BRUSH SET",""]]],["P-0142","e-l-f-liquid-poreless-putty-primer","e.l.f.","Liquid Poreless Putty Primer","Maquillaje","",[["LIR-00145","",10500,null,0,1,"",0,"ELF LIQUID PORELESS PUTTY PRIMER",""]]],["P-0143","e-l-f-eyeliner-pen","e.l.f.","Eyeliner Pen","Maquillaje","",[["LIR-00146","",5500,null,0,1,"",0,"ELF EYELINER PEN",""]]],["P-0144","e-l-f-squeeze-me-lip-balm","e.l.f.","Squeeze Me Lip Balm","Skincare","",[["LIR-00147","",7000,null,0,1,"URNA 2",0,"ELF SQUEEZE ME LIP BALM",""]]],["P-0145","e-l-f-camo-color-corrector","e.l.f.","Camo Color Corrector","Maquillaje","",[["LIR-00148","",7000,null,7,1,"URNA 3",1,"ELF CAMO COLOR CORRECTOR",""]]],["P-0146","e-l-f-blush-tint","e.l.f.","Blush Tint","Maquillaje","",[["LIR-00149","",9900,null,3,1,"",1,"ELF BLUSH TINT",""]]],["P-0147","e-l-f-day-kit","e.l.f.","Day Kit","Maquillaje","",[["LIR-00150","",12900,null,2,1,"URNA 4",0,"ELF DAY KIT",""]]],["P-0148","e-l-f-halo-glow-blush-beauty-wand","e.l.f.","Halo Glow Blush Beauty Wand","Maquillaje","",[["LIR-00151","",8900,null,3,1,"",0,"ELF HALO GLOW BLUSH BEUTY WAND",""]]],["P-0149","e-l-f-the-hottest-drops-duo","e.l.f.","The Hottest Drops Duo","Maquillaje","",[["LIR-00152","",9900,null,1,1,"",0,"ELF  THE HOTTEST DROPS DUO",""]]],["P-0150","e-l-f-hd-powder-8g","e.l.f.","HD Powder 8g","Maquillaje","",[["LIR-00153","",7900,null,0,1,"",0,"ELF HD POWDER 8G",""]]],["P-0151","e-l-f-o-face-satin-lipstick","e.l.f.","O Face Satin Lipstick","Maquillaje","",[["LIR-00154","",8900,null,1,1,"",0,"ELF  O FACE SATIN LIPSTCK",""]]],["P-0152","elfinbay-bath-bombs","Elfinbay","Bath Bombs","Cuerpo","",[["LIR-00155","",22900,null,1,1,"",0,"ELFINBAY BATH BOBMS",""]]],["P-0153","elizavecca-mask","Elizavecca","Mask","Skincare","",[["LIR-00156","",12900,null,0,1,"",1,"ELIZAVECCA MASK",""]]],["P-0154","elizavecca-oil","Elizavecca","Oil","Skincare","",[["LIR-00157","",15500,null,0,1,"",0,"ELIZAVECCA OIL",""]]],["P-0155","elizavecca-hair-muscle-essence-oil","Elizavecca","Hair Muscle Essence Oil","Cabello","",[["LIR-00158","",13500,null,0,1,"",1,"ELIZAVECCA HAIR MUSCLE ESSENCE OIL",""]]],["P-0156","elroel-blanc-cover-cream-stick","Elroel","Blanc Cover Cream Stick","Maquillaje","",[["LIR-00159","",15500,null,0,1,"",1,"ELROEL BLANC COVER CREAM STICK","NO REBAJADO DEL 9"]]],["P-0157","eos-pink-champagne-cashmere-body-mist","eos","Pink Champagne Cashmere Body Mist","Cuerpo","",[["LIR-00160","",12000,null,0,1,"",0,"EOS PINK CHAMPAGNE CASHMERE BODY MIST",""]]],["P-0158","eos-cashmere-body-wash-pink-champagne","eos","Cashmere Body Wash Pink Champagne","Cuerpo","",[["LIR-00161","",10500,null,0,1,"",0,"EOS CASHMERE BODY WASH PINK CHAMPAGNE",""]]],["P-0159","eos-24h-moisture-body-lotion-pink-champagne","eos","24H Moisture Body Lotion Pink Champagne","Cuerpo","",[["LIR-00162","",10500,null,0,1,"",0,"EOS 24H MOISTURE BODY LOTION PINK CHAMPAGNE",""]]],["P-0160","eos-24h-moisture-body-lotion-creme-de-pistachio","eos","24H Moisture Body Lotion Creme de Pistachio","Cuerpo","",[["LIR-00163","",10500,null,0,1,"",0,"EOS 24H MOISTURE BODY LOTION CREME DE PISTACHIO",""]]],["P-0161","eos-lip-balm","eos","Lip Balm","Skincare","",[["LIR-00164","",1500,null,0,1,"",0,"EOS LIP BALM",""]]],["P-0162","eos-vainilla","eos","Vainilla","Cuerpo","",[["LIR-00165","",10900,null,0,1,"",0,"EOS VAINILLA",""]]],["P-0163","eos-raspberry","eos","Raspberry","Cuerpo","",[["LIR-00166","",10000,null,0,1,"",0,"EOS RASPBERRY",""]]],["P-0164","eos-body-wash","eos","Body Wash","Cuerpo","",[["LIR-00167","",12500,null,1,1,"",0,"EOS BODY WASH",""]]],["P-0165","eos-body-lotion","eos","Body Lotion","Cuerpo","",[["LIR-00168","",13500,null,3,1,"",0,"EOS BODY LOTION",""]]],["P-0166","essence-lash-princess-mascara","essence","Lash Princess Mascara","Maquillaje","",[["LIR-00169","",6000,null,0,1,"",1,"ESSENCE LASH PRINCESS MASCARA",""]]],["P-0167","essence-longlasting-eye-pencil","essence","Longlasting Eye Pencil","Maquillaje","",[["LIR-00170","",3500,null,2,1,"",1,"ESSENCE LONGLASTING EYE PENCIL",""]]],["P-0168","fenty-beauty-lip-liner-mini-lip-luminizer-duo","Fenty Beauty","Lip Liner + Mini Lip Luminizer Duo","Maquillaje","",[["LIR-00171","",22500,null,1,1,"URNA 2",0,"FENTY BEAUTY LIP LINER + MINI LIP LUMINIZER DUO",""]]],["P-0169","glamp-up-mascarillas-individuales","Glamp Up","Mascarillas Individuales","Skincare","",[["LIR-00172","",1300,null,5,1,"",0,"GLAMP UP NASCARIILAS INDIVIDUALES",""]]],["P-0170","got2b-glued-styling-spiking-glue","got2b","Glued Styling Spiking Glue","Cabello","",[["LIR-00173","",4900,null,1,1,"URNA 2",0,"GOT2B GLUED STYLING SPIKING GLUE",""]]],["P-0171","got2b-glued-4-brows-and-edges","got2b","Glued 4 Brows & Edges","Cabello","",[["LIR-00174","",8900,null,1,1,"",0,"GOT2B GLUED  4 BROWS & EDGES",""]]],["P-0172","got2b-guardian-angel-200-ml","got2b","Guardian Angel 200 ml","Cabello","",[["LIR-00175","",8900,null,2,1,"",0,"GOT2B GUARDIAN ANGEL 200 ML",""]]],["P-0173","glow-recipe-watermelon-glow-niacinamide-dewy-flush","Glow Recipe","Watermelon Glow Niacinamide Dewy Flush","Skincare","",[["LIR-00176","",2500,null,0,1,"",0,"GLOW RECIPE WATERMELON GLOW NIACINAMIDE DEWY FLUSH","}"]]],["P-0174","goddess-exclusive-makeup-tools","Goddess","Exclusive Makeup Tools","Accesorios","",[["LIR-00177","",4000,null,3,1,"",0,"GODDESS EXCLUSIVE MAKEUP TOOLS",""]]],["P-0175","grace-and-stella-eye-masks","Grace & Stella","Eye Masks","Skincare","",[["LIR-00178","",1250,null,43,1,"URNA 1, URNA 2",0,"GRACE & STELLA EYE MASKS",""]]],["P-0176","good-molecules-brightening-and-dark-spots-bar","Good Molecules","Brightening & Dark Spots Bar","Skincare","",[["LIR-00179","",7900,null,1,1,"URNA 1",0,"GOOD MOLECULES BRIGHTENING & DARK SPOTS BAR",""]]],["P-0177","haruharu-wonder-rice-cream-cup","Haruharu Wonder","Rice Cream Cup","Skincare","",[["LIR-00180","",13900,null,0,1,"",0,"HARUHARU RICE CREAM CUP",""]]],["P-0178","haruharu-wonder-black-rice-probiotics-barrier-essence","Haruharu Wonder","Black Rice Probiotics Barrier Essence","Skincare","",[["LIR-00181","",13900,null,0,1,"",0,"HARUHARU BLACK RICE PROBIOTICS BARRIER ESSENCE",""]]],["P-0179","haruharu-wonder-wonder-black-rice-10-hyaluronic-cream","Haruharu Wonder","Wonder Black Rice 10 Hyaluronic Cream","Skincare","",[["LIR-00182","",12900,null,2,1,"URNA 2",0,"HARUHARU WONDER BLACK RICE 10 HYALURONIC CREAM",""]]],["P-0180","haruharu-wonder-black-rice-bakuchiol-eye-cream","Haruharu Wonder","Black Rice Bakuchiol Eye Cream","Skincare","",[["LIR-00183","",12900,null,2,1,"",0,"HARUHARU BLACK RICE BAKUCHIOL  EYE CREAM",""]]],["P-0181","haruharu-wonder-black-rice-cleansing-gel","Haruharu Wonder","Black Rice Cleansing Gel","Skincare","",[["LIR-00184","",10900,null,2,1,"",0,"HARUHARU BLACK RICE CLEASING GEL",""]]],["P-0182","heimish-all-clean-balm","Heimish","All Clean Balm","Skincare","",[["LIR-00185","",12900,null,0,1,"",0,"HEIMISH ALL CLEAN BALM",""]]],["P-0183","hourglass-phantom-volumizing-glossy-balm","Hourglass","Phantom Volumizing Glossy Balm","Maquillaje","",[["LIR-00186","",23900,null,1,1,"",0,"HOURGLASS PHANTOM VOLUMINIZING GLOSSY BALM",""]]],["P-0184","huda-beauty-fauxfilter-luminous-matte-foundation","Huda Beauty","Fauxfilter Luminous Matte Foundation","Maquillaje","",[["LIR-00187","",25900,null,1,1,"",1,"HUDA BEAUTY FAUXFILTER LUMINOUS MATTE FOUNDATION",""]]],["P-0185","huda-beauty-stay-blur-foundation-spf-60","Huda Beauty","Stay Blur Foundation SPF 60","Maquillaje","",[["LIR-00188","",27000,null,0,1,"",0,"HUDA BEAUTY STAY BLUR FOUNDATION SPF 60",""]]],["P-0186","huda-beauty-fauxfilter-concealer","Huda Beauty","Fauxfilter Concealer","Maquillaje","",[["LIR-00189","",19900,null,0,1,"",0,"HUDA BEAUTY FAUXFILTER CONCEALER",""]]],["P-0187","huda-beauty-setting-spray-30-ml","Huda Beauty","Setting Spray 30 ml","Maquillaje","",[["LIR-00190","",13000,null,0,1,"",1,"HUDA BEAUTY SETTING SPRAY 30 ml",""]]],["P-0188","huda-beauty-lip-contour-stain","Huda Beauty","Lip Contour Stain","Maquillaje","",[["LIR-00191","",12000,null,1,1,"URNA 1",0,"HUDA BEAUTY LIP CONTOUR STAIN",""]]],["P-0189","huda-beauty-faux-filler-jelly-lip-oil","Huda Beauty","Faux Filler Jelly Lip Oil","Maquillaje","",[["LIR-00192","",16900,null,3,1,"URNA 2",0,"HUDA BEAUTY FAUX FILLER JELLY LIP OIL",""]]],["P-0190","huda-beauty-lip-gloss","Huda Beauty","Lip Gloss","Maquillaje","",[["LIR-00193","",17900,null,0,1,"",0,"HUDA BEAUTY LIP GLOSS",""]]],["P-0191","huda-beauty-baby-bake-powder-mini","Huda Beauty","Baby Bake Powder Mini","Maquillaje","",[["LIR-00194","",19800,null,0,1,"",0,"HUDA BEAUTY BABY BAKE POWDER MINI",""]]],["P-0192","huda-beauty-easy-bake-powder-grande","Huda Beauty","Easy Bake Powder Grande","Maquillaje","",[["LIR-00195","",31900,null,2,1,"URNA 2",0,"HUDA BEAUTY EASY BAKE POWDER GRANDE",""]]],["P-0193","huda-beauty-liquid-eyeliner-pen-waterproof","Huda Beauty","Liquid Eyeliner Pen Waterproof","Maquillaje","",[["LIR-00196","",10000,null,21,1,"",1,"HUDA BEAUTY LIQUID EYELINER PEN WATERPROOF",""]]],["P-0194","huda-beauty-tinted-kiss-hydrating-lip-tint","Huda Beauty","Tinted Kiss Hydrating Lip Tint","Maquillaje","",[["LIR-00197","",12900,null,29,1,"URNA 1, URNA 2",0,"HUDA BEAUTY TINTED KISS HYDRATING LIP TINT",""]]],["P-0195","huda-beauty-eyebrow-pencil","Huda Beauty","Eyebrow Pencil","Maquillaje","",[["LIR-00198","",6900,null,3,1,"",1,"HUDA BEAUTY EYEBROW PENCIL",""]]],["P-0196","huda-beauty-lip-gloss-pearls-and-shine","Huda Beauty","Lip Gloss Pearls And Shine","Maquillaje","",[["LIR-00199","",3000,null,0,1,"",1,"HUDA BEAUTY LIP GLOSS PEARLS AND SHINE",""]]],["P-0197","huda-beauty-lip-glow-lip-balm","Huda Beauty","Lip Glow Lip Balm","Skincare","",[["LIR-00200","",4900,null,8,1,"",1,"HUDA BEAUTY LIP GLOW LIP BALM","Y UNA MUESTRA"]]],["P-0198","huda-beauty-liquid-blush","Huda Beauty","Liquid Blush","Maquillaje","",[["LIR-00201","",4500,null,10,1,"",0,"HUDA BEAUTY LIQUID BLUSH",""]]],["P-0199","huda-beauty-balsamo-color","Huda Beauty","Bálsamo Color","Maquillaje","",[["LIR-00202","",3000,null,17,1,"",1,"HUDA BEAUTY BÁLSAMO COLOR",""]]],["P-0200","huda-beauty-volume-algona","Huda Beauty","Volume Algona","Maquillaje","",[["LIR-00203","",6500,null,18,1,"",1,"HUDA BEAUTY VOLUME ALGONA",""]]],["P-0201","huda-beauty-micellar-water","Huda Beauty","Micellar Water","Skincare","",[["LIR-00204","",3900,null,2,1,"",1,"HUDA BEAUTY MICELLAR WATER",""]]],["P-0202","huaxiaomei-scalp-massagers","Huaxiaomei","Scalp Massagers","Accesorios","",[["LIR-00205","",2000,null,0,1,"",0,"HUAXIAOMEI SCALP MASSAGERS",""]]],["P-0203","beauty-of-joseon-sun-trio-los-3-siguientes","Beauty of Joseon","Sun Trio (los 3 Siguientes)","Skincare","",[["LIR-00206","",31900,null,0,1,"",0,"JOSEON SUN TRIO (LOS 3 SIGUIENTES)",""]]],["P-0204","beauty-of-joseon-apricot-blossom-peeling-gel","Beauty of Joseon","Apricot Blossom Peeling Gel","Skincare","",[["LIR-00207","",15000,null,1,1,"",1,"JOSEON APRICOT BLOSSOM PEELING GEL",""]]],["P-0205","beauty-of-joseon-relief-sun-agua-fresh-rice-b5","Beauty of Joseon","Relief Sun Agua Fresh Rice B5","Skincare","",[["LIR-00208","",14000,null,1,1,"",0,"JOSEON RELIEF SUN AGUA FRESH RICE B5",""]]],["P-0206","beauty-of-joseon-relief-sun-rice-probiotics-spf-50","Beauty of Joseon","Relief Sun: Rice + Probiotics SPF 50+","Skincare","",[["LIR-00209","",13900,null,1,1,"URNA 2",0,"JOSEON RELIEF SUN: RICE + PROBIOTICS SPF 50+",""]]],["P-0207","beauty-of-joseon-matte-sun-stick-mugwort-camelia","Beauty of Joseon","Matte Sun Stick Mugwort + Camelia","Skincare","",[["LIR-00210","",11900,null,0,1,"",0,"JOSEON MATTE SUN STICK MUGWORT + CAMELIA",""]]],["P-0208","beauty-of-joseon-ginseng-moist-sun-serum-spf-50","Beauty of Joseon","Ginseng Moist Sun Serum SPF 50+","Skincare","",[["LIR-00211","",11900,null,0,1,"",0,"JOSEON GINSENG MOIST SUN SERUM SPF 50+",""]]],["P-0209","beauty-of-joseon-revive-eye-serum-ginseng-retinal","Beauty of Joseon","Revive Eye Serum Ginseng + Retinal","Skincare","",[["LIR-00212","",14900,null,1,1,"",1,"JOSEON  REVIVE EYE SERUM GINSENG + RETINAL",""]]],["P-0210","beauty-of-joseon-glow-deep-serum-rice-alpha-arbutin","Beauty of Joseon","Glow Deep Serum Rice + Alpha - Arbutin","Skincare","",[["LIR-00213","",10900,null,0,1,"",0,"JOSEON GLOW DEEP SERUM RICE + ALPHA - ARBUTIN",""]]],["P-0211","beauty-of-joseon-daily-tinted-fluid-sunscreen-40","Beauty of Joseon","Daily Tinted Fluid Sunscreen 40+","Skincare","",[["LIR-00214","",14000,null,1,1,"URNA 2",0,"JOSEON DAILY TINTED FUID SUNSCREEN 40+",""]]],["P-0212","beauty-of-joseon-dynasty-cream","Beauty of Joseon","Dynasty Cream","Skincare","",[["LIR-00215","",14000,null,1,1,"URNA 2",0,"JOSEON DYNASTY CREAM",""]]],["P-0213","beauty-of-joseon-ginseng-essence-water-150-ml","Beauty of Joseon","Ginseng Essence Water 150 ml","Skincare","",[["LIR-00216","",13900,null,1,1,"",0,"JOSEON GINSENG ESSENCE WATER 150 ML",""]]],["P-0214","beauty-of-joseon-calming-serum-30-ml","Beauty of Joseon","Calming Serum 30 ml","Skincare","",[["LIR-00217","",13900,null,1,1,"",0,"JOSEON CALMING SERUM 30 ML",""]]],["P-0215","jiyu-toning-face-pads","Jiyu","Toning Face Pads","Skincare","",[["LIR-00218","",27900,null,3,1,"URNA 1",0,"JIYU TONING FACE PADS",""]]],["P-0216","kahi-wrinkle-bounce-multi-balm","Kahi","Wrinkle Bounce Multi Balm","Skincare","",[["LIR-00219","",17900,null,0,1,"",0,"KAHI WRINKLE BOUNCEMULTI BALM",""]]],["P-0217","k-glow-beauty-bag-kit","K-Glow","Beauty Bag Kit","Accesorios","",[["LIR-00220","",12000,null,0,1,"",0,"K - GLOW BEAUTY BAG KIT",""]]],["P-0218","kiss-pro-touch-setting-powder","Kiss","Pro Touch Setting Powder","Maquillaje","",[["LIR-00221","",7900,null,2,1,"",1,"KISS PRO TOUCH SETTING POWDER",""]]],["P-0219","kerastase-maskeratine","Kérastase","Maskeratine","Cabello","",[["LIR-00222","",39900,null,0,1,"URNA 1",0,"KERASTASE MASKERATINE",""]]],["P-0220","k18-molecular-repair-hair-oil-10-ml-amarillo","K18","Molecular Repair Hair Oil 10 ml Amarillo","Cabello","",[["LIR-00223","",19900,null,2,1,"URNA 1",0,"K18 MOLECULAR REPAIR HAIR OIL 10 ML AMARILLO","nuevo urna 1"]]],["P-0221","k18-reparative-volume-spray-celeste","K18","Reparative Volume Spray Celeste","Cabello","",[["LIR-00224","",29900,null,1,1,"URNA 1",0,"K18 REPARATIVE VOLUME SPRAY  CELESTE",""]]],["P-0222","k18-leave-in-molecular-repair-hair-mask-15-ml-anaranjado","K18","Leave In Molecular Repair Hair Mask 15 ml Anaranjado","Cabello","",[["LIR-00225","",24900,null,1,1,"URNA 1",0,"K18 LEAVE IN MOLECULAR REPAIR HAIR MASK  15 ML ANARANJADO",""]]],["P-0223","k18-biometic-hair-science-conditioner","K18","Biometic Hair Science Conditioner","Cabello","",[["LIR-00226","",25900,null,1,1,"",0,"K18 BIOMETIC HAIR SCIENCE CONDITIONER",""]]],["P-0224","l-a-colors-lip-liner","L.A. Colors","Lip Liner","Maquillaje","",[["LIR-00227","",3000,null,3,1,"",0,"L.A. COLORS LIP LINER",""]]],["P-0225","l-oreal-paris-base-infallible-pro-matte","L'Oréal Paris","Base Infallible Pro - Matte","Maquillaje","",[["LIR-00228","",6900,null,5,1,"URNA 5",0,"LOREAL BASE INFALLIBLE PRO - MATTE",""]]],["P-0226","l-oreal-paris-infallible-setting-mist","L'Oréal Paris","Infallible Setting Mist","Maquillaje","Tamaño",[["LIR-00229","Grande",18000,null,1,1,"URNA 2",0,"LOREAL INFALLIBLE SETTING MIST GRANDE",""],["LIR-00230","1.76 oz",12500,null,2,1,"",1,"LOREAL INFALLIBLE SETTING MIST 1. 76 oz",""]]],["P-0227","l-oreal-paris-concealer-infallible-full-coverage","L'Oréal Paris","Concealer Infallible Full Coverage","Maquillaje","",[["LIR-00231","",8000,null,5,1,"URNA 3",0,"LOREAL CONCEALER INFALLIBLE FULL COVERAGE",""]]],["P-0228","l-oreal-paris-labiales","L'Oréal Paris","Labiales","Maquillaje","",[["LIR-00232","",9500,null,3,1,"URNA 1",0,"LOREAL LABIALES",""]]],["P-0229","l-oreal-paris-voluminous-original","L'Oréal Paris","Voluminous Original","Maquillaje","",[["LIR-00233","",9900,null,1,1,"",0,"L OREAL VOLUMINOUS ORIGINAL",""]]],["P-0230","laneige-lip-sleeping-mask-ex-berry-mini","Laneige","Lip Sleeping Mask EX Berry Mini","Skincare","",[["LIR-00234","",3000,null,0,1,"",0,"LANEIGE LIP SLEEPING MASK EX BERRY MINI",""]]],["P-0231","laneige-lip-sleeping-mask-grande","Laneige","Lip Sleeping Mask Grande","Skincare","",[["LIR-00235","",18500,null,1,1,"",1,"LANEIGE LIP SLEEPING MASK GRANDE",""]]],["P-0232","lawless-lip-plumping-gloss","Lawless","Lip Plumping Gloss","Maquillaje","",[["LIR-00236","",9900,null,0,1,"",0,"LAWLESS LIP PLUMPING GLOSS",""]]],["P-0233","laura-mercier-setting-powder","Laura Mercier","Setting Powder","Maquillaje","",[["LIR-00237","",29900,null,1,1,"URNA 1",0,"LAURA MERCIER SETTING POWDER",""]]],["P-0234","laura-mercier-translucent-hydrating-setting-spray","Laura Mercier","Translucent Hydrating Setting Spray","Maquillaje","",[["LIR-00238","",29900,null,0,1,"URNA 2",0,"LAURA MERCIER TRANSLUCENT HYDRATING SETTING SPRAY",""]]],["P-0235","laka-all-day-fixing-mist","Laka","All Day Fixing Mist","Maquillaje","",[["LIR-00239","",14000,null,1,1,"URNA 2",0,"LAKA ALL DAY FIXING MIST",""]]],["P-0236","laka-blush-balm","Laka","Blush Balm","Maquillaje","",[["LIR-00240","",12900,null,4,1,"URNA 2",0,"LAKA BLUSH BALM",""]]],["P-0237","laura-geller-baked-full-face-basics","Laura Geller","Baked Full Face Basics","Maquillaje","",[["LIR-00241","",24900,null,1,1,"URNA 2",0,"LAURA GELLER BAKED FULL FACE BASICS",""]]],["P-0238","madeca-cream-time-reverse","Madeca","Cream Time Reverse","Skincare","",[["LIR-00242","",18900,null,2,1,"",1,"MADECA CREAM TIME REVERSE",""]]],["P-0239","manzhuren-powder-puff","Manzhuren","Powder Puff","Accesorios","",[["LIR-00243","",3750,null,1,1,"URNA 6",0,"MANZHUREN POWDER PUFF",""]]],["P-0240","generico-makeup-brush-set-fashion-beauty","Genérico","Makeup Brush Set Fashion Beauty","Accesorios","",[["LIR-00244","",4000,null,2,1,"",0,"MAKEUP BRUSH SET FASHION BEUTY",""]]],["P-0241","makeup-by-mario-sephora-beauty-insider","Makeup by Mario","Sephora Beauty Insider","Maquillaje","",[["LIR-00245","",13500,null,0,1,"URNA 2",0,"MAKEUP BY MARIO SEPHORA BEAUTY INSIDER",""]]],["P-0242","maybelline-vinyl-superstay-ink","Maybelline","Vinyl Superstay Ink","Maquillaje","",[["LIR-00246","",6900,null,9,1,"URNA 1",0,"MAYBELLINE VINYL SUPERSTAY INK",""]]],["P-0243","maybelline-matte-ink","Maybelline","Matte Ink","Maquillaje","",[["LIR-00247","",6900,null,8,1,"URNA 1",0,"MAYBELLINE MATTE INK",""]]],["P-0244","maybelline-teddy-tint","Maybelline","Teddy Tint","Maquillaje","",[["LIR-00248","",8900,null,2,1,"URNA 1",0,"MAYBELLINE TEDDY TINT",""]]],["P-0245","maybelline-bubble-mascara","Maybelline","Bubble Mascara","Maquillaje","",[["LIR-00249","",10900,null,0,1,"",0,"MAYBELLINE BUBBLE MASCARA",""]]],["P-0246","maybelline-ink-crayon","Maybelline","Ink Crayon","Maquillaje","",[["LIR-00250","",10900,null,1,1,"URNA 1",0,"MAYBELLINE INK CRAYON",""]]],["P-0247","maybelline-sky-high-mascara-rosado","Maybelline","Sky High Mascara Rosado","Maquillaje","",[["LIR-00251","",12000,null,1,1,"",0,"MAYBELLINE SKY HIGH MASCARA ROSADO",""]]],["P-0248","maybelline-tinted-oil-base-green-edition","Maybelline","Tinted Oil Base Green Edition","Maquillaje","",[["LIR-00252","",7500,null,1,1,"URNA 5",0,"MAYBELLINE TINTED OIL BASE GREEN EDITION",""]]],["P-0249","maybelline-sky-high-mascara-burgundy","Maybelline","Sky High Mascara Burgundy","Maquillaje","",[["LIR-00253","",12000,null,0,1,"",0,"MAYBELLINE SKY HIGH MASCARA BURGUNDY",""]]],["P-0250","maybelline-sky-high-azul","Maybelline","Sky High Azul","Maquillaje","",[["LIR-00254","",12000,null,1,1,"URNA 1",0,"MAYBELLINE SKY HIGH AZUL",""]]],["P-0251","maybelline-tattoo-studio-dip-ink-waterproof","Maybelline","Tattoo Studio Dip - Ink Waterproof","Maquillaje","",[["LIR-00255","",9000,null,1,1,"URNA 3",0,"MAYBELLINE TATTOO STUDIO DIP - INK WATERPROOF",""]]],["P-0252","maybelline-ultimate-labial","Maybelline","Ultimate Labial","Maquillaje","",[["LIR-00256","",6900,null,6,1,"URNA 1",0,"MAYBELLINE ULTIMATE LABIAL",""]]],["P-0253","maybelline-lumi-matte-foundation","Maybelline","Lumi Matte Foundation","Maquillaje","",[["LIR-00257","",13900,null,0,1,"",1,"MAYBELLINE LUMI MATTE FOUNDATION",""]]],["P-0254","maybelline-pumped-up-colossal","Maybelline","Pumped Up Colossal","Maquillaje","",[["LIR-00258","",8900,null,1,1,"",0,"MAYBELINE  PUMPED UP COLOSSAL",""]]],["P-0255","mixsoon-glass-skin-suitcase","Mixsoon","Glass Skin Suitcase","Skincare","",[["LIR-00259","",24900,null,0,1,"",0,"MIXSOON GLASS SKIN SUITCASE",""]]],["P-0256","mixsoon-spot-clean-care-patch","Mixsoon","Spot Clean Care Patch","Skincare","",[["LIR-00260","",6900,null,0,1,"",0,"MIXSOON SPOT CLEANCARE PATCH",""]]],["P-0257","mixsoon-centella-cleansing-foam","Mixsoon","Centella Cleansing Foam","Skincare","",[["LIR-00261","",12500,null,3,1,"URNA 1",0,"MIXSOON CENTELLA CLEANSING FOAM",""]]],["P-0258","mixsoon-bean-cleansing-oil","Mixsoon","Bean Cleansing Oil","Skincare","",[["LIR-00262","",13900,null,2,1,"",0,"MIXSOON BEAN CLEASING OIL",""]]],["P-0259","mixsoon-bean-cream","Mixsoon","Bean Cream","Skincare","",[["LIR-00263","",14500,null,2,1,"",1,"MIXSOON BEAN CREAM",""]]],["P-0260","mixsoon-bean-sun-serum-spf-50","Mixsoon","Bean Sun Serum SPF 50+","Skincare","",[["LIR-00264","",14900,null,1,1,"URNA 2",0,"MIXSOON BEAN SUN SERUM SPF 50+",""]]],["P-0261","mixsoon-centella-sun-cream-spf-50","Mixsoon","Centella Sun Cream SPF 50+","Skincare","",[["LIR-00265","",12900,null,3,1,"URNA 1, URNA 2",0,"MIXSOON CENTELLA SUN CREAM SPF 50+",""]]],["P-0262","mixsoon-04-galactomyces-ferment-essence","Mixsoon","04 Galactomyces Ferment Essence","Skincare","",[["LIR-00266","",10000,12900,4,1,"",1,"MIXSOON 04 GALACTOMYCES FERMENT ESSENCE",""]]],["P-0263","mixsoon-02-bifida-toner","Mixsoon","02 Bifida Toner","Skincare","",[["LIR-00267","",9000,12500,1,1,"URNA 3",1,"MIXSOON 02 BIFIDA TONER",""]]],["P-0264","mixsoon-03-bifida-ferment-essence","Mixsoon","03 Bifida Ferment Essence","Skincare","",[["LIR-00268","",7000,8900,3,1,"URNA 3",1,"MIXSOON 03 BIFIDA FERMENT ESSENCE",""]]],["P-0265","mixsoon-galactomyces-toner-pad","Mixsoon","Galactomyces Toner Pad","Skincare","",[["LIR-00269","",10000,null,2,1,"URNA 3",1,"MIXSOON GALACTOMYCES TONER PAD",""]]],["P-0266","mixsoon-bean-essence-30-ml","Mixsoon","Bean Essence 30 ml","Skincare","",[["LIR-00270","",11900,null,2,1,"",0,"MIXSOON BEAN ESSENCE 30 ML",""]]],["P-0267","medicube-txa-niacinamide-capsule-cream-5","Medicube","TXA Niacinamide Capsule Cream 5%","Skincare","",[["LIR-00271","",16900,null,1,1,"URNA 2",0,"MEDICUBE TXA NIACINAMIDE CAPSULE CREAM 5%",""]]],["P-0268","medicube-txa-niacinamide-15-serum-15","Medicube","TXA Niacinamide 15 Serum 15%","Skincare","",[["LIR-00272","",15000,null,1,1,"",1,"MEDICUBE TXA NIACINAMIDE 15 SERUM 15%",""]]],["P-0269","medicube-hyaluronic-moisturizing-capsule-cream","Medicube","Hyaluronic Moisturizing Capsule Cream","Skincare","",[["LIR-00273","",16900,null,2,1,"URNA 2",0,"MEDICUBE HYALURONIC MOISTURIZING CAPSULE CREAM",""]]],["P-0270","medicube-hyaluronic-ceramide-jelly-cream","Medicube","Hyaluronic Ceramide Jelly Cream","Skincare","",[["LIR-00274","",14000,null,0,1,"",0,"MEDICUBE HYALURONIC CERAMIDE JELLY CREAM",""]]],["P-0271","medicube-hyaluronic-multi-peptide-serum","Medicube","Hyaluronic Multi Peptide Serum","Skincare","",[["LIR-00275","",14900,null,1,1,"",0,"MEDICUBE HYALURONIC MULTI PEPTIDE SERUM",""]]],["P-0272","medicube-red-succinic-acid-serum","Medicube","Red Succinic Acid Serum","Skincare","",[["LIR-00276","",13900,null,1,1,"",1,"MEDICUBE RED SUCCINIC ACID SERUM",""]]],["P-0273","medicube-triple-collagen-toner","Medicube","Triple Collagen Toner","Skincare","",[["LIR-00277","",12900,null,2,1,"URNA 3",1,"MEDICUBE TRIPLE COLLAGEN TONER",""]]],["P-0274","medicube-triple-collagen-cream","Medicube","Triple Collagen Cream","Skincare","",[["LIR-00278","",16900,null,1,1,"URNA 2",0,"MEDICUBE TRIPLE COLLAGEN CREAM",""]]],["P-0275","medicube-zero-foam-cleanser","Medicube","Zero Foam Cleanser","Skincare","",[["LIR-00279","",12900,null,2,1,"URNA 1",0,"MEDICUBE ZERO FOAM CLEANSER",""]]],["P-0276","medicube-collagen-jelly-cream","Medicube","Collagen Jelly Cream","Skincare","Tamaño",[["LIR-00280","Pequeño",12900,null,0,1,"",0,"MEDICUBE COLLAGEN JELLY CREAM PEQUEÑO",""],["LIR-00281","Grande",17500,null,1,1,"URNA 2",0,"MEDICUBE COLLAGEN JELLY CREAM GRANDE",""]]],["P-0277","medicube-collagen-firming-sun-cream-spf-50","Medicube","Collagen Firming Sun Cream SPF 50+","Skincare","",[["LIR-00282","",11900,null,0,1,"",0,"MEDICUBE COLLAGEN FIRMING SUN CREAM SPF 50+",""]]],["P-0278","medicube-collagen-glow-booster-serum","Medicube","Collagen Glow Booster Serum","Skincare","",[["LIR-00283","",14000,null,0,1,"",0,"MEDICUBE COLLAGEN GLOW BOOSTER SERUM",""]]],["P-0279","medicube-deep-lifting-peptide-eye-cream","Medicube","Deep Lifting Peptide Eye Cream","Skincare","",[["LIR-00284","",13900,null,2,1,"",1,"MEDICUBE DEEP LIFTING PEPTIDE EYE CREAM",""]]],["P-0280","medicube-azelaic-acid-16-bb-calming-serum-16","Medicube","Azelaic Acid 16 BB Calming Serum 16%","Skincare","",[["LIR-00285","",11900,null,2,1,"",1,"MEDICUBE AZELAIC ACID 16 BB CALMING SERUM 16%",""]]],["P-0281","medicube-hypochlorous-acid-daily-facial-spray","Medicube","Hypochlorous Acid Daily Facial Spray","Skincare","",[["LIR-00286","",14500,null,0,1,"",0,"MEDICUBE HYPOCHLORUS ACID DAILY FACIAL SPRAY",""]]],["P-0282","medicube-pdrn-collagen-toning-gel-toner-pad-99","Medicube","PDRN Collagen Toning Gel Toner Pad 99%","Skincare","",[["LIR-00287","",18500,null,0,1,"",0,"MEDICUBE PDRN COLLAGEN TONING GEL TONER PAD 99%",""]]],["P-0283","medicube-deep-vita-c-pad","Medicube","Deep Vita C Pad","Skincare","",[["LIR-00288","",16900,null,1,1,"",0,"MEDICUBE DEEP VITA C PAD",""]]],["P-0284","medicube-deep-vita-c-capsule-cream","Medicube","Deep Vita C Capsule Cream","Skincare","",[["LIR-00289","",16900,null,0,1,"URNA 2",0,"MEDICUBE DEEP VITA C CAPSULE CREAM",""]]],["P-0285","medicube-deep-vita-c-capsule-serum","Medicube","Deep Vita C Capsule Serum","Skincare","",[["LIR-00290","",15000,null,1,1,"",0,"MEDICUBE DEEP VITA C CAPSULE SERUM",""]]],["P-0286","medicube-lip-sleeping-mask","Medicube","Lip Sleeping Mask","Skincare","",[["LIR-00291","",12900,null,0,1,"",0,"MEDICUBE LIP SLEEPING MASK",""]]],["P-0287","medicube-collagen-night-wrapping-mask","Medicube","Collagen Night Wrapping Mask","Skincare","",[["LIR-00292","",16900,null,1,1,"",1,"MEDICUBE COLLAGEN NIGHT WRAPPING MASK",""]]],["P-0288","medicube-egf-nad-firming-serum","Medicube","EGF NAD Firming Serum","Skincare","",[["LIR-00293","",16000,null,0,1,"",1,"MEDICUBE EGF NAD FIRMING SERUM",""]]],["P-0289","medicube-ultra-light-pdrn-pink-peptide-serum","Medicube","Ultra Light PDRN Pink Peptide Serum","Skincare","",[["LIR-00294","",15900,null,0,1,"",0,"MEDICUBE ULTRA LIGHT PDRN PINK PEPTIDE SERUM",""]]],["P-0290","medicube-glutathione-glow-serum","Medicube","Glutathione Glow Serum","Skincare","",[["LIR-00295","",15000,null,0,1,"",1,"MEDICUBE GLUTATHINE GLOW SERUM",""]]],["P-0291","medicube-ffting-peptide-20-000","Medicube","Ffting Peptide 20 000","Skincare","",[["LIR-00296","",16900,null,0,1,"",0,"MEDICUBE FFTING PETIDE 20 000",""]]],["P-0292","medicube-kojic-acid-turmeric-niacinamide-serum","Medicube","Kojic Acid Turmeric Niacinamide Serum","Skincare","",[["LIR-00297","",14900,null,0,1,"",0,"MEDICUBE KOJIC ACID TUMERIC NIANINAMIDE SERUM",""]]],["P-0293","medicube-kojic-acid-turmeric-night-wrapping-mask","Medicube","Kojic Acid Turmeric Night Wrapping Mask","Skincare","",[["LIR-00298","",16900,null,1,1,"",0,"MEDICUBE KOJIC ACID TUMERIC NIGHT WRAPPING MASK",""]]],["P-0294","medicube-kojic-acid-vita-eye-gel-serum","Medicube","Kojic Acid Vita Eye Gel Serum","Skincare","",[["LIR-00299","",12000,null,0,1,"",0,"MEDICUBE KOJIC ACID VITA EYE GEL SERUM",""]]],["P-0295","medicube-kojic-acid-turmeric-resurfacing-toner","Medicube","Kojic Acid Turmeric Resurfacing Toner","Skincare","",[["LIR-00300","",15000,17900,5,1,"",0,"MEDICUBE KOJIC ACID TUMERIC RESURFACING TONER",""]]],["P-0296","medicube-kojic-acid-turmeric-vita-capsule-cream","Medicube","Kojic Acid Turmeric Vita Capsule Cream","Skincare","",[["LIR-00301","",17900,null,1,1,"URNA 2",0,"MEDICUBE KOJIC ACID TUMERIC VITA CAPSULE CREAM",""]]],["P-0297","medicube-zero-pore-pad","Medicube","Zero Pore Pad","Skincare","",[["LIR-00302","",16500,null,0,1,"",0,"MEDICUBE ZERO PORE PAD",""]]],["P-0298","medicube-zero-pore-moisture-sun-serum","Medicube","Zero Pore Moisture Sun Serum","Skincare","",[["LIR-00303","",14000,null,1,1,"URNA 2",0,"MEDICUBE ZERO PORE MOISTURE SUN SERUM",""]]],["P-0299","medicube-zero-pore-one-day-serum","Medicube","Zero Pore One Day Serum","Skincare","",[["LIR-00304","",16000,null,0,1,"",1,"MEDICUBE ZERO PORE ONE DAY SERUM",""]]],["P-0300","medicube-zero-pore-blackhead-mud-mask","Medicube","Zero Pore Blackhead Mud Mask","Skincare","",[["LIR-00305","",15000,null,1,1,"",1,"MEDICUBE ZERO PORE BLACKHEAD MUD MASK",""]]],["P-0301","medicube-zero-pore-blackhead-deep-cleansing-oil","Medicube","Zero Pore Blackhead Deep Cleansing Oil","Skincare","",[["LIR-00306","",16400,null,1,1,"URNA 1",0,"MEDICUBE ZERO PORE BLACKHEAD DEEP CLEANSING OIL","URNA 1 CORR"]]],["P-0302","medicube-zero-pore-sa-clear-capsule-cleansing-foam","Medicube","Zero Pore SA Clear Capsule Cleansing Foam","Skincare","",[["LIR-00307","",12900,null,0,1,"",0,"MEDICUBE ZERO PORE SA CLEAR CAPSULE CLEANSING FOAM",""]]],["P-0303","medicube-pdrn-pink-tone-up-sun-cream","Medicube","PDRN Pink Tone Up Sun Cream","Maquillaje","Tamaño",[["LIR-00308","Mini",6500,null,1,1,"URNA 2",0,"MEDICUBE PDRN PINK TONE UP SUN CREAM MINI",""],["LIR-00309","Grande",13900,null,3,1,"URNA 2",0,"MEDICUBE PDRN PINK TONE UP SUN CREAM GRANDE",""]]],["P-0304","medicube-pdrn-pink-peptide-serum-mask-caja","Medicube","PDRN Pink Peptide Serum Mask Caja","Skincare","",[["LIR-00310","",25000,null,1,1,"URNA 2",0,"MEDICUBE PDRN PINK PEPTIDE SERUM MASK CAJA",""]]],["P-0305","medicube-pdrn-pink-vita-coating-mask","Medicube","PDRN Pink Vita Coating Mask","Maquillaje","",[["LIR-00311","",3000,null,10,1,"",0,"MEDICUBE PDRN PINK VITA COATING MASK",""]]],["P-0306","medicube-pdrn-pink-collagen-exosome-shot-7500","Medicube","PDRN Pink Collagen Exosome Shot 7500","Maquillaje","",[["LIR-00312","",15900,null,1,1,"",1,"MEDICUBE PDRN PINK COLLAGEN EXOSOME SHOT 7500",""]]],["P-0307","medicube-pdrn-pink-collagen-exosome-shot-2000","Medicube","PDRN Pink Collagen Exosome Shot 2000","Maquillaje","",[["LIR-00313","",15500,null,0,1,"",0,"MEDICUBE PDRN PINK COLLAGEN EXOSOME SHOT 2000",""]]],["P-0308","medicube-pdrn-pink-peptide-serum-30-ml","Medicube","PDRN Pink Peptide Serum 30 ml","Skincare","",[["LIR-00314","",16000,null,0,1,"",0,"MEDICUBE PDRN PINK  PEPTIDE SERUM 30 ML",""]]],["P-0309","medicube-pdrn-pink-peptide-serum-mask-individual","Medicube","PDRN Pink Peptide Serum Mask Individual","Skincare","",[["LIR-00315","",3000,null,0,1,"",0,"MEDICUBE PDRN PINK  PEPTIDE SERUM MASK INDIVIDUAL",""]]],["P-0310","medicube-pdrn-pink-niacinamide-milky-toner","Medicube","PDRN Pink Niacinamide Milky Toner","Maquillaje","",[["LIR-00316","",15900,null,0,1,"",1,"MEDICUBE PDRN PINK  NIACINAMIDE MILKY TONER",""]]],["P-0311","medicube-pdrn-pink-collagen-glow-jelly-mist-serum-water-80-9","Medicube","PDRN Pink Collagen Glow Jelly Mist Serum Water 80.9%","Skincare","",[["LIR-00317","",13900,null,1,1,"",1,"MEDICUBE PDRN PINK  COLLAGEN GLOW JELLY MIST SERUM WATER 80.9%",""]]],["P-0312","medicube-pdrn-pink-collagen-bubble-serum-99","Medicube","PDRN Pink Collagen Bubble Serum 99%","Skincare","",[["LIR-00318","",18000,null,0,1,"",1,"MEDICUBE PDRN PINK  COLLAGEN BUBBLE SERUM 99%",""]]],["P-0313","medicube-pdrn-hydrating-gel-cleanser","Medicube","PDRN Hydrating Gel Cleanser","Skincare","",[["LIR-00319","",15000,null,2,1,"URNA 1",0,"MEDICUBE PDRN HYDRATING GEL CLEANSER",""]]],["P-0314","medicube-pdrn-pink-niacinamide-whip-cleanser-99","Medicube","PDRN Pink Niacinamide Whip Cleanser 99%","Maquillaje","",[["LIR-00320","",13900,null,3,1,"URNA 1",0,"MEDICUBE PDRN PINK NIACINAMIDE WHIP CLEANSER 99%",""]]],["P-0315","medicube-pdrn-pink-caffeine-night-wrapping-mask","Medicube","PDRN Pink Caffeine Night Wrapping Mask","Maquillaje","",[["LIR-00321","",16900,null,1,1,"",1,"MEDICUBE PDRN PINK  CAFFEINE NIGHT WRAPPING MASK",""]]],["P-0316","medicube-pdrn-pink-collagen-capsule-cream","Medicube","PDRN Pink Collagen Capsule Cream","Maquillaje","",[["LIR-00322","",16900,null,1,1,"",0,"MEDICUBE PDRN PINK  COLLAGEN CAPSULE CREAM",""]]],["P-0317","medicube-pdrn-pink-tone-up-2-cremas-en-1-caja-rosada-oscuro","Medicube","PDRN Pink Tone Up 2 Cremas En 1 Caja Rosada Oscuro","Maquillaje","",[["LIR-00323","",16900,null,2,1,"URNA 2",0,"MEDICUBE PDRN PINK TONE UP 2 CREMAS EN 1 CAJA ROSADA OSCURO",""]]],["P-0318","medicube-pdrn-pink-collagen-volume-multi-balm-5-volufiline","Medicube","PDRN Pink Collagen Volume Multi Balm 5% Volufiline","Maquillaje","",[["LIR-00324","",17900,null,0,1,"",0,"MEDICUBE PDRN PINK COLLAGEN VOLUME MULTI BALM 5% VOLUFILINE",""]]],["P-0319","medicube-pdrn-peptide-eye-cream","Medicube","PDRN Peptide Eye Cream","Skincare","",[["LIR-00325","",14000,null,0,1,"",0,"MEDICUBE PDRN PEPTIDE EYE CREAM",""]]],["P-0320","medicube-pdrn-pink-one-day-serum-99","Medicube","PDRN Pink One Day Serum 99","Skincare","",[["LIR-00326","",12900,null,2,1,"URNA 2",0,"MEDICUBE PDRN PINK ONE DAY SERUM 99",""]]],["P-0321","medicube-pdrn-booster-gel","Medicube","PDRN Booster Gel","Skincare","",[["LIR-00327","",19500,null,0,1,"",1,"MEDICUBE PDRN BOOSTER GEL",""]]],["P-0322","medicube-pdrn-pink-collagen-gel-mask","Medicube","PDRN Pink Collagen Gel Mask","Maquillaje","",[["LIR-00328","",16750,null,0,1,"",0,"MEDICUBE PDRN PINK COLLAGEN GEL MASK",""]]],["P-0323","medicube-pdrn-pink-collagen-jelly-eye-mask-caja","Medicube","PDRN Pink Collagen Jelly Eye Mask Caja","Maquillaje","",[["LIR-00329","",10900,null,0,1,"",1,"MEDICUBE PDRN PINK COLLAGEN JELLY EYE MASK CAJA",""]]],["P-0324","medicube-pdrn-pink-collagen-jelly-eye-mask-individual","Medicube","PDRN Pink Collagen Jelly Eye Mask Individual","Maquillaje","",[["LIR-00330","",2300,null,3,1,"URNA 2",0,"MEDICUBE PDRN PINK COLLAGEN JELLY EYE MASK INDIVIDUAL",""]]],["P-0325","medicube-pdrn-hyaluronic-moisturizing-cream","Medicube","PDRN Hyaluronic Moisturizing Cream","Skincare","",[["LIR-00331","",12900,null,2,1,"URNA 2",0,"MEDICUBE PDRN HYALURONIC MOISTURIZING CREAM",""]]],["P-0326","medicube-pdrn-pink-caffeine-collagen-eye-patch","Medicube","PDRN Pink Caffeine Collagen Eye Patch","Maquillaje","",[["LIR-00332","",17900,null,0,1,"",1,"MEDICUBE PDRN PINK CAFFEINE COLLAGEN EYE PATCH",""]]],["P-0327","medicube-rosemary-pdrn-damage-care-hair-mask","Medicube","Rosemary PDRN Damage Care Hair Mask","Cabello","",[["LIR-00333","",14000,null,0,1,"URNA 3",0,"MEDICUBE ROSEMARY PDRN DAMAGE CARE HAIR MASK",""]]],["P-0328","medicube-rosemary-pdrn-hair-and-scalp-conditioner","Medicube","Rosemary PDRN Hair & Scalp Conditioner","Cabello","",[["LIR-00334","",13000,null,1,1,"",0,"MEDICUBE ROSEMARY PDRN HAIR & SCALP CONDITIONER","URMA 3"]]],["P-0329","medicube-pdrn-hydrating-uv-serum-spf-50-no-cast-just-dew","Medicube","PDRN Hydrating UV Serum SPF 50+ No Cast Just Dew","Skincare","",[["LIR-00335","",15500,null,2,1,"URNA 2",0,"MEDICUBE PDRN HYDRATING UV SERUM SPF 50+ NO CAST JUST DEW",""]]],["P-0330","monday-haircare-moisture-hair-body-gift-set","Monday Haircare","Moisture Hair + Body Gift Set","Cabello","",[["LIR-00336","",20000,null,0,1,"",0,"MONDAY MOISTURE HAIR + BODY GIFT SET",""]]],["P-0331","monday-haircare-shampoo-moisture-hair-hyaluronic-acid-for-dry-and-dull-hair","Monday Haircare","Shampoo Moisture Hair + Hyaluronic Acid For Dry And Dull Hair","Cabello","",[["LIR-00337","",10000,null,0,1,"",0,"MONDAY SHAMPOO MOISTURE HAIR + HYALURONIC ACID FOR DRY AND DULL HAIR",""]]],["P-0332","monday-haircare-smooth-heat-protectant-keratin","Monday Haircare","Smooth Heat Protectant + Keratin","Cabello","",[["LIR-00338","",10000,null,0,1,"",0,"MONDAY SMOOTH HEAT PROTECTANT + KERATIN",""]]],["P-0333","monday-haircare-original-dry-shampoo-with-keratin","Monday Haircare","Original Dry Shampoo With Keratin","Cabello","",[["LIR-00339","",10000,null,0,1,"",0,"MONDAY ORIGINAL DRY SHAMPOO WITH KERATIN",""]]],["P-0334","max-factor-x-kohl-pencil-020-black","Max Factor","X Kohl Pencil 020 Black","Maquillaje","",[["LIR-00340","",9100,null,0,1,"",0,"MAX FACTOR X KOHL PENCIL 020 BLACK",""]]],["P-0335","max-factor-false-lash-effect","Max Factor","False Lash Effect","Maquillaje","",[["LIR-00341","",15000,null,0,1,"",0,"MAX FACTOR FALSE LASH EFFECT",""]]],["P-0336","max-factor-masterpiece-matte-liquid-eye-liner","Max Factor","Masterpiece Matte Liquid Eye Liner","Maquillaje","",[["LIR-00342","",12000,null,2,1,"",1,"MAX FACTOR MASTERPIECE MATTE LIQUID EYE LINER",""]]],["P-0337","max-factor-real-brow-fill-and-shape","Max Factor","Real Brow Fill And Shape","Maquillaje","",[["LIR-00343","",13100,null,1,1,"",0,"MAX FACTOR REAL BROW FILL AND SHAPE",""]]],["P-0338","max-factor-brow-lamination-master-piece-divine-cafe","Max Factor","Brow Lamination Master Piece Divine Café","Maquillaje","",[["LIR-00344","",12500,null,0,1,"",0,"MAX FACTOR BROW LAMINATION MASTER PIECE DIVINE CAFÉ",""]]],["P-0339","max-factor-long-lash-era-mascara","Max Factor","Long Lash Era Mascara","Maquillaje","",[["LIR-00345","",17000,null,1,1,"URNA 1",0,"MAX FACTOR LONG LASH ERA MASCARA",""]]],["P-0340","max-factor-masterpiece-divine-brow-lamination-sin-color","Max Factor","Masterpiece Divine Brow Lamination sin Color","Maquillaje","",[["LIR-00346","",12500,null,2,1,"URNA 3",1,"MAX FACTOR MASTERPIECE DIVINE BROW LAMINATION SIN COLOR",""]]],["P-0341","missha-rojo-bb-cream","Missha","Rojo BB Cream","Maquillaje","",[["LIR-00347","",12900,null,1,1,"",0,"MISSHA ROJO BB CREAM",""]]],["P-0342","missha-morado-cream","Missha","Morado Cream","Skincare","",[["LIR-00348","",16900,null,1,1,"",0,"MISSHA  MORADO CREAM",""]]],["P-0343","numbuzin-full-face-mask-caja","Numbuzin","Full Face Mask Caja","Skincare","",[["LIR-00349","",15000,null,1,1,"URNA 3",1,"NUMBUZIN FULL FACE MASK  CAJA",""]]],["P-0344","numbuzin-boosting-toner-9","Numbuzin","Boosting Toner 9+","Skincare","",[["LIR-00350","",15500,null,0,1,"",0,"NUMBUZIN BOOSTING TONER 9+",""]]],["P-0345","numbuzin-under-eye-patches-9","Numbuzin","Under Eye Patches 9+","Skincare","",[["LIR-00351","",3000,null,0,1,"",0,"NUMBUZIN UNDER EYE PATCHES 9+",""]]],["P-0346","nyx-primer-mini","NYX","Primer Mini","Maquillaje","",[["LIR-00352","",5000,null,0,1,"",1,"NYX PRIMER MINI",""]]],["P-0347","nyx-the-brow-glue-de-color","NYX","The Brow Glue de Color","Maquillaje","",[["LIR-00353","",11500,null,1,1,"URNA 3",1,"NYX THE BROW GLUE  DE COLOR",""]]],["P-0348","nyx-eye-and-eyebrow-pencil","NYX","Eye And Eyebrow Pencil","Maquillaje","",[["LIR-00354","",5500,null,3,1,"URNA 3",1,"NYX EYE AND EYEBROW PENCIL",""]]],["P-0349","nyx-the-brow-glue-rosada","NYX","The Brow Glue Rosada","Maquillaje","",[["LIR-00355","",11500,null,0,1,"URNA 3",0,"NYX THE BROW GLUE ROSADA",""]]],["P-0350","nyx-smushy","NYX","Smushy","Maquillaje","",[["LIR-00356","",6000,null,3,1,"",0,"NYX SMUSHY","corr"]]],["P-0351","nyx-epic-ink-liner","NYX","Epic Ink Liner","Maquillaje","",[["LIR-00357","",10500,null,2,1,"URNA 3",1,"NYX EPIC INK LINER",""]]],["P-0352","nyx-fat-oil-lip-drip","NYX","Fat Oil Lip Drip","Maquillaje","",[["LIR-00358","",8000,null,2,1,"URNA 2",0,"NYX FAT OIL LIP DRIP",""]]],["P-0353","nyx-buttermelt-bronzer","NYX","Buttermelt Bronzer","Maquillaje","",[["LIR-00359","",11000,null,0,1,"",0,"NYX BUTTERMELT BRONZER",""]]],["P-0354","nyx-fat-oil-slick-click-lip-balm","NYX","Fat Oil Slick Click Lip Balm","Skincare","",[["LIR-00360","",6500,null,1,1,"URNA 2",0,"NYX FAT OIL SLICK CLICK LIP BALM",""]]],["P-0355","nyx-filler-instinct","NYX","Filler Instinct","Maquillaje","",[["LIR-00361","",5000,null,1,1,"URNA 2",0,"NYX FILLER INSTINCT",""]]],["P-0356","nyx-lip-iv-hydrating-gloss-serum","NYX","Lip Iv Hydrating Gloss Serum","Maquillaje","",[["LIR-00362","",9000,null,2,1,"URNA 2",0,"NYX LIP IV HYDRATING GLOSS SERUM",""]]],["P-0357","nyx-this-is-juice-gloss","NYX","This Is Juice Gloss","Maquillaje","",[["LIR-00363","",6900,null,3,1,"URNA 2",0,"NYX THIS IS JUICE GLOSS","NO FUE REBAJADO DIA 9"]]],["P-0358","nyx-full-coverage-foundation","NYX","Full Coverage Foundation","Maquillaje","",[["LIR-00364","",9000,null,1,1,"URNA 3",1,"NYX FULL COVERAGE FOUNDATION",""]]],["P-0359","nyx-the-face-glue-primer-grande","NYX","The Face Glue Primer Grande","Maquillaje","",[["LIR-00365","",9900,null,0,1,"",1,"NYX THE FACE GLUE PRIMER GRANDE",""]]],["P-0360","nyx-fill-and-fluff-cejas","NYX","Fill & Fluff Cejas","Maquillaje","",[["LIR-00366","",10900,null,0,1,"",1,"NYX FILL & FLUFF CEJAS","???? · NO FUE REBAJADO DIA 8"]]],["P-0361","naked-sundays-clear-glow-sun-stick-spf-50","Naked Sundays","Clear Glow Sun Stick SPF 50+","Skincare","",[["LIR-00367","",10000,null,2,1,"URNA 2",0,"NAKED SUNDAYS CLEAR GLOW SUN STICK SPF 50+",""]]],["P-0362","one-size-tinted-nourishing-brow-gel","ONE/SIZE","Tinted Nourishing Brow Gel","Maquillaje","",[["LIR-00368","",16600,null,1,1,"",1,"ONESIZE TINTED NOURISHING BROW GEL",""]]],["P-0363","one-size-on-til-dawn-mattifying-waterproof-setting-spray-mini","ONE/SIZE","On `til Dawn Mattifying Waterproof Setting Spray Mini","Maquillaje","",[["LIR-00369","",15000,null,0,1,"",0,"ONESIZE ON `TIL DAWN MATTIFYING WATERPROOF SETTING SPRAY MINI",""]]],["P-0364","one-size-powder-glass-setting-spray","ONE/SIZE","Powder Glass Setting Spray","Maquillaje","",[["LIR-00370","",31000,null,0,1,"",0,"ONESIZE POWDER GLASS SETTING SPRAY",""]]],["P-0365","one-size-on-til-dawn-mattifying-setting-spray-grande","ONE/SIZE","On Til Dawn Mattifying Setting Spray Grande","Maquillaje","",[["LIR-00371","",28900,null,2,1,"URNA 2",0,"ONESIZE ON TIL DAWN MATTIFYING SETTING SPRAY GRANDE",""]]],["P-0366","one-size-powder-mini","ONE/SIZE","Powder Mini","Maquillaje","",[["LIR-00372","",17900,null,0,1,"",1,"ONESIZE POWDER MINI",""]]],["P-0367","one-size-ultimate-setting-powder-crystal-sprinkles","ONE/SIZE","Ultimate Setting Powder Crystal Sprinkles","Maquillaje","",[["LIR-00373","",29900,null,1,1,"",0,"ONESIZE ULTIMATE SETTING POWDER CRYSTAL SPRINKLES",""]]],["P-0368","one-size-diamond-setting-spray","ONE/SIZE","Diamond Setting Spray","Maquillaje","",[["LIR-00374","",29900,null,2,1,"",0,"ONESIZE DIAMOND SETTING SPRAY",""]]],["P-0369","one-size-oilsucker","ONE/SIZE","Oilsucker","Maquillaje","",[["LIR-00375","",28900,null,1,1,"",0,"ONESIZE OILSUCKER",""]]],["P-0370","one-size-power-melt-setting-spray","ONE/SIZE","Power Melt Setting Spray","Maquillaje","",[["LIR-00376","",28900,null,1,1,"",0,"ONESIZE POWER MELT SETTING SPRAY",""]]],["P-0371","olaplex-hair-perfector-3","Olaplex","Hair Perfector 3","Cabello","",[["LIR-00377","",20000,null,3,1,"URNA 1",0,"OLAPLEX HAIR PERFECTOR 3",""]]],["P-0372","olaplex-blonde-enhancer-shampoo-4-morado","Olaplex","Blonde Enhancer Shampoo 4 Morado","Cabello","",[["LIR-00378","",24000,null,1,1,"URNA 1",0,"OLAPLEX BLONDE ENHACER SHAMPOO 4 MORADO","corr urna 1"]]],["P-0373","olaplex-bond-maintenance-shampoo-4","Olaplex","Bond Maintenance Shampoo 4","Cabello","",[["LIR-00379","",24000,null,3,1,"URNA 1",0,"OLAPLEX BOND MAINTENANCE SHAMPOO 4","corr urna 1"]]],["P-0374","olaplex-bond-maintenance-acondicionador-5","Olaplex","Bond Maintenance Acondicionador 5","Cabello","",[["LIR-00380","",24000,null,1,1,"URNA 1",0,"OLAPLEX BOND MAINTENANCE ACONDICIONADOR 5","CORR URNA 1"]]],["P-0375","olaplex-acondicionador-5-morado","Olaplex","Acondicionador 5 Morado","Cabello","",[["LIR-00381","",24000,null,1,1,"URNA 1",0,"OLAPLEX ACONDICIONADOR 5 MORADO","CORR URNA 1"]]],["P-0376","olaplex-bond-smoother-6","Olaplex","Bond Smoother 6","Cabello","",[["LIR-00382","",0,null,0,1,"",0,"OLAPLEX BOND SMOOTHER 6",""]]],["P-0377","olaplex-bond-intense-8","Olaplex","Bond Intense 8","Cabello","",[["LIR-00383","",14900,null,0,1,"",0,"OLAPLEX BOND INTENSE 8",""]]],["P-0378","olaplex-bonding-oil-7","Olaplex","Bonding Oil 7","Cabello","",[["LIR-00384","",25000,null,0,1,"",1,"OLAPLEX BONDING OIL 7",""]]],["P-0379","olaplex-bond-protector-hair-serum-9","Olaplex","Bond Protector Hair Serum 9","Cabello","",[["LIR-00385","",22000,null,0,1,"",0,"OLAPLEX BOND PROTECTOR HAIR SERUM 9",""]]],["P-0380","prteyy-the-girl-kit","Prteyy","The Girl Kit","Skincare","",[["LIR-00386","",16900,null,1,1,"",0,"PRTEYY THE GIRL KIT",""]]],["P-0381","purito-txa-6-niacinamide-10-retinal-serum","Purito","TXA 6 Niacinamide 10 Retinal Serum","Skincare","",[["LIR-00387","",18200,null,1,1,"",1,"PURITO TXA 6 NIACINAMIDE 10 RETINAL SERUM",""]]],["P-0382","purito-wonder-relief-centella-eye-cream","Purito","Wonder Relief Centella Eye Cream","Skincare","",[["LIR-00388","",12000,null,0,1,"",0,"PURITO WONDER RELIEF CENTELLA EYE CREAM",""]]],["P-0383","rare-beauty-soft-pinch-dewy-liquid-blush","Rare Beauty","Soft Pinch Dewy Liquid Blush","Maquillaje","",[["LIR-00389","",14500,null,0,1,"",0,"RARE BEAUTY SOFT PINCH DEWY LIQUID BLUSH",""]]],["P-0384","rare-beauty-soft-pinch-matte-bouncy-blush","Rare Beauty","Soft Pinch Matte Bouncy Blush","Maquillaje","",[["LIR-00390","",14900,null,0,1,"",1,"RARE BEAUTY SOFT PINCH MATTE BOUNCY BLUSH",""]]],["P-0385","rare-beauty-positive-light-silky-touch-highlighter","Rare Beauty","Positive Light Silky Touch Highlighter","Maquillaje","",[["LIR-00391","",18000,null,0,1,"",1,"RARE BEUTY POSITIVE LIGHT SILKY TOUCH HIGHLIGTER",""]]],["P-0386","rare-beauty-stay-vulnerable-melting-blush","Rare Beauty","Stay Vulnerable Melting Blush","Maquillaje","",[["LIR-00392","",15000,null,0,1,"",0,"RARE BEAUTY STAY VULNERABLE MELTING BLUSH",""]]],["P-0387","rare-beauty-stay-vulnerable-glossy-lip-balm","Rare Beauty","Stay Vulnerable Glossy Lip Balm","Skincare","",[["LIR-00393","",13500,null,1,1,"URNA 2",0,"RARE BEAUTY STAY VULNERABLE GLOSSY LIP BALM",""]]],["P-0388","rare-beauty-positive-light-luminizing-lip-gloss","Rare Beauty","Positive Light Luminizing Lip Gloss","Maquillaje","",[["LIR-00394","",10000,null,0,1,"",1,"RARE BEUTY POSITIVE LIGHT LUMINIZING LIP GLOSS",""]]],["P-0389","rare-beauty-tinta-labial","Rare Beauty","Tinta Labial","Maquillaje","",[["LIR-00395","",14900,null,0,1,"",0,"RARE BEAUTY TINTA LABIAL",""]]],["P-0390","rare-beauty-beauty-insider","Rare Beauty","Beauty Insider","Maquillaje","",[["LIR-00396","",24500,null,3,1,"URNA 2",0,"RARE BEAUTY BEAUTY INSIDER",""]]],["P-0391","rare-beauty-kit","Rare Beauty","Kit","Maquillaje","",[["LIR-00397","",31900,null,0,1,"",0,"RARE BEAUTY KIT",""]]],["P-0392","rare-beauty-dewy-liquid-blush-soft-pinch","Rare Beauty","Dewy Liquid Blush Soft Pinch","Maquillaje","",[["LIR-00398","",20000,null,0,1,"",0,"RARE BEAUTY DEWY LIQUID BLUSH SOFT PINCH",""]]],["P-0393","rare-beauty-kit-blush-enluminer","Rare Beauty","Kit Blush Enluminer","Maquillaje","",[["LIR-00399","",24500,null,0,1,"",1,"RARE BEUTY KIT BLUSH  ENLUMINER",""]]],["P-0394","rare-beauty-blot-and-glow-blotting-sheets","Rare Beauty","Blot & Glow Blotting Sheets","Maquillaje","",[["LIR-00400","",2500,null,1,1,"URNA 2",0,"RARE BEAUTY BLOT & GLOW BLOTTING SHEETS",""]]],["P-0395","rare-beauty-perfect-strokes-universal-volumizing-mascara","Rare Beauty","Perfect Strokes Universal Volumizing Mascara","Maquillaje","",[["LIR-00401","",9900,null,1,1,"URNA 1",0,"RARE BEAUTY PERFECT STROKES UNIVERSAL VOLUMINIZING MASCARA",""]]],["P-0396","rare-beauty-warm-radiance-mini-blush-and-luminizer-duo","Rare Beauty","Warm Radiance Mini Blush & Luminizer Duo","Maquillaje","",[["LIR-00402","",24500,null,1,1,"URNA 2",0,"RARE BEAUTY WARM RADIANCE MINI BLUSH & LUMINIZER DUO",""]]],["P-0397","generico-reviving-eye-mask","Genérico","Reviving Eye Mask","Skincare","",[["LIR-00403","",2200,null,0,1,"",0,"REVIVING EYE MASK",""]]],["P-0398","rhode-barrier-restore-cream","Rhode","Barrier Restore Cream","Skincare","",[["LIR-00404","",19000,null,0,1,"",1,"RHODE BARRIER RESTORE CREAM",""]]],["P-0399","rhode-pineapple-cleanser","Rhode","Pineapple Cleanser","Skincare","",[["LIR-00405","",25000,null,1,1,"URNA 1",0,"RHODE PINEAPPLE CLEANSER",""]]],["P-0400","rhode-peptide-lip-shape-contour","Rhode","Peptide Lip Shape Contour","Maquillaje","",[["LIR-00406","",14500,null,0,1,"",0,"RHODE PEPTIDE LIP SHAPE CONTOUR",""]]],["P-0401","rhode-peptide-lip-tint","Rhode","Peptide Lip Tint","Maquillaje","",[["LIR-00407","",15000,null,2,1,"URNA 2",0,"RHODE PEPTIDE LIP TINT SIN CAJA / RHODE PEPTIDE LIP TINT CON CAJA",""]]],["P-0402","rhode-pocket-highlight","Rhode","Pocket Highlight","Maquillaje","",[["LIR-00408","",15900,null,0,1,"",0,"RHODE POCKET HIGHLIGHT",""]]],["P-0403","rhode-pocket-blush-de-poche","Rhode","Pocket Blush de Poche","Maquillaje","",[["LIR-00409","",15900,null,0,1,"",0,"RHODE POCKET BLUSH  DE POCHE",""]]],["P-0404","rhode-milk","Rhode","Milk","Skincare","",[["LIR-00410","",17000,null,0,1,"",0,"RHODE MILK",""]]],["P-0405","rosa-acca-kit","Rosa Acca","Kit","Skincare","",[["LIR-00411","",27900,null,1,1,"",0,"ROSA ACCA KIT",""]]],["P-0406","ruby-kisses-setting-powder","Ruby Kisses","Setting Powder","Maquillaje","",[["LIR-00412","",7900,null,1,1,"",1,"RUBY KISSES SETTING POWDER",""]]],["P-0407","generico-ruby-face","Genérico","Ruby Face","Skincare","",[["LIR-00413","",2750,null,3,1,"",0,"RUBY FACE",""]]],["P-0408","generico-ruby-face-2","Genérico","Ruby Face","Accesorios","",[["LIR-00414","",2750,null,3,1,"",0,"RUBY FACE",""]]],["P-0409","round-lab-moisturizing-cleanser","Round Lab","Moisturizing Cleanser","Skincare","",[["LIR-00415","",10000,null,1,1,"URNA 1",0,"ROUND LAB MOISTURIZING CLEANSER",""]]],["P-0410","sacha-buttercup-setting-powder","Sacha","Buttercup Setting Powder","Maquillaje","",[["LIR-00416","",21900,null,1,1,"URNA 2",0,"SACHA BUTTERCUP SETTING POWDER",""]]],["P-0411","summer-fridays-the-dewy-pink-set","Summer Fridays","The Dewy Pink Set","Maquillaje","",[["LIR-00417","",29900,null,1,1,"URNA 2",0,"SUMMER FRIDAYS THE DEWY PINK SET",""]]],["P-0412","seoul-1988-cleansing-foam-pine-cica-1-probiotics","Seoul 1988","Cleansing Foam Pine Cica 1% + Probiotics","Skincare","",[["LIR-00418","",13900,null,2,1,"URNA 1",0,"SEOUL 1988 CLEASING FOAM PINE CICA 1% + PROBIOTICS","CORR URNA 1"]]],["P-0413","seoul-1988-cleansing-oil","Seoul 1988","Cleansing Oil","Skincare","",[["LIR-00419","",13900,null,1,1,"",1,"SEOUL 1988  CLEASING OIL",""]]],["P-0414","seoul-1988-retinal-liposome-2-black-ginseng","Seoul 1988","Retinal Liposome 2% + Black Ginseng","Skincare","",[["LIR-00420","",10900,null,0,1,"",0,"SEOUL 1988 RETINAL LIPOSOME 2% + BLACK GINSENG SIN CAJA / SEOUL 1988 RETINAL LIPOSOME 2% + BLACK GINSENG CON CAJA",""]]],["P-0415","sadoer-acne-patch-salicylic-acid","Sadoer","Acne Patch Salicylic Acid","Skincare","",[["LIR-00421","",3500,null,0,1,"",0,"SADOER ACNE PATCH SALICYLIC ACID",""]]],["P-0416","saie-primer-iluminador","Saie","Primer Iluminador","Maquillaje","",[["LIR-00422","",20500,null,0,1,"",0,"SAIE PRIMER ILUMINADOR",""]]],["P-0417","salerm-silk-protein-hair-mask","Salerm","Silk Protein Hair Mask","Cabello","",[["LIR-00423","",18000,null,0,1,"",0,"SALERM SILK PROTEIN HAIR MASK",""]]],["P-0418","sephora-collection-glowing-cleansing-wipes","Sephora Collection","Glowing Cleansing Wipes","Skincare","",[["LIR-00424","",5000,null,0,1,"",1,"SEPHORA GLOWING CLEANSING WIPES",""]]],["P-0419","skin1004-tea-trica-toner","SKIN1004","Tea Trica Toner","Skincare","",[["LIR-00425","",13900,null,0,1,"",1,"SKIN 1004 TEA TRICA  TONER",""]]],["P-0420","skin1004-tea-trica-bha-foam","SKIN1004","Tea Trica BHA Foam","Skincare","",[["LIR-00426","",11900,null,4,1,"URNA 1",0,"SKIN 1004 TEA TRICA BHA FOAM",""]]],["P-0421","skin1004-sun-serum-hyalu-cica-water-fit-spf-50","SKIN1004","Sun Serum Hyalu - Cica, Water - Fit SPF 50+","Skincare","",[["LIR-00427","",11900,null,0,1,"",0,"SKIN 1004 SUN SERUM HYALU - CICA, WATER - FIT SPF 50+",""]]],["P-0422","skin1004-tea-trica-cream","SKIN1004","Tea Trica Cream","Skincare","",[["LIR-00428","",13500,null,1,1,"",1,"SKIN 1004 TEA TRICA CREAM",""]]],["P-0423","skin1004-tea-trica-relief-ampoule","SKIN1004","Tea Trica Relief Ampoule","Skincare","",[["LIR-00429","",12900,null,1,1,"",1,"SKIN 1004 TEA TRICA RELIEF AMPOULE",""]]],["P-0424","skin1004-poremizing-quick-clay-stick-mask","SKIN1004","Poremizing Quick Clay Stick Mask","Skincare","",[["LIR-00430","",12500,null,0,1,"",1,"SKIN 1004 POREMIZING QUICK CLAY STICK MASK",""]]],["P-0425","skin1004-hyalu-cica-silky-fit-sun-stick-spf-50","SKIN1004","Hyalu-cica Silky-fit Sun Stick SPF 50+","Skincare","Tamaño",[["LIR-00431","Grande",11500,null,1,1,"URNA 2",0,"SKIN 1004 HYALU-CICA SILKY-FIT SUN STICK SPF 50+ GRANDE",""],["LIR-00432","Mini",6500,null,0,1,"",0,"SKIN 1004 HYALU-CICA SILKY-FIT SUN STICK SPF 50+ MINI",""]]],["P-0426","skin1004-tone-brightening-cleansing-gel-foam","SKIN1004","Tone Brightening Cleansing Gel Foam","Skincare","",[["LIR-00433","",11900,null,1,1,"URNA 1",0,"SKIN 1004 TONE BRIGHTENING CLEANSING GEL FOAM",""]]],["P-0427","skin1004-centella-poremizing-fresh-ampoule","SKIN1004","Centella Poremizing Fresh Ampoule","Skincare","",[["LIR-00434","",12900,null,0,1,"",0,"SKIN 1004 CENTELLA POREMIZING FRESH AMPOULE",""]]],["P-0428","skin1004-hyalu-cica-sleeping-pack","SKIN1004","Hyalu - Cica Sleeping Pack","Skincare","",[["LIR-00435","",11900,null,3,1,"",1,"SKIN 1004 HYALU - CICA SLEEPING PACK",""]]],["P-0429","skin1004-tone-brightening-capsule-cream","SKIN1004","Tone Brightening Capsule Cream","Skincare","",[["LIR-00436","",13500,null,0,1,"",0,"SKIN 1004 TONE BRIGHTENING CAPSULE CREAM",""]]],["P-0430","skin1004-hyaluca-cica-brightening-toner","SKIN1004","Hyaluca - Cica Brightening Toner","Skincare","",[["LIR-00437","",13500,null,1,1,"",1,"SKIN 1004 HYALUCA - CICA BRIGHTENING TONER",""]]],["P-0431","skin1004-hyaluca-cica-moisture-cream","SKIN1004","Hyaluca Cica Moisture Cream","Skincare","",[["LIR-00438","",13500,null,1,1,"",0,"SKIN  1004 HYALUCA CICA MOISTURE CREAM",""]]],["P-0432","skin1004-poremizing-travel-kit-rosado","SKIN1004","Poremizing Travel Kit Rosado","Skincare","",[["LIR-00439","",18900,null,1,1,"URNA 1",0,"SKIN 1004 POREMIZING TRAVEL KIT ROSADO",""]]],["P-0433","skin1004-centella-ampoule-foam-dorado","SKIN1004","Centella Ampoule Foam (dorado)","Skincare","",[["LIR-00440","",12900,null,2,1,"URNA 1",0,"SKIN 1004 CENTELLA AMPOULE FOAM (DORADO)",""]]],["P-0434","skin1004-centella-light-cleansing-oil-dorado","SKIN1004","Centella Light Cleansing Oil (dorado)","Skincare","",[["LIR-00441","",12900,null,2,1,"",1,"SKIN 1004 CENTELLA  LIGHT CLEANSING OIL (DORADO)",""]]],["P-0435","skin1004-centella-travel-kit-dorado","SKIN1004","Centella Travel Kit (dorado)","Skincare","",[["LIR-00442","",19900,null,0,1,"",0,"SKIN 1004 CENTELLA TRAVEL KIT (DORADO)",""]]],["P-0436","skin1004-sunscreen-dorado","SKIN1004","Sunscreen (dorado)","Skincare","",[["LIR-00443","",14000,null,0,1,"",0,"SKIN 1004 SUNSCREAM  (DORADO)",""]]],["P-0437","skin1004-retinol-0-2","SKIN1004","Retinol 0.2%","Skincare","Tamaño",[["LIR-00444","Mini",6500,null,1,1,"",1,"SKIN 1004 RETINOL 0.2% MINI",""],["LIR-00445","Grande",13500,null,0,1,"",0,"SKIN 1004 RETINOL 0.2% GRANDE",""]]],["P-0438","skin1004-niacinamide-10-mini","SKIN1004","Niacinamide 10% Mini","Skincare","",[["LIR-00446","",6500,null,1,1,"",1,"SKIN 1004 NIACINAMIDE 10% MINI",""]]],["P-0439","skin1004-centella-light-cleansing-oil-mini","SKIN1004","Centella Light Cleansing Oil Mini","Skincare","",[["LIR-00447","",6500,null,0,1,"",1,"SKIN 1004 CENTELLA LIGHT CLEANSING OIL MINI",""]]],["P-0440","skin1004-tea-trica-purifying-toner","SKIN1004","Tea Trica Purifying Toner","Skincare","",[["LIR-00448","",13900,null,1,1,"",1,"SKIN 1004 TEA TRICA PURIFYING TONER",""]]],["P-0441","skin1004-tea-trica-b5-cream","SKIN1004","Tea Trica B5 Cream","Skincare","",[["LIR-00449","",13500,null,0,1,"URNA 2",0,"SKIN 1004 TEA TRICA B5 CREAM","URNA 2 actualizado"]]],["P-0442","skin1004-watergel-sheet-ampoule-mask-individual","SKIN1004","Watergel Sheet Ampoule Mask Individual","Skincare","",[["LIR-00450","",2500,null,5,1,"URNA 1, URNA 2",0,"SKIN 1004 WATERGEL SHEET AMPOULE MASK INDIVIDUAL",""]]],["P-0443","skin1004-hyalu-cica-travel-kit","SKIN1004","Hyalu-cica Travel Kit","Skincare","",[["LIR-00451","",18900,null,1,1,"",0,"SKIN 1004 HYALU-CICA TRAVEL KIT",""]]],["P-0444","skin1004-hyalu-cica-water-fit-sun-serum-spf50","SKIN1004","Hyalu-cica Water-fit Sun Serum SPF50+","Skincare","Tamaño",[["LIR-00452","Estándar",14900,null,1,1,"URNA 2",0,"SKIN 1004 HYALU-CICA WATER-FIT SUN SERUM SPF50+",""],["LIR-00453","Grande",23000,null,1,1,"URNA 2",0,"SKIN 1004 HYALU-CICA WATER-FIT SUN SERUM SPF50+ GRANDE",""]]],["P-0445","skin1004-probio-cica-enrich-cream","SKIN1004","Probio Cica Enrich Cream","Skincare","",[["LIR-00454","",14900,null,1,1,"",0,"SKIN 1004 PROBIO CICA ENRICH CREAM",""]]],["P-0446","sol-de-janeiro-perfume-mist-discovery-trio","Sol de Janeiro","Perfume Mist Discovery Trio","Cuerpo","",[["LIR-00455","",21000,null,0,1,"",1,"SOL DE JANEIRO PERFUME MIST DISCOVERY TRIO",""]]],["P-0447","sol-de-janeiro-3-pack-morado-de-90-ml","Sol de Janeiro","3 Pack Morado de 90 ml","Cuerpo","",[["LIR-00456","",31000,null,0,1,"",0,"SOL DE JANEIRO 3 PACK MORADO DE 90 ML",""]]],["P-0448","sol-de-janeiro-3-pack-rosado-de-90-ml","Sol de Janeiro","3 Pack Rosado de 90 ml","Cuerpo","",[["LIR-00457","",31000,null,0,1,"",1,"SOL DE JANEIRO 3 PACK ROSADO DE 90 ML",""]]],["P-0449","sol-de-janeiro-3-pack-amarillo-de-90-ml","Sol de Janeiro","3 Pack Amarillo de 90 ml","Cuerpo","",[["LIR-00458","",31000,null,0,1,"",0,"SOL DE JANEIRO  3 PACK AMARILLO DE 90 ML",""]]],["P-0450","sol-de-janeiro-perfume-mist-set-4","Sol de Janeiro","Perfume Mist Set 4","Cuerpo","",[["LIR-00459","",28000,null,0,1,"",1,"SOL DE JANEIRO PERFUME MIST SET 4",""]]],["P-0451","sol-de-janeiro-perfume-mist-discover-set-5","Sol de Janeiro","Perfume Mist Discover Set 5","Cuerpo","",[["LIR-00460","",32000,null,0,1,"",1,"SOL DE JANEIRO PERFUME MIST DISCOVER SET 5",""]]],["P-0452","sol-de-janeiro-jet-set-3-pack","Sol de Janeiro","Jet Set 3 Pack","Cuerpo","",[["LIR-00461","",27000,null,0,1,"",1,"SOL DE JANEIRO JET SET 3 PACK",""]]],["P-0453","sol-de-janeiro-59-240-ml-solo","Sol de Janeiro","59 240 ml (solo)","Cuerpo","",[["LIR-00462","",27000,null,0,1,"",1,"SOL DE JANEIRO 59 240 ml (SOLO)",""]]],["P-0454","sol-de-janeiro-62-240-ml-solo-pistachio-and-salted-caramel","Sol de Janeiro","62 240 ml (solo) Pistachio & Salted Caramel","Cuerpo","",[["LIR-00463","",27000,null,1,1,"",1,"SOL DE JANEIRO 62 240 ml (SOLO) PISTACHIO & SALTED CARAMEL",""]]],["P-0455","sol-de-janeiro-71-240-ml-solo-caramelized-vanilla-and-macadamia","Sol de Janeiro","71 240 ml (solo) Caramelized Vanilla & Macadamia","Cuerpo","",[["LIR-00464","",27000,null,0,1,"",1,"SOL DE JANEIRO 71 240 ml (SOLO) CARAMELIZED VANILLA & MACADAMIA",""]]],["P-0456","sol-de-janeiro-68-240-ml-solo-brazilian-jasmine-and-pink-dragonfruit","Sol de Janeiro","68 240 ml (solo) Brazilian Jasmine & Pink Dragonfruit","Maquillaje","",[["LIR-00465","",27000,null,0,1,"",1,"SOL DE JANEIRO 68 240 ml (SOLO) BRAZILIAN JASMINE & PINK DRAGONFRUIT",""]]],["P-0457","sol-de-janeiro-40-240-ml-solo","Sol de Janeiro","40 240 ml (solo)","Cuerpo","",[["LIR-00466","",27000,null,0,1,"",1,"SOL DE JANEIRO 40 240 ml (SOLO)",""]]],["P-0458","sol-de-janeiro-sin-nombre-revisar","Sol de Janeiro","Sin nombre (revisar)","Cuerpo","Tamaño",[["LIR-00467","Mini",8000,null,0,1,"",0,"SOL DE JANEIRO MINI",""],["LIR-00468","Mediano · 90 ml",20900,null,2,1,"",0,"SOL DE JANEIRO  MEDIANOS  90 ML",""]]],["P-0459","sol-de-janeiro-nourishing-hair-oil","Sol de Janeiro","Nourishing Hair Oil","Cabello","",[["LIR-00469","",22900,null,0,1,"URNA 1",0,"SOL DE JANEIRO NOURISHING HAIR OIL",""]]],["P-0460","starface-pimple-patch","Starface","Pimple Patch","Skincare","",[["LIR-00470","",9900,null,0,1,"",0,"STARFACE PIMPLE PATCH",""]]],["P-0461","starface-pimple-patch-caja","Starface","Pimple Patch (caja)","Skincare","",[["LIR-00471","",14500,null,0,1,"",0,"STARFACE PIMPLE PATCH (CAJA)",""]]],["P-0462","sweet-beauty-spa-gel-gloves","Sweet Beauty","Spa Gel Gloves","Accesorios","",[["LIR-00472","",3500,null,1,1,"",0,"SWEET BEAUTY SPA GEL GLOVES",""]]],["P-0463","sweet-beauty-headband-marshmellow-puff","Sweet Beauty","Headband Marshmellow Puff","Accesorios","",[["LIR-00473","",4500,null,3,1,"",0,"SWEET BEAUTY HEADBAND MARSHMELLOW PUFF",""]]],["P-0464","sweet-beauty-beauty-tools","Sweet Beauty","Beauty Tools","Accesorios","",[["LIR-00474","",4000,null,1,1,"",0,"SWEET BEAUTY BEAUTY TOOLS",""]]],["P-0465","tatcha-the-brightening-serum","Tatcha","The Brightening Serum","Skincare","",[["LIR-00475","",40000,null,1,1,"URNA 2",0,"TATCHA THE BRIGHTENING SERUM",""]]],["P-0466","tarte-voluptuous-mascara","Tarte","Voluptuous Mascara","Maquillaje","",[["LIR-00476","",6900,null,1,1,"URNA 1",0,"TARTE VOLUPTUOUS MASCARA",""]]],["P-0467","too-faced-better-than-sex-mascara","Too Faced","Better Than Sex Mascara","Maquillaje","",[["LIR-00477","",17900,null,1,1,"URNA 1",0,"TOO FACED BETTER THAN SEX MASCARA",""]]],["P-0468","too-faced-brown-mascara","Too Faced","Brown Mascara","Maquillaje","",[["LIR-00478","",17900,null,0,1,"",0,"TOO FACED BROWN MASCARA",""]]],["P-0469","too-faced-ultra-slim-brow-pencil","Too Faced","Ultra Slim Brow Pencil","Maquillaje","",[["LIR-00479","",21900,null,1,1,"URNA 3",1,"TOO FACED ULTRA SLIM BROW PENCIL",""]]],["P-0470","too-faced-kissing-jelly-gloss","Too Faced","Kissing Jelly Gloss","Maquillaje","",[["LIR-00480","",12900,null,1,1,"URNA 2",0,"TOO FACED KISSING JELLY GLOSS",""]]],["P-0471","too-faced-pillow-balm-dream-duo-lip","Too Faced","Pillow Balm Dream Duo Lip","Maquillaje","",[["LIR-00481","",21900,null,0,1,"",1,"TOO FACED PILLOW BALM DREAM DUO LIP",""]]],["P-0472","too-faced-life-s-a-fairytale-eyeshadow","Too Faced","Life´s A Fairytale Eyeshadow","Maquillaje","",[["LIR-00482","",16900,null,2,1,"URNA 2",0,"TOO FACED LIFE´S A FAIRYTALE EYESHADOW",""]]],["P-0473","too-faced-fragrance-mist-fairy-bomb","Too Faced","Fragrance Mist Fairy Bomb","Cuerpo","",[["LIR-00483","",15500,null,0,1,"URNA 3",1,"TOO FACED FRAGRANCE MIST FAIRY BOMB",""]]],["P-0474","truly-smooth-legend-body-lotion","Truly","Smooth Legend Body Lotion","Cuerpo","",[["LIR-00484","",15800,null,0,1,"",0,"TRULY SMOOTH LEGEND BODY LOTION",""]]],["P-0475","truly-smooth-legend-after-shave-serum","Truly","Smooth Legend After Shave Serum","Cuerpo","",[["LIR-00485","",30900,null,0,1,"",0,"TRULY SMOOTH LEGEND AFTER SHAVE SERUM",""]]],["P-0476","truly-glazed-donut-after-shave-oil","Truly","Glazed Donut After Shave Oil","Cuerpo","",[["LIR-00486","",30900,null,1,1,"URNA 3",0,"TRULY GLAZED DONUT AFTER SHAVE OIL",""]]],["P-0477","truly-soft-serve-after-shave-oil","Truly","Soft Serve After Shave Oil","Cuerpo","Tamaño",[["LIR-00487","20 ml",15000,null,0,1,"",0,"TRULY SOFT SERVE AFTER SHAVE OIL 20 ml",""],["LIR-00488","60 ml",23000,null,0,1,"",1,"TRULY SOFT SERVE AFTER SHAVE OIL 60 ml",""],["LIR-00489","90 ml",30900,null,0,1,"",0,"TRULY SOFT SERVE AFTER SHAVE OIL 90 ml",""]]],["P-0478","truly-golden-glaze-luxury-body-oil-90-ml","Truly","Golden Glaze Luxury Body Oil 90 ml","Cuerpo","",[["LIR-00490","",25000,30900,4,1,"URNA 1",0,"TRULY GOLDEN GLAZE LUXURY BODY OIL 90 ml",""]]],["P-0479","truly-the-clearing-body-serum","Truly","The Clearing Body Serum","Cuerpo","",[["LIR-00491","",18000,null,1,1,"",1,"TRULY THE CLEARING BODY SERUM",""]]],["P-0480","truly-cbd-jelly-anti-blemish-body-cleanser-240-ml","Truly","CBD Jelly Anti - Blemish Body Cleanser 240 ml","Cuerpo","",[["LIR-00492","",15000,18900,1,1,"URNA 5",1,"TRULY CBD JELLY ANTI - BLEMISH BODY CLEANSER 240 ml",""]]],["P-0481","truly-unicorn-fruit-after-shave-serum","Truly","Unicorn Fruit After Shave Serum","Cuerpo","",[["LIR-00493","",30900,null,0,1,"",1,"TRULY UNICORN FRUIT AFTER SHAVE SERUM",""]]],["P-0482","truly-glass-skin-after-shave-oil","Truly","Glass Skin After Shave Oil","Cuerpo","",[["LIR-00494","",30900,null,0,1,"",1,"TRULY GLASS SKIN AFTER SHAVE OIL",""]]],["P-0483","truly-pre-shave-scrub","Truly","Pre Shave Scrub","Cuerpo","",[["LIR-00495","",22900,null,1,1,"URNA 3",1,"TRULY PRE SHAVE SCRUB",""]]],["P-0484","truly-glazed-donut-after-shave-glow-cream","Truly","Glazed Donut After Shave Glow Cream","Cuerpo","",[["LIR-00496","",22900,null,1,1,"URNA 3",1,"TRULY GLAZED DONUT AFTER SHAVE GLOW CREAM",""]]],["P-0485","truly-buns-of-glowry-body-serum","Truly","Buns Of Glowry Body Serum","Cuerpo","",[["LIR-00497","",30900,null,0,1,"",1,"TRULY BUNS OF GLOWRY BODY SERUM",""]]],["P-0486","truly-hydrating-lip-gloss","Truly","Hydrating Lip Gloss","Maquillaje","",[["LIR-00498","",10500,null,1,1,"URNA 2",0,"TRULY HYDRATING LIP GLOSS",""]]],["P-0487","truly-jelly-booster","Truly","Jelly Booster","Cuerpo","",[["LIR-00499","",30900,null,1,1,"URNA 3",0,"TRULY JELLY BOOSTER",""]]],["P-0488","tirtir-sos-serum-refreshing-skin","TIRTIR","SOS Serum Refreshing Skin","Skincare","",[["LIR-00500","",16800,null,0,1,"",1,"TIRTIR SOS SERUM REFRESHING SKIN",""]]],["P-0489","tirtir-mask-fit-red-cushion-rojo","TIRTIR","Mask Fit Red Cushion Rojo","Maquillaje","Tamaño",[["LIR-00501","Grande",15500,null,4,1,"URNA 2",0,"TIRTIR MASK FIT RED CUSHION ROJO GRANDE",""],["LIR-00502","Mini",9500,null,1,1,"URNA 2",0,"TIRTIR MASK FIT RED CUSHION ROJO MINI",""]]],["P-0490","tirtir-hydro-uv-shield-sunscreen","TIRTIR","Hydro UV Shield Sunscreen","Skincare","",[["LIR-00503","",16000,null,1,1,"URNA 2",0,"TIRTIR HYDRO UV SHIELD SUNSCREEN",""]]],["P-0491","tirtir-mask-fit-aura-cushion-caja-gris","TIRTIR","Mask Fit Aura Cushion Caja Gris","Maquillaje","",[["LIR-00504","",15500,null,1,1,"",0,"TIRTIR MASK FIT AURA CUSHION  CAJA GRIS",""]]],["P-0492","tirtir-setting-spray-mask-fit-make-up-fixer","TIRTIR","Setting Spray Mask Fit Make Up Fixer","Maquillaje","",[["LIR-00505","",12900,null,0,1,"",0,"TIRTIR SETTING SPRAY MASK FIT MAKE UP FIXER",""]]],["P-0493","tirtir-concealer","TIRTIR","Concealer","Maquillaje","",[["LIR-00506","",11900,null,12,1,"",0,"TIRTIR CONCEALER / TIRTIR CONCEALER SIN CAJA",""]]],["P-0494","tirtir-mask-fit-waterproof-setting-spray","TIRTIR","Mask Fit Waterproof Setting Spray","Maquillaje","",[["LIR-00507","",13900,null,2,1,"URNA 2",0,"TIRTIR MASK FIT WATERPROOF SETTING SPRAY",""]]],["P-0495","tirtir-mood-glider-lip-and-blush-stick","TIRTIR","Mood Glider Lip & Blush Stick","Maquillaje","",[["LIR-00508","",12900,null,3,1,"URNA 2",0,"TIRTIR MOOD GLIDER LIP & BLUSH STICK",""]]],["P-0496","tirtir-mask-fit-ai-filter-cushion-naranja","TIRTIR","Mask Fit AI Filter Cushion Naranja","Maquillaje","",[["LIR-00509","",15500,null,3,1,"URNA 2",0,"TIRTIR MASK FIT AI FILTER CUSHION SIN CAJA  NARANJKA / TIRTIR MASK FIT AI FILTER CUSHION CON CAJA  NARANJA",""]]],["P-0497","tirtir-mask-fit-red-foundation","TIRTIR","Mask Fit Red Foundation","Maquillaje","",[["LIR-00510","",17000,null,4,1,"URNA 2",0,"TIRTIR MASK FIT RED FOUNDATION / TIRTIR MASK FIT RED FOUNDATION SIN CAJA",""]]],["P-0498","the-ordinary-glycolic-acid-toner-240-ml","The Ordinary","Glycolic Acid Toner 240 ml","Skincare","",[["LIR-00511","",15000,null,4,1,"",0,"THE ORDINARY GLYCOLIC ACID TONER 240 ML",""]]],["P-0499","the-ordinary-niacinamide-10-zinc-1","The Ordinary","Niacinamide 10% + Zinc 1%","Skincare","",[["LIR-00512","",9500,null,0,1,"",0,"THE ORDINARY NIACINAMIDE 10% + ZINC 1%",""]]],["P-0500","the-ordinary-hyaluronic-acid-2-b5","The Ordinary","Hyaluronic Acid 2% + B5","Skincare","",[["LIR-00513","",11900,null,2,1,"",1,"THE ORDINARY HYALURONIC ACID 2% + B5",""]]],["P-0501","the-ordinary-multi-peptide-lash-and-brow-serum","The Ordinary","Multi - Peptide Lash And Brow Serum","Skincare","",[["LIR-00514","",10000,null,0,1,"",0,"THE ORDINARY MULTI - PEPTIDE LASH AND BROW SERUM",""]]],["P-0502","the-ordinary-salicylic-acid","The Ordinary","Salicylic Acid","Skincare","",[["LIR-00515","",9500,null,1,1,"",0,"THE ORDINORY SALICYLIC ACID",""]]],["P-0503","the-ordinary-caffeine-solutions-5-30-ml","The Ordinary","Caffeine Solutions 5 % 30 ml","Skincare","",[["LIR-00516","",10900,null,1,1,"",0,"THE ORDINARY CAFFEINE SOLUTIONS 5 % 30 ML",""]]],["P-0504","the-body-shop-kit","The Body Shop","Kit","Cuerpo","",[["LIR-00517","",29900,null,0,1,"URNA 1",0,"THE BODY SHOP KIT",""]]],["P-0505","tocobo-bloqueador-spf-50-azul","Tocobo","Bloqueador SPF 50+ Azul","Skincare","",[["LIR-00518","",11000,null,0,1,"",0,"TOCOBO BLOQUEADOR SPF 50+ AZUL","revisar"]]],["P-0506","tocobo-bio-peptide-coconut-milk-extract-hair","Tocobo","Bio Peptide Coconut Milk Extract Hair","Cabello","",[["LIR-00519","",9900,null,2,1,"URNA 1",0,"TOCOBO BIO PEPTIDE COCONUT MILK EXTRACT HAIR",""]]],["P-0507","tocobo-cica-cooling-sun-stick-spf-50","Tocobo","Cica Cooling Sun Stick SPF 50+","Skincare","",[["LIR-00520","",11000,null,0,1,"URNA 2",0,"TOCOBO CICA COOLING SUN STICK SPF 50+",""]]],["P-0508","uro-intimate-deodorant","Uro","Intimate Deodorant","Cuerpo","",[["LIR-00521","",16500,null,1,1,"",0,"URO INTIMATE DEODORANT",""]]],["P-0509","uro-vaginal-probiotic-capsules","Uro","Vaginal Probiotic Capsules","Cuerpo","",[["LIR-00522","",23000,null,1,1,"",1,"URO VAGINAL PROBIOTIC CAPSULES",""]]],["P-0510","ushas-velvet-lipstick","Ushas","Velvet Lipstick","Maquillaje","",[["LIR-00523","",3500,null,12,1,"",1,"USHAS VELVET LIPSTICK",""]]],["P-0511","victoria-s-secret-bare-vainilla","Victoria's Secret","Bare Vainilla","Cuerpo","",[["LIR-00524","",6500,null,0,1,"",0,"VICTORIA`S SECRET BARE VAINILLA",""]]],["P-0512","wet-n-wild-foundation","wet n wild","Foundation","Maquillaje","",[["LIR-00525","",7900,null,1,1,"",1,"WET N WILD FOUNDATION",""]]],["P-0513","wet-n-wild-powder","wet n wild","Powder","Maquillaje","",[["LIR-00526","",8900,null,1,1,"",1,"WET N WILD POWDER",""]]],["P-0514","ymxercos-colored-breakout-patches","Ymxercos","Colored - Breakout Patches","Skincare","",[["LIR-00527","",5500,null,4,1,"URNA 1",0,"YMXERCOS COLORED - BREAKOUT PATCHES",""]]],["P-0515","ymxercos-acne-patches-neon","Ymxercos","Acne Patches (neon)","Skincare","",[["LIR-00528","",7000,null,1,1,"",0,"YMXERCOS ACNE PATCHES (NEON)",""]]],["P-0516","ymxercos-acne-and-spot-patches","Ymxercos","Acne And Spot Patches","Skincare","",[["LIR-00529","",3000,null,0,1,"",0,"YMXERCOS ACNE AND SPOT PATCHES",""]]],["P-0517","generico-makeup-brush-set","Genérico","Makeup Brush Set","Accesorios","",[["LIR-00530","",4000,null,2,1,"",0,"MAKEUP BRUSH SET",""]]],["P-0518","generico-power-puff-morado","Genérico","Power Puff Morado","Accesorios","",[["LIR-00531","",3750,null,2,1,"",0,"POWER OUFF  MORADO",""]]]],"review":[["oferta",4,"ARENCIA PDRN HYALURONIC DEEP HYDRATION PAD","\"Precio oferta\" = 11 (no parece precio)."],["nombre",9,"ANASTASIA CRYTAL LIP GLOSS","Corrección automática: CRYTAL→CRYSTAL."],["nombre",14,"ANUA RICE 70 MOISTURING MILK","Corrección automática: MOISTURING→MOISTURIZING."],["nombre",20,"ANUA HEARTLEAF PORE CONTROL CLEASING OIL","Corrección automática: CLEASING→CLEANSING."],["nombre",33,"ANUA HEARTLEAF BHA QUERCETINOLFOAM CLEASING","Corrección automática: CLEASING→CLEANSING, QUERCETINOLFOAM→QUERCETINOL FOAM."],["nombre",39,"ASUSTRALAIAN GOLD  HOT","Corrección automática: ASUSTRALAIAN→AUSTRALIAN."],["nombre",45,"BEILING ME GOLDEN  PEEL OFF MASL 98.4","Corrección automática: MASL→MASK."],["nombre",48,"BEAU VISAGE KIT GIRLY BASIC HAIR ACCESORIES","Corrección automática: ACCESORIES→ACCESSORIES."],["nombre",74,"BEAUTY CREATIONS PINK HALO HANDS SANITAZER","Corrección automática: SANITAZER→SANITIZER."],["nombre",81,"CELIMAX PORE + DARK SPOT SUNSCREAM","Corrección automática: SUNSCREAM→SUNSCREEN."],["nombre",92,"CHARLOTTE TILBURY SETTING SPRY GRANDE","Corrección automática: SPRY→SPRAY."],["nombre",118,"COSRX ADVANCED SANIL EYE PATCH","Corrección automática: SANIL→SNAIL."],["precio",126,"D ALBA CREAM","Sin precio en el Sheet."],["nombre",133,"DR ALTHEA 345 REFLIEF CREAM MIST 60 ml","Corrección automática: REFLIEF→RELIEF."],["oferta",134,"DR ALTHEA 345 RELIEF CREAM MIST 100 ml","\"Precio oferta\" = 12 (no parece precio)."],["nombre",153,"DR. MELAXIN EXFOLIATING KOJIC ACID TUMERIC SPRAY","Corrección automática: TUMERIC→TURMERIC."],["nota",158,"ELF CLEAR BROW & LASH MASCARA DUO","Nota del Sheet: \"FALTA 1\". Confirmar existencia en el conteo."],["nota",161,"ELF HYDRATING CAMO CONCEALER","Nota del Sheet: \"INV · FALTA 1\". Confirmar existencia en el conteo."],["nombre",166,"ELF POWE GRIP MATTE PRIMER","Corrección automática: POWE →POWER ."],["oferta",168,"ELF ULTRA PRECISE BROW PENCIL","Oferta: ₡8500 (antes ₡9000). Confirmar cuál es el precio vigente."],["oferta",172,"ELF MATTE FUSION PRESSED POWDER","Oferta: ₡9000 (antes ₡10000). Confirmar cuál es el precio vigente."],["nombre",186,"ELF HALO GLOW BLUSH BEUTY WAND","Corrección automática: BEUTY→BEAUTY."],["nombre",189,"ELF  O FACE SATIN LIPSTCK","Corrección automática: LIPSTCK→LIPSTICK."],["nombre",191,"ELFINBAY BATH BOBMS","Corrección automática: BOBMS→BOMBS."],["nota",197,"ELROEL BLANC COVER CREAM STICK","Nota del Sheet: \"INV · NO REBAJADO DEL 9\". Confirmar existencia en el conteo."],["nombre",214,"GLAMP UP NASCARIILAS INDIVIDUALES","Corrección automática: NASCARIILAS→MASCARILLAS."],["fila-sin-nombre",223,null,"Fila sin nombre con datos: 9"],["nombre",232,"HARUHARU BLACK RICE CLEASING GEL","Corrección automática: CLEASING→CLEANSING."],["nombre",236,"HOURGLASS PHANTOM VOLUMINIZING GLOSSY BALM","Corrección automática: VOLUMINIZING→VOLUMIZING."],["nombre",267,"JOSEON DAILY TINTED FUID SUNSCREEN 40+","Corrección automática: FUID→FLUID."],["nombre",274,"KAHI WRINKLE BOUNCEMULTI BALM","Corrección automática: BOUNCEMULTI→BOUNCE MULTI."],["marca",313,"MAKEUP BRUSH SET FASHION BEUTY","Marca no reconocida; se asumió \"Genérico\"."],["nombre",313,"MAKEUP BRUSH SET FASHION BEUTY","Corrección automática: BEUTY→BEAUTY."],["nombre",332,"MIXSOON SPOT CLEANCARE PATCH","Corrección automática: CLEANCARE→CLEAN CARE."],["nombre",334,"MIXSOON BEAN CLEASING OIL","Corrección automática: CLEASING→CLEANSING."],["oferta",338,"MIXSOON 04 GALACTOMYCES FERMENT ESSENCE","Oferta: ₡10000 (antes ₡12900). Confirmar cuál es el precio vigente."],["oferta",339,"MIXSOON 02 BIFIDA TONER","Oferta: ₡9000 (antes ₡12500). Confirmar cuál es el precio vigente."],["oferta",340,"MIXSOON 03 BIFIDA FERMENT ESSENCE","Oferta: ₡7000 (antes ₡8900). Confirmar cuál es el precio vigente."],["nombre",358,"MEDICUBE HYPOCHLORUS ACID DAILY FACIAL SPRAY","Corrección automática: HYPOCHLORUS→HYPOCHLOROUS."],["nombre",370,"MEDICUBE GLUTATHINE GLOW SERUM","Corrección automática: GLUTATHINE→GLUTATHIONE."],["nombre",371,"MEDICUBE FFTING PETIDE 20 000","Corrección automática: PETIDE→PEPTIDE."],["nombre",373,"MEDICUBE KOJIC ACID TUMERIC NIANINAMIDE SERUM","Corrección automática: NIANINAMIDE→NIACINAMIDE, TUMERIC→TURMERIC."],["nombre",374,"MEDICUBE KOJIC ACID TUMERIC NIGHT WRAPPING MASK","Corrección automática: TUMERIC→TURMERIC."],["nombre",376,"MEDICUBE KOJIC ACID TUMERIC RESURFACING TONER","Corrección automática: TUMERIC→TURMERIC."],["oferta",376,"MEDICUBE KOJIC ACID TUMERIC RESURFACING TONER","Oferta: ₡15000 (antes ₡17900). Confirmar cuál es el precio vigente."],["nombre",377,"MEDICUBE KOJIC ACID TUMERIC VITA CAPSULE CREAM","Corrección automática: TUMERIC→TURMERIC."],["nota",447,"NYX THIS IS JUICE GLOSS","Nota del Sheet: \"2 · URNA 2 · NO FUE REBAJADO DIA 9\". Confirmar existencia en el conteo."],["nota",450,"NYX FILL & FLUFF CEJAS","Nota del Sheet: \"INV · ???? · NO FUE REBAJADO DIA 8\". Confirmar existencia en el conteo."],["nombre",465,"OLAPLEX BLONDE ENHACER SHAMPOO 4 MORADO","Corrección automática: ENHACER→ENHANCER."],["precio",469,"OLAPLEX BOND SMOOTHER 6","Sin precio en el Sheet."],["nombre",481,"RARE BEUTY POSITIVE LIGHT SILKY TOUCH HIGHLIGTER","Corrección automática: BEUTY→BEAUTY, HIGHLIGTER→HIGHLIGHTER."],["nombre",484,"RARE BEUTY POSITIVE LIGHT LUMINIZING LIP GLOSS","Corrección automática: BEUTY→BEAUTY."],["nombre",489,"RARE BEUTY KIT BLUSH  ENLUMINER","Corrección automática: BEUTY→BEAUTY."],["nombre",491,"RARE BEAUTY PERFECT STROKES UNIVERSAL VOLUMINIZING MASCARA","Corrección automática: VOLUMINIZING→VOLUMIZING."],["marca",494,"REVIVING EYE MASK","Marca no reconocida; se asumió \"Genérico\"."],["con-sin-caja",502,"RHODE PEPTIDE LIP TINT SIN CAJA / RHODE PEPTIDE LIP TINT CON CAJA","Se unificaron (todo se vende con caja). Precios distintos: ₡9.000 (sin caja) vs ₡15.000 (con caja). Se usó el de con caja."],["marca",509,"RUBY FACE","Marca no reconocida; se asumió \"Genérico\"."],["nombre",517,"SEOUL 1988 CLEASING FOAM PINE CICA 1% + PROBIOTICS","Corrección automática: CLEASING→CLEANSING."],["nombre",518,"SEOUL 1988  CLEASING OIL","Corrección automática: CLEASING→CLEANSING."],["con-sin-caja",520,"SEOUL 1988 RETINAL LIPOSOME 2% + BLACK GINSENG SIN CAJA / SEOUL 1988 RETINAL LIPOSOME 2% + BLACK GINSENG CON CAJA","Se unificaron (todo se vende con caja). Precios distintos: ₡8.000 (sin caja) vs ₡10.900 (con caja). Se usó el de con caja."],["nombre",548,"SKIN 1004 SUNSCREAM  (DORADO)","Corrección automática: SUNSCREAM→SUNSCREEN."],["nombre",573,"SOL DE JANEIRO MINI / SOL DE JANEIRO  MEDIANOS  90 ML","El nombre solo indica el tamaño; falta el nombre del producto."],["oferta",602,"TRULY GOLDEN GLAZE LUXURY BODY OIL 90 ml","Oferta: ₡25000 (antes ₡30900). Confirmar cuál es el precio vigente."],["oferta",604,"TRULY CBD JELLY ANTI - BLEMISH BODY CLEANSER 240 ml","Oferta: ₡15000 (antes ₡18900). Confirmar cuál es el precio vigente."],["con-sin-caja",619,"TIRTIR CONCEALER / TIRTIR CONCEALER SIN CAJA","Se unificaron (todo se vende con caja). Precios distintos: ₡11.900 (con caja) vs ₡10.900 (sin caja). Se usó el de con caja."],["nombre",623,"TIRTIR MASK FIT AI FILTER CUSHION SIN CAJA  NARANJKA","Corrección automática: NARANJKA→NARANJA."],["con-sin-caja",624,"TIRTIR MASK FIT AI FILTER CUSHION SIN CAJA  NARANJKA / TIRTIR MASK FIT AI FILTER CUSHION CON CAJA  NARANJA","Se unificaron (todo se vende con caja). Precios distintos: ₡13.500 (sin caja) vs ₡15.500 (con caja). Se usó el de con caja."],["con-sin-caja",625,"TIRTIR MASK FIT RED FOUNDATION / TIRTIR MASK FIT RED FOUNDATION SIN CAJA","Se unificaron (todo se vende con caja). Precios distintos: ₡17.000 (con caja) vs ₡15.000 (sin caja). Se usó el de con caja."],["nombre",632,"THE ORDINORY SALICYLIC ACID","Corrección automática: ORDINORY→ORDINARY."],["nota",637,"TOCOBO BLOQUEADOR SPF 50+ AZUL","Nota del Sheet: \"revisar\". Confirmar existencia en el conteo."],["marca",656,"MAKEUP BRUSH SET","Marca no reconocida; se asumió \"Genérico\"."],["marca",657,"RUBY FACE","Marca no reconocida; se asumió \"Genérico\"."],["duplicado",657,"RUBY FACE","Producto repetido en el Sheet (Genérico · Ruby Face)."],["marca",658,"POWER OUFF  MORADO","Marca no reconocida; se asumió \"Genérico\"."],["nombre",658,"POWER OUFF  MORADO","Corrección automática: OUFF→PUFF."]]};
