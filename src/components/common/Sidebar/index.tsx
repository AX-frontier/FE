import { X, Plus, Clock, MessageSquare } from 'lucide-react';
import type { ChatHistory } from '@/types/chat';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  histories: ChatHistory[];
  onSelectHistory: (id: string) => void;
  onNewChat: () => void;
}

export default function Sidebar({ isOpen, onClose, histories, onSelectHistory, onNewChat }: Props) {
  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}

      <aside className={`sidebar ${isOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div style={{ padding: '16px 16px 8px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              대화 기록
            </span>
            <button onClick={onClose} style={{
              border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)',
              padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center',
              transition: 'color 0.12s',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
            >
              <X size={15} />
            </button>
          </div>

          {/* New chat */}
          <button onClick={onNewChat} className="btn-ghost" style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
            fontWeight: 500, marginBottom: 12, color: 'var(--blue)',
            borderColor: 'var(--blue-tint)', background: 'var(--blue-tint)',
          }}>
            <Plus size={14} />
            새 대화 시작
          </button>
        </div>

        {/* List */}
        <div style={{ padding: '0 8px 16px' }}>
          {histories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <MessageSquare size={28} color="var(--border-md)" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>아직 대화 기록이 없어요</p>
            </div>
          ) : histories.map(h => (
            <button key={h.id} onClick={() => onSelectHistory(h.id)}
              style={{
                width: '100%', textAlign: 'left', border: 'none', background: 'none',
                cursor: 'pointer', padding: '8px 10px', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 8,
                transition: 'background 0.12s', fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <Clock size={12} color="var(--text-3)" style={{ marginTop: 3, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {h.title}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                  {h.lastMessage}
                </p>
              </div>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
