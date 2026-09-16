import { selectionContext } from '../shared/context';
import type {
  CaptureContext,
  CaptureResult,
  ClientError,
  InlineLexicalDetails,
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
      .close, .speak { display:grid; place-items:center; flex:0 0 auto; border:0; cursor:pointer; padding:0; }
      .close { width:26px; height:26px; border-radius:8px; background:transparent; color:#8f99b0; }
      .close:hover { background:#252c3f; color:#fff; }
      .close svg { width:18px; height:18px; }
      .method-switch { display:grid; grid-template-columns:1fr 1fr; gap:9px; padding:14px 15px 0; }
      .method { min-height:45px; border:1px solid var(--line); border-radius:12px; background:var(--surface-soft); color:#a8b0c3; cursor:pointer; font-size:14px; font-weight:650; transition:border-color .16s ease, background .16s ease, color .16s ease, transform .16s ease; }
      .method:hover { border-color:#4a5574; color:#e7eaf4; transform:translateY(-1px); }
      .method:disabled { cursor:wait; opacity:.7; transform:none; }
      .method[aria-pressed="true"] { border-color:#6979b8; background:#2b334b; color:#fff; box-shadow:inset 0 0 0 1px rgba(124,140,255,.08); }
      .method.ai[aria-pressed="true"] { border-color:#7c8cff; background:linear-gradient(135deg, #303955, #292f48); }
      .body { padding:17px 15px 15px; }
      .translation-row { display:flex; align-items:center; justify-content:space-between; gap:18px; min-height:61px; }
      .translation-copy { min-width:0; text-align:right; }
      .translation { color:var(--text); font-size:27px; line-height:1.25; font-weight:800; letter-spacing:-.35px; overflow-wrap:anywhere; }
      .lexical { min-height:18px; margin-top:4px; color:#aeb6c9; font-size:11.5px; }
      .speak { width:47px; height:47px; border:1px solid #49536e; border-radius:50%; background:#293149; color:var(--warm); box-shadow:0 8px 20px rgba(3,6,15,.2); transition:background .16s ease, transform .16s ease; }
      .speak:hover { background:#343e59; transform:scale(1.04); }
      .speak:disabled { opacity:.45; cursor:not-allowed; transform:none; }
      .speak.speaking { background:#4a4128; border-color:#81703a; }
      .speak svg { width:22px; height:22px; }
      .explanation { margin-top:13px; padding:13px 14px; border:1px solid #2b3348; border-radius:12px; background:#141927; }
      .explanation-label { display:flex; align-items:center; gap:6px; margin-bottom:4px; color:#8e98af; font-size:10px; font-weight:800; letter-spacing:.25px; }
      .spark { color:#9eabff; font-size:12px; }
      .explanation p { margin:0; color:#c8cedc; font-size:12.5px; line-height:1.55; overflow-wrap:anywhere; }
      .explanation p.loading-details { color:#8f99ae; }
      .alternatives { margin-top:6px; color:#9fa8bc; font-size:11.5px; line-height:1.45; }
      .meta { margin-top:11px; color:#7f899f; font-size:11px; direction:ltr; text-align:right; }
      .loading-state { min-height:169px; display:grid; place-content:center; justify-items:center; gap:10px; color:#a3acc0; text-align:center; }
      .spinner { width:25px; height:25px; border:2px solid #333b54; border-top-color:#8795ff; border-radius:50%; animation:spin .7s linear infinite; }
      @keyframes spin { to { transform:rotate(360deg); } }
      .loading-state small { color:#737e96; }
      .message { color:#b8c0d2; padding:15px 4px 5px; text-align:center; }
      .provider-warning { color:#e8d89f; background:#2c291e; border:1px solid #4c4326; border-radius:11px; padding:11px 12px; font-size:12px; line-height:1.5; }
      .saved { color:#a9e6c4; background:#172a24; border:1px solid #28503f; border-radius:11px; padding:13px; font-weight:750; text-align:center; }
      .actions { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:14px; }
      .primary, .secondary { min-height:46px; cursor:pointer; border-radius:12px; padding:9px 12px; font:700 13px/1 ${font}; text-align:center; }
      .primary { border:1px solid #6879f3; background:linear-gradient(135deg, #7485ff, #6273ef); color:#fff; box-shadow:0 8px 18px rgba(75,92,207,.2); }
      .primary:hover { background:linear-gradient(135deg, #8291ff, #6d7df7); }
      .primary:disabled { opacity:.58; cursor:wait; }
      .secondary { border:1px solid var(--line); background:var(--surface-raised); color:#e2e5ee; }
      .secondary:hover { border-color:#4a5574; background:#293147; }
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
    close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
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
    dictionaryButton.className = 'method';
    dictionaryButton.textContent = 'Google Translate';
    const aiButton = document.createElement('button');
    aiButton.type = 'button';
    aiButton.className = 'method ai';
    aiButton.textContent = '✦ תרגום AI';
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

    function renderPreview(result: InlinePreviewResult, version: number): void {
      const { preview, inlineCaptureId } = result;
      const candidate = preview.enrichment.candidates[0];
      body.className = 'body';
      if (!candidate) {
        const warning = document.createElement('div');
        warning.className = 'provider-warning';
        warning.textContent = preview.enrichment.status === 'not_configured'
          ? preview.translationMethod === 'ai'
            ? 'תרגום AI עדיין אינו מוגדר בשרת. אפשר להמשיך לבדיקה ולתרגום ידני.'
            : 'Google Translate עדיין אינו מוגדר בשרת. אפשר לעבור לתרגום AI או להמשיך לעריכה.'
          : preview.requiresLanguageSelection
            ? 'יש לבחור שפת יעד בהגדרות GotIt.'
            : preview.translationMethod === 'ai'
              ? 'שירות ה־AI החזיר תשובה שלא ניתן לעבד. אפשר לנסות שוב בעוד רגע.'
              : 'שירות התרגום אינו זמין כרגע.';
        body.replaceChildren(warning, reviewActions(context));
        fitPanel();
        return;
      }
      const selectedCandidate = candidate;

      const translationRow = document.createElement('div');
      translationRow.className = 'translation-row';
      const translationCopy = document.createElement('div');
      translationCopy.className = 'translation-copy';
      const translated = document.createElement('div');
      translated.className = 'translation';
      translated.dir = 'auto';
      translated.textContent = candidate.text;
      const lexical = document.createElement('div');
      lexical.className = 'lexical';
      lexical.dir = 'auto';
      lexical.textContent = [candidate.partOfSpeech, candidate.phoneticText].filter(Boolean).join(' · ');
      translationCopy.append(translated, lexical);

      const speak = document.createElement('button');
      speak.type = 'button';
      speak.className = 'speak';
      speak.setAttribute('aria-label', `השמעת ${context.selectedText}`);
      speak.setAttribute('title', 'השמעת המילה');
      speak.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3.2l4.3 3.5v-11L7.2 10H4Z" fill="currentColor"/><path d="M15 9.2a4 4 0 010 5.6M17.7 6.7a7.5 7.5 0 010 10.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
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
      translationRow.append(translationCopy, speak);

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

      function applyLexicalDetails(details: InlineLexicalDetails | null, loading = false): void {
        const variants = details?.variants
          .map((variant) => variant.trim())
          .filter((variant, index, all) => variant && variant !== selectedCandidate.text.trim() && all.indexOf(variant) === index)
          .slice(0, 4) ?? [];
        lexical.textContent = [details?.partOfSpeech, selectedCandidate.phoneticText].filter(Boolean).join(' · ');
        explanationText.classList.toggle('loading-details', loading);
        explanationText.textContent = loading
          ? 'טוען מידע מילוני על המילה…'
          : details?.explanation?.trim() || (details?.partOfSpeech
              ? `חלק הדיבר של המילה הוא ${details.partOfSpeech}.`
              : 'לא נמצא כרגע תיאור מילוני נוסף. אפשר לנסות תרגום AI.');
        alternatives.textContent = variants.length ? `גם: ${variants.join(', ')}` : '';
        alternatives.hidden = variants.length === 0;
        fitPanel();
      }

      const directDetails: InlineLexicalDetails = {
        partOfSpeech: candidate.partOfSpeech,
        explanation: candidate.explanation?.trim() || null,
        variants: candidate.variants
      };
      const hasDirectDetails = Boolean(directDetails.partOfSpeech || directDetails.explanation);
      applyLexicalDetails(directDetails, preview.translationMethod !== 'ai' && !hasDirectDetails);
      explanation.append(explanationLabel, explanationText, alternatives);

      const meta = document.createElement('div');
      meta.className = 'meta';
      const providerLabel = preview.translationMethod === 'ai' ? 'AI' : 'Google Translate';
      meta.textContent = `${providerLabel} · ${(preview.sourceLanguageCode ?? '?').toUpperCase()} → ${(preview.translationLanguageCode ?? '?').toUpperCase()}`;

      const actions = document.createElement('div');
      actions.className = 'actions';
      const quickSave = document.createElement('button');
      quickSave.type = 'button';
      quickSave.className = 'primary';
      quickSave.textContent = 'שמירה למאגר';
      const review = document.createElement('button');
      review.type = 'button';
      review.className = 'secondary';
      review.textContent = 'בדיקה ועריכה';
      review.addEventListener('click', () => sendCapture(context));
      quickSave.addEventListener('click', () => {
        quickSave.disabled = true;
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
              quickSave.disabled = false;
              quickSave.textContent = 'ניסיון שמירה נוסף';
              fitPanel();
              return;
            }
            body.replaceChildren();
            const confirmation = document.createElement('div');
            confirmation.className = 'saved';
            confirmation.textContent = saved.data.outcome === 'merged'
              ? 'ההקשר נוסף למילה ✓'
              : 'המילה נשמרה ב־GotIt ✓';
            body.append(confirmation);
            fitPanel();
            scheduleHide(1600);
          })
          .catch(() => {
            quickSave.disabled = false;
            quickSave.textContent = 'ניסיון שמירה נוסף';
          });
      });
      actions.append(quickSave, review);
      body.replaceChildren(translationRow, explanation, meta, actions);
      fitPanel();

      if (preview.translationMethod !== 'ai' && !hasDirectDetails) {
        let detailsFinished = false;
        const detailsTimeout = window.setTimeout(() => {
          if (host !== currentHost || version !== requestVersion || activeMethod !== 'dictionary') return;
          detailsFinished = true;
          applyLexicalDetails(null);
        }, 12_000);
        void chrome.runtime.sendMessage({
          type: 'INLINE_DETAILS',
          context,
          ...(preview.sourceLanguageCode ? { sourceLanguageCode: preview.sourceLanguageCode } : {}),
          ...(preview.translationLanguageCode ? { translationLanguageCode: preview.translationLanguageCode } : {})
        }).then((detailsResponse: ResponseEnvelope<InlineLexicalDetails | null>) => {
          if (detailsFinished || host !== currentHost || version !== requestVersion || activeMethod !== 'dictionary') return;
          detailsFinished = true;
          window.clearTimeout(detailsTimeout);
          applyLexicalDetails(detailsResponse.ok ? detailsResponse.data : null);
        }).catch(() => {
          if (detailsFinished || host !== currentHost || version !== requestVersion || activeMethod !== 'dictionary') return;
          detailsFinished = true;
          window.clearTimeout(detailsTimeout);
          applyLexicalDetails(null);
        });
      }
    }

    function loadInlinePreview(method: 'dictionary' | 'ai'): void {
      const version = ++requestVersion;
      let requestFinished = false;
      renderLoading(method);
      fitPanel();
      scheduleHide();
      const requestTimeout = window.setTimeout(() => {
        if (requestFinished || host !== currentHost || version !== requestVersion) return;
        requestFinished = true;
        dictionaryButton.disabled = false;
        aiButton.disabled = false;
        renderFailure(method === 'ai'
          ? 'שירות ה־AI לא הגיב בזמן. אפשר לנסות שוב בעוד רגע.'
          : 'שירות התרגום לא הגיב בזמן. אפשר לנסות שוב.');
      }, method === 'ai' ? 22_000 : 10_000);
      void chrome.runtime.sendMessage({ type: 'INLINE_PREVIEW', context, translationMethod: method })
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
          renderPreview(response.data, version);
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
      if (activeMethod !== 'dictionary') loadInlinePreview('dictionary');
    });
    aiButton.addEventListener('click', () => {
      if (activeMethod !== 'ai') loadInlinePreview('ai');
    });
    panel.addEventListener('pointerenter', () => {
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      hideTimer = null;
    });
    panel.addEventListener('pointerleave', () => scheduleHide());
    loadInlinePreview('dictionary');
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
