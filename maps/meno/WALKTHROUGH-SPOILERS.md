# Meno: The Tidelight Trail — SPOILER walkthrough

The shortest routes are pictured in `atlas/solution-1.png` through `solution-7.png`. All coordinates are **(X,Y)**, with (1,1) at the bottom-left. The numbered dots follow the event order below. Every chapter is 25 squares wide and 19 squares tall. Switch to the 9999 view for a wider look; the atlas shows the entire map.

**Keep the heart-shell locket, glow-thread sash, and stormglass wand.** Quest items can be discarded by the existing engine, so discarding them can make this run unwinnable. Restart the game if that happens. There is no automatic save.

## 1. Stormglass Reef

Shortest start-to-exit route: 126 one-square moves. Start: (2,2).

1. **Tavi the seahorse at (3,4)** — Accept the locket. Keep it for the whole game.
2. **The tidekeeper's shell box at (7,16)** — Open the box for the rose-shell key.
3. **The rose-shell gate at (22,8)** — Use the rose-shell key. It is consumed only on success.
4. **Current to chapter 2 at (2,16)** — Follow the current into the next chapter.

## 2. Whispering Kelp

Shortest start-to-exit route: 134 one-square moves. Start: (2,2).

1. **A message in green glass at (6,3)** — Read the note for Brindle's clue.
2. **Crunchy algae biscuit at (20,2)** — Pick up the algae biscuit.
3. **Brindle the gentle shark at (3,8)** — Offer the biscuit to receive the glow-thread sash.
4. **Current to chapter 3 at (20,6)** — Follow the current into the next chapter.

## 3. Lantern Jelly Gardens

Shortest start-to-exit route: 134 one-square moves. Start: (2,2).

1. **Lumi the lantern jelly at (7,2)** — Wear the map 2 glow-thread sash before the curtain.
2. **A curtain of little lanterns at (18,12)** — Wear the sash, then attempt the crossing.
3. **A pearl in the lantern cradle at (8,16)** — Collect both tools. Save the navigation pearl for chapter 4.
4. **Current to chapter 4 at (2,16)** — Follow the current into the next chapter.

## 4. The Turning Tide

Shortest start-to-exit route: 122 one-square moves. Start: (2,2).

1. **Orla's current lesson at (4,6)** — Remember Rise, Right, Dive.
2. **Orla the star-reading turtle at (6,12)** — Offer the map 3 navigation pearl.
3. **First current marker at (16,9)** — Choose option 1: Rise.
4. **Second current marker at (24,5)** — Choose option 2: Turn right.
5. **Third current marker at (22,14)** — Choose option 3: Dive.
6. **The family's tool cache at (12,18)** — Take the power 8 two-handed wand.
7. **Current to chapter 5 at (4,14)** — Follow the current into the next chapter.

## 5. Bellglass Harbor

Shortest start-to-exit route: 156 one-square moves. Start: (2,2).

1. **Pebble the clever octopus at (6,4)** — Listen to the rescue plan.
2. **Copper valve handle at (8,8)** — Pick up the copper valve handle.
3. **The dry dock drain at (12,9)** — Use the valve handle to set DrainOpen to 1.
4. **Bim the lost guppy fry at (16,12)** — Guide Bim to safety after opening the drain.
5. **Bop the lost guppy fry at (23,16)** — Guide Bop to safety after opening the drain.
6. **The two-note harbor bell at (5,16)** — Both BimSafe and BopSafe are needed. Ring the bell.
7. **Current to chapter 6 at (6,18)** — Follow the current into the next chapter.

## 6. The Drifting Netfield

Shortest start-to-exit route: 142 one-square moves. Start: (2,2).

1. **A warning on a float at (3,8)** — Wield the map 4 wand before the strong net.
2. **The storm-tied ghost net at (14,2)** — Attack with the wielded power 8 wand; the power 2 reed fails safely.
3. **A school behind the ropes at (21,2)** — Ask the school to work together; HarborHelped is required.
4. **The drifting curtain at (12,16)** — Keep the wand wielded and choose Swim down together.
5. **Current to chapter 7 at (20,10)** — Follow the current into the next chapter.

## 7. Moonpool Homecoming

Shortest start-to-exit route: 138 one-square moves. Start: (2,2).

1. **The last family message at (4,8)** — Keep the map 1 locket and wear the map 2 sash.
2. **The dark Tidelight lantern at (10,10)** — Wear the sash to light the lantern.
3. **The lantern arch at (19,16)** — LanternLit and NetFreed must both be true.
4. **The guppy family reunion at (24,2)** — Show the family locket. It is tested, not consumed. Celebrate!

## About travel and testing

The seven chapters form a **forward-only journey**. Currents lead to the next chapter, never to another game. All mandatory items appear before the gate that needs them. Wear and wield equipment before opening an encounter; cancel the encounter if you need to open your pack. The atlas route is not revealed in normal play. For editor testing from later maps, inventory and states start empty, so earlier items will be absent. Test from map 1 for the whole story, or temporarily add a debug supply chest in your own edited copy.
