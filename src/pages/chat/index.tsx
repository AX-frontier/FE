import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Send, Paperclip, RotateCcw, BookOpen, FileCheck } from 'lucide-react';
import type { Message, AgentType, ChatHistory } from '@/types/chat';
import { reviewDocument, sendQueryToSpringStream } from '@/utils/aiService';
import { agentConfig } from '@/components/common/AgentBadge';
import Sidebar from '@/components/common/Sidebar';
import { DocumentInput, ReviewResult, type DocumentSubmitPayload } from './components/DocumentReview';

type DisplayMessage = Message & {
  reviewScore?: number;
  correctedText?: string;
  correctedHtml?: string | null;
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

export default function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [messages, setMessages]         = useState<DisplayMessage[]>([]);
  const [input, setInput]               = useState('');
  const [isLoading, setIsLoading]       = useState(false);
  const [currentAgent, setCurrentAgent] = useState<AgentType>('main');
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [histories] = useState<ChatHistory[]>([
    { id: '1', title: '올해의 한성대생 철학책 추천', lastMessage: '마흔에 읽는 쇼펜하우어...', timestamp: new Date() },
    { id: '2', title: '장학금 신청 바로가기',       lastMessage: '장학금 신청은 포털에서...',  timestamp: new Date() },
    { id: '3', title: '한성대학교 이번 주 학식',    lastMessage: '이번 주 메뉴는...',          timestamp: new Date() },
  ]);

  const bottomRef      = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const isSendingRef   = useRef(false);

  const scrollBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollBottom(); }, [messages, scrollBottom]);

  useEffect(() => {
    const q = location.state?.query as string | undefined;
    if (q) { handleSend(q); window.history.replaceState({}, ''); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const push = (m: DisplayMessage) => setMessages(p => [...p, m]);

  const handleSend = async (override?: string) => {
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
      let resolvedAgent: AgentType = currentAgent;

      for await (const event of sendQueryToSpringStream(text)) {
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
    } catch {
      setMessages(p => p.map(m =>
        m.id === tid        ? { ...m, content: '죄송합니다. 일시적인 오류가 발생했습니다.', isTyping: false } :
        m.id === discoveryId ? { ...m, isSearching: false } : m
      ));
    } finally {
      isSendingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleDocSubmit = async (doc: DocumentSubmitPayload) => {
    setIsLoading(true);
    setMessages(p => p.map(m => m.showDocInput ? { ...m, showDocInput: false } : m));
    push({ id: `check-${Date.now()}`, role: 'assistant', agentType: 'document', timestamp: new Date(),
      content: '작성하신 문서를 ○○ 규정 및 공문서 작성 준칙에 따라 정밀 검토 중입니다. 잠시만 기다려 주세요.' });

    try {
      const res = await reviewDocument({
        title: '전자결재 문서',
        docType: 'OFFICIAL_DOCUMENT',
        bodyText: doc.text,
        bodyHtml: doc.html,
        editorJson: doc.editorJson as Record<string, unknown>,
      });
      const findingCount = res.summary.totalFindingCount;
      const score = Math.max(55, 95 - findingCount * 5 - res.checkRequiredItems.length * 3);
      const tableSummary = res.extractedTables.length
        ? `\n\n인식된 표: ${res.extractedTables.length}개\n${res.extractedTables.map(table => `- 표 ${table.index}: ${table.rowCount}행 x ${table.columnCount}열`).join('\n')}`
        : '\n\n인식된 표: 없음';
      const feedbackText = `${res.reviewMarkdown}${tableSummary}`;

      push({
        id: `result-${Date.now()}`, role: 'assistant', agentType: 'document', timestamp: new Date(),
        content: `문서 분석이 완료되었습니다. **${findingCount}건의 수정 제안**과 **${res.checkRequiredItems.length}건의 확인 항목**이 식별되었습니다.`,
        reviewScore: score,
        correctedText: res.revisedDocument.content,
        correctedHtml: res.revisedDocument.htmlContent,
        feedbackText,
      });
    } catch {
      push({ id: `err-${Date.now()}`, role: 'assistant', agentType: 'document', timestamp: new Date(), content: '문서 검토 중 오류가 발생했습니다.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]); setCurrentAgent('main'); setSidebarOpen(false);
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
        onSelectHistory={id => { console.log('select', id); setSidebarOpen(false); }}
        onNewChat={handleNewChat}
      />

      {/* ── Messages ── */}
      <main style={{
        flex: 1, overflowY: 'auto', padding: '24px 16px',
        marginTop: 100, marginLeft: sidebarOpen ? 260 : 0,
        transition: 'margin-left 0.26s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

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
                          <div style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{
                            __html: msg.content
                              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                              .replace(/\n/g, '<br/>'),
                          }} />
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
                        correctedText={msg.correctedText ?? ''}
                        correctedHtml={msg.correctedHtml}
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
      <footer style={{
        flexShrink: 0, padding: '8px 16px 16px',
        background: 'var(--bg)', borderTop: '1px solid var(--border)',
        marginLeft: sidebarOpen ? 260 : 0,
        transition: 'margin-left 0.26s cubic-bezier(0.16,1,0.3,1)',
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
