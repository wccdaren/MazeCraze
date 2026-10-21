import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMain, parseMap } from '../js/spec.js';
import { Game } from '../js/engine.js';

const rawMain = await readFile(new URL('../main-config.txt', import.meta.url), 'utf8');
const rawMaps = new Map(await Promise.all([1,2].map(async id => [id, await readFile(new URL(`../maps/map-${id}.txt`, import.meta.url), 'utf8')])));
async function fixture() {
  const game = new Game(parseMain(rawMain), async id => {
    if (!rawMaps.has(id)) throw new Error('Map unavailable');
    return parseMap(rawMaps.get(id), id);
  });
  await game.start('Sebastian'); return game;
}
function give(game, nid) { const item = { uid: game.nextUID++, nid, state: 'Working' }; game.player.inventory.push(item); return item; }
function approach(game, x, y, dx = 1, dy = 0) {
  Object.assign(game.player, { x: x - dx, y: y - dy });
  return game.move(dx, dy);
}

test('both supplied maps parse with no warnings and valid one-based layouts', () => {
  for (const [id, text] of rawMaps) {
    const map = parseMap(text, id);
    assert.deepEqual(map.warnings, []);
    assert.equal(map.cells.length, map.height);
    assert.equal(map.cells[0].length, map.width);
    assert.ok(map.cells.flat().every(nid => nid === '@princess' || map.byNID.has(nid)));
  }
});
test('arrow directions follow positive Cartesian coordinates; edge never wraps', async () => {
  const game = await fixture();
  assert.equal(game.move(0,1).kind, 'move'); assert.equal(game.player.y, 4);
  assert.equal(game.move(-1,0).kind, 'interaction'); // the sign at (2,4)
  game.cancel(); Object.assign(game.player, { x: 1, y: 1 });
  assert.equal(game.move(-1,0).kind, 'wall'); assert.equal(game.player.x, 1);
  assert.throws(() => game.move(1,1), /orthogonal/);
});
test('a normal wall tree has no choices; its identical-looking secret tree does', async () => {
  const game = await fixture();
  assert.equal(approach(game,8,13).kind, 'wall');
  assert.equal(approach(game,8,14).kind, 'interaction');
  assert.equal(game.pending.block.image, game.block('1/2.1').image);
});
test('wrong key preserves inventory and position; right key consumes exactly one and enters default grass', async () => {
  const game = await fixture(), wrong = give(game,'1/4.3'), key = give(game,'1/4.1'); give(game,'1/4.1');
  approach(game,8,5);
  assert.equal((await game.resolve(0,wrong.uid)).passed, false);
  assert.equal(game.player.x,7); assert.equal(game.quantity('1/4.3'),1); assert.equal(game.at(8,5).nid,'1/3.3');
  game.move(1,0); assert.equal((await game.resolve(0,key.uid)).passed,true);
  assert.equal(game.quantity('1/4.1'),1); assert.equal(game.player.x,8); assert.equal(game.at(8,5).type,'Move');
});
test('cancel does not consume items or replace cells', async () => {
  const game = await fixture(); give(game,'1/4.1'); approach(game,8,5); game.cancel();
  assert.equal(game.quantity('1/4.1'),1); assert.equal(game.at(8,5).nid,'1/3.3');
});
test('pickup adds one item and clears only the chosen cell', async () => {
  const game = await fixture(); approach(game,4,10); await game.resolve(0);
  assert.equal(game.quantity('1/4.3'),1); assert.equal(game.at(4,10).type,'Move'); assert.equal(game.at(5,10).nid,'1/4.3');
});
test('boots must be worn, not just owned; success replaces mud with gravel', async () => {
  const game = await fixture(), boots = give(game,'1/4.5');
  approach(game,12,9,0,1); assert.equal((await game.resolve(0)).passed,false); assert.equal(game.player.y,8);
  game.equip(boots.uid); game.move(0,1); assert.equal((await game.resolve(0)).passed,true);
  assert.equal(game.player.y,9); assert.equal(game.at(12,9).nid,'1/1.2'); assert.equal(game.quantity(boots.nid),1);
});
test('attack only accepts wielded weapons; weak attack fails, strong succeeds without consuming sword', async () => {
  const game = await fixture(), dagger = give(game,'1/4.6'), sword = give(game,'1/4.2');
  approach(game,12,12,0,1);
  await assert.rejects(game.resolve(0,sword.uid), /weapons in your hands/);
  game.cancel(); game.equip(dagger.uid,'Left'); approach(game,12,12,0,1);
  const failure = await game.resolve(0,dagger.uid); assert.equal(failure.passed,false); assert.match(failure.message,/Wooden Dagger is too weak/);
  game.equip(sword.uid,'Right'); game.move(0,1);
  assert.equal((await game.resolve(0,sword.uid)).passed,true); assert.equal(game.quantity(sword.nid),1); assert.equal(game.quantity('1/4.3'),1);
});
test('weapon power equal to requirement fails a strict GreaterThan rule', async () => {
  const game = await fixture(); game.block('1/4.2').power = 6;
  const sword = give(game,'1/4.2'); game.equip(sword.uid); approach(game,12,12,0,1);
  assert.equal((await game.resolve(0,sword.uid)).passed,false);
});
test('PASS into an interaction replacement stays adjacent; a repeating chest gives another reward', async () => {
  const game = await fixture(), chest = game.block('1/3.2'); chest.choices[0].fields['Pass.ReplaceBlock'] = chest.nid;
  approach(game,3,6,0,1); await game.resolve(0);
  assert.equal(game.player.y,5); assert.equal(game.at(3,6).nid,chest.nid); assert.equal(game.quantity('1/4.5'),1);
  game.move(0,1); await game.resolve(0); assert.equal(game.quantity('1/4.5'),2);
});
test('FAIL never grants entry, even when its replacement is Move', async () => {
  const game = await fixture(), bomb = give(game,'1/4.3');
  game.block('1/3.3').choices[0].fields['Fail.ReplaceBlock'] = '1/1.2';
  approach(game,8,5); await game.resolve(0,bomb.uid);
  assert.equal(game.player.x,7); assert.equal(game.at(8,5).type,'Move'); assert.equal(game.quantity(bomb.nid),1);
});
test('successful bomb match consumes exactly one and clears the secret tree', async () => {
  const game = await fixture(), bomb = give(game,'1/4.3'); give(game,'1/4.3');
  approach(game,8,14); await game.resolve(0,bomb.uid);
  assert.equal(game.quantity(bomb.nid),1); assert.equal(game.player.x,8); assert.equal(game.at(8,14).type,'Move');
});
test('clothing overlap replaces whole items; gloves and weapon use separate slots; two-handed weapons displace both', async () => {
  const game = await fixture();
  const extra = (nid, fields) => { const def={...game.block('1/4.5'),nid,...fields}; game.map.byNID.set(nid,def); return give(game,nid); };
  const shoe=extra('1/4.20',{wearLocation:'LeftFoot'}), boots=give(game,'1/4.5');
  game.equip(shoe.uid); game.equip(boots.uid); assert.equal(game.equipment('clothing').length,1); assert.equal(game.quantity(shoe.nid),1);
  const glove=extra('1/4.21',{wearLocation:'Hands'}); game.equip(glove.uid);
  const sword=give(game,'1/4.2'), dagger=give(game,'1/4.6'); game.equip(sword.uid,'Left'); game.equip(dagger.uid,'Right');
  assert.equal(game.equipment('clothing').length,2); assert.equal(game.equipment('weapons').length,2);
  const large=extra('1/4.22',{itemKind:'Weapon',hands:2,power:10}); game.equip(large.uid);
  assert.equal(game.equipment('weapons').length,1); assert.equal(game.player.weapons.get('leftHand'),large.uid); assert.equal(game.player.weapons.get('rightHand'),large.uid);
});
test('map travel preserves cleared cells, inventory identity, and does not auto-trigger arrival portal', async () => {
  const game = await fixture(); approach(game,5,3); await game.resolve(0);
  approach(game,14,6); await game.resolve(0); assert.equal(game.mapId,2); assert.equal(game.pending,null); assert.equal(game.at(3,3).type,'Interaction');
  game.move(1,0); game.move(-1,0); await game.resolve(0);
  assert.equal(game.mapId,1); assert.equal(game.player.x,14); assert.equal(game.at(5,3).type,'Move'); assert.equal(game.quantity('1/4.1'),1);
});
test('cross-map chest gives origin-qualified items rather than renaming them', async () => {
  const game = await fixture(); await game.ensureMap(2); game.mapId=2;
  approach(game,7,5); await game.resolve(0);
  assert.equal(game.quantity('1/4.1'),1); assert.equal(game.quantity('1/4.3'),2); assert.equal(game.quantity('2/4.1'),0);
});
test('transports accept walls, fall back for bad coordinates, and use destination start when omitted', async () => {
  const game = await fixture();
  assert.deepEqual(await game.destination('(1,1)'), {mapId:1,x:1,y:1,fallback:false});
  assert.deepEqual(await game.destination('(500,2)'), {mapId:1,x:3,y:3,fallback:true});
  assert.deepEqual(await game.destination('(2)(0,3)'), {mapId:2,x:3,y:3,fallback:true});
  assert.deepEqual(await game.destination('(2)'), {mapId:2,x:3,y:3,fallback:false});
  game.block('1/3.3').choices[0].fields['Pass.Transport']='(1,1)';
  const key=give(game,'1/4.1'); approach(game,8,5); await game.resolve(0,key.uid);
  assert.equal(game.at(1,1).type,'Wall'); assert.equal(game.player.x,1); assert.equal(game.pending,null);
});
test('unavailable destination aborts all outcome changes and preserves selected key', async () => {
  const game = await fixture(), key=give(game,'1/4.1');
  game.block('1/3.3').choices[0].fields['Pass.Transport']='(99)'; approach(game,8,5);
  await assert.rejects(game.resolve(0,key.uid),/unavailable/);
  assert.equal(game.quantity(key.nid),1); assert.equal(game.at(8,5).nid,'1/3.3'); assert.equal(game.player.x,7); assert.ok(game.pending); assert.equal(game.busy,false);
});
test('All/Any and declared variables use fixed comparisons', async () => {
  const game = await fixture();
  const choice=game.block('1/3.2').choices[0]; choice.mode='Any';
  choice.tests=[{subject:'Player.Variable.PuzzlesSolved',comparison:'GreaterThan',value:'10'},{subject:'Inventory.Quantity',comparison:'Equal',value:'0',qualifier:'1/4.1'}];
  approach(game,3,6,0,1); assert.equal((await game.resolve(0)).passed,true);
  assert.throws(()=>game.test({subject:'Map.Variable.Missing',comparison:'Equal',value:'0'},null,{}),/Undeclared/);
});
test('NID 4.10 is distinct from 4.1 and invalid dimensions/start/category are rejected', () => {
  const map=parseMap(rawMaps.get(1).replace('NID: 1/4.6','NID: 1/4.10'),1);
  assert.ok(map.byNID.has('1/4.10')); assert.ok(map.byNID.has('1/4.1'));
  assert.throws(()=>parseMap(rawMaps.get(1).replace('25x19','101x19'),1),/Width/);
  assert.throws(()=>parseMap(rawMaps.get(1).replace('(3,3)','(0,3)'),1),/StartingLocation/);
  assert.throws(()=>parseMap(rawMaps.get(1).replace('NID: 1/4.6','NID: 1/2.6'),1),/category/);
});
test('bad shorthand lines roll back fully; last valid placement wins; warnings include file lines', () => {
  const raw=rawMaps.get(1)+'\n(2,2)2 | (99,2)3\n(3,2)2\n(3,2)1\n';
  const map=parseMap(raw,1);
  assert.equal(map.cells[1][1],map.defaultNID); assert.equal(map.cells[1][2],map.defaultNID);
  assert.equal(map.warnings.length,1); assert.match(map.warnings[0],/file line \d+: skipped shorthand line/);
});
test('longhand starts at max Y and faulty rows retain defaults without shifting the next row', () => {
  const base=rawMaps.get(2).split('[MapData]')[0];
  const map=parseMap(base+'[MapData]\nFormat: Longhand\n2(11)\n2(10)\n2 | 1(10)\n',2);
  assert.equal(map.cells[8][10],'2/2.1'); assert.equal(map.cells[7][0],'2/1.1'); assert.equal(map.cells[6][0],'2/2.1'); assert.equal(map.cells[6][1],'2/1.1');
  assert.match(map.warnings[0],/map row Y=8/);
});
test('777 is a reserved immediate ending and stops further movement', async () => {
  const game=await fixture(); assert.equal(approach(game,22,16).kind,'ending');
  const result=await game.resolve(0); assert.equal(result.ended,true); assert.match(result.message,/Sebastian/);
  assert.equal(game.move(1,0).kind,'ignored');
  assert.throws(()=>parseMap(rawMaps.get(1).replace('[Block.18]','[Block.777]'),1),/reserved/);
});
test('a new game resets all maps and inventory', async () => {
  const game=await fixture(); approach(game,5,3); await game.resolve(0);
  const next=await fixture(); assert.equal(next.quantity('1/4.1'),0); assert.equal(next.at(5,3).type,'Inventory');
});

// This route searches actual traversable cells, then plays the required interactions.
test('the supplied maze is solvable from the real start without teleporting or granting items', async () => {
  const game=await fixture();
  const walkTo=async (x,y,finish=false,action=0,select) => {
    const queue=[[game.player.x,game.player.y,[]]], seen=new Set(); let route;
    while(queue.length) {
      const [cx,cy,path]=queue.shift(), key=`${cx},${cy}`;
      if(seen.has(key)) continue; seen.add(key);
      if(cx===x&&cy===y) {route=path;break;}
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=cx+dx,ny=cy+dy;
        if(nx<1||ny<1||nx>game.map.width||ny>game.map.height) continue;
        if(game.at(nx,ny).type==='Move'||(nx===x&&ny===y)) queue.push([nx,ny,[...path,[dx,dy]]]);
      }
    }
    assert.ok(route,`No path to (${x},${y})`);
    for(const [dx,dy] of route) game.move(dx,dy);
    if(finish) assert.equal((await game.resolve(action,select?.())).passed,true);
  };
  await walkTo(5,3,true); await walkTo(3,6,true); await walkTo(5,6,true);
  game.equip(game.player.inventory.find(i=>i.nid==='1/4.5').uid);
  game.equip(game.player.inventory.find(i=>i.nid==='1/4.2').uid);
  await walkTo(8,5,true,0,()=>game.player.inventory.find(i=>i.nid==='1/4.1').uid);
  await walkTo(12,9,true); await walkTo(12,12,true,0,()=>game.player.inventory.find(i=>i.nid==='1/4.2').uid);
  await walkTo(11,15,true); await walkTo(16,14,true,0,()=>game.player.inventory.find(i=>i.nid==='1/4.4').uid);
  await walkTo(22,16,true); assert.equal(game.ended,true);
});
