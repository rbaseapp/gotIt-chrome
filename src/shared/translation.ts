import type { TranslationMethod } from './types';

export type EffectiveTranslationMethod = 'dictionary' | 'ai';

// The background request may use two 30-second network attempts (for example
// while a Render service wakes up), so the inline UI must not time out first.
export const INLINE_TRANSLATION_TIMEOUT_MS = 70_000;

/** Google is the standard provider; AI is used only when the user explicitly selected it. */
export function effectiveTranslationMethod(
  preference: TranslationMethod | null | undefined
): EffectiveTranslationMethod {
  return preference === 'ai' ? 'ai' : 'dictionary';
}
