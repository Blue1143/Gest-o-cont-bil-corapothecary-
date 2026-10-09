CCIH Integra é a linguagem visual e o conjunto de componentes do sistema integrativo da Comissão de Controle de Infecção Hospitalar: vigilância de IRAS, indicadores e gráficos, prontuários, registros cirúrgicos, rastreabilidade de materiais da CME, testes de esterilização, treinamentos, auditoria de processos e insumos. Tudo aqui serve a uma pergunta: **o que a equipe precisa fazer agora para evitar a próxima infecção?**

## Princípios

1. **O dado vem antes da decoração.** Números grandes, rótulos curtos, nada de ilustração. Um cartão existe para mostrar um valor, a meta e a tendência.
2. **Status nunca só pela cor.** Todo estado carrega ícone **e** palavra (`StatusBadge`): Conforme, Atenção, Crítico, Sem dado.
3. **Cada infecção tem sempre a mesma cor.** IPCS, PAV, ITU-AC, ISC e Outras usam `iras-ipcs`, `iras-pav`, `iras-itu`, `iras-isc`, `iras-outras` em todo gráfico, chip e legenda — a cor segue a entidade, nunca a posição no ranking.
4. **Rastreável de ponta a ponta.** Todo material mostra código, lote e ciclo em `text-code`; todo registro liga paciente ↔ procedimento ↔ caixa ↔ ciclo ↔ teste.
5. **Privacidade (LGPD).** Telas de painel e listas exibem **iniciais + nº de prontuário**, nunca o nome completo. Nome completo só dentro do prontuário, para quem tem perfil assistencial.

## Voz e conteúdo

- Português do Brasil, frases curtas, voz ativa, sem exclamação e sem emoji.
- Use as siglas oficiais da ANVISA sem ponto: IRAS, IPCS, PAV, ITU-AC, ISC, CVC, VM, SVD, CME, MDR, KPC, MRSA, VRE.
- Números no padrão brasileiro: vírgula decimal e ponto de milhar (`2,4`, `1.248`). Densidades em **‰** (por 1.000 dispositivos-dia); taxas em **%**. Datas `dd/mm/aaaa`; horas `hh:mm`.
- Microrganismos em itálico com nome científico completo: *Klebsiella pneumoniae*.
- Alertas dizem o fato e a ação: "Possível surto: 3 casos de K. pneumoniae KPC na UTI Adulto em 9 dias" + "Instituir precaução de contato nos leitos 4, 7 e 9". Nunca "Atenção!" sozinho.
- Botões são verbos: "Notificar IRAS", "Recolher lote", "Abrir investigação". Evite "OK", "Enviar".
- Estados vazios explicam o período: "Nenhum registro no período."

## Cor

- Fundo da página `surface`; cartões, tabelas e registros em `surface-raised` com borda `line` (1px) e `radius-lg`. Cabeçalho de tabela e poços internos em `surface-sunken`. **Cartões não têm sombra** — `shadow-pop` é só para tooltip e menu.
- Texto principal `ink`; secundário, rótulos e eixos `ink-muted`. Ambos passam 6:1 em todas as surfaces, nos dois temas.
- `primary` (verde-petróleo) é a única cor de ação: botão principal (texto `on-primary`), link, item ativo e foco. Fundo de seleção `primary-soft`.
- Status: `ok`/`ok-soft`, `warn`/`warn-soft`, `crit`/`crit-soft`. Texto de status sempre sobre o próprio `*-soft` ou sobre `surface-raised` (todos ≥ 5,5:1). Nunca use cor de status para decorar.
- Séries de gráfico `serie-1`…`serie-5` (e os aliases `iras-*`) são só para marcas de dados — **nunca para texto**. `serie-3`, `serie-4` e `serie-5` ficam abaixo de 3:1 no tema claro: todo gráfico tem rótulo direto ou a visão de tabela.
- Bordas de controles em `line-strong` (≥ 3,4:1). Foco: anel sólido de 2px em `focus-ring`, afastado 2px do controle.
- Dois temas, Claro e Escuro, com os mesmos nomes de token. O tema escuro é para salas de monitoramento e plantão noturno.

## Tipografia

IBM Plex Sans para tudo; IBM Plex Mono para códigos. Carregue pelo Google Fonts (família hospedada, sem arquivo próprio):
`https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap`

| Estilo | Uso |
| --- | --- |
| `text-display` 32/38 | Título da página, um por tela |
| `text-title` 22/28 | Seção ou módulo; nome no cabeçalho de registro |
| `text-heading` 16/24 | Título de cartão e gráfico |
| `text-body` 15/22 | Texto corrido |
| `text-small` 13/18 | Metadados, subtítulos, notas de rodapé |
| `text-label` 12/16 | Rótulos em CAIXA ALTA, `ink-muted` |
| `text-kpi` 34/40 | Valor principal do KPI |
| `text-data` 13/20 | Células de tabela e rótulos de gráfico |
| `text-code` 13/18 mono | Prontuário, lote, caixa, ciclo |

Todo número em tabela, KPI e gráfico usa `font-variant-numeric: tabular-nums` e fica alinhado à direita.

## Espaço, forma e layout

- Escala de 4px: `space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 · `space-6` 24 · `space-8` 32 · `space-12` 48.
- Cartão: padding `space-6`; gap entre cartões `space-4`; entre seções da página `space-6`–`space-8`.
- Raios: `radius-sm` selos e barras · `radius-md` botões, campos, banners · `radius-lg` cartões · `radius-pill` contadores e barras de progresso.
- Controles: `control-md` 36px; `control-sm` 28px dentro de cartões e tabelas.
- Painel: linha de KPIs em grade `auto-fit` de 220px mínimo; gráficos em pares de 340px mínimo; tabelas ocupam a largura toda. Filtros (período, setor) numa única linha acima dos gráficos e valem para a página inteira.

## Gráficos

- Escolha pela pergunta: evolução no tempo → `TrendChart`; comparação entre setores, especialidades ou tipos → `BarChart` horizontal ordenado; um número com meta → `KpiCard`. Não use pizza nem eixo duplo.
- Meta sempre como linha tracejada `ink-muted`; limite superior de controle (gráfico U) como linha pontilhada `crit`.
- Linhas de 2px, último ponto marcado; barras com ponta arredondada só no lado do dado. Até 4 séries recebem rótulo direto; 2 ou mais séries têm legenda.
- Todo gráfico tem tooltip ao passar o cursor, navegação por setas do teclado e o botão "Tabela" com os mesmos dados.

## Iconografia

- Não há logotipo fornecido: o nome "CCIH Integra" é composto em IBM Plex Sans 600. Quando a instituição fornecer marca, ela entra como grupo de assets próprio.
- Ícones são de traço (2px, cantos arredondados, grade 24) desenhados dentro do pacote: check (Conforme), triângulo (Atenção), octógono com X (Crítico), traço (Sem dado), círculo com i (Informativo), setas de tendência, tabela e gráfico. Eles herdam `currentColor`.
- Sem emoji, sem pictogramas de micróbios ou ilustrações.

## Componentes

Todos vivem em `components/bundle.js` como `window.Integra` e exigem React 18 na página; carregue `tokens.css` e `components/bundle.css` antes.

| Módulo | Componentes |
| --- | --- |
| Base | `Button`, `StatusBadge`, `InfectionTag`, `AlertBanner` |
| Indicadores e gráficos | `KpiCard`, `TrendChart`, `BarChart`, `DataTable` |
| Registros | `PatientRecord` (prontuário), `SurgeryRecord` (cirurgia) |
| Rastreabilidade e testes | `SterilizationCycle`, `TraceTimeline` |
| Gestão | `TrainingProgress`, `BundleChecklist`, `SupplyStock` |
| Página de referência | `PainelCCIH` — composição completa de um painel |

Utilitários exportados: `Integra.IRAS` (siglas, nomes, token de cor e dispositivo de cada tipo), `Integra.statusFor(valor, meta, 'lower' | 'higher', faixa?)`, `Integra.riskIndex(cirurgia)` e `Integra.format.number / date`.

As seções seguintes deste guia trazem o conteúdo técnico que os componentes representam: tipos de IRAS e como identificá-los, indicadores e fórmulas, registros, rastreabilidade e testes da CME, gestão (treinamentos, processos, insumos) e o modelo de dados integrado.
