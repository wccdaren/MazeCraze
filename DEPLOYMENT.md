# Deploying the game collections update

The complete ZIP has one MazeCraze folder. Serve its contents as static files over
HTTPS. No npm packages, Python, database, accounts, or server-side uploads are needed.

For an existing website, back up your files first. Upload index.html, editor.html,
styles.css and the **complete js/ folder together**. The editor/game playtest
protocol is now version 2; the two pages must be updated together. Also upload the
docs/ folder for the editor's **PDF user guide** link, and any new images you use.

Keep your authored maps and custom main-config.txt. The updated application still
supports the old [Maps]-only master. It will show that collection as the main game.
Do not replace your map 3 or map 4 with a sample from the download.

To add the supplied example collections, upload maps/esther/ and maps/sebastian/.
Merge their entries into your existing master, keeping its existing sections:

```ini
[Games]
Game.esther: maps/esther/game-config.txt
Game.sebastian: maps/sebastian/game-config.txt
```

There must be only one [Games] section. To feature Esther's game, set StartGame:
esther under the existing [Game] section. Set StartMap: 1 there, or remove the
master StartMap to use Esther's own start. StartGame: main selects the legacy maps.
The supplied child configurations contain the aliases their maps need, so they
also work with an older master that has no [ImageCatalog].

To add images to the dropdown, merge [ImageCatalog] entries from the supplied
main-config.txt or define them in a child game configuration. Keep section/field
names case-sensitive. A map can use @Tree when ImageCatalog defines Tree.

Reload the browser after replacing code. In the editor, choose Game to edit, then
Open a map. Refresh map list rereads configuration changes without a page reload.
Export downloads map-N.txt; SFTP it to that game's registered Map.N URL, renaming
it if the registered filename is different. Export never writes to the server.

Check the root adventure and each game selector, open the PDF link, and perform a
Test from Start from the editor. Test data remains in browser memory. Game switches
reset progress and retain the nickname. No progress is saved across reloads.
