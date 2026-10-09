# Fase 5 — CME e rastreabilidade: verificação e achados

Data: 09/10/2026 · Escopo: equipamentos, catálogo de caixas, cargas e ciclos, Bowie-Dick, indicadores químicos (classes 1–6) e biológicos, liberação pela política versionada com histórico imutável, uso dos pacotes nas cirurgias, rastreabilidade nos dois sentidos, anexos de evidência, alertas e indicadores da CME, E2E.

## Entregue

| Requisito | Implementação | Verificação |
| --- | --- | --- |
| Modelo | Migração `0004_cme` (8 tabelas); pacotes, testes, decisões e anexos somente inserção; índice único parcial impede dois usos do mesmo pacote; checks (Bowie-Dick sem carga, ciclo encerrado ⇔ registro físico, correção com justificativa, IB é o único teste com leitura pendente) | 15 testes de API contra PostgreSQL (UPDATE/DELETE nos históricos falham) |
| Equipamentos | Tipo (Bowie-Dick só em vapor pré-vácuo), série, qualificação térmica, manutenção/inativação com motivo; equipamento bloqueado não inicia ciclo; tipo não muda depois de ter ciclos | Testes de API (403 sem `cme:configure`, motivo obrigatório, ciclo recusado em manutenção) |
| Cargas e ciclos | Código e etiquetas gerados (sequência por equipamento e dia, com trava), validade pelo parâmetro `cme.shelfLifeDays`, encerramento do ciclo com parâmetros e registro físico, reprocessamento ligado à carga de origem | Testes de domínio e API; E2E |
| Testes | Bowie-Dick diário, IQ 1–6 e IB com lote e validade do indicador; IB em incubação, leitura com indicador controle (controle sem crescimento invalida a leitura); leitura e correção como nova versão (uma por versão) | Testes de domínio (7) e de API (validade, tipo, duplicidade 409, segunda leitura 409) |
| Liberação | `evaluateLoadRelease` com testes vigentes, registro físico e Bowie-Dick do dia anterior ao ciclo; a API reavalia na transação e só libera se a política permitir; reter/rejeitar/reprocessar/recolher com motivo e confirmação; decisão guarda versão da política e avaliação | Testes de domínio e API; interface (botão Liberar desabilitado, confirmação); E2E |
| Uso e rastreabilidade | Registro do pacote na cirurgia pela etiqueta (liberado, válido, não usado) ou no setor sem paciente; anulação com motivo; pesquisa por etiqueta, carga, caixa ou prontuário; paciente só para `patient:view` dentro do escopo | Testes de API (uso duplicado, carga retida, paciente oculto para o perfil CME, prontuário sem resultado para o perfil CME) e de interface; E2E até o paciente |
| Anexos | Corpo binário com tipo decidido pelo conteúdo, PDF ativo recusado, limite de tamanho e de quantidade, armazenamento fora da raiz web com nome gerado, download auditado; também para turmas de treinamento (pendência da Fase 4) | Testes de API (disfarce, PDF com JavaScript, 413, 403, conteúdo fora do log) |
| Alertas | Carga recolhida com expostos, carga liberada com teste reprovado, Bowie-Dick reprovado com equipamento em uso, IB sem leitura no prazo (`cme.ibReadingHours`), qualificação a vencer (`cme.qualificationWarningDays`); visíveis a `cme:view` | Testes de domínio e API (alerta criado, encerrado automaticamente ao bloquear o equipamento) |
| Indicadores | `consolidateCmeFacts`: ciclos conformes, Bowie-Dick, IQ, IB, cargas liberadas/retidas/reprocessadas, caixas rastreadas até o paciente, NC de origem CME | Testes de domínio e API |
| Dados sintéticos | 3 equipamentos, 12 caixas, ~6 cargas/dia com Bowie-Dick reprovado e repetido após manutenção, ciclo não conforme e IQ reprovado reprocessados, implantáveis retidos até o IB, IB nunca lido, recolhimento com pacotes já usados | Testes do gerador (determinismo, uso só após liberação, uso único) |

## Achados durante a validação (corrigidos)

| ID | Sev. | Achado | Correção |
| --- | --- | --- | --- |
| F5-01 | A | Alerta de **evento** (novo MDR) encerrado voltava a abrir quando a janela de supressão (24 h) passava, enquanto a coleta ainda estava nos últimos 7 dias. O mesmo aconteceria com o recolhimento de carga. Encontrado na revisão da Central de Alertas (Fase 4). | Candidatos marcados como evento (`oneShot`) nunca são recriados depois de encerrados; teste de API envelhecendo o encerramento em 3 dias. |
| F5-02 | M | O log de auditoria mostrava códigos crus (`status_change`, `view_identified`, `consolidate`) e o nome técnico de dezenas de entidades criadas nas Fases 3 e 4. | Rótulos em português para todas as ações e entidades auditadas. |
| F5-03 | M | No cartão do ciclo, o selo "Carga liberada" representava a avaliação da política enquanto a carga ainda aguardava decisão — informação contraditória na mesma tela. Encontrado no navegador. | O selo passa a dizer "Pela política: …"; a situação real fica no cabeçalho. |
| F5-04 | B | Teste de API da vigilância de IRAS escolhia "o primeiro CVC" sem excluir dispositivos retirados e sem ordenação: o resultado dependia da ordem física das linhas e falhou com o novo seed. | Filtro por dispositivo em uso e ordenação estável. |
| F5-05 | B | Na rastreabilidade, a etapa da decisão da carga aparecia como "Não registrado". | A linha de rastreio traz a data da última decisão. |

## Execução no navegador (API real + banco de demonstração)

CME (situação, fila de cargas, nova carga), carga aguardando e carga recolhida, Bowie-Dick, Equipamentos, Caixas, Rastreabilidade (perfil CME e CCIH), cirurgia com materiais, alerta de recolhimento e log de auditoria verificados no Chromium em 1366 px (tema claro) e 390 px (tema escuro), com os perfis CME e Enfermeiro CCIH: sem erros de console, sem requisições com erro e sem rolagem horizontal. E2E: 6 testes (5 anteriores + 1 novo), também no modo CI.

## Pendências conscientes

- **Etapas do processamento** (`processing_step`: recepção, limpeza, inspeção, preparo, embalagem, armazenamento, distribuição): a rastreabilidade começa no ciclo. Entra com a integração de leitores de código de barras.
- **Correção do registro do ciclo** depois de encerrado não é oferecida; um erro de digitação exige rejeitar/reprocessar ou nota na carga. Avaliar correção versionada como nos testes.
- **Etiquetas**: o código é gerado e aceito por leitor (que digita no campo), mas a impressão de etiquetas não está implementada.
- **Anexos em produção**: antivírus no recebimento e armazenamento de objetos cifrado (hoje: disco local com permissões restritas).
- **Integração com equipamentos** (importar o registro físico do ciclo) e alerta de carga aguardando decisão há muito tempo: Fase 7.
- Os parâmetros da CME carregados pelo seed (validade de 30 dias, leitura do IB em 48 h, aviso de qualificação em 30 dias) são **de demonstração** e exigem validação institucional, assim como a política de liberação.
