# Prompts Utilizados — Exercício 1.1

Registro literal dos prompts enviados pelo usuário nesta conversa.

---

## Prompt 1 — Geração da análise técnica

> Você é um Arquiteto de Soluções de IA e Engenheiro de Prompt Sênior, especialista em arquiteturas RAG (Retrieval-Augmented Generation) e Engenharia de Contexto.
>
> Seu objetivo é gerar as análises técnicas primárias, estimativas e recomendações arquiteturais para um assistente baseado em LLM (utilizando o modelo GPT-4o com 128K de janela de contexto) para a empresa NovaTech.
>
> Para a tarefa: Utilize os arquivos presentes em .\docs como suas fontes de verdade
>
> Para resolver esta tarefa com profundidade técnica, processe as informações estruturando sua resposta rigorosamente nos 4 tópicos abaixo:
>
> ### 1. MATRIZ DE TRATAMENTO DE FONTES DE DADOS COMPLEXAS
>
> Para cada uma das fontes de dados brutas descritas abaixo, determine: (a) O desafio exato que ela impõe ao pipeline de RAG (indexação/busca); (b) Como esse desafio degrada a qualidade da resposta do LLM; e (c) Uma estratégia técnica concreta de engenharia de dados/RAG para mitigar o problema.
>
> Fontes a cobrir:
>
> - PDFs do SharePoint com tabelas complexas (tabelas de frete com mais de 15 colunas).
> - PDFs escaneados (documentos sem camada de texto nativa).
> - Wiki do Confluence com links internos entre páginas e uso de macros customizadas.
> - Planilhas com fórmulas interdependentes.
>
> ### 2. ESTIMATIVA MATEMÁTICA DA BASE EM TOKENS
>
> Calcule o tamanho aproximado da base de conhecimento em tokens. Utilize estritamente a regra prática de que 1 token equivale a ~0.75 palavras (ou seja, Palavras / 0.75 = Tokens). Exiba o cálculo passo a passo para cada categoria:
>
> - PDFs do SharePoint: 800 documentos, média de 10 páginas cada (assuma uma premissa realista e explícita de densidade de palavras por página corporativa).
> - Wiki do Confluence: 400 páginas, média de 1.500 palavras cada.
> - Planilhas: 50 planilhas (assuma uma premissa realista e explícita de volume de dados/palavras equivalentes por planilha ao ser convertida para texto).
> - Total Geral: Apresente a soma final em tokens da base inteira.
>
> ### 3. ANÁLISE CORPORATIVA DE ORÇAMENTO DE CONTEXTO (CONTEXT BUDGET)
>
> O modelo alvo é o GPT-4o (128K de janela de contexto de entrada). O System Prompt + Instruções de Guardrails consomem ~2K fixos.
>
> - Faça o cálculo matemático: considerando blocos fixos de ~500 tokens por chunk, quantos chunks caberiam puramente na teoria dentro do limite do modelo? (Reserve uma margem segura de tokens para o Output/resposta do modelo).
> - Explique o impacto prático disso na estratégia de busca (Retrieval). Aborde obrigatoriamente a armadilha arquitetural de tentar preencher a janela inteira, conectando com o fenômeno de degradação conhecido como "Lost in the Middle" (perda de atenção no meio do contexto).
>
> ### 4. RECOMENDAÇÃO DE ESTRATÉGIA DE CHUNKING E RETRIEVAL
>
> Com base no comportamento esperado dos usuários (atendentes corporativos buscando regras operacionais, SLAs e valores de frete), forneça uma recomendação técnica justificada de:
>
> - Estratégia de Chunking ideal (tamanho do bloco, overlap/sobreposição e tipo de splitter mais adequado para os formatos descritos).
> - Arquitetura de Recuperação (Retrieval) ideal para garantir alta relevância dos pedaços de texto e mitigar o efeito "Lost in the Middle".
>
> ---
>
> Adote um tom estritamente profissional, técnico, analítico e de engenharia. Evite generalidades como "recomenda-se testar" ou "depende do cenário". Dê diretrizes arquiteturais claras e decisões de design justificadas.

---

## Prompt 2 — Extração para arquivo

> extraia isso para um arquivo .md chamado entregavel-exercicio1.1.md em uma pasta chamada entregaveis

---

## Prompt 3 — Revisão crítica

> Avalie o documento de análise e faça uma revisão rigorosa, identifiquei algumas inconsistências
>
> Identifique pontos fracos, estimativas otimistas demais ou riscos que eu não considerei. Abaixo os pontos de melhoria que eu revisei:
>
> 1. Voce fez uma subestimativa de tokens, considerou apenas a média das paginas e não considerou documentos extensos
> 2. O OCR pode trazer ruido para a busca
> 3. Falta espaço para o histórico de conversa nas suas estimativas

---

## Prompt 4 — Registro de prompts e histórico

> Crie 1 arquivo .md em prompts\exercicio1.1 com os prompts que eu usei nessa conversa e 1 arquivo .md breve com nosso historico de interação
