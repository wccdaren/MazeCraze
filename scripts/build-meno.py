"""Rebuild Meno's original SVG tiles, seven authored mazes and spoiler atlas.

No game-engine changes. Layouts are deterministic; the story/puzzles are authored.
Run python3 scripts/build-meno.py, then node scripts/export-meno.cjs.
"""
from pathlib import Path
import random
import json
from collections import deque

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'maps' / 'meno'
ART = OUT / 'assets'
ART.mkdir(parents=True, exist_ok=True)

def svg(name, body, background=True):
    base = '<rect width="32" height="32" fill="#105274"/><path d="M0 8Q8 4 16 8T32 8M0 26Q8 22 16 26T32 26" fill="none" stroke="#1b6b89" stroke-width="1"/>' if background else ''
    (ART / (name + '.svg')).write_text('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' + base + body + '</svg>\n')

def fish(x=0, y=0, color='#5de0cb', tail='#ffe19a', scale=1):
    return f'<g transform="translate({x} {y}) scale({scale})"><path d="M12 15L2 5Q-1 16 2 27L12 21Z" fill="{tail}" stroke="#164b64"/><path d="M5 10L10 17L4 23M2 16L10 18" stroke="#e6a967" fill="none"/><ellipse cx="19" cy="18" rx="11" ry="8" fill="{color}" stroke="#164b64"/><path d="M14 11L17 5L24 11M15 25L19 29L23 25" fill="{tail}" stroke="#164b64"/><ellipse cx="24" cy="16" rx="3" ry="3.5" fill="#fff9e6"/><circle cx="25" cy="16" r="1.5" fill="#17314e"/><path d="M26 21q-3 3-5 0" stroke="#17314e" fill="none" stroke-linecap="round"/><path d="M14 18l5 3-3 2" fill="#b7f5da"/></g>'

svg('water', '<circle cx="6" cy="14" r="1" fill="#54a8b4"/><circle cx="25" cy="4" r="1" fill="#54a8b4"/>')
svg('sand', '<path d="M0 23Q8 19 15 23T32 22V32H0Z" fill="#e3c58b"/><path d="M0 28Q8 24 16 27T32 27" stroke="#b28c65" fill="none"/><g fill="#fff0c0"><circle cx="5" cy="27" r="1"/><circle cx="20" cy="25" r="1"/><circle cx="27" cy="30" r="1"/></g>')
svg('coral', '<path d="M5 32V20L1 15V8H5V14L9 18V8H13V14L17 10V3H21V11L25 7V4H29V11L21 17V24L27 20V15H31V23L20 29V32Z" fill="#f18e9f" stroke="#663e71"/><path d="M11 30V19M19 26V16" stroke="#ffd1b6" stroke-width="2"/>')
svg('rock', '<path d="M0 26L3 9L11 3L23 4L31 13L32 28L24 32H4Z" fill="#365c75" stroke="#1b374f"/><path d="M3 9L15 12L11 3M15 12L23 4M15 12L12 28L3 26M15 12L30 14" fill="none" stroke="#6c95a2" stroke-width="2"/><path d="M5 24q4-5 8-1M22 8l4 3" stroke="#72ad9d" fill="none"/>')
svg('kelp', '<g fill="none" stroke="#2fba91" stroke-width="3"><path d="M8 32Q17 19 8 3M20 32Q12 15 24 0M28 32Q22 20 30 11"/></g><g fill="#6be0a4"><path d="M8 23Q-2 18 3 13Q10 13 8 23M11 14Q21 8 15 5Q8 7 11 14M20 23Q10 21 14 16Q23 16 20 23M21 12Q30 12 30 5Q23 5 21 12"/></g>')
svg('anemone', '<path d="M3 29Q-1 22 4 14Q9 24 9 9Q15 0 14 21Q20 3 23 8Q20 24 28 12Q35 14 28 29Z" fill="#ca91ed" stroke="#614b9b"/><ellipse cx="16" cy="28" rx="12" ry="4" fill="#f2b2d8"/>')
svg('meno', fish(), False)
svg('family', fish(0,1,scale=.60)+fish(14,0,color='#f6b1b7',scale=.52)+fish(9,16,color='#9be6ec',scale=.48))
svg('seahorse', '<path d="M20 5Q11 1 10 10L5 12V16H13L12 21Q4 22 8 28Q16 34 22 26Q25 20 19 16L20 11L25 10V6Z" fill="#ffcf76" stroke="#865877"/><path d="M17 19Q22 26 15 27Q11 28 12 24" fill="none" stroke="#dc8b74" stroke-width="2"/><circle cx="16" cy="8" r="2" fill="#273951"/><path d="M20 16l8 3-5 5" fill="#f29fa9"/>')
svg('shark', '<path d="M1 18L7 9L15 12L19 3L23 13Q30 14 31 21L24 25L10 23L4 29L6 20Z" fill="#9daec4" stroke="#283e60"/><path d="M8 20Q21 17 29 21L23 25L11 23Z" fill="#dce7e8"/><circle cx="25" cy="17" r="2" fill="#203149"/><path d="M25 22q-4 3-7 0" stroke="#34476b" fill="none"/><path d="M12 14l-1 5M15 14l-1 5" stroke="#617b99"/>')
svg('shell-key', '<path d="M16 18L21 25L19 27L22 30L25 27L22 23L20 24L18 20" fill="#f8d57e" stroke="#855c68"/><path d="M5 16Q0 12 5 6Q9 1 13 5Q18 0 23 5Q29 10 23 16L16 21Z" fill="#f5b1cc" stroke="#875787"/><path d="M6 7L14 18M13 6L15 18M21 7L17 18" stroke="#fff0cf" fill="none"/>')
svg('lock-shell', '<path d="M2 27L2 15Q0 9 6 7Q7 1 13 5Q17 0 22 5Q29 4 30 14V27Z" fill="#bd91cc" stroke="#62477e"/><path d="M4 15L14 24M13 8L16 24M25 10L18 24" stroke="#ebc3df"/><rect x="12" y="18" width="9" height="10" rx="2" fill="#e4c688"/><circle cx="16.5" cy="22" r="2" fill="#304765"/><path d="M16.5 22v4" stroke="#304765"/>')
svg('locket', '<path d="M7 6Q16 0 25 6" stroke="#f8db8e" stroke-width="2" fill="none"/><path d="M16 28Q-1 17 7 11Q13 6 16 13Q22 5 27 12Q32 18 16 28Z" fill="#f5a7b7" stroke="#8b597b"/><path d="M10 14L16 23L23 13" stroke="#ffe5b2" fill="none"/>')
svg('algae-snack', '<path d="M6 13L25 10L28 26L8 29Z" fill="#e7cf94" stroke="#806976"/><path d="M9 16L23 14L25 24L11 26Z" fill="#5bbf93"/><path d="M14 23Q10 15 17 16Q23 16 20 20Z" fill="#ace19b"/><path d="M7 9l3-5M16 8V2M23 6l3-3" stroke="#fce7ac"/>')
svg('glow-sash', '<path d="M8 3L25 26L20 31L3 8Z" fill="#c1f48f" stroke="#3f9f93"/><path d="M7 6L23 28" stroke="#fffaca" stroke-width="2"/><circle cx="22" cy="10" r="3" fill="#b6f3ca"/><path d="M28 3v6M25 6h6M11 23v6M8 26h6" stroke="#e5ffb4"/>')
svg('jellyfish', '<path d="M5 18Q1 1 16 2Q31 1 28 18Z" fill="#d8b5f6" stroke="#775caa"/><path d="M7 19q7 5 0 12M15 19q-7 5 1 12M24 19q7 5 0 12" stroke="#efa2df" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="2" fill="#504b85"/><circle cx="22" cy="12" r="2" fill="#504b85"/><path d="M15 16h4" stroke="#504b85"/>')
svg('turtle', '<g fill="#80d6b6" stroke="#356784"><path d="M9 12L0 6L2 17L9 18M21 12L31 5L30 17L24 19M9 23L3 31L13 28M22 23L28 31L20 28"/><ellipse cx="17" cy="17" rx="11" ry="12" fill="#5d9c96"/><circle cx="17" cy="4" r="5"/></g><path d="M11 12L20 9L25 16L20 24L11 22L8 16Z" fill="#b4d9a0" stroke="#427b83"/><path d="M11 12L16 17L20 9M16 17L25 16M16 17L20 24M16 17L11 22" stroke="#427b83"/><circle cx="15" cy="3" r="1" fill="#243f60"/><circle cx="20" cy="3" r="1" fill="#243f60"/>')
svg('compass', '<circle cx="16" cy="17" r="12" fill="#f3d292" stroke="#967a73" stroke-width="2"/><circle cx="16" cy="17" r="9" fill="#e1f2df"/><path d="M16 7L20 17L16 27L12 17Z" fill="#e98791"/><path d="M16 17L16 27L12 17Z" fill="#568ea4"/><circle cx="16" cy="17" r="2" fill="#fff5c8"/><path d="M14 3h4" stroke="#f1d391" stroke-width="3"/>')
svg('chest', '<path d="M4 17V10Q16-1 28 10V17" fill="#a88eac" stroke="#4e5379"/><path d="M4 15H28V28H4Z" fill="#917a9c" stroke="#4e5379"/><path d="M9 6V28M23 6V28M4 17H28" stroke="#f0cf8d" stroke-width="3"/><rect x="13" y="15" width="6" height="7" rx="1" fill="#fff0b8"/><circle cx="16" cy="18" r="1" fill="#52637a"/>')
svg('bubble-wand', '<path d="M7 29L22 13" stroke="#f5d995" stroke-width="4"/><circle cx="23" cy="9" r="7" fill="none" stroke="#a7f2e7" stroke-width="3"/><circle cx="6" cy="7" r="4" fill="none" stroke="#d6f4f3"/><circle cx="12" cy="15" r="2" fill="#d6f4f3"/>')
svg('reed', '<path d="M5 29L22 4" stroke="#a8c389" stroke-width="4"/><path d="M9 24L18 27M14 17L4 14M20 10L29 10" stroke="#4b9e8f" stroke-width="3"/><circle cx="25" cy="22" r="3" fill="none" stroke="#a9e0d6"/>')
svg('net', '<path d="M3 2L0 31H31L28 2Z" fill="#1f5971"/><g stroke="#d4c59d" fill="none" stroke-width="1.5"><path d="M3 2L27 31M3 10L20 31M2 19L12 31M12 2L31 23M21 2L30 13M28 2L1 31M29 12L10 31M30 22L21 31M19 2L2 21M10 2L2 11"/></g><path d="M2 2H29" stroke="#a4a4a0" stroke-width="3"/>')
svg('octopus', '<path d="M8 20Q0 5 14 3Q30 0 26 20Q34 30 26 29L22 24Q23 34 18 30L16 24Q12 35 9 28L10 23Q-1 34 3 24Z" fill="#cf96d4" stroke="#69578e"/><circle cx="13" cy="13" r="3" fill="#fff3d8"/><circle cx="22" cy="13" r="3" fill="#fff3d8"/><circle cx="14" cy="14" r="1.5" fill="#3f3a68"/><circle cx="21" cy="14" r="1.5" fill="#3f3a68"/><path d="M15 20q3 2 5-1" stroke="#69578e" fill="none"/>')
svg('crab', '<g fill="#efb28c" stroke="#97577a"><path d="M9 20L2 12L2 4L8 8L6 12L12 16M23 20L30 12V4L24 8L26 12L20 16"/><ellipse cx="16" cy="21" rx="11" ry="7"/></g><path d="M5 21L1 24M6 25L3 29M26 21L31 24M25 25L29 29M11 16V11M21 16V11" stroke="#f1bb96" stroke-width="2"/><circle cx="11" cy="10" r="2" fill="#f6edd8"/><circle cx="21" cy="10" r="2" fill="#f6edd8"/><circle cx="11" cy="10" r="1" fill="#383b63"/><circle cx="21" cy="10" r="1" fill="#383b63"/>')
svg('bell', '<path d="M7 23Q11 20 10 13Q10 5 17 5Q24 5 24 13Q23 20 28 23Z" fill="#f3d07f" stroke="#8d6c77"/><path d="M6 24H28M16 3h3" stroke="#ffebb0" stroke-width="3"/><circle cx="17" cy="27" r="3" fill="#b69680"/><path d="M4 10L1 7M28 7l3-3" stroke="#a7e9d8" stroke-width="2"/>')
svg('pearl', '<path d="M3 24L6 17L13 20L19 16L29 24Q17 34 3 24Z" fill="#e8aacb" stroke="#8a699a"/><circle cx="16" cy="16" r="10" fill="#e0e3f2" stroke="#9aacc9"/><ellipse cx="13" cy="12" rx="4" ry="3" fill="#fffdeb"/><path d="M19 22q5-2 5-6" stroke="#bcb2dc" fill="none"/>')
svg('note', '<path d="M7 4L27 6L25 29L4 26Z" fill="#f2dfae" stroke="#8c7b85"/><path d="M11 10L22 11M9 15L22 16M8 20L19 21" stroke="#619ba0" stroke-width="2"/><path d="M5 25L23 27" stroke="#d1ab8c"/>')
svg('portal', '<path d="M5 31V15Q4 3 16 2Q29 2 28 15V31" fill="#48768b" stroke="#88d8cb" stroke-width="3"/><path d="M10 30V16Q10 8 17 8Q23 8 23 16V30Z" fill="#1e94aa"/><path d="M16 13L21 20H18V27H14V20H11Z" fill="#ccf0bf"/><circle cx="7" cy="6" r="2" fill="#f4d796"/>')
svg('lantern', '<path d="M12 4q4-6 8 0V8H12Z" fill="none" stroke="#f0d19a" stroke-width="2"/><path d="M7 10L12 5H20L26 10L24 27H9Z" fill="#a8d2c1" stroke="#698a9b"/><path d="M12 10H21L20 25H12Z" fill="#fff2b3"/><path d="M7 10H26M9 27H24" stroke="#f2d291" stroke-width="3"/><path d="M15 12v10" stroke="#fffbe2" stroke-width="2"/>')
svg('valve', '<path d="M0 21H12V0H20V21H32V29H0Z" fill="#547c90" stroke="#aac1bd"/><circle cx="16" cy="16" r="10" fill="none" stroke="#ebaa9a" stroke-width="4"/><path d="M6 16H26M16 6V26" stroke="#ebaa9a" stroke-width="3"/><circle cx="16" cy="16" r="3" fill="#f8dfb1"/>')
svg('starfish', '<path d="M16 2L20 12L31 12L23 19L26 30L16 24L6 30L9 19L1 12L12 12Z" fill="#efba8e" stroke="#ac7482"/><g fill="#ffe3ac"><circle cx="16" cy="13" r="1"/><circle cx="12" cy="18" r="1"/><circle cx="20" cy="19" r="1"/></g><circle cx="14" cy="17" r="1" fill="#4d4c70"/><circle cx="18" cy="17" r="1" fill="#4d4c70"/>')
svg('bottle', '<path d="M12 2H21V10L27 15V29H6V15L12 10Z" fill="#71c9be" fill-opacity=".85" stroke="#abe7d5"/><path d="M12 3H21" stroke="#ddb77b" stroke-width="4"/><path d="M10 17L23 15L23 25L10 26Z" fill="#f3dfb1"/><path d="M13 20h7M13 23h5" stroke="#88989c"/>')
svg('sea-gate', '<path d="M4 32V12Q4 1 16 1Q28 1 28 12V32" fill="none" stroke="#c0a2bc" stroke-width="5"/><path d="M9 9V31M16 5V31M23 9V31M5 20H27" stroke="#aac6cb" stroke-width="2"/><path d="M14 16H19V23H14Z" fill="#f7da98"/>')

def section(name, fields):
    return '[' + name + ']\n' + '\n'.join(f'{k}: {v}' for k, v in fields.items()) + '\n\n'

class Chapter:
    def __init__(self, id, name, wall, floor='water'):
        self.id, self.name = id, name
        self.blocks, self.events, self.placements = [], [], []
        self.categories = {1: 0, 2: 0, 3: 0, 4: 0}
        self.variables = {}
        self.grid = [[2] * 25 for _ in range(19)]
        rng = random.Random(7319 + id * 811)
        stack, seen = [(2, 2)], {(2, 2)}
        self.grid[1][1] = 1
        while stack:
            x, y = stack[-1]
            ns = [(x+dx, y+dy) for dx,dy in [(2,0),(-2,0),(0,2),(0,-2)] if 2 <= x+dx <= 24 and 2 <= y+dy <= 18 and (x+dx,y+dy) not in seen]
            if not ns:
                stack.pop()
                continue
            nx, ny = rng.choice(ns)
            self.grid[(y+ny)//2-1][(x+nx)//2-1] = 1
            self.grid[ny-1][nx-1] = 1
            seen.add((nx,ny))
            stack.append((nx,ny))
        prev, q = {(2,2): None}, deque([(2,2)])
        while q:
            x,y = q.popleft()
            for n in [(x+1,y),(x-1,y),(x,y+1),(x,y-1)]:
                if 1 <= n[0] <= 25 and 1 <= n[1] <= 19 and self.grid[n[1]-1][n[0]-1] == 1 and n not in prev:
                    prev[n] = (x,y); q.append(n)
        end = list(prev)[-1]
        self.path = []
        while end:
            self.path.append(end); end = prev[end]
        self.path.reverse()
        self.add('Move', 'Open sea' if floor=='water' else 'Sandy seabed', floor)
        self.add('Wall', name + ' barrier', wall)
        self.add('Move', 'Soft sand', 'sand')
        self.add('Wall', 'Unbroken reef stone', 'rock')
        # Extra sand provides visual bearings without changing collision behavior.
        for i,(x,y) in enumerate(self.path):
            if i % 7 in (0,1): self.grid[y-1][x-1] = 3

    def add(self, kind, name, art, **fields):
        cat = {'Move':1,'Wall':2,'Interaction':3,'Inventory':4}[kind]
        self.categories[cat] += 1
        index = len(self.blocks) + 1
        nid = f'{self.id}/{cat}.{self.categories[cat]}'
        data = dict(NID=nid, Type=kind, Description=name, MapImage='@Meno'+''.join(s.title() for s in art.split('-')))
        data.update(fields)
        self.blocks.append(dict(index=index, fields=data, choices=[]))
        return self.blocks[-1]

    def item(self, name, art, kind='Item', **kw):
        return self.add('Inventory', name, art, ItemKind=kind, **kw)

    def choice(self, block, text, action='Attempt', tests=(), **effects):
        f = dict(Text=text, Action=action)
        for i,t in enumerate(tests,1): f[f'Test.{i}'] = t
        f.update({k.replace('__','.'): v for k,v in effects.items()})
        block['choices'].append(f)
        return block

    def npc(self, name, art, message, response, **effects):
        b = self.add('Interaction', name, art, Message=message, CancelActionText='Swim back')
        self.choice(b, response, **effects)
        return b

    def put(self, fraction, b, solve=0, selected=None, equip=None, hint=''):
        i = int(fraction * (len(self.path)-1))
        # Keep authored events distinct and ordered, never overwrite the arrival cell.
        occupied = {tuple(p['at']) for p in self.events}
        while self.path[i] in occupied: i += 1
        x,y = self.path[i]
        self.grid[y-1][x-1] = b['index']
        e = dict(at=[x,y], block=b['index'], name=b['fields']['Description'], choice=solve, hint=hint)
        if selected: e['selected'] = selected['fields']['NID']
        if equip: e['equip'] = equip['fields']['NID']
        self.events.append(e)
        return e

    def exit(self, story):
        b = self.npc('Current to chapter ' + str(self.id+1), 'portal', story, 'Follow the current', Pass__Transport=f'({self.id+1})', Pass__Message=story)
        # Reusable transit, but never silently transport on arrival.
        b['choices'][0]['Pass.ReplaceBlock'] = b['fields']['NID']
        self.put(1,b,hint='Follow the current into the next chapter.')

    def write(self):
        text = '; MENO: THE TIDELIGHT TRAIL - original Maze Craze adventure\n; Coordinates are Cartesian: (1,1) is bottom-left. Data only; no scripts.\n\n'
        text += section('Map',dict(ID=self.id, Name=f'{self.id}. {self.name}', Dimensions='25x19',DefaultBlock=f'{self.id}/1.1',BorderBlock=f'{self.id}/2.2',StartingLocation='(2,2)',ViewWindow='4444 | 3333 | 5555 | 9999 | 4404'))
        if self.variables: text += section('Variables',self.variables)
        for b in self.blocks:
            text += section(f'Block.{b["index"]}',b['fields'])
            for i,c in enumerate(b['choices'],1): text += section(f'Block.{b["index"]}.Choice.{i}',c)
        text += '[MapData]\nFormat: Longhand\n'
        for row in reversed(self.grid):
            groups = []
            for value in row:
                if groups and groups[-1][0] == value: groups[-1][1] += 1
                else: groups.append([value,1])
            text += ' | '.join(str(v)+(f'({n})' if n>1 else '') for v,n in groups)+'\n'
        (OUT/f'map-{self.id}.txt').write_text(text)


chapters = []
c = Chapter(1,'Stormglass Reef','coral'); chapters.append(c)
locket = c.item('Family heart-shell locket','locket',ItemGroup='Keepsake',Message='Keep this. Your family will recognize the three little shell marks.')
key = c.item('Rose-shell key','shell-key',ItemGroup='Key')
c.put(.03,c.npc('Tavi the seahorse','seahorse','A storm scattered the guppy family. Tavi found your heart-shell locket in an empty anemone. Your family follows the Tidelight lanterns toward Moonpool Lagoon. Search the reef, then follow the currents.','Take the locket and ask for directions',Pass__GiveItems=locket['fields']['NID'],Pass__Message='Tavi: Keep the locket safe, Meno. Collect useful things by swimming toward them. A matching item is spent only when its puzzle succeeds.'),hint='Accept the locket. Keep it for the whole game.')
c.put(.28,c.npc('The tidekeeper\'s shell box','chest','A rose-shaped key rests in a box of beach glass. A shell gate bars the only safe way out of the reef.','Open the shell box',Pass__GiveItems=key['fields']['NID'],Pass__Message='You found a rose-shell key. Try it at the gate, not at the plain coral walls.'),hint='Open the box for the rose-shell key.')
b = c.add('Interaction','The rose-shell gate','lock-shell',Message='The pink shell lock matches the key from the tidekeeper. Only this gate can be opened; ordinary coral is a wall.')
c.choice(b,'Try a shell key','UseInventory',[f'SelectedItem.ID | Equal | {key["fields"]["NID"]}'],SelectionGroup='Key',NoSelectionMessage='Find the tidekeeper\'s shell box first.',Pass__ReplaceBlock='1/1.2',Pass__Message='The rose-shell key turns once and dissolves into bubbles. The gate folds back into sand.',Fail__Message='That key does not fit. You keep it.')
c.put(.62,b,selected=key,hint='Use the rose-shell key. It is consumed only on success.')
c.exit('Lantern crumbs lead into Whispering Kelp. A friendly shark guards a quiet passage there.')

c = Chapter(2,'Whispering Kelp','kelp'); chapters.append(c)
snack = c.item('Crunchy algae biscuit','algae-snack',ItemGroup='Food')
sash = c.item('Glow-thread sash','glow-sash','Wearable',WearLocation='Torso',ItemGroup='Light')
c.put(.04,c.npc('A message in green glass','bottle','Your family left a note: We are safe. We took the lantern route past the jellyfish. Ask Brindle the shark for the glowing sash. He loves algae biscuits.','Read the family note',Pass__Message='Not every large ocean animal is an enemy. Try a kind offer before you rush past.'),hint='Read the note for Brindle\'s clue.')
c.put(.26,snack,hint='Pick up the algae biscuit.')
b=c.add('Interaction','Brindle the gentle shark','shark',Message='Brindle keeps this kelp tunnel quiet for the smaller fish. I am a little peckish, he says. Do you have a crunchy sea-garden snack?')
c.choice(b,'Offer a snack','UseInventory',[f'SelectedItem.ID | Equal | {snack["fields"]["NID"]}'],SelectionGroup='Food',NoSelectionMessage='Look for an algae biscuit among the kelp.',Pass__GiveItems=sash['fields']['NID'],Pass__Message='Brindle munches happily and gives you a glow-thread sash. Wear it from your pack before swimming among the jellyfish.',Fail__Message='Brindle thanks you, but that is not his favorite snack. You keep it.')
c.choice(b,'Try to rush past',tests=['Target.RequiredPower | LessThan | 0'],Fail__Message='Brindle gently blocks the narrow tunnel. There is no hurry. Find a kind way through.')
c.put(.65,b,selected=snack,hint='Offer the biscuit to receive the glow-thread sash.')
c.exit('The kelp opens onto a lavender glow: the Lantern Jelly Gardens. Your family\'s trail is getting brighter.')

c = Chapter(3,'Lantern Jelly Gardens','anemone'); chapters.append(c)
pearl = c.item('Moonlit navigation pearl','pearl',ItemGroup='Navigation')
reed = c.item('Bendy bubble reed','reed','Weapon',Power=2,Hands=1,ItemGroup='BubbleTool')
c.put(.04,c.npc('Lumi the lantern jelly','jellyfish','The small jellies mistake dark shapes for drifting kelp. Wear the glow-thread sash from Brindle so they know you are a friend. Cancel an encounter before opening your pack.','Listen to Lumi',Pass__Message='Open your pack, expand the map 2 sash, then choose Wear. Owning the sash is not the same as wearing it.'),hint='Wear the map 2 glow-thread sash before the curtain.')
b=c.add('Interaction','A curtain of little lanterns','jellyfish',Message='A curtain of jellyfish fills the passage. Their lights pulse together. They will make a safe space for a fish wearing glow-thread.')
c.choice(b,'Swim through with the glow-thread sash',tests=[f'Equipment.Worn | Contains | {sash["fields"]["NID"]}'],Pass__ReplaceBlock='3/1.2',Pass__Message='Your sash glows. The jellies drift aside without a single sting. The sash stays with you.',Fail__Message='The jellies cannot see your glow-thread. Swim back, open your pack, and WEAR the sash from map 2. Nothing is lost.')
c.put(.38,b,equip=sash,hint='Wear the sash, then attempt the crossing.')
c.put(.63,c.npc('A pearl in the lantern cradle','chest','Lumi saved a navigation pearl and a bendy reed. The pearl points toward the turtle current. The reed blows small bubbles but cannot break strong nets.','Collect the pearl and reed',Pass__GiveItems=pearl['fields']['NID']+' | '+reed['fields']['NID'],Pass__Message='You tuck away the pearl and reed. Save the pearl for Orla the turtle. The reed is reusable equipment, not a single-use item.'),hint='Collect both tools. Save the navigation pearl for chapter 4.')
c.exit('Warm water carries you to the Turning Tide, where Orla the turtle reads the stars in pearls.')

c=Chapter(4,'The Turning Tide','rock'); chapters.append(c)
wand=c.item('Stormglass bubble wand','bubble-wand','Weapon',Power=8,Hands=2,ItemGroup='BubbleTool')
c.put(.05,c.npc('Orla\'s current lesson','turtle','Your family rode the eastbound tide to Bellglass Harbor. First, show me a navigation pearl. Then remember the three current markers: RISE, TURN RIGHT, DIVE. Choose those directions in that order.','Remember the three current markers',Pass__Message='The current code is RISE, TURN RIGHT, DIVE. A wrong choice keeps you beside that marker so you can try again.'),hint='Remember Rise, Right, Dive.')
b=c.add('Interaction','Orla the star-reading turtle','turtle',Message='Orla holds a steady place against the tide. A moonlit navigation pearl will show me the safe crossing, she says.')
c.choice(b,'Offer the navigation pearl','UseInventory',[f'SelectedItem.ID | Equal | {pearl["fields"]["NID"]}'],SelectionGroup='Navigation',NoSelectionMessage='Find the navigation pearl in the Jelly Gardens.',Pass__Message='Orla reads the pearl, then returns it to the sea. Follow my current markers. Your family left a stronger bubble wand for you at the far end.',Fail__Message='That is not a navigation pearl. You keep your item.')
c.put(.22,b,selected=pearl,hint='Offer the map 3 navigation pearl.')
c.variables['CurrentStep']=0
for fraction,correct,label in [(.39,0,'First'),(.54,1,'Second'),(.69,2,'Third')]:
    b=c.add('Interaction',label+' current marker','compass',Message='Orla\'s lesson was RISE, TURN RIGHT, DIVE. Which part comes '+label.lower()+'?')
    for j,text in enumerate(['Rise with the bubbles','Turn right with the tide','Dive under the arch']):
        tests=[f'Map.Variable.CurrentStep | Equal | {correct}'] if j==correct else ['Map.Variable.CurrentStep | LessThan | 0']
        c.choice(b,text,tests=tests,Pass__SetMapVariable__CurrentStep=correct+1,Pass__Message='The current settles into a safe lane. You remember the next part of Orla\'s lesson.',Fail__Message='The tide loops gently back to this marker. Nothing is lost. Remember: RISE, TURN RIGHT, DIVE.')
    c.put(fraction,b,solve=correct,hint=f'Choose option {correct+1}: '+['Rise','Turn right','Dive'][correct]+'.')
c.put(.84,c.npc('The family\'s tool cache','chest','A stormglass bubble wand is tied to an old buoy. A note says: For tangled nets, not for hurting sea creatures. This wand is stronger than a bendy reed.','Take the stormglass wand',Pass__GiveItems=wand['fields']['NID'],Pass__Message='The stormglass wand has power 8 and uses both weapon hands. Wield it from your pack when a strong net blocks you.'),hint='Take the power 8 two-handed wand.')
c.exit('Orla points toward Bellglass Harbor. Your family stopped there to help two guppy fry trapped behind a forgotten gate.')

c=Chapter(5,'Bellglass Harbor','rock',floor='sand'); chapters.append(c)
valve=c.item('Copper valve handle','valve',ItemGroup='Repair')
c.variables['DrainOpen']=0
c.put(.04,c.npc('Pebble the clever octopus','octopus','Two little guppies, Bim and Bop, are stuck in an abandoned observation pool. No humans are here now. Turn the drain valve, find both fry, and ring the harbor bell so the gate opens. Your family promised to meet you beyond it.','Make a rescue plan',Pass__Message='First find the valve handle. Then drain the pool gently, help Bim and Bop, and ring the harbor bell.'),hint='Listen to the rescue plan.')
c.put(.18,valve,hint='Pick up the copper valve handle.')
b=c.add('Interaction','The dry dock drain','valve',Message='The drain is missing its handle. Repairing it will lower the water just enough to open a safe passage. Everyone can still breathe underwater.')
c.choice(b,'Fit the valve handle','UseInventory',[f'SelectedItem.ID | Equal | {valve["fields"]["NID"]}'],SelectionGroup='Repair',NoSelectionMessage='Find the copper valve handle nearby.',Pass__SetMapVariable__DrainOpen=1,Pass__ReplaceBlock='5/1.2',Pass__Message='The handle fits. Water swirls safely through the drain and opens a narrow passage.',Fail__Message='That does not fit the valve. You keep it.')
c.put(.33,b,selected=valve,hint='Use the valve handle to set DrainOpen to 1.')
for fraction,name,state in [(.49,'Bim','BimSafe'),(.65,'Bop','BopSafe')]:
    b=c.add('Interaction',name+' the lost guppy fry','family',Message=name+' waits in a bottle-shaped alcove. The current must be safe before the little fish can leave.')
    c.choice(b,'Guide '+name+' to the safe current',tests=['Map.Variable.DrainOpen | Equal | 1'],Pass__AddState=state,Pass__Message=name+' follows a line of bubbles to safety. One more friend can make a big difference.',Fail__Message='The old drain is still closed. Fit its valve handle before leading anyone through.')
    c.put(fraction,b,hint='Guide '+name+' to safety after opening the drain.')
b=c.add('Interaction','The two-note harbor bell','bell',Message='The bell rings true only when both little guppies are safe. Sound it to open the harbor gate.')
c.choice(b,'Ring the bell for both friends',tests=['Player.State | Contains | BimSafe','Player.State | Contains | BopSafe'],Pass__AddState='HarborHelped',Pass__Message='DING-DONG! Bim and Bop ring their tiny bells in answer. The harbor gate opens. Your family will be proud of your kindness.',Fail__Message='One little answering bell is missing. Help BOTH Bim and Bop before you ring again.')
c.put(.82,b,hint='Both BimSafe and BopSafe are needed. Ring the bell.')
c.exit('Beyond the harbor lies the Drifting Netfield. You can hear your family calling through the ropes.')

c=Chapter(6,'The Drifting Netfield','net'); chapters.append(c)
token=c.item('Little teamwork shell','starfish',ItemGroup='Keepsake')
c.put(.05,c.npc('A warning on a float','note','A strong ghost net drifts across the channel. Your power 2 reed will make bubbles, but only the power 8 stormglass wand can loosen its knot. Open your pack and WIELD the wand. Sea creatures are friends, not targets.','Read the net warning',Pass__Message='The net needs power GREATER THAN 6. Cancel the encounter to equip your two-handed stormglass wand. The equipment stays in your pack after use.'),hint='Wield the map 4 wand before the strong net.')
b=c.add('Interaction','The storm-tied ghost net','net',RequiredPower=6,Message='This net looks like the other net walls, but its central knot trembles when bubbles touch it. Untie this one with a strong bubble tool. Ordinary net walls remain impassable.')
c.choice(b,'Loosen the knot with a wielded bubble tool','Attack',['SelectedItem.Power | GreaterThan | Target.RequiredPower','SelectedItem.State | Equal | Working'],SelectionGroup='BubbleTool',NoSelectionMessage='Wield the stormglass bubble wand from map 4 in your pack first.',Pass__ReplaceBlock='6/1.2',Pass__Message='A ring of bright bubbles lifts the knot. The net slips loose without hurting anyone. Your wand stays with you.',Fail__Message='Your {SelectedItem.Name} is too weak to loosen this knot. Wield the power 8 stormglass wand instead. No tool is lost.')
c.put(.37,b,selected=wand,equip=wand,hint='Attack with the wielded power 8 wand; the power 2 reed fails safely.')
b=c.add('Interaction','A school behind the ropes','family',Message='Several small fish are frightened behind a loose curtain of ropes. They will trust a fish who helped the two harbor fry.')
c.choice(b,'Ask everyone to swim together',tests=['Player.State | Contains | HarborHelped'],Pass__AddState='SchoolTogether',Pass__GiveItems=token['fields']['NID'],Pass__Message='Bim and Bop recognize you and call the school together. You receive a little teamwork shell. Nobody has to be brave alone.',Fail__Message='The school is unsure. Help the harbor fry and ring their bell to earn their trust.')
c.put(.59,b,hint='Ask the school to work together; HarborHelped is required.')
b=c.add('Interaction','The drifting curtain','net',Message='One guppy cannot shift this wide curtain. A whole school swimming DOWN together can gently pull it off the coral.')
c.choice(b,'Swim down together',tests=['Player.State | Contains | SchoolTogether',f'Equipment.Wielded | Contains | {wand["fields"]["NID"]}'],Pass__AddState='NetFreed',Pass__ReplaceBlock='6/1.2',Pass__Message='Together, you swim down and guide bubbles under the ropes. The curtain lifts into an empty channel. Every fish is free.',Fail__Message='Gather the school first and keep the stormglass wand wielded. The current is too strong to do this alone.')
c.choice(b,'Try pulling alone',tests=['Target.RequiredPower | LessThan | 0'],Fail__Message='The rope barely moves. Ask your new friends to help instead.')
c.put(.82,b,hint='Keep the wand wielded and choose Swim down together.')
c.exit('A silver trail opens toward Moonpool Lagoon. Familiar tails sparkle between the coral arches.')

c=Chapter(7,'Moonpool Homecoming','coral'); chapters.append(c)
c.variables['LanternLit']=0
c.put(.06,c.npc('The last family message','bottle','We followed your light, Meno. We heard about the fry and the net. Meet us at the Tidelight lantern. Bring your heart-shell locket so our littlest guppies know you. We love you.','Read the message from home',Pass__Message='Your heart-shell locket came from Tavi on map 1. Keep it. Wear your glow-thread sash and look for the dark lantern.'),hint='Keep the map 1 locket and wear the map 2 sash.')
b=c.add('Interaction','The dark Tidelight lantern','lantern',Message='The family lantern has gone dim. Glow-thread can lend it a gentle light without using up the sash.')
c.choice(b,'Share the glow from your sash',tests=[f'Equipment.Worn | Contains | {sash["fields"]["NID"]}'],Pass__SetMapVariable__LanternLit=1,Pass__ReplaceBlock='7/1.2',Pass__Message='The Tidelight lantern blooms with soft green light. Your sash keeps glowing too. Across the lagoon, a family answers.',Fail__Message='Wear the glow-thread sash from map 2, then try again. Carrying it in your pack will not light the lantern.')
c.put(.38,b,hint='Wear the sash to light the lantern.')
b=c.add('Interaction','The lantern arch','sea-gate',Message='This last arch leads to the quiet lagoon. Its shell marks read: LIGHT THE WAY. LEAVE NO FRIEND BEHIND.')
c.choice(b,'Follow the light home',tests=['Map.Variable.LanternLit | Equal | 1','Player.State | Contains | NetFreed'],Pass__ReplaceBlock='7/1.2',Pass__Message='The arch opens. The path is bright, and every friend you helped is swimming safely. Your family is just ahead.',Fail__Message='Light the lagoon lantern and free the school from the netfield first. The arch stays closed, and your items stay safe.')
c.put(.68,b,hint='LanternLit and NetFreed must both be true.')
b=c.add('Interaction','The guppy family reunion','family',InteractionImage='@MenoHomecoming',Message='There they are: your guppy family, safe beneath the lanterns! Your littlest sibling peeks around a shell. Is that really Meno? Show the heart-shell locket and tell them about the friends who helped you home.')
c.choice(b,'Show the locket and swim into a family hug',tests=[f'Inventory.Quantity | GreaterOrEqual | 1 | {locket["fields"]["NID"]}','Player.State | Contains | NetFreed','Map.Variable.LanternLit | Equal | 1'],Pass__EndGame='Yes',Pass__Message='MENO FOUND HIS FAMILY! Your heart-shell shines as everyone gathers for a guppy-sized hug. Tavi, Brindle, Lumi, Orla, Pebble, Bim and Bop follow the lanterns to join the celebration. You found your way home by being curious, kind, and brave together. Well done, {Player.Name}!',Fail__Message='Your family asks for the heart-shell locket. Keep the locket from Tavi, light the lagoon lantern, and make sure the netfield school is free.')
c.put(1,b,hint='Show the family locket. It is tested, not consumed. Celebrate!')

assets = sorted(p.stem for p in ART.glob('*.svg')) + ['homecoming']
config = section('Game',dict(Title='Meno: The Tidelight Trail',Author='Sebastian and Esther\'s Maze Craze collection',StartMap=1,WelcomeMessage='You are Meno, a little guppy separated from your family by a storm. Follow the Tidelight lanterns through seven ocean mazes. Find useful things, help new friends, and bring your heart-shell locket home.',VictoryTitle='Meno found his family!',VictoryMessage='The Tidelight lanterns shine for a family reunited. Well done, {Player.Name}!',RequestTimeoutMs=10000))
config += section('Maps',{f'Map.{i}':f'map-{i}.txt' for i in range(1,8)})
config += section('Images',dict(Player='assets/meno.png',Princess='assets/homecoming.png'))
config += section('Style',dict(Font='Georgia',MessageFont='System',Accent='#a8ead7',Panel='#103c56',Text='#f4f0d9'))
config += section('ImageCatalog',{'Meno'+''.join(s.title() for s in name.split('-')):'assets/'+name+'.png' for name in assets})
(OUT/'game-config.txt').write_text('; Add Game.meno: maps/meno/game-config.txt to the master [Games] section.\n\n'+config)
for c in chapters: c.write()
manifest = [dict(id=c.id,name=c.name,width=25,height=19,pathLength=len(c.path)-1,events=c.events,path=c.path) for c in chapters]
(OUT/'solution.json').write_text(json.dumps(manifest,indent=2)+'\n')

guide = '# Meno: The Tidelight Trail — SPOILER walkthrough\n\nThe shortest routes are pictured in `atlas/solution-1.png` through `solution-7.png`. All coordinates are **(X,Y)**, with (1,1) at the bottom-left. The numbered dots follow the event order below. Every chapter is 25 squares wide and 19 squares tall. Switch to the 9999 view for a wider look; the atlas shows the entire map.\n\n**Keep the heart-shell locket, glow-thread sash, and stormglass wand.** Quest items can be discarded by the existing engine, so discarding them can make this run unwinnable. Restart the game if that happens. There is no automatic save.\n\n'
for m in manifest:
    guide += f'## {m["id"]}. {m["name"]}\n\nShortest start-to-exit route: {m["pathLength"]} one-square moves. Start: (2,2).\n\n'
    for j,e in enumerate(m['events'],1):
        guide += f'{j}. **{e["name"]} at ({e["at"][0]},{e["at"][1]})** — {e["hint"]}\n'
    guide += '\n'
guide += '## About travel and testing\n\nThe seven chapters form a **forward-only journey**. Currents lead to the next chapter, never to another game. All mandatory items appear before the gate that needs them. Wear and wield equipment before opening an encounter; cancel the encounter if you need to open your pack. The atlas route is not revealed in normal play. For editor testing from later maps, inventory and states start empty, so earlier items will be absent. Test from map 1 for the whole story, or temporarily add a debug supply chest in your own edited copy.\n'
(OUT/'WALKTHROUGH-SPOILERS.md').write_text(guide)
print('Built 7 deterministic 25x19 story mazes and',len(assets)-1,'original SVG tile sources.')
