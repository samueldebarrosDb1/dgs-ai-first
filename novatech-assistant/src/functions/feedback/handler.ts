// HTTP trigger do feedback endpoint — POST /api/feedback.
// Reescrita do módulo gerado pelo Copilot (Ex. 3.2), corrigindo as violações do
// AGENTS.md e os riscos de segurança. Padrões: Azure Functions v4, Zod, imports
// estáticos, sem console.log, sem PII em log.
//
// Persistência via FeedbackRepository INJETADO (porta no shared/types.ts): o
// handler não conhece o CosmosDB, ficando testável sem Azure (Anexo C).

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { parseFeedbackRequest } from "./validator.js";
import { UpstreamError } from "../../shared/errors.js";
import type { FeedbackRecord, FeedbackRepository } from "../../shared/types.js";

/** Lê e desserializa o corpo JSON; retorna `undefined` se o body não for JSON válido. */
async function readJsonBody(request: HttpRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * Cria o handler de feedback com a dependência de persistência injetada.
 * Permite testar com um repositório fake sem tocar no Azure.
 */
export function makeFeedbackHandler(repo: FeedbackRepository) {
  return async function feedbackHandler(
    request: HttpRequest,
    context: InvocationContext,
  ): Promise<HttpResponseInit> {
    const body = await readJsonBody(request);

    const parsed = parseFeedbackRequest(body);
    if (!parsed.success) {
      // Log sem PII: registramos só o motivo da rejeição, nunca o conteúdo do body.
      context.warn(`feedback: input inválido — ${parsed.error}`);
      return { status: 400, jsonBody: { error: parsed.error } };
    }

    const record: FeedbackRecord = {
      ...parsed.data,
      timestamp: new Date().toISOString(),
    };

    try {
      await repo.save(record);
    } catch (cause) {
      // Falha de persistência → 5xx. Logamos a falha SEM o registro (que contém
      // o e-mail do atendente) e devolvemos mensagem genérica, sem vazar stack.
      const error = new UpstreamError("falha ao persistir feedback", cause);
      context.error(`feedback: ${error.message}`);
      return { status: 502, jsonBody: { error: "não foi possível registrar o feedback" } };
    }

    // Telemetria sem PII: só identificadores e métrica, nunca e-mail/comentário.
    context.log(`feedback: registrado queryId=${record.queryId} rating=${record.rating}`);
    return { status: 201, jsonBody: { status: "registrado" } };
  };
}

/**
 * Repositório padrão — placeholder desta fase (sem Azure, Anexo C).
 * Em produção, troca-se por uma implementação CosmosDB (import estático do
 * `@azure/cosmos`, client em escopo de módulo, connection string validada na
 * config). A injeção via `makeFeedbackHandler` mantém o handler inalterado.
 */
const notConfiguredRepository: FeedbackRepository = {
  async save() {
    throw new UpstreamError("repositório de feedback não configurado nesta fase");
  },
};

app.http("feedback", {
  methods: ["POST"],
  route: "feedback",
  authLevel: "function",
  handler: makeFeedbackHandler(notConfiguredRepository),
});
