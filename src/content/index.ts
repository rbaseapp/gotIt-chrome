import { selectionContext } from '../shared/context';
import { INLINE_TRANSLATION_TIMEOUT_MS } from '../shared/translation';
import type {
  CaptureContext,
  CaptureResult,
  ClientError,
  InlinePreviewResult,
  ResponseEnvelope
} from '../shared/types';

const state = globalThis as typeof globalThis & {
  __gotitContentLoaded?: boolean;
};

if (!state.__gotitContentLoaded) {
  state.__gotitContentLoaded = true;
  let host: HTMLDivElement | null = null;
  let hideTimer: number | null = null;
  let preferredTranslationMethod: 'dictionary' | 'ai' = 'dictionary';

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
    const top = below + estimatedHeight < window.innerHeight ? below : Math.max(8, rect.top - estimatedHeight - 10);
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
    if (error.code === 'AUTHENTICATION_REQUIRED' || error.code === 'UNAUTHORIZED')
      return 'יש להתחבר ל־GotIt כדי לתרגם.';
    if (error.code === 'OFFLINE' || error.code === 'NETWORK_ERROR') return 'אין כרגע חיבור לשירות התרגום.';
    return 'לא הצלחנו לתרגם כרגע.';
  }

  function reviewActions(context: CaptureContext, signIn = false): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'actions';
    const review = document.createElement('button');
    review.type = 'button';
    review.className = 'round-action labeled-action primary-action';
    review.setAttribute('aria-label', signIn ? 'פתיחת GotIt והתחברות' : 'פתיחה לבדיקה ועריכה');
    review.setAttribute('title', signIn ? 'פתיחת GotIt והתחברות' : 'פתיחה לבדיקה ועריכה');
    review.innerHTML = signIn
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M13 8l4 4-4 4M8 12h9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg><span>התחבר</span>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16.5-.8 3.3 3.3-.8L18 8.5 15.5 6 5 16.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m13.8 7.7 2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><span>ערוך</span>';
    review.addEventListener('click', () => sendCapture(context));
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'round-action';
    dismiss.setAttribute('aria-label', 'סגירה');
    dismiss.setAttribute('title', 'סגירה');
    dismiss.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
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
        --surface:#171c2b; --surface-raised:#202638; --surface-soft:#1b2131; --line:#313950;
        --text:#f7f8fc; --muted:#9aa3b9; --accent:#7c8cff; --accent-strong:#6576f4; --warm:#f5c84b;
        all:initial; box-sizing:border-box; position:fixed; z-index:2147483647;
        width:min(430px, calc(100vw - 24px)); max-height:calc(100vh - 16px); direction:rtl; overflow:auto;
        border:1px solid #333b53; border-radius:20px; background:var(--surface); color:var(--text);
        box-shadow:0 24px 70px rgba(3,6,15,.48), 0 2px 12px rgba(3,6,15,.3);
        font:14px/1.5 ${font}; color-scheme:dark;
      }
      * { box-sizing:border-box; }
      button { font:inherit; }
      .head { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:70px; padding:15px 17px; border-bottom:1px solid var(--line); direction:ltr; }
      .term-wrap { display:flex; align-items:center; gap:12px; min-width:0; }
      .term { color:var(--text); font-size:20px; line-height:1.25; font-weight:750; letter-spacing:-.2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .brand { display:flex; align-items:center; gap:7px; flex:0 0 auto; color:#b7bfd4; font-size:11px; font-weight:750; letter-spacing:.25px; }
      .mark { display:grid; place-items:center; width:22px; height:22px; border-radius:7px; background:linear-gradient(145deg, #8d9aff, #6576f4); color:#fff; font-size:13px; font-weight:900; box-shadow:0 5px 14px rgba(101,118,244,.28); }
      .close, .round-action { display:grid; place-items:center; flex:0 0 auto; cursor:pointer; padding:0; }
      .close { width:26px; height:26px; border-radius:8px; background:transparent; color:#8f99b0; }
      .close:hover { background:#252c3f; color:#fff; }
      .close svg { width:18px; height:18px; }
      .method-switch { display:flex; justify-content:flex-end; gap:7px; padding:11px 15px 0; }
      .method { display:flex; align-items:center; justify-content:center; gap:6px; min-width:88px; height:38px; padding:0 11px; border:1px solid var(--line); border-radius:11px; background:var(--surface-soft); color:#a8b0c3; cursor:pointer; font-size:12px; font-weight:750; white-space:nowrap; transition:border-color .16s ease, background .16s ease, color .16s ease, transform .16s ease; }
      .method svg { width:19px; height:19px; }
      .method:hover { border-color:#4a5574; color:#e7eaf4; transform:translateY(-1px); }
      .method:disabled { cursor:wait; opacity:.7; transform:none; }
      .method[aria-pressed="true"] { border-color:#6979b8; background:#2b334b; color:#fff; box-shadow:inset 0 0 0 1px rgba(124,140,255,.08); }
      .method.ai[aria-pressed="true"] { border-color:#7c8cff; background:linear-gradient(135deg, #303955, #292f48); }
      .body { padding:17px 15px 15px; }
      .translation-row { display:flex; align-items:center; justify-content:space-between; gap:14px; min-height:61px; }
      .translation-copy { flex:1 1 auto; min-width:0; text-align:right; }
      .translation-actions { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:7px; direction:ltr; }
      .translation { color:var(--text); font-size:27px; line-height:1.25; font-weight:800; letter-spacing:-.35px; overflow-wrap:anywhere; }
      .lexical { min-height:18px; margin-top:4px; color:#aeb6c9; font-size:11.5px; }
      .round-action { width:42px; height:42px; border:1px solid #49536e; border-radius:12px; background:#293149; color:#dce1ed; box-shadow:0 8px 20px rgba(3,6,15,.16); transition:background .16s ease, border-color .16s ease, transform .16s ease; }
      .round-action.labeled-action { display:flex; width:auto; min-width:69px; padding:0 10px; gap:6px; font-size:12px; font-weight:800; white-space:nowrap; }
      .round-action:hover { border-color:#64708f; background:#343e59; transform:translateY(-1px); }
      .round-action:disabled { opacity:.45; cursor:wait; transform:none; }
      .round-action svg { width:20px; height:20px; }
      .primary-action { border-color:#6879f3; background:linear-gradient(135deg, #7485ff, #6273ef); color:#fff; }
      .primary-action:hover { border-color:#8795ff; background:linear-gradient(135deg, #8291ff, #6d7df7); }
      .save-action.saving svg { display:none; }
      .save-action.saving::after { content:""; width:17px; height:17px; border:2px solid rgba(255,255,255,.38); border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; }
      .speak { color:var(--warm); }
      .speak.speaking { background:#4a4128; border-color:#81703a; }
      .explanation { margin-top:13px; padding:13px 14px; border:1px solid #2b3348; border-radius:12px; background:#141927; }
      .explanation-label { display:flex; align-items:center; gap:6px; margin-bottom:4px; color:#8e98af; font-size:10px; font-weight:800; letter-spacing:.25px; }
      .spark { color:#9eabff; font-size:12px; }
      .explanation p { margin:0; color:#c8cedc; font-size:12.5px; line-height:1.55; overflow-wrap:anywhere; }
      .alternatives { margin-top:6px; color:#9fa8bc; font-size:11.5px; line-height:1.45; }
      .meaning-list { display:grid; gap:7px; margin-top:12px; padding:11px; border:1px solid #343d55; border-radius:12px; background:#141927; }
      .meaning-title { color:#aeb6c9; font-size:11px; font-weight:800; }
      .meaning-options { display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:7px; }
      .meaning-option { display:grid; gap:2px; min-width:0; padding:8px 10px; border:1px solid #3b4560; border-radius:10px; background:#202638; color:#eef1f8; cursor:pointer; text-align:right; }
      .meaning-option:hover { border-color:#64708f; background:#293149; }
      .meaning-option[aria-pressed="true"] { border-color:#7c8cff; background:#303955; box-shadow:inset 0 0 0 1px rgba(124,140,255,.15); }
      .meaning-option strong { overflow-wrap:anywhere; font-size:13px; }
      .meaning-option small { color:#9da6ba; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .meta { margin-top:11px; color:#7f899f; font-size:11px; direction:ltr; text-align:right; }
      .loading-state { min-height:169px; display:grid; place-content:center; justify-items:center; gap:10px; color:#a3acc0; text-align:center; }
      .spinner { width:25px; height:25px; border:2px solid #333b54; border-top-color:#8795ff; border-radius:50%; animation:spin .7s linear infinite; }
      @keyframes spin { to { transform:rotate(360deg); } }
      .loading-state small { color:#737e96; }
      .message { color:#b8c0d2; padding:15px 4px 5px; text-align:center; }
      .provider-warning { color:#e8d89f; background:#2c291e; border:1px solid #4c4326; border-radius:11px; padding:11px 12px; font-size:12px; line-height:1.5; }
      .saved { color:#a9e6c4; background:#172a24; border:1px solid #28503f; border-radius:11px; padding:13px; font-weight:750; text-align:center; }
      .actions { display:flex; justify-content:center; gap:9px; margin-top:14px; }
      button:focus-visible { outline:3px solid rgba(139,151,255,.55); outline-offset:2px; }
      @media (max-width:360px) {
        .panel { border-radius:16px; }
        .head { min-height:61px; padding:12px 13px; }
        .brand strong { display:none; }
        .method-switch, .body { padding-left:11px; padding-right:11px; }
        .translation { font-size:24px; }
      }
      @media (prefers-reduced-motion:reduce) { *, *::before, *::after { animation-duration:.01ms !important; transition-duration:.01ms !important; } }
    `;
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', `תרגום המילה ${context.selectedText}`);
    const position = place(rect, Math.min(430, window.innerWidth - 24), 390);
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    const head = document.createElement('div');
    head.className = 'head';
    const termWrap = document.createElement('div');
    termWrap.className = 'term-wrap';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    close.setAttribute('aria-label', 'סגירה');
    close.addEventListener('click', hide);
    const term = document.createElement('div');
    term.className = 'term';
    term.dir = 'auto';
    term.textContent = context.selectedText;
    termWrap.append(close, term);
    const brand = document.createElement('div');
    brand.className = 'brand';
    appendLogo(brand);
    head.append(termWrap, brand);

    const methodSwitch = document.createElement('div');
    methodSwitch.className = 'method-switch';
    methodSwitch.setAttribute('role', 'group');
    methodSwitch.setAttribute('aria-label', 'בחירת שיטת תרגום');
    const dictionaryButton = document.createElement('button');
    dictionaryButton.type = 'button';
    dictionaryButton.className = 'method google';
    dictionaryButton.setAttribute('aria-label', 'תרגום מילוני');
    dictionaryButton.setAttribute('title', 'תרגום מילוני');
    dictionaryButton.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h10M9 3v2c0 4-2 7-5 9M6 10c1.5 2 3.4 3.5 5.8 4.4M14 10l4 10M12.5 16h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Google</span>';
    const aiButton = document.createElement('button');
    aiButton.type = 'button';
    aiButton.className = 'method ai';
    aiButton.setAttribute('aria-label', 'תרגום באמצעות AI');
    aiButton.setAttribute('title', 'תרגום באמצעות AI');
    aiButton.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.45 4.05L17.5 8.5l-4.05 1.45L12 14l-1.45-4.05L6.5 8.5l4.05-1.45L12 3Zm6 10 .9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9L18 13Z" fill="currentColor"/></svg><span>תרגם עם AI</span>';
    methodSwitch.append(dictionaryButton, aiButton);

    const body = document.createElement('div');
    body.className = 'body';
    panel.append(head, methodSwitch, body);
    root.append(style, panel);
    document.documentElement.append(currentHost);

    let requestVersion = 0;
    let activeMethod: 'dictionary' | 'ai' = 'dictionary';

    function scheduleHide(delay = 30_000): void {
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(hide, delay);
    }

    function fitPanel(): void {
      window.requestAnimationFrame(() => {
        if (host !== currentHost) return;
        const bounds = panel.getBoundingClientRect();
        const nextTop = Math.max(8, Math.min(bounds.top, window.innerHeight - bounds.height - 8));
        const nextLeft = Math.max(8, Math.min(bounds.left, window.innerWidth - bounds.width - 8));
        panel.style.top = `${nextTop}px`;
        panel.style.left = `${nextLeft}px`;
      });
    }

    function setActiveMethod(method: 'dictionary' | 'ai'): void {
      activeMethod = method;
      dictionaryButton.setAttribute('aria-pressed', String(method === 'dictionary'));
      aiButton.setAttribute('aria-pressed', String(method === 'ai'));
    }

    function renderLoading(method: 'dictionary' | 'ai'): void {
      setActiveMethod(method);
      dictionaryButton.disabled = true;
      aiButton.disabled = true;
      body.className = 'body loading-state';
      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      const loading = document.createElement('span');
      loading.textContent = method === 'ai' ? 'AI מתרגם ומנסח הסבר קצר…' : 'מתרגם את המילה…';
      const hint = document.createElement('small');
      hint.textContent = context.sentenceText ? 'משתמש בהקשר שסביב הסימון' : 'מזהה את שפת המקור';
      body.replaceChildren(spinner, loading, hint);
    }

    function renderFailure(messageText: string, signIn = false): void {
      body.className = 'body';
      const message = document.createElement('div');
      message.className = 'message';
      message.textContent = messageText;
      body.replaceChildren(message, reviewActions(context, signIn));
      fitPanel();
    }

    function providerFailureMessage(preview: InlinePreviewResult['preview']): string {
      const codes = new Set(preview.enrichment.warnings?.map((entry) => entry.code) ?? []);
      if (preview.translationMethod === 'ai') {
        if (codes.has('ENRICHMENT_AUTHENTICATION')) return 'Anthropic דחה את מפתח ה־API שמוגדר בשרת.';
        if (codes.has('ENRICHMENT_BILLING')) return 'חשבון Anthropic דורש Billing או קרדיט API פעיל.';
        if (codes.has('ENRICHMENT_PERMISSION')) return 'למפתח Anthropic אין הרשאה ל־Workspace או למודל.';
        if (codes.has('ENRICHMENT_WORKSPACE')) return 'ה־Workspace שמוגדר בשרת אינו תואם למפתח Anthropic.';
        if (codes.has('ENRICHMENT_MODEL_ACCESS')) return 'מודל התרגום שמוגדר בשרת אינו זמין למפתח Anthropic.';
        if (codes.has('ENRICHMENT_RATE_LIMIT')) return 'מגבלת הבקשות של Anthropic נוצלה כרגע.';
        if (codes.has('ENRICHMENT_INVALID_REQUEST')) return 'Anthropic דחה את מבנה בקשת התרגום.';
        if (codes.has('ENRICHMENT_TIMEOUT')) return 'Anthropic לא השיב בזמן. אפשר ללחוץ שוב ולנסות מחדש.';
        if (codes.has('ENRICHMENT_INVALID_RESPONSE')) return 'Anthropic החזיר תשובה שלא ניתן לעבד.';
        return 'הבקשה ל־Anthropic נכשלה לפני שהתקבלה תשובה תקינה.';
      }
      if (codes.has('ENRICHMENT_AUTHENTICATION')) return 'Google דחה את מפתח התרגום שמוגדר בשרת.';
      if (codes.has('ENRICHMENT_BILLING')) return 'שירות Google Translation דורש Billing פעיל.';
      if (codes.has('ENRICHMENT_PERMISSION')) return 'למפתח Google אין הרשאה ל־Cloud Translation API.';
      if (codes.has('ENRICHMENT_RATE_LIMIT')) return 'מגבלת הבקשות של Google Translation נוצלה כרגע.';
      if (codes.has('ENRICHMENT_INVALID_REQUEST')) return 'Google דחה את בקשת התרגום או את קודי השפה.';
      if (codes.has('ENRICHMENT_TIMEOUT')) return 'Google Translation לא השיב בזמן. אפשר ללחוץ שוב ולנסות מחדש.';
      if (codes.has('ENRICHMENT_INVALID_RESPONSE')) return 'Google החזיר תשובה שלא ניתן לעבד.';
      return 'שירות Google Translation אינו זמין כרגע. אפשר ללחוץ שוב ולנסות מחדש.';
    }

    function renderPreview(result: InlinePreviewResult, candidateIndex = 0): void {
      const { preview, inlineCaptureId } = result;
      setActiveMethod(preview.translationMethod === 'ai' ? 'ai' : 'dictionary');
      const candidate = preview.enrichment.candidates[candidateIndex] ?? preview.enrichment.candidates[0];
      body.className = 'body';
      if (!candidate) {
        const warning = document.createElement('div');
        warning.className = 'provider-warning';
        warning.textContent =
          preview.enrichment.status === 'not_configured'
            ? preview.translationMethod === 'ai'
              ? 'תרגום AI עדיין אינו מוגדר בשרת. אפשר להמשיך לבדיקה ולתרגום ידני.'
              : 'Google Translate עדיין אינו מוגדר בשרת. אפשר לעבור לתרגום AI או להמשיך לעריכה.'
            : preview.requiresLanguageSelection
              ? 'יש לבחור שפת יעד בהגדרות GotIt.'
              : preview.translationMethod === 'ai'
                ? 'שירות ה־AI החזיר תשובה שלא ניתן לעבד. אפשר לנסות שוב בעוד רגע.'
                : 'שירות התרגום אינו זמין כרגע.';
        if (preview.enrichment.status === 'unavailable') warning.textContent = providerFailureMessage(preview);
        body.replaceChildren(warning, reviewActions(context));
        fitPanel();
        return;
      }
      const selectedCandidate = candidate;
      if (preview.sourceLanguageCode?.split('-')[0]?.toLowerCase() === 'he' && selectedCandidate.phoneticText) {
        term.textContent = selectedCandidate.phoneticText;
      }

      const translationRow = document.createElement('div');
      translationRow.className = 'translation-row';
      const translationCopy = document.createElement('div');
      translationCopy.className = 'translation-copy';
      const translated = document.createElement('div');
      translated.className = 'translation';
      translated.dir = 'auto';
      translated.textContent = selectedCandidate.text;
      const lexical = document.createElement('div');
      lexical.className = 'lexical';
      lexical.dir = 'auto';
      lexical.textContent = [selectedCandidate.partOfSpeech, selectedCandidate.phoneticText]
        .filter(Boolean)
        .join(' · ');
      translationCopy.append(translated, lexical);

      const speak = document.createElement('button');
      speak.type = 'button';
      speak.className = 'round-action speak';
      speak.setAttribute('aria-label', `השמעת ${context.selectedText}`);
      speak.setAttribute('title', 'השמעת המילה');
      speak.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3.2l4.3 3.5v-11L7.2 10H4Z" fill="currentColor"/><path d="M15 9.2a4 4 0 010 5.6M17.7 6.7a7.5 7.5 0 010 10.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      speak.disabled = !('speechSynthesis' in window) || !context.selectedText.trim();
      speak.addEventListener('click', () => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(context.selectedText.trim());
        utterance.lang = preview.sourceLanguageCode ?? context.documentLanguageHint ?? '';
        utterance.addEventListener('start', () => speak.classList.add('speaking'));
        utterance.addEventListener('end', () => speak.classList.remove('speaking'));
        utterance.addEventListener('error', () => speak.classList.remove('speaking'));
        window.speechSynthesis.speak(utterance);
        scheduleHide();
      });
      const quickSave = document.createElement('button');
      quickSave.type = 'button';
      quickSave.className = 'round-action labeled-action primary-action save-action';
      quickSave.setAttribute('aria-label', 'שמירה ב־GotIt');
      quickSave.setAttribute('title', 'שמירה ב־GotIt');
      quickSave.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5V4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 4v6h8V4M8 20v-6h8v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>שמור</span>';
      const review = document.createElement('button');
      review.type = 'button';
      review.className = 'round-action labeled-action';
      review.setAttribute('aria-label', 'פתיחה לבדיקה ועריכה');
      review.setAttribute('title', 'פתיחה לבדיקה ועריכה');
      review.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16.5-.8 3.3 3.3-.8L18 8.5 15.5 6 5 16.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m13.8 7.7 2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><span>ערוך</span>';
      review.addEventListener('click', () => sendCapture(context));
      const translationActions = document.createElement('div');
      translationActions.className = 'translation-actions';
      translationActions.append(quickSave, review, speak);
      translationRow.append(translationCopy, translationActions);

      const meaningList = document.createElement('div');
      meaningList.className = 'meaning-list';
      const meaningTitle = document.createElement('div');
      meaningTitle.className = 'meaning-title';
      meaningTitle.textContent = 'בחר פירוש לשמירה';
      const meaningOptions = document.createElement('div');
      meaningOptions.className = 'meaning-options';
      preview.enrichment.candidates.forEach((meaning, index) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'meaning-option';
        option.setAttribute('aria-pressed', String(index === candidateIndex));
        const optionText = document.createElement('strong');
        optionText.dir = 'auto';
        optionText.textContent = meaning.text;
        const optionDetails = document.createElement('small');
        optionDetails.dir = 'auto';
        optionDetails.textContent = meaning.partOfSpeech ?? meaning.explanation ?? '';
        option.append(optionText);
        if (optionDetails.textContent) option.append(optionDetails);
        option.addEventListener('click', () => renderPreview(result, index));
        meaningOptions.append(option);
      });
      meaningList.append(meaningTitle, meaningOptions);

      const explanation = document.createElement('div');
      explanation.className = 'explanation';
      const explanationLabel = document.createElement('div');
      explanationLabel.className = 'explanation-label';
      const spark = document.createElement('span');
      spark.className = 'spark';
      spark.textContent = preview.translationMethod === 'ai' ? '✦' : '●';
      const labelText = document.createElement('span');
      labelText.textContent = 'תיאור קצר';
      explanationLabel.append(spark, labelText);
      const explanationText = document.createElement('p');
      explanationText.dir = 'auto';
      const alternatives = document.createElement('div');
      alternatives.className = 'alternatives';

      function applyLexicalDetails(details: {
        partOfSpeech: string | null;
        explanation: string | null;
        variants: string[];
      }): void {
        const variants = details?.variants
          .map((variant) => variant.trim())
          .filter(
            (variant, index, all) =>
              variant && variant !== selectedCandidate.text.trim() && all.indexOf(variant) === index
          )
          .slice(0, 4);
        lexical.textContent = [details.partOfSpeech, selectedCandidate.phoneticText].filter(Boolean).join(' · ');
        explanationText.textContent =
          details.explanation?.trim() ||
          (preview.translationMethod === 'ai'
            ? details.partOfSpeech
              ? `חלק הדיבר של המילה הוא ${details.partOfSpeech}.`
              : 'לא נמצא כרגע תיאור מילוני נוסף.'
            : 'למשמעות מילונית והסבר מותאם למשפט, לחץ על כפתור תרגום AI.');
        alternatives.textContent = variants.length ? `גם: ${variants.join(', ')}` : '';
        alternatives.hidden = variants.length === 0;
        fitPanel();
      }

      const directDetails = {
        partOfSpeech: selectedCandidate.partOfSpeech,
        explanation: selectedCandidate.explanation?.trim() || null,
        variants: selectedCandidate.variants
      };
      applyLexicalDetails(directDetails);
      explanation.append(explanationLabel, explanationText, alternatives);

      const meta = document.createElement('div');
      meta.className = 'meta';
      const providerLabel = preview.translationMethod === 'ai' ? 'AI' : 'Google Translate';
      meta.textContent = `${providerLabel} · ${(preview.sourceLanguageCode ?? '?').toUpperCase()} → ${(preview.translationLanguageCode ?? '?').toUpperCase()}`;

      quickSave.addEventListener('click', () => {
        quickSave.disabled = true;
        quickSave.classList.add('saving');
        quickSave.setAttribute('aria-label', 'שומר ב־GotIt…');
        quickSave.setAttribute('title', 'שומר ב־GotIt…');
        void chrome.runtime
          .sendMessage({ type: 'INLINE_SAVE', inlineCaptureId, candidateIndex })
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
              quickSave.disabled = false;
              quickSave.classList.remove('saving');
              quickSave.setAttribute('aria-label', 'ניסיון שמירה נוסף');
              quickSave.setAttribute('title', 'ניסיון שמירה נוסף');
              fitPanel();
              return;
            }
            body.querySelector('.saved')?.remove();
            const confirmation = document.createElement('div');
            confirmation.className = 'saved';
            confirmation.textContent = saved.data.outcome === 'merged' ? 'ההקשר נוסף למילה ✓' : 'המילה נשמרה ב־GotIt ✓';
            body.prepend(confirmation);
            quickSave.classList.remove('saving');
            quickSave.disabled = true;
            quickSave.setAttribute('aria-label', 'נשמר ב־GotIt');
            quickSave.setAttribute('title', 'נשמר ב־GotIt');
            const saveLabel = quickSave.querySelector('span');
            if (saveLabel) saveLabel.textContent = 'נשמר';
            fitPanel();
          })
          .catch(() => {
            quickSave.disabled = false;
            quickSave.classList.remove('saving');
            quickSave.setAttribute('aria-label', 'ניסיון שמירה נוסף');
            quickSave.setAttribute('title', 'ניסיון שמירה נוסף');
          });
      });
      body.replaceChildren(translationRow);
      if (preview.enrichment.candidates.length > 1) body.append(meaningList);
      body.append(explanation, meta);
      fitPanel();
    }

    function loadInlinePreview(method?: 'dictionary' | 'ai'): void {
      const version = ++requestVersion;
      let requestFinished = false;
      const expectedMethod = method ?? preferredTranslationMethod;
      renderLoading(expectedMethod);
      fitPanel();
      scheduleHide(INLINE_TRANSLATION_TIMEOUT_MS + 5_000);
      const requestTimeout = window.setTimeout(() => {
        if (requestFinished || host !== currentHost || version !== requestVersion) return;
        requestFinished = true;
        dictionaryButton.disabled = false;
        aiButton.disabled = false;
        renderFailure(
          expectedMethod === 'ai'
            ? 'שירות ה־AI לא הגיב בזמן. אפשר לנסות שוב בעוד רגע.'
            : 'שירות התרגום לא הגיב בזמן. אפשר לנסות שוב.'
        );
      }, INLINE_TRANSLATION_TIMEOUT_MS);
      void chrome.runtime
        .sendMessage({
          type: 'INLINE_PREVIEW',
          context,
          translationMethod: expectedMethod
        })
        .then((response: ResponseEnvelope<InlinePreviewResult>) => {
          if (requestFinished || host !== currentHost || version !== requestVersion) return;
          requestFinished = true;
          window.clearTimeout(requestTimeout);
          dictionaryButton.disabled = false;
          aiButton.disabled = false;
          if (!response.ok) {
            renderFailure(statusMessage(response.error), response.error.code.includes('AUTH'));
            return;
          }
          renderPreview(response.data);
        })
        .catch(() => {
          if (requestFinished || host !== currentHost || version !== requestVersion) return;
          requestFinished = true;
          window.clearTimeout(requestTimeout);
          dictionaryButton.disabled = false;
          aiButton.disabled = false;
          renderFailure('לא הצלחנו להגיע לשירות התרגום.');
        });
    }

    dictionaryButton.addEventListener('click', () => {
      loadInlinePreview('dictionary');
    });
    aiButton.addEventListener('click', () => {
      loadInlinePreview('ai');
    });
    panel.addEventListener('pointerenter', () => {
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      hideTimer = null;
    });
    panel.addEventListener('pointerleave', () => scheduleHide());
    loadInlinePreview(preferredTranslationMethod);
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
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: unknown }).type === 'GOTIT_EXTRACT_CONTEXT'
    ) {
      sendResponse(selectionContext(document));
    }
  });

  void chrome.runtime
    .sendMessage({ type: 'GET_CONTENT_CONFIG' })
    .then(
      (
        response: ResponseEnvelope<{
          floatingAction: boolean;
          translationMethod: 'dictionary' | 'ai';
        }>
      ) => {
        if (!response.ok || !response.data.floatingAction) return;
        preferredTranslationMethod = response.data.translationMethod;
        document.addEventListener('mouseup', handleSelection, true);
        document.addEventListener('dblclick', handleDoubleClick, true);
        document.addEventListener('scroll', hide, true);
        window.addEventListener('blur', hide);
      }
    )
    .catch(() => undefined);
}
