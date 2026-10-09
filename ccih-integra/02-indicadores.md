# Indicadores e KPIs

> **Status: Requer validação institucional.** Conteúdo de apoio, redigido sem conferência com as fontes oficiais vigentes. Fonte declarada: Fórmulas usuais de vigilância epidemiológica de IRAS; metas são exemplos de demonstração. Versão: a confirmar. Validado por: —. Atualização: 09/10/2026. No sistema, cada critério, prazo, ponto de corte e meta citados aqui é um parâmetro configurável em Administração, ligado a uma referência com versão, fonte e status, e só vale como regra após validação da CCIH.

Cada indicador do sistema tem nome, fórmula, unidade, direção (menor ou maior é melhor) e meta institucional. Exiba o valor do período em `KpiCard`, a série histórica em `TrendChart` e a comparação entre setores em `BarChart` ou `DataTable`. As metas abaixo são **exemplos** usados nas prévias; cada instituição define as suas a partir da própria série histórica e dos relatórios nacionais da ANVISA.

## IRAS associadas a dispositivo (UTIs)

| Indicador | Fórmula | Unidade | Direção |
| --- | --- | --- | --- |
| Densidade de incidência de IPCS laboratorial | casos de IPCS-CL ÷ CVC-dia × 1.000 | ‰ | menor |
| Densidade de incidência de PAV | casos de PAV ÷ VM-dia × 1.000 | ‰ | menor |
| Densidade de incidência de ITU-AC | casos de ITU-AC ÷ SVD-dia × 1.000 | ‰ | menor |
| Taxa de utilização de CVC / VM / SVD | dispositivo-dia ÷ paciente-dia × 100 | % | menor |
| Densidade de IRAS global | total de IRAS ÷ paciente-dia × 1.000 | ‰ | menor |

## Cirurgia

| Indicador | Fórmula | Unidade | Direção |
| --- | --- | --- | --- |
| Taxa de ISC em cirurgia limpa | ISC em cirurgias limpas ÷ cirurgias limpas × 100 | % | menor |
| Taxa de ISC por procedimento-alvo | ISC no procedimento ÷ procedimentos × 100 (ex.: artroplastia, cesárea, revascularização) | % | menor |
| Taxa de ISC por índice de risco (IRIC 0–3) | ISC ÷ cirurgias de cada estrato × 100 | % | menor |
| Profilaxia antimicrobiana no tempo certo | doses iniciadas até 60 min antes da incisão ÷ cirurgias com indicação × 100 | % | maior |
| Profilaxia com duração ≤ 24 h | profilaxias encerradas em até 24 h ÷ profilaxias × 100 | % | maior |
| Cobertura da vigilância pós-alta | pacientes contatados ao fim da janela (30/90 dias) ÷ cirurgias vigiadas × 100 | % | maior |

**Índice de risco cirúrgico (IRIC/NNIS)** — um ponto para cada: ASA ≥ 3; cirurgia contaminada ou infectada; duração acima do percentil 75 (P75) do procedimento. `SurgeryRecord` calcula e mostra 0–3.

**Potencial de contaminação**: limpa · potencialmente contaminada · contaminada · infectada.

## Processos de prevenção

| Indicador | Fórmula | Unidade | Direção |
| --- | --- | --- | --- |
| Adesão à higiene das mãos | ações realizadas ÷ oportunidades observadas × 100 (5 momentos da OMS) | % | maior |
| Consumo de preparação alcoólica | mL consumidos ÷ paciente-dia | mL/pac-dia | maior |
| Adesão a bundle (CVC, PAV, SVD, ISC) | auditorias com **todos** os itens conformes ÷ auditorias × 100 | % | maior |
| Adesão a precauções e isolamento | pacientes com indicação corretamente sinalizados ÷ pacientes com indicação × 100 | % | maior |
| Consumo de antimicrobianos | DDD ÷ paciente-dia × 1.000 | DDD/1.000 pac-dia | acompanhar |
| Incidência de MDR | novos casos de MDR ÷ paciente-dia × 1.000 | ‰ | menor |

## Rastreabilidade cirúrgica e CME

| Indicador | Fórmula | Unidade | Direção |
| --- | --- | --- | --- |
| Bowie-Dick conforme | testes aprovados ÷ testes realizados × 100 | % | maior |
| Cargas com indicador biológico negativo | cargas com IB negativo ÷ cargas monitoradas × 100 | % | maior |
| Pacotes com integrador químico conforme | integradores aprovados ÷ integradores lidos × 100 | % | maior |
| Implantáveis liberados com IB lido | cargas com implante liberadas após leitura do IB ÷ cargas com implante × 100 | % | maior (meta 100%) |
| Caixas rastreadas até o paciente | caixas com vínculo ciclo → cirurgia → prontuário ÷ caixas usadas × 100 | % | maior (meta 100%) |
| Não conformidades no preparo | caixas com falha de inspeção ou composição ÷ caixas preparadas × 100 | % | menor |
| Recolhimentos de lote | nº de lotes recolhidos no período | n | menor |

## Gestão

| Indicador | Fórmula | Unidade | Direção |
| --- | --- | --- | --- |
| Cobertura de treinamento | colaboradores treinados no tema ÷ público-alvo × 100 | % | maior |
| Horas de treinamento por colaborador | horas ofertadas × participantes ÷ colaboradores | h | maior |
| Cobertura de estoque de insumo | estoque ÷ consumo médio diário | dias | maior que o mínimo |
| Insumos a vencer em 30 dias | itens com validade ≤ 30 dias | n | menor |

## Regras de status

`Integra.statusFor(valor, meta, direção, faixa)` devolve:
- **Conforme** quando o valor atinge a meta;
- **Atenção** quando fica dentro da faixa de tolerância (padrão: 20% acima da meta quando menor é melhor; 10% abaixo quando maior é melhor);
- **Crítico** além da faixa.

Para detecção de surto use gráfico de controle (U): passe o limite superior por período em `TrendChart` `limit`; um ponto acima do limite gera `AlertBanner` crítico.
