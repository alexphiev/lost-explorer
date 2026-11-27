# Redesign: everything on foot, in 3D

Status: agreed with the user on 2026-11-27. This doc wins over `concept.md` §3 (two layers) wherever they disagree.

## 1. Why

- **Before**: the map was a second way to travel, in 2-hour jumps. It was faster than the 3D, so the 3D scene felt optional, and switching between the two layers broke immersion.
- **After**: you only travel on foot, in one continuous 3D valley.
  - The map becomes a tool you open to orient yourself. It only shows what you have really seen.
  - The fantasy is "lost in nature, find your way back to people".

## 2. Rules (player-facing)

| Topic | Rule |
| --- | --- |
| Time | **1 real minute = 2.4 game hours** (1 s = 144 game s). Time runs while you are on foot, and pauses while the map or pause menu is open. |
| Length | A level starts on day 1 at 08:00 and is lost at **72 game hours** (day 4, 08:00), which is **30 real minutes**. A level is designed to be finishable in under 30 real minutes. |
| Day / night | Sunrise is around 07:00 and nightfall around 20:00. A day lasts ~5.4 real minutes and a night ~4.6 real minutes. Night is dark but playable (moonlight, stars). |
| Moving | Walk, run, climb, swim, and push through scrub, as today. |
| Map (M) | Shows what you have seen: the fog clears from your eye height as you go, a lot more from a tree top or a rock top. It also shows pins (clues, camps, viewpoints…), your trail and a compass. There are no travel actions on the map. |
| Energy | Drains with time and effort (running, climbing, swimming, cold), and comes back by resting or sleeping at a camp. At 0 you are slow and start to lose health. |
| Health | Lost to falls, to the cold at night without shelter, and to an empty energy bar. At 0 you collapse and lose the level. |
| Camp | Press C anywhere reasonable to make camp; you get a fire if there is wood around. Rest (a short time skip) or sleep (skip to dawn). The value of a camp depends on where you set it up (§5). |
| Win | Reach the level's goal (village, cabin, boat, cave, fishing hut). |
| Lose | Running out of time (72 h) or health. |

## 3. World (tech)

- **One continuous 3D terrain per level** instead of 1 km tiles.
  - Size: **3 km × 3 km centred on the start** (x, z ∈ [−1500, 1500]), with the same 3.9 m cells (768 segments).
  - The goal is at most ~1.25 km from the start; the world is bigger so there is room to get lost.
- Trees, rocks and scrub are placed for the whole world once; their colliders are static.
- Small things (grass, flowers, pebbles, ferns, logs, decor) are streamed around the player in 250 m chunks.
  - The set is rebuilt when the player has moved more than ~60 m, in an interval, never in the frame loop.
  - Placement is already deterministic per world chunk, so streaming never changes what is where.
- **World edge**: invisible walls a little inside the terrain border, plus a prompt ("The valley ends here: thick forest and gorges").
- **Map data** (`valley.map`): the same 3 km window, 256 segments (~11.7 m cells), centred on the start, so every `heightAt(v.map, worldX, worldZ)` call stays valid.
  - The fog of war, the map render, the landmarks and the reachability check all use this window.
- **Save**:
  - What is saved: position, day and hour, energy, health, fog, pins, clues found, camp (if any) and real seconds played.
  - When: every few seconds and when the page is hidden.
  - On resume, the player reappears at the exact position.

## 4. Living map

- The player's position is sampled every ~0.5 s (not in the frame loop). The fog of war is cleared in a circle of 400–700 m, using line of sight from the eye height, with a sharper inner radius. The radius grows with height above the surrounding land.
- Climbing a tree or a rock top (existing E) gives a big reveal and pins a viewpoint, as the map "Climb" action did.
- At night, sight is shorter (~150 m) except toward lights (§6).
- Pins work as today: clues with their arrow, camps, viewpoints, berries, cliffs, deep water, the goal once seen, summits and lakes once seen.
- Opening the map (M) pauses the game. The 3D scene stays mounted (as today).

## 5. Camp and night survival

- **Making camp (C)**: you need flat-ish, dry ground that is not in scrub. A tent and a fire appear (the fire needs trees within ~25 m).
  - **Rest**: one game hour, about 25 real seconds.
  - **Sleep**: fast-forward to 07:00, allowed after 19:00.
  - Leaving the camp packs it up.
- Each camp gets a **quality score** shown when you make it ("Sheltered, dry, fire: a good spot"). It is made of:
  - **Shelter**: trees or a rock within 8 m. ✔
  - **Exposure**: wind on a ridge or summit, higher than the land around it. ✖
  - **Damp**: water within 20 m, or wet ground. ✖
  - **Fire**: ✔
  - **Slope** (badly placed tent, poor sleep). ✖
- Sleep recovers energy and health scaled by the quality. A bad camp means a cold night: less recovery, possible health loss, and you wake up stiff.
- **Night without a camp**: the cold drains energy, and health once energy is low. Falls are more likely (darker, slower reactions). Running in the dark is risky.

## 6. Night level design: clues of light

- **Goals have lights at night**: lit windows in a village, a lamp in a cabin or fishing hut, a glowing campfire at the cave, a lantern on the boat.
  - They are visible from far away, but only with line of sight.
  - Seeing one at night pins "a light" on the map in that direction.
- **Light-only clues** (spec `when: 'night'`):
  - a lantern hung in a tree;
  - fireflies along the stream that leads to the goal;
  - the glow of a distant fire;
  - the North Star (always north, for orientation without a compass).
- **Day-only clues** stay as today: cairns, signposts, blazes…
- Some levels are designed so that one key clue only shows at night: you have to decide to walk in the dark or camp and watch.

## 7. Level design at the new scale

- Goal distance per level: 600–800 m (level 1) up to 1.0–1.25 km (level 6). Clues sit along the walkable route, as today.
- **Density**: something should happen every 20–40 s of walking. That means things to aim for on the horizon (a distinctive tree, a cairn on a ridge, a waterfall, smoke…), streams to cross, scrub to push through, berries, viewpoints and small landmarks.
- The designed valleys and rivers must fit the 3 km window: the main valley is moved closer (500–1000 m from the start).

## 8. Tasks (one GitHub issue each, in order)

1. (#35) **World**: one continuous 3 km 3D valley; streaming small decor; world edge; map window; save and resume at the exact position. The map travel actions are removed.
2. (#36) **Time and survival**: 1 min = 2.4 h, 72 h limit, a continuous day/night cycle in 3D (dark but playable nights, moon, stars), energy, health and cold rules, lose screen. HUD: day, hour, energy, health.
3. (#37) **Living map**: fog revealed by what you see (continuous viewshed, bigger reveals when climbing), map as an overlay tool (M, game paused), pins, trail, journal.
4. (#38) **Camp**: make camp (C), tent and fire, rest and sleep, camp quality and night risks.
5. (#39) **Night level design**: lights on goals, night-only clues (lantern, fireflies, fire glow, North Star), night sight radius.
6. (#40) **Levels at the new scale**: goal and clue distances, valleys and rivers within the window, density of things to find, balance pass for the 30-minute target.

Out of scope for this redesign: accounts and leaderboard (#29, #30), the onboarding tutorial (next, once the new loop is fun), and real audio samples.

## 9. Checklist for each task

- `npm run build` passes.
- `docs/progress.md` is updated (one section per task).
- No allocation in the frame loop; heavy work goes in intervals or effects.
- Same seed → same world.
