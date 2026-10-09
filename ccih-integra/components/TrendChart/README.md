# TrendChart

Gráfico de linhas para evolução mensal de indicadores, com meta, limite de controle, tooltip e visão de tabela.

**Props**: `title`, `subtitle`; `labels` — períodos (`'jan/26'`); `series` — `[{ name, color, values }]`, onde `color` é um token (`iras-ipcs`, `primary`…); `unit`; `decimals`; `target`, `targetLabel`; `limit` — número ou array por período (limite superior do gráfico U), `limitLabel`; `height` (padrão 220); `yMax`; `footnote`.

- Uma única escala Y. Indicadores de unidades diferentes vão em gráficos separados.
- Até 4 séries recebem rótulo direto na ponta; acima disso, só legenda.
- Para tipos de IRAS, use sempre `color: 'iras-…'` para manter a cor da entidade.
- Teclado: foque o gráfico e use ← → para percorrer os meses; Esc fecha o tooltip.
