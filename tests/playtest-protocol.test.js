import test from 'node:test';
import assert from 'node:assert/strict';
import { playtestMessage, isPlaytestMessage, validTestSnapshot } from '../js/playtest-protocol.js';

test('playtest envelopes reject other sessions, versions, channels, and malformed data', () => {
  const message = playtestMessage('session-one', 'start', { mapId: 3, text: '[Map]' });
  assert.equal(isPlaytestMessage(message, 'session-one'), true);
  for (const bad of [null, [], 'start', {}, { ...message, version: 2 }, { ...message, channel: 'other' }, { ...message, type: 1 }]) {
    assert.equal(isPlaytestMessage(bad, 'session-one'), false);
  }
  assert.equal(isPlaytestMessage(message, 'session-two'), false);
});
test('test snapshots bound actual UTF-8 bytes and require a positive safe map ID', () => {
  assert.equal(validTestSnapshot({ mapId: 3, text: '[Map]' }), true);
  for (const mapId of [0, -1, 1.5, '3', NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(validTestSnapshot({ mapId, text: '[Map]' }), false);
  }
  for (const text of ['', 123, 'a'.repeat(2_000_001), '🌳'.repeat(500_001)]) {
    assert.equal(validTestSnapshot({ mapId: 1, text }), false);
  }
});
