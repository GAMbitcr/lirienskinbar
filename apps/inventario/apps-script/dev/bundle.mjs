// Une apps-script/src/*.js en un solo archivo para pegarlo en el editor de Apps Script.
// Salida: dist/Lirien.gs · El manifiesto está en src/appsscript.json.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(root, 'src')).filter((f) => f.endsWith('.js')).sort();
const version = /VERSION: '([^']+)'/.exec(readFileSync(join(root, 'src', '00_Config.js'), 'utf8'))[1];
const parts = files.map((f) => `// ===== ${f} =====\n${readFileSync(join(root, 'src', f), 'utf8').trim()}\n`);
const out = `// Lirien Inventario · backend v${version} · generado desde apps-script/src (no editar acá: editar src/ y volver a generar)\n\n${parts.join('\n')}`;
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'Lirien.gs'), out);
console.log(`dist/Lirien.gs · ${files.length} archivos · ${(out.length / 1024).toFixed(0)} KB · v${version}`);
