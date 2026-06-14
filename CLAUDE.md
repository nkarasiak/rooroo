# Pigeon Sim — CLAUDE.md

## Concept

First-person phenomenological pigeon simulator. You live the ordinary life of a city pigeon: walk a sidewalk, peck at garbage, flap to a rooftop, coo at nothing. The goal is felt experience, not gameplay. Every system serves that — the UV tetrachromat vision, the low eye-height, the head-bob, the procedural coo. No scoring, no objectives.

## Stack

- **Three.js** (r184) on **WebGPURenderer + TSL** — imported from `three/webgpu` and `three/tsl` (NOT bare `three` — mixing the two builds gives duplicate class identities and breaks `instanceof`/material-type checks). WebGL2 auto-fallback when `navigator.gpu` is absent.
- **Vite** — dev server + bundler
- Plain ES modules, no TypeScript, no framework
- **CC0 GLB models** (Quaternius / Poly Pizza) for organic/complex props; procedural generation for the city; **CC0 PBR textures** (ambientCG) for surfaces.
- **KTX2 / Basis** GPU-compressed textures (`KTX2Loader` + basis transcoder in `public/basis/`).

```
npm run dev    # dev server at localhost:3000  (see vite.config.js — NOT 5173)
npm run build  # production build
```

**Build tools / packages used during the overhaul:**
- `three@latest` (r184) — `npm i three@latest`.
- `ktx` (KTX-Software v4.4) for KTX2 encoding — installed non-admin via **`scoop install ktx-software`**.
- Texture acquisition: ambientCG CC0 sets fetched with **Python `urllib`** (the `Bash`/`curl` path is wrapped by an rtk proxy that mangles output — use Python or `rtk proxy curl`).

## Source layout

```
src/
  main.js                 entry point: WebGPURenderer (await init), scene, env map,
                          model+texture preload, setAnimationLoop render loop
  scene/
    world.js              orchestration: gen city, build material palette, plaza dressing,
                          puddles, collider grid. Keeps prop builders + (dead) texture factories
    cityGen.js            pure seeded layout → CityLayout (blocks → lots), renderer-agnostic
    cityBuilder.js        CityLayout → instanced meshes (shells/windows/sidewalks) + grid colliders
    colliderGrid.js       spatial hash over AABB colliders (queryXZ)
    rng.js                mulberry32 seeded PRNG + hashSeed/range/pick helpers
    textures.js           KTX2Loader → shared CC0 PBR texture registry
    lighting.js           SkyMesh (node Preetham) + sun (shadows) + hemisphere + fill
    models.js             GLTFLoader + helpers (loadModels, fitHeight, seatedGroup)
  pigeon/
    controller.js         physics, input, state machine, camera, GLB pigeon + AnimationMixer
  vision/
    pigeonVision.js       UV tetrachromat vision — 3-camera TSL NodeMaterial composite
  audio/
    pigeonAudio.js        procedural Web Audio: ambience, coo, peck, land
public/
  models/                 CC0 GLB assets (pigeon, car, car_police, tree, tree_pine)
  textures/<key>/         CC0 PBR sets as KTX2: {color,normal,rough}.ktx2
                          (asphalt, sidewalk, brickA/B/C, concrete, plaster, glass)
  basis/                  basis_transcoder.{js,wasm} for KTX2Loader
index.html                HUD overlay, controls splash, CSS
```

Scale: **1 world unit ≈ 1 metre** throughout (buildings ~9–34 m, pigeon 0.3 m).

## World — procedural multi-block city

Generated from a seed (`cityGen.js`), not hand-placed. Default 5×5 blocks, pitch 50 (blockSize 38 + street 12), centred on origin → extent ≈ ±125 (world hard-clamp = `layout.bounds`, fed to the controller; no fixed ±30 anymore).

**Generation (`cityGen.js`, pure data):** grid of blocks → each block's inner area recursively binary-sliced into lots (Parish-Müller style) → each lot gets footprint, height (taller toward downtown centre), `materialClass`, window grid, seed. One `citySeed` + per-lot `hashSeed` so editing one lot doesn't reshuffle the city.

**Build (`cityBuilder.js`, instancing keeps draw count flat regardless of city size):**
- Road: one big asphalt plane over the whole bounds.
- Sidewalks: ONE `InstancedMesh` (unit box per block), top at y=0.2.
- Building shells: ONE `InstancedMesh` of a unit box **per material class** (~6 classes: brickA/B/C, concrete, plaster, glass), scaled per lot. Per-instance tint via `setColorAt` breaks the clone look.
- Windows: TWO global `InstancedMesh` (lit/dark) for the **entire city** — 2 draws total.
- Each building + sidewalk slab registers an AABB into the `ColliderGrid`.

**Centre block = open plaza** for the pigeon's spawn; all hand-placed pigeon-relevant dressing lives here: 4 street lamps, 2 bins, 3 garbage bags (**food targets**, UV glow via zero-red `0x009966`), bench, 4 trees (GLB + planter AABB), parked cars (on the bordering streets), fire hydrants, manholes, pebbles (single InstancedMesh), 2 puddles (main = live `CubeCamera` reflection; both `uvReflective`).

Whole-city budget ≈ ~140 draws → flat as the city grows; the instanced-window pool and per-class shells are the key levers (frustum culling barely helps because pigeon vision spans ~300°).

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

`WebGPURenderer` (from `three/webgpu`): ACES filmic tone mapping (exposure 1.15), sRGB, PCF soft shadows (1024² map), PMREM sky environment map for IBL, `FogExp2` (0.0045). Camera far 350 (city extent).

- **Init is async** — `await renderer.init()` in `main.js` MUST run before PMREM, `captureReflections`, and the first render, or the GPU work fails silently (black screen). Render loop is `renderer.setAnimationLoop(...)`.
- **Standard materials auto-convert.** `MeshStandardMaterial`/instanced/emissive/transparent all render unchanged on WebGPU — they're substituted with node equivalents at render time. Only raw `ShaderMaterial`/GLSL needs porting to TSL (the only one was the pigeon-vision composite). `MeshStandardNodeMaterial` is used where a custom `colorNode`/`normalNode` is needed.
- `Sky` (WebGL-only GLSL) → `SkyMesh` (node Preetham); uniforms are TSL `uniform()` (`.value`).
- **Human mode** renders directly; **pigeon mode** uses the 3-camera composite (below).
- **Still draw-call / fill-rate bound on integrated GPUs, not polygon bound.** No SSAO/bloom/DOF/transmission (each was an extra full-scene pass — removed long ago, ~19→38 fps). **Lesson re-confirmed:** a TSL detile node (2 texture samples + 2 `mx_noise_float`) on the big ground plane crashed fps 36→1. **Per-fragment shader work over large fill area is not viable here** — any tiling-break must be per-instance / per-vertex, never per-fragment. WebGPU's win here is draw-call overhead + instancing for the city, not fill rate.
- The hot loop reuses scratch `Vector3`s (module-level in `controller.js`) to avoid per-frame GC.

## Vision system (`pigeonVision.js`)

Pigeon tetrachromat simulation via 3-camera compositing shader.

**Field of view geometry:**
- Total horizontal: 300° (150° left, 150° right, 60° blind spot behind)
- Left eye: 120° FOV, axis at −90° from forward
- Right eye: 120° FOV, axis at +90° from forward
- Center binocular: 60° FOV, forward axis

**Render pipeline:**
1. Render `leftCam` → 512×512 `RenderTarget`
2. Render `centerCam` → 512×512 `RenderTarget`
3. Render `rightCam` → 512×512 `RenderTarget`
4. Full-screen quad **TSL `NodeMaterial`** composites all three using perspective-correct UV mapping (`colorNode` Fn; clip-space `vertexNode` to bypass MVP). All three eyes are sampled unconditionally then selected by angle — texture reads must stay in uniform control flow on WebGPU. **RT V is flipped on the WebGPU backend** (origin top-left vs WebGL bottom-left), gated by `renderer.backend.isWebGPUBackend`.

**Camera sync (`_syncCameras`):**
- `leftCam.rotation.y = mc.rotation.y + sideAngleRad` (looks left)
- `rightCam.rotation.y = mc.rotation.y - sideAngleRad` (looks right)
- Side cam pitch = `mc.rotation.x` (full pitch — matches center seam)

> Note: positive Y rotation in Three.js (YXZ order) rotates camera toward -X (left). Swap the signs and you get a left/right flip bug.

**UV food glow:** Garbage bags use `color: 0x009966` (zero red channel). The shader maps `uvChan = 1.0 - red` so they appear vivid in pigeon vision.

**Seam softening:** hairline darkening at u=0.4 and u=0.6 (the ±30° binocular boundaries).

## Textures (`textures.js`) — CC0 PBR + KTX2

Eight ambientCG CC0 sets (asphalt=Asphalt031, sidewalk=Concrete047A, brickA=Bricks097, brickB=Bricks060, brickC=Bricks051, concrete=Concrete046, plaster=Plaster007, glass=Facade006), each as `color`/`normal`/`rough`. Loaded once via `KTX2Loader` and shared across all instanced geometry (one material per surface class → flat VRAM).

- **KTX2 stays GPU-compressed → ~6× less VRAM** than decoded JPG/PNG. `KTX2Loader.setTranscoderPath('basis/').detectSupport(renderer)`; transcoder in `public/basis/`.
- `colorSpace`: albedo `SRGBColorSpace`, normal/rough `NoColorSpace`. `RepeatWrapping`, anisotropy 8.
- Materials built in `world.js#buildCityMaterials` via `pbrMat(set, repeatX, repeatY)`. The road repeat scales to the ground-plane size.

**Regenerating textures** (served JPGs were deleted — KTX2 is the runtime asset):
1. Download ambientCG zips (`https://ambientcg.com/get?file=<AssetId>_1K-JPG.zip`) via Python `urllib` (rtk mangles `curl`), extract `_Color/_NormalGL/_Roughness.jpg`.
2. Encode (KTX-Software `ktx`, via `scoop install ktx-software`):
   - color:  `ktx create --encode basis-lz --format R8G8B8A8_SRGB  --assign-tf srgb   --generate-mipmap in out.ktx2`
   - rough:  `ktx create --encode basis-lz --format R8G8B8A8_UNORM --assign-tf linear --generate-mipmap in out.ktx2`
   - normal: `ktx create --encode uastc --uastc-quality 2 --zstd 18 --format R8G8B8A8_UNORM --assign-tf linear --generate-mipmap in out.ktx2`
   (UASTC preserves normal gradients; ETC1S/BasisLZ would band them. `--zstd` is only valid with UASTC, not BasisLZ.)

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
- **Import from `three/webgpu`** (and `three/tsl`) in every app module — never bare `three`. Mixing builds = duplicate class identities → broken `instanceof`/material checks.
- **AABB-only collision via `ColliderGrid`** (spatial hash). The controller calls `this.colliders.queryXZ(x, z, BODY_RADIUS)` (NOT a full scan) in `_getSurfaceY` and `_resolveXZ`. Register colliders with `grid.addAABB(...)`; world hard-clamp comes from `layout.bounds` (passed to the controller as `bound`).
- **Rooftop landing** uses `_getSurfaceY()` → highest `aabb.max.y` under the pigeon's XZ; every building registers a full-height AABB.
- **Garbage bags as food** use `userData.isFood`/`uvReflective` — not consumed yet.
- **Pointer lock required** for mouse look — ESC releases, click overlay re-enters.
- **GLB models** load async in `main.js` via `loadModels()` (parallel with `loadCityTextures()`) before the world is built. Spec-gloss GLBs must be converted to metal-rough (three dropped `KHR_materials_pbrSpecularGlossiness`).
- **Instancing is mandatory** for shells/windows/sidewalks/pebbles — reverting to per-object meshes spikes draw calls and tanks framerate on integrated GPUs.
- **No post-processing, no per-fragment shader tricks on big surfaces** (perf) — see Rendering section before re-adding bloom/SSAO/DOF or shader detiling.
- **Dead code left intentionally** in `world.js`: the old procedural Canvas texture factories (`getAsphaltMat`, `brickMaterial`, `concreteTopMat`, `normalFromLuminance`) and the single-block detail builders (`addWindowsOnFaces`, `addBuildingDetails`, `addStorefront`, `makeSignTexture`, `makeStripeTexture`) — superseded by the city builder + KTX2 textures, kept for possible storefront-on-detail-ring reuse.

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
