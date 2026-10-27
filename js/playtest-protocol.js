// Data-only messages shared by the standalone editor bundle and game page.
export const PLAYTEST_CHANNEL = 'maze-craze-playtest';
export const PLAYTEST_VERSION = 2;
export function playtestMessage(session, type, details = {}) {
  return { ...details, channel: PLAYTEST_CHANNEL, version: PLAYTEST_VERSION, session, type };
}
export function isPlaytestMessage(data, session) {
  return data !== null && typeof data === 'object' && !Array.isArray(data)
    && data.channel === PLAYTEST_CHANNEL && data.version === PLAYTEST_VERSION
    && data.session === session && typeof data.type === 'string';
}
export function validTestSnapshot(data) {
  return (data.gameId === undefined || (typeof data.gameId === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(data.gameId)))
    && Number.isSafeInteger(data.mapId) && data.mapId > 0
    && typeof data.text === 'string' && data.text.length > 0
    && data.text.length <= 2_000_000 && new TextEncoder().encode(data.text).length <= 2_000_000;
}
