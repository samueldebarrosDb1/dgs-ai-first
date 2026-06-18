// Erros customizados do domínio (QE-02).

/** Entrada inválida do cliente → mapeia para HTTP 400. */
export class ValidationError extends Error {
  constructor(
    message: string,
    /** Detalhes por campo (saída do Zod), opcional. */
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Falha em dependência externa (Azure AI Search / OpenAI) → 502/503 nas tasks posteriores. */
export class UpstreamError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "UpstreamError";
  }
}
