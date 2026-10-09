# SupplyStock

Tabela de insumos de prevenção com cobertura em dias, validade e situação de reposição.

**Props**: `title`; `dataRef`; `itens` — `[{ insumo, unidade, estoque, consumoDia, minimoDias?, lote?, validade? }]`.

- Cobertura = estoque ÷ consumo diário. Abaixo do mínimo: Repor; abaixo da metade: Ruptura iminente.
- Validade em até 30 dias: Atenção; vencido: Crítico.
- Abre ordenada pelos itens mais críticos.
