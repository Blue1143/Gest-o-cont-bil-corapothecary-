# SurgeryRecord

Registro cirúrgico para vigilância de ISC: classificação, índice de risco, antibioticoprofilaxia, caixas rastreadas e janela de vigilância.

**Props**: `procedimento`, `codigo`, `paciente` `{ iniciais, prontuario }`; `data`, `sala`, `especialidade`; `potencial` — `'limpa'|'potencialmente contaminada'|'contaminada'|'infectada'`; `asa`; `duracaoMin`, `p75Min`; `implante`; `profilaxia` — `{ antimicrobiano, dose, minutosAntesIncisao, duracaoHoras, repique?, janelaMin? }`; `caixas` — `[{ codigo, descricao, lote, ciclo, status? }]`; `vigilancia` — `{ status: 'em vigilância'|'sem ISC'|'ISC confirmada' }`.

- O IRIC (0–3) e a janela de 30/90 dias são calculados pelo componente; `Integra.riskIndex()` expõe o mesmo cálculo.
- Profilaxia conforme: até `janelaMin` (padrão 60) minutos antes da incisão e duração ≤ 24 h.
