# Fase 1.1 — Reauditoria antes da Fase 2

Data: 09/10/2026 · Escopo: estado do branch após o commit da Fase 1 (`3ac26ae`), com instalação limpa (`npm ci`), `npm run check`, `npm audit`, servidor de desenvolvimento e build de produção no Chromium.

## Resultado da execução

| Verificação | Antes | Depois |
| --- | --- | --- |
| Lint / typecheck / testes / build | Verdes (57 testes) | Verdes |
| `npm audit` (dependências de execução) | 2 moderadas — React Router 6 (open redirect GHSA-wrjc-x8rr-h8h6; injeção via `deserializeErrors`, só SSR) | **0** |
| `npm audit` (todas) | 14 (Vitest mocker path traversal, `braces` via typescript-eslint, `tinypool`) | **0** |
| Console do navegador em **dev** | 1 aviso: "React Router Future Flag Warning" (não aparecia no teste anterior, feito só no build de produção) | 0 |
| Console no build de produção | 0 | 0 |

## Achados e correções

| ID | Sev. | Achado | Correção |
| --- | --- | --- | --- |
| R-01 | A | React Router 6.30 com advisory de execução (open redirect). | Atualizado para React Router 7.18.4 (API de roteamento compatível; elimina também o aviso de future flag). |
| R-02 | M | Ferramentas de desenvolvimento com advisories (Vitest < 4.1.11, typescript-eslint < 8.47). | Vitest 4.1.11 e typescript-eslint 8.71.1. `overrides` fixa o Vite 6.4.4 em toda a árvore (o Vitest 4 puxava o Vite 8 e quebrava o npm). Lockfile regenerado; dependências diretas continuam com versão exata. |
| R-03 | M | O gerador de dados sintéticos entrava no bundle principal mesmo quando a fonte não fosse demo. | Fonte de demonstração carregada por `import()` dinâmico; inicialização assíncrona. |
| R-04 | A | Textos clínicos do design system (`ccih-integra/01`–`05`) apresentavam pontos de corte, prazos e normas como fato, sem status de validação. | Bloco "Status: Requer validação institucional" com fonte declarada, versão, validador e data em cada seção; artifact republicado. |
| R-05 | M | Catálogo sem indicadores de CME pedidos (ciclos realizados, não conformes, indicadores químicos, cargas retidas, reprocessamento, não conformidades). | 6 indicadores adicionados ao catálogo e aos fatos de demonstração; painel mostra IQ e cargas retidas. |
| R-06 | M | No celular, o painel era a versão desktop comprimida (requisito 32). | `Disclosure` (`<details>` nativo): blocos secundários recolhidos no celular, com resumo em texto ("2 fora da meta · 1 em atenção"); abertos no desktop. |

## Pendências conscientes (com fase)

| Item do pedido | Motivo | Fase |
| --- | --- | --- |
| Filtros de tipo de infecção, procedimento, cirurgião e dispositivo | Exigem os fatos derivados das entidades clínicas (casos, cirurgias, dispositivos), não só agregados mensais | 3 |
| Indicadores de ISC por procedimento, tempo médio de permanência de dispositivo, duração cirúrgica, distribuição por potencial de contaminação | Idem | 3 |
| Pareto, comparação mensal entre anos, heatmap | Dependem de dados de bundles/auditorias e de série histórica real | 4 e 7 |
| Filtros por coluna em tabelas | Entram com as tabelas de registros clínicos | 3 |
| Log de exportação, log de erros no servidor | Dependem da API | 2 |
| `bundle.js` do artifact ainda com os comportamentos antigos | É vitrine visual; o código usa `@ccih/ui` (ver DESIGN_SYSTEM.md) | — |
