// Teste do harness de respostas (Ex. 3.1) — structured output + 2 guardrails.
// Critérios de aceite: schema Zod válido; guardrails BLOQUEIAM (substituem por
// safeResponse), não só logam; negação correta de carga perigosa NÃO é bloqueada.

import { describe, it, expect, vi } from "vitest";
import {
  validateResponse,
  structuredResponseSchema,
  SAFE_RESPONSE,
  type Logger,
} from "../../src/services/response-validator.js";

/** Resposta estruturada válida de base, sobrescrita campo a campo nos testes. */
function validResponse(overrides: Record<string, unknown> = {}) {
  return {
    answer: "O SLA de primeira resposta do cliente Gold é de 2 horas úteis.",
    source_document: "SLA-2024",
    confidence_score: 0.9,
    ...overrides,
  };
}

function mockLogger(): Logger & { warn: ReturnType<typeof vi.fn> } {
  return { warn: vi.fn() };
}

describe("structuredResponseSchema", () => {
  it("aceita um structured output bem formado", () => {
    expect(structuredResponseSchema.safeParse(validResponse()).success).toBe(true);
  });

  it("rejeita campos extras (.strict)", () => {
    const r = structuredResponseSchema.safeParse(validResponse({ internal_note: "x" }));
    expect(r.success).toBe(false);
  });

  it("rejeita confidence_score fora de 0..1", () => {
    expect(structuredResponseSchema.safeParse(validResponse({ confidence_score: 1.5 })).success).toBe(false);
    expect(structuredResponseSchema.safeParse(validResponse({ confidence_score: -0.2 })).success).toBe(false);
  });
});

describe("validateResponse — structured output", () => {
  it("aceita resposta válida e retorna os dados", () => {
    const r = validateResponse(validResponse());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.source_document).toBe("SLA-2024");
  });

  it("rejeita quando não é objeto (texto livre cru)", () => {
    const logger = mockLogger();
    const r = validateResponse("resposta em texto livre, sem fonte", logger);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.safeResponse).toEqual(SAFE_RESPONSE);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("rejeita confidence_score inválido com safeResponse", () => {
    const r = validateResponse(validResponse({ confidence_score: 9 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.safeResponse).toEqual(SAFE_RESPONSE);
  });
});

describe("validateResponse — guardrail 1 (fonte obrigatória)", () => {
  it("bloqueia resposta sem source_document", () => {
    const logger = mockLogger();
    const r = validateResponse(
      { answer: "Resposta sem citar a fonte.", source_document: "", confidence_score: 0.8 },
      logger,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.safeResponse).toEqual(SAFE_RESPONSE);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("bloqueia quando source_document está ausente", () => {
    const r = validateResponse({ answer: "Texto.", confidence_score: 0.5 });
    expect(r.ok).toBe(false);
  });
});

describe("validateResponse — guardrail 2 (carga perigosa + devolução)", () => {
  it("bloqueia afirmação de que carga perigosa pode ser devolvida", () => {
    const logger = mockLogger();
    const r = validateResponse(
      validResponse({
        answer: "Sim, a carga perigosa pode ser devolvida normalmente em até 7 dias úteis.",
      }),
      logger,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("guardrail 2");
      expect(r.safeResponse).toEqual(SAFE_RESPONSE);
    }
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("bloqueia variação com acento/caixa/plural ('Cargas Perigosas' + 'é possível a devolução')", () => {
    const r = validateResponse(
      validResponse({
        answer: "Cargas Perigosas: é possível a DEVOLUÇÃO seguindo o procedimento padrão.",
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("NÃO bloqueia a resposta correta (devolução negada conforme POL-001 §3.2)", () => {
    const r = validateResponse(
      validResponse({
        answer:
          "Não. Carga perigosa não é elegível para devolução pelo processo padrão; contate a Gestão de Riscos (ramal 4500).",
        source_document: "POL-001",
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("NÃO bloqueia resposta sobre devolução de carga comum (sem 'perigosa')", () => {
    const r = validateResponse(
      validResponse({
        answer: "Sim, a mercadoria pode ser devolvida em até 7 dias úteis após o recebimento.",
        source_document: "POL-001",
      }),
    );
    expect(r.ok).toBe(true);
  });
});
