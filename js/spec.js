// The specification is DATA. Never use eval(), HTML interpretation, or dynamic imports here.
export class SpecError extends Error {}
const TYPES = new Set(['Move', 'Wall', 'Interaction', 'Inventory']);
const ACTIONS = new Set(['Attempt', 'UseInventory', 'Attack']);
const COMPARISONS = new Set(['Equal', 'NotEqual', 'GreaterThan', 'LessThan', 'GreaterOrEqual', 'LessOrEqual', 'Contains', 'NotContains']);
export const splitList = value => String(value ?? '').split('|').map(s => s.trim()).filter(Boolean);
export const isNID = value => /^[1-9]\d*\/[1-4]\.[1-9]\d*$/.test(String(value));
export const scalar = value => /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : String(value);
export function integer(value, label, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new SpecError(`${label}: expected an integer from ${min} to ${max}.`);
  return Number(value);
}
export function coordinates(value) {
  const match = /^\(\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(String(value));
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}
export function readINI(text, name = 'Specification') {
  if (text.length > 2_000_000) throw new SpecError(`${name}: file exceeds 2 MB.`);
  const sections = new Map();
  let current;
  for (const [index, original] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const line = original.trim();
    if (!line || line.startsWith(';')) continue;
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      if (sections.has(header[1])) throw new SpecError(`${name}, line ${index + 1}: duplicate section ${header[1]}.`);
      current = { fields: Object.create(null), rows: [], line: index + 1 };
      sections.set(header[1], current);
      continue;
    }
    if (!current) throw new SpecError(`${name}, line ${index + 1}: entry has no section.`);
    const pair = /^([A-Za-z][A-Za-z0-9_.]*): (.*)$/.exec(line);
    if (pair) {
      if (Object.hasOwn(current.fields, pair[1])) throw new SpecError(`${name}, line ${index + 1}: duplicate field ${pair[1]}.`);
      current.fields[pair[1]] = pair[2].trim();
    } else current.rows.push({ text: line, line: index + 1 });
  }
  return sections;
}
const sectionFields = (sections, name) => sections.get(name)?.fields ?? Object.create(null);
export function parseMain(text) {
  const sections = readINI(text, 'Main configuration');
  for (const [name, section] of sections) {
    if (!['Game', 'Maps', 'Images', 'Style', 'PlayerVariables', 'Games', 'ImageCatalog'].includes(name) || section.rows.length) throw new SpecError(`Invalid main configuration section or entry: ${name}.`);
  }
  const game = sectionFields(sections, 'Game');
  const maps = sectionFields(sections, 'Maps');
  const startMap = game.StartMap ? integer(game.StartMap, 'StartMap') : (sections.has('Games') ? undefined : integer(game.StartMap, 'StartMap'));
  const files = new Map();
  for (const [key, url] of Object.entries(maps)) {
    const match = /^Map\.([1-9]\d*)$/.exec(key);
    if (!match || !url) throw new SpecError(`Invalid map directory field: ${key}.`);
    files.set(Number(match[1]), url);
  }
  if (files.size && startMap !== undefined && !files.has(startMap) && !sections.has('Games')) throw new SpecError('StartMap has no file in [Maps].');
  const timeout = integer(game.RequestTimeoutMs ?? '10000', 'RequestTimeoutMs', 1000, 30000);
  const games = new Map();
  for (const [key, path] of Object.entries(sectionFields(sections, 'Games'))) {
    const match = /^Game\.([A-Za-z][A-Za-z0-9_-]*)$/.exec(key);
    if (!match || !path) throw new SpecError(`Invalid game directory field: ${key}.`);
    games.set(match[1], path);
  }
  if (!files.size && !games.size) throw new SpecError('Configuration needs [Maps] or [Games].');
  const startGame = game.StartGame || (files.size ? 'main' : games.keys().next().value);
  if (!games.has(startGame) && !(startGame === 'main' && files.size)) throw new SpecError('StartGame has no entry in [Games].');
  return { games, startGame, author: game.Author || '', welcome: game.WelcomeMessage || '', victoryTitle: game.VictoryTitle || '', victoryMessage: game.VictoryMessage || '', imageCatalog: sectionFields(sections, 'ImageCatalog'), title: game.Title || 'Maze Craze', startMap, files, timeout, images: sectionFields(sections, 'Images'), style: sectionFields(sections, 'Style'), variables: Object.fromEntries(Object.entries(sectionFields(sections, 'PlayerVariables')).map(([key, value]) => [key, scalar(value)])) };
}
export function parseMap(text, expectedId) {
  const sections = readINI(text, `Map ${expectedId}`);
  const warnings = [];
  const warn = message => warnings.push(`Map ${expectedId}: ${message}`);
  const data = sectionFields(sections, 'Map');
  const id = integer(data.ID, 'Map.ID');
  if (id !== expectedId) throw new SpecError(`Expected map ${expectedId}, received map ${id}.`);
  const size = /^(\d+)x(\d+)$/.exec(data.Dimensions ?? '');
  if (!size) throw new SpecError('Dimensions must look like 25x19.');
  const width = integer(size[1], 'Width', 1, 100), height = integer(size[2], 'Height', 1, 100);
  const start = coordinates(data.StartingLocation);
  if (!start || start.x < 1 || start.y < 1 || start.x > width || start.y > height) throw new SpecError(`Map ${id}: invalid StartingLocation; a valid fallback is required.`);
  const views = splitList(data.ViewWindow || '3333');
  if (!views.length || views.some(view => !/^\d{4}$/.test(view))) throw new SpecError('ViewWindow entries must contain four digits: up, right, down, left.');
  const blocks = new Map(), byNID = new Map();
  const variables = Object.fromEntries(Object.entries(sectionFields(sections, 'Variables')).map(([key, value]) => [key, scalar(value)]));
  const blockFields = new Set(['NID', 'Type', 'Description', 'MapImage', 'InteractionImage', 'Message', 'CancelActionText', 'RequiredPower', 'ItemKind', 'Power', 'State', 'WearLocation', 'Hands', 'ItemGroup']);
  for (const [name, section] of sections) {
    const match = /^Block\.([1-9]\d*)$/.exec(name);
    if (!match) continue;
    const index = integer(match[1], 'Block index');
    if (index === 777) throw new SpecError('Block 777 is reserved for the princess ending.');
    const f = section.fields;
    if (!isNID(f.NID) || !f.NID.startsWith(`${id}/`)) throw new SpecError(`${name}: NID must use this map's prefix, such as ${id}/3.1.`);
    if (!TYPES.has(f.Type)) throw new SpecError(`${name}: invalid Type.`);
    if (byNID.has(f.NID)) throw new SpecError(`Duplicate NID ${f.NID}.`);
    const category = f.NID.split('/')[1].split('.')[0];
    if (category !== String(['Move', 'Wall', 'Interaction', 'Inventory'].indexOf(f.Type) + 1)) throw new SpecError(`${name}: NID category does not match Type.`);
    if (!f.Description || !f.MapImage) throw new SpecError(`${name}: Description and MapImage are required.`);
    if (f.Type === 'Inventory' && !['Item', 'Weapon', 'Wearable'].includes(f.ItemKind)) throw new SpecError(`${name}: inventory requires ItemKind: Item, Weapon, or Wearable.`);
    if (f.ItemKind === 'Wearable' && !['Head', 'Torso', 'Arms', 'LeftArm', 'RightArm', 'Legs', 'LeftLeg', 'RightLeg', 'Feet', 'LeftFoot', 'RightFoot', 'Hands', 'LeftHand', 'RightHand'].includes(f.WearLocation)) throw new SpecError(`${name}: invalid WearLocation.`);
    if (f.ItemGroup && !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(f.ItemGroup)) throw new SpecError(`${name}: invalid ItemGroup.`);
    const block = { index, nid: f.NID, type: f.Type, name: f.Description, image: f.MapImage, picture: f.InteractionImage || f.MapImage, message: f.Message || '', cancel: f.CancelActionText || 'Leave', requiredPower: integer(f.RequiredPower || '0', 'RequiredPower', 0), itemKind: f.ItemKind, itemGroup: f.ItemGroup || '', power: integer(f.Power || '0', 'Power', 0), state: f.State || 'Working', wearLocation: f.WearLocation, hands: integer(f.Hands || '1', 'Hands', 1, 2), choices: [], mapId: id };
    for (const key of Object.keys(f)) if (!blockFields.has(key)) warn(`${name}: unknown field ${key}.`);
    if (section.rows.length) throw new SpecError(`${name}: malformed setting at line ${section.rows[0].line}.`);
    blocks.set(index, block); byNID.set(block.nid, block);
  }
  const effects = new Set(['Message', 'ReplaceBlock', 'GiveItems', 'TakeItems', 'AddState', 'RemoveState', 'Transport', 'EndGame']);
  for (const [name, section] of sections) {
    const match = /^Block\.([1-9]\d*)\.Choice\.([1-9]\d*)$/.exec(name);
    if (!match) continue;
    const block = blocks.get(Number(match[1])), f = section.fields;
    if (!block || block.type !== 'Interaction') throw new SpecError(`${name}: choice needs an Interaction block.`);
    if (!f.Text || !ACTIONS.has(f.Action)) throw new SpecError(`${name}: invalid choice Text or Action.`);
    const mode = f.TestsMatch || 'All';
    if (!['All', 'Any'].includes(mode)) throw new SpecError(`${name}: TestsMatch must be All or Any.`);
    const tests = [];
    for (const [key, value] of Object.entries(f)) {
      if (/^Test\.[1-9]\d*$/.test(key)) {
        const parts = splitList(value);
        const subject = parts[0];
        if (parts.length < 3 || parts.length > 4 || !COMPARISONS.has(parts[1]) || !/^(Player\.(HP|State|Variable\.[A-Za-z][A-Za-z0-9_]*)|Map\.Variable\.[A-Za-z][A-Za-z0-9_]*|SelectedItem\.(ID|State|Power)|Target\.RequiredPower|Inventory\.Quantity|Equipment\.(Worn|Wielded))$/.test(subject) || subject === 'Player.HP') throw new SpecError(`${name}: invalid rule ${key}; player health is not used.`);
        if (subject === 'Inventory.Quantity' && (!isNID(parts[3]))) throw new SpecError(`${name}: Inventory.Quantity requires an item NID as its fourth field.`);
        tests.push({ order: Number(key.slice(5)), subject, comparison: parts[1], value: parts[2], qualifier: parts[3] });
      } else if (key.startsWith('Pass.') || key.startsWith('Fail.')) {
        const effect = key.slice(5);
        if (!effects.has(effect) && !/^Set(Player|Map)Variable\.[A-Za-z][A-Za-z0-9_]*$/.test(effect)) throw new SpecError(`${name}: unknown outcome setting ${key}.`);
        if (effect === 'ReplaceBlock' && !isNID(value)) throw new SpecError(`${name}: ReplaceBlock requires a full NID.`);
        if (['GiveItems', 'TakeItems'].includes(effect) && splitList(value).some(nid => !isNID(nid))) throw new SpecError(`${name}: ${key} requires full NIDs.`);
        if (effect === 'EndGame' && !['Yes', 'No'].includes(value)) throw new SpecError(`${name}: EndGame must be Yes or No.`);
      } else if (!['Text', 'Action', 'SelectionPrompt', 'SelectionItems', 'SelectionGroup', 'NoSelectionMessage', 'TestsMatch'].includes(key)) warn(`${name}: unknown field ${key}.`);
    }
    if (f.SelectionGroup && !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(f.SelectionGroup)) throw new SpecError(`${name}: invalid SelectionGroup.`);
    if (splitList(f.SelectionItems).some(nid => !isNID(nid))) throw new SpecError(`${name}: SelectionItems requires full NIDs.`);
    if (section.rows.length) throw new SpecError(`${name}: malformed setting at line ${section.rows[0].line}.`);
    block.choices.push({ order: Number(match[2]), text: f.Text, action: f.Action, prompt: f.SelectionPrompt || 'Choose an item.', mode, tests: tests.sort((a, b) => a.order - b.order), fields: f });
  }
  for (const block of blocks.values()) {
    block.choices.sort((a, b) => a.order - b.order);
    if (block.type === 'Interaction' && !block.choices.length) throw new SpecError(`${block.name}: Interaction requires at least one choice.`);
  }
  const defaultBlock = byNID.get(data.DefaultBlock), border = byNID.get(data.BorderBlock);
  if (defaultBlock?.type !== 'Move') throw new SpecError('DefaultBlock must reference a local Move block.');
  if (!border) throw new SpecError('BorderBlock must reference a local block.');
  const cells = Array.from({ length: height }, () => Array(width).fill(defaultBlock.nid));
  const mapData = sections.get('MapData');
  const format = mapData?.fields.Format;
  if (!['Longhand', 'Shorthand'].includes(format)) throw new SpecError('MapData.Format must be Longhand or Shorthand.');
  for (const [rowIndex, row] of mapData.rows.entries()) {
    try {
      const updates = [];
      const entries = row.text.split('|').map(s => s.trim());
      let cursor = 1;
      if (format === 'Longhand' && rowIndex >= height) throw new SpecError('extra row outside map height');
      for (const entry of entries) {
        const match = (format === 'Longhand' ? /^(\d+)(?:\((\d+)\))?$/ : /^\((\d+),(\d+)\)(\d+)(?:\((\d+)\))?$/).exec(entry);
        if (!match) throw new SpecError(`invalid entry "${entry}"`);
        const x = format === 'Longhand' ? cursor : integer(match[1], 'X', 1, width);
        const y = format === 'Longhand' ? height - rowIndex : integer(match[2], 'Y', 1, height);
        const index = integer(format === 'Longhand' ? match[1] : match[3], 'Block index');
        const count = integer((format === 'Longhand' ? match[2] : match[4]) ?? '1', 'Count', 1, width);
        if (x + count - 1 > width) throw new SpecError('entry extends beyond map width');
        const nid = index === 777 ? '@princess' : blocks.get(index)?.nid;
        if (!nid) throw new SpecError(`undefined block index ${index}`);
        for (let n = 0; n < count; n++) updates.push({ x: x + n, y, nid });
        cursor += count;
      }
      if (format === 'Longhand' && cursor !== width + 1) throw new SpecError(`expected ${width} cells; found ${cursor - 1}`);
      for (const update of updates) cells[update.y - 1][update.x - 1] = update.nid;
    } catch (error) { warn(`file line ${row.line}: skipped ${format === 'Longhand' ? `map row Y=${height - rowIndex}` : 'shorthand line'}: ${error.message}.`); }
  }
  if (format === 'Longhand' && mapData.rows.length < height) warn(`only ${mapData.rows.length} of ${height} map rows supplied; remaining cells retain defaults.`);
  for (const [name, section] of sections) {
    if (!['Map', 'MapData', 'Variables', 'EditorIDs'].includes(name) && !/^Block\.[1-9]\d*(\.Choice\.[1-9]\d*)?$/.test(name)) warn(`unknown section [${name}].`);
    if (['Map', 'Variables'].includes(name) && section.rows.length) throw new SpecError(`${name}: malformed setting at line ${section.rows[0].line}.`);
  }
  for (const key of Object.keys(data)) if (!['ID', 'Name', 'Dimensions', 'DefaultBlock', 'BorderBlock', 'StartingLocation', 'ViewWindow'].includes(key)) warn(`Map: unknown field ${key}.`);
  for (const key of Object.keys(mapData.fields)) if (key !== 'Format') warn(`MapData: unknown field ${key}.`);
  return { id, name: data.Name || `Map ${id}`, width, height, start, views, defaultNID: defaultBlock.nid, borderNID: border.nid, blocks, byNID, cells, variables, warnings };
}
