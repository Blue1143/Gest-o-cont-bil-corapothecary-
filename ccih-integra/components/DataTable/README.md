# DataTable

Tabela de dados com cabeçalho fixo em `surface-sunken`, números alinhados à direita e ordenação por coluna.

**Props**: `columns` — `[{ key, label, align?, format?(valor, linha), render?(linha), sortValue?(linha), sortable? }]`; `rows`; `caption`; `dense`; `sortable` (padrão `true`); `initialSort` — `{ key, dir }`; `empty` — texto de estado vazio.

- Use `render` para colocar `StatusBadge`, `InfectionTag` ou código em `ig-mono` dentro da célula.
- Paciente sempre como iniciais + prontuário.
- Para listas longas, pagine fora do componente; a tabela não virtualiza.
