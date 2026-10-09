# TraceTimeline

Linha do tempo da rastreabilidade de uma caixa ou material, do expurgo ao uso no paciente.

**Props**: `item` — `{ codigo, descricao, lote }`; `etapas` — `[{ etapa, data?, responsavel?, detalhe?, status: 'ok'|'warn'|'crit'|'neutral' }]`.

- Use as sete etapas padrão (recepção, limpeza, inspeção e preparo, esterilização, armazenamento, distribuição, uso no paciente).
- `neutral` = etapa ainda não realizada (marcador tracejado). Qualquer `crit` mostra "Quebra na cadeia".
- A etapa de uso deve citar a cirurgia e o prontuário — é o elo que fecha a rastreabilidade.
