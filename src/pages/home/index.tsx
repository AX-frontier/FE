import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, ChevronLeft, ChevronRight, X,
  Mail, Globe, BookOpen, Briefcase, FileCheck, Megaphone,
  MonitorPlay, GraduationCap, Gift, Building2, CalendarDays, FlaskConical,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';

function DotsGrid({ size = 18 }: { size?: number }) {
  const r = size * 0.09;
  const step = size / 3;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="currentColor">
      {[0,1,2].flatMap(row =>
        [0,1,2].map(col => (
          <circle
            key={`${row}-${col}`}
            cx={step * col + step / 2}
            cy={step * row + step / 2}
            r={r}
          />
        ))
      )}
    </svg>
  );
}

const MENUS: { id: number; Icon: LucideIcon; label: string; url: string }[] = [
  { id: 1,  Icon: Mail,          label: '한성 웹메일',    url: 'https://mail.hansung.ac.kr' },
  { id: 2,  Icon: Globe,         label: '인터넷 전자조달', url: '#' },
  { id: 3,  Icon: BookOpen,      label: '학술정보관',      url: 'https://library.hansung.ac.kr' },
  { id: 4,  Icon: Briefcase,     label: '일자리플러스센터', url: '#' },
  { id: 5,  Icon: FileCheck,     label: '제증명발급',      url: '#' },
  { id: 6,  Icon: Megaphone,     label: '공지사항',        url: '#' },
  { id: 7,  Icon: MonitorPlay,   label: 'eclass',         url: 'https://eclass.hansung.ac.kr' },
  { id: 8,  Icon: GraduationCap, label: '수강신청',        url: '#' },
  { id: 9,  Icon: Gift,          label: '장학금 안내',     url: '#' },
  { id: 10, Icon: Building2,     label: '시설 예약',       url: '#' },
  { id: 11, Icon: CalendarDays,  label: '학사일정',        url: '#' },
  { id: 12, Icon: FlaskConical,  label: '연구정보',        url: '#' },
];

const NEWS = [
  {
    cat: '공지사항',
    title: '2026학년도 하계 계절학기 운영 계획 안내',
    content: '2026학년도 하계 계절학기 수강신청 및 운영 일정을 안내드립니다. 수강 가능 학점 및 수강료 등 세부 사항을 반드시 확인하시기 바랍니다.',
    date: '2026.04.12',
    color: '#003DA5',
  },
  {
    cat: '학사',
    title: '제35회 학위수여식 개최 안내',
    content: '2026년 2월 제35회 학위수여식이 창의인재관 대강당에서 개최되었습니다. 졸업생 여러분의 앞날을 진심으로 축하드립니다.',
    date: '2026.04.08',
    color: '#0B6E4F',
  },
  {
    cat: '취업',
    title: '2026 상반기 채용박람회 참가기업 안내',
    content: '2026년 상반기 한성대학교 채용박람회 참가기업을 안내드립니다. 다양한 분야의 우수 기업이 참여하오니 많은 관심 바랍니다.',
    date: '2026.04.05',
    color: '#6B3A0F',
  },
  {
    cat: '장학',
    title: '2026학년도 1학기 교내 장학금 신청 안내',
    content: '2026학년도 1학기 교내 장학금 신청을 받고 있습니다. 장학 종류별 신청 자격 및 제출 서류를 꼼꼼히 확인하신 후 기간 내 신청하시기 바랍니다.',
    date: '2026.04.01',
    color: '#003DA5',
  },
];

const PER_PAGE = 6;
const PAGES = Math.ceil(MENUS.length / PER_PAGE);

export default function HomePage() {
  const navigate = useNavigate();
  const [q, setQ]             = useState('');
  const [page, setPage]       = useState(0);
  const [showGrid, setGrid]   = useState(false);
  const [newsIdx, setNewsIdx] = useState(0);
  const inputRef              = useRef<HTMLInputElement>(null);

  const go = (text?: string) => {
    const s = (text ?? q).trim();
    if (s) navigate('/chat', { state: { query: s } });
  };

  // Auto-advance news slideshow
  useEffect(() => {
    if (showGrid) return;
    const t = setInterval(() => {
      setNewsIdx(i => (i + 1) % NEWS.length);
    }, 5000);
    return () => clearInterval(t);
  }, [showGrid]);

  const slice = MENUS.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const news  = NEWS[newsIdx];

  return (
    <div style={{ height: '100vh', overflow: 'hidden', position: 'relative', background: '#000' }}>

      {/* ── Video background ── */}
      <video
        autoPlay muted loop playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
      >
        <source src="/hansung_main.mp4" type="video/mp4" />
      </video>

      {/* ── Dark overlay ── */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,12,40,0.62)', zIndex: 1 }} />

      {/* ── Floating legacy homepage button ── */}
      <a
        href="https://www.hansung.ac.kr"
        target="_blank"
        rel="noopener noreferrer"
        className="floating-legacy-btn"
      >
        <ExternalLink size={14} />
        기존 홈페이지
      </a>

      {/* ── Header ── */}
      <header className="site-header" style={{ zIndex: 100 }}>
        <div style={{
          width: '100%', padding: '0 32px', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span className="header-hsu" style={{ fontWeight: 900, fontSize: 42, letterSpacing: '-0.05em' }}>HSU</span>
            <div className="header-divider" style={{ paddingLeft: 16 }}>
              <div className="header-name" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>한성대학교</div>
              <div className="header-en" style={{ fontSize: 14, letterSpacing: '0.06em', lineHeight: 1.3 }}>HANSUNG UNIVERSITY</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="header-login"
              style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', padding: '7px 14px', borderRadius: 6, fontFamily: 'inherit', fontWeight: 500 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >로그인</button>
            <button className="btn-blue" style={{ fontSize: 14, padding: '7px 16px', borderRadius: 6, fontFamily: 'inherit' }}>
              발전기금
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content (centered column) ── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        paddingTop: 100,
      }}>

        {/* Search bar */}
        <div style={{ width: '100%', maxWidth: 680, padding: '0 16px' }}>
          <div className="search-wrap">
            <button
              onClick={() => setGrid(v => !v)}
              title={showGrid ? '닫기' : '빠른 메뉴'}
              style={{
                padding: '0 16px', height: 62, border: 'none', background: 'none', cursor: 'pointer',
                color: showGrid ? 'var(--blue)' : 'var(--text-3)', display: 'flex', alignItems: 'center',
                flexShrink: 0, transition: 'color 0.12s',
              }}
            >
              {showGrid ? <X size={18} /> : <DotsGrid size={18} />}
            </button>
            <div style={{ width: 1, height: 22, background: 'var(--border)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && go()}
              placeholder="궁금한 정보를 질문해 보세요"
              style={{
                flex: 1, height: 62, border: 'none', outline: 'none', background: 'none',
                padding: '0 16px', fontSize: 16, color: 'var(--text-1)', fontFamily: 'inherit',
              }}
            />
            <button
              onClick={() => go()}
              className="btn-blue"
              style={{ margin: 8, height: 46, padding: '0 20px', borderRadius: 9999, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, fontFamily: 'inherit' }}
            >
              <Search size={14} />
              검색
            </button>
          </div>
        </div>

        {/* Below search: news slideshow OR menu grid */}
        <div style={{ width: '100%', maxWidth: 680, padding: '0 16px', marginTop: 28 }}>

          {showGrid ? (
            /* ── Menu grid (glassmorphism) ── */
            <div
              className="anim-fade-up"
              style={{
                background: 'rgba(255,255,255,0.10)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 16,
                padding: '20px 16px 16px',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 4, marginBottom: 14 }}>
                {slice.map(item => (
                  <a key={item.id} href={item.url} style={{ textDecoration: 'none' }}>
                    <div
                      className="qmenu-card"
                      style={{ borderRadius: 10, padding: '8px 4px' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{
                        width: 44, height: 44, borderRadius: 10,
                        background: 'rgba(255,255,255,0.14)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <item.Icon size={22} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
                      </div>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.82)', textAlign: 'center', lineHeight: 1.3 }}>
                        {item.label}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
              {/* Pagination */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: 4, display: 'flex', alignItems: 'center', opacity: page === 0 ? 0.3 : 1 }}>
                  <ChevronLeft size={15} />
                </button>
                <div style={{ display: 'flex', gap: 6 }}>
                  {Array.from({ length: PAGES }).map((_, i) => (
                    <button key={i} onClick={() => setPage(i)}
                      style={{ border: 'none', cursor: 'pointer', borderRadius: 99, transition: 'all 0.15s', width: page === i ? 20 : 6, height: 6, background: page === i ? '#fff' : 'rgba(255,255,255,0.35)', padding: 0 }} />
                  ))}
                </div>
                <button onClick={() => setPage(p => Math.min(PAGES - 1, p + 1))} disabled={page === PAGES - 1}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: 4, display: 'flex', alignItems: 'center', opacity: page === PAGES - 1 ? 0.3 : 1 }}>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

          ) : (
            /* ── 한성소식 slideshow ── */
            <div
              key={newsIdx}
              className="anim-news"
              style={{ display: 'flex', gap: 20, alignItems: 'stretch', cursor: 'pointer' }}
              onClick={() => setNewsIdx(i => (i + 1) % NEWS.length)}
            >
              {/* Left: image frame */}
              <div style={{
                width: 220, flexShrink: 0,
                borderRadius: 14,
                background: `linear-gradient(140deg, ${news.color}cc 0%, ${news.color}55 100%)`,
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.18)',
                position: 'relative',
                overflow: 'hidden',
                minHeight: 140,
              }}>
                {/* Decorative grid lines */}
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }} />
                {/* Category badge */}
                <div style={{
                  position: 'absolute', top: 12, left: 12,
                  fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)',
                  background: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.28)',
                  borderRadius: 4, padding: '2px 8px',
                  letterSpacing: '0.04em',
                }}>
                  {news.cat}
                </div>
                {/* Date */}
                <div style={{
                  position: 'absolute', bottom: 12, left: 12,
                  fontSize: 12, color: 'rgba(255,255,255,0.55)',
                }}>
                  {news.date}
                </div>
                {/* Corner accent */}
                <div style={{
                  position: 'absolute', bottom: -20, right: -20,
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.08)',
                }} />
              </div>

              {/* Right: text */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.55)',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  한성소식
                </div>
                <h3 style={{
                  fontSize: 19, fontWeight: 700, color: '#fff', lineHeight: 1.45,
                  letterSpacing: '-0.02em',
                }}>
                  {news.title}
                </h3>
                <p style={{
                  fontSize: 14, color: 'rgba(255,255,255,0.62)', lineHeight: 1.7,
                }}>
                  {news.content}
                </p>

                {/* Dot indicators */}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {NEWS.map((_, i) => (
                    <button
                      key={i}
                      onClick={e => { e.stopPropagation(); setNewsIdx(i); }}
                      style={{
                        border: 'none', cursor: 'pointer', borderRadius: 99, transition: 'all 0.2s',
                        width: newsIdx === i ? 18 : 6, height: 6, padding: 0,
                        background: newsIdx === i ? '#fff' : 'rgba(255,255,255,0.35)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
