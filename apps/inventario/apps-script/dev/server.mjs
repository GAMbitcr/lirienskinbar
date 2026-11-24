// API local que imita la URL /exec de Apps Script, con el backend real corriendo sobre hojas en memoria.
//   node dev/server.mjs [--port 8787] [--delay 300] [--empty]
// Carga el catálogo base y crea dos personas de prueba (PIN 246813): Karol (admin) y Fiorella (colaboradora).
// Los datos viven en memoria: se pierden al cerrar. Nunca toca Google.
import http from 'node:http';
import { createBackend } from './gas.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : fallback; };
const port = Number(arg('port', 8787));
const delay = Number(arg('delay', 250));
const be = createBackend();
const { context } = be;
context.Db.setup();
if (!process.argv.includes('--empty')) {
  context.Seed.load();
  for (const [name, role] of [['Karol', 'admin'], ['Fiorella', 'staff']]) {
    const u = context.Auth.createUser({ name, role }, null);
    be.call({ action: 'auth.activate', userId: u.userId, code: u.activationCode, pin: '246813' });
  }
  const pending = context.Auth.createUser({ name: 'Neisy', role: 'admin' }, null);
  console.log(`Personas de prueba: Karol (admin) y Fiorella (colaboradora), PIN 246813.\nNeisy está pendiente de activar con el código ${pending.activationCode}.`);
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => setTimeout(() => {
    const out = req.method === 'POST' ? be.raw(body) : context.doGet().getContent();
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(out);
  }, delay));
}).listen(port, () => console.log(`API local lista en http://localhost:${port}/exec (demora simulada: ${delay} ms)`));
