import { X, Plus, Clock, MessageSquare } from 'lucide-react';
import type { ChatHistory } from '@/types/chat';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  histories: ChatHistory[];
  onSelectHistory: (id: string) => void;
  onNewChat: () => void;
  activeId?: string;
}

function formatHistoryTime(date: Date): string {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startToday - startDate) / 86400000);
  if (dayDiff === 0) return '오늘';
  if (dayDiff === 1) return '어제';
  if (dayDiff < 7) return `${dayDiff}일 전`;
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

export default function Sidebar({ isOpen, onClose, histories, onSelectHistory, onNewChat, activeId }: Props) {
  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}

      <aside className={`sidebar ${isOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="sidebar-head">
          <div className="sidebar-title-row">
            <div>
              <span className="sidebar-kicker">대화 기록</span>
              <p className="sidebar-subtitle">최근 세션을 바로 이어서 볼 수 있어요</p>
            </div>
            <button onClick={onClose} className="sidebar-close" aria-label="대화 목록 닫기">
              <X size={15} />
            </button>
          </div>

          <button onClick={onNewChat} className="sidebar-new-chat">
            <Plus size={14} />
            새 대화 시작
          </button>
        </div>

        <div className="sidebar-list">
          {histories.length === 0 ? (
            <div className="sidebar-empty">
              <MessageSquare size={28} color="var(--border-md)" style={{ margin: '0 auto 8px' }} />
              <p>아직 대화 기록이 없어요</p>
            </div>
          ) : histories.map(h => (
            <button
              key={h.id}
              onClick={() => onSelectHistory(h.id)}
              className={`sidebar-history-item ${activeId === h.id ? 'active' : ''}`}
            >
              <div className="sidebar-history-icon">
                <Clock size={13} />
              </div>
              <div className="sidebar-history-body">
                <div className="sidebar-history-top">
                  <p className="sidebar-history-title">{h.title}</p>
                  <span>{formatHistoryTime(h.timestamp)}</span>
                </div>
                <p className="sidebar-history-preview">{h.lastMessage}</p>
              </div>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
