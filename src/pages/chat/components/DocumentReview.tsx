import { useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import { FileText, Copy, Download } from 'lucide-react';
import type { JSONContent } from '@tiptap/core';

/* ─────────────────────────────────────────
   DocumentInput
───────────────────────────────────────── */
export interface DocumentSubmitPayload {
  text: string;
  html: string;
  editorJson: JSONContent;
}

interface InputProps {
  onSubmit: (payload: DocumentSubmitPayload) => void;
  isLoading: boolean;
  initialText?: string;
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.innerText || doc.body.textContent || '';
}

function countTables(html: string): number {
  return new DOMParser().parseFromString(html, 'text/html').querySelectorAll('table').length;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  return lines
    .map((line) => {
      if (line.startsWith('### ')) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
      if (line.startsWith('## ')) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (line.startsWith('- ')) return `<p class="markdown-list">${escapeHtml(line)}</p>`;
      if (!line.trim()) return '<br />';
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join('');
}

export function DocumentInput({ onSubmit, isLoading, initialText }: InputProps) {
  const [textLength, setTextLength] = useState(0);
  const [tableCount, setTableCount] = useState(0);
  const [pasteInfo, setPasteInfo] = useState('아직 붙여넣기 없음');
  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialText ? `<p>${initialText.replace(/\n/g, '<br>')}</p>` : '',
    onUpdate: ({ editor: currentEditor }) => {
      const html = currentEditor.getHTML();
      setTextLength(htmlToText(html).length);
      setTableCount(countTables(html));
    },
    editorProps: {
      handlePaste: (_view, event) => {
        const types = Array.from(event.clipboardData?.types ?? []);
        const html = event.clipboardData?.getData('text/html') ?? '';
        setPasteInfo(
          html.includes('<table')
            ? `HTML 표 감지됨 (${types.join(', ')})`
            : `표 HTML 없음 (${types.join(', ') || 'unknown'})`
        );
        return false;
      },
    },
  });

  const handleSubmit = () => {
    if (!editor) return;
    const html = editor.getHTML();
    const text = htmlToText(html).trim();
    if (!text) return;
    onSubmit({
      text,
      html,
      editorJson: editor.getJSON(),
    });
  };

  return (
    <div className="review-card" style={{ width: '100%' }}>
      <div className="review-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <FileText size={14} color="var(--blue)" />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>문서 입력</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>표 포함 본문을 그대로 붙여넣으세요</span>
      </div>
      <div
        style={{
          minHeight: 220,
          padding: '14px 16px',
          fontSize: 13,
          lineHeight: 1.8,
          color: 'var(--text-1)',
          background: 'var(--surface)',
          overflowX: 'auto',
        }}
      >
        <EditorContent editor={editor} />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderTop: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
          {textLength}자 · 표 {tableCount}개 · {pasteInfo}
        </span>
        <button
          onClick={handleSubmit}
          disabled={!editor || textLength === 0 || isLoading}
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
interface ResultProps {
  score: number;
  correctedText: string;
  feedbackText: string;
  correctedHtml?: string | null;
}

export function ReviewResult({ score, correctedText, feedbackText, correctedHtml }: ResultProps) {
  const [copied, setCopied] = useState(false);

  const color = score >= 80 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--err)';
  const label = score >= 80 ? '양호' : score >= 60 ? '보완 필요' : '수정 필요';

  const handleCopy = async () => {
    if (correctedHtml && 'ClipboardItem' in window) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([correctedHtml], { type: 'text/html' }),
          'text/plain': new Blob([correctedText], { type: 'text/plain' }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(correctedText);
    }
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
        <div
          className="review-card review-markdown"
          style={{ padding: '14px 16px', fontSize: 13, lineHeight: 1.75, color: 'var(--text-1)' }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(feedbackText) }}
        />
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
          {correctedHtml ? (
            <div
              className="review-document-preview"
              style={{ padding: '14px 16px', fontSize: 13, lineHeight: 1.8, color: 'var(--text-1)', overflowX: 'auto' }}
              dangerouslySetInnerHTML={{ __html: correctedHtml }}
            />
          ) : (
            <div style={{ padding: '14px 16px', fontSize: 13, lineHeight: 1.8, color: 'var(--text-1)', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
              {correctedText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
