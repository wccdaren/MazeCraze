// Run a local server first: npm start. CHROMIUM_PATH can select a system browser.
const { chromium } = require('playwright');
const { readFile, mkdir } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const { parseMain, parseMap } = await import('../js/spec.js');
  const { Game } = await import('../js/engine.js');
  const config = parseMain(await readFile('main-config.txt', 'utf8'));
  const sim = new Game(config, async id => parseMap(await readFile(`maps/map-${id}.txt`, 'utf8'), id));
  const nickname = '<img src=x onerror=alert(1)>';
  await sim.start(nickname);
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const errors = [], failedRequests = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
    page.on('requestfailed', request => failedRequests.push(request.url()));
    await page.goto(process.env.MAZE_TEST_URL || 'http://127.0.0.1:8000/');
    await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
    await page.locator('#player-name').fill(nickname);
    await page.locator('#welcome-form button').click();
    await page.locator('#adventure').waitFor({ state: 'visible' });
    await page.waitForFunction(() => [...document.querySelectorAll('#adventure img')].every(img => img.complete && img.naturalWidth > 0));
    assert.equal(await page.locator('img[src="x"]').count(), 0, 'nickname must remain text');
    assert.equal(await page.locator('#player-label').textContent(), nickname);
    const position = async () => assert.equal(await page.locator('#position').textContent(), `X ${sim.player.x} · Y ${sim.player.y}`);
    const press = async (dx, dy) => {
      sim.move(dx, dy);
      await page.keyboard.press(({ '0,1': 'ArrowUp', '0,-1': 'ArrowDown', '1,0': 'ArrowRight', '-1,0': 'ArrowLeft' })[`${dx},${dy}`]);
    };
    await page.keyboard.press('Numpad8'); sim.move(0,1); await position();
    await page.keyboard.press('ArrowDown'); sim.move(0,-1); await position();
    await page.keyboard.down('ArrowDown'); sim.move(0,-1);
    await page.keyboard.down('ArrowDown'); // repeat event must be ignored
    await page.keyboard.up('ArrowDown'); await position();
    await press(0,1);
    const walk = async (x, y) => {
      const queue = [[sim.player.x, sim.player.y, []]], seen = new Set(); let route;
      while (queue.length) {
        const [cx, cy, path] = queue.shift(), key = `${cx},${cy}`;
        if (seen.has(key)) continue; seen.add(key);
        if (cx === x && cy === y) { route = path; break; }
        for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = cx+dx, ny = cy+dy;
          if (nx<1||ny<1||nx>sim.map.width||ny>sim.map.height) continue;
          if (sim.at(nx,ny).type==='Move'||(nx===x&&ny===y)) queue.push([nx,ny,[...path,[dx,dy]]]);
        }
      }
      assert.ok(route, `No route to ${x},${y}`);
      for (const direction of route) await press(...direction);
      if (sim.pending?.block.nid !== '@princess') await position();
    };
    const finish = async (nid, expectedPass = true) => {
      await page.locator('#interaction-dialog').waitFor({ state: 'visible' });
      const selected = nid ? sim.eligible(sim.choices()[0].action).find(item => item.nid === nid) : undefined;
      const result = await sim.resolve(0, selected?.uid);
      await page.locator('#interaction-choices button').first().click();
      if (selected) {
        const name = sim.definition(selected).name;
        await page.locator('#interaction-choices button').filter({ hasText: name }).first().click();
      }
      await page.waitForFunction(() => document.getElementById('interaction-cancel').hidden);
      assert.equal(result.passed, expectedPass);
      assert.equal(await page.locator('#interaction-message').textContent(), result.message);
      await page.locator('#interaction-choices button').click(); await position();
    };
    const equip = async (nid, action) => {
      const item = sim.player.inventory.find(item => item.nid === nid);
      sim.equip(item.uid, action.includes('left') ? 'Left' : 'Right');
      await page.locator('#pack-button').click();
      const row = page.locator('.pack-item').filter({ has: page.locator('h3', { hasText: sim.definition(item).name }) });
      await row.getByRole('button', { name: action, exact: true }).click();
      await page.locator('#pack-close').click();
    };
    await walk(5,3);
    const paused = await page.locator('#position').textContent(); await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator('#position').textContent(), paused, 'popup pauses movement');
    await finish(); await walk(3,6); await finish(); await walk(5,6); await finish(); await walk(6,4); await finish(); await walk(4,10); await finish();
    await walk(8,5); await finish('1/4.3',false); await walk(8,5); await finish('1/4.1');
    await walk(14,6); await finish(); assert.equal(sim.mapId,2);
    await walk(7,5); await finish(); await walk(3,3); await finish(); assert.equal(sim.mapId,1);
    await walk(12,9); await finish(undefined,false); await equip('1/4.5','Wear · Feet'); await walk(12,9); await finish();
    await walk(12,12); await page.locator('#interaction-choices button').first().click();
    assert.match(await page.locator('#interaction-error').textContent(),/weapons in your hands/);
    await page.locator('#interaction-cancel').click(); sim.cancel();
    await equip('1/4.6','Wield · left hand'); await walk(12,12); await finish('1/4.6',false);
    await equip('1/4.2','Wield · right hand'); await walk(12,12); await finish('1/4.2');
    await walk(11,15); await finish(); await walk(8,14); await finish('1/4.3');
    await walk(16,14); await finish('1/4.4'); await walk(22,16);
    // The reserved ending resolves automatically, with no choice required.
    const ending=await sim.resolve(0);
    await page.waitForFunction(()=>document.getElementById('interaction-title').textContent==='You saved the princess!');
    assert.equal(await page.locator('#interaction-message').textContent(),ending.message);
    await page.locator('#interaction-choices button').click(); await position();
    const endPosition=await page.locator('#position').textContent(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#position').textContent(),endPosition);
    assert.equal(await page.locator('#diagnostics').isVisible(),false);
    await mkdir('test-results',{recursive:true}); await page.screenshot({path:'test-results/desktop.png',fullPage:true});
    const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    mobile.on('pageerror', error=>errors.push(error.message));
    await mobile.goto(process.env.MAZE_TEST_URL || 'http://127.0.0.1:8000/');
    await mobile.locator('#welcome-dialog').waitFor({state:'visible'}); await mobile.locator('#welcome-form button').click();
    await mobile.locator('#adventure').waitFor({state:'visible'});
    await mobile.locator('[data-move="1,0"]').click(); assert.equal(await mobile.locator('#position').textContent(),'X 4 · Y 3');
    await mobile.locator('#view-select').selectOption('1'); assert.equal(await mobile.locator('.tile').count(),28);
    await mobile.locator('#view-select').selectOption('3'); assert.equal(await mobile.locator('.tile').count(),361);
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'large maps must scroll inside their panel');
    assert.equal(await mobile.locator('.tile').first().evaluate(el=>el.getBoundingClientRect().width),32);
    await mobile.locator('#view-select').selectOption('0');
    await mobile.screenshot({path:'test-results/mobile.png',fullPage:true});
    assert.deepEqual(errors,[]); assert.deepEqual(failedRequests,[]);
    console.log('PASS: desktop complete playthrough, wrong-item preservation, clothing, wielding, weak attack, hidden tree, round-trip travel, ending, injection safety, keyboard/numpad, popup pause, mobile controls, 32px tiles, asymmetric/wide views, no page errors or failed requests.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
