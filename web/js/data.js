/* Static reference data. Monster and item numbers come from engine/extern.c. */
var RogueData = (function () {
  'use strict';

  // letter, name, XP level (hit dice = level d8), AC, damage, XP reward, note
  var MONSTERS = [
    ['A', 'aquator',       5,  2, '0x0 (rusts armor)', 20,   'Each hit rusts your armor by one point. Take armor off (T) before it reaches you, or kill it at range.'],
    ['B', 'bat',           1,  3, '1d2',               1,    'Flies erratically, so it is hard to pin down. Fight it in a corridor.'],
    ['C', 'centaur',       4,  4, '1d2/1d5/1d5',       17,   'Dangerous early. Fight on stairs so you can leave.'],
    ['D', 'dragon',        10, -1, '1d8/1d8/3d10',     5000, 'Breathes fire. Do not melee without strong armor and plenty of HP. Fire damage hits from a distance in a line.'],
    ['E', 'emu',           1,  7, '1d2',               2,    'Easy.'],
    ['F', 'venus flytrap', 8,  3, 'grows each turn',   80,   'Holds you in place, so you cannot run. Each turn it grips, its damage grows. Kill it fast or avoid its room.'],
    ['G', 'griffin',       13, 2, '4d3/3d5',           2000, 'Flies, regenerates. Avoid until you are strong.'],
    ['H', 'hobgoblin',     1,  5, '1d8',               3,    'Common early threat. Fight it in a doorway.'],
    ['I', 'ice monster',   1,  9, '0x0 (freezes)',     5,    'Its touch freezes you for several turns, so only attack it when nothing else is around.'],
    ['J', 'jabberwock',    15, 6, '2d12/2d4',          3000, 'Very strong. Only for well-armored late characters.'],
    ['K', 'kestrel',       1,  7, '1d4',               1,    'Flies. Weak.'],
    ['L', 'leprechaun',    3,  8, '1d1 (steals gold)', 10,   'Steals gold and teleports away. Kill it at range or avoid it. Gold counts toward your score.'],
    ['M', 'medusa',        8,  2, '3d4/3d4/2d5',       200,  'Her gaze confuses you. Be at full health before facing her.'],
    ['N', 'nymph',         3,  9, '0x0 (steals item)', 37,   'Steals a magic item and teleports away. Kill it from range or run. Never let it touch your best item.'],
    ['O', 'orc',           1,  6, '1d8',               5,    'Greedy for gold, so it heads for treasure first.'],
    ['P', 'phantom',       8,  3, '4d4',               120,  'Invisible without a ring or potion of see invisible. You only see it when it is next to you.'],
    ['Q', 'quagga',        3,  3, '1d5/1d5',           15,   'A straightforward melee enemy.'],
    ['R', 'rattlesnake',   2,  3, '1d6 (drains str)',  9,    'Bites can lower your strength. A ring of sustain strength protects you.'],
    ['S', 'snake',         1,  5, '1d3',               2,    'Easy.'],
    ['T', 'troll',         6,  4, '1d8/1d8/2d6',       120,  'Strong and regenerates. Do not fight it before you have good armor.'],
    ['U', 'black unicorn', 7, -2, '1d9/1d9/2d9',       190,  'Hits hard and is hard to hit. Avoid.'],
    ['V', 'vampire',       8,  1, '1d10 (drains HP)',  350,  'Each hit lowers your maximum HP permanently.'],
    ['W', 'wraith',        5,  4, '1d6 (drains XP)',   55,   'Each hit costs you an experience level.'],
    ['X', 'xeroc',         7,  7, '4d4',               100,  'Disguises itself as an item. Be wary of items that look out of place.'],
    ['Y', 'yeti',          4,  6, '1d6/1d6',           50,   'A solid mid-game melee enemy.'],
    ['Z', 'zombie',        2,  8, '1d8',               6,    'Slow and easy, though it hits hard for its level.']
  ];

  // [name, probability (out of 100 in its class), worth]
  var POTIONS = [
    ['confusion', 7, 5], ['hallucination', 8, 5], ['poison', 8, 5], ['gain strength', 13, 150],
    ['see invisible', 3, 100], ['healing', 13, 130], ['monster detection', 6, 130], ['magic detection', 6, 105],
    ['raise level', 2, 250], ['extra healing', 5, 200], ['haste self', 5, 190], ['restore strength', 13, 130],
    ['blindness', 5, 5], ['levitation', 6, 75]
  ];
  var SCROLLS = [
    ['monster confusion', 7, 140], ['magic mapping', 4, 150], ['hold monster', 2, 180], ['sleep', 3, 5],
    ['enchant armor', 7, 160], ['identify potion', 10, 80], ['identify scroll', 10, 80], ['identify weapon', 6, 80],
    ['identify armor', 7, 100], ['identify ring, wand or staff', 10, 115], ['scare monster', 3, 200],
    ['food detection', 2, 60], ['teleportation', 5, 165], ['enchant weapon', 8, 150], ['create monster', 4, 75],
    ['remove curse', 7, 105], ['aggravate monsters', 3, 20], ['protect armor', 2, 250]
  ];
  var RINGS = [
    ['protection', 9, 400], ['add strength', 9, 400], ['sustain strength', 5, 280], ['searching', 10, 420],
    ['see invisible', 10, 310], ['adornment', 1, 10], ['aggravate monster', 10, 10], ['dexterity', 8, 440],
    ['increase damage', 8, 400], ['regeneration', 4, 460], ['slow digestion', 9, 240], ['teleportation', 5, 30],
    ['stealth', 7, 470], ['maintain armor', 5, 380]
  ];
  var STICKS = [
    ['light', 12, 250], ['invisibility', 6, 5], ['lightning', 3, 330], ['fire', 3, 330], ['cold', 3, 330],
    ['polymorph', 15, 310], ['magic missile', 10, 170], ['haste monster', 10, 5], ['slow monster', 11, 350],
    ['drain life', 9, 300], ['nothing', 1, 5], ['teleport away', 6, 340], ['teleport to', 6, 50], ['cancellation', 5, 280]
  ];
  var ARMOR = [
    ['leather armor', 20, 8], ['ring mail', 15, 7], ['studded leather armor', 15, 7], ['scale mail', 13, 6],
    ['chain mail', 12, 5], ['splint mail', 10, 4], ['banded mail', 10, 4], ['plate mail', 5, 3]
  ];
  var WEAPONS = [
    ['mace', 11, '2d4 melee'], ['long sword', 11, '3d4 melee'], ['short bow', 12, 'wield it to fire arrows'],
    ['arrow', 12, '1d1 melee, 2d3 when fired from a bow'], ['dagger', 8, '1d6 melee, 1d4 thrown'],
    ['two handed sword', 10, '4d4 melee'], ['dart', 12, '1d3 thrown'], ['shuriken', 12, '1d2 melee, 2d4 thrown'],
    ['spear', 12, '2d3 melee, 1d6 thrown']
  ];

  // Everything that can appear on the map: glyph, name, what it means.
  var SYMBOLS = [
    ['@', 'You', 'Your character.'],
    ['A-Z', 'Monster', 'Each letter is a kind of monster. Look it up under Monsters below, or press / in the game and then the letter.'],
    ['.', 'Floor', 'Open floor of a room.'],
    ['#', 'Corridor', 'A passage between rooms. Corridors are dark, so you only see the squares next to you.'],
    ['+', 'Door', 'A doorway in a room wall. It leads to a corridor.'],
    ['| -', 'Wall', 'The walls of a room.'],
    ['%', 'Stairs', 'The staircase down. Stand on it and press > to go to the next level. Going up with < only works once you carry the Amulet of Yendor.'],
    ['^', 'Trap', 'A trap you have found. Press ^ and a direction to see what kind (trapdoor, arrow, sleeping gas, bear trap, teleport, poison dart, rust).'],
    ['*', 'Gold', 'Gold. Walk over it to pick it up; it counts toward your score.'],
    ['!', 'Potion', 'A potion. Drink it with q.'],
    ['?', 'Scroll', 'A scroll. Read it with r.'],
    [':', 'Food', 'A food ration. Eat it with e.'],
    [')', 'Weapon', 'A weapon. Wield it with w, throw it with t.'],
    [']', 'Armor', 'Armor. Wear it with W.'],
    ['=', 'Ring', 'A ring. Put it on with P.'],
    ['/', 'Wand or staff', 'A wand or staff. Zap it with z.'],
    [',', 'Amulet', 'The Amulet of Yendor, found deep in the dungeon.']
  ];

  // The status line at the bottom of the game screen.
  var STATUS = [
    ['Level', 'How deep you are. Deeper is harder.'],
    ['Gold', 'Gold in your purse. If you die, this is your score.'],
    ['Hp', 'Hit points now (and your maximum in brackets). At 0 you die.'],
    ['Str', 'Strength now (and your maximum). Some monsters and potions lower it.'],
    ['Arm', 'Armor class. Lower is better: 10 is no armor, and good armor gets it to 3 or less.'],
    ['Exp', 'Your experience level, then your experience points.']
  ];

  // Item kinds the engine can tell us about: kind index -> table
  var KINDS = [
    { id: 0, label: 'Potions',        singular: 'potion', items: POTIONS },
    { id: 1, label: 'Scrolls',        singular: 'scroll', items: SCROLLS },
    { id: 2, label: 'Rings',          singular: 'ring',   items: RINGS },
    { id: 3, label: 'Wands & staves', singular: 'stick',  items: STICKS }
  ];

  var ITEM_NOTES = {
    'potion': {
      'confusion': 'Bad. You stumble randomly for a while.',
      'hallucination': 'Bad but harmless. Monsters look like random letters for a while.',
      'poison': 'Bad. Costs strength and some HP.',
      'gain strength': 'Permanently +1 strength.',
      'see invisible': 'Lets you see phantoms for a while.',
      'healing': 'Heals you and can raise your max HP if you are already at full health.',
      'monster detection': 'Shows all monsters on the level for a while.',
      'magic detection': 'Shows where magic items are on the level.',
      'raise level': 'Gives you an experience level.',
      'extra healing': 'A bigger heal.',
      'haste self': 'Doubles your speed for a while.',
      'restore strength': 'Restores strength lost to rattlesnakes or poison.',
      'blindness': 'Bad. You cannot see for a while.',
      'levitation': 'You float, so you cannot take stairs or pick things up until it ends.'
    },
    'scroll': {
      'monster confusion': 'Your next melee hit confuses the monster.',
      'magic mapping': 'Maps the level, including secret doors.',
      'hold monster': 'Freezes nearby monsters.',
      'sleep': 'Bad. You fall asleep for several turns.',
      'enchant armor': 'Worn armor gets +1.',
      'identify potion': 'Identifies a potion.',
      'identify scroll': 'Identifies a scroll.',
      'identify weapon': 'Identifies a weapon.',
      'identify armor': 'Identifies armor.',
      'identify ring, wand or staff': 'Identifies a ring, wand or staff.',
      'scare monster': 'Monsters will not step next to it. Reading it wastes it, so drop it and stand on it. Picking it up twice destroys it.',
      'food detection': 'Shows food on the level.',
      'teleportation': 'Teleports you to a random spot.',
      'enchant weapon': 'Your wielded weapon gets +1.',
      'create monster': 'Bad. Spawns a monster next to you.',
      'remove curse': 'Lifts curses on your equipment.',
      'aggravate monsters': 'Bad. Wakes everything up.',
      'protect armor': 'Makes your armor immune to rust.'
    },
    'ring': {
      'protection': 'Armor bonus (or a penalty if cursed).',
      'add strength': 'Strength bonus (or a penalty if cursed).',
      'sustain strength': 'Strength cannot be drained.',
      'searching': 'Automatically finds secret doors and traps.',
      'see invisible': 'Reveals phantoms.',
      'adornment': 'Does nothing.',
      'aggravate monster': 'Bad. Wakes monsters up and draws them to you.',
      'dexterity': 'Better chance to hit.',
      'increase damage': 'More damage per hit.',
      'regeneration': 'Faster HP regeneration, but you get hungry faster.',
      'slow digestion': 'You use food more slowly.',
      'teleportation': 'Teleports you at random. Usually bad.',
      'stealth': 'Monsters wake less often.',
      'maintain armor': 'Your armor is protected from rust.'
    },
    'stick': {
      'light': 'Lights up a room.',
      'invisibility': 'Bad. Makes a monster invisible.',
      'lightning': 'Bolt that damages a line of monsters.',
      'fire': 'Fire bolt.',
      'cold': 'Cold bolt.',
      'polymorph': 'Turns a monster into another random one. A gamble.',
      'magic missile': 'Reliable ranged damage.',
      'haste monster': 'Bad. Speeds up a monster.',
      'slow monster': 'Slows a monster. Great against strong enemies.',
      'drain life': 'Costs you half your HP and damages every nearby monster.',
      'nothing': 'Does nothing.',
      'teleport away': 'Sends a monster across the level. A good panic button.',
      'teleport to': 'Pulls a monster to you. Rarely what you want.',
      'cancellation': 'Strips a monster of its special powers.'
    }
  };

  var COMMANDS = [
    ['h j k l', 'Move left, down, up, right (arrow keys also work)'],
    ['y u b n', 'Move diagonally (up-left, up-right, down-left, down-right)'],
    ['H J K L', 'Run in a direction (Shift + arrow)'],
    ['.', 'Rest one turn'],
    ['s', 'Search for secret doors and traps'],
    ['>', 'Go down stairs (stand on the % first)'],
    ['<', 'Go up stairs (only works if you carry the Amulet)'],
    ['i', 'Inventory'],
    ['e', 'Eat'],
    ['q', 'Quaff a potion'],
    ['r', 'Read a scroll'],
    ['w', 'Wield a weapon'],
    ['W', 'Wear armor'],
    ['T', 'Take armor off'],
    ['P / R', 'Put on / remove a ring'],
    ['t', 'Throw an item'],
    ['z', 'Zap a wand or staff'],
    ['d', 'Drop an item'],
    [',', 'Pick up what you are standing on'],
    ['^', 'Identify a trap'],
    ['/', 'Identify a character on screen'],
    ['f + direction', 'Fight until one of you dies'],
    ['F + direction', 'Fight to the death'],
    ['Alt + letter', 'Cheats, shown on the Cheats tab (for example Alt+H heals)'],
    ['v', 'Version'],
    ['S', 'Save and quit'],
    ['Q', 'Quit (you lose the game)']
  ];

  // Topic hints, three tiers each: nudge, stronger, answer.
  var HINTS = [
    { id: 'start', title: 'Getting started',
      tiers: [
        'The goal is the Amulet of Yendor at the bottom of the dungeon, then back to the top. Right now your job is just to survive and go down.',
        'You see only the map you have explored. Walk into rooms and corridors to reveal them. Items and stairs are shown as symbols on the map.',
        'Find the stairs (%) in each room and press > to go down. Pick things up by walking over them. Press i to see your pack. Wield your mace (w), wear your armor (W) if you are not already, and keep your bow and arrows for ranged fights.'
      ] },
    { id: 'stairs', title: 'Finding the stairs',
      tiers: [
        'The stairs are always somewhere in a room. Try the rooms you have not entered yet.',
        'If every visible door has been used and you still cannot find a way, there is likely a secret door. Dead-end corridors are a strong clue.',
        'Stand next to the suspicious wall or at the dead end and press s several times to search. Each search has a chance of finding hidden doors. A magic mapping scroll shows secret doors too. Cheats > Reveal map also works.'
      ] },
    { id: 'fight', title: 'Fighting well',
      tiers: [
        'Where you stand matters as much as how you swing.',
        'Fight in a corridor or doorway so only one monster can reach you at a time. Throw daggers and fire arrows at things that are coming.',
        'Equip the best armor you have (lower AC is better). Rest with s or . after fights; you heal slowly. Do not rest while hungry. If a fight goes badly, the stairs down are an escape; only monsters next to you follow. You cannot go back up until you have the Amulet.'
      ] },
    { id: 'hunger', title: 'Food and hunger',
      tiers: [
        'You get Hungry, then Weak, then Faint, and then you starve.',
        'You start with one food ration. Rations show as : on the map. You can carry several.',
        'Eat (e) when the status line says Hungry. A ration lasts about 1,300 moves. Eating while only slightly hungry wastes a little, but is safer than risking Weak. Do not dawdle. Resting and searching all burn food.'
      ] },
    { id: 'potions', title: 'Unknown potions',
      tiers: [
        'Potions are mostly good, but a few are harmful.',
        'Common potions: healing, gain strength, restore strength (13 in 100 each). Bad ones: confusion, hallucination, poison, blindness. The Reference tab shows the odds for every kind.',
        'Test-drink unknown potions when at full health, with no monsters near, If you carry two or more of the same unknown kind, it is more likely to be a common (good) potion. Healing potions are best saved for emergencies once identified.'
      ] },
    { id: 'scrolls', title: 'Unknown scrolls',
      tiers: [
        'Reading is how you identify scrolls, but a few are harmful.',
        'Bad scrolls: sleep, aggravate monsters, create monster, teleportation (sometimes). Read unknown scrolls when at full health with no monsters nearby. Never read in a dangerous spot.',
        'Do not read your last unknown scroll at a bad moment. Scare monster is the exception: reading it wastes it, so if you find one, drop it and stand on it when you are in trouble. Enchant armor is the best use of most scrolls.'
      ] },
    { id: 'rings', title: 'Rings, wands and staves',
      tiers: [
        'Rings give lasting effects, but some are cursed. Wands and staves have limited charges.',
        'A cursed ring cannot be removed until a remove curse scroll is read. Bad rings are aggravate monster, teleportation and adornment (harmless). Ring numbers show the bonus once identified.',
        'Try on rings only when you have a remove curse scroll or are willing to risk it. Zap unknown wands at a weak monster to identify them. Slow monster, teleport away and magic missile are the best wands to keep for tough fights.'
      ] },
    { id: 'armor', title: 'Armor and weapons',
      tiers: [
        'Armor class (AC) is shown on the status line. Lower is better.',
        'Heavier armor is better. Plate mail is AC 3, chain mail 5, leather 8. Enchant armor scrolls improve AC by one each.',
        'Wear armor with W and take it off with T. Rust from aquators reduces armor. Wield the two-handed sword if you have the strength; a mace or long sword is a good default. Arrows only work with a bow wielded.'
      ] },
    { id: 'monsters', title: 'Dangerous monsters',
      tiers: [
        'A few monsters have effects worse than their damage.',
        'Nymphs and leprechauns steal; aquators rust armor; rattlesnakes drain strength; vampires and wraiths drain max HP and levels; ice monsters freeze; venus flytraps hold; medusa confuses.',
        'Kill thieves from range. Take armor off before an aquator reaches you. Avoid flytraps unless healthy. In the Reference tab, you can look up every monster. Use / in the game on any letter to identify it.'
      ] },
    { id: 'traps', title: 'Traps',
      tiers: [
        'Traps are hidden until you find them or step on them.',
        'Press ^ and a direction to learn what a seen trap is. Types include trapdoor (drops you a level), arrow, sleeping gas, bear trap, teleport, poison dart and rust.',
        'A ring of searching or the s command reveals traps. Sleeping gas next to a monster is deadly. A trapdoor is a free descent if you are ready for the next level.'
      ] },
    { id: 'score', title: 'Scoring',
      tiers: [
        'Gold is the main source of score.',
        'If you die, your score is simply the gold in your purse. If you escape with the Amulet, the value of everything you carry is added too.',
        'Picking up gold is worth the effort on every level. Leprechauns steal it, so kill them first. Using any cheat disqualifies you from the high-score list.'
      ] },
    { id: 'amulet', title: 'The Amulet',
      tiers: [
        'The Amulet is at the bottom, around level 26.',
        'Picking it up makes the way back up very dangerous: the dungeon has changed.',
        'You must climb all the way up using < on each level. Many scrolls of teleportation and magic mapping help. Save food and healing for the return trip.'
      ] },
    { id: 'walk', title: 'First-person view',
      tiers: [
        'The First-person button above the game switches to a first-person view. Your keys and taps drive it.',
        'Up and Down arrows step forward and back. Left and Right turn 45 degrees (turning costs no game turn). Hold Alt with Left or Right to sidestep, and Shift with Up to run. Drag the view to look around; it snaps to the nearest of the 8 directions when you let go.',
        'Tap a square to walk there: your character follows the shortest known path and stops if a monster appears, you get hurt, or a message needs you. Tap a monster to walk up to it, and tap it again when it is next to you to attack. Tap the stairs (%) while standing on them to go down. Any key press cancels the walk. On a phone the d-pad becomes turn, forward, back and sidestep buttons.'
      ] },
    { id: 'saving', title: 'Saving and quitting',
      tiers: [
        'Rogue has no permadeath-free mode, but you can save.',
        'Press S to save and leave. Next time you open this page, the game resumes automatically.',
        'Dying ends the game and starts a new one on the next visit. The browser keeps your save and score list in its own storage (IndexedDB), so clearing site data erases them.'
      ] }
  ];

  return {
    MONSTERS: MONSTERS, SYMBOLS: SYMBOLS, STATUS: STATUS, KINDS: KINDS, ARMOR: ARMOR, WEAPONS: WEAPONS,
    ITEM_NOTES: ITEM_NOTES, COMMANDS: COMMANDS, HINTS: HINTS
  };
})();
