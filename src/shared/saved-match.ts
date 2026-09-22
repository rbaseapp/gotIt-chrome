import type { ExistingSense } from './types';

export function normalizeSavedTranslation(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
}

export function findMatchingSavedSense(
  senses: readonly ExistingSense[],
  translation: string
): ExistingSense | null {
  const normalizedTranslation = normalizeSavedTranslation(translation);
  if (!normalizedTranslation) return null;
  return senses.find((sense) =>
    [sense.primaryTranslation, ...sense.variants]
      .some((value) => normalizeSavedTranslation(value) === normalizedTranslation)
  ) ?? null;
}
