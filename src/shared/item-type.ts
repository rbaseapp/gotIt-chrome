import type { ItemType } from './types';

export function inferItemType(sourceText: string, partOfSpeech: string | null | undefined): ItemType {
  const descriptor = partOfSpeech?.normalize('NFKC').toLocaleLowerCase() ?? '';
  if (/phrasal[ _-]?verb|פועל\s+מורכב/iu.test(descriptor)) return 'phrasal_verb';
  if (/idiom|expression|ניב|ביטוי/iu.test(descriptor)) return 'expression';
  return sourceText.trim().split(/\s+/u).filter(Boolean).length <= 1 ? 'word' : 'phrase';
}
