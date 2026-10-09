# Arquitetura — CCIH Integra

## Visão geral

```
ccih-integra/          Design system publicado (fonte dos tokens; referência visual)
packages/domain        Regras, configuração, referências e motor de indicadores — TypeScript puro
packages/ui            Componentes React do design system (tokens gerados de ccih-integra/tokens.json)
apps/web               Aplicação React (Vite) — telas, navegação, porta de dados
apps/api               (Fase 2) API Fastify + PostgreSQL: autenticação, RBAC, auditoria, persistência
scripts/               Geração de tokens e utilidades de build
docs/                  Auditorias e roadmap
```

Dependências apontam para dentro: `web → ui → domain`, `api → domain`. O domínio não conhece React, HTTP nem banco.

## Camadas

| Camada | Responsabilidade | Não faz |
| --- | --- | --- |
| `@ccih/domain` | Cálculo de indicadores, avaliação de metas, regras de dispositivo, cirurgia, CME, bundles e insumos, datas no fuso da instituição, proveniência e referências | Não decide valores clínicos: recebe parâmetros configurados; sem parâmetro responde "sem regra" |
| `@ccih/ui` | Apresentação acessível (status com ícone + palavra, gráficos com tabela e teclado, estados de carregando/vazio/erro) | Não calcula regra de negócio: recebe avaliações prontas |
| `apps/web` | Telas, filtros (na URL), composição, porta de dados (`CcihDataSource`) | Não importa mocks diretamente: usa a porta |
| `apps/api` (Fase 2) | Autorização no servidor, persistência, auditoria, integração | Não confia em filtros vindos do cliente |

## Fonte de dados desacoplada

A interface só conhece `CcihDataSource` (`apps/web/src/data/port.ts`). Implementações:

- `DemoDataSource` — dados sintéticos determinísticos, marcados `origin: 'demo'`. A interface exibe a faixa **AMBIENTE DE DEMONSTRAÇÃO** e etiquetas de dado/meta de demonstração.
- `ApiDataSource` (Fase 2) — HTTP para `apps/api`, sessão por cookie `HttpOnly`.

`VITE_DATA_SOURCE` escolhe a fonte. Build de produção **sem** essa variável não inicia (nunca cai para demo por engano).

## Fonte única de verdade dos indicadores

Fatos mensais por setor (`FactRow`: período, setor, contagens) → `computeIndicator` / `computeForPeriods` / `computeSeries` → telas. Painel, catálogo, relatórios e exportações usam o mesmo motor; nenhuma tela calcula fórmula própria. Taxas são sempre recalculadas a partir das contagens somadas (nunca média de taxas).

## Configuração institucional

`InstitutionalConfig` = fuso horário + metas (`IndicatorTarget`, com origem e aprovador) + parâmetros de regra (`RuleParameter`, cada um ligado a uma `ClinicalReference` com versão, fonte, validação e status). Política de liberação de cargas da CME também é configuração. A Fase 2 move isso para tabelas versionadas editáveis em Administração, com auditoria.

## Backend (Fase 2) — decisões

- **Fastify + TypeScript**, validação de entrada com esquemas (allowlist de campos → sem mass assignment).
- **PostgreSQL 16** com migrações versionadas (Prisma Migrate) e seed sintético.
- **Autenticação**: sessão em cookie `HttpOnly; Secure; SameSite=Strict`, senha argon2id, bloqueio por tentativas, timeout por inatividade, MFA opcional; preparado para SSO (OIDC) institucional.
- **Autorização**: RBAC com permissões granulares + escopo por unidade/setor aplicado em toda consulta (anti-IDOR); dados identificados exigem permissão própria.
- **Auditoria**: `audit_log` somente-inserção com encadeamento de hash; toda alteração crítica gravada na mesma transação.
- **CSRF**: SameSite=Strict + token de dupla submissão para métodos de escrita.
- **Interoperabilidade**: camada `integrations/` com adaptadores (prontuário eletrônico, LIS, ERP) que convertem para o modelo interno; conceitos compatíveis com HL7 FHIR (Patient, Encounter, Device, Procedure, Observation, DiagnosticReport, MedicationRequest) sem acoplamento prematuro.

## Desempenho

- Rotas secundárias carregadas sob demanda (`lazy`).
- Cache de consultas (React Query) com `staleTime`; filtros na URL evitam refetch desnecessário.
- Tabelas paginadas; agregações pesadas no servidor a partir da Fase 2.
- Fontes locais, apenas subconjuntos latin/latin-ext.

## Tratamento de erros

`ErrorBoundary` por rota (mensagem compreensível, sem stack trace, botão de tentar novamente), estados de erro com retry em gráficos e tabelas, log técnico sem dados de paciente.
