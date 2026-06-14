import * as THREE from 'three/webgpu';
import { MATERIAL_CLASSES } from './cityGen.js';

// Build the city meshes from a CityLayout, instancing aggressively so the draw
// count stays flat regardless of how many buildings exist.
//
//   materials = {
//     asphalt, sidewalkTop, sidewalkSide,
//     shells: { brickA, brickB, concrete, glass },
//     windowLit, windowDark,
//   }
//
// `grid` is a ColliderGrid; every building + sidewalk slab registers an AABB.
export function buildCity(scene, grid, layout, materials) {
  const { params: P, blocks, bounds } = layout;
  const baseY = P.sidewalkH;

  // ── Road: one big asphalt plane under everything ──────────────────────────
  const roadW = bounds.maxX - bounds.minX + P.street;
  const road = new THREE.Mesh(new THREE.BoxGeometry(roadW, 0.2, roadW), materials.asphalt);
  road.position.set(0, -0.1, 0);
  road.receiveShadow = true;
  scene.add(road);

  // ── Sidewalk slabs: one InstancedMesh of a unit-top box per block ─────────
  const slabGeo = new THREE.BoxGeometry(1, 0.4, 1);   // top face at +0.2 when centred at y=0
  const slabMats = [
    materials.sidewalkSide, materials.sidewalkSide, materials.sidewalkTop,
    materials.sidewalkSide, materials.sidewalkSide, materials.sidewalkSide,
  ];
  const slabs = new THREE.InstancedMesh(slabGeo, slabMats, blocks.length);
  slabs.receiveShadow = true;
  const dummy = new THREE.Object3D();
  blocks.forEach((b, i) => {
    const w = b.rect.x1 - b.rect.x0;
    const d = b.rect.z1 - b.rect.z0;
    dummy.position.set(b.cx, 0, b.cz);
    dummy.scale.set(w, 1, d);
    dummy.updateMatrix();
    slabs.setMatrixAt(i, dummy.matrix);
    grid.addAABB(b.rect.x0, 0, b.rect.z0, b.rect.x1, baseY, b.rect.z1);
  });
  slabs.instanceMatrix.needsUpdate = true;
  scene.add(slabs);

  // ── Buildings: one InstancedMesh per material class (unit box scaled) ──────
  const byClass = Object.fromEntries(MATERIAL_CLASSES.map((c) => [c, []]));
  for (const b of blocks)
    for (const lot of b.lots) byClass[lot.materialClass].push(lot);

  const litMatrices = [];
  const darkMatrices = [];
  const shellGeo = new THREE.BoxGeometry(1, 1, 1);

  for (const cls of MATERIAL_CLASSES) {
    const lots = byClass[cls];
    if (!lots.length) continue;
    const im = new THREE.InstancedMesh(shellGeo, materials.shells[cls], lots.length);
    im.castShadow = true;
    im.receiveShadow = true;
    const col = new THREE.Color();
    lots.forEach((lot, i) => {
      const cy = baseY + lot.height / 2;
      dummy.position.set(lot.center.x, cy, lot.center.z);
      dummy.scale.set(lot.w, lot.height, lot.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      // Per-instance tint multiplies the shared texture → breaks the "identical
      // clone" look across buildings that share one material.
      let s = lot.seed >>> 0;
      const r = () => { s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0; return (s & 0xffff) / 65536; };
      const t = 0.8 + r() * 0.35;
      const warm = (r() - 0.5) * 0.09;
      col.setRGB(t + warm, t, t - warm * 0.6);
      im.setColorAt(i, col);
      // Roof-landing + wall collider.
      grid.addAABB(lot.rect.x0, 0, lot.rect.z0, lot.rect.x1, baseY + lot.height, lot.rect.z1);
      collectWindows(lot, baseY, cls, litMatrices, darkMatrices);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scene.add(im);
  }

  // ── Windows: two global InstancedMesh (lit / dark) for the whole city ─────
  const winGeo = new THREE.PlaneGeometry(0.7, 1.0);
  for (const [mats, mat] of [[litMatrices, materials.windowLit], [darkMatrices, materials.windowDark]]) {
    if (!mats.length) continue;
    const im = new THREE.InstancedMesh(winGeo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
  }

  return {
    drawInfo: {
      blocks: blocks.length,
      buildings: blocks.reduce((n, b) => n + b.lots.length, 0),
      windows: litMatrices.length + darkMatrices.length,
    },
  };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

// Append window matrices (world space) for one building's four faces.
function collectWindows(lot, baseY, cls, lit, dark) {
  const { rect, height, litRatio, seed } = lot;
  const bw = rect.x1 - rect.x0;
  const bd = rect.z1 - rect.z0;
  const cx = (rect.x0 + rect.x1) / 2;
  const cz = (rect.z0 + rect.z1) / 2;

  const startY = baseY + 3.4;        // ground floor reserved for shops
  const spacingY = cls === 'glass' ? 1.9 : 2.5;
  const top = baseY + height - 1.0;
  if (top <= startY) return;
  const rows = Math.floor((top - startY) / spacingY);

  // Cheap deterministic per-window lit/dark from the lot seed.
  let s = seed >>> 0;
  const rand = () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0); return (s & 0xffff) / 65536; };

  const place = (x, y, z, rotY) => {
    _e.set(0, rotY, 0);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _m.compose(_p, _q, _s);
    (rand() < litRatio ? lit : dark).push(_m.clone());
  };

  for (const [fz, rotY] of [[cz + bd / 2 + 0.02, 0], [cz - bd / 2 - 0.02, Math.PI]]) {
    const cols = Math.max(1, Math.floor(bw / 2.4));
    const sx = bw / (cols + 1);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) place(rect.x0 + sx * (c + 1), startY + r * spacingY, fz, rotY);
  }
  for (const [fx, rotY] of [[cx - bw / 2 - 0.02, -Math.PI / 2], [cx + bw / 2 + 0.02, Math.PI / 2]]) {
    const cols = Math.max(1, Math.floor(bd / 2.4));
    const sz = bd / (cols + 1);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) place(fx, startY + r * spacingY, rect.z0 + sz * (c + 1), rotY);
  }
}
