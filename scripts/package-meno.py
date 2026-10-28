"""Package only the Meno expansion; never replace another game's configuration."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parents[1]
folder = root / 'maps' / 'meno'
target = root / 'meno-undersea-adventure.zip'
install = '''MENO: THE TIDELIGHT TRAIL
=========================

Seven original undersea story mazes for the current Maze Craze game.

1. Upload the included maps/meno folder into your website's maps folder.
   Keep every subfolder and filename as supplied.
2. In your EXISTING root main-config.txt, add this line inside [Games]:

   Game.meno: maps/meno/game-config.txt

   Do not create a second [Games] heading. Keep all existing game/map entries.
   Do not replace main-config.txt with the included child game-config.txt.
3. Upload your edited main-config.txt. Refresh Chrome with Ctrl+Shift+R.
4. Enter a nickname, then select "Meno: The Tidelight Trail" in the game menu.
   Choose Meno in the editor's game menu to edit these seven maps.

No JavaScript, HTML, or editor replacement is necessary for the current release.
No files belonging to another game are included in this expansion ZIP.

READ maps/meno/README.md for full installation, play and editing instructions.
The atlas and WALKTHROUGH-SPOILERS.md contain solutions; avoid them while playing!

Includes:
- Seven connected, 25x19 mazes; 35 encounters and an original guppy-family story.
- 33 original 32x32 tile designs, each supplied as PNG and SVG source art.
- One original full-size family-reunion illustration.
- A visual asset catalog and seven numbered illustrated route solutions.
- Child game configuration, item/state relationships, and a spoiler walkthrough.

Testing: 65 automated checks passed; a real Chromium playthrough completed all
952 shortest-route moves and 35 encounters without granting test items or states.
All seven maps also loaded in the existing editor; no browser or HTTP errors.

Current limitations: progress stays in the tab; travel is forward between chapters.
Do not discard essential quest items. Later-map editor tests start without items
earned in earlier chapters; play from map 1 to test the complete story.

This is an original ocean-family adventure inspired by broad Finding Nemo themes,
with new characters, dialogue, locations and artwork, not movie assets or clips.
The existing shared Maze Craze interface still contains some general gnome labels.
'''
files = sorted(p for p in folder.rglob('*') if p.is_file())
payload = {str(p.relative_to(root)): p.read_bytes() for p in files}
payload['INSTALL-MENO.txt'] = install.encode()
checksums = ''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\n' for name,data in sorted(payload.items()))
payload['MENO-SHA256SUMS.txt'] = checksums.encode()
with ZipFile(target, 'w', compression=ZIP_DEFLATED, compresslevel=9) as z:
    for name,data in sorted(payload.items()):
        info = ZipInfo(name)
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        info.compress_type = ZIP_DEFLATED
        z.writestr(info,data,compresslevel=9)
target.chmod(0o644)
with ZipFile(target) as z:
    assert z.testzip() is None
    assert all(not n.startswith('/') and '..' not in Path(n).parts for n in z.namelist())
    assert 'main-config.txt' not in z.namelist()
    assert len([n for n in z.namelist() if '/map-' in n and n.endswith('.txt')]) == 7
    for name,data in payload.items(): assert z.read(name)==data
solution=json.loads((folder/'solution.json').read_text())
print(f'{target.name}: {len(payload)} files, {target.stat().st_size:,} bytes; 7 maps, {sum(len(c["events"]) for c in solution)} encounters, {sum(c["pathLength"] for c in solution)} moves. Archive and checksums verified.')
