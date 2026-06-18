// HTTP trigger do query endpoint (QE-01: setup + validação de input).
// Padrões (AGENTS.md / plan.md): Azure Functions v4, Zod, sem console.log.
// Nesta task o handler valida a entrada e devolve o shape de resposta; a recuperação
// de chunks e a chamada ao modelo são injetadas na QE-08.

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { parseQueryRequest } from "./validator.js";
import type { QueryResponse } from "../../shared/types.js";

/** Lê e desserializa o corpo JSON; retorna `undefined` se o body não for JSON válido. */
async function readJsonBody(request: HttpRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function queryHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const body = await readJsonBody(request);

  const parsed = parseQueryRequest(body);
  if (!parsed.success) {
    context.warn(`query: input inválido — ${parsed.error}`);
    return { status: 400, jsonBody: { error: parsed.error } };
  }

  // Placeholder de resposta — QE-08 substitui pela resposta real (busca + modelo).
  const response: QueryResponse = {
    answer: `Pergunta recebida: "${parsed.data.question}". Resposta gerada nas tasks QE-03…QE-08.`,
    source_document: { id: "PENDING", title: "preenchido na composição do handler (QE-08)" },
  };

  return { status: 200, jsonBody: response };
}

app.http("query", {
  methods: ["POST"],
  route: "query",
  authLevel: "function",
  handler: queryHandler,
});
