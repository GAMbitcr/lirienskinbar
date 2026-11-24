import { useEffect, useRef, useState } from 'preact/hooks';
import { api, ApiError, apiConfigured, type PublicUser } from '../api';
import { Icon, Lily, Logo, Spinner } from '../components/ui';
import { initials } from '../lib/format';
import { useStore } from '../store';

/** Teclado numérico con puntos. Avisa cuando se completan `length` dígitos. Funciona también con el teclado físico. */
export function PinPad({ length, value, onChange, busy = false, label }: { length: number; value: string; onChange: (v: string) => void; busy?: boolean; label: string }) {
  // `latest` evita perder dígitos cuando llegan varias teclas antes de que la pantalla se vuelva a dibujar (lectores, teclados rápidos).
  const latest = useRef(value);
  latest.current = value;
  const push = (next: string) => { latest.current = next; onChange(next); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); if (latest.current.length < length) push(latest.current + e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); push(latest.current.slice(0, -1)); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, length]);
  const press = (d: string) => { if (!busy && latest.current.length < length) push(latest.current + d); };
  return (
    <div class="pinpad">
      <div class={`pinpad__dots pinpad__dots--${length}`} role="img" aria-label={`${label}: ${value.length} de ${length} dígitos`}>
        {Array.from({ length }, (_, i) => <span class={`pinpad__dot ${i < value.length ? 'is-on' : ''}`} />)}
      </div>
      <div class="pinpad__keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button type="button" class="pinpad__key" disabled={busy} onClick={() => press(d)}>{d}</button>)}
        <span />
        <button type="button" class="pinpad__key" disabled={busy} onClick={() => press('0')}>0</button>
        <button type="button" class="pinpad__key pinpad__key--ghost" aria-label="Borrar" disabled={busy || !value} onClick={() => push(latest.current.slice(0, -1))}><Icon name="back" /></button>
      </div>
    </div>
  );
}

type Step = 'pin' | 'code' | 'new' | 'confirm';

export function Login() {
  const { signIn, notify } = useStore();
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [step, setStep] = useState<Step>('pin');
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setUsers(null);
    api.publicUsers().then((d) => setUsers(d.users)).catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos conectar.'));
  };
  useEffect(() => { if (apiConfigured) load(); }, []);

  const pick = (u: PublicUser | null) => { setUser(u); setStep(u && !u.hasPin ? 'code' : 'pin'); setValue(''); setCode(''); setNewPin(''); setMessage(null); };
  const goto = (s: Step, msg: string | null = null) => { setStep(s); setValue(''); setMessage(msg); };

  const submit = async (entered: string) => {
    if (!user) return;
    if (step === 'code') { setCode(entered); goto('new'); return; }
    if (step === 'new') {
      if (/^(\d)\1{5}$/.test(entered) || ['123456', '654321'].includes(entered)) { goto('new', 'Ese PIN es muy fácil de adivinar. Elegí otro.'); return; }
      setNewPin(entered); goto('confirm'); return;
    }
    if (step === 'confirm' && entered !== newPin) { goto('new', 'Los dos PIN no coinciden. Probá de nuevo.'); return; }
    setBusy(true);
    setMessage(null);
    try {
      const s = step === 'pin' ? await api.login(user.userId, entered) : await api.activate(user.userId, code, newPin);
      if (step !== 'pin') notify('PIN creado. ¡Bienvenida!');
      signIn(s);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('NETWORK', 'No pudimos conectar. Probá de nuevo.');
      if (err.code === 'NEEDS_ACTIVATION') { goto('code', err.message); }
      else if (step === 'confirm') { goto(/código/i.test(err.message) ? 'code' : 'new', err.message); }
      else { setValue(''); setMessage(err.message); }
    } finally { setBusy(false); }
  };
  const length = step === 'code' ? 8 : 6;
  useEffect(() => { if (value.length === length && !busy) void submit(value); }, [value]);

  const titles: Record<Step, [string, string]> = {
    pin: ['Ingresá tu PIN', 'PIN de 6 dígitos'],
    code: ['Código de activación', 'Escribí el código de 8 dígitos que te dio un admin'],
    new: ['Creá tu PIN', 'Elegí 6 dígitos que solo vos sepás'],
    confirm: ['Repetí tu PIN', 'Para confirmar que quedó bien'],
  };

  return (
    <main class="login">
      <section class="login__brand">
        <Lily size={180} tone="lirio" class="login__lily login__lily--a" />
        <Lily size={90} tone="lirio" class="login__lily login__lily--b" />
        <Lily size={56} tone="lirio" class="login__lily login__lily--c" />
        <Logo variant="vertical" class="login__logo" />
        <span class="eyebrow eyebrow--light">Inventario · Santa Ana Town Center</span>
      </section>
      <section class="login__panel">
        {!apiConfigured ? (
          <div class="notice notice--warn"><strong>Falta configurar la app.</strong> Definí <code>VITE_API_URL</code> con la dirección <code>/exec</code> de Apps Script y volvé a publicar. Está explicado en PUESTA-EN-MARCHA.md.</div>
        ) : error ? (
          <div class="stack"><div class="notice notice--warn">{error}</div><button class="btn btn--secondary" onClick={load}><Icon name="refresh" size={18} /> Reintentar</button></div>
        ) : !users ? (
          <Spinner label="Conectando…" />
        ) : !user ? (
          <div class="stack">
            <div><span class="eyebrow">Bienvenida</span><h1 class="h1">¿Quién sos?</h1></div>
            {users.length === 0 ? (
              <div class="notice">Todavía no hay personas con acceso. En el Sheet: <strong>Lirien → 3. Agregar persona y generar código</strong>.</div>
            ) : (
              <ul class="people">
                {users.map((u) => (
                  <li><button class="person" onClick={() => pick(u)}>
                    <span class={`avatar avatar--${u.role}`}>{initials(u.name)}</span>
                    <span class="person__text"><span class="person__name">{u.name}</span><span class="person__role">{u.hasPin ? (u.role === 'admin' ? 'Admin' : 'Colaboradora') : 'Pendiente de activar'}</span></span>
                    {!u.hasPin && <Lily size={18} />}
                  </button></li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div class="stack stack--center">
            <button class="link-btn" onClick={() => pick(null)}><Icon name="back" size={18} /> Cambiar de persona</button>
            <span class={`avatar avatar--lg avatar--${user.role}`}>{initials(user.name)}</span>
            <div class="login__titles"><h1 class="h1">{titles[step][0]}</h1><p class="muted">{user.name} · {titles[step][1]}</p></div>
            {message && <div class="notice notice--warn" role="alert">{message}</div>}
            <PinPad length={length} value={value} onChange={setValue} busy={busy} label={titles[step][0]} />
            {busy && <Spinner label="Comprobando…" />}
            {step === 'pin' && <button class="link-btn" onClick={() => goto('code')}>Tengo un código de activación</button>}
            {step !== 'pin' && user.hasPin && <button class="link-btn" onClick={() => goto('pin')}>Volver a ingresar con mi PIN</button>}
          </div>
        )}
      </section>
    </main>
  );
}
