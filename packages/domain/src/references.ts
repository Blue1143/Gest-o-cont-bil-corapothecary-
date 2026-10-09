/**
 * Clinical, epidemiological and regulatory references. The system never hardcodes a criterion:
 * each configurable rule points to a reference that records its version, source and validation.
 */
export type ReferenceStatus = 'vigente' | 'revisao_necessaria' | 'arquivado';

export type ReferenceKind = 'regulatoria' | 'diretriz' | 'protocolo_institucional' | 'literatura';

export interface ClinicalReference {
  id: string;
  title: string;
  kind: ReferenceKind;
  /** Issuing body or document, e.g. "ANVISA — Critérios Diagnósticos de IRAS". */
  source: string;
  version: string;
  /** ISO date of the last review of this record. */
  updatedAt: string;
  /** Who validated it institutionally; null while not validated. */
  validatedBy: string | null;
  validatedAt: string | null;
  status: ReferenceStatus;
  notes?: string;
}

export const REFERENCE_STATUS_LABEL: Record<ReferenceStatus, string> = {
  vigente: 'Vigente',
  revisao_necessaria: 'Revisão necessária',
  arquivado: 'Arquivado',
};

export const REQUIRES_VALIDATION_LABEL = 'Requer validação institucional';

/** A reference can back a live rule only when it is current and someone validated it. */
export function isReferenceUsable(ref: ClinicalReference | undefined): boolean {
  return !!ref && ref.status === 'vigente' && ref.validatedBy !== null;
}

export function requiresValidation(ref: ClinicalReference | undefined): boolean {
  return !ref || ref.validatedBy === null || ref.status !== 'vigente';
}
