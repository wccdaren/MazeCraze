import { coordinates, isNID, scalar, splitList, SpecError } from './spec.js';

const CLOTHING_SLOTS = {
  Head: ['head'], Torso: ['torso'], Arms: ['leftArm', 'rightArm'], LeftArm: ['leftArm'], RightArm: ['rightArm'],
  Legs: ['leftLeg', 'rightLeg'], LeftLeg: ['leftLeg'], RightLeg: ['rightLeg'], Feet: ['leftFoot', 'rightFoot'],
  LeftFoot: ['leftFoot'], RightFoot: ['rightFoot'], Hands: ['leftHand', 'rightHand'], LeftHand: ['leftHand'], RightHand: ['rightHand']
};
const comparison = (left, op, right) => {
  if (op === 'Contains' || op === 'NotContains') {
    const contains = Array.isArray(left) && left.includes(right);
    if (!Array.isArray(left)) throw new SpecError('Contains tests require a collection.');
    return op === 'Contains' ? contains : !contains;
  }
  if (Array.isArray(left) || Array.isArray(right)) throw new SpecError('Collection tests require Contains or NotContains.');
  if (op === 'Equal') return left === right;
  if (op === 'NotEqual') return left !== right;
  if (typeof left !== 'number' || typeof right !== 'number' || !Number.isFinite(left) || !Number.isFinite(right)) throw new SpecError('Numeric comparisons require numbers.');
  return { GreaterThan: left > right, LessThan: left < right, GreaterOrEqual: left >= right, LessOrEqual: left <= right }[op];
};

export class Game {
  constructor(config, loadMap) {
    this.config = config;
    this.loadMap = loadMap;
    this.maps = new Map();
    this.player = { name: 'Gnome', x: 1, y: 1, inventory: [], clothing: new Map(), weapons: new Map(), states: new Set(), variables: { ...config.variables } };
    this.nextUID = 1;
    this.pending = null;
    this.ended = false;
    this.busy = false;
    this.paused = false;
  }
  async ensureMap(id) {
    if (!this.maps.has(id)) {
      const source = await this.loadMap(id);
      const map = { ...source, cells: source.cells.map(row => [...row]), variables: { ...source.variables } };
      this.maps.set(id, map);
    }
    return this.maps.get(id);
  }
  async start(name) {
    this.player.name = String(name).trim().slice(0, 32) || 'Gnome';
    const map = await this.ensureMap(this.config.startMap);
    this.mapId = map.id;
    Object.assign(this.player, map.start);
  }
  get map() { return this.maps.get(this.mapId); }
  block(nid) {
    if (nid === '@princess') return { nid, name: this.config.victoryTitle || 'You saved the princess!', type: 'Interaction', image: this.config.images.Princess, picture: this.config.images.Princess, mapId: this.mapId, message: 'The princess waves from the garden tower. Your clever puzzle-solving has saved the day!', cancel: 'Leave', choices: [{ text: 'Celebrate!', action: 'Attempt', tests: [], mode: 'All', fields: { 'Pass.Message': this.config.victoryMessage || 'YOU SAVED THE PRINCESS! The kingdom cheers for {Player.Name}, the happiest gnome in the realm!', 'Pass.EndGame': 'Yes' } }] };
    const mapId = Number(String(nid).split('/')[0]);
    const block = this.maps.get(mapId)?.byNID.get(nid);
    if (!block) throw new SpecError(`Unknown block NID ${nid}.`);
    return block;
  }
  at(x, y) {
    return this.block(x < 1 || y < 1 || x > this.map.width || y > this.map.height ? this.map.borderNID : this.map.cells[y - 1][x - 1]);
  }
  move(dx, dy) {
    if (this.pending || this.busy || this.ended || this.paused) return { kind: 'ignored' };
    if (![[0, 1], [1, 0], [0, -1], [-1, 0]].some(([x, y]) => x === dx && y === dy)) throw new Error('Movement must be one orthogonal cell.');
    const x = this.player.x + dx, y = this.player.y + dy;
    if (x < 1 || y < 1 || x > this.map.width || y > this.map.height) return { kind: 'wall', message: 'The edge of the map is beyond your reach.' };
    const block = this.at(x, y);
    if (block.type === 'Wall') return { kind: 'wall', message: `${block.name} blocks the way. Perhaps another path awaits.` };
    if (block.type === 'Move') { Object.assign(this.player, { x, y }); return { kind: 'move' }; }
    this.pending = { mapId: this.mapId, x, y, block };
    return { kind: block.nid === '@princess' ? 'ending' : 'interaction', block };
  }
  choices() {
    if (!this.pending) return [];
    const block = this.pending.block;
    if (block.type === 'Inventory') return [{ text: `Pick up ${block.name}`, action: 'PickUp', tests: [], mode: 'All', fields: { 'Pass.GiveItems': block.nid, 'Pass.Message': 'You tuck {Target.Name} into your pack. A useful find!' } }];
    return block.choices;
  }
  cancel() { if (!this.busy && !this.paused) this.pending = null; }
  pause() { if (this.busy) return false; this.paused = true; return true; }
  resume() { this.paused = false; }
  definition(item) { return this.block(item.nid); }
  quantity(nid) { return this.player.inventory.filter(item => item.nid === nid).length; }
  equipment(kind) {
    const uids = new Set(this.player[kind].values());
    return this.player.inventory.filter(item => uids.has(item.uid));
  }
  eligible(action, choice) {
    let items = action === 'Attack' ? this.equipment('weapons') : action === 'UseInventory'
      ? this.player.inventory.filter(item => this.definition(item).itemKind === 'Item') : [];
    const ids = splitList(choice?.fields.SelectionItems), group = choice?.fields.SelectionGroup;
    if (ids.length) items = items.filter(item => ids.includes(item.nid));
    if (group) items = items.filter(item => this.definition(item).itemGroup === group);
    return items;
  }
  discard(uid) {
    if (this.pending || this.busy || this.ended || this.paused) throw new SpecError('Put away this interaction before discarding.');
    if ([...this.player.clothing.values(), ...this.player.weapons.values()].includes(uid)) throw new SpecError('Put the equipped item away first.');
    if (!this.player.inventory.some(item => item.uid === uid)) throw new SpecError('That item is no longer in your inventory.');
    this.player.inventory = this.player.inventory.filter(item => item.uid !== uid);
  }
  equip(uid, hand = 'Right') {
    if (this.pending || this.busy || this.ended || this.paused) return;
    const item = this.player.inventory.find(candidate => candidate.uid === uid);
    if (!item) throw new SpecError('That item is no longer in your inventory.');
    const def = this.definition(item);
    let target, slots;
    if (def.itemKind === 'Wearable') { target = this.player.clothing; slots = CLOTHING_SLOTS[def.wearLocation]; }
    else if (def.itemKind === 'Weapon') {
      if (!['Left', 'Right'].includes(hand)) throw new SpecError('Choose Left or Right hand.');
      target = this.player.weapons; slots = def.hands === 2 ? ['leftHand', 'rightHand'] : [`${hand.toLowerCase()}Hand`];
    } else throw new SpecError('Only clothing and weapons can be equipped.');
    // Remove the complete overlapping item, including its other occupied slots.
    const displaced = new Set([item.uid, ...slots.map(slot => target.get(slot)).filter(Boolean)]);
    for (const [slot, equipped] of target) if (displaced.has(equipped)) target.delete(slot);
    for (const slot of slots) target.set(slot, item.uid);
  }
  unequip(uid) {
    if (this.pending || this.busy || this.ended || this.paused) return;
    for (const target of [this.player.clothing, this.player.weapons]) for (const [slot, value] of target) if (value === uid) target.delete(slot);
  }
  test(rule, selected, target) {
    const p = this.player;
    let left;
    if (rule.subject === 'SelectedItem.ID') left = selected?.nid ?? '';
    else if (rule.subject === 'SelectedItem.State') left = selected?.state ?? '';
    else if (rule.subject === 'SelectedItem.Power') left = selected ? this.definition(selected).power : 0;
    else if (rule.subject === 'Target.RequiredPower') left = target.requiredPower;
    else if (rule.subject === 'Player.State') left = [...p.states];
    else if (rule.subject === 'Inventory.Quantity') left = this.quantity(rule.qualifier);
    else if (rule.subject === 'Equipment.Worn') left = this.equipment('clothing').filter(item => item.state === 'Working').map(item => item.nid);
    else if (rule.subject === 'Equipment.Wielded') left = this.equipment('weapons').filter(item => item.state === 'Working').map(item => item.nid);
    else if (rule.subject.startsWith('Player.Variable.')) {
      const key = rule.subject.slice(16);
      if (!Object.hasOwn(p.variables, key)) throw new SpecError(`Undeclared player variable ${key}.`);
      left = p.variables[key];
    } else if (rule.subject.startsWith('Map.Variable.')) {
      const key = rule.subject.slice(13);
      if (!Object.hasOwn(this.map.variables, key)) throw new SpecError(`Undeclared map variable ${key}.`);
      left = this.map.variables[key];
    } else throw new SpecError(`Unsupported rule subject ${rule.subject}.`);
    const right = rule.value === 'Target.RequiredPower' ? target.requiredPower : scalar(rule.value);
    return comparison(left, rule.comparison, right);
  }
  async requireDefinition(nid, inventory = false) {
    if (!isNID(nid)) throw new SpecError(`Invalid NID ${nid}.`);
    await this.ensureMap(Number(nid.split('/')[0]));
    const block = this.block(nid);
    if (inventory && block.type !== 'Inventory') throw new SpecError(`${nid} is not an inventory item.`);
    return block;
  }
  async destination(value) {
    let mapId = this.mapId, coord;
    const cross = /^\(([1-9]\d*)\)(.*)$/.exec(value);
    if (cross) { mapId = Number(cross[1]); coord = cross[2] ? coordinates(cross[2]) : null; }
    else coord = coordinates(value);
    const map = await this.ensureMap(mapId);
    const valid = coord && coord.x >= 1 && coord.y >= 1 && coord.x <= map.width && coord.y <= map.height;
    return { mapId, ...(valid ? coord : map.start), fallback: !valid && !(cross && !cross[2]) };
  }
  message(template, selected, target) {
    const values = { 'Player.Name': this.player.name, 'SelectedItem.Name': selected ? this.definition(selected).name : 'item', 'Target.Name': target.name };
    return String(template || '').replace(/\{(Player\.Name|SelectedItem\.Name|Target\.Name)\}/g, (_, key) => values[key]);
  }
  async resolve(choiceIndex, selectedUID) {
    if (!this.pending || this.busy || this.ended || this.paused) throw new SpecError('No interaction is ready.');
    const pending = this.pending, choice = this.choices()[choiceIndex];
    if (!choice) throw new SpecError('Unknown choice.');
    const needsItem = ['Attack', 'UseInventory'].includes(choice.action);
    const selected = this.eligible(choice.action, choice).find(item => item.uid === selectedUID);
    if (needsItem && !selected) throw new SpecError(choice.action === 'Attack' ? "With what? You haven't got any weapons in your hands!" : 'Choose an item from your pack.');
    this.busy = true;
    try {
      // Evaluate every rule so an invalid rule cannot be hidden by short-circuiting.
      const tests = choice.tests.map(rule => this.test(rule, selected, pending.block));
      const passed = tests.length === 0 || (choice.mode === 'Any' ? tests.some(Boolean) : tests.every(Boolean));
      const prefix = passed ? 'Pass.' : 'Fail.', f = choice.fields;
      const replacement = f[`${prefix}ReplaceBlock`] || (passed ? this.map.defaultNID : pending.block.nid);
      if (replacement !== '@princess') await this.requireDefinition(replacement);
      const give = splitList(f[`${prefix}GiveItems`]);
      const take = splitList(f[`${prefix}TakeItems`]);
      for (const nid of give) await this.requireDefinition(nid, true);
      const remove = [];
      if (passed && selected && this.definition(selected).itemKind === 'Item') remove.push(selected.uid);
      // Only PASS consumes a selected Item automatically. Either outcome can
      // explicitly take additional regular Items; validate every copy before commit.
      for (const nid of take) {
        const owned = this.player.inventory.find(item => item.nid === nid && !remove.includes(item.uid));
        if (!owned || this.definition(owned).itemKind !== 'Item') throw new SpecError(`Cannot consume ${nid}; it is absent or is clothing/a weapon.`);
        remove.push(owned.uid);
      }
      const transport = f[`${prefix}Transport`] ? await this.destination(f[`${prefix}Transport`]) : null;
      const variableUpdates = [];
      for (const [key, value] of Object.entries(f)) {
        if (!key.startsWith(prefix)) continue;
        const match = /^Set(Player|Map)Variable\.([A-Za-z][A-Za-z0-9_]*)$/.exec(key.slice(5));
        if (match) {
          const variables = match[1] === 'Player' ? this.player.variables : this.map.variables;
          if (!Object.hasOwn(variables, match[2])) throw new SpecError(`Cannot set undeclared variable ${match[2]}.`);
          variableUpdates.push({ variables, key: match[2], value: scalar(value) });
        }
      }
      // Commit only after definitions, items, variables and destination have been checked.
      this.player.inventory = this.player.inventory.filter(item => !remove.includes(item.uid));
      for (const nid of give) this.player.inventory.push({ uid: this.nextUID++, nid, state: this.block(nid).state });
      for (const state of splitList(f[`${prefix}AddState`])) this.player.states.add(state);
      for (const state of splitList(f[`${prefix}RemoveState`])) this.player.states.delete(state);
      for (const update of variableUpdates) update.variables[update.key] = update.value;
      this.maps.get(pending.mapId).cells[pending.y - 1][pending.x - 1] = replacement;
      if (transport) { this.mapId = transport.mapId; Object.assign(this.player, { x: transport.x, y: transport.y }); }
      else if (passed && this.block(replacement).type === 'Move') Object.assign(this.player, { x: pending.x, y: pending.y });
      this.ended = f[`${prefix}EndGame`] === 'Yes';
      this.pending = null;
      let message = this.message(f[`${prefix}Message`] || (passed ? 'The puzzle yields!' : 'That does not seem to work.'), selected, pending.block);
      if (transport?.fallback) message += ' The destination was invalid, so you arrive at the map’s starting spot.';
      return { passed, message, ended: this.ended, target: pending.block };
    } finally { this.busy = false; }
  }
}
