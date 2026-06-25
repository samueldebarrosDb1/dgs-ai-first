// Harness determinístico de respostas do assistente (Cenário 3 — Ex. 3.1).
//
// O prompt pede ao modelo que responda com fonte e confiança, mas isso é
// PROBABILÍSTICO — o modelo pode esquecer. Este módulo é a camada
// DETERMINÍSTICA: força um structured output validável por Zod e aplica
// guardrails que BLOQUEIAM (não só logam) respostas inválidas, substituindo-as
// por uma resposta padrão segura.
//
// Padrões (AGENTS.md): entrada como `unknown` + `safeParse`; sem `as any`;
// retorno em discriminated union sem `throw` no fluxo normal; sem `console.log`
// (logger injetado).

import { z } from "zod";

/**
 * Structured output que o assistente DEVE produzir.
 *
 * `.strict()` é deliberado: sem ele o Zod faz *strip* silencioso de campos não
 * previstos — o modelo poderia anexar campos espúrios (ex.: `internal_note`) que
 * passariam despercebidos. Com `.strict()`, qualquer campo extra rejeita a
 * resposta inteira.
 */
export const structuredResponseSchema = z
  .object({
    answer: z.string().trim().min(1, "campo 'answer' é obrigatório e não pode ser vazio"),
    // Guardrail 1 embutido no contrato: sem fonte, não há resposta válida.
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

/** Resposta estruturada já validada contra o schema. */
export type StructuredResponse = z.infer<typeof structuredResponseSchema>;

/**
 * Resultado discriminado da validação — sem lançar exceção no caminho normal.
 * Em falha, `safeResponse` é o que o chamador DEVE devolver ao usuário.
 */
export type ValidationResult =
  | { ok: true; data: StructuredResponse }
  | { ok: false; reason: string; safeResponse: StructuredResponse };

/** Logger mínimo injetável (evita `console.log` e dependência de runtime). */
export interface Logger {
  warn(message: string, meta?: unknown): void;
}

const noopLogger: Logger = { warn: () => {} };

/** Resposta neutra retornada sempre que a validação ou um guardrail falha. */
export const SAFE_RESPONSE: StructuredResponse = {
  answer:
    "Não foi possível validar esta resposta com segurança. Por favor, encaminhe a solicitação ao atendimento humano.",
  source_document: "SISTEMA::RESPOSTA_PADRAO",
  confidence_score: 0,
};

function reject(reason: string, logger: Logger): ValidationResult {
  logger.warn(`response-validator: resposta rejeitada — ${reason}`, { reason });
  return { ok: false, reason, safeResponse: SAFE_RESPONSE };
}

/**
 * Normaliza texto para casamento determinístico: remove acentos e baixa a caixa.
 * Assim "Devolução", "devolucao" e "DEVOLUÇÃO" colapsam na mesma forma.
 */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// --- Guardrail 2: carga perigosa + devolução -------------------------------
// Âncora factual: POL-001 §3.2 (Anexo A) — cargas perigosas (classes 1–6 ANTT)
// NÃO são elegíveis para devolução pelo processo padrão; o caso vai para a
// Gestão de Riscos (ramal 4500). Logo, afirmar que a devolução "é possível" é
// uma resposta perigosamente incorreta e deve ser bloqueada.
//
// Os regexes operam sobre o texto JÁ normalizado (sem acento, minúsculo).

/** Menção a carga/material perigoso, em singular ou plural. */
const HAZARDOUS_RE =
  /\b(carga|cargas|material|materiais|produto|produtos|mercadoria|mercadorias)\s+perigos[ao]s?\b/;

/** Menção ao tema devolução (substantivo ou verbo). */
const RETURN_RE = /\b(devolu[cç][aã]o|devolv\w*|devolu\w*)\b/;

/**
 * Afirmação de que a devolução É possível/permitida. Cobre construções comuns:
 * "pode devolver", "pode ser devolvida", "é possível devolver", "está liberada
 * a devolução", "permitida a devolução", "aceita devolução".
 */
const RETURN_ALLOWED_RE =
  /\b(pode(?:m|ra|rao)?|e possivel|esta liberad[ao]|liberad[ao]|permitid[ao]|aceit\w*|autorizad[ao])\b[\s\S]{0,40}?\b(devolu[cç][aã]o|devolv\w*)\b|\b(devolu[cç][aã]o|devolv\w*)\b[\s\S]{0,40}?\b(e possivel|permitid[ao]|liberad[ao]|aceit\w*|autorizad[ao])\b/;

/** Negação explícita da devolução — o caso CORRETO, que não deve ser bloqueado. */
const RETURN_DENIED_RE =
  /\b(nao)\b[\s\S]{0,40}?\b(pode\w*|e possivel|permitid[ao]|elegiv\w*|devolv\w*)\b|\b(nao elegiv\w*|nao e possivel|nao pode\w*|sem direito|inelegiv\w*|proibid[ao]|vedad[ao])\b/;

/**
 * Retorna `true` se a resposta afirma indevidamente que carga perigosa pode ser
 * devolvida. A negação tem precedência: se o texto nega a devolução, está
 * correto e não é bloqueado.
 */
function violatesHazardousReturnGuardrail(answer: string): boolean {
  const text = normalize(answer);

  const mentionsHazardous = HAZARDOUS_RE.test(text);
  const mentionsReturn = RETURN_RE.test(text);
  if (!mentionsHazardous || !mentionsReturn) return false;

  // Negar a devolução é o comportamento esperado (POL-001 §3.2) → não bloquear.
  if (RETURN_DENIED_RE.test(text)) return false;

  return RETURN_ALLOWED_RE.test(text);
}

/**
 * Valida e aplica os guardrails sobre uma resposta crua do modelo.
 *
 * @param raw    Resposta do modelo (formato desconhecido — `unknown`).
 * @param logger Logger injetado; o motivo de cada rejeição é registrado.
 * @returns      `{ ok: true, data }` quando válida; caso contrário
 *               `{ ok: false, reason, safeResponse }` — o chamador devolve `safeResponse`.
 */
export function validateResponse(raw: unknown, logger: Logger = noopLogger): ValidationResult {
  // 1) Structured output: precisa bater com o schema antes de qualquer checagem
  //    de conteúdo. Campos faltantes/extras ou tipos errados → rejeita.
  const parsed = structuredResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const detail = firstIssue
      ? `${firstIssue.path.join(".") || "(raiz)"}: ${firstIssue.message}`
      : "formato inválido";
    return reject(`structured output inválido — ${detail}`, logger);
  }

  const data = parsed.data;

  // 2) Guardrail 1 — fonte obrigatória (defesa redundante ao schema: protege
  //    mesmo que o schema seja afrouxado no futuro).
  if (data.source_document.trim().length === 0) {
    return reject("guardrail 1: 'source_document' ausente ou vazio", logger);
  }

  // 3) Guardrail 2 — carga perigosa + devolução afirmada como possível.
  if (violatesHazardousReturnGuardrail(data.answer)) {
    return reject(
      "guardrail 2: afirmação de que carga perigosa pode ser devolvida (contraria POL-001 §3.2)",
      logger,
    );
  }

  return { ok: true, data };
}
