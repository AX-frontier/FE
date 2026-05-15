import { useState } from 'react';
import { Bell, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  showSearch?: boolean;
  searchQuery?: string;
  onSearchChange?: (v: string) => void;
  onSearchSubmit?: (q: string) => void;
}

export default function Header({ showSearch = true, searchQuery = '', onSearchChange, onSearchSubmit }: HeaderProps) {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localQuery.trim()) {
      onSearchSubmit?.(localQuery.trim());
      navigate('/chat', { state: { query: localQuery.trim(), newConversation: true } });
    }
  };

  return (
    <header className="header-nav fixed top-0 left-0 right-0 z-50 h-16">
      <div className="flex items-center justify-between h-full px-6 max-w-screen-2xl mx-auto">
        {/* Logo */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 flex-shrink-0"
        >
          <div className="flex items-center">
            <span className="font-black text-2xl tracking-tight" style={{ color: 'var(--hsu-blue)' }}>
              HSU
            </span>
            <div className="ml-2 border-l pl-2" style={{ borderColor: 'var(--hsu-border)' }}>
              <div className="text-xs font-bold leading-tight" style={{ color: 'var(--hsu-dark-blue)' }}>한성대학교</div>
              <div className="text-xs leading-tight" style={{ color: 'var(--hsu-gray)', fontSize: '9px' }}>HANSUNG UNIVERSITY</div>
            </div>
          </div>
        </button>

        {/* Search bar in header (chat page) */}
        {showSearch && onSearchChange && (
          <form onSubmit={handleSubmit} className="flex-1 max-w-2xl mx-8">
            <div className="search-bar flex items-center px-4 py-2">
              <svg className="w-4 h-4 mr-2 flex-shrink-0" style={{ color: 'var(--hsu-sky-blue)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                value={localQuery || searchQuery}
                onChange={(e) => {
                  setLocalQuery(e.target.value);
                  onSearchChange(e.target.value);
                }}
                placeholder="궁금한 정보를 질문해 보세요"
                className="flex-1 border-none outline-none text-sm bg-transparent"
                style={{ color: 'var(--hsu-text-primary)' }}
              />
              <button
                type="submit"
                className="ml-2 px-4 py-1.5 rounded-full text-xs font-semibold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, var(--hsu-blue), var(--hsu-sky-blue))' }}
              >
                검색
              </button>
            </div>
          </form>
        )}

        {/* Right actions */}
        <div className="flex items-center gap-3">
          <button className="relative p-2 rounded-full hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" style={{ color: 'var(--hsu-gray)' }} />
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:opacity-90"
            style={{ background: 'var(--hsu-blue)', color: 'white' }}>
            <User className="w-4 h-4" />
            <span>로그인</span>
          </button>
        </div>
      </div>
    </header>
  );
}
