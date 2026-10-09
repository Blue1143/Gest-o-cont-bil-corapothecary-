# CCIH Integra

Plataforma de gestão integrada da CCIH/SCIRAS: vigilância epidemiológica de IRAS, indicadores, bundles, auditorias, CME e rastreabilidade, microbiologia, stewardship de antimicrobianos e segurança do paciente.

> **Estado atual: Fase 1 concluída** (auditoria técnica e fundação do front-end). A aplicação roda com **dados sintéticos de demonstração**, sempre identificados na tela. Ainda não há backend, autenticação nem persistência — isso é a Fase 2. Veja [docs/ROADMAP.md](docs/ROADMAP.md).

## O que já funciona

- **Visão Geral** executiva: KPIs de IRAS (global, IPCS, PAV, ITU-AC, ISC) com meta, status, variação vs período anterior e minitendência; exposição (pacientes-dia, dispositivos-dia); densidade por tipo; IRAS por setor; adesão a bundles; CME; antimicrobianos; processos e treinamentos. Filtros de período, unidade e setor na URL.
- **Catálogo de indicadores** com fórmula, unidade, direção, periodicidade, fonte, responsável e meta (com origem).
- **Administração (somente leitura)**: referências clínicas/regulatórias com versão, fonte e status de validação; parâmetros de regras; política de liberação de cargas.
- Módulos ainda não implementados aparecem no menu com a fase prevista e **não exibem dados inventados**.
- Tema claro/escuro, responsivo (1920 → 390 px), navegação por teclado, gráficos com tabela alternativa.

## Requisitos

- Node.js ≥ 22 e npm ≥ 10
- (Fase 2) PostgreSQL 16

## Instalação e execução

```bash
npm ci
cp .env.example apps/web/.env.local   # VITE_DATA_SOURCE=demo
npm run dev                           # http://localhost:5173
```

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento do app web |
| `npm run lint` | ESLint (TypeScript, hooks, acessibilidade JSX), zero avisos |
| `npm run typecheck` | `tsc` estrito em todos os pacotes |
| `npm test` | Vitest: domínio, componentes e aplicação |
| `npm run build` | Verifica tokens e gera `apps/web/dist` |
| `npm run tokens` | Regenera o CSS de tokens a partir de `ccih-integra/tokens.json` |
| `npm run check` | Tudo acima, em sequência |

## Variáveis de ambiente

| Variável | Onde | Valores |
| --- | --- | --- |
| `VITE_DATA_SOURCE` | `apps/web` | `demo` (dados sintéticos) · `api` (Fase 2). **Obrigatória em build de produção.** |

Nenhum segredo vai para o front-end. Veja `.env.example`.

## Banco, migrações e seed

Entram na Fase 2 (`apps/api`, PostgreSQL 16, migrações versionadas e seed sintético coerente entre entidades). O modelo alvo está em [DATA_MODEL.md](DATA_MODEL.md).

## Deploy

Fase 1: `VITE_DATA_SOURCE=demo npm run build -w @ccih/web` gera arquivos estáticos em `apps/web/dist` (servir com fallback de SPA para `index.html`). Um deploy de demonstração deve manter a faixa de ambiente de demonstração visível. Deploy institucional depende da Fase 2 (API, autenticação, banco, TLS, backups).

## Documentação

- [ARCHITECTURE.md](ARCHITECTURE.md) — camadas, fonte de dados, motor de indicadores, decisões de backend
- [DATA_MODEL.md](DATA_MODEL.md) — modelo relacional alvo
- [SECURITY.md](SECURITY.md) — segurança e LGPD
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — tokens e componentes
- [CONTRIBUTING.md](CONTRIBUTING.md) — regras do projeto e testes
- [docs/auditoria/FASE-1.md](docs/auditoria/FASE-1.md) — auditoria técnica
- [docs/ROADMAP.md](docs/ROADMAP.md) — fases, dependências e riscos
- `ccih-integra/` — design system publicado (guia de marca, conteúdo técnico, tokens)

## Aviso clínico

Critérios, metas e parâmetros exibidos são **de demonstração e exigem validação institucional**. O sistema apoia a decisão da CCIH; não a substitui.
