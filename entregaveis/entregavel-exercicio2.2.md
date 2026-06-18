# Entregável — Exercício 2.2: Implementação de spec com Spec Driven Development

Projeto NovaTech Assistant — módulo _query endpoint_. Cadeia SDD: [`requirements.md`](../novatech-assistant/specs/query-endpoint/requirements.md) (Product Specialist) → [`plan.md`](../novatech-assistant/specs/query-endpoint/plan.md) (Tech Lead) → **[`tasks.md`](../novatech-assistant/specs/query-endpoint/tasks.md) + primeira task (Desenvolvedor)**. Padrões do plan: TypeScript estrito, Azure Functions v4, Zod, pino.

O protótipo de RAG open-source do cenário 1 (ChromaDB + sentence-transformers) validou a abordagem (**ADR-0004**); agora o código é de produção, com os padrões do projeto.

---

## 1. `tasks.md` — decomposição em tasks atômicas

Arquivo entregue em [`novatech-assistant/specs/query-endpoint/tasks.md`](../novatech-assistant/specs/query-endpoint/tasks.md). Estimativa: P (≤½ dia) · M (½–1 dia) · G (>1 dia).

| ID        | Descrição                                                                                                                                               | Critérios de aceite (verificáveis)                                                                                                                                                                                 | Deps               | Est. |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ---- |
| **QE-02** | Tipos do domínio e erros: `QueryRequest`, `QueryResponse`, `RetrievedChunk`, `SourceDocument`; `ValidationError`, `UpstreamError`.                      | `npm run build` compila em strict. `QueryResponse` = `{ answer, source_document }`. `RetrievedChunk` = `{ id, content, source_document, score }`.                                                                  | —                  | P    |
| **QE-01** | Setup do endpoint + validação de input: Azure Function v4 `POST /api/query`; schema Zod; **400** estruturado p/ body inválido e **200** p/ body válido. | Sem `question` → **400** `{error}`. `question` não-string/vazia → **400**. JSON malformado → **400** (não 500). Body válido → **200** com `QueryResponse`.                                                         | QE-02              | P    |
| **QE-03** | Recuperação de chunks (Azure AI Search): interface `SearchService.retrieve()`, top-5; stub para teste.                                                  | Casos do Anexo B: "Frete 600kg Manaus" → incl. `PROC-042v2-A`/`PROC-042v2-B`; "SLA do Platinum" → `SLA-2024-A`; "Frete 300kg Salvador" (<500kg) → **nenhum chunk relevante**; `score` decrescente.                 | QE-02              | M    |
| **QE-04** | Montagem do prompt com context budget (**ADR-0002**): `~4K system + ~8K chunks (máx. 5)`.                                                               | 10 chunks de entrada → no máx. 5 no prompt; tokens de chunks ≤ ~8K; função pura.                                                                                                                                   | QE-02, QE-03       | M    |
| **QE-05** | Chamada ao modelo + retry exponencial (máx. 3).                                                                                                         | Sucesso → texto; erro transitório → 3 tentativas com backoff, depois `UpstreamError`.                                                                                                                              | QE-04              | M    |
| **QE-06** | Response builder com `source_document` (**ADR-0003**): cita a fonte; em contradição v1/v2 prioriza a mais recente.                                      | `source_document` sempre não vazio; "Sudeste" (PROC-042 v1+v2) → cita **v2** (1.1, não 1.0); "Platinum" → nega o tier (fonte `SLA-2024-A`); "Frete 300kg Salvador" → `answer` diz que não encontrou, sem inventar. | QE-02, QE-05       | P    |
| **QE-07** | Logging estruturado (pino), sem `console.log`.                                                                                                          | Cada request → log JSON com `requestId`, `route`, `durationMs`; zero `console.log`.                                                                                                                                | QE-01              | P    |
| **QE-08** | Composição do handler: injeta busca + prompt + modelo + builder, substituindo o placeholder da QE-01.                                                   | Body válido → **200** com resposta real e `source_document` correto; erro upstream → **502/503**.                                                                                                                  | QE-01, QE-03–QE-06 | M    |

**Ordem:** `QE-02` → `QE-01` → (`QE-03…QE-06` conforme deps) → `QE-07` → `QE-08`.

Atomicidade: cada task tem entrada/saída próprias e teste isolado — a QE-01 é testável sem busca nem modelo (placeholder na resposta); QE-03/05 usam stubs; QE-08 só integra peças já testadas.

---

## 2. Implementação da primeira task (QE-01) — fluxo Copilot

A QE-01 (com a QE-02 como pré-requisito de tipos) é a primeira task. Implementada com apoio do GitHub Copilot e depois revisada (ver §4).

### 2.1 — Primeira geração (draft do Copilot)

Prompt ao Copilot: _"Crie o handler da Azure Function v4 POST /api/query em TypeScript: valide que o body tem `question` e retorne 400 se faltar, senão 200 com a pergunta."_ Saída típica:

```typescript
// draft gerado — NÃO é a versão final (ver problemas na §4)
import { app, HttpRequest, HttpResponseInit } from "@azure/functions";

export async function queryHandler(
  request: HttpRequest,
): Promise<HttpResponseInit> {
  const body = (await request.json()) as any;

  console.log("query recebida:", body);

  if (!body.question) {
    return { status: 400, body: "question é obrigatório" };
  }

  return {
    status: 200,
    jsonBody: { answer: `Pergunta: ${body.question}`, source_document: {} },
  };
}

app.http("query", { methods: ["POST"], handler: queryHandler });
```

### 2.2 — Versão final (após revisão)

Tipos do domínio — [`src/shared/types.ts`](../novatech-assistant/src/shared/types.ts) (QE-02):

```typescript
export interface SourceDocument {
  id: string;
  title: string;
  effectiveDate?: string;
}
export interface RetrievedChunk {
  id: string;
  content: string;
  source_document: SourceDocument;
  score: number;
}
export interface QueryRequest {
  question: string;
}
export interface QueryResponse {
  answer: string;
  source_document: SourceDocument;
}
```

Validação com Zod — [`src/functions/query/validator.ts`](../novatech-assistant/src/functions/query/validator.ts):

```typescript
import { z } from "zod";
import type { QueryRequest } from "../../shared/types.js";

export const queryRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "campo 'question' é obrigatório e não pode ser vazio"),
});

export type ParseResult =
  | { success: true; data: QueryRequest }
  | { success: false; error: string };

export function parseQueryRequest(body: unknown): ParseResult {
  const result = queryRequestSchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };
  const firstIssue = result.error.issues[0];
  return {
    success: false,
    error: firstIssue?.message ?? "corpo da requisição inválido",
  };
}
```

Handler v4 — [`src/functions/query/handler.ts`](../novatech-assistant/src/functions/query/handler.ts):

```typescript
import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { parseQueryRequest } from "./validator.js";
import type { QueryResponse } from "../../shared/types.js";

async function readJsonBody(request: HttpRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function queryHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const body = await readJsonBody(request);

  const parsed = parseQueryRequest(body);
  if (!parsed.success) {
    context.warn(`query: input inválido — ${parsed.error}`);
    return { status: 400, jsonBody: { error: parsed.error } };
  }

  // Placeholder — QE-08 substitui pela resposta real (busca + modelo).
  const response: QueryResponse = {
    answer: `Pergunta recebida: "${parsed.data.question}". Resposta gerada nas tasks QE-03…QE-08.`,
    source_document: {
      id: "PENDING",
      title: "preenchido na composição do handler (QE-08)",
    },
  };

  return { status: 200, jsonBody: response };
}

app.http("query", {
  methods: ["POST"],
  route: "query",
  authLevel: "function",
  handler: queryHandler,
});
```

Dependência adicionada em [`package.json`](../novatech-assistant/package.json): `"@azure/functions": "^4.16.1"` (`zod` movido para `dependencies`, pois é usado em runtime).

> Os serviços que exigiriam Azure real (busca, modelo) ficam como interfaces nas tasks QE-03/QE-05 — a QE-01 não os toca, mantendo-se testável sem nenhum serviço provisionado (alinhado ao Anexo C: nesta fase não há Azure).

---

## 3. Evidência de execução

A partir de `novatech-assistant/`: `npm install` → `npm run build` → `npm test`.

`npm run build` (TypeScript strict) compila sem erro. `npm test`:

```
> novatech-assistant@0.1.0 test
> vitest run

 RUN  v2.1.9 .../novatech-assistant

stderr | tests/unit/query-handler.test.ts
WARNING: Failed to detect the Azure Functions runtime. Switching "@azure/functions" package to test mode - not all features are supported.
WARNING: Skipping call to register function "query" because the "@azure/functions" package is in test mode.

 ✓ tests/unit/query-handler.test.ts (8 tests) 8ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
```

Teste em [`tests/unit/query-handler.test.ts`](../novatech-assistant/tests/unit/query-handler.test.ts) — os 8 casos cobrem os critérios de aceite da QE-01:

| Caso                             | Esperado                             |
| -------------------------------- | ------------------------------------ |
| body sem `question`              | 400 com `{error}`                    |
| `question` não-string (número)   | 400                                  |
| `question` só espaços            | 400                                  |
| JSON malformado (`json()` lança) | 400 (não 500)                        |
| body válido                      | 200 com `answer` + `source_document` |
| validator: trim de `question`    | `data.question` sem espaços          |

O `@azure/functions` detecta a ausência de runtime e entra em **test mode**, pulando o registro no host (`app.http`) e exercitando o handler diretamente — é o modo previsto pelo pacote para teste unitário fora do Azure.

---

## 4. Revisão crítica do código gerado

1- Usar "as any" no body destrói o type-safety e o código quebra se o body vier nulo. O "as any" desliga totalmente o TypeScript, e tentar acessar "body.question" direto vai estourar um TypeError na cara do usuário se o payload for nulo ou um array, jogando um erro 500 no servidor. Para resolver, o ideal é tipar o body como unknown e fazer o estreitamento de tipo (type narrowing) com o Zod (safeParse), garantindo que nada seja acessado antes de validar.

2- Chamar o request.json() direto sem um bloco try/catch faz qualquer JSON malformado virar erro 500. Se o cliente mandar uma sintaxe inválida, a requisição quebra o fluxo antes da validação. O correto aqui é retornar 400, já que o erro é do cliente. Uma boa saída é criar uma função auxiliar para envelopar esse parse, devolvendo undefined em caso de falha para o Zod barrar e responder com 400. Inclusive, vale a pena cobrir isso com um teste de "JSON malformado".

3- Deixar console.log espalhado quebra as boas práticas do projeto. O plano do sistema exige logging estruturado (com pino, por exemplo) e proíbe console.log direto para evitar vazamento de dados em texto limpo, além de perder a correlação dos logs. O melhor é remover isso e usar a infraestrutura do projeto (como um context.warn) para registrar os inputs inválidos.

Uma última observação sobre o primeiro ponto: aquela validação manual antiga com "if (!body.question)" deixa passar muita sujeira, tipo string cheia de espaços em branco, além de aceitar tipos totalmente errados. Usar o schema do Zod com ".trim().min(1)" resolve os dois problemas de uma vez e centraliza a regra de negócio em um lugar só.
