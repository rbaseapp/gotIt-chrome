import { selectionContext } from '../shared/context';
import { findMatchingSavedSense } from '../shared/saved-match';
import { INLINE_TRANSLATION_TIMEOUT_MS } from '../shared/translation';
import { contentDirection, contentT, setContentLocale } from '../shared/content-i18n';
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
  let aiTranslationAvailable = false;
  let preferredTheme: 'light' | 'dark' = 'light';

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

  function appendLogo(parent: HTMLElement, full = false): void {
    const mark = document.createElement('img');
    mark.className = full ? 'logo-lockup' : 'mark';
    mark.src = chrome.runtime.getURL(full ? 'assets/gotit-logo.svg' : 'assets/gotit-icon.svg');
    mark.alt = '';
    const name = document.createElement('strong');
    name.textContent = 'GotIt';
    parent.append(mark);
    if (!full) parent.append(name);
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
        border-radius: 18px; background: #2c7a62; color: #fff; cursor: pointer;
        font: 650 13px/1 ${font}; box-shadow: 0 8px 24px rgba(44,122,98,.25);
        user-select: none;
      }
      button:hover { background: #1f604c; transform: translateY(-1px); }
      button:focus-visible { outline: 3px solid rgba(44,122,98,.25); outline-offset: 2px; }
      .mark { display:block; width:18px; height:18px; border-radius:5px; overflow:hidden; }
    `;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', contentT('content.saveSelection'));
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
      return contentT('content.authRequired');
    if (error.code === 'OFFLINE' || error.code === 'NETWORK_ERROR') return contentT('content.offline');
    return contentT('content.translateFailed');
  }

  function reviewActions(context: CaptureContext, signIn = false): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'actions';
    const review = document.createElement('button');
    review.type = 'button';
    review.className = 'round-action labeled-action primary-action';
    review.setAttribute('aria-label', signIn ? contentT('content.openSignIn') : contentT('content.openReview'));
    review.setAttribute('title', signIn ? contentT('content.openSignIn') : contentT('content.openReview'));
    review.innerHTML = signIn
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M13 8l4 4-4 4M8 12h9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${contentT('content.signIn')}</span>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16.5-.8 3.3 3.3-.8L18 8.5 15.5 6 5 16.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m13.8 7.7 2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><span>${contentT('content.edit')}</span>`;
    review.addEventListener('click', () => sendCapture(context));
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'round-action';
    dismiss.setAttribute('aria-label', contentT('content.close'));
    dismiss.setAttribute('title', contentT('content.close'));
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
    currentHost.setAttribute('data-theme', preferredTheme);
    const root = currentHost.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .panel {
        --cream:#f6f5f0; --surface:#ffffff; --surface-soft:#fbfbf8; --line:#e6e9e4;
        --text:#24352f; --muted:#74817d; --green:#2c7a62; --green-dark:#1f604c;
        --green-soft:#e6f2ed; --orange:#ef8e62; --orange-soft:#fff0e7;
        --purple:#7a6cb3; --purple-soft:#f0edfa; --blue:#5792a9; --blue-soft:#eaf4f7;
        all:initial; box-sizing:border-box; position:fixed; z-index:2147483647;
        width:min(430px, calc(100vw - 24px)); max-height:calc(100vh - 16px); direction:${contentDirection}; overflow:auto;
        border:1px solid var(--line); border-radius:20px; background:var(--cream); color:var(--text);
        box-shadow:0 24px 70px rgba(25,39,34,.22), 0 2px 12px rgba(33,52,46,.08);
        font:14px/1.5 ${font}; color-scheme:light;
      }
      :host([data-theme="dark"]) .panel {
        --cream:#101713; --surface:#19231f; --surface-soft:#151f1b; --line:#34443c;
        --text:#edf4f0; --muted:#a2b2aa; --green:#4eaf8b; --green-dark:#7bc9ad;
        --green-soft:#1c392f; --orange:#ef9b75; --orange-soft:#40271f;
        --purple:#a99bda; --purple-soft:#2d2940; --blue:#75aac0; --blue-soft:#1d343c;
        color-scheme:dark; box-shadow:0 24px 70px rgba(0,0,0,.48), 0 2px 12px rgba(0,0,0,.3);
      }
      * { box-sizing:border-box; }
      button { font:inherit; }
      .head { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:70px; padding:15px 17px; border-bottom:1px solid var(--line); direction:ltr; }
      .term-wrap { display:flex; align-items:center; gap:12px; min-width:0; }
      .term { color:var(--text); font-size:20px; line-height:1.25; font-weight:750; letter-spacing:-.2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .brand { display:flex; align-items:center; flex:0 0 auto; }
      .logo-lockup { display:block; width:152px; height:auto; border-radius:5px; }
      .close, .round-action { display:grid; place-items:center; flex:0 0 auto; cursor:pointer; padding:0; }
      .close { width:30px; height:30px; border:0; border-radius:8px; background:transparent; color:var(--muted); }
      .close:hover { background:#eef1ed; color:var(--text); }
      .close svg { width:18px; height:18px; }
      .method-switch { display:flex; justify-content:flex-end; gap:7px; padding:11px 15px 0; }
      .method { display:flex; align-items:center; justify-content:center; gap:6px; min-width:88px; height:38px; padding:0 11px; border:1px solid var(--line); border-radius:11px; background:var(--surface); color:var(--muted); cursor:pointer; font-size:12px; font-weight:750; white-space:nowrap; transition:border-color .16s ease, background .16s ease, color .16s ease, transform .16s ease; }
      .method svg { width:19px; height:19px; }
      .method:hover { border-color:#b9cbc2; background:#eef3f0; color:var(--green-dark); transform:translateY(-1px); }
      .method:disabled { cursor:wait; opacity:.7; transform:none; }
      .method.paid-locked:disabled { cursor:not-allowed; border-style:dashed; }
      .method[aria-pressed="true"] { border-color:var(--green); background:var(--green-soft); color:var(--green-dark); box-shadow:inset 0 0 0 1px rgba(44,122,98,.06); }
      .method.ai[aria-pressed="true"] { border-color:var(--purple); background:var(--purple-soft); color:#51466e; }
      .body { padding:17px 15px 15px; }
      .translation-row { display:flex; align-items:center; justify-content:space-between; gap:14px; min-height:61px; }
      .translation-copy { flex:1 1 auto; min-width:0; text-align:start; }
      .translation-actions { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:7px; direction:ltr; }
      .translation { color:var(--text); font-size:27px; line-height:1.25; font-weight:800; letter-spacing:-.35px; overflow-wrap:anywhere; }
      .lexical { min-height:18px; margin-top:4px; color:var(--muted); font-size:11.5px; }
      .round-action { width:42px; height:42px; border:1px solid var(--line); border-radius:12px; background:var(--surface); color:#586b62; box-shadow:0 2px 8px rgba(33,52,46,.05); transition:background .16s ease, border-color .16s ease, transform .16s ease; }
      .round-action.labeled-action { display:flex; width:auto; min-width:69px; padding:0 10px; gap:6px; font-size:12px; font-weight:800; white-space:nowrap; }
      .round-action:hover { border-color:#b9cbc2; background:#eef3f0; color:var(--green-dark); transform:translateY(-1px); }
      .round-action:disabled { opacity:.45; cursor:not-allowed; transform:none; }
      .round-action.saving:disabled { cursor:wait; }
      .round-action svg { width:20px; height:20px; }
      .primary-action { border-color:var(--green); background:var(--green); color:#fff; box-shadow:0 7px 16px rgba(44,122,98,.18); }
      .primary-action:hover { border-color:var(--green-dark); background:var(--green-dark); color:#fff; }
      .remove-action { border-color:#e5b4a9; background:var(--orange-soft); color:#963827; }
      .remove-action:hover { border-color:var(--orange); background:#ffe5d7; color:#963827; }
      .save-action.saving svg { display:none; }
      .save-action.saving::after { content:""; width:17px; height:17px; border:2px solid rgba(255,255,255,.38); border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; }
      .speak { color:#b9892c; background:#fff8df; }
      .speak.speaking { background:#f8e5b5; border-color:#d7bc78; }
      .explanation { margin-top:13px; padding:13px 14px; border:1px solid #d8d1eb; border-radius:12px; background:var(--purple-soft); }
      .explanation-label { display:flex; align-items:center; gap:6px; margin-bottom:4px; color:#665b82; font-size:10px; font-weight:800; letter-spacing:.25px; }
      .spark { color:var(--purple); font-size:12px; }
      .explanation p { margin:0; color:#51466e; font-size:12.5px; line-height:1.55; overflow-wrap:anywhere; }
      .alternatives { margin-top:6px; color:#716986; font-size:11.5px; line-height:1.45; }
      .meaning-list { display:grid; gap:7px; margin-top:12px; padding:11px; border:1px solid var(--line); border-radius:12px; background:var(--surface-soft); }
      .meaning-title { color:var(--muted); font-size:11px; font-weight:800; }
      .meaning-options { display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:7px; }
      .meaning-option { display:grid; gap:2px; min-width:0; padding:8px 10px; border:1px solid var(--line); border-radius:10px; background:var(--surface); color:var(--text); cursor:pointer; text-align:start; }
      .meaning-option:hover { border-color:#b9cbc2; background:#eef3f0; }
      .meaning-option[aria-pressed="true"] { border-color:var(--green); background:var(--green-soft); box-shadow:inset 0 0 0 1px rgba(44,122,98,.08); }
      .meaning-option strong { overflow-wrap:anywhere; font-size:13px; }
      .meaning-option small { color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .meta { margin-top:11px; color:var(--muted); font-size:11px; direction:ltr; text-align:start; }
      .loading-state { min-height:169px; display:grid; place-content:center; justify-items:center; gap:10px; color:var(--muted); text-align:center; }
      .spinner { width:25px; height:25px; border:2px solid #dce5df; border-top-color:var(--green); border-radius:50%; animation:spin .7s linear infinite; }
      @keyframes spin { to { transform:rotate(360deg); } }
      .loading-state small { color:#929d99; }
      .message { color:var(--muted); padding:15px 4px 5px; text-align:center; }
      .provider-warning { color:#725d13; background:#fff8df; border:1px solid #ead9aa; border-radius:11px; padding:11px 12px; font-size:12px; line-height:1.5; }
      .saved { color:var(--green-dark); background:var(--green-soft); border:1px solid #b7d5c6; border-radius:11px; padding:13px; font-weight:750; text-align:center; }
      .actions { display:flex; justify-content:center; gap:9px; margin-top:14px; }
      .practice-invite { display:grid; grid-template-columns:minmax(0, 1fr) auto; align-items:center; gap:10px; margin:0 15px 15px; padding:10px 11px; border:1px solid #cadfd5; border-radius:13px; background:linear-gradient(135deg, #edf7f2, #f8fbf9); box-shadow:0 2px 8px rgba(33,52,46,.05); }
      .practice-invite strong { display:block; color:var(--green-dark); font-size:12px; }
      .practice-invite p { margin:2px 0 0; color:#5b7168; font-size:10.5px; line-height:1.4; }
      .practice-invite a { border-radius:9px; padding:8px 10px; background:var(--green); color:#fff; font:800 10.5px/1.3 ${font}; text-align:center; text-decoration:none; white-space:nowrap; }
      .practice-invite a:hover { background:var(--green-dark); }
      :host([data-theme="dark"]) .close:hover, :host([data-theme="dark"]) .method:hover, :host([data-theme="dark"]) .round-action:hover, :host([data-theme="dark"]) .meaning-option:hover { border-color:#4b6257; background:#24312b; }
      :host([data-theme="dark"]) .round-action { color:#b5c4bd; }
      :host([data-theme="dark"]) .explanation { border-color:#51496e; }
      :host([data-theme="dark"]) .explanation-label, :host([data-theme="dark"]) .explanation p, :host([data-theme="dark"]) .alternatives { color:#c5bce2; }
      :host([data-theme="dark"]) .provider-warning { color:#ead58c; background:#342f1c; border-color:#665628; }
      :host([data-theme="dark"]) .practice-invite { border-color:#315447; background:linear-gradient(135deg, #173128, #19231f); }
      :host([data-theme="dark"]) .practice-invite p { color:#afbeb7; }
      button:focus-visible { outline:3px solid rgba(44,122,98,.22); outline-offset:2px; }
      a:focus-visible { outline:3px solid rgba(44,122,98,.22); outline-offset:2px; }
      @media (max-width:360px) {
        .panel { border-radius:16px; }
        .head { min-height:61px; padding:12px 13px; }
        .logo-lockup { width:132px; }
        .method-switch, .body { padding-left:11px; padding-right:11px; }
        .translation { font-size:24px; }
      }
      @media (prefers-reduced-motion:reduce) { *, *::before, *::after { animation-duration:.01ms !important; transition-duration:.01ms !important; } }
    `;
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', contentT('content.dialogLabel', { term: context.selectedText }));
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
    close.setAttribute('aria-label', contentT('content.close'));
    close.addEventListener('click', hide);
    const term = document.createElement('div');
    term.className = 'term';
    term.dir = 'auto';
    term.textContent = context.selectedText;
    termWrap.append(close, term);
    const brand = document.createElement('div');
    brand.className = 'brand';
    appendLogo(brand, true);
    head.append(termWrap, brand);

    const methodSwitch = document.createElement('div');
    methodSwitch.className = 'method-switch';
    methodSwitch.setAttribute('role', 'group');
    methodSwitch.setAttribute('aria-label', contentT('content.methodGroup'));
    const dictionaryButton = document.createElement('button');
    dictionaryButton.type = 'button';
    dictionaryButton.className = 'method google';
    dictionaryButton.setAttribute('aria-label', contentT('content.dictionary'));
    dictionaryButton.setAttribute('title', contentT('content.dictionary'));
    dictionaryButton.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h10M9 3v2c0 4-2 7-5 9M6 10c1.5 2 3.4 3.5 5.8 4.4M14 10l4 10M12.5 16h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Google</span>';
    const aiButton = document.createElement('button');
    aiButton.type = 'button';
    aiButton.className = 'method ai';
    aiButton.setAttribute('aria-label', contentT('content.ai'));
    aiButton.setAttribute('title', contentT('content.ai'));
    aiButton.innerHTML =
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.45 4.05L17.5 8.5l-4.05 1.45L12 14l-1.45-4.05L6.5 8.5l4.05-1.45L12 3Zm6 10 .9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9L18 13Z" fill="currentColor"/></svg><span>${contentT('content.translateAi')}</span>`;
    if (!aiTranslationAvailable) {
      aiButton.disabled = true;
      aiButton.classList.add('paid-locked');
      aiButton.setAttribute('aria-label', contentT('content.aiPaidOnly'));
      aiButton.setAttribute('title', contentT('content.aiPaidOnly'));
      aiButton.querySelector('span')!.textContent = contentT('content.aiPaidOnlyButton');
    }
    methodSwitch.append(dictionaryButton, aiButton);

    const body = document.createElement('div');
    body.className = 'body';
    const practiceInvite = document.createElement('aside');
    practiceInvite.className = 'practice-invite';
    const practiceCopy = document.createElement('div');
    const practiceTitle = document.createElement('strong');
    practiceTitle.textContent = contentT('content.practiceTitle');
    const practiceDescription = document.createElement('p');
    practiceDescription.textContent = contentT('content.practiceDescription');
    practiceCopy.append(practiceTitle, practiceDescription);
    const practiceLink = document.createElement('a');
    practiceLink.href = 'https://gotit.rbaseapp.com';
    practiceLink.target = '_blank';
    practiceLink.rel = 'noopener noreferrer';
    practiceLink.textContent = contentT('content.practiceAction');
    practiceInvite.append(practiceCopy, practiceLink);
    panel.append(head, methodSwitch, body, practiceInvite);
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
      loading.textContent = method === 'ai' ? contentT('content.loadingAi') : contentT('content.loadingWord');
      const hint = document.createElement('small');
      hint.textContent = context.sentenceText ? contentT('content.usingContext') : contentT('content.detectingSource');
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
        if (codes.has('ENRICHMENT_AUTHENTICATION')) return contentT('provider.anthropicAuth');
        if (codes.has('ENRICHMENT_BILLING')) return contentT('provider.anthropicBilling');
        if (codes.has('ENRICHMENT_PERMISSION')) return contentT('provider.anthropicPermission');
        if (codes.has('ENRICHMENT_WORKSPACE')) return contentT('provider.anthropicWorkspace');
        if (codes.has('ENRICHMENT_MODEL_ACCESS')) return contentT('provider.anthropicModel');
        if (codes.has('ENRICHMENT_RATE_LIMIT')) return contentT('provider.anthropicRate');
        if (codes.has('ENRICHMENT_INVALID_REQUEST')) return contentT('provider.anthropicRequest');
        if (codes.has('ENRICHMENT_TIMEOUT')) return contentT('provider.anthropicTimeout');
        if (codes.has('ENRICHMENT_INVALID_RESPONSE')) return contentT('provider.anthropicResponse');
        return contentT('provider.anthropicUpstream');
      }
      if (codes.has('ENRICHMENT_AUTHENTICATION')) return contentT('provider.googleAuth');
      if (codes.has('ENRICHMENT_BILLING')) return contentT('provider.googleBilling');
      if (codes.has('ENRICHMENT_PERMISSION')) return contentT('provider.googlePermission');
      if (codes.has('ENRICHMENT_RATE_LIMIT')) return contentT('provider.googleRate');
      if (codes.has('ENRICHMENT_INVALID_REQUEST')) return contentT('provider.googleRequest');
      if (codes.has('ENRICHMENT_TIMEOUT')) return contentT('provider.googleTimeout');
      if (codes.has('ENRICHMENT_INVALID_RESPONSE')) return contentT('provider.googleResponse');
      return contentT('provider.googleUnknown');
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
              ? contentT('content.aiNotConfigured')
              : contentT('content.googleNotConfigured')
            : preview.requiresLanguageSelection
              ? contentT('content.chooseTarget')
              : preview.translationMethod === 'ai'
                ? contentT('content.aiInvalid')
                : contentT('content.unavailable');
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
      speak.setAttribute('aria-label', contentT('content.speakTerm', { term: context.selectedText }));
      speak.setAttribute('title', contentT('content.speak'));
      speak.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3.2l4.3 3.5v-11L7.2 10H4Z" fill="currentColor"/><path d="M15 9.2a4 4 0 010 5.6M17.7 6.7a7.5 7.5 0 010 10.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      speak.disabled = !('speechSynthesis' in window) || !context.selectedText.trim();
      speak.addEventListener('click', () => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(context.selectedText.trim());
        utterance.lang = preview.sourceLanguageCode ?? '';
        utterance.addEventListener('start', () => speak.classList.add('speaking'));
        utterance.addEventListener('end', () => speak.classList.remove('speaking'));
        utterance.addEventListener('error', () => speak.classList.remove('speaking'));
        window.speechSynthesis.speak(utterance);
        scheduleHide();
      });
      const quickSave = document.createElement('button');
      quickSave.type = 'button';
      quickSave.className = 'round-action labeled-action primary-action save-action';
      quickSave.setAttribute('aria-label', contentT('content.save'));
      quickSave.setAttribute('title', contentT('content.save'));
      quickSave.innerHTML =
        `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5V4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 4v6h8V4M8 20v-6h8v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>${contentT('content.saveShort')}</span>`;
      const review = document.createElement('button');
      review.type = 'button';
      review.className = 'round-action labeled-action';
      review.setAttribute('aria-label', contentT('content.openReview'));
      review.setAttribute('title', contentT('content.openReview'));
      review.innerHTML =
        `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16.5-.8 3.3 3.3-.8L18 8.5 15.5 6 5 16.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m13.8 7.7 2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><span>${contentT('content.edit')}</span>`;
      review.addEventListener('click', () => sendCapture(context));
      const translationActions = document.createElement('div');
      translationActions.className = 'translation-actions';
      translationActions.append(quickSave, review, speak);
      translationRow.append(translationCopy, translationActions);

      const meaningList = document.createElement('div');
      meaningList.className = 'meaning-list';
      const meaningTitle = document.createElement('div');
      meaningTitle.className = 'meaning-title';
      meaningTitle.textContent = contentT('content.meaningTitle');
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
      labelText.textContent = contentT('content.shortDescription');
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
              ? contentT('content.partOfSpeech', { partOfSpeech: details.partOfSpeech })
              : contentT('content.noDescription')
            : contentT('content.aiDescriptionHint'));
        alternatives.textContent = variants.length
          ? contentT('content.alternatives', { variants: variants.join(', ') })
          : '';
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

      const matchingSavedSense = findMatchingSavedSense(preview.existingSenses.items, selectedCandidate.text);
      let savedLearningItemId: string | null = matchingSavedSense?.learningItemId ?? null;
      if (matchingSavedSense) {
        quickSave.classList.remove('primary-action');
        quickSave.classList.add('remove-action');
        quickSave.setAttribute('aria-label', contentT('content.removeSaved'));
        quickSave.setAttribute('title', contentT('content.removeSaved'));
        const saveLabel = quickSave.querySelector('span');
        if (saveLabel) saveLabel.textContent = contentT('content.removeShort');
      }
      quickSave.addEventListener('click', () => {
        quickSave.disabled = true;
        quickSave.classList.add('saving');
        const removing = savedLearningItemId !== null;
        quickSave.setAttribute('aria-label', removing ? contentT('content.removing') : contentT('content.saving'));
        quickSave.setAttribute('title', removing ? contentT('content.removing') : contentT('content.saving'));
        if (removing) {
          void chrome.runtime
            .sendMessage({ type: 'REMOVE_SAVED_ITEM', learningItemId: savedLearningItemId })
            .then((removed: ResponseEnvelope<null>) => {
              if (host !== currentHost) return;
              if (!removed.ok) {
                const warning = document.createElement('div');
                warning.className = 'provider-warning';
                warning.textContent = statusMessage(removed.error);
                body.prepend(warning);
                quickSave.disabled = false;
                quickSave.classList.remove('saving');
                quickSave.setAttribute('aria-label', contentT('content.retryRemove'));
                quickSave.setAttribute('title', contentT('content.retryRemove'));
                fitPanel();
                return;
              }
              body.querySelector('.saved')?.remove();
              const confirmation = document.createElement('div');
              confirmation.className = 'saved';
              confirmation.textContent = contentT('content.removed');
              body.prepend(confirmation);
              savedLearningItemId = null;
              quickSave.classList.remove('saving');
              fitPanel();
              loadInlinePreview(preview.translationMethod === 'ai' ? 'ai' : 'dictionary');
            })
            .catch(() => {
              quickSave.disabled = false;
              quickSave.classList.remove('saving');
              quickSave.setAttribute('aria-label', contentT('content.retryRemove'));
              quickSave.setAttribute('title', contentT('content.retryRemove'));
            });
          return;
        }
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
              quickSave.setAttribute('aria-label', contentT('content.retrySave'));
              quickSave.setAttribute('title', contentT('content.retrySave'));
              fitPanel();
              return;
            }
            body.querySelector('.saved')?.remove();
            const confirmation = document.createElement('div');
            confirmation.className = 'saved';
            confirmation.textContent = saved.data.outcome === 'merged'
              ? contentT('content.contextAdded')
              : contentT('content.wordSaved');
            body.prepend(confirmation);
            savedLearningItemId = saved.data.learningItemId;
            quickSave.classList.remove('saving');
            quickSave.classList.remove('primary-action');
            quickSave.classList.add('remove-action');
            quickSave.disabled = false;
            quickSave.setAttribute('aria-label', contentT('content.removeSaved'));
            quickSave.setAttribute('title', contentT('content.removeSaved'));
            const saveLabel = quickSave.querySelector('span');
            if (saveLabel) saveLabel.textContent = contentT('content.removeShort');
            fitPanel();
          })
          .catch(() => {
            quickSave.disabled = false;
            quickSave.classList.remove('saving');
            quickSave.setAttribute('aria-label', contentT('content.retrySave'));
            quickSave.setAttribute('title', contentT('content.retrySave'));
          });
      });
      body.replaceChildren(translationRow);
      if (matchingSavedSense) {
        const alreadySaved = document.createElement('div');
        alreadySaved.className = 'saved';
        alreadySaved.textContent = contentT('content.alreadySaved');
        body.prepend(alreadySaved);
      }
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
        aiButton.disabled = !aiTranslationAvailable;
        renderFailure(
          expectedMethod === 'ai'
            ? contentT('content.aiTimeout')
            : contentT('content.translationTimeout')
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
          aiButton.disabled = !aiTranslationAvailable;
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
          aiButton.disabled = !aiTranslationAvailable;
          renderFailure(contentT('content.unreachable'));
        });
    }

    dictionaryButton.addEventListener('click', () => {
      loadInlinePreview('dictionary');
    });
    aiButton.addEventListener('click', () => {
      if (!aiTranslationAvailable) return;
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
      return;
    }
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: unknown }).type === 'GOTIT_THEME_CHANGED'
    ) {
      const theme = (message as { theme?: unknown }).theme;
      if (theme === 'light' || theme === 'dark') {
        preferredTheme = theme;
        host?.setAttribute('data-theme', theme);
      }
    }
  });

  void chrome.runtime
    .sendMessage({ type: 'GET_CONTENT_CONFIG' })
    .then(
      (
        response: ResponseEnvelope<{
          floatingAction: boolean;
          translationMethod: 'dictionary' | 'ai';
          aiTranslationAvailable: boolean;
          uiLocale: 'en' | 'he';
          theme: 'light' | 'dark';
        }>
      ) => {
        if (!response.ok || !response.data.floatingAction) return;
        setContentLocale(response.data.uiLocale);
        aiTranslationAvailable = response.data.aiTranslationAvailable;
        preferredTranslationMethod = response.data.translationMethod;
        preferredTheme = response.data.theme;
        document.addEventListener('mouseup', handleSelection, true);
        document.addEventListener('dblclick', handleDoubleClick, true);
        document.addEventListener('scroll', hide, true);
        window.addEventListener('blur', hide);
      }
    )
    .catch(() => undefined);
}
