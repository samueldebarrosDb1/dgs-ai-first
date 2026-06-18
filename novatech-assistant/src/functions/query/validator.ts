// Validação de input do POST /api/query (QE-01).
// Zod é a fonte única de verdade do contrato de entrada; o handler não confia no body cru.

import { z } from "zod";
import type { QueryRequest } from "../../shared/types.js";

/** Schema do corpo da requisição. `question` deve ser string não vazia (após trim). */
export const queryRequestSchema = z.object({
  question: z.string().trim().min(1, "campo 'question' é obrigatório e não pode ser vazio"),
});

/** Resultado discriminado do parse — sem lançar exceção no caminho de validação. */
export type ParseResult =
  | { success: true; data: QueryRequest }
  | { success: false; error: string };

/**
 * Valida um body desconhecido contra o schema.
 * Aceita `unknown` (o body pode ser qualquer coisa) e estreita para `QueryRequest`.
 */
export function parseQueryRequest(body: unknown): ParseResult {
  const result = queryRequestSchema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstIssue = result.error.issues[0];
  return { success: false, error: firstIssue?.message ?? "corpo da requisição inválido" };
}
