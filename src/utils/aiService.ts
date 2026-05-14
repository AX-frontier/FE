import type { AgentType, ConversationDetail, ConversationListItem } from '@/types/chat';

const DEFAULT_USER_ID = 'local-fe-user';

interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
}

function getBaseUrl(): string {
  return import.meta.env.VITE_BE_SERVER_BASE_URL ?? 'http://localhost:8080';
}

async function fetchApiData<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const payload = (await response.json()) as ApiResponse<T>;
  if (!payload.success) throw new Error(payload.message || 'Request failed');
  return payload.data;
}

export function getLocalUserId(): string {
  return import.meta.env.VITE_LOCAL_USER_ID ?? DEFAULT_USER_ID;
}

export type StreamChunk =
  | { type: 'routing'; targetAgent: string; intent: string }
  | { type: 'chunk'; text: string }
  | { type: 'done'; targetAgent?: string; answer?: string; sources?: unknown[]; confidence?: number; fallbackUsed?: boolean; requiresDocumentInput?: boolean; searchKeyword?: string; resultCount?: number; [key: string]: unknown };

export async function* sendQueryToSpringStream(message: string, conversationUid: string): AsyncGenerator<StreamChunk> {
  const response = await fetch(`${getBaseUrl()}/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queryUid: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
      conversationUid,
      userId: getLocalUserId(),
      message,
    }),
  });
  if (!response.ok || !response.body) throw new Error(`Stream failed: ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data:') && line.length > 5) {
        const json = line.slice(5).trimStart();
        try { yield JSON.parse(json) as StreamChunk; } catch { /* skip malformed */ }
      }
    }
  }
}

export async function listConversations(page = 0, size = 20): Promise<ConversationListItem[]> {
  const params = new URLSearchParams({
    userId: getLocalUserId(),
    page: String(page),
    size: String(size),
  });
  return fetchApiData<ConversationListItem[]>(`/api/conversations?${params.toString()}`);
}

export async function getConversationDetail(conversationUid: string): Promise<ConversationDetail> {
  const params = new URLSearchParams({ userId: getLocalUserId() });
  return fetchApiData<ConversationDetail>(`/api/conversations/${conversationUid}?${params.toString()}`);
}

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
    requiresDocumentInput?: boolean | null;
}

export function detectAgent(query: string): AgentType {
  const libraryKeywords = ['도서관', '학술정보관', '도서', '책', '대출', '반납', '전자책', '학술DB', 'DB', '열람실', '좌석', '연체'];
  const documentKeywords = ['결재', '문서', '기안', '공문', '검토', '피드백', '검수', '본문', '붙임', '수신', '발신'];

  if (libraryKeywords.some((kw) => query.includes(kw))) return 'library';
  if (documentKeywords.some((kw) => query.includes(kw))) return 'document';
  return 'main';
}

export function generateChatTitle(query: string): string {
  return query.length > 20 ? `${query.substring(0, 20)}...` : query;
}

export async function reviewDocument(payload: DocumentReviewPayload, conversationUid: string): Promise<DocumentReviewApiResponse> {
  const response = await fetch(`${getBaseUrl()}/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queryUid: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
      conversationUid,
      userId: getLocalUserId(),
      message: '전자결재 문서를 검토해줘',
      document: payload,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Document review failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:') || line.length <= 5) continue;
      const json = line.slice(5).trimStart();
      try {
        const event = JSON.parse(json) as StreamChunk;
        if (event.type !== 'done') continue;
        const data = event as typeof event & SpringQueryData;
        return {
          targetAgent: 'DOCUMENT_REVIEW',
          intent: 'DOCUMENT_REVIEW',
          answer: data.answer ?? '',
          confidence: data.confidence ?? 0,
          fallbackUsed: data.fallbackUsed ?? false,
          fallbackReason: data.fallbackReason,
          summary: data.summary ?? {
            overallOpinion: data.answer ?? '',
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
            content: data.answer ?? '',
            htmlContent: null,
          },
          reviewMarkdown: data.reviewMarkdown ?? data.answer ?? '',
        };
      } catch { /* skip malformed */ }
    }
  }

  throw new Error('Document review stream ended without done event');
}
