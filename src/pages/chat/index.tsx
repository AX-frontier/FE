import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Send, Paperclip, RotateCcw, BookOpen, FileCheck } from 'lucide-react';
import type { Message, AgentType, ChatHistory } from '@/types/chat';
import { detectAgent, callClaudeAPI } from '@/utils/aiService';
import AgentBadge, { agentConfig } from '@/components/common/AgentBadge';
import Sidebar from '@/components/common/Sidebar';
import { DocumentInput, ReviewResult } from './components/DocumentReview';

type DisplayMessage = Message & {
  reviewScore?: number;
  correctedText?: string;
  feedbackText?: string;
  showDocInput?: boolean;
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

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const convRef     = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

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
    if (!text || isLoading) return;
    setInput('');

    const agent = detectAgent(text);
    setCurrentAgent(agent);

    push({ id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() });

    if (agent !== currentAgent || messages.length === 0) {
      push({ id: `t-${Date.now()}`, role: 'assistant', content: '한성 AI가 적합한 에이전트를 탐색 완료했어요.', agentType: 'main', timestamp: new Date() });
    }

    if (agent === 'document' && !text.includes('\n')) {
      push({
        id: `doc-${Date.now()}`, role: 'assistant', agentType: 'document', timestamp: new Date(),
        content: `네, 작성하신 문서의 검수를 도와드리겠습니다.\n해당 문서는 본교 행정 업무 운영 지침 및 공문서 작성 준칙에 의거하여 검토를 진행할 예정입니다.\n피드백이 필요한 문서의 본문을 하단 박스에 텍스트로 입력해 주세요.`,
        showDocInput: true,
      });
      return;
    }

    const tid = `typing-${Date.now()}`;
    push({ id: tid, role: 'assistant', content: '', agentType: agent, timestamp: new Date(), isTyping: true });
    convRef.current = [...convRef.current, { role: 'user', content: text }];

    try {
      const res = await callClaudeAPI(convRef.current, agent);
      convRef.current = [...convRef.current, { role: 'assistant', content: res }];
      setMessages(p => p.map(m => m.id === tid ? { ...m, content: res, isTyping: false } : m));
    } catch {
      setMessages(p => p.map(m => m.id === tid ? { ...m, content: '죄송합니다. 일시적인 오류가 발생했습니다.', isTyping: false } : m));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDocSubmit = async (docText: string) => {
    setIsLoading(true);
    push({ id: `check-${Date.now()}`, role: 'assistant', agentType: 'document', timestamp: new Date(),
      content: '작성하신 문서를 ○○ 규정 및 공문서 작성 준칙에 따라 정밀 검토 중입니다. 잠시만 기다려 주세요.' });

    const prompt = `다음 공문서를 검토해주세요.\n1. 형식 적합도 점수 (0-100)\n2. 두문/본문/결문 섹션별 상태와 설명\n3. 보완 사항\n4. 수정된 문서 전문 (---수정문서--- 태그 사이에)\n\n문서:\n${docText}`;
    convRef.current = [...convRef.current, { role: 'user', content: prompt }];

    try {
      const res = await callClaudeAPI(convRef.current, 'document');
      const scoreMatch    = res.match(/\b(\d{1,3})\b/);
      const score         = scoreMatch ? parseInt(scoreMatch[1]) : 76;
      const corrMatch     = res.match(/---수정문서---([\s\S]*?)---수정문서---/);
      const correctedText = corrMatch ? corrMatch[1].trim() : docText;
      const feedbackText  = res.replace(/---수정문서---[\s\S]*?---수정문서---/, '').trim();

      push({
        id: `result-${Date.now()}`, role: 'assistant', agentType: 'document', timestamp: new Date(),
        content: `문서 분석이 완료되었습니다. **${Math.max(1, 5 - Math.floor(score / 20))}건의 보완 사항**이 식별되었습니다.`,
        reviewScore: score, correctedText, feedbackText,
      });
    } catch {
      push({ id: `err-${Date.now()}`, role: 'assistant', agentType: 'document', timestamp: new Date(), content: '문서 검토 중 오류가 발생했습니다.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]); setCurrentAgent('main'); convRef.current = []; setSidebarOpen(false);
  };

  const agentInfo = agentConfig[currentAgent];
  const hasMsg    = messages.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <header className="site-header" style={{ display: 'flex', alignItems: 'center', padding: '0 32px', gap: 12 }}>
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
            <div className="anim-fade-in" style={{ textAlign: 'center', padding: '64px 0 32px' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: 'var(--blue)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em',
              }}>AI</div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>
                한성 AI에게 무엇이든 물어보세요
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>
                학교 정보, 도서관, 행정 문서까지 통합 안내해 드립니다
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {SUGGESTIONS.map(s => (
                  <button key={s.q} onClick={() => handleSend(s.q)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '8px 14px', border: '1px solid var(--border)',
                      borderRadius: 8, fontSize: 13, color: 'var(--text-2)',
                      background: 'var(--surface)', cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'border-color 0.12s, color 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}
                  >
                    <span>{s.icon}</span>{s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <div key={msg.id} className="anim-fade-up"
              style={{ animationDelay: `${i * 0.025}s`, display: 'flex', flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}
            >
              {/* User */}
              {msg.role === 'user' && (
                <div className="msg-user">{msg.content}</div>
              )}

              {/* AI */}
              {msg.role === 'assistant' && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%' }}>
                  <AgentBadge type={msg.agentType ?? 'main'} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Agent label */}
                    <AgentBadge type={msg.agentType ?? 'main'} size="sm" />
                    {/* Bubble */}
                    <div className="msg-ai">
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
                    {/* Doc input widget */}
                    {msg.showDocInput && (
                      <DocumentInput onSubmit={handleDocSubmit} isLoading={isLoading} />
                    )}
                    {/* Review result */}
                    {msg.reviewScore !== undefined && (
                      <ReviewResult
                        score={msg.reviewScore}
                        correctedText={msg.correctedText ?? ''}
                        feedbackText={msg.feedbackText ?? ''}
                      />
                    )}
                  </div>
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
