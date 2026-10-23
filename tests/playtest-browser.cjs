// Run against a static local server. The editor and game must share an origin.
const { chromium } = require('playwright');
const { existsSync } = require('node:fs');
const assert = require('node:assert/strict');
const text = `[Map]
ID: 3
Name: Testing Workshop
Dimensions: 9x7
DefaultBlock: 3/1.1
BorderBlock: 3/2.1
StartingLocation: (2,2)
ViewWindow: 3333 | 3303
[Variables]
Attempts: 0
[Block.1]
NID: 3/1.1
Type: Move
Description: Grass
MapImage: ../assets/grass.png
[Block.2]
NID: 3/2.1
Type: Wall
Description: Tree
MapImage: ../assets/tree.png
[Block.3]
NID: 3/4.1
Type: Inventory
ItemKind: Item
Description: Gold Coin
MapImage: ../assets/key.png
[Block.4]
NID: 3/3.1
Type: Interaction
Description: Trickster
MapImage: ../assets/pig.png
Message: A trickster asks for a coin if your answer fails.
[Block.4.Choice.1]
Text: Guess the riddle
Action: Attempt
Test.1: Inventory.Quantity | GreaterOrEqual | 2 | 3/4.1
Fail.TakeItems: 3/4.1
Fail.Message: The trickster takes one gold coin.
Fail.SetMapVariable.Attempts: 1
Fail.SetPlayerVariable.PuzzlesSolved: 1
Fail.AddState: Tested
[Block.4.Choice.2]
Text: Check memory
Action: Attempt
Test.1: Map.Variable.Attempts | Equal | 1
Test.2: Player.Variable.PuzzlesSolved | Equal | 1
Test.3: Player.State | Contains | Tested
Pass.ReplaceBlock: 3/3.1
Pass.Message: All test memory intact.
Fail.Message: Fresh test variables.
[Block.4.Choice.3]
Text: Visit map two
Action: Attempt
Pass.ReplaceBlock: 3/3.1
Pass.Transport: (2)
Pass.Message: Off to the clearing.
[MapData]
Format: Shorthand
(3,2)3 | (4,2)4
`;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
  const errors = [], failed = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
    page.on('dialog', dialog => dialog.accept());
    await page.goto(new URL('editor.html', process.env.MAZE_TEST_URL || 'http://127.0.0.1:8000/').href);
    await page.locator('#map-file').setInputFiles({ name: 'map-3.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
    await page.locator('#document-name').filter({ hasText: 'Testing Workshop' }).waitFor();
    const start = async () => {
      await page.locator('#test-start').click();
      await page.locator('#test-edit:not([disabled])').waitFor();
      const frame = page.frameLocator('#test-frame-host iframe');
      await frame.locator('#adventure').waitFor({ state: 'visible' });
      return frame;
    };
    let frame = await start();
    assert.equal(await frame.locator('#map-name').textContent(), 'Testing Workshop');
    assert.equal(await frame.locator('#position').textContent(), 'X 2 · Y 2');
    assert.equal(await frame.locator('#welcome-dialog').isVisible(), false);
    const step = async key => { await frame.locator('#board').focus(); await frame.locator('#board').press(key); };
    const continueGame = async () => frame.locator('#interaction-choices button').filter({ hasText: 'Continue the adventure' }).click();
    const pickCoin = async () => {
      await step('ArrowRight');
      await frame.locator('#interaction-choices button').filter({ hasText: 'Pick up Gold Coin' }).click();
      await continueGame();
    };
    await pickCoin();
    assert.match(await frame.locator('#pack-summary').textContent(), /1 useful find/);
    await step('ArrowRight');
    await frame.locator('#interaction-choices button').filter({ hasText: 'Guess the riddle' }).click();
    await frame.locator('#interaction-message').filter({ hasText: 'takes one gold coin' }).waitFor();
    assert.match(await frame.locator('#pack-summary').textContent(), /little room/);
    assert.equal(await frame.locator('#position').textContent(), 'X 3 · Y 2');
    // Pause even with a result dialog open; keep the exact dialog and runtime.
    await page.locator('#test-edit').click();
    await page.locator('#editor-pane').waitFor({ state: 'visible' });
    assert.equal(await frame.locator('body').getAttribute('inert'), '');
    await page.locator('#settings-open').click();
    await page.locator('#settings-form [name="Name"]').fill('Revised Workshop');
    await page.locator('#settings-form').getByRole('button', { name: 'Apply settings' }).click();
    assert.match(await page.locator('#test-status').textContent(), /map has changed/);
    // Forged parent messages have the right origin but the wrong source/session.
    await page.evaluate(() => window.postMessage({ channel: 'maze-craze-playtest', version: 1, session: 'wrong', type: 'running' }, location.origin));
    assert.equal(await page.locator('#editor-pane').isVisible(), true);
    await page.locator('#test-resume').click();
    await page.locator('#test-edit:not([disabled])').waitFor();
    assert.equal(await frame.locator('#map-name').textContent(), 'Testing Workshop');
    assert.equal(await frame.locator('#interaction-dialog').isVisible(), true);
    assert.match(await frame.locator('#interaction-message').textContent(), /takes one gold coin/);
    await continueGame();
    await step('ArrowRight');
    await frame.locator('#interaction-choices button').filter({ hasText: 'Check memory' }).click();
    await frame.locator('#interaction-message').filter({ hasText: 'All test memory intact' }).waitFor();
    await continueGame();
    // Restart from the latest design: player, cells, and variables are fresh.
    await page.locator('#test-edit').click(); await page.locator('#editor-pane').waitFor({ state: 'visible' });
    frame = await start();
    assert.equal(await frame.locator('#map-name').textContent(), 'Revised Workshop');
    assert.equal(await frame.locator('#position').textContent(), 'X 2 · Y 2');
    assert.match(await frame.locator('#pack-summary').textContent(), /little room/);
    await pickCoin(); await step('ArrowRight');
    await frame.locator('#interaction-choices button').filter({ hasText: 'Check memory' }).click();
    await frame.locator('#interaction-message').filter({ hasText: 'Fresh test variables' }).waitFor();
    await continueGame(); await step('ArrowRight');
    // A delayed map load must finish before Back to Edit is enabled.
    let releaseMap;
    const barrier = new Promise(resolve => { releaseMap = resolve; });
    await page.route('**/maps/map-2.txt', async route => { await barrier; await route.continue(); });
    await frame.locator('#interaction-choices button').filter({ hasText: 'Visit map two' }).click();
    await page.locator('#test-edit[disabled]').waitFor();
    releaseMap();
    await frame.locator('#map-name').filter({ hasText: 'The Little Clearing' }).waitFor();
    await page.locator('#test-edit:not([disabled])').waitFor();
    await continueGame();
    await page.unroute('**/maps/map-2.txt');
    assert.equal(await frame.locator('#position').textContent(), 'X 3 · Y 3');
    // Play mode does not change the authoring document or its exported cells.
    await page.locator('#test-edit').click(); await page.locator('#editor-pane').waitFor({ state: 'visible' });
    const downloadReady = page.waitForEvent('download'); await page.locator('#export-map').click();
    const download = await downloadReady;
    const { readFile } = require('node:fs/promises');
    const exported = await readFile(await download.path(), 'utf8');
    assert.match(exported, /Fail.TakeItems: 3\/4.1/); assert.match(exported, /Attempts: 0/);
    assert.match(exported, /\(3,2\)3/);
    await page.screenshot({ path: 'test-results/playtest-editor.png', fullPage: true });
    await page.locator('#test-resume').click(); await page.locator('#test-edit:not([disabled])').waitFor();
    await page.screenshot({ path: 'test-results/playtest-running.png', fullPage: true });
    // On narrow screens the parent controls and game remain usable.
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('#test-edit').isVisible(), true);
    assert.equal(await frame.locator('#board').isVisible(), true);
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    console.log('PASS: live editor snapshot; local map ID absent from directory; FAIL item cost; pause/result-dialog/resume; edited-design warning; fresh reset; cross-map load; busy guard; unchanged export; mobile; no browser/network errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
