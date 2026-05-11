import type { AgentType } from '@/types/chat';

const BE_BASE_URL = import.meta.env.VITE_BE_SERVER_BASE_URL ?? 'http://localhost:8081';

export interface QueryContext {
  queryUid: string;
  traceId: string;
  conversationUid: string;
}

export interface CoreQueryPayload extends QueryContext {
  message: string;
}

export interface DocumentReviewPayload extends CoreQueryPayload {
  document: {
    title: string;
    docType: 'OFFICIAL_DOCUMENT';
    bodyText: string;
  };
}

export interface ApiEnvelope<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
}

export interface BackendQueryResponse {
  queryUid?: string;
  traceId?: string;
  targetAgent: 'MAIN' | 'LIBRARY' | 'DOCUMENT_REVIEW' | 'FALLBACK';
  intent: string;
  answer: string;
  sources?: unknown[];
  confidence?: number;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
  summary?: {
    totalFindingCount?: number;
    highCount?: number;
    mediumCount?: number;
    lowCount?: number;
  };
  findings?: unknown[];
  criterionResults?: unknown[];
  checkRequiredItems?: unknown[];
  formatNoticeItems?: unknown[];
  extractedTables?: unknown[];
  revisedDocument?: {
    content?: string;
    htmlContent?: string | null;
  };
  reviewMarkdown?: string;
  requiresDocumentInput?: boolean;
  documentInputType?: string | null;
}

export function detectAgentFromResponse(response: BackendQueryResponse): AgentType {
  if (response.targetAgent === 'LIBRARY') return 'library';
  if (response.targetAgent === 'DOCUMENT_REVIEW') return 'document';
  return 'main';
}

export function createQueryContext(): QueryContext {
  return {
    queryUid: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    conversationUid: crypto.randomUUID(),
  };
}

export async function postCoreQuery(payload: CoreQueryPayload): Promise<BackendQueryResponse> {
  return postJson<BackendQueryResponse>('/query', payload);
}

export async function postDocumentReview(payload: DocumentReviewPayload): Promise<BackendQueryResponse> {
  return postJson<BackendQueryResponse>('/document-review', payload);
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${BE_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !envelope.success) {
    throw new Error(envelope.message || `Request failed: ${response.status}`);
  }
  return envelope.data;
}

export function generateChatTitle(query: string): string {
  return query.length > 20 ? `${query.substring(0, 20)}...` : query;
}
