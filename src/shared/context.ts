import type { CaptureContext } from './types';

const normalizeInline = (value: string) => value.normalize('NFKC').replace(/\s+/gu, ' ').trim();

function clampCodePoints(value: string, max: number): string {
  const points = [...value];
  return points.length > max ? points.slice(0, max).join('') : value;
}

export function sentenceAround(text: string, selectionStart: number, selectionEnd: number, max = 1000): string {
  const safeStart = Math.max(0, Math.min(selectionStart, text.length));
  const safeEnd = Math.max(safeStart, Math.min(selectionEnd, text.length));
  const terminators = /[.!?。！？\n\r]/u;
  let start = safeStart;
  let end = safeEnd;
  while (start > 0 && !terminators.test(text[start - 1] ?? '')) start -= 1;
  while (end < text.length && !terminators.test(text[end] ?? '')) end += 1;
  if (end < text.length && text[end] !== '\n' && text[end] !== '\r') end += 1;
  let result = normalizeInline(text.slice(start, end));
  if (!result) result = normalizeInline(text.slice(safeStart, safeEnd));
  return clampCodePoints(result, max);
}

export function selectionContext(documentRef: Document = document): CaptureContext | null {
  const selection = documentRef.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const selectedText = clampCodePoints(normalizeInline(selection.toString()), 500);
  if (!selectedText) return null;
  const range = selection.getRangeAt(0);
  let element = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer as Element
    : range.commonAncestorContainer.parentElement;
  while (element?.parentElement && !/^(P|LI|BLOCKQUOTE|TD|TH|ARTICLE|SECTION|DIV)$/u.test(element.tagName)) {
    element = element.parentElement;
  }
  const container = element ?? documentRef.body;
  let raw = container?.textContent ?? selectedText;
  let start = raw.indexOf(selection.toString());
  try {
    if (container) {
      const prefix = documentRef.createRange();
      prefix.selectNodeContents(container);
      prefix.setEnd(range.startContainer, range.startOffset);
      start = prefix.toString().length;
    }
  } catch {
    // Cross-boundary selections can make prefix ranges invalid; text lookup remains a safe fallback.
  }
  if (start < 0) start = 0;
  const sentenceText = sentenceAround(raw, start, start + selection.toString().length, 4000);
  const language = documentRef.documentElement.lang.trim();
  const context: CaptureContext = {
    selectedText,
    sentenceText: sentenceText || null,
    paragraphText: null,
    pageTitle: clampCodePoints(normalizeInline(documentRef.title), 500) || null,
    pageUrl: /^https?:$/u.test(documentRef.location.protocol) ? documentRef.location.href : null,
    capturedAt: new Date().toISOString()
  };
  if (language) context.documentLanguageHint = language;
  return context;
}

export function fallbackContext(selectedText: string, tab?: chrome.tabs.Tab): CaptureContext {
  let pageUrl: string | null = null;
  try {
    if (tab?.url && /^https?:$/u.test(new URL(tab.url).protocol)) pageUrl = new URL(tab.url).href;
  } catch {
    pageUrl = null;
  }
  return {
    selectedText: clampCodePoints(normalizeInline(selectedText), 500),
    sentenceText: null,
    paragraphText: null,
    pageTitle: tab?.title ? clampCodePoints(normalizeInline(tab.title), 500) : null,
    pageUrl,
    capturedAt: new Date().toISOString()
  };
}
