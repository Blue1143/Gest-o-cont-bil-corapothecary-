/**
 * Microbiology nomenclature. Resistance classification (MDR/XDR/PDR) and mechanisms are recorded
 * as reported by the laboratory or the CCIH; the system does not derive them from breakpoints.
 */
export type CultureMaterial =
  | 'sangue' | 'urina' | 'secrecao_traqueal' | 'lavado_broncoalveolar' | 'ponta_cateter' | 'ferida_operatoria'
  | 'liquor' | 'liquido_pleural' | 'swab_vigilancia' | 'outro';

export const MATERIAL_LABEL: Record<CultureMaterial, string> = {
  sangue: 'Sangue',
  urina: 'Urina',
  secrecao_traqueal: 'Secreção traqueal',
  lavado_broncoalveolar: 'Lavado broncoalveolar',
  ponta_cateter: 'Ponta de cateter',
  ferida_operatoria: 'Secreção de ferida operatória',
  liquor: 'Líquor',
  liquido_pleural: 'Líquido pleural',
  swab_vigilancia: 'Swab de vigilância',
  outro: 'Outro material',
};

export type CultureOutcome = 'pendente' | 'negativa' | 'positiva' | 'contaminada';

export const CULTURE_OUTCOME_LABEL: Record<CultureOutcome, string> = {
  pendente: 'Aguardando resultado', negativa: 'Negativa', positiva: 'Positiva', contaminada: 'Provável contaminação',
};

export type ResistanceProfile = 'MDR' | 'XDR' | 'PDR';

export const RESISTANCE_LABEL: Record<ResistanceProfile, string> = {
  MDR: 'Multirresistente (MDR)', XDR: 'Extensivamente resistente (XDR)', PDR: 'Pan-resistente (PDR)',
};

/** S / I / R as reported; the meaning of "I" follows the breakpoint version recorded with the result. */
export type Interpretation = 'S' | 'I' | 'R';

export const INTERPRETATION_LABEL: Record<Interpretation, string> = {
  S: 'Sensível', I: 'Intermediário / sensível aumentando exposição', R: 'Resistente',
};
