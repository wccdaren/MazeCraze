const { chromium } = require('playwright');
const { existsSync } = require('node:fs');
const { readFile, mkdir } = require('node:fs/promises');
const assert = require('node:assert/strict');

(async () => {
  const { createMap, applyMapSettings, exportMap, importMap } = await import('../js/editor-model.js');
  const mapText = (id, name) => {
    const doc = createMap();
    applyMapSettings(doc, { ...doc.map, ID: String(id), Name: name }, doc.variables, doc.format);
    doc.cells[4][3] = 3;
    return exportMap(doc);
  };
  const originalMain = await readFile('main-config.txt', 'utf8');
  const base = process.env.MAZE_TEST_URL || 'http://127.0.0.1:8000/';
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
    const errors = [], mapRequests = [], dialogs = [];
    let main = originalMain.replace('Map.2: maps/map-2.txt', 'Map.2: maps/map-2.txt\nMap.4: maps/live-four.txt?edition=1\nMap.3: published/map-three.txt');
    let map3 = mapText(3, 'Sebastian’s Current Map Three'), map4 = mapText(4, 'Current Map Four');
    let failFour = false, releaseSlow, slow = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
    page.on('request', request => { if (request.resourceType() === 'fetch' && !request.url().endsWith('main-config.txt')) mapRequests.push(request.url()); });
    await page.route('**/main-config.txt', route => route.fulfill({ contentType: 'text/plain', body: main }));
    await page.route('**/published/map-three.txt', async route => {
      if (slow) await new Promise(resolve => { releaseSlow = resolve; });
      await route.fulfill({ contentType: 'text/plain', body: map3 });
    });
    await page.route('**/maps/live-four.txt?edition=1', route => route.fulfill({ status: failFour ? 404 : 200, contentType: 'text/plain', body: map4 }));
    await page.goto(new URL('editor.html', base).href);
    await page.locator('#website-map-options option').nth(3).waitFor({ state: 'attached' });
    assert.deepEqual(await page.locator('#website-map-options option').evaluateAll(options => options.map(o => o.value)), ['website:1', 'website:2', 'website:3', 'website:4']);
    assert.equal(await page.locator('#bundled-map-options option').count(), 2);
    assert.deepEqual(mapRequests, [], 'Listing the directory does not download every map');
    await page.locator('#example-select').selectOption('website:3');
    await page.locator('#document-name').filter({ hasText: 'Sebastian’s Current Map Three' }).waitFor();
    assert.equal(await page.locator('#document-state').textContent(), 'map-three.txt · No unexported changes');
    assert.equal(mapRequests.length, 1);
    assert.equal(await page.locator('#website-map-options option[value="website:3"]').textContent(), 'Map 3 · Sebastian’s Current Map Three');
    // Reopening fetches the current server contents, not a cached snapshot.
    map3 = mapText(3, 'Updated on Server');
    await page.locator('#example-select').selectOption('website:3');
    await page.locator('#document-name').filter({ hasText: 'Updated on Server' }).waitFor();
    await page.locator('#example-select').selectOption('website:4');
    await page.locator('#document-name').filter({ hasText: 'Current Map Four' }).waitFor();
    await page.locator('#settings-open').click();
    await page.locator('#settings-form [name="Name"]').fill('Edited Four');
    await page.locator('#settings-form').getByRole('button', { name: 'Apply settings' }).click();
    const pendingDownload = page.waitForEvent('download'); await page.locator('#export-map').click();
    const download = await pendingDownload;
    assert.equal(download.suggestedFilename(), 'map-4.txt');
    const exported = importMap(await readFile(await download.path(), 'utf8'));
    assert.equal(exported.map.ID, '4'); assert.equal(exported.map.Name, 'Edited Four'); assert.equal(exported.cells[4][3], 3);
    // Broken map and mismatched identities leave the current document intact.
    failFour = true; await page.locator('#example-select').selectOption('website:4');
    await page.locator('#map-directory-status').filter({ hasText: 'HTTP 404' }).waitFor();
    assert.equal(await page.locator('#document-name').textContent(), 'Edited Four');
    failFour = false; map4 = mapText(3, 'Wrong identity');
    await page.locator('#example-select').selectOption('website:4');
    await page.locator('#map-directory-status').filter({ hasText: 'file defines Map 3' }).waitFor();
    assert.equal(await page.locator('#document-name').textContent(), 'Edited Four');
    // Slow downloads cannot replace changes made after the selection.
    slow = true; await page.locator('#example-select').selectOption('website:3');
    await page.locator('#settings-open').click();
    await page.locator('#settings-form [name="Name"]').fill('Keep My New Edits');
    await page.locator('#settings-form').getByRole('button', { name: 'Apply settings' }).click();
    await page.waitForFunction(() => document.getElementById('example-select').disabled);
    assert.ok(releaseSlow); releaseSlow();
    await page.locator('#map-directory-status').filter({ hasText: 'editor changed while' }).waitFor();
    assert.equal(await page.locator('#document-name').textContent(), 'Keep My New Edits'); slow = false;
    // Refresh discovers new entries without replacing the editing document.
    main += '\n'; main = main.replace('Map.3: published/map-three.txt', 'Map.3: published/map-three.txt\nMap.5: maps/five.txt');
    await page.locator('#refresh-map-list').click();
    await page.locator('#website-map-options option[value="website:5"]').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#document-name').textContent(), 'Keep My New Edits');
    const requestsBeforeUnsafe = mapRequests.length;
    main = main.replace('maps/five.txt', 'https://untrusted.invalid/five.txt');
    await page.locator('#refresh-map-list').click();
    await page.locator('#map-directory-status').filter({ hasText: 'same HTTP(S) origin' }).waitFor();
    assert.equal(mapRequests.length, requestsBeforeUnsafe);
    assert.equal(await page.locator('#website-map-options option').count(), 5);
    assert.equal(await page.locator('#document-name').textContent(), 'Keep My New Edits');
    // Main config failure keeps offline examples available.
    main = '[Game]\nStartMap: 99\n[Maps]\nMap.1: maps/map-1.txt\n';
    await page.locator('#refresh-map-list').click();
    await page.locator('#map-directory-status').filter({ hasText: 'StartMap has no file' }).waitFor();
    await page.locator('#example-select').selectOption('2');
    await page.locator('#document-name').filter({ hasText: 'The Little Clearing' }).waitFor();
    assert.ok(dialogs.some(message => message.includes('not been exported')));
    main = originalMain.replace('Map.2: maps/map-2.txt', 'Map.2: maps/map-2.txt\nMap.3: published/map-three.txt\nMap.4: maps/live-four.txt?edition=1');
    await page.locator('#refresh-map-list').click();
    await page.locator('#map-directory-status').filter({ hasText: '4 website maps available' }).waitFor();
    await mkdir('test-results', { recursive: true });
    await page.locator('#example-select').focus();
    await page.screenshot({ path: 'test-results/website-map-directory.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('#example-select').isVisible(), true);
    assert.equal(await page.locator('#refresh-map-list').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('PASS: all configured website maps including 3/4; lazy fresh downloads; map IDs and filenames; export; refresh; dirty confirmation; HTTP/mismatched-ID errors; slow-response edit preservation; same-origin restriction; bundled fallback; mobile.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
