# BarChart

Barras horizontais para comparar setores, especialidades ou tipos de IRAS, ordenadas do maior para o menor.

**Props**: `title`, `subtitle`; `data` — `[{ label, value, type?, color?, note? }]` (`type` pinta com a cor da IRAS; `note` aparece no tooltip); `unit`; `decimals`; `target`, `targetLabel`; `sort` (`false` mantém a ordem dada); `categoryLabel`, `valueLabel` para a visão de tabela.

- Rótulos de categoria curtos (até ~20 caracteres); o texto completo fica no tooltip.
- Barras de uma só métrica usam `primary`; use `type` apenas quando a cor identifica o tipo de IRAS.
- Não empilhe métricas diferentes na mesma barra.
