import { parseMap, SpecError } from './spec.js';
import { Game } from './engine.js';
import { loadGameCatalog, configURL, resolveArtwork } from './catalog.js';
import { readEditorWebsiteText } from './editor-directory.js';
import { inventoryStacks, selectionStacks } from './inventory.js';
import { HoldMovement } from './movement.js';
import { playtestMessage, isPlaytestMessage, validTestSnapshot } from './playtest-protocol.js';

// WEBSITE SETUP: Keep this pointing to the same master file as the editor.
const MAIN_CONFIG_URL = new URL('../main-config.txt', import.meta.url).href;
const $ = id => document.getElementById(id);
const dialogs = ['welcome-dialog', 'interaction-dialog', 'pack-dialog', 'help-dialog'];
let catalog, config, game, activeGameId, switching = false, welcomeComplete = false, viewIndex = 0, lastMapId;
const testSession = new URLSearchParams(location.search).get('editorTest');
const editorTest = window.parent !== window && ['http:', 'https:'].includes(location.protocol) && /^[a-f0-9]{32}$/.test(testSession || '');
let testStarting = false, testFocus = null;
const warnings = new Set();
const tellEditor = (type, details = {}) => { if (editorTest) window.parent.postMessage(playtestMessage(testSession, type, details), location.origin); };
const button = (text, action, className = '') => {
  const element = document.createElement('button'); element.type = 'button'; element.textContent = text; element.className = className;
  element.addEventListener('click', action); return element;
};
const element = (tag, text = '', className = '') => { const el = document.createElement(tag); el.textContent = text; el.className = className; return el; };
const canMove = () => welcomeComplete && game && !game.paused && !game.busy && !game.ended && !switching && !dialogs.some(id => $(id).open);
const hold = new HoldMovement(move, canMove);
function addWarning(message) {
  if (warnings.has(message)) return; warnings.add(message); $('diagnostics').hidden = false;
  $('warning-list').append(element('li', message));
}
function image(src, alt, className = '') {
  const img = document.createElement('img'); img.src = src; img.alt = alt; img.className = className;
  img.addEventListener('error', () => addWarning(`An image could not be loaded: ${new URL(src).pathname}`), { once: true }); return img;
}
function log(message) { $('journal').replaceChildren(element('li', message)); }
function makeMapLoader(settings, snapshot) {
  const sources = new Map();
  return async id => {
    if (sources.has(id)) return sources.get(id);
    const url = settings.files.get(id) || (snapshot?.mapId === id ? new URL(`map-${id}.txt`, settings.fallbackBase).href : null);
    if (!url) throw new SpecError(`Map ${id} has no URL in this game's configuration.`);
    const text = snapshot?.mapId === id ? snapshot.text : await readEditorWebsiteText(url, settings.timeout);
    const map = parseMap(text, id);
    for (const block of map.blocks.values()) {
      block.image = resolveArtwork(block.image, settings, url); block.picture = resolveArtwork(block.picture, settings, url);
    }
    sources.set(id, map); return map;
  };
}
function render() {
  if (!game?.map) return;
  const map = game.map;
  for (const warning of map.warnings) addWarning(warning);
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
      if (Math.abs(x - game.player.x) + Math.abs(y - game.player.y) === 1 && x >= 1 && y >= 1 && x <= map.width && y <= map.height) {
        tile.classList.add('neighbor'); tile.setAttribute('role', 'button'); tile.tabIndex = 0;
        tile.setAttribute('aria-label', `Move to X ${x}, Y ${y}`);
        tile.addEventListener('click', () => { hold.stop(); move(x - game.player.x, y - game.player.y); });
        tile.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); tile.click(); } });
      }
      if (x === game.player.x && y === game.player.y) { tile.classList.add('player'); tile.append(image(config.images.Player, game.player.name, 'avatar')); }
      board.append(tile);
    }
  }
  board.setAttribute('aria-label', `${map.name}. ${game.player.name} at X ${game.player.x}, Y ${game.player.y}. Use arrows to move.`);
  const count = game.player.inventory.length;
  $('pack-summary').textContent = count ? `${count} useful ${count === 1 ? 'find' : 'finds'} tucked safely away.` : 'A little room for something useful.';
  $('pack-button').textContent = `Inventory${count ? ` (${count})` : ''}`;
  document.querySelectorAll('[data-move]').forEach(el => { el.disabled = game.ended || game.busy || switching; });
  $('pack-button').disabled = game.ended || switching;
  $('game-select').disabled = switching || editorTest;
  $('restart-button').disabled = switching;
}
function closeDialog(id) { $(id).close(); if (welcomeComplete) $('board').focus({ preventScroll: true }); }
function openDialog(id) { hold.stop(); $(id).showModal(); }
function showInteraction() {
  hold.stop(); const block = game.pending.block;
  $('interaction-eyebrow').textContent = 'A DISCOVERY ON THE TRAIL'; $('interaction-title').textContent = block.name;
  $('interaction-message').textContent = block.message; $('interaction-picture').src = block.picture; $('interaction-picture').alt = block.name;
  $('interaction-error').textContent = '';
  const choices = $('interaction-choices'); choices.replaceChildren();
  game.choices().forEach((choice, index) => choices.append(button(choice.text, () => choose(index))));
  $('interaction-cancel').hidden = false; $('interaction-cancel').textContent = block.cancel;
  $('interaction-cancel').onclick = () => { game.cancel(); closeDialog('interaction-dialog'); };
  if (!$('interaction-dialog').open) openDialog('interaction-dialog');
}
function choose(index) {
  const choice = game.choices()[index];
  if (!['UseInventory', 'Attack'].includes(choice.action)) { finishChoice(index); return; }
  const available = game.eligible(choice.action, choice);
  if (!available.length) {
    $('interaction-error').textContent = choice.fields.NoSelectionMessage || (choice.action === 'Attack'
      ? "With what? You haven't got any weapons in your hands that can be tried here! Leave, open your pack, and wield one."
      : 'Your pack has no usable items for this choice. Keep exploring!'); return;
  }
  $('interaction-error').textContent = ''; $('interaction-message').textContent = choice.prompt;
  const choices = $('interaction-choices'); choices.replaceChildren();
  for (const copies of selectionStacks(available)) {
    const item = copies[0], def = game.definition(item);
    choices.append(button(`${def.name}${copies.length > 1 ? ` (Inventory: ${copies.length})` : ''}${item.state !== 'Working' ? ` · ${item.state}` : ''}${choice.action === 'Attack' ? ` · power ${def.power}` : ''}`, () => finishChoice(index, item.uid)));
  }
  choices.append(button('← Back to choices', showInteraction, 'quiet'));
}
async function finishChoice(index, uid) {
  if (game?.paused || game?.busy || switching) return;
  hold.stop(); $('interaction-error').textContent = ''; tellEditor('busy', { busy: true });
  const controls = [...$('interaction-dialog').querySelectorAll('button')]; controls.forEach(el => { el.disabled = true; });
  try {
    const result = await game.resolve(index, uid); log(result.message); render();
    $('interaction-eyebrow').textContent = result.ended ? 'A VERY HAPPY ENDING' : result.passed ? 'A PUZZLE SOLVED' : 'ANOTHER IDEA, PERHAPS?';
    $('interaction-title').textContent = result.ended ? (config.victoryTitle || 'You saved the princess!') : result.passed ? 'Well done, wayfarer.' : 'Not quite…';
    $('interaction-message').textContent = result.message; $('interaction-picture').src = result.target.picture; $('interaction-picture').alt = result.target.name;
    $('interaction-choices').replaceChildren(button(result.ended ? 'Close ending' : 'Continue the adventure →', () => closeDialog('interaction-dialog'), 'primary'));
    $('interaction-cancel').hidden = true;
    if (!$('interaction-dialog').open) openDialog('interaction-dialog');
    $('interaction-choices').querySelector('button').focus();
  } catch (error) { $('interaction-error').textContent = `This interaction could not finish: ${error.message} No outcome was applied. You can leave and try again.`; }
  finally { controls.forEach(el => { el.disabled = false; }); tellEditor('busy', { busy: false }); }
}
function move(dx, dy) {
  if (!canMove()) return false;
  try {
    const result = game.move(dx, dy);
    if (result.kind === 'wall') { hold.stop(); log(result.message); }
    if (result.kind === 'interaction') showInteraction();
    else if (result.kind === 'ending') { showInteraction(); finishChoice(0); }
    render(); return result.kind === 'move';
  } catch (error) { hold.stop(); log(`Map problem: ${error.message}`); return false; }
}
function equippedLabel(item) {
  const worn = [...game.player.clothing].filter(([, uid]) => uid === item.uid).map(([slot]) => slot);
  const wielded = [...game.player.weapons].filter(([, uid]) => uid === item.uid).map(([slot]) => slot);
  return worn.length ? `Worn: ${worn.join(', ')}` : wielded.length ? `Wielded: ${wielded.join(', ')}` : '';
}
function renderPack() {
  const list = $('pack-items');
  const openItems = new Set([...list.querySelectorAll('details.pack-item[open]')].map(el => el.dataset.nid));
  const mapState = new Map([...list.querySelectorAll('details.pack-map')].map(el => [Number(el.dataset.map), el.open]));
  list.replaceChildren(); $('pack-error').textContent = '';
  const equipped = [...game.equipment('clothing'), ...game.equipment('weapons')];
  $('pack-equipped').textContent = equipped.length ? `Equipped: ${equipped.map(item => `${game.definition(item).name} (${equippedLabel(item)})`).join('; ')}` : 'Equipped: nothing yet.';
  if (!game.player.inventory.length) { list.append(element('p', 'An empty pack is full of possibilities. Look for a key or chest nearby.')); return; }
  const stacks = inventoryStacks(game.player.inventory).sort((a, b) => a.mapId - b.mapId || game.block(a.nid).name.localeCompare(game.block(b.nid).name));
  const sections = new Map();
  for (const { nid, copies, mapId } of stacks) {
    if (!sections.has(mapId)) {
      const section = document.createElement('details'); section.className = 'pack-map'; section.dataset.map = mapId; section.open = mapState.get(mapId) ?? true;
      section.append(element('summary', `Map ${mapId} · ${game.maps.get(mapId)?.name || 'Source map'}`)); list.append(section); sections.set(mapId, section);
    }
    const def = game.block(nid), row = document.createElement('details'); row.className = 'pack-item'; row.dataset.nid = nid; row.open = openItems.has(nid);
    const summary = document.createElement('summary'), count = copies.length > 1 ? ` (Inventory: ${copies.length})` : '';
    const equippedCount = copies.filter(item => equippedLabel(item)).length;
    summary.append(image(def.image, ''), element('h3', `${def.name}${count}`), element('span', equippedCount ? `${equippedCount} equipped` : '', 'item-badge')); row.append(summary);
    const content = element('div', '', 'item-content'); content.append(element('p', `${nid} · ${def.itemKind}${def.power ? ` · Power ${def.power}` : ''}`));
    for (const family of selectionStacks(copies)) {
      const parts = [...family.filter(item => equippedLabel(item)).map(item => [item]), family.filter(item => !equippedLabel(item))].filter(part => part.length);
      for (const part of parts) {
        const item = part[0], equippedText = equippedLabel(item), actions = element('div', '', 'item-actions');
        content.append(element('p', `${item.state}${part.length > 1 ? ` · ${part.length} copies` : ''}${equippedText ? ` · ${equippedText}` : ''}`));
        const refresh = action => { try { action(); renderPack(); render(); } catch (error) { $('pack-error').textContent = error.message; } };
        const equip = hand => refresh(() => game.equip(item.uid, hand));
        if (equippedText) actions.append(button('Put away', () => refresh(() => game.unequip(item.uid))));
        else {
          if (def.itemKind === 'Wearable') actions.append(button(`Wear · ${def.wearLocation}`, () => equip()));
          else if (def.itemKind === 'Weapon') {
            if (def.hands === 2) actions.append(button('Wield · both hands', () => equip('Right')));
            else actions.append(button('Wield · left hand', () => equip('Left')), button('Wield · right hand', () => equip('Right')));
          }
          actions.append(button('Discard one', () => {
            if (window.confirm(`Discard one ${def.name}? It disappears for the rest of this run. You may need it to finish a puzzle.`)) refresh(() => { game.discard(item.uid); log(`You discard one ${def.name}.`); });
          }, 'quiet'));
        }
        content.append(actions);
      }
    }
    row.append(content); sections.get(mapId).append(row);
  }
}
function applyStyle(style) {
  for (const key of ['font', 'message-font', 'accent', 'panel', 'text']) document.documentElement.style.removeProperty(`--${key}`);
  const fonts = { Georgia: "Georgia, 'Times New Roman', serif", System: 'system-ui, sans-serif', Monospace: 'ui-monospace, monospace' };
  if (fonts[style.Font]) document.documentElement.style.setProperty('--font', fonts[style.Font]);
  if (fonts[style.MessageFont]) document.documentElement.style.setProperty('--message-font', fonts[style.MessageFont]);
  for (const key of ['Accent', 'Panel', 'Text']) if (/^#[\da-fA-F]{6}$/.test(style[key] || '')) document.documentElement.style.setProperty(`--${key.toLowerCase()}`, style[key]);
}
async function beginAdventure(id, name, { initial = false, snapshot = null } = {}) {
  if (switching || !catalog.games.has(id)) throw new SpecError(`Game ${id} is unavailable.`);
  hold.stop(); switching = true; tellEditor('busy', { busy: true }); if (game) render();
  try {
    const settings = { ...catalog.games.get(id) };
    if (snapshot) settings.startMap = snapshot.mapId;
    else if (initial && catalog.master.startMap !== undefined) settings.startMap = catalog.master.startMap;
    const next = new Game(settings, makeMapLoader(settings, snapshot)); await next.start(name);
    game = next; config = settings; activeGameId = id;
    for (const dialog of dialogs) if ($(dialog).open) $(dialog).close();
    warnings.clear(); $('warning-list').replaceChildren(); $('diagnostics').hidden = true;
    for (const warning of catalog.failures) addWarning(warning);
    for (const warning of game.map.warnings) addWarning(warning);
    lastMapId = undefined; viewIndex = 0; welcomeComplete = true;
    $('adventure').hidden = false; $('boot-message').textContent = ''; $('pack-items').replaceChildren();
    $('game-select').value = id; $('game-description').textContent = `${config.title}${config.author ? ` · by ${config.author}` : ''}`;
    $('hero-gnome').src = config.images.Player;
    $('game-credit').textContent = config.author ? `AN ADVENTURE BY ${config.author.toUpperCase()}` : 'A FAMILY ADVENTURE';
    document.title = `${config.title} · Maze Craze`; applyStyle(config.style);
    log(config.welcome || `Welcome to ${game.map.name}, ${game.player.name}. Your adventure begins at (${game.player.x},${game.player.y}).`);
  } finally { switching = false; if (game) { render(); $('board').focus({ preventScroll: true }); } tellEditor('busy', { busy: false }); }
}
async function boot() {
  try {
    catalog = await loadGameCatalog(configURL(MAIN_CONFIG_URL, location.href, true), readEditorWebsiteText);
    if (!catalog.games.has(catalog.defaultId)) throw new SpecError(`Default game ${catalog.defaultId} could not load. ${catalog.failures.join(' ')}`);
    for (const settings of catalog.games.values()) for (const key of ['Player', 'Princess']) if (!settings.images[key]) throw new SpecError(`[Images] needs ${key}.`);
    $('game-select').replaceChildren();
    for (const [id, settings] of catalog.games) { const option = element('option', settings.title); option.value = id; $('game-select').append(option); }
    $('game-select').value = catalog.defaultId;
    $('hero-gnome').src = catalog.games.get(catalog.defaultId).images.Player;
    if (editorTest) { document.body.classList.add('editor-test'); $('boot-message').textContent = 'Waiting for the editor’s map…'; tellEditor('ready'); return; }
    $('boot-message').textContent = ''; openDialog('welcome-dialog'); $('player-name').select();
  } catch (error) { $('boot-message').textContent = `The adventure could not load: ${error.message} Serve all files over HTTP(S), check the main configuration, then reload.`; tellEditor('error', { message: error.message }); }
}
window.addEventListener('message', async event => {
  if (!editorTest || event.origin !== location.origin || event.source !== window.parent || !isPlaytestMessage(event.data, testSession)) return;
  const data = event.data;
  if (data.type === 'start' && catalog && !game && !testStarting) {
    if (!validTestSnapshot(data)) { tellEditor('error', { message: 'Invalid or oversized editor map.' }); return; }
    testStarting = true;
    try { await beginAdventure(data.gameId || catalog.defaultId, 'Map tester', { snapshot: data }); tellEditor('running'); }
    catch (error) { tellEditor('error', { message: error.message }); } finally { testStarting = false; }
  } else if (data.type === 'pause' && game && !game.paused) {
    hold.stop(); if (switching || !game.pause()) { tellEditor('pause-busy'); return; }
    testFocus = document.activeElement; document.body.inert = true; tellEditor('paused');
  } else if (data.type === 'resume' && game?.paused) {
    game.resume(); document.body.inert = false; tellEditor('running');
    (testFocus?.isConnected ? testFocus : $('board')).focus({ preventScroll: true });
  }
});
$('welcome-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.submitter; if (submit.disabled) return; submit.disabled = true;
  try { await beginAdventure(activeGameId || catalog.defaultId, $('player-name').value, { initial: !welcomeComplete }); }
  catch (error) { $('welcome-error').textContent = error.message; } finally { submit.disabled = false; }
});
$('game-select').addEventListener('change', async event => {
  hold.stop(); const id = event.target.value; if (id === activeGameId) return;
  if (!window.confirm('Start this game with fresh progress? Your current inventory and map changes will be reset. Your nickname stays.')) { event.target.value = activeGameId; return; }
  try { await beginAdventure(id, game.player.name); } catch (error) { event.target.value = activeGameId; log(`Game could not start: ${error.message}`); }
});
$('view-select').addEventListener('change', event => { hold.stop(); viewIndex = Number(event.target.value); render(); });
$('pack-button').addEventListener('click', () => { renderPack(); openDialog('pack-dialog'); });
$('pack-close').addEventListener('click', () => closeDialog('pack-dialog'));
$('help-button').addEventListener('click', () => openDialog('help-dialog'));
$('help-close').addEventListener('click', () => closeDialog('help-dialog'));
$('restart-button').addEventListener('click', () => {
  hold.stop(); if (window.confirm('Start a new adventure? This resets your pack and every map in this game.')) { $('welcome-error').textContent = ''; openDialog('welcome-dialog'); $('player-name').select(); }
});
for (const id of dialogs) $(id).addEventListener('cancel', event => {
  hold.stop(); if (id === 'welcome-dialog' || game?.busy || switching) { event.preventDefault(); return; }
  if (id === 'interaction-dialog') game.cancel();
});
document.querySelectorAll('[data-move]').forEach(el => el.addEventListener('click', () => { hold.stop(); move(...el.dataset.move.split(',').map(Number)); }));
const directions = { ArrowUp: [0,1], ArrowRight: [1,0], ArrowDown: [0,-1], ArrowLeft: [-1,0], Numpad8: [0,1], Numpad6: [1,0], Numpad2: [0,-1], Numpad4: [-1,0] };
document.addEventListener('keydown', event => {
  if (!canMove() || event.altKey || event.ctrlKey || event.metaKey || ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
  const direction = directions[event.code] || directions[event.key];
  if (direction) { event.preventDefault(); if (!event.repeat) hold.start(event.code || event.key, direction); }
});
document.addEventListener('keyup', event => hold.release(event.code || event.key));
document.addEventListener('focusin', event => { if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) hold.stop(); });
window.addEventListener('blur', () => hold.stop());
document.addEventListener('visibilitychange', () => { if (document.hidden) hold.stop(); });
boot();
