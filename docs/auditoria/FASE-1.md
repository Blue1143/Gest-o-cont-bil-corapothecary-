# Fase 1 — Auditoria técnica do CCIH Integra

Data: 09/10/2026 · Escopo: branch `claude/ccih-integrative-system-7w2feu`, pasta `ccih-integra/` (cópia do design system publicado).

## 1. O que existia

| Item | Situação encontrada |
| --- | --- |
| Stack | **Nenhuma aplicação.** Somente um design system estático: `bundle.js` (JavaScript ES5 escrito à mão, script clássico que atribui `window.Integra`), `bundle.css`, `tokens.json`, `index.d.ts` (apenas documentação) e 17 prévias HTML. |
| Build, lint, typecheck, testes | Inexistentes. Não há `package.json`. |
| Rotas, páginas, hooks, serviços | Inexistentes. `PainelCCIH` é uma página de demonstração montada dentro de um `<script>` inline. |
| Backend, banco, autenticação | Inexistentes. |
| Dados | Todos fictícios, embutidos nas prévias, **sem identificação de demonstração**. |
| Documentação de domínio | 6 seções markdown (IRAS, indicadores, registros, CME, gestão, modelo de dados) sem fonte, versão nem status de validação. |

Execução: as 17 prévias foram renderizadas em Chromium nos temas claro e escuro (34 renderizações) — **0 erros de console**.

## 2. Inventário

- **Componentes (15):** Button, StatusBadge, InfectionTag, AlertBanner, KpiCard, TrendChart, BarChart, DataTable, PatientRecord, SurgeryRecord, SterilizationCycle, TraceTimeline, TrainingProgress, BundleChecklist, SupplyStock. Internos: Icon, Sparkline, ChartFrame, useWidth.
- **Utilitários exportados:** `IRAS`, `statusFor`, `riskIndex`, `format.number`, `format.date`.
- **Tokens:** 28 cores × 2 temas, 9 estilos tipográficos, 7 espaçamentos, 4 raios, 1 sombra, 2 alturas de controle.
- **Páginas:** `PainelCCIH` (demonstração), `Cover`.

## 3. Pontos fortes (preservar)

- Identidade visual consistente; contraste ≥ 5,5:1 em todos os pares de texto nos dois temas.
- Paleta de IRAS validada para daltonismo e cor fixa por entidade.
- Status sempre com ícone + palavra.
- Gráficos com tooltip, legenda, rótulo direto e visão de tabela.
- Linguagem pt-BR e iniciais + prontuário nas telas de lista.

## 4. Achados

Severidade: **A** alta (risco clínico, regulatório ou de dados), **M** média, **B** baixa.

| ID | Sev. | Achado | Correção na Fase 1 |
| --- | --- | --- | --- |
| A-01 | A | Regras clínicas e metas **fixas no código**: faixa de status (20%/10%), janela de profilaxia 60 min e 24 h, vigilância ISC 30/90 dias, elegibilidade D3 de dispositivo, estoque mínimo 15 dias, validade 30 dias, faixa de treinamento 15 pontos, meta de treinamento 90%. | Regras movidas para `@ccih/domain` e recebidas como **configuração institucional**; nenhum valor padrão clínico embutido — sem configuração, o resultado é "Sem regra configurada". |
| A-02 | A | Critérios clínicos e normas citados nos textos (ANVISA, RDC 15/2012, pontos de corte de cultura) sem fonte, versão, data nem responsável pela validação. | Tipo `ClinicalReference` com versão, fonte, data, validador e status (vigente / revisão necessária / arquivado); referências do seed marcadas **Requer validação institucional**. |
| A-03 | A | Dados fictícios apresentados como se fossem reais. | Proveniência explícita (`origin: 'demo' \| 'real'`) em todo dado e **faixa "AMBIENTE DE DEMONSTRAÇÃO"** permanente quando a fonte é demo. |
| A-04 | A | `SurgeryRecord` marcava "Profilaxia não conforme" quando o horário da dose **não foi informado** (dado ausente tratado como falha). | Dado ausente → "Sem dado"; resultado distingue conforme / não conforme / incompleto / sem regra. |
| A-05 | A | `SterilizationCycle` decidia a liberação da carga com regra fixa, sem os estados aguardando / liberada / retida / rejeitada / reprocessamento, e misturava teste do equipamento (Bowie-Dick, diário) com teste da carga. | Regra de liberação configurável em `@ccih/domain` com os 5 estados; Bowie-Dick avaliado por equipamento e dia. |
| M-01 | M | `today()` usava a data UTC: entre 21h e 0h no horário de Brasília o "hoje" já era o dia seguinte, alterando dias de dispositivo, internação e validade. | Datas calculadas no fuso `America/Sao_Paulo` (configurável). |
| M-02 | M | `riskIndex` tratava ASA ausente como 0 e P75 ausente como "não excede", subestimando o risco sem avisar. | Retorna também `incompleto` com os fatores faltantes; a UI mostra "IRIC incompleto". |
| M-03 | M | `BundleChecklist` com `editable={false}` exibia botões aparentemente clicáveis que não faziam nada, e não sincronizava com novas props. | Botões desabilitados e anunciados como somente leitura; componente controlado. |
| M-04 | M | `BarChart`: tooltip só por mouse (sem teclado); gráficos e tabela **sem estado vazio**, carregando ou erro. | Navegação por teclado nas barras; estados vazio/carregando/erro padronizados em gráficos e tabelas. |
| M-05 | M | `DataTable` sem pesquisa, paginação, seleção de colunas e exportação. | Pesquisa, paginação, seleção de colunas e densidade adicionadas; exportação CSV com hook para checagem de permissão. |
| M-06 | M | Fontes carregadas do Google Fonts: depende de rede externa (frequentemente bloqueada em hospitais) e envia o IP do usuário a terceiros (LGPD). | Fontes servidas localmente via `@fontsource`. |
| M-07 | M | Fórmulas de indicadores apenas em texto; cada tela calcularia por conta própria. | Motor de indicadores único (`computeIndicator`) com catálogo tipado e testes. |
| M-08 | M | `index.d.ts` não era verificado contra a implementação. | Componentes reescritos em TypeScript estrito; tipos são a fonte. |
| M-09 | M | Script clássico global (`window.Integra`), sem módulos nem tree-shaking. | Pacote ES module `@ccih/ui`. O `bundle.js` em `ccih-integra/` permanece como referência visual do artifact. |
| B-01 | B | Valores CSS fixos (tamanhos de fonte, larguras de legenda) repetidos em `bundle.css`. | Tokens de tamanho tipográfico adicionados e usados no CSS. |
| B-02 | B | `TrendChart` usa `role="img"` num elemento interativo. | `role="group"` com descrição e região `aria-live` para o ponto ativo. |
| B-03 | B | Rótulos de barra truncados por estimativa de largura de caractere. | Mantido (com `<title>` e tabela); revisar quando houver i18n. |

## 5. Dívida técnica e riscos remanescentes

- Ainda não há backend, autenticação, RBAC nem log de auditoria: **Fase 2**.
- Nenhuma norma foi verificada contra fonte oficial nesta sessão: todas as referências clínicas permanecem **Requer validação institucional** até validação pela CCIH.
- O artifact do design system e o pacote `@ccih/ui` precisam ficar sincronizados; a fonte de verdade dos tokens é `ccih-integra/tokens.json` (o CSS do app é gerado a partir dele).
