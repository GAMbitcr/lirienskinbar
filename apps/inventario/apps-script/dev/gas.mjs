// Arnés de Node: simula lo que el backend usa de Apps Script (hojas, candado, caché, propiedades)
// para correr las pruebas y la API local sin tocar Google. Imita cómo Sheets convierte los valores:
// en columnas con formato de texto ('@') todo queda como texto; en las demás, "123" pasa a número.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

class FakeSheet {
  constructor(name) { this.name = name; this.data = []; this.textCols = new Set(); this.frozen = 0; }
  getName() { return this.name; }
  getMaxRows() { return 1000; }
  getLastRow() { for (let r = this.data.length - 1; r >= 0; r--) if (this.data[r].some((c) => c !== '' && c !== null && c !== undefined)) return r + 1; return 0; }
  getLastColumn() { return this.data.reduce((m, row) => { for (let c = row.length - 1; c >= 0; c--) if (row[c] !== '') return Math.max(m, c + 1); return m; }, 0); }
  setFrozenRows(n) { this.frozen = n; }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  coerce(value, col) {
    if (value === undefined || value === null) return '';
    if (this.textCols.has(col)) return typeof value === 'string' ? value : String(value);
    if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
    if (value === 'TRUE' || value === 'true') return true;
    if (value === 'FALSE' || value === 'false') return false;
    return value;
  }
  getRange(row, col, nRows = 1, nCols = 1) {
    const sheet = this;
    if (row < 1 || col < 1 || nRows < 1 || nCols < 1) throw new Error(`Rango inválido (${row},${col},${nRows},${nCols})`);
    return {
      getValues() { const out = []; for (let r = 0; r < nRows; r++) { const src = sheet.data[row - 1 + r] || []; const line = []; for (let c = 0; c < nCols; c++) { const v = src[col - 1 + c]; line.push(v === undefined ? '' : v); } out.push(line); } return out; },
      setValues(values) {
        if (values.length !== nRows || values.some((v) => v.length !== nCols)) throw new Error(`setValues: el tamaño no coincide con el rango (${nRows}x${nCols})`);
        for (let r = 0; r < nRows; r++) { const target = (sheet.data[row - 1 + r] = sheet.data[row - 1 + r] || []); for (let c = 0; c < nCols; c++) { while (target.length < col - 1 + c) target.push(''); target[col - 1 + c] = sheet.coerce(values[r][c], col + c); } }
        return this;
      },
      clearContent() { for (let r = 0; r < nRows; r++) { const target = sheet.data[row - 1 + r]; if (target) for (let c = 0; c < nCols; c++) if (col - 1 + c < target.length) target[col - 1 + c] = ''; } return this; },
      setNumberFormat(fmt) { if (fmt === '@') for (let c = 0; c < nCols; c++) sheet.textCols.add(col + c); return this; },
      setFontWeight() { return this; },
    };
  }
}

class FakeSpreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) { const s = new FakeSheet(name); this.sheets.set(name, s); return s; }
  /** Para pruebas: filas de una hoja como objetos. */
  table(name) { const s = this.sheets.get(name); if (!s || !s.data.length) return []; const [h, ...rows] = s.data; return rows.filter((r) => r[0] !== '' && r[0] !== undefined).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]]))); }
}

/** Crea un entorno de Apps Script falso y carga el backend dentro. */
export function createBackend({ now = () => Date.now() } = {}) {
  const ss = new FakeSpreadsheet();
  const cache = new Map();
  const props = new Map();
  const ui = { alerts: [], answers: [], Button: { OK: 'OK', CANCEL: 'CANCEL', YES: 'YES', NO: 'NO' }, ButtonSet: { OK: 1, OK_CANCEL: 2, YES_NO: 3, YES_NO_CANCEL: 4 },
    alert(title, msg) { ui.alerts.push(msg === undefined ? title : msg); return ui.answers.length ? ui.answers.shift() : 'YES'; },
    prompt(title, msg) { ui.alerts.push(msg); const a = ui.answers.length ? ui.answers.shift() : ''; return { getSelectedButton: () => (a === null ? 'CANCEL' : 'OK'), getResponseText: () => a || '' }; },
    createMenu() { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => {} }; return m; } };
  const mails = [];
  const live = (k) => { const e = cache.get(k); if (!e) return null; if (e.exp <= now()) { cache.delete(k); return null; } return e.v; };
  const scriptCache = {
    get: (k) => live(k),
    put: (k, v, ttl = 600) => { if (String(v).length > 100000) throw new Error('Argument too large: value'); cache.set(k, { v: String(v), exp: now() + ttl * 1000 }); },
    remove: (k) => { cache.delete(k); },
    putAll: (obj, ttl = 600) => { for (const [k, v] of Object.entries(obj)) scriptCache.put(k, v, ttl); },
    getAll: (keys) => { const out = {}; for (const k of keys) { const v = live(k); if (v !== null) out[k] = v; } return out; },
    removeAll: (keys) => { for (const k of keys) cache.delete(k); },
  };
  const scriptProps = {
    getProperty: (k) => (props.has(k) ? props.get(k) : null),
    setProperty: (k, v) => { props.set(k, String(v)); },
    deleteProperty: (k) => { props.delete(k); },
    getProperties: () => Object.fromEntries(props),
  };
  class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(now()); } static now() { return now(); } }
  const sandbox = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, getUi: () => ui },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => scriptCache },
    PropertiesService: { getScriptProperties: () => scriptProps },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, text) => Array.from(createHash('sha256').update(String(text), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      getUuid: () => randomUUID(),
    },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (text) => ({ setMimeType() { return this; }, getContent: () => text }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => { const t = { timeBased: () => t, everyDays: () => t, atHour: () => t, create: () => t }; return t; } },
    MailApp: { sendEmail: (to, subject, body) => mails.push({ to, subject, body }) },
    Logger: { log() {} },
    Date: FakeDate, JSON, Math, Object, String, Number, Array, RegExp, Error, parseInt, parseFloat, isNaN, isFinite, console,
  };
  const context = vm.createContext(sandbox);
  const files = readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
  for (const f of files) vm.runInContext(readFileSync(join(SRC, f), 'utf8'), context, { filename: f });
  // Las declaraciones `var`/`function` de cada archivo quedan como globales del contexto, igual que en Apps Script.
  const call = (body) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  return { context, ss, ui, mails, cache, props, call, raw: (text) => context.doPost({ postData: { contents: text } }).getContent() };
}
