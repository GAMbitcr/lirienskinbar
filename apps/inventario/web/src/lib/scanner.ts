/**
 * Lectura de códigos de barras con la cámara.
 * Usa BarcodeDetector cuando el navegador lo trae (Chrome/Android) y ZXing como respaldo (iPhone/Safari).
 * La cámara solo funciona en HTTPS (o en localhost).
 */
type Stop = () => void;
interface DetectorLike { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
declare const BarcodeDetector: { new (opts: { formats: string[] }): DetectorLike; getSupportedFormats?: () => Promise<string[]> } | undefined;

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

export function cameraError(e: unknown): string {
  const name = e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError') return 'La cámara está bloqueada para este sitio. Dale permiso en el navegador o escribí el código.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No encontramos una cámara en este dispositivo. Escribí el código o usá un lector.';
  if (!window.isSecureContext) return 'La cámara solo funciona con HTTPS. Escribí el código o usá un lector.';
  return 'No pudimos abrir la cámara. Escribí el código o usá un lector.';
}

export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<Stop> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Sin cámara');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  await video.play().catch(() => {});
  let stopped = false;
  let last = '', lastAt = 0;
  const emit = (code: string) => {
    const now = Date.now();
    if (code === last && now - lastAt < 2500) return; // el mismo código no se repite mientras sigue frente a la cámara
    last = code; lastAt = now;
    onCode(code);
  };
  let zxingStop: Stop | null = null;
  const native = typeof BarcodeDetector !== 'undefined';
  if (native) {
    const detector = new BarcodeDetector!({ formats: FORMATS });
    const tick = async () => {
      if (stopped) return;
      try { const found = await detector.detect(video); if (found[0]?.rawValue) emit(found[0].rawValue); } catch { /* cuadro sin imagen todavía */ }
      setTimeout(tick, 180);
    };
    void tick();
  } else {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const reader = new BrowserMultiFormatReader();
    const controls = await reader.decodeFromVideoElement(video, (result) => { if (result && !stopped) emit(result.getText()); });
    zxingStop = () => controls.stop();
  }
  return () => {
    stopped = true;
    zxingStop?.();
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}

/**
 * Lector USB/Bluetooth: se comporta como un teclado muy rápido que termina en Enter.
 * Si no hay un campo de texto enfocado, junta las teclas y avisa cuando llega un código.
 */
export function listenKeyboardScanner(onCode: (code: string) => void): Stop {
  let buffer = '', lastKey = 0;
  const handler = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
    const now = Date.now();
    if (now - lastKey > 80) buffer = '';
    lastKey = now;
    if (e.key === 'Enter') { if (buffer.length >= 6) { e.preventDefault(); onCode(buffer); } buffer = ''; return; }
    if (e.key.length === 1 && /[0-9A-Za-z-]/.test(e.key)) buffer += e.key;
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}
