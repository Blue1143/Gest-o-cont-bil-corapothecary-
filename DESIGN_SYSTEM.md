# Design system — CCIH Integra

O design system publicado (artifact) e a pasta `ccih-integra/` são a **referência visual e a fonte dos tokens**. O código usa o pacote `@ccih/ui`.

## Fonte única dos tokens

`ccih-integra/tokens.json` → `npm run tokens` → `packages/ui/src/styles/tokens.generated.css`.
`npm run build` executa `tokens:check` e falha se o CSS gerado estiver desatualizado. Nunca edite o arquivo gerado nem escreva cores, tamanhos ou espaçamentos fixos no CSS: use as variáveis (`var(--primary)`, `var(--space-4)`, `var(--text-label-size)`…).

Além das cores, espaçamentos, raios, sombras e alturas, o gerador expõe cada estilo tipográfico como variáveis (`--text-kpi-size`, `--text-kpi-line`, `--text-kpi-weight`) e classes (`.text-kpi`).

## Regras que não mudam

- Temas claro e escuro com os mesmos nomes de token; `data-theme` no `<html>` ou preferência do sistema.
- IBM Plex Sans e Mono, servidas localmente (`@fontsource`).
- Status sempre com ícone + palavra (`StatusBadge`); nunca cor sozinha.
- Cor fixa por tipo de IRAS: `iras-ipcs`, `iras-pav`, `iras-itu`, `iras-isc`, `iras-outras`. A cor segue a entidade, nunca a posição.
- `serie-*` só para marcas de gráfico, nunca para texto.
- Todo gráfico: título, descrição, período, unidade, legenda (2+ séries), tooltip acessível por teclado, estado vazio e "Visualizar tabela".
- Proveniência visível: `EnvironmentBanner` em demonstração; `ProvenanceTag` distingue dado de demonstração, meta institucional, meta de demonstração, parâmetro configurável, referência regulatória e "Requer validação institucional".

## Componentes (`@ccih/ui`)

| Grupo | Componentes |
| --- | --- |
| Base | `Button`, `Icon`, `StatusBadge`, `InfectionTag`, `ProvenanceTag`, `AlertBanner`, `EnvironmentBanner`, `Card` |
| Estados | `LoadingState`, `EmptyState`, `ErrorState` |
| Dados | `DataTable` (pesquisa, ordenação, paginação, seleção de colunas, densidade, exportação, estados), `KpiCard` |
| Gráficos | `ChartFrame`, `TrendChart`, `BarChart` |
| Registros | `PatientRecord`, `SurgeryRecord`, `SterilizationCycle`, `TraceTimeline` |
| Gestão | `TrainingProgress`, `BundleChecklist`, `SupplyStock` |

Componentes são de apresentação: recebem avaliações já calculadas por `@ccih/domain` (ex.: `evaluateProphylaxis`, `evaluateLoadRelease`, `evaluateTarget`).

## Diferenças em relação ao `bundle.js` do artifact

O artifact segue como vitrine. O pacote corrige os achados da auditoria da Fase 1 (`docs/auditoria/FASE-1.md`): regras sem valores clínicos embutidos, "hoje" no fuso da instituição, profilaxia sem dado = "incompleto", IRIC incompleto sinalizado, checklist somente leitura de verdade, teclado no gráfico de barras, estados vazio/erro, fontes locais. Ao alterar tokens, atualize `ccih-integra/tokens.json` e republique o artifact.
