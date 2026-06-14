import * as THREE from 'three/webgpu';
import { enableShadows, fitHeight, fitLength, seatedGroup } from './models.js';
import { ColliderGrid } from './colliderGrid.js';
import { generateCity } from './cityGen.js';
import { buildCity } from './cityBuilder.js';

let _grid = new ColliderGrid(16);

export function getColliders() { return _grid; }

function addAABB(x0, y0, z0, x1, y1, z1) {
  _grid.addAABB(x0, y0, z0, x1, y1, z1);
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
  const normalMap = normalFromLuminance(canvas, repeatX, repeatZ, 1.6);
  return new THREE.MeshStandardMaterial({
    map: tex, normalMap, normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.9, metalness: 0,
  });
}

function makeBrickCanvas(hexColor) {
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
  return canvas;
}

// Derive a tangent-space normal map from the luminance of a source canvas.
// Mortar lines (dark) become recessed grooves — cheap relief with no extra assets.
function normalFromLuminance(srcCanvas, repeatX, repeatZ, strength = 2.5) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const src = srcCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const lum = (x, y) => {
    const i = (((y + h) % h) * w + ((x + w) % w)) * 4;
    return (src[i] * 0.299 + src[i+1] * 0.587 + src[i+2] * 0.114) / 255;
  };
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
    const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
    const nx = -dx, ny = -dy, nz = 1.0;
    const len = Math.hypot(nx, ny, nz);
    const i = (y * w + x) * 4;
    d[i]   = (nx / len * 0.5 + 0.5) * 255;
    d[i+1] = (ny / len * 0.5 + 0.5) * 255;
    d[i+2] = (nz / len * 0.5 + 0.5) * 255;
    d[i+3] = 255;
  }
  octx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatZ);
  return tex;
}

function brickMaterial(hexColor, roughness) {
  const canvas = makeBrickCanvas(hexColor);
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 14);
  const normalMap = normalFromLuminance(canvas, 6, 14, 3.0);
  return new THREE.MeshStandardMaterial({
    map, normalMap, normalScale: new THREE.Vector2(0.7, 0.7),
    roughness, metalness: 0,
  });
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
// All windows on a building are drawn with two InstancedMesh (lit + dark)
// instead of one mesh each — keeps draw calls flat regardless of count.
function addWindowsOnFaces(scene, bx, bz, bw, bh, bd) {
  const litMat = new THREE.MeshStandardMaterial({
    color: 0xffe8a0, emissive: 0xffcc44, emissiveIntensity: 0.5,
    roughness: 0.15, metalness: 0.2,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1a2a40, emissive: 0x0a1020, emissiveIntensity: 0.1,
    roughness: 0.08, metalness: 0.8,
  });
  const wW = 0.65, wH = 0.85, startY = 4.4, spacingY = 2.5;  // ground floor reserved for shops
  const rows = Math.max(2, Math.floor((bh - startY) / spacingY));
  const dummy = new THREE.Object3D();
  const lit = [], dark = [];

  const place = (x, y, z, rotY) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    (Math.random() > 0.28 ? lit : dark).push(dummy.matrix.clone());
  };

  for (const [fz, rotY] of [[bz + bd/2 + 0.01, 0], [bz - bd/2 - 0.01, Math.PI]]) {
    const cols = Math.max(2, Math.floor(bw / 2.5));
    const spacingX = bw / (cols + 1);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      place(bx - bw/2 + spacingX*(c+1), startY + r*spacingY, fz, rotY);
  }
  for (const [fx, rotY] of [[bx - bw/2 - 0.01, -Math.PI/2], [bx + bw/2 + 0.01, Math.PI/2]]) {
    const cols = Math.max(2, Math.floor(bd / 2.5));
    const spacingZ = bd / (cols + 1);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      place(fx, startY + r*spacingY, bz - bd/2 + spacingZ*(c+1), rotY);
  }

  const geo = new THREE.PlaneGeometry(wW, wH);
  for (const [mats, mat] of [[lit, litMat], [dark, darkMat]]) {
    if (!mats.length) continue;
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
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

// GLB tree, scaled and seated, with a small concrete planter at its base.
function addTree(scene, model, x, z, surfaceY = 0, height = 4.6, yaw = 0) {
  const inner = model.clone(true);
  fitHeight(inner, height);
  inner.rotation.y = yaw;
  enableShadows(inner);
  const g = seatedGroup(inner);
  g.position.set(x, surfaceY, z);
  scene.add(g);

  // Planter curb
  const planter = box(1.3, 0.32, 1.3, stdMat(0x7a7268, 0.85), x, surfaceY + 0.16, z);
  planter.receiveShadow = true;
  scene.add(planter);
  addAABB(x - 0.65, surfaceY, z - 0.65, x + 0.65, surfaceY + 0.32, z + 0.65);
}

// GLB car parked at road level, aligned to the curb, with an AABB collider.
function addCar(scene, model, x, z, yaw, len = 4.3) {
  const inner = model.clone(true);
  fitLength(inner, len);
  enableShadows(inner);
  const g = seatedGroup(inner);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  scene.add(g);

  const wb = new THREE.Box3().setFromObject(g);
  addAABB(wb.min.x + 0.1, 0, wb.min.z + 0.1, wb.max.x - 0.1, wb.max.y, wb.max.z - 0.1);
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

// ─── Shop signage / awning textures ────────────────────────────────────────────

function makeSignTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 110, 512, 18);  // base shadow
  ctx.fillStyle = fg;
  ctx.font = 'bold 70px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 60);
  return new THREE.CanvasTexture(c);
}

function makeStripeTexture(colA, colB) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  const n = 9;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? colA : colB;
    ctx.fillRect(Math.round(i * 256 / n), 0, Math.ceil(256 / n), 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Ground-floor storefront mounted on a building wall. `nx,nz` is the unit
// outward normal of the wall (one axis only); the shop is built in local space
// where +Z points out toward the street, then rotated into place.
function addStorefront(scene, bx, bz, bw, bd, nx, nz, shop) {
  const wallHalf = nx !== 0 ? bw / 2 : bd / 2;
  const span     = nx !== 0 ? bd : bw;
  const storeW   = Math.min(span - 1.4, 9);
  const FLOOR_H  = 3.4;

  const g = new THREE.Group();
  g.position.set(bx + nx * (wallHalf - 0.05), 0, bz + nz * (wallHalf - 0.05));
  g.rotation.y = Math.atan2(nx, nz);   // local +Z → outward normal
  scene.add(g);

  const stoneMat = stdMat(shop.frame, 0.8);
  const darkMat  = stdMat(0x20242a, 0.5, 0.4);
  const sillMat  = stdMat(0x6a6258, 0.85);

  // Knee wall / bulkhead, side pilasters, header lintel — the storefront "case"
  g.add(box(storeW, 0.45, 0.5, sillMat, 0, 0.225, 0.25));
  g.add(box(storeW + 0.3, 0.55, 0.6, stoneMat, 0, FLOOR_H - 0.2, 0.28, false, false));
  for (const sx of [-1, 1])
    g.add(box(0.4, FLOOR_H, 0.55, stoneMat, sx * (storeW / 2 + 0.05), FLOOR_H / 2, 0.26));

  // Recessed interior backdrop + emissive shelves (reads as a lit shop, no lights)
  const openW = storeW - 0.7, openH = FLOOR_H - 1.05, openCY = 0.45 + openH / 2;
  const interiorMat = new THREE.MeshStandardMaterial({
    color: shop.interior, emissive: shop.interior, emissiveIntensity: 0.35, roughness: 0.9,
  });
  g.add(box(openW, openH, 0.06, interiorMat, 0, openCY, 0.1, false, false));
  for (let i = 0; i < 3; i++) {
    const shelf = new THREE.MeshStandardMaterial({
      color: shop.interior, emissive: shop.interior, emissiveIntensity: 0.6, roughness: 0.8,
    });
    g.add(box(openW * 0.8, 0.12, 0.12, shelf, 0, 0.8 + i * 0.7, 0.22, false, false));
  }

  // Glass + mullions
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(openW, openH),
    // Cheap glass: reflective transparent standard mat (no transmission pass).
    new THREE.MeshStandardMaterial({
      color: 0x9fc0da, roughness: 0.06, metalness: 0.1,
      envMapIntensity: 1.3, transparent: true, opacity: 0.35,
    })
  );
  glass.position.set(0, openCY, 0.5);
  g.add(glass);
  for (const mx of [-openW / 4, 0, openW / 4])
    g.add(box(0.05, openH, 0.08, darkMat, mx, openCY, 0.52, false, false));

  // Sign on the lintel
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(storeW - 0.3, 0.5),
    new THREE.MeshStandardMaterial({
      map: shop.signTex, emissive: 0xffffff, emissiveMap: shop.signTex,
      emissiveIntensity: 0.5, roughness: 0.6,
    })
  );
  sign.position.set(0, FLOOR_H - 0.2, 0.59);
  g.add(sign);

  // Striped awning projecting over the sidewalk
  const awningMat = new THREE.MeshStandardMaterial({ map: makeStripeTexture(shop.awningCss, '#f3efe6'), roughness: 0.85, side: THREE.DoubleSide });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(storeW + 0.5, 0.08, 1.3), awningMat);
  awning.position.set(0, FLOOR_H - 0.5, 1.05);
  awning.rotation.x = -0.32;
  awning.castShadow = true;
  g.add(awning);
  g.add(box(storeW + 0.5, 0.5, 0.06, stdMat(shop.awningHex, 0.85), 0, FLOOR_H - 0.85, 1.62, false, false));
}

// ─── Main builder ─────────────────────────────────────────────────────────────

// Build a PBR MeshStandardMaterial from a {color,normal,rough} CC0 set.
// (MeshStandardMaterial auto-converts to a node material under WebGPURenderer.)
// Each key's textures back exactly one material, so per-texture repeat is safe.
function pbrMat(set, rx, ry, extra = {}) {
  for (const t of [set.color, set.normal, set.rough]) t.repeat.set(rx, ry);
  return new THREE.MeshStandardMaterial({
    map: set.color, normalMap: set.normal, roughnessMap: set.rough,
    roughness: 1, metalness: 0, ...extra,
  });
}

// One shared material per surface class — reused across every instanced
// building/sidewalk so VRAM and draw setup stay flat across the whole city.
function buildCityMaterials(tex, roadR) {
  return {
    asphalt:      pbrMat(tex.asphalt, roadR, roadR),
    sidewalkTop:  pbrMat(tex.sidewalk, 6, 6),
    sidewalkSide: stdMat(0x969088, 0.78),
    shells: {
      brickA:   pbrMat(tex.brickA, 3, 5),
      brickB:   pbrMat(tex.brickB, 3, 5),
      concrete: stdMat(0x8f8c84, 0.9),
      glass:    pbrMat(tex.glass, 2, 3, { metalness: 0.3, roughness: 0.6, envMapIntensity: 1.2 }),
    },
    windowLit:  new THREE.MeshStandardMaterial({
      color: 0xffe8a0, emissive: 0xffcc44, emissiveIntensity: 0.5,
      roughness: 0.15, metalness: 0.2, side: THREE.DoubleSide,
    }),
    windowDark: new THREE.MeshStandardMaterial({
      color: 0x1a2a40, emissive: 0x0a1020, emissiveIntensity: 0.1,
      roughness: 0.08, metalness: 0.8, side: THREE.DoubleSide,
    }),
  };
}

export function buildWorld(scene, models, tex, params) {
  _grid.clear();
  _asphaltMat = null;

  const layout = generateCity(params);
  const SW_TOP = layout.params.sidewalkH;   // sidewalk-slab top height

  // Scale road texel density to the (large) ground plane.
  const roadW = layout.bounds.maxX - layout.bounds.minX + layout.params.street;
  const R = Math.max(8, Math.round(roadW / 5));
  const materials = buildCityMaterials(tex, R);

  // Reserve the centre block as an open plaza — the pigeon's starting area
  // where all the hand-placed, pigeon-relevant dressing lives.
  const plaza = layout.blocks.find(
    (b) => b.gx === Math.round((layout.params.blocksX - 1) / 2) &&
           b.gz === Math.round((layout.params.blocksZ - 1) / 2)
  );
  if (plaza) plaza.lots = [];

  buildCity(scene, _grid, layout, materials);

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
  const puddleMeshes = [];

  // Main puddle: live cube reflection captures buildings + sky (mirror finish).
  const cubeRT = new THREE.CubeRenderTarget(128, {
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
  });
  const puddleCube = new THREE.CubeCamera(0.1, 60, cubeRT);
  puddleCube.position.set(4, SW_TOP + 0.06, 5);
  scene.add(puddleCube);
  const bigPuddle = new THREE.Mesh(
    new THREE.CircleGeometry(1.0, 32),
    new THREE.MeshStandardMaterial({
      color: 0x222d3c, roughness: 0.03, metalness: 1.0,
      envMap: cubeRT.texture, transparent: true, opacity: 0.9,
    })
  );
  bigPuddle.rotation.x = -Math.PI / 2;
  bigPuddle.position.set(4, SW_TOP + 0.02, 5);
  bigPuddle.userData.uvReflective = true;
  scene.add(bigPuddle);
  puddleMeshes.push(bigPuddle);

  // Secondary puddle reflects the sky via scene.environment.
  const smallPuddle = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 20),
    new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.02, metalness: 0.4, transparent: true, opacity: 0.75 })
  );
  smallPuddle.rotation.x = -Math.PI / 2;
  smallPuddle.position.set(-2.5, SW_TOP + 0.02, -3);
  smallPuddle.userData.uvReflective = true;
  scene.add(smallPuddle);
  puddleMeshes.push(smallPuddle);

  // ── Sidewalk props (surfaceY=SW_TOP) ──────────────────────────────────────
  const treeModels = [models.tree, models.treePine];
  [[-13, -16.5, 4.6], [13, -16.5, 5.2], [-13, 16.5, 4.8], [13, 16.5, 5.0]]
    .forEach(([x, z, h], i) => addTree(scene, treeModels[i % 2], x, z, SW_TOP, h, i * 1.3));

  // ── Parked cars on the streets bordering the plaza (road level) ─────────────
  addCar(scene, models.car,        25, -6,  0);
  addCar(scene, models.carPolice, -25,  6,  0);
  addCar(scene, models.car,        -6,  25, Math.PI / 2);
  addCar(scene, models.carPolice,   6, -25, Math.PI / 2);

  addFireHydrant(scene, 15, -16.5, SW_TOP);
  addFireHydrant(scene, -15, 16.5, SW_TOP);

  // ── Road details (on the street, road level) ────────────────────────────────
  addManhole(scene, 24, 6);
  addManhole(scene, -24, -6);

  const pebbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 3), stdMat(0x888070, 0.95), 20);
  const pd = new THREE.Object3D();
  for (let i = 0; i < 20; i++) {
    const r = 0.04 + Math.random() * 0.06;
    pd.position.set((Math.random() - 0.5) * 24, r * 0.5, (Math.random() - 0.5) * 24);
    pd.scale.setScalar(r);
    pd.updateMatrix();
    pebbles.setMatrixAt(i, pd.matrix);
  }
  pebbles.instanceMatrix.needsUpdate = true;
  scene.add(pebbles);

  // One-shot reflection capture for the puddle (call after lighting/env are set).
  return {
    colliders: _grid,
    bound: layout.bounds.maxX,
    layout,
    captureReflections(renderer) {
      for (const m of puddleMeshes) m.visible = false;
      puddleCube.update(renderer, scene);
      for (const m of puddleMeshes) m.visible = true;
    },
  };
}
