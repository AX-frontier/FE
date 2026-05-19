import type { AgentType } from '@/types/chat';

export const agentConfig: Record<AgentType, { label: string; abbr: string; badgeClass: string; avatarClass: string; icon: string }> = {
  main:     { label: '한성 AI',              abbr: 'HSU',  badgeClass: 'badge-main',     avatarClass: 'avatar-main',     icon: '🎓' },
  library:  { label: '학술정보관 에이전트',   abbr: '학술', badgeClass: 'badge-library',  avatarClass: 'avatar-library',  icon: '📚' },
  document: { label: '전자결재 기안 에이전트', abbr: '기안', badgeClass: 'badge-document', avatarClass: 'avatar-document', icon: '📋' },
};

interface Props { type: AgentType; size?: 'sm' | 'md'; }

export default function AgentBadge({ type, size = 'md' }: Props) {
  const cfg = agentConfig[type];

  if (size === 'sm') {
    return (
      <span className={`badge-pill ${cfg.badgeClass}`}>
        {cfg.label}
      </span>
    );
  }

  return (
    <div className={`avatar-circle ${cfg.avatarClass}`} title={cfg.label}>
      {cfg.abbr}
    </div>
  );
}
