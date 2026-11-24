import type { ExportRow, ImportRow } from '../api';

/**
 * Lee un archivo de inventario (.xlsx o .csv) y devuelve las filas para el backend.
 * Acepta el Sheet de siempre (A nombre · B precio final · C existencias · D urna · E precio oferta)
 * y el archivo que exporta la app (con columna SKU). Las columnas se reconocen por su encabezado.
 */
type Cell = string | number | boolean | Date | null | undefined;

function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const norm = (v: Cell): string => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export async function readInventoryFile(file: File): Promise<{ rows: ImportRow[]; sheet: string }> {
  let data: Cell[][], sheet = file.name;
  if (/\.csv$|\.txt$/i.test(file.name) || file.type === 'text/csv') {
    data = parseCsv((await file.text()).replace(/^﻿/, ''));
  } else if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const sheets = await readXlsxFile(file);
    const best = sheets.slice().sort((a, b) => b.data.length - a.data.length)[0]; // la pestaña con más filas es el inventario
    if (!best) throw new Error('El archivo no trae hojas con datos.');
    data = best.data as Cell[][];
    sheet = best.sheet;
  } else {
    throw new Error('Formato no reconocido. Subí un Excel (.xlsx) o un CSV. Desde Google Sheets: Archivo → Descargar → Microsoft Excel.');
  }

  // Encabezado: la primera fila (de las 10 primeras) que mencione precio, existencias o SKU.
  let headerAt = -1;
  for (let i = 0; i < Math.min(10, data.length); i++) {
    if (data[i].some((c) => /precio|existencia|^sku$/.test(norm(c)))) { headerAt = i; break; }
  }
  let col = { sku: -1, name: 0, price: 1, stock: 2, location: 3, offer: 4 };
  if (headerAt >= 0) {
    const h = data[headerAt].map(norm);
    const find = (re: RegExp) => h.findIndex((x) => re.test(x));
    const sku = find(/^sku$/);
    const name = find(/^(producto|nombre)/);
    const marca = find(/^marca$/);
    col = {
      sku,
      name: name >= 0 ? name : marca >= 0 ? marca : sku === 0 ? 1 : 0,
      price: find(/precio final|^precio$/),
      stock: find(/existencia|^stock$|cantidad/),
      location: find(/urna|ubicacion/),
      offer: find(/oferta/),
    };
    // En el Sheet de siempre la columna de la urna no tiene título: es la que sigue a "Existencias".
    if (col.location < 0 && col.stock >= 0 && (h[col.stock + 1] ?? '') === '') col.location = col.stock + 1;
    if (col.price < 0 || col.stock < 0) throw new Error('No encontramos las columnas "Precio final" y "Existencias" en el archivo.');
  }
  const h = headerAt >= 0 ? data[headerAt].map(norm) : [];
  const marca = h.findIndex((x) => x === 'marca'), variante = h.findIndex((x) => /^variante$/.test(x));
  const rows: ImportRow[] = [];
  for (let i = headerAt + 1; i < data.length; i++) {
    const r = data[i];
    if (!r) continue;
    const at = (c: number): Cell => (c >= 0 ? r[c] : '');
    let name = String(at(col.name) ?? '').trim();
    if (marca >= 0 && marca !== col.name) name = [String(at(marca) ?? '').trim(), name, variante >= 0 ? String(at(variante) ?? '').trim() : ''].filter(Boolean).join(' ');
    const sku = String(at(col.sku) ?? '').trim();
    if (!name && !sku) continue;
    if (name === 'ƒ') continue;
    rows.push({ line: i + 1, sku: sku || undefined, name, price: at(col.price) ?? '', stock: at(col.stock) ?? '', location: String(at(col.location) ?? ''), offer: at(col.offer) ?? '' });
  }
  if (!rows.length) throw new Error('El archivo no trae filas con productos.');
  return { rows, sheet };
}

/** Descarga el inventario como Excel, en el mismo formato que después se puede volver a subir. */
export async function downloadInventory(rows: ExportRow[], day: string): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const head = ['SKU', 'Marca', 'Producto', 'Variante', 'Categoría', 'Precio final', 'Precio oferta', 'Existencias', 'Urna', 'Código de barras', 'Estado'];
  const data = [
    head.map((value) => ({ value, fontWeight: 'bold' as const })),
    ...rows.map((r) => [r.sku, r.vendor, r.title, r.option, r.category, r.price, r.offer, r.stock, r.location, r.barcode, r.status].map((value) => ({ value: value === null || value === '' ? undefined : value }))),
  ];
  const blob = await writeExcelFile(data, { sheet: 'Inventario', columns: [{ width: 12 }, { width: 20 }, { width: 44 }, { width: 16 }, { width: 14 }, { width: 13 }, { width: 13 }, { width: 12 }, { width: 14 }, { width: 18 }, { width: 11 }] }).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lirien-inventario-${day}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
