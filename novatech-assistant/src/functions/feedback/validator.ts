// Validação de input do POST /api/feedback.
// Zod é a fonte única de verdade do contrato; o handler não confia no body cru.
// Espelha o padrão da QE-01 (src/functions/query/validator.ts): `unknown` + safeParse,
// retorno em discriminated union, sem `throw` no fluxo normal.

import { z } from "zod";
import type { FeedbackRequest } from "../../shared/types.js";

/**
 * Schema do corpo da requisição de feedback.
 * `.strict()` rejeita campos não previstos (evita persistir lixo do cliente).
 */
export const feedbackRequestSchema = z
  .object({
    queryId: z.string().trim().min(1, "campo 'queryId' é obrigatório e não pode ser vazio"),
    rating: z
      .number({ invalid_type_error: "'rating' deve ser um número" })
      .int("'rating' deve ser inteiro")
      .min(1, "'rating' deve estar entre 1 e 5")
      .max(5, "'rating' deve estar entre 1 e 5"),
    comment: z.string().trim().max(2000, "'comment' excede 2000 caracteres").optional(),
    attendantEmail: z.string().trim().email("'attendantEmail' deve ser um e-mail válido"),
  })
  .strict();

/** Resultado discriminado do parse — sem lançar exceção no caminho de validação. */
export type ParseResult =
  | { success: true; data: FeedbackRequest }
  | { success: false; error: string };

/**
 * Valida um body desconhecido contra o schema.
 * Aceita `unknown` (o body pode ser qualquer coisa) e estreita para `FeedbackRequest`.
 */
export function parseFeedbackRequest(body: unknown): ParseResult {
  const result = feedbackRequestSchema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstIssue = result.error.issues[0];
  return { success: false, error: firstIssue?.message ?? "corpo da requisição inválido" };
}
