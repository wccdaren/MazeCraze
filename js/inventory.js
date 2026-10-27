// Display groups never replace the individual copies kept by the game engine.
export function inventoryStacks(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.nid)) groups.set(item.nid, []);
    groups.get(item.nid).push(item);
  }
  return [...groups].map(([nid, copies]) => ({ nid, copies, mapId: Number(nid.split('/')[0]) }));
}
export function selectionStacks(items) {
  const groups = new Map();
  for (const item of items) {
    const key = JSON.stringify([item.nid, item.state]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()];
}
