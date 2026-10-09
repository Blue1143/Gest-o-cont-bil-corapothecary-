# Fase 2 — Fundação: verificação e achados

Data: 09/10/2026 · Escopo: API, banco, autenticação, autorização, log de auditoria e configurações.

## Entregue

| Requisito | Implementação | Verificação |
| --- | --- | --- |
| API desacoplada | `apps/api` (Fastify 5, TypeScript estrito, Kysely + PostgreSQL 16) | 26 testes de integração contra banco real |
| Banco e migrações | Migração `0001_foundation` versionada; papéis dono/aplicação separados | `db:migrate`, `db:reset`; privilégios testados |
| Seed sintético | `@ccih/demo-data` compartilhado pelo web e pela API; instituição `data_origin = demo`; senhas aleatórias fora do git | Testes de coerência dos fatos |
| Autenticação | argon2id (19 MiB, t=2), bloqueio após N falhas (contador atômico), limite por IP, mensagem única para usuário inexistente e senha errada, tempo de resposta equalizado | Testes: bloqueio/desbloqueio, 429, mensagens |
| Sessão | Token aleatório (só o SHA-256 é guardado), cookie `HttpOnly`/`SameSite=Strict`/`Secure`, expiração ociosa e absoluta no servidor, aviso e keep-alive no cliente | Testes de expiração e logout |
| CSRF | Token de dupla submissão ligado à sessão + verificação de `Origin` | Testes sem token e com origem estranha |
| RBAC | 31 permissões, 7 perfis, verificação em todo endpoint, negação auditada | Testes por perfil |
| Escopo / IDOR | Escopo por setor aplicado nas consultas; referências e setores validados contra a instituição | Teste com usuário restrito a 2 setores; referência inexistente recusada |
| Mass assignment | Esquemas `strict` (campos desconhecidos recusados); direção da meta vem do catálogo | Teste com campos extras |
| Concorrência | `row_version` em toda configuração editável (409 em conflito) | Teste de versão desatualizada |
| Log de auditoria | Somente inserção (privilégio + trigger que bloqueia UPDATE/DELETE/TRUNCATE inclusive para o dono), cadeia de hashes, antes/depois, justificativa, IP, user-agent | Testes de imutabilidade e de detecção de adulteração |
| Configurações | Metas, parâmetros (registro com limites de entrada), referências (validação), política da CME, usuários/perfis/escopos | Testes de API e de interface |
| Formulários | `Field` acessível, mensagens pt-BR, obrigatórios, justificativa, confirmação (`<dialog>`), bloqueio de navegação com alterações não salvas | Testes de interface |

## Achados durante a validação (corrigidos)

| ID | Sev. | Achado | Correção |
| --- | --- | --- | --- |
| F2-01 | A | **Após "Sair", a interface voltava logada com dados em cache** (a sessão já estava revogada no servidor, mas `queryClient.clear()` desligava o observador da sessão). Em estação compartilhada isso expõe dados. Encontrado no teste E2E no navegador. | A sessão vira `null` no próprio cache e todas as demais consultas são removidas; o guarda de rota faz o redirecionamento. Teste de regressão adicionado. |
| F2-02 | M | Primeira visita anônima mostrava "Sua sessão expirou" e gerava erro 401 no console. | `/auth/me` responde `200 { authenticated: false }` para visitantes; endpoints protegidos seguem com 401; só um 401 em uso dispara "expirada". |
| F2-03 | M | O limite de login por IP era fixo no código. | `LOGIN_RATE_LIMIT_PER_MINUTE` configurável (padrão 10), com teste de 429. |
| F2-04 | B | Contador de falhas de login sujeito a corrida. | Incremento atômico no banco. |
| F2-05 | B | IP gravado como `inet` poderia ser normalizado e quebrar o hash na verificação. | Coluna `text` no log de auditoria. |

## Execução no navegador (API real + banco de demonstração)

Fluxo verificado no Chromium: visita anônima → login com retorno seguro à página pedida; senha errada com mensagem genérica; edição de meta com justificativa e confirmação; meta institucional refletida no painel; log de auditoria com antes/depois e cadeia íntegra; saída para a tela de login sem dados residuais; perfil CME vendo só CME (URL direta de Administração bloqueada); perfil restrito vendo só seus 2 setores; cookies `HttpOnly` e `SameSite=Strict`. Telas de login e Administração sem erros de console e sem rolagem horizontal em 1366 px e 390 px, nos dois temas.

## Pendências conscientes

- SSO institucional (OIDC) e MFA: a sessão foi desenhada para recebê-los; dependem do provedor da instituição.
- Troca de senha pelo próprio usuário e política de expiração de senha: Fase 4 (junto da gestão de usuários completa).
- Edição de unidades, setores e perfis pela interface: a API valida escopos contra a tabela de setores; telas de cadastro entram com os módulos clínicos (Fase 3), que dependem delas.
- Log técnico centralizado e alertas de segurança (ex.: muitas falhas de login): Fase 8.
