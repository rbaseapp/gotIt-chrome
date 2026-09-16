import assert from 'node:assert/strict';
import test from 'node:test';
import { sentenceAround } from '../src/shared/context';

test('extracts the sentence that contains the selected term', () => {
  const text = 'First sentence. The selected word is useful! Final sentence.';
  const start = text.indexOf('selected');
  assert.equal(sentenceAround(text, start, start + 8), 'The selected word is useful!');
});

test('supports Hebrew and CJK punctuation and normalizes whitespace', () => {
  const hebrew = 'משפט ראשון.  זו   המילה שבחרנו! משפט אחר.';
  const start = hebrew.indexOf('המילה');
  assert.equal(sentenceAround(hebrew, start, start + 5), 'זו המילה שבחרנו!');
  const japanese = '最初の文。保存する単語です！最後の文。';
  const jpStart = japanese.indexOf('単語');
  assert.equal(sentenceAround(japanese, jpStart, jpStart + 2), '保存する単語です!');
});

test('bounds sentence output by Unicode code points', () => {
  assert.equal([...sentenceAround(`Before. ${'😀'.repeat(20)}.`, 8, 10, 7)].length, 7);
});
