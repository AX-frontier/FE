import { useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import { FileText, Copy, Download } from 'lucide-react';
import type { JSONContent } from '@tiptap/core';
import type { DocumentReviewApiResponse } from '@/utils/aiService';

/* ─────────────────────────────────────────
   DocumentInput
───────────────────────────────────────── */
export interface DocumentSubmitPayload {
  text: string;
  html: string;
  rawHtml?: string;
  editorJson: JSONContent;
}

interface InputProps {
  onSubmit: (payload: DocumentSubmitPayload) => void;
  isLoading: boolean;
  initialText?: string;
}

interface PasteDiagnostics {
  types: string[];
  htmlLength: number;
  plainLength: number;
  tableCount: number;
  hasColgroup: boolean;
  hasRowspan: boolean;
  hasColspan: boolean;
  hasWidth: boolean;
  hasHeight: boolean;
  hasInlineStyle: boolean;
  hasBorder: boolean;
}

function tablePlaceholder(index: number): string {
  return `[표 ${index + 1}: 표 내용은 원본 전자결재/HWP 표에서 직접 확인·반영해 주세요.]`;
}

const BLOCK_TEXT_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'section',
  'table',
  'tbody',
  'tfoot',
  'thead',
  'tr',
  'ul',
]);

function extractTextPreservingSpaces(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }
  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'br') {
    return '\n';
  }
  if (tagName === 'td' || tagName === 'th') {
    return Array.from(element.childNodes).map(extractTextPreservingSpaces).join('');
  }

  let text = Array.from(element.childNodes).map(extractTextPreservingSpaces).join('');
  if (tagName === 'tr') {
    text += '\n';
  } else if (BLOCK_TEXT_TAGS.has(tagName) && text && !text.endsWith('\n')) {
    text += '\n';
  }
  return text;
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return extractTextPreservingSpaces(doc.body);
}

function countTables(html: string): number {
  return new DOMParser().parseFromString(html, 'text/html').querySelectorAll('table').length;
}

function inspectClipboardHtml(types: string[], html: string, plain: string): PasteDiagnostics {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table'));
  const cells = Array.from(doc.querySelectorAll('td, th'));
  const rows = Array.from(doc.querySelectorAll('tr'));
  return {
    types,
    htmlLength: html.length,
    plainLength: plain.length,
    tableCount: tables.length,
    hasColgroup: Boolean(doc.querySelector('colgroup, col')),
    hasRowspan: cells.some((cell) => cell.hasAttribute('rowspan')),
    hasColspan: cells.some((cell) => cell.hasAttribute('colspan')),
    hasWidth: [...tables, ...cells].some((element) =>
      element.hasAttribute('width') || /(?:^|;)\s*width\s*:/i.test(element.getAttribute('style') ?? '')
    ),
    hasHeight: [...rows, ...cells].some((element) =>
      element.hasAttribute('height') || /(?:^|;)\s*height\s*:/i.test(element.getAttribute('style') ?? '')
    ),
    hasInlineStyle: [...tables, ...rows, ...cells].some((element) => element.hasAttribute('style')),
    hasBorder: [...tables, ...cells].some((element) =>
      element.hasAttribute('border') || /(?:^|;)\s*border(?:-[\w-]+)?\s*:/i.test(element.getAttribute('style') ?? '')
    ),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function visualizeSpaces(value: string): string {
  return value
    .replace(/ /g, '␠')
    .replace(/\t/g, '⇥')
    .replace(/\u00a0/g, '⍽');
}

function renderMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const rendered: string[] = [];
  let section = '';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('### ')) {
      section = line.slice(4);
      rendered.push(`<h3>${escapeHtml(section)}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      section = line.slice(3);
      rendered.push(`<h2>${escapeHtml(section)}</h2>`);
      continue;
    }
    const findingLine = line.match(/^- (?:\[(HIGH|MEDIUM|LOW)\]\s+)?(.+)$/);
    if (section === '자동 수정 제안' && findingLine && !line.includes('자동 수정 제안 없음')) {
      const detailLines: string[] = [];
      while (lines[index + 1]?.startsWith('  - ')) {
        index += 1;
        const detail = lines[index].replace(/^  - /, '');
        const changeLine = detail.match(/^(원문|수정안):(.*)$/);
        if (changeLine) {
          const value = changeLine[2].startsWith(' ') ? changeLine[2].slice(1) : changeLine[2];
          detailLines.push(
            `<p><strong>${escapeHtml(changeLine[1])}</strong>: <code class="space-visible">${escapeHtml(visualizeSpaces(value))}</code></p>`
          );
        } else {
          detailLines.push(`<p>${escapeHtml(detail)}</p>`);
        }
      }
      rendered.push(
        `<div class="review-finding-card">` +
          `<div class="review-finding-title">${escapeHtml(findingLine[2])}</div>` +
          detailLines.join('') +
        `</div>`
      );
      continue;
    }
    if (line.startsWith('- ') && section === '직접 확인 필요') {
      rendered.push(`<div class="review-check-card">${escapeHtml(line.slice(2))}</div>`);
      continue;
    }
    if (line.startsWith('- ')) {
      rendered.push(`<p class="markdown-list">${escapeHtml(line)}</p>`);
      continue;
    }
    if (!line.trim()) {
      rendered.push('<br />');
      continue;
    }
    rendered.push(`<p>${escapeHtml(line)}</p>`);
  }
  return rendered.join('');
}

function sanitizeClipboardDocument(doc: Document): void {
  doc
    .querySelectorAll('script, iframe, object, embed, svg, base, meta, link, style, form, input, button')
    .forEach((node) => node.remove());
  doc.querySelectorAll<HTMLElement>('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (
        name.startsWith('on') ||
        name === 'srcdoc' ||
        name === 'formaction' ||
        value.startsWith('javascript:') ||
        value.startsWith('data:text/html')
      ) {
        element.removeAttribute(attribute.name);
      }
    });
  });
}

function mergeStyle(element: HTMLElement, declarations: Record<string, string>): void {
  const existing = element.getAttribute('style') ?? '';
  const scratch = document.createElement(element.tagName.toLowerCase());
  scratch.setAttribute('style', existing);
  Object.entries(declarations).forEach(([property, value]) => {
    scratch.style.setProperty(property, value);
  });
  const merged = scratch.getAttribute('style');
  if (merged) {
    element.setAttribute('style', merged);
  }
}

function normalizeHtmlForClipboard(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeClipboardDocument(doc);
  doc.querySelectorAll('table').forEach((table) => {
    if (!table.hasAttribute('border')) table.setAttribute('border', '1');
    if (!table.hasAttribute('cellspacing')) table.setAttribute('cellspacing', '0');
    if (!table.hasAttribute('cellpadding')) table.setAttribute('cellpadding', '4');
    mergeStyle(table, {
      'border-collapse': 'collapse',
    });
  });
  doc.querySelectorAll('th,td').forEach((cell) => {
    cell.removeAttribute('width');
    mergeStyle(cell as HTMLElement, {
      border: '1px solid #000000',
      padding: '4px 8px',
      'vertical-align': 'top',
      ...(!cell.querySelector('br') && cell.textContent?.includes('\n')
        ? { 'white-space': 'pre-wrap' }
        : {}),
    });
  });
  return `<!doctype html><html><head><meta charset="utf-8">${doc.head.innerHTML}</head><body>${doc.body.innerHTML}</body></html>`;
}

function sanitizeHtmlForClipboard(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeClipboardDocument(doc);
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${doc.body.innerHTML}</body></html>`;
}

function stripTablesForBodyCopy(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeClipboardDocument(doc);
  doc.querySelectorAll('table').forEach((table, index) => {
    const placeholder = doc.createElement('p');
    placeholder.textContent = tablePlaceholder(index);
    table.replaceWith(placeholder);
  });
  return doc.body.innerHTML;
}

function sanitizeHtmlForPreview(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeClipboardDocument(doc);
  return doc.body.innerHTML;
}

function buildDocumentPreviewHtml(html: string, stripTables: boolean): string {
  return stripTables ? stripTablesForBodyCopy(html) : sanitizeHtmlForPreview(html);
}

export function DocumentInput({ onSubmit, isLoading, initialText }: InputProps) {
  const showPasteDiagnostics = import.meta.env.DEV;
  const [textLength, setTextLength] = useState(0);
  const [tableCount, setTableCount] = useState(0);
  const [pasteInfo, setPasteInfo] = useState('아직 붙여넣기 없음');
  const [pasteDiagnostics, setPasteDiagnostics] = useState<PasteDiagnostics | null>(null);
  const [rawClipboardHtml, setRawClipboardHtml] = useState<string | null>(null);
  const [rawCopyStatus, setRawCopyStatus] = useState<string | null>(null);
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
        const plain = event.clipboardData?.getData('text/plain') ?? '';
        setRawClipboardHtml(html ? sanitizeHtmlForPreview(html) : null);
        setRawCopyStatus(null);
        if (showPasteDiagnostics) {
          setPasteDiagnostics(inspectClipboardHtml(types, html, plain));
        }
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
    const text = htmlToText(html);
    if (!text.trim()) return;
    onSubmit({
      text,
      html,
      rawHtml: rawClipboardHtml ?? undefined,
      editorJson: editor.getJSON(),
    });
  };

  const handleCopyRawHtml = async () => {
    if (!rawClipboardHtml) return;
    try {
      const plainText = htmlToText(rawClipboardHtml);
      if ('ClipboardItem' in window) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([rawClipboardHtml], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plainText);
      }
      setRawCopyStatus('원본 HTML 복사됨');
    } catch {
      setRawCopyStatus('원본 HTML 복사 실패');
    }
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
          {rawClipboardHtml ? ' · 원본 HTML 보존됨' : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {showPasteDiagnostics && rawClipboardHtml && (
            <button
              type="button"
              onClick={handleCopyRawHtml}
              style={{
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-2)',
                padding: '7px 10px',
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {rawCopyStatus ?? '원본 HTML 복사 테스트'}
            </button>
          )}
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
      {showPasteDiagnostics && pasteDiagnostics && (
        <details
          style={{
            borderTop: '1px solid var(--border)',
            background: 'rgba(246, 248, 252, 0.9)',
          }}
        >
          <summary
            style={{
              cursor: 'pointer',
              padding: '9px 14px',
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--text-2)',
              userSelect: 'none',
            }}
          >
            붙여넣기 진단 보기
          </summary>
          <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 6,
              }}
            >
              {[
                ['HTML', pasteDiagnostics.htmlLength ? `${pasteDiagnostics.htmlLength.toLocaleString()}자` : '없음'],
                ['Plain', `${pasteDiagnostics.plainLength.toLocaleString()}자`],
                ['표', `${pasteDiagnostics.tableCount}개`],
                ['types', pasteDiagnostics.types.join(', ') || '없음'],
                ['colgroup', pasteDiagnostics.hasColgroup ? '있음' : '없음'],
                ['병합', pasteDiagnostics.hasRowspan || pasteDiagnostics.hasColspan ? '있음' : '없음'],
                ['width/height', pasteDiagnostics.hasWidth || pasteDiagnostics.hasHeight ? '있음' : '없음'],
                ['style/border', pasteDiagnostics.hasInlineStyle || pasteDiagnostics.hasBorder ? '있음' : '없음'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 7,
                    padding: '7px 8px',
                    background: 'var(--surface)',
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: 'var(--text-3)' }}>
              민감정보 노출 방지를 위해 원문 HTML은 저장하거나 표시하지 않고, 표 구조 판단에 필요한 요약값만 표시합니다.
            </p>
          </div>
        </details>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   ReviewResult
───────────────────────────────────────── */
interface ResultProps {
  score: number;
  originalText?: string;
  originalHtml?: string | null;
  correctedText: string;
  feedbackText: string;
  correctedHtml?: string | null;
  copyNotice?: string | null;
  tableChecks?: DocumentReviewApiResponse['tableChecks'];
  tableChecksAvailable?: boolean;
  stripTablesOnCopy?: boolean;
}

export function ReviewResult({
  score,
  originalText,
  originalHtml,
  correctedText,
  feedbackText,
  correctedHtml,
  copyNotice,
  tableChecks = [],
  tableChecksAvailable = false,
  stripTablesOnCopy = false,
}: ResultProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const color = score >= 80 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--err)';
  const label = score >= 80 ? '양호' : score >= 60 ? '보완 필요' : '수정 필요';

  const handleCopy = async () => {
    try {
      const copyHtml = correctedHtml ? sanitizeHtmlForClipboard(correctedHtml) : correctedHtml;
      const copyText = copyHtml ? htmlToText(copyHtml) : correctedText;
      let richCopyFallback = false;
      if (correctedHtml && 'ClipboardItem' in window) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([copyHtml || ''], { type: 'text/html' }),
              'text/plain': new Blob([copyText], { type: 'text/plain' }),
            }),
          ]);
        } catch {
          richCopyFallback = true;
          await navigator.clipboard.writeText(copyText);
        }
      } else {
        richCopyFallback = Boolean(correctedHtml);
        await navigator.clipboard.writeText(copyText);
      }
      setCopyError(
        richCopyFallback
          ? '브라우저가 HTML 복사를 허용하지 않아 텍스트만 복사했습니다. 표까지 붙여넣으려면 브라우저 클립보드 권한을 확인해 주세요.'
          : null
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyError('복사 권한이 없거나 브라우저에서 HTML 복사를 지원하지 않습니다. 본문을 직접 선택해 복사해 주세요.');
    }
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
  const copyButtonLabel = copied ? '복사됨' : '본문 복사';

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

      {/* Before / after document */}
      {correctedText && (
        <div className="review-card">
          <div className="review-card-header">
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>검토 전후 비교</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { icon: <Copy size={12} />, label: copyButtonLabel, onClick: handleCopy },
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 38px minmax(0, 1fr)',
              gap: 10,
              padding: 12,
              background: 'linear-gradient(180deg, rgba(246,248,252,0.92), rgba(255,255,255,0.98))',
            }}
          >
            <div
              style={{
                minWidth: 0,
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--surface)',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 800, color: 'var(--text-2)' }}>
                검토 전
              </div>
              {originalHtml ? (
                <div
                  className="review-document-preview"
                  style={{ minHeight: 220, maxHeight: 520, padding: '14px 16px', fontSize: 13, lineHeight: 1.8, color: 'var(--text-1)', overflow: 'auto' }}
                  dangerouslySetInnerHTML={{
                    __html: buildDocumentPreviewHtml(originalHtml, false),
                  }}
                />
              ) : (
                <div style={{ minHeight: 220, maxHeight: 520, padding: '14px 16px', fontSize: 13, lineHeight: 1.8, color: 'var(--text-1)', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                  {originalText}
                </div>
              )}
            </div>
            <div
              aria-hidden="true"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--blue)',
                fontSize: 18,
                fontWeight: 900,
              }}
            >
              →
            </div>
            <div
              style={{
                minWidth: 0,
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--surface)',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 800, color: 'var(--text-2)' }}>
                검토 후
              </div>
              {correctedHtml ? (
                <div
                  className="review-document-preview"
                  style={{ minHeight: 220, maxHeight: 520, padding: '14px 16px', fontSize: 13, lineHeight: 1.8, color: 'var(--text-1)', overflow: 'auto' }}
                  dangerouslySetInnerHTML={{
                    __html: buildDocumentPreviewHtml(correctedHtml, false),
                  }}
                />
              ) : (
                <div style={{ minHeight: 220, maxHeight: 520, padding: '14px 16px', fontSize: 13, lineHeight: 1.8, color: 'var(--text-1)', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                  {correctedText}
                </div>
              )}
            </div>
          </div>
          {(copyNotice || copyError) && (
            <div style={{ padding: '8px 14px 12px', fontSize: 11, lineHeight: 1.5, color: copyError ? 'var(--err)' : 'var(--text-3)' }}>
              {copyError ?? copyNotice}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
