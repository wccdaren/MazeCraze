import {
  parseMap,
  readINI,
  isNID,
  coordinates,
  splitList,
  integer,
} from "./spec.js";

// Plain data only. This module is also included in the standalone editor build.
export const EDITOR_TYPES = ["Move", "Wall", "Interaction", "Inventory"];
export const EDITOR_SUBJECTS = [
  "SelectedItem.ID",
  "SelectedItem.State",
  "SelectedItem.Power",
  "Target.RequiredPower",
  "Inventory.Quantity",
  "Equipment.Worn",
  "Equipment.Wielded",
  "Player.State",
  "Player.Variable.",
  "Map.Variable.",
];
export const EDITOR_COMPARISONS = [
  "Equal",
  "NotEqual",
  "GreaterThan",
  "LessThan",
  "GreaterOrEqual",
  "LessOrEqual",
  "Contains",
  "NotContains",
];
export const EDITOR_LOCATIONS = [
  "Head",
  "Torso",
  "Arms",
  "LeftArm",
  "RightArm",
  "Legs",
  "LeftLeg",
  "RightLeg",
  "Feet",
  "LeftFoot",
  "RightFoot",
  "Hands",
  "LeftHand",
  "RightHand",
];
export const cloneDocument = (document) => JSON.parse(JSON.stringify(document));

export function importMap(text, filename = "map.txt") {
  const sections = readINI(text, filename);
  const id = integer(sections.get("Map")?.fields.ID, "Map.ID");
  const parsed = parseMap(text, id);
  const blocks = [];
  for (const [name, section] of sections) {
    const match = /^Block\.([1-9]\d*)$/.exec(name);
    if (!match) continue;
    const index = Number(match[1]),
      choices = [];
    for (const [choiceName, choice] of sections) {
      const choiceMatch = new RegExp(
        `^Block\\.${index}\\.Choice\\.([1-9]\\d*)$`,
      ).exec(choiceName);
      if (choiceMatch)
        choices.push({
          index: Number(choiceMatch[1]),
          fields: { ...choice.fields },
        });
    }
    blocks.push({
      index,
      fields: { ...section.fields },
      choices: choices.sort((a, b) => a.index - b.index),
    });
  }
  const indices = new Map(
    blocks.map((block) => [block.fields.NID, block.index]),
  );
  const extras = [...sections]
    .filter(
      ([name]) =>
        !["Map", "Variables", "MapData"].includes(name) &&
        !/^Block\.[1-9]\d*(\.Choice\.[1-9]\d*)?$/.test(name),
    )
    .map(([name, section]) => ({
      name,
      fields: { ...section.fields },
      rows: section.rows.map((row) => row.text),
    }));
  return {
    filename,
    map: { ...sections.get("Map").fields, ID: String(parsed.id) },
    variables: { ...sections.get("Variables")?.fields },
    blocks: blocks.sort((a, b) => a.index - b.index),
    width: parsed.width,
    height: parsed.height,
    cells: parsed.cells.map((row) =>
      row.map((nid) => (nid === "@princess" ? 777 : indices.get(nid))),
    ),
    format: sections.get("MapData").fields.Format,
    dataExtras: Object.fromEntries(
      Object.entries(sections.get("MapData").fields).filter(
        ([key]) => key !== "Format",
      ),
    ),
    extras,
    comments: [
      ...new Set(
        text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(
            (line) =>
              line.startsWith(";") &&
              !line.startsWith("; Exported by Maze Craze"),
          ),
      ),
    ],
    importWarnings: [...parsed.warnings],
  };
}

export function createMap() {
  return importMap(
    `[Map]\nID: 1\nName: A New Adventure\nDimensions: 21x15\nDefaultBlock: 1/1.1\nBorderBlock: 1/2.2\nStartingLocation: (2,2)\nViewWindow: 3333 | 3303 | 5555 | 9999\n\n[Block.1]\nNID: 1/1.1\nType: Move\nDescription: Grass\nMapImage: ../assets/grass.png\n\n[Block.2]\nNID: 1/1.2\nType: Move\nDescription: Gravel\nMapImage: ../assets/gravel.png\n\n[Block.3]\nNID: 1/2.1\nType: Wall\nDescription: Tree\nMapImage: ../assets/tree.png\n\n[Block.4]\nNID: 1/2.2\nType: Wall\nDescription: Brick wall\nMapImage: ../assets/brick.png\n\n[MapData]\nFormat: Shorthand\n`,
    "map-1.txt",
  );
}

function writeFields(fields) {
  return Object.entries(fields).map(([key, value]) => {
    if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(key))
      throw new Error(`Invalid field name: ${key}`);
    if (/[\r\n]/.test(String(value)))
      throw new Error(`${key} must fit on one physical line.`);
    if (String(value).trim() === "")
      throw new Error(`${key} is empty; remove the optional setting instead.`);
    return `${key}: ${value}`;
  });
}

export function exportMap(document) {
  const lines = [
    "; Exported by Maze Craze Map Studio — coordinates begin at (1,1).",
  ];
  for (const comment of document.comments)
    if (comment.startsWith(";") && !/[\r\n]/.test(comment)) lines.push(comment);
  lines.push("", "[Map]", ...writeFields(document.map));
  if (Object.keys(document.variables).length)
    lines.push("", "[Variables]", ...writeFields(document.variables));
  for (const block of [...document.blocks].sort((a, b) => a.index - b.index)) {
    lines.push("", `[Block.${block.index}]`, ...writeFields(block.fields));
    for (const choice of [...block.choices].sort((a, b) => a.index - b.index))
      lines.push(
        "",
        `[Block.${block.index}.Choice.${choice.index}]`,
        ...writeFields(choice.fields),
      );
  }
  for (const section of document.extras) {
    if (!section.name || /[\r\n\[\]]/.test(section.name))
      throw new Error("Invalid extra section name.");
    if (section.rows.some((row) => /[\r\n]/.test(row)))
      throw new Error("Extra section rows must be single lines.");
    lines.push(
      "",
      `[${section.name}]`,
      ...writeFields(section.fields),
      ...section.rows,
    );
  }
  lines.push(
    "",
    "[MapData]",
    `Format: ${document.format}`,
    ...writeFields(document.dataExtras),
  );
  const defaultIndex = document.blocks.find(
    (block) => block.fields.NID === document.map.DefaultBlock,
  )?.index;
  if (
    document.cells.length !== document.height ||
    document.cells.some((row) => row.length !== document.width)
  )
    throw new Error("Cell grid and dimensions disagree.");
  const known = new Set([777, ...document.blocks.map((block) => block.index)]);
  for (let y = document.height; y >= 1; y--) {
    const row = document.cells[y - 1],
      runs = [];
    for (let x = 0; x < row.length; ) {
      const index = row[x];
      if (!known.has(index))
        throw new Error(
          `Cell (${x + 1},${y}) references missing block ${index}.`,
        );
      let count = 1;
      while (x + count < row.length && row[x + count] === index) count++;
      const repeated = `${index}${count > 1 ? `(${count})` : ""}`;
      if (document.format === "Longhand") runs.push(repeated);
      else if (index !== defaultIndex) runs.push(`(${x + 1},${y})${repeated}`);
      x += count;
    }
    if (runs.length) lines.push(runs.join(" | "));
  }
  const text = `${lines.join("\n")}\n`;
  if (new TextEncoder().encode(text).byteLength > 2_000_000)
    throw new Error("Map exceeds the 2 MB game limit.");
  return text;
}

export function nextBlock(document, type = "Interaction") {
  const category = EDITOR_TYPES.indexOf(type) + 1;
  if (!category) throw new Error("Unknown block type.");
  let index = 1,
    suffix = 1;
  const indices = new Set(document.blocks.map((block) => block.index));
  while (indices.has(index) || index === 777) index++;
  const nids = new Set(document.blocks.map((block) => block.fields.NID));
  while (nids.has(`${document.map.ID}/${category}.${suffix}`)) suffix++;
  const fields = {
    NID: `${document.map.ID}/${category}.${suffix}`,
    Type: type,
    Description: `New ${type} block`,
    MapImage: `../assets/${{ Move: "grass", Wall: "tree", Interaction: "chest", Inventory: "key" }[type]}.png`,
  };
  if (type === "Inventory") fields.ItemKind = "Item";
  return {
    index,
    fields,
    choices:
      type === "Interaction"
        ? [
            {
              index: 1,
              fields: {
                Text: "Try it",
                Action: "Attempt",
                "Pass.Message": "The puzzle yields. The way is clear!",
              },
            },
          ]
        : [],
  };
}

function allFieldSets(document) {
  return [
    document.map,
    ...document.blocks.flatMap((block) => [
      block.fields,
      ...block.choices.map((choice) => choice.fields),
    ]),
  ];
}
function referenceField(key) {
  return (
    ["NID", "DefaultBlock", "BorderBlock"].includes(key) ||
    /^Test\.[1-9]\d*$/.test(key) ||
    /^(Pass|Fail)\.(ReplaceBlock|GiveItems|TakeItems)$/.test(key)
  );
}
export function remapReferences(document, replacements) {
  for (const fields of allFieldSets(document))
    for (const [key, value] of Object.entries(fields)) {
      if (!referenceField(key)) continue;
      fields[key] = String(value)
        .split("|")
        .map((part) => replacements.get(part.trim()) ?? part.trim())
        .join(" | ");
    }
}
export function saveBlock(document, previousIndex, replacement) {
  integer(replacement.index, "Block index");
  if (replacement.index === 777)
    throw new Error("777 is reserved for the princess ending.");
  if (
    document.blocks.some(
      (block) =>
        block.index === replacement.index && block.index !== previousIndex,
    )
  )
    throw new Error("That block index is already in use.");
  if (
    document.blocks.some(
      (block) =>
        block.fields.NID === replacement.fields.NID &&
        block.index !== previousIndex,
    )
  )
    throw new Error("That NID is already in use.");
  const existing = document.blocks.find(
    (block) => block.index === previousIndex,
  );
  if (existing) {
    const oldNID = existing.fields.NID;
    document.blocks[document.blocks.indexOf(existing)] =
      cloneDocument(replacement);
    remapReferences(document, new Map([[oldNID, replacement.fields.NID]]));
    for (const row of document.cells)
      for (let x = 0; x < row.length; x++)
        if (row[x] === previousIndex) row[x] = replacement.index;
  } else document.blocks.push(cloneDocument(replacement));
}
export function duplicateBlock(document, index) {
  const source = document.blocks.find((block) => block.index === index);
  if (!source) throw new Error("Select a normal block to duplicate.");
  const copy = cloneDocument(source),
    next = nextBlock(document, source.fields.Type);
  copy.index = next.index;
  copy.fields.NID = next.fields.NID;
  copy.fields.Description = `${source.fields.Description} copy`;
  for (const choice of copy.choices)
    for (const [key, value] of Object.entries(choice.fields))
      if (referenceField(key))
        choice.fields[key] = value
          .split("|")
          .map((part) =>
            part.trim() === source.fields.NID ? copy.fields.NID : part.trim(),
          )
          .join(" | ");
  document.blocks.push(copy);
  return copy.index;
}
export function deleteBlock(document, index) {
  const block = document.blocks.find((block) => block.index === index);
  if (!block) throw new Error("Select a block to delete.");
  if (
    [document.map.DefaultBlock, document.map.BorderBlock].includes(
      block.fields.NID,
    )
  )
    throw new Error(
      "Change the map’s default/border settings before deleting this block.",
    );
  for (const other of document.blocks.filter((other) => other !== block))
    for (const choice of other.choices)
      for (const [key, value] of Object.entries(choice.fields)) {
        if (referenceField(key) && splitList(value).includes(block.fields.NID))
          throw new Error(
            `${other.fields.Description} references this block in ${key}; edit that reference first.`,
          );
      }
  const defaultIndex = document.blocks.find(
    (candidate) => candidate.fields.NID === document.map.DefaultBlock,
  ).index;
  document.blocks = document.blocks.filter((candidate) => candidate !== block);
  for (const row of document.cells)
    for (let x = 0; x < row.length; x++)
      if (row[x] === index) row[x] = defaultIndex;
}

export function applyMapSettings(document, fields, variables, format) {
  const id = integer(fields.ID, "Map.ID"),
    size = /^(\d+)x(\d+)$/.exec(fields.Dimensions);
  if (!size) throw new Error("Dimensions must look like 21x15.");
  const width = integer(size[1], "Width", 1, 100),
    height = integer(size[2], "Height", 1, 100);
  const oldID = document.map.ID;
  const replacements = new Map(
    document.blocks.map((block) => [
      block.fields.NID,
      block.fields.NID.replace(`${oldID}/`, `${id}/`),
    ]),
  );
  const oldDefault = document.blocks.find(
    (block) => block.fields.NID === document.map.DefaultBlock,
  ).index;
  const defaultIndex = document.blocks.find(
    (block) =>
      block.fields.NID === fields.DefaultBlock ||
      replacements.get(block.fields.NID) === fields.DefaultBlock,
  )?.index;
  if (!defaultIndex)
    throw new Error("Select a defined Move block for the default.");
  document.cells = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const value = document.cells[y]?.[x];
      return value === undefined || value === oldDefault ? defaultIndex : value;
    }),
  );
  document.map = { ...fields, ID: String(id) };
  document.variables = { ...variables };
  if (String(id) !== String(oldID)) remapReferences(document, replacements);
  document.width = width;
  document.height = height;
  document.format = format;
}

export function lineCells(from, to) {
  const cells = [];
  let x = from.x,
    y = from.y;
  const dx = Math.abs(to.x - x),
    sx = x < to.x ? 1 : -1;
  const dy = -Math.abs(to.y - y),
    sy = y < to.y ? 1 : -1;
  let error = dx + dy;
  while (true) {
    cells.push({ x, y });
    if (x === to.x && y === to.y) break;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
  return cells;
}
export function fillCells(document, x, y, index) {
  const original = document.cells[y - 1]?.[x - 1];
  if (original === undefined || original === index) return;
  const queue = [[x - 1, y - 1]];
  document.cells[y - 1][x - 1] = index;
  while (queue.length) {
    const [cx, cy] = queue.pop();
    for (const [nx, ny] of [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ])
      if (document.cells[ny]?.[nx] === original) {
        document.cells[ny][nx] = index;
        queue.push([nx, ny]);
      }
  }
}

export function validateDocument(document) {
  const errors = [],
    warnings = [];
  let parsed;
  try {
    parsed = parseMap(exportMap(document), Number(document.map.ID));
  } catch (error) {
    return { errors: [error.message], warnings };
  }
  warnings.push(...parsed.warnings);
  const definitions = new Map(
    document.blocks.map((block) => [block.fields.NID, block]),
  );
  const checkNID = (nid, label, kind) => {
    if (!isNID(nid)) {
      errors.push(`${label}: invalid NID ${nid}.`);
      return;
    }
    const def = definitions.get(nid);
    if (!def) {
      if (nid.startsWith(`${document.map.ID}/`))
        errors.push(`${label}: ${nid} is not defined in this map.`);
      else
        warnings.push(
          `${label}: external reference ${nid}; ensure its map is listed in the main configuration.`,
        );
    } else if (kind === "Inventory" && def.fields.Type !== "Inventory")
      errors.push(`${label}: ${nid} must be an Inventory block.`);
    else if (
      kind === "Item" &&
      (def.fields.Type !== "Inventory" || def.fields.ItemKind !== "Item")
    )
      errors.push(`${label}: only regular items can be consumed.`);
  };
  for (const key of Object.keys(document.variables))
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key))
      errors.push(`Invalid map variable name ${key}.`);
  for (const block of document.blocks) {
    for (const key of ["MapImage", "InteractionImage"]) {
      const value = block.fields[key];
      if (
        value &&
        /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) &&
        !/^https?:\/\//.test(value)
      )
        errors.push(
          `${block.fields.Description}: ${key} must be a relative path or HTTP(S) URL.`,
        );
    }
  }
  for (const block of document.blocks)
    for (const choice of block.choices) {
      const label = `${block.fields.Description}, choice ${choice.index}`;
      for (const [key, value] of Object.entries(choice.fields)) {
        if (/^Test\./.test(key)) {
          const [subject, comparison, expected, qualifier] = splitList(value);
          const collection = [
            "Equipment.Worn",
            "Equipment.Wielded",
            "Player.State",
          ].includes(subject);
          if (collection !== ["Contains", "NotContains"].includes(comparison))
            errors.push(
              `${label}: ${subject} requires ${collection ? "Contains or NotContains" : "a scalar comparison"}.`,
            );
          if (
            ["SelectedItem.ID", "Equipment.Worn", "Equipment.Wielded"].includes(
              subject,
            )
          )
            checkNID(expected, label, "Inventory");
          if (subject === "Inventory.Quantity")
            checkNID(qualifier, label, "Inventory");
          if (
            subject.startsWith("Map.Variable.") &&
            !Object.hasOwn(document.variables, subject.slice(13))
          )
            errors.push(
              `${label}: declare map variable ${subject.slice(13)} in map settings.`,
            );
          if (subject.startsWith("Player.Variable."))
            warnings.push(
              `${label}: player variable ${subject.slice(16)} must be declared in the main configuration.`,
            );
          if (
            subject.startsWith("SelectedItem.") &&
            choice.fields.Action === "Attempt"
          )
            warnings.push(
              `${label}: Attempt does not select an item; use UseInventory or Attack for this test.`,
            );
          if (
            [
              "GreaterThan",
              "LessThan",
              "GreaterOrEqual",
              "LessOrEqual",
            ].includes(comparison) &&
            expected !== "Target.RequiredPower" &&
            !/^-?\d+(\.\d+)?$/.test(expected)
          )
            errors.push(
              `${label}: numeric comparison needs a number or Target.RequiredPower.`,
            );
        }
        if (/^(Pass|Fail)\.ReplaceBlock$/.test(key)) checkNID(value, label);
        if (/^(Pass|Fail)\.(GiveItems|TakeItems)$/.test(key))
          for (const nid of splitList(value))
            checkNID(
              nid,
              label,
              key.endsWith("TakeItems") ? "Item" : "Inventory",
            );
        if (
          /^(Pass|Fail)\.SetMapVariable\./.test(key) &&
          !Object.hasOwn(
            document.variables,
            key.slice(key.indexOf("SetMapVariable.") + 15),
          )
        )
          errors.push(`${label}: outcome sets an undeclared map variable.`);
        if (/^(Pass|Fail)\.SetPlayerVariable\./.test(key))
          warnings.push(
            `${label}: outcome player variable must be declared in the main configuration.`,
          );
        if (/^(Pass|Fail)\.Transport$/.test(key)) {
          const match = /^(?:\(([1-9]\d*)\))?(\(\d+,\d+\))?$/.exec(value);
          const coord = match?.[2] ? coordinates(match[2]) : null;
          if (!match || (!match[1] && !coord))
            warnings.push(
              `${label}: malformed transport falls back to the map start.`,
            );
          else if (match[1] && match[1] !== document.map.ID)
            warnings.push(
              `${label}: destination map ${match[1]} must exist in the main configuration.`,
            );
          else if (
            coord &&
            (coord.x < 1 ||
              coord.y < 1 ||
              coord.x > document.width ||
              coord.y > document.height)
          )
            warnings.push(
              `${label}: transport coordinate is outside this map; the game uses its start.`,
            );
        }
      }
    }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export class EditorHistory {
  constructor(document) {
    this.reset(document);
  }
  reset(document) {
    this.undoStack = [];
    this.redoStack = [];
    this.saved = JSON.stringify(document);
  }
  push(document, label) {
    this.undoStack.push({ text: JSON.stringify(document), label });
    this.redoStack = [];
    while (
      this.undoStack.length > 40 ||
      (this.undoStack.length > 1 &&
        this.undoStack.reduce((sum, entry) => sum + entry.text.length, 0) >
          4_000_000)
    )
      this.undoStack.shift();
  }
  undo(document) {
    const entry = this.undoStack.pop();
    if (!entry) return document;
    this.redoStack.push({ text: JSON.stringify(document), label: entry.label });
    return JSON.parse(entry.text);
  }
  redo(document) {
    const entry = this.redoStack.pop();
    if (!entry) return document;
    this.undoStack.push({ text: JSON.stringify(document), label: entry.label });
    return JSON.parse(entry.text);
  }
  dirty(document) {
    return JSON.stringify(document) !== this.saved;
  }
  markSaved(document) {
    this.saved = JSON.stringify(document);
  }
}
