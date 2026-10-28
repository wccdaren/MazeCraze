# Meno: The Tidelight Trail

An original, gentle underwater story for Maze Craze. A storm separates **Meno, a turquoise guppy**, from his family. Seven connected mazes lead him home through new ocean habitats. Kindness, observation, and teamwork solve the puzzles. The bubble tools loosen nets; they do not hurt animals.

This is an original adventure inspired by the broad family-and-ocean-journey themes of *Finding Nemo*. It uses new characters, dialogue, locations, and artwork. It does not include movie images, audio, clips, or dialogue.

## Install on your existing website

1. Unzip `meno-undersea-adventure.zip` on your computer.
2. Upload the included **`maps/meno` folder**, including its `assets` subfolder, into the existing website's `maps` folder. The resulting URL should be `https://mazecraze.thehighestcalling.org/maps/meno/game-config.txt`. Keep the folder structure and lowercase filenames exactly as supplied.
3. Download your current website's **root `main-config.txt`**, and add this **one line inside its existing `[Games]` section**:

   ```text
   Game.meno: maps/meno/game-config.txt
   ```

   Do not add a second `[Games]` heading. Do not replace your master file with this game's `game-config.txt`. Keep Sebastian's, Esther's, and your other map entries.
4. Upload the edited root `main-config.txt` to the same location it came from.
5. Open the game over HTTPS and press **Ctrl+Shift+R** to refresh Chrome. Enter a nickname—`Meno` is a good choice—and choose **Meno: The Tidelight Trail** from the game menu above the map. Changing games resets that run, as usual.
6. In the editor, choose **Refresh map list**, select **Meno: The Tidelight Trail**, then load one of its seven website maps. The new art will appear in the image suggestions using names such as `@MenoCoral`.

No JavaScript or HTML replacement is needed. This pack uses the existing game-collections release. The game still has the shared Maze Craze interface, including its general gnome/clothing/weapon labels. The player image changes to a guppy, and the map messages explain how the aquatic equipment works.

To make Meno the default game, change `StartGame` to `meno` and `StartMap` to `1` inside the **master** `[Game]` section. This is optional. The pack does not change the default game for you.

## Play

Move with arrow keys, numpad 8/2/4/6, the on-screen controls, or an adjacent map square. Hold a direction to keep swimming. Move toward an object to see its choices. Plain coral, kelp, rock, and net walls block movement; some identical-looking objects are interactions with choices.

Each maze is **25 × 19** squares. You start at **(2,2)**. Up adds to Y; right adds to X. The view choices are `4444`, `3333`, `5555`, `9999`, and `4404`. The last looks farther ahead with Meno on the bottom of the view. The ocean outside the map is filled with reef stone.

Use **Inventory** to wear the glow-thread sash or wield a bubble tool. Expand the source-map group and the item row to see the buttons. A sash is clothing; a wand is equipment classified as a weapon by the general engine. Cancel an encounter before opening your pack. The strong wand needs both weapon hands. Wielding it puts away the weaker reed.

Ordinary selected items—keys, food, a pearl, a valve handle—are consumed only when their matching puzzle succeeds. Failed attempts preserve them. The sash, reeds, and wand are reusable. The heart-shell locket is only checked, never offered as a consumed item.

**Do not discard quest items.** The shared engine lets you throw away unequipped items, including essential ones. This story does not replenish lost quest items. Reloading or restarting begins again with a fresh inventory and fresh maps. Progress lasts only in the current tab; there is no save file.

The currents form a **forward-only seven-chapter journey**. You can explore backward within a maze, but there is no return portal to an earlier chapter. Each required item is placed before the puzzle needing it. There are no timed challenges, health points, or random combat results.

## Chapters, without giving away every answer

| Chapter | Story and puzzle idea | Example of a valid action |
| --- | --- | --- |
| 1. Stormglass Reef | Meet Tavi, recover a family keepsake, and unlock the reef | Use a matching shell key |
| 2. Whispering Kelp | A gentle shark needs a kind offer | Offer a sea-garden snack |
| 3. Lantern Jelly Gardens | Little jellies respond to light | Wear the glowing sash |
| 4. The Turning Tide | Orla teaches a three-part current route | Choose a direction from her lesson |
| 5. Bellglass Harbor | Repair a drain and rescue two little guppies | Fit a valve handle, then guide each fry |
| 6. The Drifting Netfield | Loosen a knot and guide a school to freedom | Wield a strong bubble tool |
| 7. Moonpool Homecoming | Light the family lantern and find your family | Show the keepsake after helping your friends |

Need help? Open `WALKTHROUGH-SPOILERS.md`. Its coordinates match the numbered pictures in `atlas/solution-1.png` through `atlas/solution-7.png`. These spoil the route, so keep them for testing or when you are stuck. `atlas/asset-catalog.png` is a visual sheet of all 33 new tile designs.

## Edit or extend the adventure

Open a map from the Meno game in the hosted editor. Exporting downloads a new text file to your computer; it does not upload anything. SFTP that file back into `maps/meno` using the same filename to update the website.

The seven map IDs intentionally reuse 1 through 7 **inside this game collection**. They are isolated from the main game and other collections. Do not move these seven entries into the master's legacy `[Maps]` list. Their child config is what keeps the collection independent.

Map data is longhand, one physical row per Y coordinate, top to bottom: Y=19 down to Y=1. Each row expands to exactly 25 block indices. Blocks and rules are ordinary Maze Craze data, not scripts. You can repaint the maze or change messages in the existing editor.

### Important item relationships

NIDs always retain their source map number. Later maps refer to these exact IDs. Changing a source map ID or rebuilding an item with a new NID will require updating its references in other files too; the editor cannot update every other map automatically.

| Full item NID | Purpose and later relationships | Allowed example reference |
| --- | --- | --- |
| `1/4.1` | Family locket, kept until the final reunion | `Inventory.Quantity \| GreaterOrEqual \| 1 \| 1/4.1` |
| `1/4.2` | Rose-shell key, consumed at the first gate | `SelectedItem.ID \| Equal \| 1/4.2` |
| `2/4.1` | Algae biscuit, consumed in Brindle's offer | `SelectionGroup: Food` |
| `2/4.2` | Glow-thread sash, worn on Torso; tested in maps 3 and 7 | `Equipment.Worn \| Contains \| 2/4.2` |
| `3/4.1` | Navigation pearl, consumed in Orla's puzzle on map 4 | `SelectedItem.ID \| Equal \| 3/4.1` |
| `3/4.2` | Power 2 one-handed reed; deliberately too weak for the strong net | `ItemGroup: BubbleTool` |
| `4/4.1` | Power 8 two-handed wand, needed on map 6 | `Equipment.Wielded \| Contains \| 4/4.1` |
| `5/4.1` | Valve handle, consumed at the map 5 drain | `SelectionGroup: Repair` |
| `6/4.1` | Teamwork shell, a nonessential souvenir | `ItemGroup: Keepsake` |

### Story flags

These are declared map variables or fixed player-state labels, not arbitrary code. Text is case-sensitive. Outcomes set the variables and add the states. Changing one requires changing every test that refers to it.

| Flag | Relationship | Allowed example test |
| --- | --- | --- |
| Map 4 `CurrentStep` | Starts at 0; the three markers set 1, 2, then 3. A wrong choice leaves it unchanged | `Map.Variable.CurrentStep \| Equal \| 1` |
| Map 5 `DrainOpen` | Starts at 0; using the valve sets 1 before either fry can be rescued | `Map.Variable.DrainOpen \| Equal \| 1` |
| Player `BimSafe`, `BopSafe` | Both are needed for the harbor bell | `Player.State \| Contains \| BimSafe` |
| Player `HarborHelped` | Harbor bell adds it; the netfield school tests it | `Player.State \| Contains \| HarborHelped` |
| Player `SchoolTogether` | Gathering the school adds it; the net curtain tests it | `Player.State \| Contains \| SchoolTogether` |
| Player `NetFreed` | Clearing the curtain adds it; the final arch and reunion test it | `Player.State \| Contains \| NetFreed` |
| Map 7 `LanternLit` | Starts at 0; wearing the sash lights the lantern and sets 1 | `Map.Variable.LanternLit \| Equal \| 1` |

All multi-rule choices use the default **All** matching behavior. Current-marker wrong choices use a deliberately impossible `LessThan 0` test against a nonnegative step variable. They produce a harmless failure message and allow another try. They do not reset earlier markers or create a dead end.

The strong knot requires selected-tool power **greater than 6** and state **Working**. Merely owning a wand does not make it available to an Attack choice; it must be wielded. The final curtain also tests the specific working wand's NID. Neither tool action consumes equipment.

### New image catalog

The child `game-config.txt` registers every new picture. All map image fields use `@Meno...` aliases. Their paths resolve against that config file to `assets/*.png`, which means these maps need no changes when moved to your own domain with the same folder structure.

| Field | Purpose | Allowed example |
| --- | --- | --- |
| `[Images] Player` | Guppy avatar for this game | `assets/meno.png` |
| `[ImageCatalog] MenoCoral` | Coral art shared by walls | `assets/coral.png` |
| Block `MapImage` | A new ocean tile on the board | `@MenoJellyfish` |
| Block `InteractionImage` | Larger picture in a popup | `@MenoHomecoming` |
| `[Images] Princess` | Required shared-engine fallback ending image; this game uses a normal custom ending interaction | `assets/homecoming.png` |

There are **33 original 32×32 tile designs**, each in PNG and editable SVG source form, plus one original full-size homecoming illustration. Some extra designs—such as crab and anemone—are available for your own new blocks even when a particular chapter does not use them. The game loads PNGs; the SVG files are supplied as source art. No external image host is needed.

### Testing later chapters

The editor's **Test** starts fresh on the map being edited. Testing map 6 alone will not supply the wand, sash, or earlier story states. For a real story test, start with map 1 and play through. For isolated development, work on a separate copy and add a temporary debug supply chest and any needed state-setting interaction, then remove those before publishing. The supplied release has no cheat chest or hidden dependency on test data.

## Files and privacy

This expansion consists only of data, local artwork, and documentation. It adds no scripts, external requests, accounts, tracking, uploads, or server-side programs. The illustrated map solutions and JSON route are optional references, not hidden game logic.

The normal app and editor fetch the seven map files through the existing same-origin text loader. Rule subjects, actions, and outcomes use only the fixed engine vocabulary. No changes to the existing game engine, editor bundle, or other game collections are included.

For full field-by-field editor instructions, use the PDF user-guide link in your current map editor. The relationships above are the details specific to Meno.
