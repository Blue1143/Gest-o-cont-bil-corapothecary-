/**
 * Barcode contents. Codes issued by the system carry a type prefix and an ISO 7064 MOD 37,36
 * check character (catches typing and misread errors); package and load codes keep the format
 * already in use. Scanner add-ons are tolerated: AIM symbology identifiers ("]C0") and the Code 39
 * start/stop asterisks are removed before reading.
 */
export type CodeKind = 'ativo' | 'processo' | 'pacote' | 'carga' | 'externo';
export type Symbology = 'code128' | 'code39' | 'qr' | 'datamatrix' | 'outro';

export const SYMBOLOGY_LABEL: Record<Symbology, string> = { code128: 'Code 128', code39: 'Code 39', qr: 'QR Code', datamatrix: 'Data Matrix', outro: 'Outra' };
/** Symbologies the institution approved (QR is not used). */
export const ACCEPTED_SYMBOLOGIES: Symbology[] = ['code128', 'code39'];

const ISO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Payload alphabet without characters easily confused when typed (0/O, 1/I/L). */
export const PAYLOAD_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ISSUED_PREFIX = { ativo: 'AT', processo: 'PR' } as const;

/** ISO 7064 MOD 37,36 check character over [0-9A-Z]. */
export function checkChar(value: string): string {
  let p = 36;
  for (const ch of value) {
    const v = ISO.indexOf(ch);
    if (v < 0) throw new Error(`Caractere inválido para verificação: ${ch}`);
    let s = (p + v) % 36;
    if (s === 0) s = 36;
    p = (s * 2) % 37;
  }
  return ISO[(37 - p) % 36]!;
}

/** Issued code: prefix, 7 payload characters and the check character (e.g. "AT-K7M2Q9X4"). */
export function issueCode(kind: keyof typeof ISSUED_PREFIX, random: () => number): string {
  const prefix = ISSUED_PREFIX[kind];
  let payload = '';
  for (let i = 0; i < 7; i++) payload += PAYLOAD_ALPHABET[Math.floor(random() * PAYLOAD_ALPHABET.length)]!;
  return `${prefix}-${payload}${checkChar(prefix + payload)}`;
}

export interface ParsedCode {
  /** Normalized code (what is stored and searched). */
  code: string;
  kind: CodeKind;
  /** Symbology announced by the scanner (AIM identifier), when present. */
  symbology: Symbology | null;
  /** Why the code cannot be used, when it is malformed. */
  problem: string | null;
}

const AIM: Record<string, Symbology> = { C: 'code128', A: 'code39', Q: 'qr', d: 'datamatrix' };
const ISSUED = /^(AT|PR)-([2-9A-HJKMNP-Z]{7})([0-9A-Z])$/;
const PACKAGE = /^[A-Z0-9]{2,20}-\d{6}-\d{2}-\d{2}$/;
const LOAD = /^[A-Z0-9]{2,20}-\d{6}-\d{2}$/;

export function parseCode(raw: string): ParsedCode {
  // eslint-disable-next-line no-control-regex -- scanners may append CR/LF/TAB or other control characters
  let s = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  let symbology: Symbology | null = null;
  const aim = /^\](.)(\d)/.exec(s);
  if (aim) {
    symbology = AIM[aim[1]!] ?? 'outro';
    s = s.slice(3);
  }
  if (/^\*.+\*$/.test(s)) {
    s = s.slice(1, -1);
    symbology ??= 'code39';
  }
  s = s.trim().toUpperCase();
  const fail = (problem: string): ParsedCode => ({ code: s, kind: 'externo', symbology, problem });
  if (!s) return fail('Leitura vazia.');
  if (s.length > 60) return fail('Código longo demais.');
  if (!/^[A-Z0-9\-./ +$%]+$/.test(s)) return fail('Código com caracteres não aceitos.');
  const issued = ISSUED.exec(s);
  if (issued) {
    const [, prefix, payload, check] = issued;
    const kind: CodeKind = prefix === 'AT' ? 'ativo' : 'processo';
    return checkChar(prefix! + payload!) === check ? { code: s, kind, symbology, problem: null } : { code: s, kind, symbology, problem: 'Dígito verificador não confere: leia novamente ou confira a etiqueta.' };
  }
  if (/^(AT|PR)-/.test(s)) return fail('Código do sistema incompleto ou danificado.');
  if (PACKAGE.test(s)) return { code: s, kind: 'pacote', symbology, problem: null };
  if (LOAD.test(s)) return { code: s, kind: 'carga', symbology, problem: null };
  return { code: s, kind: 'externo', symbology, problem: null };
}
