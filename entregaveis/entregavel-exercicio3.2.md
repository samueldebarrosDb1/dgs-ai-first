# Entregável — Exercício 3.2: Revisão Crítica de Código Gerado por IA

Projeto NovaTech Assistant — módulo de feedback (`POST /api/feedback`). O Copilot gerou o handler e o Tech Lead pediu revisão **antes do merge**. Este é o caso citado no Cenário 3: _"um desenvolvedor gerou com o Copilot um módulo de feedback que ignorou regras do AGENTS.md (não usou Zod, logou dados sensíveis do atendente)."_

Fluxo do exercício: **(1)** revisão própria (humana) antes do Claude; **(2)** segunda revisão com o Claude; **(3)** comparação honesta; **(4)** reescrita seguindo o AGENTS.md. A regra base é [`skills/foundation/typescript-conventions/SKILL.md`](../novatech-assistant/skills/foundation/typescript-conventions/SKILL.md), que já cataloga os anti-padrões que o Copilot costuma gerar.

---

## Código gerado pelo Copilot (objeto da revisão)

```typescript
// feedback-handler.ts — gerado pelo Copilot
import { app, HttpRequest, HttpResponseInit } from "@azure/functions";

export async function feedbackHandler(request: HttpRequest): Promise<HttpResponseInit> {
  const body = (await request.json()) as any;
  const feedback = {
    queryId: body.queryId, rating: body.rating, comment: body.comment,
    attendantEmail: body.attendantEmail, timestamp: new Date().toISOString(),
  };
  console.log("Feedback recebido:", JSON.stringify(feedback));
  const { CosmosClient } = require("@azure/cosmos");
  const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
  const database = client.database("novatech");
  const container = database.container("feedbacks");
  await container.items.create(feedback);
  return { status: 200, body: "OK" };
}
app.http("feedback", { methods: ["POST"], handler: feedbackHandler });
```

---

## 1. Minha revisão (humana, ANTES do Claude)

Li o código contra o AGENTS.md. Os problemas que pareceram óbvios numa leitura atenta:

| # | Problema | Classificação |
|---|----------|---------------|
| H1 | `(await request.json()) as any` — sem validação de input. O `as any` desliga o type-checker e nada garante que `queryId`/`rating` existam ou tenham o tipo certo. | Violação AGENTS.md + bug |
| H2 | `console.log(...)` em vez do logger estruturado do projeto. | Violação AGENTS.md |
| H3 | `require("@azure/cosmos")` dinâmico — o projeto é ESM, imports devem ser estáticos no topo. | Violação AGENTS.md |
| H4 | `attendantEmail` (e-mail do atendente = dado pessoal) cai no log via `JSON.stringify(feedback)`. | Segurança / LGPD |
| H5 | `request.json()` sem try/catch — body malformado vira exceção não tratada (500). | Bug |
| H6 | Retorno `body: "OK"` (string solta) em vez de resposta estruturada. | Violação de padrão |

Foco da revisão humana: o que salta aos olhos por **conhecer o contexto do projeto** — as 3 regras explícitas do AGENTS.md (Zod, pino/sem console.log, sem require) e, principalmente, o **e-mail no log**, que é o risco que mais preocupa o negócio (exposição de dado pessoal num sistema que vai a produção).

---

## 2. Revisão do Claude (segunda passada)

O Claude confirmou H1–H6 e acrescentou itens que passaram na minha leitura — em geral ligados a **robustez e ciclo de vida de recurso**, menos visíveis sem olhar caminho de erro:

| # | Problema | Classificação |
|---|----------|---------------|
| C1 | `await container.items.create(...)` sem try/catch: falha do Cosmos vira **500 com stack vazada**; deveria virar `UpstreamError` → 5xx com mensagem genérica. | Bug + segurança |
| C2 | `new CosmosClient(...)` **a cada request** — recria conexão a toda invocação (desperdício de socket/throughput). Client deve ser de escopo de módulo ou injetado. | Bug (performance/recurso) |
| C3 | `process.env.COSMOS_CONNECTION_STRING` usado sem checar se está definido — se faltar, o erro só estoura no meio da request. | Bug |
| C4 | `rating` sem validação de faixa — aceita `0`, `999`, negativo, string. Regra de negócio (1–5) não é imposta. | Bug |
| C5 | `app.http` sem `authLevel` nem `route` — a QE-01 padroniza `authLevel: "function"`; endpoint de escrita exposto como anônimo é risco. | Segurança / inconsistência |
| C6 | Sem `InvocationContext` na assinatura — o handler nem tem acesso ao logger correto da plataforma. | Violação AGENTS.md |

---

## 3. Comparação honesta (humano × Claude)

| Achado | Humano | Claude |
|--------|:------:|:------:|
| `as any` sem Zod (H1) | ✅ | ✅ |
| `console.log` (H2) | ✅ | ✅ |
| `require` dinâmico (H3) | ✅ | ✅ |
| `attendantEmail` no log (H4) | ✅ | ✅ |
| JSON sem try/catch (H5) | ✅ | ✅ |
| Retorno não estruturado (H6) | ✅ | ✅ |
| Cosmos sem try/catch → stack vazada (C1) | ❌ | ✅ |
| Client recriado por request (C2) | ❌ | ✅ |
| Connection string não validada (C3) | ❌ | ✅ |
| `rating` sem faixa (C4) | ❌ | ✅ |
| `app.http` sem authLevel/route (C5) | ❌ | ✅ |
| Falta `InvocationContext` (C6) | parcial (vi o console.log, não a causa) | ✅ |

**Leitura honesta dos resultados:**

- **Os 4 achados obrigatórios do exercício** (`as any` sem Zod, `console.log`, `require` dinâmico, `attendantEmail` logado) foram pegos por **ambos** — são os mais visíveis e os que o AGENTS.md cita textualmente.
- **Onde o humano foi forte:** priorização por risco de negócio. Identifiquei o e-mail no log imediatamente como o problema nº 1 (LGPD), porque entendo a consequência prática — não é só "uma regra violada", é exposição de dado pessoal de um colaborador.
- **Onde o Claude foi forte:** cobertura exaustiva do **caminho de erro** e do **ciclo de vida de recurso** (C1–C3), que são fáceis de pular numa leitura focada no "caminho feliz". O Claude também é sistemático em cruzar cada linha com o catálogo de anti-padrões da skill.
- **Conclusão:** os dois se complementam. O humano traz julgamento de risco e contexto; o Claude traz amplitude e consistência. O risco de usar só o Claude seria aceitar achados sem o filtro de "isto importa para *este* sistema?"; o risco de usar só o humano seria deixar passar bugs de robustez (C1/C2/C3) que só aparecem quando o Cosmos falha em produção.

---

## 4. Código reescrito (segue o AGENTS.md)

A reescrita espelha o padrão da QE-01: validação Zod num `validator.ts` e o handler com `unknown` + try/catch + `context`. A persistência vira uma **porta injetada** (`FeedbackRepository`) — o handler não conhece o CosmosDB, o que resolve o `require` e torna o endpoint testável sem Azure (Anexo C: sem Azure nesta fase).

**Tipos do domínio** — [`src/shared/types.ts`](../novatech-assistant/src/shared/types.ts):

```typescript
export interface FeedbackRequest {
  queryId: string;
  rating: number;
  comment?: string;
  /** E-mail do atendente — DADO PESSOAL: nunca deve ir para log (LGPD). */
  attendantEmail: string;
}
export interface FeedbackRecord extends FeedbackRequest { timestamp: string; }
export interface FeedbackRepository { save(record: FeedbackRecord): Promise<void>; }
```

**Validação com Zod** — [`src/functions/feedback/validator.ts`](../novatech-assistant/src/functions/feedback/validator.ts):

```typescript
export const feedbackRequestSchema = z.object({
  queryId: z.string().trim().min(1, "campo 'queryId' é obrigatório e não pode ser vazio"),
  rating: z.number().int("'rating' deve ser inteiro").min(1, "...").max(5, "..."),
  comment: z.string().trim().max(2000).optional(),
  attendantEmail: z.string().trim().email("'attendantEmail' deve ser um e-mail válido"),
}).strict();

export function parseFeedbackRequest(body: unknown): ParseResult {
  const result = feedbackRequestSchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };
  const firstIssue = result.error.issues[0];
  return { success: false, error: firstIssue?.message ?? "corpo da requisição inválido" };
}
```

**Handler** — [`src/functions/feedback/handler.ts`](../novatech-assistant/src/functions/feedback/handler.ts):

```typescript
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { parseFeedbackRequest } from "./validator.js";
import { UpstreamError } from "../../shared/errors.js";
import type { FeedbackRecord, FeedbackRepository } from "../../shared/types.js";

async function readJsonBody(request: HttpRequest): Promise<unknown> {
  try { return await request.json(); } catch { return undefined; }
}

export function makeFeedbackHandler(repo: FeedbackRepository) {
  return async function feedbackHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const body = await readJsonBody(request);

    const parsed = parseFeedbackRequest(body);
    if (!parsed.success) {
      context.warn(`feedback: input inválido — ${parsed.error}`); // sem PII
      return { status: 400, jsonBody: { error: parsed.error } };
    }

    const record: FeedbackRecord = { ...parsed.data, timestamp: new Date().toISOString() };

    try {
      await repo.save(record);
    } catch (cause) {
      const error = new UpstreamError("falha ao persistir feedback", cause);
      context.error(`feedback: ${error.message}`);                  // sem registro/PII, sem stack
      return { status: 502, jsonBody: { error: "não foi possível registrar o feedback" } };
    }

    context.log(`feedback: registrado queryId=${record.queryId} rating=${record.rating}`); // sem PII
    return { status: 201, jsonBody: { status: "registrado" } };
  };
}

app.http("feedback", { methods: ["POST"], route: "feedback", authLevel: "function", handler: makeFeedbackHandler(/* repo */) });
```

**Mapa problema → correção:**

| Problema | Correção na reescrita |
|----------|------------------------|
| H1 `as any` sem Zod | `unknown` + `feedbackRequestSchema.safeParse` (discriminated union, sem `throw`) |
| H2 `console.log` | `context.warn/error/log` (logger estruturado da plataforma) |
| H3 `require` dinâmico | import estático no topo; Cosmos abstraído na porta `FeedbackRepository` |
| H4 e-mail no log | log só com `queryId`/`rating`; `attendantEmail`/`comment` nunca são logados |
| H5 JSON sem try/catch | `readJsonBody` envelopa → `undefined` → 400 (não 500) |
| H6 retorno solto | `jsonBody` estruturado + status correto (201 criado / 400 / 502) |
| C1 Cosmos sem try/catch | try/catch → `UpstreamError` → 502 sem vazar stack |
| C2 client por request | persistência injetada (client de escopo de módulo na impl. real) |
| C3 connection string | validada na config da implementação real do repositório (fora do handler) |
| C4 `rating` sem faixa | `z.number().int().min(1).max(5)` |
| C5 `app.http` sem authLevel | `route: "feedback"`, `authLevel: "function"` (padrão QE-01) |
| C6 sem `InvocationContext` | assinatura `(request, context)` |

> **Nota sobre logging (pino × context):** o resumo do AGENTS.md no enunciado cita "pino". A skill real do projeto ([typescript-conventions](../novatech-assistant/skills/foundation/typescript-conventions/SKILL.md) §5) sanciona o `context` do Azure Functions como logger estruturado equivalente, e a QE-01 já usa `context`. A reescrita usa `context` por consistência com o código existente — a regra de fato é "logging estruturado com nível, nunca `console.log`", que `context` satisfaz.

---

## 5. Evidência de execução

A partir de `novatech-assistant/`: `npm run build` → `npm test`.

```
> novatech-assistant@0.1.0 build
> tsc -p .            # strict:true, sem erros

> novatech-assistant@0.1.0 test
> vitest run

 ✓ tests/unit/response-validator.test.ts (12 tests)
 ✓ tests/unit/query-handler.test.ts (8 tests)
 ✓ tests/unit/feedback-handler.test.ts (12 tests)

 Test Files  3 passed (3)
      Tests  32 passed (32)
```

Os 12 casos novos em [`tests/unit/feedback-handler.test.ts`](../novatech-assistant/tests/unit/feedback-handler.test.ts) cobrem os critérios:

| Caso | Esperado |
|------|----------|
| body sem `queryId` / inválido | 400, `repo.save` não chamado |
| `rating` fora de 1–5 / não-inteiro | 400 |
| `attendantEmail` inválido | 400 |
| campo extra (`.strict()`) | 400 |
| JSON malformado | 400 (não 500) |
| body válido | 201 + `repo.save` chamado com `FeedbackRecord` |
| repositório falha | 502 **sem** vazar a mensagem interna (`ECONNREFUSED`) |
| **PII**: nenhum nível de log contém `attendantEmail`/`comment` | verificado (caminho feliz **e** de erro) |

O teste de PII é a tradução do achado H4 em verificação **determinística**: espiona `context.log/warn/error` e falha se o e-mail aparecer em qualquer log — o code review vira regressão automatizada.
