# Tipos de IRAS e como identificar

Resumo operacional para a tela de investigação e para os textos de ajuda do sistema. A referência é o caderno **Critérios Diagnósticos das IRAS (ANVISA)**; confirme sempre na edição vigente antes de alterar uma regra do sistema. Exiba cada tipo com `InfectionTag`.

## Conceitos que o sistema calcula

- **IRAS**: infecção adquirida após a admissão, que se manifesta durante a internação ou após a alta quando relacionada à internação ou a procedimentos. Pela regra de vigilância, eventos a partir do **D3 de internação** (D1 = dia da admissão) são considerados IRAS.
- **Dispositivo-dia**: conta-se um dia para cada paciente com o dispositivo instalado no censo diário. D1 é o dia da instalação.
- **Associada a dispositivo**: o dispositivo estava em uso por **mais de 2 dias consecutivos** na data do evento e estava instalado no dia do evento ou no dia anterior. `PatientRecord` destaca o contador a partir de D3.
- **Janela de infecção**: 7 dias (o dia do primeiro exame positivo, 3 dias antes e 3 depois) para reunir os critérios.
- **Período de repetição de infecção**: 14 dias; um novo exame do mesmo sítio nesse período não gera nova notificação.

## Tipos

| Tipo | Token | Quando suspeitar | Como confirmar (essencial) |
| --- | --- | --- | --- |
| **IPCS** — infecção primária de corrente sanguínea | `iras-ipcs` | Paciente com CVC > 2 dias, febre, calafrios ou hipotensão sem outro foco | **IPCS laboratorial**: patógeno reconhecido em ≥ 1 hemocultura, sem relação com infecção em outro sítio; ou comensal da pele (ex.: estafilococo coagulase-negativo) em ≥ 2 hemoculturas de punções distintas + sinal clínico |
| **PAV** — pneumonia associada à ventilação mecânica | `iras-pav` | VM > 2 dias; piora da oxigenação, secreção purulenta, febre ou leucocitose | Imagem torácica com infiltrado novo ou progressivo (2 exames seriados quando há doença de base) + sinais/sintomas + critério microbiológico quando disponível (aspirado traqueal quantitativo, LBA) |
| **ITU-AC** — infecção do trato urinário associada a cateter | `iras-itu` | SVD > 2 dias; febre, dor suprapúbica ou lombar sem outra causa | Urocultura com ≥ 10⁵ UFC/mL e no máximo 2 espécies microbianas + ao menos um sinal ou sintoma |
| **ISC** — infecção de sítio cirúrgico | `iras-isc` | Até **30 dias** após a cirurgia, ou **90 dias** com implante | Classificar em **incisional superficial**, **incisional profunda** ou **órgão/cavidade**: drenagem purulenta, cultura positiva do sítio, abertura deliberada da ferida com sinais flogísticos, abscesso, diagnóstico do cirurgião |
| **Outras** | `iras-outras` | Gastrointestinal (*Clostridioides difficile*), pele e partes moles, conjuntivite neonatal, IRAS por MDR sem sítio definido | Conforme o critério específico de cada sítio |

## Microrganismos multirresistentes (MDR)

Marque o perfil no resultado da cultura (`StatusBadge` "MDR · KPC"). Perfis vigiados: **KPC/NDM** e outras enterobactérias resistentes a carbapenêmicos, *Acinetobacter baumannii* e *Pseudomonas aeruginosa* resistentes a carbapenêmicos, **MRSA** e **VRE**. Todo MDR novo gera precaução de contato e, se houver ≥ 2 casos relacionados no mesmo setor em curto período, `AlertBanner` crítico de **possível surto**.

## Testes laboratoriais que alimentam a vigilância

| Exame | Para quê | Atenção no registro |
| --- | --- | --- |
| Hemocultura (2 pares, punções distintas) | IPCS | Registrar sítio e horário de cada par; 1 par isolado com comensal é contaminação provável |
| Urocultura | ITU-AC | Coletar da porta do cateter, nunca da bolsa |
| Aspirado traqueal quantitativo / LBA | PAV | Pontos de corte usuais: ≥ 10⁶ UFC/mL (aspirado) e ≥ 10⁴ UFC/mL (LBA) |
| Cultura de secreção de ferida / tecido | ISC | Preferir tecido ou aspirado profundo a swab superficial |
| Swab de vigilância (retal, nasal) | Colonização por MDR | Na admissão em UTI e para contactantes de caso |
| Pesquisa de toxina / PCR para *C. difficile* | Diarreia associada | Só em fezes não formadas |
