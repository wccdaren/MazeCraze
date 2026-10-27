import { parseMain, SpecError } from './spec.js';

// Only fixed configuration vocabulary is interpreted. All paths remain data.
export function configURL(value, base, sameOrigin = false) {
  const url = new URL(value, base), origin = new URL(base).origin;
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)
      || (url.protocol === 'http:' && url.origin !== origin) || (sameOrigin && url.origin !== origin)) {
    throw new SpecError('Configuration files must use the same HTTP(S) origin; artwork must use HTTPS or the same development origin.');
  }
  return url.href;
}
function absoluteConfig(raw, url) {
  return { ...raw, configURL: url,
    files: new Map([...raw.files].map(([id, path]) => [id, configURL(path, url, true)])),
    images: Object.fromEntries(Object.entries(raw.images).map(([key, path]) => [key, configURL(path, url)])),
    imageCatalog: Object.fromEntries(Object.entries(raw.imageCatalog).map(([key, path]) => [key, configURL(path, url)])),
  };
}
export async function loadGameCatalog(mainURL, readText) {
  const master = absoluteConfig(parseMain(await readText(mainURL)), mainURL);
  const games = new Map(), failures = [];
  if (master.files.size) games.set('main', { ...master, id: 'main', startMap: master.startMap || master.files.keys().next().value,
    fallbackBase: new URL('./maps/', mainURL).href });
  const entries = await Promise.all([...master.games].map(async ([id, path]) => {
    try {
      const url = configURL(path, mainURL, true), child = absoluteConfig(parseMain(await readText(url)), url);
      if (child.games.size || !child.files.size) throw new SpecError('A game configuration must list maps, not another game directory.');
      const startMap = child.startMap ?? child.files.keys().next().value;
      if (!child.files.has(startMap)) throw new SpecError('StartMap has no file in [Maps].');
      return [id, { ...master, ...child, id, startMap, fallbackBase: new URL('./', url).href,
        images: { ...master.images, ...child.images }, imageCatalog: { ...master.imageCatalog, ...child.imageCatalog },
        style: { ...master.style, ...child.style }, variables: { ...master.variables, ...child.variables } }];
    } catch (error) { failures.push(`Game ${id}: ${error.message}`); return null; }
  }));
  for (const entry of entries) if (entry) games.set(...entry);
  return { master, games, failures, defaultId: master.startGame };
}
export function resolveArtwork(path, config, mapURL) {
  if (String(path).startsWith('@')) {
    const key = String(path).slice(1);
    const value = Object.hasOwn(config.imageCatalog, key) ? config.imageCatalog[key] : null;
    if (!value) throw new SpecError(`Unknown image catalog entry ${path}.`);
    return value;
  }
  return configURL(path, mapURL);
}
