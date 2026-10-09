import { expect, test } from '@playwright/test';
import { DAY, localInput, login, watchProblems } from './support';

test.describe('fluxo de vigilância de IRAS', () => {
  test('admissão → dispositivo → suspeita → investigação → confirmação com critério e histórico', async ({ page }) => {
    const problems = watchProblems(page);
    const record = `E2E-${Date.now().toString(36).toUpperCase()}`;
    await login(page, 'enf.ccih');

    // 1. Patient with admission in the ICU four days ago.
    await page.getByRole('link', { name: 'Pacientes' }).click();
    await page.getByRole('button', { name: 'Registrar paciente' }).click();
    const form = page.locator('form.ig-form');
    await form.getByLabel(/^Prontuário \*$/).fill(record);
    await form.getByLabel(/^Iniciais \*$/).fill('TEE');
    await form.getByLabel(/^Sexo \*$/).selectOption('F');
    await form.getByLabel(/^Admissão \(data e hora\)/).fill(localInput(-4 * DAY));
    await form.getByLabel(/^Setor \*$/).selectOption({ label: 'UTI Adulto' });
    await form.getByRole('button', { name: 'Registrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(record);
    await expect(page.getByText('UTI Adulto').first()).toBeVisible();

    // 2. Central line inserted three days ago (device day shown).
    await page.getByRole('button', { name: 'Inserir dispositivo' }).click();
    await page.getByLabel(/^Inserção \*$/).fill(localInput(-3 * DAY));
    await page.getByLabel(/^Sítio \/ local/).fill('Veia jugular interna direita');
    await page.getByRole('button', { name: 'Registrar inserção' }).click();
    await expect(page.locator('.ig-days', { hasText: 'D4' })).toBeVisible();

    // 3. Suspicion linked to the device.
    await page.getByRole('link', { name: 'IRAS', exact: true }).click();
    await page.getByRole('button', { name: 'Registrar suspeita de IRAS' }).click();
    await page.getByLabel(/^Dispositivo relacionado/).selectOption({ index: 1 });
    await page.getByLabel(/Descrição clínica/).fill('Febre e calafrios após manipulação do cateter (teste E2E).');
    await page.getByLabel(/Justificativa/).fill('Busca ativa identificou critérios iniciais');
    await page.getByRole('button', { name: 'Registrar suspeita' }).click();
    await page.getByRole('link', { name: /\d{2}\/\d{2}\/\d{4}/ }).first().click();
    await expect(page.getByText('Suspeita', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Elegível pelos parâmetros configurados')).toBeVisible();

    // 4. Investigation, then confirmation with criterion and device decision.
    await page.getByRole('button', { name: 'Iniciar investigação' }).click();
    await page.getByLabel(/Justificativa/).fill('Revisão de prontuário e culturas iniciada');
    await page.getByRole('button', { name: 'Iniciar investigação' }).last().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Iniciar investigação' }).click();
    await expect(page.getByText('Em investigação', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Confirmar IRAS' }).click();
    const criterion = page.getByLabel(/^Critério diagnóstico aplicado/);
    await criterion.selectOption((await criterion.locator('option', { hasText: 'Critérios diagnósticos de IRAS' }).getAttribute('value'))!);
    await expect(page.getByText('Critério sem validação institucional')).toBeVisible();
    await page.getByLabel(/Sim \(entra na densidade/).check();
    await page.getByLabel(/Justificativa/).fill('Critérios atendidos após revisão da CCIH');
    await page.getByRole('button', { name: 'Confirmar IRAS' }).last().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar IRAS' }).click();

    await expect(page.getByText('Confirmada', { exact: true }).first()).toBeVisible();
    const history = page.locator('section', { has: page.getByRole('heading', { name: 'Histórico do caso' }) });
    await expect(history.getByText('Suspeita → Em investigação')).toBeVisible();
    await expect(history.getByText('Em investigação → Confirmada')).toBeVisible();
    await expect(page.getByText('Requer validação institucional').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar IRAS' })).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('perfis sem permissão não veem ações nem dados clínicos', async ({ page }) => {
    await login(page, 'auditor');
    await page.goto('/vigilancia?situacao=todas');
    await page.locator('table a[href^="/vigilancia/"]').first().click();
    await expect(page.getByRole('heading', { name: 'Histórico do caso' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Confirmar IRAS|Descartar|Editar dados|Iniciar investigação/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Sair' }).click();
    await login(page, 'gestor');
    await page.goto('/pacientes');
    await expect(page.getByText('Seu perfil não tem acesso a esta área')).toBeVisible();
  });
});
