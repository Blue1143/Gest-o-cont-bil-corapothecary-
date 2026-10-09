# PatientRecord

Registro da CCIH no prontuário: identificação, internação, precaução, dispositivos com dia de uso, culturas e notificações de IRAS.

**Props**: `paciente` — `{ iniciais, prontuario, idade, sexo }`; `setor`, `leito`, `admissao` (ISO); `dataRef` — data de referência do cálculo (padrão hoje); `precaucao` — `'contato' | 'gotículas' | 'aerossóis'`; `dispositivos` — `[{ tipo, sitio?, inicio, retirada? }]`; `culturas` — `[{ material, coleta, resultado: 'positiva'|'negativa'|'pendente'|'contaminada', microrganismo?, perfil? }]`; `iras` — `[{ tipo, dataEvento, criterio, status: 'confirmada'|'em investigação'|'descartada' }]`; `footer` — ações.

- D1 é o dia da instalação; a partir de D3 o contador fica destacado como elegível aos critérios de IRAS associada ao dispositivo.
- Nunca passe o nome completo em telas de lista ou painel.
