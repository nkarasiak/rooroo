# Pigeon Sim — CLAUDE.md

## Concept

First-person phenomenological pigeon simulator. You live the ordinary life of a city pigeon: walk a sidewalk, peck at garbage, flap to a rooftop, coo at nothing. The goal is felt experience, not gameplay. Every system serves that — the UV tetrachromat vision, the low eye-height, the head-bob, the procedural coo. No scoring, no objectives.

## Stack

- **Three.js** (r167) — 3D rendering, scene, cameras, shadow maps
- **Vite** — dev server + bundler
- Plain ES modules, no TypeScript, no framework

```
npm run dev    # dev server at localhost:5173
npm run build  # production build
```

## Source layout

```
src/
  main.js                 entry point: renderer, scene, clock, render loop
  scene/
    world.js              city block geometry + AABB collider registry
    lighting.js           sun (directional + shadows) + ambient + sky-bounce fill
  pigeon/
    controller.js         physics, input, state machine, camera, pigeon mesh
  vision/
    pigeonVision.js       UV tetrachromat vision — 3-camera shader composite
  audio/
    pigeonAudio.js        procedural Web Audio: ambience, flap, coo, peck, land
index.html                HUD overlay, controls splash, CSS
```

## World

City intersection — single city block, ~70×70 units.

| Object | Position | Notes |
|--------|----------|-------|
| Asphalt road | center | 70×70 |
| 4 sidewalks | ±17.5 on each axis | 7 units wide |
| 4 buildings | (±23, ±23) | heights 18–28, AABB colliders, landable rooftops |
| 4 street lamps | (±11, ±13) | emissive bulbs |
| 2 garbage bins | (-8,-13), (8,13) | collidable cylinder AABB |
| 3 garbage bags | near bins | **food targets** — glow in UV vision (zero-red color trick) |
| 1 bench | (0, -15.5) | AABB seat + backrest |
| 1 puddle | (4, 5) | uvReflective |
| 20 pebbles | random | decoration |

World bound: ±30 units (hard clamp).

## Pigeon physics

State machine: `WALKING → FLYING → WALKING`, with `PECKING` as a sub-state of WALKING.

| Constant | Value |
|----------|-------|
| WALK_SPEED | 4.5 |
| FLY_SPEED | 9 |
| FLAP_FORCE | 6.5 |
| GRAVITY | 14 |
| EYE_HEIGHT | 0.28 (very low) |
| BODY_RADIUS | 0.22 |
| WING_FLAP_HZ | 7 |

- **Landing detection**: `_getSurfaceY()` scans AABB colliders below XZ position → returns highest surface Y (ground=0 or rooftop)
- **Wall collision**: `_resolveXZ()` — AABB push-out on X or Z (shortest overlap axis), skips if pigeon above surface
- **Walking bob**: sine wave at `bobTime * 9 Hz`, amplitude 0.035
- **Peck**: 0.5s animation, head-dips via camera pitch + position offset

## Controls

| Key | Action |
|-----|--------|
| WASD | Walk / strafe |
| SPACE | Take off (ground) / flap (air, adds to vel.y) |
| E | Peck (walking only) |
| V | Toggle pigeon UV vision |
| C | Toggle FPV / 3rd person |
| ESC | Release pointer lock |
| Mouse | Look (yaw/pitch, pitch clamped ±1.1 rad) |

## Vision system (`pigeonVision.js`)

Pigeon tetrachromat simulation via 3-camera compositing shader.

**Field of view geometry:**
- Total horizontal: 300° (150° left, 150° right, 60° blind spot behind)
- Left eye: 120° FOV, axis at −90° from forward
- Right eye: 120° FOV, axis at +90° from forward
- Center binocular: 60° FOV, forward axis

**Render pipeline:**
1. Render `leftCam` → 512×512 RT
2. Render `centerCam` → 512×512 RT
3. Render `rightCam` → 512×512 RT
4. Full-screen quad shader composites all three using perspective-correct UV mapping

**Camera sync (`_syncCameras`):**
- `leftCam.rotation.y = mc.rotation.y + sideAngleRad` (looks left)
- `rightCam.rotation.y = mc.rotation.y - sideAngleRad` (looks right)
- Side cam pitch = `mc.rotation.x` (full pitch — matches center seam)

> Note: positive Y rotation in Three.js (YXZ order) rotates camera toward -X (left). Swap the signs and you get a left/right flip bug.

**UV food glow:** Garbage bags use `color: 0x009966` (zero red channel). The shader maps `uvChan = 1.0 - red` so they appear vivid in pigeon vision.

**Seam softening:** hairline darkening at u=0.4 and u=0.6 (the ±30° binocular boundaries).

## Audio (`pigeonAudio.js`)

All procedural Web Audio API — no sample files.

| Sound | Technique |
|-------|-----------|
| City ambience | 58Hz sine hum + 116Hz triangle + random lowpass noise bursts |
| Flap | Bandpass filtered white noise burst (500Hz, Q=1.5) |
| Coo | 3-note sine sweep (380→290→340 Hz), throttled to once per 3s |
| Peck | Square wave click, 900→200Hz exponential ramp |
| Land | Lowpass noise thud (220Hz cutoff) |

Audio inits on first click (Web Audio gesture requirement). Random coo on takeoff (40% chance, 200ms delay).

## HUD

Top-left, fixed, monospace. Three lines:
- State: `WALKING` / `FLYING` / `PECKING`
- Vision: `HUMAN VISION` / `PIGEON VISION (UV)`
- Camera: `FPV` / `3RD PERSON`

## 3rd-person pigeon mesh

Procedural `THREE.Group`: body (sphere, scaled), neck, head, beak (cone), 2 wings (animated via `userData.wings`), tail, 2 legs. Wing flap animation in flight; body pitch follows camera pitch × 0.6.

## Known design decisions / gotchas

- **No TypeScript** — keep it that way, file sizes are tiny
- **AABB-only collision** — no mesh collision, deliberate (perf + simplicity)
- **Rooftop landing** uses `_getSurfaceY()` which returns `aabb.max.y`, so any landable surface needs a collider registered via `addAABB()` or pushed to `_colliders`
- **Garbage bags as food** use `userData.isFood = true` and `userData.uvReflective = true` — neither is consumed yet (no eat mechanic implemented)
- **Pointer lock required** for mouse look — ESC releases, click overlay re-enters

## Possible next directions

(Not committed — just collected ideas from the concept)

- Eating animation: food disappears after N pecks, triggers audio
- Scattered breadcrumbs (many small meshes, same food system)
- Other pigeons wandering (simple NavMesh-less random walk + flap)
- Day/night cycle (sun position, ambient color shift)
- Rain (particle system, wet road sheen, audio)
- More UV-reactive surfaces (puddles, certain storefronts)
- Pigeon sound reactivity (other pigeons coo → player pigeon responds)
- Pedestrians as obstacles (simple capsule paths)
