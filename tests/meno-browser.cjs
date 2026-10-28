const { chromium } = require('playwright');
const { existsSync } = require('node:fs');
const { readFile, mkdir } = require('node:fs/promises');
const assert = require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
  const base=process.env.MAZE_TEST_URL||'http://127.0.0.1:8003/';
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1100}});
    const errors=[],failed=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
    page.on('dialog',d=>d.accept());
    const master=await readFile('main-config.txt','utf8');
    // Register only for this test. Never overwrite the user's published directory.
    await page.route('**/main-config.txt',route=>route.fulfill({contentType:'text/plain',body:master.replace('[Games]','[Games]\nGame.meno: maps/meno/game-config.txt')}));
    await page.goto(base);await page.locator('#welcome-dialog').waitFor({state:'visible'});
    await page.locator('#player-name').fill('Meno');await page.locator('#welcome-form button').click();
    await page.locator('#game-select').selectOption('meno');
    await page.locator('#map-name').filter({hasText:'1. Stormglass Reef'}).waitFor();
    assert.match(await page.locator('#hero-gnome').getAttribute('src'),/meno\/assets\/meno.png$/);
    const solutions=JSON.parse(await readFile('maps/meno/solution.json','utf8'));
    const equip=async nid=>{
      await page.locator('#pack-button').click();
      const row=page.locator(`.pack-item[data-nid="${nid}"]`);
      if(!await row.evaluate(el=>el.open))await row.locator(':scope > summary').click();
      await row.getByRole('button',{name:/^(Wear|Wield)/}).first().click();
      assert.match(await page.locator('#pack-equipped').textContent(),nid==='2/4.2'?/Glow-thread sash/:/Stormglass bubble wand/);
      await page.locator('#pack-close').click();
    };
    let steps=0,encounters=0;
    for(const chapter of solutions){
      const events=new Map(chapter.events.map(e=>[e.at.join(','),e]));
      for(let i=1;i<chapter.path.length;i++){
        const [x,y]=chapter.path[i],[px,py]=chapter.path[i-1],event=events.get([x,y].join(','));
        if(event?.equip)await equip(event.equip);
        // Exercise normal keyboard handlers and release each key: no engine access.
        const key=x>px?'ArrowRight':x<px?'ArrowLeft':y>py?'ArrowUp':'ArrowDown';
        await page.locator('#board').focus();
        await page.evaluate(key=>{const board=document.getElementById('board');board.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));board.dispatchEvent(new KeyboardEvent('keyup',{key,bubbles:true}));},key);
        steps++;
        if(!event){assert.equal(await page.locator('#position').textContent(),`X ${x} · Y ${y}`);continue;}
        encounters++;await page.locator('#interaction-dialog').waitFor({state:'visible'});
        assert.equal(await page.locator('#interaction-title').textContent(),event.name);
        assert.equal(await page.locator('#interaction-picture').evaluate(img=>img.complete&&img.naturalWidth>0),true);
        await page.locator('#interaction-choices button').nth(event.choice).click();
        if(event.selected){
          const selection=page.locator('#interaction-choices button').filter({hasText:event.selected==='1/4.2'?'Rose-shell key':event.selected==='2/4.1'?'Crunchy algae biscuit':event.selected==='3/4.1'?'Moonlit navigation pearl':event.selected==='5/4.1'?'Copper valve handle':'Stormglass bubble wand'});
          await selection.click();
        }
        await page.locator('#interaction-title').filter({hasText:chapter.id===7&&i===chapter.path.length-1?'Meno found his family!':'Well done, wayfarer.'}).waitFor();
        assert.equal(await page.locator('#interaction-error').textContent(),'');
        if(chapter.id===1&&event.name==='Tavi the seahorse'){
          await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/meno-first-meeting.png',fullPage:true});
        }
        if(chapter.id===7&&i===chapter.path.length-1){
          await page.waitForFunction(()=>{const i=document.getElementById('interaction-picture');return i.complete&&i.naturalWidth>0;});
          assert.match(await page.locator('#interaction-message').textContent(),/MENO FOUND HIS FAMILY/);
          await page.screenshot({path:'test-results/meno-homecoming.png',fullPage:true});
        }
        await page.locator('#interaction-choices button').first().click();
      }
      console.log(`Completed browser chapter ${chapter.id}: ${chapter.name}`);
    }
    assert.equal(await page.locator('[data-move="1,0"]').isDisabled(),true);
    // Load every published map through the real editor's current-game directory.
    await page.goto(new URL('editor.html',base).href);
    await page.locator('#editor-game-select option[value="meno"]').waitFor({state:'attached'});
    await page.locator('#editor-game-select').selectOption('meno');
    for(const chapter of solutions){
      await page.locator('#example-select').selectOption('website:'+chapter.id);
      await page.locator('#document-name').filter({hasText:chapter.name}).waitFor();
      assert.ok((await page.locator('#image-suggestions option').evaluateAll(nodes=>nodes.map(n=>n.value))).includes('@MenoCoral'));
    }
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
    console.log(`PASS Meno: ${steps} keyboard moves, ${encounters} encounters, full seven-chapter victory, equipment/item selections, all seven editor imports, mobile bounds, no browser or HTTP errors.`);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
