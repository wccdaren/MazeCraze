import { parseMain, parseMap, SpecError } from './spec.js';
import { Game } from './engine.js';
import { playtestMessage, isPlaytestMessage, validTestSnapshot } from './playtest-protocol.js';

// WORDPRESS SETUP: Change this ONE URL to your uploaded main-config.txt URL.
// Relative map/image URLs resolve against their own configuration file, not the WordPress page.
const MAIN_CONFIG_URL = new URL('../main-config.txt', import.meta.url).href;

const $ = id => document.getElementById(id);
const dialogs = ['welcome-dialog', 'interaction-dialog', 'pack-dialog', 'help-dialog'];
let config, game, welcomeComplete = false, viewIndex = 0, cachedMaps = new Map(), lastMapId;
const testSession = new URLSearchParams(location.search).get('editorTest');
const editorTest = window.parent !== window && ['http:', 'https:'].includes(location.protocol)
  && /^[a-f0-9]{32}$/.test(testSession || '');
let testSource = null, testStarting = false, testFocus = null;
const tellEditor = (type, details = {}) => {
  if (editorTest) window.parent.postMessage(playtestMessage(testSession, type, details), location.origin);
};
const warnings = new Set();
const button = (text, action, className = '') => {
  const element = document.createElement('button');
  element.type = 'button'; element.textContent = text; element.className = className;
  element.addEventListener('click', action); return element;
};
function resourceURL(value, base) {
  const url = new URL(value, base);
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol) || (url.protocol === 'http:' && url.origin !== location.origin)) throw new SpecError('Assets must use HTTPS or same-origin development URLs.');
  return url.href;
}
async function readText(url) {
  const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(config?.timeout ?? 10000), cache: 'no-cache' });
  if (!response.ok) throw new SpecError(`Could not load ${new URL(url).pathname}: HTTP ${response.status}.`);
  resourceURL(response.url, url);
  if (Number(response.headers.get('content-length') || 0) > 2_000_000) throw new SpecError('Configuration exceeds 2 MB.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder(); let size = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) throw new SpecError('Configuration exceeds 2 MB.');
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode(); return text;
  } finally { await reader.cancel(); }
}
function addWarning(message) {
  if (warnings.has(message)) return;
  warnings.add(message); $('diagnostics').hidden = false;
  const li = document.createElement('li'); li.textContent = message; $('warning-list').append(li);
}
async function loadMap(id) {
  if (cachedMaps.has(id)) return cachedMaps.get(id);
  if (!config.files.has(id)) throw new SpecError(`Map ${id} has no URL in the main configuration.`);
  const url = config.files.get(id);
  const map = parseMap(testSource?.id === id ? testSource.text : await readText(url), id);
  for (const block of map.blocks.values()) { block.image = resourceURL(block.image, url); block.picture = resourceURL(block.picture, url); }
  for (const warning of map.warnings) addWarning(warning);
  cachedMaps.set(id, map); return map;
}
function image(src, alt, className = '') {
  const img = document.createElement('img'); img.src = src; img.alt = alt; img.className = className;
  img.addEventListener('error', () => addWarning(`An image could not be loaded: ${new URL(src).pathname}`), { once: true });
  return img;
}
function log(message) {
  const li = document.createElement('li'); li.textContent = message; $('journal').prepend(li);
  while ($('journal').children.length > 7) $('journal').lastElementChild.remove();
}
function render() {
  if (!game?.map) return;
  const map = game.map;
  if (lastMapId !== map.id) { viewIndex = 0; lastMapId = map.id; }
  $('map-name').textContent = map.name;
  $('position').textContent = `X ${game.player.x} · Y ${game.player.y}`;
  $('map-size').textContent = `${map.width} × ${map.height} world`;
  $('player-label').textContent = game.player.name;
  const select = $('view-select'); select.replaceChildren();
  map.views.forEach((view, index) => {
    const option = document.createElement('option'); option.value = index;
    const [u,r,d,l] = [...view].map(Number); option.textContent = `${view} · ${l+r+1} × ${u+d+1}`;
    option.selected = index === viewIndex; select.append(option);
  });
  const [up, right, down, left] = [...map.views[viewIndex]].map(Number);
  const columns = left + right + 1;
  const board = $('board'); board.replaceChildren(); board.style.gridTemplateColumns = `24px repeat(${columns}, 32px)`;
  const label = (text, y = false) => { const el = document.createElement('span'); el.className = y ? 'axis y' : 'axis'; el.textContent = text; return el; };
  board.append(label('Y/X'));
  for (let x = game.player.x - left; x <= game.player.x + right; x++) board.append(label(x >= 1 && x <= map.width ? x : '·'));
  for (let y = game.player.y + up; y >= game.player.y - down; y--) {
    board.append(label(y >= 1 && y <= map.height ? y : '·', true));
    for (let x = game.player.x - left; x <= game.player.x + right; x++) {
      const block = game.at(x, y), tile = document.createElement('div'); tile.className = 'tile';
      tile.dataset.x = x; tile.dataset.y = y;
      tile.title = x >= 1 && y >= 1 && x <= map.width && y <= map.height ? `(${x},${y}) ${block.name}` : 'Beyond the map';
      tile.append(image(block.image, block.name));
      if (x === game.player.x && y === game.player.y) { tile.classList.add('player'); tile.append(image(config.images.Player, game.player.name, 'avatar')); }
      board.append(tile);
    }
  }
  board.setAttribute('aria-label', `${map.name}. ${game.player.name} at X ${game.player.x}, Y ${game.player.y}. Use arrows to move.`);
  const count = game.player.inventory.length;
  $('pack-summary').textContent = count ? `${count} useful ${count === 1 ? 'find' : 'finds'} tucked safely away.` : 'A little room for something useful.';
  const preview = $('equipment-preview'); preview.replaceChildren();
  for (const item of [...game.equipment('clothing'), ...game.equipment('weapons')]) {
    const def = game.definition(item), chip = document.createElement('span'); chip.append(image(def.image, ''), document.createTextNode(def.name)); preview.append(chip);
  }
  if (!preview.childNodes.length) preview.textContent = 'Wearing: a red hat and a hopeful smile.';
  document.querySelectorAll('[data-move]').forEach(el => { el.disabled = game.ended || game.busy; });
  $('pack-button').disabled = game.ended;
}
function closeDialog(id) { $(id).close(); if (welcomeComplete) $('board').focus({ preventScroll: true }); }
function showInteraction() {
  const block = game.pending.block;
  $('interaction-eyebrow').textContent = 'A DISCOVERY ON THE TRAIL';
  $('interaction-title').textContent = block.name;
  $('interaction-message').textContent = block.message;
  $('interaction-picture').src = block.picture;
  $('interaction-picture').alt = block.name;
  $('interaction-error').textContent = '';
  const choices = $('interaction-choices'); choices.replaceChildren();
  game.choices().forEach((choice, index) => choices.append(button(choice.text, () => choose(index))));
  $('interaction-cancel').hidden = false;
  $('interaction-cancel').textContent = block.cancel;
  $('interaction-cancel').onclick = () => { game.cancel(); closeDialog('interaction-dialog'); };
  if (!$('interaction-dialog').open) $('interaction-dialog').showModal();
}
function choose(index) {
  const choice = game.choices()[index];
  if (!['UseInventory', 'Attack'].includes(choice.action)) { finishChoice(index); return; }
  const available = game.eligible(choice.action);
  if (!available.length) {
    $('interaction-error').textContent = choice.action === 'Attack' ? "With what? You haven't got any weapons in your hands! Leave, open your pack, and wield one." : 'Your pack has no usable items. Keep exploring!';
    return;
  }
  $('interaction-error').textContent = '';
  $('interaction-message').textContent = choice.prompt;
  const choices = $('interaction-choices'); choices.replaceChildren();
  for (const item of available) {
    const def = game.definition(item);
    choices.append(button(`${def.name}${choice.action === 'Attack' ? ` · power ${def.power}` : ''}`, () => finishChoice(index, item.uid)));
  }
  choices.append(button('← Back to choices', showInteraction, 'quiet'));
}
async function finishChoice(index, uid) {
  if (game?.paused) return;
  $('interaction-error').textContent = '';
  tellEditor('busy', { busy: true });
  const controls = [...$('interaction-dialog').querySelectorAll('button')]; controls.forEach(el => { el.disabled = true; });
  try {
    const result = await game.resolve(index, uid);
    log(result.message); render();
    $('interaction-eyebrow').textContent = result.ended ? 'A VERY HAPPY ENDING' : result.passed ? 'A PUZZLE SOLVED' : 'ANOTHER IDEA, PERHAPS?';
    $('interaction-title').textContent = result.ended ? 'You saved the princess!' : result.passed ? 'Well done, wayfarer.' : 'Not quite…';
    $('interaction-message').textContent = result.message;
    $('interaction-picture').src = result.target.picture;
    $('interaction-picture').alt = result.target.name;
    $('interaction-choices').replaceChildren(button(result.ended ? 'Back to the garden' : 'Continue the adventure →', () => closeDialog('interaction-dialog'), 'primary'));
    $('interaction-cancel').hidden = true;
    if (!$('interaction-dialog').open) $('interaction-dialog').showModal();
    $('interaction-choices').querySelector('button').focus();
  } catch (error) { $('interaction-error').textContent = `This interaction could not finish: ${error.message} No outcome was applied. You can leave and try again.`; }
  finally { controls.forEach(el => { el.disabled = false; }); tellEditor('busy', { busy: false }); }
}
function move(dx, dy) {
  if (!welcomeComplete || game?.paused || dialogs.some(id => $(id).open)) return;
  try {
    const result = game.move(dx, dy);
    if (result.kind === 'wall') log(result.message);
    if (result.kind === 'interaction') showInteraction();
    else if (result.kind === 'ending') { showInteraction(); finishChoice(0); }
    render();
  } catch (error) { log(`Map problem: ${error.message}`); }
}
function renderPack() {
  const list = $('pack-items'); list.replaceChildren();
  if (!game.player.inventory.length) { const p = document.createElement('p'); p.textContent = 'An empty pack is full of possibilities. Look for a key or chest nearby.'; list.append(p); }
  for (const item of game.player.inventory) {
    const def = game.definition(item), row = document.createElement('article'); row.className = 'pack-item';
    row.append(image(def.image, def.name));
    const content = document.createElement('div'); content.className = 'item-content';
    const heading = document.createElement('h3'); heading.textContent = def.name;
    const info = document.createElement('p');
    const worn = [...game.player.clothing].filter(([,uid]) => uid === item.uid).map(([slot]) => slot);
    const wielded = [...game.player.weapons].filter(([,uid]) => uid === item.uid).map(([slot]) => slot);
    info.textContent = `${item.nid} · ${item.state}${def.itemKind === 'Weapon' ? ` · Power ${def.power}` : ''}${worn.length ? ` · Worn: ${worn.join(', ')}` : ''}${wielded.length ? ` · Wielded: ${wielded.join(', ')}` : ''}`;
    const actions = document.createElement('div'); actions.className = 'item-actions';
    const equip = hand => { game.equip(item.uid, hand); renderPack(); render(); };
    if (worn.length || wielded.length) actions.append(button('Put away', () => { game.unequip(item.uid); renderPack(); render(); }));
    else if (def.itemKind === 'Wearable') actions.append(button(`Wear · ${def.wearLocation}`, () => equip()));
    else if (def.itemKind === 'Weapon') {
      if (def.hands === 2) actions.append(button('Wield · both hands', () => equip('Right')));
      else actions.append(button('Wield · left hand', () => equip('Left')), button('Wield · right hand', () => equip('Right')));
    } else { const p = document.createElement('p'); p.textContent = 'Select this item when an interaction asks what to use.'; actions.append(p); }
    content.append(heading, info, actions); row.append(content); list.append(row);
  }
}
function applyStyle(style) {
  const fonts = { Georgia: "Georgia, 'Times New Roman', serif", System: 'system-ui, sans-serif', Monospace: 'ui-monospace, monospace' };
  if (fonts[style.Font]) document.documentElement.style.setProperty('--font', fonts[style.Font]);
  if (fonts[style.MessageFont]) document.documentElement.style.setProperty('--message-font', fonts[style.MessageFont]);
  for (const key of ['Accent', 'Panel', 'Text']) if (/^#[\da-fA-F]{6}$/.test(style[key] || '')) document.documentElement.style.setProperty(`--${key.toLowerCase()}`, style[key]);
}
async function boot() {
  try {
    const url = resourceURL(MAIN_CONFIG_URL, location.href);
    config = parseMain(await readText(url));
    for (const [id, path] of config.files) config.files.set(id, resourceURL(path, url));
    for (const key of ['Player', 'Princess']) {
      if (!config.images[key]) throw new SpecError(`[Images] needs ${key}.`);
      config.images[key] = resourceURL(config.images[key], url);
    }
    $('hero-gnome').src = config.images.Player;
    document.title = `${config.title} · A gnome-sized adventure`; applyStyle(config.style);
    if (editorTest) {
      document.body.classList.add('editor-test');
      $('boot-message').textContent = 'Waiting for the editor’s map…';
      tellEditor('ready'); return;
    }
    await loadMap(config.startMap);
    $('boot-message').textContent = '';
    $('welcome-dialog').showModal(); $('player-name').select();
  } catch (error) {
    $('boot-message').textContent = `The adventure could not load: ${error.message} Check the configuration URL and serve the files over HTTP(S), then reload.`;
    tellEditor('error', { message: error.message });
  }
}
async function startGame(name) {
  game = new Game(config, loadMap); await game.start(name);
  lastMapId = undefined; viewIndex = 0; welcomeComplete = true;
  $('adventure').hidden = false; $('restart-button').disabled = false;
  $('boot-message').textContent = '';
  $('journal').replaceChildren();
  log(`Welcome to ${game.map.name}, ${game.player.name}. Your adventure begins at (${game.player.x},${game.player.y}).`);
  render(); $('board').focus({ preventScroll: true });
}
window.addEventListener('message', async event => {
  if (!editorTest || event.origin !== location.origin || event.source !== window.parent
      || !isPlaytestMessage(event.data, testSession)) return;
  const data = event.data;
  if (data.type === 'start' && config && !game && !testStarting) {
    if (!validTestSnapshot(data)) { tellEditor('error', { message: 'Invalid or oversized editor map.' }); return; }
    testStarting = true;
    try {
      // The edited map overrides its server file for this test. Other maps still
      // come from the master directory. Relative artwork uses that map's URL.
      parseMap(data.text, data.mapId);
      testSource = { id: data.mapId, text: data.text };
      if (!config.files.has(data.mapId)) config.files.set(data.mapId, new URL(`../maps/map-${data.mapId}.txt`, import.meta.url).href);
      config.startMap = data.mapId;
      await startGame('Map tester'); tellEditor('running');
    } catch (error) { tellEditor('error', { message: error.message }); }
    finally { testStarting = false; }
  } else if (data.type === 'pause' && game && !game.paused) {
    if (!game.pause()) { tellEditor('pause-busy'); return; }
    testFocus = document.activeElement; document.body.inert = true;
    tellEditor('paused');
  } else if (data.type === 'resume' && game?.paused) {
    game.resume(); document.body.inert = false;
    tellEditor('running');
    (testFocus?.isConnected ? testFocus : $('board')).focus({ preventScroll: true });
  }
});
$('welcome-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.submitter; if (submit.disabled) return; submit.disabled = true;
  try {
    await startGame($('player-name').value); closeDialog('welcome-dialog');
  } catch (error) { $('welcome-error').textContent = error.message; }
  finally { submit.disabled = false; }
});
$('view-select').addEventListener('change', event => { viewIndex = Number(event.target.value); render(); });
$('pack-button').addEventListener('click', () => { renderPack(); $('pack-dialog').showModal(); });
$('pack-close').addEventListener('click', () => closeDialog('pack-dialog'));
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
$('help-close').addEventListener('click', () => closeDialog('help-dialog'));
$('restart-button').addEventListener('click', () => {
  if (window.confirm('Start a new adventure? This resets your pack and every map.')) { $('welcome-error').textContent = ''; $('welcome-dialog').showModal(); $('player-name').select(); }
});
for (const id of dialogs) $(id).addEventListener('cancel', event => {
  if (id === 'welcome-dialog' || game?.busy) { event.preventDefault(); return; }
  if (id === 'interaction-dialog') game.cancel();
});
document.querySelectorAll('[data-move]').forEach(el => el.addEventListener('click', () => move(...el.dataset.move.split(',').map(Number))));
document.addEventListener('keydown', event => {
  if (!welcomeComplete || game?.paused || dialogs.some(id => $(id).open) || event.altKey || event.ctrlKey || event.metaKey || ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
  const directions = { ArrowUp: [0,1], ArrowRight: [1,0], ArrowDown: [0,-1], ArrowLeft: [-1,0], Numpad8: [0,1], Numpad6: [1,0], Numpad2: [0,-1], Numpad4: [-1,0] };
  const direction = directions[event.code] || directions[event.key];
  if (direction) { event.preventDefault(); if (!event.repeat) move(...direction); }
});
boot();
