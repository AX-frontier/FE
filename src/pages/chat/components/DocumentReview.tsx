import { useState, type MouseEvent } from 'react';
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeClipboardDocument(doc: Document): void {
  doc
    .querySelectorAll('script, iframe, object, embed, svg, base, meta, link, style, form, input, button, xml, template')
    .forEach((node) => node.remove());
  const comments = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  const commentsToRemove: Node[] = [];
  let comment = comments.nextNode();
  while (comment) {
    commentsToRemove.push(comment);
    comment = comments.nextNode();
  }
  commentsToRemove.forEach((node) => node.parentNode?.removeChild(node));
  doc.querySelectorAll<HTMLElement>('*').forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    if (tagName.includes(':')) {
      element.remove();
      return;
    }
    const style = element.getAttribute('style')?.toLowerCase() ?? '';
    if (element.hidden || style.includes('display:none') || style.includes('display: none') || style.includes('mso-hide:all')) {
      element.remove();
      return;
    }
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

function preserveLeadingItemSpaces(doc: Document): void {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent ?? '';
    const replaced = text.replace(
      /^([ \u00a0]{2,})(?=(?:\d+\.|[가-힣]\.|\d+\)|[가-힣]\)|\(\d+\)|\([가-힣]\)|[①-⑳]|[㉮-㉻]))/,
      (spaces) => '\u00a0'.repeat(spaces.length),
    );
    if (replaced !== text) {
      node.textContent = replaced;
    }
    node = walker.nextNode();
  }
}

function sanitizeHtmlForClipboard(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeClipboardDocument(doc);
  preserveLeadingItemSpaces(doc);
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${doc.body.innerHTML}</body></html>`;
}

function sanitizeHtmlForPreview(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeClipboardDocument(doc);
  preserveLeadingItemSpaces(doc);
  return doc.body.innerHTML;
}

type FindingItem = DocumentReviewApiResponse['findings'][number];
type CheckItem = DocumentReviewApiResponse['checkRequiredItems'][number];
type TableCheckItem = DocumentReviewApiResponse['tableChecks'][number];

interface ReviewAnnotation {
  id: string;
  kind: 'fix' | 'check' | 'table';
  title: string;
  message: string;
  reason: string;
  ruleCode?: string;
  originalText?: string | null;
  suggestedText?: string | null;
  candidates: string[];
}

interface FloatingTooltip {
  text: string;
  x: number;
  y: number;
  placement: 'above' | 'below';
}

const REVIEW_TOOLTIP_MAX_WIDTH = 380;
const REVIEW_TOOLTIP_VIEWPORT_MARGIN = 16;

function plainTextToHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => `<p>${escapeHtml(line || ' ')}</p>`)
    .join('');
}

function amountCandidatesFromText(value: string): string[] {
  const withUnit = value.match(/\d[\d,]*\s*원/g) ?? [];
  const withoutUnit = withUnit.map((amount) => amount.replace(/\s*원$/, ''));
  return Array.from(new Set([...withUnit, ...withoutUnit]));
}

function buildReviewAnnotations(
  findings: FindingItem[],
  checks: CheckItem[],
  tableChecks: TableCheckItem[],
): ReviewAnnotation[] {
  const fixAnnotations = findings.map((finding, index) => ({
    id: `fix-${index + 1}`,
    kind: 'fix' as const,
    title: finding.category,
    message: finding.suggestedText ? `${finding.originalText} → ${finding.suggestedText}` : finding.originalText,
    reason: finding.reason,
    ruleCode: finding.ruleCode,
    originalText: finding.originalText,
    suggestedText: finding.suggestedText,
    candidates: [finding.originalText, finding.suggestedText ?? ''].filter(Boolean),
  }));

  const checkAnnotations = checks.map((item, index) => ({
    id: `check-${index + 1}`,
    kind: 'check' as const,
    title: item.category,
    message: item.message,
    reason: item.message,
    originalText: item.originalText ?? null,
    suggestedText: null,
    candidates: [item.originalText ?? '', ...amountCandidatesFromText(item.message)].filter(Boolean),
  }));

  const tableAnnotations = tableChecks.map((item, index) => ({
    id: `table-${index + 1}`,
    kind: 'table' as const,
    title: `표 ${item.tableIndex || '-'} · ${item.tableTitle}`,
    message: item.message,
    reason: item.suggestion,
    originalText: null,
    suggestedText: null,
    candidates: amountCandidatesFromText(`${item.message} ${item.suggestion}`),
  }));

  return [...fixAnnotations, ...checkAnnotations, ...tableAnnotations];
}

function findExactTableCell(doc: Document, candidate: string, normalizedCandidate: string): HTMLElement | null {
  const trimmedCandidate = candidate.trim();
  const cells = Array.from(doc.querySelectorAll<HTMLElement>('th,td'));
  return cells.find((cell) => {
    const label = (cell.textContent ?? '').replace(/\s+/g, ' ').trim();
    return label === trimmedCandidate || label === normalizedCandidate;
  }) ?? null;
}

function markFirstTextMatch(doc: Document, root: HTMLElement, candidate: string, annotation: ReviewAnnotation): boolean {
  const normalizedCandidate = candidate.replace(/\s+/g, ' ').trim();
  if (normalizedCandidate.length === 0) return false;
  if (normalizedCandidate.length < 2 && annotation.kind !== 'fix') return false;

  const matchRoot = annotation.ruleCode === 'BUDGET_TABLE_HEADER'
    ? findExactTableCell(doc, candidate, normalizedCandidate) ?? root
    : root;
  const walker = doc.createTreeWalker(matchRoot, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent ?? '';
    const compactText = text.replace(/\s+/g, ' ');
    const compactIndex = compactText.indexOf(normalizedCandidate);
    const directIndex = text.indexOf(candidate);
    const index = directIndex >= 0 ? directIndex : compactIndex >= 0 ? text.indexOf(normalizedCandidate[0]) : -1;
    if (index >= 0) {
      const matchLength = directIndex >= 0 ? candidate.length : normalizedCandidate.length;
      const before = text.slice(0, index);
      const matched = text.slice(index, index + matchLength);
      const after = text.slice(index + matchLength);
      const mark = doc.createElement('mark');
      mark.className = `review-issue-mark review-issue-${annotation.kind}`;
      mark.dataset.issueId = annotation.id;
      mark.dataset.tooltip = annotation.reason;
      mark.textContent = matched;
      const fragment = doc.createDocumentFragment();
      if (before) fragment.appendChild(doc.createTextNode(before));
      fragment.appendChild(mark);
      if (after) fragment.appendChild(doc.createTextNode(after));
      node.parentNode?.replaceChild(fragment, node);
      return true;
    }
    node = walker.nextNode();
  }
  return false;
}

function applyReviewHighlights(html: string, annotations: ReviewAnnotation[], mode: 'original' | 'corrected'): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeClipboardDocument(doc);
  annotations.forEach((annotation) => {
    const candidates = mode === 'corrected' && annotation.suggestedText
      ? [annotation.suggestedText, ...annotation.candidates]
      : annotation.candidates;
    for (const candidate of candidates) {
      const marked = markFirstTextMatch(doc, doc.body, candidate, annotation);
      if (marked && annotation.kind === 'fix') break;
    }
  });
  return doc.body.innerHTML;
}

function scrollToIssue(issueId: string): void {
  document
    .querySelector(`[data-issue-id="${CSS.escape(issueId)}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function DocumentInput({ onSubmit, isLoading, initialText }: InputProps) {
  const [textLength, setTextLength] = useState(0);
  const [rawClipboardHtml, setRawClipboardHtml] = useState<string | null>(null);
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
    },
    editorProps: {
      handlePaste: (_view, event) => {
        const html = event.clipboardData?.getData('text/html') ?? '';
        setRawClipboardHtml(html ? sanitizeHtmlForPreview(html) : null);
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

  return (
    <div className="review-card document-input-card" style={{ width: '100%' }}>
      <div className="review-card-header document-input-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <FileText size={18} color="var(--agent-document)" />
          <div>
            <span style={{ display: 'block', fontSize: 18, fontWeight: 850, color: 'var(--text-1)', letterSpacing: '-0.04em' }}>문서 입력</span>
            <span style={{ display: 'block', marginTop: 2, fontSize: 14, color: 'var(--text-3)' }}>문서의 본문 또는 초안을 붙여넣으세요.</span>
          </div>
        </div>
      </div>
      <div
        className="document-editor-surface"
        style={{
          minHeight: 300,
          padding: '28px 32px',
          fontSize: 16,
          lineHeight: 1.8,
          color: 'var(--text-1)',
          overflowX: 'auto',
        }}
      >
        <EditorContent editor={editor} />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderTop: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 14, color: 'var(--text-3)' }}>
          {textLength}자
          {rawClipboardHtml ? ' · 원본 서식 보존' : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={handleSubmit}
            disabled={!editor || textLength === 0 || isLoading}
            className="btn-blue"
            style={{ padding: '9px 18px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
          >
            {isLoading ? '검수 중...' : '검수하기'}
          </button>
        </div>
      </div>
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
  findings?: DocumentReviewApiResponse['findings'];
  checkRequiredItems?: DocumentReviewApiResponse['checkRequiredItems'];
  formatNoticeItems?: DocumentReviewApiResponse['formatNoticeItems'];
  stripTablesOnCopy?: boolean;
}

export function ReviewResult({
  score,
  originalText,
  originalHtml,
  correctedText,
  correctedHtml,
  copyNotice,
  findings = [],
  checkRequiredItems = [],
  tableChecks = [],
  formatNoticeItems = [],
}: ResultProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<FloatingTooltip | null>(null);

  const color = score >= 80 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--err)';
  const label = score >= 80 ? '양호' : score >= 60 ? '보완 필요' : '수정 필요';
  const annotations = buildReviewAnnotations(findings, checkRequiredItems, tableChecks);
  const confirmationAnnotations = annotations.filter((annotation) => annotation.kind !== 'fix');
  const originalPreviewHtml = applyReviewHighlights(
    originalHtml ? sanitizeHtmlForPreview(originalHtml) : plainTextToHtml(originalText ?? ''),
    annotations,
    'original',
  );
  const correctedPreviewHtml = applyReviewHighlights(
    correctedHtml ? sanitizeHtmlForPreview(correctedHtml) : plainTextToHtml(correctedText),
    annotations,
    'corrected',
  );

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

  const copyButtonLabel = copied ? '복사됨' : '본문 복사';

  const handlePreviewTooltip = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>('.review-issue-mark')
      : null;
    const text = target?.dataset.tooltip;
    if (!target || !text) {
      setTooltip(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    const boundary = event.currentTarget.closest<HTMLElement>('.review-preview-grid');
    if (!boundary) {
      setTooltip(null);
      return;
    }
    const boundaryRect = boundary.getBoundingClientRect();
    const tooltipWidth = Math.min(REVIEW_TOOLTIP_MAX_WIDTH, boundaryRect.width - REVIEW_TOOLTIP_VIEWPORT_MARGIN * 2);
    const minX = REVIEW_TOOLTIP_VIEWPORT_MARGIN;
    const maxX = Math.max(minX, boundaryRect.width - tooltipWidth - REVIEW_TOOLTIP_VIEWPORT_MARGIN);
    const x = Math.min(
      Math.max(rect.left - boundaryRect.left, minX),
      maxX,
    );
    const shouldShowAbove = rect.top - boundaryRect.top > 96;
    const y = shouldShowAbove ? rect.top - boundaryRect.top : rect.bottom - boundaryRect.top;
    setTooltip({ text, x, y, placement: shouldShowAbove ? 'above' : 'below' });
  };

  return (
    <div className="anim-fade-up document-review-result" style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>

      {/* Score */}
      <div className="review-card review-summary-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 10 }}>
          <div>
            <span style={{ display: 'block', fontSize: 18, fontWeight: 850, color: 'var(--text-1)', letterSpacing: '-0.04em' }}>문서 검토 결과</span>
            <span className="review-suggestion-count">수정 제안: {findings.length}건</span>
            {checkRequiredItems.length + tableChecks.length > 0 && (
              <span style={{ marginLeft: 8, fontSize: 14, color: 'var(--text-3)' }}>
                직접 확인 필요 {checkRequiredItems.length + tableChecks.length}건
              </span>
            )}
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{score}% <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span></span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${score}%`, background: color }} />
        </div>
      </div>

      {/* Before / after document */}
      {correctedText && (
        <div className="review-card">
          <div className="review-card-header">
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>검토 전후 비교</span>
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
                    padding: '5px 11px', borderRadius: 6, fontSize: 13, fontWeight: 700,
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
            className="review-preview-grid"
            style={{
              position: 'relative',
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
              <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text-2)' }}>
                검토 전
              </div>
              <div
                className="review-document-preview"
                style={{ minHeight: 220, maxHeight: 520, padding: '16px 18px', fontSize: 15, lineHeight: 1.85, color: 'var(--text-1)', overflow: 'auto' }}
                onMouseMove={handlePreviewTooltip}
                onMouseLeave={() => setTooltip(null)}
                dangerouslySetInnerHTML={{ __html: originalPreviewHtml }}
              />
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
              <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text-2)' }}>
                검토 후
              </div>
              <div
                className="review-document-preview"
                style={{ minHeight: 220, maxHeight: 520, padding: '16px 18px', fontSize: 15, lineHeight: 1.85, color: 'var(--text-1)', overflow: 'auto' }}
                onMouseMove={handlePreviewTooltip}
                onMouseLeave={() => setTooltip(null)}
                dangerouslySetInnerHTML={{ __html: correctedPreviewHtml }}
              />
            </div>
            {tooltip && (
              <div
                className={`review-floating-tooltip is-${tooltip.placement}`}
                style={{ left: tooltip.x, top: tooltip.y }}
              >
                {tooltip.text}
              </div>
            )}
          </div>
          {(confirmationAnnotations.length > 0 || formatNoticeItems.length > 0) && (
            <div className="review-annotation-panel">
              {confirmationAnnotations.length > 0 && (
                <>
                  <h4>검토 주석</h4>
                  <div className="review-annotation-list">
                    {confirmationAnnotations.map((item) => (
                      <button key={item.id} type="button" onClick={() => scrollToIssue(item.id)} className={`review-annotation-item review-annotation-${item.kind}`}>
                        <span>확인</span>
                        <strong>{item.title}</strong>
                        <em>{item.message}</em>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {formatNoticeItems.length > 0 && (
                <div className="review-format-note">
                  {formatNoticeItems.map((item, index) => (
                    <p key={`${item.category}-${index}`}>
                      <strong>{item.category}</strong>
                      <span>{item.message}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          {(copyNotice || copyError) && (
            <div style={{ padding: '9px 14px 13px', fontSize: 13, lineHeight: 1.55, color: copyError ? 'var(--err)' : 'var(--text-3)' }}>
              {copyError ?? copyNotice}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
