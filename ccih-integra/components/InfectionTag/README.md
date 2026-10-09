# InfectionTag

Chip de tipo de IRAS com a cor fixa da entidade: IPCS, PAV, ITU-AC, ISC ou Outras.

**Props**: `type` — `'IPCS' | 'PAV' | 'ITU-AC' | 'ISC' | 'OUTRA'`; `showName` — mostra o nome por extenso ao lado da sigla.

- Use sempre que uma linha de tabela, notificação ou legenda se refere a um tipo de infecção.
- A cor vem dos tokens `iras-*`; o texto fica em `ink` — a cor nunca carrega o significado sozinha.
- `Integra.IRAS[type]` traz sigla, nome, token e dispositivo associado para uso em outros componentes.
