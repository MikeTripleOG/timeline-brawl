/* Timeline Brawl — unit data. Pure data, no DOM. */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});
  // damage types
  const M = 0, A = 1, B = 2, S = 3, F = 4, MI = 5, C = 6;
  HB.DMG = { MELEE: M, ARROW: A, BULLET: B, SHELL: S, FIRE: F, MISSILE: MI, CRUSH: C };
  HB.ERAS = [
    { name: 'Ancient', color: '#e8b04a' },
    { name: 'Medieval', color: '#b48cff' },
    { name: 'Gunpowder', color: '#ff8a4a' },
    { name: 'World Wars', color: '#9fd36b' },
    { name: 'Modern', color: '#5fd0ff' },
    { name: 'Future', color: '#ff5fd2' },
  ];
  HB.AGE_NAMES = ['BRONZE AGE', 'MIDDLE AGES', 'GUNPOWDER AGE', 'DIESEL AGE', 'JET AGE', 'SPACE AGE'];
  const HEAVY = { melee: 0.012, arrow: 0, bullet: 0.02, shell: 0.35, fire: 0.25, missile: 1, crush: 0 };
  const MEDIUM = { melee: 0.03, arrow: 0.005, bullet: 0.05, shell: 0.6, fire: 0.45, missile: 1.2, crush: 0 };
  const AIR = { melee: 0.05, arrow: 0.03, bullet: 0.12, shell: 0.4, fire: 0.4, missile: 1, crush: 0 };

  // role: Infantry | Ranged | Cavalry | Vehicle | Siege | Air
  // m = melee damage (0 = none), mrof = melee seconds/attack
  // w1/w2 = ranged weapons {r range, d dmg, rof sec, t type, sp splash, acc, ammo (0=inf), air canHitAir, heavy (only fires at vehicles/air/siege)}
  // fuel = seconds of movement (vehicles) / flight (air); 0 = unlimited
  HB.UNITS = [
    // ---------------- ANCIENT ----------------
    { id: 'spartan', name: 'Spartan Hoplites', short: 'Spartans', era: 0, role: 'Infantry', cost: 3, pack: 50, hp: 14, spd: 13, rad: 1.9,
      m: 5, mrof: 1, bonus: { mounted: 2.5 }, armor: { arrow: 0.45, bullet: 0.8, melee: 0.7 }, tags: ['inf', 'spear', 'disc'],
      lore: { id: 'thermopylae', name: 'THERMOPYLAE HOLD', cd: 25, desc: 'When badly outnumbered the phalanx locks shields: immovable, takes 75% less melee, arrow and bullet damage for 7s.', counter: 'Explosives, fire and missiles ignore the shield wall.' } },
    { id: 'legion', name: 'Roman Legionaries (testudo)', short: 'Legionaries', era: 0, role: 'Infantry', cost: 2, pack: 100, hp: 10, spd: 11, rad: 1.6,
      m: 4, mrof: 1, armor: { arrow: 0.2, bullet: 0.33, melee: 0.8, shell: 1.3 }, tags: ['inf', 'disc', 'testudo'],
      lore: { id: 'mars', name: 'BLESSING OF MARS', cd: 30, desc: 'The god of war answers: heals 25% and +60% damage for 6s. Passive testudo blocks most arrows and bullets.', counter: 'An eclipse is a bad omen (blocked); Black Death blocks the healing; packed testudo takes extra shell damage.' } },
    { id: 'immortal', name: 'Persian Immortals', short: 'Immortals', era: 0, role: 'Ranged', cost: 3, pack: 50, hp: 9, spd: 13, rad: 1.7,
      m: 3, mrof: 1, w1: { r: 120, d: 4, rof: 1.6, t: A, acc: 0.55, air: true }, tags: ['inf'],
      lore: { id: 'immortal', name: 'THE TEN THOUSAND', cd: 30, desc: 'For 8s, each fallen Immortal has a 60% chance to be instantly replaced from the rear, keeping the legend of an army that never shrinks.', counter: 'Fire and explosive deaths are not replaced; Black Death blocks it.' } },
    { id: 'chariot', name: 'Egyptian Chariots', short: 'Chariots', era: 0, role: 'Cavalry', cost: 5, pack: 40, hp: 18, spd: 30, rad: 2.6,
      m: 6, mrof: 1, w1: { r: 85, d: 3, rof: 2, t: A, acc: 0.4, air: true }, tags: ['mounted'],
      lore: { id: 'ra', name: 'CHARIOT OF RA', cd: 20, desc: 'The sun god drives the charge: double speed and triple trample damage for 4s.', counter: 'Spears and pikes blunt the charge; useless at night or in an eclipse.' } },
    { id: 'archimedes', name: "Archimedes' Mirrors", short: 'Mirrors', era: 0, role: 'Siege', cost: 150, pack: 2, hp: 60, spd: 6, rad: 3.5,
      m: 0, w1: { r: 170, d: 22, rof: 3, t: A, acc: 0.6, air: true }, armor: { fire: 1.5, shell: 1.5 }, tags: ['siege'],
      lore: { id: 'deathray', name: "ARCHIMEDES' DEATH RAY", cd: 18, desc: 'Polished bronze focuses the sun on the biggest enemy vehicle, aircraft or siege engine within 320: it burns for 6s (about 30% of its HP).', counter: 'Daytime only: night, storms, sandstorms and eclipses shut it down.' } },
    { id: 'trojan', name: 'Trojan Horse', short: 'Trojan Horse', era: 0, role: 'Siege', cost: 400, pack: 1, hp: 260, spd: 8, rad: 6,
      m: 0, armor: { fire: 2, shell: 1.4, arrow: 0.3, bullet: 0.5 }, tags: ['siege'],
      lore: { id: 'trojan', name: 'THE TROJAN HORSE', cd: 999, desc: 'Once per battle the "gift" appears behind enemy lines and, 2.5s later, 30 Greek hoplites pour out.', counter: 'Burn or blow it up before it opens and the hidden troops die inside.' } },

    // ---------------- MEDIEVAL ----------------
    { id: 'berserker', name: 'Viking Berserkers', short: 'Berserkers', era: 1, role: 'Infantry', cost: 5, pack: 40, hp: 16, spd: 16, rad: 1.9,
      m: 7, mrof: 0.8, tags: ['inf', 'fearless'],
      lore: { id: 'berserk', name: 'BERSERKERGANG', cd: 22, desc: 'They feel no pain: for 5s they keep fighting at 0 HP with +50% damage, and only fall when the rage ends.', counter: 'Fire, shells and missiles still kill them outright; shoot them before they reach you.' } },
    { id: 'longbow', name: 'English Longbowmen', short: 'Longbowmen', era: 1, role: 'Ranged', cost: 4, pack: 50, hp: 9, spd: 12, rad: 1.7,
      m: 2.5, mrof: 1, w1: { r: 150, d: 5, rof: 2.2, t: A, acc: 0.5, air: true }, bonus: { mounted: 1.6 }, tags: ['inf'],
      lore: { id: 'agincourt', name: 'AGINCOURT VOLLEY', cd: 20, desc: 'Arrows blot out the sun: every archer instantly looses 3 double-damage arrows. Murderous against cavalry.', counter: 'Rain or storms mean wet bowstrings (blocked); shields, testudo and armour shrug it off.' } },
    { id: 'knight', name: 'Knights Templar', short: 'Knights', era: 1, role: 'Cavalry', cost: 15, pack: 20, hp: 40, spd: 26, rad: 2.6,
      m: 12, mrof: 1, bonus: { inf: 1.3 }, armor: { melee: 0.6, arrow: 0.4, bullet: 0.9 }, tags: ['mounted', 'disc'],
      lore: { id: 'grail', name: 'THE HOLY GRAIL', cd: 35, desc: 'The Grail heals every surviving knight to full and makes them untouchable for 2.5s.', counter: 'It cannot raise the dead, and Black Death blocks all healing. Pikes still impale them.' } },
    { id: 'mongol', name: 'Mongol Horse Archers', short: 'Horse Archers', era: 1, role: 'Cavalry', cost: 6, pack: 40, hp: 14, spd: 34, rad: 2.3,
      m: 4, mrof: 1, w1: { r: 125, d: 4.5, rof: 1.1, t: A, acc: 0.55, air: true }, tags: ['mounted', 'kite'],
      lore: { id: 'feigned', name: 'FEIGNED RETREAT', cd: 20, desc: 'They flee... then wheel around: for 4s double damage, and undisciplined pursuers are disordered (take +60% damage).', counter: 'Disciplined troops (phalanx, legion, pikes, knights, machine guns, modern units) do not take the bait; longbows outrange them.' } },
    { id: 'greekfire', name: 'Byzantine Greek Fire', short: 'Greek Fire', era: 1, role: 'Siege', cost: 80, pack: 4, hp: 40, spd: 9, rad: 3,
      m: 0, w1: { r: 55, d: 6, rof: 0.5, t: F, sp: 7, acc: 0.9 }, armor: { fire: 0.3 }, tags: ['siege'],
      lore: { id: 'greekfire', name: 'GREEK FIRE', cd: 15, desc: 'The secret liquid fire: a 30-wide pool that burns everything in it for 6s and cannot be put out by water... supposedly.', counter: 'Rain, storms and the divine wind douse it; very short range.' } },
    { id: 'samurai', name: 'Samurai', short: 'Samurai', era: 1, role: 'Infantry', cost: 8, pack: 30, hp: 22, spd: 15, rad: 1.9,
      m: 9, mrof: 0.9, w1: { r: 100, d: 4, rof: 2, t: A, acc: 0.5, air: true }, armor: { melee: 0.8, arrow: 0.7 }, tags: ['inf', 'fearless', 'disc'],
      lore: { id: 'kamikaze', name: 'KAMIKAZE — DIVINE WIND', cd: 999, desc: 'Once per battle a typhoon scatters every enemy aircraft (8s grounded and out of fuel) and hurls nearby enemies back.', counter: 'One use only; does nothing to tanks and other ground armour.' } },

    // ---------------- GUNPOWDER ----------------
    { id: 'pikemen', name: 'Swiss Pikemen', short: 'Pikemen', era: 2, role: 'Infantry', cost: 4, pack: 50, hp: 13, spd: 12, rad: 1.8,
      m: 4, mrof: 1, bonus: { mounted: 3 }, armor: { melee: 0.8 }, tags: ['inf', 'spear', 'disc'],
      lore: { id: 'tell', name: "WILLIAM TELL'S SHOT", cd: 30, desc: 'The legendary crossbowman fires one perfect bolt at the most valuable enemy within 250: 35% of its max HP, ignoring armour.', counter: 'Range 250: tanks and helicopters that stay back are safe.' } },
    { id: 'musketeer', name: 'Musketeers', short: 'Musketeers', era: 2, role: 'Ranged', cost: 6, pack: 40, hp: 10, spd: 12, rad: 1.8,
      m: 3, mrof: 1, w1: { r: 95, d: 9, rof: 3, t: B, acc: 0.45, ammo: 40, air: true }, tags: ['inf'],
      lore: { id: 'joan', name: "JOAN OF ARC'S BANNER", cd: 30, desc: 'A vision of the Maid: for 8s all allies within 160 cannot break, deal +25% and take -20% damage.', counter: 'The banner falls if the musketeers drop below 25%.' } },
    { id: 'hussar', name: 'Winged Hussars', short: 'Hussars', era: 2, role: 'Cavalry', cost: 14, pack: 20, hp: 30, spd: 32, rad: 2.6,
      m: 11, mrof: 1, w1: { r: 40, d: 6, rof: 4, t: B, acc: 0.5, ammo: 4 }, armor: { melee: 0.75, arrow: 0.6 }, tags: ['mounted'],
      lore: { id: 'wings', name: 'WINGS OF VIENNA', cd: 25, desc: 'The terrifying roar of the wings: a 3s charge at x2.5 damage, and nearby undisciplined enemies flee in panic.', counter: 'Pikes and spears stop the charge; disciplined troops and machines are not scared.' } },
    { id: 'cannon', name: 'Cannon Battery', short: 'Cannons', era: 2, role: 'Siege', cost: 120, pack: 3, hp: 50, spd: 5, rad: 3.5,
      m: 0, w1: { r: 220, d: 40, rof: 5, t: S, sp: 12, acc: 0.7, ammo: 60 }, armor: { shell: 1.2 }, tags: ['siege'],
      lore: { id: 'barbara', name: "SAINT BARBARA'S FIRE", cd: 25, desc: "The patron saint of gunners blesses the next 3 shots: they never miss and have triple blast radius.", counter: 'Slow reload; fast cavalry that reaches the guns overruns them.' } },
    { id: 'ninja', name: 'Ninja (Shinobi)', short: 'Ninja', era: 2, role: 'Infantry', cost: 15, pack: 15, hp: 14, spd: 22, rad: 1.7,
      m: 14, mrof: 0.7, w1: { r: 35, d: 4, rof: 1, t: A, acc: 0.7 }, tags: ['inf', 'stealth', 'fearless'],
      lore: { id: 'smoke', name: 'SMOKE BOMB VANISH', cd: 12, desc: 'Passive: invisible until they strike. Ability: vanish in smoke and blink 50 deeper into the enemy, untouchable for 3s.', counter: 'Modern radar and thermal units see them within 150; explosions still hit them.' } },

    // ---------------- WORLD WARS ----------------
    { id: 'tommy', name: 'British Tommies (WW1)', short: 'Tommies', era: 3, role: 'Infantry', cost: 12, pack: 25, hp: 12, spd: 13, rad: 1.8,
      m: 4, mrof: 1, w1: { r: 130, d: 10, rof: 1.4, t: B, acc: 0.45, ammo: 90, air: true }, tags: ['inf', 'disc'],
      lore: { id: 'angels', name: 'THE ANGELS OF MONS', cd: 35, desc: 'When the squad is half dead, ghostly bowmen of Agincourt appear behind them for 7s and cover the retreat with volleys.', counter: 'Ghost arrows barely scratch tanks or aircraft; it only lasts 7s.' } },
    { id: 'mgnest', name: 'Machine-Gun Trench (WW1)', short: 'MG Trench', era: 3, role: 'Ranged', cost: 400, pack: 2, hp: 240, spd: 0, rad: 4,
      m: 5, mrof: 1, w1: { r: 200, d: 9, rof: 0.07, t: B, acc: 0.3, ammo: 2500, air: true }, armor: { arrow: 0.06, bullet: 0.25, melee: 0.7, shell: 0.9 }, tags: ['siege', 'disc', 'ww'],
      lore: { id: 'deserters', name: "NO MAN'S LAND DESERTERS", cd: 30, desc: "The legendary wild deserters living under no man's land burst out among enemies crossing it: 15 feral fighters join your side.", counter: "Only works on enemies in the middle no man's land band; vehicles shrug them off." } },
    { id: 'sherman', name: 'Sherman Tank (WW2)', short: 'Sherman', era: 3, role: 'Vehicle', cost: 1500, pack: 1, hp: 700, spd: 20, rad: 6,
      m: 0, w1: { r: 220, d: 70, rof: 3, t: S, sp: 9, acc: 0.8, ammo: 90 }, w2: { r: 170, d: 8, rof: 0.1, t: B, acc: 0.35, ammo: 4000, air: true }, fuel: 160, armor: MEDIUM, tags: ['vehicle', 'tech', 'ww'],
      lore: { id: 'ghostarmy', name: 'THE GHOST ARMY', cd: 30, desc: '4 inflatable decoy tanks pop up around the Sherman for 12s and draw enemy fire.', counter: 'One hit pops a decoy; radar-equipped modern units see straight through them.' } },
    { id: 'p51', name: 'P-51 Mustang (WW2)', short: 'P-51', era: 3, role: 'Air', cost: 2500, pack: 1, hp: 320, spd: 110, rad: 5,
      m: 0, w1: { r: 110, d: 16, rof: 0.06, t: B, sp: 4, acc: 0.45, ammo: 1800, air: true }, fuel: 115, armor: AIR, tags: ['air', 'tech', 'ww'],
      lore: { id: 'foo', name: 'FOO FIGHTERS', cd: 25, desc: 'Mysterious glowing orbs swarm the plane for 6s and jam the targeting of every enemy with electronics within 260 (-75% accuracy).', counter: 'Ancient, medieval and gunpowder troops have no targeting electronics to jam.' } },

    // ---------------- MODERN ----------------
    { id: 'seal', name: 'Navy SEALs', short: 'SEALs', era: 4, role: 'Infantry', cost: 90, pack: 10, hp: 30, spd: 16, rad: 1.9,
      m: 8, mrof: 0.8, w1: { r: 160, d: 14, rof: 0.15, t: B, acc: 0.5, ammo: 160, air: true }, armor: { bullet: 0.6, arrow: 0.35, melee: 0.85 }, tags: ['inf', 'tech', 'radar', 'fearless', 'disc', 'kite'],
      lore: { id: 'phila', name: 'PHILADELPHIA EXPERIMENT', cd: 25, desc: 'When cornered in melee the squad vanishes and rematerialises 130 away on a flank, invisible for 4s.', counter: 'They reappear dazed and cannot fire for 1s; explosions still hit them.' } },
    { id: 'javelin', name: 'Javelin Missile Team', short: 'Javelins', era: 4, role: 'Ranged', cost: 500, pack: 2, hp: 25, spd: 12, rad: 2,
      m: 4, mrof: 1, w1: { r: 260, d: 500, rof: 4, t: MI, sp: 6, acc: 0.85, ammo: 4, heavy: true }, w2: { r: 120, d: 10, rof: 0.4, t: B, acc: 0.45, ammo: 200, air: true }, tags: ['inf', 'tech', 'radar', 'disc', 'kite'],
      lore: { id: 'roswell', name: 'ROSWELL LOCK-ON', cd: 30, desc: 'Reverse-engineered alien seekers: the next 2 missiles cannot miss and ignore jamming, cloaks and decoys.', counter: 'Only 4 missiles per team, and they are wasted on swarms.' } },
    { id: 'abrams', name: 'M1 Abrams Tank', short: 'Abrams', era: 4, role: 'Vehicle', cost: 10000, pack: 1, hp: 2600, spd: 20, rad: 7,
      m: 0, w1: { r: 260, d: 140, rof: 2.6, t: S, sp: 13.5, acc: 0.95, ammo: 41 }, w2: { r: 190, d: 8, rof: 0.07, t: B, acc: 0.5, ammo: 1500, air: true }, fuel: 150, armor: HEAVY, tags: ['vehicle', 'tech', 'radar', 'disc'],
      lore: { id: 'montauk', name: 'MONTAUK TIME-SLIP', cd: 40, en: 15, desc: 'The Montauk chair rewinds the tank 5 seconds: position and armour as they were, invulnerable for 1.5s while it re-phases.', counter: 'Spent shells and fuel stay spent; once dry it is just a steel box waiting to be swarmed. Dark energy (0 energy) blocks it.' } },
    { id: 'apache', name: 'AH-64 Apache', short: 'Apache', era: 4, role: 'Air', cost: 10000, pack: 1, hp: 2200, spd: 45, rad: 7,
      m: 0, w1: { r: 280, d: 120, rof: 1.2, t: MI, sp: 16, acc: 0.9, ammo: 50 }, w2: { r: 220, d: 14, rof: 0.1, t: S, sp: 3, acc: 0.6, ammo: 900, air: true }, fuel: 130, armor: AIR, tags: ['air', 'tech', 'radar'],
      lore: { id: 'ghostkyiv', name: 'GHOST OF KYIV', cd: 30, desc: 'A legendary ace takes the stick: for 6s rockets cost no ammo and incoming fire mostly misses.', counter: 'Burns fuel 3x faster, so it has to land sooner, and landed helicopters get swarmed.' } },

    { id: 'psychic', name: 'Stargate Psychic Soldiers', short: 'Psychics', era: 4, role: 'Infantry', cost: 60, pack: 10, hp: 18, spd: 14, rad: 1.8,
      m: 4, mrof: 1, w1: { r: 120, d: 8, rof: 0.8, t: B, acc: 0.6, ammo: 80, air: true }, armor: { bullet: 0.8 }, tags: ['inf', 'tech', 'radar', 'fearless'],
      lore: { id: 'stargate', name: 'PROJECT STARGATE', cd: 25, en: 15, desc: 'Remote viewers reveal every hidden, invisible and cloaked enemy on the map for 8s and pop decoys; enemies within 150 are mind-scrambled (disordered 3s).', counter: 'Faith units with high morale (70+) resist the scramble; ninjas re-cloak once it ends.' } },

    // ---------------- FUTURE ----------------
    { id: 'mech', name: 'Battle Mech Suit', short: 'Mech', era: 5, role: 'Vehicle', cost: 4000, pack: 1, hp: 1700, spd: 16, rad: 6,
      m: 30, mrof: 1.2, w1: { r: 200, d: 30, rof: 0.5, t: S, sp: 5, acc: 0.8, ammo: 220 }, fuel: 200, armor: HEAVY, tags: ['vehicle', 'tech', 'radar', 'disc'],
      lore: { id: 'tesla', name: 'TESLA DEATH BEAM', cd: 22, en: 25, desc: "Tesla's lost 'teleforce' beam: 2s of 300 dmg/s on the most valuable enemy within 420, day or night, and it drains 8 energy from the victim's side.", counter: 'Eats a quarter of your energy; at 0 energy it is dead weight. EMPs knock the mech back to a Sherman.' } },
    { id: 'drone', name: 'Drone Swarm', short: 'Drones', era: 5, role: 'Air', cost: 25, pack: 20, hp: 12, spd: 60, rad: 1.6,
      m: 0, w1: { r: 90, d: 6, rof: 0.6, t: B, acc: 0.5, ammo: 60, air: true }, fuel: 90, armor: { melee: 1, arrow: 0.8, bullet: 1, shell: 1, fire: 1, missile: 1, crush: 0 }, tags: ['air', 'tech'],
      lore: { id: 'haarp', name: 'HAARP WEATHER CONTROL', cd: 30, en: 20, desc: 'The swarm seeds the ionosphere: a 70-wide lightning storm rages over the enemy for 6s, striking anything not on your side.', counter: 'Hits allies and neutral armies too; troops that scatter out of the storm are safe. Only anti-air can touch the drones.' } },
    { id: 'plasma', name: 'Plasma Troopers', short: 'Plasma', era: 5, role: 'Infantry', cost: 40, pack: 20, hp: 26, spd: 15, rad: 1.9,
      m: 6, mrof: 0.9, w1: { r: 150, d: 16, rof: 0.6, t: F, sp: 3, acc: 0.65, en: 0.02, air: true }, armor: { bullet: 0.6, arrow: 0.3, melee: 0.8 }, tags: ['inf', 'tech', 'radar', 'disc'],
      lore: { id: 'glocke', name: 'DIE GLOCKE', cd: 28, en: 20, desc: 'The Nazi Bell spins up: every unit in a 55-wide bubble near the target freezes solid for 4s (vehicles 2s).', counter: 'Freezes your own and allied troops in the bubble too. Plasma guns run on energy: at 0 energy they fall silent.' } },
    { id: 'ufo', name: 'Roswell UFO Craft', short: 'UFO', era: 5, role: 'Air', cost: 6000, pack: 1, hp: 900, spd: 50, rad: 7,
      m: 0, w1: { r: 200, d: 40, rof: 0.8, t: S, sp: 6, acc: 0.85, en: 0.15, air: true }, fuel: 0, armor: AIR, shield: 600, tags: ['air', 'tech', 'radar'],
      lore: { id: 'antigrav', name: 'AREA 51 ANTIGRAVITY', cd: 24, en: 20, desc: 'Passive: hovers on a 600-point regenerating shield. Ability: lifts every enemy ground unit within 60 of the target into the air for 2.5s, then drops them (30% HP).', counter: 'Any EMP drops the shield and grounds it; a Dark Age EMP turns it into a weather balloon. Weapons run on energy.' } },
    { id: 'darkemp', name: 'Dark Age EMP (item)', short: 'Dark Age EMP', era: 5, role: 'Item', cost: 12000, pack: 1, hp: 400, spd: 0, rad: 5,
      m: 0, armor: MEDIUM, tags: ['siege', 'item'],
      lore: { id: 'darkemp', name: 'DARK AGE EMP', cd: 120, cd0: 22, en: 40, desc: 'The most expensive item in the game. A white flash, then every powered unit in a 200-wide blast, yours included, is knocked back 1-2 eras (Abrams → Sherman → Knight, Apache → Biplane, Plasma → Musketeers) and re-evolves one era at a time over ~60s.', counter: 'Hits your own tech too. Ancient units are immune, faith units only lose morale. Destroy the device before it charges.' } },
    { id: 'nuke', name: 'Tactical Nuke (item)', short: 'Tactical Nuke', era: 4, alsoEra: 5, role: 'Item', cost: 5000, pack: 1, hp: 300, spd: 0, rad: 5,
      m: 0, armor: MEDIUM, tags: ['siege', 'item'],
      lore: { id: 'nuke', name: 'TACTICAL NUKE', cd: 999, cd0: 28, en: 30, desc: 'One launch: after a 2.5s warning a nuclear blast levels everything within 80, friend or foe, and leaves fallout. Each nuke fills the Doomsday meter by 40.', counter: 'Kill the silo before launch, or spread out. Fill the Doomsday meter and THEY arrive, hitting the biggest nuker hardest.' } },

    // ---------------- hidden spawn-only units ----------------
    { id: 'hoplite', hidden: true, name: 'Greek Hoplites', short: 'Hoplites', era: 0, role: 'Infantry', cost: 3, pack: 30, hp: 14, spd: 14, rad: 1.9,
      m: 5, mrof: 1, bonus: { mounted: 2.5 }, armor: { arrow: 0.45, bullet: 0.8, melee: 0.7 }, tags: ['inf', 'spear', 'disc'] },
    { id: 'deserter', hidden: true, name: 'Wild Deserters', short: 'Deserters', era: 3, role: 'Infantry', cost: 4, pack: 15, hp: 12, spd: 16, rad: 1.8,
      m: 5, mrof: 0.8, tags: ['inf', 'fearless'] },
    { id: 'angel', hidden: true, name: 'Angels of Mons', short: 'Ghost Bowmen', era: 3, role: 'Ranged', cost: 0, pack: 20, hp: 1, spd: 0, rad: 1.7,
      m: 0, w1: { r: 160, d: 5, rof: 1, t: A, acc: 0.6, air: true }, armor: { arrow: 0, bullet: 0, melee: 0, shell: 0, fire: 0, missile: 0, crush: 0 }, tags: ['ghost'] },
    { id: 'biplane', hidden: true, name: 'Sopwith Biplane', short: 'Biplane', era: 3, role: 'Air', cost: 300, pack: 1, hp: 140, spd: 85, rad: 5,
      m: 0, w1: { r: 90, d: 6, rof: 0.15, t: B, sp: 2, acc: 0.4, ammo: 500, air: true }, fuel: 90, armor: AIR, tags: ['air', 'tech'] },
    { id: 'pigeon', hidden: true, name: 'Carrier Pigeons', short: 'Pigeons', era: 3, role: 'Air', cost: 1, pack: 20, hp: 3, spd: 30, rad: 1.2,
      m: 0, armor: AIR, tags: ['air'] },
    { id: 'balloon', hidden: true, name: 'Weather Balloon', short: 'Weather Balloon', era: 3, role: 'Air', cost: 10, pack: 1, hp: 60, spd: 8, rad: 5,
      m: 0, armor: AIR, tags: ['air'] },
    { id: 'mothership', hidden: true, name: 'Alien Mothership', short: 'Mothership', era: 5, role: 'Vehicle', cost: 20000, pack: 1, hp: 9000, spd: 9, rad: 15,
      m: 0, w1: { r: 210, d: 45, rof: 0.5, t: MI, sp: 10, acc: 0.9, air: true }, w2: { r: 170, d: 10, rof: 0.1, t: B, acc: 0.5, air: true },
      armor: { melee: 0.35, arrow: 0.25, bullet: 0.3, shell: 0.6, fire: 0.5, missile: 0.8, crush: 0 }, tags: ['alien', 'hover', 'fearless', 'siege'] },
    { id: 'aliendrone', hidden: true, name: 'Alien Drone', short: 'Alien Drone', era: 5, role: 'Infantry', cost: 30, pack: 10, hp: 30, spd: 36, rad: 2,
      m: 4, mrof: 1, w1: { r: 85, d: 5, rof: 0.5, t: B, acc: 0.6, air: true }, armor: { arrow: 0.6, bullet: 0.7 }, tags: ['alien', 'hover', 'fearless'] },
    { id: 'decoy', hidden: true, name: 'Inflatable Decoy', short: 'Decoy', era: 3, role: 'Vehicle', cost: 0, pack: 4, hp: 1, spd: 0, rad: 6,
      m: 0, tags: ['vehicle', 'decoy'] },
  ];
  const KEYS = ['melee', 'arrow', 'bullet', 'shell', 'fire', 'missile', 'crush'];
  HB.UNITS.forEach((u, i) => {
    u.idx = i;
    u.tagset = {};
    u.tags.forEach(t => (u.tagset[t] = 1));
    u.tagset[u.role.toLowerCase()] = 1;
    u.air = !!u.tagset.air;
    u.veh = !!(u.tagset.vehicle);
    u.mounted = !!u.tagset.mounted;
    u.radar = !!u.tagset.radar;
    u.tech = !!u.tagset.tech;
    u.armorArr = new Float32Array(7);
    KEYS.forEach((k, j) => (u.armorArr[j] = u.armor && u.armor[k] != null ? u.armor[k] : 1));
    u.canAir = !!((u.w1 && u.w1.air) || (u.w2 && u.w2.air));
    u.maxR = Math.max(u.w1 ? u.w1.r : 0, u.w2 ? u.w2.r : 0);
    u.hasAmmo = !!((u.w1 && u.w1.ammo) || (u.w2 && u.w2.ammo));
    u.hover = !!u.tagset.hover; u.item = !!u.tagset.item;
    // FAITH vs POWER: ancient/medieval/gunpowder abilities spend morale; WW/modern/future spend energy
    u.power = u.era >= 3;
    u.powered = u.power && (u.veh || u.air || u.tech) && !u.item && !u.tagset.alien && !u.hidden;
  });
  // DARK AGE de-evolution chains (each step = one knock-back level)
  HB.DEVO = {
    abrams: ['sherman', 'knight'], sherman: ['hussar', 'knight'], mech: ['sherman', 'knight'],
    apache: ['biplane', 'hussar', 'knight'], p51: ['biplane', 'hussar', 'knight'],
    seal: ['tommy', 'musketeer', 'longbow'], javelin: ['tommy', 'musketeer', 'longbow'], psychic: ['tommy', 'musketeer', 'longbow'],
    plasma: ['tommy', 'musketeer', 'longbow'], tommy: ['musketeer', 'longbow'], mgnest: ['cannon', 'greekfire'],
    drone: ['pigeon'], ufo: ['balloon'],
  };
  HB.UNIT = {};
  HB.UNITS.forEach(u => (HB.UNIT[u.id] = u));
})(typeof window !== 'undefined' ? window : globalThis);
