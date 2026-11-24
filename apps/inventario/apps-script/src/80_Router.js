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
