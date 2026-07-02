# Unity port — editor wiring

C# scripts are done (`Assets/Scripts/`). These steps need the Unity editor GUI.

## 1. Create the project
- Unity Hub → New Project → **Universal 3D (URP)**, Unity 6 LTS. Point it at this `unity/` folder
  (or create elsewhere and copy `Assets/Scripts/` in).

## 2. Scene
- New scene. Delete the default Cube.
- **Main Camera**: near clip `0.1`, far clip `2000`, FOV `60`. Add `PigeonController` + `Hud`.
- Empty GameObject **City**: add `CityGen`.
- Wire references: `PigeonController.city` → City; `Hud.pigeon` → Main Camera.

## 3. Materials (Assets/Materials, all URP/Lit)
- `lowRiseMat` (dark brick/brown), `midRiseMat` (limestone/grey), `skyMat` (steel/glass).
  **Enable GPU Instancing** on each (checkbox on the material).
- `groundMat` (dark asphalt), `parkMat` (green), `waterMat` (deep blue).
- Assign all six on the CityGen component.

## 4. Lighting
- Directional Light: rotation so it points roughly along `(0.85,0.62,0.55)`, warm tint.
- URP Volume (optional, Phase 4): Tonemapping = ACES to match the web look.

## 5. Run
Press Play. WASD move · Shift fast · Space takeoff/flap · mouse look · Esc release · R respawn · 2 perch.

Build: File → Build Settings → Windows → Build.

See the full plan: `~/.claude/plans/can-you-plan-a-nested-sunset.md`.
