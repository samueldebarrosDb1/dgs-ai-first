# Histórico de Interação — Exercício 1.1

Resumo breve da sessão de trabalho.

| # | Ação do usuário | Resposta do assistente |
|---|-----------------|------------------------|
| 1 | Solicitou análise arquitetural RAG para a NovaTech (GPT-4o 128K), com 4 tópicos: matriz de fontes, estimativa de tokens, context budget e estratégia de chunking/retrieval, usando `.\docs` como fonte de verdade. | Leu as 5 fontes em `docs/` (FAQ, POL-001, PROC-042 v1/v2, SLA-2024) e produziu a análise completa nos 4 tópicos, com premissas explícitas e tom técnico. |
| 2 | Pediu para extrair a análise para `entregaveis/entregavel-exercicio1.1.md`. | Criou a pasta `entregaveis/` e gravou o documento. |
| 3 | Pediu revisão crítica: pontos fracos, estimativas otimistas e riscos não considerados, com o feedback incorporado. | Identificou 10 pontos e incorporou: corrigiu estimativa de planilhas, adicionou base efetiva indexada (~7,76M tokens), revisou o context budget (reserva de output + histórico multi-turn), apontou risco do `data_only=True`, e adicionou a Seção 5 (governança de versão, reindexação, custo/latência, tuning, P90, limites de OCR). |
| 4 | Pediu este registro de prompts e o histórico de interação. | Criou `prompts/exercicio1.1/prompts-utilizados.md` e este arquivo. |

## Principais resultados

- **Entregável:** [entregaveis/entregavel-exercicio1.1.md](../../entregaveis/entregavel-exercicio1.1.md)
- **Fontes de verdade:** 5 documentos em [docs/](../../docs/)
- **Conclusão técnica central:** RAG é obrigatório (a base efetiva ≈7,76M tokens cabe ~1,4% na janela); a correção factual depende de governança documental humana para resolver o conflito PROC-042 v1/v2 e validar o FAQ informal antes do go-live.
