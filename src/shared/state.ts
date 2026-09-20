import type { CapturePhase } from './types';

export type CaptureEvent =
  | 'RESET'
  | 'EXTRACT'
  | 'EXTRACTED'
  | 'PREVIEW'
  | 'PREVIEWED'
  | 'SAVE'
  | 'SAVED'
  | 'AUTH_ERROR'
  | 'CONTEXT_ERROR'
  | 'PREVIEW_ERROR'
  | 'SAVE_ERROR'
  | 'OFFLINE';

export function nextPhase(current: CapturePhase, event: CaptureEvent): CapturePhase {
  if (event === 'RESET') return 'IDLE';
  if (event === 'AUTH_ERROR') return 'AUTH_REQUIRED';
  if (event === 'OFFLINE') return 'OFFLINE';
  const transitions: Partial<Record<CapturePhase, Partial<Record<CaptureEvent, CapturePhase>>>> = {
    IDLE: { EXTRACT: 'EXTRACTING_CONTEXT', PREVIEW: 'LOADING_PREVIEW' },
    EXTRACTING_CONTEXT: { EXTRACTED: 'IDLE', CONTEXT_ERROR: 'CONTEXT_FAILED' },
    CONTEXT_FAILED: { EXTRACT: 'EXTRACTING_CONTEXT', PREVIEW: 'LOADING_PREVIEW' },
    PREVIEW_FAILED: { PREVIEW: 'LOADING_PREVIEW' },
    LOADING_PREVIEW: { PREVIEWED: 'PREVIEW_READY', PREVIEW_ERROR: 'PREVIEW_FAILED' },
    PREVIEW_READY: { PREVIEW: 'LOADING_PREVIEW', SAVE: 'SAVING' },
    SAVING: { SAVED: 'SAVED', SAVE_ERROR: 'SAVE_FAILED' },
    SAVE_FAILED: { SAVE: 'SAVING', PREVIEW: 'LOADING_PREVIEW' },
    SAVED: { PREVIEW: 'LOADING_PREVIEW', SAVE: 'SAVING' },
    AUTH_REQUIRED: { PREVIEW: 'LOADING_PREVIEW' },
    OFFLINE: { PREVIEW: 'LOADING_PREVIEW', SAVE: 'SAVING' }
  };
  return transitions[current]?.[event] ?? current;
}
