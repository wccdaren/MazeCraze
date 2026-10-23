import { parseMain } from "./spec.js";

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

export async function readEditorDirectory(mainPath, pageURL) {
  const origin = new URL(pageURL).origin;
  const mainURL = editorWebsiteURL(mainPath, pageURL, origin);
  const config = parseMain(await readEditorWebsiteText(mainURL));
  const files = new Map([...config.files]
    .sort(([a], [b]) => a - b)
    .map(([id, path]) => [id, editorWebsiteURL(path, mainURL, origin)]));
  return { files, timeout: config.timeout };
}
