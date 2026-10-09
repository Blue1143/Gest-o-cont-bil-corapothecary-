# Segurança e LGPD — CCIH Integra

O sistema trata dados pessoais sensíveis de saúde (LGPD, art. 5º, II e art. 11). Este documento registra o que já está implementado e o que cada fase entrega.

## Estado atual (Fase 1)

| Controle | Situação |
| --- | --- |
| Dados de pacientes reais | **Nenhum.** Somente dados sintéticos, marcados como demonstração em toda tela. |
| Credenciais no repositório | Nenhuma. `.env` ignorado pelo git; `.env.example` sem segredos. |
| Fallback acidental para demo | Bloqueado: build de produção sem `VITE_DATA_SOURCE` não inicia. |
| Requisições a terceiros | Nenhuma: fontes servidas localmente (antes: Google Fonts). |
| XSS | React escapa todo conteúdo; não há `dangerouslySetInnerHTML`. |
| Exportação CSV | Separador `;`, escape de aspas e neutralização de injeção de fórmula (`=`, `+`, `-`, `@`); arquivos de demonstração prefixados `DEMO-` e com linha de origem. |
| Exibição de paciente | Componentes usam iniciais + nº de prontuário. |
| Erros | Sem stack trace para o usuário. |

## Fase 2 (fundação)

- Autenticação por sessão (cookie `HttpOnly; Secure; SameSite=Strict`), argon2id, bloqueio progressivo, timeout de inatividade configurável, encerramento de sessão no servidor.
- RBAC com permissões granulares e **validação no servidor** de toda operação; escopo por unidade/setor em toda consulta (proteção contra IDOR e enumeração; IDs UUID).
- Esquemas de entrada com allowlist (sem mass assignment); consultas parametrizadas (sem SQL injection).
- CSRF: SameSite=Strict + token de dupla submissão.
- Cabeçalhos: CSP restritiva, HSTS, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`.
- Rate limiting em login e exportação.
- `audit_log` somente-inserção com encadeamento de hash; registra visualização de dado identificado, exportações, alterações de resultado, liberações de CME, confirmação/descarte de IRAS, metas e permissões. Nunca registra senhas ou tokens.
- Exportação identificável: exige permissão, confirmação explícita e registro; oferece versão pseudonimizada.
- Uploads (Fase 5: anexos de Bowie-Dick): tipos permitidos por conteúdo, tamanho máximo, armazenamento fora da raiz web, nome gerado.
- Criptografia em trânsito (TLS) e em repouso (disco/banco), nome completo de paciente cifrado em coluna.
- Backups cifrados com teste de restauração; política de retenção definida com o DPO.

## Perfis iniciais

Administrador · Enfermeiro CCIH · Médico infectologista · CME · Auditor · Gestor · Consulta. Princípio do menor privilégio: cada perfil recebe só as permissões necessárias; dados identificados não fazem parte de Gestor e Consulta.

## Reporte de vulnerabilidades

Reporte em canal privado ao responsável técnico do projeto. Não abra issue pública com detalhes de exploração.
