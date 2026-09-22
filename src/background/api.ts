import { getAccessToken, RequestError } from './auth';
import type {
  CapturePreview,
  CaptureResult,
  CaptureSaveInput,
  GotItProfile
} from '../shared/types';
import type { PreviewRequest, ProfilePatch, SavedItemPatch } from '../shared/messages';

const RETRY_STATUSES = new Set([502, 503, 504]);

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = typeof payload.error === 'object' && payload.error !== null
      ? payload.error as Record<string, unknown>
      : {};
    throw new RequestError(
      typeof error.code === 'string' ? error.code : `HTTP_${response.status}`,
      typeof error.message === 'string' ? error.message : 'GotIt request failed',
      response.status,
      typeof payload.requestId === 'string' ? payload.requestId : response.headers.get('x-request-id') ?? undefined,
      error.details
    );
  }
  return payload as T;
}

async function productRequest<T>(
  path: string,
  init: RequestInit = {},
  options: { retrySafe?: boolean; idempotencyKey?: string } = {}
): Promise<T> {
  let refreshed = false;
  let retry = 0;
  while (true) {
    const token = await getAccessToken(refreshed);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(`${__GOTIT_API_BASE__}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
          Authorization: `Bearer ${token}`,
          'X-Request-Id': crypto.randomUUID(),
          ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {})
        }
      });
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        continue;
      }
      if (options.retrySafe && retry === 0 && RETRY_STATUSES.has(response.status)) {
        retry += 1;
        continue;
      }
      return await parseResponse<T>(response);
    } catch (error) {
      if (error instanceof RequestError) throw error;
      if (options.retrySafe && retry === 0) {
        retry += 1;
        continue;
      }
      throw new RequestError(navigator.onLine ? 'NETWORK_ERROR' : 'OFFLINE', 'GotIt is unreachable');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function getProfile(): Promise<GotItProfile> {
  const response = await productRequest<{ profile: GotItProfile }>('/profile');
  return response.profile;
}

export async function patchProfile(patch: ProfilePatch): Promise<GotItProfile> {
  const response = await productRequest<{ profile: GotItProfile }>('/profile', {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  return response.profile;
}

export async function previewCapture(input: PreviewRequest): Promise<CapturePreview> {
  const response = await productRequest<{ preview: CapturePreview }>('/captures/preview', {
    method: 'POST',
    body: JSON.stringify(input)
  }, { retrySafe: true });
  return response.preview;
}

export async function saveCapture(input: CaptureSaveInput, eventId: string): Promise<CaptureResult> {
  const response = await productRequest<{ capture: CaptureResult }>('/captures', {
    method: 'POST',
    body: JSON.stringify(input)
  }, { retrySafe: true, idempotencyKey: eventId });
  return response.capture;
}

export async function updateSavedItem(learningItemId: string, patch: SavedItemPatch): Promise<void> {
  await productRequest(`/learning-items/${encodeURIComponent(learningItemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export async function removeSavedItem(learningItemId: string): Promise<void> {
  await productRequest(`/learning-items/${encodeURIComponent(learningItemId)}`, {
    method: 'DELETE'
  });
}
