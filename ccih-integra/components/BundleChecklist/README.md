# BundleChecklist

Auditoria de bundle (CVC, PAV, ITU-AC, ISC) com respostas Sim / Não / N/A e resultado tudo-ou-nada.

**Props**: `title`; `setor`, `data`, `auditor`; `itens` — `[{ texto, resposta: 'sim'|'nao'|'na'|null }]`; `editable` (padrão `true`); `onChange(respostas)`.

- Um único "Não" torna o registro não conforme; itens sem resposta deixam a auditoria incompleta.
- Textos dos itens no imperativo descritivo do protocolo, curtos e verificáveis.
