import type * as React from 'react';

export type Status = 'ok' | 'warn' | 'crit' | 'neutral' | 'info';
export type IrasType = 'IPCS' | 'PAV' | 'ITU-AC' | 'ISC' | 'OUTRA';
export type IconName = 'ok' | 'warn' | 'crit' | 'neutral' | 'info' | 'up' | 'down' | 'flat' | 'table' | 'chart';
/** Data ISO: 'AAAA-MM-DD' ou 'AAAA-MM-DDThh:mm'. */
export type IsoDate = string;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'secondary' | 'primary' | 'ghost' | 'danger'; size?: 'md' | 'sm'; icon?: IconName }
export declare function Button(props: ButtonProps): React.ReactElement;

export interface StatusBadgeProps { status?: Status; children?: React.ReactNode }
export declare function StatusBadge(props: StatusBadgeProps): React.ReactElement;

export interface InfectionTagProps { type: IrasType; showName?: boolean }
export declare function InfectionTag(props: InfectionTagProps): React.ReactElement;

export interface AlertBannerProps { tone?: 'info' | 'ok' | 'warn' | 'crit'; title?: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }
export declare function AlertBanner(props: AlertBannerProps): React.ReactElement;

export interface KpiCardProps { label: string; value: number | null; unit?: string; decimals?: number; target?: number; direction?: 'lower' | 'higher'; band?: number; previous?: number; previousLabel?: string; period?: string; spark?: number[]; status?: Status }
export declare function KpiCard(props: KpiCardProps): React.ReactElement;

export interface TrendSeries { name: string; /** token de cor: 'iras-ipcs', 'serie-2', 'primary'… */ color?: string; values: Array<number | null> }
export interface TrendChartProps { title?: string; subtitle?: string; labels: string[]; series: TrendSeries[]; unit?: string; decimals?: number; target?: number; targetLabel?: string; limit?: number | Array<number | null>; limitLabel?: string; height?: number; yMax?: number; footnote?: React.ReactNode }
export declare function TrendChart(props: TrendChartProps): React.ReactElement;

export interface BarDatum { label: string; value: number; type?: IrasType; color?: string; note?: string }
export interface BarChartProps { title?: string; subtitle?: string; data: BarDatum[]; unit?: string; decimals?: number; target?: number; targetLabel?: string; sort?: boolean; categoryLabel?: string; valueLabel?: string; footnote?: React.ReactNode }
export declare function BarChart(props: BarChartProps): React.ReactElement;

export interface DataTableColumn<R = any> { key: string; label: React.ReactNode; align?: 'left' | 'right'; format?: (value: any, row: R) => React.ReactNode; render?: (row: R) => React.ReactNode; sortValue?: (row: R) => number | string; sortable?: boolean }
export interface DataTableProps<R = any> { columns: DataTableColumn<R>[]; rows: R[]; caption?: React.ReactNode; dense?: boolean; sortable?: boolean; initialSort?: { key: string; dir: 'asc' | 'desc' }; empty?: string }
export declare function DataTable<R = any>(props: DataTableProps<R>): React.ReactElement;

export interface PatientRecordProps {
  paciente: { iniciais: string; prontuario: string; idade?: number; sexo?: string };
  setor?: string; leito?: string; admissao?: IsoDate; dataRef?: IsoDate;
  precaucao?: 'contato' | 'gotículas' | 'aerossóis' | null;
  dispositivos?: Array<{ tipo: string; sitio?: string; inicio: IsoDate; retirada?: IsoDate }>;
  culturas?: Array<{ material: string; coleta: IsoDate; resultado: 'positiva' | 'negativa' | 'pendente' | 'contaminada'; microrganismo?: string; perfil?: string }>;
  iras?: Array<{ tipo: IrasType; dataEvento: IsoDate; criterio?: string; status: 'confirmada' | 'em investigação' | 'descartada' }>;
  footer?: React.ReactNode;
}
export declare function PatientRecord(props: PatientRecordProps): React.ReactElement;

export interface SurgeryRecordProps {
  procedimento: string; codigo?: string; paciente?: { iniciais: string; prontuario: string };
  data: IsoDate; sala?: string; especialidade?: string;
  potencial?: 'limpa' | 'potencialmente contaminada' | 'contaminada' | 'infectada';
  asa?: 1 | 2 | 3 | 4 | 5; duracaoMin?: number; p75Min?: number; implante?: boolean;
  profilaxia?: { antimicrobiano: string; dose?: string; minutosAntesIncisao: number; duracaoHoras?: number; repique?: boolean; janelaMin?: number };
  caixas?: Array<{ codigo: string; descricao: string; lote: string; ciclo?: string; status?: 'ok' | 'warn' | 'crit' }>;
  vigilancia?: { status?: 'em vigilância' | 'sem ISC' | 'ISC confirmada' };
}
export declare function SurgeryRecord(props: SurgeryRecordProps): React.ReactElement;

export interface SterilizationCycleProps {
  equipamento: string; ciclo: string; data?: IsoDate; metodo?: string;
  parametros?: Array<{ nome: string; valor: string }>;
  testes: Array<{ tipo: string; detalhe?: string; resultado: 'aprovado' | 'reprovado' | 'pendente' }>;
  itens?: number; implantavel?: boolean; operador?: string; actions?: React.ReactNode;
}
export declare function SterilizationCycle(props: SterilizationCycleProps): React.ReactElement;

export interface TraceTimelineProps { item: { codigo: string; descricao: string; lote?: string }; etapas: Array<{ etapa: string; data?: IsoDate; responsavel?: string; detalhe?: string; status?: 'ok' | 'warn' | 'crit' | 'neutral' }> }
export declare function TraceTimeline(props: TraceTimelineProps): React.ReactElement;

export interface TrainingProgressProps { title?: string; meta?: number; band?: number; itens: Array<{ tema: string; publico?: string; concluidos: number; total: number; proximaReciclagem?: IsoDate }> }
export declare function TrainingProgress(props: TrainingProgressProps): React.ReactElement;

export type BundleAnswer = 'sim' | 'nao' | 'na' | null;
export interface BundleChecklistProps { title: string; setor?: string; data?: IsoDate; auditor?: string; itens: Array<{ texto: string; resposta?: BundleAnswer }>; editable?: boolean; onChange?: (respostas: BundleAnswer[]) => void }
export declare function BundleChecklist(props: BundleChecklistProps): React.ReactElement;

export interface SupplyStockProps { title?: string; dataRef?: IsoDate; itens: Array<{ insumo: string; unidade?: string; estoque: number; consumoDia: number; minimoDias?: number; lote?: string; validade?: IsoDate }> }
export declare function SupplyStock(props: SupplyStockProps): React.ReactElement;

export declare const IRAS: Record<IrasType, { token: string; sigla: string; nome: string; dispositivo: 'CVC' | 'VM' | 'SVD' | null }>;
export declare function statusFor(value: number | null, target: number | null, direction?: 'lower' | 'higher', band?: number): Status;
export declare function riskIndex(cirurgia: Pick<SurgeryRecordProps, 'asa' | 'potencial' | 'duracaoMin' | 'p75Min'>): 0 | 1 | 2 | 3;
export declare const format: { number(v: number | null, decimals?: number): string; date(iso: IsoDate): string };

declare global { interface Window { Integra: {
  Button: typeof Button; StatusBadge: typeof StatusBadge; InfectionTag: typeof InfectionTag; AlertBanner: typeof AlertBanner;
  KpiCard: typeof KpiCard; TrendChart: typeof TrendChart; BarChart: typeof BarChart; DataTable: typeof DataTable;
  PatientRecord: typeof PatientRecord; SurgeryRecord: typeof SurgeryRecord; SterilizationCycle: typeof SterilizationCycle;
  TraceTimeline: typeof TraceTimeline; TrainingProgress: typeof TrainingProgress; BundleChecklist: typeof BundleChecklist; SupplyStock: typeof SupplyStock;
  IRAS: typeof IRAS; statusFor: typeof statusFor; riskIndex: typeof riskIndex; format: typeof format;
} } }
