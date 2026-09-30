import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { defaultSettings } from '../src/background/settings';
import type { ExtensionRequest } from '../src/shared/messages';
import type { ExtensionSettings, ResponseEnvelope } from '../src/shared/types';

const SETTINGS_KEY = 'gotit.settings.v1';
const CONTENT_SCRIPT_ID = 'gotit-floating-action';
const extensionUrl = 'chrome-extension://gotit-test/';
const bundles = await Promise.all(['background', 'content', 'options'].map(async (entry) => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`../src/${entry}/index.ts`, import.meta.url))],
    bundle: true,
    write: false,
    format: entry === 'options' ? 'esm' : 'iife',
    platform: 'browser'
  });
  return result.outputFiles[0]!.text;
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function background() {
  const stored: Record<string, unknown> = { [SETTINGS_KEY]: { ...defaultSettings } };
  const messages: Array<{ tabId: number; message: Record<string, unknown> }> = [];
  let listener!: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    respond: (response: ResponseEnvelope<ExtensionSettings>) => void
  ) => boolean;
  const event = { addListener() {} };
  const storage = {
    get: async (key: string) => structuredClone({ [key]: stored[key] }),
    set: async (values: Record<string, unknown>) => { Object.assign(stored, structuredClone(values)); },
    setAccessLevel: async () => {}
  };
  const chrome = {
    runtime: {
      id: 'gotit-test',
      getURL: (path: string) => extensionUrl + path,
      onMessage: { addListener(callback: typeof listener) { listener = callback; } },
      onInstalled: event,
      onStartup: event
    },
    storage: { local: storage, session: storage },
    permissions: { contains: async () => true, onRemoved: event },
    scripting: {
      getRegisteredContentScripts: async () => [{ id: CONTENT_SCRIPT_ID }],
      registerContentScripts: async (_scripts: unknown) => {},
      unregisterContentScripts: async (_filter: unknown) => {},
      executeScript: async (_injection: { target: { tabId: number } }) => [] as unknown[]
    },
    tabs: {
      query: async () => [] as Array<{ id: number; url: string; discarded?: boolean }>,
      sendMessage: async (tabId: number, message: Record<string, unknown>) => {
        messages.push({ tabId, message });
      }
    },
    contextMenus: { onClicked: event }
  };
  runInNewContext(bundles[0]!, { chrome, console: { warn() {} } });
  return {
    chrome,
    messages,
    stored,
    request: (request: ExtensionRequest) => new Promise<ResponseEnvelope<ExtensionSettings>>((resolve) => {
      listener(request, { id: 'gotit-test', url: extensionUrl + 'options.html' }, resolve);
    })
  };
}

test('rapid changes to all four behavior settings survive reopening settings', async () => {
  const app = background();
  const patches = [
    { selectionAction: false },
    { doubleClickTranslation: false },
    { autoCloseOnOutsideClick: true },
    { popupSize: 'large' }
  ] satisfies Array<Partial<ExtensionSettings>>;
  const responses = await Promise.all(patches.map((settings) =>
    app.request({ type: 'UPDATE_SETTINGS', settings })));
  assert.ok(responses.every((response) => response.ok));
  const reopened = await app.request({ type: 'GET_SETTINGS' });
  assert.equal(reopened.ok, true);
  if (reopened.ok) assert.deepEqual(structuredClone(reopened.data), {
    ...defaultSettings,
    ...Object.assign({}, ...patches)
  });
});

test('saving does not wait for an unresponsive tab', async () => {
  const app = background();
  const injection = deferred<unknown[]>();
  app.chrome.tabs.query = async () => [{ id: 1, url: 'https://example.com/' }];
  app.chrome.scripting.executeScript = () => injection.promise;
  let response: ResponseEnvelope<ExtensionSettings> | undefined;
  const saving = app.request({ type: 'UPDATE_SETTINGS', settings: { popupSize: 'large' } })
    .then((result) => { response = result; });
  await setImmediate();
  const savedWithoutTab = response?.ok;
  injection.resolve([]);
  await saving;
  assert.equal(savedWithoutTab, true);
  assert.equal((app.stored[SETTINGS_KEY] as ExtensionSettings).popupSize, 'large');
});

test('a content script registration failure does not report a persisted setting as unsaved', async () => {
  const app = background();
  app.chrome.scripting.getRegisteredContentScripts = async () => { throw new Error('Registration unavailable'); };
  const response = await app.request({ type: 'UPDATE_SETTINGS', settings: { autoCloseOnOutsideClick: true } });
  assert.equal((app.stored[SETTINGS_KEY] as ExtensionSettings).autoCloseOnOutsideClick, true);
  assert.equal(response.ok, true);
});

test('a failed storage write is reported and does not block the next save', async () => {
  const app = background();
  const persist = app.chrome.storage.local.set;
  app.chrome.storage.local.set = async () => { throw new Error('Storage unavailable'); };
  const failed = await app.request({ type: 'UPDATE_SETTINGS', settings: { popupSize: 'large' } });
  assert.equal(failed.ok, false);
  app.chrome.storage.local.set = persist;
  const saved = await app.request({ type: 'UPDATE_SETTINGS', settings: { popupSize: 'small' } });
  assert.equal(saved.ok, true);
  assert.equal((app.stored[SETTINGS_KEY] as ExtensionSettings).popupSize, 'small');
});

test('delayed tab injection applies the latest saved choices', async () => {
  const app = background();
  const injection = deferred<unknown[]>();
  app.chrome.tabs.query = async () => [{ id: 1, url: 'https://example.com/' }];
  app.chrome.scripting.executeScript = () => injection.promise;
  const firstSave = app.request({ type: 'UPDATE_SETTINGS', settings: { popupSize: 'large' } });
  await setImmediate();
  const secondSave = app.request({
    type: 'UPDATE_SETTINGS',
    settings: { popupSize: 'small', selectionAction: false, doubleClickTranslation: false }
  });
  await setImmediate();
  injection.resolve([]);
  await Promise.all([firstSave, secondSave]);
  await setImmediate();
  assert.equal(app.messages.length, 2);
  for (const { message } of app.messages) {
    assert.equal(message.popupSize, 'small');
    assert.equal(message.selectionAction, false);
    assert.equal(message.doubleClickTranslation, false);
  }
});

test('content registration is serialized and eventually reflects the latest save', async () => {
  const app = background();
  const registration = deferred<void>();
  let registered = false;
  let registrations = 0;
  app.chrome.scripting.getRegisteredContentScripts = async () => registered ? [{ id: CONTENT_SCRIPT_ID }] : [];
  app.chrome.scripting.registerContentScripts = async () => {
    registrations += 1;
    await registration.promise;
    registered = true;
  };
  app.chrome.scripting.unregisterContentScripts = async () => { registered = false; };
  const firstSave = app.request({ type: 'UPDATE_SETTINGS', settings: { popupSize: 'large' } });
  await setImmediate();
  const secondSave = app.request({ type: 'UPDATE_SETTINGS', settings: { autoCloseOnOutsideClick: true } });
  await setImmediate();
  const thirdSave = app.request({
    type: 'UPDATE_SETTINGS', settings: { selectionAction: false, doubleClickTranslation: false }
  });
  await setImmediate();
  const overlappingRegistrations = registrations;
  registration.resolve();
  await Promise.all([firstSave, secondSave, thirdSave]);
  await setImmediate();
  assert.equal(overlappingRegistrations, 1);
  assert.equal(registered, false);
});

test('options load local settings without waiting for the profile and keep new choices when it arrives', async () => {
  class Control extends EventTarget {
    checked = false;
    disabled = false;
    value = '';
    textContent = '';
    hidden = false;
    classList = { add() {}, remove() {}, toggle() {} };
    append() {}
    querySelector() { return new Control(); }
  }
  const html = await readFile(new URL('../src/options/index.html', import.meta.url), 'utf8');
  const controls = new Map([...html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/gu)].map((match) => {
    const control = new Control();
    control.disabled = /\bdisabled\b/u.test(match[0]);
    return [match[1]!, control];
  }));
  const settings = deferred<unknown>();
  const bootstrap = deferred<unknown>();
  const initial = { ...defaultSettings, autoCloseOnOutsideClick: true, popupSize: 'large' as const };
  let saved: ExtensionSettings = { ...initial };
  await runInNewContext(`(async () => { ${bundles[2]!} })()`, {
    chrome: {
      storage: { sync: { get: async () => ({}) } },
      i18n: { getUILanguage: () => 'en' },
      runtime: {
        sendMessage: async (request: ExtensionRequest) => {
          if (request.type === 'GET_SETTINGS') return settings.promise;
          if (request.type === 'GET_BOOTSTRAP') return bootstrap.promise;
          assert.equal(request.type, 'UPDATE_SETTINGS');
          if (request.type === 'UPDATE_SETTINGS') saved = { ...saved, ...request.settings };
          return { ok: true, data: saved };
        }
      }
    },
    document: {
      getElementById: (id: string) => controls.get(id),
      documentElement: { dataset: {} },
      body: new Control(),
      querySelectorAll: () => [],
      createElement: () => new Control()
    },
    window: { location: { search: '' }, setTimeout: () => 1, clearTimeout() {} },
    URLSearchParams
  });
  const ids = ['selection-action', 'double-click-translation', 'auto-close-outside', 'popup-size'];
  for (const id of ids) assert.equal(controls.get(id)!.disabled, true);
  settings.resolve({ ok: true, data: initial });
  await setImmediate();
  for (const id of ids) assert.equal(controls.get(id)!.disabled, false);
  assert.equal(controls.get('popup-size')!.value, 'large');
  for (const id of ids) {
    const control = controls.get(id)!;
    if (id === 'popup-size') control.value = 'small';
    else control.checked = false;
    control.dispatchEvent(new Event('change'));
  }
  await setImmediate();
  bootstrap.resolve({ ok: true, data: { settings: initial, session: null } });
  await setImmediate();
  for (const id of ids) {
    const control = controls.get(id)!;
    assert.equal(control.disabled, false);
    if (id === 'popup-size') assert.equal(control.value, 'small');
    else assert.equal(control.checked, false);
  }
  assert.deepEqual(saved, {
    ...initial, selectionAction: false, doubleClickTranslation: false,
    autoCloseOnOutsideClick: false, popupSize: 'small'
  });
});

test('a late content bootstrap cannot undo a behavior change already received', async () => {
  const config = deferred<unknown>();
  const listeners = new Map<string, unknown>();
  let receive!: (message: unknown, sender: unknown, respond: (value: unknown) => void) => void;
  runInNewContext(bundles[1]!, {
    chrome: {
      i18n: { getUILanguage: () => 'en' },
      runtime: {
        onMessage: { addListener(callback: typeof receive) { receive = callback; } },
        sendMessage: () => config.promise
      }
    },
    document: {
      addEventListener(type: string, callback: unknown) { listeners.set(type, callback); },
      removeEventListener(type: string) { listeners.delete(type); }
    },
    window: { requestAnimationFrame() {}, addEventListener() {}, removeEventListener() {} }
  });
  receive({
    type: 'GOTIT_BEHAVIOR_CHANGED',
    selectionAction: false,
    doubleClickTranslation: false,
    autoCloseOnOutsideClick: true,
    popupSize: 'large'
  }, {}, () => {});
  config.resolve({ ok: true, data: { ...defaultSettings, uiLocale: 'en', translationMethod: 'dictionary' } });
  await setImmediate();
  assert.equal(listeners.has('mouseup'), false);
  assert.equal(listeners.has('dblclick'), false);
});
