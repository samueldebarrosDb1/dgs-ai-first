# Entregável — Exercício 3.1: Structured Output e Verificações Determinísticas (Harness de Código)

Projeto NovaTech Assistant — módulo de harness de respostas. O assistente respondia em **texto livre**: nada garantia a presença da fonte, e 12% das respostas em teste estavam incorretas. Este exercício adiciona a camada **determinística** do harness sobre a saída do modelo: um **structured output** validável por Zod e **2 guardrails** que *bloqueiam* (não só logam) respostas inválidas.

A peça vive em [`src/services/response-validator.ts`](../novatech-assistant/src/services/response-validator.ts) (Anexo C) e segue o AGENTS.md: entrada como `unknown` + `safeParse`, sem `as any`, retorno em *discriminated union* sem `throw`, imports ESM `.js`, sem `console.log` (logger injetado).

> **Distinção central — prompt × código.** O *system prompt* **pede** ao modelo que cite a fonte e não libere devolução de carga perigosa. Isso é **probabilístico**: o modelo pode esquecer, e em ~12% dos casos erra. O `response-validator.ts` é **determinístico**: o que não bate com o schema ou viola um guardrail é *rejeitado por código* antes de chegar ao usuário. Prompt reduz a probabilidade do erro; código garante o limite.

---

## 1. Tarefa 1 — Schema Zod do structured output (GitHub Copilot)

Em vez de texto livre, o modelo DEVE responder em JSON com formato fixo. O schema é a primeira barreira — o que não bate é rejeitado **antes** de qualquer checagem de conteúdo.

```typescript
export const structuredResponseSchema = z
  .object({
    answer: z.string().trim().min(1, "campo 'answer' é obrigatório e não pode ser vazio"),
    source_document: z
      .string()
      .trim()
      .min(1, "campo 'source_document' é obrigatório e não pode ser vazio"),
    confidence_score: z
      .number()
      .min(0, "'confidence_score' deve estar entre 0 e 1")
      .max(1, "'confidence_score' deve estar entre 0 e 1"),
  })
  .strict();
```

Justificativa de cada decisão:

| Campo / cláusula | Por quê |
|---|---|
| `answer` `.trim().min(1)` | Resposta vazia ou só com espaços não é resposta. |
| `source_document` `.trim().min(1)` | **É o Guardrail 1 embutido no contrato** — sem fonte, a resposta nem chega a ser válida. |
| `confidence_score` `.min(0).max(1)` | Confiança fora da faixa indica saída corrompida; restringir torna o campo confiável para HITL (ex.: rotear baixa confiança para humano). |
| `.strict()` | Sem ele, o Zod faz *strip* **silencioso** de campos extras — o modelo poderia anexar campos espúrios sem ninguém notar. Com `.strict()`, campo inesperado rejeita a resposta inteira. |

---

## 2. Tarefa 2 — `response-validator.ts` com os 2 guardrails (GitHub Copilot)

### 2.1 — Primeiro draft do Copilot (NÃO é a versão final — ver §3)

Prompt ao Copilot: _"Crie um validador em TS que cheque a resposta do assistente (answer, source_document, confidence_score) e bloqueie quando faltar a fonte ou quando disser que carga perigosa pode ser devolvida."_ Saída típica:

```typescript
// draft gerado pelo Copilot — contém os problemas corrigidos na §3
import { z } from "zod";

const schema = z.object({
  answer: z.string(),
  source_document: z.string(),
  confidence_score: z.number(),
});

export function validateResponse(raw: any) {
  const data = schema.parse(raw);                 // lança em caso de erro

  if (!data.source_document) {
    console.log("sem fonte");                      // só loga
  }

  if (data.answer.includes("carga perigosa") && data.answer.includes("devolução")) {
    console.log("bloqueado");                      // só loga; não trata negação
  }

  return data;
}
```

### 2.2 — Versão final (após revisão)

Trechos principais de [`src/services/response-validator.ts`](../novatech-assistant/src/services/response-validator.ts):

```typescript
export type ValidationResult =
  | { ok: true; data: StructuredResponse }
  | { ok: false; reason: string; safeResponse: StructuredResponse };

export interface Logger { warn(message: string, meta?: unknown): void; }

export function validateResponse(raw: unknown, logger: Logger = noopLogger): ValidationResult {
  // 1) Structured output — schema antes de checar conteúdo.
  const parsed = structuredResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const detail = firstIssue ? `${firstIssue.path.join(".") || "(raiz)"}: ${firstIssue.message}` : "formato inválido";
    return reject(`structured output inválido — ${detail}`, logger);
  }
  const data = parsed.data;

  // 2) Guardrail 1 — fonte obrigatória (defesa redundante ao schema).
  if (data.source_document.trim().length === 0) {
    return reject("guardrail 1: 'source_document' ausente ou vazio", logger);
  }

  // 3) Guardrail 2 — carga perigosa + devolução afirmada como possível.
  if (violatesHazardousReturnGuardrail(data.answer)) {
    return reject("guardrail 2: afirmação de que carga perigosa pode ser devolvida (contraria POL-001 §3.2)", logger);
  }

  return { ok: true, data };
}
```

**Guardrail 2 — detecção determinística** (opera sobre texto normalizado, sem acento e em minúsculas):

```typescript
function violatesHazardousReturnGuardrail(answer: string): boolean {
  const text = normalize(answer);
  if (!HAZARDOUS_RE.test(text) || !RETURN_RE.test(text)) return false;
  if (RETURN_DENIED_RE.test(text)) return false;   // negar a devolução é o correto → não bloquear
  return RETURN_ALLOWED_RE.test(text);
}
```

**Âncora factual (Anexo A):** **POL-001 §3.2** — cargas perigosas (classes 1–6 da ANTT) **não são elegíveis** para devolução pelo processo padrão; o caso deve ir à **Gestão de Riscos (ramal 4500)**. O **FAQ Item 3** é documento informal ("não diga que é impossível") e *não* pode liberar a afirmação contrária à política normativa. Por isso o guardrail bloqueia a afirmação positiva, mas **deixa passar** a negativa correta.

Em qualquer falha (schema ou guardrail), o validador **registra o motivo no logger e retorna `SAFE_RESPONSE`** — uma mensagem neutra que encaminha ao atendimento humano (ponto natural de HITL).

---

## 3. Tarefa 3 — Code review do output do Copilot (Claude)

Problemas **reais** identificados no draft (§2.1) e corrigidos na versão final:

1. **`schema` sem `.strict()` → aceita campos extras silenciosamente.** O Zod, por padrão, faz *strip* de chaves não declaradas sem erro. Um campo espúrio do modelo (ex.: `raw_chain_of_thought`) passaria despercebido. **Correção:** `.strict()` no schema, rejeitando qualquer campo inesperado. *(Coberto pelo teste "rejeita campos extras".)*

2. **Regex ingênuo de "carga perigosa + devolução" escapa fácil.** `includes("carga perigosa")` falha com caixa diferente (`Carga Perigosa`), acento/sem acento (`devolução`/`devolucao`), plural (`cargas perigosas`) e sinônimos. **Correção:** normalização NFD (remove acento) + `toLowerCase()` e regexes com alternativas de forma/plural/verbo. *(Coberto pelo teste de variação com acento/caixa/plural.)*

3. **Guardrails só logavam, não bloqueavam.** O draft usa `console.log("bloqueado")` e segue retornando `data` — a resposta inválida chegaria ao usuário. Isso reprova o critério "realmente bloqueiam". **Correção:** retorno em *discriminated union* `{ ok: false, reason, safeResponse }`; o chamador devolve `SAFE_RESPONSE`. *(Coberto pelos testes que checam `r.ok === false` e `safeResponse`.)*

4. **Falso positivo: bloqueava a resposta CORRETA.** O draft dispararia mesmo quando o texto **nega** a devolução ("carga perigosa **não** pode ser devolvida"), que é justamente a resposta certa pela POL-001 §3.2. **Correção:** `RETURN_DENIED_RE` com precedência — se o texto nega, não bloqueia. *(Coberto pelo teste "NÃO bloqueia a resposta correta".)*

5. **`as any` e `schema.parse()` violam o AGENTS.md.** `raw: any` desliga o type-safety; `parse()` lança no fluxo normal. **Correção:** `raw: unknown` + `safeParse`, sem `throw` (padrão do projeto, espelha [`query/validator.ts`](../novatech-assistant/src/functions/query/validator.ts)).

6. **`console.log` proibido.** **Correção:** `Logger` injetado (`warn`), sem dependência nova e testável (o fake logger é verificado nos testes).

---

## 4. Evidência de execução

A partir de `novatech-assistant/`: `npm run build` → `npm test`.

```
> novatech-assistant@0.1.0 build
> tsc -p .            # compila em strict:true, sem erros

> novatech-assistant@0.1.0 test
> vitest run

 ✓ tests/unit/response-validator.test.ts (12 tests) 10ms
 ✓ tests/unit/query-handler.test.ts (8 tests) 10ms

 Test Files  2 passed (2)
      Tests  20 passed (20)
```

Os 12 casos novos em [`tests/unit/response-validator.test.ts`](../novatech-assistant/tests/unit/response-validator.test.ts) cobrem os critérios de avaliação:

| Caso | Esperado |
|---|---|
| structured output válido | `ok: true` |
| campo extra (`.strict()`) | rejeitado |
| `confidence_score` fora de 0..1 | rejeitado |
| texto livre cru (não-objeto) | `ok: false` + `safeResponse` + logger chamado |
| sem `source_document` (vazio/ausente) | bloqueado (Guardrail 1) |
| "carga perigosa pode ser devolvida" | bloqueado (Guardrail 2) |
| variação acento/caixa/plural | bloqueado |
| devolução **negada** corretamente | `ok: true` (não bloqueia o correto) |
| devolução de carga **comum** (sem "perigosa") | `ok: true` |

Sem regressão na suíte da QE-01 (8 testes seguem verdes).
