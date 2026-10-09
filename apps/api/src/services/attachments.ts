import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { AttachmentDto } from '@ccih/domain';
import { HttpError } from '../http/errors';
import type { Db } from '../repositories/clinical';

/**
 * Uploaded files: the type is decided by the content (magic bytes), never by the name or the
 * declared header alone; PDFs with active content are refused; files are stored outside the web
 * root under a generated name and only served as downloads.
 */
export type AttachmentMime = 'application/pdf' | 'image/png' | 'image/jpeg';
export const ATTACHMENT_MIMES: AttachmentMime[] = ['application/pdf', 'image/png', 'image/jpeg'];
export const MAX_ATTACHMENTS_PER_RECORD = 10;
export type AttachmentEntity = 'sterilization_test' | 'training_session';

const reject = (message: string) => new HttpError(400, 'arquivo_invalido', message, [{ path: 'file', message }]);

export function detectMime(buf: Buffer): AttachmentMime | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

/** PDF features that run code or carry other files are not accepted as evidence. */
const ACTIVE_PDF = /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia|XFA)\b/;

export function validateUpload(buf: Buffer, declared: string | undefined, maxBytes: number): AttachmentMime {
  if (!buf.length) throw reject('Arquivo vazio.');
  if (buf.length > maxBytes) throw reject(`Arquivo maior que ${Math.floor(maxBytes / 1_048_576)} MB.`);
  const mime = detectMime(buf);
  if (!mime) throw reject('Formato não aceito. Envie PDF, PNG ou JPEG.');
  if (declared && declared.split(';')[0]!.trim().toLowerCase() !== mime) throw reject('O conteúdo do arquivo não corresponde ao tipo informado.');
  if (mime === 'application/pdf' && ACTIVE_PDF.test(buf.toString('latin1'))) throw reject('PDF com conteúdo ativo (scripts, ações ou arquivos embutidos) não é aceito.');
  return mime;
}

/** Display name only (the stored file never uses it). */
export function safeFileName(raw: string | undefined, mime: AttachmentMime): string {
  let name = '';
  try {
    name = basename(decodeURIComponent(raw ?? '')).normalize('NFC');
  } catch {
    name = '';
  }
  name = name.replace(/[^\p{L}\p{N} ._()-]/gu, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
  const ext = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg' }[mime];
  if (!name || name.startsWith('.')) name = `anexo${ext}`;
  return name;
}

export class AttachmentStore {
  private readonly root: string;
  constructor(dir: string) {
    this.root = resolve(dir);
  }

  private path(institutionId: string, key: string) {
    if (!/^[0-9a-f-]{36}$/.test(institutionId) || !/^[0-9a-f-]{36}$/.test(key)) throw new Error('Chave de anexo inválida');
    return join(this.root, institutionId, key);
  }

  async save(institutionId: string, buf: Buffer): Promise<{ key: string; sha256: string }> {
    const key = randomUUID();
    await mkdir(join(this.root, institutionId), { recursive: true, mode: 0o700 });
    await writeFile(this.path(institutionId, key), buf, { mode: 0o600, flag: 'wx' });
    return { key, sha256: createHash('sha256').update(buf).digest('hex') };
  }

  read(institutionId: string, key: string): Promise<Buffer> {
    return readFile(this.path(institutionId, key));
  }
}

/** Attachments of several records of one kind, by record id. */
export async function attachmentsFor(db: Db, entity: AttachmentEntity, ids: string[]): Promise<Map<string, AttachmentDto[]>> {
  const out = new Map<string, AttachmentDto[]>();
  if (!ids.length) return out;
  const rows = await db.selectFrom('attachment').selectAll().where('entity', '=', entity).where('entity_id', 'in', ids).orderBy('created_at').execute();
  for (const a of rows) {
    const list = out.get(a.entity_id) ?? [];
    list.push({ id: a.id, fileName: a.file_name, mime: a.mime, size: a.size_bytes, uploadedBy: a.uploaded_by_name, uploadedAt: a.created_at.toISOString() });
    out.set(a.entity_id, list);
  }
  return out;
}
