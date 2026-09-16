import assert from 'node:assert/strict';
import test from 'node:test';
import { inferItemType } from '../src/shared/item-type';

test('detects a single word and a multi-word phrase', () => {
  assert.equal(inferItemType('resilient', null), 'word');
  assert.equal(inferItemType('in spite of', null), 'phrase');
});

test('uses the detected part of speech for phrasal verbs and expressions', () => {
  assert.equal(inferItemType('give up', 'phrasal verb'), 'phrasal_verb');
  assert.equal(inferItemType('break a leg', 'idiom'), 'expression');
  assert.equal(inferItemType('לקחת ללב', 'ביטוי'), 'expression');
});
