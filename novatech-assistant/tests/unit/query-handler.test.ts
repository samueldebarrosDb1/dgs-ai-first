// Teste da QE-01 — validação de input do POST /api/query.
// Cobre os critérios de aceite: body inválido → 400; body válido → 200 com source_document.

import { describe, it, expect, vi } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { queryHandler } from "../../src/functions/query/handler.js";
import { parseQueryRequest } from "../../src/functions/query/validator.js";

/** Mock mínimo de HttpRequest: só o `.json()` que o handler consome. */
function mockRequest(jsonImpl: () => Promise<unknown>): HttpRequest {
  return { json: jsonImpl } as unknown as HttpRequest;
}

/** Mock mínimo de InvocationContext com `warn` espionável. */
function mockContext(): InvocationContext {
  return { warn: vi.fn(), error: vi.fn(), log: vi.fn() } as unknown as InvocationContext;
}

describe("validator (parseQueryRequest)", () => {
  it("rejeita body sem 'question'", () => {
    const r = parseQueryRequest({});
    expect(r.success).toBe(false);
  });

  it("rejeita 'question' não-string", () => {
    const r = parseQueryRequest({ question: 42 });
    expect(r.success).toBe(false);
  });

  it("rejeita 'question' só com espaços", () => {
    const r = parseQueryRequest({ question: "   " });
    expect(r.success).toBe(false);
  });

  it("aceita body válido e faz trim", () => {
    const r = parseQueryRequest({ question: "  Frete para 600kg para Manaus?  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.question).toBe("Frete para 600kg para Manaus?");
  });
});

describe("queryHandler (QE-01)", () => {
  it("retorna 400 quando o body não tem 'question'", async () => {
    const res = await queryHandler(
      mockRequest(async () => ({})),
      mockContext(),
    );
    expect(res.status).toBe(400);
    expect((res.jsonBody as { error: string }).error).toBeTruthy();
  });

  it("retorna 400 quando o body é JSON malformado (json() lança)", async () => {
    const res = await queryHandler(
      mockRequest(async () => {
        throw new SyntaxError("Unexpected token");
      }),
      mockContext(),
    );
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando 'question' não é string", async () => {
    const res = await queryHandler(
      mockRequest(async () => ({ question: 123 })),
      mockContext(),
    );
    expect(res.status).toBe(400);
  });

  it("retorna 200 com answer e source_document para body válido", async () => {
    const res = await queryHandler(
      mockRequest(async () => ({ question: "Qual o SLA do cliente Gold?" })),
      mockContext(),
    );
    expect(res.status).toBe(200);
    const body = res.jsonBody as { answer: string; source_document: { id: string } };
    expect(body.answer).toContain("Qual o SLA do cliente Gold?");
    expect(body.source_document).toHaveProperty("id");
  });
});
