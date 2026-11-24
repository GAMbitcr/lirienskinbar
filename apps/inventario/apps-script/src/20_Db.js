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
