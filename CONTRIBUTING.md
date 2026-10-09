# Contribuindo com o CCIH Integra

## Antes de abrir um PR

```bash
npm ci
npm run check   # lint + typecheck + testes + build
```

O PR só é aceito com tudo verde.

## Regras do projeto

1. **Nenhum critério clínico, meta ou norma no código.** Valores vêm de `InstitutionalConfig` e cada parâmetro aponta para uma `ClinicalReference` com versão, fonte e validação. Sem configuração, a regra responde "sem regra configurada".
2. **Indicadores só pelo motor** (`@ccih/domain`). Nada de fórmula dentro de componente.
3. **Componentes visuais não têm regra de negócio.** Recebem avaliações prontas.
4. **Telas não importam mocks.** Usam `CcihDataSource`.
5. **Dados de demonstração sempre identificados.** Nunca use dados reais de pacientes em testes, seeds ou capturas de tela.
6. **Status com ícone + palavra**; nunca só cor, tooltip ou hover.
7. **Tokens do design system**; nenhuma cor ou tamanho fixo novo.
8. **Exibir iniciais + prontuário** quando o nome completo não for necessário.
9. **Toda regra nova tem teste** (`*.test.ts` ao lado do código).
10. Textos de interface em pt-BR; identificadores de código em inglês.
11. **Toda rota da API declara a permissão exigida** (`requirePermission`) e filtra por instituição e escopo. Toda alteração de configuração exige justificativa, usa `row_version` e chama `audit()` na mesma transação.
12. Nova tabela = nova migração em `apps/api/src/db/migrations` (nunca editar uma migração já aplicada).
13. **Histórico não se edita**: status de IRAS, evoluções CCIH, resultados de cultura, status de auditorias e não conformidades, respostas de bundle, contatos pós-alta e movimentações de insumo são somente inserção; correção é um novo registro (ou anulação/ajuste) com justificativa. Tabela nova desse tipo entra em `APPEND_ONLY_TABLES`.
14. **Datas digitadas** usam o fuso da instituição (`toLocalInput`/`fromLocalInput`), nunca o do navegador.
15. Registros clínicos herdam `data_origin` da instituição: dado sintético nunca vira dado institucional.

## Commits

Mensagens no imperativo, curtas, explicando o porquê quando não for óbvio. Não inclua segredos, `.env` nem dumps de banco.

## Estrutura de testes

| Nível | Onde | Ferramenta |
| --- | --- | --- |
| Unitário (regras, cálculos, formatação) | `packages/domain/src/**/*.test.ts` | Vitest |
| Componentes | `packages/ui/src/**/*.test.tsx` | Vitest + Testing Library |
| Aplicação (rotas, filtros, fonte de dados) | `apps/web/src/**/*.test.tsx` | Vitest + Testing Library |
| Integração API | `apps/api/test` — banco `ccih_test` recriado a cada execução | Vitest + PostgreSQL 16 |
| E2E (IRAS, alertas, auditoria/NC, senha temporária; CME na Fase 5) | `e2e/` — `npm run e2e` | Playwright |
