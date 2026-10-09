# CCIH Integra

Plataforma de gestão integrada da CCIH/SCIRAS: vigilância epidemiológica de IRAS, indicadores, bundles, auditorias, CME e rastreabilidade, microbiologia, stewardship de antimicrobianos e segurança do paciente.

> **Estado atual: Fases 1 e 2 concluídas.** Há front-end (React), API (Fastify) e banco (PostgreSQL) com autenticação, perfis de acesso aplicados no servidor, log de auditoria imutável e configurações editáveis. O banco de desenvolvimento é preenchido com **dados sintéticos**, sinalizados em toda tela. Os módulos clínicos (pacientes, IRAS, cirurgias, culturas) começam na Fase 3 — veja [docs/ROADMAP.md](docs/ROADMAP.md).

## O que já funciona

- **Acesso**: login com bloqueio por tentativas e limite por IP, sessão em cookie `HttpOnly`/`SameSite=Strict` com expiração por inatividade e tempo máximo, aviso antes de expirar, saída que limpa todos os dados em cache (estações compartilhadas).
- **Perfis (RBAC)**: Administrador, Enfermeiro CCIH, Médico infectologista, CME, Auditor, Gestor e Consulta, com 31 permissões granulares e **escopo por setor**. Tudo verificado no servidor; o menu mostra só o que o perfil pode usar.
- **Visão Geral** executiva com KPIs de IRAS, exposição, tendências, IRAS por setor, bundles, CME, antimicrobianos e treinamentos — calculados por um único motor de indicadores; filtros de período, unidade e setor.
- **Catálogo de indicadores** (31) com fórmula, unidade, direção, fonte, responsável e meta com origem.
- **Administração**:
  - Metas: de demonstração para institucionais, com aprovador, data e referência.
  - Parâmetros de regras (janela de profilaxia, vigilância de ISC, associação a dispositivo…), cada um ligado a uma referência.
  - Referências clínicas/regulatórias com versão, fonte, data, validador e status (vigente / revisão necessária / arquivado); editar o conteúdo invalida a validação.
  - Política de liberação de cargas da CME.
  - Usuários, perfis e escopos (alteração encerra as sessões do usuário).
  - Log de auditoria com antes/depois, justificativa, filtros e verificação de integridade.
- **Toda alteração exige justificativa**, confirmação explícita, controle de concorrência (versão do registro) e fica no log de auditoria na mesma transação.
- Tema claro/escuro, responsivo (1920 → 390 px), navegação por teclado, gráficos com tabela alternativa.

## Requisitos

- Node.js ≥ 22 e npm ≥ 10
- PostgreSQL 16

## Instalação

```bash
npm ci
```

### Banco de dados

O sistema usa dois papéis: um **dono** (roda migrações) e um **papel de aplicação** com privilégio mínimo (sem DDL, sem UPDATE/DELETE no log de auditoria).

Nenhuma senha aparece nesta documentação nem deve ser digitada na linha de comando (ficaria no histórico do shell). Crie os papéis e defina as senhas pelo prompt oculto do `psql`:

```sql
-- psql como superusuário do PostgreSQL
CREATE ROLE ccih_owner LOGIN;
CREATE ROLE ccih_app   LOGIN;
\password ccih_owner
\password ccih_app
CREATE DATABASE ccih_dev  OWNER ccih_owner;
CREATE DATABASE ccih_test OWNER ccih_owner;
REVOKE ALL ON DATABASE ccih_dev, ccih_test FROM PUBLIC;
GRANT CONNECT ON DATABASE ccih_dev, ccih_test TO ccih_app;
```

`\password` pede a senha sem exibi-la e a envia já criptografada (SCRAM) ao servidor.

```bash
cp apps/api/.env.example apps/api/.env && chmod 600 apps/api/.env   # edite as URLs no editor, não no terminal
npm run db:reset -w @ccih/api                                       # migrações + dados sintéticos de demonstração
```

O seed cria um usuário sintético por perfil (`admin`, `enf.ccih`, `infecto`, `cme`, `auditor`, `gestor`, `consulta`) com **senhas aleatórias**. Elas não são exibidas no terminal: ficam somente em `apps/api/.seed-credentials.local` (permissão 600, ignorado pelo git). Repasse cada senha só ao seu usuário e apague o arquivo depois; não cole senhas em chats, tickets ou documentação. Testes automatizados geram uma senha aleatória a cada execução.

| Comando (`-w @ccih/api`) | O que faz |
| --- | --- |
| `npm run db:migrate` | Aplica migrações pendentes e os privilégios do papel de aplicação |
| `npm run db:seed` | Cria o ambiente de demonstração (recusa se já houver instituição) |
| `npm run db:reset` | Recria o schema do zero + seed (proibido em produção) |
| `npm run audit:verify` | Recalcula a cadeia de hashes do log de auditoria |

## Execução

```bash
npm run dev -w @ccih/api                                    # API em http://127.0.0.1:3001
cp .env.example apps/web/.env.local                         # VITE_DATA_SOURCE=api
npm run dev                                                 # web em http://localhost:5173 (proxy /api)
```

Sem backend, `VITE_DATA_SOURCE=demo` abre a interface com dados sintéticos gerados no navegador, **somente leitura** e sem login.

## Testes e qualidade

| Comando | O que faz |
| --- | --- |
| `npm run lint` | ESLint (TypeScript, hooks, acessibilidade JSX), zero avisos |
| `npm run typecheck` | `tsc` estrito em todos os pacotes |
| `npm test` | Vitest: domínio (38), dados sintéticos (3), componentes (14), web (16), API com PostgreSQL real (26) |
| `npm run build` | Verifica tokens, gera `apps/web/dist` e `apps/api/dist` |
| `npm run check` | Tudo acima |

Os testes da API recriam o banco `ccih_test` a cada execução (`TEST_DATABASE_URL`, `TEST_DATABASE_OWNER_URL`). A CI (`.github/workflows/ci.yml`) sobe um PostgreSQL 16 efêmero, acessível só dentro do job e sem senha versionada, e roda `npm audit`, lint, typecheck, testes e build.

## Variáveis de ambiente

- **Web** (`apps/web/.env.local`): `VITE_DATA_SOURCE` = `api` ou `demo`. Obrigatória em build de produção. Nenhum segredo vai para o front-end.
- **API** (`apps/api/.env`): veja [apps/api/.env.example](apps/api/.env.example) — URLs do banco, `APP_ORIGIN`, tempos de sessão, bloqueio, limite de login, `COOKIE_SECURE`, `TRUST_PROXY`. A API não inicia com configuração inválida, e exige `COOKIE_SECURE=true` em produção.

## Build e deploy

```bash
VITE_DATA_SOURCE=api npm run build
```

- **Web**: arquivos estáticos em `apps/web/dist`, servidos com fallback de SPA para `index.html` e cabeçalhos de segurança (CSP, HSTS) no proxy.
- **API**: `apps/api/dist/server.js` (pacotes internos embutidos). Em produção: `npm ci --omit=dev`, `NODE_ENV=production`, `npm run db:migrate -w @ccih/api` com o papel dono e `node dist/server.js` com o papel de aplicação.
- Mesma origem para web e `/api` (proxy reverso com TLS), `TRUST_PROXY=true` atrás do proxy, backups cifrados do PostgreSQL com teste de restauração e `audit:verify` agendado.
- Um ambiente de demonstração mantém a faixa "Ambiente de demonstração" visível; o seed recusa rodar com `NODE_ENV=production`.

## Documentação

- [ARCHITECTURE.md](ARCHITECTURE.md) — camadas, fontes de dados, motor de indicadores, API
- [DATA_MODEL.md](DATA_MODEL.md) — modelo relacional (implementado e planejado)
- [SECURITY.md](SECURITY.md) — segurança e LGPD
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — tokens e componentes
- [CONTRIBUTING.md](CONTRIBUTING.md) — regras do projeto e testes
- [docs/auditoria/](docs/auditoria/) — auditorias técnicas (Fase 1, reauditoria 1.1, Fase 2)
- [docs/ROADMAP.md](docs/ROADMAP.md) — fases, dependências e riscos
- `ccih-integra/` — design system publicado (guia de marca, conteúdo técnico, tokens)

## Aviso clínico

Critérios, metas e parâmetros carregados pelo seed são **de demonstração e exigem validação institucional**. O sistema apoia a decisão da CCIH; não a substitui.
