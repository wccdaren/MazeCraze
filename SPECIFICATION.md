# Maze Craze text specification, version 1

This is a small **INI-style custom format**, stored as UTF-8 `.txt` for upload.
It is not a general INI language. All behavior comes from the fixed game engine.

## Writing rules

- `[Section]` starts a section. Sections and field names are case-sensitive.
- Write each setting as `Field: value`, including the space after the colon.
- `|` separates list entries and rule components. Reserve it for structure.
- Coordinates are `(x,y)`. Commas inside coordinate pairs are not list delimiters.
- A line beginning with `;` is a comment. Inline comments are not supported.
- Blank lines do nothing. Numbered blocks, choices and tests begin at 1, never 0.
- Duplicate sections/fields are errors. Unknown sections/fields produce warnings;
  invalid rule subjects/actions/effects are errors rather than executable commands.
- Text needs no quotation marks. Quotation marks, if supplied, are literal text.
- IDs/NIDs are labels. `1/4.10` and `1/4.1` are distinct.

## Main configuration

| Section / field | Meaning / allowed values | Allowed examples |
| --- | --- | --- |
| `[Game]` `Title` | Browser title | `Maze Craze` |
| `[Game]` `StartMap` | Positive map number listed in `[Maps]` | `1` |
| `[Game]` `RequestTimeoutMs` | Fetch timeout, 1000–30000 milliseconds | `10000` |
| `[Maps]` `Map.N` | Text file URL for map N | `Map.2: maps/map-2.txt` |
| `[Images]` `Player` | Gnome image URL | `assets/gnome.png` |
| `[Images]` `Princess` | Built-in block 777 image URL | `assets/princess.png` |
| `[Style]` `Font` | Heading font, from the fixed font list | `Georgia`, `System`, `Monospace` |
| `[Style]` `MessageFont` | Message font, same fixed list | `System` |
| `[Style]` `Accent`, `Panel`, `Text` | Six-digit hex colors | `#c9ee87` |
| `[PlayerVariables]` declared name | Initial player variable; identifier begins with a letter | `PuzzlesSolved: 0` |

Relative URLs in this file resolve against this file. Uploaded files can use full
HTTPS URLs. Style fields do not accept arbitrary CSS or external font imports.

## Map settings

| `[Map]` field | Meaning / allowed values | Allowed examples |
| --- | --- | --- |
| `ID` | Positive map number matching the master directory | `1` |
| `Name` | Display name | `The Bramblewood Maze` |
| `Dimensions` | Width X × height Y; each 1–100 | `25x19` |
| `DefaultBlock` | Full NID of a Move block defined in this map | `1/1.1` |
| `BorderBlock` | Full NID of a local block drawn beyond valid coordinates | `1/2.2` |
| `StartingLocation` | Valid one-based coordinate, required fallback position | `(3,3)` |
| `ViewWindow` | Four single digits per option: up, right, down, left | `3333 | 3303 | 9999` |

The first cell is bottom-left `(1,1)`. Up adds 1 to Y; right adds 1 to X.
`3333` displays 7×7 cells including the player's cell. `3303` displays 7×4,
with the player on the bottom row. Viewing beyond the world shows BorderBlock.
Walking beyond the map is blocked. A transported player can stand on any in-range
block, including Wall, until moving away. The current cell is never tested.

`[Variables]` declares this map's initial variables, such as `GardenOpen: 0`.
These persist independently for each visited map. Player variables persist across
maps. Reloading or starting a new adventure resets all state.

## Block definitions

`[Block.10]` defines local block index 10. Each map defines its own blocks.
Map layout uses these numeric indices, not NIDs. Block 777 is reserved globally.

| Field | Meaning / allowed values | Allowed examples |
| --- | --- | --- |
| `NID` | Origin map / category.unique label, always fully qualified | `1/3.3`, `2/4.10` |
| `Type` | Exactly one of four types | `Move`, `Wall`, `Interaction`, `Inventory` |
| `Description` | Human-readable block/item name | `Standard Door` |
| `MapImage` | Image URL, relative to this map file or HTTPS | `../assets/door.png` |
| `InteractionImage` | Optional popup image; defaults to MapImage | `../assets/chest.png` |
| `Message` | Popup description, plain text | `The door is locked.` |
| `CancelActionText` | Optional cancel label; defaults to Leave | `Back away quietly` |
| `RequiredPower` | Nonnegative interaction strength | `6` |
| `ItemKind` | Required for Inventory blocks | `Item`, `Weapon`, `Wearable` |
| `Power` | Nonnegative weapon power | `8` |
| `State` | Initial item state; defaults to Working | `Working`, `Broken`, `Cursed` |
| `WearLocation` | Required for Wearable items; approved equipment location | `Feet`, `LeftHand`, `Head` |
| `Hands` | Weapon hand requirement; defaults to 1 | `1`, `2` |

NID categories are `1` Move, `2` Wall, `3` Interaction, and `4` Inventory.
A definition's NID must start with its map's ID and match its Type. References to
items from other maps retain the originating NID; they do not acquire a new NID
when carried or placed elsewhere. A foreign replacement loads that definition's
map if necessary; it does not transport the player or change the definition.

Walls have no choices. To make one tree removable with a bomb, define an
Interaction tree using the same picture as an ordinary Wall tree.

Inventory blocks have built-in pickup/leave choices. Pickup gives one item and
replaces only that particular cell with the current map default. Multiple cells
of one type can be collected independently. Item instances get internal IDs so
two owned weapons can be equipped independently. A chest is an Interaction with
a `Pass.GiveItems` list, not an Inventory block.

Wear locations are `Head`, `Torso`, `Arms`, `LeftArm`, `RightArm`, `Legs`,
`LeftLeg`, `RightLeg`, `Feet`, `LeftFoot`, `RightFoot`, `Hands`, `LeftHand`, and
`RightHand`. Plural locations occupy both corresponding slots. Equipping
overlapping clothing puts the whole previous item back in the pack. Weapon
hand slots are separate from clothing hand slots: gloves and swords coexist.
Two-handed weapons put away weapons in either hand. Owned items remain in the
inventory list while equipped, with their equipped locations displayed.

## Choices and tests

`[Block.10.Choice.1]` defines choice 1 for Interaction block 10.

| Field | Meaning / allowed values | Allowed examples |
| --- | --- | --- |
| `Text` | Choice label | `Unlock the door` |
| `Action` | Fixed action type | `Attempt`, `UseInventory`, `Attack` |
| `SelectionPrompt` | Optional second-step prompt | `Which key will you try?` |
| `TestsMatch` | Default All; Any accepts one or more passing tests | `All`, `Any` |
| `Test.N` | Subject, comparison, value, optional qualifier | `SelectedItem.ID | Equal | 1/4.1` |

`Attempt` evaluates immediately. `UseInventory` lets the player select a regular
Item. `Attack` lets the player select a currently wielded Weapon. An empty
selection offers guidance and keeps the interaction open. Clothing is worn in
the pack and tested with Equipment.Worn. Cancel is automatically available and
never runs pass/fail effects. No tests means an automatic pass. Test numbers
control order. Every rule is checked for validity; there is no expression parser.

| Rule subject | Meaning / type | Allowed example test |
| --- | --- | --- |
| `SelectedItem.ID` | Selected item's full NID / text | `SelectedItem.ID | Equal | 1/4.1` |
| `SelectedItem.State` | Selected item's state / text | `SelectedItem.State | Equal | Working` |
| `SelectedItem.Power` | Selected weapon power / number | `SelectedItem.Power | GreaterThan | Target.RequiredPower` |
| `Target.RequiredPower` | Target block strength / number | `Target.RequiredPower | LessThan | 10` |
| `Inventory.Quantity` | Number owned; fourth field is item NID / number | `Inventory.Quantity | GreaterOrEqual | 1 | 1/4.1` |
| `Equipment.Worn` | NIDs of working worn items / collection | `Equipment.Worn | Contains | 1/4.5` |
| `Equipment.Wielded` | NIDs of working wielded weapons / collection | `Equipment.Wielded | Contains | 1/4.2` |
| `Player.State` | Current conditions / collection | `Player.State | NotContains | Cursed` |
| `Player.Variable.Name` | Declared player variable / text or number | `Player.Variable.PuzzlesSolved | Equal | 1` |
| `Map.Variable.Name` | Declared current-map variable / text or number | `Map.Variable.GardenOpen | Equal | 0` |

Equality uses exact matching; text is case-sensitive. Numeric comparisons require
numbers. Available comparisons: `Equal`, `NotEqual`, `GreaterThan`, `LessThan`,
`GreaterOrEqual`, `LessOrEqual`. Collections use `Contains` or `NotContains`.
Numeric values are parsed as numbers; other values stay text. The right side can
also be the fixed reference `Target.RequiredPower`. No other computed expressions
are supported. Declare variables before testing/setting them. Player HP is absent.

## Outcomes

Write `Pass.` or `Fail.` before an outcome field. There is no separate EnterCell
flag: the outcome and resulting block type determine entry.

| Outcome field | Meaning / allowed values | Allowed examples |
| --- | --- | --- |
| `Message` | Plain-text result message | `The key fits!` |
| `ReplaceBlock` | Full replacement NID; same NID permits repetition | `1/1.2`, `1/3.3` |
| `GiveItems` | Full inventory NIDs; repeating a NID gives multiple copies | `1/4.1 | 1/4.3 | 1/4.3` |
| `TakeItems` | PASS or FAIL: explicitly consume regular Items; repeat NIDs for multiple copies | `1/4.1` |
| `AddState` | Conditions to add | `Blessed | Muddy` |
| `RemoveState` | Conditions to remove | `Muddy` |
| `SetPlayerVariable.Name` | Set a declared player variable | `Pass.SetPlayerVariable.PuzzlesSolved: 1` |
| `SetMapVariable.Name` | Set a declared variable on the interaction's map | `Pass.SetMapVariable.GardenOpen: 1` |
| `Transport` | Explicit same-map or cross-map destination | `(12,8)`, `(2)(3,3)`, `(2)` |
| `EndGame` | Stop movement after this outcome | `Yes`, `No` |

The default PASS replacement is the current map's default Move block. The default
FAIL replacement is the unchanged interaction. Only PASS plus a Move replacement
grants ordinary entry. A PASS that preserves a door or chest leaves the player
beside it, ready to try again. A FAIL never grants entry, even if it changes the
cell to Move. Replacement alone never triggers a second interaction.

On PASS, a selected regular Item is automatically consumed once. **Do not list it
again in Pass.TakeItems** unless another copy is intentionally required. Clothing
and weapons cannot be consumed through TakeItems. FAIL never automatically consumes
its selected item. An explicit `Fail.TakeItems` list removes the listed regular
Items, one owned copy per entry; blank means no removal. Its NID may match the
selected item, but there is no automatic extra charge on FAIL. Merely checking
inventory/equipment does not consume anything. All required copies must already
be owned before this outcome; GiveItems in the same outcome cannot pay its costs.
Missing copies or an attempt to take equipment abort the entire outcome without
applying any effects. Cancel never applies either outcome.

Example: if Gold Coin is a regular Item defined as `1/4.7`, an enemy's failed
Attack can use `Fail.TakeItems: 1/4.7` and
`Fail.Message: The pig pockets one gold coin. Your sword stays in your hand.`
The weapon remains owned. Ensure the player can afford this authored cost,
or provide another choice without that cost for players with no coins.

Explicit transports override ordinary movement for either outcome. `(2)` uses
map 2's start; `(2)(3,3)` uses that map's given coordinate. Arrival does not test
the destination, trigger a portal, or reject Wall cells. Invalid coordinates fall
back to the destination map's start. Invalid starting coordinates prevent a map
from loading. An unavailable destination aborts the outcome without consuming
items, replacing the cell, or moving the player. Required definitions, inventory
removals and variable updates are checked before an outcome is committed.

Allowed message placeholders are `{Player.Name}`, `{SelectedItem.Name}`, and
`{Target.Name}`. Other braces remain literal text. These never execute code.

## Map layout

`[MapData]` requires `Format: Shorthand` or `Format: Longhand`.

Shorthand uses `(X,Y)BlockIndex(Count)`, with Count optional and defaulting to 1.
Repeats extend to the right. Different rows/entries can be on separate lines:

```text
[MapData]
Format: Shorthand
(1,20)3(15) | (21,21)3
(21,22)3 | (21,23)3(4)
```

Longhand starts at Y=max, X=1. Every next data line reduces Y by 1. Each line must
expand to exactly the X dimension. For a width-5, height-3 map:

```text
[MapData]
Format: Longhand
3(5)
3 | 1(3) | 3
3(5)
```

Default cells are filled first. Each line is fully validated before being applied.
An invalid longhand row is skipped without shifting the next row. An invalid
shorthand line applies none of its entries. Existing cells retain their prior
values, initially defaults. Warnings include physical file line and longhand Y.
Missing longhand rows retain defaults and produce a warning. Extra rows are
skipped with warnings. Overlaps are allowed: the **last valid entry wins**.

Layout errors are skipped; they do not transport the player. Gameplay transport
coordinate errors use the starting-location fallback instead.

## Reserved princess ending

Any map can place numeric block index `777` without defining it. Do not create a
`[Block.777]` section. The engine supplies its description, picture from the master
configuration, immediate successful interaction, default replacement, celebration
message, and end-game state. It is a built-in exception to normal definition NIDs;
it is never an inventory item or NID reference. This is the requested debug/easter
egg ending and is deliberately placed at the end of this first sample maze.
