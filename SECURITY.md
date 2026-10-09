# Segurança e LGPD — CCIH Integra

O sistema trata dados pessoais sensíveis de saúde (LGPD, art. 5º, II e art. 11). Este documento registra o que já está implementado e o que cada fase entrega.

## Controles implementados

| Controle | Implementação |
| --- | --- |
| Dados de pacientes | **Nenhum dado real.** Somente dados sintéticos (`data_origin = demo`), sinalizados em toda tela; registros criados numa instalação de demonstração também ficam `demo`. |
| Identificação (LGPD) | Telas, listas e exportações mostram iniciais + prontuário. O nome completo é opcional, cifrado com AES-256-GCM (IV aleatório; id da instituição e do paciente como dado associado) e a chave fica fora do banco (`FIELD_ENCRYPTION_KEY`). Sem chave, o nome não é aceito. Exibição só com `patient:view_identified`, motivo obrigatório e registro `view_identified` no log; o texto nunca entra no log nem nas respostas comuns. |
| Histórico clínico | Status de IRAS, evoluções CCIH, resultados de cultura, isolados e antibiogramas são somente inserção (sem UPDATE/DELETE para o papel de aplicação + trigger). Correções são novos registros com justificativa; o critério diagnóstico é congelado (título, versão, validação) no momento da decisão. |
| Históricos operacionais | Status de auditorias e não conformidades, respostas de bundle, contatos pós-alta e movimentações de insumo também são somente inserção (mesmo mecanismo). Auditoria de bundle errada é **anulada** com justificativa, não excluída; estoque é corrigido por ajuste com motivo. |
| Alertas | Cada tipo de alerta só é listado para perfis com a permissão do módulo de origem (ex.: insumos, treinamentos, IRAS); textos usam iniciais + prontuário; encerrar exige descrição do que foi feito e fica no log. |
| Escopo clínico | Pacientes, internações, casos, cirurgias, culturas e censo filtrados pelos setores do usuário; registros fora do escopo respondem 404 (sem revelar existência). Escrita só em setores do escopo. Vínculos de um caso (dispositivo, cirurgia, culturas) precisam pertencer à mesma internação. |
| Credenciais | Nenhuma no repositório. `.env` e `.seed-credentials.local` ignorados; seed gera senhas aleatórias. |
| Senhas | argon2id (19 MiB, t=2, p=1), rehash automático. Política mínima (12+ caracteres, 3 classes, sem o login) no servidor e repetida no formulário. Troca pelo próprio usuário exige a senha atual e encerra as outras sessões. Usuário criado ou redefinido pelo administrador recebe senha temporária aleatória, exibida uma única vez e nunca gravada no log; enquanto `must_change_password` estiver ativo (ou a senha passar de `PASSWORD_MAX_AGE_DAYS`), toda rota responde 403 `troca_de_senha`, exceto sessão, saída e a própria troca. |
| Força bruta | Bloqueio da conta após `LOGIN_MAX_ATTEMPTS` (contador atômico) por `LOGIN_LOCK_MINUTES`; limite de login por IP (`LOGIN_RATE_LIMIT_PER_MINUTE`); limite global de requisições. |
| Enumeração de usuários | Mesma mensagem e tempo de resposta para usuário inexistente, senha errada ou conta bloqueada. |
| Sessão | Token aleatório de 256 bits (só o SHA-256 é armazenado); cookie `HttpOnly; SameSite=Strict; Secure` (obrigatório em produção); expiração por inatividade e tempo máximo no servidor; revogação em logout e quando perfis/escopo mudam; aviso de inatividade no cliente; cache do navegador descartado ao sair. |
| CSRF | Token de dupla submissão ligado à sessão + verificação de `Origin`; cookies `SameSite=Strict`. |
| Autorização (RBAC) | 36 permissões granulares, verificadas em **todo** endpoint no servidor; negações registradas no log. Concluir ou reabrir um caso de IRAS exige `iras:decide`, verificado por transição. |
| IDOR / escopo | Escopo por setor aplicado nas consultas; ids de setores e referências validados contra a instituição do usuário; UUIDs aleatórios (sem enumeração). |
| Mass assignment | Esquemas zod `strict`; campos derivados (origem da meta, aprovador, direção) são definidos pelo servidor. |
| SQL injection | Consultas parametrizadas (Kysely); identificadores dinâmicos validados. |
| XSS | React escapa todo conteúdo; sem `dangerouslySetInnerHTML`; CSP `default-src 'none'` nas respostas da API. |
| Redirecionamento aberto | Retorno após login aceita só caminhos internos; React Router 7.18 (corrige GHSA-wrjc-x8rr-h8h6). |
| Cabeçalhos | Helmet: CSP, HSTS (com TLS), `nosniff`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`; `Cache-Control: no-store` em toda resposta da API. |
| Erros | Sem stack trace para o usuário; código da requisição para suporte; logs sem cookies, tokens ou senhas (redação no logger). |
| Log de auditoria | Somente inserção: o papel de aplicação não tem UPDATE/DELETE/TRUNCATE e um trigger bloqueia essas operações até para o dono; cadeia de hashes verificável (`audit:verify` e botão em Administração); registra login/falha/saída/expiração, acesso negado, alterações com antes/depois e justificativa, validações, desbloqueios e exportações. Nunca registra senha ou hash. |
| Privilégio mínimo no banco | Papel dono só para migrações; papel de aplicação com DML apenas. |
| Exportação | CSV de dados agregados exige `export:aggregate`, é registrado no log e marcado `DEMO-` quando sintético; neutraliza injeção de fórmula. |
| Dependências | `npm audit` sem vulnerabilidades; versões exatas; auditoria na CI. |
| Requisições a terceiros | Nenhuma: fontes servidas localmente. |

## Próximas fases

- SSO (OIDC) e MFA conforme o provedor institucional.
- Exportação de dados identificáveis com confirmação explícita, versão pseudonimizada e registro (Fase 7).
- Uploads (anexos de Bowie-Dick, Fase 5): validação por conteúdo, tamanho máximo, armazenamento fora da raiz web, nome gerado.
- Rotação da chave de cifragem de campos (recifrar com a nova chave); TLS e criptografia em repouso na infraestrutura; backups cifrados com teste de restauração.
- Registro de acesso de leitura a prontuários (além da exibição de nome), com painel de acessos por paciente — Fase 8.
- Monitoramento de segurança (picos de falhas de login, acessos negados) — Fase 8.

## Perfis iniciais

Administrador · Enfermeiro CCIH · Médico infectologista · CME · Auditor · Gestor · Consulta. Princípio do menor privilégio: cada perfil recebe só as permissões necessárias; dados identificados não fazem parte de Gestor e Consulta.

## Reporte de vulnerabilidades

Reporte em canal privado ao responsável técnico do projeto. Não abra issue pública com detalhes de exploração.
