import { loadGameCatalog } from "./catalog.js";

// Paths in [Maps] are relative to main-config.txt, just as they are in the game.
// Website editing is intentionally limited to the editor's own HTTP(S) origin.
export function editorWebsiteURL(value, base, origin) {
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) {
    throw new Error('Website maps and main-config.txt must use the same HTTP(S) origin as the editor.');
  }
  return url.href;
}

export async function readEditorWebsiteText(url, timeout = 10000) {
  const response = await fetch(url, {
    cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    redirect: 'error', signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`Could not load ${new URL(url).pathname}: HTTP ${response.status}.`);
  if (Number(response.headers.get('content-length') || 0) > 2_000_000) {
    await response.body?.cancel();
    throw new Error('Configuration exceeds 2 MB.');
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) throw new Error('Configuration exceeds 2 MB.');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel(); }
}

export async function readEditorDirectory(mainPath, pageURL, gameId) {
  const origin = new URL(pageURL).origin;
  const mainURL = editorWebsiteURL(mainPath, pageURL, origin);
  const catalog = await loadGameCatalog(mainURL, readEditorWebsiteText);
  const selected = catalog.games.get(gameId || catalog.defaultId);
  if (!selected) throw new Error(`Selected game ${gameId || catalog.defaultId} is unavailable. ${catalog.failures.join(' ')}`);
  return { ...selected, files: new Map([...selected.files].sort(([a], [b]) => a - b)), catalog };
}
