const { chromium } = require('playwright');
const { existsSync } = require('node:fs');
const { mkdir } = require('node:fs/promises');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
  const base = process.env.MAZE_TEST_URL || 'http://127.0.0.1:8000/';
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true, hasTouch: true });
    const errors = [], failures = []; let accept = true;
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
    page.on('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
    await page.goto(base); await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
    await page.locator('#player-name').fill('Family tester'); await page.locator('#welcome-form button').click();
    const position = () => page.locator('#position').textContent();
    const key = async direction => { await page.locator('#board').focus(); await page.keyboard.press(direction); };
    const step = async direction => page.locator(`[data-move="${direction}"]`).click();
    const done = () => page.locator('#interaction-choices button').filter({ hasText: 'Continue the adventure' }).click();
    assert.equal(await position(), 'X 3 · Y 3');
    assert.equal(await page.locator('.trail-panel').count(), 0);
    assert.equal(await page.locator('.map-panel #pack-button').count(), 1);
    // Neighbor clicks use the movement rules; a distant tile has no move action.
    await page.locator('.tile[data-x="4"][data-y="3"]').click(); assert.equal(await position(), 'X 4 · Y 3');
    await page.locator('.tile[data-x="6"][data-y="4"]').click(); assert.equal(await position(), 'X 4 · Y 3');
    await step('-1,0');
    await page.locator('#board').focus(); await page.keyboard.down('ArrowRight');
    await page.locator('#interaction-dialog').waitFor({ state: 'visible' }); // repeated step reaches key at (5,3)
    await page.locator('#interaction-choices button').first().click(); await done();
    await page.waitForTimeout(400); assert.equal(await position(), 'X 5 · Y 3');
    await page.keyboard.up('ArrowRight');
    assert.equal(await page.locator('#journal li').count(), 1);
    await page.locator('#game-select').selectOption('esther');
    await page.locator('#map-name').filter({ hasText: "Esther's First Trail" }).waitFor();
    assert.equal(await position(), 'X 2 · Y 2'); assert.equal(await page.locator('#player-label').textContent(), 'Family tester');
    await page.locator('#pack-button').click(); assert.equal(await page.locator('.pack-item').count(), 0); await page.locator('#pack-close').click();
    // Reach a key-only choice without possessing a key.
    for (const direction of ['0,1','1,0','1,0','1,0','0,1','1,0']) await step(direction);
    await page.locator('#interaction-choices button').filter({ hasText: 'Try a key' }).click();
    assert.match(await page.locator('#interaction-error').textContent(), /Find a trail key/);
    await page.locator('#interaction-cancel').click();
    for (const direction of ['-1,0','-1,0']) await step(direction); // chest at 3,4
    await page.locator('#interaction-choices button').first().click(); await done();
    await page.locator('#pack-button').click();
    assert.equal(await page.locator('.pack-item').count(), 1);
    assert.match(await page.locator('.pack-item h3').textContent(), /Inventory: 2/);
    await page.locator('.pack-item > summary').click();
    accept = false; await page.getByRole('button', { name: 'Discard one', exact: true }).click();
    assert.match(await page.locator('.pack-item h3').textContent(), /Inventory: 2/);
    accept = true; await page.getByRole('button', { name: 'Discard one', exact: true }).click();
    assert.doesNotMatch(await page.locator('.pack-item h3').textContent(), /Inventory:/);
    await page.locator('#pack-close').click();
    // Pick up another copy; the interaction selector should show one stack of two.
    for (const direction of ['0,-1','0,-1']) await step(direction);
    await page.locator('#interaction-choices button').first().click(); await done();
    for (const direction of ['1,0','1,0','0,1','0,1','1,0']) await step(direction);
    await page.locator('#interaction-choices button').filter({ hasText: 'Try a key' }).click();
    const choices = page.locator('#interaction-choices button');
    assert.equal(await choices.count(), 2); // one stack plus Back
    assert.match(await choices.first().textContent(), /Inventory: 2/);
    await choices.first().click(); await done(); assert.equal(await position(), 'X 6 · Y 4');
    await page.locator('#pack-button').click(); assert.doesNotMatch(await page.locator('.pack-item h3').textContent(), /Inventory:/); await page.locator('#pack-close').click();
    // Same-game transport and custom victory text, with no chain interaction at arrival.
    for (const direction of ['1,0','1,0','0,1','0,1']) await step(direction);
    await page.locator('#interaction-choices button').first().click(); await done();
    assert.match(await page.locator('#map-name').textContent(), /Esther's Secret Place/);
    for (const direction of ['0,1','0,1','0,1','0,1','1,0','1,0','1,0','1,0','1,0','1,0','1,0']) await step(direction);
    await page.locator('#interaction-title').filter({ hasText: 'You restored the garden!' }).waitFor();
    assert.match(await page.locator('#interaction-message').textContent(), /Family tester/);
    await page.locator('#interaction-choices button').click();
    accept = false; await page.locator('#game-select').selectOption('main'); assert.equal(await page.locator('#game-select').inputValue(), 'esther');
    accept = true; await page.locator('#game-select').selectOption('main'); await page.locator('#map-name').filter({ hasText: 'The Bramblewood Maze' }).waitFor();
    assert.equal(await position(), 'X 3 · Y 3');
    await key('ArrowRight'); await key('ArrowRight'); assert.equal(await page.locator('#interaction-dialog').isVisible(), true, 'the root key returns after switching games');
    await page.locator('#interaction-cancel').click();
    await mkdir('test-results', { recursive: true }); await page.screenshot({ path: 'test-results/collections-game.png', fullPage: true });
    // The editor uses the selected game for map lists, image catalog and test runs.
    await page.goto(new URL('editor.html', base).href);
    await page.locator('#editor-game-select option[value="esther"]').waitFor({ state: 'attached' });
    const pdf = page.getByRole('link', { name: 'PDF user guide' });
    assert.match(await pdf.getAttribute('href'), /\.pdf$/);
    assert.equal((await page.request.get(new URL(await pdf.getAttribute('href'), page.url()).href)).status(), 200);
    await page.locator('#editor-game-select').selectOption('esther');
    await page.locator('#example-select').selectOption('website:1');
    await page.locator('#document-name').filter({ hasText: "Esther's First Trail" }).waitFor();
    assert.ok((await page.locator('#image-suggestions option').evaluateAll(nodes => nodes.map(n => n.value))).includes('@Tree'));
    await page.locator('.palette-block[data-index="4"]').dblclick();
    const form = page.locator('#block-form'); assert.equal(await form.locator('[name="NID"]').evaluate(el => el.readOnly), true);
    assert.equal(await form.locator('[name="index"]').evaluate(el => el.readOnly), true);
    assert.equal(await page.locator('[data-choice="SelectionItems"]').inputValue(), '1/4.1');
    await page.locator('[data-close="block-dialog"]').first().click();
    await page.locator('.palette-block[data-index="2"]').dblclick();
    const oldNID = await form.locator('[name="NID"]').inputValue();
    await form.locator('[name="Type"]').selectOption('Interaction');
    const generatedNID = await form.locator('[name="NID"]').inputValue();
    assert.match(generatedNID, /^1\/3\./); assert.notEqual(generatedNID, oldNID);
    await form.getByRole('button', { name: 'Save block', exact: true }).click();
    await page.locator('#undo').click();
    await page.locator('.palette-block[data-index="2"]').dblclick();
    assert.equal(await form.locator('[name="NID"]').inputValue(), oldNID);
    await page.locator('[data-close="block-dialog"]').first().click();

    await page.locator('#test-start').click(); await page.locator('#test-edit:not([disabled])').waitFor();
    const frame = page.frameLocator('#test-frame-host iframe');
    assert.equal(await frame.locator('#map-name').textContent(), "Esther's First Trail");
    await page.locator('#test-edit').click(); await page.locator('#editor-pane').waitFor({ state: 'visible' });
    await page.locator('#editor-game-select').selectOption('sebastian');
    assert.match(await page.locator('#test-status').textContent(), /map has changed/);
    await page.locator('#test-resume').click(); await page.locator('#test-edit:not([disabled])').waitFor();
    assert.equal(await frame.locator('#map-name').textContent(), "Esther's First Trail");
    await page.locator('#test-edit').click(); await page.locator('#editor-pane').waitFor({ state: 'visible' });
    await page.locator('#test-start').click(); await page.locator('#test-edit:not([disabled])').waitFor();
    assert.equal(await page.frameLocator('#test-frame-host iframe').locator('#map-name').textContent(), 'A New Adventure');
    await page.locator('#test-edit').click(); await page.locator('#editor-pane').waitFor({ state: 'visible' });
    await page.locator('#example-select').selectOption('website:1'); await page.locator('#document-name').filter({ hasText: "Sebastian's First Trail" }).waitFor();
    await page.locator('#test-start').click(); await page.locator('#test-edit:not([disabled])').waitFor();
    assert.equal(await page.frameLocator('#test-frame-host iframe').locator('#map-name').textContent(), "Sebastian's First Trail");
    await page.locator('#test-edit').click(); await page.locator('#editor-pane').waitFor({ state: 'visible' });
    await page.screenshot({ path: 'test-results/collections-editor.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    // The master default game/map combo is used only at the initial launch.
    const master = await (await page.request.get(new URL('main-config.txt', base).href)).text();
    await page.route('**/main-config.txt', route => route.fulfill({ contentType: 'text/plain', body: master.replace('StartGame: main', 'StartGame: esther').replace('StartMap: 1', 'StartMap: 2') }));
    await page.goto(base); await page.locator('#welcome-dialog').waitFor({ state: 'visible' });
    await page.locator('#welcome-form button').click();
    await page.locator('#map-name').filter({ hasText: "Esther's Secret Place" }).waitFor();
    await page.locator('#game-select').selectOption('sebastian');
    await page.locator('#map-name').filter({ hasText: "Sebastian's First Trail" }).waitFor();
    assert.equal(await page.locator('#position').textContent(), 'X 2 · Y 2');
    await page.locator('.tile[data-x="2"][data-y="3"]').tap();
    assert.equal(await page.locator('#position').textContent(), 'X 2 · Y 3');
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    console.log('PASS: adjacent clicks, held movement and popup stop; compact map; source-map stacks; discard confirmation; filtered stacked choices; custom two-map ending; isolated/cancelable game switches; editor game/catalog/filter fields; PDF link; game-aware test restart and resume; mobile; no browser or network errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
