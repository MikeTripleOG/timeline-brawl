# ⚔ Timeline Brawl: The Five Crowns *(trial version)*

A war-table strategy game set before gunpowder, played in the browser. Rule one of five kingdoms on a painted parchment map. Send envoys, and break oaths when it suits you. When armies meet, the fight plays out top-down with blocks of soldiers. Facing, flanks and morale decide the winner. Raw numbers do not.

**Play:** https://miketripleog.github.io/timeline-brawl/ (made for phones; works on desktop)

![Campaign map](screenshot.png)

## Modes
- **⚔ Quick Battle:** one tap starts it. Two random cultures get equal budgets on a random battlefield.
- **Play ▸ Solo vs AI:** a campaign of the Five Crowns. Pick a kingdom or the Crimson Horde, and the AI rules the other seats.
- **Play ▸ Pass & Play:** 2 to 6 rulers share one phone, with a cover screen between turns. There is also a 1v1 battle duel.
- **Play ▸ Online with a friend:** host a room and share the `#room=CODE` link. Your friend picks a kingdom or the Invader, and AI rules the empty seats. No accounts and no server (see Multiplayer).
- **Play ▸ Spectate:** watch Remi (swarm style) fight Game Dev (a schemer) in a field battle, a siege or a free-for-all. You can also watch a whole AI campaign or one of the *Famous battles*.
- **Custom battle:** pick both cultures, the enemy commander and the budget. Battlefields are open field, river and fords, hills, forest and village, **Siege: attack** and **Siege: defend**. You can also paste an army code.

## Controls (tap-first)
Every player battle opens with a **DEPLOY** phase. The camera is framed close on your army, nothing moves and the clock is stopped. Drag regiments anywhere inside the gold zone, swipe to face, and set formations, then press **⚔ Start battle**. Online lockstep battles and replays skip deployment, and the clock waits until the intro banner clears. Each block carries a unit-type badge: pike, sword and shield, bow, horse archer, horse, chariot, elephant or siege.

| Gesture | Effect |
|---|---|
| Tap your regiment | Select it. Tap it again (or long-press it) for the **formation ring**: 2–4 large medallions in a row clear of the unit. |
| Drag from your regiment | Move there. The drag direction sets its facing. Drop it on an enemy to attack. |
| Swipe with a regiment selected | Turn to face that way. |
| Tap an enemy | Attack it. |
| Tap a wall with an engine selected | The ram, tower or trebuchet works on that wall section. |
| Tap ground | Move without changing facing. |
| Pinch / wheel | Zoom. The auto-camera follows the fighting until you take over. |

Bottom bar: **☾ Curse** (spends faith), **Auto** (the AI takes your regiments), **1× / 2× / 4×** speed, and **✕** to leave.

## Cultures and roles
There are ten pre-gunpowder cultures, each with 4–6 regiments and a lore ability:

| Culture | Regiments and lore ability |
|---|---|
| Rome | legion, testudo, velites, Blessing of Mars |
| Sparta | hoplites, Thermopylae Stand |
| Macedon | pike phalanx, Companions, Alexander's Charge |
| Carthage | war elephants, Numidians, Balearic slings, Hannibal's Gambit |
| Celts | warbands, chariots, Druid Fog |
| Vikings | shield wall, Berserker Rage |
| Mongols | horse archers, Eternal Blue Sky |
| Samurai | yari, yumi, Kami Wind |
| Aztec | jaguar and eagle warriors, Fifth Sun |
| Zulu | impi in buffalo horns, Usuthu! |

**Rock, paper, scissors:** braced pikes and spears beat cavalry. Cavalry beats archers and skirmishers. Archers beat slow heavy infantry. Shield wall and testudo shrug off arrows, but they are slow and clumsy.

Every culture can also field siege engines: battering ram, siege tower and trebuchet, plus onager and ballista.

## Battle mechanics
- **Facing:** hits to the flank or rear deal extra damage and cause a morale shock. A cavalry charge into the rear brings an impact flash, screen shake and slow motion, and the victims scatter.
- **Cohesion, charge momentum, bracing and fatigue:** a charge needs a run-up. Braced spears stop it cold. Running and fighting tire troops out.
- **Terrain:** hills give height and reach. Forests hide units and break up cavalry. Rivers can only be crossed at fords.
- **Morale and contagion:**
  - A routing regiment shakes the regiments around it.
  - Routers can rally once they are out of danger.
  - Elephants panic under javelins and skirmishers and trample their own side.
- **Mythic layer:**
  - **Faith** builds over the battle and pays for lore abilities and the **Curse**.
  - **Gods' Wrath** is rare and late. It never comes in quick battles or a campaign's first battles. The gods only stir after 8+ battles, from turn 7, once the war has spilled about 7000 men (or 4500 plus a betrayal), and then not again for 10 turns. Even then, a Titan only walks into the second half of a bloody battle. It forces a truce until it falls, and the side that fought it hardest is rewarded.
- **Free-for-all diplomacy:** alliances, betrayal (OATHBREAKER) and Vengeance for the victim.
- **Sieges:**
  - Walls come in rings (outer, inner, keep). Breaching one ring moves the fight inward.
  - Gates fall to rams. Towers and ladders put attackers on the walls, and trebuchets open breaches.
  - Defenders on the walls are covered from arrows and can sally out.
  - A relief army may arrive.
  - The HUD shows **WALL INTEGRITY** and **MORALE** and counts turns.
- **Replays:** battles are deterministic, with a seeded RNG, a fixed 20 Hz step and a logged command stream. A `#watch=` link replays the identical battle anywhere.

## Campaign
- Five kingdoms, each with its own culture:

| Kingdom | Colour | Culture |
|---|---|---|
| Eldenvale | green | Celts |
| Northgard | blue, snowy | Vikings |
| Solenthia | gold | Macedon |
| Vellorien | purple | Carthage |
| Drakonia | red | Rome |

- **The Crimson Horde (Mongols)** invades from the east under a dragon banner. Its supply wagons follow a dotted red supply line.
  - **Supply clock:** every Horde army eats about 6 + size/2 supply a turn, plus 4 for each province it stands beyond Horde-held land. Resting in held land refunds only 4. The camp and held provinces trickle a little back. A stalled Horde loses about 12–14 a turn (100 → 0 by turn 9). Below zero it starves and its armies bleed. **Conquest** is the real resupply: plundering a province gives +12 supply and +25 gold (+25 supply and +60 gold for a capital), but the same province can only be stripped once every 8 turns. The Horde gets a fresh tumen every 2 turns while it holds its camp, and it cannot lay siege to a capital before turn 4.
- **Gold and upkeep:** every regiment costs gold each turn: 2 at home, 4 abroad, and 2 for a Horde regiment. When a chest runs dry, regiments desert. The HUD shows what you pay per turn. In all-AI tests (16 campaigns), treasuries tighten by turn 4–5: the Horde drops from 150 to about 33 gold on turn 2, and kingdoms average about 80–110 by turns 2–4. The first capital usually falls between turns 5 and 8, and the Horde wins about half the time (8 of 16).
- **Heads-up:** at the start of your turn, a red ⚠ ring and a toast warn when a Horde army can reach one of your provinces within two turns and outmatches its defenders. The Horde's own player sees **SUPPLY LOW** when supply drops below 30.
- **Marching:** tap any reachable province, including a kingdom's banner plate, and the army marches there by road over several turns. The full route is drawn with an **ETA** tag, and the order carries over each turn until the army arrives. If a battle or a blocked road holds it up, you get a delay notice with the new ETA.
- **Attrition:** battle losses stay with the army. Armies heal in their own land, faster when resting, and the Horde heals more slowly.
- **Each turn:** march, recruit (gold and SUPPLY), and send envoys. Envoys offer alliance, truce, tribute or (between kingdoms) the **Coalition**, and terms can include gold, supply, land, a Blood Tribute and truce length.
  - **Tribute and the Blood Tribute:** the Horde demands tribute, often with a *Blood Tribute* of young recruits who return three turns later as **Oathbound** in its army.
  - **Spies (60 gold):** a 70% chance of a 3-turn report on the target's gold, supply and armies. Against the Horde, a spy also burns 20 supply. A caught spy closes that court to your envoys for 3 turns.
  - **Coalition:** members are allied with one another. With two or more members, coalition riders cost the Horde 3 supply per member each turn.
- **Treaty scrolls** are sealed in wax with **Accept** or **Refuse**.
- **Breaking an oath** is possible, and everyone remembers it.
- **Sieges:** capitals and the Horde camp are walled, and an undefended capital is held by its city watch.
- **Winning:**
  - The Horde wins by holding three crowns.
  - The kingdoms win by taking its camp.
  - Otherwise the season ends at turn 24 and the strongest crown wins.

## Multiplayer (no backend)
- **Campaign:**
  - The host is authoritative. Rulers submit their orders as small JSON messages.
  - The host resolves the turn and broadcasts the slimmed state. It is deflate-compressed (about 1 KB) and carries a state hash.
  - On a hash mismatch, or when a reloaded tab reconnects, the client is resynced. The room record is kept in `localStorage` (or in `sessionStorage` with `?relay=local`), so a closed tab can rejoin its seat.
- **Relay:** messages go through a public [ntfy.sh](https://ntfy.sh) topic (`tbrawl3-<CODE>`).
- **Human-vs-human battles:**
  - **Deterministic lockstep**, with the host as the clock.
  - The two browsers connect directly over a WebRTC DataChannel (STUN only), with about 250 ms of input delay.
  - If no direct link opens within 12 s, play falls back to 10 s order segments over the relay.
  - Hash checks run every few frames. A desync triggers a rebuild from the frame log.
- **Battles against AI** run locally on the player's device.
- **Offline testing:** `?relay=local` uses a BroadcastChannel between tabs.

## Polish, art and audio
- **Game feel:** flank and rear charges flash, shake the camera and scatter the struck block. Cavalry kicks up dust, and arrows fly in visible arcs with ground shadows. Breaches throw masonry, and ring falls, breaches and routs get a beat of slow motion. A braced pike block visibly lowers its spears, tightens its files and calls out **BRACED** when horse hit it. Victories and defeats end with a banner flourish.
- **Screens:** a key-art splash (Game Dev's portrait or landscape painting with the title painted in; a progress bar on its parchment strip, then a pulsing *Tap to begin* that opens the menu), fade transitions, button press feedback, and a skippable first-time tutorial (4 battle tips and 3 campaign tips; *Skip tips* turns them all off). Blessing of Mars and the Curse meter (☾, faith / cost) each get a one-time explanation.
- **Army panel:** a slim strip above the map bar that expands on demand (▴/▾). It never covers End Turn or Envoys, map taps pass around it, and collapsing it keeps the army selected.
- **Quick Battle preset "Pikes vs Charge":** a Macedonian phalanx with Cretan archers against a Keshig lancer charge.
- **Saves are versioned:** an incompatible save is dropped, and *Continue* only appears for a valid save.
- **Share** always sits next to *Copy link*. Where the browser cannot share, it copies the link instead.
- **Names in one place:** the title, subtitle, tag, share text, levy name (**Blood Tribute**) and recruit name (**Oathbound**) live in `HB.CONFIG` in `js/config.js`.
- **Art slots:** drop images into `/workspace/timeline-brawl-art/` (title key art, `kingdom_crests.jpg`, `horde_crest.jpg`, `oathbound_unit.jpg`) and run `python3 tools/import_art.py`. The script crops and compresses them into `assets/art/` and writes `js/art.js` (`HB.ART`). Crests appear on the title, map banners, army banners, the treaty scroll, the envoys panel and the faction pickers. Any slot left empty falls back to the drawn heraldry.
- **Title key art:** two paintings, each with the title and tagline painted in and a blank parchment strip at the bottom: `title_key_art_portrait*.jpg` (9:16) and the largest `title_key_art*.jpg` (16:9). `import_art.py` makes `title_portrait.webp` (1080 wide, ~210 KB) and `title_landscape.webp` (1920 wide, ~245 KB) plus tiny blurred placeholders. A `<picture>` with `media="(max-aspect-ratio: 999/1000)"` serves the portrait painting when the screen's aspect ratio is under 1 and the landscape one otherwise, so each phone downloads only one. `layoutKeyArt()` in `js/ui.js` scales the painting so the painted title stays fully on screen and the parchment strip meets the bottom edge (the strip is stretched or squeezed a little to fit; any leftover gap shows a blurred copy of the art), then sets the loading bar and the pulsing *Tap to begin* on the painted strip. The code-drawn title is hidden whenever key art is present. Title box, strip and focus fractions live in `TITLE_BOX` in the script (env overrides `TITLE_P_*` / `TITLE_L_*`). Deep links (`#room=`, `#watch=`) skip the splash.
- **Audio credit:** every sound is synthesised live with the Web Audio API in `js/audio.js` (layered clash, war horns, drums, arrow volleys, a crowd roar and the campaign map drone). No samples or third-party audio files are used, so there is nothing to license. A mute toggle sits on the title screen and in the map menu, and it is remembered.

## Code layout
| File | Contents |
|---|---|
| `js/data.js` | formations, unit types, cultures and lore |
| `js/sim.js` | the battle simulation |
| `js/siege.js` | walls, engines and siege AI |
| `js/ai.js` | AI commanders |
| `js/match.js` | match setup, army codes, `#watch` encoding |
| `js/campaign.js` | campaign rules, which are pure and deterministic |
| `js/render.js` | battle renderer |
| `js/mapview.js` | parchment campaign map |
| `js/net.js` | relay, lockstep and rooms |
| `js/ui.js` | screens and gestures |
| `js/config.js` | title text, the levy and recruit names, and share text (one constant) |
| `js/art.js` | generated art manifest (`tools/import_art.py`) |
| `js/audio.js` | procedural WebAudio sound effects and music |

Everything is plain static files with no build step. There are **no secrets** in the repo: ntfy.sh topics are public and anonymous.

## Tests
```
node test/simtest.cjs                      # headless gameplay checks: flank > frontal, braced pikes vs charge, names, upkeep, all-AI balance, …
python3 -m http.server 8765 &              # then:
node test/e2e.cjs                          # Playwright, 412×860 touch viewport: controls, tutorial, siege, campaign strip/ETA, replay, pass & play, crests, mute, saves, Pikes vs Charge, no console errors
node test/online.cjs <url> local|ntfy      # two browsers: lobby, live H2H battle in lockstep, rejoin, more turns with matching state hashes
```
