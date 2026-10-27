import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Game } from '../js/engine.js';
import { parseMain, parseMap } from '../js/spec.js';
import { loadGameCatalog, resolveArtwork } from '../js/catalog.js';
import { inventoryStacks, selectionStacks } from '../js/inventory.js';
import { HoldMovement } from '../js/movement.js';
import { createMap, nextBlock, saveBlock, deleteBlock, exportMap, importMap, applyMapSettings, EditorHistory } from '../js/editor-model.js';
const base = 'https://maze.example/main-config.txt';
const reader = url => readFile(new URL('../' + new URL(url).pathname.slice(1), import.meta.url), 'utf8');
const catalog = await loadGameCatalog(base, reader);
const fixture = async (id = 'main') => {
  const config = catalog.games.get(id);
  const game = new Game(config, async number => parseMap(await reader(config.files.get(number)), number));
  await game.start('Pip'); return game;
};
const give = (game, nid, state = 'Working') => { const item = { uid: game.nextUID++, nid, state }; game.player.inventory.push(item); return item; };

test('catalog keeps legacy maps and loads independent nested game configurations with inherited settings', () => {
  assert.deepEqual([...catalog.games.keys()], ['main', 'sebastian', 'esther']); assert.deepEqual(catalog.failures, []);
  const esther = catalog.games.get('esther');
  assert.equal(esther.files.get(1), 'https://maze.example/maps/esther/map-1.txt');
  assert.equal(esther.style.Font, 'Georgia'); assert.equal(esther.style.Accent, '#e4b6ef');
  assert.equal(esther.images.Player, 'https://maze.example/assets/gnome.png');
  assert.equal(esther.imageCatalog.Tree, 'https://maze.example/assets/tree.png');
});
test('game IDs isolate identical NIDs, cells and variables', async () => {
  const first = await fixture(), second = await fixture('esther');
  first.map.cells[1][1] = '1/2.1'; first.player.variables.PuzzlesSolved = 12; give(first, '1/4.1');
  assert.equal(second.quantity('1/4.1'), 0); assert.equal(second.player.variables.PuzzlesSolved, 0);
  assert.equal(second.at(2,2).type, 'Move'); assert.notEqual(first.block('1/4.1').name, second.block('1/4.1').name);
});
test('all supplied game maps parse without warnings and use valid catalog images', async () => {
  for (const config of catalog.games.values()) for (const [id, url] of config.files) {
    const map = parseMap(await reader(url), id); assert.deepEqual(map.warnings, []);
    for (const block of map.blocks.values()) assert.match(resolveArtwork(block.image, config, url), /^https:\/\/maze\.example\//);
  }
});
test('catalog artwork aliases require real entries; relative image paths keep the map URL as their base', () => {
  const settings = catalog.games.get('esther');
  assert.equal(resolveArtwork('@Tree', settings, settings.files.get(1)), 'https://maze.example/assets/tree.png');
  assert.equal(resolveArtwork('../../assets/tree.png', settings, settings.files.get(1)), 'https://maze.example/assets/tree.png');
  assert.throws(() => resolveArtwork('@constructor', settings, settings.files.get(1)), /Unknown image/);
});
test('game-specific 777 ending uses title and message placeholders', async () => {
  const game = await fixture('esther'); await game.ensureMap(2); game.mapId = 2;
  Object.assign(game.player, { x: 8, y: 6 }); assert.equal(game.move(1,0).kind, 'ending');
  const result = await game.resolve(0); assert.equal(result.ended, true); assert.match(result.message, /Pip.*restored the garden/);
  assert.equal(result.target.name, 'You restored the garden!');
});
test('catalog preserves working games when another configuration fails and rejects foreign config origins', async () => {
  const input = '[Game]\nStartGame: one\n[Games]\nGame.one: one.txt\nGame.bad: https://outside.example/bad.txt\n';
  const loaded = await loadGameCatalog(base, async url => url === base ? input : '[Game]\nTitle: One\nStartMap: 1\n[Maps]\nMap.1: map.txt\n');
  assert.equal(loaded.games.has('one'), true); assert.equal(loaded.failures.length, 1);
  assert.throws(() => parseMain(input.replace('StartGame: one', 'StartGame: missing')), /StartGame/);
});
test('selection filters combine full NIDs and item groups and are enforced during resolve', async () => {
  const game = await fixture('esther'), key = give(game, '1/4.1');
  const other = give(game, '1/4.1', 'Cursed'); game.player.inventory.push({ uid: game.nextUID++, nid: '1/4.99', state: 'Working' });
  // A valid additional item definition makes a genuinely ineligible UID available.
  const fake = { ...game.block(key.nid), nid: '1/4.99', itemGroup: 'Coin' }; game.map.byNID.set(fake.nid, fake);
  Object.assign(game.player, { x: 5, y: 4 }); game.move(1,0); const choice = game.choices()[0];
  assert.deepEqual(game.eligible('UseInventory', choice).map(item => item.uid), [key.uid, other.uid]);
  await assert.rejects(game.resolve(0, game.player.inventory.at(-1).uid), /Choose an item/);
  assert.equal(game.pending.block.name, 'Trail Gate');
  choice.fields.SelectionItems = ''; assert.equal(game.eligible('UseInventory', choice).length, 2);
  choice.fields.SelectionGroup = ''; assert.equal(game.eligible('UseInventory', choice).length, 3);
});
test('invalid SelectionItems and unsafe item-group labels are rejected by the data reader', async () => {
  const raw = await reader(catalog.games.get('esther').files.get(1));
  assert.throws(() => parseMap(raw.replace('SelectionItems: 1/4.1', 'SelectionItems: alert(1)'), 1), /full NIDs/);
  assert.throws(() => parseMap(raw.replace('ItemGroup: Key', 'ItemGroup: <script>'), 1), /ItemGroup/);
});
test('display stacks retain every UID and distinguish conditions when selecting a copy', () => {
  const items = [{ uid: 1, nid: '1/4.1', state: 'Working' }, { uid: 2, nid: '1/4.1', state: 'Working' }, { uid: 3, nid: '1/4.1', state: 'Cursed' }, { uid: 4, nid: '2/4.1', state: 'Working' }];
  assert.deepEqual(inventoryStacks(items).map(s => [s.mapId, s.copies.length]), [[1, 3], [2, 1]]);
  assert.deepEqual(selectionStacks(items).map(s => s.length), [2, 1, 1]); assert.equal(items.length, 4);
});
test('discard removes one unequipped copy and protects equipped items and pending outcomes', async () => {
  const game = await fixture(), first = give(game, '1/4.1'), second = give(game, '1/4.1'), sword = give(game, '1/4.2');
  game.discard(first.uid); assert.equal(game.quantity(first.nid), 1); assert.equal(game.player.inventory[0].uid, second.uid);
  game.equip(sword.uid); assert.throws(() => game.discard(sword.uid), /Put the equipped/);
  game.unequip(sword.uid); game.discard(sword.uid); assert.equal(game.equipment('weapons').length, 0);
  game.pause(); assert.throws(() => game.discard(second.uid), /interaction/); game.resume();
  Object.assign(game.player, { x: 7, y: 5 }); game.move(1,0); assert.throws(() => game.discard(second.uid), /interaction/);
});
test('deleted block indices and NIDs stay retired after export/reopen; imported identifiers remain stable', () => {
  let doc = createMap(); const added = nextBlock(doc); saveBlock(doc, null, added); deleteBlock(doc, added.index);
  doc = importMap(exportMap(doc)); const next = nextBlock(doc);
  assert.ok(next.index > added.index); assert.notEqual(next.fields.NID, added.fields.NID);
  assert.equal(doc.blocks[0].index, 1); assert.equal(doc.blocks[0].fields.NID, '1/1.1');
});
test('map renumbering remaps selection lists and preserves namespace counters', () => {
  const doc = createMap(), added = nextBlock(doc); added.choices[0].fields.SelectionItems = '1/4.1 | 2/4.1'; saveBlock(doc, null, added);
  applyMapSettings(doc, { ...doc.map, ID: '7' }, doc.variables, doc.format);
  assert.equal(doc.blocks.at(-1).choices[0].fields.SelectionItems, '1/4.1 | 2/4.1'); // Undefined references are not invented.
  assert.equal(doc.blocks.at(-1).fields.NID, '7/3.1');
});
test('held movement steps immediately, waits 300ms, repeats at 200ms, and stops when blocked or disallowed', () => {
  let now = 0, nextId = 0, calls = [], allowed = true, blocked = false; const tasks = new Map();
  const clock = { setTimeout(fn, delay) { const id = ++nextId; tasks.set(id, { fn, time: now + delay }); return id; }, clearTimeout(id) { tasks.delete(id); } };
  const tick = ms => { const end = now + ms; while (true) { const entry = [...tasks].sort((a,b) => a[1].time-b[1].time)[0]; if (!entry || entry[1].time > end) break; now = entry[1].time; tasks.delete(entry[0]); entry[1].fn(); } now = end; };
  const hold = new HoldMovement((...args) => { calls.push(args); return !blocked; }, () => allowed, clock);
  hold.start('ArrowRight', [1,0]); assert.equal(calls.length, 1); tick(299); assert.equal(calls.length, 1); tick(1); assert.equal(calls.length, 2); tick(200); assert.equal(calls.length, 3);
  hold.release('ArrowRight'); tick(1000); assert.equal(calls.length, 3);
  hold.start('ArrowUp', [0,1]); blocked = true; tick(300); assert.equal(hold.key, null);
  blocked = false; hold.start('ArrowUp', [0,1]); allowed = false; tick(300); assert.equal(hold.key, null);
});

test('undoing a creation retains reserved identifiers even after saving the earlier creation', () => {
  const doc = createMap(), history = new EditorHistory(doc), first = nextBlock(doc);
  history.push(doc, 'Create block'); saveBlock(doc, null, first); history.markSaved(doc);
  const restored = history.undo(doc), second = nextBlock(restored);
  assert.ok(second.index > first.index); assert.notEqual(second.fields.NID, first.fields.NID);
});
