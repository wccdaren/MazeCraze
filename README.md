# Maze Craze — first expedition

Sebastian's graph-paper puzzle adventure: a happy gnome, 32×32 pixel tiles,
one-based Cartesian coordinates, editable INI-style text, and no combat randomness.
There is no runtime library, account, analytics, database, or required build step
to play. The standalone map editor is already built and included.

![The first Maze Craze adventure](docs/first-look.png)

## Play locally

From the MazeCraze directory, run:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Open your browser at the server's address on port 8000. Opening `index.html` directly
as a `file:` URL will not work: browsers restrict fetching the text specifications.
`npm start` runs the same server if Node is installed. This server is for development;
use ordinary HTTPS static hosting for the published game.

Enter a nickname. Move with arrow keys, numpad 8/2/4/6 (Num Lock on or off),
or tap the on-screen arrows. Each fresh key press moves one cell. Movement pauses
during dialogs. Use the pack to WEAR boots and WIELD weapons before interacting.
Change field of view with the dropdown; large windows scroll within the map panel.

Progress stays in memory until a reload or a new adventure. Returning to a map
preserves its changes. There is no save-to-disk feature in this draft.

## Where to make changes

| File | Purpose | Editing examples |
| --- | --- | --- |
| `main-config.txt` | Map directory, starting map, player image, presentation | Add `Map.3: maps/map-3.txt` |
| `maps/map-1.txt` | First maze, block definitions, choices, placement | Change a key's location or door rule |
| `maps/map-2.txt` | Optional clearing and return gate | Change its chest rewards |
| `assets/*.png` | Ready-to-use tile pictures and gnome | Upload these to WordPress |
| `assets/*.svg` | Editable originals for the small tiles | Change colors or shapes |
| `js/spec.js` | Text reader and validation | Approved specification vocabulary |
| `js/engine.js` | Movement, equipment, tests, outcome rules | Game mechanics without display code |
| `js/app.js` | Browser controls, dialogs, loading | Main config URL near the top |
| `styles.css` | Page and popup appearance | Layout, spacing, colors |
| `SPECIFICATION.md` | Author's format reference | Rules, outcomes, coordinates |
| `editor.html` | Standalone offline map editor | Open, paint, edit blocks, export `.txt` |
| `EDITOR.md` | Editor field guide | Local files, tools, images, and publishing |

## Create and edit maps

For the complete illustrated handbook, download the
[Word user guide](docs/Maze-Craze-Map-Editor-User-Guide.docx) or its
[printable PDF](docs/Maze-Craze-Map-Editor-User-Guide.pdf). Written for seventh-grade
mapmakers, it covers every field, valid settings, examples, creative puzzle ideas,
file relationships, importing/exporting, and a guided first-map project.

**Double-click `editor.html` to open Map Studio.** This single file contains its
JavaScript, styles, standard tile previews, and sample maps. It works locally
without Python, npm, a web server, or an Internet connection. It can also be
uploaded as one HTML page to your game host. There is a Map studio link in the game.

Open a local `.txt` map or use **Open a map…**. On the website, its Website maps
group lists every map in `main-config.txt`, including maps added later. Select a
map to read its current server file; **Refresh map list** rereads the directory
after SFTP changes. Bundled examples remain separate offline copies. Export and
SFTP publish your edits; opening a server map never saves back automatically.

Map settings controls the dimensions (up to 100×100), starting point, viewing windows, default/border blocks,
map variables, and output format. Create or edit Move, Wall, Interaction and
Inventory blocks. Edit choices, item/equipment tests, messages, replacements,
rewards, variable updates, and pass/fail transports through forms.

Select a tile and paint by clicking/dragging, or drag a palette block onto the map.
Rectangle, connected fill, erase, start, eyedropper, pan, zoom, undo and redo are
included. Export map.txt downloads a compatible `map-N.txt` file. Move that file
into your game's `maps/` folder, or upload it and set its URL in `main-config.txt`.
Pictures stay separate, and their paths must match the final map file location.
Read [the editor guide](EDITOR.md) for the complete workflow and limitations.

## WordPress deployment

The simplest reliable approach is to serve this folder as a small static game and
embed `index.html` using an iframe in a WordPress **Custom HTML** block. The iframe
isolates game styles and arrow-key handling from the WordPress theme. A starter
snippet is in `wordpress-embed.html`.

1. Put `index.html`, `styles.css`, `js/`, `assets/`, `maps/`, and `main-config.txt`
   together on an HTTPS static host or in a static directory managed through your
   WordPress hosting file manager/SFTP. Keep their relative structure. Do not use
   Python's development server for this deployment.
2. Replace the example iframe URL in `wordpress-embed.html` with the actual game
   page URL and paste the snippet into the WordPress page's Custom HTML block.
3. If keeping everything together, no JavaScript edits are necessary. If instead
   uploading text and PNG assets to the WordPress Media Library, copy the resulting
   URLs into `main-config.txt` and the map files. Then change the clearly commented
   `MAIN_CONFIG_URL` near the top of `js/app.js` to the uploaded master text file.
4. Relative URLs in the master configuration resolve against that file. Relative
   image URLs in each map resolve against that map file. WordPress may rename files
   or put them in different month folders, so use the actual copied URLs when split
   across Media Library locations. Fetching a different origin requires that host
   to permit CORS. Keeping files on the game origin avoids that requirement.
5. Check the embedded game on desktop and a phone. Click inside the game to give it
   keyboard focus. If a host caches text files, clear that cache after changing a map.

WordPress permissions, hosting policy, and security plugins vary. The Media Library
often rejects HTML/JavaScript and SVG; uploading them as media is not the deployment
method used here. The game uses PNG pictures and `.txt` specifications, but your
administrator must still permit those file uploads. A host must serve modules with
a JavaScript MIME type and serve HTML as a page, rather than an attachment. Do not
enable unrestricted uploads to work around a rejection. No WordPress installation
or upload credentials were supplied, so deployment to your actual site is untested.

## Puzzle behavior

- Move enters a cell. Wall blocks it. Interaction presents choices. Inventory
  presents pickup/leave choices. Wall and Interaction trees can use identical art.
- PASS applies its outcome and replaces the cell with the specified block or the
  current map's default Move block. Only a resulting Move block grants entry.
- FAIL never grants entry. It preserves the selected item by default and normally
  preserves the interaction. Explicit Fail.TakeItems can take listed regular Items;
  an explicit failure replacement can change the cell.
- Successful selected-item use consumes one key/bomb. Both outcomes support
  additional regular Item costs through TakeItems. Clothing and weapons remain
  owned. Possession/equipment checks consume nothing.
- Explicit transports override ordinary entry. Arrival never triggers a cell,
  including a wall or another portal. Invalid coordinates use that map's start.
- Block index 777 is reserved: it immediately saves the princess and ends play.

## Test while editing

On the game website, **Test from Start** runs your current map from its starting
cell with fresh progress. **Back to Edit** pauses the game; **Resume Test** keeps
the previous run and map snapshot. After editing, Test from Start uses your new
design. Test progress never rewrites your map document. Editing/export still work
offline, while integrated testing needs the full game on the same HTTP(S) origin.
See [EDITOR.md](EDITOR.md#test-pause-and-resume) for map-directory and artwork bases.

Deploy the updated editor.html, index.html, styles.css, and complete js/ folder
together. The full project ZIP includes all images, maps, configurations and guides.
Export edited map files as usual; testing does not publish them to the server.

## Tests and development tools

The rules tests use Node 20+ and no downloaded dependencies:

```sh
npm test
```

For browser testing, install the pinned development dependency with `npm ci`.
Keep the local server running in another terminal, then run:

```sh
npm run test:browser
npm run test:playtest-browser
npm run test:directory-browser
```

The browser test uses `/usr/bin/chromium` when available. Otherwise install a
Playwright browser with `npx playwright install chromium`, or set `CHROMIUM_PATH`
to an existing Chromium executable. `MAZE_TEST_URL` selects a different test server.
The game browser test completes the maze through real controls and exercises failed
matches, equipment, map travel, the secret tree, the ending, mobile controls,
asymmetric views, nickname injection safety, and missing requests. Screenshots
are written to the ignored `test-results/` directory.

The playtest browser suite checks live snapshots, pause/resume, stale-design
messages, fresh resets, cross-map loading, explicit FAIL costs, and mobile layout.
It also checks that a test never changes the exported document.

The directory suite checks configured maps 3/4, current server reads, refreshing,
export, failed downloads, mismatched IDs, and preservation of edits during slow
loads. It also checks same-origin restrictions and fallback to bundled examples.

The editor has separate offline browser checks:

```sh
npm run test:editor-browser
```

They exercise local file opening and downloads, real palette drag/drop, painting,
block/rule forms, reference changes, and 100×100/mobile rendering. The managed
test browser blocks direct `file:` navigation, so these checks use an offline
opaque-origin document with the same self-contained HTML and verify zero HTTP
requests. The game browser suite also follows the hosted Map studio link.

To regenerate the standalone editor after changing its sources or bundled assets:

```sh
npm run build:editor
```

Editor sources are `editor-shell.html`, `editor.css`, `js/editor-model.js`,
`js/editor-app.js`, and `js/editor-directory.js`; the build also includes
`js/spec.js` and the shared `js/playtest-protocol.js`. Edit those sources, then
rebuild `editor.html`. No bundler package is required; the build uses Node's
standard library. Editing the generated file directly is not necessary.

To refresh PNGs after editing the original SVG tiles, use:

```sh
npm run assets:png
```

No npm dependencies need to be uploaded to the game host.

The handbook's editable source is `docs/Map-Editor-User-Guide.md`. To regenerate
the Word file, install `scripts/requirements-docs.txt` in your documentation Python
environment and run `python3 scripts/build-user-guide.py --pages docs/guide-pages.json`.
The build embeds the current-editor screenshots from `docs/manual-images/`.
Word's contents page uses chapter page-reference fields, so page numbers can update
if your Word installation paginates differently. The PDF is a checked print edition. Documentation tools are separate from game/editor runtime requirements.

Refresh both current downloads after rebuilding the editor and handbook with
`python3 scripts/package-downloads.py`. The full-project ZIP supports hosted
playtests; the smaller editor ZIP is for standalone editing/export. The original
first-draft ZIP remains a historical download.

## First-maze guide (spoilers)

Start at `(3,3)`. Pick up the standard key at `(5,3)`. The chest at `(3,6)` gives
boots. The sword at `(5,6)` has power 8; the wooden dagger at `(6,4)` has power 2.
Wear the boots and wield the sword through the pack. The standard door is `(8,5)`.
Cross the mud at `(12,9)`, then defeat the pig at `(12,12)`. Collect the master
key at `(11,15)`, open the master door at `(16,14)`, and find the princess at
`(22,16)`. The strong sword must have power **greater than** the pig's requirement 6.

Bombs at `(4,10)` and `(5,10)` can reveal the tree shortcut at `(8,14)`. The portal
at `(14,6)` leads to map 2, whose supply chest at `(7,5)` contains a spare standard
key and two bombs. Its return gate is `(3,3)`. These are optional exploration paths.

## Security and deliberate limits

Text configurations are data: no scripts, HTML, arbitrary CSS, or executable rule
expressions. The interface inserts messages and nicknames as text. Rule subjects,
actions, comparisons, fonts and outcome types are restricted. Definitions must use
map-qualified NIDs. Dimensions are limited to 100×100, view distances to single
digits, and each configuration response to 2 MB with a request timeout. Failed
destination loads leave an interaction unapplied. URLs must be HTTPS, except
same-origin HTTP for local development; fetches omit credentials and referrers.

Maintain trusted configuration/image hosting. This static client game is not an
anti-cheating or server-authoritative system. This iteration has no health,
random battles, nested rule groups, persistent game saves, sound, or touch
swipe controls. There are on-screen touch arrows.

The gnome is original generated artwork. The 18 other tiny tile designs were made
for this project; SVG sources and raster PNG exports are included.
