const { chromium } = require("playwright");
const { readFile, mkdir } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const assert = require("node:assert/strict");

(async () => {
  const { importMap } = await import("../js/editor-model.js");
  const html = await readFile("editor.html", "utf8");
  assert.equal(
    /<script[^>]+src=/.test(html),
    false,
    "standalone editor cannot load external scripts",
  );
  assert.equal(
    /<link[^>]+stylesheet/.test(html),
    false,
    "standalone editor cannot load external styles",
  );
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox"],
  });
  const errors = [],
    network = [];
  try {
    // The managed Chromium blocks file: navigation. An offline, opaque-origin
    // document exercises the same no-server/module/CORS constraint without that policy.
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      offline: true,
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) network.push(request.url());
    });
    page.on("dialog", (dialog) => dialog.accept());
    await page.setContent(html);
    assert.equal(await page.evaluate(() => location.origin), "null");
    await page.locator(".palette-block").first().waitFor();
    assert.equal(await page.locator(".palette-block").count(), 5);
    const settings = page.locator("#settings-form");
    await page.locator("#settings-open").click();
    for (const [key, value] of Object.entries({
      ID: "3",
      Name: "Sebastian’s Workshop",
      width: "12",
      height: "8",
      startX: "2",
      startY: "2",
      ViewWindow: "3333 | 3303 | 9999",
    }))
      await settings.locator(`[name="${key}"]`).fill(value);
    await page.locator("#add-map-variable").click();
    await page.locator("#map-variables .variable-name").fill("GateOpen");
    await page.locator("#map-variables .variable-value").fill("0");
    await settings.getByRole("button", { name: "Apply settings" }).click();
    assert.equal(
      await page.locator("#dimensions-badge").textContent(),
      "12 × 8",
    );
    await mkdir("test-results", { recursive: true });
    const exported = async () => {
      const waiting = page.waitForEvent("download");
      await page.locator("#export-map").click();
      const download = await waiting;
      assert.match(download.suggestedFilename(), /^map-[1-9]\d*\.txt$/);
      const path = await download.path();
      return importMap(await readFile(path, "utf8"));
    };
    const canvas = page.locator("#map-canvas");
    const cellPoint = async (x, y, height = 8, size = 32) => {
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      return {
        x: box.x + 28 + (x - 0.5) * size,
        y: box.y + 28 + (height - y + 0.5) * size,
      };
    };
    const clickCell = async (x, y) => {
      const point = await cellPoint(x, y);
      await page.mouse.click(point.x, point.y);
    };
    await page.locator('.palette-block[data-index="3"]').click();
    let point = await cellPoint(2, 6);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    point = await cellPoint(8, 6);
    await page.mouse.move(point.x, point.y, { steps: 2 });
    await page.mouse.up();
    let doc = await exported();
    assert.deepEqual(doc.cells[5].slice(1, 8), Array(7).fill(3));
    await page.locator("#undo").click();
    doc = await exported();
    assert.equal(doc.cells[5][1], 1);
    await page.locator("#redo").click();
    doc = await exported();
    assert.equal(doc.cells[5][1], 3);
    await page.locator('.palette-block[data-index="4"]').click();
    await page.locator('button[data-tool="rectangle"]').click();
    point = await cellPoint(3, 3);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    point = await cellPoint(5, 4);
    await page.mouse.move(point.x, point.y, { steps: 3 });
    await page.mouse.up();
    doc = await exported();
    assert.deepEqual(doc.cells[2].slice(2, 5), [4, 4, 4]);
    assert.deepEqual(doc.cells[3].slice(2, 5), [4, 4, 4]);
    await page.locator('button[data-tool="erase"]').click();
    await clickCell(4, 3);
    doc = await exported();
    assert.equal(doc.cells[2][3], 1);
    await page.locator('.palette-block[data-index="2"]').click();
    await page.locator('button[data-tool="fill"]').click();
    await clickCell(1, 1);
    doc = await exported();
    assert.equal(doc.cells[0][0], 2);
    assert.equal(doc.cells[5][1], 3);
    await page.locator('.palette-block[data-index="4"]').dragTo(canvas, {
      targetPosition: { x: 28 + 9.5 * 32, y: 28 + 6.5 * 32 },
    });
    doc = await exported();
    assert.equal(
      doc.cells[1][9],
      4,
      "native drag/drop places the palette block",
    );
    await page.locator("#jump-x").fill("9");
    await page.locator("#jump-y").fill("5");
    await page.locator("#jump-cell").click();
    await page.locator('button[data-tool="start"]').click();
    await page.locator("#apply-cell").click();
    doc = await exported();
    assert.equal(doc.map.StartingLocation, "(9,5)");
    await page.locator('.palette-block[data-index="777"]').click();
    await page.locator('button[data-tool="paint"]').click();
    await clickCell(11, 7);
    doc = await exported();
    assert.equal(doc.cells[6][10], 777);
    await canvas.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press(" ");
    doc = await exported();
    assert.equal(doc.cells[6][9], 777, "keyboard applies current brush");
    const newBlock = async (type, name, extra = {}) => {
      await page.locator("#add-block").click();
      const form = page.locator("#block-form");
      await form.locator('[name="Type"]').selectOption(type);
      await form.locator('[name="Description"]').fill(name);
      for (const [key, value] of Object.entries(extra)) {
        const input = form.locator(`[name="${key}"]`);
        if (await input.evaluate((el) => el.tagName === "SELECT"))
          await input.selectOption(value);
        else await input.fill(value);
      }
      return form;
    };
    let form = await newBlock("Move", "Flower Path", {
      MapImage: "../assets/grass.png",
    });
    await form.getByRole("button", { name: "Save block", exact: true }).click();
    await page.locator("#edit-block").click();
    await page.locator("#duplicate-block").click();
    await page
      .locator('#block-form [name="Description"]')
      .fill("Spare Flowers");
    await page
      .locator("#block-form")
      .getByRole("button", { name: "Save block", exact: true })
      .click();
    await page.locator("#edit-block").click();
    await page.locator("#delete-block").click();
    form = await newBlock("Wall", "Garden Wall", {
      MapImage: "../assets/brick.png",
    });
    await form.getByRole("button", { name: "Save block", exact: true }).click();
    form = await newBlock("Inventory", "Great Sword", {
      ItemKind: "Weapon",
      Power: "9",
      Hands: "2",
      MapImage: "../assets/sword.png",
    });
    await form.getByRole("button", { name: "Save block", exact: true }).click();
    form = await newBlock("Inventory", "Workshop Boots", {
      ItemKind: "Wearable",
      WearLocation: "Feet",
      MapImage: "../assets/boots.png",
    });
    await form.getByRole("button", { name: "Save block", exact: true }).click();
    form = await newBlock("Inventory", "Workshop Key", {
      MapImage: "../assets/key.png",
    });
    await form.getByRole("button", { name: "Save block", exact: true }).click();
    doc = await exported();
    const key = doc.blocks.find((b) => b.fields.Description === "Workshop Key"),
      boots = doc.blocks.find((b) => b.fields.Description === "Workshop Boots");
    form = await newBlock("Interaction", "Workshop Door", {
      MapImage: "../assets/door.png",
      RequiredPower: "6",
      Message: "A puzzle door.",
    });
    const choice = page.locator(".choice-card").first();
    await choice.locator('[data-choice="Text"]').fill("Use an item");
    await choice.locator('[data-choice="Action"]').selectOption("UseInventory");
    await choice
      .getByRole("button", { name: "＋ Add a test", exact: true })
      .click();
    await choice.locator(".rule-value").fill(key.fields.NID);
    await choice
      .getByRole("button", { name: "＋ Add a test", exact: true })
      .click();
    const worn = choice.locator(".rule-row").nth(1);
    await worn.locator(".rule-subject").selectOption("Equipment.Worn");
    await worn.locator(".rule-value").fill(boots.fields.NID);
    const pass = choice.locator('.outcome[data-prefix="Pass"]'),
      fail = choice.locator('.outcome[data-prefix="Fail"]');
    await pass.locator('[data-effect="Message"]').fill("The key fits!");
    await pass.locator('[data-effect="ReplaceBlock"]').fill("3/1.2");
    await fail.locator('[data-effect="Message"]').fill("The key does not fit.");
    await pass
      .getByRole("button", { name: "＋ Set a variable", exact: true })
      .click();
    await pass.locator(".variable-name").fill("GateOpen");
    await pass.locator(".variable-value").fill("1");
    await page.locator("#add-choice").click();
    const inspect = page.locator(".choice-card").nth(1);
    await inspect.locator('[data-choice="Text"]').fill("Inspect the lock");
    await inspect
      .locator('.outcome[data-prefix="Pass"] [data-effect="ReplaceBlock"]')
      .fill("3/3.1");
    await form.getByRole("button", { name: "Save block", exact: true }).click();
    doc = await exported();
    const door = doc.blocks.find(
      (b) => b.fields.Description === "Workshop Door",
    );
    assert.equal(door.choices.length, 2);
    assert.equal(door.choices[0].fields["Pass.SetMapVariable.GateOpen"], "1");
    assert.equal(
      door.choices[0].fields["Test.2"],
      `Equipment.Worn | Contains | ${boots.fields.NID}`,
    );
    await page.locator(`.palette-block[data-index="${key.index}"]`).dblclick();
    await page.locator('#block-form [name="NID"]').fill("3/4.30");
    await page
      .locator("#block-form")
      .getByRole("button", { name: "Save block", exact: true })
      .click();
    doc = await exported();
    assert.equal(
      doc.blocks.find((b) => b.index === door.index).choices[0].fields[
        "Test.1"
      ],
      "SelectedItem.ID | Equal | 3/4.30",
    );
    await page.locator("#settings-open").click();
    await settings.locator('[name="format"]').selectOption("Longhand");
    await settings.getByRole("button", { name: "Apply settings" }).click();
    const longhand = await exported();
    assert.equal(longhand.format, "Longhand");
    assert.deepEqual(longhand.cells, doc.cells);
    await page.locator("#map-file").setInputFiles("maps/map-1.txt");
    assert.equal(
      await page.locator("#document-name").textContent(),
      "The Bramblewood Maze",
    );
    // Editing imported choice data must preserve all existing fields and rule order.
    await page.locator('.palette-block[data-index="5"]').dblclick();
    await page
      .locator('#block-form [name="Description"]')
      .fill("A Very Stubborn Pig");
    await page
      .locator("#block-form")
      .getByRole("button", { name: "Save block", exact: true })
      .click();
    await page.locator("#source-open").click();
    const imported = importMap(await page.locator("#source-text").inputValue());
    assert.equal(
      imported.blocks.find((b) => b.index === 5).choices[0].fields[
        "Pass.GiveItems"
      ],
      "1/4.3",
    );
    const editableText = await page.locator("#source-text").inputValue();
    await page
      .locator("#source-text")
      .fill(
        editableText.replace(
          "Name: The Bramblewood Maze",
          "Name: The Bramblewood Maze\nEditorNote: Keep this setting",
        ),
      );
    await page
      .locator("#source-form")
      .getByRole("button", { name: "Apply text" })
      .click();
    assert.equal((await exported()).map.EditorNote, "Keep this setting");
    await page.locator("#undo").click();
    await page.locator("#source-open").click();
    await page.locator("#source-text").fill("[Map]\nID: 1\n");
    await page
      .locator("#source-form")
      .getByRole("button", { name: "Apply text" })
      .click();
    assert.match(
      await page.locator("#source-error").textContent(),
      /Dimensions/,
    );
    await page.locator('[data-close="source-dialog"]').click();
    const unsafe = (await readFile("maps/map-2.txt", "utf8"))
      .replace(
        "Name: The Little Clearing",
        "Name: <img src=x onerror=alert(1)>",
      )
      .replace("../assets/tree.png", "https://tracker.invalid/picture.png");
    await page.locator("#map-file").setInputFiles({
      name: "untrusted.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(unsafe),
    });
    assert.equal(
      await page.locator("#document-name").textContent(),
      "<img src=x onerror=alert(1)>",
    );
    assert.equal(await page.locator('img[src="x"]').count(), 0);
    await page
      .locator("#image-files")
      .setInputFiles({
        name: "picture.png",
        mimeType: "image/png",
        buffer: await readFile("assets/brick.png"),
      });
    await page.waitForFunction(() =>
      document
        .getElementById("status")
        .textContent.startsWith("Local image previews loaded"),
    );
    assert.match(
      await page
        .locator('.palette-block[data-index="2"] img')
        .getAttribute("src"),
      /^data:image\/png;base64,/,
    );
    const prior = await page.locator("#document-name").textContent();
    await page.locator("#map-file").setInputFiles({
      name: "bad.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("[Map]\nID: 1\n"),
    });
    assert.equal(await page.locator("#document-name").textContent(), prior);
    assert.match(await page.locator("#status").textContent(), /Dimensions/);
    await page.locator("#example-select").selectOption("1");
    await page.screenshot({
      path: "test-results/editor-desktop.png",
      fullPage: true,
    });
    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    mobile.on("pageerror", (error) => errors.push(error.message));
    await mobile.setContent(html);
    await mobile.locator(".palette-block").first().waitFor();
    assert.equal(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "canvas scroll stays inside the mobile page",
    );
    await mobile.locator("#settings-open").click();
    await mobile.locator('#settings-form [name="width"]').fill("100");
    await mobile.locator('#settings-form [name="height"]').fill("100");
    await mobile
      .locator("#settings-form")
      .getByRole("button", { name: "Apply settings" })
      .click();
    assert.equal(
      await mobile.locator("#dimensions-badge").textContent(),
      "100 × 100",
    );
    assert.equal(
      await mobile.locator("#map-canvas").getAttribute("width"),
      "3228",
    );
    assert.equal(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await mobile.screenshot({
      path: "test-results/editor-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(
      network,
      [],
      "offline editor must not make any HTTP requests",
    );
    console.log(
      "PASS: offline opaque-origin editor; native file open/download and drag/drop; paint, rectangle, erase, fill, start, keyboard, undo/redo; all block types, equipment fields, rules, outcomes, variable updates, NID rename, duplication/deletion, imported choices, both export formats, injection safety, no network, mobile and 100×100 maps.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
