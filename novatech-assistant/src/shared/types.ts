// Tipos do domínio do query endpoint (QE-02).
// Mantidos mínimos: cobrem o que a QE-01 (validação + shape de resposta) referencia;
// SearchService/CompletionService completam estes tipos nas tasks posteriores.

/** Documento de origem citado na resposta (rastreabilidade — ADR-0003: vigência). */
export interface SourceDocument {
  /** Identificador do documento (ex.: "PROC-042-v2"). */
  id: string;
  /** Título legível (ex.: "Frete Especial — versão revisada"). */
  title: string;
  /** Data de vigência (ISO ou rótulo), usada para priorizar a versão mais recente. */
  effectiveDate?: string;
}

/** Chunk recuperado do corpus de retrieval (Azure AI Search em produção). */
export interface RetrievedChunk {
  id: string;
  content: string;
  source_document: SourceDocument;
  /** Score de similaridade (maior = mais relevante). */
  score: number;
}

/** Corpo de entrada do POST /api/query, após validação. */
export interface QueryRequest {
  question: string;
}

/** Corpo de resposta do endpoint. */
export interface QueryResponse {
  answer: string;
  source_document: SourceDocument;
}
