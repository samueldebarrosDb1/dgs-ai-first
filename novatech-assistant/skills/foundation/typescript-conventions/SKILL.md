---
name: typescript-conventions
description: >-
  Convenções globais de TypeScript do NovaTech Assistant. Ative ao gerar ou
  editar QUALQUER arquivo .ts do projeto (endpoints, services, types, testes).
  É a skill Foundation base — toda skill Domain e Artifact herda destas regras.
level: foundation
owner: Tech Lead
consumers: [Tech Lead, Desenvolvedor, QA, Product Specialist, GitHub Copilot, Claude Code]
related:
  - foundation/error-handling
  - foundation/project-structure
---

# Foundation: TypeScript Conventions

## Contexto

Esta é a skill **base** do projeto: define como qualquer TypeScript deve ser escrito, e todas as skills de Domain (endpoint, search, React, testes) e Artifact (criar endpoint RAG, criar teste) pressupõem estas regras. Detalha o "como" do que o [`AGENTS.md`](../../../AGENTS.md) › *Coding Standards* declara. Stack definida no cenário 1: TypeScript no backend e bot (ADR-0001), `tsconfig` com `strict: true`, módulos ESM.

Antes de gerar código, o agente deve seguir as regras abaixo. Em conflito com um pedido do prompt, **estas regras prevalecem** e o agente deve apontar o conflito.

## Regras (prescritivas)

1. **`strict: true` é inegociável.** Nunca relaxe o `tsconfig` nem use `// @ts-ignore`/`// @ts-expect-error` para silenciar erro de tipo. Se o tipo não fecha, corrija o tipo.
2. **Proibido `as any`.** Dados de origem externa (body HTTP, resposta de serviço, `JSON.parse`) entram como **`unknown`** e são estreitados por validação (Zod `safeParse`) ou type guard antes do uso.
3. **Validação na borda com Zod, sem `throw` no fluxo normal.** Schemas validam toda entrada externa; a função de parse retorna uma **discriminated union** (`{ success: true; data } | { success: false; error }`), não lança. `throw` fica para condições excepcionais (classes de erro — ver `foundation/error-handling`).
4. **Imports ESM com extensão `.js`.** O projeto é `"type": "module"`; imports relativos terminam em `.js` (ex.: `from "./validator.js"`). Nunca use `require()` nem `import()` dinâmico para módulos locais.
5. **Sem `console.log`.** Use o logger estruturado do projeto (pino) ou, em handler de Function, o `context`. Logs são JSON com nível — texto solto não é aceito.
6. **JSDoc em tudo que é público.** Tipos exportados, funções exportadas e campos não óbvios levam JSDoc curto explicando o porquê (não o óbvio).
7. **Erros via classes do domínio.** Use `ValidationError` (→ HTTP 400) e `UpstreamError` (→ 5xx) de `shared/errors.ts`; não lance `Error` genérico nem retorne string de erro solta.
8. **`interface` para shapes de dados; tipos nomeados, sem `any` implícito.** Prefira nomear os tipos do domínio em `shared/types.ts` a inferir objetos anônimos repetidos.

## DO / DON'T (código real do projeto)

### Entrada externa: `unknown` + Zod, nunca `as any`

❌ **DON'T** — desliga o type-checker e quebra com body `null`/malformado (vira 500):
```typescript
const body = (await request.json()) as any;
if (!body.question) return { status: 400, body: "question é obrigatório" };
// body.question aceita "   " (string de espaços é truthy) e number/objeto
```

✅ **DO** — `unknown` estreitado por Zod; parse que não lança (`src/functions/query/validator.ts`):
```typescript
export const queryRequestSchema = z.object({
  question: z.string().trim().min(1, "campo 'question' é obrigatório e não pode ser vazio"),
});

export type ParseResult =
  | { success: true; data: QueryRequest }
  | { success: false; error: string };

export function parseQueryRequest(body: unknown): ParseResult {
  const result = queryRequestSchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };
  const firstIssue = result.error.issues[0];
  return { success: false, error: firstIssue?.message ?? "corpo da requisição inválido" };
}
```

### Body que pode não ser JSON: guard, não exceção solta

❌ **DON'T** — `request.json()` lança em body malformado → 500 (deveria ser 400):
```typescript
const body = await request.json(); // SyntaxError não tratado
```

✅ **DO** — try/catch devolve `unknown` que a validação rejeita como 400 (`src/functions/query/handler.ts`):
```typescript
async function readJsonBody(request: HttpRequest): Promise<unknown> {
  try { return await request.json(); } catch { return undefined; }
}
```

### Logging

❌ **DON'T**: `console.log("query recebida:", body);`
✅ **DO**: `context.warn(\`query: input inválido — ${parsed.error}\`);` (ou logger pino — ver `domain/azure-functions-endpoint`).

### Imports ESM

❌ **DON'T**: `import { parseQueryRequest } from "./validator";` · `const z = require("zod");`
✅ **DO**: `import { parseQueryRequest } from "./validator.js";`

## Anti-padrões que o Copilot costuma gerar (rejeitar no review)

| Anti-padrão | Por que recusar | Correção |
|-------------|-----------------|----------|
| `(await request.json()) as any` | Desliga o type-safety; quebra com `null`/array | `unknown` + Zod `safeParse` |
| `console.log(...)` | Sem nível, sem correlação, vaza dado em texto | `context.warn`/logger pino |
| `const x = require("...")` | Projeto é ESM; `require` quebra em runtime | `import ... from "....js"` |
| `JSON.parse(raw)` sem try/catch | Exceção não tratada → 500 indevido | guard try/catch → 400 |
| `if (!body.question)` manual | Aceita `"   "` (truthy) e tipos errados | `z.string().trim().min(1)` |
| `// @ts-ignore` para "resolver" erro | Esconde bug de tipo | corrigir o tipo |
| `catch (e) { throw e }` / engolir erro | Perde causa, mascara falha | `UpstreamError(msg, { cause })` |
