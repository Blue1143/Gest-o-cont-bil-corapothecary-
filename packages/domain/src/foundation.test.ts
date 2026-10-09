import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, hasPermission } from './permissions';
import { RULE_PARAMETERS, getRuleSpec, parametersFromRules, rulesFromParameters, validateRuleValue } from './rule-registry';

describe('permissions', () => {
  it('grants every permission to admin and only known permissions to all roles', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toEqual(ALL_PERMISSIONS);
    for (const perms of Object.values(DEFAULT_ROLE_PERMISSIONS)) for (const p of perms) expect(ALL_PERMISSIONS).toContain(p);
  });

  it('applies least privilege to restricted profiles', () => {
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.cme, 'dashboard:view')).toBe(false);
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.cme, 'cme:release')).toBe(true);
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.gestor, 'patient:view_identified')).toBe(false);
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.consulta, 'export:aggregate')).toBe(false);
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.auditor, 'config:targets:edit')).toBe(false);
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.auditor, 'audit:view')).toBe(true);
  });
});

describe('rule registry', () => {
  it('has unique keys', () => {
    expect(new Set(RULE_PARAMETERS.map((s) => s.key)).size).toBe(RULE_PARAMETERS.length);
  });

  it('validates values in pt-BR', () => {
    const window = getRuleSpec('surgery.prophylaxisWindowMin')!;
    expect(validateRuleValue(window, 60)).toBeNull();
    expect(validateRuleValue(window, 0)).toMatch(/entre 1 e 240/);
    expect(validateRuleValue(window, 1.5)).toMatch(/inteiro/);
    const byDrug = getRuleSpec('surgery.prophylaxisWindowByDrugMin')!;
    expect(validateRuleValue(byDrug, { vancomicina: 120 })).toBeNull();
    expect(validateRuleValue(byDrug, { '<script>': 120 })).toMatch(/inválido/);
    expect(validateRuleValue(byDrug, [1])).toMatch(/pares/);
  });

  it('round-trips between stored rows and InstitutionalRules', () => {
    const rows = [{ key: 'surgery.prophylaxisWindowMin', value: 60, referenceId: 'r1' }, { key: 'desconhecida', value: 1, referenceId: null }];
    const rules = rulesFromParameters(rows);
    expect(rules.surgery.prophylaxisWindowMin).toEqual({ value: 60, referenceId: 'r1' });
    expect(parametersFromRules(rules)).toEqual([rows[0]]);
  });
});
