import assert from 'node:assert/strict';
import test from 'node:test';
import { nextPhase } from '../src/shared/state';

test('capture state machine follows preview and save lifecycle', () => {
  let phase = nextPhase('IDLE', 'PREVIEW');
  assert.equal(phase, 'LOADING_PREVIEW');
  phase = nextPhase(phase, 'PREVIEWED');
  assert.equal(phase, 'PREVIEW_READY');
  phase = nextPhase(phase, 'SAVE');
  assert.equal(phase, 'SAVING');
  phase = nextPhase(phase, 'SAVED');
  assert.equal(phase, 'SAVED');
});

test('safe retry remains in the save lifecycle and reset returns to idle', () => {
  assert.equal(nextPhase('SAVING', 'SAVE_ERROR'), 'SAVE_FAILED');
  assert.equal(nextPhase('SAVE_FAILED', 'SAVE'), 'SAVING');
  assert.equal(nextPhase('OFFLINE', 'SAVE'), 'SAVING');
  assert.equal(nextPhase('SAVED', 'RESET'), 'IDLE');
});
