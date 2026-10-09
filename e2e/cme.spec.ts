import { expect, test } from '@playwright/test';
import { localInput, login, watchProblems } from './support';

test.describe('CME e rastreabilidade', () => {
  test('carga → ciclo → indicador → liberação → uso na cirurgia → rastreio até o paciente', async ({ browser }) => {
    // CME: plasma (Bowie-Dick não se aplica), assim o fluxo não depende do horário da execução.
    const cmePage = await (await browser.newContext()).newPage();
    const cmeProblems = watchProblems(cmePage);
    await login(cmePage, 'cme');
    await cmePage.goto('/cme');
    await cmePage.getByRole('button', { name: 'Nova carga' }).click();
    await cmePage.getByLabel(/^Equipamento \*/).selectOption({ label: 'Esterilizador a plasma (demonstração)' });
    await cmePage.getByLabel(/^Programa/).fill('Plasma — ciclo padrão');
    await cmePage.getByLabel(/^Início do ciclo/).fill(localInput(-90 * 60_000));
    await cmePage.getByLabel(/^Pacote 1: caixa/).selectOption({ label: 'Ótica 30° 10 mm' });
    await cmePage.getByRole('button', { name: 'Registrar carga' }).click();
    await expect(cmePage.getByRole('heading', { level: 1, name: /^Carga PL1-\d{6}-\d{2}/ })).toBeVisible();
    await expect(cmePage.getByRole('button', { name: 'Liberar' })).toBeDisabled();

    await cmePage.getByRole('button', { name: 'Encerrar ciclo' }).click();
    await cmePage.getByLabel(/^Registro físico/).selectOption('conforme');
    await cmePage.getByRole('button', { name: 'Encerrar ciclo' }).click();
    await expect(cmePage.getByText('Ciclo em andamento')).toHaveCount(0);

    await cmePage.getByRole('button', { name: 'Registrar teste' }).click();
    await cmePage.getByLabel(/^Lote do indicador/).fill('IQ5-E2E');
    await cmePage.getByLabel(/^Validade do indicador/).fill('2099-12-31');
    await cmePage.getByRole('button', { name: 'Registrar', exact: true }).click();
    await expect(cmePage.getByText('Pela política: pode ser liberada')).toBeVisible();

    await cmePage.getByRole('button', { name: 'Liberar' }).click();
    await cmePage.getByRole('button', { name: 'Continuar' }).click();
    await cmePage.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(cmePage.locator('.page-head').getByText('Liberada', { exact: true })).toBeVisible();
    await expect(cmePage.getByText(/Liberar — Liberada/)).toBeVisible();
    const label = (await cmePage.locator('td .ig-mono').filter({ hasText: /^PL1-\d{6}-\d{2}-01$/ }).innerText()).trim();
    expect(cmeProblems).toEqual([]);

    // Centro cirúrgico / CCIH: registra o pacote na cirurgia e rastreia até o paciente.
    const page = await (await browser.newContext()).newPage();
    const problems = watchProblems(page);
    await login(page, 'enf.ccih');
    await page.goto('/cirurgias');
    await page.locator('table a[href^="/cirurgias/"]').first().click();
    await expect(page.getByRole('heading', { name: 'Materiais da CME' })).toBeVisible();
    await page.getByLabel(/^Etiqueta do pacote/).fill(label.toLowerCase());
    await page.getByRole('button', { name: 'Registrar uso' }).click();
    await expect(page.getByRole('cell', { name: label, exact: true })).toBeVisible();
    await page.getByLabel(/^Etiqueta do pacote/).fill(label);
    await page.getByRole('button', { name: 'Registrar uso' }).click();
    await expect(page.getByText(/já utilizado/)).toBeVisible();

    await page.goto(`/rastreabilidade?q=${label}`);
    await expect(page.getByRole('heading', { name: `Pacote ${label}` })).toBeVisible();
    await expect(page.getByRole('cell').getByRole('link', { name: /Paciente .*, prontuário/ })).toBeVisible();
    expect(problems.filter((p) => !p.includes('400'))).toEqual([]);
  });
});
