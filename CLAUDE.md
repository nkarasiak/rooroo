# Pigeon Sim — CLAUDE.md

## Concept

First-person phenomenological pigeon simulator. You live the ordinary life of a city pigeon: walk a sidewalk, peck at garbage, flap to a rooftop, coo at nothing. The goal is felt experience, not gameplay. Every system serves that — the UV tetrachromat vision, the low eye-height, the head-bob, the procedural coo. No scoring, no objectives.

## Stack

- **Three.js** (r167) — 3D rendering, scene, cameras, shadow maps, GLTFLoader, AnimationMixer
- **Vite** — dev server + bundler
- Plain ES modules, no TypeScript, no framework
- **CC0 GLB models** (Quaternius / Poly Pizza) for organic/complex props; procedural for everything parametric

```
npm run dev    # dev server at localhost:5173
npm run build  # production build
```

## Source layout

```
src/
  main.js                 entry point: renderer, scene, env map, model preload, render loop
  scene/
    world.js              city block geometry + shops + AABB collider registry
    lighting.js           sun (directional + shadows) + ambient + sky-bounce fill
    models.js             GLTFLoader + helpers (loadModels, fitHeight, seatedGroup)
  pigeon/
    controller.js         physics, input, state machine, camera, GLB pigeon + AnimationMixer
  vision/
    pigeonVision.js       UV tetrachromat vision — 3-camera shader composite
  audio/
    pigeonAudio.js        procedural Web Audio: ambience, coo, peck, land
public/
  models/                 CC0 GLB assets (pigeon, car, car_police, tree, tree_pine)
index.html                HUD overlay, controls splash, CSS
```

Scale: **1 world unit ≈ 1 metre** throughout (buildings 18–28 m, pigeon 0.3 m).

## World

City intersection — single city block, ~70×70 units.

| Object | Position | Notes |
|--------|----------|-------|
| Asphalt road | center | 70×70, PBR (normal map), faint wet sheen |
| 4 sidewalks | ±17.5 on each axis | 7 units wide, raised curb, concrete (normal map) |
| 4 buildings | (±23, ±23) | brick (normal map), heights 18–28, AABB colliders, landable rooftops |
| 4 ground-floor shops | inward faces of each building | CAFÉ / PHARMACIE / BOULANGERIE / PRESSE — glass storefront, awning, canvas sign, emissive interior |
| 4 street lamps | (±11, ±13) | emissive bulbs + point lights |
| 4 parked cars | along curbs | GLB (car / car_police), AABB colliders |
| 4 trees | sidewalk corners (±13, ±16.5) | GLB (tree / tree_pine) + concrete planter AABB |
| 2 garbage bins | (-8,-13), (8,13) | collidable cylinder AABB |
| 3 garbage bags | near bins | **food targets** — glow in UV vision (zero-red color trick) |
| 1 bench | (0, -15.5) | AABB seat + backrest |
| 2 puddles | (4, 5) main, (-2.5,-3) small | main uses live CubeCamera reflection; both `uvReflective` |
| 2 fire hydrants, 2 manholes | sidewalk / road | decoration |
| 20 pebbles | random | single InstancedMesh |

Windows are drawn as two `InstancedMesh` per building (lit / dark) — not one mesh each — to keep draw calls flat.

World bound: ±30 units (hard clamp).

## Pigeon physics

State machine: `WALKING → FLYING → WALKING`, with `PECKING` as a sub-state of WALKING.

Tuned to a real rock pigeon (Columba livia). Calm by default; **hold Shift** for fast.

| Constant | Value | Note |
|----------|-------|------|
| PIGEON_HEIGHT | 0.3 | standing height (m) |
| WALK_SPEED | 1.1 | relaxed stroll (m/s) |
| WALK_RUN | 2.6 | scurry — Shift |
| FLY_SPEED | WALK_SPEED × 1.2 (≈1.32) | gentle flutter (default flight) |
| FLY_FAST | 4 | committed cruise — Shift |
| FLAP_FORCE | 3.6 | upward burst per wingbeat (m/s) |
| GRAVITY | 9.8 | m/s² |
| GLIDE_RATIO | 5 | forward:down |
| LIFT_RESPONSE | 3 | how fast lift eases sink toward glide rate |
| EYE_HEIGHT | 0.28 (very low) | |
| BODY_RADIUS | 0.22 | |

- **Landing detection**: `_getSurfaceY()` scans AABB colliders below XZ position → returns highest surface Y (ground=0 or rooftop)
- **Wall collision**: `_resolveXZ()` — AABB push-out on X or Z (shortest overlap axis), skips if pigeon above surface
- **Walking bob**: sine wave at `bobTime * 9 Hz`, amplitude 0.035
- **Peck**: 0.5s animation, head-dips via camera pitch + position offset
- **Glide**: in flight, gravity pulls down but forward airspeed generates lift that caps sink at `horizontalSpeed / GLIDE_RATIO`, eased in via `LIFT_RESPONSE`. Faster flight glides flatter; low speed stalls and drops. Climbing requires repeated flapping (each flap capped at one burst — no rocketing).
- **Takeoff**: launches mostly up with a small forward nudge (`FLY_SPEED × 0.12`).
- **Body facing**: mesh turns toward its movement direction (walk/strafe/fly), smoothed via `_faceYaw`; the camera still orbits on look-yaw. `PIGEON_YAW_OFFSET` corrects the model's native forward axis.

## Controls

| Key | Action |
|-----|--------|
| WASD | Walk / strafe (flight: steer in any horizontal direction) |
| SHIFT | Move faster (run on ground, fast cruise in air) |
| SPACE | Take off (ground) / flap (air, adds to vel.y) |
| E | Peck (walking only) |
| V | Toggle pigeon UV vision |
| C | Toggle FPV / 3rd person |
| ESC | Release pointer lock |
| Mouse | Look (yaw/pitch, pitch clamped ±1.1 rad) |

## Rendering & performance

Renderer: ACES filmic tone mapping (exposure 0.9), sRGB, PCF soft shadows (1024² map), PMREM sky environment map for IBL reflections, light `FogExp2`.

- **Human mode** renders directly (`renderer.render(scene, camera)`) — no post-processing.
- **Pigeon mode** uses the 3-camera composite (below).
- **No SSAO / bloom / DOF / transmission glass.** These were tried and removed: on integrated GPUs each was an extra full-scene render and tanked the framerate (~19→38 fps after removal). The scene is draw-call/fill-rate bound, not polygon bound (~17k tris), so the wins came from cutting passes, instancing windows/pebbles, and shrinking the shadow map — not from reducing geometry.
- The hot loop reuses scratch `Vector3`s (module-level in `controller.js`) to avoid per-frame GC.

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
| Coo | 3-note sine sweep (380→290→340 Hz), throttled to once per 3s |
| Peck | Square wave click, 900→200Hz exponential ramp |
| Land | Lowpass noise thud (220Hz cutoff) |

Audio inits on first click (Web Audio gesture requirement). Random coo on takeoff (40% chance, 200ms delay).

> `pigeonAudio.flap()` still exists but is no longer called — the wingbeat sound was removed (felt unnatural). Dead code kept intentionally.

## HUD

Top-left, fixed, monospace. Three lines:
- State: `WALKING` / `FLYING` / `PECKING`
- Vision: `HUMAN VISION` / `PIGEON VISION (UV)`
- Camera: `FPV` / `3RD PERSON`

## Pigeon model (`public/models/pigeon.glb`)

Rigged, textured GLB (stylised animated pigeon). Loaded by `models.js`, scaled to `PIGEON_HEIGHT`, wrapped in a `seatedGroup` (origin at feet), driven by an `AnimationMixer`.

Clip names are stripped of their `PigeonALL_` prefix and mapped to state:

| State | Clip |
|-------|------|
| walking (moving) | `Walk` |
| idle | `IdleLoop` |
| pecking | `Peck` |
| flying | `FlyLoop` |

Spare clips available: `TakeOff`, `Land`, `Cooing`, `Circle`, `Left`, `Right`. `_setAnim()` crossfades (0.18s); body pitch follows camera pitch × 0.6 in flight; visible only in 3rd-person.

> The source model used `KHR_materials_pbrSpecularGlossiness` (dropped by three r150+). It was converted to metal-rough with `npx @gltf-transform/cli metalrough` before use — otherwise materials render untextured.

## Known design decisions / gotchas

- **No TypeScript** — keep it that way, file sizes are tiny
- **AABB-only collision** — no mesh collision, deliberate (perf + simplicity)
- **Rooftop landing** uses `_getSurfaceY()` which returns `aabb.max.y`, so any landable surface needs a collider registered via `addAABB()` or pushed to `_colliders`
- **Garbage bags as food** use `userData.isFood = true` and `userData.uvReflective = true` — neither is consumed yet (no eat mechanic implemented)
- **Pointer lock required** for mouse look — ESC releases, click overlay re-enters
- **GLB models** load async in `main.js` via `loadModels()` before the world is built. Imported GLBs using `KHR_materials_pbrSpecularGlossiness` must be converted to metal-rough first (three dropped spec-gloss).
- **Instancing**: windows and pebbles are `InstancedMesh`. Keep them that way — reverting to per-object meshes spikes draw calls and tanks framerate on integrated GPUs.
- **No post-processing on purpose** (perf) — see Rendering section before re-adding bloom/SSAO/DOF.

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
