import { describe, expect, it } from 'vitest';
import { generateFacts } from './facts';
import { DEMO_CONFIG, DEMO_SECTORS } from './institution';

const rows = generateFacts('2025-10-01', '2026-09-01', '2026-09-01');

describe('synthetic facts', () => {
  it('are deterministic', () => {
    expect(generateFacts('2026-09-01', '2026-09-01', '2026-09-01')).toEqual(generateFacts('2026-09-01', '2026-09-01', '2026-09-01'));
  });

  it('are coherent between numerators and denominators', () => {
    for (const { counts: c } of rows) {
      if (c.iras_total != null) expect(c.iras_total).toBe((c.iras_ipcs ?? 0) + (c.iras_pav ?? 0) + (c.iras_itu ?? 0) + (c.iras_outras ?? 0));
      if (c.cvc_dia != null) expect(c.cvc_dia).toBeLessThanOrEqual(c.pacientes_dia!);
      if (c.hm_acoes != null) expect(c.hm_acoes).toBeLessThanOrEqual(c.hm_oportunidades!);
      if (c.cme_ciclos_conformes != null) expect(c.cme_ciclos_conformes + c.cme_ciclos_nao_conformes!).toBe(c.cme_ciclos);
      if (c.cme_caixas_rastreadas != null) expect(c.cme_caixas_rastreadas).toBeLessThanOrEqual(c.cme_caixas_usadas!);
    }
  });

  it('only uses known sectors and marks every target as demonstration', () => {
    const codes = new Set(DEMO_SECTORS.map((s) => s.code));
    for (const r of rows) expect(codes.has(r.sectorId)).toBe(true);
    for (const t of DEMO_CONFIG.targets) expect(t.origin).toBe('demonstracao');
  });
});
