import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseMap } from "../js/spec.js";
import { Game } from "../js/engine.js";
import {
  importMap,
  exportMap,
  createMap,
  cloneDocument,
  nextBlock,
  saveBlock,
  duplicateBlock,
  deleteBlock,
  applyMapSettings,
  fillCells,
  lineCells,
  validateDocument,
  EditorHistory,
} from "../js/editor-model.js";

const samples = await Promise.all(
  [1, 2].map((id) =>
    readFile(new URL(`../maps/map-${id}.txt`, import.meta.url), "utf8"),
  ),
);
test("editor opens and exports both complete sample maps without losing definitions, choices, variables, or cells", () => {
  for (const [position, text] of samples.entries()) {
    const original = importMap(text),
      reopened = importMap(exportMap(original));
    assert.deepEqual(reopened.map, original.map);
    assert.deepEqual(reopened.variables, original.variables);
    assert.deepEqual(reopened.blocks, original.blocks);
    assert.deepEqual(reopened.cells, original.cells);
    assert.deepEqual(validateDocument(original).errors, []);
    assert.deepEqual(parseMap(exportMap(original), position + 1).warnings, []);
  }
});
test("longhand and shorthand exports represent the same grid including princess and top/bottom orientation", () => {
  const doc = createMap();
  doc.cells[14][0] = 3;
  doc.cells[0][20] = 777;
  for (const format of ["Longhand", "Shorthand"]) {
    doc.format = format;
    assert.deepEqual(importMap(exportMap(doc)).cells, doc.cells);
  }
  doc.format = "Shorthand";
  assert.match(exportMap(doc), /\(1,15\)3/);
  assert.match(exportMap(doc), /\(21,1\)777/);
});
test("unknown sections/fields and comments survive editing and repeated round trips without duplicating generated headers", () => {
  const text = samples[0]
    .replace(
      "Name: The Bramblewood Maze",
      "Name: The Bramblewood Maze\nAuthorNote: Keep this",
    )
    .replace("[MapData]", "[MyNotes]\nNote: Keep this too\n\n[MapData]");
  const doc = importMap(text);
  const output = exportMap(importMap(exportMap(doc)));
  assert.match(output, /AuthorNote: Keep this/);
  assert.match(output, /\[MyNotes\]\nNote: Keep this too/);
  assert.match(output, /; Sebastian/);
  assert.equal(output.match(/; Exported by Maze Craze/g).length, 1);
});
test("import preserves warnings about skipped map rows and exports the repaired default grid", () => {
  const doc = importMap(samples[0] + "\n(999,1)3\n");
  assert.equal(doc.importWarnings.length, 1);
  assert.deepEqual(parseMap(exportMap(doc), 1).warnings, []);
});
test("resizing preserves bottom-left cells, fills new cells, and changes existing default cells deliberately", () => {
  const doc = createMap();
  doc.cells[0][0] = 3;
  doc.cells[14][20] = 4;
  applyMapSettings(
    doc,
    { ...doc.map, Dimensions: "25x20", DefaultBlock: "1/1.2" },
    doc.variables,
    "Longhand",
  );
  assert.equal(doc.cells[0][0], 3);
  assert.equal(doc.cells[14][20], 4);
  assert.equal(doc.cells[19][24], 2);
  assert.equal(doc.cells[1][1], 2);
  assert.equal(importMap(exportMap(doc)).width, 25);
  applyMapSettings(
    doc,
    { ...doc.map, Dimensions: "4x4" },
    doc.variables,
    "Shorthand",
  );
  assert.equal(doc.cells.length, 4);
  assert.equal(doc.cells[0].length, 4);
  assert.equal(doc.cells[0][0], 3);
});
test("map ID changes remap local NIDs and references but leave image/text values and explicit transports alone", () => {
  const doc = importMap(samples[0]);
  applyMapSettings(doc, { ...doc.map, ID: "7" }, doc.variables, doc.format);
  assert.equal(doc.map.DefaultBlock, "7/1.1");
  assert.equal(
    doc.blocks.find((b) => b.index === 10).choices[0].fields["Test.1"],
    "SelectedItem.ID | Equal | 7/4.1",
  );
  assert.equal(
    doc.blocks.find((b) => b.index === 15).choices[0].fields["Pass.Transport"],
    "(2)",
  );
  assert.deepEqual(validateDocument(doc).errors, []);
});
test("renaming and renumbering a block updates its cells and all structured NID references", () => {
  const doc = importMap(samples[0]),
    key = cloneDocument(doc.blocks.find((b) => b.index === 7));
  key.index = 70;
  key.fields.NID = "1/4.10";
  saveBlock(doc, 7, key);
  assert.equal(doc.cells[2][4], 70);
  assert.equal(
    doc.blocks.find((b) => b.index === 10).choices[0].fields["Test.1"],
    "SelectedItem.ID | Equal | 1/4.10",
  );
  assert.deepEqual(validateDocument(doc).errors, []);
});
test("duplicate blocks get distinct indices/NIDs and self-replacement references follow the copy", () => {
  const doc = importMap(samples[0]),
    index = duplicateBlock(doc, 15),
    copy = doc.blocks.find((b) => b.index === index);
  assert.notEqual(index, 15);
  assert.notEqual(copy.fields.NID, "1/3.6");
  assert.equal(copy.choices[0].fields["Pass.ReplaceBlock"], copy.fields.NID);
  assert.equal(
    doc.blocks.find((b) => b.index === 15).choices[0].fields[
      "Pass.ReplaceBlock"
    ],
    "1/3.6",
  );
});
test("deletion protects required/referenced blocks and restores ordinary placements to the map default", () => {
  const doc = importMap(samples[0]);
  assert.throws(() => deleteBlock(doc, 1), /default\/border/);
  assert.throws(() => deleteBlock(doc, 7), /references/);
  deleteBlock(doc, 17);
  assert.equal(doc.cells[3][5], 1);
  assert.deepEqual(validateDocument(doc).errors, []);
});
test("painting line interpolation leaves no gaps, fill respects barriers, and undo/redo restores a complete stroke", () => {
  const doc = createMap();
  for (let y = 0; y < doc.height; y++) doc.cells[y][5] = 4;
  const history = new EditorHistory(doc),
    before = cloneDocument(doc);
  fillCells(doc, 1, 1, 2);
  history.push(before, "Fill");
  assert.equal(doc.cells[0][0], 2);
  assert.equal(doc.cells[0][6], 1);
  const restored = history.undo(doc);
  assert.deepEqual(restored.cells, before.cells);
  assert.equal(history.dirty(restored), false);
  const redone = history.redo(restored);
  assert.equal(redone.cells[0][0], 2);
  assert.equal(history.dirty(redone), true);
  assert.equal(lineCells({ x: 1, y: 1 }, { x: 6, y: 1 }).length, 6);
  assert.deepEqual(lineCells({ x: 1, y: 1 }, { x: 3, y: 3 }), [
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 3 },
  ]);
});
test("validation rejects invalid local references, failure consumption, and undeclared map variables but permits foreign references with notes", () => {
  const doc = importMap(samples[0]),
    choice = doc.blocks.find((b) => b.index === 10).choices[0];
  choice.fields["Fail.TakeItems"] = "1/4.1";
  choice.fields["Pass.ReplaceBlock"] = "1/1.99";
  choice.fields["Pass.SetMapVariable.Missing"] = "1";
  const result = validateDocument(doc);
  assert.ok(result.errors.some((s) => s.includes("FAIL cannot consume")));
  assert.ok(result.errors.some((s) => s.includes("not defined")));
  assert.ok(result.errors.some((s) => s.includes("undeclared")));
  assert.deepEqual(validateDocument(importMap(samples[1])).errors, []);
  assert.ok(
    validateDocument(importMap(samples[1])).warnings.some((s) =>
      s.includes("external reference"),
    ),
  );
});
test("all four new-block templates produce legal definitions and 777 cannot be redefined", () => {
  for (const type of ["Move", "Wall", "Interaction", "Inventory"]) {
    const doc = createMap(),
      block = nextBlock(doc, type);
    saveBlock(doc, null, block);
    assert.deepEqual(validateDocument(doc).errors, []);
  }
  const doc = createMap(),
    block = nextBlock(doc);
  block.index = 777;
  assert.throws(() => saveBlock(doc, null, block), /reserved/);
});
test("bad dimensions, embedded newlines, and unknown placed indices cannot silently produce malformed exports", () => {
  const doc = createMap();
  assert.throws(
    () =>
      applyMapSettings(
        doc,
        { ...doc.map, Dimensions: "101x10" },
        {},
        "Shorthand",
      ),
    /Width/,
  );
  doc.map.Name = "One\n[Injected]";
  assert.throws(() => exportMap(doc), /physical line/);
  doc.map.Name = "Fine";
  doc.cells[0][0] = 999;
  assert.throws(() => exportMap(doc), /missing block/);
});
test("a newly authored and exported key/door puzzle runs directly in the existing game engine", async () => {
  const doc = createMap(),
    key = nextBlock(doc, "Inventory");
  saveBlock(doc, null, key);
  const door = nextBlock(doc, "Interaction");
  door.choices[0].fields = {
    Text: "Unlock",
    Action: "UseInventory",
    "Test.1": `SelectedItem.ID | Equal | ${key.fields.NID}`,
  };
  saveBlock(doc, null, door);
  doc.cells[1][2] = key.index;
  doc.cells[1][3] = door.index;
  const text = exportMap(doc),
    game = new Game({ startMap: 1, variables: {}, images: {} }, async () =>
      parseMap(text, 1),
    );
  await game.start("Sebastian");
  game.move(1, 0);
  await game.resolve(0);
  assert.equal(game.quantity(key.fields.NID), 1);
  game.move(1, 0);
  const result = await game.resolve(0, game.player.inventory[0].uid);
  assert.equal(result.passed, true);
  assert.equal(game.player.x, 4);
  assert.equal(game.quantity(key.fields.NID), 0);
  assert.equal(game.at(4, 2).type, "Move");
});
