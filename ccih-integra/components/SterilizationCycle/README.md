# SterilizationCycle

Ciclo de esterilização com parâmetros físicos, testes (Bowie-Dick, indicadores químicos e biológico) e decisão de liberação da carga.

**Props**: `equipamento`, `ciclo`, `data`, `metodo`; `parametros` — `[{ nome, valor }]`; `testes` — `[{ tipo, detalhe?, resultado: 'aprovado'|'reprovado'|'pendente' }]`; `itens` — nº de itens; `implantavel`; `operador`; `actions`.

- Qualquer teste reprovado bloqueia a carga e pede recolhimento.
- Carga com implantável e IB pendente nunca aparece como liberada.
- O consumidor decide o que fazer com a carga bloqueada (abrir não conformidade, listar pacientes expostos).
