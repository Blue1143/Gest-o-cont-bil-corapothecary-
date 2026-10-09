# Fase 4 — CCIH operacional: verificação e achados

Data: 09/10/2026 · Escopo: bundles e higiene das mãos, auditorias e não conformidades (5W2H), Central de Alertas, treinamentos, insumos, troca de senha pelo usuário e senha temporária, vigilância pós-alta de ISC, consolidação dos indicadores operacionais e E2E.

## Entregue

| Requisito | Implementação | Verificação |
| --- | --- | --- |
| Modelo operacional | Migração `0003_operations` (18 tabelas), históricos e livro-razão somente inserção (`quality_audit_status`, `nonconformity_status`, `bundle_audit_answer`, `ssi_followup`, `supply_movement`), `professional.sector_id`, `app_user.must_change_password` | Seed sintético + 14 testes de API novos contra PostgreSQL (UPDATE/DELETE nos históricos falham) |
| Bundles | Modelos configuráveis (itens, método tudo ou nada / por item, referência), um ativo por indicador; resposta guarda o texto do item na data; resultado calculado pelo domínio (`evaluateBundle`); anulação com justificativa; adesão por setor e Pareto | Testes de domínio, API (todos os itens respondidos, troca de texto preserva o passado, índice único) e interface (avaliação ao vivo, itens sem resposta bloqueiam) |
| Higiene das mãos | Observações por setor com oportunidades e ações (ações ≤ oportunidades) | Teste de API |
| Auditorias e NC | Workflows com transições no domínio, requisitos por etapa (achados para concluir a auditoria; ação 5W2H para tratar, ações finalizadas para verificar e resultado da eficácia para encerrar a NC), histórico somente inserção, plano de ação 5W2H com prazo e conclusão | Testes de domínio e API; E2E auditoria → achados → conclusão → NC → ação 5W2H → em tratamento |
| Central de Alertas | Candidatos dos registros (investigação parada, dispositivo em uso além do prazo de reavaliação, MDR novo, treinamento vencido, insumo em ruptura/validade, ação atrasada, contato pós-alta pendente) com prazos em parâmetros de regra; deduplicação por chave (índice único parcial), supressão após encerramento, encerramento automático, responsável, encerramento com o que foi feito; visibilidade por tipo conforme a permissão do módulo; contador no menu | Testes de domínio e API (sem duplicar, 403 sem permissão, supressão, encerramento automático, visibilidade, concorrência); interface; E2E assumir → encerrar → histórico |
| Treinamentos | Público-alvo por função, validade, obrigatoriedade; turmas com presença; cobertura por setor (válido / vencendo / vencido / pendente) | Testes de domínio e API (presença eleva a cobertura) |
| Insumos | Lotes com validade, livro-razão sinalizado (entrada, consumo, ajuste, descarte), saldo nunca negativo, cobertura em dias pelo consumo médio, avaliação de ruptura/validade | Testes de domínio e API (saldo insuficiente recusado, ledger imutável) |
| Pós-alta de ISC | Lista das cirurgias com janela de vigilância aberta; contatos somente inserção; suspeita abre caso de ISC na vigilância | Teste de API e navegador |
| Senhas | Troca pelo usuário (senha atual, política no servidor, outras sessões encerradas); criação e redefinição pelo administrador com senha temporária exibida uma vez; bloqueio 403 `troca_de_senha` até a troca; vencimento opcional `PASSWORD_MAX_AGE_DAYS` | Testes de API (senha ausente do log, bloqueio, sessões revogadas), interface e E2E do primeiro acesso |
| Consolidação | Fatos de bundles, higiene das mãos, preparação alcoólica e treinamentos a partir dos registros, juntos com os clínicos; o seed usa o mesmo caminho | Teste de API e de dados sintéticos |
| Permissões | `quality:configure` (modelos de bundle e catálogo de treinamentos) — 36 no total | Testes de domínio |

## Achados durante a validação (corrigidos)

| ID | Sev. | Achado | Correção |
| --- | --- | --- | --- |
| F4-01 | A | Lista de alertas vazia enquanto o contador do menu mostrava alertas: a lista e o contador eram pedidos juntos; o segundo pedido caía no limite de frequência e lia a tabela antes de a geração do primeiro terminar. Encontrado no navegador. | Execuções simultâneas aguardam a mesma promessa de geração (`refreshAlerts`); teste de regressão com os dois pedidos em paralelo. |
| F4-02 | A | Depois de trocar a senha temporária, o usuário voltava para "Minha conta": a navegação acontecia antes de a sessão atualizada chegar ao guarda. Encontrado no navegador. | A tela só sai quando a sessão atualizada não exige mais a troca (estado `released` + efeito); teste de interface do fluxo completo. |
| F4-03 | M | O histórico de alertas encerrados era ordenado por prioridade e criação: o alerta recém-encerrado podia ficar na segunda página. Encontrado pelo E2E. | Encerrados ordenados pelo encerramento mais recente; asserção no teste de API. |
| F4-04 | B | Matriz de cobertura de treinamentos larga demais em 390 px. | Rolagem horizontal dentro do quadro da tabela, sem rolar a página. |

## Execução no navegador (API real + banco de demonstração)

Central de Alertas, Bundles (auditoria, modelos, higiene das mãos), Auditorias e não conformidade, Treinamentos, Insumos, Cirurgias → Pós-alta, Minha conta e Usuários (novo usuário, redefinição) verificados no Chromium em 1366 px (tema claro) e 390 px (tema escuro): sem erros de console, sem requisições com erro e sem rolagem horizontal. E2E: 5 testes (2 da Fase 3 + 3 novos).

## Pendências conscientes

- **Geração de alertas sob demanda** (ao abrir a lista ou o contador, no máximo uma vez por minuto): suficiente para uma instituição; um agendador em segundo plano e notificações por e-mail/push ficam para a Fase 7.
- **Revisão de dispositivo** usa o dia de uso como sinal (sem registro de manutenção diária); `device_maintenance` integrada aos bundles fica para uma próxima iteração.
- **Insumos**: sem integração com almoxarifado/ERP; entrada manual. Inventário periódico com conciliação: Fase 7.
- **Treinamentos**: avaliação (nota) e evidências anexadas dependem do serviço de uploads (Fase 5).
- **Senha**: sem histórico de senhas anteriores nem MFA; SSO (OIDC) e MFA conforme o provedor institucional.
- **Surtos** (`outbreak*`): Fase 7, junto com a curva epidêmica.
