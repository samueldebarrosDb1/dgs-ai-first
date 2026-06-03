# Análise Arquitetural — Assistente RAG NovaTech (GPT-4o, 128K)

> **Premissas-base assumidas e fixadas para todo o documento:**
>
> - Modelo: GPT-4o, janela de **128.000 tokens de contexto de entrada**.
> - Regra de conversão: **Tokens = Palavras / 0,75** (equivalente a ~1,333 token/palavra).
> - As fontes em `.\docs` evidenciam o caráter crítico de **fidelidade de tabela** (frete), **resolução de conflito de versão** (PROC-042 v1/v2) e **autoridade documental** (normativo vs. FAQ informal) — esses três vetores guiam as decisões abaixo.

---

## 1. MATRIZ DE TRATAMENTO DE FONTES DE DADOS COMPLEXAS

### 1.1. PDFs do SharePoint com tabelas complexas (tabelas de frete >15 colunas)

**(a) Desafio ao pipeline de RAG:**
Tabelas largas são estruturas **bidimensionais** que a extração de texto linear (PyPDF, pdfminer) colapsa em **fluxo unidimensional**. Em tabelas >15 colunas, a leitura por _reading order_ embaralha células: o valor da coluna `Multiplicador Norte` perde o vínculo com o cabeçalho `Norte` e com a chave de linha `Faixa de peso`. A relação **célula → (cabeçalho de coluna, chave de linha)** é destruída na indexação. Adicionalmente, _chunkers_ por contagem de caracteres cortam a tabela no meio, separando o cabeçalho das linhas de dados.

**(b) Degradação da resposta do LLM:**
O LLM recebe um chunk onde os números existem mas as coordenadas semânticas não. Resultado: **alucinação numérica de cruzamento** — o modelo associa o multiplicador errado à região errada (ex.: aplica o multiplicador do Sudeste a uma carga do Norte). Em um domínio de frete, isso é um erro de **valor monetário cobrado ao cliente** — falha de alta severidade, não cosmética.

**(c) Estratégia técnica de mitigação:**
Substituir extração textual ingênua por **parsing estrutural de layout**: pipeline com _layout-aware document parser_ (ex.: `unstructured.io` com `hi_res`, Azure Document Intelligence — _Layout/Table model_, ou LlamaParse). Procedimento concreto:

- Detectar regiões de tabela e serializá-las como **Markdown ou HTML preservando cabeçalhos**, nunca como texto plano.
- Aplicar **chunking estrutura-consciente**: a tabela é uma unidade atômica de chunk; se exceder o limite, particionar **por linhas mantendo o cabeçalho replicado em cada sub-chunk** (header injection).
- Anexar ao chunk um **resumo textual gerado** da tabela ("Tabela de multiplicadores regionais de frete especial; chaves: região × faixa de peso") para reforçar _recall_ na busca semântica, já que vetores de tabelas numéricas têm baixa densidade semântica.

---

### 1.2. PDFs escaneados (sem camada de texto nativa)

**(a) Desafio:**
Não há texto extraível — são **imagens raster**. O _ingest_ padrão retorna string vazia ou _garbage_. O chunk indexado fica vazio ou ruidoso; o documento torna-se **invisível ao retriever** (falha silenciosa de cobertura).

**(b) Degradação da resposta:**
O efeito mais perigoso não é o erro, é a **omissão silenciosa**: o documento simplesmente não entra no índice. O LLM responde com base no subconjunto visível e o usuário não tem sinal de que uma fonte autoritativa foi ignorada — **falso negativo de retrieval**, indetectável pelo atendente.

**(c) Estratégia de mitigação:**
Etapa obrigatória de **OCR no pré-processamento** antes da indexação: Azure Document Intelligence ou AWS Textract (preferíveis a Tesseract puro por reconstruírem **layout e tabelas** em documentos escaneados — relevante porque escaneados de frete também contêm tabelas). Diretrizes:

- Registrar **confidence score** por página; páginas abaixo de um limiar (ex.: <85%) vão para fila de **revisão humana**, não para o índice cego.
- Persistir um metadado `extraction_method: ocr` no chunk, permitindo _down-weighting_ ou flag de incerteza na resposta.
- Pré-processar imagem (deskew, binarização) quando o _confidence_ médio do lote for baixo.

---

### 1.3. Wiki do Confluence (links internos + macros customizadas)

**(a) Desafio:**
Dois problemas distintos. (i) **Links internos**: o conhecimento é **distribuído por referência** — a página A diz "ver procedimento de devolução" e linka para B. Um chunk de A, isolado, é semanticamente incompleto. (ii) **Macros customizadas** (`{include}`, `{excerpt}`, `{jira}`, painéis): o _export_ renderiza placeholders ou markup bruto (`{toc}`, `{children}`) que poluem o texto, e o conteúdo dinâmico injetado por `{include}` **não existe no corpo da página fonte**.

**(b) Degradação da resposta:**
O LLM responde a partir de um fragmento que **referencia mas não contém** a informação ("conforme a política de devolução…") sem ter a política no contexto — resposta truncada ou inventada. Markup de macro não resolvido entra como **ruído tóxico** no embedding, degradando a qualidade do vetor e poluindo a geração.

**(c) Estratégia de mitigação:**
Ingerir via **API REST do Confluence** (`expand=body.storage`) em vez de export de PDF/HTML, obtendo o XHTML estruturado:

- **Resolver macros no ingest**: expandir `{include}`/`{excerpt}` materializando o conteúdo transcluído no corpo; remover macros puramente visuais (`{toc}`, painéis) via _allow-list_ de macros relevantes.
- **Modelar links como grafo de metadados**: persistir `linked_pages: [ids]` no chunk. No retrieval, aplicar **expansão de 1 salto (graph-augmented retrieval)** — ao recuperar a página A, anexar o chunk-âncora das páginas diretamente linkadas, reconstruindo o contexto distribuído.
- Converter XHTML → Markdown limpo preservando hierarquia de headings para o chunking estrutural.

---

### 1.4. Planilhas com fórmulas interdependentes

**(a) Desafio:**
Uma célula com `=B2*PROC042.Mult` armazena **a fórmula, não o valor resolvido**. Extração ingênua indexa a string da fórmula (inútil semanticamente) ou o valor cacheado (sem a lógica). A **semântica relacional** — qual coluna multiplica qual, qual aba alimenta qual — é invisível no texto. Interdependência entre abas/arquivos cria um grafo de cálculo que o flat-text destrói.

**(b) Degradação da resposta:**
O LLM, ao ver `=B2*1.6` ou só `1247.50`, **não consegue explicar nem recalcular** a regra de negócio. Pior: pode tentar **executar aritmética sobre fórmulas como se fossem texto**, produzindo valores fabricados. Em consulta de frete, isso é erro financeiro direto.

**(c) Estratégia de mitigação:**
Tratar planilhas como **dado estruturado, não como prosa**:

- Extrair com `openpyxl`/`pandas` resolvendo o **valor computado E a fórmula** (carregar com `data_only=True` para valores e separadamente para fórmulas). **Risco técnico concreto:** `data_only=True` retorna o **valor cacheado** pela última abertura no Excel — se uma planilha foi gerada/alterada por script e nunca aberta, o cache é `None` e os valores chegam vazios. Mitigação: detectar células de cache nulo e, nesses casos, recalcular via um _engine_ de fórmulas (LibreOffice headless / `formulas`) antes de indexar, ou bloquear o arquivo na ingestão sinalizando para revisão.
- **Serialização linha-a-linha contextualizada**: converter cada linha em sentença chave-valor — `"Região: Norte | Faixa: >3000kg | Multiplicador: 1,8 | Fator peso: 1,4"` — em vez de despejar a grade. Cada linha torna-se um chunk recuperável e auto-descritivo.
- Para regras de cálculo (não dados), gerar um **chunk de documentação da lógica** ("Frete = Base × Mult.Regional × Fator.Peso") separado das linhas de dados.
- Idealmente, rotear consultas de cálculo para **tool-use/function-calling** (calculadora determinística parametrizada pelos valores recuperados) em vez de confiar na aritmética do LLM — o RAG fornece os parâmetros, o código fornece o número.

---

## 2. ESTIMATIVA MATEMÁTICA DA BASE EM TOKENS

Conversão fixa: **Tokens = Palavras / 0,75**.

> **Nota metodológica (correção de coerência interna):** a Seção 1 prescreve serializar tabelas para Markdown/HTML e planilhas para pares chave-valor — transformações que **inflam** a contagem textual em relação ao conteúdo bruto. Portanto, calculamos duas estimativas: a **base bruta** (texto-fonte) e a **base efetiva indexada** (pós-serialização + overlap), que é a que realmente ocupa o índice vetorial e dita custo. Tratar apenas a base bruta seria subestimar o volume justamente nas fontes mais densas.

### 2.1. PDFs do SharePoint

- **Premissa explícita de densidade:** documento corporativo (procedimentos, políticas, contratos) com layout, cabeçalhos, tabelas e espaçamento → **~450 palavras por página** (densidade conservadora; uma página A4 densa de texto puro chega a ~600, mas documentos corporativos têm margens, títulos e tabelas que reduzem a densidade textual média).
- **Premissa de variância (novo):** 10 páginas é uma **média** que mascara a cauda — políticas e contratos de 40–50 páginas coexistem com FAQs de 2 páginas. A estimativa abaixo é o **valor esperado**, não um teto; o dimensionamento de infra deve usar o **P90**, não a média (ver Seção 5).
- **Premissa de fração escaneada (novo):** assume-se que **~15% dos PDFs são escaneados** (sem camada de texto). O OCR sobre eles introduz ruído e exige correção, mas para fins de contagem mantemos a densidade média — o impacto material é em **qualidade**, tratado na Seção 1.2, não em volume.
- Cálculo (base bruta):
  - 800 documentos × 10 páginas = **8.000 páginas**
  - 8.000 páginas × 450 palavras = **3.600.000 palavras**
  - Tokens = 3.600.000 / 0,75 = **4.800.000 tokens**

### 2.2. Wiki do Confluence

- Dado fornecido: 400 páginas × 1.500 palavras.
  - 400 × 1.500 = **600.000 palavras**
  - Tokens = 600.000 / 0,75 = **800.000 tokens**

### 2.3. Planilhas

- **Premissa explícita de volume (revista para cima):** a estimativa anterior de ~2.000 palavras/planilha era **otimista** — subestimava o efeito da serialização linha-a-linha prescrita na Seção 1.4, em que cada célula numérica vira um par rótulo+valor repetindo o cabeçalho ("Região: Norte | Faixa: >3000kg | Multiplicador: 1,8"). Uma planilha operacional de frete/SLA com centenas de linhas gera muito mais texto. Premissa revista: **~3.500 palavras-equivalentes por planilha** após serialização contextualizada.
- Cálculo (base bruta serializada):
  - 50 planilhas × 3.500 palavras = **175.000 palavras**
  - Tokens = 175.000 / 0,75 = **233.333 tokens**

### 2.4. Total Geral — base bruta

| Categoria         |      Palavras |                 Tokens |
| ----------------- | ------------: | ---------------------: |
| PDFs SharePoint   |     3.600.000 |              4.800.000 |
| Wiki Confluence   |       600.000 |                800.000 |
| Planilhas         |       175.000 |                233.333 |
| **TOTAL (bruto)** | **4.375.000** | **≈ 5.833.333 tokens** |

### 2.5. Base efetiva indexada (estimativa realista, não otimista)

A base bruta **não** é o que ocupa o índice. Dois fatores de inflação se aplicam:

- **Overlap de chunking (15%, Seção 4.1):** cada token de fronteira é armazenado em dois chunks → **+15%** sobre o texto chunkeado.
- **Serialização de tabelas para Markdown/HTML (Seção 1.1):** cabeçalhos replicados por sub-chunk e marcação estrutural inflam o conteúdo tabular. Assumindo que ~20% da base é tabular e que a serialização a expande ~1,8×, o efeito ponderado sobre o total é **≈ +16%**.

Fator de inflação combinado ≈ **1,15 × 1,16 ≈ 1,33**:

|                                   |          Tokens |
| --------------------------------- | --------------: |
| Base bruta                        |     ≈ 5.833.333 |
| **Base efetiva indexada (×1,33)** | **≈ 7.758.000** |

**Conclusão:** a base **bruta** ≈ 5,83M tokens; a base **efetiva indexada** ≈ **7,76M tokens**. As decisões de custo de embedding e dimensionamento da vector store (Seção 5) devem usar a base **efetiva**, não a bruta — usar a bruta subdimensionaria a infra em ~33%.

---

## 3. ANÁLISE CORPORATIVA DE ORÇAMENTO DE CONTEXTO (CONTEXT BUDGET)

### 3.1. Cálculo de capacidade teórica

> **Correção de premissa otimista:** a versão anterior reservava apenas 4K para output e **ignorava o histórico de conversa**. Um atendente não faz uma pergunta isolada — há _follow-ups_ na mesma sessão, e a resposta precisa de espaço para citar fonte+versão, múltiplas regras e disclaimers de conflito. As reservas abaixo são realistas, não mínimas.

| Componente                                |      Tokens | Observação                                     |
| ----------------------------------------- | ----------: | ---------------------------------------------- |
| Janela total GPT-4o                       |     128.000 |                                                |
| (−) System Prompt + Guardrails (fixo)     |       2.000 | dado                                           |
| (−) Reserva de Output / resposta          |       6.000 | resposta com citações + disclaimer de conflito |
| (−) Histórico de conversa (multi-turn)    |       8.000 | ~3–4 turnos anteriores                         |
| **= Orçamento disponível para retrieval** | **112.000** |                                                |

- Bloco fixo por chunk: **500 tokens**.
- Chunks teoricamente comportáveis = 112.000 / 500 = **224 chunks**.

> Observação dimensional crítica: a base **efetiva indexada** tem ≈ **7.758.000 tokens ≈ 15.516 chunks de 500 tokens**. A janela do GPT-4o comporta **224 chunks (≈ 1,4% da base)**. **É arquiteturalmente impossível "colocar tudo no contexto"** — o RAG não é opcional, é obrigatório, e a tarefa do retriever é selecionar a fração de ~1% que importa. (Note que a fração caiu de ~2% para ~1,4% ao corrigir base bruta→efetiva e ao reservar histórico — o argumento fica _mais_ forte, não mais fraco.)

### 3.2. Impacto prático na estratégia de Retrieval — a armadilha de preencher a janela

Que caibam 244 chunks **não significa que se deva enviar 244 chunks**. Esta é a armadilha arquitetural central.

**O fenômeno "Lost in the Middle":** modelos de contexto longo exibem uma curva de atenção em **forma de U** — recuperam informação com alta fidelidade no **início** e no **fim** do contexto, mas a precisão **degrada acentuadamente para conteúdo posicionado no meio** da janela. Preencher 112K tokens com 224 chunks coloca a maior parte do material recuperado exatamente na zona de menor atenção. O efeito prático é perverso: **o chunk com a resposta correta (ex.: o multiplicador do Norte na PROC-042-v2) pode estar presente no contexto e ainda assim ser ignorado pelo modelo** por estar enterrado na posição 120 de 224.

Consequências de design que isso impõe:

1. **Maximizar recall ≠ maximizar qualidade.** Enviar mais chunks aumenta a chance de incluir a resposta, mas dilui a atenção e injeta distratores — em um domínio onde PROC-042 v1 e v2 coexistem com **valores conflitantes**, distratores são ativamente perigosos (o modelo pode citar o multiplicador da versão errada).
2. **A estratégia ótima é "poucos chunks, altamente precisos, bem ordenados"**, não "janela cheia". O alvo operacional deve ser **8–15 chunks de alta relevância**, não 244.
3. **Precisão > recall bruto** para este caso de uso: respostas de frete/SLA exigem **uma fonte autoritativa correta**, não um agregado de fragmentos. Isso justifica re-ranking e posicionamento deliberado (seção 4).
4. **Custo e latência**: 112K tokens de input por consulta é caro e lento, sem ganho de qualidade — desperdício injustificável em volume de atendimento.

---

## 4. RECOMENDAÇÃO DE ESTRATÉGIA DE CHUNKING E RETRIEVAL

Perfil do usuário: atendente corporativo buscando **regras operacionais discretas, SLAs e valores de frete** — consultas factuais, pontuais, com **exigência de exatidão e rastreabilidade de fonte/versão**.

### 4.1. Estratégia de Chunking

**Decisão: chunking estrutura-consciente (structure-aware), não tamanho fixo cego.**

- **Splitter:** **Markdown/Header-aware recursive splitter** (ex.: `MarkdownHeaderTextSplitter` + `RecursiveCharacterTextSplitter` como fallback). Justificativa: as fontes são fortemente seccionadas (`### 3.1 Prazo geral`, `## 2. Tabela de SLAs`). Quebrar nos limites de heading mantém cada regra operacional íntegra em um chunk — alinhado ao padrão de consulta "uma pergunta = uma regra".
- **Tamanho do bloco:** **512 tokens** (alinhado ao bloco de 500 da seção 3). Justificativa: granularidade suficiente para conter uma seção normativa completa (a maioria das seções das fontes cabe em 300–500 tokens) sem diluir o embedding com múltiplos tópicos — chunks grandes degradam a precisão da busca vetorial.
- **Overlap:** **15% (~75 tokens)**. Justificativa: garante continuidade quando uma regra atravessa o limite do chunk, sem inflar redundância. Overlap maior desperdiça orçamento de janela com duplicação.
- **Tabelas (frete/SLA):** **exceção à regra de tamanho** — tabela é **chunk atômico** com cabeçalho preservado; se exceder 512 tokens, particionar por linhas com **header replicado** (ver 1.1). Nunca cortar tabela por contagem de caracteres.
- **Metadados obrigatórios por chunk** (decisivos para este domínio): `doc_id`, `versao` (ex.: `PROC-042-v2`), `data_emissao`, `classificacao` (`normativo` | `contratual` | `informal`), `secao`. Esses metadados são o que permite **resolver o conflito v1/v2** e **priorizar fonte autoritativa sobre o FAQ informal** no retrieval e na citação.

### 4.2. Arquitetura de Retrieval

**Decisão: pipeline de Hybrid Search + Re-ranking + Context Ordering, com filtragem por metadados.**

1. **Busca híbrida (dense + sparse):** combinar **embedding vetorial** (semântica — `text-embedding-3-large`) com **BM25/keyword** (correspondência exata). Justificativa direta do domínio: termos como `"PROC-042"`, `"Gold"`, `"Norte"`, `"1.8"` são **tokens exatos** que a busca densa pode perder; BM25 os captura. Frete/SLA é cheio de identificadores literais.
2. **Filtro por metadados antes do ranking:** quando a consulta implica versão/recência/autoridade, filtrar por `classificacao` e `versao` para suprimir distratores conflitantes (ex.: rebaixar `PROC-042 v1` e o FAQ informal frente ao normativo vigente).
3. **Re-ranking com cross-encoder:** recuperar um candidate set amplo (ex.: top-40 da busca híbrida) e re-rankear com um **cross-encoder** (ex.: Cohere Rerank). Justificativa: o re-ranker avalia relevância **consulta↔chunk conjuntamente**, elevando a precisão do topo — exatamente o que mitiga o envio de distratores.
4. **Seleção enxuta:** passar apenas o **top-8 a top-12** chunks re-rankeados ao LLM — não a janela cheia (decisão fundamentada na seção 3.2).
5. **Mitigação direta de "Lost in the Middle" — Context Reordering:** após o re-ranking, **reposicionar os chunks** de modo que os **mais relevantes fiquem no início e no fim** do contexto, e os menos relevantes no meio (estratégia _"reorder to edges"_ / `LongContextReorder`). Isso alinha a informação crítica às zonas de **alta atenção** da curva em U.
6. **Compressão contextual (opcional, alto valor aqui):** aplicar _contextual compression_ extraindo apenas as sentenças relevantes de cada chunk antes do envio — maximiza densidade de sinal por token, reduz ainda mais o material no "meio".
7. **Grounding e citação obrigatória:** instruir o modelo (via system prompt) a **citar `doc_id` + `versao`** de cada afirmação e a **declarar conflito** quando recuperar versões divergentes (v1 vs v2), em vez de escolher silenciosamente. Dado o caráter contratual/financeiro das respostas, rastreabilidade é requisito, não enfeite.

**Síntese da arquitetura:**
`Query → Hybrid Search (dense+BM25) → Filtro de metadados (versão/autoridade) → top-40 candidatos → Cross-encoder rerank → top-10 → Contextual compression → Reorder-to-edges → GPT-4o (com citação de fonte+versão obrigatória)`

---
