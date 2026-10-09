# KpiCard

Cartão de indicador: valor do período, unidade, meta, status, variação e minitendência.

**Props**: `label`; `value`; `unit` (`‰`, `%`, `mL/pac-dia`); `decimals` (padrão 1); `target`; `direction` — `lower` (padrão) ou `higher`; `band` — tolerância da faixa de Atenção; `previous` e `previousLabel` para a variação; `spark` — array dos últimos períodos; `status` — força um status.

- O consumidor fornece os valores já calculados (densidade, taxa) — o cartão não calcula a fórmula.
- A seta de variação é verde quando melhora e vermelha quando piora, respeitando `direction`; o número fica em `ink`.
- Use em grade `ig-grid` (mínimo 220px por cartão). No máximo 6 KPIs na primeira linha.
