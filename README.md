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
| Gesture | Effect |
|---|---|
| Tap your regiment | Select it. Tap it again for the **formation ring**, which offers 2–4 medallions. |
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
  - **Gods' Wrath** comes when too much blood is spilled: a Titan or a Dragon descends. Every army is held under a forced truce until it falls or leaves, and the side that fought it hardest is rewarded.
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
  - **Supply clock:** every Horde army eats supply, and the further it is from the camp, the more it eats. Below zero the Horde starves and its armies bleed. The Horde gets a fresh tumen every 3 turns while it holds its camp.
- **Each turn:** march, recruit (gold and SUPPLY), and send envoys. Envoys offer alliance, truce, tribute or (between kingdoms) the **Coalition**, and terms can include gold, supply, land, levies and truce length.
  - **Tribute and the Janissary levy:** the Horde demands tribute, often with a *Janissary levy* of recruits who join its army three turns later.
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
| `js/audio.js` | WebAudio sound effects |

Everything is plain static files with no build step. There are **no secrets** in the repo: ntfy.sh topics are public and anonymous.

## Tests
```
node test/simtest.cjs                      # 16 headless gameplay checks (flank > frontal, braced pikes vs charge, …)
python3 -m http.server 8765 &              # then:
node test/e2e.cjs                          # Playwright, 412×860 touch viewport: controls, siege, campaign, replay, pass & play, no console errors
node test/online.cjs <url> local|ntfy      # two browsers: lobby, live H2H battle in lockstep, rejoin, more turns with matching state hashes
```
