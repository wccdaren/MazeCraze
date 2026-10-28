import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { parseMap, parseMain } from '../js/spec.js';
import { importMap, exportMap, validateDocument } from '../js/editor-model.js';
import { loadGameCatalog, resolveArtwork } from '../js/catalog.js';
import { Game } from '../js/engine.js';

const root = new URL('../maps/meno/',import.meta.url);
const source = await readFile(new URL('game-config.txt',root),'utf8');
const config = parseMain(source);
const maps = new Map(await Promise.all([...config.files].map(async([id,file])=>[id,parseMap(await readFile(new URL(file,root),'utf8'),id)])));
const solutions = JSON.parse(await readFile(new URL('solution.json',root),'utf8'));

test('Meno: seven 25x19 maps parse cleanly and survive editor round trips',async()=>{
  assert.equal(maps.size,7);
  for (const [id,map] of maps) {
    assert.equal(map.width,25);assert.equal(map.height,19);assert.deepEqual(map.warnings,[]);
    const text=await readFile(new URL(`map-${id}.txt`,root),'utf8');
    const doc=importMap(text);assert.deepEqual(validateDocument(doc).errors,[]);
    const copy=parseMap(exportMap(doc),id);
    assert.deepEqual(copy.cells,map.cells);
    assert.deepEqual(copy.variables,map.variables);
    assert.deepEqual(copy.byNID,map.byNID);
  }
});
test('Meno: every artwork and cross-map item reference resolves without bundled base assets',async()=>{
  const base='https://example.test/';
  const catalog=await loadGameCatalog(base+'main-config.txt',async url=>{
    if(url===base+'main-config.txt')return '[Game]\nStartGame: meno\n\n[Games]\nGame.meno: maps/meno/game-config.txt\n';
    assert.equal(url,base+'maps/meno/game-config.txt');return source;
  });
  assert.deepEqual(catalog.failures,[]);
  const settings=catalog.games.get('meno');
  for(const [key,url]of Object.entries(settings.imageCatalog)){
    assert.ok(key.startsWith('Meno'));const local=new URL('.'+new URL(url).pathname,new URL('../',import.meta.url));
    assert.ok((await stat(local)).size>0);
  }
  const game=new Game(config,id=>maps.get(id));
  for(const [id,map]of maps)for(const block of map.byNID.values()){
    for(const art of [block.image,block.picture])assert.ok(resolveArtwork(art,settings,base+`maps/meno/map-${id}.txt`).startsWith(base+'maps/meno/assets/'));
    for(const choice of block.choices){
      for(const [key,value]of Object.entries(choice.fields))if(/(?:GiveItems|TakeItems|SelectionItems)$/.test(key)){
        for(const nid of value.split(' | '))assert.equal((await game.requireDefinition(nid,true)).type,'Inventory');
      }
    }
  }
  assert.ok(Object.keys(settings.imageCatalog).length>=30);
});
test('Meno: complete seven-maze run wins without injecting items, states or positions; failed guesses are recoverable',async()=>{
  const game=new Game(config,async id=>maps.get(id));await game.start('Meno tester');
  let steps=0, encounters=0, failures=0;
  for(const chapter of solutions){
    assert.equal(game.mapId,chapter.id);assert.deepEqual([game.player.x,game.player.y],chapter.path[0]);
    const events=new Map(chapter.events.map(e=>[e.at.join(','),e]));
    for(let i=1;i<chapter.path.length;i++){
      const [x,y]=chapter.path[i],dx=x-game.player.x,dy=y-game.player.y;
      const result=game.move(dx,dy);steps++;
      const event=events.get([x,y].join(','));
      if(!event){assert.equal(result.kind,'move');continue;}
      assert.equal(result.kind,'interaction');encounters++;
      // Cancel never moves or costs anything, and the same encounter is reachable again.
      const inventory=JSON.stringify(game.player.inventory),position=[game.player.x,game.player.y];
      game.cancel();assert.equal(JSON.stringify(game.player.inventory),inventory);assert.deepEqual([game.player.x,game.player.y],position);
      assert.equal(game.move(dx,dy).kind,'interaction');
      if(chapter.id===3&&event.equip){
        const fail=await game.resolve(event.choice);assert.equal(fail.passed,false);failures++;
        assert.deepEqual([game.player.x,game.player.y],position);assert.equal(JSON.stringify(game.player.inventory),inventory);
        assert.equal(game.move(dx,dy).kind,'interaction');game.cancel();
      }
      if(chapter.id===4&&event.name.includes('current marker')){
        const before=game.map.variables.CurrentStep;
        assert.equal((await game.resolve((event.choice+1)%3)).passed,false);failures++;
        assert.equal(game.map.variables.CurrentStep,before);assert.equal(game.move(dx,dy).kind,'interaction');
      }
      if(chapter.id===6&&event.selected){
        game.cancel();const reed=game.player.inventory.find(i=>i.nid==='3/4.2');game.equip(reed.uid);
        game.move(dx,dy);assert.equal((await game.resolve(0,reed.uid)).passed,false);failures++;
        assert.equal(game.quantity(reed.nid),1);assert.deepEqual([game.player.x,game.player.y],position);
        game.move(dx,dy);game.cancel();
      }
      if(event.equip){
        game.cancel();const item=game.player.inventory.find(i=>i.nid===event.equip);assert.ok(item);game.equip(item.uid);
        game.move(dx,dy);
      }else if(!game.pending)game.move(dx,dy);
      const item=event.selected?game.player.inventory.find(i=>i.nid===event.selected):undefined;
      if(event.selected)assert.ok(item,event.selected+' should have been earned earlier');
      const resolved=await game.resolve(event.choice,item?.uid);assert.equal(resolved.passed,true,event.name);
      if(resolved.ended)assert.match(resolved.message,/MENO FOUND HIS FAMILY/);
    }
  }
  assert.equal(game.ended,true);assert.equal(game.quantity('1/4.1'),1,'family locket is never consumed');
  assert.equal(game.quantity('1/4.2'),0,'shell key spent');assert.equal(game.quantity('2/4.1'),0,'biscuit spent');
  assert.equal(game.quantity('3/4.1'),0,'navigation pearl spent');assert.equal(game.quantity('5/4.1'),0,'valve spent');
  assert.equal(game.quantity('4/4.1'),1,'wand kept');assert.equal(game.quantity('2/4.2'),1,'sash kept');
  for(const state of ['BimSafe','BopSafe','HarborHelped','SchoolTogether','NetFreed'])assert.ok(game.player.states.has(state));
  assert.equal(game.maps.size,7);assert.equal(failures,5);assert.ok(steps>500);assert.ok(encounters>=30);
  // Runtime mutations never change authored map data.
  assert.notDeepEqual(game.maps.get(1).cells,maps.get(1).cells);
});
