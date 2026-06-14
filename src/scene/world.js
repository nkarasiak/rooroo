import * as THREE from 'three';

const _colliders = [];

export function getColliders() { return _colliders; }

function addAABB(x0, y0, z0, x1, y1, z1) {
  _colliders.push({
    aabb: new THREE.Box3(
      new THREE.Vector3(x0, y0, z0),
      new THREE.Vector3(x1, y1, z1)
    )
  });
}

// ─── Procedural textures ──────────────────────────────────────────────────────

function makeAsphaltTex() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const v = 52 + (Math.random() * 18 - 9);
    d[i*4] = d[i*4+1] = d[i*4+2] = v;
    d[i*4+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.02 + Math.random()*0.07})`;
    ctx.beginPath();
    ctx.ellipse(
      Math.random()*size, Math.random()*size,
      12 + Math.random()*60, 8 + Math.random()*30,
      Math.random()*Math.PI, 0, Math.PI*2
    );
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  return tex;
}

function makeAsphaltNormalMap() {
  const size = 512;
  const heights = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) heights[i] = Math.random();
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      heights[i] = (heights[i] * 4 + heights[i-1] + heights[i+1] + heights[i-size] + heights[i+size]) / 8;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const str = 1.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = (heights[y * size + Math.min(size-1, x+1)] - heights[y * size + Math.max(0, x-1)]) * str;
      const dy = (heights[Math.min(size-1, y+1) * size + x] - heights[Math.max(0, y-1) * size + x]) * str;
      const nx = -dx, ny = -dy, nz = 1.0;
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
      const idx = i * 4;
      d[idx]   = ((nx/len) * 0.5 + 0.5) * 255;
      d[idx+1] = ((ny/len) * 0.5 + 0.5) * 255;
      d[idx+2] = ((nz/len) * 0.5 + 0.5) * 255;
      d[idx+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  return tex;
}

// Fresh concrete texture — caller sets repeat for their surface
function makeConcreteTex() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const n = Math.random() * 22 - 11;
    d[i*4]   = Math.min(255, Math.max(0, 0xb0 + n));
    d[i*4+1] = Math.min(255, Math.max(0, 0xa8 + n));
    d[i*4+2] = Math.min(255, Math.max(0, 0x98 + n));
    d[i*4+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(96, 88, 76, 0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i*64, 0); ctx.lineTo(i*64, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i*64); ctx.lineTo(256, i*64); ctx.stroke();
  }
  return canvas;
}

function concreteTopMat(repeatX, repeatZ) {
  const canvas = makeConcreteTex();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatZ);
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 });
}

function makeBrickTex(hexColor) {
  const W = 256, H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const br = (hexColor >> 16) & 0xff;
  const bg = (hexColor >> 8)  & 0xff;
  const bb =  hexColor        & 0xff;
  ctx.fillStyle = `rgb(${Math.floor(br*.55)},${Math.floor(bg*.55)},${Math.floor(bb*.55)})`;
  ctx.fillRect(0, 0, W, H);
  const bW = 30, bH = 13, mort = 2;
  let row = 0;
  for (let y = 0; y < H; y += bH + mort) {
    const off = row % 2 === 0 ? 0 : (bW + mort) / 2;
    for (let x = -bW; x < W + bW; x += bW + mort) {
      const v = Math.floor((Math.random() - 0.5) * 28);
      ctx.fillStyle = `rgb(${Math.min(255,Math.max(0,br+v))},${Math.min(255,Math.max(0,bg+v))},${Math.min(255,Math.max(0,bb+v))})`;
      ctx.fillRect(x + off + mort/2, y + mort/2, bW, bH);
    }
    row++;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 14);
  return tex;
}

// ─── Material helpers ─────────────────────────────────────────────────────────

let _asphaltMat;

function getAsphaltMat() {
  if (!_asphaltMat) {
    _asphaltMat = new THREE.MeshStandardMaterial({
      map: makeAsphaltTex(),
      normalMap: makeAsphaltNormalMap(),
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.95, metalness: 0,
    });
  }
  return _asphaltMat;
}

function stdMat(color, roughness = 0.85, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(w, h, d, mat, x, y, z, cast = true, receive = true) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    typeof mat === 'number' ? stdMat(mat) : mat
  );
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// ─── Scene objects ────────────────────────────────────────────────────────────

// Windows on all 4 building faces
function addWindowsOnFaces(scene, bx, bz, bw, bh, bd) {
  const litMat = new THREE.MeshStandardMaterial({
    color: 0xffe8a0, emissive: 0xffcc44, emissiveIntensity: 1.0,
    roughness: 0.15, metalness: 0.2,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1a2a40, emissive: 0x0a1020, emissiveIntensity: 0.1,
    roughness: 0.08, metalness: 0.8,
  });
  const rows = Math.floor(bh / 3);
  const wW = 0.65, wH = 0.85, startY = 1.5, spacingY = 2.5;
  for (const [fz, rotY] of [[bz + bd/2 + 0.01, 0], [bz - bd/2 - 0.01, Math.PI]]) {
    const cols = Math.max(2, Math.floor(bw / 2.5));
    const spacingX = bw / (cols + 1);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wW, wH), Math.random() > 0.28 ? litMat : darkMat);
      m.position.set(bx - bw/2 + spacingX*(c+1), startY + r*spacingY, fz);
      m.rotation.y = rotY;
      scene.add(m);
    }
  }
  for (const [fx, rotY] of [[bx - bw/2 - 0.01, -Math.PI/2], [bx + bw/2 + 0.01, Math.PI/2]]) {
    const cols = Math.max(2, Math.floor(bd / 2.5));
    const spacingZ = bd / (cols + 1);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wW, wH), Math.random() > 0.28 ? litMat : darkMat);
      m.position.set(fx, startY + r*spacingY, bz - bd/2 + spacingZ*(c+1));
      m.rotation.y = rotY;
      scene.add(m);
    }
  }
}

// Floor-plate ledges + stone base band
function addBuildingDetails(scene, bx, bz, bw, bh, bd) {
  const baseMat = stdMat(0x6a6055, 0.82);
  const ledgeMat = stdMat(0x767570, 0.75);
  scene.add(box(bw + 0.24, 1.2, bd + 0.24, baseMat, bx, 0.6, bz));
  for (let y = 4; y <= bh - 1; y += 4)
    scene.add(box(bw + 0.18, 0.12, bd + 0.18, ledgeMat, bx, y, bz, false, false));
  scene.add(box(bw + 0.36, 0.22, bd + 0.36, stdMat(0x555550, 0.7), bx, bh + 0.11, bz, false, false));
  for (let i = 0; i < 2; i++)
    scene.add(box(1.2, 0.7, 0.9, stdMat(0x888888, 0.5, 0.2), bx + (i - 0.5)*3.5, bh + 0.55, bz + (i%2===0 ? 2.5 : -2.5)));
}

function addGarbageBin(scene, x, z) {
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.30, 1.0, 12), stdMat(0x3a5c3a, 0.7, 0.1));
  body.position.set(x, 0.5, z);
  body.castShadow = true;
  scene.add(body);
  scene.add(box(0.84, 0.1, 0.84, stdMat(0x2a4a2a, 0.65, 0.05), x, 1.05, z));
  addAABB(x - 0.42, 0, z - 0.42, x + 0.42, 1.1, z + 0.42);
}

function addGarbageBag(scene, x, z) {
  const geo = new THREE.SphereGeometry(0.32, 8, 7);
  geo.scale(1.0, 0.75, 1.2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x009966, emissive: 0x003322, emissiveIntensity: 0.3, roughness: 0.7 });
  const bag = new THREE.Mesh(geo, mat);
  bag.position.set(x, 0.24, z);
  bag.castShadow = true;
  bag.userData.isFood = true;
  bag.userData.uvReflective = true;
  scene.add(bag);
}

// surfaceY = height of the ground plane this object sits on (0=road, 0.20=sidewalk)
function addBench(scene, x, z, surfaceY = 0) {
  const wood = stdMat(0x7a5914, 0.82);
  const metal = stdMat(0x505050, 0.45, 0.5);
  addAABB(x - 1.05, surfaceY,       z - 0.42, x + 1.05, surfaceY + 0.52, z + 0.42);
  addAABB(x - 1.05, surfaceY,       z - 0.55, x + 1.05, surfaceY + 1.10, z - 0.38);
  for (let i = -1; i <= 1; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.22), wood);
    slat.position.set(x, surfaceY + 0.48, z + i * 0.26);
    slat.castShadow = true;
    scene.add(slat);
  }
  for (let i = 0; i < 2; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.22), wood);
    slat.position.set(x, surfaceY + 0.82 + i * 0.22, z - 0.46);
    slat.rotation.x = 0.15;
    slat.castShadow = true;
    scene.add(slat);
  }
  for (const lx of [-0.85, 0.85]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.48, 0.8), metal);
    leg.position.set(x + lx, surfaceY + 0.24, z);
    scene.add(leg);
  }
}

function addStreetLamp(scene, x, z, surfaceY = 0) {
  const poleMat = stdMat(0x484848, 0.45, 0.45);
  scene.add(box(0.12, 4.5, 0.12, poleMat, x, surfaceY + 2.25, z));
  scene.add(box(0.08, 0.08, 0.65, poleMat, x, surfaceY + 4.55, z + 0.32));
  scene.add(box(0.78, 0.18, 0.28, stdMat(0x555555, 0.4, 0.38), x, surfaceY + 4.70, z + 0.62));
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffffd0, emissive: 0xffffaa, emissiveIntensity: 4.0, roughness: 0.1,
  });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), bulbMat);
  bulb.position.set(x, surfaceY + 4.52, z + 0.62);
  scene.add(bulb);
  const light = new THREE.PointLight(0xffe880, 2.2, 14, 2);
  light.position.set(x, surfaceY + 4.38, z + 0.62);
  scene.add(light);
}

function addTree(scene, x, z, surfaceY = 0) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 1.8, 8),
    stdMat(0x5a3a1a, 0.95)
  );
  trunk.position.set(x, surfaceY + 0.9, z);
  trunk.castShadow = true;
  scene.add(trunk);
  const mats = [stdMat(0x2a5424, 0.92), stdMat(0x336628, 0.9), stdMat(0x1f4a1f, 0.93)];
  for (const [dy, r, mi] of [[2.5, 1.2, 0], [3.35, 0.85, 1], [1.8, 0.75, 2]]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mats[mi]);
    f.position.set(x, surfaceY + dy, z);
    f.castShadow = true;
    scene.add(f);
  }
}

function addFireHydrant(scene, x, z, surfaceY = 0) {
  const mat = stdMat(0xcc2200, 0.4, 0.15);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.55, 10), mat);
  body.position.set(x, surfaceY + 0.275, z);
  body.castShadow = true;
  scene.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.12, 10), mat);
  top.position.set(x, surfaceY + 0.61, z);
  scene.add(top);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 5), stdMat(0xaa1100, 0.4, 0.2));
  cap.position.set(x, surfaceY + 0.69, z);
  scene.add(cap);
  for (const angle of [0, Math.PI]) {
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.09, 6),
      stdMat(0x881800, 0.4, 0.2)
    );
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(x + Math.cos(angle)*0.19, surfaceY + 0.35, z + Math.sin(angle)*0.19);
    scene.add(nozzle);
  }
}

function addManhole(scene, x, z) {
  const cover = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.46, 0.04, 24),
    stdMat(0x585858, 0.58, 0.55)
  );
  cover.position.set(x, 0.02, z);
  cover.receiveShadow = true;
  scene.add(cover);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.43, 0.04, 6, 24),
    stdMat(0x3c3c3c, 0.55, 0.65)
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, 0.05, z);
  scene.add(ring);
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildWorld(scene) {
  _colliders.length = 0;
  _asphaltMat = null;

  // ── Road ──────────────────────────────────────────────────────────────────
  const ground = new THREE.Mesh(new THREE.BoxGeometry(70, 0.2, 70), getAsphaltMat());
  ground.position.set(0, -0.1, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  // Wet sheen over road (damp city street)
  const wetRoad = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 28),
    new THREE.MeshStandardMaterial({ color: 0x2233bb, roughness: 0.04, metalness: 0.12, transparent: true, opacity: 0.14 })
  );
  wetRoad.rotation.x = -Math.PI / 2;
  wetRoad.position.set(0, 0.005, 0);
  scene.add(wetRoad);

  // ── Sidewalks — 20 cm raised, multi-material (concrete top, stone sides) ──
  // The raised side face IS the curb — no separate curb geometry needed.
  // AABBs make surfaceY=0.20 for physics and block walk-on from road level.
  const SW_H   = 0.40;   // slab height (−0.20 to +0.20, top at y=0.20)
  const SW_TOP = 0.20;   // surface height above road
  const swSideMat = stdMat(0x969088, 0.78);  // stone/concrete curb face

  const sidewalkDefs = [
    // w,   d,   cx,    cz,    rX, rZ, aabb
    [70,   7,   0,    -17.5,  16,  2, [-35, 0, -21,  35, SW_TOP, -14]],
    [70,   7,   0,     17.5,  16,  2, [-35, 0,  14,  35, SW_TOP,  21]],
    [7,   70,  -17.5,  0,      2, 16, [-21, 0, -35, -14, SW_TOP,  35]],
    [7,   70,   17.5,  0,      2, 16, [14,  0, -35,  21, SW_TOP,  35]],
  ];

  for (const [w, d, cx, cz, rX, rZ, aabb] of sidewalkDefs) {
    const topMat = concreteTopMat(rX, rZ);
    // Material array: [+X, -X, +Y(top), -Y(bottom), +Z, -Z]
    const mats = [swSideMat, swSideMat, topMat, swSideMat, swSideMat, swSideMat];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, SW_H, d), mats);
    m.position.set(cx, 0, cz);  // center y=0 → top surface at y=+0.20
    m.receiveShadow = true;
    scene.add(m);
    addAABB(...aabb);
  }

  // ── Road markings ─────────────────────────────────────────────────────────
  const markMat = stdMat(0xeeeecc, 0.85);
  for (let i = -5; i <= 5; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 2.5), markMat);
    m.position.set(0, 0.01, i * 4.5);
    scene.add(m);
  }

  // Crosswalk stripes
  const crossMat = stdMat(0xddddbc, 0.9);
  for (let i = 0; i < 6; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.01, 5.0), crossMat);
    stripe.position.set(-3.25 + i * 1.3, 0.01, -11.5);
    scene.add(stripe);
  }

  // ── Buildings ─────────────────────────────────────────────────────────────
  const buildings = [
    { w: 14, h: 22, d: 14, color: 0x8b7a5c, x: -23, z: -23, roughness: 0.82 },
    { w: 12, h: 18, d: 12, color: 0x7a8b9c, x:  23, z: -23, roughness: 0.65 },
    { w: 14, h: 28, d: 14, color: 0x9c8870, x: -23, z:  23, roughness: 0.85 },
    { w: 12, h: 20, d: 12, color: 0x6b7c60, x:  23, z:  23, roughness: 0.75 },
  ];
  for (const { w, h, d, color, x, z, roughness } of buildings) {
    const bmat = new THREE.MeshStandardMaterial({ map: makeBrickTex(color), roughness, metalness: 0 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bmat);
    b.position.set(x, h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
    _colliders.push({ mesh: b, aabb: new THREE.Box3().setFromObject(b) });
    addWindowsOnFaces(scene, x, z, w, h, d);
    addBuildingDetails(scene, x, z, w, h, d);
  }

  // ── Street furniture — lamps on sidewalk (z=±15), objects with surfaceY ──
  for (const [x, z] of [[-11, -15], [11, -15], [-11, 15], [11, 15]])
    addStreetLamp(scene, x, z, SW_TOP);

  addGarbageBin(scene, -8, -13);
  addGarbageBin(scene,  8,  13);

  addGarbageBag(scene, -6.5, -11.5);
  addGarbageBag(scene,  9.5,  13.8);
  addGarbageBag(scene, -5.0, -12.0);

  addBench(scene, 0, -15.5, SW_TOP);

  // ── Puddles ───────────────────────────────────────────────────────────────
  for (const [px, pz, pr] of [[4, 5, 1.0], [-2.5, -3, 0.55]]) {
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(pr, 20),
      new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.02, metalness: 0.35, transparent: true, opacity: 0.75 })
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(px, 0.02, pz);
    puddle.userData.uvReflective = true;
    scene.add(puddle);
  }

  // ── Sidewalk props (surfaceY=SW_TOP) ──────────────────────────────────────
  for (const [x, z] of [[-13, -16.5], [13, -16.5], [-13, 16.5], [13, 16.5]])
    addTree(scene, x, z, SW_TOP);

  addFireHydrant(scene, 15, -16.5, SW_TOP);
  addFireHydrant(scene, -15, 16.5, SW_TOP);

  // ── Road details ──────────────────────────────────────────────────────────
  addManhole(scene, -3, 2);
  addManhole(scene, 5, -8);

  const pebbleMat = stdMat(0x888070, 0.95);
  for (let i = 0; i < 20; i++) {
    const r = 0.04 + Math.random() * 0.06;
    const peb = new THREE.Mesh(new THREE.SphereGeometry(r, 4, 3), pebbleMat);
    peb.position.set((Math.random() - 0.5) * 24, r * 0.5, (Math.random() - 0.5) * 24);
    scene.add(peb);
  }
}
