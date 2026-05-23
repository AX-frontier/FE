import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, ExternalLink, FileCheck, Menu, Paperclip, RotateCcw, Send } from 'lucide-react';
import type { Message, AgentType, ChatHistory, ConversationDetail } from '@/types/chat';
import { getConversationDetail, listConversations, normalizeTableChecks, reviewDocument, sendQueryToSpringStream } from '@/utils/aiService';
import type { DocumentReviewApiResponse } from '@/utils/aiService';
import { resolvePageNavigationTarget } from '@/utils/pageNavigation';
import AgentBadge, { agentConfig } from '@/components/common/AgentBadge';
import Sidebar from '@/components/common/Sidebar';
import { DocumentInput, ReviewResult, type DocumentSubmitPayload } from './components/DocumentReview';
import CampusMapCard, {
  campusMapResultFromUnknown,
  type CampusMapResult,
} from './components/CampusMapCard';

type DisplayMessage = Message & {
  reviewScore?: number;
  originalText?: string;
  originalHtml?: string | null;
  correctedText?: string;
  correctedHtml?: string | null;
  copyNotice?: string | null;
  tableChecks?: DocumentReviewApiResponse['tableChecks'];
  tableChecksAvailable?: boolean;
  findings?: DocumentReviewApiResponse['findings'];
  checkRequiredItems?: DocumentReviewApiResponse['checkRequiredItems'];
  formatNoticeItems?: DocumentReviewApiResponse['formatNoticeItems'];
  stripTablesOnCopy?: boolean;
  feedbackText?: string;
  showDocInput?: boolean;
  initialDocText?: string;
  sourceLinks?: SourceLink[];
  bookMatches?: BookMatch[];
  searchKeyword?: string | null;
  resultCount?: number | null;
  mapResult?: CampusMapResult;
};

type SourceLink = {
  title: string;
  url: string;
  label?: string;
};

type BookMatch = {
  id?: number;
  title: string;
  author?: string | null;
  publisher?: string | null;
  publishYear?: number | null;
  holdingCallNo?: string | null;
  materialType?: string | null;
  stackLocation?: string | null;
  stackShelf?: string | null;
};

const SUGGESTIONS = [
  { icon: '📚', label: '학술정보관 운영시간', q: '학술정보관 운영시간 알려줘' },
  { icon: '📅', label: '수강신청 일정',       q: '이번 학기 수강신청 일정은?' },
  { icon: '📋', label: '문서 검수',           q: '결재 문서 검수 부탁해' },
  { icon: '💰', label: '장학금 안내',         q: '장학금 신청 방법 알려줘' },
];

const ACTIVE_CONVERSATION_KEY = 'hansung-ai.activeConversationUid';

function createConversationUid(): string {
  return crypto.randomUUID();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function renderInlineMarkdown(value: string): string {
  const linkPlaceholders: string[] = [];
  const withLinkPlaceholders = value.replace(/\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g, (match, label: string, url: string) => {
    const href = safeHref(url);
    if (!href) return match;
    const index = linkPlaceholders.length;
    linkPlaceholders.push(
      `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
    );
    return `__LINK_${index}__`;
  });

  let safe = escapeHtml(withLinkPlaceholders)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (match, prefix: string, url: string) => {
      const href = safeHref(url);
      if (!href) return match;
      return `${prefix}<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    });

  linkPlaceholders.forEach((link, index) => {
    safe = safe.replace(`__LINK_${index}__`, link);
  });
  return safe;
}

function renderMessageHtml(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const safe = renderInlineMarkdown(line);
      if (safe.startsWith('### ')) return `<h3>${safe.slice(4)}</h3>`;
      if (safe.startsWith('## ')) return `<h2>${safe.slice(3)}</h2>`;
      if (safe.startsWith('- ')) return `<p class="desk-markdown-list">${safe.slice(2)}</p>`;
      if (!safe.trim()) return '<br />';
      return `<p>${safe}</p>`;
    })
    .join('');
}

function sourceLinksFromSources(sources: unknown): SourceLink[] {
  if (!Array.isArray(sources)) {
    const nested = asRecord(sources)?.sources;
    if (!Array.isArray(nested)) return [];
    return sourceLinksFromSources(nested);
  }
  return sources
    .map((source, index): SourceLink | null => {
      const record = asRecord(source);
      if (!record) return null;
      const rawUrl = record.sourceUrl ?? record.url ?? record.link ?? record.href ?? record.pageUrl;
      if (typeof rawUrl !== 'string') return null;
      const url = safeHref(rawUrl);
      if (!url) return null;
      const rawTitle = record.title ?? record.name ?? record.pageTitle ?? record.documentTitle ?? `참고 ${index + 1}`;
      const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : `참고 ${index + 1}`;
      const rawDate = record.updatedAt ?? record.date ?? record.publishedAt;
      return {
        title,
        url,
        label: typeof rawDate === 'string' && rawDate.trim() ? rawDate : undefined,
      };
    })
    .filter((source): source is SourceLink => Boolean(source));
}

function sourceLinksFromText(content: string): SourceLink[] {
  const matches = content.match(/https?:\/\/[^\s<)]+/g) ?? [];
  return Array.from(new Set(matches))
    .map((url, index): SourceLink | null => {
      const href = safeHref(url);
      if (!href) return null;
      return { title: `관련 페이지 ${index + 1}`, url: href };
    })
    .filter((source): source is SourceLink => Boolean(source));
}

function mergeSourceLinks(primary: SourceLink[], fallbackContent: string): SourceLink[] {
  const byUrl = new Map<string, SourceLink>();
  for (const source of [...primary, ...sourceLinksFromText(fallbackContent)]) {
    if (!byUrl.has(source.url)) byUrl.set(source.url, source);
  }
  return Array.from(byUrl.values()).slice(0, 4);
}

function toHistoryItem(item: {
  conversationUid: string;
  title: string;
  lastMessagePreview: string | null;
  messageCount: number;
  updatedAt: string;
}): ChatHistory {
  return {
    id: item.conversationUid,
    title: item.title || '새 대화',
    lastMessage: item.lastMessagePreview || '아직 저장된 메시지가 없습니다.',
    timestamp: new Date(item.updatedAt),
    messageCount: item.messageCount,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function bookMatchesFromUnknown(value: unknown): BookMatch[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((book): BookMatch | null => {
      const record = asRecord(book);
      if (!record) return null;
      const title = asString(record.title)?.trim() ?? '';
      if (!title) return null;
      return {
        id: optionalNumber(record.id),
        title,
        author: asString(record.author) ?? null,
        publisher: asString(record.publisher) ?? null,
        publishYear: optionalNumber(record.publishYear),
        holdingCallNo: asString(record.holdingCallNo) ?? null,
        materialType: asString(record.materialType) ?? null,
        stackLocation: asString(record.stackLocation) ?? null,
        stackShelf: asString(record.stackShelf) ?? null,
      };
    })
    .filter((book): book is BookMatch => Boolean(book))
    .slice(0, 5);
}

function libraryResultFromMetadata(metadata?: Record<string, unknown>): {
  bookMatches: BookMatch[];
  searchKeyword: string | null;
  resultCount: number | null;
} | null {
  const nestedSources = asRecord(metadata?.sources);
  const library = asRecord(metadata?.library) ?? asRecord(nestedSources?.library);
  const matchedBooks = library?.matchedBooks ?? metadata?.matchedBooks ?? nestedSources?.matchedBooks;
  const bookMatches = bookMatchesFromUnknown(matchedBooks);
  if (bookMatches.length === 0) return null;
  const resultCount = optionalNumber(library?.resultCount ?? metadata?.resultCount ?? nestedSources?.resultCount);
  return {
    bookMatches,
    searchKeyword: asString(library?.searchKeyword ?? metadata?.searchKeyword ?? nestedSources?.searchKeyword) ?? null,
    resultCount: resultCount ?? null,
  };
}

function campusMapResultFromMetadata(metadata?: Record<string, unknown>): CampusMapResult | undefined {
  const nestedSources = asRecord(metadata?.sources);
  return campusMapResultFromUnknown(metadata?.mapResult ?? nestedSources?.mapResult);
}

function documentReviewFromMetadata(metadata?: Record<string, unknown>): (Partial<DocumentReviewApiResponse> & {
  originalText?: string;
  originalHtml?: string | null;
}) | null {
  const direct = asRecord(metadata?.documentReview);
  const nestedSources = asRecord(metadata?.sources);
  const review = direct ?? asRecord(nestedSources?.documentReview);
  if (!review) return null;

  const summary = asRecord(review.summary);
  const revisedDocument = asRecord(review.revisedDocument);
  const findings = asArray<DocumentReviewApiResponse['findings'][number]>(review.findings);
  const checkRequiredItems = asArray<DocumentReviewApiResponse['checkRequiredItems'][number]>(review.checkRequiredItems);
  const formatNoticeItems = asArray<DocumentReviewApiResponse['formatNoticeItems'][number]>(review.formatNoticeItems);
  const extractedTables = asArray<DocumentReviewApiResponse['extractedTables'][number]>(review.extractedTables);
  const tableChecks = normalizeTableChecks(review.tableChecks as DocumentReviewApiResponse['tableChecks']);

  return {
    originalText: asString(review.originalText),
    originalHtml: asString(review.originalHtml) ?? null,
    answer: asString(review.answer) ?? '',
    confidence: asNumber(review.confidence),
    fallbackUsed: review.fallbackUsed === true,
    fallbackReason: asString(review.fallbackReason),
    summary: {
      overallOpinion: asString(summary?.overallOpinion) ?? '',
      totalFindingCount: asNumber(summary?.totalFindingCount, findings.length),
      highCount: asNumber(summary?.highCount),
      mediumCount: asNumber(summary?.mediumCount),
      lowCount: asNumber(summary?.lowCount),
    },
    findings,
    checkRequiredItems,
    formatNoticeItems,
    extractedTables,
    tableChecks,
    tableChecksAvailable: asBoolean(review.tableChecksAvailable),
    revisedDocument: {
      format: 'plain_text',
      content: asString(revisedDocument?.content) ?? '',
      htmlContent: asString(revisedDocument?.htmlContent) ?? null,
    },
    reviewMarkdown: asString(review.reviewMarkdown) ?? '',
  };
}

function reviewResultMessageFromHistory(message: ConversationDetail['messages'][number], review: NonNullable<ReturnType<typeof documentReviewFromMetadata>>): DisplayMessage {
  const summary = review.summary ?? {
    overallOpinion: '',
    totalFindingCount: review.findings?.length ?? 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
  };
  const findings = review.findings ?? [];
  const checkRequiredItems = review.checkRequiredItems ?? [];
  const tableChecks = review.tableChecks ?? [];
  const revisedDocument = review.revisedDocument ?? {
    format: 'plain_text',
    content: message.content,
    htmlContent: null,
  };
  const findingCount = summary.totalFindingCount ?? findings.length;
  const hasDocumentTables = containsHtmlTable(review.originalHtml) || containsHtmlTable(revisedDocument.htmlContent);
  const feedbackText = withoutTableCheckSection(review.reviewMarkdown || message.content);

  return {
    id: `${message.role}-${message.queryUid}-${message.createdAt}`,
    role: message.role,
    content: `문서 분석이 완료되었습니다. **${findingCount}건의 수정 제안**, **${checkRequiredItems.length + tableChecks.length}건의 직접 확인 항목**이 식별되었습니다.`,
    timestamp: new Date(message.createdAt),
    agentType: 'document',
    reviewScore: calculateReviewScore(summary, checkRequiredItems, tableChecks),
    originalText: review.originalText,
    originalHtml: review.originalHtml,
    correctedText: revisedDocument.content,
    correctedHtml: revisedDocument.htmlContent,
    tableChecks,
    tableChecksAvailable: review.tableChecksAvailable ?? false,
    findings,
    checkRequiredItems,
    formatNoticeItems: review.formatNoticeItems ?? [],
    copyNotice: hasDocumentTables
      ? '본문 복사 시 표를 포함한 HTML을 클립보드에 담습니다. 화면 미리보기와 WebHWP 붙여넣기 결과는 다를 수 있습니다.'
      : null,
    stripTablesOnCopy: false,
    feedbackText,
  };
}

function toDisplayMessages(detail: ConversationDetail): DisplayMessage[] {
  let lastAgent: AgentType = 'main';
  return detail.messages.map((message) => {
    if (message.role === 'user') {
      lastAgent = detectAgentFromText(message.content);
    }
    const review = message.role === 'assistant' ? documentReviewFromMetadata(message.metadata) : null;
    if (review) {
      lastAgent = 'document';
      return reviewResultMessageFromHistory(message, review);
    }
    const libraryResult = message.role === 'assistant' ? libraryResultFromMetadata(message.metadata) : null;
    const mapResult = message.role === 'assistant' ? campusMapResultFromMetadata(message.metadata) : undefined;
    if (libraryResult) {
      lastAgent = 'library';
    }
    if (mapResult) {
      lastAgent = 'map';
    }
    return {
      id: `${message.role}-${message.queryUid}-${message.createdAt}`,
      role: message.role,
      content: message.role === 'assistant' && lastAgent === 'document'
        ? withoutTableCheckSection(message.content)
        : message.content,
      timestamp: new Date(message.createdAt),
      agentType: message.role === 'assistant' ? lastAgent : undefined,
      sourceLinks: message.role === 'assistant'
        ? mergeSourceLinks(sourceLinksFromSources(message.metadata?.sources), message.content)
        : undefined,
      bookMatches: libraryResult?.bookMatches,
      searchKeyword: libraryResult?.searchKeyword,
      resultCount: libraryResult?.resultCount,
      mapResult,
    };
  });
}

function detectAgentFromText(content: string): AgentType {
  const libraryKeywords = ['도서관', '학술정보관', '도서', '책', '대출', '반납', '열람실'];
  const documentKeywords = ['결재', '문서', '기안', '공문', '검토', '검수'];
  const mapKeywords = ['어디', '위치', '가는 길', '가는길', '길찾기', '출입구'];
  const campusPlaces = ['상상관', '학생회관', '공학관', '미래관', '탐구관', '도서관', '학술정보관'];
  const bookLocationKeywords = ['책', '도서', '청구기호', '서가', '소장'];
  if (
    mapKeywords.some((keyword) => content.includes(keyword)) &&
    campusPlaces.some((keyword) => content.includes(keyword)) &&
    !bookLocationKeywords.some((keyword) => content.includes(keyword))
  ) return 'map';
  if (documentKeywords.some((keyword) => content.includes(keyword))) return 'document';
  if (libraryKeywords.some((keyword) => content.includes(keyword))) return 'library';
  return 'main';
}

function agentFromTargetAgent(value: unknown, fallback: AgentType): AgentType {
  const raw = String(value ?? fallback).toLowerCase();
  if (raw === 'document_review') return 'document';
  if (raw === 'campus_map') return 'map';
  if (raw === 'main' || raw === 'library' || raw === 'document' || raw === 'map') return raw;
  return fallback;
}

function containsHtmlTable(html?: string | null): boolean {
  if (!html) return false;
  return new DOMParser().parseFromString(html, 'text/html').querySelector('table') !== null;
}

function withoutTableCheckSection(markdown: string): string {
  return markdown
    .replace(/\n?<!-- TABLE_CHECKS_START -->[\s\S]*?<!-- TABLE_CHECKS_END -->\n?/g, '')
    .replace(/\n?<!-- TABLE_CHECKS_START -->[\s\S]*$/g, '')
    .replace(/\n?<!-- TABLE_CHECKS_END -->\n?/g, '');
}

function tableCheckPenalty(tableChecks: DocumentReviewApiResponse['tableChecks']): number {
  return tableChecks.reduce((sum, item) => {
    if (item.severity === 'HIGH') return sum + 8;
    if (item.severity === 'MEDIUM') return sum + 5;
    return sum + 2;
  }, 0);
}

function calculateReviewScore(
  summary: DocumentReviewApiResponse['summary'],
  checkRequiredItems: DocumentReviewApiResponse['checkRequiredItems'],
  tableChecks: DocumentReviewApiResponse['tableChecks'],
): number {
  const findingPenalty = summary.highCount * 9 + summary.mediumCount * 6 + summary.lowCount * 3;
  const checkPenalty = checkRequiredItems.length * 4;
  const score = 96 - findingPenalty - checkPenalty - tableCheckPenalty(tableChecks);
  return Math.max(55, Math.min(100, score));
}

const AGENT_META: Record<AgentType, {
  desc: string;
  scanColor: string;
  department: string;
  routeLabel: string;
  answeringText: string;
}> = {
  main: {
    desc: '학교 전반 질의를 통합 처리합니다',
    scanColor: 'var(--agent-main)',
    department: '통합 에이전트',
    routeLabel: 'HSU',
    answeringText: '통합에이전트가 답변중입니다.',
  },
  library: {
    desc: '도서 검색, 대출/반납, 열람실 안내',
    scanColor: 'var(--agent-library)',
    department: '관리부서: 학술정보팀(02-760-4281)',
    routeLabel: '학술',
    answeringText: '학술정보관 에이전트가 답변중입니다.',
  },
  document: {
    desc: '전자결재 기안문 형식 검토',
    scanColor: 'var(--agent-document)',
    department: '관리부서: 총무인사팀(전자결재)',
    routeLabel: '기안',
    answeringText: '전자결재 기안 에이전트가 답변중입니다.',
  },
  map: {
    desc: '캠퍼스 위치와 도보 경로 안내',
    scanColor: 'var(--agent-main)',
    department: '관리부서: 캠퍼스 안내',
    routeLabel: 'MAP',
    answeringText: '캠퍼스 맵 에이전트가 답변중입니다.',
  },
};

export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = location.state as { query?: string; newConversation?: boolean; conversationUid?: string } | null;
  const [messages, setMessages]         = useState<DisplayMessage[]>([]);
  const [input, setInput]               = useState('');
  const [isLoading, setIsLoading]       = useState(false);
  const [currentAgent, setCurrentAgent] = useState<AgentType>('main');
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [histories, setHistories] = useState<ChatHistory[]>([]);
  const [conversationUid, setConversationUid] = useState(() => {
    if (routeState?.conversationUid) {
      return routeState.conversationUid;
    }
    if (routeState?.newConversation) {
      return createConversationUid();
    }
    const stored = window.localStorage.getItem(ACTIVE_CONVERSATION_KEY);
    return stored || createConversationUid();
  });

  const bottomRef      = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const isSendingRef   = useRef(false);
  const didAutoSubmitRef = useRef(false);

  const scrollBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollBottom(); }, [messages, scrollBottom]);

  const refreshHistories = useCallback(async () => {
    try {
      const items = await listConversations();
      setHistories(items.map(toHistoryItem));
      return items;
    } catch {
      setHistories([]);
      return null;
    }
  }, []);

  const restoreConversation = useCallback(async (uid: string) => {
    try {
      const detail = await getConversationDetail(uid);
      setConversationUid(detail.conversationUid);
      window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, detail.conversationUid);
      const restored = toDisplayMessages(detail);
      setMessages(restored);
      const lastUser = [...restored].reverse().find((message) => message.role === 'user');
      setCurrentAgent(lastUser ? detectAgentFromText(lastUser.content) : 'main');
    } catch {
      const nextUid = createConversationUid();
      setConversationUid(nextUid);
      window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, nextUid);
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, conversationUid);
  }, [conversationUid]);

  useEffect(() => {
    let cancelled = false;
    async function loadInitialConversation() {
      let items;
      try {
        items = await listConversations();
      } catch {
        if (!cancelled) setHistories([]);
        return;
      }
      if (cancelled) return;

      setHistories(items.map(toHistoryItem));
      if (routeState?.newConversation) return;
      if (routeState?.conversationUid) {
        await restoreConversation(routeState.conversationUid);
        return;
      }
      const stored = window.localStorage.getItem(ACTIVE_CONVERSATION_KEY);
      if (!stored) return;

      if (items.some((item) => item.conversationUid === stored)) {
        await restoreConversation(stored);
        return;
      }
      window.localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
    }
    loadInitialConversation();
    return () => {
      cancelled = true;
    };
  }, [restoreConversation, routeState?.conversationUid, routeState?.newConversation]);

  useEffect(() => {
    if (didAutoSubmitRef.current) return;
    const q = routeState?.query;
    if (!q) return;
    didAutoSubmitRef.current = true;
    if (routeState?.newConversation) {
      const nextUid = createConversationUid();
      setConversationUid(nextUid);
      window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, nextUid);
      setMessages([]);
      setCurrentAgent('main');
      handleSend(q, nextUid);
    } else {
      handleSend(q);
    }
    window.history.replaceState({}, '', `${location.pathname}${location.search}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const push = (m: DisplayMessage) => setMessages(p => [...p, m]);

  const clearInput = () => {
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.value = '';
    }
  };

  const handleSend = async (override?: string, targetConversationUid = conversationUid) => {
    const text = (override ?? input).trim();
    if (!text || isSendingRef.current) return;
    isSendingRef.current = true;
    clearInput();
    setIsLoading(true);

    push({ id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() });

    const pageTarget = resolvePageNavigationTarget(text);
    if (pageTarget) {
      window.open(pageTarget.url, '_blank', 'noopener,noreferrer');
      setCurrentAgent('main');
      push({
        id: `page-nav-${Date.now()}`,
        role: 'assistant',
        content: `${pageTarget.label} 페이지를 새 탭으로 열었습니다.\n\n${pageTarget.url}`,
        agentType: 'main',
        timestamp: new Date(),
        sourceLinks: [{ title: pageTarget.label, url: pageTarget.url, label: '바로가기' }],
      });
      isSendingRef.current = false;
      setIsLoading(false);
      return;
    }

    const discoveryId = `discovery-${Date.now()}`;
    push({
      id: discoveryId, role: 'assistant', content: '', agentType: currentAgent,
      timestamp: new Date(), isAgentDiscovery: true, isSearching: true,
    });

    const tid = `typing-${Date.now()}`;
    let answerMessageCreated = false;
    let resolvedAgent: AgentType = currentAgent;
    const ensureAnswerMessage = (agent: AgentType) => {
      if (answerMessageCreated) return;
      answerMessageCreated = true;
      push({ id: tid, role: 'assistant', content: '', agentType: agent, timestamp: new Date(), isTyping: true });
    };

    try {
      let streamingStarted = false;
      let receivedTerminalEvent = false;

      for await (const event of sendQueryToSpringStream(text, targetConversationUid)) {
        if (event.type === 'routing') {
          const agent = agentFromTargetAgent(event.targetAgent, resolvedAgent);
          resolvedAgent = agent;
          setCurrentAgent(agent);
          ensureAnswerMessage(agent);
          setMessages(p => p.map(m =>
            m.id === discoveryId ? { ...m, agentType: agent, isSearching: false } :
            m.id === tid         ? { ...m, agentType: agent } : m
          ));
        } else if (event.type === 'chunk') {
          ensureAnswerMessage(resolvedAgent);
          if (!streamingStarted) {
            streamingStarted = true;
            setMessages(p => p.map(m => m.id === tid ? { ...m, isTyping: false, content: event.text } : m));
          } else {
            setMessages(p => p.map(m => m.id === tid ? { ...m, content: m.content + event.text } : m));
          }
        } else if (event.type === 'done') {
          receivedTerminalEvent = true;
          const agent = agentFromTargetAgent(event.targetAgent, resolvedAgent);
          setCurrentAgent(agent);
          setMessages(p => p.map(m =>
            m.id === discoveryId ? { ...m, agentType: agent, isSearching: false } : m
          ));
          ensureAnswerMessage(agent);
          if (event.requiresDocumentInput) {
            const answer = (event.answer as string) || '검토할 전자결재 문서 본문을 입력해주세요.';
            setMessages(p => p.map(m => m.id === tid ? {
              ...m, agentType: agent, isTyping: false,
              content: answer,
              showDocInput: true,
              sourceLinks: mergeSourceLinks(sourceLinksFromSources(event.sources), answer),
              bookMatches: bookMatchesFromUnknown(event.matchedBooks),
              searchKeyword: typeof event.searchKeyword === 'string' ? event.searchKeyword : null,
              resultCount: typeof event.resultCount === 'number' ? event.resultCount : null,
              mapResult: campusMapResultFromUnknown(event.mapResult),
            } : m));
          } else {
            const answer = (event.answer as string) ?? '';
            setMessages(p => p.map(m => m.id === tid ? {
              ...m, agentType: agent, isTyping: false,
              content: answer || m.content,
              sourceLinks: mergeSourceLinks(sourceLinksFromSources(event.sources), answer || m.content),
              bookMatches: bookMatchesFromUnknown(event.matchedBooks),
              searchKeyword: typeof event.searchKeyword === 'string' ? event.searchKeyword : null,
              resultCount: typeof event.resultCount === 'number' ? event.resultCount : null,
              mapResult: campusMapResultFromUnknown(event.mapResult),
            } : m));
          }
        }
      }
      if (!streamingStarted && !receivedTerminalEvent) {
        ensureAnswerMessage(resolvedAgent);
        setMessages(p => p.map(m => m.id === tid ? {
          ...m,
          isTyping: false,
          content: '라우팅은 완료됐지만 에이전트 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.',
        } : m));
      }
    } catch {
      ensureAnswerMessage(resolvedAgent);
      setMessages(p => p.map(m =>
        m.id === tid        ? { ...m, content: '죄송합니다. 일시적인 오류가 발생했습니다.', isTyping: false } :
        m.id === discoveryId ? { ...m, isSearching: false } : m
      ));
    } finally {
      clearInput();
      isSendingRef.current = false;
      setIsLoading(false);
      refreshHistories();
    }
  };

  const handleDocSubmit = async (doc: DocumentSubmitPayload) => {
    setIsLoading(true);
    setMessages(p => p.map(m => m.showDocInput ? { ...m, showDocInput: false } : m));
    push({ id: `check-${Date.now()}`, role: 'assistant', agentType: 'document', timestamp: new Date(),
      content: '작성하신 문서를 문서 규정 및 공문서 작성 준칙에 따라 정밀 검토 중입니다. 잠시만 기다려 주세요.' });

    try {
      const sourceHtml = doc.rawHtml || doc.html;
      const res = await reviewDocument({
        title: '전자결재 문서',
        docType: 'OFFICIAL_DOCUMENT',
        bodyText: doc.text,
        bodyHtml: sourceHtml,
        editorJson: doc.editorJson as Record<string, unknown>,
      }, conversationUid);
      const findingCount = res.summary.totalFindingCount;
      const hasDocumentTables = containsHtmlTable(sourceHtml) || containsHtmlTable(res.revisedDocument.htmlContent);
      const score = calculateReviewScore(res.summary, res.checkRequiredItems, res.tableChecks);
      const feedbackText = withoutTableCheckSection(res.reviewMarkdown);

      push({
        id: `result-${Date.now()}`, role: 'assistant', agentType: 'document', timestamp: new Date(),
        content: `문서 분석이 완료되었습니다. **${findingCount}건의 수정 제안**, **${res.checkRequiredItems.length + res.tableChecks.length}건의 직접 확인 항목**이 식별되었습니다.`,
        reviewScore: score,
        originalText: doc.text,
        originalHtml: sourceHtml,
        correctedText: res.revisedDocument.content,
        correctedHtml: res.revisedDocument.htmlContent,
        tableChecks: res.tableChecks,
        tableChecksAvailable: res.tableChecksAvailable,
        findings: res.findings,
        checkRequiredItems: res.checkRequiredItems,
        formatNoticeItems: res.formatNoticeItems,
        copyNotice: hasDocumentTables
          ? '본문 복사 시 표를 포함한 HTML을 클립보드에 담습니다. 화면 미리보기와 WebHWP 붙여넣기 결과는 다를 수 있습니다.'
          : null,
        stripTablesOnCopy: false,
        feedbackText,
      });
    } catch {
      push({ id: `err-${Date.now()}`, role: 'assistant', agentType: 'document', timestamp: new Date(), content: '문서 검토 중 오류가 발생했습니다.' });
    } finally {
      setIsLoading(false);
      refreshHistories();
    }
  };

  const handleNewChat = () => {
    const nextUid = createConversationUid();
    setConversationUid(nextUid);
    window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, nextUid);
    setMessages([]); setCurrentAgent('main'); setSidebarOpen(false);
  };

  const handleSelectHistory = async (id: string) => {
    setSidebarOpen(false);
    await restoreConversation(id);
  };

  const hasMsg    = messages.length > 0;
  const reviewMode = currentAgent === 'document' || messages.some((message) => message.reviewScore !== undefined || message.showDocInput);

  return (
    <div
      className={`chat-page-bg chat-desk-scope home-page-shell ${sidebarOpen ? 'home-sidebar-open' : 'home-sidebar-closed'}`}
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', position: 'relative' }}
    >

      {/* ── Header ── */}
      <header className="site-header chat-mode" style={{ zIndex: 100 }}>
        <div
          style={{
            width: '100%',
            padding: '0 32px',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={() => setSidebarOpen((open) => !open)}
              className="home-history-button"
              aria-label={sidebarOpen ? '대화 기록 닫기' : '대화 기록 열기'}
            >
              <Menu size={20} />
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="header-logo-button"
              aria-label="홈으로 이동"
            >
              <img className="header-logo-img header-logo-img-chat" src="/hansung_logo.png" alt="한성대학교" />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a
              href="https://www.hansung.ac.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="header-legacy-link"
            >
              <ExternalLink size={14} />
              기존 홈페이지
            </a>
          </div>
        </div>
      </header>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)}
        histories={histories}
        onSelectHistory={handleSelectHistory}
        onNewChat={handleNewChat}
        activeId={conversationUid}
      />

      {/* ── Messages ── */}
      <main className="chat-main" style={{
        flex: 1, overflowY: 'auto', padding: '24px 16px',
        marginTop: 100,
      }}>
        <div className={`desk-ledger ${reviewMode ? 'is-wide' : ''}`}>

          {/* Empty state */}
          {!hasMsg && (
            <div className="anim-fade-in" style={{ textAlign: 'center', padding: '72px 0 40px' }}>
              {/* Icon with glow */}
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: 28 }}>
                <div style={{
                  position: 'absolute', inset: -20,
                  background: 'radial-gradient(circle, rgba(0,61,165,0.13) 0%, transparent 70%)',
                  borderRadius: '50%',
                }} />
                <div style={{
                  width: 72, height: 72, borderRadius: 20,
                  background: 'linear-gradient(135deg, #003DA5 0%, #0050CC 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em',
                  boxShadow: '0 12px 32px rgba(0,61,165,0.35), 0 4px 12px rgba(0,61,165,0.2)',
                  position: 'relative',
                }}>AI</div>
              </div>

              <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', marginBottom: 10, letterSpacing: '-0.03em' }}>
                한성 AI에게 무엇이든 물어보세요
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 36, lineHeight: 1.7 }}>
                학교 정보, 도서관, 행정 문서까지 통합 안내해 드립니다
              </p>

              {/* 2×2 grid suggestion cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 460, margin: '0 auto' }}>
                {SUGGESTIONS.map((s, i) => (
                  <button key={s.q} onClick={() => handleSend(s.q)}
                    className="suggestion-chip anim-fade-up"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 16px', border: '1.5px solid var(--border)',
                      borderRadius: 14, background: 'var(--surface)',
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
                      animationDelay: `${i * 0.07}s`,
                    }}
                  >
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.4 }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>클릭해서 질문하기</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <article key={msg.id} className={`desk-entry desk-entry-${msg.role}`}>
              {/* User */}
              {msg.role === 'user' && (
                <div className="desk-user-note">{msg.content}</div>
              )}

              {/* AI */}
              {msg.role === 'assistant' && (
                <>
                  {/* ── Agent Discovery Card ── */}
                  {msg.isAgentDiscovery && (() => {
                    const type  = msg.agentType ?? 'main';
                    const meta  = AGENT_META[type];
                    if (msg.isSearching) {
                      return (
                        <div className="agent-discovery-card searching">
                          <div className="agent-route-status-line">
                            <span className="dot" /><span className="dot" /><span className="dot" />
                            <span>답변에 적합한 에이전트를 찾고 있습니다.</span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className={`agent-discovery-card found found-${type}`}>
                        <div className="agent-route-status-line" style={{ color: meta.scanColor }}>
                          <span className="agent-route-check-dot" style={{ background: meta.scanColor }} />
                          <span>답변에 적합한 에이전트를 찾았습니다.</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Answer card */}
                  {!msg.isAgentDiscovery && (() => {
                    const type = msg.agentType ?? 'main';
                    const meta = AGENT_META[type];
                    const cfg = agentConfig[type];
                    return (
                      <div
                        className="desk-answer-card"
                        data-route={meta.routeLabel}
                        style={{ '--desk-accent': meta.scanColor } as CSSProperties}
                      >
                        <div className="desk-answer-agent-mark">
                          <AgentBadge type={type} />
                        </div>
                        <div className="desk-answer-head">
                          <div className="msg-agent-header">
                            <span className="msg-agent-name">{cfg.label}</span>
                            <span className="msg-agent-department">{meta.department}</span>
                          </div>
                          <small>
                            {msg.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </small>
                        </div>
                        {msg.isTyping ? (
                          <div className="desk-answer-loading">
                            <span /><span /><span />
                            <p>{meta.answeringText}</p>
                          </div>
                        ) : (
                          <>
                            <div className="desk-markdown" dangerouslySetInnerHTML={{ __html: renderMessageHtml(msg.content) }} />
                            {msg.sourceLinks && msg.sourceLinks.length > 0 && (
                              <div className="desk-sources">
                                <span className="desk-sources-label">참고</span>
                                <div className="desk-source-list">
                                  {msg.sourceLinks.map((source) => (
                                    <a
                                      key={source.url}
                                      href={source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="desk-source-link"
                                    >
                                      <span>{source.title}</span>
                                      {source.label && <small>{source.label}</small>}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                            {msg.bookMatches && msg.bookMatches.length > 0 && (
                              <div className="desk-book-results">
                                <div className="desk-book-results-head">
                                  <span>추천 도서</span>
                                  <small>
                                    {msg.searchKeyword ? `"${msg.searchKeyword}" 검색` : '학술정보관 소장자료'}
                                    {typeof msg.resultCount === 'number' ? ` · ${msg.resultCount}건` : ''}
                                  </small>
                                </div>
                                <div className="desk-book-list">
                                  {msg.bookMatches.map((book, index) => (
                                    <div className="desk-book-row" key={`${book.id ?? book.title}-${index}`}>
                                      <strong>{index + 1}</strong>
                                      <div>
                                        <span>{book.title}</span>
                                        <p>{[book.author, book.publisher, book.publishYear].filter(Boolean).join(' · ')}</p>
                                      </div>
                                      <small>
                                        {[book.stackLocation, book.stackShelf, book.holdingCallNo].filter(Boolean).join(' · ') || '위치 확인 필요'}
                                      </small>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {msg.mapResult && (
                              <CampusMapCard result={msg.mapResult} />
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                  {/* Doc input widget */}
                  {msg.showDocInput && (
                      <div className="desk-document-wrap">
                        <div className="desk-document-shell">
                        <div className="desk-document-editor">
                          <DocumentInput
                            onSubmit={handleDocSubmit}
                            isLoading={isLoading}
                            initialText={msg.initialDocText}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Review result */}
                  {msg.reviewScore !== undefined && (
                    <div className="desk-review-wrap">
                      <ReviewResult
                        score={msg.reviewScore}
                        originalText={msg.originalText}
                        originalHtml={msg.originalHtml}
                        correctedText={msg.correctedText ?? ''}
                        correctedHtml={msg.correctedHtml}
                        copyNotice={msg.copyNotice}
                        findings={msg.findings}
                        checkRequiredItems={msg.checkRequiredItems}
                        tableChecks={msg.tableChecks}
                        formatNoticeItems={msg.formatNoticeItems}
                        feedbackText={msg.feedbackText ?? ''}
                      />
                    </div>
                  )}
                </>
              )}
            </article>
          ))}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* ── Input bar ── */}
      <footer className="chat-footer" style={{
        flexShrink: 0, padding: '8px 16px 16px',
        background: 'linear-gradient(180deg, rgba(246, 249, 255, 0), rgba(246, 249, 255, 0.98) 28%, #f6f9ff 100%)',
        borderTop: 'none',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* Input */}
          <div className="input-bar">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => {
                if (isSendingRef.current) {
                  e.currentTarget.value = '';
                  return;
                }
                setInput(e.target.value);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (e.nativeEvent.isComposing) return;
                  handleSend();
                }
              }}
              placeholder="메시지를 입력하세요  (Enter: 전송 / Shift+Enter: 줄바꿈)"
              rows={2}
              style={{
                width: '100%', padding: '12px 16px 4px', fontSize: 14,
                border: 'none', outline: 'none', resize: 'none', background: 'none',
                fontFamily: 'inherit', color: 'var(--text-1)', lineHeight: 1.6,
                maxHeight: 120,
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px 10px' }}>
              {/* Left icons */}
              <div style={{ display: 'flex', gap: 2 }}>
                {[
                  { Icon: Paperclip, title: '첨부' },
                  { Icon: BookOpen,  title: '도서관' },
                  { Icon: FileCheck, title: '문서 검수' },
                ].map(({ Icon, title }) => (
                  <button key={title} title={title}
                    onClick={() => {
                      if (title === '문서 검수') {
                        setCurrentAgent('document');
                        push({
                          id: `doc-${Date.now()}`,
                          role: 'assistant',
                          agentType: 'document',
                          timestamp: new Date(),
                          content: '아래 전용 입력 박스에 전자결재 본문을 붙여넣어 주세요.',
                          showDocInput: true,
                        });
                      }
                    }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 6, borderRadius: 5,
                      color: 'var(--text-3)', display: 'flex', alignItems: 'center', transition: 'color 0.12s, background 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text-2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-3)'; }}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
              {/* Right */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {hasMsg && (
                  <button onClick={handleNewChat} title="새 대화"
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 6, borderRadius: 5,
                      color: 'var(--text-3)', display: 'flex', alignItems: 'center', transition: 'color 0.12s, background 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text-2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-3)'; }}
                  >
                    <RotateCcw size={15} />
                  </button>
                )}
                <button onClick={() => handleSend()} disabled={!input.trim() || isLoading}
                  className="btn-blue"
                  style={{ width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
