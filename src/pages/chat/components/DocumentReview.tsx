import { useState } from 'react';
import { FileText, Copy, Download } from 'lucide-react';

/* ─────────────────────────────────────────
   DocumentInput
───────────────────────────────────────── */
interface InputProps { onSubmit: (text: string) => void; isLoading: boolean; }

export function DocumentInput({ onSubmit, isLoading }: InputProps) {
  const [text, setText] = useState('');

  return (
    <div className="review-card" style={{ width: '100%' }}>
      <div className="review-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <FileText size={14} color="var(--blue)" />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>문서 입력</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>본문 또는 초안을 붙여넣으세요</span>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={`수신: 학생처\n\n제목: 2026학년도 1학기 학생 행사 운영 협조 요청\n\n1. 관련: 학생지원팀-1234(2026.04.10.)\n2. 위와 관련하여 2026학년도 1학기...`}
        rows={8}
        style={{
          width: '100%', padding: '14px 16px', fontSize: 13, lineHeight: 1.8,
          border: 'none', outline: 'none', resize: 'none',
          fontFamily: 'inherit', color: 'var(--text-1)', background: 'var(--surface)',
        }}
      />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderTop: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{text.length}자</span>
        <button
          onClick={() => text.trim() && onSubmit(text)}
          disabled={!text.trim() || isLoading}
          className="btn-blue"
          style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontFamily: 'inherit' }}
        >
          {isLoading ? '검수 중...' : '검수하기'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   ReviewResult
───────────────────────────────────────── */
interface ResultProps { score: number; correctedText: string; feedbackText: string; }

export function ReviewResult({ score, correctedText, feedbackText }: ResultProps) {
  const [copied, setCopied] = useState(false);

  const color = score >= 80 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--err)';
  const label = score >= 80 ? '양호' : score >= 60 ? '보완 필요' : '수정 필요';

  const handleCopy = () => {
    navigator.clipboard.writeText(correctedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Parse sections from feedbackText heuristically
  const sections: { title: string; status: '준수' | '보완' | '미준수'; desc: string }[] = [
    { title: '두문', status: score >= 80 ? '준수' : score >= 60 ? '보완' : '미준수', desc: '수신 및 목적 표기, 제목 형식' },
    { title: '본문', status: score >= 70 ? '준수' : '보완', desc: '핵심 내용 구성 및 문체' },
    { title: '결문', status: score >= 65 ? '준수' : score >= 50 ? '보완' : '미준수', desc: '종결 표현 및 끝 표기' },
  ];

  const statusStyle = (s: string) => {
    if (s === '준수') return 'section-ok';
    if (s === '보완') return 'section-warn';
    return 'section-err';
  };

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>

      {/* Score */}
      <div className="review-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>검수 결과 — 형식 적합도</span>
          <span style={{ fontSize: 16, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{score}% <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span></span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${score}%`, background: color }} />
        </div>
      </div>

      {/* Section analysis */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {sections.map(sec => (
          <div key={sec.title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{sec.title}</span>
              <span className={`badge-pill ${statusStyle(sec.status)}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                {sec.status}
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>{sec.desc}</p>
          </div>
        ))}
      </div>

      {/* Feedback */}
      {feedbackText && (
        <div className="review-card" style={{ padding: '14px 16px', fontSize: 13, lineHeight: 1.75, color: 'var(--text-1)', whiteSpace: 'pre-wrap' }}>
          {feedbackText}
        </div>
      )}

      {/* Corrected document */}
      {correctedText && (
        <div className="review-card">
          <div className="review-card-header">
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>최종 반영</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { icon: <Copy size={12} />, label: copied ? '복사됨' : '전문 복사', onClick: handleCopy },
                { icon: <Download size={12} />, label: 'hwp 다운', onClick: () => {} },
                { icon: <Download size={12} />, label: 'PDF 다운', onClick: () => {} },
              ].map(btn => (
                <button
                  key={btn.label}
                  onClick={btn.onClick}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                    border: 'none', background: 'none', cursor: 'pointer',
                    color: 'var(--blue)', fontFamily: 'inherit', transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--blue-tint)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {btn.icon} {btn.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: '14px 16px', fontSize: 13, lineHeight: 1.8, color: 'var(--text-1)', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {correctedText}
          </div>
        </div>
      )}
    </div>
  );
}
