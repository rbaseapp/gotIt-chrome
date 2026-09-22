import assert from 'node:assert/strict';
import test from 'node:test';
import { findMatchingSavedSense } from '../src/shared/saved-match';
import type { ExistingSense } from '../src/shared/types';

const sense: ExistingSense = {
  learningItemId: '123e4567-e89b-42d3-a456-426614174000',
  sourceText: 'hello',
  userStatus: 'active',
  learningStatus: 'learning',
  primaryTranslation: 'שלום',
  variants: ['היי']
};

test('detects an already-saved translation without creating another save action', () => {
  assert.equal(findMatchingSavedSense([sense], '  שלום  ')?.learningItemId, sense.learningItemId);
  assert.equal(findMatchingSavedSense([sense], 'היי')?.learningItemId, sense.learningItemId);
});

test('does not mark a different translation as already saved', () => {
  assert.equal(findMatchingSavedSense([sense], 'ברכה'), null);
  assert.equal(findMatchingSavedSense([sense], ''), null);
});
