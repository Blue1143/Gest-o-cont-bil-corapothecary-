# Button

Ação do usuário, com verbo no rótulo ("Notificar IRAS", "Recolher lote").

**Props**: `variant` — `secondary` (padrão), `primary`, `ghost`, `danger`; `size` — `md` (36px) ou `sm` (28px, dentro de cartões e tabelas); `icon` — nome de ícone do pacote (`table`, `chart`, `ok`, `warn`, `crit`, `info`); demais atributos de `<button>`.

- Um único `primary` por região da tela.
- `danger` só para ações que afetam pacientes ou lotes (recolher, bloquear).
- `ghost` para alternâncias leves dentro de cartões (ex.: Tabela ↔ Gráfico).
- Não use botão para navegação entre páginas; use link.
