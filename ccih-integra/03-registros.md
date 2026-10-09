# Registros: prontuário e cirurgia

## Registro no prontuário (`PatientRecord`)

O registro da CCIH dentro do prontuário reúne, numa só tela, o que a vigilância ativa precisa revisar diariamente.

| Bloco | Campos | Regra de exibição |
| --- | --- | --- |
| Identificação | iniciais, nº de prontuário, idade, sexo | Iniciais em `text-title`; prontuário em `text-code` |
| Internação | setor, leito, data de admissão, dias de internação | Dias contados com D1 = admissão |
| Precaução | padrão · contato · gotículas · aerossóis | Selo Atenção quando há precaução específica |
| Dispositivos invasivos | CVC (sítio), VM, SVD, PAI, drenos; data de instalação e retirada | Contador D*n*; a partir de D3 fica destacado como elegível |
| Culturas e exames | material, data da coleta, resultado, microrganismo, perfil MDR | Positiva = Crítico; Negativa = Conforme; Pendente = Sem dado |
| Notificações de IRAS | tipo, data do evento, critério atendido, status | Confirmada = Crítico; Em investigação = Atenção; Descartada = Sem dado |

**Fluxo de notificação**: suspeita (busca ativa, resultado de cultura, alerta de antimicrobiano) → investigação com o critério ANVISA → confirmada ou descartada → entra no numerador do indicador do mês do **evento**, no setor onde o paciente estava.

## Registro de cirurgia (`SurgeryRecord`)

| Bloco | Campos |
| --- | --- |
| Procedimento | nome, código interno, data, sala, especialidade, equipe |
| Classificação | potencial de contaminação, ASA, duração (min), P75 do procedimento, implante (sim/não) |
| Índice de risco | IRIC 0–3, calculado automaticamente |
| Antibioticoprofilaxia | antimicrobiano, dose, minutos antes da incisão, repique, duração total (h) |
| Materiais | caixas e implantes usados, com lote e ciclo de esterilização |
| Vigilância | janela de 30 dias (90 com implante), contato pós-alta, desfecho |

**Profilaxia conforme**: dose iniciada até 60 min antes da incisão (até 120 min para vancomicina e fluoroquinolonas — informe `janelaMin`), repique em cirurgias longas conforme protocolo e suspensão em até 24 h.

O vínculo **cirurgia ↔ caixa ↔ ciclo** é o que permite, num recolhimento de lote, listar em minutos todos os pacientes expostos.
