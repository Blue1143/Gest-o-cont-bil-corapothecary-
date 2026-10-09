# StatusBadge

Selo de status com ícone e palavra — a única forma de mostrar Conforme, Atenção, Crítico ou Sem dado.

**Props**: `status` — `ok` | `warn` | `crit` | `neutral` | `info`; `children` — texto opcional que substitui o rótulo padrão (ex.: "IB negativo", "MDR · KPC").

- O texto deve continuar dizendo o estado: "Profilaxia não conforme", não só "Profilaxia".
- Nunca use só a cor de fundo sem o selo.
- Para calcular o status de um indicador, use `Integra.statusFor(valor, meta, direção)`.
