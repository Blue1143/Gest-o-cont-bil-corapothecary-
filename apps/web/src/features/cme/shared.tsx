import { useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LOAD_STATUS_LABEL, testResultLabel, type AttachmentDto, type LoadStatus, type SterilizationTestType, type Status, type TestResult } from '@ccih/domain';
import { AlertBanner, Button, FormMessage, LOAD_TONE, StatusBadge, SubNav } from '@ccih/ui';
import { useDataSource } from '../../data/source';
import type { AttachmentEntity, CmePort } from '../../data/port';
import { ApiError } from '../../data/api/http';
import { useAdminMutation } from '../admin/shared';
import { useSession } from '../auth/session';
import { PageHeader } from '../clinical/shared';

export function useCme(): CmePort | undefined {
  return useDataSource().cme;
}

/** Refreshed after any CME change (alerts and indicators depend on the records). */
export const CME_KEYS = ['cme', 'alerts', 'surgery', 'facts'];

export function useCmeMutation<I, O = unknown>(run: (input: I) => Promise<O>) {
  return useAdminMutation<I, O>(run, CME_KEYS);
}

export function RequireCme({ title, children }: { title: string; children: ReactNode }) {
  if (useCme()) return <>{children}</>;
  return (
    <div className="page">
      <PageHeader title={title} />
      <AlertBanner tone="info" title="Módulo disponível com o backend">
        Ciclos, testes, liberação de cargas e rastreabilidade exigem a API, com controle de acesso, histórico imutável e auditoria (VITE_DATA_SOURCE=api).
      </AlertBanner>
    </div>
  );
}

export function CmeNav() {
  const { pathname } = useLocation();
  const items = [
    { key: 'cargas', label: 'Cargas e liberação', href: '/cme' },
    { key: 'bd', label: 'Bowie-Dick', href: '/cme/bowie-dick' },
    { key: 'equip', label: 'Equipamentos', href: '/cme/equipamentos' },
    { key: 'caixas', label: 'Caixas', href: '/cme/caixas' },
  ].map((i) => ({ ...i, active: i.href === '/cme' ? pathname === '/cme' || pathname.startsWith('/cme/cargas') : pathname.startsWith(i.href) }));
  return <SubNav label="Seções da CME" items={items} renderLink={(item, className) => <Link to={item.href} className={className} aria-current={item.active ? 'page' : undefined}>{item.label}</Link>} />;
}

export function LoadStatusBadge({ status }: { status: LoadStatus }) {
  return <StatusBadge status={LOAD_TONE[status]}>{LOAD_STATUS_LABEL[status]}</StatusBadge>;
}

const RESULT_TONE: Record<TestResult, Status> = { aprovado: 'ok', reprovado: 'crit', pendente: 'warn' };
export function TestResultBadge({ type, result }: { type: SterilizationTestType; result: TestResult }) {
  return <StatusBadge status={RESULT_TONE[result]}>{testResultLabel(type, result)}</StatusBadge>;
}

const sizeLabel = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1_048_576).toFixed(1)} MB`);

/** Evidence files of a record: downloads are same-origin links; uploads are checked by the server. */
export function Attachments({ entity, entityId, files, canUpload, refresh = CME_KEYS }: { entity: AttachmentEntity; entityId: string; files: AttachmentDto[]; canUpload: boolean; refresh?: string[] }) {
  const cme = useCme()!;
  const session = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const m = useAdminMutation((file: File) => cme.upload(entity, entityId, file), refresh);
  const pick = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) { setError('Envie PDF, PNG ou JPEG.'); return; }
    m.mutation.mutate(file, { onError: (e) => setError(e instanceof ApiError ? e.message : 'Não foi possível enviar o arquivo.') });
    if (input.current) input.current.value = '';
  };
  return (
    <div className="cme-files">
      {files.length ? (
        <ul className="cme-file-list">
          {files.map((f) => <li key={f.id}><a href={cme.attachmentUrl(f.id)} download>{f.fileName}</a> <span className="ig-small ig-muted">{sizeLabel(f.size)} · {f.uploadedBy}</span></li>)}
        </ul>
      ) : null}
      {canUpload && session.writable ? (
        <>
          <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg" hidden onChange={(e) => pick(e.target.files?.[0])} aria-label="Arquivo de evidência" />
          <Button size="sm" icon="plus" disabled={m.mutation.isPending} onClick={() => input.current?.click()}>{m.mutation.isPending ? 'Enviando…' : 'Anexar evidência'}</Button>
        </>
      ) : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </div>
  );
}
