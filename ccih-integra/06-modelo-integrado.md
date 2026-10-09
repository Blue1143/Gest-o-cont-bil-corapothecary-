# Modelo de dados integrado

O que torna o sistema *integrativo* é que todo registro aponta para os outros. As entidades abaixo são o vocabulário comum de telas, relatórios e componentes.

| Entidade | Chave | Liga-se a |
| --- | --- | --- |
| Paciente | nº de prontuário | Internações, cirurgias |
| Internação | id | Paciente, setor/leito, dispositivos, culturas, IRAS, precauções |
| Dispositivo | id | Internação; tipo (CVC, VM, SVD…), instalação, retirada → gera dispositivo-dia |
| Cultura | id | Internação; material, coleta, resultado, microrganismo, perfil MDR |
| IRAS (notificação) | id | Internação ou cirurgia; tipo, data do evento, critério, status, cultura(s) de suporte |
| Cirurgia | código | Paciente, sala, equipe, classificação, profilaxia, caixas usadas, vigilância |
| Caixa / material | código | Lotes de processamento, cirurgias |
| Ciclo de esterilização | nº do ciclo | Equipamento, carga (caixas), testes, liberação |
| Teste | id | Ciclo; tipo (Bowie-Dick, IQ, IB), resultado, leitura |
| Censo diário | setor + data | Paciente-dia e dispositivo-dia por setor (denominadores) |
| Colaborador | matrícula | Treinamentos, auditorias realizadas |
| Treinamento | tema + turma | Colaboradores, validade |
| Auditoria de processo | id | Setor, bundle, itens, auditor |
| Insumo | código | Lotes, estoque, consumo por setor |

## Caminhos que o sistema precisa responder

- **Do lote ao paciente**: ciclo reprovado → caixas da carga → cirurgias → prontuários expostos.
- **Do paciente ao lote**: ISC confirmada → cirurgia → caixas → ciclos → testes.
- **Do indicador ao caso**: clicar num ponto do `TrendChart` lista as notificações do mês e setor.
- **Do processo ao resultado**: adesão a bundle e cobertura de treinamento do setor ao lado da densidade de IRAS do mesmo setor.
- **Do insumo ao processo**: consumo de preparação alcoólica ao lado da adesão à higiene das mãos.

## Página de referência

`PainelCCIH` compõe tudo isso numa página: filtros no topo, alerta de surto, linha de KPIs, tendência por tipo de IRAS, IRAS por tipo, consumo de preparação alcoólica, treinamentos, notificações recentes, ciclo de esterilização, auditoria de bundle e insumos críticos.
