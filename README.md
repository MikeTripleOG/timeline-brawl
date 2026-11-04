# ⚔ Timeline Brawl

**Every era. Same budget. Who wins?** Units from six eras of history, from Spartans to Roswell UFOs, share one battlefield. Every army gets the same point budget, so numbers can beat tech: an Apache costs as much as 2,000 chariots. Fight 1v1 or a 3–4 army free-for-all with alliances and betrayal, or just watch the AI commanders scheme.

**Play:** https://miketripleog.github.io/timeline-brawl/ (phone or desktop)

![Mid-battle screenshot](screenshot.png)

## How to play
- **⚡ Quick Battle** (1 tap): random armies with equal budgets, a 3-second countdown, then the fight.
- **👁 Spectate FFA:** Remi (ancient swarms, loyal) vs Game Dev (tech and conspiracy lore, a schemer) plus up to 2 AI armies. In Options you can choose 2, 3 or 4 armies.
- **🛠 Custom:** draft vs AI, a 3- or 4-army FFA, or 2 players on one phone. The flow is pick a mode, draft, then fight.
  - Draft controls: ＋ and − stay in fixed positions, and holding one repeats it.
  - 🎲 **Auto-fill** tops up your picks. DEPLOY warns you if points are left unspent.
- **🎯 Challenge:** paste a friend's army code (`TB-legion.5000_…`) to fight it, or paste a `#watch=` link to replay their battle.
- **Featured matchups:** six hand-made "who wins?" fights. A "Who wins?" pick is offered on these, and once per session elsewhere, and can always be skipped.

### Controls (one gesture per action)
- **Selecting and ordering a squad:**
  - Tap near one of your squads to select it. The hit area is generous.
  - Then tap the ground to move it there, or tap an enemy to attack it.
- **Abilities:** press and hold near a squad to fire its ★ lore ability. Hold snaps to the nearest friendly squad.
  - Rings around squads show readiness: they fill while the ability recharges and pulse when it is ready.
  - Every ability that fires shows a callout and an effect.
- **Camera:** it follows the action automatically. Drag to pan, pinch or use the wheel to zoom, and double-tap to zoom in or out. Touching the camera pauses the auto-follow, and ☰ → **Re-center** hands it back.
- **Diplomacy (FFA):** tap an army's chip in the top strip to propose an alliance, or to betray your ally. When an AI makes you an offer, you can Accept or Decline it.
- **☰ menu:** speed (½×, 1×, 2×, 4×; the badge shows the current speed), pause, re-center, share a watch link, share your army code, sound, and quit.
- If you leave everything alone, units fight on their own and abilities fire automatically.

## Systems
- **Faith vs Power.** Each army has two thin meters in the top strip.
  - **Morale (gold):** Ancient, Medieval and Gunpowder abilities spend it. It rises with kills and falls with losses.
  - **Energy (blue):** World Wars, Modern and Future abilities spend it, and fielding vehicles and aircraft drains it.
  - When energy hits 0, the army's power goes **dark**. Powered units weaken and lose their abilities until energy recovers.
- **☢ Dark Age EMP** is a draftable item: 12,000 pts with a 120s cooldown.
  - A white flash, then every powered unit in a big radius, including your own, is **knocked back 1–2 eras**. An Abrams becomes knights and a P-51 becomes a biplane. They re-evolve over about 60s.
  - Ancient units are immune, and faith units take a morale hit.
- **☢ Tactical Nuke** is an item (5,000 pts, one use) and fills the **Doomsday** meter. EMP, Die Glocke, HAARP and the Tesla beam add a little too.
  - At 100%: the sky goes dark, **THEY HAVE ARRIVED**, and a mothership plus drones attack everyone for 80s.
  - All tech resets to old forms and an automatic truce starts. Breaking the truce carries a double betrayal penalty.
  - The top nuker takes extra alien damage.
  - Whoever deals the most damage to the mothership gets its tech back first. Everyone else re-evolves over time.
- **Alliances and betrayal (FFA).**
  - Allies share vision, do no friendly fire, and get a growing "brothers in arms" bonus.
  - **Betrayal** gives the traitor a surprise attack burst and takes some of the victim's energy and morale. It costs the traitor morale, energy and faith-ability strength, and brands them **OATHBREAKER**.
  - The victim gets **Vengeance**, and a "BETRAYED" stamp shows both names and how long the alliance lasted.
  - AI commanders propose alliances and betray on their own.
- **Deterministic replays.** Battles use a seeded RNG, a fixed 30 Hz timestep and a logged command stream.
  - A `#watch=` link replays the identical battle on any device, including your orders and diplomacy.
  - Army codes let friends challenge your exact draft.
- **Core mechanics.**
  - Counters: longbows beat light cavalry, spears stop charges, and the testudo stops arrows and bullets but not shells.
  - Modern units have limited ammo and fuel, so when they run dry they get swarmed.
  - Squads rout when they lose too many troops.
  - Chaos events are optional, and weather changes accuracy.

## Units and lore abilities
Every unit has one myth- or conspiracy-based ability with a cooldown and a counter.

### Ancient (faith: abilities spend morale)
| Unit | Role | Cost | Lore ability | Counter |
|---|---|---|---|---|
| Spartan Hoplites | Infantry | 150 per 50 | **THERMOPYLAE HOLD**: When badly outnumbered the phalanx locks shields: immovable, takes 75% less melee, arrow and bullet damage for 7s. (cooldown 25s) | Explosives, fire and missiles ignore the shield wall. |
| Roman Legionaries (testudo) | Infantry | 200 per 100 | **BLESSING OF MARS**: The god of war answers: heals 25% and +60% damage for 6s. Passive testudo blocks most arrows and bullets. (cooldown 30s) | An eclipse is a bad omen (blocked); Black Death blocks the healing; packed testudo takes extra shell damage. |
| Persian Immortals | Ranged | 150 per 50 | **THE TEN THOUSAND**: For 8s, each fallen Immortal has a 60% chance to be instantly replaced from the rear, keeping the legend of an army that never shrinks. (cooldown 30s) | Fire and explosive deaths are not replaced; Black Death blocks it. |
| Egyptian Chariots | Cavalry | 200 per 40 | **CHARIOT OF RA**: The sun god drives the charge: double speed and triple trample damage for 4s. (cooldown 20s) | Spears and pikes blunt the charge; useless at night or in an eclipse. |
| Archimedes' Mirrors | Siege | 300 per 2 | **ARCHIMEDES' DEATH RAY**: Polished bronze focuses the sun on the biggest enemy vehicle, aircraft or siege engine within 320: it burns for 6s (about 30% of its HP). (cooldown 18s) | Daytime only: night, storms, sandstorms and eclipses shut it down. |
| Trojan Horse | Siege | 400 | **THE TROJAN HORSE**: Once per battle the "gift" appears behind enemy lines and, 2.5s later, 30 Greek hoplites pour out. (cooldown one use) | Burn or blow it up before it opens and the hidden troops die inside. |

### Medieval (faith: abilities spend morale)
| Unit | Role | Cost | Lore ability | Counter |
|---|---|---|---|---|
| Viking Berserkers | Infantry | 200 per 40 | **BERSERKERGANG**: They feel no pain: for 5s they keep fighting at 0 HP with +50% damage, and only fall when the rage ends. (cooldown 22s) | Fire, shells and missiles still kill them outright; shoot them before they reach you. |
| English Longbowmen | Ranged | 200 per 50 | **AGINCOURT VOLLEY**: Arrows blot out the sun: every archer instantly looses 3 double-damage arrows. Murderous against cavalry. (cooldown 20s) | Rain or storms mean wet bowstrings (blocked); shields, testudo and armour shrug it off. |
| Knights Templar | Cavalry | 300 per 20 | **THE HOLY GRAIL**: The Grail heals every surviving knight to full and makes them untouchable for 2.5s. (cooldown 35s) | It cannot raise the dead, and Black Death blocks all healing. Pikes still impale them. |
| Mongol Horse Archers | Cavalry | 240 per 40 | **FEIGNED RETREAT**: They flee... then wheel around: for 4s double damage, and undisciplined pursuers are disordered (take +60% damage). (cooldown 20s) | Disciplined troops (phalanx, legion, pikes, knights, machine guns, modern units) do not take the bait; longbows outrange them. |
| Byzantine Greek Fire | Siege | 320 per 4 | **GREEK FIRE**: The secret liquid fire: a 30-wide pool that burns everything in it for 6s and cannot be put out by water... supposedly. (cooldown 15s) | Rain, storms and the divine wind douse it; very short range. |
| Samurai | Infantry | 240 per 30 | **KAMIKAZE — DIVINE WIND**: Once per battle a typhoon scatters every enemy aircraft (8s grounded and out of fuel) and hurls nearby enemies back. (cooldown one use) | One use only; does nothing to tanks and other ground armour. |

### Gunpowder (faith: abilities spend morale)
| Unit | Role | Cost | Lore ability | Counter |
|---|---|---|---|---|
| Swiss Pikemen | Infantry | 200 per 50 | **WILLIAM TELL'S SHOT**: The legendary crossbowman fires one perfect bolt at the most valuable enemy within 250: 35% of its max HP, ignoring armour. (cooldown 30s) | Range 250: tanks and helicopters that stay back are safe. |
| Musketeers | Ranged | 240 per 40 | **JOAN OF ARC'S BANNER**: A vision of the Maid: for 8s all allies within 160 cannot break, deal +25% and take -20% damage. (cooldown 30s) | The banner falls if the musketeers drop below 25%. |
| Winged Hussars | Cavalry | 280 per 20 | **WINGS OF VIENNA**: The terrifying roar of the wings: a 3s charge at x2.5 damage, and nearby undisciplined enemies flee in panic. (cooldown 25s) | Pikes and spears stop the charge; disciplined troops and machines are not scared. |
| Cannon Battery | Siege | 360 per 3 | **SAINT BARBARA'S FIRE**: The patron saint of gunners blesses the next 3 shots: they never miss and have triple blast radius. (cooldown 25s) | Slow reload; fast cavalry that reaches the guns overruns them. |
| Ninja (Shinobi) | Infantry | 225 per 15 | **SMOKE BOMB VANISH**: Passive: invisible until they strike. Ability: vanish in smoke and blink 50 deeper into the enemy, untouchable for 3s. (cooldown 12s) | Modern radar and thermal units see them within 150; explosions still hit them. |

### World Wars (power: abilities spend energy)
| Unit | Role | Cost | Lore ability | Counter |
|---|---|---|---|---|
| British Tommies (WW1) | Infantry | 300 per 25 | **THE ANGELS OF MONS**: When the squad is half dead, ghostly bowmen of Agincourt appear behind them for 7s and cover the retreat with volleys. (cooldown 35s) | Ghost arrows barely scratch tanks or aircraft; it only lasts 7s. |
| Machine-Gun Trench (WW1) | Ranged | 800 per 2 | **NO MAN'S LAND DESERTERS**: The legendary wild deserters living under no man's land burst out among enemies crossing it: 15 feral fighters join your side. (cooldown 30s) | Only works on enemies in the middle no man's land band; vehicles shrug them off. |
| Sherman Tank (WW2) | Vehicle | 1500 | **THE GHOST ARMY**: 4 inflatable decoy tanks pop up around the Sherman for 12s and draw enemy fire. (cooldown 30s) | One hit pops a decoy; radar-equipped modern units see straight through them. |
| P-51 Mustang (WW2) | Air | 2500 | **FOO FIGHTERS**: Mysterious glowing orbs swarm the plane for 6s and jam the targeting of every enemy with electronics within 260 (-75% accuracy). (cooldown 25s) | Ancient, medieval and gunpowder troops have no targeting electronics to jam. |

### Modern (power: abilities spend energy)
| Unit | Role | Cost | Lore ability | Counter |
|---|---|---|---|---|
| Navy SEALs | Infantry | 900 per 10 | **PHILADELPHIA EXPERIMENT**: When cornered in melee the squad vanishes and rematerialises 130 away on a flank, invisible for 4s. (cooldown 25s) | They reappear dazed and cannot fire for 1s; explosions still hit them. |
| Javelin Missile Team | Ranged | 1000 per 2 | **ROSWELL LOCK-ON**: Reverse-engineered alien seekers: the next 2 missiles cannot miss and ignore jamming, cloaks and decoys. (cooldown 30s) | Only 4 missiles per team, and they are wasted on swarms. |
| M1 Abrams Tank | Vehicle | 10000 | **MONTAUK TIME-SLIP**: The Montauk chair rewinds the tank 5 seconds: position and armour as they were, invulnerable for 1.5s while it re-phases. (cooldown 40s) | Spent shells and fuel stay spent; once dry it is just a steel box waiting to be swarmed. Dark energy (0 energy) blocks it. |
| AH-64 Apache | Air | 10000 | **GHOST OF KYIV**: A legendary ace takes the stick: for 6s rockets cost no ammo and incoming fire mostly misses. (cooldown 30s) | Burns fuel 3x faster, so it has to land sooner, and landed helicopters get swarmed. |
| Stargate Psychic Soldiers | Infantry | 600 per 10 | **PROJECT STARGATE**: Remote viewers reveal every hidden, invisible and cloaked enemy on the map for 8s and pop decoys; enemies within 150 are mind-scrambled (disordered 3s). (cooldown 25s) | Faith units with high morale (70+) resist the scramble; ninjas re-cloak once it ends. |
| Tactical Nuke (item) | Item | 5000 | **TACTICAL NUKE**: One launch: after a 2.5s warning a nuclear blast levels everything within 80, friend or foe, and leaves fallout. Each nuke fills the Doomsday meter by 40. (cooldown one use) | Kill the silo before launch, or spread out. Fill the Doomsday meter and THEY arrive, hitting the biggest nuker hardest. |

### Future (power: abilities spend energy)
| Unit | Role | Cost | Lore ability | Counter |
|---|---|---|---|---|
| Battle Mech Suit | Vehicle | 4000 | **TESLA DEATH BEAM**: Tesla's lost 'teleforce' beam: 2s of 300 dmg/s on the most valuable enemy within 420, day or night, and it drains 8 energy from the victim's side. (cooldown 22s) | Eats a quarter of your energy; at 0 energy it is dead weight. EMPs knock the mech back to a Sherman. |
| Drone Swarm | Air | 500 per 20 | **HAARP WEATHER CONTROL**: The swarm seeds the ionosphere: a 70-wide lightning storm rages over the enemy for 6s, striking anything not on your side. (cooldown 30s) | Hits allies and neutral armies too; troops that scatter out of the storm are safe. Only anti-air can touch the drones. |
| Plasma Troopers | Infantry | 800 per 20 | **DIE GLOCKE**: The Nazi Bell spins up: every unit in a 55-wide bubble near the target freezes solid for 4s (vehicles 2s). (cooldown 28s) | Freezes your own and allied troops in the bubble too. Plasma guns run on energy: at 0 energy they fall silent. |
| Roswell UFO Craft | Air | 6000 | **AREA 51 ANTIGRAVITY**: Passive: hovers on a 600-point regenerating shield. Ability: lifts every enemy ground unit within 60 of the target into the air for 2.5s, then drops them (30% HP). (cooldown 24s) | Any EMP drops the shield and grounds it; a Dark Age EMP turns it into a weather balloon. Weapons run on energy. |
| Dark Age EMP (item) | Item | 12000 | **DARK AGE EMP**: The most expensive item in the game. A white flash, then every powered unit in a 200-wide blast, yours included, is knocked back 1-2 eras (Abrams → Sherman → Knight, Apache → Biplane, Plasma → Musketeers) and re-evolves one era at a time over ~60s. (cooldown 120s) | Hits your own tech too. Ancient units are immune, faith units only lose morale. Destroy the device before it charges. |

## Featured matchups
| Matchup | What decides it |
|---|---|
| 300 Spartans vs 10 Navy SEALs | Can the SEALs' 1,600 rounds stop 300 shields before the phalanx closes? Usually no, but sometimes. |
| 5,000 Legionaries vs 1 M1 Abrams | The testudo holds until the Abrams runs out of ammo, then the swarm finishes it. The legion wins about 2 in 3. |
| 400 Mongol Horse Archers vs 6 MG nests | Feigned retreat against the Maxim gun. A coin flip. |
| 2,000 Chariots vs 1 AH-64 Apache | Same price tag. The Apache mows down hundreds, but when it runs out of fuel it has to land... |
| 310 Samurai vs 1 P-51 Mustang | Strafing runs against the divine wind. Very close. |
| Longbowmen + Pikes vs Knights & Winged Hussars | An Agincourt rematch. |

## Tech
- Plain static HTML, CSS and JS: no build step, no backend, no dependencies.
- **`js/units.js`:** units, items and the de-evolution chains.
- **`js/sim.js`:** a deterministic fixed-step sim using typed arrays, a spatial hash and pooled projectiles. It handles up to 5 sides (4 armies plus the aliens).
- **`js/world.js`:** factions, meters, diplomacy, EMP and de-evolution, nukes, Doomsday, future lore, and the command log.
- **`js/armies.js`:** presets, layouts, AI and commander drafts, matches, army codes and watch-link encoding.
- **`js/render.js`:** the canvas renderer with the camera.
- **`js/audio.js`:** a WebAudio synth.
- **`js/ui.js`:** screens, input and the loop.
- To run locally, start `python3 -m http.server` and open http://localhost:8000.

### Tests
- `node test/simtest.cjs 6 nochaos [matchupId]`: headless balance batches.
- `node test/ffa.cjs 1 4`: FFA seeds with an event log.
- `node test/doom.cjs`: forced Doomsday end-to-end.
- `node test/seedsearch.cjs 1 10`: finds spectate seeds with a betrayal, EMP or aliens.
- `node test/e2e.cjs http://127.0.0.1:8765/`: Playwright at a 412×860 phone viewport. It covers Quick Battle, draft, deploy, results, watch-link determinism, frame rate, spectate and challenge.
