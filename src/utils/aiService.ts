import type { AgentType } from '@/types/chat';

export interface DocumentReviewPayload {
  title?: string;
  docType?: string;
  bodyText: string;
  bodyHtml: string;
  editorJson?: Record<string, unknown>;
}

export interface DocumentReviewApiResponse {
  targetAgent: 'DOCUMENT_REVIEW';
  intent: 'DOCUMENT_REVIEW';
  answer: string;
  confidence: number;
  fallbackUsed: boolean;
  fallbackReason?: string | null;
  summary: {
    overallOpinion: string;
    totalFindingCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
  findings: Array<{
    id: string;
    ruleCode: string;
    category: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    lineStart: number;
    originalText: string;
    suggestedText?: string | null;
    reason: string;
  }>;
  checkRequiredItems: Array<{
    id: string;
    category: string;
    message: string;
  }>;
  formatNoticeItems: Array<{
    category: string;
    message: string;
  }>;
  extractedTables: Array<{
    index: number;
    rowCount: number;
    columnCount: number;
    rows: string[][];
  }>;
  revisedDocument: {
    format: 'plain_text';
    content: string;
    htmlContent?: string | null;
  };
  reviewMarkdown: string;
}

export interface SpringQueryResponse {
  success: boolean;
  code: string;
  message: string;
  data: SpringQueryData;
}

export interface SpringQueryData {
    targetAgent: string;
    intent: string;
    answer: string;
    sources: unknown[];
    confidence: number;
    fallbackUsed: boolean;
    fallbackReason?: string | null;
    searchKeyword?: string | null;
    resultCount?: number | null;
    matchedBooks?: unknown[] | null;
    summary?: DocumentReviewApiResponse['summary'] | null;
    findings?: DocumentReviewApiResponse['findings'] | null;
    checkRequiredItems?: DocumentReviewApiResponse['checkRequiredItems'] | null;
    formatNoticeItems?: DocumentReviewApiResponse['formatNoticeItems'] | null;
    extractedTables?: DocumentReviewApiResponse['extractedTables'] | null;
    revisedDocument?: DocumentReviewApiResponse['revisedDocument'] | null;
    reviewMarkdown?: string | null;
}

export function detectAgent(query: string): AgentType {
  const libraryKeywords = ['도서관', '학술정보관', '도서', '책', '대출', '반납', '전자책', '학술DB', 'DB', '열람실', '좌석', '연체'];
  const documentKeywords = ['결재', '문서', '기안', '공문', '검토', '피드백', '검수', '본문', '붙임', '수신', '발신'];

  if (libraryKeywords.some((kw) => query.includes(kw))) return 'library';
  if (documentKeywords.some((kw) => query.includes(kw))) return 'document';
  return 'main';
}

export async function sendQueryToSpring(message: string): Promise<SpringQueryResponse['data']> {
  const baseUrl = import.meta.env.VITE_BE_SERVER_BASE_URL ?? 'http://localhost:8080';
  const response = await fetch(`${baseUrl}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queryUid: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
      conversationUid: crypto.randomUUID(),
      userId: 'local-fe-user',
      message,
    }),
  });

  if (!response.ok) {
    throw new Error(`Spring query failed: ${response.status}`);
  }

  const payload = (await response.json()) as SpringQueryResponse;
  if (!payload.success) {
    throw new Error(payload.message);
  }
  return payload.data;
}

export function generateChatTitle(query: string): string {
  return query.length > 20 ? `${query.substring(0, 20)}...` : query;
}

export async function reviewDocument(payload: DocumentReviewPayload): Promise<DocumentReviewApiResponse> {
  const baseUrl = import.meta.env.VITE_BE_SERVER_BASE_URL ?? 'http://localhost:8080';
  const response = await fetch(`${baseUrl}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queryUid: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
      conversationUid: crypto.randomUUID(),
      userId: 'local-fe-user',
      message: '전자결재 문서를 검토해줘',
      document: payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`Document review failed: ${response.status}`);
  }

  const wrapped = (await response.json()) as SpringQueryResponse;
  if (!wrapped.success) {
    throw new Error(wrapped.message);
  }
  const data = wrapped.data;
  return {
    targetAgent: 'DOCUMENT_REVIEW',
    intent: 'DOCUMENT_REVIEW',
    answer: data.answer,
    confidence: data.confidence,
    fallbackUsed: data.fallbackUsed,
    fallbackReason: data.fallbackReason,
    summary: data.summary ?? {
      overallOpinion: data.answer,
      totalFindingCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    },
    findings: data.findings ?? [],
    checkRequiredItems: data.checkRequiredItems ?? [],
    formatNoticeItems: data.formatNoticeItems ?? [],
    extractedTables: data.extractedTables ?? [],
    revisedDocument: data.revisedDocument ?? {
      format: 'plain_text',
      content: data.answer,
      htmlContent: null,
    },
    reviewMarkdown: data.reviewMarkdown ?? data.answer,
  };
}
