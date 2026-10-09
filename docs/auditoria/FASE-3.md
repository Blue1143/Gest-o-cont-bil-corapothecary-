# Fase 3 — Core clínico: verificação e achados

Data: 09/10/2026 · Escopo: pacientes, internações e movimentações, dispositivos, censo diário, vigilância de IRAS, cirurgias, microbiologia, evolução CCIH, consolidação de indicadores, cadastro de unidades/setores/leitos e E2E.

## Entregue

| Requisito | Implementação | Verificação |
| --- | --- | --- |
| Modelo clínico | Migração `0002_clinical` (14 tabelas), índices únicos parciais (uma internação aberta por paciente, um paciente por leito), `data_origin` em todo registro | Seed sintético + 42 testes de API contra PostgreSQL |
| LGPD — identificação | Iniciais + prontuário por padrão; nome completo opcional cifrado (AES-256-GCM, chave fora do banco); exibição com permissão própria, motivo e log `view_identified`; log nunca guarda o nome nem o texto cifrado | Testes de API (cifrado no banco, ausente das respostas e do log, 403 sem permissão) e de interface |
| Internação e movimentação | Admissão, transferência (fecha e abre permanência no mesmo instante), saída com desfecho (dispositivos em uso encerrados e auditados), leito ocupado bloqueado | Testes de API e E2E |
| Dispositivos | Inserção/retirada com sítio, indicação e motivo; dia de uso (D1 = inserção); um VM/SVD ativo por vez | Testes de API, E2E (D4 exibido) |
| Censo diário | Ocupação e paciente-dia/dispositivo-dia calculados das permanências no horário de censo configurado (`admissions.censusHour`); sem parâmetro, nada é calculado e a tela explica | Testes de domínio (fuso, transferência no meio do período) e de API (regra ausente → configuração inicial) |
| Vigilância IRAS | Suspeita → investigação → confirmação/descarte; reabertura com `iras:decide`; justificativa sempre; confirmação exige critério, decisão sobre associação a dispositivo e vínculos (dispositivo/cirurgia da mesma internação); critério congelado com marcação "Requer validação institucional"; histórico somente inserção | Testes de domínio, API (transições, permissões, vínculo de outra internação recusado, DELETE no histórico falha) e E2E do fluxo completo |
| Apoio à decisão | Dia de internação, elegibilidade pelos parâmetros configurados, dia do dispositivo no evento — sem classificar o caso | Testes de domínio e interface |
| Cirurgias | Registro completo, índice de risco (com fatores ausentes explícitos), antibioticoprofilaxia pela janela institucional (prévia no formulário), janela de vigilância de ISC, filtros por procedimento/cirurgião/classificação | Testes de API e navegador |
| Microbiologia | Coleta, resultado versionado (correção = nova versão com justificativa), isolados, antibiograma, perfil MDR/XDR/PDR informado, filtros por material/resultado/microrganismo/multirresistentes | Testes de API (versões, filtro de resistentes pela versão vigente) |
| Evolução CCIH | Avaliação, conduta, recomendação, acompanhamento; retificação aponta para o original (que continua visível); somente inserção | Testes de API (UPDATE falha) e interface |
| Consolidação | Fatos mensais de IRAS (por tipo, associadas a dispositivo), denominadores, MDR novos, investigações abertas (estoque no fim do mês), profilaxia e ISC em cirurgia limpa; substitui só o que foi calculado; auditada; o seed usa o mesmo caminho | Testes de domínio, de dados sintéticos e de API |
| Escopo por setor | Listas, detalhes, censo e escrita limitados aos setores do usuário; fora do escopo → 404 | Teste de API com usuário restrito à UTI Coronariana |
| Organização | Unidades, setores e leitos em Administração (intervalos de leitos, desativação bloqueada se ocupado), com justificativa e auditoria | Testes de API e interface |
| E2E | Playwright: admissão → dispositivo → suspeita → investigação → confirmação; perfis sem permissão | 2 testes; job próprio na CI com senha aleatória mascarada |

## Achados durante a validação (corrigidos)

| ID | Sev. | Achado | Correção |
| --- | --- | --- | --- |
| F3-01 | A | Após registrar um paciente, o aviso "Descartar alterações?" bloqueava o redirecionamento para a página do paciente (o guarda ainda considerava o formulário sujo). Encontrado pelo E2E. | O guarda é liberado antes da navegação (estado `createdId` + efeito). |
| F3-02 | M | Um parâmetro de regra criado por versão nova (horário do censo) não podia ser configurado em instalações existentes: a API só atualizava linhas já existentes. | `PUT /config/rules/:key` aceita a primeira configuração (`rowVersion: null`), auditada como criação; teste cobrindo regra ausente. |
| F3-03 | M | A retirada de dispositivo enviava versão fixa do registro (controle de concorrência inócuo). | `rowVersion` exposto no DTO do dispositivo e usado na retirada. |
| F3-04 | B | Rolagem horizontal de 93 px na página da cirurgia em 390 px (etiqueta de proveniência longa). | Fonte do P75 em texto comum + etiqueta curta. |
| F3-05 | B | Contadores por situação na Vigilância ocupavam uma linha cada no celular. | Grade própria com 2 colunas em telas estreitas. |
| F3-06 | B | Retorno de mutações (id criado) lido por closure — frágil a re-renderizações. | `useAdminMutation` passou a ser genérico no tipo de saída. |

## Execução no navegador (API real + banco de demonstração)

Pacientes, página do paciente (todas as seções), Vigilância IRAS e caso, Cirurgias e cirurgia, Microbiologia e cultura, Censo e Visão Geral verificados no Chromium em 1366 px (tema claro) e 390 px (tema escuro): sem erros de console, sem requisições com erro e sem rolagem horizontal. E2E também executado no modo CI (API compilada + `vite preview`).

## Pendências conscientes

- **Integrações** (prontuário eletrônico, LIS, ADT): entrada manual por enquanto; a coluna `culture.origin` já distingue `manual`/`lis` (Fase 7).
- **Vigilância pós-alta de ISC** (`ssi_followup`) e **manutenção de dispositivos** (`device_maintenance`, base dos bundles): Fase 4.
- **Critérios diagnósticos estruturados** (`iras_criterion_set`, achados por critério): só depois que a instituição validar as referências; hoje o critério é a referência escolhida, congelada na decisão.
- **Readmissão por usuário com escopo restrito** de um paciente que nunca passou pelos seus setores: o cadastro informa que o prontuário já existe; a readmissão é feita por perfil com acesso ao paciente.
- **Leitura de prontuário** não gera registro no log (apenas a exibição do nome completo e todas as alterações); registro de leitura e painel de acessos por paciente: Fase 8.
- **Transferência para setor fora do escopo** do usuário é recusada (o usuário perderia o acesso no meio do registro); fluxos entre equipes serão revistos com a Central de Alertas (Fase 4).
