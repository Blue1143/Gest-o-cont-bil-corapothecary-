# Modelo de dados — CCIH Integra

Modelo relacional (PostgreSQL 16). **Implementado na Fase 2** (migração `apps/api/src/db/migrations/0001_foundation.ts`): instituição, unidade, setor, leito, cargo/função, profissional, perfil, usuário, perfil do usuário, escopo do usuário, sessão, log de auditoria, referência clínica, parâmetro de regra, meta de indicador, política de liberação da CME e fatos mensais de indicadores. **Implementado na Fase 3** (migração `0002_clinical`): `patient`, `admission`, `admission_movement`, `device_use`, `procedure_catalog`, `surgery`, `culture`, `culture_result`, `isolate`, `susceptibility`, `iras_case`, `iras_case_status`, `iras_case_culture` e `ccih_note` (ver §2–§5; diferenças do modelo alvo na nota de cada seção). **Implementado na Fase 4** (migração `0003_operations`): bundles, higiene das mãos, auditorias de qualidade, não conformidades e planos de ação, alertas, treinamentos, insumos e `ssi_followup` (ver §4 e §7), além de `professional.sector_id` e `app_user.must_change_password`. **Implementado na Fase 5** (migração `0004_cme`): CME e rastreabilidade (ver §6) e `attachment`. As demais seções são o modelo alvo das fases seguintes. Convenções:

- Chave primária `id` UUID aleatório (`gen_random_uuid()`, não sequencial → sem enumeração). Números humanos (prontuário, ciclo, lote) são colunas próprias com índice único por instituição.
- Toda tabela de negócio tem `institution_id` (isolamento multi-instituição) e as editáveis têm `updated_at` e `row_version` (bloqueio otimista). Quem alterou e por quê fica no `audit_log`.
- Nada clínico é apagado fisicamente: `deleted_at` + motivo, sempre com registro em `audit_log`.
- Resultados críticos (teste de CME, resultado de cultura, status de IRAS, liberação de carga) **não são sobrescritos**: cada mudança cria nova linha de histórico/decisão e entra no `audit_log`.
- Todo dado carrega `data_origin` (`real` | `demo`); a interface sinaliza qualquer dado `demo`.

## 1. Institucional e acesso

| Tabela | Campos principais | Relações |
| --- | --- | --- |
| `institution` | nome, CNES, fuso horário (IANA) | 1—N unidades, usuários, configurações |
| `unit` | nome | N—1 instituição; 1—N setores |
| `sector` | nome, tipo (`uti`, `internacao`, `centro_cirurgico`, `cme`, `apoio`), ativo | N—1 unidade; 1—N leitos |
| `bed` | código, ativo | N—1 setor |
| `professional` | nome, conselho/registro, cargo/função | 0—1 usuário |
| `app_user` | login, hash de senha (argon2id), MFA, bloqueado, último acesso | N—N perfis; N—1 profissional |
| `role` | código (`admin`, `enf_ccih`, `infectologista`, `cme`, `auditor`, `gestor`, `consulta`) | N—N permissões |
| `permission` | código granular (`iras:confirm`, `cme:release_load`, `patient:view_identified`, `export:identified`…) | |
| `user_scope` | usuário × setor (`app_user.scope_all` = todos) | restringe linhas visíveis (anti-IDOR) |
| `session` | hash do token, hash do CSRF, último uso, expira em, IP, user-agent, revogação e motivo | N—1 usuário |
| `audit_log` | ver §6 | |

## 2. Paciente e assistência

| Tabela | Campos principais | Relações |
| --- | --- | --- |
| `patient` | nº prontuário, iniciais, nome completo (cifrado, opcional), data de nascimento ou faixa etária, sexo | 1—N internações, cirurgias |
| `admission` | entrada, saída, desfecho (`alta`, `obito`, `transferencia_externa`), diagnóstico principal (CID) | N—1 paciente; 1—N movimentos, dispositivos, culturas |
| `admission_movement` | setor, leito, início, fim, motivo | N—1 internação (transferências) |
| `device_type` | código (`CVC`, `PICC`, `VM`, `SVD`, …), conta para densidade (sim/não) | configurável |
| `device_use` | tipo, inserção (data/hora), local/sítio, indicação, profissional, retirada, motivo da retirada | N—1 internação; 1—N manutenções |
| `device_maintenance` | data/hora, ação, profissional, conformidade | N—1 device_use |
| `daily_census` | setor, data, pacientes-dia, dispositivo-dia por tipo | denominadores; gerado do movimento/dispositivo ou importado |

> **Fase 3:** o censo é **calculado** a partir de `admission_movement` e `device_use` no horário configurado (sem tabela `daily_census`; ela entra se houver importação de censo externo). Tipos de dispositivo são uma lista fixa (`CVC`, `PICC`, `VM`, `SVD`, `PAI`, `DRENO`, `OUTRO`); `device_type` configurável e `device_maintenance` ficam para a Fase 4 (bundles). Paciente tem `full_name_enc` (AES-256-GCM) e `initials`; no máximo uma internação aberta por paciente e um leito ocupado por vez (índices únicos parciais).

## 3. Vigilância de IRAS

| Tabela | Campos principais | Relações |
| --- | --- | --- |
| `iras_criterion_set` | tipo de IRAS, versão, fonte, vigência, validado por, status (`vigente`, `revisao_necessaria`, `arquivado`) | → `clinical_reference` |
| `iras_case` | tipo (`IPCS`, `PAV`, `ITU-AC`, `ISC`, `OUTRA`), status (`suspeita`, `em_investigacao`, `confirmada`, `descartada`), data do evento, setor de atribuição, critério aplicado (versão), profundidade (ISC) | N—1 internação; 0—1 cirurgia; N—N culturas, dispositivos, antimicrobianos |
| `iras_case_status_history` | status anterior/novo, justificativa, usuário, data | N—1 caso |
| `iras_case_finding` | tipo (sinal clínico, imagem, laboratório), valor, data | N—1 caso |
| `ccih_intervention` | data/hora, profissional, avaliação, conduta, recomendação, acompanhamento | N—1 caso ou internação |

> **Fase 3:** `iras_case` guarda o critério aplicado em `criterion_reference_id` + `criterion_snapshot` (título, versão, fonte, validado) congelado na decisão; `device_associated` é decisão da CCIH. O histórico é `iras_case_status` (somente inserção). Intervenções e evolução são `ccih_note` (tipos avaliação, conduta, recomendação, acompanhamento e retificação — esta aponta para a nota corrigida, somente inserção). Achados estruturados (`iras_case_finding`) e `iras_criterion_set` ficam para quando houver critérios validados pela instituição.

## 4. Cirurgia

| Tabela | Campos principais | Relações |
| --- | --- | --- |
| `procedure_catalog` | código, nome, especialidade, P75 de duração (fonte, versão) | |
| `surgery` | código, procedimento, cirurgião, sala, data, início, término, classificação, potencial de contaminação, ASA, implante, intercorrências | N—1 internação; 1—N profilaxias; N—N cargas/caixas |
| `surgical_prophylaxis` | fármaco, dose, horário, redose, suspensão | N—1 cirurgia |
| `surgery_material_use` | caixa/material, carga, horário | liga cirurgia ↔ CME |
| `ssi_followup` | data, meio de contato, achado, encerramento | N—1 cirurgia |

> **Fase 3:** a profilaxia fica em colunas de `surgery` (fármaco, horário da dose, duração, redose); `surgical_prophylaxis` (várias doses), e `surgery_material_use` (Fase 5) ainda não existem. **Fase 4:** `ssi_followup` (somente inserção) registra cada contato pós-alta (data, método, resultado: sem sinais / suspeita / não localizado) e pode apontar para o `iras_case` de ISC aberto a partir dele. `procedure_catalog.p75_source` registra a origem do P75 (no seed: valor de demonstração a substituir).

## 5. Microbiologia e antimicrobianos

| Tabela | Campos principais | Relações |
| --- | --- | --- |
| `culture` | material, coleta, setor, resultado, data do resultado, origem (manual / LIS) | N—1 internação |
| `isolate` | microrganismo, contagem, perfil (`MDR`, `XDR`, mecanismo configurável) | N—1 cultura |
| `susceptibility` | antimicrobiano, método, CIM, interpretação (S/I/R), versão do breakpoint | N—1 isolado |
| `antimicrobial_prescription` | fármaco, dose, via, intervalo, início, término previsto, indicação, prescritor, status | N—1 internação; N—N culturas |
| `antimicrobial_review` | data, revisor CCIH, recomendação (manter, descalonar, suspender…), aceita | N—1 prescrição |

> **Fase 3:** `culture_result` é versionado (`version`, correção exige `justification`); `isolate` e `susceptibility` pendem da versão do resultado. A interpretação S/I/R é a informada, com a versão do breakpoint. Antimicrobianos são da Fase 6.

## 6. CME e rastreabilidade

| Tabela | Campos principais | Relações |
| --- | --- | --- |
| `sterilizer` | nome, tipo (vapor pré-vácuo…), série, ativo | 1—N ciclos, testes diários |
| `instrument_set` | código da caixa, descrição, composição | 1—N processamentos |
| `processing_step` | etapa (recepção, limpeza, inspeção, preparo, embalagem, esterilização, liberação, armazenamento, distribuição, utilização), data/hora, responsável, resultado, observação | N—1 caixa/lote |
| `sterilization_cycle` | nº, programa, operador, início/fim, temperatura, pressão, tempo, resultado físico | N—1 equipamento; 1—1 carga |
| `sterilization_load` | código, contém implantável, status (`aguardando`, `liberada`, `retida`, `rejeitada`, `reprocessamento`) | 1—N itens |
| `load_item` | caixa/material, lote de embalagem | N—1 carga |
| `sterilization_test` | tipo (Bowie-Dick, IQ classe 1–6, IB, registro físico), lote e validade do indicador, incubação, controle, resultado, leitura, responsável, anexo | N—1 carga ou equipamento/dia |
| `load_release_decision` | status, motivo, política aplicada (versão), usuário, data | histórico imutável da liberação |

Rastreabilidade: `patient → surgery → surgery_material_use → load_item → sterilization_load → sterilization_cycle → sterilizer` + `sterilization_test`, e o caminho inverso pelas mesmas chaves.

> **Fase 5 (implementado):** cada **carga é uma execução de ciclo**: `sterilization_load` guarda os dados do ciclo (programa, início/término, temperatura, pressão, exposição, resultado físico, operador), sem tabela `sterilization_cycle` separada; reprocessar cria uma nova carga com `reprocessed_from_id`. `load_item` (somente inserção) recebe `label_code` único por instituição (`<carga>-<nn>`) e `expires_on`. `sterilization_test` é somente inserção: Bowie-Dick por equipamento e dia (`load_id` nulo), IQ 1–6 e IB por carga; leitura de IB e correções são novas linhas com `replaces_id` (único) e justificativa. `load_release_decision` (somente inserção) guarda de → para, motivo, `policy_snapshot` (versão + conteúdo da política) e a `evaluation` mostrada. O uso é `material_use` (o `surgery_material_use` do modelo alvo), com `surgery_id` opcional (uso no setor sem paciente), índice único parcial por pacote entre os usos não anulados e anulação com motivo. `processing_step` (recepção → distribuição) fica para depois. `attachment` (somente inserção) guarda nome exibido, tipo detectado pelo conteúdo, tamanho, SHA-256 e a chave do arquivo fora do banco.

## 7. Prevenção, qualidade e gestão

| Tabela | Finalidade |
| --- | --- |
| `bundle_template`, `bundle_item` | bundles configuráveis (método: tudo ou nada / por item) |
| `bundle_audit`, `bundle_audit_answer` | auditoria (setor, paciente opcional, auditor, data, evidência, conforme / não conforme / N/A) |
| `audit` | auditorias (tipo, workflow planejada → em andamento → concluída → plano de ação → verificação de eficácia → encerrada) |
| `nonconformity`, `action_plan` | não conformidade e plano (5W2H configurável) |
| `training`, `training_session`, `training_attendance` | treinamentos, turmas, presença, avaliação, evidência, validade |
| `supply`, `supply_lot`, `supply_movement` | insumos (categoria, unidade, fornecedor, local), lotes e validades, consumo |
| `outbreak`, `outbreak_case`, `outbreak_action` | investigação de surto |
| `alert` | alerta (origem, prioridade, responsável, status, ação, deduplicação por chave e janela) |

> **Fase 4 (implementado):** `bundle_template`/`bundle_item`/`bundle_audit`/`bundle_audit_answer` (a resposta guarda o texto do item na data, então editar o modelo não altera auditorias passadas; um modelo ativo por indicador; auditoria anulada com justificativa, nunca excluída); `hand_hygiene_observation` (oportunidades/ações); a auditoria do modelo alvo é `quality_audit` + `quality_audit_status`, e a não conformidade tem `nonconformity_status` — os dois históricos são somente inserção; `action_plan` guarda os campos 5W2H; `training` (público-alvo por função, validade, obrigatoriedade) com `training_session` e `training_attendance`; `supply`, `supply_lot` e `supply_movement` (livro-razão somente inserção com quantidade sinalizada; o estoque é a soma). `alert` tem índice único parcial por `dedup_key` entre os abertos e `link` para o registro de origem. `outbreak*` fica para a Fase 7.

## 8. Configuração e referências

| Tabela | Finalidade |
| --- | --- |
| `clinical_reference` | id, título, tipo, fonte, versão, atualização, validado por/em, status — base de qualquer regra |
| `rule_parameter` | chave (ex.: `surgery.prophylaxisWindowMin`), valor JSON, referência, vigência, aprovado por |
| `indicator_target` | indicador, valor, direção, faixa de atenção, origem (`institucional` / `demonstracao`), vigência, aprovado por |
| `load_release_policy` | testes obrigatórios, Bowie-Dick diário, retenção de implantáveis, referência, vigência |

## 9. Auditoria (log)

`audit_log`: `id`, `occurred_at`, `institution_id`, `user_id`, `user_login`, `action` (`login_success`, `login_failure`, `logout`, `session_expired`, `access_denied`, `create`, `update`, `delete`, `validate`, `unlock`, `export`, `seed`), `entity`, `entity_id`, `before` (JSON), `after` (JSON), `ip` (texto), `user_agent`, `context` (inclui a justificativa), `prev_hash`, `hash`.

- Somente `INSERT` para o papel da aplicação; `UPDATE`/`DELETE` bloqueados por permissão e por trigger.
- Encadeamento de hash (`hash = sha256(prev_hash || registro)`) torna adulteração detectável; verificação periódica.
- Nunca registra senhas, tokens ou conteúdo de anexos.

## 10. Indicadores

Indicadores não têm tabela de valores: são **derivados** de fatos pelo motor `computeIndicator` (numerador ÷ denominador × multiplicador). Na Fase 2, os fatos mensais por setor e métrica ficam em `indicator_fact` (carregados pelo seed sintético); a partir da Fase 3 eles passam a ser consolidados a partir das entidades clínicas (censo, casos, auditorias, ciclos). O catálogo (`INDICATORS`) define fórmula, unidade, direção e agregação (`fluxo` soma períodos; `estoque` usa o último). Metas ficam em `indicator_target`.
