import { selectionContext } from '../shared/context';
import type {
  CaptureContext,
  CaptureResult,
  ClientError,
  InlinePreviewResult,
  ResponseEnvelope
} from '../shared/types';

const state = globalThis as typeof globalThis & { __gotitContentLoaded?: boolean };

if (!state.__gotitContentLoaded) {
  state.__gotitContentLoaded = true;
  let host: HTMLDivElement | null = null;
  let hideTimer: number | null = null;

  const font = 'system-ui, -apple-system, "Segoe UI", sans-serif';

  function hide(): void {
    if (hideTimer !== null) window.clearTimeout(hideTimer);
    hideTimer = null;
    host?.remove();
    host = null;
  }

  function insideUi(event: Event): boolean {
    return event.target instanceof Node && Boolean(host?.contains(event.target));
  }

  function place(rect: DOMRect, width: number, estimatedHeight: number): { left: number; top: number } {
    const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.left + rect.width / 2 - width / 2));
    const below = rect.bottom + 10;
    const top = below + estimatedHeight < window.innerHeight
      ? below
      : Math.max(8, rect.top - estimatedHeight - 10);
    return { left, top };
  }

  function appendLogo(parent: HTMLElement): void {
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = '✓';
    mark.setAttribute('aria-hidden', 'true');
    const name = document.createElement('strong');
    name.textContent = 'GotIt';
    parent.append(mark, name);
  }

  function sendCapture(context: CaptureContext): void {
    hide();
    void chrome.runtime.sendMessage({ type: 'CONTENT_CAPTURE', context });
  }

  function showAction(rect: DOMRect): void {
    hide();
    host = document.createElement('div');
    host.setAttribute('data-gotit-ui', 'selection-action');
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      button {
        all: initial; box-sizing: border-box; position: fixed; z-index: 2147483647;
        display: flex; align-items: center; gap: 7px; height: 36px; padding: 0 12px;
        border-radius: 18px; background: #5142db; color: #fff; cursor: pointer;
        font: 650 13px/1 ${font}; box-shadow: 0 8px 24px rgba(29, 24, 83, .28);
        user-select: none;
      }
      button:hover { background: #4032c2; transform: translateY(-1px); }
      button:focus-visible { outline: 3px solid #b9b2ff; outline-offset: 2px; }
      .mark { display:grid; place-items:center; width:18px; height:18px; border-radius:5px; background:#fff; color:#5142db; font-size:12px; font-weight:900; }
    `;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', 'Save selection to GotIt');
    appendLogo(button);
    const position = place(rect, 92, 40);
    button.style.left = `${position.left}px`;
    button.style.top = `${position.top}px`;
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const context = selectionContext(document);
      if (context) sendCapture(context);
    });
    root.append(style, button);
    document.documentElement.append(host);
    hideTimer = window.setTimeout(hide, 8000);
  }

  function statusMessage(error: ClientError): string {
    if (error.code === 'AUTHENTICATION_REQUIRED' || error.code === 'UNAUTHORIZED') return 'יש להתחבר ל־GotIt כדי לתרגם.';
    if (error.code === 'OFFLINE' || error.code === 'NETWORK_ERROR') return 'אין כרגע חיבור לשירות התרגום.';
    return 'לא הצלחנו לתרגם כרגע.';
  }

  function reviewActions(context: CaptureContext, signIn = false): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'actions';
    const review = document.createElement('button');
    review.type = 'button';
    review.className = 'primary';
    review.textContent = signIn ? 'פתיחת GotIt והתחברות' : 'בדיקה ושמירה';
    review.addEventListener('click', () => sendCapture(context));
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'secondary';
    dismiss.textContent = 'סגירה';
    dismiss.addEventListener('click', hide);
    actions.append(review, dismiss);
    return actions;
  }

  function showInlinePreview(rect: DOMRect, context: CaptureContext): void {
    hide();
    const currentHost = document.createElement('div');
    host = currentHost;
    currentHost.setAttribute('data-gotit-ui', 'inline-translation');
    const root = currentHost.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .panel {
        all: initial; box-sizing:border-box; position:fixed; z-index:2147483647; width:310px;
        direction:rtl; border:1px solid #dedbea; border-radius:15px; background:#fff; color:#211e34;
        box-shadow:0 18px 48px rgba(24,20,63,.24); padding:14px; font:13px/1.45 ${font};
      }
      * { box-sizing:border-box; }
      .head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:11px; }
      .brand { display:flex; align-items:center; gap:7px; color:#4132c9; font-size:13px; }
      .mark { display:grid; place-items:center; width:22px; height:22px; border-radius:7px; background:#5142db; color:#fff; font-size:14px; font-weight:900; }
      .close { all:initial; cursor:pointer; color:#777386; font:18px/1 ${font}; padding:2px 5px; border-radius:6px; }
      .close:hover { background:#f0eff7; }
      .term { color:#777386; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .translation { margin:4px 0 2px; color:#211b80; font-size:22px; line-height:1.3; font-weight:750; overflow-wrap:anywhere; }
      .meta { color:#8b8798; font-size:10.5px; direction:ltr; text-align:right; }
      .loading { display:flex; align-items:center; gap:9px; color:#686477; padding:8px 0 4px; }
      .spinner { width:17px; height:17px; border:2px solid #dddaf8; border-top-color:#5142db; border-radius:50%; animation:spin .7s linear infinite; }
      @keyframes spin { to { transform:rotate(360deg); } }
      .message { color:#6d687c; padding:5px 0 3px; }
      .provider-warning { color:#7a5d08; background:#fff8dc; border-radius:8px; padding:8px; font-size:11.5px; }
      .saved { color:#167447; background:#e9f8ef; border-radius:8px; padding:10px; font-weight:700; text-align:center; }
      .actions { display:flex; gap:8px; margin-top:12px; }
      .primary, .secondary { all:initial; cursor:pointer; border-radius:9px; padding:8px 11px; font:650 12px/1 ${font}; text-align:center; }
      .primary { background:#5142db; color:#fff; flex:1; }
      .primary:hover { background:#4032c2; }
      .secondary { border:1px solid #dcd9e7; color:#4e4a5f; }
      button:focus-visible { outline:3px solid #b9b2ff; outline-offset:2px; }
    `;
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'GotIt translation');
    const position = place(rect, 310, 205);
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    const head = document.createElement('div');
    head.className = 'head';
    const brand = document.createElement('div');
    brand.className = 'brand';
    appendLogo(brand);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'סגירה');
    close.addEventListener('click', hide);
    head.append(brand, close);
    const term = document.createElement('div');
    term.className = 'term';
    term.dir = 'auto';
    term.textContent = context.selectedText;
    const body = document.createElement('div');
    body.className = 'loading';
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    const loading = document.createElement('span');
    loading.textContent = 'מתרגם לפי ההקשר…';
    body.append(spinner, loading);
    panel.append(head, term, body);
    root.append(style, panel);
    document.documentElement.append(currentHost);

    void chrome.runtime.sendMessage({ type: 'INLINE_PREVIEW', context })
      .then((response: ResponseEnvelope<InlinePreviewResult>) => {
        if (host !== currentHost) return;
        body.replaceChildren();
        body.className = '';
        if (!response.ok) {
          const message = document.createElement('div');
          message.className = 'message';
          message.textContent = statusMessage(response.error);
          body.append(message, reviewActions(context, response.error.code.includes('AUTH')));
          return;
        }
        const { preview, inlineCaptureId } = response.data;
        const candidate = preview.enrichment.candidates[0];
        if (!candidate) {
          const warning = document.createElement('div');
          warning.className = 'provider-warning';
          warning.textContent = preview.enrichment.status === 'not_configured'
            ? preview.translationMethod === 'ai'
              ? 'תרגום AI אינו מוגדר במלואו בשרת. יש לבדוק את הגדרות Claude ב־Render.'
              : 'התרגום האוטומטי עדיין לא הוגדר בשרת. פתח את GotIt להזנה ידנית.'
            : preview.requiresLanguageSelection
              ? 'יש לבחור שפת יעד בהגדרות GotIt.'
              : preview.translationMethod === 'ai'
                ? 'השרת ניסה להפעיל AI אך Claude לא החזיר תרגום תקין.'
                : 'שירות התרגום אינו זמין כרגע.';
          body.append(warning, reviewActions(context));
          return;
        }
        const translated = document.createElement('div');
        translated.className = 'translation';
        translated.dir = 'auto';
        translated.textContent = candidate.text;
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = `${preview.sourceLanguageCode ?? '?'} → ${preview.translationLanguageCode ?? '?'}`;
        const actions = document.createElement('div');
        actions.className = 'actions';
        const quickSave = document.createElement('button');
        quickSave.type = 'button';
        quickSave.className = 'primary';
        quickSave.textContent = 'שמירה מהירה';
        const review = document.createElement('button');
        review.type = 'button';
        review.className = 'secondary';
        review.textContent = 'בדיקה ועריכה';
        review.addEventListener('click', () => sendCapture(context));
        quickSave.addEventListener('click', () => {
          quickSave.setAttribute('disabled', 'true');
          quickSave.textContent = 'שומר…';
          void chrome.runtime.sendMessage({ type: 'INLINE_SAVE', inlineCaptureId })
            .then((saved: ResponseEnvelope<CaptureResult>) => {
              if (host !== currentHost) return;
              if (!saved.ok) {
                if (saved.error.code === 'REVIEW_REQUIRED' || saved.error.code === 'SENSE_SELECTION_REQUIRED') {
                  sendCapture(context);
                  return;
                }
                const warning = document.createElement('div');
                warning.className = 'provider-warning';
                warning.textContent = statusMessage(saved.error);
                body.prepend(warning);
                quickSave.removeAttribute('disabled');
                quickSave.textContent = 'ניסיון שמירה נוסף';
                return;
              }
              body.replaceChildren();
              const confirmation = document.createElement('div');
              confirmation.className = 'saved';
              confirmation.textContent = saved.data.outcome === 'merged'
                ? 'ההקשר נוסף למילה ✓'
                : 'המילה נשמרה ב־GotIt ✓';
              body.append(confirmation);
              hideTimer = window.setTimeout(hide, 1600);
            })
            .catch(() => {
              quickSave.removeAttribute('disabled');
              quickSave.textContent = 'ניסיון שמירה נוסף';
            });
        });
        actions.append(quickSave, review);
        body.append(translated, meta, actions);
      })
      .catch(() => {
        if (host !== currentHost) return;
        body.className = 'message';
        body.textContent = 'לא הצלחנו להגיע לשירות התרגום.';
      });
    hideTimer = window.setTimeout(hide, 20000);
  }

  function handleSelection(event: MouseEvent): void {
    if (event.button !== 0 || event.detail > 1 || insideUi(event)) return;
    window.setTimeout(() => {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !selection.toString().trim()) {
        hide();
        return;
      }
      showAction(selection.getRangeAt(0).getBoundingClientRect());
    }, 20);
  }

  function handleDoubleClick(event: MouseEvent): void {
    if (event.button !== 0 || insideUi(event)) return;
    window.setTimeout(() => {
      const selection = document.getSelection();
      const context = selectionContext(document);
      if (!selection || !context || selection.rangeCount === 0) return;
      showInlinePreview(selection.getRangeAt(0).getBoundingClientRect(), context);
    }, 20);
  }

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'GOTIT_EXTRACT_CONTEXT') {
      sendResponse(selectionContext(document));
    }
  });

  void chrome.runtime.sendMessage({ type: 'GET_CONTENT_CONFIG' })
    .then((response: ResponseEnvelope<{ floatingAction: boolean }>) => {
      if (!response.ok || !response.data.floatingAction) return;
      document.addEventListener('mouseup', handleSelection, true);
      document.addEventListener('dblclick', handleDoubleClick, true);
      document.addEventListener('scroll', hide, true);
      window.addEventListener('blur', hide);
    })
    .catch(() => undefined);
}
