import { describe, expect, it } from 'vitest';
import { checkChar, issueCode, parseCode } from './codes';
import { checkAssembly, decideScan, postReleaseSteps, type FlowConfig, type ProcessSnapshot, type ProcessStep } from './flow';

const config: FlowConfig = { storageRequired: false, separationRequired: false };
const today = '2026-10-09';
const fresh: ProcessSnapshot = { open: false, lastStep: null, state: null, nextSteps: [], package: null, plannedDestinationId: null, assetBlocked: null };
const released = { loadStatus: 'liberada' as const, cycleStarted: true, expiresOn: '2026-11-08', recalled: false };

/** Applies accepted scans in order, as the API does, and returns the final snapshot. */
function walk(steps: Array<[ProcessStep, Partial<{ outcome: string; destinationId: string }>?]>, start: ProcessSnapshot = fresh, cfg = config): ProcessSnapshot {
  let p = start;
  for (const [step, extra] of steps) {
    const d = decideScan(p, { step, today, ...extra }, cfg);
    expect(d.result, `${step}: ${d.message}`).toBe('aceita');
    const a = d.apply!;
    p = { ...p, open: !a.closes || a.opens, lastStep: a.step, state: a.state, nextSteps: a.nextSteps, plannedDestinationId: step === 'separacao' ? extra?.destinationId ?? null : p.plannedDestinationId };
    if (step === 'esterilizacao') p = { ...p, package: released };
  }
  return p;
}

describe('codes', () => {
  it('issues codes with a check character and detects misreads', () => {
    let i = 0;
    const code = issueCode('ativo', () => [0.1, 0.5, 0.9, 0.3, 0.7, 0.2, 0.6][i++ % 7]!);
    expect(code).toMatch(/^AT-[2-9A-HJKMNP-Z]{7}[0-9A-Z]$/);
    expect(parseCode(code)).toMatchObject({ kind: 'ativo', problem: null });
    const typo = code.slice(0, 4) + (code[4] === 'A' ? 'B' : 'A') + code.slice(5);
    expect(parseCode(typo).problem).toMatch(/Dígito verificador/);
    expect(checkChar('AT' + code.slice(3, 10))).toBe(code.at(-1));
  });

  it('accepts scanner add-ons and the package and load formats already in use', () => {
    expect(parseCode(']C0av1-261009-01-03\r\n')).toMatchObject({ code: 'AV1-261009-01-03', kind: 'pacote', symbology: 'code128', problem: null });
    expect(parseCode('*AV1-261009-01*')).toMatchObject({ code: 'AV1-261009-01', kind: 'carga', symbology: 'code39' });
    expect(parseCode('HOSP-000123')).toMatchObject({ kind: 'externo', problem: null });
    expect(parseCode('   ').problem).toBe('Leitura vazia.');
    expect(parseCode('AT-12').problem).toMatch(/incompleto/);
    expect(parseCode('<script>').problem).toMatch(/caracteres/);
  });
});

describe('processing flow', () => {
  it('follows reception → cleaning → inspection → preparation → packaging → load', () => {
    const p = walk([['recepcao'], ['limpeza'], ['inspecao', { outcome: 'aprovado' }], ['preparo'], ['embalagem'], ['esterilizacao']]);
    expect(p).toMatchObject({ lastStep: 'esterilizacao', state: 'em_processo' });
  });

  it('refuses skipping a mandatory step, repeating one, or moving without reception', () => {
    const received = walk([['recepcao']]);
    expect(decideScan(received, { step: 'inspecao', today }, config)).toMatchObject({ result: 'etapa_incorreta', message: 'Etapa obrigatória pendente: Limpeza.' });
    expect(decideScan(received, { step: 'recepcao', today }, config).result).toBe('duplicada');
    expect(decideScan(fresh, { step: 'limpeza', today }, config)).toMatchObject({ result: 'etapa_incorreta', message: 'Material sem recepção registrada na CME.' });
    expect(decideScan(received, { step: 'liberacao', today }, config).result).toBe('etapa_incorreta');
  });

  it('sends a failed inspection back to cleaning or discards it', () => {
    const cleaned = walk([['recepcao'], ['limpeza']]);
    expect(decideScan(cleaned, { step: 'inspecao', today }, config).result).toBe('requer_conferencia');
    expect(decideScan(cleaned, { step: 'inspecao', today, outcome: 'relimpeza' }, config).apply?.nextSteps).toEqual(['limpeza']);
    expect(decideScan(cleaned, { step: 'inspecao', today, outcome: 'descarte' }, config).apply).toMatchObject({ state: 'descartado', closes: true });
  });

  it('lets nothing leave before release, and blocks recalled, rejected or expired packages', () => {
    const loaded = walk([['recepcao'], ['limpeza'], ['inspecao', { outcome: 'aprovado' }], ['preparo'], ['embalagem'], ['esterilizacao']]);
    const pending = { ...loaded, package: { ...released, loadStatus: 'aguardando' as const, cycleStarted: false } };
    expect(decideScan(pending, { step: 'distribuicao', today, destinationId: 's1' }, config)).toMatchObject({ result: 'carga_nao_liberada', message: /em montagem/ });
    expect(decideScan({ ...loaded, package: { ...released, recalled: true } }, { step: 'distribuicao', today, destinationId: 's1' }, config).result).toBe('bloqueado');
    expect(decideScan({ ...loaded, package: { ...released, loadStatus: 'rejeitada' } }, { step: 'armazenamento', today }, config).result).toBe('bloqueado');
    expect(decideScan({ ...loaded, package: { ...released, expiresOn: '2026-10-01' } }, { step: 'distribuicao', today, destinationId: 's1' }, config).message).toMatch(/vencida em 01\/10\/2026/);
    // A rejected load sends its packages back to reception.
    expect(decideScan({ ...loaded, package: { ...released, loadStatus: 'rejeitada' } }, { step: 'recepcao', today }, config).apply).toMatchObject({ closes: true, opens: true });
  });

  it('honours the configured optional steps and the destination checked at separation', () => {
    expect(postReleaseSteps(config, null)).toEqual(['armazenamento', 'separacao', 'distribuicao']);
    expect(postReleaseSteps({ storageRequired: true, separationRequired: true }, null)).toEqual(['armazenamento']);
    expect(postReleaseSteps({ storageRequired: false, separationRequired: true }, 'armazenamento')).toEqual(['separacao']);
    const strict = { storageRequired: true, separationRequired: true };
    const loaded = walk([['recepcao'], ['limpeza'], ['inspecao', { outcome: 'aprovado' }], ['preparo'], ['embalagem'], ['esterilizacao']], fresh, strict);
    expect(decideScan(loaded, { step: 'distribuicao', today, destinationId: 's1' }, strict).message).toBe('Etapa obrigatória pendente: Armazenamento.');
    const separated = walk([['armazenamento'], ['separacao', { destinationId: 'cc' }]], loaded, strict);
    expect(decideScan(separated, { step: 'distribuicao', today, destinationId: 'uti' }, strict).result).toBe('destino_incompativel');
    expect(decideScan(separated, { step: 'distribuicao', today, destinationId: 'cc' }, strict).apply?.state).toBe('distribuido');
  });

  it('handles returns: back to stock when intact, otherwise a new round from reception', () => {
    const out = walk([['recepcao'], ['limpeza'], ['inspecao', { outcome: 'aprovado' }], ['preparo'], ['embalagem'], ['esterilizacao'], ['distribuicao', { destinationId: 'cc' }]]);
    expect(decideScan(out, { step: 'devolucao', today, outcome: 'retorno_estoque' }, config).apply?.state).toBe('liberado');
    expect(decideScan(out, { step: 'devolucao', today, outcome: 'reprocessar' }, config).apply).toMatchObject({ state: 'devolvido', closes: true });
    // A used package comes back dirty: reception closes the round and opens a new one.
    expect(decideScan(out, { step: 'recepcao', today }, config).apply).toMatchObject({ closes: true, opens: true });
    const expired = { ...out, state: 'liberado' as const, lastStep: 'devolucao' as const, package: { ...released, expiresOn: '2026-10-01' } };
    expect(decideScan(expired, { step: 'devolucao', today, outcome: 'reprocessar' }, config).result).toBe('aceita');
    expect(decideScan(expired, { step: 'distribuicao', today, destinationId: 'cc' }, config).result).toBe('bloqueado');
  });

  it('blocks reception of an asset in maintenance and assembly of a started load', () => {
    expect(decideScan({ ...fresh, assetBlocked: 'Caixa em manutenção.' }, { step: 'recepcao', today }, config)).toMatchObject({ result: 'bloqueado', message: 'Caixa em manutenção.' });
    expect(checkAssembly({ cycleStarted: true, status: 'aguardando', sterilizerActive: true })).toMatch(/já começou/);
    expect(checkAssembly({ cycleStarted: false, status: 'aguardando', sterilizerActive: false })).toMatch(/bloqueado/);
    expect(checkAssembly({ cycleStarted: false, status: 'aguardando', sterilizerActive: true })).toBeNull();
  });
});
