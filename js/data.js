/* Timeline Brawl v3 — data: unit roles, formations, warrior cultures, terrain constants. */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});

  // Formations. ranks: depth in ranks (0 = square-ish block); sp: spacing multiplier.
  // front/flank: melee defence multipliers on the front / flanks+rear; rdef: missile damage taken;
  // brace: can brace vs charges (front only, or 'all' round); turn: wheel speed multiplier.
  HB.FORMS = {
    line:       { name: 'Line',        icon: '▬', ranks: 4, sp: 1,   spd: 1,    front: 1,   flank: 1,   rdef: 1,    atk: 1,   chg: 1,   brace: 'stand', turn: 1,   tip: 'Balanced. Spears brace when standing still.' },
    phalanx:    { name: 'Phalanx',     icon: '▦', ranks: 6, sp: 0.9, spd: 0.55, front: 1.8, flank: 0.65, rdef: 1.1, atk: 1.15, chg: 0.6, brace: 'front', turn: 0.35, tip: 'Wall of points: unbreakable from the front, helpless on the flanks.' },
    square:     { name: 'Square',      icon: '◻', ranks: 0, sp: 1,   spd: 0.25, front: 1.3, flank: 1.3, rdef: 1.4,  atk: 0.8, chg: 0.3, brace: 'all',   turn: 2,   tip: 'Schiltron / pike square: braced all round, an easy target for archers.' },
    testudo:    { name: 'Testudo',     icon: '▣', ranks: 0, sp: 0.8, spd: 0.4,  front: 1.3, flank: 1,   rdef: 0.12, atk: 0.7, chg: 0.4, brace: 0,       turn: 0.6, tip: 'The tortoise: shrugs off arrows and slings, slow and clumsy in melee.' },
    shieldwall: { name: 'Shield wall', icon: '▤', ranks: 3, sp: 0.85, spd: 0.5, front: 1.6, flank: 0.8, rdef: 0.4,  atk: 0.9, chg: 0.5, brace: 'front', turn: 0.6, tip: 'Locked shields: strong front, resists missiles, slow.' },
    wedge:      { name: 'Wedge',       icon: '▲', ranks: 0, sp: 1,   spd: 1.05, front: 0.85, flank: 0.85, rdef: 1.1, atk: 1.1, chg: 1.6, brace: 0,     turn: 0.9, tip: 'Spearhead: smashes into a line, but loose once stopped.' },
    loose:      { name: 'Loose',       icon: '⁘', ranks: 3, sp: 1.9, spd: 1.15, front: 0.7, flank: 0.8, rdef: 0.45, atk: 0.8, chg: 0.8, brace: 0,       turn: 1.6, tip: 'Open order: missiles mostly miss, weak in melee.' },
    horns:      { name: 'Buffalo horns', icon: '◡', ranks: 3, sp: 1, spd: 1.1,  front: 0.9, flank: 0.8, rdef: 1,    atk: 1,   chg: 1.1, brace: 0,       turn: 1,   tip: 'The horns wrap the enemy: frontal fights count as flank attacks.' },
    column:     { name: 'Column',      icon: '▮', ranks: 0, sp: 1,   spd: 1.35, front: 0.6, flank: 0.6, rdef: 1.2,  atk: 0.8, chg: 0.8, brace: 0,       turn: 1.4, tip: 'March fast, fight badly.' },
  };

  // Unit roles. Per man: atk/def melee, chg charge punch, brace vs charges, spd world units/s, mor morale.
  // Missiles: rng range, rdm damage per man per volley, rof seconds, ammo volleys. siege: splash vs dense blocks.
  const T = {
    legion:   { cls: 'inf', role: 'Heavy infantry', men: 80, sp: 3, cost: 130, atk: 1.25, def: 1.25, chg: 1.1, brace: 0, spd: 13, mor: 75, heavy: 1.2, pilum: 1, forms: ['line', 'testudo', 'wedge', 'column'], icon: '⚔' },
    hoplite:  { cls: 'inf', role: 'Spear wall',     men: 80, sp: 3, cost: 120, atk: 1.1,  def: 1.35, chg: 1,   brace: 2, spd: 12, mor: 78, heavy: 1.3, forms: ['shieldwall', 'phalanx', 'line', 'column'], icon: '⛉' },
    pike:     { cls: 'inf', role: 'Pike block',     men: 96, sp: 2.6, cost: 100, atk: 1.2, def: 1.15, chg: 0.7, brace: 3, spd: 10.5, mor: 70, heavy: 1.2, forms: ['phalanx', 'square', 'line', 'column'], icon: '⇞' },
    spear:    { cls: 'inf', role: 'Spearmen',       men: 80, sp: 3, cost: 80,  atk: 0.9,  def: 1,    chg: 0.9, brace: 2, spd: 13, mor: 60, heavy: 1,   forms: ['line', 'shieldwall', 'square', 'column'], icon: '↑' },
    axe:      { cls: 'inf', role: 'Shield-wall axes', men: 72, sp: 3, cost: 120, atk: 1.35, def: 1.2, chg: 1.1, brace: 1, spd: 12.5, mor: 76, heavy: 1.2, forms: ['shieldwall', 'line', 'wedge', 'column'], icon: '🪓' },
    warband:  { cls: 'inf', role: 'Shock warband',  men: 90, sp: 3, cost: 85,  atk: 1.15, def: 0.8,  chg: 1.6, brace: 0, spd: 17, mor: 62, heavy: 0.9, forms: ['wedge', 'line', 'loose'], icon: '✶' },
    elite:    { cls: 'inf', role: 'Elite warriors', men: 60, sp: 3, cost: 135, atk: 1.6,  def: 1.25, chg: 1.3, brace: 0, spd: 14, mor: 85, heavy: 1,   forms: ['line', 'wedge', 'loose', 'column'], icon: '✪' },
    impi:     { cls: 'inf', role: 'Fast spear impi', men: 90, sp: 3, cost: 95, atk: 1.05, def: 0.85, chg: 1.3, brace: 1, spd: 20, mor: 70, heavy: 0.7, pilum: 0.6, forms: ['horns', 'line', 'loose', 'column'], icon: '◈' },
    archer:   { cls: 'msl', role: 'Archers',        men: 60, sp: 3, cost: 75,  atk: 0.5,  def: 0.55, chg: 0.4, brace: 0, spd: 14, mor: 52, heavy: 0.8, rng: 150, rdm: 0.055, rof: 2.2, ammo: 32, kind: 'arrow', forms: ['loose', 'line'], icon: '➶' },
    slinger:  { cls: 'msl', role: 'Slingers',       men: 60, sp: 3, cost: 60,  atk: 0.45, def: 0.5,  chg: 0.4, brace: 0, spd: 16, mor: 50, heavy: 0.7, rng: 115, rdm: 0.05, rof: 2.0, ammo: 36, kind: 'stone', vsEle: 1.6, forms: ['loose', 'line'], icon: '•' },
    javelin:  { cls: 'msl', role: 'Javelin skirmishers', men: 50, sp: 3, cost: 60, atk: 0.65, def: 0.6, chg: 0.6, brace: 0, spd: 18, mor: 55, heavy: 0.7, rng: 75, rdm: 0.1, rof: 2.8, ammo: 14, kind: 'javelin', vsEle: 3, skirm: 1, forms: ['loose', 'line'], icon: '⟋' },
    heavycav: { cls: 'cav', role: 'Shock cavalry',  men: 40, sp: 4.2, cost: 160, atk: 1.3, def: 1.15, chg: 3.2, brace: 0, spd: 34, mor: 78, heavy: 1.1, forms: ['wedge', 'line', 'column'], icon: '♞' },
    lightcav: { cls: 'cav', role: 'Light cavalry',  men: 40, sp: 4.2, cost: 85,  atk: 0.9, def: 0.75, chg: 1.8, brace: 0, spd: 42, mor: 60, heavy: 0.7, pilum: 0.8, skirm: 1, forms: ['loose', 'wedge', 'line'], icon: '♘' },
    horsearcher: { cls: 'cav', role: 'Horse archers', men: 40, sp: 4.2, cost: 110, atk: 0.75, def: 0.75, chg: 1.2, brace: 0, spd: 40, mor: 66, heavy: 0.7, rng: 120, rdm: 0.05, rof: 2.2, ammo: 26, kind: 'arrow', shoot360: 1, skirm: 1, forms: ['loose', 'line', 'wedge'], icon: '🏹' },
    chariot:  { cls: 'cav', role: 'Chariots',       men: 20, sp: 6, cost: 110, atk: 1.3, def: 0.9, chg: 3.6, brace: 0, spd: 46, mor: 62, heavy: 0.8, chariot: 1, forms: ['line', 'wedge'], icon: '☸' },
    elephant: { cls: 'ele', role: 'War elephants',  men: 8, sp: 9, cost: 165, mass: 4, atk: 7, def: 2, chg: 9, brace: 0, spd: 17, mor: 60, heavy: 1, forms: ['line', 'loose'], icon: '🐘' },
    catapult: { cls: 'sie', role: 'Onager / catapult', men: 4, sp: 9, cost: 110, atk: 0.2, def: 0.4, chg: 0, brace: 0, spd: 7, mor: 50, heavy: 1, rng: 270, minr: 60, rdm: 2.4, rof: 6, ammo: 30, kind: 'rock', splash: 1, wall: 1.5, forms: ['line'], icon: '☄' },
    ballista: { cls: 'sie', role: 'Ballista',       men: 4, sp: 9, cost: 90, atk: 0.2, def: 0.4, chg: 0, brace: 0, spd: 8, mor: 50, heavy: 1, rng: 230, minr: 40, rdm: 1.6, rof: 4, ammo: 34, kind: 'bolt', vsEle: 2, forms: ['line'], icon: '➹' },
    // siege engines (added to an attacking army's siege train automatically)
    ram:      { cls: 'sie', role: 'Battering ram', men: 12, sp: 4, cost: 60, atk: 0.3, def: 2.2, chg: 0, brace: 0, spd: 16, mor: 70, heavy: 1, mass: 3, ram: 1, forms: ['line'], icon: '⊩' },
    stower:   { cls: 'sie', role: 'Siege tower', men: 20, sp: 4, cost: 70, atk: 0.3, def: 2.5, chg: 0, brace: 0, spd: 10, mor: 70, heavy: 1, mass: 3, tower: 1, forms: ['line'], icon: '♜' },
    trebuchet:{ cls: 'sie', role: 'Trebuchet', men: 6, sp: 9, cost: 120, atk: 0.2, def: 0.4, chg: 0, brace: 0, spd: 5, mor: 50, heavy: 1, rng: 330, minr: 90, rdm: 2.2, rof: 7, ammo: 40, kind: 'rock', splash: 1, wall: 2.2, forms: ['line'], icon: '☄' },
    // Gods' Wrath monsters (not draftable)
    titan:    { cls: 'mon', role: 'Titan', men: 1, sp: 30, cost: 0, atk: 0, def: 1, chg: 0, brace: 0, spd: 16, mor: 999, heavy: 0, hp: 1000, forms: ['line'], icon: '🗿', hidden: 1 },
    dragon:   { cls: 'mon', role: 'Dragon', men: 1, sp: 30, cost: 0, atk: 0, def: 1, chg: 0, brace: 0, spd: 22, mor: 999, heavy: 0, hp: 850, forms: ['line'], icon: '🐉', hidden: 1 },
  };
  for (const k in T) T[k].id = k;
  HB.TYPES = T;

  // Mythic abilities: driven by FAITH (per-army meter filled by kills, charges, holding hills).
  HB.LORE = {
    mars:       { name: 'BLESSING OF MARS',  cost: 35, cd: 40, desc: 'The war god answers: +40% attack, full cohesion and +25 morale for 9s.', counter: 'Hit them in the flank first: cohesion breaks again.' },
    thermopylae:{ name: 'THERMOPYLAE STAND', cost: 40, cd: 55, desc: 'The hoplites cannot rout and fight with double defence to the front for 14s.', counter: 'Go around: it only holds the front.' },
    alexander:  { name: "ALEXANDER'S CHARGE", cost: 35, cd: 45, desc: 'The king leads: next charge hits twice as hard, nearby allies +15 morale.', counter: 'Braced pikes still stop it cold.' },
    hannibal:   { name: "HANNIBAL'S GAMBIT", cost: 40, cd: 50, desc: 'Elephants ignore panic for 15s and terrify foes nearby (-15 morale).', counter: 'Skirmishers and javelins still bleed them.' },
    druidfog:   { name: 'DRUID FOG',          cost: 35, cd: 50, desc: 'A magic fog rolls in: enemy missiles in it hit 30% as often, Celts inside are hidden, 16s.', counter: 'Fog does nothing in melee.' },
    berserk:    { name: 'BERSERKER RAGE',     cost: 30, cd: 40, desc: 'Berserkers double their attack and cannot rout for 10s, but their defence drops.', counter: 'Spears and archers punish the bare chests.' },
    tengri:     { name: 'ETERNAL BLUE SKY',   cost: 35, cd: 45, desc: 'Tengri rides with the horde: horse archers shoot twice as fast and move 30% faster for 10s.', counter: 'Catch them against terrain: cavalry hates forests.' },
    kamikaze:   { name: 'KAMI WIND',          cost: 45, cd: 60, desc: 'The divine wind howls across the field: enemy missiles fail and enemy formations in its path lose cohesion.', counter: 'Steady, deep formations recover fast.' },
    fifthsun:   { name: 'BLESSING OF THE FIFTH SUN', cost: 35, cd: 45, desc: 'Huitzilopochtli is fed: all Aztec regiments +25 morale, jaguar and eagle warriors +50% attack for 10s.', counter: 'Shoot them before they close.' },
    shaka:      { name: 'USUTHU! (SHAKA)',    cost: 30, cd: 40, desc: "Shaka's war cry: impis run 40% faster, shake off fatigue, enemies nearby lose 10 morale.", counter: 'Braced spears and pikes in a square.' },
  };
  HB.CURSE = { name: 'CURSE', cost: 40, cd: 45, desc: 'A priest curses one enemy regiment: disordered, -30% attack and -15 morale for 10s.', counter: 'Regiments above 80 morale shrug off half of it.' };

  // Warrior cultures: roster entries reference a role and may rename/retune it.
  HB.FACTIONS = [
    { id: 'rome', name: 'Rome', color: '#c8342c', emblem: '🦅', blurb: 'Legions in testudo, skirmishers, onagers.', roster: [
      { t: 'legion', name: 'Legionaries', lore: 'mars' }, { t: 'javelin', name: 'Velites' }, { t: 'archer', name: 'Auxilia archers' }, { t: 'heavycav', name: 'Equites', m: { atk: 0.9, chg: 0.85, mor: 0.9 }, cost: 130 }, { t: 'catapult', name: 'Onager' }, { t: 'ballista', name: 'Scorpio' } ] },
    { id: 'sparta', name: 'Sparta', color: '#b0262f', emblem: 'Λ', blurb: 'The best hoplites ever. Few horses.', roster: [
      { t: 'hoplite', name: 'Spartiates', lore: 'thermopylae', m: { atk: 1.15, def: 1.1, mor: 1.15 }, cost: 145 }, { t: 'hoplite', name: 'Perioikoi hoplites' }, { t: 'javelin', name: 'Peltasts' }, { t: 'archer', name: 'Cretan archers', m: { rdm: 1.15 } }, { t: 'lightcav', name: 'Thessalian riders' } ] },
    { id: 'macedon', name: 'Macedon', color: '#d98a1c', emblem: '☀', blurb: 'Hammer and anvil: pike phalanx + Companions.', roster: [
      { t: 'pike', name: 'Phalangites' }, { t: 'hoplite', name: 'Hypaspists', m: { atk: 1.1 } }, { t: 'heavycav', name: 'Companions', lore: 'alexander' }, { t: 'javelin', name: 'Agrianians' }, { t: 'archer', name: 'Cretan archers' }, { t: 'ballista', name: 'Oxybeles' } ] },
    { id: 'carthage', name: 'Carthage', color: '#7a3db8', emblem: '☾', blurb: 'Elephants, Numidian riders, Balearic slings.', roster: [
      { t: 'elephant', name: 'War elephants', lore: 'hannibal' }, { t: 'spear', name: 'Libyan spearmen', m: { def: 1.1, mor: 1.1 }, cost: 90 }, { t: 'lightcav', name: 'Numidian cavalry' }, { t: 'slinger', name: 'Balearic slingers', m: { rdm: 1.2 } }, { t: 'warband', name: 'Gallic mercenaries' }, { t: 'heavycav', name: 'Iberian horse', m: { chg: 0.85 }, cost: 140 } ] },
    { id: 'celts', name: 'Celts', color: '#2f9a55', emblem: '☘', blurb: 'Wild warbands, chariots, druids.', roster: [
      { t: 'warband', name: 'Gaesatae warband' }, { t: 'warband', name: 'Druid-blessed band', lore: 'druidfog', m: { mor: 1.1 }, cost: 95 }, { t: 'chariot', name: 'War chariots' }, { t: 'javelin', name: 'Javelin youths' }, { t: 'slinger', name: 'Slingers' }, { t: 'lightcav', name: 'Gallic horse' } ] },
    { id: 'vikings', name: 'Vikings', color: '#3b6fc4', emblem: 'ᚱ', blurb: 'Shield walls and berserkers.', roster: [
      { t: 'axe', name: 'Huscarls' }, { t: 'warband', name: 'Berserkers', lore: 'berserk', m: { atk: 1.25, def: 0.85, mor: 1.2 }, cost: 105 }, { t: 'spear', name: 'Bondi levy' }, { t: 'archer', name: 'Bowmen', m: { rdm: 0.9 } } ] },
    { id: 'mongols', name: 'Mongols', color: '#2b8fa8', emblem: '᠊', blurb: 'Horse archers, feigned retreats, lancers.', roster: [
      { t: 'horsearcher', name: 'Horse archers', lore: 'tengri' }, { t: 'heavycav', name: 'Keshig lancers' }, { t: 'lightcav', name: 'Scouts' }, { t: 'spear', name: 'Conscript infantry', m: { mor: 0.85 }, cost: 65 }, { t: 'catapult', name: 'Trebuchet', m: { rng: 1.1 } } ] },
    { id: 'samurai', name: 'Samurai', color: '#d1473a', emblem: '⛩', blurb: 'Bushido, yari walls and the kami wind.', roster: [
      { t: 'elite', name: 'Samurai', lore: 'kamikaze' }, { t: 'spear', name: 'Ashigaru yari', m: { brace: 1.25 } }, { t: 'archer', name: 'Yumi archers', m: { rdm: 1.1 } }, { t: 'heavycav', name: 'Mounted samurai', m: { atk: 1.1 } }, { t: 'horsearcher', name: 'Mounted archers', m: { mor: 1.1 } } ] },
    { id: 'aztec', name: 'Aztec', color: '#c9a227', emblem: '☼', blurb: 'Jaguar and eagle warriors. No horses at all.', roster: [
      { t: 'elite', name: 'Jaguar warriors', lore: 'fifthsun' }, { t: 'elite', name: 'Eagle warriors', m: { atk: 0.95, def: 1.05 } }, { t: 'warband', name: 'Militia', m: { mor: 0.9 }, cost: 70 }, { t: 'archer', name: 'Archers' }, { t: 'slinger', name: 'Slingers' }, { t: 'javelin', name: 'Atlatl throwers', m: { rng: 1.3 } } ] },
    { id: 'zulu', name: 'Zulu', color: '#8b5a2b', emblem: '◈', blurb: "Shaka's impis: speed and the buffalo horns.", roster: [
      { t: 'impi', name: 'Young impi (horns)', lore: 'shaka' }, { t: 'impi', name: 'Veteran impi (chest)', m: { atk: 1.15, def: 1.15, mor: 1.15 }, cost: 120 }, { t: 'javelin', name: 'Throwing-spear boys' }, { t: 'spear', name: 'Reserve (loins)', m: { brace: 0.5 } } ] },
  ];
  // every culture can build a siege train (only used when assaulting a walled city)
  HB.SIEGE_TRAIN = ['ram', 'stower', 'trebuchet'];
  for (const f of HB.FACTIONS) { f.siege0 = f.roster.length; f.roster.push({ t: 'ram', name: 'Battering ram', siege: 1 }, { t: 'stower', name: 'Siege tower', siege: 1 }, { t: 'trebuchet', name: 'Trebuchet', siege: 1 }); }
  // the Horde's tribute recruits: never drafted or bought, only raised by the Blood Tribute (name from HB.CONFIG.recruits)
  { const F = HB.FACTIONS.find(f => f.id === 'mongols'); F.oath0 = F.roster.length; F.roster.push({ t: 'legion', name: (HB.CONFIG && HB.CONFIG.recruits) || 'Oathbound', tribute: 1, art: 'oathbound', m: { mor: 0.95 } }); }
  HB.FACTION = {}; for (const f of HB.FACTIONS) HB.FACTION[f.id] = f;
  HB.SIDE_COLORS = ['#e0453a', '#3f7fe0', '#e8b22e', '#2fae6a', '#efe2c0'];
  HB.SIDE_NAMES = ['Red', 'Blue', 'Gold', 'Green'];
})(typeof window !== 'undefined' ? window : globalThis);
