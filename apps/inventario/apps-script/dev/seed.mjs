// Genera src/96_SeedData.js desde data/catalogo-2026-11-08.json (la migración recuperada del Sheet).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, '..', '..', '..', '..', 'data');
const catalog = JSON.parse(readFileSync(join(data, 'catalogo-2026-11-08.json'), 'utf8'));
const review = JSON.parse(readFileSync(join(data, 'revision-2026-11-08.json'), 'utf8'));

const products = catalog.map((p) => [
  p.id, p.handle, p.vendor, p.title, p.category, p.variants[0].optionName || '',
  p.variants.map((v) => [v.sku, v.optionValue || '', v.priceCrc, v.compareAtCrc, v.stock, v.minStock, v.displayLocation, v.counted ? 1 : 0, v.legacyName, v.note || '']),
]);
const out = `// GENERADO por dev/seed.mjs. No editar a mano.\nvar SEED_DATA = ${JSON.stringify({ date: '2026-11-08', products, review: review.map((r) => [r.kind, r.line, r.legacy, r.message]) })};\n`;
writeFileSync(join(here, '..', 'src', '96_SeedData.js'), out);
console.log(`96_SeedData.js · ${products.length} productos · ${(out.length / 1024).toFixed(0)} KB`);
