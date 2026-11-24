/** Contrato con el backend (Apps Script) y cliente HTTP. */
export type Role = 'admin' | 'staff';
export type Category = 'Skincare' | 'Maquillaje' | 'Cabello' | 'Cuerpo' | 'Accesorios';
export type Method = 'sinpe' | 'tarjeta' | 'efectivo';
export type Channel = 'kiosko' | 'whatsapp' | 'instagram';
export type MovementType = 'SALE' | 'RECEIVE' | 'ADJUST' | 'COUNT' | 'RETURN' | 'WASTE' | 'TESTER' | 'VOID' | 'INITIAL';

export interface Variant {
  sku: string;
  optionValue: string | null;
  barcode: string | null;
  priceCrc: number;
  compareAtCrc: number | null;
  minStock: number;
  displayLocation: string;
  countedAt: string | null;
  active: boolean;
  note: string;
  stock: number;
}
export interface Product {
  id: string;
  handle: string;
  vendor: string;
  title: string;
  category: Category;
  description: string;
  status: 'active' | 'archived';
  optionName: string | null;
  variants: Variant[];
}
export interface Session { token: string; expiresAt: string; userId: string; name: string; role: Role }
export interface PublicUser { userId: string; name: string; role: Role; hasPin: boolean }
export interface AdminUser { userId: string; name: string; role: Role; active: boolean; hasPin: boolean; activationPending: boolean; activationExpires: string | null; pinSetAt: string | null }
export interface Activation { userId: string; name: string; activationCode: string; activationExpires: string }
export interface Payment { method: Method; amountCrc: number; tenderedCrc?: number | null }
export interface Sale {
  saleId: string; ts: string; user: string; channel: Channel; totalCrc: number;
  voided: { at: string; by: string; note: string } | null;
  lines: { sku: string; qty: number; unitPriceCrc: number }[];
  payments: { method: Method; amountCrc: number; tenderedCrc: number | null }[];
}
export interface Movement { id: string; ts: string; sku: string; type: MovementType; qty: number; unitPriceCrc: number | null; ref: string; user: string; note: string }
export interface VariantInput { sku?: string; optionValue: string; priceCrc: number; compareAtCrc: number | null; barcode: string; displayLocation: string; minStock: number; active: boolean; initialStock?: number }
export interface ProductInput { id?: string; vendor: string; title: string; category: Category; description: string; optionName: string; variants: VariantInput[] }
export interface ImportRow { line: number; sku?: string; name: string; price: unknown; stock: unknown; location?: unknown; offer?: unknown }
export interface ImportOptions { prices: boolean; stock: boolean; create: boolean }
export interface Change<T> { from: T; to: T }
export interface ImportPreview {
  summary: { rows: number; matched: number; unchanged: number; priceChanges: number; stockChanges: number; stockUnitsDelta: number; newItems: number; missing: number; missingWithStock: number; warnings: number };
  changes: { sku: string; name: string; price: Change<number> | null; compareAt: Change<number | null> | null; stock: Change<number> | null; location: Change<string> | null; counted: boolean }[];
  news: { line: number; legacy: string; vendor: string; title: string; category: Category; categoryGuessed: boolean; optionName: string; optionValue: string; price: number; compareAt: number | null; stock: number; location: string }[];
  missing: { sku: string; name: string; stock: number }[];
  warnings: { kind: string; line: number; legacy: string; message: string }[];
}
export interface ImportResult { summary: ImportPreview['summary']; applied: { variantsUpdated: number; productsCreated: number; variantsCreated: number; movements: number } }
export interface ExportRow { sku: string; vendor: string; title: string; option: string; category: string; price: number; offer: number | null; stock: number; location: string; barcode: string; status: string }

export class ApiError extends Error {
  code: string;
  details: unknown;
  constructor(code: string, message: string, details: unknown = null) { super(message); this.code = code; this.details = details; }
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || '';
export const apiConfigured = API_URL !== '';

const KEY = 'lirien.session';
let session: Session | null = null;
let onExpired: (message: string) => void = () => {};

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    session = s && Date.parse(s.expiresAt) > Date.now() ? s : null;
  } catch { session = null; }
  return session;
}
export function saveSession(s: Session | null): void {
  session = s;
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* modo privado: la sesión dura lo que dure la pestaña */ }
}
export function setExpiredHandler(fn: (message: string) => void): void { onExpired = fn; }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Llama a una acción. POST con text/plain (Apps Script no responde el preflight de CORS).
 * `retries`: solo para lecturas o escrituras con clientId (el backend no las duplica).
 */
export async function call<T>(action: string, body: Record<string, unknown> = {}, retries = 0): Promise<T> {
  if (!apiConfigured) throw new ApiError('CONFIG', 'Falta configurar la app (VITE_API_URL).');
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(900 * attempt);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: session?.token ?? '', ...body }), signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = (await res.json()) as { ok: boolean; data: T; error?: { code: string; message: string; details: unknown } };
      if (json.ok) return json.data;
      const err = new ApiError(json.error?.code ?? 'SERVER', json.error?.message ?? 'Algo falló. Probá de nuevo.', json.error?.details);
      if (err.code === 'AUTH' && session && !action.startsWith('auth.')) { saveSession(null); onExpired(err.message); }
      if (err.code !== 'BUSY') throw err;
      lastError = err;
    } catch (e) {
      if (e instanceof ApiError && e.code !== 'BUSY') throw e;
      lastError = e;
    } finally { clearTimeout(timer); }
  }
  if (lastError instanceof ApiError) throw lastError;
  throw new ApiError('NETWORK', navigator.onLine === false ? 'No hay conexión. Revisá la señal y probá de nuevo.' : 'No pudimos conectar con el sistema. Probá de nuevo.');
}

export const api = {
  publicUsers: () => call<{ users: PublicUser[]; version: string }>('users.public', {}, 2),
  login: (userId: string, pin: string) => call<Session>('auth.login', { userId, pin }),
  activate: (userId: string, code: string, pin: string) => call<Session>('auth.activate', { userId, code, pin }),
  logout: () => call<{ ok: boolean }>('auth.logout'),
  changePin: (currentPin: string, newPin: string) => call<Session>('auth.changePin', { currentPin, newPin }),
  catalog: () => call<{ products: Product[]; generatedAt: string; version: string }>('catalog', {}, 2),
  checkout: (lines: { sku: string; qty: number }[], payments: Payment[], channel: Channel, clientId: string) => call<{ saleId: string; totalCrc: number; duplicate: boolean }>('sale.checkout', { lines, payments, channel, clientId }, 2),
  sales: (from: string, to: string) => call<Sale[]>('sales', { from, to }, 1),
  voidSale: (saleId: string, note: string) => call<{ saleId: string }>('sale.void', { saleId, note }),
  movements: (sku?: string) => call<Movement[]>('movements', sku ? { sku, limit: 60 } : { limit: 200 }, 1),
  move: (sku: string, type: MovementType, qty: number, note: string, ref: string, clientId: string) => call<{ sku: string; stock: number }>('movement.create', { sku, type, qty, note, ref, clientId }, 2),
  saveProduct: (product: ProductInput) => call<{ id: string }>('product.upsert', { product }),
  archiveProduct: (id: string, archived: boolean) => call<{ id: string; status: string }>('product.archive', { id, archived }),
  linkBarcode: (sku: string, barcode: string) => call<{ sku: string; barcode: string }>('barcode.link', { sku, barcode }),
  users: () => call<AdminUser[]>('users.list', {}, 1),
  createUser: (name: string, role: Role) => call<Activation>('user.create', { name, role }),
  updateUser: (userId: string, patch: { role?: Role; active?: boolean; name?: string }) => call<{ ok: boolean }>('user.update', { userId, ...patch }),
  resetPin: (userId: string) => call<Activation>('user.resetPin', { userId }),
  importPreview: (rows: ImportRow[], options: ImportOptions) => call<ImportPreview>('import.preview', { rows, options }),
  importApply: (rows: ImportRow[], options: ImportOptions, clientId: string) => call<ImportResult>('import.apply', { rows, options, clientId }, 1),
  exportRows: () => call<{ rows: ExportRow[]; generatedAt: string }>('export', {}, 1),
};
