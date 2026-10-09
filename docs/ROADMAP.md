# Roadmap — CCIH Integra

| Fase | Entrega | Depende de | Status |
| --- | --- | --- | --- |
| 1 — Auditoria técnica | Auditoria, monorepo, TS estrito, lint/testes/build, `@ccih/domain` (motor de indicadores, regras configuráveis, referências), `@ccih/ui` (port corrigido do design system), app web com painel, catálogo e administração somente leitura | — | **Concluída** |
| 2 — Fundação | `apps/api` (Fastify + PostgreSQL 16), migrações, seed sintético coerente, autenticação por sessão, RBAC granular com escopo por setor, `audit_log` imutável, Administração editável (metas, parâmetros, referências, política CME, usuários e perfis, log de auditoria), `ApiDataSource` | 1 | **Concluída** (reauditoria 1.1 incluída) |
| 3 — Core clínico | Cadastro de unidades/setores/leitos na interface, pacientes (nome cifrado, exibição auditada), internações e movimentações, dispositivos e censo diário (denominadores reais), Vigilância IRAS (suspeita → investigação → confirmação/descarte, vínculos, histórico imutável), cirurgias, culturas com resultados versionados, prontuário CCIH longitudinal com evolução permanente, consolidação dos indicadores a partir das entidades, filtros por tipo de infecção/procedimento/cirurgião/dispositivo, E2E Playwright | 2 | **Concluída** |
| 4 — CCIH operacional | Bundles configuráveis e higiene das mãos, auditorias e não conformidades (5W2H), Central de Alertas com deduplicação, treinamentos, insumos (livro-razão de lotes), troca de senha pelo usuário e senha temporária, vigilância pós-alta de ISC, consolidação dos indicadores operacionais | 2, 3 | **Concluída** |
| 5 — CME | Equipamentos, ciclos, Bowie-Dick, IQ classes 1–6, IB, cargas, liberação com política versionada e histórico imutável, rastreabilidade bidirecional e pesquisa | 2, 3 (cirurgia) | **Concluída** |
| 6 — Stewardship | Prescrições, revisões, alertas de apoio à decisão, antibiograma institucional | 3 | Próxima |
| 7 — Inteligência | Relatórios (PDF/CSV/XLSX), Pareto, comparações, investigação de surto com curva epidêmica, pesquisa global com permissão, integrações (prontuário eletrônico, LIS) | 3–6 | Planejada |
| 8 — Hardening | E2E dos fluxos críticos, WCAG 2.2 AA completo, testes de segurança, desempenho, documentação final | todas | Contínua |

## Critérios de aceite por fase

Cada fase só termina com lint, typecheck, testes e build verdes; telas principais verificadas em 1920, 1440, 1366, tablet e celular nos dois temas; zero erros de console; documentação atualizada.

## Riscos

| Tipo | Risco | Mitigação |
| --- | --- | --- |
| Clínico | Critério diagnóstico desatualizado ou mal parametrizado classificar IRAS errado | Critérios versionados com fonte, validador e status; sem parâmetro o sistema não classifica; decisão final é da CCIH |
| Clínico | Alertas em excesso (alert fatigue) | Prioridade, deduplicação por janela, responsável e encerramento obrigatórios |
| Regulatório | Referências (ANVISA, RDC) não verificadas nesta sessão | Todas marcadas "Requer validação institucional" até validação pela CCIH |
| Regulatório | Dados de demonstração confundidos com institucionais | Faixa permanente, etiquetas, prefixo DEMO- em exportações, build de produção sem fonte configurada não inicia |
| LGPD | Exposição de dado identificado em painéis e exportações | Iniciais + prontuário por padrão; permissão específica, confirmação e log para dado identificado |
| Segurança | Controle de acesso só no cliente | Toda autorização no servidor (Fase 2); escopo por setor em cada consulta |
| Arquitetura | Design system (artifact) e `@ccih/ui` divergirem | Tokens com fonte única e checagem no build |
| Desempenho | Agregações no navegador com muitos dados | A partir da Fase 2, agregação no servidor; paginação e cache |
