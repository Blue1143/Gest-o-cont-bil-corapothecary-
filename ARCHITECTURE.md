# Arquitetura — CCIH Integra

## Visão geral

```
ccih-integra/          Design system publicado (fonte dos tokens; referência visual)
packages/domain        Regras, configuração, referências, permissões e motor de indicadores — TypeScript puro
packages/demo-data     Gerador de dados sintéticos (usado pelo modo demo do web e pelo seed da API)
packages/ui            Componentes React do design system (tokens gerados de ccih-integra/tokens.json)
apps/web               Aplicação React (Vite) — telas, navegação, sessão, porta de dados
apps/api               API Fastify + PostgreSQL (Kysely): autenticação, RBAC, escopo, auditoria, configurações
scripts/               Geração de tokens e utilidades de build
docs/                  Auditorias e roadmap
```

Dependências apontam para dentro: `web → ui → domain`, `api → domain`, e `demo-data → domain`. O domínio não conhece React, HTTP nem banco; permissões e o registro de parâmetros ficam nele para que API e interface usem as mesmas definições.

## Camadas

| Camada | Responsabilidade | Não faz |
| --- | --- | --- |
| `@ccih/domain` | Cálculo de indicadores, avaliação de metas, regras de dispositivo, cirurgia, CME, bundles e insumos, datas no fuso da instituição, proveniência e referências | Não decide valores clínicos: recebe parâmetros configurados; sem parâmetro responde "sem regra" |
| `@ccih/ui` | Apresentação acessível (status com ícone + palavra, gráficos com tabela e teclado, estados de carregando/vazio/erro) | Não calcula regra de negócio: recebe avaliações prontas |
| `apps/web` | Telas, filtros (na URL), composição, porta de dados (`CcihDataSource`) | Não importa mocks diretamente: usa a porta |
| `apps/api` | Autenticação, autorização (permissão + escopo por setor) em todo endpoint, persistência, auditoria na mesma transação da alteração | Não confia em filtros, direções ou ids vindos do cliente |

## Fonte de dados desacoplada

A interface só conhece `CcihDataSource` (`apps/web/src/data/port.ts`). Implementações:

- `DemoDataSource` — dados sintéticos determinísticos, marcados `origin: 'demo'`. A interface exibe a faixa **AMBIENTE DE DEMONSTRAÇÃO** e etiquetas de dado/meta de demonstração.
- `ApiDataSource` — HTTP para `apps/api` (mesma origem via proxy), sessão por cookie `HttpOnly`, token CSRF no cabeçalho, portas `auth` (login, sessão) e `admin` (configurações, usuários, auditoria). Só existe com backend: no modo demo a Administração é somente leitura.

`VITE_DATA_SOURCE` escolhe a fonte. Build de produção **sem** essa variável não inicia (nunca cai para demo por engano).

## Fonte única de verdade dos indicadores

Fatos mensais por setor (`FactRow`: período, setor, contagens) → `computeIndicator` / `computeForPeriods` / `computeSeries` → telas. Painel, catálogo, relatórios e exportações usam o mesmo motor; nenhuma tela calcula fórmula própria. Taxas são sempre recalculadas a partir das contagens somadas (nunca média de taxas).

## Configuração institucional

`InstitutionalConfig` = fuso horário + metas (`IndicatorTarget`, com origem e aprovador) + parâmetros de regra (`RuleParameter`, cada um ligado a uma `ClinicalReference` com versão, fonte, validação e status). Política de liberação de cargas da CME também é configuração. Tudo fica em tabelas versionadas, editáveis em Administração, com auditoria; um parâmetro que ainda não existe (ex.: adicionado por uma versão nova) pode ser configurado pela primeira vez pela mesma tela.

## Core clínico (Fase 3)

- **Porta `clinical`** em `CcihDataSource`, presente só com o backend: o navegador nunca gera pacientes sintéticos. Sem ela, as telas clínicas explicam que o módulo exige a API.
- **Denominadores reais**: `censusOfDay`/`censusOfRange` (`@ccih/domain`) contam um paciente-dia para o setor onde o paciente está no horário de censo configurado (`admissions.censusHour`) e um dispositivo-dia para cada dispositivo em uso no mesmo instante. Sem o parâmetro, nada é calculado.
- **Consolidação**: `consolidateClinicalFacts` transforma permanências, dispositivos, casos (status no fim do mês para investigações abertas), cirurgias e isolados MDR em fatos mensais. A API (`POST /facts/consolidate`, `consolidateMonths`) substitui só as métricas calculadas e mantém as dos módulos ainda não implantados. O seed usa o mesmo caminho.
- **Fluxo de IRAS**: `IRAS_TRANSITIONS`, `transitionPermission` e `checkTransition` ficam no domínio e são aplicados pela API e pela interface; `irasContext` mostra a elegibilidade pelos parâmetros, sem classificar.
- **Datas**: o que o usuário digita em `datetime-local` é interpretado no fuso da instituição (`fromLocalInput`), não no do navegador; o servidor guarda instantes UTC.
- **DTOs** compartilhados (`clinical/dto.ts`) definem o contrato entre API e web.

## CCIH operacional (Fase 4)

- **Porta `operations`** em `CcihDataSource`, também só com o backend.
- **Domínio** (`packages/domain/src/operations`): transições de auditoria e não conformidade (`checkAuditTransition`, `checkNcTransition`), cobertura de treinamento (`requiredTrainings`, `coverageBySector`), estoque por lote e consumo (`stockByLot`, `dailyConsumption`, `evaluateStock`), avaliação de bundle (`evaluateBundle`) e candidatos de alerta (`buildAlertCandidates`) — funções puras, aplicadas pela API e mostradas pela interface.
- **Alertas**: `services/alerts.ts` coleta os candidatos dos registros, faz upsert por `dedup_key` numa transação com *advisory lock*, respeita a supressão após o encerramento e encerra automaticamente o que deixou de valer. A geração roda sob demanda (lista, contador ou `POST /alerts/refresh`), limitada a uma vez por minuto por instituição; chamadas simultâneas aguardam a mesma execução.
- **Consolidação**: `consolidateOperationalFacts` gera os fatos de bundles, higiene das mãos, preparação alcoólica e treinamentos; `POST /facts/consolidate` junta clínicos e operacionais.
- **Senha obrigatória**: `requireAuth` bloqueia com 403 `troca_de_senha`; no cliente, `RequireSession` leva a `/conta` e o menu fica vazio até a troca.

## CME (Fase 5)

- **Porta `cme`** em `CcihDataSource`, só com o backend.
- **Domínio** (`packages/domain/src/cme`): validação de testes (`checkTestRecord`: lote e validade do indicador, Bowie-Dick só em vapor pré-vácuo, incubação/leitura/controle do IB), fluxo de decisão (`LOAD_TRANSITIONS`, `checkLoadDecision`: liberar só com a política permitindo), validade (`sterileUntil`), uso do pacote (`checkItemUse`), códigos (`loadCode`, `itemLabel`) e consolidação (`consolidateCmeFacts`). A avaliação continua sendo `evaluateLoadRelease` (Fase 1), agora ciente de equipamentos sem Bowie-Dick.
- **API** (`routes/cme.ts`, `repositories/cme.ts`): `evaluateLoads` monta, por carga, os testes vigentes (não substituídos), o registro físico e o último Bowie-Dick do dia anterior ao início do ciclo; a decisão reavalia dentro da transação e guarda a política aplicada. Escopo pelo setor do equipamento.
- **Anexos** (`services/attachments.ts`, `routes/attachments.ts`): corpo binário cru (sem multipart), tipo pelo conteúdo, armazenamento em disco fora da raiz web; servem testes da CME e turmas de treinamento.
- **Alertas**: `collectCme` alimenta `buildAlertCandidates`; candidatos de **evento** (`oneShot`: MDR novo, recolhimento) nunca são recriados depois de encerrados.

## Sessão no cliente

`SessionProvider` consulta `/auth/me` (que responde `{ authenticated: false }` para visitantes), expõe `can(...permissões)` e o motivo do fim da sessão (`saida`, `inatividade`, `expirada`). `RequireSession` e `Guard` fazem os redirecionamentos; o menu é filtrado por permissão. Ao sair ou expirar, o cache inteiro de consultas é descartado. `IdleWarning` avisa 2 minutos antes da expiração por inatividade e mantém a sessão viva enquanto há atividade real.

## Backend — decisões

- **Fastify + TypeScript**, validação de entrada com zod `strict` (campos desconhecidos recusados → sem mass assignment), mensagens pt-BR.
- **PostgreSQL 16 + Kysely** (consultas tipadas e parametrizadas, sem binários nativos de ORM), migrações versionadas no código e aplicadas pelo papel dono; o papel de aplicação recebe só DML.
- **Build**: esbuild empacota a API com os pacotes internos; dependências npm ficam externas.
- **Autenticação**: sessão em cookie `HttpOnly; Secure; SameSite=Strict` (token opaco, só o SHA-256 no banco), argon2id, bloqueio por tentativas, limite por IP, expiração ociosa e absoluta no servidor; preparada para SSO (OIDC) e MFA.
- **Autorização**: RBAC com permissões granulares + escopo por unidade/setor aplicado em toda consulta (anti-IDOR); dados identificados exigem permissão própria.
- **Auditoria**: `audit_log` somente-inserção (privilégio + trigger) com cadeia de hashes serializada por advisory lock; toda alteração crítica gravada na mesma transação, com antes/depois e justificativa obrigatória.
- **Concorrência**: `row_version` em toda configuração editável; conflito → 409 com mensagem para recarregar.
- **CSRF**: SameSite=Strict + token de dupla submissão para métodos de escrita.
- **Interoperabilidade**: camada `integrations/` com adaptadores (prontuário eletrônico, LIS, ERP) que convertem para o modelo interno; conceitos compatíveis com HL7 FHIR (Patient, Encounter, Device, Procedure, Observation, DiagnosticReport, MedicationRequest) sem acoplamento prematuro.

## Desempenho

- Rotas secundárias carregadas sob demanda (`lazy`).
- Cache de consultas (React Query) com `staleTime`; filtros na URL evitam refetch desnecessário.
- Tabelas paginadas; agregações pesadas no servidor a partir da Fase 2.
- Fontes locais, apenas subconjuntos latin/latin-ext.

## Tratamento de erros

`ErrorBoundary` por rota (mensagem compreensível, sem stack trace, botão de tentar novamente), estados de erro com retry em gráficos e tabelas, log técnico sem dados de paciente.
