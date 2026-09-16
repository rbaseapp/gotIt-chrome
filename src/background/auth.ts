import type { ClientError, CoreUser, PublicSession } from '../shared/types';

const APPLICATION_KEY = 'gotit';
const PERSISTENT_KEY = 'gotit.auth.persistent.v1';
const ACCESS_KEY = 'gotit.auth.access.v1';
const REFRESH_SKEW_MS = 60_000;

interface PersistentAuth {
  user: CoreUser;
  refreshToken: string;
}

interface AccessAuth {
  accessToken: string;
  expiresAt: number;
}

interface AuthResult {
  user: CoreUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

let refreshInFlight: Promise<string> | null = null;

export class RequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
    readonly requestId?: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'RequestError';
  }

  serializable(): ClientError {
    const result: ClientError = { code: this.code, message: this.message };
    if (this.status !== undefined) result.status = this.status;
    if (this.requestId) result.requestId = this.requestId;
    if (this.details !== undefined) result.details = this.details;
    return result;
  }
}

async function parseResponse(response: Response, label: string): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = typeof payload.error === 'object' && payload.error !== null
      ? payload.error as Record<string, unknown>
      : {};
    const code = typeof error.code === 'string' ? error.code : `HTTP_${response.status}`;
    const message = typeof error.message === 'string' ? error.message : label;
    const requestId = typeof payload.requestId === 'string'
      ? payload.requestId
      : response.headers.get('x-request-id') ?? undefined;
    throw new RequestError(code, message, response.status, requestId, error.details);
  }
  return payload;
}

function parseUser(value: unknown): CoreUser {
  if (typeof value !== 'object' || value === null) throw new RequestError('INVALID_AUTH_RESPONSE', 'Core returned an invalid user');
  const user = value as Record<string, unknown>;
  if (typeof user.id !== 'string' || typeof user.email !== 'string') {
    throw new RequestError('INVALID_AUTH_RESPONSE', 'Core returned an invalid user');
  }
  const result: CoreUser = { id: user.id, email: user.email };
  if (typeof user.emailVerified === 'boolean') result.emailVerified = user.emailVerified;
  return result;
}

function parseAuthResult(value: Record<string, unknown>, fallbackUser?: CoreUser): AuthResult {
  const user = value.user === undefined && fallbackUser ? fallbackUser : parseUser(value.user);
  if (
    typeof value.accessToken !== 'string' ||
    typeof value.refreshToken !== 'string' ||
    typeof value.expiresIn !== 'number' ||
    !Number.isFinite(value.expiresIn)
  ) throw new RequestError('INVALID_AUTH_RESPONSE', 'Core returned an invalid session');
  return { user, accessToken: value.accessToken, refreshToken: value.refreshToken, expiresIn: value.expiresIn };
}

async function storeAuth(result: AuthResult): Promise<PublicSession> {
  const expiresAt = Date.now() + result.expiresIn * 1000;
  await Promise.all([
    chrome.storage.local.set({ [PERSISTENT_KEY]: { user: result.user, refreshToken: result.refreshToken } satisfies PersistentAuth }),
    chrome.storage.session.set({ [ACCESS_KEY]: { accessToken: result.accessToken, expiresAt } satisfies AccessAuth })
  ]);
  return { user: result.user, expiresAt };
}

async function corePost(path: string, body: unknown): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${__CORE_API_BASE__}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Application-Key': APPLICATION_KEY },
      body: JSON.stringify(body)
    });
  } catch {
    throw new RequestError('OFFLINE', 'Core is unreachable');
  }
  return parseResponse(response, 'Authentication failed');
}

async function persistent(): Promise<PersistentAuth | null> {
  const stored = await chrome.storage.local.get(PERSISTENT_KEY);
  const value = stored[PERSISTENT_KEY] as Partial<PersistentAuth> | undefined;
  return value?.user?.id && value.user.email && value.refreshToken
    ? value as PersistentAuth
    : null;
}

async function access(): Promise<AccessAuth | null> {
  const stored = await chrome.storage.session.get(ACCESS_KEY);
  const value = stored[ACCESS_KEY] as Partial<AccessAuth> | undefined;
  return value?.accessToken && typeof value.expiresAt === 'number' ? value as AccessAuth : null;
}

async function refresh(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const saved = await persistent();
    if (!saved) throw new RequestError('AUTHENTICATION_REQUIRED', 'Sign in to GotIt', 401);
    try {
      const result = parseAuthResult(await corePost('/auth/refresh', { refreshToken: saved.refreshToken }), saved.user);
      await storeAuth(result);
      return result.accessToken;
    } catch (error) {
      await clearAuth();
      throw error;
    }
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const saved = await access();
    if (saved && saved.expiresAt > Date.now() + REFRESH_SKEW_MS) return saved.accessToken;
  }
  return refresh();
}

export async function getPublicSession(): Promise<PublicSession | null> {
  const saved = await persistent();
  if (!saved) return null;
  try {
    await getAccessToken();
    const current = await access();
    return current ? { user: saved.user, expiresAt: current.expiresAt } : null;
  } catch {
    return null;
  }
}

export async function signInWithEmail(mode: 'login' | 'register', email: string, password: string): Promise<PublicSession> {
  const payload = await corePost(`/auth/${mode}`, { email, password });
  return storeAuth(parseAuthResult(payload));
}

export async function signInWithGoogle(): Promise<PublicSession> {
  let tokenResult: chrome.identity.GetAuthTokenResult;
  try {
    tokenResult = await chrome.identity.getAuthToken({ interactive: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message.trim().slice(0, 300) : '';
    if (/cancel(?:led|ed)|user did not approve/iu.test(detail)) {
      throw new RequestError('GOOGLE_SIGN_IN_CANCELLED', 'Google sign-in was cancelled');
    }
    throw new RequestError(
      'GOOGLE_IDENTITY_FAILED',
      detail || 'Chrome could not start Google sign-in'
    );
  }
  if (!tokenResult.token) throw new RequestError('GOOGLE_SIGN_IN_FAILED', 'Google did not return an access token');
  try {
    return await storeAuth(parseAuthResult(await corePost('/auth/google/access-token', { accessToken: tokenResult.token })));
  } catch (error) {
    await chrome.identity.removeCachedAuthToken({ token: tokenResult.token }).catch(() => undefined);
    throw error;
  }
}

export async function clearAuth(): Promise<void> {
  await Promise.all([
    chrome.storage.local.remove(PERSISTENT_KEY),
    chrome.storage.session.remove(ACCESS_KEY)
  ]);
}

export async function signOut(): Promise<void> {
  const saved = await persistent();
  await clearAuth();
  if (saved?.refreshToken) {
    await corePost('/auth/logout', { refreshToken: saved.refreshToken }).catch(() => undefined);
  }
  await chrome.identity.clearAllCachedAuthTokens().catch(() => undefined);
}
