# Requirements — Query Endpoint

> Autor: Product Specialist · Aprovação: Tech Lead. Primeiro elo da cadeia SDD: **requirements → [plan](./plan.md) → [tasks](./tasks.md)**.

## Objetivo

Expor um endpoint que recebe a pergunta de um atendente da NovaTech e devolve uma resposta fundamentada **apenas** nos documentos recuperados do corpus (RAG), sempre citando a fonte. É a porta de entrada do assistente usado no bot do Teams e no painel web.

## Escopo

- **Entrada:** `POST /api/query` com `{ "question": string }`.
- **Saída:** `{ "answer": string, "source_document": { id, title, effectiveDate? } }`.
- **Fora de escopo:** ingestão de documentos (pipeline próprio), feedback do usuário (módulo `feedback-api`), autenticação do atendente (camada do gateway).

## Requisitos funcionais

| ID | Requisito |
|----|-----------|
| RF-1 | Validar a entrada: `question` obrigatória, string, não vazia. Entrada inválida → **400** com mensagem de erro; nunca processar pergunta vazia. |
| RF-2 | Recuperar os chunks mais relevantes do corpus (top-5) para a pergunta. |
| RF-3 | Montar o prompt com system prompt + chunks + pergunta respeitando o **context budget** (ADR-0002: ~4K system + ~8K chunks). |
| RF-4 | Gerar a resposta via modelo e retornar **sempre** com `source_document` citando o documento de origem. |
| RF-5 | Quando houver versões contraditórias do mesmo procedimento, usar a de **vigência mais recente** (ADR-0003) e citá-la como fonte. |
| RF-6 | Quando nenhum chunk relevante for recuperado, responder que a informação **não foi encontrada** — não inventar (anti-alucinação). |

## Regras de domínio e guardrails (Anexo A/B)

Casos extraídos do mapa de cobertura do Anexo B, usados como critérios de aceite das tasks de retrieval e resposta:

| Pergunta do atendente | Comportamento esperado | Fonte |
|-----------------------|------------------------|-------|
| "Frete para 600kg para Manaus?" | Recuperar `PROC-042v2-A` + `PROC-042v2-B`; usar os multiplicadores da **v2** (Norte 1.8), não da v1 (1.6). | PROC-042 v2 |
| "Qual o multiplicador para o Sudeste?" | Usar v2 (1.1), não v1 (1.0) — contradição resolvida por vigência. | PROC-042 v2 |
| "Qual o SLA do cliente Platinum?" | Responder que **só existem 3 tiers** (Gold, Silver, Standard); não inventar SLA de Platinum. | SLA-2024-A |
| "Frete para 300kg para Salvador?" | Frete padrão (<500kg) **não está documentado** → dizer que não encontrou; não estimar. | — (sem cobertura) |
| "O que acontece com carga danificada?" | Encaminhar conforme FAQ-38; reconhecer que não há documento formal — não tratar FAQ como regra crítica. | FAQ-38 |

## Requisitos não funcionais

| ID | Requisito |
|----|-----------|
| RNF-1 | TypeScript estrito, Azure Functions v4, Zod na validação, logging estruturado (pino) — sem `console.log`. |
| RNF-2 | Resiliência: retry com backoff exponencial nas chamadas a serviços externos (Azure AI Search / OpenAI). |
| RNF-3 | Erros de cliente → 4xx; falha de dependência externa → 5xx (não 500 genérico para input inválido). |

## Critérios de aceite (nível de produto)

- Pergunta inválida nunca chega ao modelo (cortada na validação → 400).
- Toda resposta de sucesso cita `source_document`.
- Em contradição de versões, a resposta reflete a versão vigente (ADR-0003).
- Pergunta sem cobertura no corpus → resposta de "não encontrado", sem alucinação.
