// Teste do feedback endpoint (Ex. 3.2 — reescrita do módulo do Copilot).
// Cobre: validação Zod (400), JSON malformado (400 não 500), persistência (201),
// falha de repositório (502 sem vazar stack) e a regra de segurança: NUNCA logar PII.

import { describe, it, expect, vi } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeFeedbackHandler } from "../../src/functions/feedback/handler.js";
import { parseFeedbackRequest } from "../../src/functions/feedback/validator.js";
import type { FeedbackRecord, FeedbackRepository } from "../../src/shared/types.js";

/** Mock mínimo de HttpRequest: só o `.json()` que o handler consome. */
function mockRequest(jsonImpl: () => Promise<unknown>): HttpRequest {
  return { json: jsonImpl } as unknown as HttpRequest;
}

/** Mock de InvocationContext com os métodos de log espionáveis. */
function mockContext(): InvocationContext {
  return { warn: vi.fn(), error: vi.fn(), log: vi.fn() } as unknown as InvocationContext;
}

/** Repositório fake: grava em memória e expõe o spy de `save`. */
function fakeRepo() {
  const saved: FeedbackRecord[] = [];
  const save = vi.fn(async (record: FeedbackRecord) => {
    saved.push(record);
  });
  return { repo: { save } as FeedbackRepository, save, saved };
}

const validBody = {
  queryId: "q-123",
  rating: 5,
  comment: "Resposta muito útil",
  attendantEmail: "atendente@novatech.com.br",
};

describe("validator (parseFeedbackRequest)", () => {
  it("rejeita body sem queryId", () => {
    expect(parseFeedbackRequest({ ...validBody, queryId: "" }).success).toBe(false);
  });

  it("rejeita rating fora de 1..5", () => {
    expect(parseFeedbackRequest({ ...validBody, rating: 0 }).success).toBe(false);
    expect(parseFeedbackRequest({ ...validBody, rating: 6 }).success).toBe(false);
  });

  it("rejeita rating não-inteiro", () => {
    expect(parseFeedbackRequest({ ...validBody, rating: 3.5 }).success).toBe(false);
  });

  it("rejeita attendantEmail inválido", () => {
    expect(parseFeedbackRequest({ ...validBody, attendantEmail: "não-é-email" }).success).toBe(false);
  });

  it("rejeita campos extras (.strict)", () => {
    expect(parseFeedbackRequest({ ...validBody, isAdmin: true }).success).toBe(false);
  });

  it("aceita body válido (comment é opcional)", () => {
    const { comment, ...semComment } = validBody;
    expect(parseFeedbackRequest(semComment).success).toBe(true);
  });
});

describe("feedbackHandler", () => {
  it("retorna 400 quando o body é inválido", async () => {
    const { repo, save } = fakeRepo();
    const res = await makeFeedbackHandler(repo)(
      mockRequest(async () => ({ rating: 5 })),
      mockContext(),
    );
    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("retorna 400 (não 500) quando o JSON é malformado", async () => {
    const { repo } = fakeRepo();
    const res = await makeFeedbackHandler(repo)(
      mockRequest(async () => {
        throw new SyntaxError("Unexpected token");
      }),
      mockContext(),
    );
    expect(res.status).toBe(400);
  });

  it("persiste e retorna 201 para body válido", async () => {
    const { repo, save, saved } = fakeRepo();
    const res = await makeFeedbackHandler(repo)(
      mockRequest(async () => validBody),
      mockContext(),
    );
    expect(res.status).toBe(201);
    expect(save).toHaveBeenCalledOnce();
    expect(saved[0]).toMatchObject({ queryId: "q-123", rating: 5 });
    expect(saved[0]?.timestamp).toBeTruthy();
  });

  it("retorna 502 e não vaza a mensagem interna quando o repositório falha", async () => {
    const repo: FeedbackRepository = {
      save: vi.fn(async () => {
        throw new Error("Cosmos ECONNREFUSED 10.0.0.1:443");
      }),
    };
    const res = await makeFeedbackHandler(repo)(
      mockRequest(async () => validBody),
      mockContext(),
    );
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.jsonBody)).not.toContain("ECONNREFUSED");
  });

  it("NUNCA loga PII (attendantEmail/comment) em nenhum nível", async () => {
    const { repo } = fakeRepo();
    const context = mockContext();
    await makeFeedbackHandler(repo)(mockRequest(async () => validBody), context);

    const allLogArgs = [
      ...(context.log as ReturnType<typeof vi.fn>).mock.calls,
      ...(context.warn as ReturnType<typeof vi.fn>).mock.calls,
      ...(context.error as ReturnType<typeof vi.fn>).mock.calls,
    ]
      .flat()
      .join(" ");

    expect(allLogArgs).not.toContain("atendente@novatech.com.br");
    expect(allLogArgs).not.toContain("Resposta muito útil");
  });

  it("também não loga PII no caminho de falha de persistência", async () => {
    const repo: FeedbackRepository = {
      save: vi.fn(async () => {
        throw new Error("falha");
      }),
    };
    const context = mockContext();
    await makeFeedbackHandler(repo)(mockRequest(async () => validBody), context);

    const errorArgs = (context.error as ReturnType<typeof vi.fn>).mock.calls.flat().join(" ");
    expect(errorArgs).not.toContain("atendente@novatech.com.br");
  });
});
