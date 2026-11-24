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
