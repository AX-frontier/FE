import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Send, Paperclip, RotateCcw, BookOpen, FileCheck } from 'lucide-react';
import type { Message, AgentType, ChatHistory, ConversationDetail } from '@/types/chat';
import { getConversationDetail, listConversations, normalizeTableChecks, reviewDocument, sendQueryToSpringStream } from '@/utils/aiService';
import type { DocumentReviewApiResponse } from '@/utils/aiService';
import { agentConfig } from '@/components/common/AgentBadge';
import Sidebar from '@/components/common/Sidebar';
import { DocumentInput, ReviewResult, type DocumentSubmitPayload } from './components/DocumentReview';

type DisplayMessage = Message & {
  reviewScore?: number;
  originalText?: string;
  originalHtml?: string | null;
  correctedText?: string;
  correctedHtml?: string | null;
  copyNotice?: string | null;
  tableChecks?: DocumentReviewApiResponse['tableChecks'];
  tableChecksAvailable?: boolean;
  stripTablesOnCopy?: boolean;
  feedbackText?: string;
  showDocInput?: boolean;
  initialDocText?: string;
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
      if (safe.startsWith('- ')) return `<p>${safe}</p>`;
      if (!safe.trim()) return '<br />';
      return `<p>${safe}</p>`;
    })
    .join('');
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
  const extractedTables = review.extractedTables ?? [];
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
    reviewScore: Math.max(55, 95 - findingCount * 5 - checkRequiredItems.length * 3 - tableCheckPenalty(tableChecks)),
    originalText: review.originalText,
    originalHtml: review.originalHtml,
    correctedText: revisedDocument.content,
    correctedHtml: revisedDocument.htmlContent,
    tableChecks,
    tableChecksAvailable: review.tableChecksAvailable ?? false,
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
    return {
      id: `${message.role}-${message.queryUid}-${message.createdAt}`,
      role: message.role,
      content: message.role === 'assistant' && lastAgent === 'document'
        ? withoutTableCheckSection(message.content)
        : message.content,
      timestamp: new Date(message.createdAt),
      agentType: message.role === 'assistant' ? lastAgent : undefined,
    };
  });
}

function detectAgentFromText(content: string): AgentType {
  const libraryKeywords = ['도서관', '학술정보관', '도서', '책', '대출', '반납', '열람실'];
  const documentKeywords = ['결재', '문서', '기안', '공문', '검토', '검수'];
  if (documentKeywords.some((keyword) => content.includes(keyword))) return 'document';
  if (libraryKeywords.some((keyword) => content.includes(keyword))) return 'library';
  return 'main';
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
    if (item.severity === 'HIGH') return sum + 4;
    if (item.severity === 'MEDIUM') return sum + 2;
    return sum + 1;
  }, 0);
}

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

  const handleSend = async (override?: string, targetConversationUid = conversationUid) => {
    const text = (override ?? input).trim();
    if (!text || isSendingRef.current) return;
    isSendingRef.current = true;
    setInput('');
    setIsLoading(true);

    push({ id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() });

    const discoveryId = `discovery-${Date.now()}`;
    push({
      id: discoveryId, role: 'assistant', content: '', agentType: currentAgent,
      timestamp: new Date(), isAgentDiscovery: true, isSearching: true,
    });

    const tid = `typing-${Date.now()}`;
    push({ id: tid, role: 'assistant', content: '', agentType: currentAgent, timestamp: new Date(), isTyping: true });

    try {
      let streamingStarted = false;
      let receivedTerminalEvent = false;
      let resolvedAgent: AgentType = currentAgent;

      for await (const event of sendQueryToSpringStream(text, targetConversationUid)) {
        if (event.type === 'routing') {
          const raw = event.targetAgent.toLowerCase();
          const agent = (raw === 'document_review' ? 'document' : raw) as AgentType;
          resolvedAgent = agent;
          setCurrentAgent(agent);
          setMessages(p => p.map(m =>
            m.id === discoveryId ? { ...m, agentType: agent, isSearching: false } :
            m.id === tid         ? { ...m, agentType: agent } : m
          ));
        } else if (event.type === 'chunk') {
          if (!streamingStarted) {
            streamingStarted = true;
            setMessages(p => p.map(m => m.id === tid ? { ...m, isTyping: false, content: event.text } : m));
          } else {
            setMessages(p => p.map(m => m.id === tid ? { ...m, content: m.content + event.text } : m));
          }
        } else if (event.type === 'done') {
          receivedTerminalEvent = true;
          const raw = (event.targetAgent ?? resolvedAgent).toString().toLowerCase();
          const agent = (raw === 'document_review' ? 'document' : raw) as AgentType;
          setCurrentAgent(agent);
          setMessages(p => p.map(m =>
            m.id === discoveryId ? { ...m, agentType: agent, isSearching: false } : m
          ));
          if (event.requiresDocumentInput) {
            setMessages(p => p.map(m => m.id === tid ? {
              ...m, agentType: agent, isTyping: false,
              content: (event.answer as string) || '검토할 전자결재 문서 본문을 입력해주세요.',
              showDocInput: true,
            } : m));
          } else {
            setMessages(p => p.map(m => m.id === tid ? {
              ...m, agentType: agent, isTyping: false,
              content: (event.answer as string) ?? m.content,
            } : m));
          }
        }
      }
      if (!streamingStarted && !receivedTerminalEvent) {
        setMessages(p => p.map(m => m.id === tid ? {
          ...m,
          isTyping: false,
          content: '라우팅은 완료됐지만 에이전트 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.',
        } : m));
      }
    } catch {
      setMessages(p => p.map(m =>
        m.id === tid        ? { ...m, content: '죄송합니다. 일시적인 오류가 발생했습니다.', isTyping: false } :
        m.id === discoveryId ? { ...m, isSearching: false } : m
      ));
    } finally {
      isSendingRef.current = false;
      setIsLoading(false);
      refreshHistories();
    }
  };

  const handleDocSubmit = async (doc: DocumentSubmitPayload) => {
    setIsLoading(true);
    setMessages(p => p.map(m => m.showDocInput ? { ...m, showDocInput: false } : m));
    push({ id: `check-${Date.now()}`, role: 'assistant', agentType: 'document', timestamp: new Date(),
      content: '작성하신 문서를 ○○ 규정 및 공문서 작성 준칙에 따라 정밀 검토 중입니다. 잠시만 기다려 주세요.' });

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
      const score = Math.max(55, 95 - findingCount * 5 - res.checkRequiredItems.length * 3 - tableCheckPenalty(res.tableChecks));
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

  const AGENT_META: Record<string, { desc: string; scanColor: string }> = {
    main:     { desc: '학사, 공지, 시설, 행정 등 학교 전반 안내',     scanColor: 'var(--agent-main)' },
    library:  { desc: '도서 검색, 대출/반납, 열람실, 학술DB 안내',    scanColor: 'var(--agent-library)' },
    document: { desc: '공문서 형식 검토 및 구체적 수정 피드백 제공',  scanColor: 'var(--agent-document)' },
  };

  const agentInfo = agentConfig[currentAgent];
  const hasMsg    = messages.length > 0;

  return (
    <div className="chat-page-bg" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* ── Header ── */}
      <header className="site-header chat-mode" style={{ display: 'flex', alignItems: 'center', padding: '0 32px', gap: 12 }}>
        {/* Hamburger */}
        <button onClick={() => setSidebarOpen(true)}
          className="chat-menu-button"
          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 8, borderRadius: 6,
            color: 'var(--text-2)', display: 'flex', alignItems: 'center', transition: 'background 0.12s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <Menu size={20} />
        </button>

        {/* Logo */}
        <button onClick={() => navigate('/')}
          style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontWeight: 900, fontSize: 42, color: 'var(--blue)', letterSpacing: '-0.05em' }}>HSU</span>
          <div style={{ borderLeft: '2px solid var(--border-md)', paddingLeft: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue-dark)', lineHeight: 1.3 }}>한성대학교</div>
            <div style={{ fontSize: 14, color: 'var(--text-3)', letterSpacing: '0.06em', lineHeight: 1.3 }}>HANSUNG UNIVERSITY</div>
          </div>
        </button>

        <div style={{ flex: 1 }} />

        {/* Agent indicator */}
        {hasMsg && (
          <span className={`badge-pill ${agentInfo.badgeClass}`} style={{ fontSize: 11 }}>
            {agentInfo.label}
          </span>
        )}

        {/* 장학금 */}
        <button style={{
          fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
          border: 'none', background: 'var(--blue-tint)', color: 'var(--blue)', cursor: 'pointer', fontFamily: 'inherit',
        }}>장학금</button>
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
        <div style={{ maxWidth: messages.some((message) => message.reviewScore !== undefined) ? 1040 : 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

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
            <div key={msg.id} className="msg-wrapper"
              style={{ display: 'flex', flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}
            >
              {/* User */}
              {msg.role === 'user' && (
                <div className="msg-user">{msg.content}</div>
              )}

              {/* AI */}
              {msg.role === 'assistant' && (
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 0 }}>

                  {/* ── Agent Discovery Card ── */}
                    {msg.isAgentDiscovery && (() => {
                      const type  = msg.agentType ?? 'main';
                      const cfg   = agentConfig[type];
                      const meta  = AGENT_META[type];
                      if (msg.isSearching) {
                        return (
                          <div className="agent-discovery-card searching">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ display: 'flex', gap: 3 }}>
                                <span className="dot" /><span className="dot" /><span className="dot" />
                              </div>
                              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>
                                적합한 에이전트 탐색 중...
                              </span>
                            </div>
                            <div className="scan-track">
                              <div className="scan-fill" />
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className={`agent-discovery-card found found-${type}`}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                              <circle cx="6.5" cy="6.5" r="6.5" fill={meta.scanColor} fillOpacity="0.15"/>
                              <path d="M3.5 6.5L5.5 8.5L9.5 4.5" stroke={meta.scanColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span style={{ fontSize: 11, fontWeight: 700, color: meta.scanColor, letterSpacing: '0.03em' }}>
                              에이전트 연결 완료
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                              background: meta.scanColor, display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em',
                            }}>
                              {cfg.abbr}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3 }}>
                                {cfg.icon} {cfg.label}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.4 }}>
                                {meta.desc}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* 에이전트 인라인 헤더 */}
                    {!msg.isAgentDiscovery && (
                      <div className="msg-agent-header">
                        <div
                          className="msg-agent-icon"
                          style={{ background: AGENT_META[msg.agentType ?? 'main'].scanColor }}
                        >
                          {agentConfig[msg.agentType ?? 'main'].abbr}
                        </div>
                        <span className="msg-agent-name">
                          {agentConfig[msg.agentType ?? 'main'].label}
                        </span>
                      </div>
                    )}

                    {/* Bubble */}
                    {!msg.isAgentDiscovery && (
                      <div className={`msg-ai msg-ai-${msg.agentType ?? 'main'}`}>
                        {msg.isTyping ? (
                          <div style={{ display: 'flex', gap: 4, padding: '2px 0' }}>
                            <span className="dot" /><span className="dot" /><span className="dot" />
                          </div>
                        ) : (
                          <div className="chat-markdown" dangerouslySetInnerHTML={{ __html: renderMessageHtml(msg.content) }} />
                        )}
                      </div>
                    )}
                    {/* Doc input widget */}
                    {msg.showDocInput && (
                      <DocumentInput
                        onSubmit={handleDocSubmit}
                        isLoading={isLoading}
                        initialText={msg.initialDocText}
                      />
                    )}
                    {/* Review result */}
                    {msg.reviewScore !== undefined && (
                      <ReviewResult
                        score={msg.reviewScore}
                        originalText={msg.originalText}
                        originalHtml={msg.originalHtml}
                        correctedText={msg.correctedText ?? ''}
                        correctedHtml={msg.correctedHtml}
                        copyNotice={msg.copyNotice}
                        tableChecks={msg.tableChecks}
                        tableChecksAvailable={msg.tableChecksAvailable}
                        stripTablesOnCopy={msg.stripTablesOnCopy}
                        feedbackText={msg.feedbackText ?? ''}
                      />
                    )}
                </div>
              )}
            </div>
          ))}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* ── Input bar ── */}
      <footer className="chat-footer" style={{
        flexShrink: 0, padding: '8px 16px 16px',
        background: 'var(--bg)', borderTop: '1px solid var(--border)',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* Input */}
          <div className="input-bar">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
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
