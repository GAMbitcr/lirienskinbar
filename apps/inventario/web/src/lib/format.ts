import type { Category, Channel, Method, MovementType, Product, Variant } from '../api';

/** ₡12.900 (símbolo de colón, punto de miles, sin decimales). `Intl` con es-CR pone un espacio, por eso es propio. */
export const crc = (n: number): string => (n < 0 ? '−' : '') + '₡' + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const uuid = (): string => (crypto.randomUUID ? crypto.randomUUID() : 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

/** Fecha de hoy en Costa Rica (UTC-6), YYYY-MM-DD. */
export const dayCR = (offsetDays = 0): string => new Date(Date.now() - 6 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
/** "24 nov · 2:32 p. m." a partir de un ISO con offset -06:00 (se lee tal cual, sin depender de la zona del dispositivo). */
export function when(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const h = Number(m[4]);
  const time = `${h % 12 === 0 ? 12 : h % 12}:${m[5]} ${h < 12 ? 'a. m.' : 'p. m.'}`;
  return iso.slice(0, 10) === dayCR() ? `Hoy · ${time}` : `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} · ${time}`;
}

export const METHODS: Record<Method, string> = { sinpe: 'SINPE Móvil', tarjeta: 'Tarjeta', efectivo: 'Efectivo' };
export const CHANNELS: Record<Channel, string> = { kiosko: 'Kiosko', whatsapp: 'WhatsApp', instagram: 'Instagram' };
export const CATEGORIES: Category[] = ['Skincare', 'Maquillaje', 'Cabello', 'Cuerpo', 'Accesorios'];
export const LOCATIONS = ['URNA 1', 'URNA 2', 'URNA 3', 'URNA 4', 'URNA 5', 'URNA 6'];
export const MOVES: Record<MovementType, { label: string; tone: 'sale' | 'in' | 'adj' | 'void' }> = {
  SALE: { label: 'Venta', tone: 'sale' }, RECEIVE: { label: 'Entrada', tone: 'in' }, ADJUST: { label: 'Corrección', tone: 'adj' }, COUNT: { label: 'Conteo', tone: 'adj' },
  RETURN: { label: 'Devolución', tone: 'in' }, WASTE: { label: 'Merma', tone: 'adj' }, TESTER: { label: 'Tester', tone: 'adj' }, VOID: { label: 'Anulación', tone: 'void' }, INITIAL: { label: 'Inicial', tone: 'adj' },
};

export type StockStatus = 'ok' | 'low' | 'out';
export const variantStatus = (v: Variant): StockStatus => (v.stock <= 0 ? 'out' : v.stock <= v.minStock ? 'low' : 'ok');
export const liveVariants = (p: Product): Variant[] => p.variants.filter((v) => v.active);
export const productStock = (p: Product): number => liveVariants(p).reduce((n, v) => n + v.stock, 0);
export function productStatus(p: Product): StockStatus {
  const s = liveVariants(p).map(variantStatus);
  if (!s.length || s.every((x) => x === 'out')) return 'out';
  return s.some((x) => x !== 'ok') ? 'low' : 'ok';
}
export const STATUS_LABEL: Record<StockStatus, string> = { ok: 'En stock', low: 'Últimas unidades', out: 'Agotado' };
export const variantName = (p: Product, v: Variant): string => `${p.vendor} ${p.title}${v.optionValue && p.variants.length > 1 ? ' · ' + v.optionValue : ''}`;

/** Normaliza para buscar: sin tildes ni mayúsculas. */
export const fold = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const initials = (name: string): string => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
