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

## Commits

Mensagens no imperativo, curtas, explicando o porquê quando não for óbvio. Não inclua segredos, `.env` nem dumps de banco.

## Estrutura de testes

| Nível | Onde | Ferramenta |
| --- | --- | --- |
| Unitário (regras, cálculos, formatação) | `packages/domain/src/**/*.test.ts` | Vitest |
| Componentes | `packages/ui/src/**/*.test.tsx` | Vitest + Testing Library |
| Aplicação (rotas, filtros, fonte de dados) | `apps/web/src/**/*.test.tsx` | Vitest + Testing Library |
| Integração API | `apps/api` (Fase 2) | Vitest + PostgreSQL de teste |
| E2E (fluxos IRAS e CME) | `e2e/` (Fase 3+) | Playwright |
