import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, type SurgeryDetail, type SurgeryMaterialDto } from '@ccih/domain';
import { Button, Card, DataTable, Field, FormMessage, type Column } from '@ccih/ui';
import { useSession } from '../auth/session';
import { useTimeZone } from '../clinical/shared';
import { VoidDialog } from '../operations/shared';
import { LoadStatusBadge, useCme, useCmeMutation } from './shared';

/** Backward traceability: the CME packages used in this surgery (scan or type the label). */
export function SurgeryMaterialsCard({ surgery }: { surgery: SurgeryDetail }) {
  const cme = useCme();
  const session = useSession();
  const tz = useTimeZone();
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<SurgeryMaterialDto | null>(null);
  const m = useCmeMutation((labelCode: string) => cme!.addSurgeryMaterial(surgery.id, { labelCode, usedAt: null }));
  if (!cme) return null;
  const canEdit = session.can('surgery:edit');
  const cols: Column<SurgeryMaterialDto>[] = [
    { key: 'labelCode', label: 'Etiqueta', render: (x) => <span className="ig-mono">{x.labelCode}</span> },
    { key: 'description', label: 'Material', render: (x) => <span>{x.description}{x.implant ? <span className="ig-small"> · implantável</span> : null}</span> },
    { key: 'load', label: 'Carga', render: (x) => (session.can('cme:view') ? <Link to={`/cme/cargas/${x.loadId}`} className="ig-mono">{x.loadCode}</Link> : <span className="ig-mono">{x.loadCode}</span>) },
    { key: 'status', label: 'Situação da carga', render: (x) => <LoadStatusBadge status={x.loadStatus} /> },
    { key: 'cycle', label: 'Ciclo', render: (x) => <span className="ig-small">{x.sterilizerName} · {formatDate(x.cycleStartedAt, tz)}</span> },
    { key: 'actions', label: 'Ações', render: (x) => (canEdit ? <Button size="sm" onClick={() => setVoiding(x)} aria-label={`Anular registro de ${x.labelCode}`}>Anular</Button> : null) },
  ];
  const add = () => {
    setError(null);
    const code = label.trim().toUpperCase();
    if (code.length < 3) { setError('Informe a etiqueta do pacote.'); return; }
    m.mutation.mutate(code, { onSuccess: () => setLabel(''), onError: () => undefined });
  };
  const recalled = surgery.materials.some((x) => x.loadStatus === 'rejeitada');
  return (
    <Card title="Materiais da CME" subtitle="Pacotes usados nesta cirurgia: só pacotes de cargas liberadas, dentro da validade e ainda não usados." headingLevel={2}>
      {recalled ? <FormMessage tone="error">Um pacote usado nesta cirurgia pertence a uma carga recolhida. A CCIH recebe um alerta para avaliar a vigilância do paciente.</FormMessage> : null}
      {canEdit ? (
        <form className="ig-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Field label="Etiqueta do pacote" error={error ?? m.fieldErrors.labelCode ?? (m.mutation.isError && !m.fieldErrors.labelCode ? m.formError : null)}>
            <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="AV1-261009-01-03" autoComplete="off" />
          </Field>
          <Button type="submit" variant="primary" disabled={m.mutation.isPending}>{m.mutation.isPending ? 'Registrando…' : 'Registrar uso'}</Button>
        </form>
      ) : null}
      <DataTable caption="Pacotes registrados" dense rows={surgery.materials} rowKey={(x) => x.useId} columns={cols} emptyMessage="Nenhum pacote registrado nesta cirurgia." />
      <VoidDialog open={!!voiding} title={`Anular o registro de ${voiding?.labelCode ?? ''}?`} onClose={() => setVoiding(null)} onVoid={(reason) => cme.voidUse(voiding!.useId, reason)} />
    </Card>
  );
}
