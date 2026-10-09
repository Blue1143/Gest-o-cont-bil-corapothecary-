import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { classifyKeystrokes, type InputMethod, type ScanConfig } from '@ccih/domain';
import { Button, FormMessage } from '@ccih/ui';

export interface CapturedCode { code: string; method: InputMethod }

/**
 * Reading field for keyboard-wedge (HID) readers: keeps the focus, records keystroke timing to tell a
 * reader burst from typing, and submits on the terminator configured for the station. The camera
 * option uses the browser BarcodeDetector where it exists. The detected method is only a label:
 * the server applies the same rules and the station decides which methods it accepts.
 */
export function ScanInput({ config, allowCamera, onCode, busy, label = 'Leitura do código de barras' }: {
  config: ScanConfig; allowCamera: boolean; onCode: (c: CapturedCode) => void; busy: boolean; label?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const times = useRef<number[]>([]);
  const pasted = useRef(false);
  const idle = useRef<number | null>(null);
  const [value, setValue] = useState('');
  const [camera, setCamera] = useState(false);

  // Keep the field ready for the next reading.
  useEffect(() => { if (!busy && !camera) input.current?.focus(); }, [busy, camera]);

  const submit = (raw: string) => {
    const code = raw.trim();
    const method: InputMethod = pasted.current ? 'manual' : classifyKeystrokes(times.current, config);
    times.current = [];
    pasted.current = false;
    setValue('');
    if (code) onCode({ code, method });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' && config.terminator !== 'tab') || (e.key === 'Tab' && config.terminator === 'tab')) {
      e.preventDefault();
      submit(value);
      return;
    }
    if (e.key.length === 1) times.current.push(performance.now());
    if (config.terminator === 'nenhum') {
      // Readers without a terminator: submit once a fast burst stops.
      if (idle.current) window.clearTimeout(idle.current);
      idle.current = window.setTimeout(() => {
        const el = input.current;
        if (el && classifyKeystrokes(times.current, config) === 'leitor') submit(el.value);
      }, config.maxKeyIntervalMs * 4);
    }
  };

  return (
    <div className="scan-input">
      <label htmlFor={id} className="scan-label">{label}</label>
      <div className="ig-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input id={id} ref={input} className="scan-field" value={value} disabled={busy} autoComplete="off" spellCheck={false} inputMode="text"
          aria-describedby={`${id}-hint`} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown} onPaste={() => { pasted.current = true; }} />
        <Button variant="primary" disabled={busy || !value.trim()} onClick={() => submit(value)}>{busy ? 'Registrando…' : 'Registrar'}</Button>
        {allowCamera ? <Button onClick={() => setCamera(true)} disabled={busy}>Ler com a câmera</Button> : null}
      </div>
      <p id={`${id}-hint`} className="ig-small ig-muted" style={{ margin: '4px 0 0' }}>
        Aponte o leitor para a etiqueta com o cursor neste campo{config.terminator === 'nenhum' ? '' : ` (o leitor envia ${config.terminator === 'tab' ? 'Tab' : 'Enter'} no final)`}. Digitação também é aceita e fica registrada como manual.
      </p>
      {camera ? <CameraReader onCode={(code) => { setCamera(false); onCode({ code, method: 'camera' }); }} onClose={() => setCamera(false)} /> : null}
    </div>
  );
}

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> }
type DetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

/** Camera reading (mobile stations). Needs camera permission and a browser with BarcodeDetector. */
function CameraReader({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  // Latest callback without restarting the camera on every parent render.
  const found = useRef(onCode);
  found.current = onCode;
  const Detector = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  const [error, setError] = useState<string | null>(Detector ? null : 'Este navegador não lê códigos pela câmera. Use o leitor ou a conferência manual.');

  useEffect(() => {
    if (!Detector) return undefined;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let stopped = false;
    const detector = new Detector({ formats: ['code_128', 'code_39'] });
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        stream = s;
        if (stopped || !video.current) return;
        video.current.srcObject = s;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            if (codes[0]?.rawValue) { found.current(codes[0].rawValue); return; }
          } catch { /* frame not ready */ }
          timer = window.setTimeout(() => void tick(), 250);
        };
        void tick();
      })
      .catch(() => setError('Sem acesso à câmera. Verifique a permissão do navegador.'));
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [Detector]);

  return (
    <div className="scan-camera" role="dialog" aria-label="Leitura pela câmera">
      {error ? <FormMessage tone="error">{error}</FormMessage> : <video ref={video} muted playsInline className="scan-video" aria-label="Imagem da câmera" />}
      <Button onClick={onClose}>Fechar câmera</Button>
    </div>
  );
}
