# AlertBanner

Faixa de alerta com fato e ação: surto, carga bloqueada, teste pendente, confirmação.

**Props**: `tone` — `info` | `ok` | `warn` | `crit`; `title` — o fato numa frase; `children` — a ação esperada; `actions` — botões (`Button size="sm"`).

- `crit` usa `role="alert"` e é reservado a surto, ruptura da cadeia de esterilização ou risco imediato ao paciente.
- Um banner crítico por página; mais que isso vira lista de pendências.
- Não feche automaticamente alertas críticos.
