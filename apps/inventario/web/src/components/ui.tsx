import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import verticalLogo from '../../../../../brand/logo/lirien-vertical-currentcolor.svg?raw';
import isotipo from '../../../../../brand/logo/lirien-isotipo-currentcolor.svg?raw';
import type { Category } from '../api';
import { STATUS_LABEL, type StockStatus } from '../lib/format';

/** Logo original vectorizado (hereda `color`). No se redibuja ni se deforma. */
export const Logo = ({ variant = 'isotipo', class: cls = '' }: { variant?: 'vertical' | 'isotipo'; class?: string }) => (
  <span class={`logo logo--${variant} ${cls}`} role="img" aria-label="Lirien Skin Bar" dangerouslySetInnerHTML={{ __html: variant === 'vertical' ? verticalLogo : isotipo }} />
);

/** Lirio de tres pétalos: la viñeta y el detalle decorativo de Lirien (el mismo del mockup del sitio). */
export const Lily = ({ size = 16, tone = 'vino', class: cls = '' }: { size?: number; tone?: 'vino' | 'arena' | 'polen' | 'lirio'; class?: string }) => (
  <svg class={`lily lily--${tone} ${cls}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path class="lily__mid" d="M12 2C15 7 15 13 12 18C9 13 9 7 12 2Z" />
    <path class="lily__side" d="M12 18C7 16 4 12 4 7C8 8 11 12 12 18Z" />
    <path class="lily__side" d="M12 18C17 16 20 12 20 7C16 8 13 12 12 18Z" />
  </svg>
);

const ICONS: Record<string, string> = {
  box: 'M4 8l8-4 8 4v8l-8 4-8-4V8zM4 8l8 4 8-4M12 12v8',
  scan: 'M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M17 9v6',
  bag: 'M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 016 0v2',
  bell: 'M6 16V11a6 6 0 0112 0v5l2 2H4l2-2zM10 20a2 2 0 004 0',
  clock: 'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  check: 'M5 12l5 5 9-10',
  edit: 'M4 20h4l10-10-4-4L4 16v4zM13 7l4 4',
  user: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  users: 'M9 5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM2 20c1-3.5 3.6-5 7-5s6 1.5 7 5M16 5.5a3 3 0 010 6M18 15c2 .6 3.4 2 4 4.5',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  key: 'M14 7a4 4 0 11-3.5 6L4 19.5V21h3v-2h2v-2h2l1.3-1.3A4 4 0 0114 7zM15.5 9.5h.01',
  logout: 'M10 5H5v14h5M14 8l4 4-4 4M18 12H9',
  refresh: 'M5 12a7 7 0 0112-5l2 2M19 5v4h-4M19 12a7 7 0 01-12 5l-2-2M5 19v-4h4',
  archive: 'M4 5h16v4H4zM6 9v10h12V9M10 13h4',
  barcode: 'M5 6v12M8 6v12M11 6v12M15 6v12M19 6v12',
  alert: 'M12 4l9 16H3L12 4zM12 10v4M12 17h.01',
  pin: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.800 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z',
};
export const Icon = ({ name, size = 22 }: { name: keyof typeof ICONS | string; size?: number }) => (
  <svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONS[name] ?? ''} /></svg>
);

export const Pill = ({ status, qty }: { status: StockStatus; qty?: number }) => (
  <span class={`pill pill--${status}`}>{status === 'out' ? 'Agotado' : qty === undefined ? STATUS_LABEL[status] : status === 'low' ? (qty === 1 ? 'Queda 1' : `Quedan ${qty}`) : `${qty} en stock`}</span>
);

/** Tinte por categoría: los mismos bloques de color del mockup del sitio. */
export const catClass = (c: Category | string): string => 'cat cat--' + ({ Skincare: 'skin', Maquillaje: 'makeup', Cabello: 'hair', Cuerpo: 'body', Accesorios: 'acc' }[c as Category] ?? 'skin');

export function Stepper({ value, onChange, min = 0, max = 999, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div class="stepper" role="group" aria-label={label}>
      <button type="button" class="stepper__btn" aria-label="Quitar una unidad" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}><Icon name="minus" size={18} /></button>
      <span class="stepper__value" aria-live="polite">{value}</span>
      <button type="button" class="stepper__btn" aria-label="Sumar una unidad" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}><Icon name="plus" size={18} /></button>
    </div>
  );
}

/** Panel: sube desde abajo en el celular y es un diálogo centrado en pantallas grandes. */
export function Sheet({ title, eyebrow, onClose, children, footer, wide = false }: { title: string; eyebrow?: string; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); previous?.focus?.(); };
  }, []);
  return (
    <div class="sheet" role="presentation">
      <button class="sheet__scrim" aria-label="Cerrar" onClick={onClose} tabIndex={-1} />
      <div class={`sheet__panel ${wide ? 'sheet__panel--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header class="sheet__head">
          <div class="sheet__titles">
            {eyebrow && <span class="eyebrow">{eyebrow}</span>}
            <h2 class="sheet__title">{title}</h2>
          </div>
          <button class="icon-btn" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div class="sheet__body">{children}</div>
        {footer && <footer class="sheet__foot">{footer}</footer>}
      </div>
    </div>
  );
}

export const Field = ({ label, hint, children }: { label: string; hint?: string; children: ComponentChildren }) => (
  <label class="field">
    <span class="field__label">{label}</span>
    {children}
    {hint && <span class="field__hint">{hint}</span>}
  </label>
);

export const Empty = ({ title, children }: { title: string; children?: ComponentChildren }) => (
  <div class="empty">
    <Lily size={44} tone="arena" />
    <p class="empty__title">{title}</p>
    {children && <p class="empty__text">{children}</p>}
  </div>
);

export const Spinner = ({ label = 'Cargando…' }: { label?: string }) => (
  <div class="spinner" role="status"><Lily size={28} class="spinner__lily" /><span>{label}</span></div>
);

/** Entrada de dinero en colones: solo dígitos, se muestra con punto de miles. */
export function Money({ value, onChange, label, placeholder = '0', autoFocus = false }: { value: number | null; onChange: (n: number | null) => void; label: string; placeholder?: string; autoFocus?: boolean }) {
  return (
    <div class="money">
      <span class="money__sign" aria-hidden="true">₡</span>
      <input class="input money__input" inputMode="numeric" aria-label={label} placeholder={placeholder} autoFocus={autoFocus}
        value={value === null ? '' : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
        onInput={(e) => { const digits = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8); onChange(digits === '' ? null : Number(digits)); }} />
    </div>
  );
}
