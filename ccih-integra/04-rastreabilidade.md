# Rastreabilidade de materiais e testes da CME

O processamento de produtos para saúde segue a **RDC ANVISA nº 15/2012** (boas práticas para o processamento de produtos para saúde). O sistema registra cada etapa com data, hora e responsável e mostra a cadeia em `TraceTimeline`.

## Etapas do ciclo do material

| # | Etapa | O que registrar | Status |
| --- | --- | --- | --- |
| 1 | Recepção no expurgo | caixa, nº de peças, setor de origem, horário | Conforme / divergência de peças |
| 2 | Limpeza (manual, ultrassônica, termodesinfectora) | equipamento, ciclo, teste de limpeza | Conforme / sujidade residual |
| 3 | Inspeção e preparo | lupa, integridade, funcionalidade, composição, embalagem | Atenção quando há substituição de peça |
| 4 | Esterilização | equipamento, nº do ciclo, parâmetros físicos, indicadores | Ver liberação de carga |
| 5 | Armazenamento | local, data limite de uso (evento-relacionado) | Atenção perto do limite |
| 6 | Distribuição | setor/sala de destino, horário | — |
| 7 | Uso no paciente | cirurgia, prontuário | Fecha a rastreabilidade |

Etapa não realizada aparece com marcador tracejado ("Etapa ainda não realizada"); qualquer Crítico mostra "Quebra na cadeia".

## Testes e indicadores de esterilização (`SterilizationCycle`)

| Teste | O que verifica | Frequência usual |
| --- | --- | --- |
| **Bowie-Dick** (indicador classe 2) | Remoção de ar e penetração do vapor em autoclave pré-vácuo | Diário, primeiro ciclo, câmara vazia |
| Indicador químico **classe 1** (fita) | Diferencia pacote processado de não processado | Externo, em todo pacote |
| Indicador químico **classe 4, 5 (integrador) ou 6 (emulador)** | Parâmetros críticos do ciclo dentro do pacote | Interno, em todo pacote ou conforme protocolo |
| **Indicador biológico** (*Geobacillus stearothermophilus* para vapor) | Letalidade real do ciclo | Diário em pacote desafio e **em toda carga com implantável** |
| Registro físico | Tempo, temperatura e pressão impressos ou digitais | Todo ciclo |
| Teste de limpeza | Eficácia da termodesinfectora / lavadora | Conforme protocolo |

## Liberação de carga

- Todos aprovados → **Carga liberada**.
- IB em leitura → **Liberação condicionada**; carga com implantável → **"Aguardando IB — não liberar implantáveis"**.
- Qualquer reprovado → **Carga bloqueada — recolher itens**: o sistema lista as caixas do ciclo, as cirurgias em que foram usadas e os prontuários expostos, e abre registro de não conformidade.

## Indicadores cirúrgicos de rastreabilidade

Ver a seção *Indicadores e KPIs* → *Rastreabilidade cirúrgica e CME*. A meta de **100% das caixas rastreadas até o paciente** e **100% dos implantáveis liberados com IB lido** é inegociável e aparece como Crítico sempre que não atingida.
